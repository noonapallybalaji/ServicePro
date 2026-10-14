using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ServicePro.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class OnlinePaymentsAndRefunds : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "amount_refunded",
                schema: "billing",
                table: "payments",
                type: "numeric(12,2)",
                precision: 12,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "provider_payment_id",
                schema: "billing",
                table: "payments",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "payment_links",
                schema: "billing",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    invoice_id = table.Column<Guid>(type: "uuid", nullable: false),
                    service_request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    provider = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    provider_link_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    url = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    status = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    paid_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_payment_links", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "refunds",
                schema: "billing",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    payment_id = table.Column<Guid>(type: "uuid", nullable: false),
                    invoice_id = table.Column<Guid>(type: "uuid", nullable: false),
                    service_request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    reason = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    status = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    reference = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    failure_reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    requested_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    requested_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    processed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_refunds", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_payments_provider_payment_id",
                schema: "billing",
                table: "payments",
                column: "provider_payment_id",
                unique: true,
                filter: "provider_payment_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_payment_links_provider_link_id",
                schema: "billing",
                table: "payment_links",
                column: "provider_link_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_payment_links_service_request_id",
                schema: "billing",
                table: "payment_links",
                column: "service_request_id");

            migrationBuilder.CreateIndex(
                name: "ix_payment_links_tenant_id",
                schema: "billing",
                table: "payment_links",
                column: "tenant_id");

            migrationBuilder.CreateIndex(
                name: "ix_refunds_reference",
                schema: "billing",
                table: "refunds",
                column: "reference");

            migrationBuilder.CreateIndex(
                name: "ix_refunds_service_request_id",
                schema: "billing",
                table: "refunds",
                column: "service_request_id");

            migrationBuilder.CreateIndex(
                name: "ix_refunds_tenant_id",
                schema: "billing",
                table: "refunds",
                column: "tenant_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "payment_links",
                schema: "billing");

            migrationBuilder.DropTable(
                name: "refunds",
                schema: "billing");

            migrationBuilder.DropIndex(
                name: "ix_payments_provider_payment_id",
                schema: "billing",
                table: "payments");

            migrationBuilder.DropColumn(
                name: "amount_refunded",
                schema: "billing",
                table: "payments");

            migrationBuilder.DropColumn(
                name: "provider_payment_id",
                schema: "billing",
                table: "payments");
        }
    }
}
