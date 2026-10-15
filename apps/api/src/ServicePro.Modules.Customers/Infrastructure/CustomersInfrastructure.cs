using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.Extensions.Options;
using ServicePro.BuildingBlocks.Persistence;
using ServicePro.Contracts;
using ServicePro.Contracts.Ports;
using ServicePro.Modules.Customers.Domain;
using ServicePro.SharedKernel.Abstractions;
using ServicePro.SharedKernel.Results;
using ServicePro.SharedKernel.ValueObjects;

namespace ServicePro.Modules.Customers.Infrastructure;

internal static class CustomersSchema
{
    public const string Name = "crm";
}

internal sealed class CustomerConfiguration : IEntityTypeConfiguration<Customer>
{
    public void Configure(EntityTypeBuilder<Customer> builder)
    {
        builder.ToTable("customers", CustomersSchema.Name);
        builder.Property(c => c.FullName).HasMaxLength(200);
        builder.Property(c => c.PrimaryPhone).HasPhoneConversion();
        builder.Property(c => c.AlternatePhone)
            .HasConversion(p => p!.Value, v => PhoneNumber.FromTrusted(v))
            .HasMaxLength(16);
        builder.Property(c => c.Email).HasMaxLength(254);
        builder.Property(c => c.PreferredLanguage).HasMaxLength(8);
        builder.Property(c => c.Notes).HasMaxLength(2000);
        builder.HasIndex(c => new { c.TenantId, c.PrimaryPhone }).IsUnique();
        builder.Property(c => c.PhoneDigits).HasMaxLength(40);
        builder.HasIndex(c => c.FullName);

        builder.HasMany(c => c.Addresses).WithOne().HasForeignKey(a => a.CustomerId).OnDelete(DeleteBehavior.Cascade);
        builder.HasMany(c => c.Appliances).WithOne().HasForeignKey(a => a.CustomerId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(c => c.Addresses).UsePropertyAccessMode(PropertyAccessMode.Field);
        builder.Navigation(c => c.Appliances).UsePropertyAccessMode(PropertyAccessMode.Field);
        builder.HasMany(c => c.Consents).WithOne().HasForeignKey(c => c.CustomerId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(c => c.Consents).UsePropertyAccessMode(PropertyAccessMode.Field);
        builder.Ignore(c => c.ActiveAddresses);
    }
}

internal sealed class CustomerConsentConfiguration : IEntityTypeConfiguration<CustomerConsent>
{
    public void Configure(EntityTypeBuilder<CustomerConsent> builder)
    {
        builder.ToTable("customer_consents", CustomersSchema.Name);
        builder.Property(c => c.PolicyVersion).HasMaxLength(40);
        builder.Property(c => c.Source).HasMaxLength(32);
        builder.HasIndex(c => new { c.CustomerId, c.PolicyVersion }).IsUnique();
    }
}

internal sealed class CustomerAddressConfiguration : IEntityTypeConfiguration<CustomerAddress>
{
    public void Configure(EntityTypeBuilder<CustomerAddress> builder)
    {
        builder.ToTable("customer_addresses", CustomersSchema.Name);
        builder.Property(a => a.Label).HasMaxLength(40);
        builder.Property(a => a.Line1).HasMaxLength(200);
        builder.Property(a => a.Line2).HasMaxLength(200);
        builder.Property(a => a.Landmark).HasMaxLength(200);
        builder.Property(a => a.Locality).HasMaxLength(120);
        builder.Property(a => a.City).HasMaxLength(80);
        builder.Property(a => a.State).HasMaxLength(80);
        builder.Property(a => a.Pincode).HasMaxLength(6).IsFixedLength();
        builder.HasIndex(a => a.Pincode);
        builder.Ignore(a => a.Location);
    }
}

internal sealed class CustomerApplianceConfiguration : IEntityTypeConfiguration<CustomerAppliance>
{
    public void Configure(EntityTypeBuilder<CustomerAppliance> builder)
    {
        builder.ToTable("customer_appliances", CustomersSchema.Name);
        builder.Property(a => a.Brand).HasMaxLength(80);
        builder.Property(a => a.ApplianceType).HasMaxLength(80);
        builder.Property(a => a.Capacity).HasMaxLength(40);
        builder.Property(a => a.ModelNumber).HasMaxLength(80);
        builder.Property(a => a.SerialNumber).HasMaxLength(80);
    }
}

internal sealed class CustomerDirectory(DbContext db) : ICustomerDirectory
{
    public async Task<CustomerInfo?> GetAsync(Guid customerId, CancellationToken ct) =>
        await db.Set<Customer>().AsNoTracking()
            .Where(c => c.Id == customerId)
            .Select(c => new CustomerInfo(c.Id, c.FullName, c.PrimaryPhone, c.PreferredLanguage))
            .FirstOrDefaultAsync(ct);

    public async Task<CustomerInfo?> FindByPhoneAsync(PhoneNumber phone, CancellationToken ct) =>
        await db.Set<Customer>().AsNoTracking()
            .Where(c => c.PrimaryPhone == phone && !c.IsBlocked)
            .Select(c => new CustomerInfo(c.Id, c.FullName, c.PrimaryPhone, c.PreferredLanguage))
            .FirstOrDefaultAsync(ct);

    public async Task<IReadOnlyDictionary<Guid, CustomerInfo>> GetManyAsync(IEnumerable<Guid> customerIds, CancellationToken ct)
    {
        var ids = customerIds.Distinct().ToList();
        return await db.Set<Customer>().AsNoTracking()
            .Where(c => ids.Contains(c.Id))
            .Select(c => new CustomerInfo(c.Id, c.FullName, c.PrimaryPhone, c.PreferredLanguage))
            .ToDictionaryAsync(c => c.Id, ct);
    }

    public async Task<AddressInfo?> GetAddressAsync(Guid addressId, CancellationToken ct) =>
        (await GetAddressesAsync([addressId], ct)).GetValueOrDefault(addressId);

    public async Task<IReadOnlyDictionary<Guid, AddressInfo>> GetAddressesAsync(IEnumerable<Guid> addressIds, CancellationToken ct)
    {
        var ids = addressIds.Distinct().ToList();
        var addresses = await db.Set<CustomerAddress>().AsNoTracking().Where(a => ids.Contains(a.Id)).ToListAsync(ct);
        return addresses.ToDictionary(a => a.Id, a => new AddressInfo(
            a.Id, a.CustomerId, a.Line1, a.Line2, a.Landmark, a.Locality, a.City, a.Pincode, a.Location));
    }

    public async Task<ApplianceInfo?> GetApplianceAsync(Guid applianceId, CancellationToken ct) =>
        await db.Set<CustomerAppliance>().AsNoTracking()
            .Where(a => a.Id == applianceId)
            .Select(a => new ApplianceInfo(a.Id, a.CustomerId, a.CategoryId, a.Brand, a.ModelNumber))
            .FirstOrDefaultAsync(ct);
}

/// <summary>
/// The terms and privacy policy version in force. Change it whenever the published wording
/// changes, so consent records show which version each customer accepted.
/// </summary>
public sealed class LegalOptions
{
    public string PolicyVersion { get; set; } = "unpublished-draft";
}

internal sealed class CustomerRegistry(DbContext db, IOptions<LegalOptions> legal, IClock clock) : ICustomerRegistry
{
    public async Task RecordConsentAsync(Guid customerId, RequestChannel source, CancellationToken ct)
    {
        var customer = await db.Set<Customer>().Include(c => c.Consents).FirstOrDefaultAsync(c => c.Id == customerId, ct);
        customer?.RecordConsent(legal.Value.PolicyVersion, source, clock.UtcNow);
    }

    public async Task<Result<CustomerAddressRef>> FindOrCreateAsync(SelfServiceContact contact, SelfServiceAddress address, CancellationToken ct)
    {
        var result = await FindOrCreateCoreAsync(contact, address, ct);
        if (result.IsSuccess && contact.AcceptedPolicies)
        {
            var customer = db.Set<Customer>().Local.First(c => c.Id == result.Value.Customer.Id);
            if (db.Entry(customer).State != EntityState.Added)
            {
                await db.Entry(customer).Collection(c => c.Consents).LoadAsync(ct);
            }
            customer.RecordConsent(legal.Value.PolicyVersion, contact.Source, clock.UtcNow);
        }

        return result;
    }

    private async Task<Result<CustomerAddressRef>> FindOrCreateCoreAsync(SelfServiceContact contact, SelfServiceAddress address, CancellationToken ct)
    {
        var customer = await db.Set<Customer>()
            .Include(c => c.Addresses)
            .FirstOrDefaultAsync(c => c.PrimaryPhone == contact.Phone, ct);

        if (customer is null)
        {
            customer = Customer.Create(contact.FullName, contact.Phone, contact.Source);
            db.Set<Customer>().Add(customer);
        }
        else if (customer.IsBlocked)
        {
            return Error.Forbidden("booking.unavailable", "We can't take this booking online. Please call us.");
        }

        var existing = customer.Addresses.FirstOrDefault(a =>
            a.Pincode == address.Pincode.Trim() &&
            string.Equals(a.Line1, address.Line1.Trim(), StringComparison.OrdinalIgnoreCase));

        if (existing is null)
        {
            var added = customer.AddAddress(
                new AddressDetails(address.Label, address.Line1, address.Line2, address.Landmark, address.Locality, address.City, address.State, address.Pincode, address.Location),
                makeDefault: false);
            return new CustomerAddressRef(Info(customer), added.Id);
        }

        if ((existing.Location is null && address.Location is not null) || existing.IsArchived)
        {
            customer.UpdateAddress(
                existing.Id,
                new AddressDetails(existing.Label, existing.Line1, existing.Line2, existing.Landmark, existing.Locality, existing.City, existing.State, existing.Pincode,
                    existing.Location ?? address.Location),
                makeDefault: false);
        }

        return new CustomerAddressRef(Info(customer), existing.Id);
    }

    private static CustomerInfo Info(Customer customer) => new(customer.Id, customer.FullName, customer.PrimaryPhone, customer.PreferredLanguage);
}
