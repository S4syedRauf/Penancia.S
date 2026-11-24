# Allowed Role Definition IDs

This file lists the allowed Azure built-in role definition IDs that can be used in Bicep role assignments.
Source: https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles

## Format
Each line: `ROLE_NAME | GUID | SOURCE_URL`

## Allowed Roles

| Role Name | GUID | Source URL |
|-----------|------|------------|
| Key Vault Secrets User | 4633458b-17de-408a-b874-0445c86b69e6 | https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles#key-vault-secrets-user |
| Storage Blob Data Contributor | ba92f5b4-2d11-453d-a403-e96b0029c9fe | https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles#storage-blob-data-contributor |
| Storage Queue Data Message Sender | c6a89b2d-59bc-44d0-9896-0f6e12d7b80a | https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles#storage-queue-data-message-sender |
| Storage Queue Data Message Processor | 8a0f0c08-91a1-4084-bc3d-661d67233fed | https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles#storage-queue-data-message-processor |
| Azure Service Bus Data Sender | 69a216fc-b8fb-44d8-bc22-1f3c2cd27a39 | https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles#azure-service-bus-data-sender |
| Azure Service Bus Data Receiver | 4f6d3b9b-027b-4f4c-9142-0e5a2a2247e0 | https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles#azure-service-bus-data-receiver |
| AcrPull | 7f951dda-4ed3-4680-a7ca-43fe172d538d | https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles#acrpull |

## Previously Used (INVALID - DO NOT USE)
- EventGrid Data Sender: 426e0c7f-1c7e-4f81-934e-3811a9d0c3f3 — NOT a real role
- Storage Queue Data Contributor: 974c5e8b-45b9-4653-ba55-5f855ec06ac4 — NOT a real role (use Storage Queue Data Message Sender)
- Service Bus Data Sender: 69a216fc-b8fb-44d8-bc22-1f3c364aba14 — WRONG GUID
- Service Bus Data Receiver: 4f6d3b9b-027b-4f4c-9142-0e5a2a2247e1 — WRONG GUID
- AcrPull: 7f951dda-4ed3-4680-a7df-24f1b5b4a5b6 — WRONG GUID