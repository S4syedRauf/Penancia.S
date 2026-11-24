// Penancia.S — Azure infrastructure (Bicep, resource-group scope).
// Added 2026-11-21 (fix batch): Key Vault + all compute (Api Container App,
// Workflow Function App, Gotenberg) + app settings, so the deployment is real.
// No deployment has been run from this review — nothing here is claimed
// deployed. No Static Web App is defined: no frontend exists in this repo.
// Secrets are Key Vault references only, never literals; the vault secrets are
// created with the placeholder value '<FILL-IN-VIA-KEY-VAULT>' and MUST be
// replaced with real values before the apps can start.
targetScope = 'resourceGroup'

@description('Primary deployment location for Penancia resources. DR region is UAE Central (uaecentral) — not deployed by this template.')
param location string = 'uaenorth'

@description('Prefix for all naming conventions. Keep short — storage account names have a 24-char limit.')
param prefix string = 'penancias'

@description('Environment tag (dev, staging, prod). Used for tagging and cost attribution.')
param environment string = 'dev'

@description('Tag of the Api container image in ACR (repository penancias-api). The image must be built from the repo-root Dockerfile and pushed to ACR before deploy, or the Api Container App will fail to start.')
param apiImageTag string = 'latest'

@description('Gotenberg container image. Verify the tag is a current stable release at deploy time.')
param gotenbergImage string = 'gotenberg/gotenberg:8'

@description('Immutable web image tag in the penancias-web ACR repository.')
param webImageTag string = 'latest'

@description('Immutable workflow image tag in the penancias-workflow ACR repository.')
param workflowImageTag string = 'latest'

@description('Entra application (client) ID used by the public web Easy Auth registration.')
param entraWebClientId string

@description('Entra application (client) ID used as the protected API audience.')
param entraApiClientId string

@description('Entra tenant allowed to use the clinical application.')
param entraTenantId string = tenant().tenantId

@secure()
@description('Confidential web client secret for Container Apps Easy Auth.')
param entraWebClientSecret string

@secure()
@description('Native Functions host/function key. Leave empty only for the first workflow bootstrap deployment, then set it before enabling analysis.')
param workflowFunctionKey string = ''

@description('Web origin for Storage CORS (e.g., https://penancias-web.xxx.uaenorth.azurecontainerapps.io)')
param webOrigin string = 'https://localhost:3000'

@description('Malware scanning cap in GB per month (0 = unlimited)')
param malwareScanCapGB int = 1000

// ---------------------------------------------------------------------------
// Shared tag block applied to every resource for cost management and policy.
// ---------------------------------------------------------------------------
var commonTags = {
  environment: environment
  project: 'Penancia.S'
  managedBy: 'Bicep'
  region: location
}

// ---------------------------------------------------------------------------
// 1. Managed Identity — passwordless auth for all services (no secrets stored)
// ---------------------------------------------------------------------------
resource appIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${prefix}-apps'
  location: location
  tags: commonTags
}

// ---------------------------------------------------------------------------
// 2. Monitoring: Log Analytics Workspace & Application Insights
//    30-day retention keeps dev costs near-zero.
// ---------------------------------------------------------------------------
resource logWorkspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: 'log-${prefix}'
  location: location
  tags: commonTags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${prefix}'
  location: location
  kind: 'web'
  tags: commonTags
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logWorkspace.id
  }
}

// ---------------------------------------------------------------------------
// 3. Storage Module: Clinical Media & Results + Durable Functions State
//    6 private containers: raw-video, raw-images, results, reports, quarantine, derived
//    CORS configured for web origin, lifecycle policy deletes quarantine after 1 day
//    2 queues: blob-created-events, scan-result-events
// ---------------------------------------------------------------------------
var mediaStorageName = 'st${prefix}'

module storageModule 'modules/storage.bicep' = {
  name: 'storage-deployment'
  params: {
    prefix: prefix
    mediaStorageName: mediaStorageName
    webOrigin: webOrigin
    tags: commonTags
    location: location
  }
}

resource mediaStorageRef 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: mediaStorageName
}

// ---------------------------------------------------------------------------
// Phase 2 Step 2.1: Defender for Storage Module
//    Per-account Defender settings with malware scanning on upload
//    Scan results published to dedicated Event Grid topic
// ---------------------------------------------------------------------------
module defenderModule 'modules/defender.bicep' = {
  name: 'defender-deployment'
  params: {
    storageAccountName: mediaStorageName
    scanResultQueueName: 'scan-result-events'
    malwareScanCapGB: malwareScanCapGB
    tags: commonTags
  }
}

