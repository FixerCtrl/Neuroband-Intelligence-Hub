// ============================================================
// NEUROBAND INTELLIGENCE HUB — APP LOGIC
// You shouldn't need to edit this file. All your group's
// content lives in config.js and in the data you add through
// the UI itself.
// ============================================================

const DEFAULT_DOCS = {
  collection_plan: `SOURCES
Where we are collecting from, and why:
- [ ] Academic databases (e.g. Google Scholar, your library's databases) — for peer-reviewed context on wearable/neurotech adoption and market theory.
- [ ] Industry & market sources (analyst reports, company newsrooms, trade press) — for current competitor moves and pricing.
- [ ] News & business media — for timely developments and funding/regulatory news.

SEARCH STRATEGY
Keywords / phrases: [list the terms your group is searching, e.g. "Neuroband", "wearable neurotech pricing", "EEG headband market"]
Databases / platforms: [Google Scholar, Statista, company websites, LinkedIn, industry newsletters, etc.]

INCLUSION CRITERIA
- Published within the last [X] years
- Directly addresses one or more of our KIQs
- From a credible, identifiable source

EXCLUSION CRITERIA
- Opinion pieces with no sourcing
- Content older than [X] years unless historically relevant
- Duplicate coverage of the same story with no new information

RESPONSIBILITIES
[Name] — KIN1 sources
[Name] — KIN2 sources
[Name] — KIN3 sources

Edit this block directly — it's saved to your Supabase project as soon as you hit Save.`,

  manual: `DATA STORAGE
- Store each source as a separate entry in the Repository tab.
- Complete all required fields: Source, Author, Date, Type of Source, and Relevance to KIQ.
- Select the related KIN and KIQ.
- Upload the original extract file directly as a PDF or image. Do not add a link instead.

DATA RETRIEVAL
- Search by source, author, or notes using the Repository search bar.
- Combine filters for KIN, KIQ, and Source Type.
- Example: select KIN2 and News article to narrow the results.
- Select an entry card to view the full record and download the original file.

CONSISTENCY
- Use the KIN and KIQ dropdowns generated from config.js.
- Use the predefined Source Type options for consistent tagging.
- The system generates the file name automatically during upload.
- Review the generated file name before saving.

FILE NAMING CONVENTION
NEUROBAND_[KIN]_[KIQ]_[SourceType]_[YYYYMMDD]_[ShortSourceName]_[UniqueID].[ext]
Example: NEUROBAND_KIN2_KIQ1_NewsArticle_20240312_BusinessInsiderAfrica_a1b2c3d4.pdf

SYSTEM UPDATE RULES
- Do not delete sources that have been discussed in meetings.
- If a source becomes irrelevant, update Relevance to explain why.
- Add only sources that meet the inclusion criteria in the Collection Plan tab.
- Update config.js as a group so KIN and KIQ tags remain consistent.

Edit this page when the process changes. Changes are saved after selecting Save changes.`
};

let sbClient = null;
let currentEntries = [];
let currentEntriesLoadError = null;
let entryUploadToken = "";
let currentMembers = [];
let memberLoadError = null;
let currentTasks = [];
let currentTaskComments = [];
let taskCommentsUnavailable = false;
let currentTaskView = "mine";
let currentUser = null;
let currentActivity = [];
let activityLoadError = null;
let calendarCurrentDate = new Date();
let myWorkFilter = "all";
let whatsappLinkPoll = null;

function safeId(id){
  const el = document.getElementById(id);
  if (!el) console.warn(`Missing DOM element: #${id}`);
  return el;
}

// ---------- INIT ----------
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initSupabase();
  initAuth();
  renderOverview();
  renderAnalysis();
  wireNav();
  wireMobileSidebar();
  wireDocBlocks();
  wireFilters();
  wireModal();
  wireMemberModal();
  wireTaskModal();
  wireTaskViews();
  wireAuthModal();
  wireSiteGuide();
  wireNotifications();
  wireWhatsAppSettings();
  wireActivityFilters();
  populateFormDropdowns();
  loadDocument("collection_plan");
  loadDocument("manual");
  loadEntries();
  loadMembers();
  loadTasks();
  loadActivity();
  wireMyWorkDashboard();
  initRealtime();
  setInterval(updateMyPresence, 120000);
});

// ============================================================
// AUTH
// ============================================================
function isAdminEmail(email){
  return !!email && ADMIN_EMAILS.map(e => e.toLowerCase()).includes(email.toLowerCase());
}

function canManageLeadership(){
  return !!currentUser && isAdminEmail(currentUser.email);
}

function canFinalSay(){
  return canManageLeadership();
}

function isMemberProfileComplete(member = myMemberProfile()){
  return !!member && !!member.name?.trim() && !!member.bio?.trim();
}

function canAccessWorkspace(){
  const member = myMemberProfile();
  return !!currentUser && (canManageLeadership()
    || (!memberLoadError
      && isMemberProfileComplete(member)
      && member.profile_completed === true
      && member.approved === true));
}

function updateWorkspaceGate(){
  const gate = document.getElementById("workspace-gate");
  if (!gate) return;
  const member = myMemberProfile();
  const profileComplete = isMemberProfileComplete(member) && member.profile_completed === true;
  const hasAccess = !!currentUser && (canManageLeadership()
    || (!memberLoadError && profileComplete && member.approved === true));
  const blocked = !!currentUser && !hasAccess;
  const profileModal = document.getElementById("member-modal-overlay");
  const editingOwnProfile = !!profileModal && !profileModal.classList.contains("is-hidden") && !memberEditorTargetId;
  gate.classList.toggle("is-hidden", !blocked || editingOwnProfile);
  document.querySelector(".shell")?.toggleAttribute("inert", blocked && !editingOwnProfile);
  if (!currentUser || hasAccess || editingOwnProfile) return;

  const title = document.getElementById("workspace-gate-title");
  const message = document.getElementById("workspace-gate-message");
  const profileButton = document.getElementById("workspace-gate-profile");
  if (memberLoadError) {
    title.textContent = "Profile setup needs an update";
    message.textContent = "The member profile status could not be loaded. Ask an admin to run the latest schema.sql, then retry.";
    profileButton.textContent = "Retry profile check";
  } else if (!profileComplete) {
    title.textContent = "Complete your profile";
    message.textContent = "Add your name and a short bio before continuing. Profile photos are optional.";
    profileButton.textContent = "Complete profile";
  } else {
    title.textContent = "Awaiting admin approval";
    message.textContent = "Your profile is complete. An admin must approve your account before you can access the workspace.";
    profileButton.textContent = "Edit profile";
  }
}

async function loadApprovedWorkspace(){
  updateWorkspaceGate();
  if (!canAccessWorkspace()) {
    currentEntries = [];
    currentEntriesLoadError = null;
    currentTasks = [];
    currentTaskComments = [];
    currentActivity = [];
    activityLoadError = null;
    renderOverview();
    renderAnalysis();
    renderEntries();
    renderTasks();
    renderActivity();
    return;
  }
  await Promise.all([
    loadDocument("collection_plan"),
    loadDocument("manual"),
    loadEntries(),
    loadTasks(),
    loadActivity(),
  ]);
}

async function initAuth(){
  if (!sbClient) { renderAuthBox(); return; }

  const { data: { session } } = await sbClient.auth.getSession();
  currentUser = session ? session.user : null;
  if (!currentUser) {
    window.location.replace("landing.html");
    return;
  }
  await ensureMyProfile();
  await loadMembers();
  await loadApprovedWorkspace();
  renderAuthBox();

  sbClient.auth.onAuthStateChange(async (event, session) => {
    currentUser = session ? session.user : null;
    if (currentUser) {
      await ensureMyProfile(event === "SIGNED_IN");
      await loadMembers();
    } else {
      currentMembers = [];
      refreshIdentityUI();
      await loadApprovedWorkspace();
      window.location.replace("landing.html");
      return;
    }
    refreshIdentityUI();
    await loadApprovedWorkspace();
  });
}

// Update every identity-dependent view immediately after authentication changes.
// The auth state event is useful as a fallback, but it is not guaranteed to run
// before the sign-in form needs to reflect the newly authenticated user.
function refreshIdentityUI(){
  renderAuthBox();
  renderMembers();   // re-show/hide admin-only controls and refresh the profile card
  renderEntries();
  renderActivity();
  renderTasks();
  renderNotifications();
  updateWorkspaceGate();
  loadWhatsAppSettings();
}

function renderAuthBox(){
  const box = safeId("auth-box");
  if (!box) return;

  if (!currentUser) {
    box.innerHTML = `<button class="btn btn-ghost btn-small" id="open-auth" style="width:100%;">Sign in</button>`;
    const signInBtn = safeId("open-auth");
    if (signInBtn) signInBtn.addEventListener("click", openAuthModal);
    return;
  }
  const admin = isAdminEmail(currentUser.email);
  const mine = myMemberProfile();
  const avatarUrl = mine ? getPublicAvatarUrl(mine.avatar_path) : null;
  const displayName = mine ? mine.name : currentUser.email;
  box.innerHTML = `
    <div class="auth-signed-in">
      <div class="auth-identity-row">
        <button type="button" class="auth-mini-avatar" id="auth-profile-avatar" aria-label="Edit your profile and profile picture" title="Edit profile">
          ${avatarUrl ? `<img src="${avatarUrl}" alt="" />` : initials(mine ? mine.name : currentUser.email.split("@")[0])}
        </button>
        <div class="auth-identity-text">
          ${admin ? `<span class="auth-admin-badge">ADMIN</span>` : ""}
          <span class="auth-email">${escapeHtml(displayName)}</span>
        </div>
      </div>
      <button class="btn btn-ghost btn-small" id="sign-out-btn">Sign out</button>
    </div>
  `;
  document.getElementById("sign-out-btn").addEventListener("click", async () => {
    await sbClient.auth.signOut();
  });
  document.getElementById("auth-profile-avatar").addEventListener("click", () => {
    activateTab("team");
    openOwnProfileEditor();
  });
}

function wireWhatsAppSettings(){
  const connect = safeId("whatsapp-connect");
  const disconnect = safeId("whatsapp-disconnect");
  if (!connect || !disconnect) return;

  connect.addEventListener("click", async () => {
    if (!requireAuth()) return;
    const businessNumber = typeof WHATSAPP_BUSINESS_NUMBER === "string" ? WHATSAPP_BUSINESS_NUMBER.trim() : "";
    if (!businessNumber) {
      safeId("whatsapp-settings-status").textContent = "The WhatsApp Business number has not been configured yet.";
      return;
    }
    connect.disabled = true;
    safeId("whatsapp-settings-status").textContent = "Generating a secure link code…";
    try {
      const { data, error } = await sbClient.functions.invoke("whatsapp-link-code", { body: {} });
      if (error) throw error;
      const number = businessNumber.replace(/\D/g, "");
      const phrase = `CONNECT ${data.code}`;
      const instructions = safeId("whatsapp-link-instructions");
      instructions.textContent = `Send ${phrase} to ${businessNumber} on WhatsApp within 10 minutes. Sending the code links your number and opts you in to brief task-assignment alerts. Disconnect any time.`;
      instructions.classList.remove("is-hidden");
      const link = safeId("whatsapp-open-link");
      link.href = `https://wa.me/${number}?text=${encodeURIComponent(phrase)}`;
      link.classList.remove("is-hidden");
      safeId("whatsapp-settings-status").textContent = "Finish linking from your WhatsApp account:";
      await logActivity("started WhatsApp linking");
      if (whatsappLinkPoll) clearInterval(whatsappLinkPoll);
      const expiresAt = Date.now() + 10 * 60 * 1000;
      whatsappLinkPoll = setInterval(async () => {
        const connected = await loadWhatsAppSettings();
        if (connected || Date.now() >= expiresAt) {
          clearInterval(whatsappLinkPoll);
          whatsappLinkPoll = null;
          if (!connected) safeId("whatsapp-settings-status").textContent = "The link code expired. Generate a new one to try again.";
        }
      }, 10000);
    } catch (error) {
      console.error("Could not create WhatsApp link code:", error);
      safeId("whatsapp-settings-status").textContent = "WhatsApp linking is not available yet. Check that the Edge Functions and database setup are deployed.";
    } finally {
      connect.disabled = false;
    }
  });

  disconnect.addEventListener("click", async () => {
    if (!requireAuth()) return;
    disconnect.disabled = true;
    try {
      const { error } = await sbClient.functions.invoke("whatsapp-disconnect", { body: {} });
      if (error) throw error;
      if (whatsappLinkPoll) clearInterval(whatsappLinkPoll);
      whatsappLinkPoll = null;
      safeId("whatsapp-link-instructions").classList.add("is-hidden");
      safeId("whatsapp-open-link").classList.add("is-hidden");
      await loadWhatsAppSettings();
    } catch (error) {
      console.error("Could not disconnect WhatsApp:", error);
      safeId("whatsapp-settings-status").textContent = "Could not disconnect WhatsApp. Please try again.";
    } finally {
      disconnect.disabled = false;
    }
  });
}

async function loadWhatsAppSettings(){
  const panel = safeId("whatsapp-settings");
  const status = safeId("whatsapp-settings-status");
  const connect = safeId("whatsapp-connect");
  const disconnect = safeId("whatsapp-disconnect");
  if (!panel || !status || !connect || !disconnect) return false;
  if (!currentUser || !sbClient) {
    panel.classList.add("is-hidden");
    return false;
  }

  panel.classList.remove("is-hidden");
  const mine = myMemberProfile();
  if (!mine) {
    status.textContent = "Add your profile to the Team roster before connecting WhatsApp.";
    connect.disabled = true;
    disconnect.classList.add("is-hidden");
    return false;
  }

  connect.disabled = false;
  const { data, error } = await sbClient.from("member_whatsapp")
    .select("phone_e164,opted_in_at")
    .eq("member_id", mine.id)
    .maybeSingle();
  if (error) {
    status.textContent = "WhatsApp settings are unavailable. Run the latest database setup and deploy the Edge Functions.";
    disconnect.classList.add("is-hidden");
    return false;
  }
  if (data?.phone_e164 && data.opted_in_at) {
    status.textContent = `Connected to ${data.phone_e164}. Brief task-assignment alerts are enabled; source files can be sent in WhatsApp.`;
    connect.classList.add("is-hidden");
    disconnect.classList.remove("is-hidden");
    safeId("whatsapp-link-instructions").classList.add("is-hidden");
    safeId("whatsapp-open-link").classList.add("is-hidden");
    return true;
  }

  status.textContent = "Connect your number to receive brief task alerts and submit PDF/image sources by chat.";
  connect.textContent = "Connect WhatsApp";
  connect.classList.remove("is-hidden");
  disconnect.classList.add("is-hidden");
  return false;
}

