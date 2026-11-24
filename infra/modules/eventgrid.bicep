targetScope = 'resourceGroup'

@description('Storage account to create system topic for')
param storageAccountName string

@description('Storage queue name for blob created events')
param blobCreatedQueueName string

@description('Shared tags for all resources')
param tags object

@description('Location for resources')
param location string = resourceGroup().location

// Existing reference to the storage account for scope, topic source, and role assignment
resource st 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

// Event Grid System Topic for Storage Account blob events
resource eventGridTopic 'Microsoft.EventGrid/systemTopics@2025-02-15' = {
  name: 'egst-${storageAccountName}'
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    topicType: 'Microsoft.Storage.StorageAccounts'
    source: st.id
  }
}

// Role assignment: Event Grid system topic's managed identity -> Storage Queue Data Message Sender on storage account
resource eventGridQueueSender 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(st.id, eventGridTopic.id, 'eventgrid-queue-sender')
  scope: st
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'c6a89b2d-59bc-44d0-9896-0f6e12d7b80a') // Storage Queue Data Message Sender
    principalId: eventGridTopic.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Event Grid subscription: blob created in quarantine container -> storage queue
// Uses deliveryWithResourceIdentity (system topic's managed identity)
// DEVIATION: queues instead of Function endpoints because Functions don't exist until Step 2.4
resource egSubscriptionBlobCreated 'Microsoft.EventGrid/systemTopics/eventSubscriptions@2025-02-15' = {
  parent: eventGridTopic
  name: 'blob-created-quarantine-subscription'
  dependsOn: [
    eventGridQueueSender
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
          queueName: blobCreatedQueueName
        }
      }
    }
    filter: {
      includedEventTypes: [
        'Microsoft.Storage.BlobCreated'
      ]
      subjectBeginsWith: '/blobServices/default/containers/quarantine/'
      enableAdvancedFilteringOnArrays: false
    }
    eventDeliverySchema: 'CloudEventSchemaV1_0'
  }
}

output eventGridTopicName string = eventGridTopic.name
output eventGridTopicId string = eventGridTopic.id
output blobCreatedQueueName string = blobCreatedQueueName
