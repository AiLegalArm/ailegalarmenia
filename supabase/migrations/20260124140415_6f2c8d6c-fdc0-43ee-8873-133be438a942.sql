-- Create usage tracking table for LLM/OCR/Audio API calls
CREATE TABLE public.api_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  service_type TEXT NOT NULL CHECK (service_type IN ('llm', 'ocr', 'audio')),
  model_name TEXT,
  tokens_used INTEGER DEFAULT 0,
  estimated_cost DECIMAL(10, 6) DEFAULT 0,
  request_metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for fast queries
CREATE INDEX idx_api_usage_created_at ON public.api_usage(created_at DESC);
CREATE INDEX idx_api_usage_service_type ON public.api_usage(service_type);
CREATE INDEX idx_api_usage_user_id ON public.api_usage(user_id);

-- Enable RLS
ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;

-- Admins can view all usage
CREATE POLICY "Admins can view all usage"
ON public.api_usage
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Users can view their own usage
CREATE POLICY "Users can view own usage"
ON public.api_usage
FOR SELECT
USING (auth.uid() = user_id);

-- Service role can insert (from edge functions)
CREATE POLICY "Service can insert usage"
ON public.api_usage
FOR INSERT
WITH CHECK (true);

-- Create function to log API usage
CREATE OR REPLACE FUNCTION public.log_api_usage(
  _service_type TEXT,
  _model_name TEXT DEFAULT NULL,
  _tokens_used INTEGER DEFAULT 0,
  _estimated_cost DECIMAL DEFAULT 0,
  _metadata JSONB DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO public.api_usage (user_id, service_type, model_name, tokens_used, estimated_cost, request_metadata)
  VALUES (auth.uid(), _service_type, _model_name, _tokens_used, _estimated_cost, _metadata)
  RETURNING id INTO new_id;
  
  RETURN new_id;
END;
$$;

-- Create function to get monthly usage summary
CREATE OR REPLACE FUNCTION public.get_monthly_usage()
RETURNS TABLE(
  service_type TEXT,
  total_requests BIGINT,
  total_tokens BIGINT,
  total_cost DECIMAL
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    service_type,
    COUNT(*) as total_requests,
    COALESCE(SUM(tokens_used), 0) as total_tokens,
    COALESCE(SUM(estimated_cost), 0) as total_cost
  FROM public.api_usage
  WHERE created_at >= date_trunc('month', now())
  GROUP BY service_type
$$;

-- Create function to check if budget exceeded
CREATE OR REPLACE FUNCTION public.check_budget_alert(budget_limit DECIMAL DEFAULT 5.0)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(estimated_cost), 0) >= budget_limit
  FROM public.api_usage
  WHERE created_at >= date_trunc('month', now())
$$;