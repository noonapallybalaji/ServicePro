using FluentValidation;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Application;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.Identity.Domain;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.Modules.Identity.Application;

public sealed record UserResponse(
    Guid Id,
    string FullName,
    string Phone,
    string? Email,
    UserRole Role,
    bool IsActive,
    DateTimeOffset? LastLoginAt);

internal static class UserMapping
{
    public static UserResponse ToResponse(this User user) =>
        new(user.Id, user.FullName, user.Phone.Value, user.Email, user.Role, user.IsActive, user.LastLoginAt);
}

internal static class PasswordRules
{
    public const int MinLength = 10;

    public static IRuleBuilderOptions<T, string> StrongPassword<T>(this IRuleBuilder<T, string> rule) =>
        rule.NotEmpty()
            .MinimumLength(MinLength)
            .Matches("[A-Za-z]").WithMessage("Use at least one letter.")
            .Matches("[0-9]").WithMessage("Use at least one number.");
}

public sealed class ListStaffUsers(DbContext db) : IUseCase
{
    public async Task<IReadOnlyList<UserResponse>> HandleAsync(CancellationToken ct) =>
        await db.Set<User>().AsNoTracking()
            .Where(u => u.Role != UserRole.Technician)
            .OrderBy(u => u.FullName)
            .Select(u => u.ToResponse())
            .ToListAsync(ct);
}

public sealed record CreateStaffUserRequest(string FullName, string Phone, string Email, UserRole Role, string Password);

internal sealed class CreateStaffUserRequestValidator : AbstractValidator<CreateStaffUserRequest>
{
    public CreateStaffUserRequestValidator()
    {
        RuleFor(r => r.FullName).NotEmpty().MaximumLength(200);
        RuleFor(r => r.Phone).NotEmpty();
        RuleFor(r => r.Email).NotEmpty().EmailAddress();
        RuleFor(r => r.Role).NotEqual(UserRole.Technician).WithMessage("Technicians are added from the Technicians page.");
        RuleFor(r => r.Password).StrongPassword();
    }
}

public sealed class CreateStaffUser(DbContext db, UserAccounts accounts, IPasswordHasher<User> hasher) : IUseCase
{
    public async Task<Result<UserResponse>> HandleAsync(CreateStaffUserRequest request, CancellationToken ct)
    {
        var phone = PhoneNumber.Create(request.Phone);
        if (phone.IsFailure)
        {
            return phone.Error!;
        }

        var created = await accounts.CreateAsync(new NewUser(request.FullName, phone.Value, request.Email, request.Role), ct);
        if (created.IsFailure)
        {
            return created.Error!;
        }

        var user = created.Value;
        user.SetPasswordHash(hasher.HashPassword(user, request.Password));
        await db.SaveChangesAsync(ct);
        return user.ToResponse();
    }
}

public sealed record UpdateStaffUserRequest(string FullName, string Phone, UserRole Role, bool IsActive, string? NewPassword);

internal sealed class UpdateStaffUserRequestValidator : AbstractValidator<UpdateStaffUserRequest>
{
    public UpdateStaffUserRequestValidator()
    {
        RuleFor(r => r.FullName).NotEmpty().MaximumLength(200);
        RuleFor(r => r.Phone).NotEmpty();
        RuleFor(r => r.Role).NotEqual(UserRole.Technician);
        RuleFor(r => r.NewPassword!).StrongPassword().When(r => !string.IsNullOrEmpty(r.NewPassword));
    }
}

public sealed class UpdateStaffUser(DbContext db, IPasswordHasher<User> hasher, ICurrentUser currentUser) : IUseCase
{
    public async Task<Result<UserResponse>> HandleAsync(Guid userId, UpdateStaffUserRequest request, CancellationToken ct)
    {
        var user = await db.Set<User>().FirstOrDefaultAsync(u => u.Id == userId && u.Role != UserRole.Technician, ct);
        if (user is null)
        {
            return Error.NotFound("user.not_found", "That user doesn't exist.");
        }

        if (user.Id == currentUser.UserId && (!request.IsActive || request.Role != user.Role))
        {
            return Error.Conflict("user.self_lockout", "You can't deactivate yourself or change your own role.");
        }

        var phone = PhoneNumber.Create(request.Phone);
        if (phone.IsFailure)
        {
            return phone.Error!;
        }

        if (await db.Set<User>().AnyAsync(u => u.Id != userId && u.Phone == phone.Value, ct))
        {
            return Error.Conflict("user.phone_taken", "Another user already has this phone number.");
        }

        user.UpdateProfile(request.FullName, phone.Value);
        user.ChangeRole(request.Role);
        user.SetActive(request.IsActive);
        if (!string.IsNullOrEmpty(request.NewPassword))
        {
            user.SetPasswordHash(hasher.HashPassword(user, request.NewPassword));
        }

        await db.SaveChangesAsync(ct);
        return user.ToResponse();
    }
}

/// <summary>
/// Creates and maintains user accounts. Shared by staff management and by other modules
/// through <see cref="IUserProvisioning"/> (e.g. adding a technician creates their login).
/// </summary>
public sealed class UserAccounts(DbContext db) : IUserProvisioning
{
    public async Task<Result<User>> CreateAsync(NewUser request, CancellationToken ct)
    {
        if (await db.Set<User>().AnyAsync(u => u.Phone == request.Phone, ct))
        {
            return Error.Conflict("user.phone_taken", "Someone already uses this phone number.");
        }

        var email = User.NormalizeEmail(request.Email);
        if (email is not null && await db.Set<User>().AnyAsync(u => u.Email == email, ct))
        {
            return Error.Conflict("user.email_taken", "Someone already uses this email address.");
        }

        var user = User.Create(request.FullName, request.Phone, request.Email, request.Role);
        db.Set<User>().Add(user);
        return user;
    }

    async Task<Result<Guid>> IUserProvisioning.CreateAsync(NewUser user, CancellationToken ct)
    {
        var result = await CreateAsync(user, ct);
        return result.IsSuccess ? result.Value.Id : result.Error!;
    }

    public async Task<Result> UpdateProfileAsync(Guid userId, string fullName, PhoneNumber phone, CancellationToken ct)
    {
        var user = await db.Set<User>().FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
        {
            return Error.NotFound("user.not_found", "That user doesn't exist.");
        }

        if (await db.Set<User>().AnyAsync(u => u.Id != userId && u.Phone == phone, ct))
        {
            return Error.Conflict("user.phone_taken", "Someone already uses this phone number.");
        }

        user.UpdateProfile(fullName, phone);
        return Result.Success();
    }

    public async Task<Result> SetActiveAsync(Guid userId, bool isActive, CancellationToken ct)
    {
        var user = await db.Set<User>().FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
        {
            return Error.NotFound("user.not_found", "That user doesn't exist.");
        }

        user.SetActive(isActive);
        return Result.Success();
    }
}
