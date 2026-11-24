targetScope = 'resourceGroup'

@description('Storage account to enable Defender for Storage on')
param storageAccountName string

@description('Storage queue name for malware scan results')
param scanResultQueueName string = 'scan-result-events'

@description('Malware scanning cap in GB per month (0 = unlimited)')
param malwareScanCapGB int = 1000

@description('Shared tags for all resources')
param tags object

// Existing reference to the storage account for scope and role assignment
resource st 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

// Event Grid topic for Defender scan results (custom topic with SystemAssigned identity)
resource scanTopic 'Microsoft.EventGrid/topics@2025-02-15' = {
  name: 'egt-${storageAccountName}-scan'
  location: resourceGroup().location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    inputSchema: 'EventGridSchema'
  }
}

// Defender for Storage settings (per storage account)
resource defender 'Microsoft.Security/defenderForStorageSettings@2025-01-01' = {
  name: 'current'
  scope: st
  properties: {
    isEnabled: true
    overrideSubscriptionLevelSettings: true
    sensitiveDataDiscovery: {
      isEnabled: false
    }
    malwareScanning: {
      onUpload: {
        isEnabled: true
        capGBPerMonth: malwareScanCapGB
      }
      scanResultsEventGridTopicResourceId: scanTopic.id
    }
  }
}

// Role assignment: scanTopic system-assigned identity -> Storage Queue Data Message Sender on storage account
resource scanResultQueueSender 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(st.id, scanTopic.id, 'scan-result-queue-sender')
  scope: st
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'c6a89b2d-59bc-44d0-9896-0f6e12d7b80a') // Storage Queue Data Message Sender
    principalId: scanTopic.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Event Grid subscription on scanTopic for malware scan results -> scan-result-events storage queue
// Uses deliveryWithResourceIdentity with scanTopic's system-assigned identity
// DEVIATION: queue instead of Function endpoint because Functions don't exist until Step 2.4 (receiver comes in Step 2.4)
resource scanResultSubscription 'Microsoft.EventGrid/topics/eventSubscriptions@2025-02-15' = {
  parent: scanTopic
  name: 'scan-result-subscription'
  dependsOn: [
    scanResultQueueSender
  ]
  properties: {
    deliveryWithResourceIdentity: {
      identity: {
        type: 'SystemAssigned'
      }
      destination: {
        endpointType: 'StorageQueue'
        properties: {
          resourceId: st.id
          queueName: scanResultQueueName
        }
      }
    }
    eventDeliverySchema: 'CloudEventSchemaV1_0'
  }
}

output scanTopicName string = scanTopic.name
output scanTopicId string = scanTopic.id
output scanTopicEndpoint string = scanTopic.properties.endpoint
output scanResultQueueName string = scanResultQueueName
