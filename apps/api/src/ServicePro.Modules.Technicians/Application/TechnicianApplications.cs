using System.Text.RegularExpressions;
using FluentValidation;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Application;
using ServicePro.BuildingBlocks.Persistence;
using ServicePro.BuildingBlocks.Storage;
using ServicePro.Contracts;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.Technicians.Domain;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.Modules.Technicians.Application;

/*
 * "Join as a partner": a technician applies from the partner app, the office reviews it and approves
 * (creating the technician) or turns it down. The applicant first proves they hold the mobile number
 * with a one-time code; that gives a verification proof, valid for an hour, which the application
 * must carry (the code itself lasts only minutes, and the form has a few more steps). The same
 * proof lets them upload their documents (profile photo, Aadhaar, PAN) and, after signing in with a
 * code while the application is open, see where their application stands.
 */

// ── DTOs ────────────────────────────────────────────────────────────────────

/// <summary>
/// A partner application. VerificationToken comes from verifying the phone number; Documents are the
/// tokens returned by the document uploads. Only the last four Aadhaar digits are stored. Website is a
/// hidden form field: people leave it empty, bots fill it in.
/// </summary>
public sealed record SubmitTechnicianApplicationRequest(
    string FullName,
    string Phone,
    string Pincode,
    string? Locality,
    IReadOnlyList<Guid> CategoryIds,
    int ExperienceYears,
    string? About,
    string? VerificationToken = null,
    DateOnly? DateOfBirth = null,
    string? AddressLine = null,
    string? AadhaarNumber = null,
    string? Pan = null,
    IReadOnlyList<string>? Documents = null,
    string? Website = null);

public sealed record PartnerCodeRequest(string Phone);

public sealed record PartnerCodeResponse(DateTimeOffset ExpiresAt, int CodeLength, string? DevelopmentCode);

public sealed record PartnerVerifyRequest(string Phone, string Code);

/// <summary>HasPendingApplication: this number already applied and is waiting for review (show the status instead).</summary>
public sealed record PartnerVerifiedResponse(string VerificationToken, DateTimeOffset ExpiresAt, bool HasPendingApplication);

/// <summary>An uploaded document: the token goes into the application's Documents.</summary>
public sealed record ApplicantDocumentUploaded(ApplicantDocumentKind Kind, string Token);

public sealed record PartnerApplicationStatusRequest(string Phone, string VerificationToken);

/// <summary>Where an applicant's latest application stands, for their own status page.</summary>
public sealed record PartnerApplicationStatusResponse(
    Guid Id,
    string FullName,
    TechnicianApplicationStatus Status,
    DateTimeOffset SubmittedAt,
    DateTimeOffset? ReviewedAt,
    string? RejectionReason);

public sealed record ApplicantDocumentResponse(ApplicantDocumentKind Kind, string Url);

public sealed record TechnicianApplicationReceived(Guid Id, TechnicianApplicationStatus Status, bool AlreadyApplied);

public sealed record TechnicianApplicationResponse(
    Guid Id,
    string FullName,
    string Phone,
    string Pincode,
    string? Locality,
    IReadOnlyList<string> Appliances,
    int ExperienceYears,
    string? About,
    DateOnly? DateOfBirth,
    string? AddressLine,
    string? AadhaarLast4,
    string? Pan,
    IReadOnlyList<ApplicantDocumentResponse> Documents,
    TechnicianApplicationStatus Status,
    bool InServiceArea,
    DateTimeOffset SubmittedAt,
    DateTimeOffset? ReviewedAt,
    string? RejectionReason,
    Guid? TechnicianId);

public sealed record RejectTechnicianApplicationRequest(string Reason);

