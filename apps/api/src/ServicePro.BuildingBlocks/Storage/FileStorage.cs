using Microsoft.Extensions.Options;

namespace ServicePro.BuildingBlocks.Storage;

/// <summary>Binary storage for photos, recordings and invoices (PLAN.md §6.3, ADR 0009).</summary>
public interface IFileStorage
{
    /// <returns>An opaque key to store in the database.</returns>
    Task<string> SaveAsync(Stream content, string folder, string extension, CancellationToken ct);

    Task<Stream?> OpenReadAsync(string key, CancellationToken ct);
}

public sealed class LocalFileStorageOptions
{
    public string RootPath { get; set; } = ".storage";
}

/// <summary>Development storage on local disk. Keys are relative paths; traversal is rejected.</summary>
public sealed class LocalFileStorage(IOptions<LocalFileStorageOptions> options) : IFileStorage
{
    private readonly string _root = Path.GetFullPath(options.Value.RootPath);

    public async Task<string> SaveAsync(Stream content, string folder, string extension, CancellationToken ct)
    {
        var safeFolder = string.Concat(folder.Where(c => char.IsLetterOrDigit(c) || c is '-' or '_' or '/'));
        var safeExtension = string.Concat(extension.TrimStart('.').Where(char.IsLetterOrDigit)).ToLowerInvariant();
        var key = $"{safeFolder.Trim('/')}/{Guid.CreateVersion7():N}.{safeExtension}";
        var path = ResolvePath(key);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);

        await using var file = File.Create(path);
        await content.CopyToAsync(file, ct);
        return key;
    }

    public Task<Stream?> OpenReadAsync(string key, CancellationToken ct)
    {
        var path = ResolvePath(key);
        Stream? stream = File.Exists(path) ? File.OpenRead(path) : null;
        return Task.FromResult(stream);
    }

    private string ResolvePath(string key)
    {
        var path = Path.GetFullPath(Path.Combine(_root, key));
        if (!path.StartsWith(_root, StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Storage key escapes the storage root.");
        }

        return path;
    }
}
