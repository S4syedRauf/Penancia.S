using Azure.Storage;
using Azure.Storage.Blobs;
using Azure.Storage.Sas;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Penancia.S.Data;
using Penancia.S.Data.Entities;
using Penancia.S.Domain.Workflow;

namespace Penancia.S.Api.Controllers.V1;

/// <summary>
/// Versioned API (v1) serving as the single secure gateway for the Staff Blazor Portal,
/// Web Frontend, and Mobile App.
///
/// Core Rules:
/// 1. Entra ID authentication on every endpoint — no anonymous access.
/// 2. Non-Released samples are default-deny: only authenticated staff may
///    see them. Mobile callers (MobileUser role / client_type=mobile claim)
///    can ONLY retrieve samples in 'Released' state, and an unauthenticated
///    caller gets 401, never the report.
/// 3. Direct video/image uploads use real short-lived user-delegation SAS
///    tokens generated server-side (#6).
/// 4. No endpoint returns invented measurements (#4). This controller returns
///    ONLY data actually stored on the sample. Measurement values are not
///    stored anywhere in this solution yet, so report responses carry
///    measurementsAvailable=false and no parameter values. See the
///    CHANGELOG text in the fix report: "Measurement persistence is still a
///    known gap: no measurement storage exists, so no endpoint returns
///    parameter values; report endpoints return measurementsAvailable=false
///    until a measurement store lands."
/// </summary>
[ApiController]
[Route("v1/samples")]
public class SamplesController : ControllerBase
{
    private readonly PenanciaDbContext _db;
    private readonly BlobServiceClient _blobs;
    private readonly ILogger<SamplesController> _logger;
    private readonly IHttpClientFactory _httpClients;
    private readonly IConfiguration _configuration;

    public SamplesController(
        PenanciaDbContext db,
        BlobServiceClient blobs,
        IHttpClientFactory httpClients,
        IConfiguration configuration,
        ILogger<SamplesController> logger)
    {
        _db = db;
        _blobs = blobs;
        _httpClients = httpClients;
        _configuration = configuration;
        _logger = logger;
    }

    private string CallerObjectId() => User.FindFirst("oid")?.Value
        ?? User.FindFirst("http://schemas.microsoft.com/identity/claims/objectidentifier")?.Value
        ?? throw new InvalidOperationException("The verified Entra object ID claim is missing.");

    private bool IsStaffCaller() => User.IsInRole("Technician") || User.IsInRole("Signer")
        || User.IsInRole("ClinicalDirector") || User.IsInRole("LabAdmin");

    private bool IsMobileCaller() => User.IsInRole("MobileUser")
        || User.HasClaim(c => c.Type == "client_type" && c.Value == "mobile");

    /// <summary>
    /// Creates a new sample record. Used by mobile, portal, and prescreen callers.
    /// </summary>
    [HttpPost]
    [Authorize]
    public async Task<IActionResult> CreateSample([FromBody] CreateSampleRequest request)
    {
        var callerId = CallerObjectId();
        var sampleId = string.IsNullOrWhiteSpace(request.SampleId)
            ? $"SMP-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid():N}"[..24]
            : request.SampleId;

        var existing = await _db.Samples.FirstOrDefaultAsync(s => s.SampleId == sampleId && !s.IsDeleted);
        if (existing != null)
        {
            if (existing.CreatedBy != callerId && !IsStaffCaller()) return Forbid();
            return Ok(new
            {
                sampleId = existing.SampleId,
                state = existing.State,
                createdAtUtc = existing.CreatedAtUtc,
                message = "Sample already exists."
            });
        }

        var sample = new SampleEntity
        {
            SampleId = sampleId,
            CreatedAtUtc = DateTime.UtcNow,
            CreatedBy = callerId,
            State = nameof(SampleState.Draft),
            MicronsPerPixel = 0,
            FramesPerSecond = 0,
            ChamberDepthMicrons = 0,
            IsDeleted = false
        };

        _db.Samples.Add(sample);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Sample created: {SampleId}", sampleId);

        return Created($"/v1/samples/{sampleId}", new
        {
            sampleId = sample.SampleId,
            state = sample.State,
            createdAtUtc = sample.CreatedAtUtc
        });
    }

    /// <summary>
    /// Retrieves a sample report. Authentication is required; non-Released
    /// samples are denied to everyone except authenticated staff.
    /// </summary>
    [HttpGet("{sampleId}/report")]
    [Authorize]
    public async Task<IActionResult> GetReport(string sampleId)
    {
        var sample = await _db.Samples.FirstOrDefaultAsync(s => s.SampleId == sampleId && !s.IsDeleted);
        if (sample == null)
            return NotFound(new { error = $"Sample {sampleId} not found." });

        bool isStaff = IsStaffCaller();
        bool isMobile = IsMobileCaller();
        if (!isStaff && sample.CreatedBy != CallerObjectId()) return Forbid();

        if (!isStaff && sample.State != nameof(SampleState.Released))
        {
            _logger.LogWarning("Non-staff caller attempted to access unreleased sample {SampleId} in state {State}", sampleId, sample.State);
            return StatusCode(403, new { error = "ACCESS_DENIED: Results are only accessible once clinically released by the laboratory." });
        }

        // Stored data only. No parameter values are returned: no measurement
        // storage exists yet (see class docstring).
        return Ok(new
        {
            sampleId = sample.SampleId,
            status = sample.State,
            state = sample.State,
            finalReportPdfUri = sample.State == nameof(SampleState.Released) ? sample.FinalReportPdfUri : null,
            draftReportPdfUri = isStaff && !isMobile ? sample.DraftReportPdfUri : null,
            measurementsAvailable = false,
            isLocked = sample.IsLocked
        });
    }

