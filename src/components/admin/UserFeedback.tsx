import { useState } from 'react';
import { useUserFeedback, useAverageRatings, type FeedbackFilters } from '@/hooks/useUserFeedback';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Star, MessageSquare, TrendingUp, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';

export const UserFeedback = () => {
  const [filters, setFilters] = useState<FeedbackFilters>({ page: 1, pageSize: 20 });
  const [period, setPeriod] = useState<number>(7);
  
  const { feedback, pagination, isLoading } = useUserFeedback(filters);
  const { data: avgStats } = useAverageRatings(period);

  const handleFilterChange = (value: string) => {
    if (value === 'all') {
      setFilters({ ...filters, minRating: undefined, maxRating: undefined, page: 1 });
    } else if (value === 'low') {
      setFilters({ ...filters, minRating: 1, maxRating: 2, page: 1 });
    }
  };

  const handlePageChange = (newPage: number) => {
    setFilters({ ...filters, page: newPage });
  };

  const renderStars = (rating: number | null) => {
    if (!rating) return <span className="text-muted-foreground">-</span>;
    
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${
              star <= rating 
                ? 'fill-yellow-400 text-yellow-400' 
                : 'text-gray-300'
            }`}
          />
        ))}
        <span className="ml-1 text-sm font-medium">{rating}</span>
      </div>
    );
  };

  const getRatingInfo = (rating: number | null): { variant: 'default' | 'secondary' | 'destructive', text: string } => {
    if (!rating) return { variant: 'secondary', text: '-' };
    if (rating >= 4) return { variant: 'default', text: '\u053C\u0561\u057E' }; // Լdelays
    if (rating >= 3) return { variant: 'secondary', text: '\u0532\u0561\u057E\u0561\u0580\u0561\u0580' }; // Բdelays
    return { variant: 'destructive', text: '\u054E\u0561\u057F' }; // Վdelays
  };

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {/* Միdelays գdelays */}
              {'\u0544\u056B\u057B\u056B\u0576 \u0563\u0576\u0561\u0570\u0561\u057F\u0561\u056F\u0561\u0576'}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {avgStats?.overallAverage.toFixed(1) || '0.0'}
            </div>
            <p className="text-xs text-muted-foreground">
              {/* Վdelays {period} օdelays delays */}
              {`\u054E\u0565\u0580\u057B\u056B\u0576 ${period} \u0585\u0580\u057E\u0561 \u0568\u0576\u0569\u0561\u0581\u0584\u0578\u0582\u0574`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {/* Delays կdelays */}
              {'\u0538\u0576\u0564\u0570\u0561\u0576\u0578\u0582\u0580 \u056F\u0561\u0580\u056E\u056B\u0584\u0576\u0565\u0580'}
            </CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {avgStats?.totalFeedback || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {`\u054E\u0565\u0580\u057B\u056B\u0576 ${period} \u0585\u0580\u057E\u0561 \u0568\u0576\u0569\u0561\u0581\u0584\u0578\u0582\u0574`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {/* Delays */}
              {'\u053A\u0561\u0574\u0561\u0576\u0561\u056F\u0561\u0577\u0580\u057B\u0561\u0576'}
            </CardTitle>
            <Filter className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Select
              value={period.toString()}
              onValueChange={(value) => setPeriod(Number(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 {'\u0585\u0580'}</SelectItem>
                <SelectItem value="14">14 {'\u0585\u0580'}</SelectItem>
                <SelectItem value="30">30 {'\u0585\u0580'}</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      {/* Feedback Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              {/* Delays կdelays */}
              {'\u0555\u0563\u057F\u0561\u057F\u0565\u0580\u0565\u0580\u056B \u056F\u0561\u0580\u056E\u056B\u0584\u0576\u0565\u0580'}
            </CardTitle>
            <Select onValueChange={handleFilterChange} defaultValue="all">
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={'\u0556\u056B\u056C\u057F\u0580\u0565\u056C \u0563\u0576\u0561\u0570\u0561\u057F\u0561\u056F\u0561\u0576\u0578\u057E'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{'\u0532\u0578\u056C\u0578\u0580 \u0563\u0576\u0561\u0570\u0561\u057F\u0561\u056F\u0561\u0576\u0576\u0565\u0580\u0568'}</SelectItem>
                <SelectItem value="low">{'\u0551\u0561\u056E\u0580 \u0563\u0576\u0561\u0570\u0561\u057F\u0561\u056F\u0561\u0576'} ({'<'}3)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : feedback.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <MessageSquare className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-lg font-medium text-muted-foreground">
                {/* Delays չdelays գdelays */}
                {'\u053F\u0561\u0580\u056E\u056B\u0584\u0576\u0565\u0580 \u0579\u0565\u0576 \u0563\u057F\u0576\u057E\u0565\u056C'}
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{'\u0533\u0578\u0580\u056E\u056B \u0570\u0561\u0574\u0561\u0580'}</TableHead>
                    <TableHead>{'\u0555\u0563\u057F\u0561\u057F\u0565\u0580'}</TableHead>
                    <TableHead>{'\u0533\u0576\u0561\u0570\u0561\u057F\u0561\u056F\u0561\u0576'}</TableHead>
                    <TableHead>{'\u0544\u0565\u056F\u0576\u0561\u0562\u0561\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576'}</TableHead>
                    <TableHead>{'\u0531\u0574\u057D\u0561\u0569\u056B\u057E'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feedback.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.case_number || 'N/A'}
                      </TableCell>
                      <TableCell>{item.user_email || 'Unknown'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {renderStars(item.rating)}
                          {(() => {
                            const { variant, text } = getRatingInfo(item.rating);
                            return <Badge variant={variant} className="ml-2">{text}</Badge>;
                          })()}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="truncate" title={item.comment || ''}>
                          {item.comment || '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        {format(new Date(item.created_at), 'dd/MM/yyyy HH:mm')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    {/* Delays է */}
                    {`\u0551\u0578\u0582\u0581\u0561\u0564\u0580\u057E\u0578\u0582\u0574 \u0567 ${((pagination.page - 1) * pagination.pageSize) + 1}-${Math.min(pagination.page * pagination.pageSize, pagination.total)} / ${pagination.total}`}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(pagination.page - 1)}
                      disabled={pagination.page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      {'\u0546\u0561\u056D\u0578\u0580\u0564'}
                    </Button>
                    <div className="text-sm">
                      {`\u0537\u057B ${pagination.page} / ${pagination.totalPages}`}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(pagination.page + 1)}
                      disabled={pagination.page === pagination.totalPages}
                    >
                      {'\u0540\u0561\u057B\u0578\u0580\u0564'}
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
