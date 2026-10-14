using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ServicePro.Modules.ServiceRequests.Domain;

namespace ServicePro.Modules.ServiceRequests.Infrastructure;

internal static class OpsSchema
{
    public const string Name = "ops";
    public const string SrNumberSequence = "sr_number_seq";
}

internal sealed class ServiceRequestConfiguration : IEntityTypeConfiguration<ServiceRequest>
{
    public void Configure(EntityTypeBuilder<ServiceRequest> builder)
    {
        builder.ToTable("service_requests", OpsSchema.Name);
        builder.Property(s => s.SrNumber).HasMaxLength(20);
        builder.Property(s => s.ProblemDescription).HasMaxLength(2000);
        builder.Property(s => s.StatusReason).HasMaxLength(80);
        builder.Property(s => s.VisitCharge).HasPrecision(12, 2);
        builder.Property(s => s.FinalAmount).HasPrecision(12, 2);
        builder.Property(s => s.CompletionCodeHash).HasMaxLength(64);
        builder.Property(s => s.TrackingToken).HasMaxLength(40);
        builder.Property(s => s.ExternalReference).HasMaxLength(128);
        builder.Property(s => s.Version).IsRowVersion();
        builder.Ignore(s => s.IsTerminal);

        builder.HasIndex(s => new { s.TenantId, s.SrNumber }).IsUnique();
        builder.HasIndex(s => s.TrackingToken).IsUnique();
        builder.HasIndex(s => new { s.TenantId, s.Channel, s.ExternalReference }).IsUnique().HasFilter("external_reference IS NOT NULL");
        builder.HasIndex(s => new { s.TenantId, s.Status });
        builder.HasIndex(s => new { s.CurrentTechnicianId, s.Status });
        builder.HasIndex(s => new { s.CustomerId, s.CreatedAt });
        builder.HasIndex(s => s.ScheduledStart);

        builder.HasMany(s => s.History).WithOne().HasForeignKey(h => h.ServiceRequestId).OnDelete(DeleteBehavior.Cascade);
        builder.HasMany(s => s.Notes).WithOne().HasForeignKey(n => n.ServiceRequestId).OnDelete(DeleteBehavior.Cascade);
        builder.HasMany(s => s.Attachments).WithOne().HasForeignKey(a => a.ServiceRequestId).OnDelete(DeleteBehavior.Cascade);
        foreach (var navigation in new[] { nameof(ServiceRequest.History), nameof(ServiceRequest.Notes), nameof(ServiceRequest.Attachments) })
        {
            builder.Navigation(navigation).UsePropertyAccessMode(PropertyAccessMode.Field);
        }
    }
}

internal sealed class StatusHistoryEntryConfiguration : IEntityTypeConfiguration<StatusHistoryEntry>
{
    public void Configure(EntityTypeBuilder<StatusHistoryEntry> builder)
    {
        builder.ToTable("service_status_history", OpsSchema.Name);
        builder.Property(h => h.ReasonCode).HasMaxLength(80);
        builder.Property(h => h.Note).HasMaxLength(1000);
        builder.HasIndex(h => new { h.ServiceRequestId, h.OccurredAt });
    }
}

internal sealed class ServiceRequestNoteConfiguration : IEntityTypeConfiguration<ServiceRequestNote>
{
    public void Configure(EntityTypeBuilder<ServiceRequestNote> builder)
    {
        builder.ToTable("sr_notes", OpsSchema.Name);
        builder.Property(n => n.Body).HasMaxLength(2000);
    }
}

internal sealed class ServiceRequestAttachmentConfiguration : IEntityTypeConfiguration<ServiceRequestAttachment>
{
    public void Configure(EntityTypeBuilder<ServiceRequestAttachment> builder)
    {
        builder.ToTable("sr_attachments", OpsSchema.Name);
        builder.Property(a => a.StorageKey).HasMaxLength(300);
        builder.Property(a => a.ContentType).HasMaxLength(100);
        builder.Ignore(a => a.IsCustomerVisible);
    }
}

/// <summary>Registers the SR-number sequence (SR-10001, SR-10002, …).</summary>
internal sealed class OpsModelContributor : ServicePro.BuildingBlocks.Persistence.IModelContributor
{
    public void Configure(ModelBuilder modelBuilder) =>
        modelBuilder.HasSequence<long>(OpsSchema.SrNumberSequence, OpsSchema.Name).StartsAt(10001);
}

internal sealed class ReviewConfiguration : IEntityTypeConfiguration<Review>
{
    public void Configure(EntityTypeBuilder<Review> builder)
    {
        builder.ToTable("reviews", OpsSchema.Name);
        builder.Property(r => r.Comment).HasMaxLength(Review.MaxCommentLength);
        builder.HasIndex(r => r.ServiceRequestId).IsUnique();
        builder.HasIndex(r => new { r.TechnicianId, r.SubmittedAt });
    }
}
