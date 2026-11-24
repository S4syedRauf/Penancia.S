targetScope = 'resourceGroup'

@description('Storage account to enable Defender for Storage on')
param storageAccountName string

@description('Scan results Event Grid topic resource ID')
param scanResultsTopicId string

@description('Malware scanning cap in GB per month (0 = unlimited)')
param malwareScanCapGB int = 1000

@description('Shared tags for all resources')
param tags object

// Event Grid topic for Defender scan results
resource scanTopic 'Microsoft.EventGrid/topics@2025-02-15' = {
  name: 'egt-${storageAccountName}-scan'
  location: resourceGroup().location
  tags: tags
  properties: {
    inputSchema: 'EventGridSchema'
  }
}

// Defender for Storage settings (per storage account)
resource defender 'Microsoft.Security/defenderForStorageSettings@2025-01-01' = {
  name: 'current'
  scope: resourceId('Microsoft.Storage/storageAccounts', storageAccountName)
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

output scanTopicName string = scanTopic.name
output scanTopicId string = scanTopic.id
output scanTopicEndpoint string = scanTopic.properties.endpoint