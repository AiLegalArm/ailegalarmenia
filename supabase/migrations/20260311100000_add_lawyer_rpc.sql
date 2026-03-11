-- Функция для добавления адвоката к аудитору по username
CREATE OR REPLACE FUNCTION public.add_lawyer_by_username(p_username TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_user_id UUID;
BEGIN
  -- 1. Проверяем, что вызывающий — аудитор
  IF NOT public.has_role(auth.uid(), 'auditor'::app_role) THEN
    RETURN '{"success": false, "error": "Միայն աուդիտորը կարող է ավելացնել փաստաբաններ (Только аудитор может добавлять)"}'::jsonb;
  END IF;

  -- 2. Находим пользователя по username
  SELECT id INTO v_target_user_id
  FROM public.profiles
  WHERE username = p_username;

  IF v_target_user_id IS NULL THEN
    RETURN '{"success": false, "error": "Օգտատեր չի գտնվել (Пользователь не найден)"}'::jsonb;
  END IF;

  -- 3. Проверяем, что этот пользователь — адвокат
  IF NOT public.has_role(v_target_user_id, 'lawyer'::app_role) THEN
    RETURN '{"success": false, "error": "Այս օգտատերը փաստաբան չէ (Пользователь не является адвокатом)"}'::jsonb;
  END IF;

  -- 4. Привязываем адвоката к этому аудитору
  UPDATE public.profiles
  SET auditor_id = auth.uid(), updated_at = now()
  WHERE id = v_target_user_id;

  RETURN '{"success": true}'::jsonb;
END;
$$;
