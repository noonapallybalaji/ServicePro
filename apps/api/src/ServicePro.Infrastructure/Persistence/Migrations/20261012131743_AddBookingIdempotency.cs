using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ServicePro.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddBookingIdempotency : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "external_reference",
                schema: "ops",
                table: "service_requests",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_service_requests_tenant_id_channel_external_reference",
                schema: "ops",
                table: "service_requests",
                columns: new[] { "tenant_id", "channel", "external_reference" },
                unique: true,
                filter: "external_reference IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_service_requests_tenant_id_channel_external_reference",
                schema: "ops",
                table: "service_requests");

            migrationBuilder.DropColumn(
                name: "external_reference",
                schema: "ops",
                table: "service_requests");
        }
    }
}
