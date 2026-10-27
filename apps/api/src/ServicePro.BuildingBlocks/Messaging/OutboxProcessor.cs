using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ServicePro.BuildingBlocks.Persistence;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Domain;

namespace ServicePro.BuildingBlocks.Messaging;

public sealed class OutboxOptions
{
    public TimeSpan PollInterval { get; set; } = TimeSpan.FromSeconds(1);

    public int BatchSize { get; set; } = 20;

    public int MaxAttempts { get; set; } = 10;

    public TimeSpan Lease { get; set; } = TimeSpan.FromMinutes(1);
}

/// <summary>
/// Delivers outbox messages to every registered handler (ADR 0004).
/// Messages are leased with FOR UPDATE SKIP LOCKED, so several API instances can run it.
/// Each handler runs in its own scope and transaction; success is recorded per handler,
/// so a retry never re-runs a handler that already succeeded.
/// </summary>
public sealed partial class OutboxProcessor(
    IServiceScopeFactory scopeFactory,
    EventHandlerRegistry registry,
    IClock clock,
    IOptions<OutboxOptions> options,
    ILogger<OutboxProcessor> logger) : BackgroundService
{
    private readonly OutboxOptions _options = options.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var processed = 0;
            try
            {
                processed = await ProcessBatchAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                LogBatchFailed(ex);
            }

            if (processed == 0)
            {
                await Task.Delay(_options.PollInterval, stoppingToken);
            }
        }
    }

    /// <summary>Processes one batch. Public so tests can drive delivery deterministically.</summary>
    public async Task<int> ProcessBatchAsync(CancellationToken ct)
    {
        var batch = await LeaseBatchAsync(ct);
        foreach (var message in batch)
        {
            await DeliverAsync(message, ct);
        }

        return batch.Count;
    }

    private async Task<IReadOnlyList<OutboxMessage>> LeaseBatchAsync(CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<DbContext>();
        var now = clock.UtcNow;

        var leased = await db.Set<OutboxMessage>()
            .FromSqlInterpolated($"""
                UPDATE platform.outbox_messages
                   SET lease_until = {now + _options.Lease}
                 WHERE id IN (
                       SELECT id FROM platform.outbox_messages
                        WHERE processed_at IS NULL
                          AND dead_at IS NULL
                          AND (next_attempt_at IS NULL OR next_attempt_at <= {now})
                          AND (lease_until IS NULL OR lease_until < {now})
                        ORDER BY sequence
                        LIMIT {_options.BatchSize}
                        FOR UPDATE SKIP LOCKED)
                RETURNING *
                """)
            .AsNoTracking()
            .ToListAsync(ct);

        // RETURNING doesn't keep the inner ORDER BY: put the batch back in log order.
        return [.. leased.OrderBy(m => m.Sequence)];
    }

    private async Task DeliverAsync(OutboxMessage message, CancellationToken ct)
    {
        var eventType = registry.ResolveEventType(message.Type);
        var domainEvent = eventType is null ? null : EventSerializer.Deserialize(message.Payload, eventType);

        if (eventType is null || domainEvent is null)
        {
            await MarkFailedAsync(message, $"Unknown event type '{message.Type}'.", dead: true, ct);
            return;
        }

        string? error = null;
        foreach (var handlerType in registry.HandlersFor(eventType))
        {
            try
            {
                await RunHandlerAsync(message, handlerType, domainEvent, ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                error = $"{handlerType.Name}: {ex.Message}";
                LogHandlerFailed(ex, handlerType.Name, message.Id);
            }
        }

        if (error is null)
        {
            await MarkProcessedAsync(message, ct);
        }
        else
        {
            await MarkFailedAsync(message, error, dead: message.Attempts + 1 >= _options.MaxAttempts, ct);
        }
    }

    private async Task RunHandlerAsync(OutboxMessage message, Type handlerType, IDomainEvent domainEvent, CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        scope.ServiceProvider.GetRequiredService<TenantScope>().Use(message.TenantId);
        var db = scope.ServiceProvider.GetRequiredService<DbContext>();
        var handlerName = handlerType.FullName ?? handlerType.Name;

        var alreadyHandled = await db.Set<OutboxConsumer>()
            .AnyAsync(c => c.MessageId == message.Id && c.Handler == handlerName, ct);
        if (alreadyHandled)
        {
            return;
        }

        var handler = scope.ServiceProvider.GetRequiredService(handlerType);
        await EventDispatch.InvokeAsync(handler, domainEvent, ct);

        db.Set<OutboxConsumer>().Add(new OutboxConsumer
        {
            MessageId = message.Id,
            Handler = handlerName,
            ProcessedAt = clock.UtcNow,
        });
        await db.SaveChangesAsync(ct);
    }

    private async Task MarkProcessedAsync(OutboxMessage message, CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<DbContext>();
        var now = clock.UtcNow;
        await db.Set<OutboxMessage>()
            .Where(m => m.Id == message.Id)
            .ExecuteUpdateAsync(set => set
                .SetProperty(m => m.ProcessedAt, now)
                .SetProperty(m => m.LeaseUntil, (DateTimeOffset?)null), ct);
    }

    private async Task MarkFailedAsync(OutboxMessage message, string error, bool dead, CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<DbContext>();
        var attempts = message.Attempts + 1;
        var now = clock.UtcNow;
        var nextAttempt = now + TimeSpan.FromSeconds(Math.Min(300, Math.Pow(2, attempts)));
        DateTimeOffset? deadAt = dead ? now : null;

        await db.Set<OutboxMessage>()
            .Where(m => m.Id == message.Id)
            .ExecuteUpdateAsync(set => set
                .SetProperty(m => m.Attempts, attempts)
                .SetProperty(m => m.LastError, error.Length > 2000 ? error[..2000] : error)
                .SetProperty(m => m.NextAttemptAt, nextAttempt)
                .SetProperty(m => m.DeadAt, deadAt)
                .SetProperty(m => m.LeaseUntil, (DateTimeOffset?)null), ct);

        if (dead)
        {
            LogMessageDead(message.Id, message.Type, error);
        }
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Outbox batch failed")]
    private partial void LogBatchFailed(Exception ex);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Outbox handler {Handler} failed for message {MessageId}")]
    private partial void LogHandlerFailed(Exception ex, string handler, Guid messageId);

    [LoggerMessage(Level = LogLevel.Error, Message = "Outbox message {MessageId} ({Type}) is dead: {Error}")]
    private partial void LogMessageDead(Guid messageId, string type, string error);
}

/// <summary>Calls IEventHandler&lt;T&gt;.HandleAsync for a runtime event type.</summary>
internal static class EventDispatch
{
    public static Task InvokeAsync(object handler, IDomainEvent domainEvent, CancellationToken ct)
    {
        var method = typeof(IEventHandler<>)
            .MakeGenericType(domainEvent.GetType())
            .GetMethod(nameof(IEventHandler<IDomainEvent>.HandleAsync))!;
        return (Task)method.Invoke(handler, [domainEvent, ct])!;
    }
}
