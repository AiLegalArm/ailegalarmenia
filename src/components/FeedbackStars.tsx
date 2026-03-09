import { useState } from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';
import { useFeedback } from '@/hooks/useFeedback';
import { cn } from '@/lib/utils';

interface FeedbackStarsProps {
  caseId: string;
  analysisId?: string;
  className?: string;
}

export function FeedbackStars({ caseId, analysisId, className }: FeedbackStarsProps) {
  const { t } = useTranslation(['ai', 'common']);
  const { existingFeedback, isLoading, isSubmitting, submitFeedback } = useFeedback(caseId);
  
  const [rating, setRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [comment, setComment] = useState<string>('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) {
      return;
    }

    const success = await submitFeedback({
      caseId,
      analysisId,
      rating,
      comment: comment.trim() || undefined,
    });

    if (success) {
      setIsSubmitted(true);
    }
  };

  // If loading, show nothing
  if (isLoading) {
    return null;
  }

  // If feedback already exists, show "Already rated" message
  if (existingFeedback || isSubmitted) {
    return (
      <Card className={cn("bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800", className)}>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
            <Star className="h-5 w-5 fill-current" />
            <p className="font-medium">{t('ai:feedback_already_submitted')}</p>
          </div>
          {existingFeedback && (
            <div className="mt-3 space-y-2">
              <div className="flex gap-1">
                {Array.from({ length: 5 }, (_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      "h-5 w-5",
                      i < (existingFeedback.rating || 0)
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-gray-300 dark:text-gray-600"
                    )}
                  />
                ))}
              </div>
              {existingFeedback.comment && (
                <p className="text-sm text-muted-foreground">{existingFeedback.comment}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg">{t('ai:rate_analysis_title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Star Rating */}
        <div className="space-y-2">
          <Label>{t('ai:rating_label')}</Label>
          <div className="flex gap-2">
            {Array.from({ length: 5 }, (_, i) => {
              const starValue = i + 1;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setRating(starValue)}
                  onMouseEnter={() => setHoveredRating(starValue)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
                  aria-label={`${starValue} ${starValue === 1 ? t('ai:star') : t('ai:stars')}`}
                >
                  <Star
                    className={cn(
                      "h-8 w-8 transition-colors",
                      (hoveredRating || rating) >= starValue
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-gray-300 dark:text-gray-600"
                    )}
                  />
                </button>
              );
            })}
          </div>
          {rating > 0 && (
            <p className="text-sm text-muted-foreground">
              {rating} {rating === 1 ? t('ai:star') : t('ai:stars')}
            </p>
          )}
        </div>

        {/* Comment */}
        <div className="space-y-2">
          <Label htmlFor="feedback-comment">{t('ai:comment_optional')}</Label>
          <Textarea
            id="feedback-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('ai:feedback_placeholder')}
            rows={4}
            className="resize-none"
          />
        </div>

        {/* Submit Button */}
        <Button
          onClick={handleSubmit}
          disabled={rating === 0 || isSubmitting}
          className="w-full"
        >
          {isSubmitting ? t('common:submitting') : t('ai:submit_feedback_button')}
        </Button>
      </CardContent>
    </Card>
  );
}
