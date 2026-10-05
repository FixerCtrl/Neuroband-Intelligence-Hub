import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, requiredEnv, sha256Hex } from "../_shared/whatsapp.ts";

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return jsonResponse({ error: "Sign in is required" }, 401);

    const url = requiredEnv("SUPABASE_URL");
    const anonKey = requiredEnv("SUPABASE_ANON_KEY");
    const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return jsonResponse({ error: "Sign in is required" }, 401);
    const { data: isAdmin, error: approvalError } = await userClient.rpc("is_admin");
    if (approvalError) throw approvalError;

    const admin = createClient(url, serviceKey);
    const { data: member, error: memberError } = await admin.from("members").select("id,approved,profile_completed,name,bio").eq("user_id", user.id).maybeSingle();
    if (memberError) throw memberError;
    if (!member) return jsonResponse({ error: "Complete your Team profile before connecting WhatsApp" }, 409);
    if (!isAdmin && (!member.approved || !member.profile_completed || !member.name?.trim() || !member.bio?.trim())) {
      return jsonResponse({ error: "Complete your profile and wait for admin approval before connecting WhatsApp" }, 403);
    }

    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const random = crypto.getRandomValues(new Uint8Array(10));
    const code = [...random].map(byte => alphabet[byte & 31]).join("");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const codeHash = await sha256Hex(code.toUpperCase());
    const { data: existing, error: existingError } = await admin.from("member_whatsapp").select("member_id").eq("member_id", member.id).maybeSingle();
    if (existingError) throw existingError;

    const values = { link_code_hash: codeHash, link_code_expires_at: expiresAt, updated_at: new Date().toISOString() };
    const { error: saveError } = existing
      ? await admin.from("member_whatsapp").update(values).eq("member_id", member.id)
      : await admin.from("member_whatsapp").insert({ member_id: member.id, ...values });
    if (saveError) throw saveError;

    return jsonResponse({ code, expires_at: expiresAt });
  } catch (error) {
    console.error("WhatsApp link-code creation failed:", error);
    return jsonResponse({ error: "Could not create a WhatsApp link code" }, 500);
  }
});
