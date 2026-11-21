using Azure.Identity;
using Azure.Messaging.ServiceBus;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Penancia.S.Data;

// -------------------------------------------------------------------------
// Penancia.S.Workflow — Azure Durable Functions isolated worker startup
//
// DI registrations:
//   - PenanciaDbContext: EF Core → Azure SQL via Managed Identity
//   - ServiceBusClient:  Azure Service Bus via Managed Identity (no connection string with password)
//
// Configuration is FAIL-FAST: there are no hardcoded hostnames or fallback connection
// strings in this file. Both settings below must come from configuration (local.settings.json
// for local dev, App Settings / Key Vault references in Azure). If either is missing the
// host fails at startup with a clear error instead of silently connecting to a wrong server.
// Required settings:
//   - SqlConnectionString (Azure SQL; Managed Identity auth, no password in the string)
//   - ServiceBusConnection__fullyQualifiedNamespace (Service Bus namespace FQDN)
//
// TrustServerCertificate is forced to False on the SQL connection string regardless of
// what configuration supplies, so a server certificate is always validated.
//
// All Activity classes are auto-discovered by the Functions runtime — no
// manual registration needed; just place them in the Activities/ folder.
// -------------------------------------------------------------------------

var host = new HostBuilder()
    .ConfigureFunctionsWorkerDefaults()
    .ConfigureServices((ctx, services) =>
    {
        // Azure SQL — Managed Identity auth (no password in connection string).
        // Fail fast if the setting is missing; never fall back to a hardcoded server.
        var sqlConnRaw = ctx.Configuration["SqlConnectionString"]
            ?? throw new InvalidOperationException(
                "Missing configuration 'SqlConnectionString'. Set it in local.settings.json " +
                "(local dev) or as an App Setting / Key Vault reference in Azure.");

        var sqlConn = new SqlConnectionStringBuilder(sqlConnRaw)
        {
            TrustServerCertificate = false
        }.ConnectionString;

        services.AddDbContext<PenanciaDbContext>(opts =>
            opts.UseSqlServer(sqlConn));

        // Service Bus — Managed Identity auth via DefaultAzureCredential.
        // Fail fast if the namespace setting is missing; never fall back to a hardcoded host.
        var sbFqdn = ctx.Configuration["ServiceBusConnection__fullyQualifiedNamespace"]
            ?? throw new InvalidOperationException(
                "Missing configuration 'ServiceBusConnection__fullyQualifiedNamespace'. Set it in " +
                "local.settings.json (local dev) or as an App Setting / Key Vault reference in Azure.");

        services.AddSingleton(_ => new ServiceBusClient(
            sbFqdn,
            new DefaultAzureCredential()));
    })
    .Build();

host.Run();
