-- =============================================
-- ДОПОЛНЕНИЯ HIGH PRIORITY
-- =============================================

-- 1. Включаем расширение pgcrypto для шифрования PII
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Добавляем case_id в user_feedback
ALTER TABLE public.user_feedback 
ADD COLUMN IF NOT EXISTS case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE;

-- 3. Создаём таблицу для зашифрованных PII данных
CREATE TABLE public.encrypted_pii (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL, -- 'passport', 'ssn', 'phone_encrypted'
  encrypted_value BYTEA NOT NULL,
  iv BYTEA NOT NULL, -- initialization vector for AES
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, field_name)
);

-- RLS для encrypted_pii
ALTER TABLE public.encrypted_pii ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own encrypted data"
  ON public.encrypted_pii FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all encrypted data"
  ON public.encrypted_pii FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert own encrypted data"
  ON public.encrypted_pii FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own encrypted data"
  ON public.encrypted_pii FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- 4. Таблица для мониторинга ошибок (LLM/OCR/Audio)
CREATE TABLE public.error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_type TEXT NOT NULL CHECK (error_type IN ('llm', 'ocr', 'audio', 'system')),
  error_message TEXT NOT NULL,
  error_details JSONB,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
  file_id UUID REFERENCES public.case_files(id) ON DELETE SET NULL,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS для error_logs
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all error logs"
  ON public.error_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage error logs"
  ON public.error_logs FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert error logs"
  ON public.error_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- 5. Индексы для error_logs
CREATE INDEX idx_error_logs_type ON public.error_logs(error_type);
CREATE INDEX idx_error_logs_created ON public.error_logs(created_at);
CREATE INDEX idx_error_logs_resolved ON public.error_logs(resolved);

-- 6. Функции для шифрования/дешифрования PII (Security Definer)
CREATE OR REPLACE FUNCTION public.encrypt_pii(
  _user_id UUID,
  _field_name TEXT,
  _value TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  encryption_key BYTEA;
  iv BYTEA;
  encrypted BYTEA;
BEGIN
  -- Генерируем IV
  iv := gen_random_bytes(16);
  
  -- Получаем ключ из переменной окружения (должен быть 32 байта для AES-256)
  encryption_key := decode(current_setting('app.encryption_key', true), 'hex');
  
  -- Если ключ не установлен, используем fallback (НЕ для production!)
  IF encryption_key IS NULL THEN
    encryption_key := sha256(_user_id::text::bytea);
  END IF;
  
  -- Шифруем значение
  encrypted := encrypt_iv(_value::bytea, encryption_key, iv, 'aes-cbc');
  
  -- Сохраняем или обновляем
  INSERT INTO public.encrypted_pii (user_id, field_name, encrypted_value, iv)
  VALUES (_user_id, _field_name, encrypted, iv)
  ON CONFLICT (user_id, field_name) 
  DO UPDATE SET encrypted_value = encrypted, iv = iv, updated_at = now();
  
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_pii(
  _user_id UUID,
  _field_name TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  encryption_key BYTEA;
  rec RECORD;
  decrypted BYTEA;
BEGIN
  -- Проверяем доступ
  IF auth.uid() != _user_id AND NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN NULL;
  END IF;
  
  -- Получаем зашифрованные данные
  SELECT encrypted_value, iv INTO rec
  FROM public.encrypted_pii
  WHERE user_id = _user_id AND field_name = _field_name;
  
  IF rec IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Получаем ключ
  encryption_key := decode(current_setting('app.encryption_key', true), 'hex');
  
  IF encryption_key IS NULL THEN
    encryption_key := sha256(_user_id::text::bytea);
  END IF;
  
  -- Дешифруем
  decrypted := decrypt_iv(rec.encrypted_value, encryption_key, rec.iv, 'aes-cbc');
  
  RETURN convert_from(decrypted, 'UTF8');
END;
$$;

-- 7. Функция для логирования ошибок
CREATE OR REPLACE FUNCTION public.log_error(
  _error_type TEXT,
  _error_message TEXT,
  _error_details JSONB DEFAULT NULL,
  _case_id UUID DEFAULT NULL,
  _file_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO public.error_logs (error_type, error_message, error_details, user_id, case_id, file_id)
  VALUES (_error_type, _error_message, _error_details, auth.uid(), _case_id, _file_id)
  RETURNING id INTO new_id;
  
  RETURN new_id;
END;
$$;

-- 8. Обновляем триггер updated_at для encrypted_pii
CREATE TRIGGER update_encrypted_pii_updated_at
  BEFORE UPDATE ON public.encrypted_pii
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();