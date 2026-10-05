using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace ServicePro.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "platform");

            migrationBuilder.EnsureSchema(
                name: "catalog");

            migrationBuilder.EnsureSchema(
                name: "crm");

            migrationBuilder.EnsureSchema(
                name: "billing");

            migrationBuilder.EnsureSchema(
                name: "comms");

            migrationBuilder.EnsureSchema(
                name: "identity");

            migrationBuilder.EnsureSchema(
                name: "ops");

            migrationBuilder.EnsureSchema(
                name: "dispatch");

            migrationBuilder.EnsureSchema(
                name: "workforce");

            migrationBuilder.CreateSequence(
                name: "invoice_number_seq",
                schema: "billing");

            migrationBuilder.CreateSequence(
                name: "sr_number_seq",
                schema: "ops",
                startValue: 10001L);

            migrationBuilder.CreateTable(
                name: "audit_logs",
                schema: "platform",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    entity_type = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    entity_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    action = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    changes = table.Column<string>(type: "jsonb", nullable: false),
                    occurred_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_audit_logs", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "brands",
                schema: "catalog",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_brands", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "customers",
                schema: "crm",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    full_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    primary_phone = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    alternate_phone = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                    email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: true),
                    preferred_language = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    first_source = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    is_blocked = table.Column<bool>(type: "boolean", nullable: false),
                    phone_digits = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_customers", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "invoices",
                schema: "billing",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    invoice_number = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    service_request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    sr_number = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    customer_id = table.Column<Guid>(type: "uuid", nullable: false),
                    technician_id = table.Column<Guid>(type: "uuid", nullable: true),
                    subtotal = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    tax_rate_percent = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: false),
                    tax_amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    total = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    amount_paid = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    status = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    issued_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_invoices", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "notification_templates",
                schema: "comms",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    code = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    channel = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    language = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    body = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: false),
                    provider_template_name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    variables = table.Column<string[]>(type: "text[]", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_notification_templates", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "notifications",
                schema: "comms",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    template_code = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    channel = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    recipient_type = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    recipient_id = table.Column<Guid>(type: "uuid", nullable: true),
                    recipient_address = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    service_request_id = table.Column<Guid>(type: "uuid", nullable: true),
                    rendered_body = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    status = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    provider_message_id = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    error = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    sent_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_notifications", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "otp_challenges",
                schema: "identity",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    phone = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    purpose = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    code_hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    attempts = table.Column<int>(type: "integer", nullable: false),
                    consumed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_otp_challenges", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "outbox_consumers",
                schema: "platform",
                columns: table => new
                {
                    message_id = table.Column<Guid>(type: "uuid", nullable: false),
                    handler = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    processed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_outbox_consumers", x => new { x.message_id, x.handler });
                });

            migrationBuilder.CreateTable(
                name: "outbox_messages",
                schema: "platform",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    type = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    payload = table.Column<string>(type: "jsonb", nullable: false),
                    occurred_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    processed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    lease_until = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    next_attempt_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    dead_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    attempts = table.Column<int>(type: "integer", nullable: false),
                    last_error = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_outbox_messages", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "payments",
                schema: "billing",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    invoice_id = table.Column<Guid>(type: "uuid", nullable: false),
                    service_request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    method = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    reference = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    collected_by_technician_id = table.Column<Guid>(type: "uuid", nullable: true),
                    recorded_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    received_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_payments", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "service_areas",
                schema: "catalog",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    pincodes = table.Column<string[]>(type: "text[]", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_service_areas", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "service_categories",
                schema: "catalog",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    code = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    base_visit_charge = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    requires_photos = table.Column<bool>(type: "boolean", nullable: false),
                    sort_order = table.Column<int>(type: "integer", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_service_categories", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "service_requests",
                schema: "ops",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    sr_number = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    customer_id = table.Column<Guid>(type: "uuid", nullable: false),
                    address_id = table.Column<Guid>(type: "uuid", nullable: false),
                    appliance_id = table.Column<Guid>(type: "uuid", nullable: true),
                    category_id = table.Column<Guid>(type: "uuid", nullable: false),
                    issue_type_id = table.Column<Guid>(type: "uuid", nullable: true),
                    problem_description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    channel = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    priority = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    status = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    status_reason = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    preferred_slot_start = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    preferred_slot_end = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    scheduled_start = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    scheduled_end = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    current_technician_id = table.Column<Guid>(type: "uuid", nullable: true),
                    current_assignment_id = table.Column<Guid>(type: "uuid", nullable: true),
                    is_warranty_visit = table.Column<bool>(type: "boolean", nullable: false),
                    parent_service_request_id = table.Column<Guid>(type: "uuid", nullable: true),
                    visit_charge = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    final_amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    payment_status = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    completion_code_hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    completion_code_attempts = table.Column<int>(type: "integer", nullable: false),
                    tracking_token = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    last_status_change_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    accepted_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    en_route_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    arrived_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    completed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    closed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    cancelled_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_service_requests", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "settings",
                schema: "platform",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    key = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    value = table.Column<string>(type: "jsonb", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_settings", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "technician_assignments",
                schema: "dispatch",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    service_request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    technician_id = table.Column<Guid>(type: "uuid", nullable: false),
                    customer_id = table.Column<Guid>(type: "uuid", nullable: false),
                    assigned_by_type = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    assigned_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    rank = table.Column<int>(type: "integer", nullable: true),
                    match_score = table.Column<decimal>(type: "numeric(6,2)", precision: 6, scale: 2, nullable: true),
                    score_breakdown = table.Column<string>(type: "jsonb", nullable: false),
                    distance_km = table.Column<double>(type: "double precision", nullable: true),
                    override_reason = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    status = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    decline_reason = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    offered_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    offer_expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    responded_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_technician_assignments", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "technician_ledger",
                schema: "billing",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    technician_id = table.Column<Guid>(type: "uuid", nullable: false),
                    type = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    service_request_id = table.Column<Guid>(type: "uuid", nullable: true),
                    note = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    recorded_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    occurred_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_technician_ledger", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "technicians",
                schema: "workforce",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    full_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    phone = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    employee_code = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    employment_type = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    photo_key = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    home_latitude = table.Column<double>(type: "double precision", nullable: true),
                    home_longitude = table.Column<double>(type: "double precision", nullable: true),
                    last_latitude = table.Column<double>(type: "double precision", nullable: true),
                    last_longitude = table.Column<double>(type: "double precision", nullable: true),
                    last_location_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    duty_status = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    max_jobs_per_day = table.Column<int>(type: "integer", nullable: false),
                    commission_type = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    commission_value = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    rating_average = table.Column<decimal>(type: "numeric(3,2)", precision: 3, scale: 2, nullable: true),
                    rating_count = table.Column<int>(type: "integer", nullable: false),
                    completed_jobs_count = table.Column<int>(type: "integer", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_technicians", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "tenants",
                schema: "identity",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    timezone = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_tenants", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "users",
                schema: "identity",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    full_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    phone = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: true),
                    password_hash = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    role = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    preferred_language = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    last_login_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_users", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "customer_addresses",
                schema: "crm",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    customer_id = table.Column<Guid>(type: "uuid", nullable: false),
                    label = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    line1 = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    line2 = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    landmark = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    locality = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    city = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    state = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    pincode = table.Column<string>(type: "character(6)", fixedLength: true, maxLength: 6, nullable: false),
                    latitude = table.Column<double>(type: "double precision", nullable: true),
                    longitude = table.Column<double>(type: "double precision", nullable: true),
                    is_default = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_customer_addresses", x => x.id);
                    table.ForeignKey(
                        name: "fk_customer_addresses_customer_customer_id",
                        column: x => x.customer_id,
                        principalSchema: "crm",
                        principalTable: "customers",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "customer_appliances",
                schema: "crm",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    customer_id = table.Column<Guid>(type: "uuid", nullable: false),
                    category_id = table.Column<Guid>(type: "uuid", nullable: false),
                    brand = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    appliance_type = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    capacity = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    model_number = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    serial_number = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    purchase_year = table.Column<int>(type: "integer", nullable: true),
                    warranty_until = table.Column<DateOnly>(type: "date", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_customer_appliances", x => x.id);
                    table.ForeignKey(
                        name: "fk_customer_appliances_customer_customer_id",
                        column: x => x.customer_id,
                        principalSchema: "crm",
                        principalTable: "customers",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "invoice_lines",
                schema: "billing",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    invoice_id = table.Column<Guid>(type: "uuid", nullable: false),
                    position = table.Column<int>(type: "integer", nullable: false),
                    type = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    description = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    quantity = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: false),
                    unit_price = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_invoice_lines", x => x.id);
                    table.ForeignKey(
                        name: "fk_invoice_lines_invoices_invoice_id",
                        column: x => x.invoice_id,
                        principalSchema: "billing",
                        principalTable: "invoices",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "issue_types",
                schema: "catalog",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    category_id = table.Column<Guid>(type: "uuid", nullable: false),
                    code = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    typical_duration_minutes = table.Column<int>(type: "integer", nullable: false),
                    min_skill_level = table.Column<int>(type: "integer", nullable: false),
                    default_priority = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_issue_types", x => x.id);
                    table.ForeignKey(
                        name: "fk_issue_types_service_category_category_id",
                        column: x => x.category_id,
                        principalSchema: "catalog",
                        principalTable: "service_categories",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "service_status_history",
                schema: "ops",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    service_request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    from_status = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    to_status = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    reason_code = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    note = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    actor_type = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    actor_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    latitude = table.Column<double>(type: "double precision", nullable: true),
                    longitude = table.Column<double>(type: "double precision", nullable: true),
                    occurred_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_service_status_history", x => x.id);
                    table.ForeignKey(
                        name: "fk_service_status_history_service_requests_service_request_id",
                        column: x => x.service_request_id,
                        principalSchema: "ops",
                        principalTable: "service_requests",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "sr_attachments",
                schema: "ops",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    service_request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    kind = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    storage_key = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    content_type = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    size_bytes = table.Column<long>(type: "bigint", nullable: false),
                    uploaded_by_type = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    uploaded_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_sr_attachments", x => x.id);
                    table.ForeignKey(
                        name: "fk_sr_attachments_service_request_service_request_id",
                        column: x => x.service_request_id,
                        principalSchema: "ops",
                        principalTable: "service_requests",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "sr_notes",
                schema: "ops",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    service_request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    body = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    visibility = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    author_type = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    author_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_sr_notes", x => x.id);
                    table.ForeignKey(
                        name: "fk_sr_notes_service_requests_service_request_id",
                        column: x => x.service_request_id,
                        principalSchema: "ops",
                        principalTable: "service_requests",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "technician_service_areas",
                schema: "workforce",
                columns: table => new
                {
                    technician_id = table.Column<Guid>(type: "uuid", nullable: false),
                    service_area_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_technician_service_areas", x => new { x.technician_id, x.service_area_id });
                    table.ForeignKey(
                        name: "fk_technician_service_areas_technicians_technician_id",
                        column: x => x.technician_id,
                        principalSchema: "workforce",
                        principalTable: "technicians",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "technician_shifts",
                schema: "workforce",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    technician_id = table.Column<Guid>(type: "uuid", nullable: false),
                    day = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    start = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    end = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_technician_shifts", x => x.id);
                    table.ForeignKey(
                        name: "fk_technician_shifts_technicians_technician_id",
                        column: x => x.technician_id,
                        principalSchema: "workforce",
                        principalTable: "technicians",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "technician_skills",
                schema: "workforce",
                columns: table => new
                {
                    technician_id = table.Column<Guid>(type: "uuid", nullable: false),
                    category_id = table.Column<Guid>(type: "uuid", nullable: false),
                    level = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_technician_skills", x => new { x.technician_id, x.category_id });
                    table.ForeignKey(
                        name: "fk_technician_skills_technicians_technician_id",
                        column: x => x.technician_id,
                        principalSchema: "workforce",
                        principalTable: "technicians",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "technician_time_off",
                schema: "workforce",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    technician_id = table.Column<Guid>(type: "uuid", nullable: false),
                    starts_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ends_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    reason = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_technician_time_off", x => x.id);
                    table.ForeignKey(
                        name: "fk_technician_time_off_technician_technician_id",
                        column: x => x.technician_id,
                        principalSchema: "workforce",
                        principalTable: "technicians",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "refresh_tokens",
                schema: "identity",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
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
                    table.PrimaryKey("pk_refresh_tokens", x => x.id);
                    table.ForeignKey(
                        name: "fk_refresh_tokens_user_user_id",
                        column: x => x.user_id,
                        principalSchema: "identity",
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "price_list",
                schema: "catalog",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    category_id = table.Column<Guid>(type: "uuid", nullable: false),
                    issue_type_id = table.Column<Guid>(type: "uuid", nullable: true),
                    item_name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    price_min = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    price_max = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_price_list", x => x.id);
                    table.ForeignKey(
                        name: "fk_price_list_issue_types_issue_type_id",
                        column: x => x.issue_type_id,
                        principalSchema: "catalog",
                        principalTable: "issue_types",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_price_list_service_category_category_id",
                        column: x => x.category_id,
                        principalSchema: "catalog",
                        principalTable: "service_categories",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_audit_logs_entity_type_entity_id",
                schema: "platform",
                table: "audit_logs",
                columns: new[] { "entity_type", "entity_id" });

            migrationBuilder.CreateIndex(
                name: "ix_brands_tenant_id",
                schema: "catalog",
                table: "brands",
                column: "tenant_id");

            migrationBuilder.CreateIndex(
                name: "ix_brands_tenant_id_name",
                schema: "catalog",
                table: "brands",
                columns: new[] { "tenant_id", "name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_customer_addresses_customer_id",
                schema: "crm",
                table: "customer_addresses",
                column: "customer_id");

            migrationBuilder.CreateIndex(
                name: "ix_customer_addresses_pincode",
                schema: "crm",
                table: "customer_addresses",
                column: "pincode");

            migrationBuilder.CreateIndex(
                name: "ix_customer_addresses_tenant_id",
                schema: "crm",
                table: "customer_addresses",
                column: "tenant_id");

            migrationBuilder.CreateIndex(
                name: "ix_customer_appliances_customer_id",
                schema: "crm",
                table: "customer_appliances",
                column: "customer_id");

            migrationBuilder.CreateIndex(
                name: "ix_customer_appliances_tenant_id",
                schema: "crm",
                table: "customer_appliances",
                column: "tenant_id");

            migrationBuilder.CreateIndex(
                name: "ix_customers_full_name",
                schema: "crm",
                table: "customers",
                column: "full_name");

            migrationBuilder.CreateIndex(
                name: "ix_customers_tenant_id",
                schema: "crm",
                table: "customers",
                column: "tenant_id");

            migrationBuilder.CreateIndex(
                name: "ix_customers_tenant_id_primary_phone",
                schema: "crm",
                table: "customers",
                columns: new[] { "tenant_id", "primary_phone" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_invoice_lines_invoice_id",
                schema: "billing",
                table: "invoice_lines",
                column: "invoice_id");

            migrationBuilder.CreateIndex(
                name: "ix_invoices_service_request_id",
                schema: "billing",
                table: "invoices",
                column: "service_request_id",
                unique: true,
                filter: "status <> 'VOID'");

            migrationBuilder.CreateIndex(
                name: "ix_invoices_tenant_id",
                schema: "billing",
                table: "invoices",
                column: "tenant_id");

            migrationBuilder.CreateIndex(
                name: "ix_invoices_tenant_id_invoice_number",
                schema: "billing",
                table: "invoices",
                columns: new[] { "tenant_id", "invoice_number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_issue_types_category_id",
                schema: "catalog",
                table: "issue_types",
                column: "category_id");

            migrationBuilder.CreateIndex(
                name: "ix_issue_types_tenant_id",
                schema: "catalog",
                table: "issue_types",
                column: "tenant_id");

            migrationBuilder.CreateIndex(
                name: "ix_issue_types_tenant_id_category_id_code",
                schema: "catalog",
                table: "issue_types",
                columns: new[] { "tenant_id", "category_id", "code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_notification_templates_tenant_id",
                schema: "comms",
                table: "notification_templates",
                column: "tenant_id");

            migrationBuilder.CreateIndex(
                name: "ix_notification_templates_tenant_id_code_channel_language",
                schema: "comms",
                table: "notification_templates",
                columns: new[] { "tenant_id", "code", "channel", "language" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_notifications_service_request_id_created_at",
                schema: "comms",
                table: "notifications",
                columns: new[] { "service_request_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_notifications_tenant_id",
                schema: "comms",
                table: "notifications",
                column: "tenant_id");

            migrationBuilder.CreateIndex(
                name: "ix_otp_challenges_phone_purpose_created_at",
                schema: "identity",
                table: "otp_challenges",
                columns: new[] { "phone", "purpose", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_otp_challenges_tenant_id",
                schema: "identity",
                table: "otp_challenges",
                column: "tenant_id");

            migrationBuilder.CreateIndex(
                name: "ix_outbox_messages_pending",
                schema: "platform",
                table: "outbox_messages",
                column: "occurred_at",
                filter: "processed_at IS NULL AND dead_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ix_payments_received_at",
                schema: "billing",
                table: "payments",
                column: "received_at");

            migrationBuilder.CreateIndex(
                name: "ix_payments_service_request_id",
                schema: "billing",
                table: "payments",
                column: "service_request_id");

            migrationBuilder.CreateIndex(
                name: "ix_payments_tenant_id",
                schema: "billing",
                table: "payments",
                column: "tenant_id");

            migrationBuilder.CreateIndex(
                name: "ix_price_list_category_id",
                schema: "catalog",
                table: "price_list",
                column: "category_id");

            migrationBuilder.CreateIndex(
                name: "ix_price_list_issue_type_id",
                schema: "catalog",
                table: "price_list",
                column: "issue_type_id");

            migrationBuilder.CreateIndex(
                name: "ix_price_list_tenant_id",
                schema: "catalog",
                table: "price_list",
                column: "tenant_id");

            migrationBuilder.CreateIndex(
                name: "ix_refresh_tokens_family_id",
                schema: "identity",
                table: "refresh_tokens",
                column: "family_id");

            migrationBuilder.CreateIndex(
                name: "ix_refresh_tokens_tenant_id",
                schema: "identity",
                table: "refresh_tokens",
                column: "tenant_id");

            migrationBuilder.CreateIndex(
                name: "ix_refresh_tokens_token_hash",
                schema: "identity",
                table: "refresh_tokens",
                column: "token_hash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_refresh_tokens_user_id",
                schema: "identity",
                table: "refresh_tokens",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_service_areas_tenant_id",
                schema: "catalog",
                table: "service_areas",
                column: "tenant_id");

            migrationBuilder.CreateIndex(
                name: "ix_service_categories_tenant_id",
                schema: "catalog",
                table: "service_categories",
                column: "tenant_id");

            migrationBuilder.CreateIndex(
                name: "ix_service_categories_tenant_id_code",
                schema: "catalog",
                table: "service_categories",
                columns: new[] { "tenant_id", "code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_service_requests_current_technician_id_status",
                schema: "ops",
                table: "service_requests",
                columns: new[] { "current_technician_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_service_requests_customer_id_created_at",
                schema: "ops",
                table: "service_requests",
                columns: new[] { "customer_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_service_requests_scheduled_start",
                schema: "ops",
                table: "service_requests",
                column: "scheduled_start");

            migrationBuilder.CreateIndex(
                name: "ix_service_requests_tenant_id",
                schema: "ops",
                table: "service_requests",
                column: "tenant_id");

            migrationBuilder.CreateIndex(
                name: "ix_service_requests_tenant_id_sr_number",
                schema: "ops",
                table: "service_requests",
                columns: new[] { "tenant_id", "sr_number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_service_requests_tenant_id_status",
                schema: "ops",
                table: "service_requests",
                columns: new[] { "tenant_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_service_requests_tracking_token",
                schema: "ops",
                table: "service_requests",
                column: "tracking_token",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_service_status_history_service_request_id_occurred_at",
                schema: "ops",
                table: "service_status_history",
                columns: new[] { "service_request_id", "occurred_at" });

            migrationBuilder.CreateIndex(
                name: "ix_settings_tenant_id",
                schema: "platform",
                table: "settings",
                column: "tenant_id");

            migrationBuilder.CreateIndex(
                name: "ix_settings_tenant_id_key",
                schema: "platform",
                table: "settings",
                columns: new[] { "tenant_id", "key" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_sr_attachments_service_request_id",
                schema: "ops",
                table: "sr_attachments",
                column: "service_request_id");

            migrationBuilder.CreateIndex(
                name: "ix_sr_notes_service_request_id",
                schema: "ops",
                table: "sr_notes",
                column: "service_request_id");

            migrationBuilder.CreateIndex(
                name: "ix_technician_assignments_offer_expires_at",
                schema: "dispatch",
                table: "technician_assignments",
                column: "offer_expires_at",
                filter: "status = 'OFFERED'");

            migrationBuilder.CreateIndex(
                name: "ix_technician_assignments_service_request_id_status",
                schema: "dispatch",
                table: "technician_assignments",
                columns: new[] { "service_request_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_technician_assignments_technician_id_status",
                schema: "dispatch",
                table: "technician_assignments",
                columns: new[] { "technician_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_technician_assignments_tenant_id",
                schema: "dispatch",
                table: "technician_assignments",
                column: "tenant_id");

            migrationBuilder.CreateIndex(
                name: "ix_technician_ledger_technician_id_occurred_at",
                schema: "billing",
                table: "technician_ledger",
                columns: new[] { "technician_id", "occurred_at" });

            migrationBuilder.CreateIndex(
                name: "ix_technician_ledger_tenant_id",
                schema: "billing",
                table: "technician_ledger",
                column: "tenant_id");

            migrationBuilder.CreateIndex(
                name: "ix_technician_shifts_technician_id",
                schema: "workforce",
                table: "technician_shifts",
                column: "technician_id");

            migrationBuilder.CreateIndex(
                name: "ix_technician_time_off_technician_id",
                schema: "workforce",
                table: "technician_time_off",
                column: "technician_id");

            migrationBuilder.CreateIndex(
                name: "ix_technicians_tenant_id",
                schema: "workforce",
                table: "technicians",
                column: "tenant_id");

            migrationBuilder.CreateIndex(
                name: "ix_technicians_tenant_id_phone",
                schema: "workforce",
                table: "technicians",
                columns: new[] { "tenant_id", "phone" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_technicians_user_id",
                schema: "workforce",
                table: "technicians",
                column: "user_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_users_tenant_id",
                schema: "identity",
                table: "users",
                column: "tenant_id");

            migrationBuilder.CreateIndex(
                name: "ix_users_tenant_id_email",
                schema: "identity",
                table: "users",
                columns: new[] { "tenant_id", "email" },
                unique: true,
                filter: "email IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_users_tenant_id_phone",
                schema: "identity",
                table: "users",
                columns: new[] { "tenant_id", "phone" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "audit_logs",
                schema: "platform");

            migrationBuilder.DropTable(
                name: "brands",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "customer_addresses",
                schema: "crm");

            migrationBuilder.DropTable(
                name: "customer_appliances",
                schema: "crm");

            migrationBuilder.DropTable(
                name: "invoice_lines",
                schema: "billing");

            migrationBuilder.DropTable(
                name: "notification_templates",
                schema: "comms");

            migrationBuilder.DropTable(
                name: "notifications",
                schema: "comms");

            migrationBuilder.DropTable(
                name: "otp_challenges",
                schema: "identity");

            migrationBuilder.DropTable(
                name: "outbox_consumers",
                schema: "platform");

            migrationBuilder.DropTable(
                name: "outbox_messages",
                schema: "platform");

            migrationBuilder.DropTable(
                name: "payments",
                schema: "billing");

            migrationBuilder.DropTable(
                name: "price_list",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "refresh_tokens",
                schema: "identity");

            migrationBuilder.DropTable(
                name: "service_areas",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "service_status_history",
                schema: "ops");

            migrationBuilder.DropTable(
                name: "settings",
                schema: "platform");

            migrationBuilder.DropTable(
                name: "sr_attachments",
                schema: "ops");

            migrationBuilder.DropTable(
                name: "sr_notes",
                schema: "ops");

            migrationBuilder.DropTable(
                name: "technician_assignments",
                schema: "dispatch");

            migrationBuilder.DropTable(
                name: "technician_ledger",
                schema: "billing");

            migrationBuilder.DropTable(
                name: "technician_service_areas",
                schema: "workforce");

            migrationBuilder.DropTable(
                name: "technician_shifts",
                schema: "workforce");

            migrationBuilder.DropTable(
                name: "technician_skills",
                schema: "workforce");

            migrationBuilder.DropTable(
                name: "technician_time_off",
                schema: "workforce");

            migrationBuilder.DropTable(
                name: "tenants",
                schema: "identity");

            migrationBuilder.DropTable(
                name: "customers",
                schema: "crm");

            migrationBuilder.DropTable(
                name: "invoices",
                schema: "billing");

            migrationBuilder.DropTable(
                name: "issue_types",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "users",
                schema: "identity");

            migrationBuilder.DropTable(
                name: "service_requests",
                schema: "ops");

            migrationBuilder.DropTable(
                name: "technicians",
                schema: "workforce");

            migrationBuilder.DropTable(
                name: "service_categories",
                schema: "catalog");

            migrationBuilder.DropSequence(
                name: "invoice_number_seq",
                schema: "billing");

            migrationBuilder.DropSequence(
                name: "sr_number_seq",
                schema: "ops");
        }
    }
}
