import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import express, { type Express } from 'express';
import type { Server } from 'node:http';
import { registerSemenDemoRoutes } from './semenDemoRoutes.js';
import { createApp } from '../../server.js';
import { createInitialStoreData, type PanaceaStoreData } from './persistenceStore.js';

// Ensure DEMO_MODE is false in tests
process.env.DEMO_MODE = 'false';
delete process.env.VITE_DEMO_MODE;
process.env.AUTH_REQUIRE_ENTRA = 'false';
process.env.PERSISTENCE_MODE = 'memory';

function createMockDeps(demoMode: boolean) {
  let store: PanaceaStoreData = createInitialStoreData();

  return {
    demoMode,
    loadStore: () => store,
    saveStore: (data: PanaceaStoreData) => {
      store = data;
    },
    appendAuditAndOutbox: (data: PanaceaStoreData, event: any) => {
      data.auditEvents.push({
        id: 'mock-audit',
        timestamp: new Date().toISOString(),
        ...event,
      });
    },
  };
}

let disabledApp: Express;
let disabledServer: Server;
let disabledBaseUrl: string;

let enabledApp: Express;
let enabledServer: Server;
let enabledBaseUrl: string;

let serverApp: Express;
let fullServer: Server;
let fullServerBaseUrl: string;

before(async () => {
  // 1. App with demoMode: false
  disabledApp = express();
  disabledApp.use(express.json());
  registerSemenDemoRoutes(disabledApp, createMockDeps(false));
  disabledServer = disabledApp.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => disabledServer.once('listening', resolve));
  disabledBaseUrl = `http://127.0.0.1:${(disabledServer.address() as AddressInfo).port}`;

  // 2. App with demoMode: true
  enabledApp = express();
  enabledApp.use(express.json());
  registerSemenDemoRoutes(enabledApp, createMockDeps(true));
  enabledServer = enabledApp.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => enabledServer.once('listening', resolve));
  enabledBaseUrl = `http://127.0.0.1:${(enabledServer.address() as AddressInfo).port}`;

  // 3. Server app as created and configured by server.ts
  serverApp = createApp();
  fullServer = serverApp.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => fullServer.once('listening', resolve));
  fullServerBaseUrl = `http://127.0.0.1:${(fullServer.address() as AddressInfo).port}`;
});

after(async () => {
  await Promise.all([
    new Promise<void>((resolve, reject) =>
      disabledServer.close((error) => (error ? reject(error) : resolve())),
    ),
    new Promise<void>((resolve, reject) =>
      enabledServer.close((error) => (error ? reject(error) : resolve())),
    ),
    new Promise<void>((resolve, reject) =>
      fullServer.close((error) => (error ? reject(error) : resolve())),
    ),
  ]);
});

// Tests for demoMode: false -> all 4 routes return 404 with DEMO_MODE_DISABLED
test('With demoMode: false, POST /v1/semen/analyze returns 404 with DEMO_MODE_DISABLED', async () => {
  const res = await fetch(`${disabledBaseUrl}/v1/semen/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'test' }),
  });
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.code, 'DEMO_MODE_DISABLED');
});

test('With demoMode: false, POST /v1/semen/calibration returns 404 with DEMO_MODE_DISABLED', async () => {
  const res = await fetch(`${disabledBaseUrl}/v1/semen/calibration`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ detectedLinesCount: 10 }),
  });
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.code, 'DEMO_MODE_DISABLED');
});

test('With demoMode: false, POST /v1/semen/sessions returns 404 with DEMO_MODE_DISABLED', async () => {
  const res = await fetch(`${disabledBaseUrl}/v1/semen/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'test', runId: 'test' }),
  });
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.code, 'DEMO_MODE_DISABLED');
});

test('With demoMode: false, GET /v1/config/semen-gate returns 404 with DEMO_MODE_DISABLED', async () => {
  const res = await fetch(`${disabledBaseUrl}/v1/config/semen-gate`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.code, 'DEMO_MODE_DISABLED');
});

// Test for demoMode: true -> GET /v1/config/semen-gate returns 200
test('With demoMode: true, GET /v1/config/semen-gate returns 200', async () => {
  const res = await fetch(`${enabledBaseUrl}/v1/config/semen-gate`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.demo, true);
  assert.equal(typeof body.minResolutionWidth, 'number');
});

// Test verifying server.ts wires registerSemenDemoRoutes with DEMO_MODE
test('server.ts calls registerSemenDemoRoutes with DEMO_MODE (production returns 404)', async () => {
  const res = await fetch(`${fullServerBaseUrl}/v1/config/semen-gate`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.code, 'DEMO_MODE_DISABLED');
});
