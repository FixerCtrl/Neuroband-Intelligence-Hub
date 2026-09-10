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
NEUROBAND_[KIN]_[KIQ]_[SourceType]_[YYYYMMDD]_[ShortSourceName].[ext]
Example: NEUROBAND_KIN2_KIQ1_NewsArticle_20240312_BusinessInsiderAfrica.pdf

SYSTEM UPDATE RULES
- Do not delete sources that have been discussed in meetings.
- If a source becomes irrelevant, update Relevance to explain why.
- Add only sources that meet the inclusion criteria in the Collection Plan tab.
- Update config.js as a group so KIN and KIQ tags remain consistent.

Edit this page when the process changes. Changes are saved after selecting Save changes.`
};

let sbClient = null;
let currentEntries = [];
let currentMembers = [];
let currentTasks = [];
let currentTaskComments = [];
let taskCommentsUnavailable = false;
let currentTaskView = "mine";
let currentUser = null;
let currentActivity = [];
let calendarCurrentDate = new Date();
let myWorkFilter = "all";

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
  wireNotifications();
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

async function initAuth(){
  if (!sbClient) { renderAuthBox(); return; }

  const { data: { session } } = await sbClient.auth.getSession();
  currentUser = session ? session.user : null;
  if (currentUser) {
    await ensureMyProfile();
    await loadMembers();
  }
  renderAuthBox();

  sbClient.auth.onAuthStateChange(async (event, session) => {
    currentUser = session ? session.user : null;
    if (currentUser) {
      await ensureMyProfile(event === "SIGNED_IN");
      await loadMembers();
    }
    refreshIdentityUI();
    renderEntries();
  });
}

// Update every identity-dependent view immediately after authentication changes.
// The auth state event is useful as a fallback, but it is not guaranteed to run
// before the sign-in form needs to reflect the newly authenticated user.
function refreshIdentityUI(){
  renderAuthBox();
  renderMembers();   // re-show/hide admin-only controls and refresh the profile card
  renderTasks();
  renderNotifications();
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
        <div class="auth-mini-avatar">${avatarUrl ? `<img src="${avatarUrl}" alt="" />` : initials(mine ? mine.name : currentUser.email.split("@")[0])}</div>
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
    const latestNotification = [...currentActivity, ...currentTaskComments, ...currentTasks].reduce((latest, item) => {
      const createdAt = new Date(item.created_at).getTime();
      return Number.isFinite(createdAt) && createdAt > latest ? createdAt : latest;
    }, 0);
    localStorage.setItem(notificationSeenStorageKey(), new Date(latestNotification || Date.now()).toISOString());
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
    .filter(task => currentUser && mine && task.assigned_to === mine.id)
    .map(task => ({ ...task, action: "New task assigned", details: task.title }));
  const taskNotifications = currentTaskComments
    .filter(comment => {
      const task = currentTasks.find(item => String(item.id) === String(comment.task_id));
      return currentUser && mine && comment.author_id !== mine.id && task && (task.assigned_to === mine.id || task.assigned_by === mine.id || isAdminEmail(currentUser.email));
    })
    .map(comment => {
      const task = currentTasks.find(item => String(item.id) === String(comment.task_id));
      return { ...comment, action: `Comment on ${task ? task.title : "assigned task"}`, details: comment.body };
    });
  const notifications = [...currentActivity, ...taskAssignments, ...taskNotifications].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const recent = notifications.slice(0, 8);
  const unread = notifications.filter(item => new Date(item.created_at).getTime() > seenAt).length;
  count.textContent = unread > 9 ? "9+" : String(unread);
  count.classList.toggle("is-hidden", unread === 0);
  if (!recent.length) {
    list.innerHTML = `<p class="notification-empty">No activity yet.</p>`;
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

// Call this at the top of anything that writes to the database.
// Returns true if the user may proceed; otherwise opens the
// sign-in modal and returns false.
function requireAuth(){
  if (currentUser) return true;
  openAuthModal();
  return false;
}

let authMode = "signin"; // or "signup"

function wireAuthModal(){
  document.getElementById("open-auth")?.addEventListener("click", openAuthModal);
  document.getElementById("close-auth").addEventListener("click", closeAuthModal);
  document.getElementById("auth-modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "auth-modal-overlay") closeAuthModal();
  });
  document.getElementById("auth-toggle-mode").addEventListener("click", () => {
    authMode = authMode === "signin" ? "signup" : "signin";
    updateAuthModalMode();
  });
  document.getElementById("auth-form").addEventListener("submit", submitAuth);
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
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("is-active"));
      document.querySelectorAll(".panel").forEach(p => p.classList.remove("is-active"));
      btn.classList.add("is-active");
      document.getElementById("panel-" + btn.dataset.tab).classList.add("is-active");
      closeMobileSidebar();
    });
  });
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
  const grid = document.getElementById("kin-grid");
  grid.innerHTML = "";
  KINS.forEach(kin => {
    const card = document.createElement("div");
    card.className = "kin-card";
    card.innerHTML = `
      <span class="kin-id">${kin.id}</span>
      <h3>${escapeHtml(kin.label)}</h3>
      <ul>${kin.kiqs.map(q => `<li><strong>${q.id}</strong> — ${escapeHtml(q.label)}</li>`).join("")}</ul>
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

