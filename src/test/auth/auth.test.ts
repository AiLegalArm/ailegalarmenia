import { describe, expect, it } from 'vitest';
import {
  getAuthRedirectPath,
  getLoginEmailCandidates,
  getSignInCandidates,
  normalizeUsername,
  toInternalEmail,
} from '@/lib/auth';

describe('auth helpers', () => {
  it('normalizes usernames consistently', () => {
    expect(normalizeUsername('  @Admin_Main ')).toBe('admin_main');
    expect(toInternalEmail('  @Admin_Main ')).toBe('admin_main@app.internal');
  });

  it('returns normalized and legacy login candidates without duplicates', () => {
    expect(getLoginEmailCandidates('  @Admin_User ')).toEqual([
      'admin_user@app.internal',
      'Admin_User@app.internal',
    ]);

    expect(getLoginEmailCandidates('plainuser')).toEqual(['plainuser@app.internal']);
  });

  it('accepts either username or direct email for sign-in', () => {
    expect(getSignInCandidates('admin')).toEqual(['admin@app.internal']);
    expect(getSignInCandidates('Admin_User')).toEqual([
      'admin_user@app.internal',
      'Admin_User@app.internal',
    ]);
    expect(getSignInCandidates('haykadmin@local.dev')).toEqual([
      'haykadmin@local.dev',
    ]);
  });

  it('sends admin-only routes to the dedicated admin login flow', () => {
    expect(getAuthRedirectPath('admin')).toBe('/admin/login');
    expect(getAuthRedirectPath('client')).toBe('/login');
    expect(getAuthRedirectPath()).toBe('/login');
  });
});