function wireNotifications(){
  const toggle = safeId("notification-toggle");
  const markRead = safeId("notification-mark-read");
  if (!toggle || !markRead) return;
  toggle.addEventListener("click", () => {
    const panel = safeId("notification-panel");
    if (panel) panel.classList.toggle("is-hidden");
    renderNotifications();
  });
  markRead.addEventListener("click", () => {
    localStorage.setItem(notificationSeenStorageKey(), new Date().toISOString());
    renderNotifications();
  });
}

function notificationSeenStorageKey(){
  return currentUser ? `nb-notifications-seen-${currentUser.id}` : "nb-notifications-seen";
}

function notificationDateKey(isoString){
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "unknown";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function notificationDateLabel(isoString){
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function renderNotifications(){
  const list = safeId("notification-list");
  const count = safeId("notification-count");
  if (!list || !count) return;
  const seenAt = new Date(localStorage.getItem(notificationSeenStorageKey()) || 0).getTime();
  const mine = myMemberProfile();
  const taskAssignments = currentTasks
    .filter(task => currentUser && mine && task.assigned_to === mine.id && task.assigned_by !== mine.id)
    .map(task => ({ ...task, action: "New task assigned", details: task.title }));
  const taskNotifications = currentTaskComments
    .filter(comment => {
      const task = currentTasks.find(item => String(item.id) === String(comment.task_id));
      return currentUser && mine && comment.author_id !== mine.id && task && (task.assigned_to === mine.id || task.assigned_by === mine.id);
    })
    .map(comment => {
      const task = currentTasks.find(item => String(item.id) === String(comment.task_id));
      return { ...comment, action: `Comment on ${task ? task.title : "assigned task"}`, details: comment.body };
    });
  const importantActivity = currentActivity.filter(activity => isImportantActivityForMember(activity, mine));
  const notifications = [...importantActivity, ...taskAssignments, ...taskNotifications]
    .filter(item => Number.isFinite(new Date(item.created_at).getTime()) && new Date(item.created_at).getTime() > seenAt)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const recent = notifications.slice(0, 8);
  const unread = notifications.length;
  count.textContent = unread > 9 ? "9+" : String(unread);
  count.classList.toggle("is-hidden", unread === 0);
  if (!recent.length) {
    list.innerHTML = `<p class="notification-empty">You're all caught up. Full history is available in Activity.</p>`;
    return;
  }

  const groups = recent.reduce((grouped, item) => {
    const key = notificationDateKey(item.created_at);
    if (!grouped[key]) grouped[key] = { label: notificationDateLabel(item.created_at), items: [] };
    grouped[key].items.push(item);
    return grouped;
  }, {});

  list.innerHTML = Object.values(groups).map(group => `
    <section class="notification-group">
      <h3 class="notification-date">${escapeHtml(group.label)}</h3>
      ${group.items.map(item => {
        const isUnread = new Date(item.created_at).getTime() > seenAt;
        return `
          <div class="notification-item${isUnread ? " is-unread" : ""}">
            <strong>${escapeHtml(item.action)}</strong>
            ${item.details ? `<span>${escapeHtml(item.details)}</span>` : ""}
            <small>${relativeTime(item.created_at)}</small>
          </div>
        `;
      }).join("")}
    </section>
  `).join("");
}

function isImportantActivityForMember(activity, mine){
  if (!currentUser || !mine || activity.actor_email === currentUser.email) return false;
  const action = activity.action || "";
  const details = activity.details || "";
  if (action === "reassigned a task") return details.includes(`to ${mine.name}`);
  if (action === "changed task status") {
    const match = details.match(/^"(.+)" → /);
    return !!match && currentTasks.some(task => task.title === match[1] && (task.assigned_to === mine.id || task.assigned_by === mine.id));
  }
  return [
    "deleted a task",
    "removed a team member",
    "updated the Collection Plan",
    "updated the Manual",
  ].includes(action);
}

// Call this at the top of anything that writes to the database.
// Returns true if the user may proceed; otherwise opens the
// sign-in modal and returns false.
function requireAuth(){
  if (!currentUser) {
    openAuthModal();
    return false;
  }
  if (!canAccessWorkspace()) {
    updateWorkspaceGate();
    return false;
  }
  return true;
}

let authMode = "signin"; // or "signup"

function wireAuthModal(){
  document.getElementById("open-auth")?.addEventListener("click", openAuthModal);
  document.getElementById("google-sign-in").addEventListener("click", signInWithGoogle);
  document.getElementById("close-auth").addEventListener("click", closeAuthModal);
  document.getElementById("auth-modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "auth-modal-overlay") closeAuthModal();
  });
  document.getElementById("workspace-gate-profile").addEventListener("click", async () => {
    if (memberLoadError) {
      await loadMembers();
      await loadApprovedWorkspace();
      return;
    }
    document.getElementById("workspace-gate").classList.add("is-hidden");
    activateTab("team");
    openOwnProfileEditor();
  });
  document.getElementById("workspace-gate-signout").addEventListener("click", async () => {
    if (sbClient) await sbClient.auth.signOut();
  });
  document.getElementById("auth-toggle-mode").addEventListener("click", () => {
    authMode = authMode === "signin" ? "signup" : "signin";
    updateAuthModalMode();
  });
  document.getElementById("auth-form").addEventListener("submit", submitAuth);
}

async function signInWithGoogle(){
  const status = document.getElementById("auth-form-status");
  if (!sbClient) {
    status.textContent = "Not connected to Supabase yet.";
    status.className = "form-status is-error";
    return;
  }
  status.textContent = "Redirecting to Google…";
  status.className = "form-status";
  const { error } = await sbClient.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
  });
  if (error) {
    status.textContent = error.message || "Could not start Google sign-in.";
    status.className = "form-status is-error";
  }
}

function updateAuthModalMode(){
  document.getElementById("auth-modal-title").textContent = authMode === "signin" ? "Sign in" : "Create an account";
  document.getElementById("submit-auth").textContent = authMode === "signin" ? "Sign in" : "Sign up";
  document.getElementById("auth-toggle-mode").textContent = authMode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in";
}

function openAuthModal(){
  authMode = "signin";
  updateAuthModalMode();
  document.getElementById("auth-form-status").textContent = "";
  document.getElementById("auth-modal-overlay").classList.remove("is-hidden");
}

function closeAuthModal(){
  document.getElementById("auth-modal-overlay").classList.add("is-hidden");
  document.getElementById("auth-form").reset();
}

async function submitAuth(e){
  e.preventDefault();
  const status = document.getElementById("auth-form-status");
  if (!sbClient) { status.textContent = "Not connected to Supabase yet."; status.className = "form-status is-error"; return; }

  const email = document.getElementById("auth-email").value;
  const password = document.getElementById("auth-password").value;
  status.textContent = authMode === "signin" ? "Signing in…" : "Creating account…";
  status.className = "form-status";

  try {
    if (authMode === "signin") {
      const { data, error } = await sbClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      currentUser = data.user;
      refreshIdentityUI();
      status.textContent = "Signed in.";
      status.className = "form-status is-success";
      setTimeout(closeAuthModal, 400);
    } else {
      const { data, error } = await sbClient.auth.signUp({ email, password });
      if (error) throw error;
      if (data.session) {
        currentUser = data.user;
        refreshIdentityUI();
        status.textContent = "Account created and signed in.";
        status.className = "form-status is-success";
        setTimeout(closeAuthModal, 400);
      } else {
        status.textContent = "Account created. Check your email to confirm before signing in.";
        status.className = "form-status is-success";
      }
    }
  } catch (err) {
    console.error(err);
    status.textContent = err.message || "Something went wrong.";
    status.className = "form-status is-error";
  }
}

let siteGuideMessages = [];

function wireSiteGuide(){
  const toggle = document.getElementById("site-guide-toggle");
  const panel = document.getElementById("site-guide-panel");
  const close = document.getElementById("site-guide-close");
  const form = document.getElementById("site-guide-form");
  toggle.addEventListener("click", () => {
    if (!requireAuth()) return;
    const opening = panel.classList.contains("is-hidden");
    panel.classList.toggle("is-hidden", !opening);
    panel.setAttribute("aria-hidden", String(!opening));
    toggle.setAttribute("aria-expanded", String(opening));
    if (opening) document.getElementById("site-guide-input").focus();
  });
  close.addEventListener("click", () => {
    panel.classList.add("is-hidden");
    panel.setAttribute("aria-hidden", "true");
    toggle.setAttribute("aria-expanded", "false");
    toggle.focus();
  });
  form.addEventListener("submit", sendSiteGuideMessage);
}

function appendSiteGuideMessage(role, content){
  const messages = document.getElementById("site-guide-messages");
  const message = document.createElement("p");
  message.className = `site-guide-message is-${role}`;
  message.textContent = content;
  messages.appendChild(message);
  messages.scrollTop = messages.scrollHeight;
}

async function sendSiteGuideMessage(event){
  event.preventDefault();
  if (!requireAuth()) return;
  const input = document.getElementById("site-guide-input");
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const status = document.getElementById("site-guide-status");
  const question = input.value.trim();
  if (!question) return;

  input.value = "";
  button.disabled = true;
  status.textContent = "Thinking…";
  siteGuideMessages.push({ role: "user", content: question });
  siteGuideMessages = siteGuideMessages.slice(-8);
  appendSiteGuideMessage("user", question);

  try {
    const { data, error } = await sbClient.functions.invoke("site-guide", { body: { messages: siteGuideMessages } });
    if (error) {
      let detail = error.message || "The guide is unavailable right now.";
      if (error.context && typeof error.context.clone === "function") {
        const responseBody = await error.context.clone().json().catch(() => null);
        detail = responseBody?.error || detail;
      }
      throw new Error(detail);
    }
    if (data?.error) throw new Error(data.error);
    const reply = data?.reply || "I couldn’t form a helpful answer. Try asking about a specific page or feature.";
    siteGuideMessages.push({ role: "assistant", content: reply });
    siteGuideMessages = siteGuideMessages.slice(-8);
    appendSiteGuideMessage("assistant", reply);
    status.textContent = "";
  } catch (error) {
    const errorMessage = error.message || "";
    status.textContent = /failed to send a request to the edge function|failed to fetch|networkerror/i.test(errorMessage)
      ? "Hub Guide is not reachable yet. Ask an admin to deploy the site-guide Edge Function and configure its OPENAI_API_KEY, then refresh."
      : errorMessage || "The guide is unavailable right now.";
  } finally {
    button.disabled = false;
    input.focus();
  }
}

// ---------- THEME ----------
function initTheme(){
  const saved = localStorage.getItem("nb-theme") || "light";
  applyTheme(saved);
  const toggle = safeId("theme-toggle");
  if (!toggle) return;
  toggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    const next = current === "light" ? "dark" : "light";
    applyTheme(next);
    localStorage.setItem("nb-theme", next);
  });
}

function applyTheme(theme){
  document.documentElement.setAttribute("data-theme", theme);
  const btn = safeId("theme-toggle");
  if (!btn) return;
  btn.querySelector(".theme-icon").innerHTML = theme === "light"
    ? `<path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.6 6.6 0 0 0 21 12.8Z" />`
    : `<circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />`;
  btn.title = theme === "light" ? "Switch to dark mode" : "Switch to light mode";
}

function initSupabase(){
  const dot = safeId("conn-dot");
  const label = safeId("conn-label");
  if (!dot || !label) return;
  if (!SUPABASE_URL || SUPABASE_URL.includes("PASTE_YOUR")) {
    dot.classList.add("is-error");
    label.textContent = "Not connected — edit config.js";
    return;
  }
  try {
    sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    dot.classList.add("is-live");
    label.textContent = "Connected";
  } catch (e) {
    dot.classList.add("is-error");
    label.textContent = "Connection failed";
  }
}

// ---------- NAV ----------
function wireNav(){
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => activateTab(btn.dataset.tab));
  });
  document.getElementById("overview-metrics").addEventListener("click", event => {
    const metric = event.target.closest("[data-overview-tab]");
    if (!metric) return;
    activateTab(metric.dataset.overviewTab);
    if (metric.dataset.overviewTaskView) {
      document.querySelector(`[data-task-view="${metric.dataset.overviewTaskView}"]`)?.click();
    }
  });
}

function activateTab(tab){
  const panel = document.getElementById(`panel-${tab}`);
  if (!panel) return;
  document.querySelectorAll(".nav-item").forEach(button => button.classList.toggle("is-active", button.dataset.tab === tab));
  document.querySelectorAll(".panel").forEach(item => item.classList.toggle("is-active", item === panel));
  closeMobileSidebar();
}

function wireMobileSidebar(){
  const openButton = safeId("mobile-menu-toggle");
  const closeButton = safeId("mobile-sidebar-close");
  const scrim = safeId("sidebar-scrim");
  if (!openButton || !closeButton || !scrim) return;

  openButton.addEventListener("click", openMobileSidebar);
  closeButton.addEventListener("click", closeMobileSidebar);
  scrim.addEventListener("click", closeMobileSidebar);
}

function openMobileSidebar(){
  const sidebar = safeId("site-sidebar");
  const openButton = safeId("mobile-menu-toggle");
  const scrim = safeId("sidebar-scrim");
  if (!sidebar || !openButton || !scrim) return;
  sidebar.classList.add("is-mobile-open");
  scrim.classList.add("is-visible");
  openButton.setAttribute("aria-expanded", "true");
}

function closeMobileSidebar(){
  const sidebar = safeId("site-sidebar");
  const openButton = safeId("mobile-menu-toggle");
  const scrim = safeId("sidebar-scrim");
  if (!sidebar || !openButton || !scrim) return;
  sidebar.classList.remove("is-mobile-open");
  scrim.classList.remove("is-visible");
  openButton.setAttribute("aria-expanded", "false");
}

