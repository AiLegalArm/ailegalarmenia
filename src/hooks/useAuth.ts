import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];
type Profile = Database['public']['Tables']['profiles']['Row'];

interface UseAuthReturn {
  user: User | null;
  session: Session | null;
  profile: Profile | null | undefined;
  roles: AppRole[];
  loading: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ user: User | null; session: Session | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<unknown>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  isAdmin: boolean;
  isClient: boolean;
  isAuditor: boolean;
  isLawyer: boolean;
  isAuthenticated: boolean;
  checkAdmin: () => Promise<boolean>;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (isMounted) {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        setLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (isMounted) {
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);
          
          if (!session) {
            queryClient.invalidateQueries({ queryKey: ['user-roles'] });
            queryClient.invalidateQueries({ queryKey: ['profile'] });
          }
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data as Profile | null;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const { data: roles, isLoading: rolesLoading } = useQuery({
    queryKey: ['user-roles', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .rpc('get_user_roles', { _user_id: user.id });
      if (error) {
        console.error('Error fetching roles:', error);
        return [];
      }
      return (data as AppRole[]) || [];
    },
    enabled: !!user,
    staleTime: 30 * 1000,
    retry: 1,
  });

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return { user: data.user, session: data.session };
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });
    if (error) throw error;
    return data;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const hasRole = useCallback((role: AppRole): boolean => {
    return Array.isArray(roles) && roles.includes(role);
  }, [roles]);

  const isAdmin = hasRole('admin');
  const isClient = hasRole('client');
  const isAuditor = hasRole('auditor');
  const isLawyer = hasRole('lawyer');

  const checkAdmin = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    try {
      const { data, error } = await supabase.rpc('has_role', {
        _user_id: user.id,
        _role: 'admin' as AppRole,
      });
      if (error) {
        console.error('Error checking admin role:', error);
        return false;
      }
      return data === true;
    } catch {
      return false;
    }
  }, [user]);

  return {
    user,
    session,
    profile,
    roles: roles || [],
    loading,
    isLoading: loading || rolesLoading,
    signIn,
    signUp,
    signOut,
    hasRole,
    isAdmin,
    isClient,
    isAuditor,
    isLawyer,
    isAuthenticated: !!user,
    checkAdmin,
  };
}
