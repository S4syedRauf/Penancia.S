import assert from 'node:assert/strict';
import test from 'node:test';
import type { SemenSessionRun } from '../types/panacea';
import { createInitialStoreData } from './persistenceStore';
import { recordImageDerivedSemenSession } from './semenSessionStore';

const imageRun: SemenSessionRun = {
  sessionId: 'ses_image_1',
  runId: 'run_image_1',
  userId: 'untrusted-client-user',
  setupType: 'clip_on',
  kitProfile: {
    kitId: 'kit_1',
    kitName: 'Research Kit',
    type: 'clip_on',
    magnification: '100×',
    chamberDepthUm: null,
    fieldWidthUmDefault: 420,
  },
  sampleMeta: {
    abstinenceDays: 3,
    collectedAtIso: '2026-11-22T10:00:00.000Z',
    temperatureNote: '37c_stage',
    completeness: 'full',
    sampleName: 'synthetic-upload.bmp',
  },
  isDemo: false,
  modelVersion: 'connected-component-image-heuristic-v2.0',
  pipelineVersion: 'image-derived-report-v2.0',
  validationMode: 'research_only',
  state: 'Completed',
  qualitySummaryEn: 'The exact summary derived from this uploaded image.',
  qualitySummaryAr: 'ملخص مستمد من الصورة',
  researchOnlyBandConc: 'Unclear',
  researchOnlyBandMotility: 'Unclear',
  noSpermSeen: false,
  usedItems: ['Measured source: synthetic-upload.bmp', 'Focus variance: 187.42'],
  couldNotUseItems: ['Concentration: Not assessed from a single frame'],
  stageLogs: [],
  createdAt: '2026-11-22T10:01:00.000Z',
};

test('image-derived sessions retain their measurements and use the server user identity', () => {
  const store = createInitialStoreData();
  store.consents.semen_media.state = true;

  const saved = recordImageDerivedSemenSession(store, imageRun);

  assert.equal(saved.userId, store.user.userId);
  assert.equal(saved.qualitySummaryEn, imageRun.qualitySummaryEn);
  assert.deepEqual(saved.usedItems, imageRun.usedItems);
  assert.equal(store.semenSessions[0], saved);
});

test('image-derived sessions enforce media consent and the research kill switch', () => {
  const store = createInitialStoreData();
  store.consents.semen_media.state = false;
  assert.throws(() => recordImageDerivedSemenSession(store, imageRun), /CONSENT_REQUIRED/);

  store.consents.semen_media.state = true;
  store.featureFlags.homeResearchKillSwitch = true;
  assert.throws(() => recordImageDerivedSemenSession(store, imageRun), /KILL_SWITCH_ACTIVE/);
});

test('fixture or non-research results cannot be saved as uploaded-image sessions', () => {
  const store = createInitialStoreData();
  store.consents.semen_media.state = true;

  assert.throws(
    () => recordImageDerivedSemenSession(store, { ...imageRun, isDemo: true }),
    /INVALID_IMAGE_SESSION/,
  );
  assert.throws(
    () => recordImageDerivedSemenSession(store, { ...imageRun, validationMode: 'clinical' as never }),
    /INVALID_IMAGE_SESSION/,
  );
});