// ---------- OVERVIEW ----------
function renderOverview(){
  document.getElementById("kit-text").textContent = KIT;
  const metrics = document.getElementById("overview-metrics");
  const trackedQuestionKeys = new Set(KINS.flatMap(kin => kin.kiqs.map(question => `${kin.id}_${question.id}`)));
  const coveredQuestionKeys = new Set(currentEntries
    .map(entry => `${entry.kin}_${entry.kiq}`)
    .filter(key => trackedQuestionKeys.has(key)));
  const totalQuestions = trackedQuestionKeys.size;
  const openTasks = currentTasks.filter(task => task.status !== "Done").length;
  metrics.innerHTML = [
    { value: currentEntries.length, label: "Sources collected", destination: "Repository", tab: "repository" },
    { value: `${coveredQuestionKeys.size}/${totalQuestions}`, label: "KIQs with evidence", destination: "Analysis", tab: "analysis" },
    { value: openTasks, label: "Open tasks", destination: "Team", tab: "team", taskView: "all" },
  ].map(metric => `
    <button type="button" class="overview-metric" data-overview-tab="${metric.tab}" ${metric.taskView ? `data-overview-task-view="${metric.taskView}"` : ""}>
      <span class="overview-metric-top"><span>${metric.label}</span><span aria-hidden="true">↗</span></span>
      <strong>${metric.value}</strong>
      <span class="overview-metric-destination">View ${metric.destination}</span>
    </button>
  `).join("");

  const grid = document.getElementById("kin-grid");
  grid.innerHTML = "";
  KINS.forEach(kin => {
    const coveredQuestions = kin.kiqs.filter(question => currentEntries.some(entry => entry.kin === kin.id && entry.kiq === question.id)).length;
    const coveragePercent = kin.kiqs.length ? Math.round((coveredQuestions / kin.kiqs.length) * 100) : 0;
    const sourceCount = currentEntries.filter(entry => entry.kin === kin.id).length;
    const card = document.createElement("article");
    card.className = "kin-card";
    card.innerHTML = `
      <div class="kin-card-heading">
        <div class="kin-card-kicker"><span class="kin-id">${escapeHtml(kin.id)}</span><span class="kin-kind">Key Intelligence Need</span></div>
        <h2>${escapeHtml(kin.label)}</h2>
      </div>
      <div class="kin-coverage">
        <div class="kin-coverage-heading"><span>Evidence coverage</span><strong>${coveredQuestions}/${kin.kiqs.length} KIQs</strong></div>
        <div class="kin-coverage-track" role="meter" aria-label="${escapeHtml(kin.id)} question coverage" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${coveragePercent}"><span style="width:${coveragePercent}%"></span></div>
        <span class="kin-source-count">${sourceCount} ${sourceCount === 1 ? "source" : "sources"}</span>
      </div>
      <section class="kiq-section" aria-label="Key Intelligence Questions">
        <div class="kiq-section-heading"><h3>Key Intelligence Questions</h3><span class="kiq-count">${kin.kiqs.length}</span></div>
        <ol class="kiq-list">${kin.kiqs.map(q => `<li><span class="kiq-id">${escapeHtml(q.id)}</span><span class="kiq-text">${escapeHtml(q.label)}</span></li>`).join("")}</ol>
      </section>
    `;
    grid.appendChild(card);
  });
}

function renderAnalysis(){
  const summary = document.getElementById("analysis-summary");
  if (!summary) return;

  const totalEntries = currentEntries.length;
  const totalQuestions = KINS.reduce((total, kin) => total + kin.kiqs.length, 0);
  const coveredQuestions = new Set(currentEntries.map(entry => `${entry.kin}_${entry.kiq}`)).size;
  const recentEntries = currentEntries.filter(entry => {
    if (!entry.date_collected) return false;
    const collected = new Date(`${entry.date_collected}T00:00:00`);
    return (Date.now() - collected.getTime()) <= 1000 * 60 * 60 * 24 * 90;
  }).length;
  const completedTasks = currentTasks.filter(task => task.status === "Done").length;
  const taskProgress = currentTasks.length ? Math.round((completedTasks / currentTasks.length) * 100) : 0;

  summary.innerHTML = [
    analysisMetric(totalEntries, "Sources collected", "Total evidence records"),
    analysisMetric(`${coveredQuestions}/${totalQuestions}`, "Questions covered", "KIN/KIQ combinations with evidence"),
    analysisMetric(`${recentEntries}`, "Recent sources", "Collected within 90 days"),
    analysisMetric(`${taskProgress}%`, "Task progress", `${completedTasks} of ${currentTasks.length} tasks complete`),
  ].join("");

  renderAnalysisBars("analysis-kin-bars", KINS.map(kin => ({
    label: kin.id,
    value: currentEntries.filter(entry => entry.kin === kin.id).length,
  })));

  const sourceTypes = [...new Set(currentEntries.map(entry => entry.source_type).filter(Boolean))]
    .map(type => ({ label: type, value: currentEntries.filter(entry => entry.source_type === type).length }))
    .sort((a, b) => b.value - a.value);
  renderAnalysisBars("analysis-type-bars", sourceTypes.length ? sourceTypes : [{ label: "No sources yet", value: 0 }]);

  const questionList = document.getElementById("analysis-question-list");
  questionList.innerHTML = KINS.flatMap(kin => kin.kiqs.map(question => {
    const count = currentEntries.filter(entry => entry.kin === kin.id && entry.kiq === question.id).length;
    const state = count === 0 ? "Needs evidence" : count === 1 ? "Early signal" : "Supported";
    return `<div class="analysis-question"><div><strong>${kin.id}_${question.id}</strong><span>${escapeHtml(question.label)}</span></div><span class="analysis-state analysis-state-${state.toLowerCase().replace(" ", "-")}">${state} · ${count}</span></div>`;
  })).join("");

  const progressBar = document.getElementById("analysis-progress-bar");
  const progressLabel = document.getElementById("analysis-progress-label");
  progressBar.style.width = `${taskProgress}%`;
  progressLabel.textContent = currentTasks.length ? `${completedTasks} of ${currentTasks.length} assigned tasks complete` : "No tasks assigned yet.";
}

function analysisMetric(value, label, note){
  return `<div class="analysis-metric"><strong>${value}</strong><span>${label}</span><small>${note}</small></div>`;
}

function renderAnalysisBars(elementId, items){
  const container = document.getElementById(elementId);
  if (!container) return;
  const max = Math.max(...items.map(item => item.value), 1);
  container.innerHTML = items.map(item => `
    <div class="analysis-bar-row">
      <div class="analysis-bar-label"><span>${escapeHtml(item.label)}</span><strong>${item.value}</strong></div>
      <div class="analysis-bar-track"><span style="width:${Math.round((item.value / max) * 100)}%"></span></div>
    </div>
  `).join("");
}

// ---------- DOCUMENT BLOCKS (Collection Plan / Manual) ----------
function wireDocBlocks(){
  document.querySelectorAll(".doc-block").forEach(block => {
    const slug = block.dataset.slug;
    const editor = block.querySelector(".doc-edit");
    const toolbar = document.createElement("div");
    toolbar.className = "doc-toolbar is-hidden";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", `Formatting tools for ${slug === "manual" ? "System Manual" : "Collection Plan"}`);
    toolbar.innerHTML = `
      <button type="button" data-doc-command="bold" aria-label="Bold" aria-pressed="false" title="Bold"><strong>B</strong></button>
      <button type="button" data-doc-command="italic" aria-label="Italic" aria-pressed="false" title="Italic"><em>I</em></button>
      <button type="button" data-doc-command="underline" aria-label="Underline" aria-pressed="false" title="Underline"><u>U</u></button>
      <span class="doc-toolbar-divider" aria-hidden="true"></span>
      <button type="button" data-doc-command="formatBlock" data-doc-value="H2" aria-label="Heading" title="Heading">H2</button>
      <button type="button" data-doc-command="formatBlock" data-doc-value="H3" aria-label="Subheading" title="Subheading">H3</button>
      <span class="doc-toolbar-divider" aria-hidden="true"></span>
      <button type="button" data-doc-command="insertUnorderedList" aria-label="Bulleted list" title="Bulleted list">• List</button>
      <button type="button" data-doc-command="insertOrderedList" aria-label="Numbered list" title="Numbered list">1. List</button>
      <button type="button" data-doc-command="formatBlock" data-doc-value="BLOCKQUOTE" aria-label="Quote" title="Quote">Quote</button>
      <button type="button" data-doc-command="removeFormat" aria-label="Clear formatting" title="Clear formatting">Clear</button>
    `;
    block.insertBefore(toolbar, editor);

    toolbar.querySelectorAll("[data-doc-command]").forEach(button => {
      button.addEventListener("mousedown", event => event.preventDefault());
      button.addEventListener("click", () => {
        editor.focus();
        const command = button.dataset.docCommand;
        const value = button.dataset.docValue || null;
        document.execCommand(command, false, value);
        refreshDocToolbar(toolbar);
      });
    });
    editor.addEventListener("keyup", () => refreshDocToolbar(toolbar));
    editor.addEventListener("mouseup", () => refreshDocToolbar(toolbar));
    editor.addEventListener("paste", event => {
      event.preventDefault();
      document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
    });
  });

  document.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!requireAuth()) return;
      toggleEdit(btn.dataset.edit, true);
    });
  });
  document.querySelectorAll("[data-cancel]").forEach(btn => {
    btn.addEventListener("click", () => toggleEdit(btn.dataset.cancel, false));
  });
  document.querySelectorAll("[data-save]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!requireAuth()) return;
      saveDocument(btn.dataset.save);
    });
  });
}

function refreshDocToolbar(toolbar){
  toolbar.querySelectorAll('[data-doc-command="bold"], [data-doc-command="italic"], [data-doc-command="underline"]').forEach(button => {
    const pressed = document.queryCommandState(button.dataset.docCommand);
    button.classList.toggle("is-active", pressed);
    button.setAttribute("aria-pressed", String(pressed));
  });
}

const RICH_DOCUMENT_PREFIX = "<!-- neuroband-rich-text-v1 -->\n";
const SAFE_DOCUMENT_TAGS = new Set(["B", "STRONG", "I", "EM", "U", "S", "P", "DIV", "BR", "H2", "H3", "UL", "OL", "LI", "BLOCKQUOTE"]);

function sanitizeDocumentHtml(html){
  const template = document.createElement("template");
  template.innerHTML = html;
  const sanitizeElement = element => {
    if (!SAFE_DOCUMENT_TAGS.has(element.tagName)) {
      if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "SVG", "MATH"].includes(element.tagName)) {
        element.remove();
      } else {
        [...element.childNodes].forEach(sanitizeNode);
        element.replaceWith(...element.childNodes);
      }
      return;
    }
    [...element.attributes].forEach(attribute => element.removeAttribute(attribute.name));
    [...element.childNodes].forEach(sanitizeNode);
  };
  const sanitizeNode = node => {
    if (node.nodeType === Node.ELEMENT_NODE) sanitizeElement(node);
  };
  [...template.content.childNodes].forEach(sanitizeNode);
  return template.innerHTML;
}

function plainDocumentToHtml(text){
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const output = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(`<li>${escapeHtml(lines[index++].replace(/^\s*[-*]\s+/, ""))}</li>`);
      }
      output.push(`<ul>${items.join("")}</ul>`);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        items.push(`<li>${escapeHtml(lines[index++].replace(/^\s*\d+[.)]\s+/, ""))}</li>`);
      }
      output.push(`<ol>${items.join("")}</ol>`);
      continue;
    }
    if (/^[A-Z][A-Z0-9 &/()'-]{2,48}$/.test(line.trim())) output.push(`<h3>${escapeHtml(line.trim())}</h3>`);
    else output.push(`<p>${escapeHtml(line)}</p>`);
    index++;
  }
  return output.join("");
}

function documentContentToHtml(content){
  if (content.startsWith(RICH_DOCUMENT_PREFIX)) return sanitizeDocumentHtml(content.slice(RICH_DOCUMENT_PREFIX.length));
  return plainDocumentToHtml(content);
}

function toggleEdit(slug, editing){
  document.getElementById("view-" + slug).classList.toggle("is-hidden", editing);
  document.getElementById("edit-" + slug).classList.toggle("is-hidden", !editing);
  const block = document.querySelector(`.doc-block[data-slug="${slug}"]`);
  block.querySelector(".doc-toolbar").classList.toggle("is-hidden", !editing);
  block.querySelector(`[data-edit]`).classList.toggle("is-hidden", editing);
  block.querySelector(`[data-save]`).classList.toggle("is-hidden", !editing);
  block.querySelector(`[data-cancel]`).classList.toggle("is-hidden", !editing);
  if (editing) {
    document.getElementById("edit-" + slug).innerHTML = documentContentToHtml(document.getElementById("view-" + slug).dataset.raw || DEFAULT_DOCS[slug]);
    document.getElementById("edit-" + slug).focus();
  }
}

async function loadDocument(slug){
  const viewEl = document.getElementById("view-" + slug);
  let content = DEFAULT_DOCS[slug];
  if (sbClient) {
    const { data, error } = await sbClient.from("documents").select("content").eq("slug", slug).maybeSingle();
    if (!error && data) content = data.content;
  }
  viewEl.innerHTML = documentContentToHtml(content);
  viewEl.dataset.raw = content;
}

async function saveDocument(slug){
  if (!requireAuth()) return;
  const editor = document.getElementById("edit-" + slug);
  const cleanHtml = sanitizeDocumentHtml(editor.innerHTML);
  const newContent = RICH_DOCUMENT_PREFIX + cleanHtml;
  if (!sbClient) return;
  const { error } = await sbClient.from("documents").upsert({ slug, content: newContent, updated_at: new Date().toISOString() });
  if (error) {
    console.error("Document save failed:", error);
    alert("Could not save changes: " + error.message);
    return;
  }
  document.getElementById("view-" + slug).innerHTML = cleanHtml;
  document.getElementById("view-" + slug).dataset.raw = newContent;
  toggleEdit(slug, false);
}

