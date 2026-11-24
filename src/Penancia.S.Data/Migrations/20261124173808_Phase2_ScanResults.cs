using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Penancia.S.Data.Migrations
{
    /// <inheritdoc />
    public partial class Phase2_ScanResults : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "MalwareNamesFound",
                table: "MediaAssets",
                type: "nvarchar(1024)",
                maxLength: 1024,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ScanVerdict",
                table: "MediaAssets",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ScannedAtUtc",
                table: "MediaAssets",
                type: "datetime2",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "MalwareNamesFound",
                table: "MediaAssets");

            migrationBuilder.DropColumn(
                name: "ScanVerdict",
                table: "MediaAssets");

            migrationBuilder.DropColumn(
                name: "ScannedAtUtc",
                table: "MediaAssets");
        }
    }
}
