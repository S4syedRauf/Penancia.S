using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Penancia.S.Data.Entities;

[Table("MediaAssets")]
public class MediaAssetEntity
{
    [Key]
    public Guid AssetId { get; set; } = Guid.NewGuid();

    [MaxLength(64)]
    public string SampleId { get; set; } = string.Empty;

    [MaxLength(32)]
    public string Kind { get; set; } = string.Empty;

    [MaxLength(64)]
    public string Container { get; set; } = string.Empty;

    [MaxLength(256)]
    public string BlobName { get; set; } = string.Empty;

    [MaxLength(128)]
    public string ContentTypeDeclared { get; set; } = string.Empty;

    [MaxLength(128)]
    public string? ContentTypeSniffed { get; set; }

    public long SizeBytes { get; set; }

    [MaxLength(64)]
    public string? Sha256 { get; set; }

    [MaxLength(32)]
    public string Status { get; set; } = "Issued";

    [MaxLength(256)]
    public string? RejectReason { get; set; }

    public double? Fps { get; set; }
    public int? WidthPx { get; set; }
    public int? HeightPx { get; set; }

    [MaxLength(32)]
    public string? Codec { get; set; }

    public double? DurationS { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
