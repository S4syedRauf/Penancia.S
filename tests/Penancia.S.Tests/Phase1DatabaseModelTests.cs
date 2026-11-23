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

        // 4. SampleEntity nullability
        var sample = model.FindEntityType(typeof(SampleEntity));
        Assert.NotNull(sample);
        Assert.True(sample.FindProperty("MicronsPerPixel")?.IsNullable);
        Assert.True(sample.FindProperty("FramesPerSecond")?.IsNullable);
        Assert.True(sample.FindProperty("ChamberDepthMicrons")?.IsNullable);
        Assert.False(sample.FindProperty("WorkflowMode")?.IsNullable);
    }
}
