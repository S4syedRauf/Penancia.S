import type { SemenSessionRun } from '../types/panacea';
import type { PanaceaStoreData } from './persistenceStore';

/**
 * Persists research-only measurements produced from the user's actual image.
 * The server owns identity and safety state; it never substitutes fixture metrics.
 */
export function recordImageDerivedSemenSession(
  store: PanaceaStoreData,
  session: SemenSessionRun,
): SemenSessionRun {
  if (
    !session ||
    session.isDemo ||
    session.validationMode !== 'research_only' ||
    session.state !== 'Completed' ||
    !Array.isArray(session.usedItems) ||
    !Array.isArray(session.couldNotUseItems) ||
    !Array.isArray(session.stageLogs)
  ) {
    throw new Error('INVALID_IMAGE_SESSION');
  }
  if (!store.consents.semen_media?.state) {
    throw new Error('CONSENT_REQUIRED');
  }
  if (store.featureFlags.homeResearchKillSwitch) {
    throw new Error('KILL_SWITCH_ACTIVE');
  }

  const saved: SemenSessionRun = {
    ...session,
    userId: store.user.userId,
  };
  store.semenSessions.unshift(saved);
  if (store.semenSessions.length > 20) store.semenSessions.length = 20;
  return saved;
}
