using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Penancia.S.Api.Controllers.V1;
using Penancia.S.Data;
using Penancia.S.Data.Entities;
using Xunit;

namespace Penancia.S.Tests;

public class SampleStatusControllerTests
{
    private sealed class StubOrchestrationStatusReader : IOrchestrationStatusReader
    {
        private readonly OrchestrationStatusDto _result;

        public StubOrchestrationStatusReader(bool exists, string? runtimeStatus)
        {
            _result = new OrchestrationStatusDto(exists, runtimeStatus);
        }

        public Task<OrchestrationStatusDto> GetStatusAsync(string sampleId, CancellationToken cancellationToken = default)
            => Task.FromResult(_result);
    }

    private static (SampleStatusController Controller, PenanciaDbContext Db) CreateController(
        string userId = "owner-1",
        bool isStaff = false,
        IOrchestrationStatusReader? reader = null)
    {
        var options = new DbContextOptionsBuilder<PenanciaDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var db = new PenanciaDbContext(options);

        var controller = new SampleStatusController(db, reader);

        var claims = new List<Claim> { new("oid", userId), new(ClaimTypes.Name, userId) };
        if (isStaff)
        {
            claims.Add(new Claim(ClaimTypes.Role, "Staff"));
            claims.Add(new Claim("roles", "Staff"));
        }

        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth"))
            }
        };

        return (controller, db);
    }

    [Fact]
    public async Task GetStatus_Owner_ReturnsRealStateAssetsOrchestrationAndOutboxTime_WithNoFabricatedPercentages()
    {
        var reader = new StubOrchestrationStatusReader(exists: true, runtimeStatus: "Running");
        var (controller, db) = CreateController(userId: "patient-owner", reader: reader);

        const string sampleId = "s-status-owner";
        var dispatchedTime = new DateTime(2026, 11, 24, 18, 0, 0, DateTimeKind.Utc);

        db.Samples.Add(new SampleEntity
        {
            SampleId = sampleId,
            CreatedBy = "patient-owner",
            State = "Validating",
            WorkflowMode = "prescreen",
            CreatedAtUtc = DateTime.UtcNow
        });

        db.MediaAssets.Add(new MediaAssetEntity
        {
            AssetId = Guid.NewGuid(),
            SampleId = sampleId,
            Kind = "video",
            Container = "quarantine",
            BlobName = $"{sampleId}/v.mp4",
            ContentTypeDeclared = "video/mp4",
            Status = "Cleared",
            ScanVerdict = "Clean",
            ScannedAtUtc = dispatchedTime.AddMinutes(-5),
            SizeBytes = 4096,
            CreatedAtUtc = DateTime.UtcNow
        });

        db.OutboxMessages.Add(new OutboxMessageEntity
        {
            Id = Guid.NewGuid(),
            SampleId = sampleId,
            Type = "sample-submit",
            PayloadJson = "{}",
            CreatedAtUtc = dispatchedTime.AddMinutes(-1),
            DispatchedAtUtc = dispatchedTime,
            IdempotencyKey = "k-status-1"
        });

        await db.SaveChangesAsync();

        var result = await controller.GetStatus(sampleId);
        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Equal(200, ok.StatusCode);

        var json = JsonSerializer.Serialize(ok.Value);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        Assert.Equal(sampleId, root.GetProperty("sampleId").GetString());
        Assert.Equal("Validating", root.GetProperty("state").GetString());
        Assert.Equal(1, root.GetProperty("assets").GetArrayLength());
        Assert.Equal("Clean", root.GetProperty("assets")[0].GetProperty("scanVerdict").GetString());
        Assert.True(root.GetProperty("orchestration").GetProperty("exists").GetBoolean());
        Assert.Equal("Running", root.GetProperty("orchestration").GetProperty("runtimeStatus").GetString());
        Assert.NotEqual(JsonValueKind.Null, root.GetProperty("lastOutboxDispatchedAtUtc").ValueKind);

        // Must never fabricate scores or percentages
        Assert.DoesNotContain("motility", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("morphology", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("percentage", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task GetStatus_Staff_CanReadOtherUsersSample()
    {
        var (controller, db) = CreateController(userId: "staff-1", isStaff: true);
        db.Samples.Add(new SampleEntity
        {
            SampleId = "s-status-staff",
            CreatedBy = "other-patient",
            State = "Draft",
            WorkflowMode = "prescreen",
            CreatedAtUtc = DateTime.UtcNow
        });
        await db.SaveChangesAsync();

        var result = await controller.GetStatus("s-status-staff");
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task GetStatus_NonOwnerNonStaff_Returns403()
    {
        var (controller, db) = CreateController(userId: "intruder", isStaff: false);
        db.Samples.Add(new SampleEntity
        {
            SampleId = "s-status-403",
            CreatedBy = "real-owner",
            State = "Draft",
            WorkflowMode = "prescreen",
            CreatedAtUtc = DateTime.UtcNow
        });
        await db.SaveChangesAsync();

        var result = await controller.GetStatus("s-status-403");
        Assert.IsType<ForbidResult>(result);
    }

    [Fact]
    public async Task GetStatus_MissingOrDeletedSample_Returns404()
    {
        var (controller, db) = CreateController();
        db.Samples.Add(new SampleEntity
        {
            SampleId = "s-status-deleted",
            CreatedBy = "owner-1",
            State = "Draft",
            IsDeleted = true,
            WorkflowMode = "prescreen",
            CreatedAtUtc = DateTime.UtcNow
        });
        await db.SaveChangesAsync();

        Assert.IsType<NotFoundObjectResult>(await controller.GetStatus("nonexistent"));
        Assert.IsType<NotFoundObjectResult>(await controller.GetStatus("s-status-deleted"));
    }
}
