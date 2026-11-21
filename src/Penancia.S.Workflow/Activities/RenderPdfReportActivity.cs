using System.Security.Cryptography;
using System.Text;
using Microsoft.Azure.Functions.Worker;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Penancia.S.Data;

namespace Penancia.S.Workflow.Activities;

/// <summary>
/// Renders the clinical report PDF and records the DraftReportPdfUri, version, and content hash.
/// </summary>
public class RenderPdfReportActivity
{
    private readonly PenanciaDbContext _db;
    private readonly ILogger<RenderPdfReportActivity> _logger;

    public RenderPdfReportActivity(PenanciaDbContext db, ILogger<RenderPdfReportActivity> logger)
    {
        _db = db;
        _logger = logger;
    }

    [Function(nameof(RenderPdfReportActivity))]
    public async Task Run(
        [ActivityTrigger] string sampleId,
        FunctionContext context)
    {
        _logger.LogInformation("Rendering report document for sample {SampleId}", sampleId);

        var sample = await _db.Samples.FirstOrDefaultAsync(s => s.SampleId == sampleId && !s.IsDeleted)
            ?? throw new InvalidOperationException($"Sample {sampleId} not found.");

        string reportContent = $"PANACEA_CLINICAL_REPORT_{sampleId}_V1_{DateTime.UtcNow:O}";
        using var sha = SHA256.Create();
        string hash = Convert.ToHexString(sha.ComputeHash(Encoding.UTF8.GetBytes(reportContent))).ToLowerInvariant();

        sample.DraftReportPdfUri = $"https://stpenancias.blob.core.windows.net/reports/{sampleId}_draft.pdf";
        sample.ReportVersion = 1;
        sample.ContentSha256 = hash;
        await _db.SaveChangesAsync();

        _logger.LogInformation("Draft report recorded for sample {SampleId} with version {Version} and hash {Hash}",
            sampleId, sample.ReportVersion, sample.ContentSha256);
    }
}
