using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Penancia.S.Data;
using Penancia.S.Data.Entities;
using Penancia.S.Domain.Workflow;

namespace Penancia.S.Api.Controllers.V1;

public record SignoffRequest(string? Statement, string? Role, int? SignedReportVersion, string? SignedContentSha256);

/// <summary>
/// Handles clinical sign-off and report release.
///
/// Strict Clinical Rule: dual sign-off enforcement — the signer MUST NOT be
/// any person who entered or modified manual data on this sample. That rule
/// is enforced by SampleStateMachine.Apply (ValidateSignoff), never by a
/// hand-rolled check in this controller.
///
/// #1: the anonymous dual-sign-off endpoint (POST /v1/signoff,
/// SubmitDualSignoff) is DELETED. The only sign-off route is this one,
/// under the SignerOnly policy, and it releases a sample only through the
/// state machine.
///
/// SIGN-OFF EVENT / ORCHESTRATOR DESYNC (remaining item): this endpoint
/// applies SignedOff directly via the machine. It does NOT raise the
/// Durable Functions 'sample_signed_off' external event, because the Api
/// cannot construct a DurableTask client from its own configuration: the Api
/// has no AzureWebJobsStorage setting (infra/main.bicep provisions that
/// Key Vault secret only to the Workflow Function App) and no DurableTask
/// package reference. Until an event-raising path lands, an orchestrator
/// instance waiting on 'sample_signed_off' for this sample will hit its
/// 7-day sign-off timeout and attempt SignoffTimeout — which the machine
/// rejects because the sample is already terminal (Released). The
/// orchestrator side must be reconciled (Workflow area) before relying on
/// the durable wait; the Api-side transition recorded here is the
/// authoritative release.
/// </summary>
[ApiController]
[Route("v1/samples/{sampleId}/signoff")]
[Authorize(Policy = "SignerOnly")]
public class SignoffController : ControllerBase
{
    private readonly PenanciaDbContext _db;
    private readonly ILogger<SignoffController> _logger;

    public SignoffController(PenanciaDbContext db, ILogger<SignoffController> logger)
    {
        _db = db;
        _logger = logger;
    }

    [HttpPost]
    public async Task<IActionResult> SignOffSample(string sampleId, [FromBody] SignoffRequest? req)
    {
        if (req is null)
            return BadRequest(new { error = "Request body is required." });
        if (req.SignedReportVersion is null || string.IsNullOrWhiteSpace(req.SignedContentSha256))
            return BadRequest(new { error = "SignedReportVersion and SignedContentSha256 are required: sign-off must name the exact draft version and content hash being signed." });

        string signerIdentity = User.FindFirst("preferred_username")?.Value
            ?? User.Identity?.Name
            ?? "Unknown";
        string signerRole = User.IsInRole("ClinicalDirector") ? "ClinicalDirector" : "Signer";

        var sample = await _db.Samples.FirstOrDefaultAsync(s => s.SampleId == sampleId && !s.IsDeleted);
        if (sample == null)
            return NotFound(new { error = $"Sample {sampleId} not found." });

        if (!Enum.TryParse<SampleState>(sample.State, ignoreCase: true, out var current))
            return StatusCode(422, new { error = $"Sample {sampleId} has an unrecognised stored state '{sample.State}'." });

        // Data enterers: deserialize the stored JSON array (empty when null)
        // and always include CreatedBy — the creator entered the sample, so
        // they must never be able to sign it off. A stored value that is not
        // valid JSON fails closed: signer independence cannot be verified.
        if (!TryGetDataEnterers(sample, out var dataEnterers, out var enterersError))
            return StatusCode(422, new { error = enterersError });

        var ctx = new TransitionContext(
            ActorId: signerIdentity,
            ActorRole: signerRole,
            DataEnterers: dataEnterers,
            SignedReportVersion: req.SignedReportVersion,
            CurrentReportVersion: sample.ReportVersion,
            SignedContentSha256: req.SignedContentSha256,
            CurrentContentSha256: sample.ContentSha256);

        var result = SampleStateMachine.Apply(current, SampleEvent.SignedOff, ctx);
        if (!result.Success)
        {
            _logger.LogWarning("Sign-off refused for sample {SampleId} by {Signer}: {Reason}", sampleId, signerIdentity, result.FailureReason);
            return StatusCode(409, new { error = result.FailureReason });
        }

        // Record audit event, then apply the machine's new state (Released).
        _db.AuditEvents.Add(new AuditEventEntity
        {
            SampleId = sampleId,
            Actor = signerIdentity,
            Action = "CLINICAL_SIGNOFF_APPROVED",
            TimestampUtc = DateTime.UtcNow,
            DetailsJson = JsonSerializer.Serialize(new
            {
                signer = signerIdentity,
                role = signerRole,
                statement = req.Statement,
                signedReportVersion = req.SignedReportVersion,
                signedContentSha256 = req.SignedContentSha256
            })
        });

        sample.State = result.NewState.ToString();
        sample.IsLocked = true;
        await _db.SaveChangesAsync();

        _logger.LogInformation("Sample {SampleId} successfully released by {Signer}", sampleId, signerIdentity);

        return Ok(new
        {
            status = result.NewState.ToString(),
            sampleId = sampleId,
            signedBy = signerIdentity,
            signedReportVersion = req.SignedReportVersion,
            signedAtUtc = DateTime.UtcNow
        });
    }

    private static bool TryGetDataEnterers(SampleEntity sample, out List<string> enterers, out string? error)
    {
        enterers = new List<string>();
        if (!string.IsNullOrWhiteSpace(sample.DataEnterersJson))
        {
            try
            {
                var parsed = JsonSerializer.Deserialize<List<string>>(sample.DataEnterersJson);
                if (parsed != null)
                    enterers.AddRange(parsed.Where(e => !string.IsNullOrWhiteSpace(e)));
            }
            catch (JsonException)
            {
                error = "DATA_ENTERERS_CORRUPT: the stored data-enterer list for this sample is not valid JSON; signer independence cannot be verified.";
                return false;
            }
        }
        if (!string.IsNullOrWhiteSpace(sample.CreatedBy)
            && !enterers.Contains(sample.CreatedBy, StringComparer.OrdinalIgnoreCase))
        {
            enterers.Add(sample.CreatedBy);
        }
        error = null;
        return true;
    }
}
