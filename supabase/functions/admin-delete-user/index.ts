import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors } from "../_shared/edge-security.ts";

interface DeleteUserRequest {
  user_id: string;
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  try {
    // Get the authorization header to verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    // Create a client with the user's token to verify they're admin
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

    // Check if user has admin role using RPC
    const { data: isAdmin, error: roleError } = await userClient.rpc("has_role", {
      _user_id: currentUser.id,
      _role: "admin",
    });

    if (roleError || !isAdmin) {
      throw new Error("Only admins can delete users");
    }

    // Parse request body
    const { user_id }: DeleteUserRequest = await req.json();

    if (!user_id) {
      throw new Error("Missing required field: user_id");
    }

    // Prevent self-deletion
    if (user_id === currentUser.id) {
      throw new Error("Cannot delete your own account");
    }

    // Create admin client with service role key
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Check if target user exists and is not an admin (prevent deleting other admins)
    const { data: targetUserRoles, error: checkError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user_id);

    if (checkError) {
      throw new Error("Failed to check user roles");
    }

    const isTargetAdmin = targetUserRoles?.some(r => r.role === "admin");
    if (isTargetAdmin) {
      throw new Error("Cannot delete admin users");
    }

    // Delete user roles first (should cascade, but be explicit)
    await adminClient
      .from("user_roles")
      .delete()
      .eq("user_id", user_id);

    // Delete profile (should cascade, but be explicit)
    await adminClient
      .from("profiles")
      .delete()
      .eq("id", user_id);

    // Delete the user from auth.users using admin API
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user_id);

    if (deleteError) {
      console.error(JSON.stringify({ ts: new Date().toISOString(), lvl: "error", fn: "admin-delete-user", msg: "Delete failed" }));
      throw new Error("Failed to delete user: " + deleteError.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "User deleted successfully",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), lvl: "error", fn: "admin-delete-user", msg: error instanceof Error ? error.message : "Deletion failed" }));
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "User deletion failed" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
