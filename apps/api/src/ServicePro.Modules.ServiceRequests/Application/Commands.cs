using FluentValidation;
using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Application;
using ServicePro.BuildingBlocks.Security;
using ServicePro.BuildingBlocks.Storage;
using ServicePro.Contracts;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.ServiceRequests.Domain;
using ServicePro.Modules.ServiceRequests.Infrastructure;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.Modules.ServiceRequests.Application;

// ── Create ──────────────────────────────────────────────────────────────────

public sealed record CreateServiceRequestRequest(
    Guid CustomerId,
    Guid AddressId,
    Guid? ApplianceId,
    Guid CategoryId,
    Guid? IssueTypeId,
    string ProblemDescription,
    RequestChannel Channel,
    Priority Priority,
    DateTimeOffset? PreferredSlotStart,
    DateTimeOffset? PreferredSlotEnd,
    DateTimeOffset? ScheduledStart,
    DateTimeOffset? ScheduledEnd,
    decimal? VisitChargeOverride,
    bool IsWarrantyVisit,
    Guid? ParentServiceRequestId);

internal sealed class CreateServiceRequestRequestValidator : AbstractValidator<CreateServiceRequestRequest>
{
    public CreateServiceRequestRequestValidator()
    {
        RuleFor(r => r.CustomerId).NotEmpty();
        RuleFor(r => r.AddressId).NotEmpty();
        RuleFor(r => r.CategoryId).NotEmpty();
        RuleFor(r => r.ProblemDescription).NotEmpty().MaximumLength(2000);
        RuleFor(r => r.PreferredSlotEnd).GreaterThan(r => r.PreferredSlotStart)
            .When(r => r.PreferredSlotStart.HasValue && r.PreferredSlotEnd.HasValue)
            .WithMessage("The preferred window must end after it starts.");
        RuleFor(r => r.ScheduledEnd).GreaterThan(r => r.ScheduledStart)
            .When(r => r.ScheduledStart.HasValue && r.ScheduledEnd.HasValue)
            .WithMessage("The visit must end after it starts.");
        RuleFor(r => r.VisitChargeOverride).InclusiveBetween(0, 100_000).When(r => r.VisitChargeOverride.HasValue);
        RuleFor(r => r.ParentServiceRequestId).NotEmpty().When(r => r.IsWarrantyVisit)
            .WithMessage("A warranty visit must reference the original job.");
    }
}

public sealed class CreateServiceRequest(
    DbContext db,
    ICustomerDirectory customers,
    ICatalogDirectory catalog,
    ICurrentUser currentUser,
    IClock clock) : IUseCase
{
    public async Task<Result<Guid>> HandleAsync(CreateServiceRequestRequest request, CancellationToken ct)
    {
        var customer = await customers.GetAsync(request.CustomerId, ct);
        if (customer is null)
        {
            return Error.NotFound("customer.not_found", "That customer doesn't exist.");
        }

        var address = await customers.GetAddressAsync(request.AddressId, ct);
        if (address is null || address.CustomerId != customer.Id)
        {
            return Error.Validation("sr.address_invalid", "Choose one of this customer's addresses.");
        }

        if (request.ApplianceId is { } applianceId)
        {
            var appliance = await customers.GetApplianceAsync(applianceId, ct);
            if (appliance is null || appliance.CustomerId != customer.Id)
            {
                return Error.Validation("sr.appliance_invalid", "Choose one of this customer's appliances.");
            }
        }

        var category = await catalog.GetCategoryAsync(request.CategoryId, ct);
        if (category is null)
        {
            return Error.Validation("sr.category_invalid", "Choose an appliance category.");
        }

        if (request.IssueTypeId is { } issueTypeId)
        {
            var issue = await catalog.GetIssueTypeAsync(issueTypeId, ct);
            if (issue is null || issue.CategoryId != category.Id)
            {
                return Error.Validation("sr.issue_invalid", "Choose a problem type for this appliance.");
            }
        }

        if (request.ParentServiceRequestId is { } parentId &&
            !await db.Set<ServiceRequest>().AnyAsync(s => s.Id == parentId && s.CustomerId == customer.Id, ct))
        {
            return Error.Validation("sr.parent_invalid", "The original job must belong to the same customer.");
        }

        var srNumber = await NextSrNumberAsync(ct);
        var serviceRequest = ServiceRequest.Create(
            new NewServiceRequest(
                srNumber,
                customer.Id,
                address.Id,
                request.ApplianceId,
                category.Id,
                request.IssueTypeId,
                request.ProblemDescription,
                request.Channel,
                request.Priority,
                request.VisitChargeOverride ?? category.BaseVisitCharge,
                request.PreferredSlotStart,
                request.PreferredSlotEnd,
                request.ScheduledStart,
                request.ScheduledEnd,
                request.IsWarrantyVisit,
                request.ParentServiceRequestId),
            currentUser.ToActor(),
            clock.UtcNow);

        db.Set<ServiceRequest>().Add(serviceRequest);
        await db.SaveChangesAsync(ct);
        return serviceRequest.Id;
    }

    private async Task<string> NextSrNumberAsync(CancellationToken ct)
    {
        var next = await db.Database
            .SqlQueryRaw<long>($"SELECT nextval('{OpsSchema.Name}.{OpsSchema.SrNumberSequence}') AS \"Value\"")
            .SingleAsync(ct);
        return $"SR-{next}";
    }
}

