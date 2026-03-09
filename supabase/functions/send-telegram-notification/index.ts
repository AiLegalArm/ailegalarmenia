import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { handleCors, checkInternalAuth } from "../_shared/edge-security.ts";

interface NotificationRequest {
  userId?: string;
  chatId?: string;
  message: string;
  parseMode?: "HTML" | "Markdown";
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Internal-only: require x-internal-key
  const authError = checkInternalAuth(req, corsHeaders);
  if (authError) return authError;

  try {
    const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!TELEGRAM_BOT_TOKEN) {
      throw new Error("TELEGRAM_BOT_TOKEN is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId, chatId, message, parseMode = "HTML" }: NotificationRequest = await req.json();

    if (!message) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let targetChatId = chatId;

    if (userId && !chatId) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("telegram_chat_id, notification_preferences")
        .eq("id", userId)
        .single();

      if (profileError || !profile?.telegram_chat_id) {
        return new Response(JSON.stringify({ 
          error: "User has no Telegram chat ID configured",
          success: false 
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const prefs = profile.notification_preferences as { telegram?: boolean } | null;
      if (prefs && prefs.telegram === false) {
        return new Response(JSON.stringify({ 
          success: false,
          skipped: true,
          reason: "Telegram notifications disabled by user"
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      targetChatId = profile.telegram_chat_id;
    }

    if (!targetChatId) {
      return new Response(JSON.stringify({ error: "No chat ID available" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: targetChatId,
          text: message,
          parse_mode: parseMode,
        }),
      }
    );

    const telegramResult = await telegramResponse.json();

    if (!telegramResponse.ok) {
      console.error("Telegram API error:", telegramResult);
      return new Response(JSON.stringify({ 
        error: telegramResult.description || "Failed to send Telegram message",
        success: false 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Telegram notification sent to ${targetChatId}`);

    return new Response(JSON.stringify({ 
      success: true,
      message_id: telegramResult.result?.message_id 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("send-telegram-notification error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error",
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
