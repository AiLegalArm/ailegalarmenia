-- Fix get_monthly_usage_summary RPC to handle NULLs with COALESCE
CREATE OR REPLACE FUNCTION public.get_monthly_usage_summary(
  _user_id uuid,
  _month_start timestamptz
)
RETURNS TABLE(total_tokens bigint, total_cost numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(tokens_used), 0)::bigint AS total_tokens,
    COALESCE(SUM(estimated_cost), 0)::numeric AS total_cost
  FROM api_usage
  WHERE user_id = _user_id
    AND created_at >= _month_start;
$$;