// ── Update details ──────────────────────────────────────────────────────────

public sealed record UpdateServiceRequestRequest(
    Guid? ApplianceId,
    Guid? IssueTypeId,
    string ProblemDescription,
    Priority Priority,
    DateTimeOffset? PreferredSlotStart,
    DateTimeOffset? PreferredSlotEnd,
    DateTimeOffset? ScheduledStart,
    DateTimeOffset? ScheduledEnd);

internal sealed class UpdateServiceRequestRequestValidator : AbstractValidator<UpdateServiceRequestRequest>
{
    public UpdateServiceRequestRequestValidator()
    {
        RuleFor(r => r.ProblemDescription).NotEmpty().MaximumLength(2000);
        RuleFor(r => r.ScheduledEnd).GreaterThan(r => r.ScheduledStart)
            .When(r => r.ScheduledStart.HasValue && r.ScheduledEnd.HasValue)
            .WithMessage("The visit must end after it starts.");
    }
}

public sealed class UpdateServiceRequest(DbContext db) : IUseCase
{
    public async Task<Result> HandleAsync(Guid serviceRequestId, UpdateServiceRequestRequest request, CancellationToken ct)
    {
        var serviceRequest = await db.Set<ServiceRequest>().FirstOrDefaultAsync(s => s.Id == serviceRequestId, ct);
        if (serviceRequest is null)
        {
            return ServiceRequestErrors.NotFound;
        }

        if (serviceRequest.IsTerminal)
        {
            return Error.Conflict("sr.closed", "Closed jobs can't be edited.");
        }

        serviceRequest.UpdateDetails(request.ApplianceId, request.IssueTypeId, request.ProblemDescription, request.Priority,
            request.PreferredSlotStart, request.PreferredSlotEnd, request.ScheduledStart, request.ScheduledEnd);
        await db.SaveChangesAsync(ct);
        return Result.Success();
    }
}

// ── Status transitions (staff and technician) ───────────────────────────────

public sealed record TransitionRequest(
    ServiceRequestStatus To,
    string? ReasonCode,
    string? Note,
    string? CompletionCode,
    double? Latitude,
    double? Longitude);

internal sealed class TransitionRequestValidator : AbstractValidator<TransitionRequest>
{
    public TransitionRequestValidator()
    {
        RuleFor(r => r.ReasonCode).MaximumLength(80);
        RuleFor(r => r.Note).MaximumLength(1000);
        RuleFor(r => r.CompletionCode).Matches("^[0-9]{4}$").When(r => r.CompletionCode is not null)
            .WithMessage("The completion code has 4 digits.");
    }
}

public sealed class TransitionServiceRequest(
    DbContext db,
    ICatalogDirectory catalog,
    ICurrentUser currentUser,
    IClock clock) : IUseCase
{
    public async Task<Result> HandleAsync(Guid serviceRequestId, TransitionRequest request, CancellationToken ct)
    {
        var serviceRequest = await db.Set<ServiceRequest>().Include(s => s.Attachments)
            .FirstOrDefaultAsync(s => s.Id == serviceRequestId, ct);
        if (serviceRequest is null)
        {
            return ServiceRequestErrors.NotFound;
        }

        GeoLocation? location = null;
        if (request is { Latitude: { } lat, Longitude: { } lon } && GeoLocation.Create(lat, lon) is { IsSuccess: true } geo)
        {
            location = geo.Value;
        }

        var category = await catalog.GetCategoryAsync(serviceRequest.CategoryId, ct);
        var input = new TransitionInput(
            request.ReasonCode,
            request.Note,
            request.CompletionCode,
            location,
            currentUser.TechnicianId,
            HasAfterPhoto: serviceRequest.Attachments.Any(a => a.Kind == AttachmentKind.PhotoAfter),
            CategoryRequiresPhotos: category?.RequiresPhotos ?? false);

        var result = serviceRequest.Transition(request.To, currentUser.ToActor(), input, clock.UtcNow);

        // Failed code attempts are counted even when the transition is refused.
        await db.SaveChangesAsync(ct);
        return result;
    }
}

