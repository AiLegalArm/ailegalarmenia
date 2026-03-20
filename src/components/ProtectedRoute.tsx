import { useEffect, useState, ReactNode, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: "admin" | "lawyer" | "client" | "auditor";
}

const getLoginRedirect = (requiredRole?: string): string => {
  if (requiredRole === "admin") {
    return "/admin/login";
  }
  return "/login";
};

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  const checkAuth = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate(getLoginRedirect(requiredRole), { replace: true });
        return;
      }

      if (!requiredRole) {
        setIsAuthorized(true);
        setIsLoading(false);
        return;
      }

      const { data: hasRole, error } = await supabase.rpc("has_role", {
        _user_id: session.user.id,
        _role: requiredRole,
      });

      if (error) {
        console.error("Role check error:", error);
        navigate(getLoginRedirect(requiredRole), { replace: true });
        return;
      }

      if (!hasRole) {
        if (requiredRole === "admin") {
          navigate("/admin/login", { replace: true });
        } else {
          navigate("/dashboard", { replace: true });
        }
        return;
      }

      setIsAuthorized(true);
    } catch (error) {
      console.error("Auth check error:", error);
      navigate(getLoginRedirect(requiredRole), { replace: true });
    } finally {
      setIsLoading(false);
    }
  }, [navigate, requiredRole]);

  useEffect(() => {
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        navigate(getLoginRedirect(requiredRole), { replace: true });
      } else if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
        checkAuth();
      }
    });

    return () => subscription.unsubscribe();
  }, [checkAuth, navigate, requiredRole]);

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

  if (!isAuthorized) {
    return null;
  }

  return <>{children}</>;
}