// ---------------------------------------------------------------------------
// Phase 2 Step 2.1: Event Grid Module for Blob Events
//    System topic on media storage, subscription for quarantine container BlobCreated
//    Events delivered to storage queue via system topic's managed identity
//    DEVIATION: queues instead of Function endpoints (Functions don't exist until Step 2.4)
// ---------------------------------------------------------------------------
module eventGridModule 'modules/eventgrid.bicep' = {
  name: 'eventgrid-deployment'
  params: {
    storageAccountName: mediaStorageName
    blobCreatedQueueName: 'blob-created-events'
    tags: commonTags
    location: location
  }
}

// ---------------------------------------------------------------------------
// 4. Service Bus Namespace: 11 Job Queues + model-results
//    Standard tier: supports dead-lettering and duplicate detection.
//    maxDeliveryCount=5 gives 5 retries before poison-queue.
//    Queue names match DispatchModelJobActivity (`job-{service}`) and the
//    orchestrator fan-out (video-qc, pycasa, banerjee) plus 'model-results'.
//    The other 8 job queues exist for models that are planned, not yet wired.
// ---------------------------------------------------------------------------
resource serviceBusNamespace 'Microsoft.ServiceBus/namespaces@2022-10-01-preview' = {
  name: 'sb-${prefix}'
  location: location
  tags: commonTags
  sku: {
    name: 'Standard'
  }
}

var queueNames = [
  'job-video-qc'
  'job-active'
  'job-pycasa'
  'job-banerjee'
  'job-maskrcnn'
  'job-cellpose'
  'job-madrnet'
  'job-cbam'
  'job-maml'
  'job-spermmorpho'
  'job-opencasa'
  'model-results'
]

resource queues 'Microsoft.ServiceBus/namespaces/queues@2022-10-01-preview' = [for q in queueNames: {
  parent: serviceBusNamespace
  name: q
  properties: {
    maxDeliveryCount: 5
    requiresDuplicateDetection: true
    duplicateDetectionHistoryTimeWindow: 'PT1H'
    deadLetteringOnMessageExpiration: true
  }
}]

// ---------------------------------------------------------------------------
// 5. Azure Container Registry (Standard — no admin user; MI pulls only)
// ---------------------------------------------------------------------------
resource acr 'Microsoft.ContainerRegistry/registries@2023-01-01-preview' = {
  name: 'acr${prefix}'
  location: location
  tags: commonTags
  sku: {
    name: 'Standard'
  }
  properties: {
    adminUserEnabled: false
  }
}

// ---------------------------------------------------------------------------
// 6. Container Apps Environment (Durable Functions, Gotenberg PDF, model jobs)
//    Linked to Log Analytics for centralized logs.
// ---------------------------------------------------------------------------
resource containerAppEnv 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: 'cae-${prefix}'
  location: location
  tags: commonTags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logWorkspace.properties.customerId
        sharedKey: logWorkspace.listKeys().primarySharedKey
      }
    }
    storages: [
      {
        name: 'clinical-state'
        storageType: 'AzureFile'
        accountName: storageModule.outputs.mediaStorageName
        shareName: storageModule.outputs.clinicalStateShareName
        accessMode: 'ReadWrite'
      }
    ]
  }
}

// ---------------------------------------------------------------------------
// 7. Azure SQL Server — Entra-only authentication (no SQL passwords)
//    The Managed Identity (id-penancias-apps) is the AD admin.
// ---------------------------------------------------------------------------
resource sqlServer 'Microsoft.Sql/servers@2023-05-01-preview' = {
  name: 'sql-${prefix}'
  location: location
  tags: commonTags
  properties: {
    version: '12.0'
    administrators: {
      administratorType: 'ActiveDirectory'
      principalType: 'Application'
      login: appIdentity.name
      sid: appIdentity.properties.principalId
      tenantId: tenant().tenantId
      azureADOnlyAuthentication: true   // No SQL passwords — Managed Identity only
    }
  }
}

