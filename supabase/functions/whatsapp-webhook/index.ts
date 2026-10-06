import { createClient } from "npm:@supabase/supabase-js@2";
import { jsonResponse, normalizePhone, requiredEnv, sendWhatsAppText, sha256Hex } from "../_shared/whatsapp.ts";

const INTELLIGENCE_NEEDS = [
  { id: "KIN1", questions: ["KIQ1", "KIQ2", "KIQ3"] },
  { id: "KIN2", questions: ["KIQ1", "KIQ2", "KIQ3"] },
  { id: "KIN3", questions: ["KIQ1", "KIQ2", "KIQ3"] },
];
const SOURCE_TYPES = ["Journal article", "Industry report", "News article", "Company website", "Press release", "Financial filing", "Social media / forum", "Patent filing", "Other"];
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

function serviceClient(){
  return createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function safeFileName(name: string){
  return name.split(/[\\/]/).pop()?.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 100) || "whatsapp-source.pdf";
}

async function recordActivity(
  admin: ReturnType<typeof createClient>,
  actor: { email: string | null; name: string; userId: string | null },
  action: string,
  details: string | null,
){
  let duplicateQuery = admin.from("activity_log")
    .select("id")
    .eq("action", action)
    .gte("created_at", new Date(Date.now() - 5000).toISOString())
    .limit(1);
  duplicateQuery = actor.userId
    ? duplicateQuery.eq("actor_user_id", actor.userId)
    : duplicateQuery.is("actor_user_id", null);
  duplicateQuery = details === null
    ? duplicateQuery.is("details", null)
    : duplicateQuery.eq("details", details);
  const { data: duplicate, error: lookupError } = await duplicateQuery.maybeSingle();
  if (lookupError) console.warn("Could not check for a trigger-generated activity record:", lookupError.message);
  if (duplicate) return;

  const { error } = await admin.from("activity_log").insert({
    actor_email: actor.email,
    actor_name: actor.name,
    actor_user_id: actor.userId,
    action,
    details,
  });
  if (error) console.warn("Could not record WhatsApp activity:", error.message);
}

