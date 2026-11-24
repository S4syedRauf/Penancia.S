using Microsoft.EntityFrameworkCore;
using Penancia.S.Data.Entities;

namespace Penancia.S.Data;

/// <summary>
/// Entity Framework Core Database Context for Penancia Semen Analysis.
/// Configured for Azure SQL with Managed Identity (passwordless).
/// </summary>
public class PenanciaDbContext : DbContext
{
    public PenanciaDbContext(DbContextOptions<PenanciaDbContext> options) : base(options)
    {
    }

    public DbSet<SampleEntity> Samples => Set<SampleEntity>();
    public DbSet<ModelRunEntity> ModelRuns => Set<ModelRunEntity>();
    public DbSet<AuditEventEntity> AuditEvents => Set<AuditEventEntity>();
    public DbSet<LabOrderEntity> LabOrders => Set<LabOrderEntity>();
    public DbSet<SlotHoldEntity> SlotHolds => Set<SlotHoldEntity>();
    public DbSet<PartnerClinicEntity> PartnerClinics => Set<PartnerClinicEntity>();
    public DbSet<QuestionnaireEntity> Questionnaires => Set<QuestionnaireEntity>();
    public DbSet<ScreeningRunEntity> ScreeningRuns => Set<ScreeningRunEntity>();
    public DbSet<FollowUpTaskEntity> FollowUpTasks => Set<FollowUpTaskEntity>();
    public DbSet<SymptomLogEntity> SymptomLogs => Set<SymptomLogEntity>();
    public DbSet<DailyCheckInEntity> DailyCheckIns => Set<DailyCheckInEntity>();
    public DbSet<CalibrationEntity> Calibrations => Set<CalibrationEntity>();
    public DbSet<MediaAssetEntity> MediaAssets => Set<MediaAssetEntity>();
    public DbSet<OutboxMessageEntity> OutboxMessages => Set<OutboxMessageEntity>();
    public DbSet<InboxMessageEntity> InboxMessages => Set<InboxMessageEntity>();
    public DbSet<IdempotencyKeyEntity> IdempotencyKeys => Set<IdempotencyKeyEntity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // AuditEvents is strictly append-only
        modelBuilder.Entity<AuditEventEntity>()
            .HasIndex(a => new { a.SampleId, a.TimestampUtc });

        modelBuilder.Entity<ModelRunEntity>()
            .HasIndex(m => new { m.SampleId, m.Service });

        // #19: ONE explicit delete policy for both sample children — Restrict.
        // Deleting a sample that still has model runs or audit events is
        // refused by the database, so traceability is never silently
        // destroyed (previously ModelRuns cascaded) and a delete never fails
        // silently. The [ForeignKey] attributes on the entities name the FK
        // columns; the Restrict behaviour can only be set here, because
        // EF Core defaults a required FK to Cascade.
        modelBuilder.Entity<ModelRunEntity>()
            .HasOne(m => m.Sample)
            .WithMany(s => s.ModelRuns)
            .HasForeignKey(m => m.SampleId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<AuditEventEntity>()
            .HasOne(a => a.Sample)
            .WithMany(s => s.AuditEvents)
            .HasForeignKey(a => a.SampleId)
            .OnDelete(DeleteBehavior.Restrict);

        // #20: real FKs for booking entities. All Restrict: a clinic or a
        // claimed slot hold cannot be deleted while orders/holds reference
        // it. SlotHoldEntity.SlotId has no FK — there is no Slots table;
        // see the comment on SlotHoldEntity.SlotId.
        modelBuilder.Entity<LabOrderEntity>()
            .HasOne(o => o.Clinic)
            .WithMany()
            .HasForeignKey(o => o.ClinicId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<LabOrderEntity>()
            .HasOne(o => o.SlotHold)
            .WithMany()
            .HasForeignKey(o => o.SlotHoldId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<SlotHoldEntity>()
            .HasOne(h => h.Clinic)
            .WithMany()
            .HasForeignKey(h => h.ClinicId)
            .OnDelete(DeleteBehavior.Restrict);

        // #20: lookup indexes on UserId for every patient-intake entity.
        modelBuilder.Entity<QuestionnaireEntity>()
            .HasIndex(q => q.UserId)
            .HasDatabaseName("IX_Questionnaires_UserId");

        modelBuilder.Entity<ScreeningRunEntity>()
            .HasIndex(s => s.UserId)
            .HasDatabaseName("IX_ScreeningRuns_UserId");

        modelBuilder.Entity<FollowUpTaskEntity>()
            .HasIndex(t => t.UserId)
            .HasDatabaseName("IX_FollowUpTasks_UserId");

        modelBuilder.Entity<SymptomLogEntity>()
            .HasIndex(l => l.UserId)
            .HasDatabaseName("IX_SymptomLogs_UserId");

        modelBuilder.Entity<DailyCheckInEntity>()
            .HasIndex(c => c.UserId)
            .HasDatabaseName("IX_DailyCheckIns_UserId");

        // #20: one hold per slot — the double-booking guard — and fast
        // lookup of lab orders by tracking number.
        modelBuilder.Entity<SlotHoldEntity>()
            .HasIndex(h => h.SlotId)
            .IsUnique()
            .HasDatabaseName("IX_SlotHolds_SlotId");

        modelBuilder.Entity<LabOrderEntity>()
            .HasIndex(o => o.TrackingNumber)
            .HasDatabaseName("IX_LabOrders_TrackingNumber");

        // Phase 1 Foundation additions
        modelBuilder.Entity<SampleEntity>()
            .Property(s => s.WorkflowMode)
            .HasDefaultValue("prescreen");

        modelBuilder.Entity<SampleEntity>()
            .HasOne(s => s.Calibration)
            .WithMany()
            .HasForeignKey(s => s.CalibrationId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<IdempotencyKeyEntity>()
            .HasKey(k => new { k.Key, k.SampleId });

        modelBuilder.Entity<CalibrationEntity>()
            .HasOne<SampleEntity>()
            .WithMany()
            .HasForeignKey(c => c.SampleId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<CalibrationEntity>()
            .HasIndex(c => c.SampleId)
            .HasDatabaseName("IX_Calibrations_SampleId");

        modelBuilder.Entity<CalibrationEntity>()
            .HasIndex(c => c.AssetId)
            .HasDatabaseName("IX_Calibrations_AssetId");

        modelBuilder.Entity<MediaAssetEntity>()
            .HasOne<SampleEntity>()
            .WithMany()
            .HasForeignKey(m => m.SampleId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<MediaAssetEntity>()
            .HasIndex(m => m.SampleId)
            .HasDatabaseName("IX_MediaAssets_SampleId");

        modelBuilder.Entity<MediaAssetEntity>()
            .HasIndex(m => m.BlobName)
            .HasDatabaseName("IX_MediaAssets_BlobName");

        modelBuilder.Entity<OutboxMessageEntity>()
            .HasIndex(o => o.DispatchedAtUtc)
            .HasDatabaseName("IX_OutboxMessages_DispatchedAtUtc");

        modelBuilder.Entity<OutboxMessageEntity>()
            .HasIndex(o => o.SampleId)
            .HasDatabaseName("IX_OutboxMessages_SampleId");

        modelBuilder.Entity<OutboxMessageEntity>()
            .HasIndex(o => o.IdempotencyKey)
            .IsUnique()
            .HasFilter("[IdempotencyKey] IS NOT NULL")
            .HasDatabaseName("IX_OutboxMessages_IdempotencyKey");
    }
}
