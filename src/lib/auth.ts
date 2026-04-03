export const INTERNAL_AUTH_DOMAIN = 'app.internal';

export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

export function toInternalEmail(username: string): string {
  return `${normalizeUsername(username)}@${INTERNAL_AUTH_DOMAIN}`;
}

export function getLoginEmailCandidates(rawUsername: string): string[] {
  const trimmedUsername = rawUsername.trim().replace(/^@+/, '');
  const normalizedUsername = normalizeUsername(rawUsername);
  const candidates = [
    `${normalizedUsername}@${INTERNAL_AUTH_DOMAIN}`,
    `${trimmedUsername}@${INTERNAL_AUTH_DOMAIN}`,
  ].filter(Boolean);

  return [...new Set(candidates)];
}

export function getSignInCandidates(rawIdentifier: string): string[] {
  const trimmed = rawIdentifier.trim();
  if (!trimmed) return [];

  if (trimmed.includes('@')) {
    return [...new Set([trimmed, trimmed.toLowerCase()])];
  }

  return getLoginEmailCandidates(trimmed);
}

export function getAuthRedirectPath(requiredRole?: 'admin' | 'lawyer' | 'client' | 'auditor'): string {
  return requiredRole === 'admin' ? '/admin/login' : '/login';
}
