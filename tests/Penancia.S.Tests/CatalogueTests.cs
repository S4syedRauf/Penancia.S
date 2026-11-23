using Penancia.S.Domain.Model;
using Xunit;

namespace Penancia.S.Tests;

public class CatalogueTests
{
    [Theory]
    [InlineData("leja-sc-20-01-02-b-ce", 20.0, "https://leja.nl/wp-content/uploads/2023/06/DOC-3.3-01-10-2023-04-24-Leja-slides-General-CE-User-Manual.pdf")]
    [InlineData("vitrolife-microcell-15423", 20.0, "https://www.vitrolife.com/products/sperm-processing/microcell--accessories/")]
    public void KnownChamber_ResolvesCorrectDepthAndDatasheet(string id, double expectedDepth, string expectedDatasheet)
    {
        var found = PhysicalCatalogues.TryGetChamber(id, out var chamber);
        Assert.True(found);
        Assert.NotNull(chamber);
        Assert.Equal(expectedDepth, chamber.DepthUm);
        Assert.Equal(expectedDatasheet, chamber.DatasheetUrl);

        var retrieved = PhysicalCatalogues.GetChamber(id);
        Assert.Equal(chamber, retrieved);
    }

    [Fact]
    public void KnownTarget_ResolvesCorrectPitchAndDatasheet()
    {
        var found = PhysicalCatalogues.TryGetTarget("thorlabs-r1l3s2p", out var target);
        Assert.True(found);
        Assert.NotNull(target);
        Assert.Equal(10.0, target.PitchUm);
        Assert.Equal("https://www.thorlabs.com/stage-micrometers", target.DatasheetUrl);

        var retrieved = PhysicalCatalogues.GetTarget("thorlabs-r1l3s2p");
        Assert.Equal(target, retrieved);
    }

    [Theory]
    [InlineData("invented-chamber-10um")]
    [InlineData("makler-counting-chamber")]
    [InlineData("custom-slide")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void UnknownChamber_IsRejected(string? id)
    {
        var found = PhysicalCatalogues.TryGetChamber(id, out var chamber);
        Assert.False(found);
        Assert.Null(chamber);

        if (id != null)
        {
            Assert.Throws<KeyNotFoundException>(() => PhysicalCatalogues.GetChamber(id));
        }
    }

    [Theory]
    [InlineData("unknown-stage-micrometer")]
    [InlineData("ruler-1mm")]
    [InlineData("custom-grid")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void UnknownTarget_IsRejected(string? id)
    {
        var found = PhysicalCatalogues.TryGetTarget(id, out var target);
        Assert.False(found);
        Assert.Null(target);

        if (id != null)
        {
            Assert.Throws<KeyNotFoundException>(() => PhysicalCatalogues.GetTarget(id));
        }
    }
}
