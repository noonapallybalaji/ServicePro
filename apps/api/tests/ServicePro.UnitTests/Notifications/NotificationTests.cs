using System.Text.Json;
using ServicePro.Modules.Notifications.Application;
using ServicePro.Modules.Notifications.Channels;
using ServicePro.Modules.Notifications.Domain;

namespace ServicePro.UnitTests.Notifications;

public sealed class NotificationTemplateTests
{
    [Fact]
    public void Extracts_variables_in_order_and_renders_values()
    {
        var template = new NotificationTemplate("SR_CREATED", NotificationChannel.WhatsApp, "en",
            "Hi {{customer}}, request {{ sr }} is confirmed. {{customer}}, track: {{link}}", null);

        template.Variables.ShouldBe(["customer", "sr", "link"]);

        var values = new Dictionary<string, string> { ["customer"] = "Rahul", ["sr"] = "SR-10001", ["link"] = "https://x/t/abc" };
        template.Render(values).ShouldBe("Hi Rahul, request SR-10001 is confirmed. Rahul, track: https://x/t/abc");
        template.OrderedParameters(values).ShouldBe(["Rahul", "SR-10001", "https://x/t/abc"]);
    }

    [Fact]
    public void Missing_values_render_as_empty_rather_than_leaking_placeholders()
    {
        var template = new NotificationTemplate("X", NotificationChannel.Sms, "en", "Code {{code}} for {{sr}}", null);

        template.Render(new Dictionary<string, string> { ["code"] = "1234" }).ShouldBe("Code 1234 for ");
    }

    [Fact]
    public void Every_default_template_has_a_unique_code_per_channel() =>
        DefaultTemplates.All.GroupBy(t => (t.Code, t.Channel)).ShouldAllBe(g => g.Count() == 1);
}

public sealed class MetaWhatsAppChannelTests
{
    [Fact]
    public void Builds_a_cloud_api_template_message()
    {
        var payload = MetaWhatsAppChannel.BuildPayload(new OutgoingMessage(
            "+919876543210", "SR_CREATED", "sr_created_v1", "en", ["Rahul", "SR-10001"], "ignored"));

        using var json = JsonDocument.Parse(JsonSerializer.Serialize(payload));
        var root = json.RootElement;
        root.GetProperty("messaging_product").GetString().ShouldBe("whatsapp");
        root.GetProperty("to").GetString().ShouldBe("919876543210");
        root.GetProperty("type").GetString().ShouldBe("template");
        var template = root.GetProperty("template");
        template.GetProperty("name").GetString().ShouldBe("sr_created_v1");
        template.GetProperty("language").GetProperty("code").GetString().ShouldBe("en");
        var parameters = template.GetProperty("components")[0].GetProperty("parameters");
        parameters.GetArrayLength().ShouldBe(2);
        parameters[1].GetProperty("text").GetString().ShouldBe("SR-10001");
    }

    [Fact]
    public async Task Refuses_to_send_without_an_approved_template_name()
    {
        var channel = new MetaWhatsAppChannel(new HttpClient(), Microsoft.Extensions.Options.Options.Create(new NotificationOptions()));

        var result = await channel.SendAsync(new OutgoingMessage("+919876543210", "SR_CREATED", null, "en", [], "body"), CancellationToken.None);

        result.Succeeded.ShouldBeFalse();
        result.Error!.ShouldContain("approved");
    }
}