internal sealed class SubmitTechnicianApplicationRequestValidator : AbstractValidator<SubmitTechnicianApplicationRequest>
{
    public SubmitTechnicianApplicationRequestValidator()
    {
        RuleFor(r => r.FullName).NotEmpty().WithMessage("Enter your full name.").MaximumLength(200);
        RuleFor(r => r.Phone).NotEmpty().WithMessage("Enter your mobile number.");
        RuleFor(r => r.Pincode).Matches("^[1-9][0-9]{5}$").WithMessage("Enter your 6-digit PIN code.");
        RuleFor(r => r.Locality).MaximumLength(200);
        RuleFor(r => r.CategoryIds).NotEmpty().WithMessage("Choose at least one appliance you repair.")
            .Must(ids => ids.Count <= 20).WithMessage("Choose the appliances you repair from the list.");
        RuleFor(r => r.ExperienceYears).InclusiveBetween(0, 60).WithMessage("Years of experience should be between 0 and 60.");
        RuleFor(r => r.About).MaximumLength(1000);

        // A bot's submission (hidden field filled) is dropped quietly, so it isn't told what's missing.
        When(r => string.IsNullOrEmpty(r.Website), () =>
        {
            RuleFor(r => r.DateOfBirth).NotNull().WithMessage("Enter your date of birth.");
            RuleFor(r => r.AddressLine).NotEmpty().WithMessage("Enter your house number and street.").MaximumLength(300);
            RuleFor(r => r.AadhaarNumber).Must(IndianIds.IsAadhaar).WithMessage("Enter the 12-digit number on your Aadhaar card.");
            RuleFor(r => r.Pan).Must(pan => pan is null || IndianIds.IsPan(pan)).WithMessage("Enter the PAN as on the card, like ABCDE1234F.");
        });
    }
}

/// <summary>Checks on Indian ID numbers.</summary>
public static partial class IndianIds
{
    // Verhoeff checksum tables (UIDAI uses it for the last Aadhaar digit).
    private static readonly int[,] Multiply =
    {
        { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 }, { 1, 2, 3, 4, 0, 6, 7, 8, 9, 5 }, { 2, 3, 4, 0, 1, 7, 8, 9, 5, 6 },
        { 3, 4, 0, 1, 2, 8, 9, 5, 6, 7 }, { 4, 0, 1, 2, 3, 9, 5, 6, 7, 8 }, { 5, 9, 8, 7, 6, 0, 4, 3, 2, 1 },
        { 6, 5, 9, 8, 7, 1, 0, 4, 3, 2 }, { 7, 6, 5, 9, 8, 2, 1, 0, 4, 3 }, { 8, 7, 6, 5, 9, 3, 2, 1, 0, 4 },
        { 9, 8, 7, 6, 5, 4, 3, 2, 1, 0 },
    };

    private static readonly int[,] Permute =
    {
        { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 }, { 1, 5, 7, 6, 2, 8, 3, 0, 9, 4 }, { 5, 8, 0, 3, 7, 9, 6, 1, 4, 2 },
        { 8, 9, 1, 6, 0, 4, 3, 5, 2, 7 }, { 9, 4, 5, 3, 1, 2, 6, 8, 7, 0 }, { 4, 2, 8, 6, 5, 7, 3, 9, 0, 1 },
        { 2, 7, 9, 3, 8, 0, 6, 4, 1, 5 }, { 7, 0, 4, 6, 9, 1, 3, 2, 5, 8 },
    };

    /// <summary>"2345 6789 0124" → "234567890124".</summary>
    public static string Digits(string? raw) => string.Concat((raw ?? string.Empty).Where(char.IsAsciiDigit));

    /// <summary>12 digits (spaces and dashes allowed), not starting with 0 or 1, with a valid Verhoeff check digit.</summary>
    public static bool IsAadhaar(string? raw)
    {
        var digits = Digits(raw);
        if (digits.Length != 12 || digits[0] is '0' or '1' || raw!.Any(c => !char.IsAsciiDigit(c) && c is not (' ' or '-')))
        {
            return false;
        }

        var check = 0;
        for (var i = 0; i < digits.Length; i++)
        {
            check = Multiply[check, Permute[i % 8, digits[digits.Length - 1 - i] - '0']];
        }

        return check == 0;
    }

    public static bool IsPan(string raw) => PanPattern().IsMatch(raw.Trim().ToUpperInvariant());

    [GeneratedRegex("^[A-Z]{5}[0-9]{4}[A-Z]$")]
    private static partial Regex PanPattern();
}

internal sealed class RejectTechnicianApplicationRequestValidator : AbstractValidator<RejectTechnicianApplicationRequest>
{
    public RejectTechnicianApplicationRequestValidator() =>
        RuleFor(r => r.Reason).NotEmpty().WithMessage("Say why, so the office has a record.").MaximumLength(500);
}

// ── Phone verification ─────────────────────────────────────────────────────

/// <summary>The signed proof that a number was verified: names the number, expires after an hour.</summary>
public sealed class PartnerPhoneProof(IDataProtectionProvider protection, IClock clock)
{
    public static readonly TimeSpan ValidFor = TimeSpan.FromHours(1);

