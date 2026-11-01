using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using ServicePro.IntegrationTests.Infrastructure;
using ServicePro.Modules.Identity.Application;
using ServicePro.Modules.Notifications;
using ServicePro.Modules.Technicians.Application;
using ServicePro.Modules.Technicians.Domain;

namespace ServicePro.IntegrationTests;

/// <summary>"Join as a partner": apply from the app, the office approves or turns it down.</summary>
public sealed class PartnerApplicationTests(ApiFactory factory)
{
    private const string Applications = "/api/v1/admin/technician-applications";
    private const string Aadhaar = "2345 6789 0124"; // checksum-valid test number
    private static readonly DateOnly Born = new(1994, 5, 17);

    /// <summary>The applicant's side of phone verification: ask for a code, enter it, get the proof.</summary>
    private async Task<string> VerifyAsync(string phone)
    {
        var api = new TestApi(factory);
        var code = await api.PostAsync<PartnerCodeResponse>("/api/v1/public/technician-applications/code", new PartnerCodeRequest(phone));
        var verified = await api.PostAsync<PartnerVerifiedResponse>("/api/v1/public/technician-applications/verify", new PartnerVerifyRequest(phone, code.DevelopmentCode!));
        return verified.VerificationToken;
    }

    /// <summary>Uploads a document with the verified-number proof; returns the response.</summary>
    private async Task<HttpResponseMessage> UploadRawAsync(string phone, string token, string kind, string contentType = "image/png")
    {
        using var form = new MultipartFormDataContent
        {
            { new StringContent(phone), "phone" },
            { new StringContent(token), "verificationToken" },
            { new StringContent(kind), "kind" },
        };
        var image = new ByteArrayContent(Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="));
        image.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        form.Add(image, "file", "photo.png");
        return await new TestApi(factory).Client.PostAsync("/api/v1/public/technician-applications/documents", form);
    }

    private async Task<string> UploadAsync(string phone, string token, string kind)
    {
        var response = await UploadRawAsync(phone, token, kind);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ApplicantDocumentUploaded>(TestApi.Json))!.Token;
    }

