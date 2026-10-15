using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Application;
using ServicePro.BuildingBlocks.Storage;
using ServicePro.Contracts;
using ServicePro.Modules.ServiceRequests.Domain;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;

namespace ServicePro.Modules.ServiceRequests.Application;

/// <summary>
/// Photos of the problem from the customer (at booking, or later from "My bookings"), so the
/// technician can see it and bring the right parts. Photos only, a few per job, before the work is done.
/// </summary>
public sealed class AddMyBookingPhoto(DbContext db, ICurrentUser currentUser, IFileStorage storage) : IUseCase
{
    public const int MaxPhotos = 5;
    public const long MaxBytes = 10 * 1024 * 1024;

    private static readonly Dictionary<string, string> Images = new(StringComparer.OrdinalIgnoreCase)
    {
        ["image/jpeg"] = "jpg",
        ["image/png"] = "png",
        ["image/webp"] = "webp",
    };

    public async Task<Result<int>> HandleAsync(Guid id, Stream content, string contentType, long length, CancellationToken ct)
    {
        if (!Images.TryGetValue(contentType, out var extension) || length is 0 or > MaxBytes)
        {
            return Error.Validation("photo.invalid", "Add a photo (JPG, PNG or WebP) under 10 MB.");
        }

        var lookup = await MyBookingLookup.FindAsync(db, currentUser, id, ct);
        if (lookup.IsFailure)
        {
            return lookup.Error!;
        }

        var booking = await db.Set<ServiceRequest>().Include(s => s.Attachments).FirstAsync(s => s.Id == id, ct);
        if (ServiceRequestWorkflow.Terminal.Contains(booking.Status) || booking.Status == ServiceRequestStatus.Completed)
        {
            return Error.Conflict("photo.too_late", "This job is finished, so photos can't be added. Ask us in Help if something is wrong.");
        }

        var count = booking.Attachments.Count(a => a.UploadedByType == ActorType.Customer);
        if (count >= MaxPhotos)
        {
            return Error.Conflict("photo.limit", $"You can add up to {MaxPhotos} photos to a booking.");
        }

        var key = await storage.SaveAsync(content, $"service-requests/{booking.Id:N}", extension, ct);
        booking.AddAttachment(AttachmentKind.PhotoIssue, key, contentType.ToLowerInvariant(), length, Actor.Customer);
        await db.SaveChangesAsync(ct);
        return count + 1;
    }
}
