using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using ServicePro.BuildingBlocks.Persistence;
using ServicePro.Modules.Identity.Domain;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.Modules.Identity.Infrastructure;

/// <summary>
/// Creates the tenant and the first owner account. Credentials come from configuration
/// (Seed:OwnerEmail / Seed:OwnerPassword); no owner is created if they're absent.
/// </summary>
internal sealed class IdentitySeeder(DbContext db, IPasswordHasher<User> hasher) : IDataSeeder
{
    public int Order => 0;

    public async Task SeedAsync(SeedContext context, CancellationToken ct)
    {
        if (!await db.Set<Tenant>().AnyAsync(t => t.Id == context.TenantId, ct))
        {
            db.Set<Tenant>().Add(new Tenant(context.TenantId, context.Configuration["Seed:BusinessName"] ?? "ServicePro", "Asia/Kolkata"));
            await db.SaveChangesAsync(ct);
        }

        var email = context.Configuration["Seed:OwnerEmail"];
        var password = context.Configuration["Seed:OwnerPassword"];
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password) ||
            await db.Set<User>().AnyAsync(u => u.Role == UserRole.Owner, ct))
        {
            return;
        }

        var phone = PhoneNumber.Create(context.Configuration["Seed:OwnerPhone"] ?? "9000000001");
        var owner = User.Create(context.Configuration["Seed:OwnerName"] ?? "Owner", phone.Value, email, UserRole.Owner);
        owner.SetPasswordHash(hasher.HashPassword(owner, password));
        db.Set<User>().Add(owner);
        await db.SaveChangesAsync(ct);
    }
}
