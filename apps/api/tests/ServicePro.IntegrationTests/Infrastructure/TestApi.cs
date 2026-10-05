using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using ServicePro.BuildingBlocks.Web;
using ServicePro.Contracts;
using ServicePro.Modules.Catalog.Application;
using ServicePro.Modules.Customers.Application;
using ServicePro.Modules.Dispatch.Application;
using ServicePro.Modules.Identity.Application;
using ServicePro.Modules.Notifications;
using ServicePro.Modules.ServiceRequests.Application;
using ServicePro.Modules.Technicians.Application;

namespace ServicePro.IntegrationTests.Infrastructure;

/// <summary>Typed helpers over the HTTP API, using the API's own request/response records.</summary>
public sealed partial class TestApi(ApiFactory factory)
{
    public static readonly JsonSerializerOptions Json = CreateJson();

    public HttpClient Client { get; } = factory.CreateApiClient();

    public ApiFactory Factory => factory;

    public static string RandomPhone() => "9" + Random.Shared.NextInt64(100_000_000, 999_999_999).ToString(System.Globalization.CultureInfo.InvariantCulture);

    // ── Auth ──────────────────────────────────────────────────────────────

    public async Task<TestApi> AsOwnerAsync()
    {
        var response = await Client.PostAsJsonAsync("/api/v1/auth/login", new PasswordLoginRequest(ApiFactory.OwnerEmail, ApiFactory.OwnerPassword), Json);
        await UseSessionAsync(response);
        return this;
    }

    public async Task<TestApi> AsTechnicianAsync(string phone)
    {
        var otp = await PostAsync<OtpRequestedResponse>("/api/v1/auth/otp/request", new OtpRequest(phone));
        var response = await Client.PostAsJsonAsync("/api/v1/auth/otp/verify", new OtpVerifyRequest(phone, otp.DevelopmentCode!), Json);
        await UseSessionAsync(response);
        return this;
    }

    public async Task UseSessionAsync(HttpResponseMessage response)
    {
        await EnsureSuccessAsync(response);
        var session = (await response.Content.ReadFromJsonAsync<AuthSessionResponse>(Json))!;
        Client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
    }

    // ── HTTP ──────────────────────────────────────────────────────────────

    public async Task<T> GetAsync<T>(string path)
    {
        var response = await Client.GetAsync(path);
        await EnsureSuccessAsync(response);
        return (await response.Content.ReadFromJsonAsync<T>(Json))!;
    }

    public async Task<T> PostAsync<T>(string path, object? body)
    {
        var response = await Client.PostAsJsonAsync(path, body, Json);
        await EnsureSuccessAsync(response);
        return (await response.Content.ReadFromJsonAsync<T>(Json))!;
    }

    public async Task PostAsync(string path, object? body)
    {
        var response = await Client.PostAsJsonAsync(path, body, Json);
        await EnsureSuccessAsync(response);
    }

    public async Task<T> PutAsync<T>(string path, object body)
    {
        var response = await Client.PutAsJsonAsync(path, body, Json);
        await EnsureSuccessAsync(response);
        return (await response.Content.ReadFromJsonAsync<T>(Json))!;
    }

    public Task<HttpResponseMessage> PostRawAsync(string path, object? body) => Client.PostAsJsonAsync(path, body, Json);

    public static async Task<(HttpStatusCode Status, string? Code)> ProblemAsync(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        string? code = null;
        if (body.Length > 0 && JsonDocument.Parse(body).RootElement.TryGetProperty("code", out var c))
        {
            code = c.GetString();
        }

        return (response.StatusCode, code);
    }

    private static async Task EnsureSuccessAsync(HttpResponseMessage response)
    {
        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException($"{response.RequestMessage?.Method} {response.RequestMessage?.RequestUri} → {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        }
    }

    // ── Domain helpers ────────────────────────────────────────────────────

    public async Task<CategoryResponse> CategoryAsync(string code) =>
        (await GetAsync<List<CategoryResponse>>("/api/v1/catalog/categories")).Single(c => c.Code == code);

    public async Task<TechnicianListItem> TechnicianAsync(string fullName) =>
        (await GetAsync<List<TechnicianListItem>>("/api/v1/admin/technicians")).Single(t => t.FullName == fullName);

    /// <summary>A new customer in Kondapur (500084) with one AC job ready for assignment.</summary>
    public async Task<(CustomerResponse Customer, Guid ServiceRequestId)> NewAcJobAsync(string categoryCode = "AC")
    {
        var customer = await PostAsync<CustomerResponse>("/api/v1/admin/customers", new CreateCustomerRequest(
            "Test Customer", RandomPhone(), null, null, "en", RequestChannel.Phone, null,
            new AddressInput("Home", "Flat 1, Test Residency", null, "Near Test Park", "Kondapur", "Hyderabad", "Telangana", "500084", 17.4615, 78.3634)));
        var category = await CategoryAsync(categoryCode);

        var created = await PostAsync<IdResponse>("/api/v1/admin/service-requests", new CreateServiceRequestRequest(
            customer.Id, customer.Addresses[0].Id, null, category.Id, category.IssueTypes[0].Id,
            "Integration test job", RequestChannel.Phone, Priority.Normal, null, null, null, null, null, false, null));
        return (customer, created.Id);
    }

    public Task<AssignmentResponse> AssignAsync(Guid serviceRequestId, Guid technicianId, bool markAccepted = false) =>
        PostAsync<AssignmentResponse>($"/api/v1/admin/service-requests/{serviceRequestId}/assign",
            new AssignTechnicianRequest(technicianId, "Integration test override", markAccepted));

    /// <summary>The 4-digit code from the latest COMPLETION_CODE WhatsApp message for this job.</summary>
    public async Task<string> LatestCompletionCodeAsync(Guid serviceRequestId)
    {
        await factory.DrainOutboxAsync();
        var messages = await GetAsync<List<NotificationResponse>>($"/api/v1/admin/notifications?serviceRequestId={serviceRequestId}");
        var body = messages.Where(m => m.TemplateCode == "COMPLETION_CODE").OrderByDescending(m => m.CreatedAt).First().RenderedBody;
        return CodePattern().Match(body).Groups[1].Value;
    }

    [GeneratedRegex(@"completion code is (\d{4})")]
    private static partial Regex CodePattern();

    private static JsonSerializerOptions CreateJson()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseUpper));
        return options;
    }
}
