import { AuthUser } from '../types/questionnaire';

const USERS_KEY = 'mrp_auth_users_v1';
const ACTIVE_AUTH_KEY = 'mrp_active_auth_user_v1';

interface StoredUserRecord extends AuthUser {
  passwordHash: string;
}

function simpleHash(input: string): string {
  // Deterministic client-side obfuscation for local demo auth
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return `h_${(h >>> 0).toString(16)}`;
}

function getAllUsers(): StoredUserRecord[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? (JSON.parse(raw) as StoredUserRecord[]) : [];
  } catch {
    return [];
  }
}

function saveAllUsers(users: StoredUserRecord[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function getActiveAuthUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(ACTIVE_AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser;
    if (!parsed?.id || !parsed?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function signUpUser(params: {
  fullName: string;
  email: string;
  password: string;
  onboardingCompleted: boolean;
}): { ok: true; user: AuthUser } | { ok: false; error: string } {
  const email = params.email.trim().toLowerCase();
  const fullName = params.fullName.trim();
  if (!fullName) return { ok: false, error: 'Please enter your full name.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }
  if (params.password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }

  const users = getAllUsers();
  if (users.some((u) => u.email === email)) {
    return { ok: false, error: 'An account with this email already exists. Please sign in.' };
  }

  const record: StoredUserRecord = {
    id: `usr_${Date.now().toString(36)}`,
    fullName,
    email,
    verified: true,
    createdAt: new Date().toISOString(),
    onboardingCompleted: params.onboardingCompleted,
    passwordHash: simpleHash(params.password),
  };

  saveAllUsers([...users, record]);
  const publicUser: AuthUser = {
    id: record.id,
    fullName: record.fullName,
    email: record.email,
    verified: record.verified,
    createdAt: record.createdAt,
    onboardingCompleted: record.onboardingCompleted,
  };
  localStorage.setItem(ACTIVE_AUTH_KEY, JSON.stringify(publicUser));
  return { ok: true, user: publicUser };
}

export function signInUser(params: {
  email: string;
  password: string;
}): { ok: true; user: AuthUser } | { ok: false; error: string } {
  const email = params.email.trim().toLowerCase();
  const users = getAllUsers();
  const match = users.find((u) => u.email === email);
  if (!match) {
    return { ok: false, error: 'No account found with that email.' };
  }
  if (match.passwordHash !== simpleHash(params.password)) {
    return { ok: false, error: 'Incorrect password. Try resetting your password below.' };
  }

  const publicUser: AuthUser = {
    id: match.id,
    fullName: match.fullName,
    email: match.email,
    verified: match.verified,
    createdAt: match.createdAt,
    onboardingCompleted: match.onboardingCompleted,
  };
  localStorage.setItem(ACTIVE_AUTH_KEY, JSON.stringify(publicUser));
  return { ok: true, user: publicUser };
}

export function markUserOnboardingCompleted(userId: string): AuthUser | null {
  const users = getAllUsers();
  const updated = users.map((u) =>
    u.id === userId ? { ...u, onboardingCompleted: true } : u
  );
  saveAllUsers(updated);
  const current = updated.find((u) => u.id === userId);
  if (!current) return null;
  const publicUser: AuthUser = {
    id: current.id,
    fullName: current.fullName,
    email: current.email,
    verified: current.verified,
    createdAt: current.createdAt,
    onboardingCompleted: true,
  };
  localStorage.setItem(ACTIVE_AUTH_KEY, JSON.stringify(publicUser));
  return publicUser;
}

export function resetPasswordForEmail(
  emailInput: string,
  newPassword: string
): { ok: true } | { ok: false; error: string } {
  const email = emailInput.trim().toLowerCase();
  if (newPassword.length < 8) {
    return { ok: false, error: 'New password must be at least 8 characters.' };
  }
  const users = getAllUsers();
  const idx = users.findIndex((u) => u.email === email);
  if (idx === -1) {
    return { ok: false, error: 'No account found with that email address.' };
  }
  users[idx] = { ...users[idx], passwordHash: simpleHash(newPassword) };
  saveAllUsers(users);
  return { ok: true };
}

export function signOutAuthUser(): void {
  localStorage.removeItem(ACTIVE_AUTH_KEY);
}
