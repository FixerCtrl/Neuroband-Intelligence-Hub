import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, requiredEnv } from "../_shared/whatsapp.ts";

const guideInstructions = `You are Hub Guide, a friendly in-site navigation assistant for Neuroband Intelligence Hub.

Scope: answer basic questions about navigating the site's Overview, Analysis, Collection Plan, Repository, Team, Activity, Manual, profile, and task features. Explain where controls are and what existing features do. Keep answers friendly, concise, and practical. Do not invent controls or policies.

Boundaries: do not recommend, rank, find, or evaluate research sources; do not generate source lists, search queries, citations, or research findings. Do not upload, edit, approve, delete, or otherwise take actions for the user. The user remains responsible for research and every submission. If asked for source recommendations or research work, politely explain this guide only helps with site navigation and direct them to their team's normal research process. Do not claim to have accessed the user's records or performed an action.`;

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return jsonResponse({ error: "Sign in is required to use Hub Guide." }, 401);

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const anonKey = requiredEnv("SUPABASE_ANON_KEY");
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return jsonResponse({ error: "Sign in is required to use Hub Guide." }, 401);

    const [{ data: isAdmin, error: adminError }, { data: member, error: memberError }] = await Promise.all([
      userClient.rpc("is_admin"),
      userClient.from("members").select("approved,profile_completed,bio").eq("user_id", user.id).maybeSingle(),
    ]);
    if (adminError) throw adminError;
    if (memberError) throw memberError;
    if (!isAdmin && (!member?.approved || !member.profile_completed || !member.bio?.trim())) {
      return jsonResponse({ error: "Complete your profile and wait for admin approval before using Hub Guide." }, 403);
    }

    const body = await request.json().catch(() => null);
    const messages = Array.isArray(body?.messages)
      ? body.messages
        .filter((message: unknown) => message && typeof message === "object")
        .map((message: { role?: string; content?: string }) => ({
          role: message.role,
          content: typeof message.content === "string" ? message.content.trim().slice(0, 600) : "",
        }))
        .filter((message: { role?: string; content: string }) => ["user", "assistant"].includes(message.role || "") && message.content)
        .slice(-8)
      : [];
    if (!messages.length || messages.at(-1)?.role !== "user") {
      return jsonResponse({ error: "Ask a navigation or how-to question to get started." }, 400);
    }

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requiredEnv("GEMINI_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: Deno.env.get("SITE_GUIDE_MODEL") || "gemini-2.5-flash-lite",
        messages: [{ role: "system", content: guideInstructions }, ...messages],
        max_tokens: 280,
        temperature: 0.35,
      }),
    });
    if (!response.ok) {
      console.error("Hub Guide provider request failed:", response.status);
      return jsonResponse({ error: "Hub Guide is temporarily unavailable. Please try again shortly." }, 502);
    }

    const result = await response.json();
    const reply = result.choices?.[0]?.message?.content?.trim();
    if (!reply) return jsonResponse({ error: "Hub Guide could not form a response. Please try again." }, 502);
    return jsonResponse({ reply });
  } catch (error) {
    console.error("Hub Guide request failed:", error);
    return jsonResponse({ error: "Hub Guide is temporarily unavailable. Please try again shortly." }, 500);
  }
});