    private readonly ITimeLimitedDataProtector _protector =
        protection.CreateProtector("Technicians.PartnerApplication.VerifiedPhone").ToTimeLimitedDataProtector();

    public (string Token, DateTimeOffset ExpiresAt) Issue(PhoneNumber phone)
    {
        var expires = clock.UtcNow.Add(ValidFor);
        return (_protector.Protect(phone.Value, expires), expires);
    }

    /// <summary>True when the token is genuine, unexpired and for this number.</summary>
    public bool Proves(string? token, PhoneNumber phone)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return false;
        }

        try
        {
            return _protector.Unprotect(token, out _) == phone.Value;
        }
        catch (System.Security.Cryptography.CryptographicException)
        {
            return false; // tampered with, or expired
        }
    }
}

/// <summary>
/// An uploaded document, signed: the number it was uploaded for, the kind and where it's stored. Valid a
/// day, so an application finished later the same day still carries it.
/// </summary>
public sealed class ApplicantDocumentPass(IDataProtectionProvider protection)
{
    private static readonly TimeSpan ValidFor = TimeSpan.FromDays(1);

    private readonly ITimeLimitedDataProtector _protector =
        protection.CreateProtector("Technicians.PartnerApplication.Document").ToTimeLimitedDataProtector();

    public string Issue(PhoneNumber phone, ApplicantDocumentKind kind, string storageKey) =>
        _protector.Protect($"{phone.Value}|{kind}|{storageKey}", ValidFor);

    /// <summary>The kind and storage key, when the token is genuine, unexpired and for this number.</summary>
    public (ApplicantDocumentKind Kind, string Key)? Read(string token, PhoneNumber phone)
    {
        try
        {
            var parts = _protector.Unprotect(token, out _).Split('|', 3);
            return parts.Length == 3 && parts[0] == phone.Value && Enum.TryParse<ApplicantDocumentKind>(parts[1], out var kind)
                ? (kind, parts[2])
                : null;
        }
        catch (System.Security.Cryptography.CryptographicException)
        {
            return null;
        }
    }
}

/// <summary>Sends a code to the applicant's number. An existing partner is told to sign in instead.</summary>
public sealed class RequestPartnerCode(DbContext db, IPhoneVerification verification) : IUseCase
{
    public async Task<Result<PartnerCodeResponse>> HandleAsync(PartnerCodeRequest request, CancellationToken ct)
    {
        var phone = PhoneNumber.Create(request.Phone);
        if (phone.IsFailure)
        {
            return phone.Error!;
        }

        if (await db.Set<Technician>().IgnoreQueryFilters().AnyAsync(t => t.Phone == phone.Value, ct))
        {
            return TechnicianApplicationErrors.AlreadyPartner;
        }

        var issued = await verification.IssueAsync(phone.Value, OtpPurpose.PartnerApplication, ct);
        if (issued.IsFailure)
        {
            return issued.Error!;
        }

        await db.SaveChangesAsync(ct);
        return new PartnerCodeResponse(issued.Value.ExpiresAt, issued.Value.CodeLength, issued.Value.DevelopmentCode);
    }
}

/// <summary>Checks the code; on success returns the verification proof the application must carry.</summary>
public sealed class VerifyPartnerPhone(DbContext db, IPhoneVerification verification, PartnerPhoneProof proof) : IUseCase
{
    public async Task<Result<PartnerVerifiedResponse>> HandleAsync(PartnerVerifyRequest request, CancellationToken ct)
    {
        var phone = PhoneNumber.Create(request.Phone);
        if (phone.IsFailure)
        {
            return phone.Error!;
        }

        var verified = await verification.VerifyAsync(phone.Value, OtpPurpose.PartnerApplication, request.Code, ct);
        await db.SaveChangesAsync(ct); // wrong attempts count too
        if (verified.IsFailure)
        {
            return verified.Error!;
        }

        var (token, expiresAt) = proof.Issue(phone.Value);
        var pending = await db.Set<TechnicianApplication>()
            .AnyAsync(a => a.Phone == phone.Value && a.Status == TechnicianApplicationStatus.Pending, ct);
        return new PartnerVerifiedResponse(token, expiresAt, pending);
    }
}

/// <summary>
/// The applicant uploads a document (needs the verified-number proof). Returns a token the application
/// carries; nothing is stored against the application until it's sent.
/// </summary>
public sealed class UploadApplicantDocument(IFileStorage storage, PartnerPhoneProof proof, ApplicantDocumentPass pass) : IUseCase
{
    public const long MaxBytes = 8 * 1024 * 1024;