// Allow Azure services (Container Apps, App Service) to reach the SQL server
resource sqlFirewallAzureServices 'Microsoft.Sql/servers/firewallRules@2023-05-01-preview' = {
  parent: sqlServer
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// ---------------------------------------------------------------------------
// 8. Azure SQL Database — Serverless General Purpose (auto-pauses when idle)
//    Scales to 0 — no billing when dev environment is not in use.
//    autoPauseDelay=60 means it pauses after 60 mins of inactivity.
// ---------------------------------------------------------------------------
resource sqlDatabase 'Microsoft.Sql/servers/databases@2023-05-01-preview' = {
  parent: sqlServer
  name: 'sqldb-${prefix}'
  location: location
  tags: commonTags
  sku: {
    name: 'GP_S_Gen5_1'   // Serverless General Purpose, 1 vCore
    tier: 'GeneralPurpose'
    family: 'Gen5'
    capacity: 1
  }
  properties: {
    autoPauseDelay: 60
    minCapacity: json('0.5')  // numeric decimal — Bicep BCP036 fix
    catalogCollation: 'SQL_Latin1_General_CP1_CI_AS'
    zoneRedundant: false     // Single zone is fine for dev; enables cost saving
    readScale: 'Disabled'
    requestedBackupStorageRedundancy: 'Local'
  }
}

// ---------------------------------------------------------------------------
// 9. Key Vault — all secrets are Key Vault references, never literals.
//    The secrets below are created with the placeholder value
//    '<FILL-IN-VIA-KEY-VAULT>'. Replace each one with its real value before
//    the apps can start (portal or `az keyvault secret set`). RBAC is on;
//    access is granted in section 14.
// ---------------------------------------------------------------------------
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kv-${prefix}'
  location: location
  tags: commonTags
  properties: {
    tenantId: tenant().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    networkAcls: {
      defaultAction: 'Allow'   // TODO: restrict to selected networks / private endpoint before production
      bypass: 'AzureServices'
    }
  }
}

// SQL connection string (Managed Identity auth, no password). Used by:
//   Api  -> ConnectionStrings__DefaultConnection (src/Penancia.S.Api/Program.cs)
//   Workflow -> SqlConnectionString (src/Penancia.S.Workflow/Program.cs)
resource kvSecretSql 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'sql-connection-string'
  properties: {
    value: '<FILL-IN-VIA-KEY-VAULT>'
  }
}

// Durable Functions internal storage connection string.
// Used by Workflow -> AzureWebJobsStorage (src/Penancia.S.Workflow/local.settings.json).
resource kvSecretFuncStorage 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'function-storage-connection-string'
  properties: {
    value: '<FILL-IN-VIA-KEY-VAULT>'
  }
}

// Application Insights connection string. Used by:
//   Api -> ApplicationInsights__ConnectionString (src/Penancia.S.Api/appsettings.json)
//   Workflow -> APPLICATIONINSIGHTS_CONNECTION_STRING (src/Penancia.S.Workflow/local.settings.json)
resource kvSecretAppInsights 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'app-insights-connection-string'
  properties: {
    value: '<FILL-IN-VIA-KEY-VAULT>'
  }
}

resource kvSecretWorkflowKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'workflow-function-key'
  properties: {
    value: empty(workflowFunctionKey) ? 'PENDING-WORKFLOW-BOOTSTRAP' : workflowFunctionKey
  }
}

resource kvSecretWebClient 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'entra-web-client-secret'
  properties: {
    value: entraWebClientSecret
  }
}