async function validSignature(body: string, header: string | null){
  if (!header?.startsWith("sha256=")) return false;
  const signature = header.slice(7);
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(requiredEnv("META_APP_SECRET")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  const expected = [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("");
  let mismatch = 0;
  for (let index = 0; index < expected.length; index++) mismatch |= expected.charCodeAt(index) ^ signature.toLowerCase().charCodeAt(index);
  return mismatch === 0;
}

async function linkPhone(admin: ReturnType<typeof createClient>, phone: string, code: string){
  const hash = await sha256Hex(code.toUpperCase());
  const { data: link, error } = await admin.from("member_whatsapp")
    .select("member_id")
    .eq("link_code_hash", hash)
    .gt("link_code_expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  if (!link) {
    await sendWhatsAppText(phone, "That connection code is invalid or expired. Generate a new code from your Team profile and try again.");
    return;
  }
  const { data: member, error: memberError } = await admin.from("members")
    .select("approved,profile_completed,name,bio,user_id")
    .eq("id", link.member_id)
    .maybeSingle();
  if (memberError) throw memberError;
  if (!member?.approved || !member.profile_completed || !member.name?.trim() || !member.bio?.trim()) {
    await sendWhatsAppText(phone, "This team profile is not approved for workspace access yet. Please complete your profile and contact an admin.");
    return;
  }
  const now = new Date().toISOString();
  const { error: updateError } = await admin.from("member_whatsapp").update({
    phone_e164: phone,
    opted_in_at: now,
    linked_at: now,
    link_code_hash: null,
    link_code_expires_at: null,
    updated_at: now,
  }).eq("member_id", link.member_id);
  if (updateError) {
    if (updateError.code === "23505") {
      await sendWhatsAppText(phone, "This number is already linked to another team profile. Disconnect it there first, then try again.");
      return;
    }
    throw updateError;
  }
  const { data: authRecord } = member.user_id
    ? await admin.auth.admin.getUserById(member.user_id)
    : { data: null };
  await recordActivity(admin, {
    email: authRecord?.user?.email || null,
    name: member.name,
    userId: member.user_id,
  }, "connected WhatsApp", member.name);
  await sendWhatsAppText(phone, "WhatsApp is connected. You are opted in to brief task-assignment alerts. To add a source, send a PDF or image here and I’ll guide you through its details. Disconnect any time from your Team profile.");
}

async function downloadMedia(mediaId: string){
  const version = requiredEnv("WHATSAPP_GRAPH_API_VERSION");
  const token = requiredEnv("WHATSAPP_ACCESS_TOKEN");
  const metadataResponse = await fetch(`https://graph.facebook.com/${version}/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!metadataResponse.ok) throw new Error(`Meta media metadata request failed (${metadataResponse.status})`);
  const metadata = await metadataResponse.json();
  const mimeType = String(metadata.mime_type || "").split(";")[0].toLowerCase();
  const supported = mimeType === "application/pdf" || ["image/jpeg", "image/png", "image/webp"].includes(mimeType);
  if (!supported) throw new Error("Only PDF, JPEG, PNG, and WebP source files are supported");
  const fileResponse = await fetch(metadata.url, { headers: { Authorization: `Bearer ${token}` } });
  if (!fileResponse.ok) throw new Error(`Meta media download failed (${fileResponse.status})`);
  const bytes = new Uint8Array(await fileResponse.arrayBuffer());
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new Error("The source file exceeds the 20 MB limit");
  return { bytes, mimeType, fileName: safeFileName(metadata.filename || `source.${mimeType === "application/pdf" ? "pdf" : mimeType.split("/")[1]}`) };
}

async function startIntake(admin: ReturnType<typeof createClient>, phone: string, memberId: string, mediaId: string, originalName: string){
  const { bytes, mimeType, fileName } = await downloadMedia(mediaId);
  const { data: previousSession, error: previousError } = await admin.from("whatsapp_intake_sessions").select("file_path").eq("phone_e164", phone).maybeSingle();
  if (previousError) throw previousError;
  const storagePath = `whatsapp/${memberId}/${Date.now()}_${fileName}`;
  const { error: uploadError } = await admin.storage.from("sources").upload(storagePath, bytes, { contentType: mimeType, upsert: false });
  if (uploadError) throw uploadError;
  const { error: sessionError } = await admin.from("whatsapp_intake_sessions").upsert({
    phone_e164: phone,
    member_id: memberId,
    step: "kin",
    payload: {},
    file_path: storagePath,
    file_name: fileName || safeFileName(originalName),
    mime_type: mimeType,
    updated_at: new Date().toISOString(),
  }, { onConflict: "phone_e164" });
  if (sessionError) {
    await admin.storage.from("sources").remove([storagePath]);
    throw sessionError;
  }
  if (previousSession?.file_path) await admin.storage.from("sources").remove([previousSession.file_path]);
  await sendWhatsAppText(phone, "Source received. Which intelligence need does it support? Reply with KIN1, KIN2, or KIN3.");
}

async function setSession(admin: ReturnType<typeof createClient>, session: Record<string, any>, step: string, payload: Record<string, any>){
  const { error } = await admin.from("whatsapp_intake_sessions").update({ step, payload, updated_at: new Date().toISOString() }).eq("phone_e164", session.phone_e164);
  if (error) throw error;
}

async function handleIntakeText(admin: ReturnType<typeof createClient>, phone: string, memberId: string, messageText: string){
  const text = messageText.trim();
  const { data: session, error } = await admin.from("whatsapp_intake_sessions").select("*").eq("phone_e164", phone).maybeSingle();
  if (error) throw error;
  if (!session || session.member_id !== memberId) {
    await sendWhatsAppText(phone, "To add a source, send a PDF or image first. I’ll ask for its KIN, KIQ, source, author, type, publication date, and relevance.");
    return;
  }
  const { data: member, error: memberError } = await admin.from("members")
    .select("name,user_id,approved,profile_completed,bio")
    .eq("id", memberId)
    .maybeSingle();
  if (memberError) throw memberError;
  if (!member?.approved || !member.profile_completed || !member.name?.trim() || !member.bio?.trim()) {
    if (session.file_path) await admin.storage.from("sources").remove([session.file_path]);
    await admin.from("whatsapp_intake_sessions").delete().eq("phone_e164", phone);
    await sendWhatsAppText(phone, "Workspace access for this profile is pending. Contact an admin before submitting sources.");
    return;
  }

  const payload = session.payload || {};
  if (session.step === "kin") {
    const kinId = text.toUpperCase();
    const kin = INTELLIGENCE_NEEDS.find(item => item.id === kinId);
    if (!kin) {
      await sendWhatsAppText(phone, "Reply with KIN1, KIN2, or KIN3.");
      return;
    }
    payload.kin = kinId;
    await setSession(admin, session, "kiq", payload);
    await sendWhatsAppText(phone, `Which question does the source answer? Reply with ${kin.questions.join(", ")}.`);
    return;
  }

  if (session.step === "kiq") {
    const kiqId = text.toUpperCase();
    const kin = INTELLIGENCE_NEEDS.find(item => item.id === payload.kin);
    if (!kin?.questions.includes(kiqId)) {
      await sendWhatsAppText(phone, `Reply with one of these questions: ${kin?.questions.join(", ") || "KIQ1, KIQ2, KIQ3"}.`);
      return;
    }
    payload.kiq = kiqId;
    await setSession(admin, session, "source", payload);
    await sendWhatsAppText(phone, "What is the source title or publication name?");
    return;
  }

  if (session.step === "source") {
    payload.source = text.slice(0, 200);
    await setSession(admin, session, "author", payload);
    await sendWhatsAppText(phone, "Who is the author or publishing organisation?");
    return;
  }

  if (session.step === "author") {
    payload.author = text.slice(0, 200);
    await setSession(admin, session, "source_type", payload);
    await sendWhatsAppText(phone, `Choose the source type: ${SOURCE_TYPES.join("; ")}.`);
    return;
  }

  if (session.step === "source_type") {
    const sourceType = SOURCE_TYPES.find(item => item.toLowerCase() === text.toLowerCase());
    if (!sourceType) {
      await sendWhatsAppText(phone, `Reply with one of these types: ${SOURCE_TYPES.join("; ")}.`);
      return;
    }
    payload.source_type = sourceType;
    await setSession(admin, session, "date_published", payload);
    await sendWhatsAppText(phone, "What is the publication date? Reply YYYY-MM-DD, or SKIP if unknown.");
    return;
  }

  if (session.step === "date_published") {
    if (text.toUpperCase() !== "SKIP") {
      const date = new Date(`${text}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
        await sendWhatsAppText(phone, "Use YYYY-MM-DD (for example 2026-04-15), or reply SKIP.");
        return;
      }
      payload.date_published = text;
    }
    await setSession(admin, session, "relevance", payload);
    await sendWhatsAppText(phone, "In one or two sentences, explain why this source is relevant to the selected question.");
    return;
  }

  if (session.step === "relevance") {
    if (text.length < 10) {
      await sendWhatsAppText(phone, "Please add a little more detail about why the source matters (at least 10 characters).");
      return;
    }
    const fileName = `NEUROBAND_${payload.kin}_${payload.kiq}_${payload.source_type.replace(/[^a-zA-Z0-9]+/g, "")}_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${session.file_name}`;
    let actorEmail: string | null = null;
    if (member.user_id) {
      const { data: authRecord } = await admin.auth.admin.getUserById(member.user_id);
      actorEmail = authRecord?.user?.email || null;
    }
    const record = {
      kin: payload.kin,
      kiq: payload.kiq,
      source: payload.source,
      author: payload.author,
      added_by: member.name,
      added_by_email: actorEmail,
      added_by_user_id: member.user_id,
      source_type: payload.source_type,
      date_published: payload.date_published || null,
      date_collected: new Date().toISOString().slice(0, 10),
      relevance: text.slice(0, 2000),
      file_path: session.file_path,
      file_name: fileName,
      created_at: new Date().toISOString(),
    };
    const { error: insertError } = await admin.from("entries").insert(record);
    if (insertError) throw insertError;
    await recordActivity(admin, {
      email: actorEmail,
      name: member.name,
      userId: member.user_id,
    }, "added a source", `${record.source} (${record.kin}_${record.kiq})`);
    await admin.from("whatsapp_intake_sessions").delete().eq("phone_e164", phone);
    await sendWhatsAppText(phone, `Saved to the Repository: ${record.source} (${record.kin}_${record.kiq}).`);
    return;
  }

  await admin.from("whatsapp_intake_sessions").delete().eq("phone_e164", phone);
  await sendWhatsAppText(phone, "The source intake expired. Send the PDF or image again to restart.");
}