function toggleEdit(slug, editing){
  document.getElementById("view-" + slug).classList.toggle("is-hidden", editing);
  document.getElementById("edit-" + slug).classList.toggle("is-hidden", !editing);
  const block = document.querySelector(`.doc-block[data-slug="${slug}"]`);
  block.querySelector(`[data-edit]`).classList.toggle("is-hidden", editing);
  block.querySelector(`[data-save]`).classList.toggle("is-hidden", !editing);
  block.querySelector(`[data-cancel]`).classList.toggle("is-hidden", !editing);
  if (editing) {
    document.getElementById("edit-" + slug).value = document.getElementById("view-" + slug).dataset.raw || DEFAULT_DOCS[slug];
  }
}

async function loadDocument(slug){
  const viewEl = document.getElementById("view-" + slug);
  let content = DEFAULT_DOCS[slug];
  if (sbClient) {
    const { data, error } = await sbClient.from("documents").select("content").eq("slug", slug).maybeSingle();
    if (!error && data) content = data.content;
  }
  viewEl.textContent = content;
  viewEl.dataset.raw = content;
}

async function saveDocument(slug){
  if (!requireAuth()) return;
  const newContent = document.getElementById("edit-" + slug).value;
  document.getElementById("view-" + slug).textContent = newContent;
  document.getElementById("view-" + slug).dataset.raw = newContent;
  toggleEdit(slug, false);
  if (sbClient) {
    await sbClient.from("documents").upsert({ slug, content: newContent, updated_at: new Date().toISOString() });
    logActivity("updated the " + (slug === "manual" ? "Manual" : "Collection Plan"));
  }
}