    private static readonly Dictionary<string, string> Types = new(StringComparer.OrdinalIgnoreCase)
    {
        ["image/jpeg"] = "jpg",
        ["image/png"] = "png",
        ["image/webp"] = "webp",
        ["application/pdf"] = "pdf",
    };

    public async Task<Result<ApplicantDocumentUploaded>> HandleAsync(
        string phoneText, string? verificationToken, ApplicantDocumentKind kind, Stream content, string contentType, long length, CancellationToken ct)
    {
        var phone = PhoneNumber.Create(phoneText);
        if (phone.IsFailure)
        {
            return phone.Error!;
        }

        if (!proof.Proves(verificationToken, phone.Value))
        {
            return TechnicianApplicationErrors.PhoneUnverified;
        }

        // The profile photo is shown in the app, so it must be an image; ID cards may also be a PDF (e-Aadhaar).
        if (!Types.TryGetValue(contentType, out var extension) || length is 0 or > MaxBytes ||
            (kind == ApplicantDocumentKind.ProfilePhoto && extension == "pdf"))
        {
            return Error.Validation(
                "application.file_invalid",
                kind == ApplicantDocumentKind.ProfilePhoto ? "Add a photo (JPG, PNG or WebP) under 8 MB." : "Add a photo or PDF under 8 MB.");
        }

        var key = await storage.SaveAsync(content, "partner-applications", extension, ct);
        return new ApplicantDocumentUploaded(kind, pass.Issue(phone.Value, kind, key));
    }
}

/// <summary>The applicant's own view of their latest application (after verifying their number).</summary>
public sealed class GetPartnerApplicationStatus(DbContext db, PartnerPhoneProof proof) : IUseCase
{
    public async Task<Result<PartnerApplicationStatusResponse>> HandleAsync(PartnerApplicationStatusRequest request, CancellationToken ct)
    {
        var phone = PhoneNumber.Create(request.Phone);
        if (phone.IsFailure)
        {
            return phone.Error!;
        }

        if (!proof.Proves(request.VerificationToken, phone.Value))
        {
            return TechnicianApplicationErrors.PhoneUnverified;
        }

        var latest = await db.Set<TechnicianApplication>().AsNoTracking()
            .Where(a => a.Phone == phone.Value)
            .OrderByDescending(a => a.CreatedAt)
            .Select(a => new PartnerApplicationStatusResponse(a.Id, a.FullName, a.Status, a.CreatedAt, a.ReviewedAt, a.RejectionReason))
            .FirstOrDefaultAsync(ct);
        return latest is null ? TechnicianApplicationErrors.NotFound : latest;
    }
}

/// <summary>Sign-in for someone who has applied but isn't a partner yet (Identity asks through the port).</summary>
internal sealed class PartnerApplicants(DbContext db, PartnerPhoneProof proof) : IPartnerApplicants
{
    public Task<bool> HasAppliedAsync(PhoneNumber phone, CancellationToken ct) =>
        db.Set<TechnicianApplication>().AnyAsync(a => a.Phone == phone && a.Status != TechnicianApplicationStatus.Approved, ct);

    public string IssueStatusPass(PhoneNumber phone) => proof.Issue(phone).Token;
}

public sealed record ApplicantDocumentContent(Stream Content, string ContentType);

/// <summary>The office opens a document from an application.</summary>
public sealed class OpenApplicantDocument(DbContext db, IFileStorage storage) : IUseCase
{
    public async Task<Result<ApplicantDocumentContent>> HandleAsync(Guid applicationId, ApplicantDocumentKind kind, CancellationToken ct)
    {
        var application = await db.Set<TechnicianApplication>().AsNoTracking().FirstOrDefaultAsync(a => a.Id == applicationId, ct);
        var key = application?.DocumentKey(kind);
        var stream = key is null ? null : await storage.OpenReadAsync(key, ct);
        return stream is null ? TechnicianApplicationErrors.NotFound : new ApplicantDocumentContent(stream, ContentTypeOf(key!));
    }

    private static string ContentTypeOf(string key) => Path.GetExtension(key) switch
    {
        ".png" => "image/png",
        ".webp" => "image/webp",
        ".pdf" => "application/pdf",
        _ => "image/jpeg",
    };
}

