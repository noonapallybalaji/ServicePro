using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ServicePro.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ReviewsAndFeedback : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "feedback_requested_at",
                schema: "ops",
                table: "service_requests",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "reviews",
                schema: "ops",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    service_request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    customer_id = table.Column<Guid>(type: "uuid", nullable: false),
                    technician_id = table.Column<Guid>(type: "uuid", nullable: true),
                    rating = table.Column<int>(type: "integer", nullable: false),
                    comment = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    submitted_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_reviews", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_reviews_service_request_id",
                schema: "ops",
                table: "reviews",
                column: "service_request_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_reviews_technician_id_submitted_at",
                schema: "ops",
                table: "reviews",
                columns: new[] { "technician_id", "submitted_at" });

            migrationBuilder.CreateIndex(
                name: "ix_reviews_tenant_id",
                schema: "ops",
                table: "reviews",
                column: "tenant_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "reviews",
                schema: "ops");

            migrationBuilder.DropColumn(
                name: "feedback_requested_at",
                schema: "ops",
                table: "service_requests");
        }
    }
}
