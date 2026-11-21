using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Penancia.S.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPatientIntakeAndFollowUpEntities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DailyCheckIns",
                columns: table => new
                {
                    CheckInId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    Mood = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    EnergyLevel = table.Column<int>(type: "int", nullable: true),
                    SleepHours = table.Column<double>(type: "float", nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(1024)", maxLength: 1024, nullable: true),
                    LoggedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DailyCheckIns", x => x.CheckInId);
                });

            migrationBuilder.CreateTable(
                name: "FollowUpTasks",
                columns: table => new
                {
                    TaskId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    IsCompleted = table.Column<bool>(type: "bit", nullable: false),
                    IsSkipped = table.Column<bool>(type: "bit", nullable: false),
                    DueDateUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(1024)", maxLength: 1024, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FollowUpTasks", x => x.TaskId);
                });

            migrationBuilder.CreateTable(
                name: "Questionnaires",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    AnswersJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SubmittedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Questionnaires", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ScreeningRuns",
                columns: table => new
                {
                    RunId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    RiskBand = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    RecommendationsJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ScreeningRuns", x => x.RunId);
                });

            migrationBuilder.CreateTable(
                name: "SymptomLogs",
                columns: table => new
                {
                    LogId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    SymptomType = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    Severity = table.Column<int>(type: "int", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(1024)", maxLength: 1024, nullable: true),
                    LoggedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SymptomLogs", x => x.LogId);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DailyCheckIns");

            migrationBuilder.DropTable(
                name: "FollowUpTasks");

            migrationBuilder.DropTable(
                name: "Questionnaires");

            migrationBuilder.DropTable(
                name: "ScreeningRuns");

            migrationBuilder.DropTable(
                name: "SymptomLogs");
        }
    }
}
