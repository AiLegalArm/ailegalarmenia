-- Assign admin role to the existing user so they can create other users
INSERT INTO public.user_roles (user_id, role)
VALUES ('a935ad3c-5201-4b27-b29e-a87a3d7d2a9c', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;