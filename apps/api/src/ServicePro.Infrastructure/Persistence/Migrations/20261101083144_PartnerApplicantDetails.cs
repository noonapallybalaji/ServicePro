using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ServicePro.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class PartnerApplicantDetails : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "aadhaar_back_key",
                schema: "workforce",
                table: "technician_applications",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "aadhaar_front_key",
                schema: "workforce",
                table: "technician_applications",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "aadhaar_last4",
                schema: "workforce",
                table: "technician_applications",
                type: "character varying(4)",
                maxLength: 4,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "address_line",
                schema: "workforce",
                table: "technician_applications",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "date_of_birth",
                schema: "workforce",
                table: "technician_applications",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "pan",
                schema: "workforce",
                table: "technician_applications",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "pan_card_key",
                schema: "workforce",
                table: "technician_applications",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "profile_photo_key",
                schema: "workforce",
                table: "technician_applications",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "aadhaar_back_key",
                schema: "workforce",
                table: "technician_applications");

            migrationBuilder.DropColumn(
                name: "aadhaar_front_key",
                schema: "workforce",
                table: "technician_applications");

            migrationBuilder.DropColumn(
                name: "aadhaar_last4",
                schema: "workforce",
                table: "technician_applications");

            migrationBuilder.DropColumn(
                name: "address_line",
                schema: "workforce",
                table: "technician_applications");

            migrationBuilder.DropColumn(
                name: "date_of_birth",
                schema: "workforce",
                table: "technician_applications");

            migrationBuilder.DropColumn(
                name: "pan",
                schema: "workforce",
                table: "technician_applications");

            migrationBuilder.DropColumn(
                name: "pan_card_key",
                schema: "workforce",
                table: "technician_applications");

            migrationBuilder.DropColumn(
                name: "profile_photo_key",
                schema: "workforce",
                table: "technician_applications");
        }
    }
}
