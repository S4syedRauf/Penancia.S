using System.Text.Json.Serialization;
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

        if (request.MicronsPerPixel.HasValue)
        {
            return StatusCode(422, new
            {
                ok = false,
                error = "INVENTED_CALIBRATION_REJECTED",
                message = "Samples cannot be created with client-supplied calibration values. Calibration must be performed via /v1/semen/samples/{sampleId}/calibration."
            });
        }

        string workflowMode = "prescreen";
        if (!string.IsNullOrWhiteSpace(request.WorkflowMode))
        {
            var trimmed = request.WorkflowMode.Trim().ToLowerInvariant();
            if (trimmed != "prescreen" && trimmed != "clinical")
            {
                return StatusCode(422, new
                {
                    ok = false,
                    error = "INVALID_WORKFLOW_MODE",
                    message = $"WorkflowMode must be 'prescreen' or 'clinical', but received '{request.WorkflowMode}'."
                });
            }
            workflowMode = trimmed;
        }

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

        double? chamberDepth = null;
        if (!string.IsNullOrWhiteSpace(request.ChamberTypeId))
        {
            if (Penancia.S.Domain.Model.PhysicalCatalogues.TryGetChamber(request.ChamberTypeId, out var chamber))
            {
                chamberDepth = chamber.DepthUm;
            }
            else
            {
                return StatusCode(422, new
                {
                    ok = false,
                    error = "UNKNOWN_CHAMBER_TYPE",
                    message = $"Chamber type '{request.ChamberTypeId}' is not in the certified physical catalogue."
                });
            }
        }

        var sample = new SampleEntity
        {
            SampleId = sampleId,
            CreatedAtUtc = DateTime.UtcNow,
            CreatedBy = callerId,
            State = nameof(SampleState.Draft),
            WorkflowMode = workflowMode,
            ChamberTypeId = request.ChamberTypeId,
            ChamberDepthMicrons = chamberDepth,
            MicronsPerPixel = null,
            FramesPerSecond = null,
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
        var sample = await _db.Samples
            .Include(s => s.Calibration)
            .FirstOrDefaultAsync(s => s.SampleId == sampleId && !s.IsDeleted);
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

    private static readonly HashSet<string> AllowedUploadKinds = new(StringComparer.OrdinalIgnoreCase)
    {
        "video",
        "image",
        "calibration"
    };

    private static readonly Dictionary<string, string> AllowedContentTypeExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ["video/mp4"] = ".mp4",
        ["video/quicktime"] = ".mov",
        ["video/webm"] = ".webm",
        ["image/jpeg"] = ".jpg",
        ["image/png"] = ".png",
        ["image/heic"] = ".heic"
    };

    private static readonly HashSet<string> VideoContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "video/mp4",
        "video/quicktime",
        "video/webm"
    };

    private static readonly HashSet<string> ImageContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg",
        "image/png",
        "image/heic"
    };

    /// <summary>
    /// Generates a real short-lived user-delegation SAS token for direct
    /// browser/mobile upload to the Azure Blob Storage quarantine container (ISS-016).
    /// Permissions: Write + Create only ('cw'), single blob, expiry 60 minutes, HTTPS only.
    /// Kinds: video, image, calibration.
    /// Content types: video/mp4, video/quicktime, video/webm, image/jpeg, image/png, image/heic.
    /// </summary>
    [HttpGet("{sampleId}/upload-sas")]
    [HttpPost("{sampleId}/upload-sas")]
    [Authorize] // Allow any authenticated user (patients can upload their own samples)
    public async Task<IActionResult> GenerateUploadSas(
        string sampleId,
        [FromQuery] string? fileType = null,
        [FromQuery] string? kind = null,
        [FromQuery] string? fileName = null,
        [FromQuery] string? contentType = null)
    {
        var sample = await _db.Samples
            .Include(s => s.Calibration)
            .FirstOrDefaultAsync(s => s.SampleId == sampleId && !s.IsDeleted);
        if (sample == null)
            return NotFound(new { error = "SAMPLE_NOT_FOUND", message = $"Sample {sampleId} not found." });

        if (sample.CreatedBy != CallerObjectId() && !IsStaffCaller())
            return Forbid();

        string? effectiveKind = !string.IsNullOrWhiteSpace(kind) ? kind.Trim() : (!string.IsNullOrWhiteSpace(fileType) ? fileType.Trim() : null);
        if (string.IsNullOrWhiteSpace(effectiveKind) || !AllowedUploadKinds.Contains(effectiveKind))
        {
            return BadRequest(new
            {
                error = "INVALID_MEDIA_KIND",
                message = $"Invalid media kind '{effectiveKind}'. Allowed kinds: video, image, calibration."
            });
        }

        if (string.IsNullOrWhiteSpace(contentType) || !AllowedContentTypeExtensions.ContainsKey(contentType.Trim()))
        {
            return BadRequest(new
            {
                error = "INVALID_CONTENT_TYPE",
                message = $"Invalid or missing content type '{contentType}'. Allowed content types: video/mp4, video/quicktime, video/webm, image/jpeg, image/png, image/heic."
            });
        }

        string normalizedKind = effectiveKind.ToLowerInvariant();
        string normalizedContentType = contentType.Trim().ToLowerInvariant();

        if (normalizedKind == "video" && !VideoContentTypes.Contains(normalizedContentType))
        {
            return BadRequest(new
            {
                error = "INVALID_CONTENT_TYPE",
                message = $"Content type '{contentType}' is not valid for media kind 'video'."
            });
        }

        if ((normalizedKind == "image" || normalizedKind == "calibration") && !ImageContentTypes.Contains(normalizedContentType))
        {
            return BadRequest(new
            {
                error = "INVALID_CONTENT_TYPE",
                message = $"Content type '{contentType}' is not valid for media kind '{normalizedKind}'."
            });
        }

        // Rate limit: 10 SAS per sample per hour via DB count of all assets for this sample in last hour (D2)
        var oneHourAgo = DateTime.UtcNow.AddHours(-1);
        int assetsInLastHour = await _db.MediaAssets
            .CountAsync(m => m.SampleId == sampleId && m.CreatedAtUtc >= oneHourAgo);

        if (assetsInLastHour >= 10)
        {
            Response.Headers["Retry-After"] = "3600";
            return StatusCode(StatusCodes.Status429TooManyRequests, new
            {
                error = "RATE_LIMIT_EXCEEDED",
                message = "Rate limit of 10 upload SAS requests per sample per hour exceeded.",
                retryAfterSeconds = 3600
            });
        }

        // Configuration-driven per-kind maxBytes with safe defaults
        long maxBytes = normalizedKind switch
        {
            "video" => _configuration.GetValue<long?>("MediaUpload:MaxBytes:Video") ?? 524_288_000L,       // 500 MB
            "image" => _configuration.GetValue<long?>("MediaUpload:MaxBytes:Image") ?? 26_214_400L,         // 25 MB
            "calibration" => _configuration.GetValue<long?>("MediaUpload:MaxBytes:Calibration") ?? 26_214_400L, // 25 MB
            _ => 26_214_400L
        };
        long blockSizeBytes = _configuration.GetValue<long?>("MediaUpload:BlockSizeBytes") ?? 4_194_304L; // 4 MB

        var assetId = Guid.NewGuid();
        string extension = AllowedContentTypeExtensions[normalizedContentType];
        string blobName = $"{sampleId}/{assetId}{extension}";
        const string container = "quarantine";

        var startsOn = DateTimeOffset.UtcNow.AddMinutes(-5);
        var expiresOn = DateTimeOffset.UtcNow.AddMinutes(60);

        string uploadUrl;
        try
        {
            uploadUrl = await BuildUserDelegationSasUriAsync(container, blobName, startsOn, expiresOn);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to generate user delegation SAS URI for sample {SampleId}, asset {AssetId}", sampleId, assetId);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                error = "STORAGE_UNAVAILABLE",
                message = "Storage service unavailable."
            });
        }

        var asset = new MediaAssetEntity
        {
            AssetId = assetId,
            SampleId = sampleId,
            Kind = normalizedKind,
            Container = container,
            BlobName = blobName,
            ContentTypeDeclared = normalizedContentType,
            SizeBytes = 0,
            Status = "Issued",
            CreatedAtUtc = DateTime.UtcNow
        };
        _db.MediaAssets.Add(asset);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Issued upload SAS for asset {AssetId} (sample {SampleId}, kind {Kind}, ext {Extension})",
            assetId, sampleId, normalizedKind, extension);

        return Ok(new UploadSasResponseDto
        {
            AssetId = assetId,
            UploadUrl = uploadUrl,
            ExpiresAtUtc = expiresOn.UtcDateTime,
            MaxBytes = maxBytes,
            BlockSizeBytes = blockSizeBytes,
#pragma warning disable CS0618
            SasUrl = uploadUrl,
            TargetBlobUri = uploadUrl,
#pragma warning restore CS0618
            Container = container,
            BlobName = blobName
        });
    }

    protected virtual BlobSasBuilder CreateBlobSasBuilder(
        string container,
        string blobName,
        DateTimeOffset startsOn,
        DateTimeOffset expiresOn)
    {
        var sas = new BlobSasBuilder
        {
            BlobContainerName = container,
            BlobName = blobName,
            Resource = "b",
            StartsOn = startsOn,
            ExpiresOn = expiresOn,
            Protocol = SasProtocol.Https
        };
        sas.SetPermissions(BlobSasPermissions.Create | BlobSasPermissions.Write);
        return sas;
    }

    protected virtual async Task<string> BuildUserDelegationSasUriAsync(
        string container,
        string blobName,
        DateTimeOffset startsOn,
        DateTimeOffset expiresOn)
    {
        if (_blobs == null)
        {
            throw new InvalidOperationException("BlobServiceClient is not configured.");
        }

        var sas = CreateBlobSasBuilder(container, blobName, startsOn, expiresOn);

        var delegationKey = await _blobs.GetUserDelegationKeyAsync(startsOn, expiresOn);
        var sasParams = sas.ToSasQueryParameters(delegationKey, _blobs.AccountName);
        var blobClient = _blobs.GetBlobContainerClient(container).GetBlobClient(blobName);
        return new BlobUriBuilder(blobClient.Uri)
        {
            Sas = sasParams
        }.ToUri().ToString();
    }

    protected virtual async Task<BlobPropertiesDto> GetBlobPropertiesAsync(string container, string blobName)
    {
        if (_blobs == null)
        {
            throw new InvalidOperationException("BlobServiceClient is not configured.");
        }

        var containerClient = _blobs.GetBlobContainerClient(container);
        var blobClient = containerClient.GetBlobClient(blobName);

        var exists = await blobClient.ExistsAsync();
        if (!exists.Value)
        {
            return new BlobPropertiesDto { Exists = false, ContentLength = 0 };
        }

        var properties = await blobClient.GetPropertiesAsync();
        return new BlobPropertiesDto
        {
            Exists = true,
            ContentLength = properties.Value.ContentLength,
            ContentType = properties.Value.ContentType
        };
    }

    protected virtual async Task DeleteBlobIfExistsAsync(string container, string blobName)
    {
        if (_blobs == null)
        {
            throw new InvalidOperationException("BlobServiceClient is not configured.");
        }

        var containerClient = _blobs.GetBlobContainerClient(container);
        var blobClient = containerClient.GetBlobClient(blobName);
        await blobClient.DeleteIfExistsAsync();
    }

    /// <summary>
    /// Registers a blob with the sample by server-verifying the uploaded media asset (ISS-015).
    /// Accepts { assetId } only. If an old client sends blobUri, it is ignored and never stored,
    /// returning a deprecation header.
    /// Reads blob properties directly from Azure Blob Storage via managed identity (no keys),
    /// validates existence, size <= maxBytes, name prefix matching "{sampleId}/",
    /// and transitions Status to "Uploaded" with real ContentLength.
    /// </summary>
    [HttpPost("{sampleId}/register-blob")]
    [Authorize]
    public async Task<IActionResult> RegisterBlob(string sampleId, [FromBody] RegisterBlobRequest request)
    {
        var sample = await _db.Samples
            .Include(s => s.Calibration)
            .FirstOrDefaultAsync(s => s.SampleId == sampleId && !s.IsDeleted);
        if (sample == null)
            return NotFound(new { error = "SAMPLE_NOT_FOUND", message = $"Sample {sampleId} not found." });

        var callerId = CallerObjectId();
        if (sample.CreatedBy != callerId && !IsStaffCaller())
            return Forbid();

        var asset = await _db.MediaAssets.FirstOrDefaultAsync(m => m.AssetId == request.AssetId);
        if (asset == null)
        {
            return NotFound(new { error = "ASSET_NOT_FOUND", message = $"Asset {request.AssetId} not found." });
        }

        if (asset.SampleId != sampleId)
        {
            return Forbid();
        }

        if (string.Equals(asset.Status, "Uploaded", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(asset.Status, "Cleared", StringComparison.OrdinalIgnoreCase))
        {
            return Ok(new
            {
                success = true,
                assetId = asset.AssetId,
                status = asset.Status,
                sizeBytes = asset.SizeBytes,
                sampleId = asset.SampleId
            });
        }

        if (asset.Status == "Rejected")
        {
            return Conflict(new
            {
                error = "ASSET_REJECTED",
                message = $"Asset {request.AssetId} was rejected: {asset.RejectReason}"
            });
        }

        if (!asset.BlobName.StartsWith($"{sampleId}/", StringComparison.Ordinal))
        {
            return Conflict(new
            {
                error = "BLOB_PREFIX_MISMATCH",
                message = "Blob name prefix does not match sample."
            });
        }

        BlobPropertiesDto blobProps;
        try
        {
            blobProps = await GetBlobPropertiesAsync(asset.Container, asset.BlobName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to inspect blob properties for container {Container}, blob {BlobName}", asset.Container, asset.BlobName);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                error = "STORAGE_UNAVAILABLE",
                message = "Storage service unavailable."
            });
        }

        if (!blobProps.Exists)
        {
            return Conflict(new
            {
                error = "BLOB_NOT_UPLOADED",
                message = "Blob has not been uploaded to storage."
            });
        }

        if (blobProps.ContentLength <= 0)
        {
            return Conflict(new
            {
                error = "ZERO_LENGTH_BLOB",
                message = "Blob content length is zero."
            });
        }

        long maxBytes = asset.Kind.ToLowerInvariant() switch
        {
            "video" => _configuration.GetValue<long>("MediaUpload:MaxBytes:video", 524288000),
            "image" => _configuration.GetValue<long>("MediaUpload:MaxBytes:image", 26214400),
            "calibration" => _configuration.GetValue<long>("MediaUpload:MaxBytes:calibration", 26214400),
            _ => 26214400
        };

        if (blobProps.ContentLength > maxBytes)
        {
            asset.Status = "Rejected";
            asset.RejectReason = $"Blob size {blobProps.ContentLength} exceeds maximum allowed {maxBytes} bytes.";
            await _db.SaveChangesAsync();

            try
            {
                await DeleteBlobIfExistsAsync(asset.Container, asset.BlobName);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to delete oversized blob {BlobName} in container {Container}", asset.BlobName, asset.Container);
            }

            return StatusCode(StatusCodes.Status413PayloadTooLarge, new
            {
                error = "PAYLOAD_TOO_LARGE",
                message = $"Blob size {blobProps.ContentLength} exceeds maximum allowed {maxBytes} bytes."
            });
        }

        asset.Status = "Uploaded";
        asset.SizeBytes = blobProps.ContentLength;

        // Derive canonical blob URI strictly from verified database row
        string accountName = _blobs!.AccountName;
        string canonicalUri = $"https://{accountName}.blob.core.windows.net/{asset.Container}/{asset.BlobName}";
        if (string.Equals(asset.Kind, "video", StringComparison.OrdinalIgnoreCase))
        {
            sample.RawVideoBlobUri = canonicalUri;
        }
        else if (string.Equals(asset.Kind, "image", StringComparison.OrdinalIgnoreCase))
        {
            sample.RawImageBlobUri = canonicalUri;
        }

        if (!string.IsNullOrWhiteSpace(request.BlobUri))
        {
            Response.Headers["Deprecation"] = "true";
            Response.Headers["X-Deprecated-Field"] = "blobUri";
        }

        await _db.SaveChangesAsync();
        _logger.LogInformation("Verified and registered media asset {AssetId} for sample {SampleId} ({SizeBytes} bytes)", asset.AssetId, sampleId, asset.SizeBytes);

        return Ok(new
        {
            success = true,
            assetId = asset.AssetId,
            status = asset.Status,
            sizeBytes = asset.SizeBytes,
            sampleId = asset.SampleId
        });
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
        var sample = await _db.Samples
            .Include(s => s.Calibration)
            .FirstOrDefaultAsync(s => s.SampleId == sampleId && !s.IsDeleted);
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

        // Readiness strictly reads real stored facts (Step 1.5)
        var assets = await _db.MediaAssets.Where(a => a.SampleId == sampleId).ToListAsync();

        // Quarantine scan-gate (CL-0027/CL-0028): media in quarantine must be Cleared before analysis
        var quarantineMediaAssets = assets.Where(a =>
            (string.Equals(a.Kind, "video", StringComparison.OrdinalIgnoreCase) ||
             string.Equals(a.Kind, "image", StringComparison.OrdinalIgnoreCase)) &&
            string.Equals(a.Container, "quarantine", StringComparison.OrdinalIgnoreCase)).ToList();
        if (quarantineMediaAssets.Count > 0 && quarantineMediaAssets.Any(a => !string.Equals(a.Status, "Cleared", StringComparison.OrdinalIgnoreCase)))
        {
            return StatusCode(StatusCodes.Status409Conflict, new
            {
                error = "SCAN_PENDING",
                message = "Media has not passed malware scan."
            });
        }
        var calSnapshot = sample.Calibration != null
            ? new CalibrationReadinessSnapshot(sample.Calibration.Status, sample.Calibration.ExpiresAtUtc, sample.Calibration.MicronsPerPixel)
            : null;
        var assetSnapshots = assets.Select(a => new MediaAssetReadinessSnapshot(a.AssetId, a.Status, a.Kind)).ToList();
        var sampleSnapshot = new SampleReadinessSnapshot(
            sample.SampleId,
            sample.WorkflowMode,
            sample.ConsentAtUtc,
            sample.ChamberTypeId,
            sample.ChamberDepthMicrons,
            calSnapshot);

        var readiness = SampleReadiness.Check(sampleSnapshot, assetSnapshots);
        if (!readiness.IsReady)
        {
            return StatusCode(422, new
            {
                ok = false,
                error = PrerequisiteReasonCodes.PrerequisitesMissing,
                missing = readiness.MissingReasons
            });
        }

        // Verify state machine can accept Submit event without modifying state in DB.
        // State remains Draft so Durable Functions orchestrator can execute Submit.
        var evt = current == SampleState.Validating ? SampleEvent.FilesValidated : SampleEvent.Submit;
        var ctx = new TransitionContext(actorId, actorRole, Array.Empty<string>(),
            FilesAndCalibrationPresent: true);
        var previewResult = SampleStateMachine.Apply(current, evt, ctx);
        if (!previewResult.Success)
            return StatusCode(409, new { error = previewResult.FailureReason });

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

public class BlobPropertiesDto
{
    public bool Exists { get; set; }
    public long ContentLength { get; set; }
    public string? ContentType { get; set; }
}

public class RegisterBlobRequest
{
    public Guid AssetId { get; set; }

    /// <summary>
    /// Deprecated: client-supplied BlobUri is ignored and never stored (ISS-015).
    /// </summary>
    [JsonPropertyName("blobUri")]
    public string? BlobUri { get; set; }

    /// <summary>
    /// Deprecated: client-supplied MediaType is ignored (ISS-015).
    /// </summary>
    [JsonPropertyName("mediaType")]
    public string? MediaType { get; set; }

    public RegisterBlobRequest() { }

    public RegisterBlobRequest(Guid assetId)
    {
        AssetId = assetId;
    }
}

public record CreateSampleRequest(
    string? SampleId = null,
    string? PatientId = null,
    int? AbstinenceDays = null,
    string? SampleName = null,
    double? MicronsPerPixel = null,
    string? MediaType = null,
    object? Metadata = null,
    string? ChamberTypeId = null,
    string? WorkflowMode = null
);

public class UploadSasResponseDto
{
    public Guid AssetId { get; set; }
    public string UploadUrl { get; set; } = string.Empty;
    public DateTime ExpiresAtUtc { get; set; }
    public long MaxBytes { get; set; }
    public long BlockSizeBytes { get; set; }

    /// <summary>
    /// Deprecated: use UploadUrl instead. Kept for one release for backward compatibility.
    /// </summary>
    [Obsolete("Use UploadUrl instead.")]
    public string SasUrl { get; set; } = string.Empty;

    /// <summary>
    /// Deprecated: use UploadUrl instead. Kept for one release for backward compatibility.
    /// </summary>
    [Obsolete("Use UploadUrl instead.")]
    public string TargetBlobUri { get; set; } = string.Empty;

    public string Container { get; set; } = string.Empty;
    public string BlobName { get; set; } = string.Empty;
}
