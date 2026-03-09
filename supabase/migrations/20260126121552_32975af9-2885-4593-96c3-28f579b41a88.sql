-- Delete the incorrectly created testuser
DELETE FROM public.user_roles WHERE user_id = '5d7976d2-1df5-495f-86d8-a45c6d7c82fc';
DELETE FROM public.profiles WHERE id = '5d7976d2-1df5-495f-86d8-a45c6d7c82fc';
DELETE FROM auth.users WHERE id = '5d7976d2-1df5-495f-86d8-a45c6d7c82fc';