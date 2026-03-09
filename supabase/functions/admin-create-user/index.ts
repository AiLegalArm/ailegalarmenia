import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors } from "../_shared/edge-security.ts";

interface CreateUserRequest {
  username: string;
  password: string;
  full_name?: string;
  role: "admin" | "client" | "auditor" | "lawyer";
  auditor_id?: string;
}

function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
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
      throw new Error("Only admins can create users");
    }

    // Parse request body
    const { username: usernameRaw, password, full_name, role, auditor_id }: CreateUserRequest = await req.json();

    const username = normalizeUsername(usernameRaw || "");

    if (!username || !password || !role) {
      throw new Error("Missing required fields: username, password, role");
    }

    // Validate username format (alphanumeric, underscores, 3-20 chars)
    const usernameRegex = /^[a-z0-9_]{3,20}$/;
    if (!usernameRegex.test(username)) {
      throw new Error("Username must be 3-20 characters, alphanumeric and underscores only");
    }

    if (password.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }

    // Create admin client with service role key
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Check if username already exists (case-insensitive)
    const { data: existingUser, error: checkError } = await adminClient
      .from("profiles")
      .select("username")
      .ilike("username", username)
      .maybeSingle();

    if (checkError) {
      throw new Error("Failed to check username availability");
    }

    if (existingUser) {
      throw new Error("Username already exists");
    }

    // Generate internal email from username (for Auth)
    const internalEmail = `${username}@app.internal`;

    // Create the user with admin API
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email: internalEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name, username },
    });

    if (createError) {
      throw createError;
    }

    // Update profile for the new user with username (trigger may have created it)
    const { error: profileError } = await adminClient
      .from("profiles")
      .upsert({
        id: newUser.user.id,
        email: internalEmail,
        full_name: full_name || null,
        username: username,
        auditor_id: auditor_id || null,
      }, { onConflict: 'id' });

    if (profileError) {
      console.error(JSON.stringify({ ts: new Date().toISOString(), lvl: "error", fn: "admin-create-user", msg: "Profile upsert error" }));
    }

    // Assign the role (use upsert to avoid duplicate key error)
    const { error: roleInsertError } = await adminClient
      .from("user_roles")
      .upsert({
        user_id: newUser.user.id,
        role,
      }, { onConflict: 'user_id,role', ignoreDuplicates: true });

    if (roleInsertError) {
      console.error(JSON.stringify({ ts: new Date().toISOString(), lvl: "error", fn: "admin-create-user", msg: "Role assignment error" }));
      // Don't throw - user was created successfully
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: newUser.user.id,
          username,
          full_name,
          role,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), lvl: "error", fn: "admin-create-user", msg: error instanceof Error ? error.message : "User creation failed" }));
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "User creation failed" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
