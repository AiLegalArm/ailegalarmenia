import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { 
  Users2, 
  Plus, 
  Loader2,
  RefreshCw,
  Trash2,
  UserPlus,
  UserMinus,
  Crown,
  Briefcase
} from 'lucide-react';

interface Team {
  id: string;
  name: string;
  description: string | null;
  leader_id: string;
  created_at: string;
  leader?: { id: string; email: string; full_name: string | null };
  members?: { user_id: string; email: string; full_name: string | null }[];
}

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
}

export function TeamManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null);
  const [removingMember, setRemovingMember] = useState<{ teamId: string; userId: string } | null>(null);
  
  // Form states
  const [teamName, setTeamName] = useState('');
  const [teamDescription, setTeamDescription] = useState('');
  const [teamLeaderId, setTeamLeaderId] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState('');

  // Fetch all teams with leaders and members
  const { data: teams, isLoading, refetch } = useQuery({
    queryKey: ['admin-teams'],
    queryFn: async () => {
      // Get teams
      const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select('*')
        .order('created_at', { ascending: false });

      if (teamsError) throw teamsError;

      // Get profiles for leaders and members
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, full_name');

      if (profilesError) throw profilesError;

      // Get team members
      const { data: members, error: membersError } = await supabase
        .from('team_members')
        .select('team_id, user_id');

      if (membersError) throw membersError;

      // Combine data
      const teamsWithDetails: Team[] = (teamsData || []).map(team => {
        const leader = profiles?.find(p => p.id === team.leader_id);
        const teamMembers = (members || [])
          .filter(m => m.team_id === team.id)
          .map(m => {
            const profile = profiles?.find(p => p.id === m.user_id);
            return {
              user_id: m.user_id,
              email: profile?.email || '',
              full_name: profile?.full_name || null,
            };
          });

        return {
          ...team,
          leader: leader ? { id: leader.id, email: leader.email, full_name: leader.full_name } : undefined,
          members: teamMembers,
        };
      });

      return teamsWithDetails;
    },
  });

  // Fetch auditors (potential team leaders)
  const { data: auditors } = useQuery({
    queryKey: ['auditors'],
    queryFn: async () => {
      const { data: auditorRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'auditor');

      if (rolesError) throw rolesError;

      const auditorIds = auditorRoles?.map(r => r.user_id) || [];
      
      if (auditorIds.length === 0) return [];

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', auditorIds);

      if (profilesError) throw profilesError;

      return profiles as UserProfile[];
    },
  });

  // Fetch lawyers (potential team members)
  const { data: lawyers } = useQuery({
    queryKey: ['lawyers'],
    queryFn: async () => {
      const { data: lawyerRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'lawyer');

      if (rolesError) throw rolesError;

      const lawyerIds = lawyerRoles?.map(r => r.user_id) || [];
      
      if (lawyerIds.length === 0) return [];

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', lawyerIds);

      if (profilesError) throw profilesError;

      return profiles as UserProfile[];
    },
  });

  // Create team mutation
  const createTeam = useMutation({
    mutationFn: async (data: { name: string; description?: string; leader_id: string }) => {
      const { error } = await supabase
        .from('teams')
        .insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-teams'] });
      toast({ title: '\u0539\u056b\u0574\u0568 \u057d\u057f\u0565\u0572\u056e\u057e\u0565\u0581' });
      setCreateDialogOpen(false);
      setTeamName('');
      setTeamDescription('');
      setTeamLeaderId('');
    },
    onError: (error) => {
      toast({ title: '\u054d\u056d\u0561\u056c', description: error.message, variant: 'destructive' });
    },
  });

  // Delete team mutation
  const deleteTeam = useMutation({
    mutationFn: async (teamId: string) => {
      const { error } = await supabase
        .from('teams')
        .delete()
        .eq('id', teamId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-teams'] });
      toast({ title: '\u0539\u056b\u0574\u0568 \u057b\u0576\u057b\u057e\u0565\u0581' });
      setDeletingTeamId(null);
    },
    onError: (error) => {
      toast({ title: '\u054d\u056d\u0561\u056c', description: error.message, variant: 'destructive' });
    },
  });

  // Add member mutation
  const addMember = useMutation({
    mutationFn: async (data: { team_id: string; user_id: string }) => {
      const { error } = await supabase
        .from('team_members')
        .insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-teams'] });
      toast({ title: '\u053b\u0580\u0561\u057e\u0561\u0562\u0561\u0576\u0568 \u0561\u057e\u0565\u056c\u0561\u0581\u057e\u0565\u056c \u0567 \u0569\u056b\u0574\u056b\u0576' });
      setAddMemberDialogOpen(false);
      setSelectedTeamId(null);
      setSelectedMemberId('');
    },
    onError: (error) => {
      toast({ title: '\u054d\u056d\u0561\u056c', description: error.message, variant: 'destructive' });
    },
  });

  // Remove member mutation
  const removeMember = useMutation({
    mutationFn: async (data: { teamId: string; userId: string }) => {
      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('team_id', data.teamId)
        .eq('user_id', data.userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-teams'] });
      toast({ title: '\u053b\u0580\u0561\u057e\u0561\u0562\u0561\u0576\u0568 \u0570\u0565\u057c\u0561\u0581\u057e\u0565\u056c \u0567 \u0569\u056b\u0574\u056b\u0581' });
      setRemovingMember(null);
    },
    onError: (error) => {
      toast({ title: '\u054d\u056d\u0561\u056c', description: error.message, variant: 'destructive' });
    },
  });

  // Get lawyers not in the selected team
  const getAvailableLawyers = (teamId: string) => {
    const team = teams?.find(t => t.id === teamId);
    const memberIds = team?.members?.map(m => m.user_id) || [];
    return lawyers?.filter(l => !memberIds.includes(l.id)) || [];
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users2 className="h-5 w-5" />
              {'\u0539\u056b\u0574\u0565\u0580\u056b \u056f\u0561\u057c\u0561\u057e\u0561\u0580\u0578\u0582\u0574'}
            </CardTitle>
            <CardDescription>
              {'\u054d\u057f\u0565\u0572\u056e\u0565\u0584 \u0569\u056b\u0574\u0565\u0580 \u0587 \u0576\u0577\u0561\u0576\u0561\u056f\u0565\u0584 \u0561\u0578\u0582\u0564\u056b\u057f\u0578\u0580\u0576\u0565\u0580 (\u0569\u056b\u0574\u056c\u056b\u0564\u0576\u0565\u0580) \u056b\u0580\u0561\u057e\u0561\u0562\u0561\u0576\u0576\u0565\u0580\u056b \u0561\u0577\u056d\u0561\u057f\u0561\u0576\u0584\u056b \u057e\u0565\u0580\u0561\u0570\u057d\u056f\u0574\u0561\u0576 \u0570\u0561\u0574\u0561\u0580'}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {'\u054d\u057f\u0565\u0572\u056e\u0565\u056c \u0569\u056b\u0574'}
            </Button>
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !teams?.length ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Users2 className="h-12 w-12 opacity-50" />
            <p className="mt-2">{'\u0539\u056b\u0574\u0565\u0580 \u0579\u0565\u0576 \u057d\u057f\u0565\u0572\u056e\u057e\u0565\u056c'}</p>
            <Button className="mt-4" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {'\u054d\u057f\u0565\u0572\u056e\u0565\u056c \u0561\u057c\u0561\u057b\u056b\u0576 \u0569\u056b\u0574\u0568'}
            </Button>
          </div>
        ) : (
          <Accordion type="single" collapsible className="w-full">
            {teams.map((team) => (
              <AccordionItem key={team.id} value={team.id}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3">
                    <Users2 className="h-5 w-5 text-primary" />
                    <span className="font-medium">{team.name}</span>
                    <Badge variant="secondary" className="ml-2">
                      {team.members?.length || 0} {'\u056b\u0580\u0561\u057e\u0561\u0562\u0561\u0576\u0576\u0565\u0580'}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pt-2">
                    {team.description && (
                      <p className="text-sm text-muted-foreground">{team.description}</p>
                    )}
                    
                    {/* Team Leader */}
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                        <Crown className="h-4 w-4 text-yellow-500" />
                        {'\u0539\u056b\u0574\u056c\u056b\u0564 (\u0531\u0578\u0582\u0564\u056b\u057f\u0578\u0580)'}
                      </div>
                      {team.leader ? (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {team.leader.full_name || team.leader.email}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {team.leader.email}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{'\u0546\u0577\u0561\u0576\u0561\u056f\u057e\u0561\u056e \u0579\u0567'}</span>
                      )}
                    </div>

                    {/* Team Members */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                          <Briefcase className="h-4 w-4" />
                          {'\u0539\u056b\u0574\u056b \u056b\u0580\u0561\u057e\u0561\u0562\u0561\u0576\u0576\u0565\u0580'}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedTeamId(team.id);
                            setAddMemberDialogOpen(true);
                          }}
                        >
                          <UserPlus className="mr-2 h-4 w-4" />
                          {'\u0531\u057e\u0565\u056c\u0561\u0581\u0576\u0565\u056c'}
                        </Button>
                      </div>
                      
                      {team.members && team.members.length > 0 ? (
                        <div className="space-y-2">
                          {team.members.map((member) => (
                            <div 
                              key={member.user_id}
                              className="flex items-center justify-between rounded-lg border p-2"
                            >
                              <div>
                                <span className="font-medium">
                                  {member.full_name || '\u0531\u057c\u0561\u0576\u0581 \u0561\u0576\u057e\u0561\u0576'}
                                </span>
                                <span className="ml-2 text-sm text-muted-foreground">
                                  {member.email}
                                </span>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setRemovingMember({ teamId: team.id, userId: member.user_id })}
                              >
                                <UserMinus className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground py-2">
                          {'\u0539\u056b\u0574\u0578\u0582\u0574 \u0564\u0565\u057c \u056b\u0580\u0561\u057e\u0561\u0562\u0561\u0576\u0576\u0565\u0580 \u0579\u056f\u0561\u0576'}
                        </p>
                      )}
                    </div>

                    {/* Delete Team Button */}
                    <div className="pt-2 border-t">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeletingTeamId(team.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {'\u054b\u0576\u057b\u0565\u056c \u0569\u056b\u0574\u0568'}
                      </Button>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}

        {/* Create Team Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{'\u054d\u057f\u0565\u0572\u056e\u0565\u056c \u0569\u056b\u0574'}</DialogTitle>
              <DialogDescription>
                {'\u054d\u057f\u0565\u0572\u056e\u0565\u0584 \u0576\u0578\u0580 \u0569\u056b\u0574 \u0587 \u0576\u0577\u0561\u0576\u0561\u056f\u0565\u0584 \u0569\u056b\u0574\u056c\u056b\u0564 (\u0561\u0578\u0582\u0564\u056b\u057f\u0578\u0580)'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="teamName">{'\u0539\u056b\u0574\u056b \u0561\u0576\u057e\u0561\u0576\u0578\u0582\u0574 *'}</Label>
                <Input
                  id="teamName"
                  placeholder={'\u0539\u056b\u0574 \u0531'}
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="teamDescription">{'\u0546\u056f\u0561\u0580\u0561\u0563\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576'}</Label>
                <Textarea
                  id="teamDescription"
                  placeholder={'\u0539\u056b\u0574\u056b \u0576\u056f\u0561\u0580\u0561\u0563\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576...'}
                  value={teamDescription}
                  onChange={(e) => setTeamDescription(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="teamLeader">{'\u0539\u056b\u0574\u056c\u056b\u0564 (\u0531\u0578\u0582\u0564\u056b\u057f\u0578\u0580) *'}</Label>
                <Select value={teamLeaderId} onValueChange={setTeamLeaderId}>
                  <SelectTrigger>
                    <SelectValue placeholder={'\u0538\u0576\u057f\u0580\u0565\u0584 \u0561\u0578\u0582\u0564\u056b\u057f\u0578\u0580\u056b\u0576'} />
                  </SelectTrigger>
                  <SelectContent>
                    {auditors?.map((auditor) => (
                      <SelectItem key={auditor.id} value={auditor.id}>
                        {auditor.full_name || auditor.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(!auditors || auditors.length === 0) && (
                  <p className="text-sm text-muted-foreground">
                    {'\u054d\u056f\u0566\u0562\u0578\u0582\u0574 \u057d\u057f\u0565\u0572\u056e\u0565\u0584 \u0585\u0563\u057f\u0561\u057f\u0565\u0580 \u00ab\u0531\u0578\u0582\u0564\u056b\u057f\u0578\u0580\u00bb \u0564\u0565\u0580\u0578\u057e'}
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                {'\u0549\u0565\u0572\u0561\u0580\u056f\u0565\u056c'}
              </Button>
              <Button 
                onClick={() => createTeam.mutate({ 
                  name: teamName, 
                  description: teamDescription || undefined,
                  leader_id: teamLeaderId 
                })}
                disabled={!teamName || !teamLeaderId || createTeam.isPending}
              >
                {createTeam.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {'\u054d\u057f\u0565\u0572\u056e\u0565\u056c'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Member Dialog */}
        <Dialog open={addMemberDialogOpen} onOpenChange={setAddMemberDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{'\u0531\u057e\u0565\u056c\u0561\u0581\u0576\u0565\u056c \u056b\u0580\u0561\u057e\u0561\u0562\u0561\u0576 \u0569\u056b\u0574\u0578\u0582\u0574'}</DialogTitle>
              <DialogDescription>
                {'\u0538\u0576\u057f\u0580\u0565\u0584 \u056b\u0580\u0561\u057e\u0561\u0562\u0561\u0576\u056b\u0576 \u0569\u056b\u0574\u056b\u0576 \u0561\u057e\u0565\u056c\u0561\u0581\u0576\u0565\u056c\u0578\u0582 \u0570\u0561\u0574\u0561\u0580'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{'\u053b\u0580\u0561\u057e\u0561\u0562\u0561\u0576'}</Label>
                <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
                  <SelectTrigger>
                    <SelectValue placeholder={'\u0538\u0576\u057f\u0580\u0565\u0584 \u056b\u0580\u0561\u057e\u0561\u0562\u0561\u0576\u056b\u0576'} />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedTeamId && getAvailableLawyers(selectedTeamId).map((lawyer) => (
                      <SelectItem key={lawyer.id} value={lawyer.id}>
                        {lawyer.full_name || lawyer.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTeamId && getAvailableLawyers(selectedTeamId).length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    {'\u0549\u056f\u0561\u0576 \u056b\u0580\u0561\u057e\u0561\u0562\u0561\u0576\u0576\u0565\u0580 \u0561\u057e\u0565\u056c\u0561\u0581\u0576\u0565\u056c\u0578\u0582 \u0570\u0561\u0574\u0561\u0580'}
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddMemberDialogOpen(false)}>
                {'\u0549\u0565\u0572\u0561\u0580\u056f\u0565\u056c'}
              </Button>
              <Button 
                onClick={() => selectedTeamId && addMember.mutate({ 
                  team_id: selectedTeamId, 
                  user_id: selectedMemberId 
                })}
                disabled={!selectedMemberId || addMember.isPending}
              >
                {addMember.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {'\u0531\u057e\u0565\u056c\u0561\u0581\u0576\u0565\u056c'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Team Confirmation */}
        <AlertDialog open={!!deletingTeamId} onOpenChange={() => setDeletingTeamId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{'\u054b\u0576\u057b\u0565\u056c \u0569\u056b\u0574\u0568?'}</AlertDialogTitle>
              <AlertDialogDescription>
                {'\u0531\u0575\u057d \u0563\u0578\u0580\u056e\u0578\u0572\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568 \u0570\u0576\u0561\u0580\u0561\u057e\u0578\u0580 \u0579\u0567 \u0579\u0565\u0572\u0561\u0580\u056f\u0565\u056c\u0589 \u053b\u0580\u0561\u057e\u0561\u0562\u0561\u0576\u0576\u0565\u0580\u056b \u0570\u0565\u057f \u0562\u0578\u056c\u0578\u0580 \u056f\u0561\u057a\u0565\u0580\u0568 \u056f\u057b\u0576\u057b\u057e\u0565\u0576\u0589'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{'\u0549\u0565\u0572\u0561\u0580\u056f\u0565\u056c'}</AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => deletingTeamId && deleteTeam.mutate(deletingTeamId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {'\u054b\u0576\u057b\u0565\u056c'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Remove Member Confirmation */}
        <AlertDialog open={!!removingMember} onOpenChange={() => setRemovingMember(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{'\u0540\u0565\u057c\u0561\u0581\u0576\u0565\u055e\u056c \u056b\u0580\u0561\u057e\u0561\u0562\u0561\u0576\u056b\u0576 \u0569\u056b\u0574\u056b\u0581?'}</AlertDialogTitle>
              <AlertDialogDescription>
                {'\u053b\u0580\u0561\u057e\u0561\u0562\u0561\u0576\u0568 \u056f\u0570\u0565\u057c\u0561\u0581\u057e\u056b \u0569\u056b\u0574\u056b\u0581\u0589 \u0539\u056b\u0574\u056c\u056b\u0564\u0568 \u0561\u0575\u056c\u0587\u057d \u0579\u056b \u056f\u0561\u0580\u0578\u0572\u0561\u0576\u0561 \u057f\u0565\u057d\u0576\u0565\u056c \u0576\u0580\u0561 \u0563\u0578\u0580\u056e\u0565\u0580\u0568\u0589'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{'\u0549\u0565\u0572\u0561\u0580\u056f\u0565\u056c'}</AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => removingMember && removeMember.mutate(removingMember)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {'\u054b\u0576\u057b\u0565\u056c'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
