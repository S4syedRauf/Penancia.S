using Azure.Identity;
using Azure.Storage.Blobs;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Identity.Web;
using Penancia.S.Data;

var builder = WebApplication.CreateBuilder(args);

// ---------------------------------------------------------------------------
// Database Context — FAIL FAST (#42).
// No hardcoded SQL fallback: if 'ConnectionStrings:DefaultConnection' is
// missing the app fails at startup with a clear error instead of silently
// connecting to a wrong server. The connection string comes from
// configuration / Key Vault references only (see infra/main.bicep).
// TrustServerCertificate is forced to False regardless of what
// configuration supplies, so the server certificate is always validated.
// ---------------------------------------------------------------------------
var connectionStringRaw = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException(
        "Missing configuration 'ConnectionStrings:DefaultConnection'. Set it in " +
        "appsettings.json (local dev only) or as an App Setting / Key Vault " +
        "reference in Azure (see infra/main.bicep, secret 'sql-connection-string').");

var connectionString = new SqlConnectionStringBuilder(connectionStringRaw)
{
    TrustServerCertificate = false
}.ConnectionString;

builder.Services.AddDbContext<PenanciaDbContext>(options =>
{
    options.UseSqlServer(connectionString);
});

// ---------------------------------------------------------------------------
// Blob storage — user-delegation SAS (#6).
// BlobServiceClient is built from the storage account name in configuration
// ('Azure:StorageAccount') with DefaultAzureCredential (managed identity);
// no account key or connection string is used. The managed identity must
// hold Storage Blob Data Contributor on the storage account (see
// infra/main.bicep) for GetUserDelegationKeyAsync to succeed.
// ---------------------------------------------------------------------------
builder.Services.AddSingleton(_ =>
{
    var account = builder.Configuration["Azure:StorageAccount"]
        ?? throw new InvalidOperationException(
            "Missing configuration 'Azure:StorageAccount'. Set it as an App Setting " +
            "in Azure (see infra/main.bicep) or in appsettings.json for local dev.");
    var managedIdentityClientId = builder.Configuration["Azure:ManagedIdentityClientId"];
    var credentialOptions = new DefaultAzureCredentialOptions();
    if (!string.IsNullOrWhiteSpace(managedIdentityClientId))
        credentialOptions.ManagedIdentityClientId = managedIdentityClientId;
    return new BlobServiceClient(
        new Uri($"https://{account}.blob.core.windows.net"),
        new DefaultAzureCredential(credentialOptions));
});

// ---------------------------------------------------------------------------
// CORS (#41) — exact-origin allowlist only. The SetIsOriginAllowed wildcard
// (any *.azurestaticapps.net host, any localhost) is removed.
// Localhost dev origins and the official Azure Static Web App / Storage origins
// are explicitly listed.
// ---------------------------------------------------------------------------
builder.Services.AddCors(options =>
{
    options.AddPolicy("PenanciaWeb", policy =>
    {
        policy
            .WithOrigins(
                "http://localhost:5173",
                "http://localhost:3000",
                "https://icy-sea-01859df0f.3.azurestaticapps.net",
                "https://stpenancias.z1.web.core.windows.net"
            )
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

// Configure Authentication (Entra ID)
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddMicrosoftIdentityWebApi(builder.Configuration.GetSection("AzureAd"));

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("StaffOnly", policy => policy.RequireRole("Technician", "Signer", "ClinicalDirector", "LabAdmin"));
    options.AddPolicy("SignerOnly", policy => policy.RequireRole("Signer", "ClinicalDirector"));
});

builder.Services.AddControllers();
builder.Services.AddHttpClient("workflow", client =>
{
    client.BaseAddress = new Uri(builder.Configuration["Workflow:BaseUrl"]
        ?? throw new InvalidOperationException("Missing configuration 'Workflow:BaseUrl'."));
    client.Timeout = TimeSpan.FromSeconds(30);
});
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// Swagger is development-only (#41). Outside Development there is no
// Swagger UI and no '/' -> '/swagger' redirect.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "Penancia.S API v1");
        c.RoutePrefix = "swagger";
    });
    app.MapGet("/", () => Results.Redirect("/swagger"));
}

app.UseCors("PenanciaWeb");
app.UseAuthentication();
app.UseAuthorization();

// Container Apps Health Probe. Deliberately unauthenticated: it is a
// liveness probe, not a clinical or state-changing endpoint, and it returns
// no patient or clinical data.
app.MapGet("/health", () => Results.Ok(new
{
    status = "Healthy",
    project = "Penancia.S",
    region = "uaenorth",
    timestampUtc = DateTime.UtcNow
}));

app.MapControllers();

app.Run();
