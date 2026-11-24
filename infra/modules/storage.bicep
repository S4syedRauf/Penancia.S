targetScope = 'resourceGroup'

@description('Prefix for naming')
param prefix string

@description('Environment tag')
param environment string

@description('Web origin for CORS (e.g., https://penancias-web.xxx.uaenorth.azurecontainerapps.io)')
param webOrigin string

@description('Shared tags for all resources')
param tags object

@description('Location for resources')
param location string = resourceGroup().location

var containerNames = [
  'raw-video'
  'raw-images'
  'results'
  'reports'
  'quarantine'
  'derived'
]

// Clinical Media & Results Storage Account
resource mediaStorage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: 'st${prefix}'
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: mediaStorage
  name: 'default'
  properties: {
    cors: {
      corsRules: [
        {
          allowedOrigins: [
            webOrigin
          ]
          allowedMethods: [
            'PUT'
            'GET'
            'HEAD'
            'OPTIONS'
          ]
          allowedHeaders: [
            '*'
          ]
          exposedHeaders: [
            '*'
          ]
          maxAgeInSeconds: 3600
        }
      ]
    }
  }
}

resource mediaContainers 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = [for name in containerNames: {
  parent: blobService
  name: name
  properties: {
    publicAccess: 'None'
  }
}]

// Management policy: delete quarantine blobs after 1 day
resource managementPolicy 'Microsoft.Storage/storageAccounts/managementPolicies@2023-01-01' = {
  parent: mediaStorage
  name: 'default'
  properties: {
    policy: {
      rules: [
        {
          name: 'delete-quarantine-after-1-day'
          enabled: true
          type: 'Lifecycle'
          definition: {
            actions: {
              baseBlob: {
                delete: {
                  daysAfterCreationGreaterThan: 1
                }
              }
            }
            filters: {
              blobTypes: [
                'blockBlob'
              ]
              prefixMatch: [
                'quarantine/'
              ]
            }
          }
        }
      ]
    }
  }
}

resource fileService 'Microsoft.Storage/storageAccounts/fileServices@2023-01-01' = {
  parent: mediaStorage
  name: 'default'
}

resource clinicalStateShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-01-01' = {
  parent: fileService
  name: 'clinical-state'
  properties: {
    shareQuota: 100
    enabledProtocols: 'SMB'
  }
}

// Durable Functions Internal State Storage Account
resource functionStorage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: 'stfn${prefix}'
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

output mediaStorageName string = mediaStorage.name
output mediaStorageId string = mediaStorage.id
output functionStorageName string = functionStorage.name
output functionStorageId string = functionStorage.id
output containerNames array = containerNames
output clinicalStateShareName string = clinicalStateShare.name