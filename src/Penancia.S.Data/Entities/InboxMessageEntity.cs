using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Penancia.S.Data.Entities;

[Table("InboxMessages")]
public class InboxMessageEntity
{
    [Key]
    [MaxLength(128)]
    public string MessageId { get; set; } = string.Empty;

    public DateTime ReceivedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? RaisedAtUtc { get; set; }
}
