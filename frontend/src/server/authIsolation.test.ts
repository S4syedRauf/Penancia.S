import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import express, { type Express } from 'express';
import type { Server } from 'node:http';

process.env.AUTH_REQUIRE_ENTRA = 'true';
process.env.ENTRA_TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
process.env.PERSISTENCE_MODE = 'memory';

const TENANT = process.env.ENTRA_TENANT_ID;
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
let app: Express;
let server: Server;
let baseUrl: string;

function principal(userId: string, tenantId = TENANT): Record<string, string> {
  const value = {
    auth_typ: 'aad',
    claims: [
      { typ: 'http://schemas.microsoft.com/identity/claims/objectidentifier', val: userId },
      { typ: 'http://schemas.microsoft.com/identity/claims/tenantid', val: tenantId },
    ],
  };
  return {
    'x-ms-client-principal-idp': 'aad',
    'x-ms-client-principal': Buffer.from(JSON.stringify(value)).toString('base64'),
  };
}

before(async () => {
  const [{ requireAuthentication }, { loadStore, saveStore }] = await Promise.all([
    import('./auth.ts'),
    import('./persistenceStore.ts'),
  ]);
  app = express();
  app.use(requireAuthentication);
  app.use(express.json());
  app.get('/state', (_req, res) => res.json(loadStore()));
  app.post('/marker', (req, res) => {
    const state = loadStore();
    state.user.alias = String(req.body.alias);
    saveStore(state);
    res.json({ ok: true });
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test('anonymous and foreign-tenant requests are rejected', async () => {
  assert.equal((await fetch(`${baseUrl}/state`)).status, 401);
  const foreign = await fetch(`${baseUrl}/state`, {
    headers: principal(USER_A, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  });
  assert.equal(foreign.status, 403);
});

test('authenticated users start empty and cannot read each other\'s state', async () => {
  const initialAResponse = await fetch(`${baseUrl}/state`, { headers: principal(USER_A) });
  const initialA = await initialAResponse.json();
  assert.equal(initialAResponse.status, 200);
  assert.equal(initialA.user.userId, USER_A);
  assert.deepEqual(initialA.reports, []);
  assert.equal(initialA.featureFlags.homeResearchKillSwitch, true);

  const write = await fetch(`${baseUrl}/marker`, {
    method: 'POST',
    headers: { ...principal(USER_A), 'content-type': 'application/json' },
    body: JSON.stringify({ alias: 'private-marker-a' }),
  });
  assert.equal(write.status, 200);

  const [a, b] = await Promise.all([
    fetch(`${baseUrl}/state`, { headers: principal(USER_A) }).then((res) => res.json()),
    fetch(`${baseUrl}/state`, { headers: principal(USER_B) }).then((res) => res.json()),
  ]);
  assert.equal(a.user.alias, 'private-marker-a');
  assert.equal(b.user.userId, USER_B);
  assert.notEqual(b.user.alias, 'private-marker-a');
  assert.deepEqual(b.reports, []);
});
