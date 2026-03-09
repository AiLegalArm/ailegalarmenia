-- Assign admin role to the existing user so they can create other users
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' 
FROM auth.users 
WHERE email = 'admin_main@app.internal'
ON CONFLICT (user_id, role) DO NOTHING;