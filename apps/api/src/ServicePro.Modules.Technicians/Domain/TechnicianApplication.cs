using ServicePro.Contracts.Events;
using ServicePro.SharedKernel.Domain;
using ServicePro.SharedKernel.Results;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.Modules.Technicians.Domain;

public enum TechnicianApplicationStatus
{
    /// <summary>Waiting for the office to review it.</summary>
    Pending,

    /// <summary>The office approved it: the technician exists and can sign in with this number.</summary>
    Approved,

    /// <summary>The office turned it down (with a reason).</summary>
    Rejected,
}

/// <summary>The photos an applicant adds for review (stored privately; only the office opens them).</summary>
public enum ApplicantDocumentKind
{
    /// <summary>A clear photo of their face: shown to customers once they're a partner.</summary>
    ProfilePhoto,

    AadhaarFront,

    AadhaarBack,

    PanCard,
}

/// <summary>
/// A technician asking to join from the partner app ("Join as a partner"). The office reviews it;
/// approving creates the technician, who then signs in with this mobile number as usual.
/// </summary>
public sealed class TechnicianApplication : TenantOwnedAggregateRoot
{
    private TechnicianApplication()
    {
    }

    public string FullName { get; private set; } = string.Empty;

    public PhoneNumber Phone { get; private set; } = null!;

    public string Pincode { get; private set; } = string.Empty;

    /// <summary>Where they live or work, as they described it (shown to the office).</summary>
    public string? Locality { get; private set; }

    /// <summary>The appliances (service categories) they repair.</summary>
    public List<Guid> CategoryIds { get; private set; } = [];

    public int ExperienceYears { get; private set; }

    public string? About { get; private set; }

    /// <summary>House or flat, street: where they live (the PIN code and locality complete it).</summary>
    public string? AddressLine { get; private set; }

    public DateOnly? DateOfBirth { get; private set; }

    /// <summary>Only the last four digits are kept; the card photo carries the full number for review.</summary>
    public string? AadhaarLast4 { get; private set; }

    public string? Pan { get; private set; }

    public string? ProfilePhotoKey { get; private set; }

    public string? AadhaarFrontKey { get; private set; }

    public string? AadhaarBackKey { get; private set; }

    public string? PanCardKey { get; private set; }

    public TechnicianApplicationStatus Status { get; private set; }

    public DateTimeOffset? ReviewedAt { get; private set; }

    public Guid? ReviewedByUserId { get; private set; }

    public string? RejectionReason { get; private set; }

    /// <summary>The technician created on approval.</summary>
    public Guid? TechnicianId { get; private set; }

    public static TechnicianApplication Submit(ApplicantDetails details, IEnumerable<Guid> categoryIds, int experienceYears, string? about) =>
        new()
        {
            FullName = details.FullName.Trim(),
            Phone = details.Phone,
            DateOfBirth = details.DateOfBirth,
            AddressLine = details.AddressLine.Trim(),
            Pincode = details.Pincode.Trim(),
            Locality = string.IsNullOrWhiteSpace(details.Locality) ? null : details.Locality.Trim(),
            AadhaarLast4 = details.AadhaarLast4,
            Pan = details.Pan,
            ProfilePhotoKey = details.Documents.GetValueOrDefault(ApplicantDocumentKind.ProfilePhoto),
            AadhaarFrontKey = details.Documents.GetValueOrDefault(ApplicantDocumentKind.AadhaarFront),
            AadhaarBackKey = details.Documents.GetValueOrDefault(ApplicantDocumentKind.AadhaarBack),
            PanCardKey = details.Documents.GetValueOrDefault(ApplicantDocumentKind.PanCard),
            CategoryIds = [.. categoryIds.Distinct()],
            ExperienceYears = experienceYears,
            About = string.IsNullOrWhiteSpace(about) ? null : about.Trim(),
            Status = TechnicianApplicationStatus.Pending,
        };

    /// <summary>The storage key of an uploaded document, if they added it.</summary>
    public string? DocumentKey(ApplicantDocumentKind kind) => kind switch
    {
        ApplicantDocumentKind.ProfilePhoto => ProfilePhotoKey,
        ApplicantDocumentKind.AadhaarFront => AadhaarFrontKey,
        ApplicantDocumentKind.AadhaarBack => AadhaarBackKey,
        ApplicantDocumentKind.PanCard => PanCardKey,
        _ => null,
    };

    public Result Approve(Guid technicianId, Guid? reviewerId, DateTimeOffset now)
    {
        if (Status != TechnicianApplicationStatus.Pending)
        {
            return TechnicianApplicationErrors.AlreadyReviewed;
        }

        Status = TechnicianApplicationStatus.Approved;
        TechnicianId = technicianId;
        ReviewedByUserId = reviewerId;
        ReviewedAt = now;
        Raise(new TechnicianApplicationApproved(Id, technicianId, FullName, Phone.Value));
        return Result.Success();
    }

    public Result Reject(string reason, Guid? reviewerId, DateTimeOffset now)
    {
        if (Status != TechnicianApplicationStatus.Pending)
        {
            return TechnicianApplicationErrors.AlreadyReviewed;
        }

        Status = TechnicianApplicationStatus.Rejected;
        RejectionReason = reason.Trim();
        ReviewedByUserId = reviewerId;
        ReviewedAt = now;
        return Result.Success();
    }
}

/// <summary>Who is applying: identity, address and the documents they uploaded (storage keys by kind).</summary>
public sealed record ApplicantDetails(
    string FullName,
    PhoneNumber Phone,
    DateOnly DateOfBirth,
    string AddressLine,
    string Pincode,
    string? Locality,
    string AadhaarLast4,
    string? Pan,
    IReadOnlyDictionary<ApplicantDocumentKind, string> Documents);

public static class TechnicianApplicationErrors
{
    public static readonly Error NotFound = Error.NotFound("application.not_found", "That application doesn't exist.");

    public static readonly Error AlreadyReviewed = Error.Conflict("application.already_reviewed", "This application has already been reviewed.");

    public static readonly Error AlreadyPartner =
        Error.Conflict("application.already_partner", "This number already has a partner account. Sign in with it instead.");

    public static readonly Error PhoneUnverified =
        Error.Validation("application.phone_unverified", "Verify your mobile number with the code we send, then send the application.");

    public static readonly Error DocumentMissing =
        Error.Validation("application.documents_missing", "Add your profile photo and the front of your Aadhaar card.");

    public static readonly Error DocumentInvalid =
        Error.Validation("application.document_invalid", "That upload has expired or isn't yours. Add the photo again.");

    public static readonly Error UnknownCategory = Error.Validation("application.category_invalid", "Choose the appliances you repair from the list.");
}
