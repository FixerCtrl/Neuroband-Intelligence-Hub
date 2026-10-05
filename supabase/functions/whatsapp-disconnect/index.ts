import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, requiredEnv } from "../_shared/whatsapp.ts";

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return jsonResponse({ error: "Sign in is required" }, 401);
    const url = requiredEnv("SUPABASE_URL");
    const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const userClient = createClient(url, requiredEnv("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return jsonResponse({ error: "Sign in is required" }, 401);
    const { data: isAdmin, error: approvalError } = await userClient.rpc("is_admin");
    if (approvalError) throw approvalError;

    const admin = createClient(url, serviceKey);
    const { data: member, error: memberError } = await admin.from("members").select("id,approved,profile_completed,name,bio").eq("user_id", user.id).maybeSingle();
    if (memberError) throw memberError;
    if (!member) return jsonResponse({ error: "Team profile not found" }, 404);
    if (!isAdmin && (!member.approved || !member.profile_completed || !member.name?.trim() || !member.bio?.trim())) {
      return jsonResponse({ error: "Complete your profile and wait for admin approval first" }, 403);
    }

    const { data: link, error: linkError } = await admin.from("member_whatsapp").select("phone_e164").eq("member_id", member.id).maybeSingle();
    if (linkError) throw linkError;
    if (link?.phone_e164) {
      const { data: session } = await admin.from("whatsapp_intake_sessions").select("file_path").eq("phone_e164", link.phone_e164).maybeSingle();
      if (session?.file_path) await admin.storage.from("sources").remove([session.file_path]);
      await admin.from("whatsapp_intake_sessions").delete().eq("phone_e164", link.phone_e164);
    }
    const { error: updateError } = await admin.from("member_whatsapp").update({
      phone_e164: null,
      opted_in_at: null,
      linked_at: null,
      link_code_hash: null,
      link_code_expires_at: null,
      updated_at: new Date().toISOString(),
    }).eq("member_id", member.id);
    if (updateError) throw updateError;
    return jsonResponse({ disconnected: true });
  } catch (error) {
    console.error("WhatsApp disconnect failed:", error);
    return jsonResponse({ error: "Could not disconnect WhatsApp" }, 500);
  }
});
