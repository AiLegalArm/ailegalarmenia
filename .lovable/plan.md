

## Plan: Create Admin User HaykAdmin56

### What will be done

Create a new admin user via the existing `admin-create-user` edge function or directly through database operations.

### Steps

1. **Call the edge function** `admin-create-user` with:
   - `username`: `haykadmin56` (normalized lowercase)
   - `password`: `Prado006`
   - `role`: `admin`
   - `full_name`: `Hayk Admin`

2. **Verify creation** by querying profiles and user_roles tables

### Technical details

- Internal email will be: `haykadmin56@app.internal`
- The edge function creates the auth user, profile, and assigns the admin role
- Login path: `/admin/login`
- Password meets minimum 6-char requirement

### Credentials summary

| Field | Value |
|-------|-------|
| Username | HaykAdmin56 |
| Password | Prado006 |
| Login URL | `/admin/login` |

