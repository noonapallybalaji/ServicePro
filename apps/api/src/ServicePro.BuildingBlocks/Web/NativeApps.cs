using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ServicePro.BuildingBlocks.Web;

/// <summary>
/// The phone apps (Capacitor technician app; later the React Native customer app). Browsers keep the
/// refresh token in an HttpOnly cookie (ADR 0005); a native app can't rely on cookies, so it receives
/// the refresh token in the response body and keeps it in the device's secure storage (Keychain /
/// Keystore). A request counts as a native app only when it says so and has no browser origin other
/// than the apps' own: browsers always send Origin and page scripts can't change it, so a web page
/// can't ask for its token in the body.
/// </summary>
public static class NativeApps
{
    public const string ClientHeader = "X-ServicePro-Client";
    public const string ClientValue = "native";
    public const string CorsPolicy = "native-apps";

    /// <summary>The origins the app WebViews load from: Capacitor's defaults on Android and iOS.</summary>
    private static readonly string[] DefaultOrigins = ["https://localhost", "capacitor://localhost"];

    public static string[] Origins(IConfiguration configuration)
    {
        var configured = (configuration["NativeApps:AllowedOrigins"] ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(origin => origin.TrimEnd('/'))
            .ToArray();
        return configured.Length > 0 ? configured : DefaultOrigins;
    }

    public static bool IsNativeApp(HttpRequest request)
    {
        if (!string.Equals(request.Headers[ClientHeader], ClientValue, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var origin = request.Headers.Origin.ToString();
        if (string.IsNullOrEmpty(origin))
        {
            return true; // not a browser (a React Native app sends no Origin)
        }

        var configuration = request.HttpContext.RequestServices.GetRequiredService<IConfiguration>();
        return Origins(configuration).Contains(origin.TrimEnd('/'), StringComparer.OrdinalIgnoreCase);
    }
}

/// <summary>Body of refresh and logout requests from a native app (browsers send the cookie instead).</summary>
public sealed record NativeRefreshRequest(string? RefreshToken);
