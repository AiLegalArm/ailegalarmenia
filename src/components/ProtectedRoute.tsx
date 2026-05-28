import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: 'admin' | 'lawyer' | 'client' | 'auditor';
}

const getLoginRedirect = (requiredRole?: string): string => {
  if (requiredRole === 'admin') {
    return '/admin/login';
  }

  return '/landing';
};

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isLoading, hasRole } = useAuth();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        navigate(getLoginRedirect(requiredRole), {
          replace: true,
          state: { from: location.pathname },
        });
      }
    });

    return () => subscription.unsubscribe();
  }, [location.pathname, navigate, requiredRole]);

  if (isLoading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        role="status"
        aria-label="Checking authorization"
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">Checking authorization...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to={getLoginRedirect(requiredRole)}
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  if (requiredRole && !hasRole(requiredRole)) {
    return <Navigate to={requiredRole === 'admin' ? '/admin/login' : '/dashboard'} replace />;
  }

  return <>{children}</>;
}
