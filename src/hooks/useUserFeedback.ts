import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type UserFeedback = Database['public']['Tables']['user_feedback']['Row'];

export interface FeedbackFilters {
  minRating?: number;
  maxRating?: number;
  page?: number;
  pageSize?: number;
}

export interface FeedbackWithDetails extends UserFeedback {
  case_number?: string;
  user_email?: string;
}

export function useUserFeedback(filters: FeedbackFilters = {}) {
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 20;
  const offset = (page - 1) * pageSize;

  // Fetch feedback with case details
  const { data: feedbackData, isLoading } = useQuery({
    queryKey: ['user-feedback', filters.minRating, filters.maxRating, page, pageSize],
    queryFn: async () => {
      let query = supabase
        .from('user_feedback')
        .select(`
          *,
          cases(case_number)
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (filters.minRating !== undefined) {
        query = query.gte('rating', filters.minRating);
      }
      
      if (filters.maxRating !== undefined) {
        query = query.lte('rating', filters.maxRating);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      // Batch fetch user emails (fix N+1 query)
      const userIds = [...new Set((data || []).map(item => item.user_id).filter(Boolean))] as string[];
      
      let userEmailMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, email')
          .in('id', userIds);
        
        userEmailMap = (profilesData || []).reduce((acc, profile) => {
          acc[profile.id] = profile.email;
          return acc;
        }, {} as Record<string, string>);
      }

      const feedbackWithDetails = (data || []).map((item) => ({
        ...item,
        case_number: (item.cases as { case_number?: string })?.case_number || 'N/A',
        user_email: item.user_id ? (userEmailMap[item.user_id] || 'Unknown') : 'Unknown',
      }));

      return {
        items: feedbackWithDetails,
        total: count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize),
      };
    },
  });

  return {
    feedback: feedbackData?.items || [],
    pagination: feedbackData ? {
      page: feedbackData.page,
      pageSize: feedbackData.pageSize,
      total: feedbackData.total,
      totalPages: feedbackData.totalPages,
    } : null,
    isLoading,
  };
}

// Get average ratings statistics
export function useAverageRatings(periodDays: number = 7) {
  return useQuery({
    queryKey: ['average-ratings', periodDays],
    queryFn: async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - periodDays);

      const { data, error } = await supabase
        .from('user_feedback')
        .select('rating, created_at')
        .gte('created_at', startDate.toISOString())
        .not('rating', 'is', null);

      if (error) throw error;

      // Group by date
      const groupedByDate: { [key: string]: number[] } = {};
      data?.forEach(item => {
        if (item.rating !== null) {
          const date = new Date(item.created_at).toISOString().split('T')[0];
          if (!groupedByDate[date]) {
            groupedByDate[date] = [];
          }
          groupedByDate[date].push(item.rating);
        }
      });

      // Calculate averages
      const dailyAverages = Object.entries(groupedByDate).map(([date, ratings]) => ({
        date,
        average: ratings.reduce((a, b) => a + b, 0) / ratings.length,
        count: ratings.length,
      })).sort((a, b) => a.date.localeCompare(b.date));

      // Calculate overall average
      const allRatings = data?.map(item => item.rating).filter((r): r is number => r !== null) || [];
      const overallAverage = allRatings.length > 0
        ? allRatings.reduce((a, b) => a + b, 0) / allRatings.length
        : 0;

      return {
        dailyAverages,
        overallAverage,
        totalFeedback: allRatings.length,
      };
    },
  });
}
