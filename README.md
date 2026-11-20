# Penancia.S — Azure-Native Semen Analysis Platform

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)]()
[![Tests](https://img.shields.io/badge/tests-132%2F132%20passed-success.svg)]()
[![Framework](https://img.shields.io/badge/.NET-8.0%20LTS-purple.svg)]()
[![Cloud](https://img.shields.io/badge/Azure-Native%20Architecture-0078D4.svg)]()
[![Compliance](https://img.shields.io/badge/WHO-6th%20Edition%20(2021)-blue.svg)]()

**Penancia.S** is an enterprise clinical semen analysis platform built on Microsoft Azure. It delivers automated video motility tracking, dual-model sperm head morphology classification, WHO 6th Edition (2021) diagnostic rule evaluation, and archival clinical PDF report generation.

---

## 🔬 Core Clinical Capabilities

- **WHO 2021 Rules Engine**: Deterministic C# clinical logic for Concentration, Motility (PR/NP/IM), Kruger Strict Morphology, and Vitality reference limits.
- **Dual-Model Computer Vision**: Ensemble architecture using **CBAM-ResNet** and **MADRNet** for morphology consensus and non-sperm debris filtering.
- **Dual Medical Sign-off**: Hard server-side security gate enforcing that the signing pathologist or doctor is distinct from the data enterer (`SignerId != DataEntererId`).
- **Guarded AI Narrative**: Generative clinical summaries via **Microsoft Foundry** protected by strict anti-hallucination guardrails and automatic deterministic fallbacks.
- **Archival Reports**: High-fidelity, tamper-evident PDF/A reports generated through Gotenberg container services.

---

## ☁️ Cloud Architecture & Tech Stack

- **API Gateway**: ASP.NET Core 8 Web API with short-lived User Delegation SAS tokens for direct, zero-memory media streaming to Blob Storage.
- **Orchestration**: Azure Durable Functions isolated worker coordinating the 7-phase clinical sample lifecycle.
- **Persistence & Audit**: Azure SQL Database (Serverless `GP_S_Gen5_1`, auto-pauses when idle) with immutable event sourcing (`SampleEvents`).
- **Asynchronous Messaging**: Azure Service Bus with 12 dedicated job queues for parallel computer vision models.
- **Serverless Containers**: Azure Container Apps with KEDA event-driven autoscaling (scale-to-zero when queues are idle).
- **Security & Privacy**: 100% passwordless authentication powered by **Microsoft Entra ID Managed Identities**, with strict regional data residency in UAE North.

---

## 🧪 Verification & Status

- **Build**: 0 Warnings, 0 Errors across all 5 solution projects.
- **Clinical Test Suite**: 132/132 unit and boundary tests passing (Kinematics K1–K8, Aggregators, Resolvers, Rules, and Narrative Guardrails).
## 🔬 Core Clinical Capabilities

- **WHO 2021 Rules Engine**: Deterministic C# clinical logic for Concentration, Motility (PR/NP/IM), Kruger Strict Morphology, and Vitality reference limits.
- **Dual-Model Computer Vision**: Ensemble architecture using **CBAM-ResNet** and **MADRNet** for morphology consensus and non-sperm debris filtering.
- **Dual Medical Sign-off**: Hard server-side security gate enforcing that the signing pathologist or doctor is distinct from the data enterer (`SignerId != DataEntererId`).
- **Guarded AI Narrative**: Generative clinical summaries via **Microsoft Foundry** protected by strict anti-hallucination guardrails and automatic deterministic fallbacks.
- **Archival Reports**: High-fidelity, tamper-evident PDF/A reports generated through Gotenberg container services.

---

## ☁️ Cloud Architecture & Tech Stack

- **API Gateway**: ASP.NET Core 8 Web API with short-lived User Delegation SAS tokens for direct, zero-memory media streaming to Blob Storage.
- **Orchestration**: Azure Durable Functions isolated worker coordinating the 7-phase clinical sample lifecycle.
- **Persistence & Audit**: Azure SQL Database (Serverless `GP_S_Gen5_1`, auto-pauses when idle) with immutable event sourcing (`SampleEvents`).
- **Asynchronous Messaging**: Azure Service Bus with 12 dedicated job queues for parallel computer vision models.
- **Serverless Containers**: Azure Container Apps with KEDA event-driven autoscaling (scale-to-zero when queues are idle).
- **Security & Privacy**: 100% passwordless authentication powered by **Microsoft Entra ID Managed Identities**, with strict regional data residency in UAE North.

---

## 🧪 Verification & Status

- **Build**: 0 Warnings, 0 Errors across all 5 solution projects.
- **Clinical Test Suite**: 132/132 unit and boundary tests passing (Kinematics K1–K8, Aggregators, Resolvers, Rules, and Narrative Guardrails).
