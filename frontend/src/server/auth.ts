import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { runWithIdentity, type RequestIdentity } from './requestIdentity.ts';

const OBJECT_ID_CLAIM = 'http://schemas.microsoft.com/identity/claims/objectidentifier';
const TENANT_ID_CLAIM = 'http://schemas.microsoft.com/identity/claims/tenantid';
const LOCAL_IDENTITY: RequestIdentity = {
  userId: 'usr_panacea_dubai_01',
  tenantId: 'local',
  storageKey: 'local-demo',
  includeDemoData: true,
};

interface PrincipalClaim {
  typ?: string;
  val?: string;
}

interface ClientPrincipal {
  auth_typ?: string;
  claims?: PrincipalClaim[];
}

function authenticationRequired(): boolean {
  return process.env.AUTH_REQUIRE_ENTRA === 'true';
}

function reject(res: Response, status: number, code: string): void {
  res.status(status).json({ error: code });
}

export function requireAuthentication(req: Request, res: Response, next: NextFunction): void {
  if (!authenticationRequired()) {
    runWithIdentity(LOCAL_IDENTITY, next);
    return;
  }

  if (req.header('x-ms-client-principal-idp') !== 'aad') {
    reject(res, 401, 'AUTHENTICATION_REQUIRED');
    return;
  }

  const encodedPrincipal = req.header('x-ms-client-principal');
  if (!encodedPrincipal || encodedPrincipal.length > 32_768) {
    reject(res, 401, 'INVALID_IDENTITY');
    return;
  }

  let identity: RequestIdentity;
  try {
    const principal = JSON.parse(
      Buffer.from(encodedPrincipal, 'base64').toString('utf8'),
    ) as ClientPrincipal;
    if (principal.auth_typ !== 'aad' || !Array.isArray(principal.claims)) {
      reject(res, 401, 'INVALID_IDENTITY');
      return;
    }

    const claim = (type: string) => principal.claims?.find((item) => item.typ === type)?.val;
    const userId = claim(OBJECT_ID_CLAIM);
    const tenantId = claim(TENANT_ID_CLAIM);
    const expectedTenant = process.env.ENTRA_TENANT_ID;
    const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!userId || !tenantId || !guidPattern.test(userId) || !guidPattern.test(tenantId)) {
      reject(res, 401, 'INVALID_IDENTITY');
      return;
    }
    if (!expectedTenant || tenantId.toLowerCase() !== expectedTenant.toLowerCase()) {
      reject(res, 403, 'TENANT_NOT_ALLOWED');
      return;
    }

    const storageKey = crypto
      .createHash('sha256')
      .update(`${tenantId.toLowerCase()}:${userId.toLowerCase()}`)
      .digest('hex');
    identity = { userId, tenantId, storageKey, includeDemoData: false };
  } catch {
    reject(res, 401, 'INVALID_IDENTITY');
    return;
  }

  runWithIdentity(identity, next);
}
