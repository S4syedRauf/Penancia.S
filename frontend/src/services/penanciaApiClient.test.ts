import assert from 'node:assert/strict';
import test from 'node:test';
import type { SemenSessionRun, VaultReport } from '../types/panacea';
import { penanciaApi, postApiJson } from './penanciaApiClient';

const report = { docId: 'rep_server_1', state: 'NeedsUserReview' } as VaultReport;

test('report extraction is persisted by the backend and returns the server draft', async (t) => {
  let requestedUrl = '';
  let requestedInit: RequestInit | undefined;
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    requestedUrl = String(input);
    requestedInit = init;
    return Response.json({ report, reports: [report] });
  });

  const result = await penanciaApi.extractReport({
    fileName: 'report.txt',
    mime: 'text/plain',
    rawText: 'Sperm concentration: 16 million/mL',
    privacyMode: 'covered',
  });

  assert.equal(requestedUrl, '/v1/reports/extract');
  assert.equal(requestedInit?.method, 'POST');
  assert.equal(JSON.parse(String(requestedInit?.body)).fileName, 'report.txt');
  assert.equal(result.report.docId, report.docId);
});

test('report confirmation sends edited values and uses the server-confirmed report', async (t) => {
  let requestedUrl = '';
  let requestedBody: Record<string, unknown> = {};
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    requestedUrl = String(input);
    requestedBody = JSON.parse(String(init?.body));
    return Response.json({ report: { ...report, state: 'Summarised' }, reports: [report] });
  });

  const result = await penanciaApi.confirmReport('rep/server 1', {
    values: [],
    reportDate: '2026-11-22',
    labName: 'Server Lab',
  });

  assert.equal(requestedUrl, '/v1/reports/rep%2Fserver%201/confirm');
  assert.equal(requestedBody.labName, 'Server Lab');
  assert.equal(result.report.state, 'Summarised');
});

test('report deletion calls the backend and preserves its error message', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json(
      { message_en: 'The report could not be deleted.', message_ar: 'تعذر حذف التقرير.' },
      { status: 409 },
    ),
  );

  await assert.rejects(
    () => penanciaApi.deleteReport('rep_server_1'),
    /The report could not be deleted\./,
  );
});


test('uploaded-image analysis is saved without replacing its image-derived session', async (t) => {
  const session = {
    sessionId: 'ses_image_1',
    runId: 'run_image_1',
    qualitySummaryEn: 'Measured from the uploaded image',
  } as SemenSessionRun;
  let requestedUrl = '';
  let requestedBody: Record<string, unknown> = {};
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    requestedUrl = String(input);
    requestedBody = JSON.parse(String(init?.body));
    return Response.json({ session, semenSessions: [session] });
  });

  const result = await penanciaApi.saveSemenSession(session);

  assert.equal(requestedUrl, '/v1/semen/sessions');
  assert.equal(requestedBody.runId, 'run_image_1');
  assert.equal(result.session.qualitySummaryEn, 'Measured from the uploaded image');
});

test('image session backend failures are surfaced instead of becoming local success', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json(
      { message_en: 'The research kill switch is active. This analysis was not saved.' },
      { status: 409 },
    ),
  );

  await assert.rejects(
    () => penanciaApi.saveSemenSession({ sessionId: 'ses_blocked' } as SemenSessionRun),
    /kill switch is active.*not saved/,
  );
});

test('shared JSON posts preserve backend errors and idempotency headers', async (t) => {
  let requestedInit: RequestInit | undefined;
  t.mock.method(globalThis, 'fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestedInit = init;
    return Response.json({ message_en: 'The booking hold expired.' }, { status: 409 });
  });

  await assert.rejects(
    () => postApiJson('/v1/orders', { partnerId: 'partner_1' }, { 'Idempotency-Key': 'idem_1' }),
    /The booking hold expired\./,
  );
  assert.equal((requestedInit?.headers as Record<string, string>)['Idempotency-Key'], 'idem_1');
});


