using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Security.Claims;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Penancia.S.Data;

namespace Penancia.S.Api.Controllers.V1;

public sealed record OrchestrationStatusDto(bool Exists, string? RuntimeStatus);

public interface IOrchestrationStatusReader
{
    Task<OrchestrationStatusDto> GetStatusAsync(string sampleId, CancellationToken cancellationToken = default);
}

public sealed class HttpOrchestrationStatusReader : IOrchestrationStatusReader
{
    private readonly IHttpClientFactory _httpClients;
    private readonly IConfiguration _configuration;
    private readonly ILogger<HttpOrchestrationStatusReader> _logger;

    public HttpOrchestrationStatusReader(
        IHttpClientFactory httpClients,
        IConfiguration configuration,
        ILogger<HttpOrchestrationStatusReader> logger)
    {
        _httpClients = httpClients;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<OrchestrationStatusDto> GetStatusAsync(string sampleId, CancellationToken cancellationToken = default)
    {
        var functionKey = _configuration["Workflow:FunctionKey"];
        if (string.IsNullOrWhiteSpace(functionKey))
        {
            return new OrchestrationStatusDto(false, null);
        }

        try
        {
            var client = _httpClients.CreateClient("workflow");
            using var req = new HttpRequestMessage(
                HttpMethod.Get,
                $"runtime/webhooks/durabletask/instances/{Uri.EscapeDataString(sampleId)}");
            req.Headers.Add("x-functions-key", functionKey);

            using var resp = await client.SendAsync(req, cancellationToken);
            if (!resp.IsSuccessStatusCode)
            {
                return new OrchestrationStatusDto(false, null);
            }

            var json = await resp.Content.ReadAsStringAsync(cancellationToken);
            using var doc = JsonDocument.Parse(json);
            string? runtimeStatus = doc.RootElement.TryGetProperty("runtimeStatus", out var rs) ? rs.GetString() : null;
            return new OrchestrationStatusDto(true, runtimeStatus);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to query orchestration status for sample {SampleId}", sampleId);
            return new OrchestrationStatusDto(false, null);
        }
    }
}

/// <summary>
/// Read-only status endpoint for a sample (Phase 2 Step 2.6, CL-0031).
/// Returns real stored state, per-asset malware scan verdicts, orchestration existence/runtime status,
/// and last outbox dispatch timestamp. Owner or staff only. Never fabricates scores or percentages.
/// </summary>
[ApiController]
[Route("v1/semen/samples")]
[Authorize]
public class SampleStatusController : ControllerBase
{
    private readonly PenanciaDbContext _db;
    private readonly IOrchestrationStatusReader? _orchestrationReader;

    public SampleStatusController(
        PenanciaDbContext db,
        IOrchestrationStatusReader? orchestrationReader = null)
    {
        _db = db;
        _orchestrationReader = orchestrationReader;
    }

    private string CallerObjectId() =>
        User.FindFirstValue("oid")
        ?? User.FindFirstValue("http://schemas.microsoft.com/identity/claims/objectidentifier")
        ?? User.FindFirstValue("sub")
        ?? User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.Identity?.Name
        ?? string.Empty;

    private bool IsStaffCaller() =>
        User.IsInRole("Staff") || User.IsInRole("Technician") || User.IsInRole("QCLead")
        || User.IsInRole("ClinicalDirector") || User.IsInRole("Signer") || User.IsInRole("LabAdmin")
        || User.Claims.Any(c => c.Type == "roles" && c.Value is "Staff" or "Technician" or "QCLead" or "ClinicalDirector" or "Signer" or "LabAdmin");

    [HttpGet("{sampleId}/status")]
    public async Task<IActionResult> GetStatus(string sampleId, CancellationToken cancellationToken = default)
    {
        var sample = await _db.Samples
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.SampleId == sampleId && !s.IsDeleted, cancellationToken);

        if (sample == null)
        {
            return NotFound(new { error = "SAMPLE_NOT_FOUND", message = $"Sample {sampleId} not found." });
        }

        var callerId = CallerObjectId();
        if (sample.CreatedBy != callerId && !IsStaffCaller())
        {
            return Forbid();
        }

        var assets = await _db.MediaAssets
            .AsNoTracking()
            .Where(a => a.SampleId == sampleId)
            .OrderBy(a => a.CreatedAtUtc)
            .Select(a => new
            {
                assetId = a.AssetId,
                kind = a.Kind,
                status = a.Status,
                scanVerdict = a.ScanVerdict,
                scannedAtUtc = a.ScannedAtUtc,
                rejectReason = a.RejectReason,
                sizeBytes = a.SizeBytes
            })
            .ToListAsync(cancellationToken);

        var lastOutboxDispatchedAtUtc = await _db.OutboxMessages
            .AsNoTracking()
            .Where(o => o.SampleId == sampleId && o.DispatchedAtUtc != null)
            .OrderByDescending(o => o.DispatchedAtUtc)
            .Select(o => o.DispatchedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

        var orchestration = _orchestrationReader != null
            ? await _orchestrationReader.GetStatusAsync(sampleId, cancellationToken)
            : new OrchestrationStatusDto(false, null);

        return Ok(new
        {
            sampleId = sample.SampleId,
            state = sample.State,
            assets,
            orchestration = new
            {
                exists = orchestration.Exists,
                runtimeStatus = orchestration.RuntimeStatus
            },
            lastOutboxDispatchedAtUtc
        });
    }
}
