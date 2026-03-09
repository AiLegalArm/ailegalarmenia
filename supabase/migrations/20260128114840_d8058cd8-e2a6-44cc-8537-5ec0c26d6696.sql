-- Fix function search_path vulnerabilities

-- 1. log_pii_access trigger function
CREATE OR REPLACE FUNCTION public.log_pii_access()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
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
$function$;

-- 2. retrieve_decrypted_pii function
CREATE OR REPLACE FUNCTION public.retrieve_decrypted_pii(p_user_id uuid, p_field_name text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
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
$function$;

-- 3. store_encrypted_pii function
CREATE OR REPLACE FUNCTION public.store_encrypted_pii(p_user_id uuid, p_field_name text, p_value text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
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
$function$;

-- 4. encrypt_sensitive_data function
CREATE OR REPLACE FUNCTION public.encrypt_sensitive_data(p_data text, p_key text DEFAULT 'pii_encryption_key_12345'::text)
 RETURNS bytea
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  RETURN pgp_sym_encrypt(p_data, p_key);
END;
$function$;

-- 5. decrypt_sensitive_data function
CREATE OR REPLACE FUNCTION public.decrypt_sensitive_data(p_encrypted_data bytea, p_key text DEFAULT 'pii_encryption_key_12345'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  RETURN pgp_sym_decrypt(p_encrypted_data, p_key);
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$function$;