// ---------- REPOSITORY: dropdowns ----------
function populateFormDropdowns(){
  const kinSelect = document.getElementById("f-kin");
  const filterKin = document.getElementById("filter-kin");
  KINS.forEach(kin => {
    kinSelect.appendChild(new Option(`${kin.id} — ${kin.label}`, kin.id));
    const filterOption = new Option(`${kin.id} — ${kin.label}`, kin.id);
    filterOption.dataset.filterId = kin.id;
    filterOption.dataset.filterLabel = kin.filterLabel || kin.label;
    filterKin.appendChild(filterOption);
  });
  updateKiqOptions(document.getElementById("f-kin").value, document.getElementById("f-kiq"));
  document.getElementById("f-kin").addEventListener("change", e => updateKiqOptions(e.target.value, document.getElementById("f-kiq")));

  // filter-kiq shows ALL kiqs across all kins (id + parent label) for simplicity
  const filterKiq = document.getElementById("filter-kiq");
  const seen = new Set();
  KINS.forEach(kin => kin.kiqs.forEach(q => {
    if (!seen.has(q.id)) { seen.add(q.id); filterKiq.appendChild(new Option(q.id, q.id)); }
  }));

  const typeSelect = document.getElementById("f-type");
  const filterType = document.getElementById("filter-type");
  SOURCE_TYPES.forEach(t => {
    typeSelect.appendChild(new Option(t, t));
    filterType.appendChild(new Option(t, t));
  });

  wireFilterDropdown(filterKin, "filter-kin");
  wireFilterDropdown(filterKiq, "filter-kiq");
  wireFilterDropdown(filterType, "filter-type");

  document.getElementById("f-file").addEventListener("change", updateFilenamePreview);
  ["f-kin","f-kiq","f-type","f-source","f-date-pub"].forEach(id => {
    document.getElementById(id).addEventListener("change", updateFilenamePreview);
  });
}

function wireFilterDropdown(select, idPrefix){
  const control = document.getElementById(`${idPrefix}-control`);
  const trigger = document.getElementById(`${idPrefix}-trigger`);
  const current = document.getElementById(`${idPrefix}-current`);
  const menu = document.getElementById(`${idPrefix}-menu`);
  if (!control || !trigger || !current || !menu) return;

  function renderOptions(){
    menu.innerHTML = [...select.options].map(option => {
      const filterId = option.dataset.filterId;
      const label = option.dataset.filterLabel;
      return `
        <button type="button" class="filter-dropdown-option" role="option" aria-selected="${option.value === select.value}" tabindex="-1" data-value="${escapeHtml(option.value)}">
          ${filterId ? `<strong>${escapeHtml(filterId)}</strong><span>${escapeHtml(label)}</span>` : `<span>${escapeHtml(option.textContent)}</span>`}
        </button>
      `;
    }).join("");
  }
  renderOptions();

  function updateCurrent(){
    const option = select.options[select.selectedIndex];
    current.innerHTML = option.dataset.filterId
      ? `<strong>${escapeHtml(option.dataset.filterId)}</strong><span>${escapeHtml(option.dataset.filterLabel)}</span>`
      : escapeHtml(option.textContent);
    menu.querySelectorAll("[role=option]").forEach(option => {
      option.setAttribute("aria-selected", String(option.dataset.value === select.value));
    });
  }

  function setMenuOpen(open, focusSelected = false){
    menu.classList.toggle("is-hidden", !open);
    trigger.setAttribute("aria-expanded", String(open));
    if (open && focusSelected) {
      const selected = menu.querySelector('[aria-selected="true"]') || menu.querySelector("[role=option]");
      if (selected) selected.focus();
    }
  }

  trigger.addEventListener("click", () => setMenuOpen(menu.classList.contains("is-hidden"), true));
  trigger.addEventListener("keydown", event => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      setMenuOpen(true, true);
    }
  });
  menu.addEventListener("click", event => {
    const option = event.target.closest("[role=option]");
    if (!option) return;
    select.value = option.dataset.value;
    updateCurrent();
    select.dispatchEvent(new Event("change", { bubbles: true }));
    setMenuOpen(false);
    trigger.focus();
  });
  menu.addEventListener("keydown", event => {
    const options = [...menu.querySelectorAll("[role=option]")];
    const index = options.indexOf(document.activeElement);
    let nextIndex = index;
    if (event.key === "ArrowDown") nextIndex = Math.min(index + 1, options.length - 1);
    else if (event.key === "ArrowUp") nextIndex = Math.max(index - 1, 0);
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = options.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      setMenuOpen(false);
      trigger.focus();
      return;
    } else return;
    event.preventDefault();
    options[nextIndex].focus();
  });
  document.addEventListener("click", event => {
    if (!control.contains(event.target)) setMenuOpen(false);
  });
  return () => {
    renderOptions();
    updateCurrent();
  };
}

function updateKiqOptions(kinId, selectEl){
  selectEl.innerHTML = "";
  const kin = KINS.find(k => k.id === kinId);
  (kin ? kin.kiqs : []).forEach(q => selectEl.appendChild(new Option(`${q.id} — ${q.label}`, q.id)));
  updateFilenamePreview();
}

function slugifySource(str){
  return (str || "source").replace(/[^a-zA-Z0-9]+/g, "").slice(0, 30) || "source";
}

function buildFileName(){
  const kin = document.getElementById("f-kin").value || "KIN";
  const kiq = document.getElementById("f-kiq").value || "KIQ";
  const type = (document.getElementById("f-type").value || "Source").replace(/[^a-zA-Z0-9]+/g, "");
  const dateStr = (document.getElementById("f-date-pub").value || "").replace(/-/g, "") || "00000000";
  const source = slugifySource(document.getElementById("f-source").value);
  const fileInput = document.getElementById("f-file");
  const ext = fileInput.files[0] ? "." + fileInput.files[0].name.split(".").pop() : "";
  return `${PROJECT_TAG}_${kin}_${kiq}_${type}_${dateStr}_${source}_${entryUploadToken}${ext}`;
}

function updateFilenamePreview(){
  if (!entryUploadToken) entryUploadToken = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const preview = document.getElementById("filename-preview");
  preview.textContent = "Will be saved as: " + buildFileName();
}

// ---------- REPOSITORY: filters ----------
function wireFilters(){
  ["filter-search","filter-kin","filter-kiq","filter-type","filter-date"].forEach(id => {
    document.getElementById(id).addEventListener("input", renderEntries);
    document.getElementById(id).addEventListener("change", renderEntries);
  });
  const viewToggle = document.getElementById("repository-view-toggle");
  viewToggle.addEventListener("click", () => {
    const grouped = viewToggle.getAttribute("aria-pressed") !== "true";
    viewToggle.setAttribute("aria-pressed", String(grouped));
    viewToggle.textContent = grouped ? "Show flat list" : "Group by date & type";
    renderEntries();
  });
}

// ---------- REPOSITORY: load / render ----------
async function loadEntries(){
  if (!sbClient) { renderEntries(); return; }
  const { data, error } = await sbClient.from("entries").select("*").order("created_at", { ascending: false });
  currentEntriesLoadError = error;
  if (error) console.error("Repository load failed:", error);
  if (!error && data) currentEntries = data;
  document.getElementById("entry-count").textContent = currentEntriesLoadError
    ? `Could not refresh sources: ${currentEntriesLoadError.message}`
    : `${currentEntries.length} ${currentEntries.length === 1 ? "entry" : "entries"} stored`;
  renderEntries();
  renderAnalysis();
  renderOverview();
}

