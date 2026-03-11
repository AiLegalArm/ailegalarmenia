-- Убираем зацикленную политику
DROP POLICY IF EXISTS "Lawyers can view their auditor" ON public.profiles;

-- Создаем SECURITY DEFINER функцию для получения ID аудитора без срабатывания RLS
CREATE OR REPLACE FUNCTION public.get_my_auditor_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auditor_id FROM public.profiles WHERE id = auth.uid();
$$;

-- Создаем политику
CREATE POLICY "Lawyers can view their auditor"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'lawyer')
    AND id = public.get_my_auditor_id()
  );
