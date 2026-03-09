import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { Database } from "@/integrations/supabase/types";

type FeedbackInsert = Database['public']['Tables']['user_feedback']['Insert'];
type FeedbackRow = Database['public']['Tables']['user_feedback']['Row'];

interface SubmitFeedbackParams {
  caseId: string;
  analysisId?: string;
  rating: number;
  comment?: string;
}

export function useFeedback(caseId: string) {
  const { t } = useTranslation("ai");
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if feedback already exists for this case
  const { data: existingFeedback, isLoading } = useQuery({
    queryKey: ['feedback', caseId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('user_feedback')
        .select('*')
        .eq('case_id', caseId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error("Error fetching feedback:", error);
        return null;
      }

      return data as FeedbackRow | null;
    },
    enabled: !!caseId,
  });

  const submitFeedback = useCallback(async ({
    caseId,
    analysisId,
    rating,
    comment
  }: SubmitFeedbackParams) => {
    setIsSubmitting(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error(t("errors:not_authenticated"));
        return false;
      }

      const feedbackData: FeedbackInsert = {
        case_id: caseId,
        analysis_id: analysisId || null,
        user_id: user.id,
        rating,
        comment: comment || null,
      };

      const { error } = await supabase
        .from('user_feedback')
        .insert(feedbackData);

      if (error) {
        console.error("Error submitting feedback:", error);
        toast.error(t("feedback_submit_failed"));
        return false;
      }

      // Invalidate the query to refetch
      queryClient.invalidateQueries({ queryKey: ['feedback', caseId] });
      
      toast.success(t("feedback_submit_success"));
      return true;
      
    } catch (error) {
      console.error("Error submitting feedback:", error);
      toast.error(t("feedback_submit_failed"));
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [queryClient, t]);

  return {
    existingFeedback,
    isLoading,
    isSubmitting,
    submitFeedback,
  };
}