// ── Use cases ───────────────────────────────────────────────────────────────

/// <summary>A technician applies to join. One open application per number; a repeat returns the first.</summary>
public sealed class SubmitTechnicianApplication(DbContext db, ICatalogDirectory catalog, PartnerPhoneProof proof, ApplicantDocumentPass documents, IClock clock)
    : IUseCase
{
    private const int MinimumAge = 18;

    public async Task<Result<TechnicianApplicationReceived>> HandleAsync(SubmitTechnicianApplicationRequest request, CancellationToken ct)
    {
        var phone = PhoneNumber.Create(request.Phone);
        if (phone.IsFailure)
        {
            return phone.Error!;
        }

        if (await db.Set<Technician>().IgnoreQueryFilters().AnyAsync(t => t.Phone == phone.Value, ct))
        {
            return TechnicianApplicationErrors.AlreadyPartner;
        }

        if (string.IsNullOrEmpty(request.Website) && !proof.Proves(request.VerificationToken, phone.Value))
        {
            return TechnicianApplicationErrors.PhoneUnverified;
        }

        var pending = await db.Set<TechnicianApplication>()
            .FirstOrDefaultAsync(a => a.Phone == phone.Value && a.Status == TechnicianApplicationStatus.Pending, ct);
        if (pending is not null || !string.IsNullOrEmpty(request.Website))
        {
            // Already waiting for review (or a bot filled the hidden field): same answer, nothing new stored.
            return new TechnicianApplicationReceived(pending?.Id ?? Guid.Empty, TechnicianApplicationStatus.Pending, pending is not null);
        }

        var categories = await catalog.GetCategoriesAsync(request.CategoryIds, ct);
        if (categories.Count != request.CategoryIds.Distinct().Count())
        {
            return TechnicianApplicationErrors.UnknownCategory;
        }

        var today = DateOnly.FromDateTime(clock.UtcNow.ToOffset(TimeSpan.FromHours(5.5)).DateTime); // India
        if (request.DateOfBirth is not { } born || born > today.AddYears(-MinimumAge) || born < today.AddYears(-80))
        {
            return Error.Validation("application.age", $"You need to be at least {MinimumAge} to join. Check your date of birth.");
        }

        var uploaded = new Dictionary<ApplicantDocumentKind, string>();
        foreach (var token in request.Documents ?? [])
        {
            if (documents.Read(token, phone.Value) is not { } document)
            {
                return TechnicianApplicationErrors.DocumentInvalid;
            }

            uploaded[document.Kind] = document.Key; // a later upload of the same kind replaces the earlier one
        }

        if (!uploaded.ContainsKey(ApplicantDocumentKind.ProfilePhoto) || !uploaded.ContainsKey(ApplicantDocumentKind.AadhaarFront))
        {
            return TechnicianApplicationErrors.DocumentMissing;
        }

        var pan = string.IsNullOrWhiteSpace(request.Pan) ? null : request.Pan.Trim().ToUpperInvariant();
        var details = new ApplicantDetails(
            request.FullName, phone.Value, born, request.AddressLine!, request.Pincode, request.Locality, IndianIds.Digits(request.AadhaarNumber)[^4..], pan, uploaded);
        var application = TechnicianApplication.Submit(details, request.CategoryIds, request.ExperienceYears, request.About);
        db.Set<TechnicianApplication>().Add(application);
        await db.SaveChangesAsync(ct);
        return new TechnicianApplicationReceived(application.Id, application.Status, false);
    }
}

/// <summary>Applications for the office, newest first.</summary>
public sealed class ListTechnicianApplications(DbContext db, ICatalogDirectory catalog) : IUseCase
{
    public async Task<IReadOnlyList<TechnicianApplicationResponse>> HandleAsync(TechnicianApplicationStatus? status, CancellationToken ct)
    {
        var query = db.Set<TechnicianApplication>().AsNoTracking();
        if (status is { } wanted)
        {
            query = query.Where(a => a.Status == wanted);
        }

        var applications = await query.OrderByDescending(a => a.CreatedAt).Take(200).ToListAsync(ct);
        var categories = await catalog.GetCategoriesAsync(applications.SelectMany(a => a.CategoryIds).Distinct(), ct);
        var served = new Dictionary<string, bool>();
        foreach (var pincode in applications.Select(a => a.Pincode).Distinct())
        {
            served[pincode] = (await catalog.FindServiceAreaIdsByPincodeAsync(pincode, ct)).Count > 0;
        }

        return [.. applications.Select(a => ToResponse(a, categories, served[a.Pincode]))];
    }

