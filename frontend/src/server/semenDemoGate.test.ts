import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import express, { type Express } from 'express';
import type { Server } from 'node:http';

// Set DEMO_MODE to false BEFORE importing anything
process.env.DEMO_MODE = 'false';
delete process.env.VITE_DEMO_MODE;
process.env.AUTH_REQUIRE_ENTRA = 'false';
process.env.PERSISTENCE_MODE = 'memory';

let app: Express;
let server: Server;
let baseUrl: string;

before(async () => {
  const { createTestApp } = await import('./testApp.js');
  app = createTestApp();
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test('POST /v1/semen/analyze returns 404 DEMO_MODE_DISABLED when DEMO_MODE is off', async () => {
  const res = await fetch(`${baseUrl}/v1/semen/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'test' }),
  });
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.code, 'DEMO_MODE_DISABLED');
});

test('POST /v1/semen/calibration returns 404 DEMO_MODE_DISABLED when DEMO_MODE is off', async () => {
  const res = await fetch(`${baseUrl}/v1/semen/calibration`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ detectedLinesCount: 10 }),
  });
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.code, 'DEMO_MODE_DISABLED');
});

test('POST /v1/semen/sessions returns 404 DEMO_MODE_DISABLED when DEMO_MODE is off', async () => {
  const res = await fetch(`${baseUrl}/v1/semen/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'test', runId: 'test' }),
  });
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.code, 'DEMO_MODE_DISABLED');
});

test('GET /v1/config/semen-gate returns 404 DEMO_MODE_DISABLED when DEMO_MODE is off', async () => {
  const res = await fetch(`${baseUrl}/v1/config/semen-gate`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.code, 'DEMO_MODE_DISABLED');
});