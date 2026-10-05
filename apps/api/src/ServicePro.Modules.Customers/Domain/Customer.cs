using ServicePro.BuildingBlocks.Persistence;
using ServicePro.Contracts;
using ServicePro.SharedKernel.Domain;
using ServicePro.SharedKernel.Results;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.Modules.Customers.Domain;

/// <summary>A household or business we serve (PLAN.md §7.4). Phone is the de-duplication key.</summary>
public sealed class Customer : TenantOwnedAggregateRoot, IAudited
{
    private readonly List<CustomerAddress> _addresses = [];
    private readonly List<CustomerAppliance> _appliances = [];

    private Customer()
    {
    }

    private Customer(string fullName, PhoneNumber phone, RequestChannel firstSource)
    {
        FullName = fullName.Trim();
        PrimaryPhone = phone;
        FirstSource = firstSource;
        RefreshPhoneDigits();
    }

    public string FullName { get; private set; } = string.Empty;

    public PhoneNumber PrimaryPhone { get; private set; } = null!;

    public PhoneNumber? AlternatePhone { get; private set; }

    public string? Email { get; private set; }

    public string PreferredLanguage { get; private set; } = "en";

    public RequestChannel FirstSource { get; private set; }

    public bool IsBlocked { get; private set; }

    /// <summary>Digits of all phone numbers, for partial-number search ("last 4 digits").</summary>
    public string PhoneDigits { get; private set; } = string.Empty;

    public string? Notes { get; private set; }

    public IReadOnlyCollection<CustomerAddress> Addresses => _addresses;

    public IReadOnlyCollection<CustomerAppliance> Appliances => _appliances;

    public static Customer Create(string fullName, PhoneNumber phone, RequestChannel firstSource) =>
        new(fullName, phone, firstSource);

    public void UpdateDetails(string fullName, PhoneNumber? alternatePhone, string? email, string preferredLanguage, string? notes)
    {
        FullName = fullName.Trim();
        AlternatePhone = alternatePhone;
        Email = string.IsNullOrWhiteSpace(email) ? null : email.Trim().ToLowerInvariant();
        PreferredLanguage = preferredLanguage;
        Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
        RefreshPhoneDigits();
    }

    public void ChangePrimaryPhone(PhoneNumber phone)
    {
        PrimaryPhone = phone;
        RefreshPhoneDigits();
    }

    private void RefreshPhoneDigits() =>
        PhoneDigits = string.Join(' ', new[] { PrimaryPhone?.Value, AlternatePhone?.Value }
            .Where(p => p is not null)
            .Select(p => p![1..]));

    public void SetBlocked(bool isBlocked) => IsBlocked = isBlocked;

    public CustomerAddress AddAddress(AddressDetails details, bool makeDefault)
    {
        var address = new CustomerAddress(Id, details);
        _addresses.Add(address);
        if (makeDefault || _addresses.Count == 1)
        {
            SetDefaultAddress(address.Id);
        }

        return address;
    }

    public Result UpdateAddress(Guid addressId, AddressDetails details, bool makeDefault)
    {
        var address = _addresses.FirstOrDefault(a => a.Id == addressId);
        if (address is null)
        {
            return Error.NotFound("address.not_found", "That address doesn't belong to this customer.");
        }

        address.Update(details);
        if (makeDefault)
        {
            SetDefaultAddress(addressId);
        }

        return Result.Success();
    }

    public CustomerAppliance AddAppliance(ApplianceDetails details)
    {
        var appliance = new CustomerAppliance(Id, details);
        _appliances.Add(appliance);
        return appliance;
    }

    public Result UpdateAppliance(Guid applianceId, ApplianceDetails details)
    {
        var appliance = _appliances.FirstOrDefault(a => a.Id == applianceId);
        if (appliance is null)
        {
            return Error.NotFound("appliance.not_found", "That appliance doesn't belong to this customer.");
        }

        appliance.Update(details);
        return Result.Success();
    }

    private void SetDefaultAddress(Guid addressId)
    {
        foreach (var address in _addresses)
        {
            address.SetDefault(address.Id == addressId);
        }
    }
}

public sealed record AddressDetails(
    string? Label,
    string Line1,
    string? Line2,
    string? Landmark,
    string Locality,
    string City,
    string State,
    string Pincode,
    GeoLocation? Location);

public sealed class CustomerAddress : TenantOwnedEntity
{
    private CustomerAddress()
    {
    }

    internal CustomerAddress(Guid customerId, AddressDetails details)
    {
        CustomerId = customerId;
        Update(details);
    }

    public Guid CustomerId { get; private set; }

    public string? Label { get; private set; }

    public string Line1 { get; private set; } = string.Empty;

    public string? Line2 { get; private set; }

    /// <summary>Landmarks matter more than street names for Indian addresses (PLAN.md §7.4).</summary>
    public string? Landmark { get; private set; }

    public string Locality { get; private set; } = string.Empty;

    public string City { get; private set; } = string.Empty;

    public string State { get; private set; } = string.Empty;

    public string Pincode { get; private set; } = string.Empty;

    public double? Latitude { get; private set; }

    public double? Longitude { get; private set; }

    public bool IsDefault { get; private set; }

    public GeoLocation? Location => GeoColumns.ToLocation(Latitude, Longitude);

    internal void Update(AddressDetails details)
    {
        Label = Clean(details.Label);
        Line1 = details.Line1.Trim();
        Line2 = Clean(details.Line2);
        Landmark = Clean(details.Landmark);
        Locality = details.Locality.Trim();
        City = details.City.Trim();
        State = details.State.Trim();
        Pincode = details.Pincode.Trim();
        Latitude = details.Location?.Latitude;
        Longitude = details.Location?.Longitude;
    }

    internal void SetDefault(bool isDefault) => IsDefault = isDefault;

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

public sealed record ApplianceDetails(
    Guid CategoryId,
    string? Brand,
    string? ApplianceType,
    string? Capacity,
    string? ModelNumber,
    string? SerialNumber,
    int? PurchaseYear,
    DateOnly? WarrantyUntil);

public sealed class CustomerAppliance : TenantOwnedEntity
{
    private CustomerAppliance()
    {
    }

    internal CustomerAppliance(Guid customerId, ApplianceDetails details)
    {
        CustomerId = customerId;
        Update(details);
    }

    public Guid CustomerId { get; private set; }

    public Guid CategoryId { get; private set; }

    public string? Brand { get; private set; }

    public string? ApplianceType { get; private set; }

    public string? Capacity { get; private set; }

    public string? ModelNumber { get; private set; }

    public string? SerialNumber { get; private set; }

    public int? PurchaseYear { get; private set; }

    public DateOnly? WarrantyUntil { get; private set; }

    internal void Update(ApplianceDetails details)
    {
        CategoryId = details.CategoryId;
        Brand = details.Brand?.Trim();
        ApplianceType = details.ApplianceType?.Trim();
        Capacity = details.Capacity?.Trim();
        ModelNumber = details.ModelNumber?.Trim();
        SerialNumber = details.SerialNumber?.Trim();
        PurchaseYear = details.PurchaseYear;
        WarrantyUntil = details.WarrantyUntil;
    }
}