// ---------- REPOSITORY: dropdowns ----------
function populateFormDropdowns(){
  const kinSelect = document.getElementById("f-kin");
  const filterKin = document.getElementById("filter-kin");
  KINS.forEach(kin => {
    kinSelect.appendChild(new Option(`${kin.id} — ${kin.label}`, kin.id));
    filterKin.appendChild(new Option(`${kin.id} — ${kin.label}`, kin.id));
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

  document.getElementById("f-file").addEventListener("change", updateFilenamePreview);
  ["f-kin","f-kiq","f-type","f-source","f-date-pub"].forEach(id => {
    document.getElementById(id).addEventListener("change", updateFilenamePreview);
  });
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
  return `${PROJECT_TAG}_${kin}_${kiq}_${type}_${dateStr}_${source}${ext}`;
}

function updateFilenamePreview(){
  const preview = document.getElementById("filename-preview");
  preview.textContent = "Will be saved as: " + buildFileName();
}

// ---------- REPOSITORY: filters ----------
function wireFilters(){
  ["filter-search","filter-kin","filter-kiq","filter-type"].forEach(id => {
    document.getElementById(id).addEventListener("input", renderEntries);
    document.getElementById(id).addEventListener("change", renderEntries);
  });
}

// ---------- REPOSITORY: load / render ----------
async function loadEntries(){
  if (!sbClient) { renderEntries(); return; }
  const { data, error } = await sbClient.from("entries").select("*").order("created_at", { ascending: false });
  if (!error && data) currentEntries = data;
  document.getElementById("entry-count").textContent = `${currentEntries.length} ${currentEntries.length === 1 ? "entry" : "entries"} stored`;
  renderEntries();
  renderAnalysis();
}

function renderEntries(){
  const search = document.getElementById("filter-search").value.toLowerCase();
  const kin = document.getElementById("filter-kin").value;
  const kiq = document.getElementById("filter-kiq").value;
  const type = document.getElementById("filter-type").value;

  const filtered = currentEntries.filter(e => {
    if (kin && e.kin !== kin) return false;
    if (kiq && e.kiq !== kiq) return false;
    if (type && e.source_type !== type) return false;
    if (search) {
      const hay = `${e.source} ${e.author} ${e.relevance}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  const grid = document.getElementById("card-grid");
  grid.innerHTML = "";
  document.getElementById("empty-state").classList.toggle("is-hidden", filtered.length !== 0);

  filtered.forEach(e => {
    const card = document.createElement("div");
    card.className = "entry-card";
    card.innerHTML = `
      <div class="entry-tags">
        <span class="tag tag-kin">${e.kin}</span>
        <span class="tag tag-kiq">${e.kiq}</span>
      </div>
      <p class="entry-source">${escapeHtml(e.source)}</p>
      <div class="entry-meta">${escapeHtml(e.author)} · ${e.date_published || "—"} · ${escapeHtml(e.source_type)}</div>
      <div class="entry-relevance">${escapeHtml(truncate(e.relevance, 110))}</div>
      ${canManageLeadership() ? `<div class="entry-actions"><button class="btn btn-danger-ghost btn-small entry-delete" data-entry-id="${e.id}">Delete entry</button></div>` : ""}
    `;
    card.addEventListener("click", () => openDetail(e));
    grid.appendChild(card);
  });

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
      if (entry.file_path) await sbClient.storage.from("sources").remove([entry.file_path]);
      logActivity("deleted a repository entry", entry.source);
      await loadEntries();
    });
  });
}

function truncate(str, n){ return str && str.length > n ? str.slice(0, n) + "…" : (str || ""); }

// ---------- DETAIL MODAL ----------
function openDetail(entry){
  const modal = document.getElementById("detail-modal");
  const fileUrl = getPublicFileUrl(entry.file_path);
  modal.innerHTML = `
    <div class="detail-head">
      <h2>${escapeHtml(entry.source)}</h2>
      <button class="modal-close" id="close-detail">&times;</button>
    </div>
    <div class="entry-tags" style="margin-bottom:16px;">
      <span class="tag tag-kin">${entry.kin}</span>
      <span class="tag tag-kiq">${entry.kiq}</span>
    </div>
    <div class="detail-field"><div class="k">Author / organisation</div><div class="v">${escapeHtml(entry.author)}</div></div>
    <div class="detail-field"><div class="k">Date published / collected</div><div class="v">${entry.date_published || "—"} / ${entry.date_collected || "—"}</div></div>
    <div class="detail-field"><div class="k">Type of source</div><div class="v">${escapeHtml(entry.source_type)}</div></div>
    <div class="detail-field"><div class="k">Relevance to KIQ</div><div class="v">${escapeHtml(entry.relevance)}</div></div>
    <div class="detail-field"><div class="k">File name</div><div class="v" style="font-family:var(--font-sans); font-size:12px;">${escapeHtml(entry.file_name || "")}</div></div>
    ${fileUrl ? `<a class="detail-file-link" href="${fileUrl}" target="_blank" rel="noopener">Open extract →</a>` : ""}
  `;
  document.getElementById("close-detail").addEventListener("click", closeDetail);
  document.getElementById("detail-overlay").classList.remove("is-hidden");
}

function closeDetail(){ document.getElementById("detail-overlay").classList.add("is-hidden"); }

function getPublicFileUrl(path){
  if (!path || !sbClient) return null;
  const { data } = sbClient.storage.from("sources").getPublicUrl(path);
  return data ? data.publicUrl : null;
}

// ---------- ADD ENTRY MODAL ----------
function wireModal(){
  document.getElementById("open-add-entry").addEventListener("click", () => {
    if (!requireAuth()) return;
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

  try {
    const { error: uploadError } = await sbClient.storage.from("sources").upload(fileName, file, { upsert: true });
    if (uploadError) throw uploadError;

    const record = {
      kin: document.getElementById("f-kin").value,
      kiq: document.getElementById("f-kiq").value,
      source: document.getElementById("f-source").value,
      author: document.getElementById("f-author").value,
      source_type: document.getElementById("f-type").value,
      date_published: document.getElementById("f-date-pub").value,
      date_collected: document.getElementById("f-date-collected").value,
      relevance: document.getElementById("f-relevance").value,
      file_path: fileName,
      file_name: fileName,
      created_at: new Date().toISOString(),
    };

    const { error: insertError } = await sbClient.from("entries").insert(record);
    if (insertError) throw insertError;

    logActivity("added a source", `${record.source} (${record.kin}_${record.kiq})`);

    status.textContent = "Saved.";
    status.className = "form-status is-success";
    await loadEntries();
    setTimeout(closeAddModal, 500);
  } catch (err) {
    console.error(err);
    status.textContent = "Something went wrong: " + (err.message || err);
    status.className = "form-status is-error";
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
  const memberFields = canManageLeadership() ? "*" : "id,name,avatar_path,bio,user_id,created_at";
  const { data, error } = await sbClient.from("members").select(memberFields).order("created_at", { ascending: true });
  if (!error && data) currentMembers = data;
  renderMembers();
  renderAuthBox(); // members just loaded, so the sidebar can now show your claimed avatar/name
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
    directoryNote.textContent = canModerate ? "Admin view: presence and login history are visible only to admins." : "Your profile is shown above. Other team members are listed here.";
    directoryNote.classList.toggle("is-hidden", visibleMembers.length === 0);
  }
  visibleMembers.forEach(m => {
    const card = document.createElement("div");
    card.className = "member-card";
    const avatarUrl = getPublicAvatarUrl(m.avatar_path);
    const canEditPhoto = currentUser && (m.user_id === currentUser.id || canModerate);
    card.innerHTML = `
      ${canModerate ? `<div class="member-card-actions"><button class="member-edit" title="Edit member" data-edit-member="${m.id}">Edit</button><button class="member-remove" title="Remove member profile" data-remove-member="${m.id}">&times;</button></div>` : ""}
      <div class="member-avatar" ${canEditPhoto ? `data-avatar-for="${m.id}" title="Click to change photo"` : ""} style="${canEditPhoto ? "" : "cursor:default;"}">
        ${avatarUrl ? `<img src="${avatarUrl}" alt="${escapeHtml(m.name)}" />` : initials(m.name)}
      </div>
      <div class="member-name">${escapeHtml(m.name)}${m.user_id ? "" : ` <span style="color:var(--text-faint); font-weight:400; font-size:11px;">(unclaimed)</span>`}</div>
      ${m.bio ? `<div class="member-bio">${escapeHtml(m.bio)}</div>` : ""}
      ${m.user_id ? `<div class="member-presence ${isMemberOnline(m) ? "is-online" : ""}"><span class="presence-dot"></span>${isMemberOnline(m) ? "Online now" : `Last seen ${formatPresenceTime(m.last_seen_at)}`}${m.last_login_at ? ` · Login ${formatPresenceTime(m.last_login_at)}` : ""}</div>` : ""}
      ${canEditPhoto ? `<div class="member-avatar-hint">Click photo to update</div>` : ""}
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

  renderYourProfile();
}

function renderYourProfile(){
  const slot = document.getElementById("your-profile-slot");
  if (!slot) return;

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
    <div class="profile-workspace">
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
      <section class="my-work" aria-labelledby="my-work-title">
        <div class="my-work-head">
          <div>
            <p class="eyebrow">Personal dashboard</p>
            <h2 id="my-work-title">My work</h2>
          </div>
          <div class="my-work-counts" id="my-work-counts"></div>
        </div>
        <div class="my-work-list" id="my-work-list"></div>
        <p class="empty-state is-hidden" id="my-work-empty">You have no open tasks right now.</p>
      </section>
    </div>
  `;
  document.getElementById("your-profile-edit-btn").addEventListener("click", openOwnProfileEditor);
  document.getElementById("your-profile-avatar-click").addEventListener("click", () => reuploadAvatar(mine.id));
}

function openOwnProfileEditor(){
  if (!requireAuth()) return;
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
  const existing = currentMembers.find(member => member.user_id === currentUser.id);
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
    last_seen_at: now,
    last_login_at: isNewLogin ? now : null,
    created_at: now
  }).select().single();
  if (!error && data) currentMembers.push(data);
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
  if (!requireAuth()) return;
  const status = document.getElementById("member-form-status");
  if (!sbClient) { status.textContent = "Not connected to Supabase yet."; status.className = "form-status is-error"; return; }

  const name = document.getElementById("m-name").value;
  const bio = document.getElementById("m-bio").value;
  const file = document.getElementById("m-avatar").files[0];
  const mine = memberEditorTargetId ? currentMembers.find(member => member.id === memberEditorTargetId) : myMemberProfile();
  if (memberEditorTargetId && !canManageLeadership()) return;
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
      const { error: updErr } = await sbClient.from("members").update({ name, bio, avatar_path: avatarPath }).eq("id", mine.id);
      if (updErr) throw updErr;
      logActivity(memberEditorTargetId ? "updated a member profile" : "updated their profile", name);
    } else {
      const { error: insErr } = await sbClient.from("members").insert({
        name, bio, avatar_path: avatarPath, user_id: currentUser.id, created_at: new Date().toISOString()
      });
      if (insErr) throw insErr;
      logActivity("joined the team", name);
    }

    status.textContent = "Saved.";
    status.className = "form-status is-success";
    await loadMembers();
    setTimeout(closeAddMemberModal, 400);
  } catch (err) {
    console.error(err);
    if ((err.message || "").toLowerCase().includes("duplicate")) {
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
  const member = currentMembers.find(m => m.id === memberId);
  await sbClient.from("members").delete().eq("id", memberId);
  logActivity("removed a team member", member ? member.name : undefined);
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
  if (!list || !counts || !empty) return;

  const mine = myMemberProfile();
  if (!currentUser || !mine) {
    counts.innerHTML = `<span class="work-count">Sign in to see your tasks</span>`;
    list.innerHTML = `<div class="my-work-signin">Your personal task dashboard will appear here once you sign in and claim your team profile.</div>`;
    empty.classList.add("is-hidden");
    renderCalendar();
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
        <div class="task-people">${personInlineHtml(t.assigned_to)} ← assigned by ${personInlineHtml(t.assigned_by)}</div>
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
        <div class="task-channel-head"><strong>Team channel</strong><span>${comments.length} comment${comments.length === 1 ? "" : "s"}</span></div>
        <div class="task-comments">${taskCommentsUnavailable ? `<p class="task-comments-setup">Comments are temporarily unavailable. An admin needs to run the latest <strong>schema.sql</strong> in Supabase.</p>` : comments.length ? comments.map(comment => `
          <div class="task-comment">
            <div class="task-comment-meta"><strong>${escapeHtml(memberById(comment.author_id)?.name || comment.author_email || "Team member")}</strong><small>${relativeTime(comment.created_at)}</small></div>
            <p>${escapeHtml(comment.body)}</p>
          </div>
        `).join("") : `<p class="task-comments-empty">Ask a question or leave a note about this task.</p>`}</div>
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
      const originalAssignee = currentAssignee ? currentAssignee.name : "Unassigned";
      try {
        await sbClient.from("tasks").update({ assigned_to: selected.id, assigned_by: previousAssigner }).eq("id", task.id);
        task.assigned_to = selected.id;
        if (previousAssigner) task.assigned_by = previousAssigner;
        logActivity("reassigned a task", `"${task.title}" from ${originalAssignee} to ${selected.name}`);
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
      logActivity("deleted a task", `"${task.title}"`);
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
}

async function updateTaskStatus(taskId, status){
  if (!sbClient) return;
  const task = currentTasks.find(x => x.id === taskId);
  if (!task || !canChangeTaskStatus(task)) {
    alert("Only the assigned member or the admin can change this task status.");
    return;
  }
  await sbClient.from("tasks").update({ status }).eq("id", taskId);
  if (task) task.status = status;
  logActivity("changed task status", task ? `"${task.title}" → ${status}` : `→ ${status}`);
}

function populateTaskPeopleDropdowns(){
  const to = document.getElementById("t-assigned-to");
  const by = document.getElementById("t-assigned-by");
  [to, by].forEach(sel => { sel.innerHTML = ""; });
  currentMembers.forEach(m => {
    to.appendChild(new Option(m.name, m.id));
    by.appendChild(new Option(m.name, m.id));
  });
}

function populateTaskKinKiqDropdowns(){
  const kinSelect = document.getElementById("t-kin");
  kinSelect.innerHTML = `<option value="">—</option>`;
  KINS.forEach(kin => kinSelect.appendChild(new Option(`${kin.id} — ${kin.label}`, kin.id)));
  kinSelect.addEventListener("change", () => updateTaskKiqOptions(kinSelect.value));
  updateTaskKiqOptions("");
}

function updateTaskKiqOptions(kinId){
  const kiqSelect = document.getElementById("t-kiq");
  kiqSelect.innerHTML = `<option value="">—</option>`;
  const kin = KINS.find(k => k.id === kinId);
  (kin ? kin.kiqs : []).forEach(q => kiqSelect.appendChild(new Option(`${q.id} — ${q.label}`, q.id)));
}

function wireTaskModal(){
  populateTaskKinKiqDropdowns();
  document.getElementById("open-add-task").addEventListener("click", () => {
    if (!requireAuth()) return;
    if (currentMembers.length === 0) {
      alert("Add at least one team member first, so there's someone to assign the task to.");
      return;
    }
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
  const status = document.getElementById("task-form-status");
  if (!sbClient) { status.textContent = "Not connected to Supabase yet."; status.className = "form-status is-error"; return; }

  const record = {
    title: document.getElementById("t-title").value,
    assigned_to: document.getElementById("t-assigned-to").value,
    assigned_by: document.getElementById("t-assigned-by").value,
    kin: document.getElementById("t-kin").value || null,
    kiq: document.getElementById("t-kiq").value || null,
    due_date: document.getElementById("t-due").value || null,
    status: document.getElementById("t-status").value,
    created_at: new Date().toISOString(),
  };

  try {
    const { error } = await sbClient.from("tasks").insert(record);
    if (error) throw error;
    const assignee = memberById(record.assigned_to);
    logActivity("assigned a task", `"${record.title}" to ${assignee ? assignee.name : "someone"}`);
    status.textContent = "Assigned.";
    status.className = "form-status is-success";
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
  if (!sbClient || !currentUser) return;
  try {
    await sbClient.from("activity_log").insert({
      actor_email: currentUser.email,
      action,
      details: details || null,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Activity log failed (non-fatal):", err);
  }
}

async function loadActivity(){
  if (!sbClient) { renderActivity(); return; }
  const { data, error } = await sbClient.from("activity_log").select("*").order("created_at", { ascending: false }).limit(200);
  if (!error && data) currentActivity = data;
  renderActivity();
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
  document.getElementById("activity-empty-state").classList.toggle("is-hidden", currentActivity.length !== 0);
  const canManageActivities = !!currentUser && isAdminEmail(currentUser.email);
  const dates = currentActivity.reduce((grouped, activity) => {
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
      authorGroup.innerHTML = `<h3 class="activity-author-heading"><span class="activity-author-avatar">${escapeHtml(initials(author))}</span>${escapeHtml(author)}<span class="activity-author-count">${activities.length}</span></h3>`;
      activities.forEach(a => {
        const item = document.createElement("div");
        item.className = "activity-item";
        item.innerHTML = `
          <span class="activity-dot"></span>
          <div class="activity-body">
            <div class="activity-line">${escapeHtml(a.action)}${a.details ? ` — ${escapeHtml(a.details)}` : ""}</div>
            <div class="activity-time">${relativeTime(a.created_at)}</div>
          </div>
          ${canManageActivities ? `<div class="activity-actions"><button class="btn btn-ghost btn-small" data-edit-activity-id="${a.id}">Edit</button><button class="btn btn-ghost btn-small" data-delete-activity-id="${a.id}">Delete</button></div>` : ""}
        `;
        authorGroup.appendChild(item);
      });
      dateSection.appendChild(authorGroup);
    });
    list.appendChild(dateSection);
  });

  renderNotifications();

  list.querySelectorAll("[data-edit-activity-id]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!canManageActivities) return;
      const activity = currentActivity.find(a => String(a.id) === btn.dataset.editActivityId);
      if (!activity) return;
      const original = `${activity.action}${activity.details ? ` — ${activity.details}` : ""}`;
      const next = prompt("Edit this activity entry:", original);
      if (next === null) return;
      const [action, ...rest] = next.split(" — ");
      const details = rest.join(" — ").trim() || null;
      await sbClient.from("activity_log").update({ action: action.trim(), details }).eq("id", activity.id);
      await loadActivity();
    });
  });

  list.querySelectorAll("[data-delete-activity-id]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!canManageActivities) return;
      if (!confirm("Delete this activity entry?")) return;
      await sbClient.from("activity_log").delete().eq("id", btn.dataset.deleteActivityId);
      await loadActivity();
    });
  });
}

function canManageActivities(){
  return !!currentUser && isAdminEmail(currentUser.email);
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