// ---------------------------------------------------------------------------
// 10. Api Container App — Penancia.S.Api (ASP.NET Core, port 8080)
//     Image is built from the repo-root Dockerfile and pushed to ACR first.
//     App settings cover EVERY key the Api reads:
//       Program.cs: ConnectionStrings__DefaultConnection, AzureAd__* section.
//       appsettings.json: Azure__StorageAccount, Azure__ServiceBusFqdn,
//       Azure__ContainerRegistry, Azure__ManagedIdentityClientId,
//       ApplicationInsights__ConnectionString.
//     Non-secret values are derived from the deployed resources, not literals.
// ---------------------------------------------------------------------------
resource apiContainerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'penancias-api'
  location: location
  tags: commonTags
  identity: {
    type: 'SystemAssigned, UserAssigned'
    userAssignedIdentities: {
      '${appIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      ingress: {
        external: false
        targetPort: 8080
        transport: 'http'
      }
      registries: [
        {
          server: acr.properties.loginServer
          identity: appIdentity.id
        }
      ]
      secrets: [
        {
          name: 'sql-connection-string'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/sql-connection-string'
          identity: appIdentity.id
        }
        {
          name: 'app-insights-connection-string'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/app-insights-connection-string'
          identity: appIdentity.id
        }
        {
          name: 'workflow-function-key'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/workflow-function-key'
          identity: appIdentity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          image: '${acr.properties.loginServer}/penancias-api:${apiImageTag}'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'ASPNETCORE_ENVIRONMENT'
              value: 'Production'
            }
            {
              name: 'ASPNETCORE_URLS'
              value: 'http://+:8080'
            }
            {
              name: 'ConnectionStrings__DefaultConnection'
              secretRef: 'sql-connection-string'
            }
            {
              name: 'AzureAd__Instance'
              value: 'https://login.microsoftonline.com/'
            }
            {
              name: 'AzureAd__TenantId'
              value: entraTenantId
            }
            {
              name: 'AzureAd__ClientId'
              value: entraApiClientId
            }
            {
              name: 'AzureAd__Audience'
              value: 'api://${entraApiClientId}'
            }
            {
              name: 'Azure__StorageAccount'
              value: storageModule.outputs.mediaStorageName
            }
            {
              name: 'Azure__ServiceBusFqdn'
              value: '${serviceBusNamespace.name}.servicebus.windows.net'
            }
            {
              name: 'Azure__ContainerRegistry'
              value: acr.properties.loginServer
            }
            {
              name: 'Azure__ManagedIdentityClientId'
              value: appIdentity.properties.clientId
            }
            {
              name: 'ApplicationInsights__ConnectionString'
              secretRef: 'app-insights-connection-string'
            }
            {
              name: 'Workflow__BaseUrl'
              value: 'http://penancias-workflow'
            }
            {
              name: 'Workflow__FunctionKey'
              secretRef: 'workflow-function-key'
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 8080
              }
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 3
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 11. Gotenberg Container App — HTML-to-PDF rendering (internal ingress only)
//     Called by the Workflow's RenderPdfReportActivity (currently a TODO stub
//     in code — Stage S5; the GotenbergUrl app setting in section 12 is
//     provisioned here so the wiring has somewhere to point when the stub
//     is implemented).
// ---------------------------------------------------------------------------
resource gotenbergContainerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'penancias-pdf'
  location: location
  tags: commonTags
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      ingress: {
        external: false
        targetPort: 3000
        transport: 'http'
      }
    }
    template: {
      containers: [
        {
          name: 'gotenberg'
          image: gotenbergImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 12. Workflow — native Azure Functions on Azure Container Apps.
// Function keys are stored by the host in functionStorage's private
// azure-webjob-secrets container; retrieve them after the first deployment.
// ---------------------------------------------------------------------------
resource workflowFunctionApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'penancias-workflow'
  location: location
  tags: commonTags
  kind: 'functionapp'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${appIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      ingress: {
        external: false
        targetPort: 80
        transport: 'http'
      }
      registries: [
        {
          server: acr.properties.loginServer
          identity: appIdentity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'workflow'
          image: '${acr.properties.loginServer}/penancias-workflow:${workflowImageTag}'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'AzureWebJobsStorage'
              value: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=function-storage-connection-string)'
            }
            {
              name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING'
              value: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=function-storage-connection-string)'
            }
            {
              name: 'WEBSITE_CONTENTSHARE'
              value: 'penancias-workflow-content'
            }
            {
              name: 'FUNCTIONS_WORKER_RUNTIME'
              value: 'dotnet-isolated'
            }
            {
              name: 'FUNCTIONS_EXTENSION_VERSION'
              value: '~4'
            }
            {
              name: 'SqlConnectionString'
              value: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=sql-connection-string)'
            }
            {
              name: 'Azure__ManagedIdentityClientId'
              value: appIdentity.properties.clientId
            }
            {
              name: 'ServiceBusConnection__fullyQualifiedNamespace'
              value: '${serviceBusNamespace.name}.servicebus.windows.net'
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=app-insights-connection-string)'
            }
            {
              name: 'GotenbergUrl'
              value: 'http://penancias-pdf'
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 2
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 13. Public ingress is only on the web application. Easy Auth is configured in
// web-auth.bicep after this resource so the callback URL is known.
// ---------------------------------------------------------------------------
resource webContainerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'penancias-web'
  location: location
  tags: commonTags
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'http'
      }
      registries: [
        {
          server: acr.properties.loginServer
          identity: appIdentity.id
        }
      ]
      secrets: [
        {
          name: 'entra-web-client-secret'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/entra-web-client-secret'
          identity: appIdentity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: '${acr.properties.loginServer}/penancias-web:${webImageTag}'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'PENANCIA_API_URL'
              value: 'http://penancias-api'
            }
            {
              name: 'AUTH_PRODUCTION'
              value: 'true'
            }
            {
              name: 'REQUIRE_VERIFIED_JWT'
              value: 'true'
            }
            {
              name: 'AUTH_USE_CONTAINER_APPS_OBO'
              value: 'true'
            }
            {
              name: 'ENTRA_TENANT_ID'
              value: entraTenantId
            }
            {
              name: 'ENTRA_CLIENT_ID'
              value: entraWebClientId
            }
            {
              name: 'ENTRA_CLIENT_SECRET'
              secretRef: 'entra-web-client-secret'
            }
            {
              name: 'ENTRA_API_SCOPE'
              value: 'api://${entraApiClientId}/access_as_user'
            }
          ]
          volumeMounts: [
            {
              volumeName: 'clinical-state'
              mountPath: '/var/lib/penancia'
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 3000
              }
            }
          ]
        }
      ]
      volumes: [
        {
          name: 'clinical-state'
          storageType: 'AzureFile'
          storageName: 'clinical-state'
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 14. Role assignments — least-privilege access for the managed identity.
//     Key Vault Secrets User lets the identity (and the Api app's
//     system-assigned identity) resolve the Key Vault references above.
//     Fixed role IDs per https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles
// ---------------------------------------------------------------------------
resource kvSecretsUserIdentity 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, appIdentity.id, 'kv-secrets-user')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6') // Key Vault Secrets User
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource kvSecretsUserApi 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, apiContainerApp.id, 'kv-secrets-user')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6') // Key Vault Secrets User
    principalId: apiContainerApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource storageContributorIdentity 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(mediaStorageRef.id, appIdentity.id, 'blob-data-contributor')
  scope: mediaStorageRef
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe') // Storage Blob Data Contributor
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource storageQueueProcessorIdentity 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(mediaStorageRef.id, appIdentity.id, 'queue-message-processor')
  scope: mediaStorageRef
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '8a0f0c08-91a1-4084-bc3d-661d67233fed') // Storage Queue Data Message Processor
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource sbSenderIdentity 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(serviceBusNamespace.id, appIdentity.id, 'sb-data-sender')
  scope: serviceBusNamespace
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '69a216fc-b8fb-44d8-bc22-1f3c2cd27a39') // Azure Service Bus Data Sender
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource sbReceiverIdentity 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(serviceBusNamespace.id, appIdentity.id, 'sb-data-receiver')
  scope: serviceBusNamespace
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4f6d3b9b-027b-4f4c-9142-0e5a2a2247e0') // Azure Service Bus Data Receiver
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource acrPullIdentity 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, appIdentity.id, 'acr-pull')
  scope: acr
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d') // AcrPull
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// ---------------------------------------------------------------------------
// Outputs — referenced by CI/CD pipeline and application configuration
// ---------------------------------------------------------------------------
output mediaStorageName string = storageModule.outputs.mediaStorageName
output mediaStorageId string = storageModule.outputs.mediaStorageId
output functionStorageName string = storageModule.outputs.functionStorageName
output functionStorageId string = storageModule.outputs.functionStorageId
output serviceBusNamespaceName string = serviceBusNamespace.name
output serviceBusFqdn string = '${serviceBusNamespace.name}.servicebus.windows.net'
output acrLoginServer string = acr.properties.loginServer
output containerAppEnvName string = containerAppEnv.name
@secure()
output appInsightsConnectionString string = appInsights.properties.ConnectionString
output sqlServerFqdn string = sqlServer.properties.fullyQualifiedDomainName
output sqlDatabaseName string = sqlDatabase.name
output appIdentityClientId string = appIdentity.properties.clientId
output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
output apiContainerAppName string = apiContainerApp.name
output apiContainerAppFqdn string = apiContainerApp.properties.configuration.ingress.fqdn
output workflowFunctionAppName string = workflowFunctionApp.name
output workflowContainerAppFqdn string = workflowFunctionApp.properties.configuration.ingress.fqdn
output webContainerAppName string = webContainerApp.name
output webContainerAppFqdn string = webContainerApp.properties.configuration.ingress.fqdn
output entraWebClientId string = entraWebClientId
output gotenbergContainerAppName string = gotenbergContainerApp.name
output gotenbergFqdn string = gotenbergContainerApp.properties.configuration.ingress.fqdn
output eventGridTopicName string = eventGridModule.outputs.eventGridTopicName
output eventGridTopicId string = eventGridModule.outputs.eventGridTopicId
output scanTopicName string = defenderModule.outputs.scanTopicName
output scanTopicId string = defenderModule.outputs.scanTopicId
output scanTopicEndpoint string = defenderModule.outputs.scanTopicEndpoint
output blobCreatedQueueName string = eventGridModule.outputs.blobCreatedQueueName
output scanResultQueueName string = defenderModule.outputs.scanResultQueueName