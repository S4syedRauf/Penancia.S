using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Penancia.S.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddBookingAndPartnerEntities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "LabOrders",
                columns: table => new
                {
                    OrderId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    TrackingNumber = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    ClinicId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    PatientId = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    CollectionType = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    PriceAed = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    SlotHoldId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(1024)", maxLength: 1024, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LabOrders", x => x.OrderId);
                });

            migrationBuilder.CreateTable(
                name: "PartnerClinics",
                columns: table => new
                {
                    ClinicId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    City = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    Address = table.Column<string>(type: "nvarchar(512)", maxLength: 512, nullable: false),
                    ContactEmail = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    Phone = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    LicenseNumber = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    WalkInPriceAed = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    HomeCollectionPriceAed = table.Column<decimal>(type: "decimal(18,2)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PartnerClinics", x => x.ClinicId);
                });

            migrationBuilder.CreateTable(
                name: "SlotHolds",
                columns: table => new
                {
                    HoldId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    SlotId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    ClinicId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ExpiresAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    IsClaimed = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SlotHolds", x => x.HoldId);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "LabOrders");

            migrationBuilder.DropTable(
                name: "PartnerClinics");

            migrationBuilder.DropTable(
                name: "SlotHolds");
        }
    }
}
