using Microsoft.EntityFrameworkCore;
using Penancia.S.Data;
using Penancia.S.Data.Entities;
using Xunit;

namespace Penancia.S.Tests;

public class Phase1DatabaseModelTests
{
    private PenanciaDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<PenanciaDbContext>()
            .UseSqlServer("Server=tcp:localhost,1433;Database=TestDb;Encrypt=False;")
            .Options;
        return new PenanciaDbContext(options);
    }

    [Fact]
    public void Model_Contains_Phase1_Entities_With_Correct_Keys_And_Nullability()
    {
        using var ctx = CreateContext();
        var model = ctx.Model;

        // 1. IdempotencyKey composite key
        var idem = model.FindEntityType(typeof(IdempotencyKeyEntity));
        Assert.NotNull(idem);
        var primaryKey = idem.FindPrimaryKey();
        Assert.NotNull(primaryKey);
        var keyProps = primaryKey.Properties.Select(p => p.Name).ToList();
        Assert.Equal(new[] { "Key", "SampleId" }, keyProps);

        // 2. Calibration entity
        var cal = model.FindEntityType(typeof(CalibrationEntity));
        Assert.NotNull(cal);
        Assert.Equal("CalibrationId", cal.FindPrimaryKey()?.Properties[0].Name);

        // 3. MediaAsset entity
        var asset = model.FindEntityType(typeof(MediaAssetEntity));
        Assert.NotNull(asset);
        Assert.Equal("AssetId", asset.FindPrimaryKey()?.Properties[0].Name);

        // 4. SampleEntity nullability and defaults
        var sample = model.FindEntityType(typeof(SampleEntity));
        Assert.NotNull(sample);
        Assert.True(sample.FindProperty("MicronsPerPixel")?.IsNullable);
        Assert.True(sample.FindProperty("FramesPerSecond")?.IsNullable);
        Assert.True(sample.FindProperty("ChamberDepthMicrons")?.IsNullable);
        var wfProp = sample.FindProperty("WorkflowMode");
        Assert.NotNull(wfProp);
        Assert.False(wfProp.IsNullable);
        Assert.Equal("prescreen", wfProp.GetDefaultValue());

        // 5. CalibrationEntity nullability - no invented numbers or versions
        Assert.True(cal.FindProperty("MeasuredPitchPx")?.IsNullable);
        Assert.True(cal.FindProperty("MicronsPerPixel")?.IsNullable);
        Assert.True(cal.FindProperty("LinesDetected")?.IsNullable);
        Assert.True(cal.FindProperty("SpacingCvPct")?.IsNullable);
        Assert.True(cal.FindProperty("ImageWidthPx")?.IsNullable);
        Assert.True(cal.FindProperty("ImageHeightPx")?.IsNullable);
        Assert.True(cal.FindProperty("ToolVersion")?.IsNullable);

        var freshCal = new CalibrationEntity();
        Assert.Null(freshCal.MeasuredPitchPx);
        Assert.Null(freshCal.MicronsPerPixel);
        Assert.Null(freshCal.LinesDetected);
        Assert.Null(freshCal.SpacingCvPct);
        Assert.Null(freshCal.ImageWidthPx);
        Assert.Null(freshCal.ImageHeightPx);
        Assert.Null(freshCal.ToolVersion);

        // 6. Foreign key linkages with DeleteBehavior.Restrict
        var calFk = cal.GetForeignKeys().FirstOrDefault(k => k.PrincipalEntityType == sample);
        Assert.NotNull(calFk);
        Assert.Equal(DeleteBehavior.Restrict, calFk.DeleteBehavior);

        var assetFk = asset.GetForeignKeys().FirstOrDefault(k => k.PrincipalEntityType == sample);
        Assert.NotNull(assetFk);
        Assert.Equal(DeleteBehavior.Restrict, assetFk.DeleteBehavior);

        var sampleCalFk = sample.GetForeignKeys().FirstOrDefault(k => k.PrincipalEntityType == cal);
        Assert.NotNull(sampleCalFk);
        Assert.Equal(DeleteBehavior.Restrict, sampleCalFk.DeleteBehavior);
    }
}
