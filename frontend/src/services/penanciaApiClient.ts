import { apiUrl } from '../config';
import type { PrivacyMode, ReportValueRow, SemenSessionRun, VaultReport } from '../types/panacea';

export interface SasUploadResponse {
  assetId: string;
  uploadUrl: string;
  sasUrl: string;
  targetBlobUri: string;
  expiresInMinutes?: number;
  expiresAtUtc?: string;
  maxBytes?: number;
  blockSizeBytes?: number;
  container: string;
  blobName: string;
}

export interface RegisterBlobRequest {
  assetId: string;
  mediaType?: 'video' | 'image';
  blobUri?: string;
}

export interface CreateSampleRequest {
  sampleId?: string;
  patientId?: string;
  abstinenceDays?: number;
  sampleName?: string;
  micronsPerPixel?: number;
  mediaType?: 'video' | 'image' | 'fixture';
  metadata?: Record<string, unknown>;
}

export interface TriggerAnalysisResponse {
  sampleId: string;
  status: string;
  trackingId: string;
}

export interface ExtractReportRequest {
  fileName: string;
  mime: string;
  rawText?: string;
  imageBase64?: string;
  privacyMode: PrivacyMode;
  reportTypeHint?: string;
  simulateMalware?: boolean;
}

export interface ConfirmReportRequest {
  values: ReportValueRow[];
  reportDate: string;
  labName?: string;
  abstinenceDays?: number;
}

interface ReportResponse {
  report: VaultReport;
  reports: VaultReport[];
}

async function readJsonResponse<T>(resp: Response, fallbackMessage: string): Promise<T> {
  const responseText = await resp.text();
  let data: any = {};
  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { message: responseText };
    }
  }
  if (!resp.ok) {
    throw new Error(data.message_en || data.message || `${fallbackMessage} (${resp.status})`);
  }
  return data as T;
}

export async function postApiJson<T>(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const resp = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  return readJsonResponse<T>(resp, 'The backend request failed');
}

export const penanciaApi = {
  /**
   * Get SAS URL for direct blob upload to Azure Storage
   */
  async getUploadSas(
    sampleId: string,
    fileType: 'video' | 'image',
    fileName?: string,
    contentType?: string
  ): Promise<SasUploadResponse> {
    const params = new URLSearchParams({
      fileType,
      ...(fileName && { fileName }),
      ...(contentType && { contentType }),
    });
    const resp = await fetch(apiUrl(`/v1/samples/${sampleId}/upload-sas?${params}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`Failed to get upload SAS: ${resp.status} - ${errorText}`);
    }
    return resp.json();
  },

  /**
   * Upload file directly to Azure Blob Storage using SAS URL
   */
  async uploadToBlob(
    sasUrl: string,
    file: File,
    onProgress?: (pct: number) => void
  ): Promise<void> {
    // For progress tracking, we use a simple approach since fetch doesn't support upload progress natively
    // In production, consider using XMLHttpRequest or a library like tus-js-client for resumable uploads
    const resp = await fetch(sasUrl, {
      method: 'PUT',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'Content-Type': file.type || 'application/octet-stream',
      },
      body: file,
    });
    if (!resp.ok) {
      throw new Error(`Upload failed: ${resp.status} ${resp.statusText}`);
    }
    if (onProgress) onProgress(100);
  },

  /**
   * Register blob URI with backend after successful upload
   */
  async registerBlob(sampleId: string, request: RegisterBlobRequest): Promise<void> {
    const resp = await fetch(apiUrl(`/v1/samples/${sampleId}/register-blob`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(request),
    });
    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`Failed to register blob: ${resp.status} - ${errorText}`);
    }
  },

  /**
   * Trigger backend analysis workflow (Durable Functions)
   */
  async triggerAnalysis(sampleId: string): Promise<TriggerAnalysisResponse> {
    const resp = await fetch(apiUrl(`/v1/samples/${sampleId}/analyze`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`Failed to trigger analysis: ${resp.status} - ${errorText}`);
    }
    return resp.json();
  },

  /**
   * Create a new sample record
   */
  async createSample(data: CreateSampleRequest): Promise<{ sampleId: string; state: string; createdAtUtc: string; message?: string }> {
    const resp = await fetch(apiUrl('/v1/samples'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`Failed to create sample: ${resp.status} - ${errorText}`);
    }
    return resp.json();
  },

  /**
   * Get sample report
   */
  async getSampleReport(sampleId: string): Promise<any> {
    const resp = await fetch(apiUrl(`/v1/samples/${sampleId}/report`), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`Failed to get report: ${resp.status} - ${errorText}`);
    }
    return resp.json();
  },

  async extractReport(request: ExtractReportRequest): Promise<ReportResponse> {
    const resp = await fetch(apiUrl('/v1/reports/extract'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(request),
    });
    return readJsonResponse<ReportResponse>(resp, 'Failed to extract report');
  },

  async confirmReport(docId: string, request: ConfirmReportRequest): Promise<ReportResponse> {
    const resp = await fetch(apiUrl(`/v1/reports/${encodeURIComponent(docId)}/confirm`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(request),
    });
    return readJsonResponse<ReportResponse>(resp, 'Failed to confirm report');
  },

  async deleteReport(docId: string): Promise<{ reports: VaultReport[] }> {
    const resp = await fetch(apiUrl(`/v1/reports/${encodeURIComponent(docId)}`), {
      method: 'DELETE',
      credentials: 'include',
    });
    return readJsonResponse<{ reports: VaultReport[] }>(resp, 'Failed to delete report');
  },

  async saveSemenSession(
    session: SemenSessionRun,
  ): Promise<{ session: SemenSessionRun; semenSessions: SemenSessionRun[] }> {
    const resp = await fetch(apiUrl('/v1/semen/sessions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(session),
    });
    return readJsonResponse<{ session: SemenSessionRun; semenSessions: SemenSessionRun[] }>(
      resp,
      'Failed to save image analysis',
    );
  },
};