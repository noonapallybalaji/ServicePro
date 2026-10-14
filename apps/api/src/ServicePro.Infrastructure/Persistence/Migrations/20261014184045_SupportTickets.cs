using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ServicePro.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SupportTickets : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "support");

            migrationBuilder.CreateSequence(
                name: "ticket_number_seq",
                schema: "support",
                startValue: 10001L);

            migrationBuilder.CreateTable(
                name: "tickets",
                schema: "support",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    number = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    customer_id = table.Column<Guid>(type: "uuid", nullable: true),
                    contact_phone = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                    contact_name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    service_request_id = table.Column<Guid>(type: "uuid", nullable: true),
                    sr_number = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    category = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    channel = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    high_priority = table.Column<bool>(type: "boolean", nullable: false),
                    status = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    assigned_to_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    first_response_due_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    first_response_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    last_activity_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    resolved_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    external_reference = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_tickets", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "ticket_messages",
                schema: "support",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    ticket_id = table.Column<Guid>(type: "uuid", nullable: false),
                    author = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    author_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    body = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    is_internal = table.Column<bool>(type: "boolean", nullable: false),
                    sent_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_ticket_messages", x => x.id);
                    table.ForeignKey(
                        name: "fk_ticket_messages_tickets_ticket_id",
                        column: x => x.ticket_id,
                        principalSchema: "support",
                        principalTable: "tickets",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_ticket_messages_ticket_id_sent_at",
                schema: "support",
                table: "ticket_messages",
                columns: new[] { "ticket_id", "sent_at" });

            migrationBuilder.CreateIndex(
                name: "ix_tickets_customer_id",
                schema: "support",
                table: "tickets",
                column: "customer_id");

            migrationBuilder.CreateIndex(
                name: "ix_tickets_service_request_id",
                schema: "support",
                table: "tickets",
                column: "service_request_id");

            migrationBuilder.CreateIndex(
                name: "ix_tickets_status_first_response_due_at",
                schema: "support",
                table: "tickets",
                columns: new[] { "status", "first_response_due_at" });

            migrationBuilder.CreateIndex(
                name: "ix_tickets_tenant_id",
                schema: "support",
                table: "tickets",
                column: "tenant_id");

            migrationBuilder.CreateIndex(
                name: "ix_tickets_tenant_id_external_reference",
                schema: "support",
                table: "tickets",
                columns: new[] { "tenant_id", "external_reference" },
                unique: true,
                filter: "external_reference IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_tickets_tenant_id_number",
                schema: "support",
                table: "tickets",
                columns: new[] { "tenant_id", "number" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ticket_messages",
                schema: "support");

            migrationBuilder.DropTable(
                name: "tickets",
                schema: "support");

            migrationBuilder.DropSequence(
                name: "ticket_number_seq",
                schema: "support");
        }
    }
}
