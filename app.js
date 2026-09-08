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

  manual: `HOW DATA IS STORED
Every source lives as one entry in the Repository tab. Each entry stores five required metadata fields — Source, Author, Date, Type of source, Relevance to KIQ — plus the KIN/KIQ it answers and the actual extract file (PDF or image), uploaded directly rather than linked.

HOW TO RETRIEVE DATA
Use the search bar and the KIN / KIQ / source-type filters at the top of the Repository tab. They combine, so you can e.g. filter to KIN2 + "News article" and then search within that. Click any card to open the full entry and download the original file.

HOW CONSISTENCY IS MAINTAINED
The KIN and KIQ dropdowns are generated from config.js, so every entry is tagged against the same fixed list your group defined in Practical 1 — no free-typed variants. File names are generated automatically on upload using the convention below, so naming never depends on who's adding the entry.

FILE NAMING CONVENTION
NEUROBAND_[KIN]_[KIQ]_[SourceType]_[YYYYMMDD]_[shortsourcename].[ext]
Example: NEUROBAND_KIN2_KIQ1_NewsArticle_20240312_BusinessInsiderAfrica.pdf
This is generated for you automatically when you upload a file — you'll see the exact name before you save.

RULES FOR UPDATING THE SYSTEM
- Never delete an entry once the group has discussed it in a meeting — if it turns out to be irrelevant, note that in the relevance field instead, so the group's reasoning stays visible.
- Only add sources that meet the inclusion criteria in the Collection Plan tab.
- If you update config.js (e.g. to add a KIQ), do it once as a group so tags stay consistent across everyone's entries.
- Keep this manual current — if the process changes, edit this page rather than explaining it verbally.

Edit this block directly — it's saved to your Supabase project as soon as you hit Save.`
};

let sbClient = null;
let currentEntries = [];
let currentMembers = [];
let currentTasks = [];
let currentUser = null;
let currentActivity = [];

// ---------- INIT ----------
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initSupabase();
  initAuth();
  renderOverview();
  wireNav();
  wireDocBlocks();
  wireFilters();
  wireModal();
  wireMemberModal();
  wireTaskModal();
  wireAuthModal();
  populateFormDropdowns();
  loadDocument("collection_plan");
  loadDocument("manual");
  loadEntries();
  loadMembers();
  loadTasks();
  loadActivity();
  initRealtime();
});

// ============================================================
// AUTH
// ============================================================
function isAdminEmail(email){
  return !!email && ADMIN_EMAILS.map(e => e.toLowerCase()).includes(email.toLowerCase());
}

async function initAuth(){
  if (!sbClient) { renderAuthBox(); return; }

  const { data: { session } } = await sbClient.auth.getSession();
  currentUser = session ? session.user : null;
  renderAuthBox();

  sbClient.auth.onAuthStateChange((_event, session) => {
    currentUser = session ? session.user : null;
    renderAuthBox();
    renderMembers();   // re-show/hide admin-only controls
    renderEntries();
  });
}

function renderAuthBox(){
  const box = document.getElementById("auth-box");
  if (!currentUser) {
    box.innerHTML = `<button class="btn btn-ghost btn-small" id="open-auth" style="width:100%;">Sign in</button>`;
    document.getElementById("open-auth").addEventListener("click", openAuthModal);
    return;
  }
  const admin = isAdminEmail(currentUser.email);
  box.innerHTML = `
    <div class="auth-signed-in">
      ${admin ? `<span class="auth-admin-badge">ADMIN</span>` : ""}
      <span class="auth-email">${escapeHtml(currentUser.email)}</span>
      <button class="btn btn-ghost btn-small" id="sign-out-btn">Sign out</button>
    </div>
  `;
  document.getElementById("sign-out-btn").addEventListener("click", async () => {
    await sbClient.auth.signOut();
  });
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
      const { error } = await sbClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      status.textContent = "Signed in.";
      status.className = "form-status is-success";
      setTimeout(closeAuthModal, 400);
    } else {
      const { data, error } = await sbClient.auth.signUp({ email, password });
      if (error) throw error;
      if (data.session) {
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
  document.getElementById("theme-toggle").addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    const next = current === "light" ? "dark" : "light";
    applyTheme(next);
    localStorage.setItem("nb-theme", next);
  });
}

function applyTheme(theme){
  document.documentElement.setAttribute("data-theme", theme);
  const btn = document.getElementById("theme-toggle");
  btn.textContent = theme === "light" ? "☾" : "☀";
  btn.title = theme === "light" ? "Switch to dark mode" : "Switch to light mode";
}

function initSupabase(){
  const dot = document.getElementById("conn-dot");
  const label = document.getElementById("conn-label");
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
    });
  });
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