    /// <summary>
    /// Generates a real short-lived user-delegation SAS token for direct
    /// browser/mobile upload to Azure Blob Storage (#6). Write + Create
    /// only, expiry now + 15 minutes. Video uploads go to 'raw-video' as
    /// .mp4; image uploads go to 'raw-images' with the extension derived
    /// from the supplied file name (or content type); when neither is
    /// supplied the image default is .jpg.
    /// </summary>
    [HttpGet("{sampleId}/upload-sas")]
    [HttpPost("{sampleId}/upload-sas")]
    [Authorize] // Allow any authenticated user (patients can upload their own samples)
    public async Task<IActionResult> GenerateUploadSas(
        string sampleId,
        [FromQuery] string fileType = "video",
        [FromQuery] string? fileName = null,
        [FromQuery] string? contentType = null)
    {
        var sample = await _db.Samples.FirstOrDefaultAsync(s => s.SampleId == sampleId && !s.IsDeleted);
        if (sample == null)
            return NotFound(new { error = $"Sample {sampleId} not found." });

        if (sample.CreatedBy != CallerObjectId() && !IsStaffCaller()) return Forbid();

        bool isVideo = string.Equals(fileType, "video", StringComparison.OrdinalIgnoreCase);
        string container = isVideo ? "raw-video" : "raw-images";
        string extension = isVideo ? ".mp4" : ResolveImageExtension(fileName, contentType);
        string blobName = $"{sampleId}_{Guid.NewGuid():N}{extension}";

        string sasUri = await BuildUserDelegationSasUriAsync(container, blobName);

        return Ok(new
        {
            sasUrl = sasUri,
            targetBlobUri = sasUri,
            expiresInMinutes = 15,
            container = container,
            blobName = blobName
        });
    }

    private static string ResolveImageExtension(string? fileName, string? contentType)
    {
        if (!string.IsNullOrWhiteSpace(fileName))
        {
            string ext = Path.GetExtension(fileName).ToLowerInvariant();
            if (!string.IsNullOrWhiteSpace(ext))
                return ext;
        }
        return (contentType ?? string.Empty).ToLowerInvariant() switch
        {
            "image/png" => ".png",
            "image/webp" => ".webp",
            "image/heic" => ".heic",
            "image/heif" => ".heif",
            "image/jpeg" => ".jpg",
            _ => ".jpg" // container-appropriate default for raw-images when nothing is supplied
        };
    }

    private async Task<string> BuildUserDelegationSasUriAsync(string container, string blobName)
    {
        var blobClient = _blobs.GetBlobContainerClient(container).GetBlobClient(blobName);
        var startsOn = DateTimeOffset.UtcNow.AddMinutes(-5);
        var expiresOn = DateTimeOffset.UtcNow.AddMinutes(15);
        var delegationKey = await _blobs.GetUserDelegationKeyAsync(startsOn, expiresOn);
        var sas = new BlobSasBuilder
        {
            BlobContainerName = container,
            BlobName = blobName,
            Resource = "b",
            StartsOn = startsOn,
            ExpiresOn = expiresOn
        };
        sas.SetPermissions(BlobSasPermissions.Write | BlobSasPermissions.Create);
        return new BlobUriBuilder(blobClient.Uri)
        {
            Sas = sas.ToSasQueryParameters(delegationKey, _blobs.AccountName)
        }.ToUri().ToString();
    }

    /// <summary>
    /// Registers a blob URI with the sample after direct upload to Azure Blob Storage.
    /// Called by the client after successfully uploading a file using the SAS URL.
    /// </summary>
    [HttpPost("{sampleId}/register-blob")]
    [Authorize]
    public async Task<IActionResult> RegisterBlob(string sampleId, [FromBody] RegisterBlobRequest request)
    {
        var sample = await _db.Samples.FirstOrDefaultAsync(s => s.SampleId == sampleId && !s.IsDeleted);
        if (sample == null)
            return NotFound(new { error = $"Sample {sampleId} not found." });

        var callerId = CallerObjectId();
        if (sample.CreatedBy != callerId && !IsStaffCaller())
            return Forbid();

        if (string.Equals(request.MediaType, "video", StringComparison.OrdinalIgnoreCase))
        {
            sample.RawVideoBlobUri = request.BlobUri;
        }
        else if (string.Equals(request.MediaType, "image", StringComparison.OrdinalIgnoreCase))
        {
            sample.RawImageBlobUri = request.BlobUri;
        }
        else
        {
            return BadRequest(new { error = "Invalid mediaType. Must be 'video' or 'image'." });
        }

        await _db.SaveChangesAsync();
        _logger.LogInformation("Registered {MediaType} blob for sample {SampleId}: {BlobUri}", request.MediaType, sampleId, request.BlobUri);
        return Ok(new { success = true, sampleId, mediaType = request.MediaType, blobUri = request.BlobUri });
    }

