-- Create Admin user
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
  'admin_main@app.internal',
  crypt('AdminLegal2026!', gen_salt('bf')),
  now(),
  now(),
  now(),
  jsonb_build_object('full_name', 'Main Administrator', 'username', 'admin_main'),
  jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
  'authenticated',
  'authenticated'
);

-- Create Test Client user
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
  'test_user@app.internal',
  crypt('TestUser2026!', gen_salt('bf')),
  now(),
  now(),
  now(),
  jsonb_build_object('full_name', 'Test User', 'username', 'test_user'),
  jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
  'authenticated',
  'authenticated'
);

-- Add profiles for both users
INSERT INTO public.profiles (id, email, full_name, username)
SELECT id, email, raw_user_meta_data->>'full_name', raw_user_meta_data->>'username'
FROM auth.users 
WHERE email IN ('admin_main@app.internal', 'test_user@app.internal')
ON CONFLICT (id) DO UPDATE SET 
  full_name = EXCLUDED.full_name,
  username = EXCLUDED.username;

-- Assign admin role
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role
FROM auth.users 
WHERE email = 'admin_main@app.internal'
ON CONFLICT (user_id, role) DO NOTHING;

-- Assign client role to test user
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'client'::app_role
FROM auth.users 
WHERE email = 'test_user@app.internal'
ON CONFLICT (user_id, role) DO NOTHING;