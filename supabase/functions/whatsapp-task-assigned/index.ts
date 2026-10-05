import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, requiredEnv, sendWhatsAppTemplate } from "../_shared/whatsapp.ts";

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
    const { data: membership, error: membershipError } = await userClient.from("members").select("approved,profile_completed,bio").eq("user_id", user.id).maybeSingle();
    if (membershipError) throw membershipError;
    if (!isAdmin && (!membership?.approved || !membership.profile_completed || !membership.bio?.trim())) {
      return jsonResponse({ error: "Complete your profile and wait for admin approval first" }, 403);
    }

    const { task_id: taskId } = await request.json();
    if (typeof taskId !== "string" || !/^[0-9a-f-]{36}$/i.test(taskId)) return jsonResponse({ error: "Valid task_id is required" }, 400);

    const admin = createClient(url, serviceKey);
    const { data: task, error: taskError } = await admin.from("tasks").select("id,title,assigned_by,assigned_to,due_date").eq("id", taskId).maybeSingle();
    if (taskError) throw taskError;
    if (!task) return jsonResponse({ error: "Task not found" }, 404);
    const { data: assigner, error: assignerError } = await admin.from("members").select("user_id").eq("id", task.assigned_by).maybeSingle();
    if (assignerError) throw assignerError;
    if (!isAdmin && (!assigner || assigner.user_id !== user.id)) return jsonResponse({ error: "You cannot send a notification for this task" }, 403);

    const { data: contact, error: contactError } = await admin.from("member_whatsapp").select("phone_e164,opted_in_at").eq("member_id", task.assigned_to).maybeSingle();
    if (contactError) throw contactError;
    if (!contact?.phone_e164 || !contact.opted_in_at) return jsonResponse({ sent: false, skipped: true, reason: "Assignee has not connected WhatsApp" });

    await sendWhatsAppTemplate(
      contact.phone_e164,
      requiredEnv("WHATSAPP_TASK_TEMPLATE_NAME"),
      Deno.env.get("WHATSAPP_TASK_TEMPLATE_LANGUAGE") || "en",
      [task.title, task.due_date || "No due date"],
    );
    return jsonResponse({ sent: true });
  } catch (error) {
    console.error("Task WhatsApp notification failed:", error);
    return jsonResponse({ error: "Task saved, but the WhatsApp notification could not be sent" }, 500);
  }
});
