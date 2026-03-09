import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Users2, 
  Briefcase, 
  Clock, 
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Loader2,
  FileText,
  MessageSquare
} from 'lucide-react';
import { format, subDays, startOfMonth } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface TeamMemberStats {
  userId: string;
  email: string;
  fullName: string | null;
  totalCases: number;
  openCases: number;
  closedCases: number;
  inProgressCases: number;
  pendingCases: number;
  filesCount: number;
  commentsCount: number;
  lastActivity: string | null;
}

interface TeamStats {
  teamId: string;
  teamName: string;
  totalMembers: number;
  totalCases: number;
  openCases: number;
  closedCases: number;
  inProgressCases: number;
  pendingCases: number;
  memberStats: TeamMemberStats[];
}

const STATUS_COLORS: Record<string, string> = {
  open: '#22c55e',
  in_progress: '#3b82f6',
  pending: '#eab308',
  closed: '#6b7280',
  archived: '#a855f7',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Բաց',
  in_progress: 'Ընթացքի մեջ',
  pending: 'Սպասման մեջ',
  closed: 'Փակված',
  archived: 'Արխիվացված',
};

export function TeamStats() {
  const { user } = useAuth();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['team-stats', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      // Get teams where user is leader
      const { data: teams, error: teamsError } = await supabase
        .from('teams')
        .select('id, name')
        .eq('leader_id', user.id);

      if (teamsError) throw teamsError;
      if (!teams || teams.length === 0) return null;

      const allStats: TeamStats[] = [];

      for (const team of teams) {
        // Get team members
        const { data: members, error: membersError } = await supabase
          .from('team_members')
          .select('user_id')
          .eq('team_id', team.id);

        if (membersError) throw membersError;

        const memberIds = members?.map(m => m.user_id) || [];

        if (memberIds.length === 0) {
          allStats.push({
            teamId: team.id,
            teamName: team.name,
            totalMembers: 0,
            totalCases: 0,
            openCases: 0,
            closedCases: 0,
            inProgressCases: 0,
            pendingCases: 0,
            memberStats: [],
          });
          continue;
        }

        // Get profiles
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, email, full_name')
          .in('id', memberIds);

        if (profilesError) throw profilesError;

        // Get cases for all members
        const { data: cases, error: casesError } = await supabase
          .from('cases')
          .select('id, lawyer_id, status, created_at, updated_at')
          .in('lawyer_id', memberIds)
          .is('deleted_at', null);

        if (casesError) throw casesError;

        // Get case files count
        const caseIds = cases?.map(c => c.id) || [];
        let filesData: { case_id: string }[] = [];
        if (caseIds.length > 0) {
          const { data: files, error: filesError } = await supabase
            .from('case_files')
            .select('case_id')
            .in('case_id', caseIds)
            .is('deleted_at', null);
          if (!filesError) filesData = files || [];
        }

        // Get comments count
        let commentsData: { case_id: string; author_id: string }[] = [];
        if (caseIds.length > 0) {
          const { data: comments, error: commentsError } = await supabase
            .from('case_comments')
            .select('case_id, author_id')
            .in('case_id', caseIds);
          if (!commentsError) commentsData = comments || [];
        }

        // Calculate stats per member
        const memberStats: TeamMemberStats[] = (profiles || []).map(profile => {
          const memberCases = (cases || []).filter(c => c.lawyer_id === profile.id);
          const memberCaseIds = memberCases.map(c => c.id);
          const memberFiles = filesData.filter(f => memberCaseIds.includes(f.case_id));
          const memberComments = commentsData.filter(c => memberCaseIds.includes(c.case_id));
          
          const lastCase = memberCases
            .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];

          return {
            userId: profile.id,
            email: profile.email,
            fullName: profile.full_name,
            totalCases: memberCases.length,
            openCases: memberCases.filter(c => c.status === 'open').length,
            closedCases: memberCases.filter(c => c.status === 'closed').length,
            inProgressCases: memberCases.filter(c => c.status === 'in_progress').length,
            pendingCases: memberCases.filter(c => c.status === 'pending').length,
            filesCount: memberFiles.length,
            commentsCount: memberComments.length,
            lastActivity: lastCase?.updated_at || null,
          };
        });

        // Calculate team totals
        const teamCases = cases || [];
        allStats.push({
          teamId: team.id,
          teamName: team.name,
          totalMembers: memberIds.length,
          totalCases: teamCases.length,
          openCases: teamCases.filter(c => c.status === 'open').length,
          closedCases: teamCases.filter(c => c.status === 'closed').length,
          inProgressCases: teamCases.filter(c => c.status === 'in_progress').length,
          pendingCases: teamCases.filter(c => c.status === 'pending').length,
          memberStats: memberStats.sort((a, b) => b.totalCases - a.totalCases),
        });
      }

      return allStats;
    },
    enabled: !!user?.id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!stats || stats.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Users2 className="h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">
            Դուք որևէ թիմի թիմլիդ չեք
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {stats.map((team) => (
        <div key={team.teamId} className="space-y-6">
          {/* Team Header */}
          <div className="flex items-center gap-3">
            <Users2 className="h-6 w-6 text-primary" />
            <h2 className="text-xl font-bold">{team.teamName}</h2>
            <Badge variant="secondary">{team.totalMembers} իրավաբաններ</Badge>
          </div>

          {/* Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Ընդհանուր գործեր</CardTitle>
                <Briefcase className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{team.totalCases}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Ընթացքի մեջ</CardTitle>
                <Clock className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{team.inProgressCases}</div>
                <Progress 
                  value={team.totalCases > 0 ? (team.inProgressCases / team.totalCases) * 100 : 0} 
                  className="mt-2 h-1"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Սպասման մեջ</CardTitle>
                <AlertCircle className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">{team.pendingCases}</div>
                <Progress 
                  value={team.totalCases > 0 ? (team.pendingCases / team.totalCases) * 100 : 0} 
                  className="mt-2 h-1 [&>div]:bg-yellow-500"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Փակված</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{team.closedCases}</div>
                <Progress 
                  value={team.totalCases > 0 ? (team.closedCases / team.totalCases) * 100 : 0} 
                  className="mt-2 h-1 [&>div]:bg-green-500"
                />
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          {team.totalCases > 0 && (
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Status Distribution Pie Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Բաշխում ըստ կարգավիճակների</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Բաց', value: team.openCases, color: STATUS_COLORS.open },
                            { name: 'Ընթացքի մեջ', value: team.inProgressCases, color: STATUS_COLORS.in_progress },
                            { name: 'Սպասման մեջ', value: team.pendingCases, color: STATUS_COLORS.pending },
                            { name: 'Փակված', value: team.closedCases, color: STATUS_COLORS.closed },
                          ].filter(d => d.value > 0)}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={80}
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                        >
                          {[
                            { color: STATUS_COLORS.open },
                            { color: STATUS_COLORS.in_progress },
                            { color: STATUS_COLORS.pending },
                            { color: STATUS_COLORS.closed },
                          ].map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Cases by Member Bar Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Գործեր ըստ իրավաբանների</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={team.memberStats.slice(0, 5).map(m => ({
                          name: m.fullName?.split(' ')[0] || m.email.split('@')[0],
                          cases: m.totalCases,
                        }))}
                        layout="vertical"
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" />
                        <YAxis type="category" dataKey="name" width={80} />
                        <Tooltip />
                        <Bar dataKey="cases" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Members Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Активность իրավաբաններ
              </CardTitle>
              <CardDescription>
                Մանրամասն վիճակագրություն թիմի յուրաքանչյուր անդամի համար
              </CardDescription>
            </CardHeader>
            <CardContent>
              {team.memberStats.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  Թիմում դեռ իրավաբաններ չկան
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Իրավաբան</TableHead>
                        <TableHead className="text-center">Ընդհանուր գործեր</TableHead>
                        <TableHead className="text-center">Ընթացքի մեջ</TableHead>
                        <TableHead className="text-center">Սպասման մեջ</TableHead>
                        <TableHead className="text-center">Փակված</TableHead>
                        <TableHead className="text-center">
                          <FileText className="h-4 w-4 mx-auto" />
                        </TableHead>
                        <TableHead className="text-center">
                          <MessageSquare className="h-4 w-4 mx-auto" />
                        </TableHead>
                        <TableHead>Վերջին ակտիվություն</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {team.memberStats.map((member) => (
                        <TableRow key={member.userId}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{member.fullName || 'Առանց անվան'}</p>
                              <p className="text-xs text-muted-foreground">{member.email}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-center font-bold">
                            {member.totalCases}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary" className="bg-blue-500/10 text-blue-700">
                              {member.inProgressCases}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-700">
                              {member.pendingCases}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary" className="bg-green-500/10 text-green-700">
                              {member.closedCases}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground">
                            {member.filesCount}
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground">
                            {member.commentsCount}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {member.lastActivity 
                              ? format(new Date(member.lastActivity), 'dd MMM yyyy', { locale: ru })
                              : '—'
                            }
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}
