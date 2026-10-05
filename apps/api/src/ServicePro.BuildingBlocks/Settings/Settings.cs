using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ServicePro.SharedKernel.Domain;
using ServicePro.SharedKernel.Results;

namespace ServicePro.BuildingBlocks.Settings;

/*
 * Configurable business rules (PLAN.md §2.5): thresholds, timers, weights, charges.
 * Each module declares its settings with defaults in code; the owner overrides them per tenant.
 */

public interface ISettingDefinition
{
    string Key { get; }

    string Description { get; }

    Type ValueType { get; }

    object DefaultValue { get; }
}

public sealed record SettingDefinition<T>(string Key, T Default, string Description) : ISettingDefinition
    where T : notnull
{
    public Type ValueType => typeof(T);

    public object DefaultValue => Default;
}

public sealed record SettingView(string Key, string Description, JsonElement Value, JsonElement DefaultValue, bool IsOverridden);

public interface ISettingsStore
{
    Task<T> GetAsync<T>(SettingDefinition<T> definition, CancellationToken ct)
        where T : notnull;

    Task<IReadOnlyList<SettingView>> ListAsync(CancellationToken ct);

    Task<Result> SetAsync(string key, JsonElement value, CancellationToken ct);
}

/// <summary>A tenant's override of a setting. Every change is audited.</summary>
public sealed class SettingEntry : TenantOwnedEntity, Persistence.IAudited
{
    private SettingEntry()
    {
    }

    public SettingEntry(string key, string json)
    {
        Key = key;
        Json = json;
    }

    public string Key { get; private set; } = string.Empty;

    public string Json { get; private set; } = "null";

    public void Update(string json) => Json = json;
}

internal sealed class SettingEntryConfiguration : IEntityTypeConfiguration<SettingEntry>
{
    public void Configure(EntityTypeBuilder<SettingEntry> builder)
    {
        builder.ToTable("settings", "platform");
        builder.HasKey(s => s.Id);
        builder.Property(s => s.Key).HasMaxLength(120);
        builder.Property(s => s.Json).HasColumnName("value").HasColumnType("jsonb");
        builder.HasIndex(s => new { s.TenantId, s.Key }).IsUnique();
    }
}

public sealed class SettingsStore(DbContext db, IEnumerable<ISettingDefinition> definitions) : ISettingsStore
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly Dictionary<string, ISettingDefinition> _definitions = definitions.ToDictionary(d => d.Key);

    public async Task<T> GetAsync<T>(SettingDefinition<T> definition, CancellationToken ct)
        where T : notnull
    {
        var entry = await db.Set<SettingEntry>().AsNoTracking().FirstOrDefaultAsync(s => s.Key == definition.Key, ct);
        if (entry is null)
        {
            return definition.Default;
        }

        try
        {
            return JsonSerializer.Deserialize<T>(entry.Json, Json) ?? definition.Default;
        }
        catch (JsonException)
        {
            return definition.Default;
        }
    }

    public async Task<IReadOnlyList<SettingView>> ListAsync(CancellationToken ct)
    {
        var overrides = await db.Set<SettingEntry>().AsNoTracking().ToDictionaryAsync(s => s.Key, s => s.Json, ct);

        return _definitions.Values
            .OrderBy(d => d.Key, StringComparer.Ordinal)
            .Select(d =>
            {
                var defaultJson = JsonSerializer.SerializeToElement(d.DefaultValue, d.ValueType, Json);
                var isOverridden = overrides.TryGetValue(d.Key, out var json);
                var value = isOverridden ? JsonDocument.Parse(json!).RootElement.Clone() : defaultJson;
                return new SettingView(d.Key, d.Description, value, defaultJson, isOverridden);
            })
            .ToList();
    }

    public async Task<Result> SetAsync(string key, JsonElement value, CancellationToken ct)
    {
        if (!_definitions.TryGetValue(key, out var definition))
        {
            return Error.NotFound("setting.unknown", $"There is no setting called '{key}'.");
        }

        try
        {
            if (JsonSerializer.Deserialize(value.GetRawText(), definition.ValueType, Json) is null)
            {
                return Error.Validation("setting.invalid", "A value is required.");
            }
        }
        catch (JsonException)
        {
            return Error.Validation("setting.invalid", $"The value doesn't match the expected format for '{key}'.");
        }

        var entry = await db.Set<SettingEntry>().FirstOrDefaultAsync(s => s.Key == key, ct);
        if (entry is null)
        {
            db.Set<SettingEntry>().Add(new SettingEntry(key, value.GetRawText()));
        }
        else
        {
            entry.Update(value.GetRawText());
        }

        return Result.Success();
    }
}
