using System.Net;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.DurableTask;
using Microsoft.DurableTask.Client;
using Microsoft.Extensions.Logging;
using Penancia.S.Workflow.Orchestrators;

namespace Penancia.S.Workflow.Functions;

/// <summary>Internal, function-key-protected starter for the durable sample workflow.</summary>
public class StartAnalysisFunction
{
    private readonly ILogger<StartAnalysisFunction> _logger;

    public StartAnalysisFunction(ILogger<StartAnalysisFunction> logger)
    {
        _logger = logger;
    }

    [Function(nameof(StartAnalysisFunction))]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Function, "post", Route = "v1/analysis/{sampleId}/start")]
            HttpRequestData request,
        string sampleId,
        [DurableClient] DurableTaskClient client,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(sampleId) || sampleId.Length > 64)
        {
            var invalid = request.CreateResponse(HttpStatusCode.BadRequest);
            await invalid.WriteAsJsonAsync(new { error = "A valid sampleId is required." }, cancellationToken);
            return invalid;
        }

        var options = new StartOrchestrationOptions { InstanceId = sampleId };
        var instanceId = await client.ScheduleNewOrchestrationInstanceAsync(
            nameof(SampleOrchestrator), sampleId, options, cancellationToken);
        _logger.LogInformation("Scheduled durable analysis for sample {SampleId}", sampleId);
        return await client.CreateCheckStatusResponseAsync(request, instanceId, cancellationToken);
    }
}
