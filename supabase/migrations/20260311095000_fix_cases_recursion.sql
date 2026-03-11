-- Удаляем зацикленные политики, которые вызывают бесконечную рекурсию
DROP POLICY IF EXISTS "Auditors can view their lawyers cases" ON public.cases;
DROP POLICY IF EXISTS "Lawyers can view client profiles" ON public.profiles;

-- 1. Создаем SECURITY DEFINER функцию для безопасного получения списка адвокатов аудитора (в обход RLS profiles)
CREATE OR REPLACE FUNCTION public.get_my_lawyer_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE auditor_id = auth.uid();
$$;

-- 2. Пересоздаем политику "Auditors can view their lawyers cases" с использованием этой функции
CREATE POLICY "Auditors can view their lawyers cases"
  ON public.cases FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'auditor')
    AND lawyer_id IN (SELECT public.get_my_lawyer_ids())
    AND deleted_at IS NULL
  );


-- 3. Создаем SECURITY DEFINER функцию для безопасного получения списка клиентов адвоката (в обход RLS cases)
CREATE OR REPLACE FUNCTION public.get_my_client_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT client_id FROM public.cases WHERE lawyer_id = auth.uid();
$$;

-- 4. Пересоздаем политику "Lawyers can view client profiles"
CREATE POLICY "Lawyers can view client profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'lawyer') 
    AND id IN (SELECT public.get_my_client_ids())
  );
