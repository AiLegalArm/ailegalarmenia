-- Add telegram_chat_id to profiles for notifications
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT,
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"telegram": true, "in_app": true}'::jsonb;