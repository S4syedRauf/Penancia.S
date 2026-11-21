using Microsoft.Azure.Functions.Worker;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Penancia.S.Data;

namespace Penancia.S.Workflow.Activities;

/// <summary>
/// Returns the media type ('video' or 'image') for a sample based on registered blob URIs.
/// </summary>
public class GetSampleMediaTypeActivity
{
    private readonly PenanciaDbContext _db;
    private readonly ILogger<GetSampleMediaTypeActivity> _logger;

    public GetSampleMediaTypeActivity(PenanciaDbContext db, ILogger<GetSampleMediaTypeActivity> logger)
    {
        _db = db;
        _logger = logger;
    }

    [Function(nameof(GetSampleMediaTypeActivity))]
    public async Task<string> Run(
        [ActivityTrigger] string sampleId,
        FunctionContext context)
    {
        var sample = await _db.Samples
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.SampleId == sampleId && !s.IsDeleted);

        if (sample == null)
        {
            _logger.LogWarning("Sample {SampleId} not found when determining media type", sampleId);
            return "video"; // Default fallback
        }

        string mediaType = !string.IsNullOrWhiteSpace(sample.RawVideoBlobUri) ? "video" : "image";
        _logger.LogInformation("Sample {SampleId} media type: {MediaType}", sampleId, mediaType);
        return mediaType;
    }
}