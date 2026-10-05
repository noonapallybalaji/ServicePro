using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ServicePro.BuildingBlocks.Messaging;

/// <summary>A domain event waiting to be delivered (PLAN.md §7.11 `outbox_messages`).</summary>
public sealed class OutboxMessage
{
    public Guid Id { get; init; } = Guid.CreateVersion7();

    public Guid TenantId { get; init; }

    public required string Type { get; init; }

    public required string Payload { get; init; }

    public DateTimeOffset OccurredAt { get; init; }

    public DateTimeOffset? ProcessedAt { get; set; }

    public DateTimeOffset? LeaseUntil { get; set; }

    public DateTimeOffset? NextAttemptAt { get; set; }

    public DateTimeOffset? DeadAt { get; set; }

    public int Attempts { get; set; }

    public string? LastError { get; set; }
}

/// <summary>Records that a handler already processed a message, making re-delivery harmless.</summary>
public sealed class OutboxConsumer
{
    public Guid MessageId { get; init; }

    public required string Handler { get; init; }

    public DateTimeOffset ProcessedAt { get; init; }
}

internal sealed class OutboxMessageConfiguration : IEntityTypeConfiguration<OutboxMessage>
{
    public void Configure(EntityTypeBuilder<OutboxMessage> builder)
    {
        builder.ToTable("outbox_messages", "platform");
        builder.HasKey(m => m.Id);
        builder.Property(m => m.Type).HasMaxLength(300);
        builder.Property(m => m.Payload).HasColumnType("jsonb");
        builder.HasIndex(m => m.OccurredAt)
            .HasFilter("processed_at IS NULL AND dead_at IS NULL")
            .HasDatabaseName("ix_outbox_messages_pending");
    }
}

internal sealed class OutboxConsumerConfiguration : IEntityTypeConfiguration<OutboxConsumer>
{
    public void Configure(EntityTypeBuilder<OutboxConsumer> builder)
    {
        builder.ToTable("outbox_consumers", "platform");
        builder.HasKey(c => new { c.MessageId, c.Handler });
        builder.Property(c => c.Handler).HasMaxLength(300);
    }
}
