using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Penancia.S.Data.Migrations
{
    /// <inheritdoc />
    public partial class Phase1_Foundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<double>(
                name: "MicronsPerPixel",
                table: "Samples",
                type: "float",
                nullable: true,
                oldClrType: typeof(double),
                oldType: "float");

            migrationBuilder.AlterColumn<double>(
                name: "FramesPerSecond",
                table: "Samples",
                type: "float",
                nullable: true,
                oldClrType: typeof(double),
                oldType: "float");

            migrationBuilder.AlterColumn<double>(
                name: "ChamberDepthMicrons",
                table: "Samples",
                type: "float",
                nullable: true,
                oldClrType: typeof(double),
                oldType: "float");

            migrationBuilder.AddColumn<Guid>(
                name: "CalibrationId",
                table: "Samples",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ChamberTypeId",
                table: "Samples",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ConsentAtUtc",
                table: "Samples",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ParentSampleId",
                table: "Samples",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "WorkflowMode",
                table: "Samples",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "Calibrations",
                columns: table => new
                {
                    CalibrationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SampleId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    TargetId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    ReferencePitchUm = table.Column<double>(type: "float", nullable: false),
                    MeasuredPitchPx = table.Column<double>(type: "float", nullable: false),
                    MicronsPerPixel = table.Column<double>(type: "float", nullable: false),
                    LinesDetected = table.Column<int>(type: "int", nullable: false),
                    SpacingCvPct = table.Column<double>(type: "float", nullable: false),
                    ImageWidthPx = table.Column<int>(type: "int", nullable: false),
                    ImageHeightPx = table.Column<int>(type: "int", nullable: false),
                    AssetId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    RejectReason = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    ToolVersion = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ExpiresAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Calibrations", x => x.CalibrationId);
                });

            migrationBuilder.CreateTable(
                name: "IdempotencyKeys",
                columns: table => new
                {
                    Key = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    SampleId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    ResponseJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IdempotencyKeys", x => new { x.Key, x.SampleId });
                });

            migrationBuilder.CreateTable(
                name: "InboxMessages",
                columns: table => new
                {
                    MessageId = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    ReceivedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    RaisedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InboxMessages", x => x.MessageId);
                });

            migrationBuilder.CreateTable(
                name: "MediaAssets",
                columns: table => new
                {
                    AssetId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SampleId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Container = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    BlobName = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    ContentTypeDeclared = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    ContentTypeSniffed = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    SizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    Sha256 = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    Status = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    RejectReason = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    Fps = table.Column<double>(type: "float", nullable: true),
                    WidthPx = table.Column<int>(type: "int", nullable: true),
                    HeightPx = table.Column<int>(type: "int", nullable: true),
                    Codec = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    DurationS = table.Column<double>(type: "float", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MediaAssets", x => x.AssetId);
                });

            migrationBuilder.CreateTable(
                name: "OutboxMessages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Type = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    PayloadJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    DispatchedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Attempts = table.Column<int>(type: "int", nullable: false),
                    LastError = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OutboxMessages", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Samples_CalibrationId",
                table: "Samples",
                column: "CalibrationId");

            migrationBuilder.CreateIndex(
                name: "IX_Calibrations_AssetId",
                table: "Calibrations",
                column: "AssetId");

            migrationBuilder.CreateIndex(
                name: "IX_Calibrations_SampleId",
                table: "Calibrations",
                column: "SampleId");

            migrationBuilder.CreateIndex(
                name: "IX_MediaAssets_BlobName",
                table: "MediaAssets",
                column: "BlobName");

            migrationBuilder.CreateIndex(
                name: "IX_MediaAssets_SampleId",
                table: "MediaAssets",
                column: "SampleId");

            migrationBuilder.CreateIndex(
                name: "IX_OutboxMessages_DispatchedAtUtc",
                table: "OutboxMessages",
                column: "DispatchedAtUtc");

            migrationBuilder.AddForeignKey(
                name: "FK_Samples_Calibrations_CalibrationId",
                table: "Samples",
                column: "CalibrationId",
                principalTable: "Calibrations",
                principalColumn: "CalibrationId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Samples_Calibrations_CalibrationId",
                table: "Samples");

            migrationBuilder.DropTable(
                name: "Calibrations");

            migrationBuilder.DropTable(
                name: "IdempotencyKeys");

            migrationBuilder.DropTable(
                name: "InboxMessages");

            migrationBuilder.DropTable(
                name: "MediaAssets");

            migrationBuilder.DropTable(
                name: "OutboxMessages");

            migrationBuilder.DropIndex(
                name: "IX_Samples_CalibrationId",
                table: "Samples");

            migrationBuilder.DropColumn(
                name: "CalibrationId",
                table: "Samples");

            migrationBuilder.DropColumn(
                name: "ChamberTypeId",
                table: "Samples");

            migrationBuilder.DropColumn(
                name: "ConsentAtUtc",
                table: "Samples");

            migrationBuilder.DropColumn(
                name: "ParentSampleId",
                table: "Samples");

            migrationBuilder.DropColumn(
                name: "WorkflowMode",
                table: "Samples");

            migrationBuilder.AlterColumn<double>(
                name: "MicronsPerPixel",
                table: "Samples",
                type: "float",
                nullable: false,
                defaultValue: 0.0,
                oldClrType: typeof(double),
                oldType: "float",
                oldNullable: true);

            migrationBuilder.AlterColumn<double>(
                name: "FramesPerSecond",
                table: "Samples",
                type: "float",
                nullable: false,
                defaultValue: 0.0,
                oldClrType: typeof(double),
                oldType: "float",
                oldNullable: true);

            migrationBuilder.AlterColumn<double>(
                name: "ChamberDepthMicrons",
                table: "Samples",
                type: "float",
                nullable: false,
                defaultValue: 0.0,
                oldClrType: typeof(double),
                oldType: "float",
                oldNullable: true);
        }
    }
}
