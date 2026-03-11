-- Добавляем пропущенную колонку appeal_party_role в таблицу cases, если её нет
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS appeal_party_role TEXT CHECK (appeal_party_role IN ('appellant', 'respondent'));

-- Перезагружаем кэш схемы для PostgREST, чтобы API увидел новую колонку
NOTIFY pgrst, 'reload schema';
