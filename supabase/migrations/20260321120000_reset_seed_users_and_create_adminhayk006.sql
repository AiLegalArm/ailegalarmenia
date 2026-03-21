-- Reset seeded internal users and create a single admin account requested by the project owner.
-- Login form normalizes usernames to lowercase, so `AdminHayk006` signs in via `adminhayk006@app.internal`.
SET search_path TO public, extensions, auth;

-- Remove previously seeded internal users and any related profile/role records.
DELETE FROM public.user_roles
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE '%@app.internal'
);

DELETE FROM public.profiles
WHERE id IN (
  SELECT id FROM auth.users WHERE email LIKE '%@app.internal'
);

DELETE FROM auth.users
WHERE email LIKE '%@app.internal';

-- Create the replacement admin account.
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_user_meta_data,
  raw_app_meta_data,
  aud,
  role
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'adminhayk006@app.internal',
  crypt('Prado006', gen_salt('bf')),
  now(),
  now(),
  now(),
  jsonb_build_object('full_name', 'Admin Hayk 006', 'username', 'adminhayk006'),
  jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
  'authenticated',
  'authenticated'
);

INSERT INTO public.profiles (id, email, full_name, username)
SELECT id, email, raw_user_meta_data->>'full_name', raw_user_meta_data->>'username'
FROM auth.users
WHERE email = 'adminhayk006@app.internal'
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name,
  username = EXCLUDED.username;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role
FROM auth.users
WHERE email = 'adminhayk006@app.internal'
ON CONFLICT (user_id, role) DO NOTHING;
