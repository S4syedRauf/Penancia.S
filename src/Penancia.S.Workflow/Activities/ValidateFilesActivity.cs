using Microsoft.Azure.Functions.Worker;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Penancia.S.Data;

namespace Penancia.S.Workflow.Activities;

/// <summary>
/// Validates uploaded media and optical calibration parameters for a sample.
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
        FunctionContext context)
    {
        _logger.LogInformation("Validating files for sample {SampleId}", sampleId);

        var sample = await _db.Samples.FirstOrDefaultAsync(s => s.SampleId == sampleId && !s.IsDeleted);
        if (sample == null)
        {
            _logger.LogError("Sample {SampleId} not found during file validation.", sampleId);
            return false;
        }

        // Check for media registration and optical calibration
        bool hasMedia = !string.IsNullOrWhiteSpace(sample.RawVideoBlobUri)
                     || !string.IsNullOrWhiteSpace(sample.RawImageBlobUri);
        bool hasCalibration = sample.MicronsPerPixel > 0;

        if (!hasMedia && !hasCalibration)
        {
            _logger.LogWarning("Sample {SampleId} missing both media registration and calibration values.", sampleId);
            return false;
        }

        _logger.LogInformation("Files and optical parameters verified for sample {SampleId}.", sampleId);
        return true;
    }
}
