using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ServicePro.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class TechnicianTracking : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "last_seen_at",
                schema: "workforce",
                table: "technicians",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "technician_activity",
                schema: "workforce",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    technician_id = table.Column<Guid>(type: "uuid", nullable: false),
                    kind = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    duty_status = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_technician_activity", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "technician_location_points",
                schema: "workforce",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    technician_id = table.Column<Guid>(type: "uuid", nullable: false),
                    latitude = table.Column<double>(type: "double precision", nullable: false),
                    longitude = table.Column<double>(type: "double precision", nullable: false),
                    recorded_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_technician_location_points", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_technician_activity_technician_id_at",
                schema: "workforce",
                table: "technician_activity",
                columns: new[] { "technician_id", "at" });

            migrationBuilder.CreateIndex(
                name: "ix_technician_activity_tenant_id",
                schema: "workforce",
                table: "technician_activity",
                column: "tenant_id");

            migrationBuilder.CreateIndex(
                name: "ix_technician_location_points_technician_id_recorded_at",
                schema: "workforce",
                table: "technician_location_points",
                columns: new[] { "technician_id", "recorded_at" });

            migrationBuilder.CreateIndex(
                name: "ix_technician_location_points_tenant_id",
                schema: "workforce",
                table: "technician_location_points",
                column: "tenant_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "technician_activity",
                schema: "workforce");

            migrationBuilder.DropTable(
                name: "technician_location_points",
                schema: "workforce");

            migrationBuilder.DropColumn(
                name: "last_seen_at",
                schema: "workforce",
                table: "technicians");
        }
    }
}
