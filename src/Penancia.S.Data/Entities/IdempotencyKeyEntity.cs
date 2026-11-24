using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Penancia.S.Data.Entities;

[Table("IdempotencyKeys")]
public class IdempotencyKeyEntity
{
    [MaxLength(128)]
    public string Key { get; set; } = string.Empty;

    [MaxLength(64)]
    public string SampleId { get; set; } = string.Empty;

    public string ResponseJson { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
