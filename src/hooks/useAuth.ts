import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];
type Profile = Database['public']['Tables']['profiles']['Row'];

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const applySession = (nextSession: Session | null) => {
      if (!isMounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setAuthReady(true);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession);
    });

    supabase.auth
      .getSession()
      .then(({ data: { session: initialSession } }) => {
        applySession(initialSession);
      })
      .catch((error) => {
        console.error('Failed to restore session', error);
        applySession(null);
      });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const profileQuery = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null;

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data as Profile | null;
    },
    enabled: !!user,
  });

  const rolesQuery = useQuery({
    queryKey: ['user-roles', user?.id],
    queryFn: async () => {
      if (!user) return [] as AppRole[];

      const { data, error } = await supabase.rpc('get_user_roles', { _user_id: user.id });
      if (error) {
        throw error;
      }

      return ((data as AppRole[] | null) ?? []) as AppRole[];
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    return data;
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
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
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const roles = rolesQuery.data ?? [];
  const hasRole = (role: AppRole): boolean => roles.includes(role);
  const roleLoading = !!user && rolesQuery.isPending;
  const loading = !authReady || roleLoading;

  return {
    user,
    session,
    profile: profileQuery.data ?? null,
    profileError: profileQuery.error ?? null,
    roles,
    rolesError: rolesQuery.error ?? null,
    loading,
    authReady,
    roleLoading,
    signIn,
    signUp,
    signOut,
    hasRole,
    isAdmin: hasRole('admin'),
    isClient: hasRole('client'),
    isAuditor: hasRole('auditor'),
    isLawyer: hasRole('lawyer'),
    isAuthenticated: !!user,
  };
}
