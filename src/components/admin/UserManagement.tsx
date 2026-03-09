import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { ResetPasswordDialog } from './ResetPasswordDialog';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Users, 
  Search, 
  MoreHorizontal, 
  Shield, 
  UserX, 
  UserCheck,
  Loader2,
  RefreshCw,
  UserPlus,
  Copy,
  Eye,
  EyeOff,
  Trash2,
  KeyRound
} from 'lucide-react';
import { format } from 'date-fns';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

interface UserWithRoles {
  id: string;
  email: string;
  username: string | null;
  full_name: string | null;
  created_at: string;
  roles: AppRole[];
  is_blocked: boolean;
  auditor_id: string | null;
  auditor?: {
    id: string;
    username: string | null;
    full_name: string | null;
  } | null;
}

const AVAILABLE_ROLES: { value: AppRole; label: string; color: string }[] = [
  { value: 'admin', label: 'Ադմինիստրատոր', color: 'bg-red-500/10 text-red-700' },
  { value: 'client', label: 'Հաճախորդ', color: 'bg-green-500/10 text-green-700' },
  { value: 'auditor', label: 'Աուդիտոր', color: 'bg-purple-500/10 text-purple-700' },
  { value: 'lawyer', label: 'Փաստաբան', color: 'bg-blue-500/10 text-blue-700' },
];

// Generate random password
function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

