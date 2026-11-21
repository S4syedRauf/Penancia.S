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
/// Controller for Clinical Report Vault & OCR extraction.
/// Manages upload to quarantine storage, parameter review, and promotion
/// to the 'reports' container (Bicep: raw-video, raw-images, results,
/// reports, quarantine — there is NO 'clinical-reports' container, #45).
///
/// No endpoint returns invented measurements (#4): report responses carry
/// measurementsAvailable=false and no parameter values, because no
/// measurement storage exists yet. See the CHANGELOG text in the fix
/// report: "Measurement persistence is still a known gap: no measurement
/// storage exists, so no endpoint returns parameter values; report
/// endpoints return measurementsAvailable=false until a measurement store
/// lands."
/// </summary>
[ApiController]
[Route("v1/reports")]
public class ReportsController : ControllerBase
{
    private readonly PenanciaDbContext _db;
    private readonly BlobServiceClient _blobs;
    private readonly ILogger<ReportsController> _logger;

    public ReportsController(PenanciaDbContext db, BlobServiceClient blobs, ILogger<ReportsController> logger)
    {
        _db = db;
        _blobs = blobs;
        _logger = logger;
    }

    private bool IsStaffCaller() => User.IsInRole("Technician") || User.IsInRole("Signer")
        || User.IsInRole("ClinicalDirector") || User.IsInRole("LabAdmin");