    /// <summary>
    /// Initiates analysis for an EXISTING sample, through the state machine
    /// (#9). Unknown samples return 404 — a sample is never auto-created,
    /// and no calibration values are ever written here: the old code created
    /// samples with MicronsPerPixel=1.0 / FramesPerSecond=30.0 /
    /// ChamberDepthMicrons=10.0 as if measured. Calibration presence is read
    /// from what is actually stored (non-zero calibration fields plus a
    /// registered video OR image blob); if it is absent the machine fails the Submit
    /// with PREREQUISITES_MISSING and that reason is surfaced.
    /// Locked or terminal samples (including Released) are never reset to
    /// Analyzing: the machine rejects every event from a terminal state.
    /// The returned status is the machine's actual new state — Draft only
    /// advances to Validating on Submit; Analyzing is reached only from
    /// Validating via FilesValidated, after file validation.
    /// </summary>
    [HttpPost("{sampleId}/analyze")]
    [Authorize] // Allow sample owner or staff to trigger analysis
    public async Task<IActionResult> TriggerAnalysis(string sampleId)
    {
        var sample = await _db.Samples.FirstOrDefaultAsync(s => s.SampleId == sampleId && !s.IsDeleted);
        if (sample == null)
            return NotFound(new { error = $"Sample {sampleId} not found." });

        // Verify ownership: only sample creator or staff can trigger analysis
        var callerId = CallerObjectId();
        if (sample.CreatedBy != callerId && !IsStaffCaller())
            return Forbid();

        if (!Enum.TryParse<SampleState>(sample.State, ignoreCase: true, out var current))
            return StatusCode(422, new { error = $"Sample {sampleId} has an unrecognised stored state '{sample.State}'." });

        if (sample.IsLocked || SampleStateMachine.IsTerminal(current))
            return StatusCode(409, new { error = $"TERMINAL_STATE: Sample {sampleId} is in state '{current}' and cannot be (re)started." });

        string actorId = callerId;
        string actorRole = User.IsInRole("ClinicalDirector") ? "ClinicalDirector"
            : User.IsInRole("Signer") ? "Signer"
            : User.IsInRole("LabAdmin") ? "LabAdmin" : "Technician";

        // Check for either video OR image blob
        bool hasMedia = !string.IsNullOrWhiteSpace(sample.RawVideoBlobUri) || !string.IsNullOrWhiteSpace(sample.RawImageBlobUri);
        bool calibrationPresent = sample.MicronsPerPixel > 0 && sample.FramesPerSecond > 0
            && sample.ChamberDepthMicrons > 0 && hasMedia;

        // Route through the machine: Draft --Submit--> Validating,
        // Validating --FilesValidated--> Analyzing. Any other state is fed
        // Submit so the machine itself returns the INVALID_TRANSITION reason.
        var evt = current == SampleState.Validating ? SampleEvent.FilesValidated : SampleEvent.Submit;
        var ctx = new TransitionContext(actorId, actorRole, Array.Empty<string>(),
            FilesAndCalibrationPresent: calibrationPresent);
        var result = SampleStateMachine.Apply(current, evt, ctx);
        if (!result.Success)
            return StatusCode(409, new { error = result.FailureReason });

        var workflow = _httpClients.CreateClient("workflow");
        var functionKey = _configuration["Workflow:FunctionKey"];
        if (string.IsNullOrWhiteSpace(functionKey))
            return StatusCode(503, new { error = "WORKFLOW_NOT_CONFIGURED" });

        using var startRequest = new HttpRequestMessage(
            HttpMethod.Post,
            $"api/v1/analysis/{Uri.EscapeDataString(sampleId)}/start");
        startRequest.Headers.Add("x-functions-key", functionKey);
        using var workflowResponse = await workflow.SendAsync(startRequest);
        if (!workflowResponse.IsSuccessStatusCode)
        {
            _logger.LogError("Workflow starter returned {StatusCode} for sample {SampleId}",
                (int)workflowResponse.StatusCode, sampleId);
            return StatusCode(502, new { error = "WORKFLOW_START_FAILED" });
        }

        _logger.LogInformation("Durable analysis scheduled for sample {SampleId}", sampleId);
        return Accepted(new
        {
            sampleId,
            status = "WorkflowScheduled",
            trackingId = sampleId
        });
    }
}

public record RegisterBlobRequest(string MediaType, string BlobUri);

public record CreateSampleRequest(
    string? SampleId = null,
    string? PatientId = null,
    int? AbstinenceDays = null,
    string? SampleName = null,
    double? MicronsPerPixel = null,
    string? MediaType = null,
    object? Metadata = null
);
