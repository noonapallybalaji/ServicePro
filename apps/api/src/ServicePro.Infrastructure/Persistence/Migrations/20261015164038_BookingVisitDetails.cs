using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ServicePro.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class BookingVisitDetails : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "access_notes",
                schema: "ops",
                table: "service_requests",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "appliance_under_warranty",
                schema: "ops",
                table: "service_requests",
                type: "boolean",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "visit_contact_name",
                schema: "ops",
                table: "service_requests",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "visit_contact_phone",
                schema: "ops",
                table: "service_requests",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "access_notes",
                schema: "ops",
                table: "service_requests");

            migrationBuilder.DropColumn(
                name: "appliance_under_warranty",
                schema: "ops",
                table: "service_requests");

            migrationBuilder.DropColumn(
                name: "visit_contact_name",
                schema: "ops",
                table: "service_requests");

            migrationBuilder.DropColumn(
                name: "visit_contact_phone",
                schema: "ops",
                table: "service_requests");
        }
    }
}
