using Microsoft.Azure.Functions.Worker;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Penancia.S.Data;
using Penancia.S.Domain.Workflow;

namespace Penancia.S.Workflow.Activities;

/// <summary>
/// Validates uploaded media and optical calibration parameters for a sample.
/// Strictly uses stored truth facts via SampleReadiness check.
/// Returns true if sample prerequisites are met; false if missing or quarantined.
/// </summary>
public class ValidateFilesActivity
{
    private readonly PenanciaDbContext _db;
    private readonly ILogger<ValidateFilesActivity> _logger;

    public ValidateFilesActivity(PenanciaDbContext db, ILogger<ValidateFilesActivity> logger)
    {
        _db = db;
        _logger = logger;
    }

    [Function(nameof(ValidateFilesActivity))]
    public async Task<bool> Run(
        [ActivityTrigger] string sampleId,
        FunctionContext? context = null)
    {
        _logger.LogInformation("Validating files for sample {SampleId}", sampleId);

        var sample = await _db.Samples
            .Include(s => s.Calibration)
            .FirstOrDefaultAsync(s => s.SampleId == sampleId && !s.IsDeleted);

        if (sample == null)
        {
            _logger.LogError("Sample {SampleId} not found during file validation.", sampleId);
            return false;
        }

        var assets = await _db.MediaAssets.Where(a => a.SampleId == sampleId).ToListAsync();
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
            _logger.LogWarning("Sample {SampleId} failed file validation. Missing prerequisites: {Missing}",
                sampleId, string.Join(", ", readiness.MissingReasons));
            return false;
        }

        if (sample.Calibration != null && sample.Calibration.Status == "Valid" && sample.Calibration.MicronsPerPixel.HasValue && sample.MicronsPerPixel == null)
        {
            sample.MicronsPerPixel = sample.Calibration.MicronsPerPixel.Value;
            await _db.SaveChangesAsync();
        }

        _logger.LogInformation("Files and optical parameters verified for sample {SampleId}.", sampleId);
        return true;
    }
}
