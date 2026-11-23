import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestIdentity {
  userId: string;
  tenantId: string;
  storageKey: string;
  includeDemoData: boolean;
}

const identityStorage = new AsyncLocalStorage<RequestIdentity>();

export function runWithIdentity<T>(identity: RequestIdentity, callback: () => T): T {
  return identityStorage.run(identity, callback);
}

export function getRequestIdentity(): RequestIdentity | null {
  return identityStorage.getStore() ?? null;
}
