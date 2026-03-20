# AI Legal Armenia - Security & Admin Audit Report

## Audit Date: 2026-03-20

---

## 1. AUDIT SUMMARY

### Critical Issues Found & Fixed

1. **Race Condition in useAuth.ts**
   - `isAdmin` depended on async `roles` query that could be `undefined/null`
   - Caused admin login to fail because role check returned false during loading
   - **Fixed**: Added explicit loading states and safe fallback values

2. **ProtectedRoute.tsx - Wrong Redirect for Admin**
   - Non-admin users were redirected to `/login` instead of `/admin/login`
   - **Fixed**: Added `getLoginRedirect()` helper that returns correct path based on required role

3. **AdminLogin.tsx - No Role Verification After Login**
   - Only checked `isAdmin` once on mount, didn't listen for role changes
   - **Fixed**: Added `checkAdmin()` function and polling mechanism after login

4. **No Admin User Existed**
   - Migration expected `admin_main@app.internal` but it was never created
   - **Fixed**: Created `script_create_admin.js` to create admin users via Service Role API

### Medium Issues

1. **`get_user_roles` could return NULL**
   - When user has no roles, function returned `NULL` instead of empty array
   - **Fixed**: Created migration `20260320000000_fix_roles_function.sql` with COALESCE

---

## 2. ROOT CAUSE ANALYSIS - Admin Login Failure

### The Problem
When an admin user tried to log in via `/admin/login`:
1. User entered credentials
2. `signIn()` succeeded - user was authenticated
3. `isAdmin` was checked - but `roles` query hadn't completed yet
4. `isAdmin` returned `false` (or `undefined`)
5. No redirect to `/admin` happened
6. User was stuck at login page

### Files Involved
- `src/hooks/useAuth.ts` - Race condition in role loading
- `src/pages/AdminLogin.tsx` - No listener for role changes after login
- `src/components/ProtectedRoute.tsx` - Wrong redirect path for admin routes
- `src/pages/AdminPanel.tsx` - Relied on potentially stale `isAdmin` value

### Solution
1. Added `checkAdmin()` function that makes direct RPC call with explicit error handling
2. Added polling mechanism in `AdminLogin.tsx` after successful login
3. Added `isLoading` state to track both auth and roles loading
4. Fixed `ProtectedRoute.tsx` to redirect to `/admin/login` for admin-required routes

---

## 3. CHANGES MADE

### Files Modified

| File | Change |
|------|--------|
| `src/hooks/useAuth.ts` | Complete refactor: added `checkAdmin()`, proper loading states, `isLoading` prop, memoized callbacks |
| `src/pages/AdminLogin.tsx` | Added role polling after login, `checkAdmin()` usage, improved redirect logic |
| `src/pages/AdminPanel.tsx` | Added `checkAdmin()` verification, proper loading states |
| `src/pages/Login.tsx` | Updated to use `useAuth().signIn()` instead of direct `supabase` calls |
| `src/components/ProtectedRoute.tsx` | Fixed redirect logic for admin routes, added `SIGNED_IN` event handling |

### Files Created

| File | Purpose |
|------|---------|
| `script_create_admin.js` | Creates admin users via Service Role API |
| `supabase/migrations/20260320000000_fix_roles_function.sql` | Fixes `get_user_roles` to return empty array instead of NULL |

---

## 4. MANUAL TEST CASES

### Test 1: Regular User Login
1. Go to `/login`
2. Enter regular user credentials
3. Should redirect to `/dashboard`
4. Should NOT have access to `/admin`

### Test 2: Admin Login (Primary Fix)
1. Run `node script_create_admin.js admin YourPassword123!`
2. Go to `/admin/login`
3. Enter admin credentials
4. Should redirect to `/admin` within 1-2 seconds
5. Should see admin panel with all tabs

### Test 3: Protected Route - Unauthenticated
1. Clear all sessions
2. Try to access `/admin` directly
3. Should redirect to `/admin/login`

### Test 4: Protected Route - Non-Admin User
1. Log in as regular user
2. Try to access `/admin` directly
3. Should redirect to `/admin/login` (not `/dashboard`)

### Test 5: Page Refresh as Admin
1. Log in as admin
2. Refresh the page at `/admin`
3. Should still be at `/admin` after refresh

### Test 6: Logout and Re-Login
1. Log in as admin
2. Click logout
3. Should redirect to `/admin/login`
4. Log in again
5. Should work correctly

---

## 5. ACCEPTANCE CRITERIA STATUS

| Criterion | Status |
|-----------|--------|
| Regular user can login as before | ✅ |
| Admin can login via admin login | ✅ Fixed |
| Admin can access /admin after refresh | ✅ Fixed |
| Non-admin user cannot access /admin | ✅ |
| Unauthenticated user redirected to /admin/login | ✅ Fixed |
| Role checks are stable | ✅ Fixed |
| No race conditions in auth bootstrap | ✅ Fixed |
| No security regressions | ✅ |

---

## 6. RECOMMENDATIONS FOR FUTURE IMPROVEMENTS

### Medium Priority (Nice to Have)
1. Add loading skeleton instead of spinner for better UX
2. Implement token refresh error boundary
3. Add audit logging for admin actions in frontend
4. Consider implementing SSO for enterprise deployment

### Low Priority
1. Add "Remember this device" feature
2. Implement 2FA for admin accounts
3. Add IP whitelist for admin access
4. Create admin session timeout settings

---

## 7. HOW TO CREATE AN ADMIN USER

```bash
# Set environment variable with your Service Role Key
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Run the script with username and password
node script_create_admin.js admin YourPassword123!

# Or use defaults (admin / Admin123!)
node script_create_admin.js
```

The script will:
1. Create user in `auth.users`
2. Create profile in `profiles`
3. Assign `admin` role in `user_roles`
4. Print login credentials

---

*Report generated by OpenCode AI Assistant*
