using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Threading.Tasks;
using Azure.Storage.Blobs;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Penancia.S.Api.Controllers.V1;
using Penancia.S.Data;
using Penancia.S.Data.Entities;
using Xunit;

namespace Penancia.S.Tests;

public class SubmitSampleControllerTests
{
    private static (SamplesController Controller, PenanciaDbContext Db, DefaultHttpContext HttpContext) CreateController(
        string userId = "patient-1",
        bool isStaff = false)
    {
        var options = new DbContextOptionsBuilder<PenanciaDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning))
            .Options;
        var db = new PenanciaDbContext(options);

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>())
            .Build();

        var blobs = new BlobServiceClient(new Uri("https://stpenancias.blob.core.windows.net"));
        var controller = new SamplesController(db, blobs, null!, config, NullLogger<SamplesController>.Instance);

        var claims = new List<Claim> { new("oid", userId), new(ClaimTypes.Name, userId) };
        if (isStaff)
        {
            claims.Add(new Claim(ClaimTypes.Role, "Staff"));
            claims.Add(new Claim("roles", "Staff"));
        }

        var httpContext = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth"))
        };
        controller.ControllerContext = new ControllerContext { HttpContext = httpContext };

        return (controller, db, httpContext);
    }

    private static async Task SeedReadySampleAsync(
        PenanciaDbContext db,
        string sampleId,
        string ownerId = "patient-1",
        string state = "Draft",
        bool withCalibration = true,
        string mediaStatus = "Cleared")
    {
        Guid? calId = null;
        if (withCalibration)
        {
            var cal = new CalibrationEntity
            {
                CalibrationId = Guid.NewGuid(),
                SampleId = sampleId,
                Status = "Valid",
                TargetId = "thorlabs-r1l3s2p",
                ReferencePitchUm = 10.0,
                MicronsPerPixel = 0.4,
                CreatedAtUtc = DateTime.UtcNow
            };
            db.Calibrations.Add(cal);
            calId = cal.CalibrationId;
        }

        db.Samples.Add(new SampleEntity
        {
            SampleId = sampleId,
            CreatedBy = ownerId,
            CreatedAtUtc = DateTime.UtcNow,
            State = state,
            WorkflowMode = "prescreen",
            CalibrationId = calId
        });

        if (!string.IsNullOrEmpty(mediaStatus))
        {
            db.MediaAssets.Add(new MediaAssetEntity
            {
                AssetId = Guid.NewGuid(),
                SampleId = sampleId,
                Kind = "video",
                Container = "quarantine",
                BlobName = $"{sampleId}/{Guid.NewGuid()}.mp4",
                ContentTypeDeclared = "video/mp4",
                Status = mediaStatus,
                SizeBytes = 2048,
                CreatedAtUtc = DateTime.UtcNow
            });
        }

        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task SubmitSample_MissingIdempotencyKeyHeader_Returns400()
    {
        var (controller, db, _) = CreateController();
        await SeedReadySampleAsync(db, "s-ctrl-no-key");

        var result = await controller.SubmitSample("s-ctrl-no-key");

        var badReq = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal(400, badReq.StatusCode);
        var error = badReq.Value?.GetType().GetProperty("error")?.GetValue(badReq.Value)?.ToString();
        Assert.Equal("IDEMPOTENCY_KEY_REQUIRED", error);
    }

    [Fact]
    public async Task SubmitSample_ValidRequest_Returns202WithSampleIdStateAndOutboxId()
    {
        var (controller, db, httpContext) = CreateController();
        const string sampleId = "s-ctrl-ok";
        await SeedReadySampleAsync(db, sampleId);

        httpContext.Request.Headers["Idempotency-Key"] = "ctrl-idem-1";
        var result = await controller.SubmitSample(sampleId);

        var accepted = Assert.IsType<AcceptedResult>(result);
        Assert.Equal(202, accepted.StatusCode);

        var bodyType = accepted.Value!.GetType();
        Assert.Equal(sampleId, bodyType.GetProperty("sampleId")?.GetValue(accepted.Value)?.ToString());
        Assert.Equal("Validating", bodyType.GetProperty("state")?.GetValue(accepted.Value)?.ToString());
        Assert.NotNull(bodyType.GetProperty("outboxId")?.GetValue(accepted.Value));
    }

    [Fact]
    public async Task SubmitSample_NotOwner_Returns403()
    {
        var (controller, db, httpContext) = CreateController(userId: "other-user");
        await SeedReadySampleAsync(db, "s-ctrl-403", ownerId: "real-owner");

        httpContext.Request.Headers["Idempotency-Key"] = "ctrl-idem-403";
        var result = await controller.SubmitSample("s-ctrl-403");

        Assert.IsType<ForbidResult>(result);
    }

    [Fact]
    public async Task SubmitSample_WrongState_Returns409()
    {
        var (controller, db, httpContext) = CreateController();
        await SeedReadySampleAsync(db, "s-ctrl-409", state: "Analyzing");

        httpContext.Request.Headers["Idempotency-Key"] = "ctrl-idem-409";
        var result = await controller.SubmitSample("s-ctrl-409");

        var conflict = Assert.IsType<ConflictObjectResult>(result);
        Assert.Equal(409, conflict.StatusCode);
    }

    [Fact]
    public async Task SubmitSample_MissingCalibration_Returns422()
    {
        var (controller, db, httpContext) = CreateController();
        await SeedReadySampleAsync(db, "s-ctrl-422-cal", withCalibration: false);

        httpContext.Request.Headers["Idempotency-Key"] = "ctrl-idem-422-cal";
        var result = await controller.SubmitSample("s-ctrl-422-cal");

        var unproc = Assert.IsType<UnprocessableEntityObjectResult>(result);
        Assert.Equal(422, unproc.StatusCode);
    }

    [Fact]
    public void TriggerAnalysis_DeprecatedAnalyzeEndpoint_Returns410WithLocationHeader()
    {
        var (controller, _, httpContext) = CreateController();
        const string sampleId = "s-old-analyze";

        var result = controller.TriggerAnalysis(sampleId);

        var obj = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status410Gone, obj.StatusCode);
        Assert.Equal($"/v1/semen/samples/{sampleId}/submit", httpContext.Response.Headers["Location"].ToString());
        var error = obj.Value?.GetType().GetProperty("error")?.GetValue(obj.Value)?.ToString();
        Assert.Equal("ENDPOINT_DEPRECATED", error);
    }
}
