using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Penancia.S.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Samples",
                columns: table => new
                {
                    SampleId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    WorkflowVersion = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    State = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    MicronsPerPixel = table.Column<double>(type: "float", nullable: false),
                    FramesPerSecond = table.Column<double>(type: "float", nullable: false),
                    ChamberDepthMicrons = table.Column<double>(type: "float", nullable: false),
                    RawVideoBlobUri = table.Column<string>(type: "nvarchar(1024)", maxLength: 1024, nullable: true),
                    DraftReportPdfUri = table.Column<string>(type: "nvarchar(1024)", maxLength: 1024, nullable: true),
                    FinalReportPdfUri = table.Column<string>(type: "nvarchar(1024)", maxLength: 1024, nullable: true),
                    IsLocked = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Samples", x => x.SampleId);
                });

            migrationBuilder.CreateTable(
                name: "AuditEvents",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    SampleId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    TimestampUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Actor = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    Action = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    DetailsJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    SampleEntitySampleId = table.Column<string>(type: "nvarchar(64)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuditEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AuditEvents_Samples_SampleEntitySampleId",
                        column: x => x.SampleEntitySampleId,
                        principalTable: "Samples",
                        principalColumn: "SampleId");
                });

            migrationBuilder.CreateTable(
                name: "ModelRuns",
                columns: table => new
                {
                    JobId = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    SampleId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Service = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    ModelName = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    RepoCommit = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    WeightsSha256 = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    StartedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    EndedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Status = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    ResultUri = table.Column<string>(type: "nvarchar(1024)", maxLength: 1024, nullable: true),
                    ErrorCode = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ModelRuns", x => x.JobId);
                    table.ForeignKey(
                        name: "FK_ModelRuns_Samples_SampleId",
                        column: x => x.SampleId,
                        principalTable: "Samples",
                        principalColumn: "SampleId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AuditEvents_SampleEntitySampleId",
                table: "AuditEvents",
                column: "SampleEntitySampleId");

            migrationBuilder.CreateIndex(
                name: "IX_AuditEvents_SampleId_TimestampUtc",
                table: "AuditEvents",
                columns: new[] { "SampleId", "TimestampUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_ModelRuns_SampleId_Service",
                table: "ModelRuns",
                columns: new[] { "SampleId", "Service" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AuditEvents");

            migrationBuilder.DropTable(
                name: "ModelRuns");

            migrationBuilder.DropTable(
                name: "Samples");
        }
    }
}
