using System.Collections.Concurrent;
using System.Reflection;
using System.Text.Json;
using ServicePro.SharedKernel.Domain;

namespace ServicePro.BuildingBlocks.Messaging;

/// <summary>
/// Knows every event type (for deserialisation) and every handler type per event
/// (so the processor can run each handler in its own scope).
/// </summary>
public sealed class EventHandlerRegistry
{
    private readonly ConcurrentDictionary<string, Type> _eventTypes = new();
    private readonly ConcurrentDictionary<Type, List<Type>> _handlers = new();

    public void RegisterEventTypes(Assembly assembly)
    {
        foreach (var type in assembly.GetTypes().Where(IsConcreteEvent))
        {
            _eventTypes[EventTypeName(type)] = type;
        }
    }

    public void RegisterHandler(Type eventType, Type handlerType) =>
        _handlers.AddOrUpdate(eventType, _ => [handlerType], (_, list) =>
        {
            if (!list.Contains(handlerType))
            {
                list.Add(handlerType);
            }

            return list;
        });

    public IReadOnlyList<Type> HandlersFor(Type eventType) =>
        _handlers.TryGetValue(eventType, out var list) ? list : [];

    public Type? ResolveEventType(string name) => _eventTypes.GetValueOrDefault(name);

    public static string EventTypeName(Type type) => type.FullName ?? type.Name;

    private static bool IsConcreteEvent(Type type) =>
        type is { IsAbstract: false, IsInterface: false } && typeof(IDomainEvent).IsAssignableFrom(type);
}

public static class EventSerializer
{
    public static JsonSerializerOptions Options { get; } = CreateOptions();

    public static string Serialize(IDomainEvent domainEvent) =>
        JsonSerializer.Serialize(domainEvent, domainEvent.GetType(), Options);

    public static IDomainEvent? Deserialize(string payload, Type type) =>
        JsonSerializer.Deserialize(payload, type, Options) as IDomainEvent;

    private static JsonSerializerOptions CreateOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
        return options;
    }
}
