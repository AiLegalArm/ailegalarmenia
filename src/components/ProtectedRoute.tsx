import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getAuthRedirectPath } from '@/lib/auth';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: 'admin' | 'lawyer' | 'client' | 'auditor';
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const location = useLocation();
  const { user, loading, hasRole } = useAuth();

  if (loading) {
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
        to={getAuthRedirectPath(requiredRole)}
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  if (requiredRole && !hasRole(requiredRole)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
