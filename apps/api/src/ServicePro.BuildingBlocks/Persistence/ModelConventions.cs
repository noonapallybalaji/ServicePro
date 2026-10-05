using System.Linq.Expressions;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using ServicePro.SharedKernel.Domain;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.BuildingBlocks.Persistence;

/// <summary>
/// Model configuration that isn't tied to one entity (sequences, functions).
/// Discovered in module assemblies like IEntityTypeConfiguration; needs a parameterless constructor.
/// </summary>
public interface IModelContributor
{
    void Configure(ModelBuilder modelBuilder);
}

/// <summary>Cross-cutting model rules applied once for every module (ADR 0002).</summary>
public static class ModelConventions
{
    /// <summary>Enums are stored as SNAKE_UPPER text ("EN_ROUTE"), matching the API and PLAN.md §7.</summary>
    public static void StoreEnumsAsText(ModelBuilder modelBuilder)
    {
        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            foreach (var property in entityType.GetProperties())
            {
                var enumType = Nullable.GetUnderlyingType(property.ClrType) ?? property.ClrType;
                if (!enumType.IsEnum || property.GetValueConverter() is not null)
                {
                    continue;
                }

                var converterType = typeof(SnakeUpperEnumConverter<>).MakeGenericType(enumType);
                property.SetValueConverter((ValueConverter)Activator.CreateInstance(converterType)!);
                property.SetMaxLength(64);
            }
        }
    }

    /// <summary>Every ITenantOwned entity is filtered to the current tenant.</summary>
    public static void ApplyTenantFilters(ModelBuilder modelBuilder, Expression<Func<Guid>> currentTenant)
    {
        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            if (!typeof(ITenantOwned).IsAssignableFrom(entityType.ClrType) || entityType.BaseType is not null || entityType.IsOwned())
            {
                continue;
            }

            var parameter = Expression.Parameter(entityType.ClrType, "e");
            var tenantProperty = Expression.Property(parameter, nameof(ITenantOwned.TenantId));
            var body = Expression.Equal(tenantProperty, currentTenant.Body);
            modelBuilder.Entity(entityType.ClrType).HasQueryFilter(Expression.Lambda(body, parameter));
            modelBuilder.Entity(entityType.ClrType).HasIndex(nameof(ITenantOwned.TenantId));
        }
    }

    public static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
}

public sealed class SnakeUpperEnumConverter<TEnum>() : ValueConverter<TEnum, string>(
    value => EnumText.ToText(value),
    text => EnumText.Parse<TEnum>(text))
    where TEnum : struct, Enum;

public static class EnumText
{
    public static string ToText<TEnum>(TEnum value)
        where TEnum : struct, Enum =>
        JsonNamingPolicy.SnakeCaseUpper.ConvertName(value.ToString());

    public static TEnum Parse<TEnum>(string text)
        where TEnum : struct, Enum =>
        Enum.Parse<TEnum>(text.Replace("_", string.Empty, StringComparison.Ordinal), ignoreCase: true);

    /// <summary>Parses "PHOTO_AFTER" or "PhotoAfter"; numeric strings are rejected.</summary>
    public static bool TryParse<TEnum>(string? text, out TEnum value)
        where TEnum : struct, Enum
    {
        value = default;
        return !string.IsNullOrWhiteSpace(text) && !char.IsDigit(text[0]) &&
               Enum.TryParse(text.Replace("_", string.Empty, StringComparison.Ordinal), ignoreCase: true, out value) &&
               Enum.IsDefined(value);
    }
}

/// <summary>Mapping helpers for shared value objects.</summary>
public static class ValueObjectMappings
{
    public static PropertyBuilder<PhoneNumber> HasPhoneConversion(this PropertyBuilder<PhoneNumber> builder) =>
        builder.HasConversion(phone => phone.Value, value => PhoneNumber.FromTrusted(value)).HasMaxLength(16);
}

/// <summary>
/// Entities keep latitude/longitude as two nullable columns and expose a GeoLocation
/// (ADR 0008). This helper rebuilds the value object from stored, already-valid values.
/// </summary>
public static class GeoColumns
{
    public static GeoLocation? ToLocation(double? latitude, double? longitude) =>
        latitude is { } lat && longitude is { } lon && GeoLocation.Create(lat, lon) is { IsSuccess: true } result
            ? result.Value
            : null;
}