    internal static TechnicianApplicationResponse ToResponse(TechnicianApplication a, IReadOnlyDictionary<Guid, CategoryInfo> categories, bool served) => new(
        a.Id, a.FullName, a.Phone.Value, a.Pincode, a.Locality,
        [.. a.CategoryIds.Select(id => categories.TryGetValue(id, out var c) ? c.Name : "Removed appliance")],
        a.ExperienceYears, a.About, a.DateOfBirth, a.AddressLine, a.AadhaarLast4, a.Pan,
        [.. Enum.GetValues<ApplicantDocumentKind>()
            .Where(kind => a.DocumentKey(kind) is not null)
            .Select(kind => new ApplicantDocumentResponse(kind, $"/api/v1/admin/technician-applications/{a.Id}/documents/{EnumText.ToText(kind)}"))],
        a.Status, served, a.CreatedAt, a.ReviewedAt, a.RejectionReason, a.TechnicianId);
}

/// <summary>
/// Approve: creates the technician (skills from the appliances they chose, areas covering their PIN
/// code; employment, commission and limits start at the usual defaults for the office to adjust).
/// </summary>
public sealed class ApproveTechnicianApplication(DbContext db, ICatalogDirectory catalog, CreateTechnician createTechnician, ICurrentUser user, IClock clock)
    : IUseCase
{
    private const int StartingSkillLevel = 3;

    public async Task<Result<TechnicianApplicationResponse>> HandleAsync(Guid applicationId, CancellationToken ct)
    {
        var application = await db.Set<TechnicianApplication>().FirstOrDefaultAsync(a => a.Id == applicationId, ct);
        if (application is null)
        {
            return TechnicianApplicationErrors.NotFound;
        }

        if (application.Status != TechnicianApplicationStatus.Pending)
        {
            return TechnicianApplicationErrors.AlreadyReviewed;
        }

        var areas = await catalog.FindServiceAreaIdsByPincodeAsync(application.Pincode, ct);
        var created = await createTechnician.HandleAsync(new CreateTechnicianRequest(
            new TechnicianProfileInput(application.FullName, application.Phone.Value, null, EmploymentType.Contractor, 6, CommissionType.Percent, 20, null, null),
            [.. application.CategoryIds.Select(id => new SkillInput(id, StartingSkillLevel))],
            areas), ct);
        if (created.IsFailure)
        {
            return created.Error!;
        }

        if (application.ProfilePhotoKey is { } photo)
        {
            var technician = await db.Set<Technician>().FirstAsync(t => t.Id == created.Value.Id, ct);
            technician.SetPhoto(photo); // customers see it on the tracking page
        }

        var approved = application.Approve(created.Value.Id, user.UserId, clock.UtcNow);
        if (approved.IsFailure)
        {
            return approved.Error!;
        }

        await db.SaveChangesAsync(ct);
        return await Single(db, catalog, application.Id, ct);
    }

    internal static async Task<TechnicianApplicationResponse> Single(DbContext db, ICatalogDirectory catalog, Guid id, CancellationToken ct)
    {
        var a = await db.Set<TechnicianApplication>().AsNoTracking().FirstAsync(x => x.Id == id, ct);
        var categories = await catalog.GetCategoriesAsync(a.CategoryIds, ct);
        var served = (await catalog.FindServiceAreaIdsByPincodeAsync(a.Pincode, ct)).Count > 0;
        return ListTechnicianApplications.ToResponse(a, categories, served);
    }
}

public sealed class RejectTechnicianApplication(DbContext db, ICatalogDirectory catalog, ICurrentUser user, IClock clock) : IUseCase
{
    public async Task<Result<TechnicianApplicationResponse>> HandleAsync(Guid applicationId, RejectTechnicianApplicationRequest request, CancellationToken ct)
    {
        var application = await db.Set<TechnicianApplication>().FirstOrDefaultAsync(a => a.Id == applicationId, ct);
        if (application is null)
        {
            return TechnicianApplicationErrors.NotFound;
        }

        var rejected = application.Reject(request.Reason, user.UserId, clock.UtcNow);
        if (rejected.IsFailure)
        {
            return rejected.Error!;
        }

        await db.SaveChangesAsync(ct);
        return await ApproveTechnicianApplication.Single(db, catalog, application.Id, ct);
    }
}
