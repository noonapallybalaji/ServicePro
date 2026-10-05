using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ServicePro.BuildingBlocks.Persistence;
using ServicePro.Modules.Identity.Domain;

namespace ServicePro.Modules.Identity.Infrastructure;

internal static class IdentitySchema
{
    public const string Name = "identity";
}

internal sealed class TenantConfiguration : IEntityTypeConfiguration<Tenant>
{
    public void Configure(EntityTypeBuilder<Tenant> builder)
    {
        builder.ToTable("tenants", IdentitySchema.Name);
        builder.Property(t => t.Name).HasMaxLength(200);
        builder.Property(t => t.Timezone).HasMaxLength(64);
    }
}

internal sealed class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.ToTable("users", IdentitySchema.Name);
        builder.Property(u => u.FullName).HasMaxLength(200);
        builder.Property(u => u.Phone).HasPhoneConversion();
        builder.Property(u => u.Email).HasMaxLength(254);
        builder.Property(u => u.PasswordHash).HasMaxLength(512);
        builder.Property(u => u.PreferredLanguage).HasMaxLength(8);
        builder.HasIndex(u => new { u.TenantId, u.Phone }).IsUnique();
        builder.HasIndex(u => new { u.TenantId, u.Email }).IsUnique().HasFilter("email IS NOT NULL");
        builder.Ignore(u => u.IsStaff);
    }
}

internal sealed class RefreshTokenConfiguration : IEntityTypeConfiguration<RefreshToken>
{
    public void Configure(EntityTypeBuilder<RefreshToken> builder)
    {
        builder.ToTable("refresh_tokens", IdentitySchema.Name);
        builder.Property(t => t.TokenHash).HasMaxLength(64);
        builder.HasIndex(t => t.TokenHash).IsUnique();
        builder.HasIndex(t => t.FamilyId);
        builder.HasOne<User>().WithMany().HasForeignKey(t => t.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class OtpChallengeConfiguration : IEntityTypeConfiguration<OtpChallenge>
{
    public void Configure(EntityTypeBuilder<OtpChallenge> builder)
    {
        builder.ToTable("otp_challenges", IdentitySchema.Name);
        builder.Property(o => o.Phone).HasPhoneConversion();
        builder.Property(o => o.CodeHash).HasMaxLength(64);
        builder.HasIndex(o => new { o.Phone, o.Purpose, o.CreatedAt });
    }
}
