using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ServicePro.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class NotificationReadState : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "read_at",
                schema: "comms",
                table: "notifications",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_notifications_recipient_id_created_at",
                schema: "comms",
                table: "notifications",
                columns: new[] { "recipient_id", "created_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_notifications_recipient_id_created_at",
                schema: "comms",
                table: "notifications");

            migrationBuilder.DropColumn(
                name: "read_at",
                schema: "comms",
                table: "notifications");
        }
    }
}
