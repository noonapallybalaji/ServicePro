using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Application;
using ServicePro.BuildingBlocks.Storage;
using ServicePro.Modules.Support.Domain;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;

namespace ServicePro.Modules.Support.Application;

/// <summary>A photo on a support request, as staff see it.</summary>
public sealed record TicketPhotoResponse(Guid Id, string ContentType, long SizeBytes, DateTimeOffset AddedAt, string Url);

/// <summary>The customer adds a photo to their own help request (damage, an error code, the bill...).</summary>
public sealed class AddTicketPhoto(DbContext db, ICurrentUser currentUser, IFileStorage storage, IClock clock) : IUseCase
{
    public const long MaxBytes = 10 * 1024 * 1024;

    private static readonly Dictionary<string, string> Images = new(StringComparer.OrdinalIgnoreCase)
    {
        ["image/jpeg"] = "jpg",
        ["image/png"] = "png",
        ["image/webp"] = "webp",
    };

    public async Task<Result<int>> HandleAsync(string number, Stream content, string contentType, long length, CancellationToken ct)
    {
        if (!Images.TryGetValue(contentType, out var extension) || length is 0 or > MaxBytes)
        {
            return Error.Validation("photo.invalid", "Add a photo (JPG, PNG or WebP) under 10 MB.");
        }

        var ticket = await MyTickets.FindAsync(db, currentUser, number, track: true, ct);
        if (ticket.IsFailure)
        {
            return ticket.Error!;
        }

        await db.Entry(ticket.Value).Collection(t => t.Photos).LoadAsync(ct);
        if (ticket.Value.Photos.Count >= SupportTicket.MaxPhotos)
        {
            return Error.Conflict("support.photo_limit", $"You can add up to {SupportTicket.MaxPhotos} photos to a request.");
        }

        var key = await storage.SaveAsync(content, $"support/{ticket.Value.Id:N}", extension, ct);
        var added = ticket.Value.AddPhoto(key, contentType.ToLowerInvariant(), length, clock.UtcNow);
        if (added.IsFailure)
        {
            return added.Error!;
        }

        await db.SaveChangesAsync(ct);
        return ticket.Value.Photos.Count;
    }
}

public sealed record TicketPhotoContent(Stream Content, string ContentType);

/// <summary>Staff open a photo on a support request.</summary>
public sealed class OpenTicketPhoto(DbContext db, IFileStorage storage) : IUseCase
{
    public async Task<Result<TicketPhotoContent>> HandleAsync(Guid ticketId, Guid photoId, CancellationToken ct)
    {
        var photo = await db.Set<TicketPhoto>().AsNoTracking().FirstOrDefaultAsync(p => p.Id == photoId && p.TicketId == ticketId, ct);
        var stream = photo is null ? null : await storage.OpenReadAsync(photo.StorageKey, ct);
        return stream is null ? SupportErrors.NotFound : new TicketPhotoContent(stream, photo!.ContentType);
    }
}