    /// <summary>A complete application: verified number, ID details and the required photos.</summary>
    private async Task<SubmitTechnicianApplicationRequest> CompleteAsync(string phone, string pincode = "500084")
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        var ac = await owner.CategoryAsync("AC");
        var fridge = await owner.CategoryAsync("FRIDGE");
        var token = await VerifyAsync(phone);
        string[] documents = [await UploadAsync(phone, token, "PROFILE_PHOTO"), await UploadAsync(phone, token, "AADHAAR_FRONT")];
        return new SubmitTechnicianApplicationRequest(
            "Mahesh Goud", phone, pincode, "Kondapur", [ac.Id, fridge.Id], 6, "Split and window ACs, fridges.", token,
            Born, "Flat 302, Sai Residency, Road No. 4", Aadhaar, "abcde1234f", documents);
    }

    private async Task<(SubmitTechnicianApplicationRequest Request, TechnicianApplicationReceived Received)> ApplyAsync(string? phone = null, string pincode = "500084")
    {
        var request = await CompleteAsync(phone ?? TestApi.RandomPhone(), pincode);
        var received = await new TestApi(factory).PostAsync<TechnicianApplicationReceived>("/api/v1/public/technician-applications", request);
        return (request, received);
    }

    [Fact]
    public async Task An_application_waits_for_review_and_a_repeat_is_the_same_application()
    {
        var (request, first) = await ApplyAsync();
        first.Status.ShouldBe(TechnicianApplicationStatus.Pending);
        first.AlreadyApplied.ShouldBeFalse();

        var again = await new TestApi(factory).PostAsync<TechnicianApplicationReceived>("/api/v1/public/technician-applications", request);
        again.Id.ShouldBe(first.Id);
        again.AlreadyApplied.ShouldBeTrue();

        var owner = await new TestApi(factory).AsOwnerAsync();
        var pending = await owner.GetAsync<List<TechnicianApplicationResponse>>($"{Applications}?status=PENDING");
        var mine = pending.Single(a => a.Id == first.Id);
        mine.Appliances.ShouldBe(["AC", "Refrigerator"], ignoreOrder: true);
        mine.InServiceArea.ShouldBeTrue();
        mine.Locality.ShouldBe("Kondapur");
        mine.AddressLine.ShouldBe("Flat 302, Sai Residency, Road No. 4");
        mine.DateOfBirth.ShouldBe(Born);
        mine.AadhaarLast4.ShouldBe("0124"); // never the whole number
        mine.Pan.ShouldBe("ABCDE1234F");
        mine.Documents.Select(d => d.Kind).ShouldBe([ApplicantDocumentKind.ProfilePhoto, ApplicantDocumentKind.AadhaarFront]);

        // The office opens the photos; nobody else can.
        var photo = mine.Documents[0].Url;
        var opened = await owner.Client.GetAsync(photo);
        opened.StatusCode.ShouldBe(HttpStatusCode.OK);
        opened.Content.Headers.ContentType!.MediaType.ShouldBe("image/png");
        (await new TestApi(factory).Client.GetAsync(photo)).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task An_application_needs_id_details_and_the_required_photos()
    {
        var phone = TestApi.RandomPhone();
        var complete = await CompleteAsync(phone);
        async Task<(HttpStatusCode, string?)> Send(SubmitTechnicianApplicationRequest request) =>
            await TestApi.ProblemAsync(await new TestApi(factory).PostRawAsync("/api/v1/public/technician-applications", request));

        (await Send(complete with { AadhaarNumber = "2345 6789 0123" })).ShouldBe((HttpStatusCode.BadRequest, (string?)null));
        (await Send(complete with { Pan = "12345" })).ShouldBe((HttpStatusCode.BadRequest, (string?)null));
        (await Send(complete with { AddressLine = " " })).ShouldBe((HttpStatusCode.BadRequest, (string?)null));
        (await Send(complete with { DateOfBirth = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(-16)) })).ShouldBe((HttpStatusCode.BadRequest, "application.age"));
        (await Send(complete with { Documents = [complete.Documents![0]] })).ShouldBe((HttpStatusCode.BadRequest, "application.documents_missing"));

        // An upload made for another number doesn't count.
        var other = TestApi.RandomPhone();
        var stranger = await UploadAsync(other, await VerifyAsync(other), "AADHAAR_FRONT");
        (await Send(complete with { Documents = [complete.Documents![0], stranger] })).ShouldBe((HttpStatusCode.BadRequest, "application.document_invalid"));
    }

    [Fact]
    public async Task Uploads_need_the_verified_number_and_a_photo()
    {
        var phone = TestApi.RandomPhone();
        var token = await VerifyAsync(phone);

        (await TestApi.ProblemAsync(await UploadRawAsync(phone, "forged", "PROFILE_PHOTO"))).ShouldBe((HttpStatusCode.BadRequest, "application.phone_unverified"));
        (await TestApi.ProblemAsync(await UploadRawAsync(phone, token, "PROFILE_PHOTO", "application/pdf"))).ShouldBe((HttpStatusCode.BadRequest, "application.file_invalid"));
        (await UploadRawAsync(phone, token, "AADHAAR_FRONT", "application/pdf")).StatusCode.ShouldBe(HttpStatusCode.OK); // e-Aadhaar
        (await TestApi.ProblemAsync(await UploadRawAsync(phone, token, "PASSPORT"))).ShouldBe((HttpStatusCode.BadRequest, "application.document_kind"));
    }

    [Fact]
    public async Task An_applicant_signing_in_gets_a_code_and_sees_the_application_is_under_review()
    {
        var phone = TestApi.RandomPhone();
        await ApplyAsync(phone);
        var api = new TestApi(factory);

        var otp = await api.PostAsync<OtpRequestedResponse>("/api/v1/auth/otp/request", new OtpRequest(phone));
        otp.DevelopmentCode.ShouldNotBeNull(); // a real code, not the pretend answer

        var signIn = await api.Client.PostAsJsonAsync("/api/v1/auth/otp/verify", new OtpVerifyRequest(phone, otp.DevelopmentCode!), TestApi.Json);
        signIn.StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        var problem = await signIn.Content.ReadFromJsonAsync<Dictionary<string, System.Text.Json.JsonElement>>(TestApi.Json);
        problem!["code"].GetString().ShouldBe("auth.partner_applicant");
        var pass = problem["statusPass"].GetString()!;

        var status = await api.PostAsync<PartnerApplicationStatusResponse>("/api/v1/public/technician-applications/status", new PartnerApplicationStatusRequest(phone, pass));
        status.Status.ShouldBe(TechnicianApplicationStatus.Pending);
        status.FullName.ShouldBe("Mahesh Goud");

        // The pass is for this number only.
        var other = await api.PostRawAsync("/api/v1/public/technician-applications/status", new PartnerApplicationStatusRequest(TestApi.RandomPhone(), pass));
        (await TestApi.ProblemAsync(other)).ShouldBe((HttpStatusCode.BadRequest, "application.phone_unverified"));

        // Verifying on the form again says it's already waiting.
        var code = await api.PostAsync<PartnerCodeResponse>("/api/v1/public/technician-applications/code", new PartnerCodeRequest(phone));
        var verified = await api.PostAsync<PartnerVerifiedResponse>("/api/v1/public/technician-applications/verify", new PartnerVerifyRequest(phone, code.DevelopmentCode!));
        verified.HasPendingApplication.ShouldBeTrue();
    }

    [Fact]
    public async Task A_number_that_never_applied_is_told_it_is_not_registered()
    {
        var response = await new TestApi(factory).PostRawAsync("/api/v1/auth/otp/request", new OtpRequest(TestApi.RandomPhone()));
        (await TestApi.ProblemAsync(response)).ShouldBe((HttpStatusCode.NotFound, "auth.not_registered"));
    }

    [Fact]
    public async Task Approving_creates_the_technician_who_can_then_sign_in_and_is_welcomed_on_whatsapp()
    {
        var (request, received) = await ApplyAsync();
        var owner = await new TestApi(factory).AsOwnerAsync();

        var approved = await owner.PostAsync<TechnicianApplicationResponse>($"{Applications}/{received.Id}/approve", null);
        approved.Status.ShouldBe(TechnicianApplicationStatus.Approved);
        approved.TechnicianId.ShouldNotBeNull();

        var technician = await owner.GetAsync<TechnicianResponse>($"/api/v1/admin/technicians/{approved.TechnicianId}");
        technician.FullName.ShouldBe("Mahesh Goud");
        technician.Skills.Select(s => s.CategoryId).ShouldBe(request.CategoryIds, ignoreOrder: true);
        technician.ServiceAreaIds.ShouldNotBeEmpty(); // the areas covering 500084
        (await new TestApi(factory).Client.GetAsync($"/api/v1/technicians/{technician.Id}/photo")).StatusCode.ShouldBe(HttpStatusCode.OK); // their profile photo

        // Their number now signs in to the partner app.
        var partner = await new TestApi(factory).AsTechnicianAsync(technician.Phone);
        (await partner.GetAsync<MeResponse>("/api/v1/auth/me")).TechnicianId.ShouldBe(technician.Id);

        await factory.DrainOutboxAsync();
        var messages = await owner.GetAsync<List<NotificationResponse>>("/api/v1/admin/notifications?take=200");
        messages.ShouldContain(m => m.TemplateCode == "PARTNER_APPROVED" && m.RecipientAddress == technician.Phone);
    }

    [Fact]
    public async Task A_turned_down_application_keeps_the_reason_and_cant_be_approved_later()
    {
        var (_, received) = await ApplyAsync();
        var owner = await new TestApi(factory).AsOwnerAsync();

        var rejected = await owner.PostAsync<TechnicianApplicationResponse>($"{Applications}/{received.Id}/reject", new RejectTechnicianApplicationRequest("Not enough experience yet."));
        rejected.Status.ShouldBe(TechnicianApplicationStatus.Rejected);
        rejected.RejectionReason.ShouldBe("Not enough experience yet.");

        // They see the reason on their status page.
        var status = await new TestApi(factory).PostAsync<PartnerApplicationStatusResponse>(
            "/api/v1/public/technician-applications/status", new PartnerApplicationStatusRequest(rejected.Phone, await VerifyAsync(rejected.Phone)));
        status.Status.ShouldBe(TechnicianApplicationStatus.Rejected);
        status.RejectionReason.ShouldBe("Not enough experience yet.");

        var late = await owner.PostRawAsync($"{Applications}/{received.Id}/approve", null);
        (await TestApi.ProblemAsync(late)).ShouldBe((HttpStatusCode.Conflict, "application.already_reviewed"));
    }

    [Fact]
    public async Task An_application_needs_a_verified_number()
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        var ac = await owner.CategoryAsync("AC");
        var phone = TestApi.RandomPhone();
        var otherPhone = TestApi.RandomPhone();
        SubmitTechnicianApplicationRequest Application(string? token) => new("Kiran", phone, "500084", null, [ac.Id], 2, null, token, Born, "H.No. 1-2", Aadhaar);

        // No proof, a made-up one, or one for another number: refused.
        foreach (var token in new[] { null, "not-a-real-proof", await VerifyAsync(otherPhone) })
        {
            var response = await new TestApi(factory).PostRawAsync("/api/v1/public/technician-applications", Application(token));
            (await TestApi.ProblemAsync(response)).ShouldBe((HttpStatusCode.BadRequest, "application.phone_unverified"));
        }

        // A wrong code doesn't verify.
        var api = new TestApi(factory);
        await api.PostAsync<PartnerCodeResponse>("/api/v1/public/technician-applications/code", new PartnerCodeRequest(phone));
        var wrong = await api.PostRawAsync("/api/v1/public/technician-applications/verify", new PartnerVerifyRequest(phone, "000000"));
        wrong.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task An_existing_partner_is_told_to_sign_in_before_any_code_is_sent()
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        var suresh = await owner.TechnicianAsync("Suresh Reddy");

        var response = await new TestApi(factory).PostRawAsync("/api/v1/public/technician-applications/code", new PartnerCodeRequest(suresh.Phone));

        (await TestApi.ProblemAsync(response)).ShouldBe((HttpStatusCode.Conflict, "application.already_partner"));
    }

    [Fact]
    public async Task An_existing_partner_is_told_to_sign_in()
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        var ravi = await owner.TechnicianAsync("Ravi Kumar");
        var ac = await owner.CategoryAsync("AC");

        var response = await new TestApi(factory).PostRawAsync("/api/v1/public/technician-applications",
            new SubmitTechnicianApplicationRequest("Ravi Kumar", ravi.Phone, "500084", null, [ac.Id], 5, null, null, Born, "H.No. 1-2", Aadhaar));

        (await TestApi.ProblemAsync(response)).ShouldBe((HttpStatusCode.Conflict, "application.already_partner"));
    }

    [Fact]
    public async Task A_bot_filling_the_hidden_field_stores_nothing()
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        var ac = await owner.CategoryAsync("AC");
        var phone = TestApi.RandomPhone();

        var received = await new TestApi(factory).PostAsync<TechnicianApplicationReceived>("/api/v1/public/technician-applications",
            new SubmitTechnicianApplicationRequest("Bot", phone, "500084", null, [ac.Id], 1, null, Website: "https://spam.example"));

        received.Id.ShouldBe(Guid.Empty);
        (await owner.GetAsync<List<TechnicianApplicationResponse>>(Applications)).ShouldNotContain(a => a.Phone.EndsWith(phone, StringComparison.Ordinal));
    }

    [Fact]
    public async Task Only_admins_review_applications()
    {
        var owner = await new TestApi(factory).AsOwnerAsync();
        var priya = await owner.TechnicianAsync("Priya Sharma");
        var technician = await new TestApi(factory).AsTechnicianAsync(priya.Phone);

        (await technician.Client.GetAsync(Applications)).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        (await new TestApi(factory).Client.GetAsync(Applications)).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        (await new TestApi(factory).Client.PostAsJsonAsync($"{Applications}/{Guid.NewGuid()}/approve", new { }, TestApi.Json)).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }
}