public sealed class ReissueCompletionCode(DbContext db, ICurrentUser currentUser) : IUseCase
{
    public async Task<Result> HandleAsync(Guid serviceRequestId, CancellationToken ct)
    {
        var serviceRequest = await db.Set<ServiceRequest>().FirstOrDefaultAsync(s => s.Id == serviceRequestId, ct);
        if (serviceRequest is null)
        {
            return ServiceRequestErrors.NotFound;
        }

        if (currentUser.Role == UserRole.Technician && serviceRequest.CurrentTechnicianId != currentUser.TechnicianId)
        {
            return ServiceRequestErrors.NotAssigned;
        }

        var result = serviceRequest.ReissueCompletionCode();
        if (result.IsSuccess)
        {
            await db.SaveChangesAsync(ct);
        }

        return result;
    }
}

// ── Notes & attachments ─────────────────────────────────────────────────────

public sealed record AddNoteRequest(string Body, NoteVisibility Visibility);

internal sealed class AddNoteRequestValidator : AbstractValidator<AddNoteRequest>
{
    public AddNoteRequestValidator() => RuleFor(r => r.Body).NotEmpty().MaximumLength(2000);
}

public sealed class AddServiceRequestNote(DbContext db, ICurrentUser currentUser) : IUseCase
{
    public async Task<Result<NoteResponse>> HandleAsync(Guid serviceRequestId, AddNoteRequest request, CancellationToken ct)
    {
        var serviceRequest = await db.Set<ServiceRequest>().FirstOrDefaultAsync(s => s.Id == serviceRequestId, ct);
        if (serviceRequest is null)
        {
            return ServiceRequestErrors.NotFound;
        }

        if (currentUser.Role == UserRole.Technician && serviceRequest.CurrentTechnicianId != currentUser.TechnicianId)
        {
            return ServiceRequestErrors.NotAssigned;
        }

        var note = serviceRequest.AddNote(request.Body, request.Visibility, currentUser.ToActor());
        await db.SaveChangesAsync(ct);
        return ServiceRequestViewBuilder.ToResponse(note);
    }
}

public sealed class UploadServiceRequestAttachment(DbContext db, IFileStorage storage, ICurrentUser currentUser) : IUseCase
{
    public const long MaxBytes = 10 * 1024 * 1024;

    private static readonly Dictionary<string, string> AllowedTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        ["image/jpeg"] = "jpg",
        ["image/png"] = "png",
        ["image/webp"] = "webp",
        ["application/pdf"] = "pdf",
        ["audio/webm"] = "webm",
        ["audio/mpeg"] = "mp3",
    };

    public async Task<Result<AttachmentResponse>> HandleAsync(
        Guid serviceRequestId,
        AttachmentKind kind,
        Stream content,
        string contentType,
        long length,
        CancellationToken ct)
    {
        if (!AllowedTypes.TryGetValue(contentType, out var extension) || length is 0 or > MaxBytes)
        {
            return Error.Validation("attachment.invalid", "Upload a photo, PDF or voice note under 10 MB.");
        }

        var serviceRequest = await db.Set<ServiceRequest>().FirstOrDefaultAsync(s => s.Id == serviceRequestId, ct);
        if (serviceRequest is null)
        {
            return ServiceRequestErrors.NotFound;
        }

        if (currentUser.Role == UserRole.Technician && serviceRequest.CurrentTechnicianId != currentUser.TechnicianId)
        {
            return ServiceRequestErrors.NotAssigned;
        }

        var key = await storage.SaveAsync(content, $"service-requests/{serviceRequest.Id:N}", extension, ct);
        var attachment = serviceRequest.AddAttachment(kind, key, contentType.ToLowerInvariant(), length, currentUser.ToActor());
        await db.SaveChangesAsync(ct);

        return new AttachmentResponse(attachment.Id, attachment.Kind, attachment.ContentType, attachment.SizeBytes,
            $"/api/v1/service-requests/{serviceRequest.Id}/attachments/{attachment.Id}", attachment.CreatedAt);
    }
}

public sealed record AttachmentContent(Stream Content, string ContentType);

public sealed class OpenServiceRequestAttachment(DbContext db, IFileStorage storage, ICurrentUser currentUser) : IUseCase
{
    public async Task<Result<AttachmentContent>> HandleAsync(Guid serviceRequestId, Guid attachmentId, CancellationToken ct)
    {
        var serviceRequest = await db.Set<ServiceRequest>().Include(s => s.Attachments).AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == serviceRequestId, ct);
        var attachment = serviceRequest?.Attachments.FirstOrDefault(a => a.Id == attachmentId);
        if (serviceRequest is null || attachment is null)
        {
            return ServiceRequestErrors.NotFound;
        }

        if (currentUser.Role == UserRole.Technician && serviceRequest.CurrentTechnicianId != currentUser.TechnicianId)
        {
            return ServiceRequestErrors.NotAssigned;
        }

        var stream = await storage.OpenReadAsync(attachment.StorageKey, ct);
        return stream is null
            ? Error.NotFound("attachment.missing", "The file is no longer available.")
            : new AttachmentContent(stream, attachment.ContentType);
    }
}
