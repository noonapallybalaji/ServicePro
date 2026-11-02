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

public sealed class TwilioChannelTests
{
    private static Microsoft.Extensions.Options.IOptions<NotificationOptions> Options(TwilioOptions twilio) =>
        Microsoft.Extensions.Options.Options.Create(new NotificationOptions { Twilio = twilio });

    private static readonly TwilioOptions Account = new() { AccountSid = "AC123", AuthToken = "token", SmsFrom = "+15005550006", WhatsAppFrom = "+14155238886" };

    [Fact]
    public void Sms_sends_the_rendered_text_from_the_twilio_number()
    {
        var form = new TwilioSmsChannel(new HttpClient(), Options(Account))
            .BuildForm(new OutgoingMessage("+919876543210", "OTP_LOGIN", null, "en", ["482913"], "Your code is 482913"))
            .ToDictionary();

        form["To"].ShouldBe("+919876543210");
        form["From"].ShouldBe("+15005550006");
        form["Body"].ShouldBe("Your code is 482913");
    }

    [Fact]
    public void Sms_prefers_a_messaging_service_over_a_single_number()
    {
        var form = new TwilioSmsChannel(new HttpClient(), Options(new TwilioOptions { AccountSid = "AC123", AuthToken = "t", SmsFrom = "+15005550006", MessagingServiceSid = "MG1" }))
            .BuildForm(new OutgoingMessage("+919876543210", "SR_CONFIRMED", null, "en", [], "Booked"))
            .ToDictionary();

        form["MessagingServiceSid"].ShouldBe("MG1");
        form.ShouldNotContainKey("From");
    }

    [Fact]
    public void Whatsapp_sends_an_approved_content_template_with_numbered_variables()
    {
        var form = new TwilioWhatsAppChannel(new HttpClient(), Options(Account))
            .BuildForm(new OutgoingMessage("+919876543210", "SR_CREATED", "HXabc", "en", ["Rahul", "SR-10001"], "ignored"))
            .ToDictionary();

        form["To"].ShouldBe("whatsapp:+919876543210");
        form["From"].ShouldBe("whatsapp:+14155238886");
        form["ContentSid"].ShouldBe("HXabc");
        JsonSerializer.Deserialize<Dictionary<string, string>>(form["ContentVariables"]).ShouldBe(new Dictionary<string, string> { ["1"] = "Rahul", ["2"] = "SR-10001" });
        form.ShouldNotContainKey("Body");
    }

    [Fact]
    public void Whatsapp_without_a_content_template_sends_the_text()
    {
        var form = new TwilioWhatsAppChannel(new HttpClient(), Options(Account))
            .BuildForm(new OutgoingMessage("+919876543210", "SR_CREATED", null, "en", ["Rahul"], "Hi Rahul, booked."))
            .ToDictionary();

        form["Body"].ShouldBe("Hi Rahul, booked.");
        form.ShouldNotContainKey("ContentSid");
    }
}

public sealed class OneTimeCodeDeliveryTests
{
    [Fact]
    public void Whatsapp_code_templates_carry_the_copy_code_button()
    {
        var payload = MetaWhatsAppChannel.BuildPayload(new OutgoingMessage(
            "+919876543210", "OTP_BOOKING", "otp_booking_v1", "en", ["482913"], "ignored"));

        using var json = JsonDocument.Parse(JsonSerializer.Serialize(payload));
        var components = json.RootElement.GetProperty("template").GetProperty("components");
        components.GetArrayLength().ShouldBe(2);
        var button = components[1];
        button.GetProperty("type").GetString().ShouldBe("button");
        button.GetProperty("sub_type").GetString().ShouldBe("url");
        button.GetProperty("parameters")[0].GetProperty("text").GetString().ShouldBe("482913");
    }

    [Fact]
    public void Msg91_flow_payload_sends_variables_by_name()
    {
        var payload = Msg91SmsChannel.BuildPayload(
            new OutgoingMessage("+919876543210", "OTP_LOGIN", "dlt-flow-id", "en", ["482913"], "ignored"),
            new Dictionary<string, string> { ["code"] = "482913" });

        using var json = JsonDocument.Parse(JsonSerializer.Serialize(payload));
        var root = json.RootElement;
        root.GetProperty("template_id").GetString().ShouldBe("dlt-flow-id");
        var recipient = root.GetProperty("recipients")[0];
        recipient.GetProperty("mobiles").GetString().ShouldBe("919876543210");
        recipient.GetProperty("code").GetString().ShouldBe("482913");
    }

    [Fact]
    public void Preferred_live_channel_is_tried_first_then_other_live_channels()
    {
        var order = OtpSender.DeliveryOrder(NotificationChannel.WhatsApp,
            [new StubChannel(NotificationChannel.Sms, live: true), new StubChannel(NotificationChannel.WhatsApp, live: true)]);

        order.ShouldBe([NotificationChannel.WhatsApp, NotificationChannel.Sms]);
    }

    [Fact]
    public void A_log_only_channel_is_never_used_as_a_fallback()
    {
        var order = OtpSender.DeliveryOrder(NotificationChannel.WhatsApp,
            [new StubChannel(NotificationChannel.Sms, live: true), new StubChannel(NotificationChannel.WhatsApp, live: false)]);

        order.ShouldBe([NotificationChannel.Sms]);
    }

    [Fact]
    public void With_nothing_live_the_preferred_channel_logs_the_code_for_development()
    {
        var order = OtpSender.DeliveryOrder(NotificationChannel.Sms,
            [new StubChannel(NotificationChannel.Sms, live: false), new StubChannel(NotificationChannel.WhatsApp, live: false)]);

        order.ShouldBe([NotificationChannel.Sms]);
    }

    [Fact]
    public void Codes_never_go_to_the_in_app_bell()
    {
        var everything = new INotificationChannel[]
        {
            new InAppChannel(), new StubChannel(NotificationChannel.WhatsApp, live: true), new StubChannel(NotificationChannel.Sms, live: true),
        };
        OtpSender.DeliveryOrder(NotificationChannel.WhatsApp, everything).ShouldBe([NotificationChannel.WhatsApp, NotificationChannel.Sms]);

        // Nothing live but the bell (development): the code is still logged on the phone channel.
        var devOnly = new INotificationChannel[] { new InAppChannel(), new StubChannel(NotificationChannel.Sms, live: false) };
        OtpSender.DeliveryOrder(NotificationChannel.Sms, devOnly).ShouldBe([NotificationChannel.Sms]);
    }

    private sealed class StubChannel(NotificationChannel channel, bool live) : INotificationChannel
    {
        public NotificationChannel Channel => channel;

        public bool IsLive => live;

        public Task<SendResult> SendAsync(OutgoingMessage message, CancellationToken ct) => Task.FromResult(SendResult.Ok(null));
    }
}
