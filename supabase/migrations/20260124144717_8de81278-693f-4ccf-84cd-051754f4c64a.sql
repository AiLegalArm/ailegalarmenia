-- Enable pgcrypto extension for PII encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create encryption key management function
-- Note: In production, the key should be stored securely in vault/secrets
CREATE OR REPLACE FUNCTION encrypt_sensitive_data(
  p_data TEXT,
  p_key TEXT DEFAULT 'pii_encryption_key_12345'
) RETURNS BYTEA AS $$
BEGIN
  RETURN pgp_sym_encrypt(p_data, p_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrypt_sensitive_data(
  p_encrypted_data BYTEA,
  p_key TEXT DEFAULT 'pii_encryption_key_12345'
) RETURNS TEXT AS $$
BEGIN
  RETURN pgp_sym_decrypt(p_encrypted_data, p_key);
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add encrypted columns to profiles table for sensitive PII
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS encrypted_ssn BYTEA,
  ADD COLUMN IF NOT EXISTS encrypted_passport BYTEA,
  ADD COLUMN IF NOT EXISTS encrypted_address BYTEA;

-- Create helper function to store encrypted PII
CREATE OR REPLACE FUNCTION store_encrypted_pii(
  p_user_id UUID,
  p_field_name TEXT,
  p_value TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_encrypted BYTEA;
  v_iv BYTEA;
BEGIN
  -- Generate random IV
  v_iv := gen_random_bytes(16);
  
  -- Encrypt using AES-256-CBC
  v_encrypted := encrypt_iv(
    convert_to(p_value, 'UTF8'),
    decode(current_setting('app.encryption_key', true), 'hex'),
    v_iv,
    'aes-cbc'
  );
  
  -- Upsert into encrypted_pii table
  INSERT INTO public.encrypted_pii (user_id, field_name, encrypted_value, iv)
  VALUES (p_user_id, p_field_name, v_encrypted, v_iv)
  ON CONFLICT (user_id, field_name) 
  DO UPDATE SET 
    encrypted_value = v_encrypted,
    iv = v_iv,
    updated_at = now();
    
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create helper function to retrieve decrypted PII
CREATE OR REPLACE FUNCTION retrieve_decrypted_pii(
  p_user_id UUID,
  p_field_name TEXT
) RETURNS TEXT AS $$
DECLARE
  v_encrypted BYTEA;
  v_iv BYTEA;
  v_decrypted TEXT;
BEGIN
  SELECT encrypted_value, iv INTO v_encrypted, v_iv
  FROM public.encrypted_pii
  WHERE user_id = p_user_id AND field_name = p_field_name;
  
  IF v_encrypted IS NULL THEN
    RETURN NULL;
  END IF;
  
  v_decrypted := convert_from(
    decrypt_iv(
      v_encrypted,
      decode(current_setting('app.encryption_key', true), 'hex'),
      v_iv,
      'aes-cbc'
    ),
    'UTF8'
  );
  
  RETURN v_decrypted;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add unique constraint for encrypted_pii to support upsert
ALTER TABLE public.encrypted_pii 
  DROP CONSTRAINT IF EXISTS encrypted_pii_user_field_unique;
ALTER TABLE public.encrypted_pii 
  ADD CONSTRAINT encrypted_pii_user_field_unique UNIQUE (user_id, field_name);

-- Add audit logging for PII access
CREATE OR REPLACE FUNCTION log_pii_access()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_logs (
    user_id,
    action,
    table_name,
    record_id,
    details
  ) VALUES (
    auth.uid(),
    TG_OP,
    'encrypted_pii',
    COALESCE(NEW.id, OLD.id),
    jsonb_build_object(
      'field_name', COALESCE(NEW.field_name, OLD.field_name),
      'operation', TG_OP
    )
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for PII access logging
DROP TRIGGER IF EXISTS log_pii_access_trigger ON public.encrypted_pii;
CREATE TRIGGER log_pii_access_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.encrypted_pii
  FOR EACH ROW EXECUTE FUNCTION log_pii_access();