// ---------- DOCUMENT BLOCKS (Collection Plan / Manual) ----------
function wireDocBlocks(){
  document.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => toggleEdit(btn.dataset.edit, true));
  });
  document.querySelectorAll("[data-cancel]").forEach(btn => {
    btn.addEventListener("click", () => toggleEdit(btn.dataset.cancel, false));
  });
  document.querySelectorAll("[data-save]").forEach(btn => {
    btn.addEventListener("click", () => saveDocument(btn.dataset.save));
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
    logActivity("edited the " + (slug === "manual" ? "Manual" : "Collection Plan"));
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
    `;
    card.addEventListener("click", () => openDetail(e));
    grid.appendChild(card);
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
    <div class="detail-field"><div class="k">File name</div><div class="v" style="font-family:var(--font-mono); font-size:12px;">${escapeHtml(entry.file_name || "")}</div></div>
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
  const { data, error } = await sbClient.from("members").select("*").order("created_at", { ascending: true });
  if (!error && data) currentMembers = data;
  renderMembers();
  populateTaskPeopleDropdowns();
}

function initials(name){
  return (name || "?").trim().split(/\s+/).map(w => w[0]).slice(0,2).join("").toUpperCase();
}

function renderMembers(){
  const grid = document.getElementById("member-grid");
  grid.innerHTML = "";
  const isAdmin = currentUser && isAdminEmail(currentUser.email);
  currentMembers.forEach(m => {
    const card = document.createElement("div");
    card.className = "member-card";
    const avatarUrl = getPublicAvatarUrl(m.avatar_path);
    const canEditPhoto = currentUser && (m.user_id === currentUser.id || isAdmin);
    card.innerHTML = `
      ${isAdmin ? `<button class="member-remove" title="Remove member" data-remove-member="${m.id}">&times;</button>` : ""}
      <div class="member-avatar" ${canEditPhoto ? `data-avatar-for="${m.id}" title="Click to change photo"` : ""} style="${canEditPhoto ? "" : "cursor:default;"}">
        ${avatarUrl ? `<img src="${avatarUrl}" alt="${escapeHtml(m.name)}" />` : initials(m.name)}
      </div>
      <div class="member-name">${escapeHtml(m.name)}${m.user_id ? "" : ` <span style="color:var(--text-faint); font-weight:400; font-size:11px;">(unclaimed)</span>`}</div>
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

  updateAddMemberButtonLabel();
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

function updateAddMemberButtonLabel(){
  const btn = document.getElementById("open-add-member");
  if (!btn) return;
  const mine = myMemberProfile();
  btn.textContent = mine ? "Edit my profile" : "+ Add myself";
}

function wireMemberModal(){
  document.getElementById("open-add-member").addEventListener("click", () => {
    if (!requireAuth()) return;
    const mine = myMemberProfile();
    document.getElementById("member-modal-title").textContent = mine ? "Edit my profile" : "Add yourself to the team";
    document.getElementById("m-name").value = mine ? mine.name : "";
    document.getElementById("submit-member").textContent = mine ? "Save changes" : "Add me";
    document.getElementById("member-modal-overlay").classList.remove("is-hidden");
  });
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
}

async function submitMember(e){
  e.preventDefault();
  if (!requireAuth()) return;
  const status = document.getElementById("member-form-status");
  if (!sbClient) { status.textContent = "Not connected to Supabase yet."; status.className = "form-status is-error"; return; }

  const name = document.getElementById("m-name").value;
  const file = document.getElementById("m-avatar").files[0];
  const mine = myMemberProfile();
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
      const { error: updErr } = await sbClient.from("members").update({ name, avatar_path: avatarPath }).eq("id", mine.id);
      if (updErr) throw updErr;
      logActivity("updated their profile", name);
    } else {
      const { error: insErr } = await sbClient.from("members").insert({
        name, avatar_path: avatarPath, user_id: currentUser.id, created_at: new Date().toISOString()
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
      status.textContent = "You already have a profile — refresh and use 'Edit my profile' instead.";
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
  if (!confirm("Remove this member? Tasks assigned to them will remain but show as unassigned.")) return;
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
  renderTasks();
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

function renderTasks(){
  const list = document.getElementById("task-list");
  list.innerHTML = "";
  document.getElementById("task-empty-state").classList.toggle("is-hidden", currentTasks.length !== 0);

  currentTasks.forEach(t => {
    const card = document.createElement("div");
    card.className = "task-card";
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
      <select class="task-status ${statusClass(t.status)}" data-task-id="${t.id}" data-prev-value="${t.status}">
        <option${t.status === "To do" ? " selected" : ""}>To do</option>
        <option${t.status === "In progress" ? " selected" : ""}>In progress</option>
        <option${t.status === "Done" ? " selected" : ""}>Done</option>
      </select>
    `;
    list.appendChild(card);
  });

  list.querySelectorAll(".task-status").forEach(sel => {
    sel.addEventListener("change", (e) => {
      if (!requireAuth()) { e.target.value = e.target.dataset.prevValue || e.target.value; return; }
      e.target.className = "task-status " + statusClass(e.target.value);
      updateTaskStatus(e.target.dataset.taskId, e.target.value);
    });
  });
}

async function updateTaskStatus(taskId, status){
  if (!sbClient) return;
  await sbClient.from("tasks").update({ status }).eq("id", taskId);
  const t = currentTasks.find(x => x.id === taskId);
  if (t) t.status = status;
  logActivity("changed task status", t ? `"${t.title}" → ${status}` : `→ ${status}`);
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

function renderActivity(){
  const list = document.getElementById("activity-list");
  list.innerHTML = "";
  document.getElementById("activity-empty-state").classList.toggle("is-hidden", currentActivity.length !== 0);

  currentActivity.forEach(a => {
    const item = document.createElement("div");
    item.className = "activity-item";
    item.innerHTML = `
      <span class="activity-dot"></span>
      <div class="activity-body">
        <div class="activity-line"><span class="activity-actor">${escapeHtml(a.actor_email || "Someone")}</span> ${escapeHtml(a.action)}${a.details ? ` — ${escapeHtml(a.details)}` : ""}</div>
        <div class="activity-time">${relativeTime(a.created_at)}</div>
      </div>
    `;
    list.appendChild(item);
  });
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

  sbClient.channel("public:documents")
    .on("postgres_changes", { event: "*", schema: "public", table: "documents" }, (payload) => {
      const slug = (payload.new && payload.new.slug) || (payload.old && payload.old.slug);
      if (slug) loadDocument(slug);
    })
    .subscribe();

  sbClient.channel("public:activity_log")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_log" }, () => loadActivity())
    .subscribe();
}

// ---------- UTIL ----------
function escapeHtml(str){
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}