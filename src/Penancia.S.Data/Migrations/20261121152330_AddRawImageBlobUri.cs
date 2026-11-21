using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Penancia.S.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddRawImageBlobUri : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "RawImageBlobUri",
                table: "Samples",
                type: "nvarchar(1024)",
                maxLength: 1024,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RawImageBlobUri",
                table: "Samples");
        }
    }
}