function renderEntries(){
  const search = document.getElementById("filter-search").value.toLowerCase();
  const kin = document.getElementById("filter-kin").value;
  const kiq = document.getElementById("filter-kiq").value;
  const type = document.getElementById("filter-type").value;
  const collectionPeriod = document.getElementById("filter-date").value;

  const filtered = currentEntries.filter(e => {
    if (kin && e.kin !== kin) return false;
    if (kiq && e.kiq !== kiq) return false;
    if (type && e.source_type !== type) return false;
    const collectionDate = repositoryCollectionDateKey(e.date_collected);
    if (collectionPeriod) {
      if (!collectionDate) return false;
      const [year, month, day] = collectionDate.split("-").map(Number);
      const collectedDay = Date.UTC(year, month - 1, day);
      const today = new Date();
      const todayUtcDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
      const ageInDays = (todayUtcDay - collectedDay) / 86400000;
      if (collectionPeriod === "older" ? ageInDays <= 90 : ageInDays < 0 || ageInDays > Number(collectionPeriod)) return false;
    }
    if (search) {
      const hay = `${e.source} ${e.author} ${e.added_by || ""} ${e.added_by_email || ""} ${e.relevance}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  const grid = document.getElementById("card-grid");
  grid.innerHTML = "";
  const emptyState = document.getElementById("empty-state");
  emptyState.textContent = currentEntriesLoadError && !currentEntries.length
    ? `Could not load sources: ${currentEntriesLoadError.message}`
    : "No entries match yet. Add your first source, or clear your filters.";
  emptyState.classList.toggle("is-hidden", filtered.length !== 0 && !currentEntriesLoadError);
  const summary = document.getElementById("repository-filter-summary");
  summary.textContent = `Showing ${filtered.length} of ${currentEntries.length} sources`;
  summary.classList.toggle("is-hidden", currentEntries.length === 0);
  const groupedView = document.getElementById("repository-view-toggle").getAttribute("aria-pressed") === "true";

  function createEntryCard(e){
    const card = document.createElement("div");
    card.className = "entry-card";
    card.innerHTML = `
      <div class="entry-tags">
        <span class="tag tag-kin">${e.kin}</span>
        <span class="tag tag-kiq">${e.kiq}</span>
      </div>
      <p class="entry-source">${escapeHtml(e.source)}</p>
      <div class="entry-meta">${escapeHtml(e.author)} · ${e.date_published || "—"} · ${escapeHtml(e.source_type)}</div>
      ${entryContributorMarkup(e)}
      <div class="entry-relevance">${escapeHtml(truncate(e.relevance, 110))}</div>
      ${canManageLeadership() ? `<div class="entry-actions"><button class="btn btn-danger-ghost btn-small entry-delete" data-entry-id="${e.id}">Delete entry</button></div>` : ""}
    `;
    card.addEventListener("click", () => openDetail(e));
    return card;
  }

  if (groupedView) {
    const dateGroups = new Map();
    filtered.forEach(entry => {
      const dateKey = repositoryCollectionDateKey(entry.date_collected);
      if (!dateGroups.has(dateKey)) dateGroups.set(dateKey, []);
      dateGroups.get(dateKey).push(entry);
    });
    const sortedDateGroups = [...dateGroups.entries()].sort(([a], [b]) => {
      if (!a) return 1;
      if (!b) return -1;
      return b.localeCompare(a);
    });

    sortedDateGroups.forEach(([dateKey, entries]) => {
      const dateSection = document.createElement("section");
      dateSection.className = "repository-date-group";
      dateSection.innerHTML = `<header class="repository-date-heading"><h2>${escapeHtml(repositoryDateLabel(dateKey))}</h2><span>${entries.length} ${entries.length === 1 ? "source" : "sources"}</span></header>`;

      const typeGroups = new Map();
      entries.forEach(entry => {
        const sourceType = entry.source_type || "Uncategorized";
        if (!typeGroups.has(sourceType)) typeGroups.set(sourceType, []);
        typeGroups.get(sourceType).push(entry);
      });

      [...typeGroups.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([sourceType, typeEntries]) => {
        const typeSection = document.createElement("section");
        typeSection.className = "repository-type-group";
        typeSection.innerHTML = `<h3 class="repository-type-heading"><span>${escapeHtml(sourceType)}</span><span>${typeEntries.length}</span></h3>`;
        const sourceGrid = document.createElement("div");
        sourceGrid.className = "card-grid repository-source-grid";
        typeEntries.forEach(entry => sourceGrid.appendChild(createEntryCard(entry)));
        typeSection.appendChild(sourceGrid);
        dateSection.appendChild(typeSection);
      });
      grid.appendChild(dateSection);
    });
  } else {
    const sourceGrid = document.createElement("div");
    sourceGrid.className = "card-grid";
    filtered.forEach(entry => sourceGrid.appendChild(createEntryCard(entry)));
    grid.appendChild(sourceGrid);
  }

  grid.querySelectorAll(".entry-delete").forEach(button => {
    button.addEventListener("click", async event => {
      event.stopPropagation();
      const entry = currentEntries.find(item => String(item.id) === String(button.dataset.entryId));
      if (!entry || !canManageLeadership()) return;
      if (!confirm(`Delete the repository entry "${entry.source}"?`)) return;
      const { error } = await sbClient.from("entries").delete().eq("id", entry.id);
      if (error) {
        alert("Could not delete entry: " + error.message);
        return;
      }
      if (entry.file_path) {
        try {
          const { error: fileError } = await sbClient.storage.from("sources").remove([entry.file_path]);
          if (fileError) alert("The repository entry was deleted, but its source file could not be removed: " + fileError.message);
        } catch (fileError) {
          console.error("Repository entry was deleted, but its source file could not be removed:", fileError);
          alert("The repository entry was deleted, but its source file could not be removed. Please contact an admin.");
        }
      }
      await loadEntries();
      await loadActivity();
    });
  });
}

function repositoryCollectionDateKey(value){
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return "";
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? value : "";
}

function repositoryDateLabel(dateKey){
  if (!dateKey) return "Collection date not recorded";
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" }).format(new Date(year, month - 1, day));
}

function entryContributorMarkup(entry){
  const profile = currentMembers.find(member => member.user_id === entry.added_by_user_id);
  const name = profile?.name || entry.added_by || entry.added_by_email || "Not recorded";
  const email = entry.added_by_email || "Email not recorded";
  const avatarUrl = profile?.avatar_path ? getPublicAvatarUrl(profile.avatar_path) : null;
  const avatar = avatarUrl
    ? `<img src="${escapeHtml(avatarUrl)}" alt="" />`
    : escapeHtml(entry.added_by || entry.added_by_email ? initials(name) : "?");
  return `<div class="entry-contributor"><span class="entry-contributor-avatar">${avatar}</span><span class="entry-contributor-copy"><span class="entry-contributor-name"><span>Added by</span><strong>${escapeHtml(name)}</strong></span><span class="entry-contributor-email">${escapeHtml(email)}</span></span></div>`;
}

function truncate(str, n){ return str && str.length > n ? str.slice(0, n) + "…" : (str || ""); }

// ---------- DETAIL MODAL ----------
async function openDetail(entry){
  const modal = document.getElementById("detail-modal");
  const fileUrl = await getPublicFileUrl(entry.file_path);
  const fileName = entry.file_name || entry.file_path || "";
  const fileExtension = fileName.split(".").pop().toLowerCase();
  const imageExtensions = ["avif", "gif", "jpeg", "jpg", "png", "webp"];
  const filePreview = fileUrl && fileExtension === "pdf"
    ? `<div class="source-preview"><iframe src="${escapeHtml(fileUrl)}" title="${escapeHtml(entry.source)} PDF preview" loading="lazy"></iframe></div>`
    : fileUrl && imageExtensions.includes(fileExtension)
      ? `<div class="source-preview source-preview-image"><img src="${escapeHtml(fileUrl)}" alt="Preview of ${escapeHtml(entry.source)}" loading="lazy" /></div>`
      : fileUrl
        ? `<div class="source-preview-unavailable">Preview is not available for this file type.</div>`
        : "";
  modal.innerHTML = `
    <div class="detail-head">
      <h2>${escapeHtml(entry.source)}</h2>
      <button class="modal-close" id="close-detail">&times;</button>
    </div>
    <div class="entry-tags" style="margin-bottom:16px;">
      <span class="tag tag-kin">${entry.kin}</span>
      <span class="tag tag-kiq">${entry.kiq}</span>
    </div>
    ${filePreview}
    <div class="detail-field"><div class="k">Author / organisation</div><div class="v">${escapeHtml(entry.author)}</div></div>
    ${entryContributorMarkup(entry)}
    <div class="detail-field"><div class="k">Date published / collected</div><div class="v">${entry.date_published || "—"} / ${entry.date_collected || "—"}</div></div>
    <div class="detail-field"><div class="k">Type of source</div><div class="v">${escapeHtml(entry.source_type)}</div></div>
    <div class="detail-field"><div class="k">Relevance to KIQ</div><div class="v">${escapeHtml(entry.relevance)}</div></div>
    <div class="detail-field"><div class="k">File name</div><div class="v" style="font-family:var(--font-sans); font-size:12px;">${escapeHtml(entry.file_name || "")}</div></div>
    ${fileUrl ? `<a class="detail-file-link" href="${escapeHtml(fileUrl)}" target="_blank" rel="noopener noreferrer">Open extract in new tab →</a>` : ""}
  `;
  document.getElementById("close-detail").addEventListener("click", closeDetail);
  document.getElementById("detail-overlay").classList.remove("is-hidden");
}

function closeDetail(){ document.getElementById("detail-overlay").classList.add("is-hidden"); }

async function getPublicFileUrl(path){
  if (!path || !sbClient) return null;
  const { data, error } = await sbClient.storage.from("sources").createSignedUrl(path, 3600);
  return error ? null : data?.signedUrl || null;
}

// ---------- ADD ENTRY MODAL ----------
function wireModal(){
  document.getElementById("open-add-entry").addEventListener("click", () => {
    if (!requireAuth()) return;
    entryUploadToken = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    document.getElementById("modal-overlay").classList.remove("is-hidden");
    updateFilenamePreview();
  });
  document.getElementById("close-add-entry").addEventListener("click", closeAddModal);
  document.getElementById("cancel-add-entry").addEventListener("click", closeAddModal);
  document.getElementById("detail-overlay").addEventListener("click", (e) => {
    if (e.target.id === "detail-overlay") closeDetail();
  });
  document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "modal-overlay") closeAddModal();
  });
  document.getElementById("entry-form").addEventListener("submit", submitEntry);
}

function closeAddModal(){
  document.getElementById("modal-overlay").classList.add("is-hidden");
  document.getElementById("entry-form").reset();
  document.getElementById("form-status").textContent = "";
  document.getElementById("form-status").className = "form-status";
  entryUploadToken = "";
}

async function submitEntry(e){
  e.preventDefault();
  if (!requireAuth()) return;
  const status = document.getElementById("form-status");
  const submitBtn = document.getElementById("submit-entry");

  if (!sbClient) {
    status.textContent = "Not connected to Supabase yet — check config.js.";
    status.className = "form-status is-error";
    return;
  }

  submitBtn.disabled = true;
  status.textContent = "Uploading extract…";
  status.className = "form-status";

  const fileInput = document.getElementById("f-file");
  const file = fileInput.files[0];
  const fileName = buildFileName();
  const addedBy = myMemberProfile()?.name || currentUser?.email || "Unknown contributor";
  let uploadedFile = false;
  let entrySaved = false;
  let contributorMetadataOmitted = false;
  let saveStage = "source file upload";

  try {
    const { error: uploadError } = await sbClient.storage.from("sources").upload(fileName, file);
    if (uploadError) throw uploadError;
    uploadedFile = true;
    saveStage = "repository record";

    const record = {
      kin: document.getElementById("f-kin").value,
      kiq: document.getElementById("f-kiq").value,
      source: document.getElementById("f-source").value,
      author: document.getElementById("f-author").value,
      added_by: addedBy,
      added_by_email: currentUser?.email || null,
      added_by_user_id: currentUser?.id || null,
      source_type: document.getElementById("f-type").value,
      date_published: document.getElementById("f-date-pub").value,
      date_collected: document.getElementById("f-date-collected").value,
      relevance: document.getElementById("f-relevance").value,
      file_path: fileName,
      file_name: fileName,
      created_at: new Date().toISOString(),
    };

    const compatibleRecord = { ...record };
    const contributorFields = ["added_by", "added_by_email", "added_by_user_id"];
    let insertError = null;
    while (true) {
      const { error } = await sbClient.from("entries").insert(compatibleRecord);
      if (!error) {
        insertError = null;
        break;
      }
      insertError = error;
      const missingField = error.code === "PGRST204"
        ? contributorFields.find(field =>
          Object.hasOwn(compatibleRecord, field)
          && error.message?.includes(`'${field}'`)
        )
        : null;
      if (!missingField) break;
      delete compatibleRecord[missingField];
      contributorMetadataOmitted = true;
      console.warn(`Supabase schema cache does not include entries.${missingField}; retrying source save without this optional field.`);
    }
    if (insertError) throw insertError;
    entrySaved = true;

    status.textContent = contributorMetadataOmitted
      ? "Source saved. Contributor details were omitted because the Supabase schema cache is outdated. Ask an admin to refresh the database schema when convenient."
      : "Saved.";
    status.className = contributorMetadataOmitted ? "form-status" : "form-status is-success";
    await loadEntries();
    await loadActivity();
    setTimeout(closeAddModal, 500);
  } catch (err) {
    console.error(err);
    const isRlsError = err.code === "42501" || /row-level security policy/i.test(err.message || "");
    if (isRlsError) {
      const deniedResource = saveStage === "source file upload" ? "source file upload" : "repository record";
      status.textContent = `Supabase denied the ${deniedResource}. Your signed-in account needs a complete profile and admin approval. Ask an admin to approve you in Team; if you are already approved, ask them to rerun the latest schema.sql in Supabase.`;
    } else {
      status.textContent = `Could not save ${saveStage}: ${err.message || err}`;
    }
    status.className = "form-status is-error";
    if (uploadedFile && !entrySaved) {
      try {
        const { error: cleanupError } = await sbClient.storage.from("sources").remove([fileName]);
        if (cleanupError) {
          console.error("Could not remove source file after a failed repository save:", cleanupError);
          status.textContent += " The uploaded file could not be removed; please contact an admin.";
        }
      } catch (cleanupError) {
        console.error("Could not remove source file after a failed repository save:", cleanupError);
        status.textContent += " The uploaded file could not be removed; please contact an admin.";
      }
    }
  } finally {
    submitBtn.disabled = false;
  }
}

// ============================================================
// TEAM: MEMBERS
// ============================================================
async function loadMembers(){
  if (!sbClient) { renderMembers(); return; }
  if (canManageLeadership()) {
    await sbClient.from("members").delete().is("user_id", null).in("name", ["FixerCtrl", "Team 01"]);
  }
  const memberFields = canManageLeadership() ? "*" : currentUser
    ? "id,name,avatar_path,bio,user_id,created_at,last_seen_at,approved,profile_completed"
    : "id,name,avatar_path,bio,user_id,created_at,approved,profile_completed";
  const { data, error } = await sbClient.from("members").select(memberFields).order("created_at", { ascending: true });
  if (error) {
    memberLoadError = error;
    console.error("Could not load member profiles:", error.message);
  } else if (data) {
    currentMembers = data;
    memberLoadError = null;
  }
  renderMembers();
  updateWorkspaceGate();
  renderEntries();
  renderActivity();
  renderAuthBox(); // members just loaded, so the sidebar can now show your claimed avatar/name
  await loadWhatsAppSettings();
  populateTaskPeopleDropdowns();
  renderTasks();
  renderNotifications();
}

function initials(name){
  return (name || "?").trim().split(/\s+/).map(w => w[0]).slice(0,2).join("").toUpperCase();
}

function renderMembers(){
  const grid = document.getElementById("member-grid");
  const directoryNote = document.getElementById("team-directory-note");
  grid.innerHTML = "";
  const canModerate = canManageLeadership();
  const visibleMembers = canModerate
    ? currentMembers
    : currentMembers.filter(member => member.user_id && member.user_id !== currentUser?.id);
  if (directoryNote) {
    directoryNote.textContent = canModerate
      ? "Admin view: review pending profiles and approve or revoke workspace access."
      : "Online status and last seen are visible to signed-in team members. Login history is admin-only.";
    directoryNote.classList.toggle("is-hidden", visibleMembers.length === 0);
  }
  visibleMembers.forEach(m => {
    const card = document.createElement("div");
    card.className = "member-card";
    const avatarUrl = getPublicAvatarUrl(m.avatar_path);
    const canEditPhoto = currentUser && (m.user_id === currentUser.id || canModerate);
    const memberOnline = isMemberOnline(m);
    const memberProfileComplete = isMemberProfileComplete(m);
    card.innerHTML = `
      <div class="member-card-header">
        <div class="member-avatar" ${canEditPhoto ? `data-avatar-for="${m.id}" title="Click to change photo"` : ""} style="${canEditPhoto ? "" : "cursor:default;"}">
          ${avatarUrl ? `<img src="${avatarUrl}" alt="${escapeHtml(m.name)}" />` : initials(m.name)}
        </div>
        <div class="member-identity">
          <div class="member-name">${escapeHtml(m.name)}${m.user_id ? "" : ` <span class="member-unclaimed">Unclaimed</span>`}</div>
          ${m.bio ? `<div class="member-bio">${escapeHtml(m.bio)}</div>` : ""}
        </div>
        ${canModerate ? `<div class="member-card-actions"><span class="member-approval-state ${m.approved && memberProfileComplete ? "is-approved" : "is-pending"}">${m.approved && memberProfileComplete ? "Approved" : memberProfileComplete ? "Pending" : "Profile incomplete"}</span><button class="member-approval" title="${m.approved ? "Revoke access" : memberProfileComplete ? "Approve access" : "Member must submit a complete profile first"}" data-member-approval="${m.id}" ${!m.approved && !memberProfileComplete ? "disabled" : ""}>${m.approved ? "Revoke" : "Approve"}</button><button class="member-edit" title="Edit member" data-edit-member="${m.id}">Edit</button><button class="member-remove" title="Remove member profile" data-remove-member="${m.id}">&times;</button></div>` : ""}
      </div>
      ${currentUser && m.user_id ? `
        <div class="member-activity">
          <div class="member-activity-row"><span class="member-activity-label">Presence</span><span class="member-activity-state ${memberOnline ? "is-online" : ""}"><span class="presence-dot"></span>${memberOnline ? "Online now" : "Offline"}</span></div>
          <div class="member-activity-row"><span class="member-activity-label">Last seen</span><time ${m.last_seen_at ? `datetime="${escapeHtml(m.last_seen_at)}"` : ""}>${m.last_seen_at ? escapeHtml(formatPresenceTime(m.last_seen_at)) : "Not recorded"}</time></div>
          ${canModerate && m.last_login_at ? `<div class="member-activity-row"><span class="member-activity-label">Last login</span><time datetime="${escapeHtml(m.last_login_at)}">${escapeHtml(formatPresenceTime(m.last_login_at))}</time></div>` : ""}
        </div>
      ` : !m.user_id ? `<div class="member-account-status">Profile not linked to an account</div>` : ""}
    `;
    grid.appendChild(card);
  });

  grid.querySelectorAll("[data-avatar-for]").forEach(el => {
    el.addEventListener("click", () => reuploadAvatar(el.dataset.avatarFor));
  });
  grid.querySelectorAll("[data-remove-member]").forEach(el => {
    el.addEventListener("click", () => removeMember(el.dataset.removeMember));
  });
  grid.querySelectorAll("[data-edit-member]").forEach(el => {
    el.addEventListener("click", () => openMemberEditor(el.dataset.editMember));
  });
  grid.querySelectorAll("[data-member-approval]").forEach(button => {
    button.addEventListener("click", () => setMemberApproval(button.dataset.memberApproval));
  });

  renderYourProfile();
}

function renderYourProfile(){
  const slot = document.getElementById("your-profile-slot");
  const personalDashboard = document.getElementById("personal-dashboard");
  if (!slot) return;

  // Show/hide personal dashboard based on login status
  if (personalDashboard) {
    personalDashboard.classList.toggle("is-hidden", !currentUser);
  }

  if (!currentUser) {
    slot.innerHTML = `
      <div class="your-profile-card">
        <div class="your-profile-avatar">?</div>
        <div class="your-profile-text">
          <div class="your-profile-kicker">Not signed in</div>
          <div class="your-profile-empty-note">Sign in to claim your profile and see your identity here.</div>
        </div>
        <button class="btn btn-primary" id="your-profile-signin-btn">Sign in</button>
      </div>
    `;
    document.getElementById("your-profile-signin-btn").addEventListener("click", openAuthModal);
    return;
  }

  const mine = myMemberProfile();
  const admin = isAdminEmail(currentUser.email);

  if (!mine) {
    slot.innerHTML = `
      <div class="your-profile-card">
        <div class="your-profile-avatar">${initials(currentUser.email.split("@")[0])}</div>
        <div class="your-profile-text">
          <div class="your-profile-kicker">Signed in${admin ? " · ADMIN" : ""}</div>
          <div class="your-profile-name">${escapeHtml(currentUser.email)}</div>
          <div class="your-profile-empty-note">You haven't added yourself to the team roster yet.</div>
        </div>
        <button class="btn btn-primary" id="your-profile-add-btn">+ Add myself</button>
      </div>
    `;
    document.getElementById("your-profile-add-btn").addEventListener("click", openOwnProfileEditor);
    return;
  }

  const avatarUrl = getPublicAvatarUrl(mine.avatar_path);
  slot.innerHTML = `
    <div class="your-profile-card">
      <div class="your-profile-avatar" id="your-profile-avatar-click" title="Click to change photo">
        ${avatarUrl ? `<img src="${avatarUrl}" alt="${escapeHtml(mine.name)}" />` : initials(mine.name)}
      </div>
      <div class="your-profile-text">
        <div class="your-profile-kicker">Signed in as${admin ? " · ADMIN" : ""}</div>
        <div class="your-profile-name">${escapeHtml(mine.name)}</div>
        ${mine.bio ? `<div class="your-profile-bio">${escapeHtml(mine.bio)}</div>` : `<div class="your-profile-bio">${escapeHtml(currentUser.email)}</div>`}
      </div>
      <button class="btn btn-ghost" id="your-profile-edit-btn">Edit profile</button>
    </div>
  `;
  document.getElementById("your-profile-edit-btn").addEventListener("click", openOwnProfileEditor);
  document.getElementById("your-profile-avatar-click").addEventListener("click", () => reuploadAvatar(mine.id));
}

function openOwnProfileEditor(){
  if (!currentUser) { openAuthModal(); return; }
  memberEditorTargetId = null;
  const mine = myMemberProfile();
  document.getElementById("member-modal-title").textContent = mine ? "Edit profile" : "Complete profile";
  document.getElementById("m-name").value = mine ? mine.name : "";
  document.getElementById("m-bio").value = mine ? (mine.bio || "") : "";
  document.getElementById("submit-member").textContent = mine ? "Save changes" : "Create profile";
  document.getElementById("member-modal-overlay").classList.remove("is-hidden");
}

function isMemberOnline(member){
  const lastSeen = new Date(member.last_seen_at || 0).getTime();
  return Number.isFinite(lastSeen) && Date.now() - lastSeen < 5 * 60 * 1000;
}

function formatPresenceTime(isoString){
  if (!isoString) return "not yet";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(isoString));
}

async function ensureMyProfile(isNewLogin = false){
  if (!sbClient || !currentUser) return;
  const now = new Date().toISOString();
  let existing = myMemberProfile();
  if (!existing) {
    const { data } = await sbClient.from("members").select("*").eq("user_id", currentUser.id).maybeSingle();
    if (data) {
      currentMembers.push(data);
      existing = data;
    }
  }
  if (existing) {
    const updates = { last_seen_at: now };
    if (isNewLogin) updates.last_login_at = now;
    await sbClient.from("members").update(updates).eq("id", existing.id);
    existing.last_seen_at = now;
    if (isNewLogin) existing.last_login_at = now;
    return;
  }
  const displayName = currentUser.user_metadata?.full_name || currentUser.email?.split("@")[0] || "Team member";
  const { data, error } = await sbClient.from("members").insert({
    name: displayName,
    user_id: currentUser.id,
    approved: isAdminEmail(currentUser.email),
    profile_completed: false,
    last_seen_at: now,
    last_login_at: isNewLogin ? now : null,
    created_at: now
  }).select().single();
  if (!error && data) currentMembers.push(data);
}

async function setMemberApproval(memberId){
  if (!canManageLeadership() || !sbClient) return;
  const member = currentMembers.find(item => String(item.id) === String(memberId));
  if (!member) return;
  const approved = !member.approved;
  if (approved && !isMemberProfileComplete(member)) {
    alert("The member must complete their name and short bio before approval.");
    return;
  }
  const { error } = await sbClient.from("members").update({ approved }).eq("id", member.id);
  if (error) {
    alert("Could not update member approval: " + error.message);
    return;
  }
  member.approved = approved;
  renderMembers();
  updateWorkspaceGate();
  if (canAccessWorkspace()) await loadApprovedWorkspace();
}

async function updateMyPresence(){
  if (!sbClient || !currentUser) return;
  const mine = myMemberProfile();
  if (!mine) return;
  const now = new Date().toISOString();
  const { error } = await sbClient.from("members").update({ last_seen_at: now }).eq("id", mine.id);
  if (!error) {
    mine.last_seen_at = now;
    if (canManageLeadership()) renderMembers();
  }
}

function getPublicAvatarUrl(path){
  if (!path || !sbClient) return null;
  const { data } = sbClient.storage.from("avatars").getPublicUrl(path);
  return data ? data.publicUrl : null;
}

function myMemberProfile(){
  if (!currentUser) return null;
  return currentMembers.find(m => m.user_id === currentUser.id) || null;
}

function wireMemberModal(){
  document.getElementById("close-add-member").addEventListener("click", closeAddMemberModal);
  document.getElementById("cancel-add-member").addEventListener("click", closeAddMemberModal);
  document.getElementById("member-modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "member-modal-overlay") closeAddMemberModal();
  });
  document.getElementById("member-form").addEventListener("submit", submitMember);

  document.getElementById("avatar-reupload-input").addEventListener("change", handleAvatarReupload);
}

function closeAddMemberModal(){
  document.getElementById("member-modal-overlay").classList.add("is-hidden");
  document.getElementById("member-form").reset();
  document.getElementById("member-form-status").textContent = "";
  memberEditorTargetId = null;
  updateWorkspaceGate();
}

let memberEditorTargetId = null;

function openMemberEditor(memberId){
  if (!canManageLeadership()) return;
  const member = currentMembers.find(item => item.id === memberId);
  if (!member) return;
  memberEditorTargetId = member.id;
  document.getElementById("member-modal-title").textContent = `Edit ${member.name}`;
  document.getElementById("m-name").value = member.name;
  document.getElementById("m-bio").value = member.bio || "";
  document.getElementById("submit-member").textContent = "Save changes";
  document.getElementById("member-modal-overlay").classList.remove("is-hidden");
}

async function submitMember(e){
  e.preventDefault();
  if (!currentUser) {
    openAuthModal();
    return;
  }
  const status = document.getElementById("member-form-status");
  if (!sbClient) { status.textContent = "Not connected to Supabase yet."; status.className = "form-status is-error"; return; }

  const name = document.getElementById("m-name").value.trim();
  const bio = document.getElementById("m-bio").value.trim();
  const file = document.getElementById("m-avatar").files[0];
  const mine = memberEditorTargetId ? currentMembers.find(member => member.id === memberEditorTargetId) : myMemberProfile();
  if (memberEditorTargetId && !canManageLeadership()) return;
  if (memberEditorTargetId && !requireAuth()) return;
  if (!name || !bio) {
    status.textContent = "Enter a name and short bio to complete this profile.";
    status.className = "form-status is-error";
    return;
  }
  status.textContent = "Saving…";
  status.className = "form-status";

  try {
    let avatarPath = mine ? mine.avatar_path : null;
    if (file) {
      avatarPath = `member_${Date.now()}_${slugifySource(name)}.${file.name.split(".").pop()}`;
      const { error: upErr } = await sbClient.storage.from("avatars").upload(avatarPath, file, { upsert: true });
      if (upErr) throw upErr;
    }

    if (mine) {
      const profileUpdates = { name, bio, avatar_path: avatarPath };
      if (!memberEditorTargetId && mine.profile_completed !== true) profileUpdates.profile_completed = true;
      const { error: updErr } = await sbClient.from("members").update(profileUpdates).eq("id", mine.id);
      if (updErr) throw updErr;
    } else {
      const { error: insErr } = await sbClient.from("members").insert({
        name, bio, avatar_path: avatarPath, user_id: currentUser.id, approved: isAdminEmail(currentUser.email), profile_completed: true, created_at: new Date().toISOString()
      });
      if (insErr) throw insErr;
    }

    status.textContent = "Saved.";
    status.className = "form-status is-success";
    await loadMembers();
    await loadApprovedWorkspace();
    setTimeout(closeAddMemberModal, 400);
  } catch (err) {
    console.error(err);
    const errorMessage = (err.message || "").toLowerCase();
    if (errorMessage.includes("profile_completed") && (errorMessage.includes("column") || errorMessage.includes("schema cache"))) {
      status.textContent = "The Supabase database needs the latest profile and approval migration. Ask an admin to run the updated schema.sql in the Supabase SQL Editor, then refresh and submit again.";
    } else if (errorMessage.includes("duplicate")) {
      status.textContent = "You already have a profile. Use the Edit profile button in your profile card.";
    } else {
      status.textContent = "Something went wrong: " + (err.message || err);
    }
    status.className = "form-status is-error";
  }
}

let reuploadTargetId = null;
function reuploadAvatar(memberId){
  if (!requireAuth()) return;
  reuploadTargetId = memberId;
  document.getElementById("avatar-reupload-input").click();
}

async function handleAvatarReupload(e){
  const file = e.target.files[0];
  if (!file || !reuploadTargetId || !sbClient) return;
  const member = currentMembers.find(m => m.id === reuploadTargetId);
  if (!member) return;
  try {
    const avatarPath = `member_${Date.now()}_${slugifySource(member.name)}.${file.name.split(".").pop()}`;
    const { error: upErr } = await sbClient.storage.from("avatars").upload(avatarPath, file, { upsert: true });
    if (upErr) throw upErr;
    const { error: updErr } = await sbClient.from("members").update({ avatar_path: avatarPath }).eq("id", reuploadTargetId);
    if (updErr) throw updErr;
    await loadMembers();
  } catch (err) {
    console.error(err);
    alert("Couldn't update photo: " + (err.message || err));
  } finally {
    e.target.value = "";
    reuploadTargetId = null;
  }
}

async function removeMember(memberId){
  if (!requireAuth()) return;
  if (!canManageLeadership()) {
    alert("Only the admin can remove members.");
    return;
  }
  if (!confirm("Remove this member profile? Their login account is not deleted, but their profile and assignments will be unlinked.")) return;
  const { error } = await sbClient.from("members").delete().eq("id", memberId);
  if (error) {
    alert("Could not remove team member: " + error.message);
    return;
  }
  await loadMembers();
  await loadTasks();
}

// ============================================================
// TEAM: TASKS
// ============================================================
async function loadTasks(){
  if (!sbClient) { renderTasks(); return; }
  const { data, error } = await sbClient.from("tasks").select("*").order("created_at", { ascending: false });
  if (!error && data) currentTasks = data;
  await loadTaskComments();
  renderTasks();
  renderAnalysis();
  renderOverview();
}

async function loadTaskComments(){
  if (!sbClient) return;
  const { data, error } = await sbClient.from("task_comments").select("*").order("created_at", { ascending: true });
  if (error) {
    taskCommentsUnavailable = error.code === "PGRST205" || error.message?.includes("task_comments");
    console.error("Could not load task comments:", error.message);
    renderTasks();
    return;
  }
  taskCommentsUnavailable = false;
  if (data) currentTaskComments = data;
  renderNotifications();
}

function memberById(id){ return currentMembers.find(m => m.id === id); }

function personInlineHtml(memberId, fallback){
  const m = memberById(memberId);
  if (!m) return escapeHtml(fallback || "Unassigned");
  const url = getPublicAvatarUrl(m.avatar_path);
  return `<span class="person-inline"><span class="person-avatar-mini">${url ? `<img src="${url}" alt="" />` : initials(m.name)}</span>${escapeHtml(m.name)}</span>`;
}

function statusClass(status){
  if (status === "In progress") return "status-progress";
  if (status === "Done") return "status-done";
  return "status-todo";
}

function canChangeTaskStatus(task){
  if (!currentUser || !task) return false;
  const myMember = myMemberProfile();
  const isAssignee = !!myMember && task.assigned_to === myMember.id;
  return isAssignee || isAdminEmail(currentUser.email);
}

function canCommentOnTask(task){
  if (!currentUser || !task) return false;
  const mine = myMemberProfile();
  return isAdminEmail(currentUser.email) || (!!mine && (task.assigned_to === mine.id || task.assigned_by === mine.id));
}

function taskComments(taskId){
  return currentTaskComments.filter(comment => String(comment.task_id) === String(taskId));
}

function taskHasNewComment(task, seenAt){
  const mine = myMemberProfile();
  return taskComments(task.id).some(comment => comment.author_id !== mine?.id && new Date(comment.created_at).getTime() > seenAt);
}

function taskDueLabel(task){
  if (!task.due_date) return "No due date";
  const due = new Date(`${task.due_date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((due - today) / 86400000);
  if (days < 0) return `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due ${task.due_date}`;
}

function taskNeedsAttention(task){
  const mine = myMemberProfile();
  if (!mine || task.assigned_to !== mine.id || task.status === "Done") return false;
  const seenAt = new Date(localStorage.getItem(notificationSeenStorageKey()) || 0).getTime();
  return new Date(task.created_at).getTime() > seenAt || taskHasNewComment(task, seenAt) || taskDueLabel(task).startsWith("Overdue");
}

function wireTaskViews(){
  document.querySelectorAll("[data-task-view]").forEach(button => {
    button.addEventListener("click", () => {
      currentTaskView = button.dataset.taskView;
      document.querySelectorAll("[data-task-view]").forEach(viewButton => {
        const isActive = viewButton === button;
        viewButton.classList.toggle("is-active", isActive);
        viewButton.setAttribute("aria-selected", String(isActive));
      });
      renderTasks();
    });
  });
}

function wireMyWorkDashboard(){
  // Calendar navigation
  const prevBtn = document.getElementById("calendar-prev-month");
  const nextBtn = document.getElementById("calendar-next-month");
  const filterBtn = document.getElementById("my-work-filter");
  
  if (prevBtn) prevBtn.addEventListener("click", () => {
    calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() - 1);
    renderMyWork();
  });
  
  if (nextBtn) nextBtn.addEventListener("click", () => {
    calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() + 1);
    renderMyWork();
  });
  
  if (filterBtn) filterBtn.addEventListener("change", (e) => {
    myWorkFilter = e.target.value;
    renderMyWork();
  });
}

function renderCalendar(){
  const calendarEl = document.getElementById("my-work-calendar");
  const monthYearEl = document.getElementById("calendar-month-year");
  if (!calendarEl || !monthYearEl) return;
  
  const mine = myMemberProfile();
  if (!mine) return;
  
  const year = calendarCurrentDate.getFullYear();
  const month = calendarCurrentDate.getMonth();
  
  // Set month/year display
  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  monthYearEl.textContent = `${monthNames[month]} ${year}`;
  
  // Get all tasks for this person for this month
  const assignedTasks = currentTasks.filter(task => task.assigned_to === mine.id);
  const tasksByDate = {};
  assignedTasks.forEach(task => {
    if (task.due_date) {
      const taskDate = new Date(task.due_date);
      if (taskDate.getMonth() === month && taskDate.getFullYear() === year) {
        const day = taskDate.getDate();
        if (!tasksByDate[day]) tasksByDate[day] = [];
        tasksByDate[day].push(task);
      }
    }
  });
  
  // Build calendar
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  
  let html = '';
  
  // Day headers
  const dayHeaders = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  dayHeaders.forEach(day => {
    html += `<div class="calendar-day-header">${day}</div>`;
  });
  
  // Previous month days
  for (let i = firstDay - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    html += `<div class="calendar-day other-month"><div class="calendar-day-number">${day}</div></div>`;
  }
  
  // Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const isToday = today.toDateString() === date.toDateString();
    const hasTasks = tasksByDate[day];
    const dayTasks = hasTasks ? hasTasks.filter(t => t.status !== "Done") : [];
    const overdueTasks = dayTasks.filter(t => today > date && t.status !== "Done").length;
    
    let classes = "calendar-day";
    if (isToday) classes += " today";
    if (dayTasks.length > 0) classes += " has-tasks";
    
    html += `<div class="${classes}" data-calendar-day="${day}" data-calendar-tasks="${dayTasks.length}" data-calendar-month="${month}" data-calendar-year="${year}">
      <div class="calendar-day-number">${day}</div>
      ${dayTasks.length > 0 ? `<div class="calendar-day-indicator">${dayTasks.length}</div>` : ""}
    </div>`;
  }
  
  // Next month days
  const totalCells = 42;
  const cellsFilled = firstDay + daysInMonth;
  const nextMonthDays = totalCells - cellsFilled;
  for (let day = 1; day <= nextMonthDays; day++) {
    html += `<div class="calendar-day other-month"><div class="calendar-day-number">${day}</div></div>`;
  }
  
  calendarEl.innerHTML = html;
  
  // Add click handlers to calendar days
  calendarEl.querySelectorAll("[data-calendar-day]").forEach(dayEl => {
    dayEl.addEventListener("click", () => {
      const day = parseInt(dayEl.dataset.calendarDay);
      const clickedDate = new Date(year, month, day);
      
      // Scroll to tasks for that date
      const tasksInDay = assignedTasks.filter(task => {
        if (!task.due_date) return false;
        const taskDate = new Date(task.due_date);
        return taskDate.toDateString() === clickedDate.toDateString();
      });
      
      if (tasksInDay.length > 0) {
        const taskList = document.getElementById("my-work-list");
        const firstTask = tasksInDay[0];
        const taskItem = taskList.querySelector(`[data-focus-task-id="${firstTask.id}"]`);
        if (taskItem) {
          taskItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }
    });
  });
}

function renderMyWork(){
  const list = document.getElementById("my-work-list");
  const counts = document.getElementById("my-work-counts");
  const empty = document.getElementById("my-work-empty");
  const personalDashboard = document.getElementById("personal-dashboard");
  
  if (!list || !counts || !empty || !personalDashboard) return;

  const mine = myMemberProfile();
  
  // Show/hide dashboard based on login status
  personalDashboard.classList.toggle("is-hidden", !currentUser || !mine);
  
  if (!currentUser || !mine) {
    counts.innerHTML = `<span class="work-count">Sign in to see your tasks</span>`;
    list.innerHTML = `<div class="my-work-signin">Sign in and claim your team profile to see your personal dashboard here.</div>`;
    empty.classList.add("is-hidden");
    return;
  }

  const seenAt = new Date(localStorage.getItem(notificationSeenStorageKey()) || 0).getTime();
  const assignedTasks = currentTasks.filter(task => task.assigned_to === mine.id);
  const openTasks = assignedTasks.filter(task => task.status !== "Done");
  const completedTasks = assignedTasks.filter(task => task.status === "Done");
  
  const today = new Date();
  const todayStr = today.toDateString();
  
  const dueSoon = openTasks.filter(task => {
    if (!task.due_date) return false;
    const days = (new Date(`${task.due_date}T00:00:00`) - new Date(new Date().toDateString())) / 86400000;
    return days >= 0 && days <= 7;
  }).length;
  
  const overdue = openTasks.filter(task => {
    if (!task.due_date) return false;
    return new Date(`${task.due_date}T00:00:00`) < new Date(new Date().toDateString());
  }).length;
  
  const needsAttention = openTasks.filter(task => new Date(task.created_at).getTime() > seenAt || taskHasNewComment(task, seenAt)).length;
  
  counts.innerHTML = `
    <span class="work-count"><strong>${openTasks.length}</strong> open</span>
    <span class="work-count"><strong>${dueSoon}</strong> due soon</span>
    <span class="work-count"><strong>${completedTasks.length}</strong> completed</span>
    ${overdue > 0 ? `<span class="work-count work-count-alert"><strong>${overdue}</strong> overdue</span>` : ""}
    ${needsAttention ? `<span class="work-count work-count-alert"><strong>${needsAttention}</strong> new</span>` : ""}
  `;
  
  // Filter tasks based on myWorkFilter
  let filteredTasks = openTasks;
  if (myWorkFilter === "open") filteredTasks = openTasks;
  else if (myWorkFilter === "overdue") filteredTasks = openTasks.filter(t => t.due_date && new Date(`${t.due_date}T00:00:00`) < new Date(new Date().toDateString()));
  else if (myWorkFilter === "due-soon") filteredTasks = dueSoon > 0 ? openTasks.filter(task => {
    if (!task.due_date) return false;
    const days = (new Date(`${task.due_date}T00:00:00`) - new Date(new Date().toDateString())) / 86400000;
    return days >= 0 && days <= 7;
  }) : [];
  else if (myWorkFilter === "done") filteredTasks = completedTasks;
  
  empty.classList.toggle("is-hidden", filteredTasks.length !== 0);
  list.innerHTML = filteredTasks.length ? [...filteredTasks].sort((a, b) => {
    if (!a.due_date && !b.due_date) return new Date(b.created_at) - new Date(a.created_at);
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  }).map(task => {
    const isNewAssignment = new Date(task.created_at).getTime() > seenAt;
    const hasNewMessage = taskHasNewComment(task, seenAt);
    const badges = [
      isNewAssignment ? `<span class="work-badge work-badge-new">New assignment</span>` : "",
      hasNewMessage ? `<span class="work-badge work-badge-message">New message</span>` : ""
    ].join("");
    return `
      <article class="my-work-item${isNewAssignment || hasNewMessage ? " is-attention" : ""}" data-focus-task-id="${task.id}">
        <div class="my-work-item-main">
          <div class="my-work-item-title"><strong>${escapeHtml(task.title)}</strong>${badges}</div>
          <div class="my-work-item-meta"><span class="task-status-text ${statusClass(task.status)}">${escapeHtml(task.status)}</span><span class="my-work-due ${task.due_date && taskDueLabel(task).startsWith("Overdue") ? "is-overdue" : ""}">${escapeHtml(taskDueLabel(task))}</span></div>
        </div>
        <span class="my-work-open">Open task <span aria-hidden="true">→</span></span>
      </article>
    `;
  }).join("") : "";

  list.querySelectorAll("[data-focus-task-id]").forEach(item => {
    item.addEventListener("click", () => {
      const taskCard = document.querySelector(`[data-task-card-id="${item.dataset.focusTaskId}"]`);
      taskCard?.scrollIntoView({ behavior: "smooth", block: "center" });
      taskCard?.classList.add("is-focused");
      setTimeout(() => taskCard?.classList.remove("is-focused"), 1400);
    });
  });
  
  // Render the calendar
  renderCalendar();
}

function renderTasks(){
  renderMyWork();
  const list = document.getElementById("task-list");
  list.innerHTML = "";
  const mine = myMemberProfile();
  const visibleTasks = currentTaskView === "all"
    ? currentTasks
    : currentTasks.filter(task => task.assigned_to === mine?.id && (currentTaskView === "mine" || taskNeedsAttention(task)));
  const emptyState = document.getElementById("task-empty-state");
  emptyState.textContent = currentTaskView === "attention" ? "Nothing needs your attention right now." : currentTaskView === "mine" ? "No tasks are assigned to you." : "No tasks assigned yet.";
  emptyState.classList.toggle("is-hidden", visibleTasks.length !== 0);

  visibleTasks.forEach(t => {
    const card = document.createElement("div");
    card.className = "task-card";
    card.dataset.taskCardId = t.id;
    const canEditStatus = canChangeTaskStatus(t);
    const canReassign = canManageLeadership();
    const comments = taskComments(t.id);
    card.innerHTML = `
      <div class="task-main">
        <p class="task-title">${escapeHtml(t.title)}</p>
        <div class="task-tags">
          ${t.kin ? `<span class="tag tag-kin">${t.kin}</span>` : ""}
          ${t.kiq ? `<span class="tag tag-kiq">${t.kiq}</span>` : ""}
        </div>
        <div class="task-people">
          <div class="task-person"><span class="task-person-label">Assigned to</span>${personInlineHtml(t.assigned_to, "Unassigned")}</div>
          <div class="task-person"><span class="task-person-label">Assigned by</span>${personInlineHtml(t.assigned_by, "Unknown")}</div>
        </div>
      </div>
      <span class="task-due">${t.due_date ? "Due " + t.due_date : ""}</span>
      <div class="task-actions">
        <select class="task-status ${statusClass(t.status)}" data-task-id="${t.id}" data-prev-value="${t.status}" ${canEditStatus ? "" : "disabled"}>
          <option${t.status === "To do" ? " selected" : ""}>To do</option>
          <option${t.status === "In progress" ? " selected" : ""}>In progress</option>
          <option${t.status === "Done" ? " selected" : ""}>Done</option>
        </select>
        ${canReassign ? `<button class="btn btn-ghost btn-small task-reassign" data-task-id="${t.id}">Edit assignment</button>` : ""}
        ${canReassign ? `<button class="btn btn-danger-ghost btn-small task-delete" data-task-id="${t.id}">Delete task</button>` : ""}
      </div>
      <div class="task-channel">
        <div class="task-channel-head"><strong>Task conversation</strong><span>${comments.length} message${comments.length === 1 ? "" : "s"}</span></div>
        <div class="task-comments">${taskCommentsUnavailable ? `<p class="task-comments-setup">Comments are temporarily unavailable. An admin needs to run the latest <strong>schema.sql</strong> in Supabase.</p>` : comments.length ? comments.map(comment => {
          const author = memberById(comment.author_id);
          const isAssignee = !!t.assigned_to && String(comment.author_id) === String(t.assigned_to);
          const isAssigner = !!t.assigned_by && String(comment.author_id) === String(t.assigned_by);
          const role = isAssignee ? "assignee" : isAssigner ? "assigner" : "team";
          const roleLabel = isAssignee ? "Assignee" : isAssigner ? "Assigner" : "Team member";
          const authorName = author?.name || comment.author_email || "Team member";
          const avatarUrl = author ? getPublicAvatarUrl(author.avatar_path) : null;
          return `
            <div class="task-comment-row task-comment-row-${role}">
              <span class="task-comment-avatar">${avatarUrl ? `<img src="${escapeHtml(avatarUrl)}" alt="" />` : escapeHtml(initials(authorName))}</span>
              <article class="task-comment task-comment-${role}">
                <div class="task-comment-meta"><span class="task-comment-author"><strong>${escapeHtml(authorName)}</strong><span class="task-comment-role">${roleLabel}</span></span><small>${escapeHtml(relativeTime(comment.created_at))}</small></div>
                <p>${escapeHtml(comment.body)}</p>
              </article>
            </div>
          `;
        }).join("") : `<p class="task-comments-empty">Ask a question or leave a note about this task.</p>`}</div>
        ${canCommentOnTask(t) && !taskCommentsUnavailable ? `<form class="task-comment-form" data-task-id="${t.id}"><input name="body" maxlength="500" placeholder="Ask a question or add a comment" required /><button class="btn btn-ghost btn-small" type="submit">Send</button></form>` : ""}
      </div>
    `;
    list.appendChild(card);
  });

  list.querySelectorAll(".task-status").forEach(sel => {
    sel.addEventListener("change", (e) => {
      const task = currentTasks.find(t => String(t.id) === String(e.target.dataset.taskId));
      if (!task) return;
      if (!canChangeTaskStatus(task)) {
        e.target.value = e.target.dataset.prevValue || e.target.value;
        alert("Only the assigned member or the admin can change this task status.");
        return;
      }
      if (!requireAuth()) { e.target.value = e.target.dataset.prevValue || e.target.value; return; }
      e.target.className = "task-status " + statusClass(e.target.value);
      updateTaskStatus(task.id, e.target.value);
    });
  });

  list.querySelectorAll(".task-reassign").forEach(btn => {
    btn.addEventListener("click", async () => {
      const task = currentTasks.find(t => String(t.id) === String(btn.dataset.taskId));
      if (!task) return;
      if (!canManageLeadership()) {
        alert("Only the admin can reassign tasks.");
        return;
      }

      const currentAssignee = memberById(task.assigned_to);
      const options = currentMembers.map(m => m.name).join(", ");
      const response = prompt(`Current assignee: ${currentAssignee ? currentAssignee.name : "Unassigned"}\nChoose a team member to reassign this task:\n${options}`, currentAssignee ? currentAssignee.name : "");
      if (response === null) return;
      const selected = currentMembers.find(m => m.name.toLowerCase() === response.trim().toLowerCase());
      if (!selected) {
        alert("Please type an exact team member name from the list.");
        return;
      }

      const previousAssigner = task.assigned_by;
      try {
        const { error } = await sbClient.from("tasks").update({ assigned_to: selected.id, assigned_by: previousAssigner }).eq("id", task.id);
        if (error) throw error;
        task.assigned_to = selected.id;
        if (previousAssigner) task.assigned_by = previousAssigner;
        try {
          const { error: notificationError } = await sbClient.functions.invoke("whatsapp-task-assigned", { body: { task_id: task.id } });
          if (notificationError) console.warn("WhatsApp reassignment alert was not sent:", notificationError);
        } catch (notificationError) {
          console.warn("WhatsApp reassignment alert was not sent:", notificationError);
        }
        await loadTasks();
      } catch (err) {
        console.error(err);
        alert("Could not reassign task: " + (err.message || err));
      }
    });
  });

  list.querySelectorAll(".task-delete").forEach(btn => {
    btn.addEventListener("click", async () => {
      const task = currentTasks.find(item => String(item.id) === String(btn.dataset.taskId));
      if (!task || !canManageLeadership()) return;
      if (!confirm(`Delete the task "${task.title}" and its discussion?`)) return;
      const { error } = await sbClient.from("tasks").delete().eq("id", task.id);
      if (error) {
        alert("Could not delete task: " + error.message);
        return;
      }
      currentTasks = currentTasks.filter(item => String(item.id) !== String(task.id));
      renderTasks();
      renderAnalysis();
      renderOverview();
      await loadTasks();
    });
  });

  list.querySelectorAll(".task-comment-form").forEach(form => {
    form.addEventListener("submit", (event) => submitTaskComment(event, form.dataset.taskId));
  });
}

async function submitTaskComment(event, taskId){
  event.preventDefault();
  if (!requireAuth() || !sbClient) return;
  const task = currentTasks.find(item => String(item.id) === String(taskId));
  const mine = myMemberProfile();
  const body = event.currentTarget.elements.body.value.trim();
  if (!task || !mine || !body || !canCommentOnTask(task)) return;
  const { error } = await sbClient.from("task_comments").insert({
    task_id: task.id,
    author_id: mine.id,
    author_email: currentUser.email,
    body,
    created_at: new Date().toISOString()
  });
  if (error) {
    alert("Could not send the comment. Please ask the admin to run the latest schema.sql migration.\n\n" + error.message);
    return;
  }
  event.currentTarget.reset();
  await loadTaskComments();
  renderTasks();
  await loadActivity();
}

async function updateTaskStatus(taskId, status){
  if (!sbClient) return;
  const task = currentTasks.find(x => x.id === taskId);
  if (!task || !canChangeTaskStatus(task)) {
    alert("Only the assigned member or the admin can change this task status.");
    return;
  }
  const { error } = await sbClient.from("tasks").update({ status }).eq("id", taskId);
  if (error) {
    alert("Could not update task status: " + error.message);
    await loadTasks();
    return;
  }
  if (task) task.status = status;
  renderOverview();
}

function populateTaskPeopleDropdowns(){
  const to = document.getElementById("t-assigned-to");
  const byName = document.getElementById("t-assigned-by-name");
  to.innerHTML = `<option value="">Choose a teammate</option>`;
  currentMembers.forEach(m => {
    to.appendChild(new Option(m.name, m.id));
  });
  const mine = myMemberProfile();
  byName.value = mine ? `You — ${mine.name}` : "Complete your Team profile first";
}

function populateTaskKinKiqDropdowns(){
  const kinSelect = document.getElementById("t-kin");
  const kiqSelect = document.getElementById("t-kiq");
  KINS.forEach(kin => {
    const option = new Option(`${kin.id} — ${kin.label}`, kin.id);
    option.dataset.filterId = kin.id;
    option.dataset.filterLabel = kin.label;
    kinSelect.appendChild(option);
  });
  const refreshKinDropdown = wireFilterDropdown(kinSelect, "t-kin");
  const refreshKiqDropdown = wireFilterDropdown(kiqSelect, "t-kiq");
  kinSelect.addEventListener("change", () => updateTaskKiqOptions(kinSelect.value, refreshKiqDropdown));
  updateTaskKiqOptions("", refreshKiqDropdown);
  document.getElementById("task-form").addEventListener("reset", () => {
    queueMicrotask(() => {
      refreshKinDropdown();
      updateTaskKiqOptions("", refreshKiqDropdown);
    });
  });
}

function updateTaskKiqOptions(kinId, refreshDropdown){
  const kiqSelect = document.getElementById("t-kiq");
  kiqSelect.innerHTML = `<option value="">—</option>`;
  const kin = KINS.find(k => k.id === kinId);
  (kin ? kin.kiqs : []).forEach(q => {
    const option = new Option(`${q.id} — ${q.label}`, q.id);
    option.dataset.filterId = q.id;
    option.dataset.filterLabel = q.label;
    kiqSelect.appendChild(option);
  });
  refreshDropdown();
}

function wireTaskModal(){
  populateTaskKinKiqDropdowns();
  document.getElementById("open-add-task").addEventListener("click", () => {
    if (!requireAuth()) return;
    if (!myMemberProfile()) {
      alert("Complete your Team profile before assigning a task.");
      return;
    }
    if (currentMembers.length === 0) {
      alert("Add at least one team member first, so there's someone to assign the task to.");
      return;
    }
    populateTaskPeopleDropdowns();
    document.getElementById("task-modal-overlay").classList.remove("is-hidden");
  });
  document.getElementById("close-add-task").addEventListener("click", closeAddTaskModal);
  document.getElementById("cancel-add-task").addEventListener("click", closeAddTaskModal);
  document.getElementById("task-modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "task-modal-overlay") closeAddTaskModal();
  });
  document.getElementById("task-form").addEventListener("submit", submitTask);
}

function closeAddTaskModal(){
  document.getElementById("task-modal-overlay").classList.add("is-hidden");
  document.getElementById("task-form").reset();
  document.getElementById("task-form-status").textContent = "";
}

async function submitTask(e){
  e.preventDefault();
  if (!requireAuth()) return;
  const assigner = myMemberProfile();
  const status = document.getElementById("task-form-status");
  if (!sbClient) { status.textContent = "Not connected to Supabase yet."; status.className = "form-status is-error"; return; }
  if (!assigner) { status.textContent = "Complete your Team profile before assigning a task."; status.className = "form-status is-error"; return; }

  const record = {
    title: document.getElementById("t-title").value,
    assigned_to: document.getElementById("t-assigned-to").value,
    assigned_by: assigner.id,
    kin: document.getElementById("t-kin").value || null,
    kiq: document.getElementById("t-kiq").value || null,
    due_date: document.getElementById("t-due").value || null,
    status: document.getElementById("t-status").value,
    created_at: new Date().toISOString(),
  };

  try {
    const { data: createdTask, error } = await sbClient.from("tasks").insert(record).select("id").single();
    if (error) throw error;
    status.textContent = "Assigned.";
    status.className = "form-status is-success";
    try {
      const { data: notification, error: notificationError } = await sbClient.functions.invoke("whatsapp-task-assigned", { body: { task_id: createdTask.id } });
      if (notificationError) {
        console.warn("WhatsApp task notification was not sent:", notificationError);
        status.textContent = "Assigned. The WhatsApp alert could not be sent; check the integration setup.";
      } else if (notification?.sent) {
        status.textContent = "Assigned. A WhatsApp alert was sent to the assignee.";
      } else if (notification?.skipped) {
        status.textContent = "Assigned. The assignee has not connected WhatsApp.";
      }
    } catch (notificationError) {
      console.warn("WhatsApp task notification was not sent:", notificationError);
      status.textContent = "Assigned. The WhatsApp alert could not be sent; check the integration setup.";
    }
    await loadTasks();
    setTimeout(closeAddTaskModal, 400);
  } catch (err) {
    console.error(err);
    status.textContent = "Something went wrong: " + (err.message || err);
    status.className = "form-status is-error";
  }
}

// ============================================================
// ACTIVITY LOG (append-only audit trail)
// ============================================================
async function logActivity(action, details){
  if (!sbClient || !currentUser) return false;
  try {
    const { error } = await sbClient.from("activity_log").insert({
      actor_email: currentUser.email,
      actor_name: myMemberProfile()?.name || currentUser.user_metadata?.full_name || currentUser.email,
      actor_user_id: currentUser.id,
      action,
      details: details || null,
      created_at: new Date().toISOString(),
    });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Activity log failed (non-fatal):", err);
    return false;
  }
}

async function loadActivity(){
  if (!sbClient) { populateActivityFilters(); renderActivity(); return; }
  const pageSize = 1000;
  const activities = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await sbClient.from("activity_log")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) {
      activityLoadError = error;
      console.error("Activity load failed:", error);
      break;
    }
    if (!data) {
      activityLoadError = null;
      currentActivity = activities;
      break;
    }
    activities.push(...data);
    if (data.length < pageSize) {
      activityLoadError = null;
      currentActivity = activities;
      break;
    }
  }
  populateActivityFilters();
  renderActivity();
}

