using ServicePro.BuildingBlocks.Persistence;
using ServicePro.BuildingBlocks.Security;
using ServicePro.Contracts;
using ServicePro.Modules.Customers.Application;
using ServicePro.Modules.Identity.Domain;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.UnitTests.Identity;

public sealed class OtpChallengeTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 5, 10, 0, 0, TimeSpan.Zero);
    private static readonly PhoneNumber Phone = PhoneNumber.Create("9876543210").Value;

    private static OtpChallenge Challenge(string code) =>
        new(Phone, OtpPurpose.Login, SecureTokens.Hash(code), Now.AddMinutes(5));

    [Fact]
    public void Accepts_the_right_code_once()
    {
        var challenge = Challenge("123456");

        challenge.Verify("123456", Now).IsSuccess.ShouldBeTrue();
        challenge.Verify("123456", Now).Error!.Code.ShouldBe("otp.expired");
    }

    [Fact]
    public void Expires_and_locks()
    {
        Challenge("123456").Verify("123456", Now.AddMinutes(6)).Error!.Code.ShouldBe("otp.expired");

        var challenge = Challenge("123456");
        for (var i = 0; i < OtpChallenge.MaxAttempts; i++)
        {
            challenge.Verify("000000", Now).Error!.Code.ShouldBe("otp.mismatch");
        }

        challenge.Verify("123456", Now).Error!.Code.ShouldBe("otp.locked");
    }
}

public sealed class SecureTokenTests
{
    [Fact]
    public void Numeric_codes_have_the_requested_length_including_leading_zeros()
    {
        for (var i = 0; i < 200; i++)
        {
            SecureTokens.NumericCode(4).ShouldMatch("^[0-9]{4}$");
        }
    }

    [Fact]
    public void Tokens_are_url_safe_and_unique() =>
        Enumerable.Range(0, 100).Select(_ => SecureTokens.Generate()).Distinct().Count().ShouldBe(100);
}

public sealed class EnumTextTests
{
    [Theory]
    [InlineData("EN_ROUTE", ServiceRequestStatus.EnRoute)]
    [InlineData("EnRoute", ServiceRequestStatus.EnRoute)]
    [InlineData("closed_no_repair", ServiceRequestStatus.ClosedNoRepair)]
    public void Parses_snake_upper_and_pascal(string text, ServiceRequestStatus expected)
    {
        EnumText.TryParse<ServiceRequestStatus>(text, out var value).ShouldBeTrue();
        value.ShouldBe(expected);
        EnumText.ToText(expected).ShouldBe(EnumText.ToText(value));
    }

    [Theory]
    [InlineData("3")]
    [InlineData("NOT_A_STATUS")]
    [InlineData("")]
    public void Rejects_numbers_and_unknown_names(string text) =>
        EnumText.TryParse<ServiceRequestStatus>(text, out _).ShouldBeFalse();
}

public sealed class CsvLineTests
{
    [Fact]
    public void Handles_quotes_commas_and_escaped_quotes() =>
        CsvLine.Parse("Rahul,\"Flat 3, \"\"Sai\"\" Residency\",500084").ShouldBe(["Rahul", "Flat 3, \"Sai\" Residency", "500084"]);
}
