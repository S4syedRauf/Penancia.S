using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Penancia.S.Api.Services;
using Penancia.S.Data;
using Penancia.S.Data.Entities;
using Xunit;

namespace Penancia.S.Tests;

[Trait("Category", "SqlServer")]
public class SqlServerCalibrationTests
{
    private static string? GetConnectionString() =>
        Environment.GetEnvironmentVariable("TEST_SQLSERVER_CONNECTION_STRING");

    [Fact]
    public async Task SqlServer_CalibrationResultService_AppliesValidResult_AndUpdatesSample()
    {
        string? connString = GetConnectionString();
        if (string.IsNullOrWhiteSpace(connString))
        {
            // Skip test when real SQL Server connection string is not provided
            return;
        }

        var options = new DbContextOptionsBuilder<PenanciaDbContext>()
            .UseSqlServer(connString)
            .Options;

        using var db = new PenanciaDbContext(options);

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                { "Calibration:ValidityDays", "7" }
            })
            .Build();

        var service = new CalibrationResultService(
            db,
            config,
            NullLogger<CalibrationResultService>.Instance);

        string sampleId = $"SMP-SQLTEST-{Guid.NewGuid():N}"[..24];
        var sample = new SampleEntity
        {
            SampleId = sampleId,
            CreatedBy = "sql-test-user",
            State = "Draft",
            WorkflowMode = "prescreen",
            ConsentAtUtc = DateTime.UtcNow,
            IsDeleted = false
        };
        db.Samples.Add(sample);

        var asset = new MediaAssetEntity
        {
            AssetId = Guid.NewGuid(),
            SampleId = sampleId,
            Kind = "calibration",
            Container = "raw-images",
            BlobName = $"{sampleId}_calib.jpg",
            ContentTypeDeclared = "image/jpeg",
            SizeBytes = 4096,
            Status = "Verified"
        };
        db.MediaAssets.Add(asset);
        await db.SaveChangesAsync();

        var cal = new CalibrationEntity
        {
            CalibrationId = Guid.NewGuid(),
            SampleId = sampleId,
            TargetId = "thorlabs-r1l3s2p",
            ReferencePitchUm = 10.0,
            AssetId = asset.AssetId,
            Status = "Pending",
            CreatedAtUtc = DateTime.UtcNow
        };
        db.Calibrations.Add(cal);
        sample.CalibrationId = cal.CalibrationId;
        await db.SaveChangesAsync();

        try
        {
            var resultDto = new CalibrationResultDto
            {
                Status = "Valid",
                MeasuredPitchPx = 25.0,
                MicronsPerPixel = 0.4000,
                LinesDetected = 12,
                SpacingCvPct = 0.45,
                ImageWidthPx = 800,
                ImageHeightPx = 600,
                ToolVersion = "1.0.0-phase1+sqltest"
            };

            var applyResult = await service.ApplyAsync(cal.CalibrationId, resultDto);
            Assert.True(applyResult.Success);
            Assert.Equal("Valid", applyResult.Status);

            // Re-fetch directly from SQL Server to verify persistence
            var freshCal = await db.Calibrations.AsNoTracking().FirstOrDefaultAsync(c => c.CalibrationId == cal.CalibrationId);
            Assert.NotNull(freshCal);
            Assert.Equal("Valid", freshCal.Status);
            Assert.Equal(0.4000, freshCal.MicronsPerPixel);
            Assert.Equal(25.0, freshCal.MeasuredPitchPx);
            Assert.NotNull(freshCal.ExpiresAtUtc);
            Assert.True(freshCal.ExpiresAtUtc > DateTime.UtcNow);
            Assert.Equal("1.0.0-phase1+sqltest", freshCal.ToolVersion);

            var freshSample = await db.Samples.AsNoTracking().FirstOrDefaultAsync(s => s.SampleId == sampleId);
            Assert.NotNull(freshSample);
            Assert.Equal(0.4000, freshSample.MicronsPerPixel);

            // Idempotent replay
            var replayResult = await service.ApplyAsync(cal.CalibrationId, resultDto);
            Assert.True(replayResult.Success);
            Assert.Equal("Valid", replayResult.Status);
        }
        finally
        {
            // Cleanup: break circular FK reference before deleting
            var toRemoveSample = await db.Samples.FirstOrDefaultAsync(s => s.SampleId == sampleId);
            if (toRemoveSample != null)
            {
                toRemoveSample.CalibrationId = null;
                await db.SaveChangesAsync();
            }

            var toRemoveCal = await db.Calibrations.FirstOrDefaultAsync(c => c.CalibrationId == cal.CalibrationId);
            if (toRemoveCal != null) db.Calibrations.Remove(toRemoveCal);

            var toRemoveAsset = await db.MediaAssets.FirstOrDefaultAsync(a => a.AssetId == asset.AssetId);
            if (toRemoveAsset != null) db.MediaAssets.Remove(toRemoveAsset);

            if (toRemoveSample != null) db.Samples.Remove(toRemoveSample);

            await db.SaveChangesAsync();
        }
    }
}
