using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ServicePro.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class CustomerAddressArchive : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "is_archived",
                schema: "crm",
                table: "customer_addresses",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "is_archived",
                schema: "crm",
                table: "customer_addresses");
        }
    }
}