export function UserManagement() {
  const { t } = useTranslation('common');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [blockingUser, setBlockingUser] = useState<UserWithRoles | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserWithRoles | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState(generatePassword());
  const [newUserRole, setNewUserRole] = useState<AppRole>('client');
  const [newUserAuditorId, setNewUserAuditorId] = useState<string>('');
  const [showPassword, setShowPassword] = useState(false);
  const [createdUserInfo, setCreatedUserInfo] = useState<{ username: string; password: string } | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<UserWithRoles | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState(generatePassword());
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetPasswordInfo, setResetPasswordInfo] = useState<{ username: string; password: string } | null>(null);

  // Fetch all users with their roles
  const { data: users, isLoading, refetch } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      // Get all profiles with auditor info
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, username, full_name, created_at, auditor_id')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Get all user roles
      const { data: allRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Get auditor profiles
      const auditorIds = profiles?.map(p => p.auditor_id).filter(Boolean) || [];
      const { data: auditors, error: auditorsError } = auditorIds.length > 0 
        ? await supabase
            .from('profiles')
            .select('id, username, full_name')
            .in('id', auditorIds)
        : { data: null, error: null };

      if (auditorsError) throw auditorsError;

      // Create auditor lookup map
      const auditorMap = new Map(auditors?.map(a => [a.id, a]) || []);

      // Combine profiles with roles and auditor info
      const usersWithRoles: UserWithRoles[] = (profiles || []).map(profile => {
        const userRoles = (allRoles || [])
          .filter(r => r.user_id === profile.id)
          .map(r => r.role as AppRole);

        return {
          id: profile.id,
          email: profile.email,
          username: profile.username || null,
          full_name: profile.full_name,
          created_at: profile.created_at,
          roles: userRoles,
          is_blocked: userRoles.length === 0, // No roles = blocked
          auditor_id: profile.auditor_id,
          auditor: profile.auditor_id ? auditorMap.get(profile.auditor_id) : null,
        };
      });

      return usersWithRoles;
    },
  });

  // Fetch users with auditor role for the dropdown
  const { data: auditors } = useQuery({
    queryKey: ['auditors'],
    queryFn: async () => {
      // Get all user roles
      const { data: allRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Get IDs of users with auditor role
      const auditorIds = (allRoles || [])
        .filter(r => r.role === 'auditor')
        .map(r => r.user_id);

      if (auditorIds.length === 0) return [];

      // Get profiles for auditors
      const { data: auditorProfiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, full_name')
        .in('id', auditorIds);

      if (profilesError) throw profilesError;

      return auditorProfiles || [];
    },
  });

  // Add role mutation
  const addRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'Դերը ավելացվեց' });
    },
    onError: (error) => {
      toast({ 
        title: 'Սխալ', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  // Remove role mutation
  const removeRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role', role);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'Դերը հեռացվեց' });
    },
    onError: (error) => {
      toast({ 
        title: 'Սխալ', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  // Block user (remove all roles)
  const blockUser = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'Օգտատերը արգելափակվեց' });
      setBlockingUser(null);
    },
    onError: (error) => {
      toast({ 
        title: 'Սխալ', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  // Unblock user (add client role)
  const unblockUser = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role: 'client' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'Օգտատերը ապաարգելափակվեց' });
    },
    onError: (error) => {
      toast({ 
        title: 'Սխալ', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  // Create user mutation
  const createUser = useMutation({
    mutationFn: async (data: { username: string; password: string; full_name?: string; role: AppRole; auditor_id?: string }) => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await supabase.functions.invoke('admin-create-user', {
        body: data,
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to create user');
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'Օգտատերը ստեղծվեց' });
      setCreatedUserInfo({ username: variables.username, password: variables.password });
      setNewUsername('');
      setNewUserName('');
      setNewUserPassword(generatePassword());
      setNewUserRole('client');
      setNewUserAuditorId('');
      setCreateDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: 'Օգտատիրոջ ստեղծման սխալ',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete user mutation
  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      const response = await supabase.functions.invoke('admin-delete-user', {
        body: { user_id: userId },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to delete user');
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'Օգտատերը ջնջվել է' });
      setDeletingUser(null);
    },
    onError: (error) => {
      toast({
        title: 'Սխալ օգտատերին ջնջելիս',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleRoleToggle = (user: UserWithRoles, role: AppRole, hasRole: boolean) => {
    if (hasRole) {
      removeRole.mutate({ userId: user.id, role });
    } else {
      addRole.mutate({ userId: user.id, role });
    }
  };

  const handleCreateUser = () => {
    if (!newUsername || !newUserPassword) {
      toast({ title: 'Լրացրեք մուտքանունը և գաղտնաբառը', variant: 'destructive' });
      return;
    }
    // Validate username format
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(newUsername)) {
      toast({ title: 'Մուտքանունը պետք է լինի 3-20 նիշ (տառեր, թվեր, _)', variant: 'destructive' });
      return;
    }
    // Validate auditor selection for lawyer role
    if (newUserRole === 'lawyer' && !newUserAuditorId) {
      toast({ title: 'Փաստաբանի համար պետք է ընտրել աուդիտոր', variant: 'destructive' });
      return;
    }
    createUser.mutate({
      username: newUsername,
      password: newUserPassword,
      full_name: newUserName || undefined,
      role: newUserRole,
      auditor_id: newUserRole === 'lawyer' ? newUserAuditorId : undefined,
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Պատճենվել է սեղմատախտակին' });
  };

  const filteredUsers = users?.filter(user => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      user.username?.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query) ||
      user.full_name?.toLowerCase().includes(query)
    );
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Օգտատերերի կառավարում
          </CardTitle>
          <div className="flex gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Փնտրել էլ․ փոստով կամ անունով..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Ստեղծել
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
        ) : !filteredUsers?.length ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 opacity-50" />
            <p className="mt-2">Օգտատերեր չեն գտնվել</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Օգտատեր</TableHead>
                  <TableHead>Դերեր</TableHead>
                  <TableHead>Աուդիտոր</TableHead>
                  <TableHead>Կարգավիճակ</TableHead>
                  <TableHead>Գրանցման ամսաթիվ</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{user.full_name || user.username || 'Առանց անվան'}</p>
                        <p className="text-sm text-muted-foreground">@{user.username}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.roles.length > 0 ? (
                          user.roles.map((role) => {
                            const roleInfo = AVAILABLE_ROLES.find(r => r.value === role);
                            return (
                              <Badge 
                                key={role} 
                                variant="secondary"
                                className={roleInfo?.color}
                              >
                                {roleInfo?.label || role}
                              </Badge>
                            );
                          })
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Դերեր չկան
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {user.roles.includes('lawyer') ? (
                        user.auditor ? (
                          <div>
                            <p className="text-sm">{user.auditor.full_name || user.auditor.username || 'Անանուն'}</p>
                            {user.auditor.username && (
                              <p className="text-xs text-muted-foreground">@{user.auditor.username}</p>
                            )}
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Աուդիտոր չկա
                          </Badge>
                        )
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.is_blocked ? (
                        <Badge variant="destructive">Արգելափակված</Badge>
                      ) : (
                        <Badge variant="default" className="bg-green-500">Ակտիվ</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {format(new Date(user.created_at), 'dd.MM.yyyy')}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Դերերի կառավարում</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {AVAILABLE_ROLES.map((role) => {
                            const hasRole = user.roles.includes(role.value);
                            return (
                              <DropdownMenuCheckboxItem
                                key={role.value}
                                checked={hasRole}
                                onCheckedChange={() => handleRoleToggle(user, role.value, hasRole)}
                              >
                                <Shield className="mr-2 h-4 w-4" />
                                {role.label}
                              </DropdownMenuCheckboxItem>
                            );
                          })}
                          <DropdownMenuSeparator />
                          {user.is_blocked ? (
                            <DropdownMenuItem onClick={() => unblockUser.mutate(user.id)}>
                              <UserCheck className="mr-2 h-4 w-4 text-green-600" />
                              Ապաարգելափակել
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem 
                              onClick={() => setBlockingUser(user)}
                              className="text-destructive"
                            >
                              <UserX className="mr-2 h-4 w-4" />
                              Արգելափակել
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => setResetPasswordUser(user)}
                          >
                            <KeyRound className="mr-2 h-4 w-4" />
                            {'\u0553\u0578\u056D\u0565\u056C \u0563\u0561\u0572\u057F\u0576\u0561\u0562\u0561\u057C'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => setDeletingUser(user)}
                            className="text-destructive"
                            disabled={user.roles.includes('admin')}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {'\u054B\u0576\u057B\u0565\u056C'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Block confirmation dialog */}
        <AlertDialog open={!!blockingUser} onOpenChange={() => setBlockingUser(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Արգելափակե՞լ օգտատիրոջը?</AlertDialogTitle>
              <AlertDialogDescription>
                Օգտատեր <strong>{blockingUser?.username || blockingUser?.email}</strong> կկորցնի բոլոր դերերը և չի կարողանա 
                օգտագործել համակարգը։ Այս գործողությունը կարող է չեղարկվել։
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Չեղարկել</AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => blockingUser && blockUser.mutate(blockingUser.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Արգելափակել
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete confirmation dialog */}
        <AlertDialog open={!!deletingUser} onOpenChange={() => setDeletingUser(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Ջնջե՞լ օգտատիրոջը?</AlertDialogTitle>
              <AlertDialogDescription>
                Օգտատեր <strong>{deletingUser?.username || deletingUser?.email}</strong> կջնջվի համակարգից ամբողջովին.
                <br /><br />
                <span className="text-destructive font-semibold">Այս գործողությունը հետադարձելի չէ!</span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Չեղարկել</AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => deletingUser && deleteUser.mutate(deletingUser.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteUser.isPending}
              >
                {deleteUser.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Ջնջել մշտապես
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Create User Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ստեղծել օգտատեր</DialogTitle>
              <DialogDescription>
                Ստեղծեք նոր օգտատեր ընտրված դերով
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="username">Մուտքանուն *</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="username"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">3-20 նիշ՝ տառեր, թվեր, _</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fullName">Ամբողջական անուն</Label>
                <Input
                  id="fullName"
                  placeholder="Իվան Իվանով"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Գաղտնաբառ *</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setNewUserPassword(generatePassword())}
                  >
                    Գեներացնել
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Դեր *</Label>
                <Select value={newUserRole} onValueChange={(v) => setNewUserRole(v as AppRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AVAILABLE_ROLES.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {newUserRole === 'lawyer' && (
                <div className="space-y-2">
                  <Label htmlFor="auditor">Նշանակել աուդիտոր *</Label>
                  <Select value={newUserAuditorId} onValueChange={setNewUserAuditorId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Ընտրել աուդիտոր" />
                    </SelectTrigger>
                    <SelectContent>
                      {auditors && auditors.length > 0 ? (
                        auditors.map((auditor) => (
                          <SelectItem key={auditor.id} value={auditor.id}>
                            {auditor.full_name || auditor.username || 'Անանուն'} {auditor.username ? `(@${auditor.username})` : ''}
                          </SelectItem>
                        ))
                      ) : (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          Աուդիտորներ չկան
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Ընտրեք աուդիտոր, որը կհսկի փաստաբանի աշխատանքը</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Չեղարկել
              </Button>
              <Button onClick={handleCreateUser} disabled={createUser.isPending}>
                {createUser.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Ստեղծել
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Created User Info Dialog */}
        <Dialog open={!!createdUserInfo} onOpenChange={() => setCreatedUserInfo(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-600">
                <UserCheck className="h-5 w-5" />
                Օգտատերը ստեղծվեց
              </DialogTitle>
              <DialogDescription>
                Պահպանեք մուտքի տվյալները և փոխանցեք օգտատիրոջը
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Մուտքանուն</p>
                    <p className="font-mono font-medium">{createdUserInfo?.username}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyToClipboard(createdUserInfo?.username || '')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Գաղտնաբառ</p>
                    <p className="font-mono font-medium">{createdUserInfo?.password}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyToClipboard(createdUserInfo?.password || '')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Button
                className="w-full"
                onClick={() => copyToClipboard(`Մուտքանուն: ${createdUserInfo?.username}\nԳաղտնաբառ: ${createdUserInfo?.password}`)}
              >
                <Copy className="mr-2 h-4 w-4" />
                Պատճենել ամբողջը
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={() => setCreatedUserInfo(null)}>
                Պատրաստ
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reset Password Dialog */}
        <ResetPasswordDialog
          user={resetPasswordUser}
          open={!!resetPasswordUser}
          onOpenChange={(open) => !open && setResetPasswordUser(null)}
        />
      </CardContent>
    </Card>
  );
}
