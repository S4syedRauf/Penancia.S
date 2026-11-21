using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Penancia.S.Data.Entities;

/// <summary>
/// Clinical Lab Order entity tracking official booking, custody, and status.
/// </summary>
[Table("LabOrders")]
public class LabOrderEntity
{
    [Key]
    [MaxLength(64)]
    public string OrderId { get; set; } = string.Empty;

    [MaxLength(64)]
    public string TrackingNumber { get; set; } = string.Empty;

    [MaxLength(64)]
    public string ClinicId { get; set; } = string.Empty;

    // Real FK navigation to the partner clinic (#20). Delete behaviour is
    // Restrict, configured in PenanciaDbContext.OnModelCreating.
    [ForeignKey(nameof(ClinicId))]
    public PartnerClinicEntity? Clinic { get; set; }

    [MaxLength(128)]
    public string PatientId { get; set; } = string.Empty;

    [MaxLength(32)]
    public string CollectionType { get; set; } = "walk-in"; // home | walk-in

    [MaxLength(32)]
    public string Status { get; set; } = "Confirmed";

    [Column(TypeName = "decimal(18,2)")]
    public decimal PriceAed { get; set; } = 450.00m;

    [MaxLength(64)]
    public string? SlotHoldId { get; set; }

    // Real FK navigation to the slot hold this order claimed (#20).
    // Optional: an order may exist without a hold. Delete behaviour is
    // Restrict, configured in PenanciaDbContext.OnModelCreating.
    [ForeignKey(nameof(SlotHoldId))]
    public SlotHoldEntity? SlotHold { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAtUtc { get; set; }

    [MaxLength(1024)]
    public string? Notes { get; set; }
}

/// <summary>
/// Temporary 15-minute slot hold to prevent double-booking during lab appointment checkout.
/// </summary>
[Table("SlotHolds")]
public class SlotHoldEntity
{
    [Key]
    [MaxLength(64)]
    public string HoldId { get; set; } = string.Empty;

    // SlotId is an external slot identifier supplied by the clinic booking
    // system; there is no Slots table/entity in this solution, so no FK can
    // point at it (#20). Double-booking protection for a slot is enforced
    // instead by the UNIQUE index IX_SlotHolds_SlotId (see DbContext and
    // migration 20261121010311_FixAuditAndBookingConstraints).
    [MaxLength(64)]
    public string SlotId { get; set; } = string.Empty;

    [MaxLength(64)]
    public string ClinicId { get; set; } = string.Empty;

    // Real FK navigation to the partner clinic (#20). Delete behaviour is
    // Restrict, configured in PenanciaDbContext.OnModelCreating.
    [ForeignKey(nameof(ClinicId))]
    public PartnerClinicEntity? Clinic { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAtUtc { get; set; } = DateTime.UtcNow.AddMinutes(15);

    public bool IsClaimed { get; set; } = false;
}

/// <summary>
/// Registered accredited UAE partner clinic and andrology diagnostic hub.
/// </summary>
[Table("PartnerClinics")]
public class PartnerClinicEntity
{
    [Key]
    [MaxLength(64)]
    public string ClinicId { get; set; } = string.Empty;

    [MaxLength(256)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(128)]
    public string City { get; set; } = "Dubai";

    [MaxLength(512)]
    public string Address { get; set; } = string.Empty;

    [MaxLength(128)]
    public string ContactEmail { get; set; } = string.Empty;

    [MaxLength(64)]
    public string Phone { get; set; } = string.Empty;

    [MaxLength(64)]
    public string LicenseNumber { get; set; } = string.Empty;

    public bool IsActive { get; set; } = true;

    [Column(TypeName = "decimal(18,2)")]
    public decimal WalkInPriceAed { get; set; } = 400.00m;

    [Column(TypeName = "decimal(18,2)")]
    public decimal HomeCollectionPriceAed { get; set; } = 650.00m;
}
