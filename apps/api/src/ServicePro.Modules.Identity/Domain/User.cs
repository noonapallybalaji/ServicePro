using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Domain;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.Modules.Identity.Domain;

/// <summary>A person who can sign in (PLAN.md §7.3 `users`).</summary>
public sealed class User : TenantOwnedAggregateRoot, ServicePro.BuildingBlocks.Persistence.IAudited
{
    private User()
    {
    }

    private User(string fullName, PhoneNumber phone, string? email, UserRole role)
    {
        FullName = fullName.Trim();
        Phone = phone;
        Email = NormalizeEmail(email);
        Role = role;
        IsActive = true;
    }

    public string FullName { get; private set; } = string.Empty;

    public PhoneNumber Phone { get; private set; } = null!;

    public string? Email { get; private set; }

    public string? PasswordHash { get; private set; }

    public UserRole Role { get; private set; }

    public string PreferredLanguage { get; private set; } = "en";

    public bool IsActive { get; private set; }

    public DateTimeOffset? LastLoginAt { get; private set; }

    public bool IsStaff => Role is not UserRole.Technician;

    public static User Create(string fullName, PhoneNumber phone, string? email, UserRole role) =>
        new(fullName, phone, email, role);

    public void SetPasswordHash(string passwordHash) => PasswordHash = passwordHash;

    public void UpdateProfile(string fullName, PhoneNumber phone)
    {
        FullName = fullName.Trim();
        Phone = phone;
    }

    public void ChangeRole(UserRole role) => Role = role;

    public void SetActive(bool isActive) => IsActive = isActive;

    public void SetPreferredLanguage(string language) => PreferredLanguage = language;

    public void RecordLogin(DateTimeOffset at) => LastLoginAt = at;

    public static string? NormalizeEmail(string? email) =>
        string.IsNullOrWhiteSpace(email) ? null : email.Trim().ToLowerInvariant();
}
