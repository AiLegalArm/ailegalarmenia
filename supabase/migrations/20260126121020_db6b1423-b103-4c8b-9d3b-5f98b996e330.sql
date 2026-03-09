-- Delete broken user records that were created incorrectly via SQL
-- (auth.users should be managed via Supabase Auth API, not direct SQL)
DELETE FROM public.user_roles WHERE user_id IN (
  SELECT id FROM auth.users WHERE email IN ('admin_main@app.internal', 'test_user@app.internal')
);

DELETE FROM public.profiles WHERE id IN (
  SELECT id FROM auth.users WHERE email IN ('admin_main@app.internal', 'test_user@app.internal')
);

DELETE FROM auth.users WHERE email IN ('admin_main@app.internal', 'test_user@app.internal');