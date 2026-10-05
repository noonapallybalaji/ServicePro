using ServicePro.Contracts;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Domain;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.Modules.ServiceRequests.Domain;

/// <summary>Append-only status log (PLAN.md §7.7 `service_status_history`).</summary>
public sealed class StatusHistoryEntry : Entity
{
    private StatusHistoryEntry()
    {
    }

    internal StatusHistoryEntry(
        Guid serviceRequestId,
        ServiceRequestStatus from,
        ServiceRequestStatus to,
        string? reasonCode,
        string? note,
        Actor actor,
        GeoLocation? location,
        DateTimeOffset occurredAt)
    {
        ServiceRequestId = serviceRequestId;
        FromStatus = from;
        ToStatus = to;
        ReasonCode = reasonCode;
        Note = note;
        ActorType = actor.Type;
        ActorUserId = actor.UserId;
        Latitude = location?.Latitude;
        Longitude = location?.Longitude;
        OccurredAt = occurredAt;
    }

    public Guid ServiceRequestId { get; private set; }

    public ServiceRequestStatus FromStatus { get; private set; }

    public ServiceRequestStatus ToStatus { get; private set; }

    public string? ReasonCode { get; private set; }

    public string? Note { get; private set; }

    public ActorType ActorType { get; private set; }

    public Guid? ActorUserId { get; private set; }

    /// <summary>Where the technician was when they updated the status.</summary>
    public double? Latitude { get; private set; }

    public double? Longitude { get; private set; }

    public DateTimeOffset OccurredAt { get; private set; }
}

public enum NoteVisibility
{
    /// <summary>Staff and the assigned technician only.</summary>
    Internal,

    /// <summary>Also shown to the customer on the tracking page.</summary>
    Customer,
}

public sealed class ServiceRequestNote : Entity
{
    private ServiceRequestNote()
    {
    }

    internal ServiceRequestNote(Guid serviceRequestId, string body, NoteVisibility visibility, Actor actor)
    {
        ServiceRequestId = serviceRequestId;
        Body = body.Trim();
        Visibility = visibility;
        AuthorType = actor.Type;
        AuthorUserId = actor.UserId;
    }

    public Guid ServiceRequestId { get; private set; }

    public string Body { get; private set; } = string.Empty;

    public NoteVisibility Visibility { get; private set; }

    public ActorType AuthorType { get; private set; }

    public Guid? AuthorUserId { get; private set; }
}

/// <summary>PLAN.md §7.7 `sr_attachments.kind`.</summary>
public enum AttachmentKind
{
    PhotoBefore,
    PhotoAfter,
    PhotoIssue,
    VoiceNote,
    Document,
}

public sealed class ServiceRequestAttachment : Entity
{
    private ServiceRequestAttachment()
    {
    }

    internal ServiceRequestAttachment(Guid serviceRequestId, AttachmentKind kind, string storageKey, string contentType, long sizeBytes, Actor actor)
    {
        ServiceRequestId = serviceRequestId;
        Kind = kind;
        StorageKey = storageKey;
        ContentType = contentType;
        SizeBytes = sizeBytes;
        UploadedByType = actor.Type;
        UploadedByUserId = actor.UserId;
    }

    public Guid ServiceRequestId { get; private set; }

    public AttachmentKind Kind { get; private set; }

    public string StorageKey { get; private set; } = string.Empty;

    public string ContentType { get; private set; } = string.Empty;

    public long SizeBytes { get; private set; }

    public ActorType UploadedByType { get; private set; }

    public Guid? UploadedByUserId { get; private set; }

    /// <summary>Photos documenting the work may be shown to the customer.</summary>
    public bool IsCustomerVisible => Kind is AttachmentKind.PhotoBefore or AttachmentKind.PhotoAfter;
}
