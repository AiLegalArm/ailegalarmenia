import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors } from "../_shared/edge-security.ts";

interface ResetPasswordRequest {
  user_id: string;
  new_password: string;
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get the current user
    const { data: { user: currentUser }, error: userError } = await userClient.auth.getUser();
    if (userError || !currentUser) {
      throw new Error("Unauthorized");
    }

    // Check if user has admin role
    const { data: isAdmin, error: roleError } = await userClient.rpc("has_role", {
      _user_id: currentUser.id,
      _role: "admin",
    });

    if (roleError || !isAdmin) {
      throw new Error("Only admins can reset passwords");
    }

    const { user_id, new_password }: ResetPasswordRequest = await req.json();

    if (!user_id || !new_password) {
      throw new Error("Missing required fields: user_id, new_password");
    }

    if (new_password.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }

    // Create admin client with service role key
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Update user password
    const { error: updateError } = await adminClient.auth.admin.updateUserById(user_id, {
      password: new_password,
    });

    if (updateError) {
      throw updateError;
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), lvl: "error", fn: "admin-reset-password", msg: error instanceof Error ? error.message : "Reset failed" }));
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Password reset failed" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
