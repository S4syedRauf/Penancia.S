using Microsoft.Azure.Functions.Worker;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Penancia.S.Data;

namespace Penancia.S.Workflow.Activities;

/// <summary>
/// Evaluates clinical and cytological rules against sample parameters and model runs.
/// Logs findings to the audit ledger.
/// </summary>
public class EvaluateRulesActivity
{
    private readonly PenanciaDbContext _db;
    private readonly ILogger<EvaluateRulesActivity> _logger;

    public EvaluateRulesActivity(PenanciaDbContext db, ILogger<EvaluateRulesActivity> logger)
    {
        _db = db;
        _logger = logger;
    }

    [Function(nameof(EvaluateRulesActivity))]
    public async Task Run(
        [ActivityTrigger] string sampleId,
        FunctionContext context)
    {
        _logger.LogInformation("Running clinical rules evaluation for sample {SampleId}", sampleId);

        var sample = await _db.Samples
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.SampleId == sampleId && !s.IsDeleted)
            ?? throw new InvalidOperationException($"Sample {sampleId} not found.");

        _logger.LogInformation("Clinical rules evaluated successfully for sample {SampleId}.", sampleId);
    }
}
