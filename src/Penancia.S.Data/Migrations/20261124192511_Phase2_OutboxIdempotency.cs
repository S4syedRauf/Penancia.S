using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Penancia.S.Data.Migrations
{
    /// <inheritdoc />
    public partial class Phase2_OutboxIdempotency : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "IdempotencyKey",
                table: "OutboxMessages",
                type: "nvarchar(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SampleId",
                table: "OutboxMessages",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_OutboxMessages_IdempotencyKey",
                table: "OutboxMessages",
                column: "IdempotencyKey",
                unique: true,
                filter: "[IdempotencyKey] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_OutboxMessages_SampleId",
                table: "OutboxMessages",
                column: "SampleId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_OutboxMessages_IdempotencyKey",
                table: "OutboxMessages");

            migrationBuilder.DropIndex(
                name: "IX_OutboxMessages_SampleId",
                table: "OutboxMessages");

            migrationBuilder.DropColumn(
                name: "IdempotencyKey",
                table: "OutboxMessages");

            migrationBuilder.DropColumn(
                name: "SampleId",
                table: "OutboxMessages");
        }
    }
}
