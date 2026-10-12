using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ServicePro.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCustomerSessions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "customer_refresh_tokens",
                schema: "identity",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    customer_id = table.Column<Guid>(type: "uuid", nullable: false),
                    token_hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    revoked_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    replaced_by_token_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_customer_refresh_tokens", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_customer_refresh_tokens_customer_id",
                schema: "identity",
                table: "customer_refresh_tokens",
                column: "customer_id");

            migrationBuilder.CreateIndex(
                name: "ix_customer_refresh_tokens_family_id",
                schema: "identity",
                table: "customer_refresh_tokens",
                column: "family_id");

            migrationBuilder.CreateIndex(
                name: "ix_customer_refresh_tokens_tenant_id",
                schema: "identity",
                table: "customer_refresh_tokens",
                column: "tenant_id");

            migrationBuilder.CreateIndex(
                name: "ix_customer_refresh_tokens_token_hash",
                schema: "identity",
                table: "customer_refresh_tokens",
                column: "token_hash",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "customer_refresh_tokens",
                schema: "identity");
        }
    }
}
