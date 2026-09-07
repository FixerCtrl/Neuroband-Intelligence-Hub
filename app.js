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

// ---------- INIT ----------
document.addEventListener("DOMContentLoaded", () => {
  initSupabase();
  renderOverview();
  wireNav();
  wireDocBlocks();
  wireFilters();
  wireModal();
  populateFormDropdowns();
  loadDocument("collection_plan");
  loadDocument("manual");
  loadEntries();
});

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
  const newContent = document.getElementById("edit-" + slug).value;
  document.getElementById("view-" + slug).textContent = newContent;
  document.getElementById("view-" + slug).dataset.raw = newContent;
  toggleEdit(slug, false);
  if (sbClient) {
    await sbClient.from("documents").upsert({ slug, content: newContent, updated_at: new Date().toISOString() });
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

// ---------- UTIL ----------
function escapeHtml(str){
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}