function wireActivityFilters(){
  ["activity-search","activity-filter-user","activity-filter-action","activity-filter-period"].forEach(id => {
    const control = document.getElementById(id);
    control.addEventListener("input", renderActivity);
    control.addEventListener("change", renderActivity);
  });
}

function populateActivityFilters(){
  const userFilter = document.getElementById("activity-filter-user");
  const actionFilter = document.getElementById("activity-filter-action");
  if (!userFilter || !actionFilter) return;

  const selectedUser = userFilter.value;
  const selectedAction = actionFilter.value;
  const users = [...new Set(currentActivity.map(activity => activity.actor_email || "Someone"))].sort((a, b) => a.localeCompare(b));
  const actions = [...new Set(currentActivity.map(activity => activity.action).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  userFilter.innerHTML = `<option value="">All users</option>`;
  users.forEach(user => userFilter.appendChild(new Option(user, user)));
  actionFilter.innerHTML = `<option value="">All actions</option>`;
  actions.forEach(action => actionFilter.appendChild(new Option(action, action)));
  userFilter.value = users.includes(selectedUser) ? selectedUser : "";
  actionFilter.value = actions.includes(selectedAction) ? selectedAction : "";
}

function relativeTime(isoString){
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function activityDateKey(isoString){
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "unknown";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function activityDateLabel(isoString){
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" }).format(date);
}

function renderActivity(){
  const list = document.getElementById("activity-list");
  list.innerHTML = "";
  const emptyState = document.getElementById("activity-empty-state");
  const search = document.getElementById("activity-search").value.trim().toLowerCase();
  const userFilter = document.getElementById("activity-filter-user").value;
  const actionFilter = document.getElementById("activity-filter-action").value;
  const periodFilter = document.getElementById("activity-filter-period").value;
  const now = Date.now();
  const filteredActivities = currentActivity.filter(activity => {
    const actor = activity.actor_email || "Someone";
    if (userFilter && actor !== userFilter) return false;
    if (actionFilter && activity.action !== actionFilter) return false;
    if (search && !`${actor} ${activity.action || ""} ${activity.details || ""}`.toLowerCase().includes(search)) return false;
    if (periodFilter) {
      const createdAt = new Date(activity.created_at).getTime();
      if (!Number.isFinite(createdAt)) return false;
      const ageInDays = (now - createdAt) / 86400000;
      if (periodFilter === "older" ? ageInDays <= 90 : ageInDays > Number(periodFilter)) return false;
    }
    return true;
  });
  emptyState.textContent = activityLoadError && !currentActivity.length
    ? `Could not load activity: ${activityLoadError.message}`
    : currentActivity.length ? "No activity matches these filters." : "No activity recorded yet.";
  emptyState.classList.toggle("is-hidden", filteredActivities.length !== 0);
  const summary = document.getElementById("activity-filter-summary");
  summary.textContent = activityLoadError
    ? `Activity history may be incomplete: ${activityLoadError.message}`
    : `Showing ${filteredActivities.length} of ${currentActivity.length} activities`;
  summary.classList.toggle("is-hidden", currentActivity.length === 0);
  const dates = filteredActivities.reduce((grouped, activity) => {
    const dateKey = activityDateKey(activity.created_at);
    if (!grouped[dateKey]) grouped[dateKey] = { label: activityDateLabel(activity.created_at), activities: [] };
    grouped[dateKey].activities.push(activity);
    return grouped;
  }, {});

  Object.values(dates).forEach(dateGroup => {
    const dateSection = document.createElement("section");
    dateSection.className = "activity-date-group";
    const authors = dateGroup.activities.reduce((grouped, activity) => {
      const author = activity.actor_email || "Someone";
      if (!grouped[author]) grouped[author] = [];
      grouped[author].push(activity);
      return grouped;
    }, {});
    dateSection.innerHTML = `<h2 class="activity-date-heading">${escapeHtml(dateGroup.label)}</h2>`;

    Object.entries(authors).forEach(([author, activities]) => {
      const authorGroup = document.createElement("div");
      authorGroup.className = "activity-author-group";
      const actor = activities[0];
      const profile = currentMembers.find(member => member.user_id === actor.actor_user_id);
      const actorName = profile?.name || actor.actor_name || actor.actor_email || "Unknown user";
      const actorEmail = actor.actor_email || "Email not recorded";
      const avatarUrl = profile?.avatar_path ? getPublicAvatarUrl(profile.avatar_path) : null;
      const avatar = avatarUrl
        ? `<img src="${escapeHtml(avatarUrl)}" alt="" />`
        : escapeHtml(initials(actorName));
      authorGroup.innerHTML = `<h3 class="activity-author-heading"><span class="activity-author-avatar">${avatar}</span><span class="activity-author-identity"><strong>${escapeHtml(actorName)}</strong><small>${escapeHtml(actorEmail)}</small></span><span class="activity-author-count">${activities.length}</span></h3>`;
      activities.forEach(a => {
        const item = document.createElement("div");
        item.className = "activity-item";
        item.innerHTML = `
          <span class="activity-dot"></span>
          <div class="activity-body">
            <div class="activity-line">${escapeHtml(a.action)}${a.details ? ` — ${escapeHtml(a.details)}` : ""}</div>
            <div class="activity-time">${relativeTime(a.created_at)}</div>
          </div>
        `;
        authorGroup.appendChild(item);
      });
      dateSection.appendChild(authorGroup);
    });
    list.appendChild(dateSection);
  });

  renderNotifications();
}

// ============================================================
// REAL-TIME SYNC
// Subscribes to database changes so every open browser tab
// updates automatically, without anyone refreshing.
// ============================================================
function initRealtime(){
  if (!sbClient) return;

  sbClient.channel("public:entries")
    .on("postgres_changes", { event: "*", schema: "public", table: "entries" }, () => loadEntries())
    .subscribe();

  sbClient.channel("public:members")
    .on("postgres_changes", { event: "*", schema: "public", table: "members" }, () => loadMembers())
    .subscribe();

  sbClient.channel("public:tasks")
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => loadTasks())
    .subscribe();

  sbClient.channel("public:task_comments")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "task_comments" }, async () => {
      await loadTaskComments();
      renderTasks();
      renderNotifications();
    })
    .subscribe();

  sbClient.channel("public:documents")
    .on("postgres_changes", { event: "*", schema: "public", table: "documents" }, (payload) => {
      const slug = (payload.new && payload.new.slug) || (payload.old && payload.old.slug);
      if (slug) loadDocument(slug);
    })
    .subscribe();

  sbClient.channel("public:activity_log")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_log" }, (payload) => {
      loadActivity();
      if (payload.new && currentUser && payload.new.actor_email !== currentUser.email) showActivityToast(payload.new);
    })
    .subscribe();
}

function showActivityToast(activity){
  const toast = document.createElement("div");
  toast.className = "activity-toast";
  toast.textContent = `${activity.actor_email || "A teammate"} ${activity.action}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4200);
}

// ---------- UTIL ----------
function escapeHtml(str){
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}