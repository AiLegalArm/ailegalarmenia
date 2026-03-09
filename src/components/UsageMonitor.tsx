import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { format, subDays, startOfMonth, eachDayOfInterval } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { 
  AlertTriangle, 
  TrendingUp, 
  RefreshCw, 
  Loader2,
  Cpu,
  FileText,
  Mic
} from 'lucide-react';

interface UsageSummary {
  service_type: string;
  total_requests: number;
  total_tokens: number;
  total_cost: number;
}

interface DailyUsage {
  date: string;
  llm: number;
  ocr: number;
  audio: number;
  total: number;
}

interface TopUser {
  user_id: string;
  email: string;
  request_count: number;
  total_cost: number;
}

interface UsageMonitorProps {
  budgetLimit?: number;
  showChart?: boolean;
  showTopUsers?: boolean;
  compact?: boolean;
}

export function UsageMonitor({ 
  budgetLimit = 5.0, 
  showChart = true, 
  showTopUsers = true,
  compact = false 
}: UsageMonitorProps) {
  const { t } = useTranslation(['usage', 'common']);
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  
  const [usage, setUsage] = useState<UsageSummary[]>([]);
  const [dailyUsage, setDailyUsage] = useState<DailyUsage[]>([]);
  const [topUsers, setTopUsers] = useState<TopUser[]>([]);
  const [isOverBudget, setIsOverBudget] = useState(false);
  const [totalCost, setTotalCost] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchUsage = useCallback(async (showRefreshState = false) => {
    if (showRefreshState) setRefreshing(true);
    
    try {
      // Get monthly usage summary
      const { data: usageData, error: usageError } = await supabase
        .rpc('get_monthly_usage');

      if (usageError) {
        console.error('Failed to fetch usage:', usageError);
        return;
      }

      setUsage(usageData || []);
      
      const total = (usageData || []).reduce(
        (sum: number, item: UsageSummary) => sum + Number(item.total_cost || 0), 
        0
      );
      setTotalCost(total);

      // Check budget
      const { data: overBudget } = await supabase
        .rpc('check_budget_alert', { budget_limit: budgetLimit });
      
      const wasOverBudget = isOverBudget;
      setIsOverBudget(overBudget || false);

      // Show toast if just exceeded budget
      if (overBudget && !wasOverBudget) {
        toast({
          title: t('usage:budget_alert'),
          description: t('usage:budget_exceeded', { 
            limit: budgetLimit.toFixed(2), 
            current: total.toFixed(2) 
          }),
          variant: 'destructive',
        });
      }

      // Fetch daily usage for chart (admin only)
      if (isAdmin && showChart) {
        const startDate = startOfMonth(new Date());
        const { data: dailyData } = await supabase
          .from('api_usage')
          .select('service_type, created_at')
          .gte('created_at', startDate.toISOString())
          .order('created_at', { ascending: true });

        if (dailyData) {
          const days = eachDayOfInterval({ start: startDate, end: new Date() });
          const chartData: DailyUsage[] = days.map(day => {
            const dayStr = format(day, 'yyyy-MM-dd');
            const dayData = dailyData.filter(d => 
              format(new Date(d.created_at), 'yyyy-MM-dd') === dayStr
            );
            return {
              date: format(day, 'dd.MM'),
              llm: dayData.filter(d => d.service_type === 'llm').length,
              ocr: dayData.filter(d => d.service_type === 'ocr').length,
              audio: dayData.filter(d => d.service_type === 'audio').length,
              total: dayData.length,
            };
          });
          setDailyUsage(chartData);
        }
      }

      // Fetch top users (admin only)
      if (isAdmin && showTopUsers) {
        const { data: usersData } = await supabase
          .from('api_usage')
          .select('user_id, estimated_cost')
          .gte('created_at', startOfMonth(new Date()).toISOString());

        if (usersData) {
          const userMap = new Map<string, { count: number; cost: number }>();
          usersData.forEach(item => {
            if (!item.user_id) return;
            const existing = userMap.get(item.user_id) || { count: 0, cost: 0 };
            userMap.set(item.user_id, {
              count: existing.count + 1,
              cost: existing.cost + Number(item.estimated_cost || 0),
            });
          });

          // Get user emails
          const userIds = Array.from(userMap.keys());
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, email')
            .in('id', userIds);

          const topUsersData: TopUser[] = userIds
            .map(id => ({
              user_id: id,
              email: profiles?.find(p => p.id === id)?.email || 'Unknown',
              request_count: userMap.get(id)?.count || 0,
              total_cost: userMap.get(id)?.cost || 0,
            }))
            .sort((a, b) => b.request_count - a.request_count)
            .slice(0, 10);

          setTopUsers(topUsersData);
        }
      }

      setLastUpdated(new Date());
    } catch (error) {
      console.error('Usage monitor error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [budgetLimit, isAdmin, showChart, showTopUsers, isOverBudget, toast, t]);

  useEffect(() => {
    fetchUsage();
    
    // Refresh every 5 minutes
    const interval = setInterval(() => fetchUsage(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchUsage]);

  const handleRefresh = () => fetchUsage(true);

  const getServiceIcon = (type: string) => {
    switch (type) {
      case 'llm': return <Cpu className="h-4 w-4" />;
      case 'ocr': return <FileText className="h-4 w-4" />;
      case 'audio': return <Mic className="h-4 w-4" />;
      default: return <TrendingUp className="h-4 w-4" />;
    }
  };

  const getServiceLabel = (type: string) => {
    switch (type) {
      case 'llm': return t('usage:service_llm');
      case 'ocr': return t('usage:service_ocr');
      case 'audio': return t('usage:service_audio');
      default: return type;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const percentUsed = Math.min((totalCost / budgetLimit) * 100, 100);

  // Compact version for dashboard widget
  if (compact) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            {t('usage:monthly_usage')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isOverBudget && (
            <Alert variant="destructive" className="py-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {t('usage:budget_exceeded', { 
                  limit: budgetLimit.toFixed(2), 
                  current: totalCost.toFixed(2) 
                })}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('usage:total_cost')}</span>
            <span className="font-medium">${totalCost.toFixed(4)} / ${budgetLimit.toFixed(2)}</span>
          </div>

          <Progress 
            value={percentUsed} 
            className={percentUsed > 80 ? 'bg-destructive/20' : ''} 
          />

          {usage.length > 0 && (
            <div className="grid grid-cols-3 gap-2 text-xs">
              {usage.map((item) => (
                <div key={item.service_type} className="text-center p-2 bg-muted/50 rounded">
                  <div className="flex items-center justify-center gap-1 font-medium">
                    {getServiceIcon(item.service_type)}
                  </div>
                  <div className="text-muted-foreground mt-1">
                    {item.total_requests}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Full version
  return (
    <div className="space-y-6">
      {/* Budget Alert */}
      {isOverBudget && (
        <Alert variant="destructive" role="alert">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t('usage:budget_alert')}</AlertTitle>
          <AlertDescription>
            {t('usage:budget_exceeded', {
              limit: budgetLimit.toFixed(2),
              current: totalCost.toFixed(2)
            })}
          </AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('usage:total_cost')}</CardDescription>
            <CardTitle className="text-2xl">
              ${totalCost.toFixed(4)}
              <span className="text-sm font-normal text-muted-foreground ml-2">
                / ${budgetLimit.toFixed(2)}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={percentUsed} className={percentUsed > 80 ? 'bg-destructive/20' : ''} />
          </CardContent>
        </Card>

        {usage.map((item) => (
          <Card key={item.service_type}>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                {getServiceIcon(item.service_type)}
                {getServiceLabel(item.service_type)}
              </CardDescription>
              <CardTitle className="text-2xl">{item.total_requests}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground">
                {item.total_tokens.toLocaleString()} {t('usage:tokens')} · ${Number(item.total_cost).toFixed(4)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart */}
      {showChart && isAdmin && dailyUsage.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t('usage:chart_title')}</CardTitle>
                <CardDescription>{t('usage:daily_requests')}</CardDescription>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRefresh}
                disabled={refreshing}
              >
                {refreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="ml-2">{t('usage:refresh')}</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyUsage}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    className="text-xs fill-muted-foreground"
                    tickLine={false}
                  />
                  <YAxis 
                    className="text-xs fill-muted-foreground"
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                  <Area 
                    type="monotone" 
                    dataKey="llm" 
                    stackId="1"
                    name={t('usage:service_llm')}
                    stroke="hsl(var(--primary))" 
                    fill="hsl(var(--primary))" 
                    fillOpacity={0.6}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="ocr" 
                    stackId="1"
                    name={t('usage:service_ocr')}
                    stroke="hsl(var(--secondary))" 
                    fill="hsl(var(--secondary))" 
                    fillOpacity={0.6}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="audio" 
                    stackId="1"
                    name={t('usage:service_audio')}
                    stroke="hsl(var(--accent))" 
                    fill="hsl(var(--accent))" 
                    fillOpacity={0.6}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {lastUpdated && (
              <p className="text-xs text-muted-foreground mt-2">
                {t('usage:last_updated')}: {format(lastUpdated, 'HH:mm:ss')}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Top Users Table */}
      {showTopUsers && isAdmin && topUsers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('usage:top_users')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>{t('usage:email')}</TableHead>
                  <TableHead className="text-right">{t('usage:request_count')}</TableHead>
                  <TableHead className="text-right">{t('usage:cost')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topUsers.map((user, index) => (
                  <TableRow key={user.user_id}>
                    <TableCell>
                      <Badge variant={index < 3 ? 'default' : 'secondary'}>
                        {index + 1}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{user.email}</TableCell>
                    <TableCell className="text-right">{user.request_count}</TableCell>
                    <TableCell className="text-right">${user.total_cost.toFixed(4)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* No Data */}
      {usage.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>{t('usage:no_usage')}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
