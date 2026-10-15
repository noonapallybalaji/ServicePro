using System.Net;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using ServicePro.BuildingBlocks.Web;
using ServicePro.Infrastructure;

namespace ServicePro.UnitTests.Hosting;

public sealed class DatabaseUrlTests
{
    [Fact]
    public void Converts_a_postgres_url_to_a_connection_string()
    {
        var converted = new NpgsqlConnectionStringBuilder(DatabaseUrl.ToConnectionString("postgresql://app_user:p%40ss@db.internal:6543/servicepro"));

        converted.Host.ShouldBe("db.internal");
        converted.Port.ShouldBe(6543);
        converted.Database.ShouldBe("servicepro");
        converted.Username.ShouldBe("app_user");
        converted.Password.ShouldBe("p@ss");
    }

    [Fact]
    public void Leaves_a_normal_connection_string_alone() =>
        DatabaseUrl.ToConnectionString("Host=localhost;Database=servicepro").ShouldBe("Host=localhost;Database=servicepro");
}

public sealed class ClientAddressTests
{
    private static HttpContext Request(string remote, Dictionary<string, string?> settings, string? cfConnectingIp)
    {
        var services = new ServiceCollection()
            .AddSingleton<IConfiguration>(new ConfigurationBuilder().AddInMemoryCollection(settings).Build())
            .BuildServiceProvider();
        var http = new DefaultHttpContext { RequestServices = services };
        http.Connection.RemoteIpAddress = IPAddress.Parse(remote);
        if (cfConnectingIp is not null)
        {
            http.Request.Headers["CF-Connecting-IP"] = cfConnectingIp;
        }

        return http;
    }

    [Fact]
    public void A_remote_caller_cannot_choose_its_rate_limit_bucket_by_default() =>
        ClientAddress.For(Request("203.0.113.9", [], "198.51.100.1")).ShouldBe("203.0.113.9");

    [Fact]
    public void The_local_tunnel_is_trusted() =>
        ClientAddress.For(Request("127.0.0.1", [], "198.51.100.1")).ShouldBe("198.51.100.1");

    [Fact]
    public void Behind_a_provider_edge_the_configured_header_is_trusted() =>
        ClientAddress.For(Request("10.0.0.5", new() { ["Network:TrustClientIpHeader"] = "true" }, "198.51.100.1")).ShouldBe("198.51.100.1");

    [Fact]
    public void A_garbage_header_falls_back_to_the_connection() =>
        ClientAddress.For(Request("10.0.0.5", new() { ["Network:TrustClientIpHeader"] = "true" }, "not-an-ip")).ShouldBe("10.0.0.5");
}