    /// <summary>
    /// Generates a real short-lived user-delegation SAS for the quarantine
    /// container (#6). Write + Create only, expiry now + 15 minutes.
    /// </summary>
    [HttpGet("{id}/upload-sas")]
    [HttpPost("{id}/upload-sas")]
    [Authorize(Policy = "StaffOnly")]
    public async Task<IActionResult> GetReportUploadSas(string id)
    {
        var sample = await _db.Samples.FirstOrDefaultAsync(s => s.SampleId == id && !s.IsDeleted);
        if (sample == null)
            return NotFound(new { error = $"Report {id} not found." });

        string blobKey = $"{id}_{Guid.NewGuid():N}.pdf";
        string sasUri = await BuildUserDelegationSasUriAsync("quarantine", blobKey);

        return Ok(new
        {
            sasUrl = sasUri,
            targetBlobUri = sasUri,
            quarantineKey = blobKey,
            container = "quarantine",
            expiresInMinutes = 15
        });
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
    /// Report extraction is NOT IMPLEMENTED (#4). The old code returned
    /// fixed fixture values labelled as a Dubai lab and pretended a
    /// filename substring check ("eicar") / SimulateMalware flag was a
    /// malware gate. Neither is real: this endpoint now returns 501 with an
    /// explicit not-implemented status and extracts nothing. A real
    /// extraction service plus a real malware-scan verdict are remaining
    /// items; no quarantine status is claimed here.
    /// </summary>
    [HttpPost("extract")]
    [Authorize(Policy = "StaffOnly")]
    public IActionResult ExtractReport([FromBody] ExtractReportRequest? request)
    {
        if (request is null)
            return BadRequest(new { ok = false, message_en = "Empty report payload." });

        _logger.LogWarning("Report extraction requested for file {FileName}: not implemented.", request.FileName);
        return StatusCode(501, new
        {
            ok = false,
            error = "EXTRACTION_NOT_IMPLEMENTED: no report extraction service exists yet, so no values were extracted and no malware verdict was produced. A filename check is not a malware gate.",
            measurementsAvailable = false
        });
    }

    /// <summary>
    /// Retrieves report details by report ID. Authentication is required;
    /// non-Released samples are denied to everyone except authenticated
    /// staff. Returns stored data only — no parameter values.
    /// </summary>
    [HttpGet("{id}")]
    [Authorize]
    public async Task<IActionResult> GetReport(string id)
    {
        var sample = await _db.Samples.FirstOrDefaultAsync(s => s.SampleId == id && !s.IsDeleted);
        if (sample == null)
            return NotFound(new { error = $"Report {id} not found." });

        if (!IsStaffCaller() && sample.State != nameof(SampleState.Released))
        {
            _logger.LogWarning("Non-staff caller attempted to access unreleased report {ReportId} in state {State}", id, sample.State);
            return StatusCode(403, new { error = "ACCESS_DENIED: Results are only accessible once clinically released by the laboratory." });
        }

        return Ok(new
        {
            docId = id,
            state = sample.State,
            isLocked = sample.IsLocked,
            finalReportPdfUri = sample.State == nameof(SampleState.Released) ? sample.FinalReportPdfUri : null,
            measurementsAvailable = false
        });
    }

    /// <summary>
    /// User confirms report parameters (#1, #45). Confirming a report must
    /// NEVER set a sample to Released on its own — release happens only via
    /// SignoffController through SampleStateMachine.Apply. This endpoint
    /// records a REPORT_CONFIRMED audit event and copies the stored draft
    /// report blob to the 'reports' container (NOT 'clinical-reports',
    /// which does not exist in Bicep). If no draft report URI is stored,
    /// nothing is promoted and that is reported honestly.
    /// </summary>
    [HttpPost("{id}/confirm")]
    [Authorize(Policy = "StaffOnly")]
    public async Task<IActionResult> ConfirmReport(string id, [FromBody] System.Text.Json.JsonElement payload)
    {
        if (payload.ValueKind is System.Text.Json.JsonValueKind.Undefined or System.Text.Json.JsonValueKind.Null)
            return BadRequest(new { ok = false, error = "Request body is required." });

        var sample = await _db.Samples.FirstOrDefaultAsync(s => s.SampleId == id && !s.IsDeleted);
        if (sample == null)
            return NotFound(new { ok = false, error = $"Report {id} not found." });

        string? promotedTo = null;
        if (!string.IsNullOrWhiteSpace(sample.DraftReportPdfUri)
            && Uri.TryCreate(sample.DraftReportPdfUri, UriKind.Absolute, out var draftUri))
        {
            string blobName = draftUri.Segments[^1];
            try
            {
                var dest = _blobs.GetBlobContainerClient("reports").GetBlobClient(blobName);
                await dest.StartCopyFromUriAsync(draftUri);
                promotedTo = "reports";
                sample.FinalReportPdfUri = dest.Uri.ToString();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to copy draft report for {ReportId} to the 'reports' container.", id);
                return StatusCode(502, new { ok = false, error = "REPORT_PROMOTION_FAILED: the draft report could not be copied to the 'reports' container. The sample state was not changed." });
            }
        }

        string actor = User.FindFirst("preferred_username")?.Value ?? User.Identity?.Name ?? "Unknown";
        _db.AuditEvents.Add(new AuditEventEntity
        {
            SampleId = id,
            Actor = actor,
            Action = "REPORT_CONFIRMED",
            TimestampUtc = DateTime.UtcNow,
            DetailsJson = System.Text.Json.JsonSerializer.Serialize(new { promotedTo })
        });
        await _db.SaveChangesAsync();

        _logger.LogInformation("Report {ReportId} confirmed by {Actor}. Promoted to: {PromotedTo}", id, actor, promotedTo ?? "(none — no draft report stored)");

        return Ok(new
        {
            ok = true,
            success = true,
            reportId = id,
            status = "Confirmed",
            promotedTo = promotedTo,
            sampleState = sample.State
        });
    }

    /// <summary>
    /// Soft-deletes a report (#21). Staff only. Sets IsDeleted = true and
    /// writes a REPORT_SOFT_DELETED audit event. Never hard-deletes: the row
    /// (and its audit trail) is retained.
    /// </summary>
    [HttpDelete("{id}")]
    [Authorize(Policy = "StaffOnly")]
    public async Task<IActionResult> DeleteReport(string id)
    {
        var sample = await _db.Samples.FirstOrDefaultAsync(s => s.SampleId == id && !s.IsDeleted);
        if (sample == null)
            return NotFound(new { ok = false, error = $"Report {id} not found." });

        string actor = User.FindFirst("preferred_username")?.Value ?? User.Identity?.Name ?? "Unknown";
        sample.IsDeleted = true;
        _db.AuditEvents.Add(new AuditEventEntity
        {
            SampleId = id,
            Actor = actor,
            Action = "REPORT_SOFT_DELETED",
            TimestampUtc = DateTime.UtcNow,
            DetailsJson = System.Text.Json.JsonSerializer.Serialize(new { softDeleted = true })
        });
        await _db.SaveChangesAsync();

        _logger.LogInformation("Report {ReportId} soft-deleted by {Actor}.", id, actor);

        return Ok(new
        {
            ok = true,
            success = true,
            deletedId = id,
            softDeleted = true
        });
    }
}

public class ExtractReportRequest
{
    public string? FileName { get; set; }
    public string? Mime { get; set; }
    public string? RawText { get; set; }
    public string? ImageBase64 { get; set; }
    public string? PrivacyMode { get; set; }
    // Retained for request-shape compatibility only. It is NOT a security
    // control: no filename flag is treated as a malware verdict (#4).
    public bool SimulateMalware { get; set; }
}
