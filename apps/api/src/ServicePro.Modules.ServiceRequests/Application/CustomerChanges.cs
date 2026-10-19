using FluentValidation;
using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Application;
using ServicePro.BuildingBlocks.Settings;
using ServicePro.Modules.ServiceRequests.Domain;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;

namespace ServicePro.Modules.ServiceRequests.Application;

/*
 * Customers cancel their own booking from "My bookings" (signed in, so a forwarded tracking link
 * can't do it). Allowed until the technician sets out, and optionally until a cut-off before the
 * visit. Customers don't pick or move visit times: the office agrees the date with them and sets
 * it. No cancellation fee: nothing is paid upfront, so there is nothing to charge it against.
 */

public static class CustomerChangeSettings
{
    public static readonly SettingDefinition<bool> CanCancel = new(
        "booking.customer_can_cancel",
        true,
        "Customers can cancel their own booking online until the technician sets out.");

    public static readonly SettingDefinition<int> CutoffMinutes = new(
        "booking.customer_change_cutoff_minutes",
        0,
        "Stop online cancelling this many minutes before the scheduled visit. 0 = allowed until the technician sets out.");
}

/// <summary>What the customer may do with one booking right now, under the current settings.</summary>
public sealed class CustomerChangePolicy(ISettingsStore settings, IClock clock)
{
    private (bool Cancel, int Cutoff)? _loaded;

    public async Task<bool> CanCancelAsync(ServiceRequest request, CancellationToken ct)
    {
        var (cancel, cutoff) = await LoadAsync(ct);
        return cancel && request.CustomerCanChange && !IsPastCutoff(request, cutoff);
    }

    /// <summary>The reason cancelling isn't allowed, in the customer's words; null when it is.</summary>
    public async Task<Error?> CheckCancelAsync(ServiceRequest request, CancellationToken ct)
    {
        var (cancel, cutoff) = await LoadAsync(ct);
        if (!cancel)
        {
            return Error.Conflict("booking.change_by_phone", "Please call us to cancel this booking.");
        }

        return IsPastCutoff(request, cutoff)
            ? Error.Conflict("booking.too_late_to_change", "Your visit is coming up soon, so this can't be changed online. Please call us.")
            : null;
    }

    private bool IsPastCutoff(ServiceRequest request, int cutoffMinutes) =>
        cutoffMinutes > 0 &&
        request.ScheduledStart is { } start &&
        clock.UtcNow > start.AddMinutes(-cutoffMinutes);

    private async Task<(bool Cancel, int Cutoff)> LoadAsync(CancellationToken ct) =>
        _loaded ??= (
            await settings.GetAsync(CustomerChangeSettings.CanCancel, ct),
            await settings.GetAsync(CustomerChangeSettings.CutoffMinutes, ct));
}

internal static class MyBookingLookup
{
    public static readonly Error NotFound = Error.NotFound("booking.not_found", "We couldn't find this booking in your account.");

    /// <summary>Only the signed-in customer's own booking: someone else's id looks like it doesn't exist.</summary>
    public static async Task<Result<ServiceRequest>> FindAsync(DbContext db, ICurrentUser currentUser, Guid id, CancellationToken ct)
    {
        if (currentUser.CustomerId is not { } customerId)
        {
            return Error.Unauthorized("account.not_signed_in", "Please sign in to manage your bookings.");
        }

        var request = await db.Set<ServiceRequest>().FirstOrDefaultAsync(s => s.Id == id && s.CustomerId == customerId, ct);
        return request is null ? NotFound : request;
    }
}

public sealed record CancelBookingRequest(string? Reason);

internal sealed class CancelBookingRequestValidator : AbstractValidator<CancelBookingRequest>
{
    public CancelBookingRequestValidator() => RuleFor(r => r.Reason).MaximumLength(300);
}

public sealed class CancelMyBooking(DbContext db, ICurrentUser currentUser, CustomerChangePolicy policy, IClock clock) : IUseCase
{
    public async Task<Result> HandleAsync(Guid id, CancelBookingRequest request, CancellationToken ct)
    {
        var booking = await MyBookingLookup.FindAsync(db, currentUser, id, ct);
        if (booking.IsFailure)
        {
            return booking.Error!;
        }

        if (await policy.CheckCancelAsync(booking.Value, ct) is { } refused)
        {
            return refused;
        }

        var cancelled = booking.Value.CancelByCustomer(request.Reason, clock.UtcNow);
        if (cancelled.IsFailure)
        {
            return cancelled;
        }

        await db.SaveChangesAsync(ct);
        return Result.Success();
    }
}