async function processMessage(admin: ReturnType<typeof createClient>, message: Record<string, any>){
  const phone = normalizePhone(String(message.from || ""));
  if (!phone) return;
  const text = String(message.text?.body || "").trim();
  const connectMatch = text.match(/^CONNECT\s+([A-Z2-9]{10})$/i);
  if (connectMatch) {
    await linkPhone(admin, phone, connectMatch[1]);
    return;
  }

  const { data: link, error: linkError } = await admin.from("member_whatsapp")
    .select("member_id,opted_in_at")
    .eq("phone_e164", phone)
    .maybeSingle();
  if (linkError) throw linkError;
  if (!link?.member_id || !link.opted_in_at) {
    await sendWhatsAppText(phone, "To use Neuroband WhatsApp, sign in to the hub, connect your number in the Team tab, then send the one-time code shown there.");
    return;
  }

  if (text.toUpperCase() === "CANCEL") {
    const { data: session } = await admin.from("whatsapp_intake_sessions").select("file_path").eq("phone_e164", phone).maybeSingle();
    if (session?.file_path) await admin.storage.from("sources").remove([session.file_path]);
    await admin.from("whatsapp_intake_sessions").delete().eq("phone_e164", phone);
    await sendWhatsAppText(phone, "Source intake cancelled. Send a PDF or image whenever you’re ready to start again.");
    return;
  }

  const { data: member, error: memberError } = await admin.from("members")
    .select("approved,profile_completed,bio")
    .eq("id", link.member_id)
    .maybeSingle();
  if (memberError) throw memberError;
  if (!member?.approved || !member.profile_completed || !member.bio?.trim()) {
    const { data: session } = await admin.from("whatsapp_intake_sessions").select("file_path").eq("phone_e164", phone).maybeSingle();
    if (session?.file_path) await admin.storage.from("sources").remove([session.file_path]);
    await admin.from("whatsapp_intake_sessions").delete().eq("phone_e164", phone);
    await sendWhatsAppText(phone, "Workspace access for this profile is pending. Contact an admin before submitting sources.");
    return;
  }

  const media = message.type === "document" ? message.document : message.type === "image" ? message.image : null;
  if (media?.id) {
    try {
      await startIntake(admin, phone, link.member_id, String(media.id), String(media.filename || "source"));
    } catch (error) {
      console.error("WhatsApp source upload failed:", error);
      await sendWhatsAppText(phone, "I couldn’t accept that file. Send a PDF, JPEG, PNG, or WebP under 20 MB, then try again.");
    }
    return;
  }
  if (message.type !== "text" && message.type !== "button" && message.type !== "interactive") {
    await sendWhatsAppText(phone, "This source intake accepts PDF, JPEG, PNG, and WebP files under 20 MB. Send one of those file types to begin.");
    return;
  }
  if (text) await handleIntakeText(admin, phone, link.member_id, text);
}

Deno.serve(async request => {
  const url = new URL(request.url);
  if (request.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === Deno.env.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN") && challenge) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("Forbidden", { status: 403 });
  }
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const body = await request.text();
  try {
    if (!await validSignature(body, request.headers.get("x-hub-signature-256"))) return new Response("Forbidden", { status: 403 });
    const payload = JSON.parse(body);
    const admin = serviceClient();
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        for (const message of change.value?.messages || []) {
          await processMessage(admin, message);
        }
      }
    }
    return new Response("EVENT_RECEIVED", { status: 200 });
  } catch (error) {
    console.error("WhatsApp webhook processing failed:", error);
    return new Response("Webhook processing failed", { status: 500 });
  }
});
