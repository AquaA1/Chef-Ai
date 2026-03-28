/* ─── STATE ─── */
let userId   = null;
let history  = [];   // local mirror
let activeEntryId = null;

/* ─── PANTRY MEMORY (localStorage) ─── */
const PANTRY_KEY       = "mise_pantry_history";
const PANTRY_SAVED_KEY = "mise_pantry_saved";
const MAX_PANTRY = 10;

function getPantryHistory() {
  try { return JSON.parse(localStorage.getItem(PANTRY_KEY) || "[]"); }
  catch { return []; }
}
function saveToPantry(ingredientsStr) {
  const list = getPantryHistory().filter(s => s !== ingredientsStr);
  list.unshift(ingredientsStr);
  localStorage.setItem(PANTRY_KEY, JSON.stringify(list.slice(0, MAX_PANTRY)));
}


const EMOJI_MAP = {
  tomato:"🍅",cheese:"🧀",egg:"🥚",chicken:"🍗",rice:"🍚",pasta:"🍝",
  potato:"🥔",onion:"🧅",garlic:"🧄",carrot:"🥕",spinach:"🥬",mushroom:"🍄",
  lemon:"🍋",butter:"🧈",milk:"🥛",bread:"🍞",beef:"🥩",fish:"🐟",shrimp:"🍤",
  corn:"🌽",pepper:"🌶️",avocado:"🥑",banana:"🍌",apple:"🍎",lime:"🍋",
  bacon:"🥓",tofu:"🍱",broccoli:"🥦",bean:"🫘",noodle:"🍜",herb:"🌿",
  basil:"🌿",chili:"🌶️",ginger:"🫚",coconut:"🥥",mango:"🥭",salt:"🧂",oil:"🫒"
};
function ingEmoji(word) {
  const w = word.toLowerCase().trim();
  for (const [k,e] of Object.entries(EMOJI_MAP)) if (w.includes(k)) return e;
  return "🥄";
}
function avatarChar(id) {
  return id ? id.charAt(0).toUpperCase() : "?";
}
function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined,{month:"short",day:"numeric"}) + " " +
         d.toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"});
}

document.addEventListener('DOMContentLoaded', function() {

/* ─── DOM REFS ─── */
const loginScreen      = document.getElementById("login-screen");
const appScreen        = document.getElementById("app-screen");
const passwordInput    = document.getElementById("password-input");
const loginBtn         = document.getElementById("login-btn");
const loginError       = document.getElementById("login-error");
const userBadge        = document.getElementById("user-badge");
const sidebar          = document.getElementById("sidebar");
const sidebarOverlay   = document.getElementById("sidebar-overlay");
const sidebarToggle    = document.getElementById("sidebar-toggle");
const sidebarClose     = document.getElementById("sidebar-close");
const sidebarAvatar    = document.getElementById("sidebar-avatar");
const sidebarUserid    = document.getElementById("sidebar-userid");
const logoutBtn        = document.getElementById("logout-btn");
const clearHistoryBtn  = document.getElementById("clear-history-btn");
const historyList      = document.getElementById("history-list");
const ingredientsInput = document.getElementById("ingredients-input");
const tagCloud         = document.getElementById("tag-cloud");
const generateBtn      = document.getElementById("generate-btn");
const loadingEl        = document.getElementById("loading");
const resultsEl        = document.getElementById("results");
const resultsTitle     = document.getElementById("results-title");
const recipeGrid       = document.getElementById("recipe-grid");
const retryBtn         = document.getElementById("retry-btn");
const modal            = document.getElementById("recipe-modal");
const modalClose       = document.getElementById("modal-close");
const modalBody        = document.getElementById("modal-body");

/* ─── LOGIN ─── */
loginBtn.addEventListener("click", handleAuth);
passwordInput.addEventListener("keydown", e => { if (e.key === "Enter") handleAuth(); });

async function handleAuth() {
  const pw = passwordInput.value.trim();
  if (!pw) return;
  loginBtn.disabled = true;
  loginBtn.textContent = "…";
  loginError.classList.add("hidden");

  try {
    const res  = await fetch("/auth", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    const data = await res.json();
    if (data.success) {
      userId = data.userId;
      showApp(data.isNew);
    } else {
      showLoginError(data.message || "Something went wrong.");
    }
  } catch {
    showLoginError("Cannot reach the server. Is it running?");
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Go";
  }
}

function showLoginError(msg) {
  loginError.textContent = msg;
  loginError.classList.remove("hidden");
  passwordInput.value = "";
  passwordInput.focus();
  passwordInput.classList.add("shake");
  setTimeout(() => passwordInput.classList.remove("shake"), 500);
}

async function showApp(isNew) {
  loginScreen.classList.remove("active");
  appScreen.style.display = "flex";
  userBadge.textContent = "👤 " + userId;
  sidebarAvatar.textContent = avatarChar(userId);
  sidebarUserid.textContent = userId;
  ingredientsInput.focus();
  // Inject pantry dropdown if not already present
  if (!document.getElementById("pantry-dropdown")) {
    const wrap = ingredientsInput.parentElement;
    wrap.style.position = "relative";
    const dd = document.createElement("div");
    dd.id = "pantry-dropdown";
    dd.className = "pantry-dropdown hidden";
    wrap.appendChild(dd);
    ingredientsInput.addEventListener("focus", showPantryDropdown);
    ingredientsInput.addEventListener("input", showPantryDropdown);
    document.addEventListener("click", e => {
      if (!wrap.contains(e.target)) dd.classList.add("hidden");
    });
  }
  if (!isNew) await loadHistory();
  initPantryPanel();
}

/* ─── LOGOUT ─── */
logoutBtn.addEventListener("click", () => {
  userId = null; history = []; activeEntryId = null;
  closeSidebar();
  appScreen.style.display = "none";
  loginScreen.classList.add("active");
  passwordInput.value = "";
  resultsEl.classList.add("hidden");
  ingredientsInput.value = "";
  tagCloud.innerHTML = "";
});

/* ─── SIDEBAR ─── */
sidebarToggle.addEventListener("click", () => sidebar.classList.contains("open") ? closeSidebar() : openSidebar());
sidebarClose.addEventListener("click", closeSidebar);
sidebarOverlay.addEventListener("click", closeSidebar);

function openSidebar()  { sidebar.classList.add("open"); sidebarOverlay.classList.add("visible"); }
function closeSidebar() { sidebar.classList.remove("open"); sidebarOverlay.classList.remove("visible"); }

/* ─── HISTORY ─── */
async function loadHistory() {
  try {
    const res  = await fetch(`/history/${userId}`);
    const data = await res.json();
    history = data.history || [];
    renderHistoryList();
  } catch { console.error("Failed to load history"); }
}

function renderHistoryList() {
  historyList.innerHTML = "";
  if (!history.length) {
    historyList.innerHTML = '<div class="history-empty">No searches yet.<br>Generate your first recipe!</div>';
    return;
  }
  history.forEach(entry => historyList.appendChild(buildHistoryItem(entry)));
}

function buildHistoryItem(entry) {
  const el = document.createElement("div");
  el.className = "history-item" + (entry.id === activeEntryId ? " active-item" : "");
  el.dataset.id = entry.id;

  const header = document.createElement("div");
  header.className = "history-item-header";
  const ing = document.createElement("div");
  ing.className = "history-ingredients";
  ing.textContent = entry.ingredients;
  const del = document.createElement("button");
  del.className = "history-delete";
  del.title = "Remove";
  del.textContent = "✕";
  del.addEventListener("click", e => { e.stopPropagation(); deleteEntry(entry.id); });
  header.appendChild(ing);
  header.appendChild(del);

  const meta = document.createElement("div");
  meta.className = "history-meta";
  const time = document.createElement("span");
  time.className = "history-time";
  time.textContent = formatTime(entry.timestamp);
  const count = document.createElement("span");
  count.className = "history-count";
  count.textContent = (entry.recipes||[]).length + " recipes";
  meta.appendChild(time);
  meta.appendChild(count);

  el.appendChild(header);
  el.appendChild(meta);
  el.addEventListener("click", () => recallEntry(entry));
  return el;
}

function recallEntry(entry) {
  activeEntryId = entry.id;
  ingredientsInput.value = entry.ingredients;
  updateTagCloud();
  renderRecipes(entry.recipes, entry.ingredients, true);
  closeSidebar();
  // Highlight active item
  document.querySelectorAll(".history-item").forEach(el => {
    el.classList.toggle("active-item", el.dataset.id === entry.id);
  });
}

async function deleteEntry(entryId) {
  history = history.filter(h => h.id !== entryId);
  renderHistoryList();
  try { await fetch(`/history/${userId}/${entryId}`, { method: "DELETE" }); }
  catch { console.error("Delete failed"); }
}

clearHistoryBtn.addEventListener("click", async () => {
  if (!history.length) return;
  if (!confirm("Clear all search history?")) return;
  history = [];
  activeEntryId = null;
  renderHistoryList();
  try { await fetch(`/history/${userId}`, { method: "DELETE" }); }
  catch { console.error("Clear failed"); }
});

/* ─── TAG CLOUD ─── */
ingredientsInput.addEventListener("input", updateTagCloud);
function updateTagCloud() {
  const words = ingredientsInput.value.split(/[,;\n]+/).map(w => w.trim()).filter(Boolean);
  tagCloud.innerHTML = "";
  words.forEach(word => {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = `${ingEmoji(word)} ${word}`;
    tagCloud.appendChild(tag);
  });
}

/* ─── GENERATE ─── */
generateBtn.addEventListener("click", generate);
retryBtn.addEventListener("click", generate);
ingredientsInput.addEventListener("keydown", e => { if (e.key === "Enter" && (e.metaKey||e.ctrlKey)) generate(); });

async function generate() {
  const ingredients = ingredientsInput.value.trim();
  if (!ingredients) { ingredientsInput.focus(); return; }
  saveToPantry(ingredients);

  resultsEl.classList.add("hidden");
  loadingEl.classList.remove("hidden");
  generateBtn.disabled = true;
  generateBtn.querySelector(".btn-text").textContent = "Cooking…";
  activeEntryId = null;

  try {
    const res  = await fetch("/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ingredients, userId }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    // Prepend to local history mirror
    if (data.entryId) {
      const entry = { id: data.entryId, ingredients, recipes: data.recipes, timestamp: new Date().toISOString() };
      history = [entry, ...history].slice(0, 50);
      activeEntryId = data.entryId;
      renderHistoryList();
    }

    renderRecipes(data.recipes, ingredients, false);
  } catch (err) {
    alert("Error: " + err.message);
  } finally {
    loadingEl.classList.add("hidden");
    generateBtn.disabled = false;
    generateBtn.querySelector(".btn-text").textContent = "Generate Recipes";
  }
}

/* ─── RENDER RECIPES ─── */
let _currentIngredients = '';
function renderRecipes(recipes, ingredients, isRecall) {
  _currentIngredients = ingredients;
  recipeGrid.innerHTML = "";

  const ingWords = ingredients.split(/[,;\n]+/).map(w => w.trim()).filter(Boolean);
  const titleEmojis = [...new Set(ingWords.map(ingEmoji))].slice(0,4).join(" ");
  resultsTitle.textContent = `${titleEmojis}  Here's what you can make`;

  // Recall banner
  const oldBanner = resultsEl.querySelector(".recall-banner");
  if (oldBanner) oldBanner.remove();
  if (isRecall) {
    const banner = document.createElement("div");
    banner.className = "recall-banner";
    banner.innerHTML = `📂 Showing saved result for <strong style="margin-left:4px">${escHtml(ingredients)}</strong>`;
    resultsEl.insertBefore(banner, recipeGrid);
  }

  // Store full set and apply sort/filter
  lastRecipes = recipes;
  applyFilters();

  // No-match message (handled in applyFilters too, but guard here)
  if (!recipes.length) {
    recipeGrid.innerHTML = '<div class="no-match-msg">😕 No recipes found for those ingredients. Try adding more common ingredients like garlic, onion, or tomato.</div>';
    document.getElementById("results-stats").innerHTML = "";
  }
  resultsEl.classList.remove("hidden");
  resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

function buildCard(recipe, isBest) {
  const card = document.createElement("div");
  card.className = "recipe-card" + (isBest ? " best-match" : "");

  // Score badge
  const score = recipe.score != null ? recipe.score : null;
  const scoreColor = score >= 80 ? "#4a7c2a" : score >= 50 ? "#c8832a" : "#8c7a60";
  const scoreBadge = score != null
    ? `<span class="score-badge" style="background:${scoreColor}20;color:${scoreColor};border-color:${scoreColor}40">${score}% match</span>`
    : "";
  const bestBadge = isBest ? `<span class="best-badge">⭐ Best Match</span>` : "";

  // Time / difficulty chips
  const metaChips = [
    recipe.time       ? `<span class="meta-chip">⏱ ${escHtml(recipe.time)}</span>` : "",
    recipe.difficulty ? `<span class="meta-chip diff-${escHtml(recipe.difficulty)}">${escHtml(recipe.difficulty)}</span>` : "",
  ].filter(Boolean).join("");

  // Missing ingredients
  let missingHtml = "";
  if (recipe.missing && recipe.missing.length) {
    if (score >= 70) {
      missingHtml = `<div class="missing-banner minor">💡 You can still make this with minor substitutions</div>
        <div class="missing-list">Missing: ${recipe.missing.map(m => `<span class="missing-tag">${escHtml(m)}</span>`).join("")}</div>`;
    } else {
      missingHtml = `<div class="missing-banner">🛒 You are missing: ${recipe.missing.map(m => `<span class="missing-tag">${escHtml(m)}</span>`).join("")}</div>`;
    }
  }

  card.innerHTML = `
    <div class="card-header">
      <div class="card-header-top">
        <span class="card-emoji">${escHtml(recipe.emoji||"🍽️")}</span>
        <div class="card-badges">${bestBadge}${scoreBadge}</div>
      </div>
      <h4>${escHtml(recipe.name)}</h4>
      ${metaChips ? `<div class="meta-chips">${metaChips}</div>` : ""}
    </div>
    <div class="card-body">
      ${missingHtml}
      <div class="card-section-title">Ingredients</div>
      <div class="ing-tags">${(recipe.ingredients||[]).map(i=>`<span class="ing-tag">${ingEmoji(i)} ${escHtml(i)}</span>`).join("")}</div>
      <div class="card-section-title" style="margin-top:14px">Steps</div>
      <ol class="steps-list">${(recipe.steps||[]).map(s=>`<li>${escHtml(s)}</li>`).join("")}</ol>
    </div>
    <div class="card-footer">
      <a href="${escHtml(recipe.youtube||`https://www.youtube.com/results?search_query=${encodeURIComponent(recipe.name+" recipe")}`)}" target="_blank" rel="noopener" class="youtube-link">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6a3 3 0 0 0-2.1 2.1C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.8 15.5V8.5l6.3 3.5-6.3 3.5z"/></svg>
        Watch on YouTube
      </a>
    </div>`;

  // "View full recipe" button
  const viewBtn = document.createElement("button");
  viewBtn.className = "card-view-btn";
  viewBtn.textContent = "View full recipe →";
  viewBtn.addEventListener("click", e => {
    e.stopPropagation();
    openModal(recipe, _currentIngredients);
  });
  card.appendChild(viewBtn);

  return card;
}

/* ─── PANTRY DROPDOWN ─── */
function showPantryDropdown() {
  const dd = document.getElementById("pantry-dropdown");
  if (!dd) return;
  const all = getPantryHistory();
  const typed = ingredientsInput.value.trim().toLowerCase();
  const filtered = typed
    ? all.filter(s => s.toLowerCase().includes(typed))
    : all;
  if (!filtered.length) { dd.classList.add("hidden"); return; }
  dd.innerHTML = "";
  filtered.forEach(item => {
    const opt = document.createElement("div");
    opt.className = "pantry-option";
    // Highlight matching substring
    const idx = item.toLowerCase().indexOf(typed);
    if (typed && idx !== -1) {
      opt.innerHTML = escHtml(item.slice(0, idx))
        + `<strong>${escHtml(item.slice(idx, idx + typed.length))}</strong>`
        + escHtml(item.slice(idx + typed.length));
    } else {
      opt.textContent = item;
    }
    opt.addEventListener("mousedown", e => {
      e.preventDefault();
      ingredientsInput.value = item;
      updateTagCloud();
      dd.classList.add("hidden");
    });
    dd.appendChild(opt);
  });
  dd.classList.remove("hidden");
}

function escHtml(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}


/* ════════════════════════════════════════════════
   SORT / FILTER STATE
════════════════════════════════════════════════ */
let currentSort   = "score";       // score | time | difficulty
let currentDiff   = "all";         // all | easy | medium | hard
let lastRecipes   = [];            // full result set before filter

/* ════════════════════════════════════════════════
   SORT / FILTER WIRING
════════════════════════════════════════════════ */
function initFilterBar() {
  document.querySelectorAll("#sort-pills .pill").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#sort-pills .pill").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentSort = btn.dataset.sort;
      applyFilters();
    });
  });
  document.querySelectorAll("#diff-pills .pill").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#diff-pills .pill").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentDiff = btn.dataset.diff;
      applyFilters();
    });
  });
}

const DIFF_ORDER = { easy: 0, medium: 1, hard: 2 };
const TIME_RE    = /\d+/;

function applyFilters() {
  let list = [...lastRecipes];

  // Filter difficulty
  if (currentDiff !== "all") list = list.filter(r => r.difficulty === currentDiff);

  // Sort
  if (currentSort === "score") {
    list.sort((a, b) => (b.score || 0) - (a.score || 0));
  } else if (currentSort === "time") {
    list.sort((a, b) => {
      const ta = parseInt((a.time || "99").match(TIME_RE)?.[0] || 99);
      const tb = parseInt((b.time || "99").match(TIME_RE)?.[0] || 99);
      return ta - tb;
    });
  } else if (currentSort === "difficulty") {
    list.sort((a, b) => (DIFF_ORDER[a.difficulty] || 0) - (DIFF_ORDER[b.difficulty] || 0));
  }

  const grid = document.getElementById("recipe-grid");
  const stats = document.getElementById("results-stats");
  grid.innerHTML = "";

  if (!list.length) {
    grid.innerHTML = '<div class="no-match-msg">No recipes match this filter. Try a different difficulty.</div>';
    stats.innerHTML = "";
    return;
  }

  const best = list[0];
  stats.innerHTML = `Showing <strong>${list.length}</strong> recipe${list.length !== 1 ? "s" : ""} · Best match: <strong>${best.name}</strong> at <strong style="color:var(--olive)">${best.score || 0}%</strong>`;

  list.forEach((r, i) => {
    const card = buildCard(r, i === 0 && currentSort === "score");
    grid.appendChild(card);
  });
}

/* ════════════════════════════════════════════════
   QUICK MATCH BUTTON
════════════════════════════════════════════════ */
function initQuickMatch() {
  const btn = document.getElementById("quick-match-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const history = getPantryHistory();
    if (history.length) {
      ingredientsInput.value = history[0];
      updateTagCloud();
      ingredientsInput.focus();
    } else {
      // Try saved pantry items
      const saved = getSavedPantry();
      if (saved.length) {
        ingredientsInput.value = saved.join(", ");
        updateTagCloud();
        ingredientsInput.focus();
      } else {
        btn.textContent = "🥄 No history yet!";
        setTimeout(() => { btn.innerHTML = "🥄 Quick Match"; }, 1800);
      }
    }
  });
}

/* ════════════════════════════════════════════════
   SAVED PANTRY (sidebar)
════════════════════════════════════════════════ */
function getSavedPantry() {
  try { return JSON.parse(localStorage.getItem(PANTRY_SAVED_KEY) || "[]"); }
  catch { return []; }
}
function setSavedPantry(list) {
  localStorage.setItem(PANTRY_SAVED_KEY, JSON.stringify(list));
}

function renderPantryPanel() {
  const container = document.getElementById("pantry-tags");
  if (!container) return;
  const saved = getSavedPantry();
  container.innerHTML = "";
  if (!saved.length) {
    container.innerHTML = '<span style="font-size:.8rem;color:var(--muted)">No items yet. Add your staples below.</span>';
  } else {
    saved.forEach(item => {
      const tag = document.createElement("span");
      tag.className = "pantry-saved-tag";
      tag.innerHTML = `${ingEmoji(item)} ${escHtml(item)}<button title="Remove">✕</button>`;
      tag.querySelector("button").addEventListener("click", () => {
        setSavedPantry(getSavedPantry().filter(i => i !== item));
        renderPantryPanel();
      });
      container.appendChild(tag);
    });
  }
}

function initPantryPanel() {
  const addInput = document.getElementById("pantry-add-input");
  const addBtn   = document.getElementById("pantry-add-btn");
  const fillBtn  = document.getElementById("pantry-fill-btn");
  if (!addInput || !addBtn || !fillBtn) return;

  function addItem() {
    const val = addInput.value.trim();
    if (!val) return;
    const saved = getSavedPantry();
    if (!saved.includes(val)) { saved.push(val); setSavedPantry(saved); }
    addInput.value = "";
    renderPantryPanel();
  }
  addBtn.addEventListener("click", addItem);
  addInput.addEventListener("keydown", e => { if (e.key === "Enter") addItem(); });

  fillBtn.addEventListener("click", () => {
    const saved = getSavedPantry();
    if (!saved.length) return;
    ingredientsInput.value = saved.join(", ");
    updateTagCloud();
    closeSidebar();
    ingredientsInput.focus();
  });

  renderPantryPanel();
}

/* ════════════════════════════════════════════════
   SIDEBAR TABS
════════════════════════════════════════════════ */
function initSidebarTabs() {
  document.querySelectorAll(".stab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".stab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".sidebar-panel").forEach(p => p.classList.remove("active-panel"));
      tab.classList.add("active");
      const panel = tab.dataset.tab === "pantry"
        ? document.getElementById("pantry-panel")
        : document.getElementById("history-list");
      if (panel) panel.classList.add("active-panel");
    });
  });
}

/* ════════════════════════════════════════════════
   RECIPE DETAIL MODAL
════════════════════════════════════════════════ */
// modal refs declared above in DOM REFS section

function openModal(recipe, userIngredients) {
  const score = recipe.score != null ? recipe.score : null;
  const scoreColor = score >= 80 ? "#4a7c2a" : score >= 50 ? "#c8832a" : "#9B3A1A";

  // SVG ring calculation
  const r = 26, circ = 2 * Math.PI * r;
  const offset = circ - (circ * (score || 0) / 100);

  // User ingredient set for colour-coding
  const userSet = new Set((userIngredients||"").split(/[,;\n]+/).map(s => s.toLowerCase().trim()));

  const ingTagsHtml = (recipe.ingredients || []).map(ing => {
    const norm = ing.toLowerCase().trim();
    const matched = [...userSet].some(u => norm.includes(u) || u.includes(norm));
    const cls = matched ? "has" : "missing";
    const label = matched ? "✓" : "✕";
    return `<span class="modal-ing-tag ${cls}">${ingEmoji(ing)} ${escHtml(ing)} <small>${label}</small></span>`;
  }).join("");

  const missingNote = recipe.missing && recipe.missing.length
    ? `<div class="modal-missing-note">🛒 <strong>Still needed:</strong> ${recipe.missing.map(m => escHtml(m)).join(", ")}</div>`
    : '<div class="modal-missing-note" style="background:rgba(74,92,42,.08);border-color:rgba(74,92,42,.25);color:var(--olive)">✅ You have everything for this recipe!</div>';

  const ytUrl = recipe.youtube || `https://www.youtube.com/results?search_query=${encodeURIComponent(recipe.name+" recipe")}`;

  modalBody.innerHTML = `
    <div class="modal-hero">
      <span class="modal-emoji">${escHtml(recipe.emoji || "🍽️")}</span>
      <div class="modal-title-block">
        <h2>${escHtml(recipe.name)}</h2>
        <div class="modal-badges">
          ${recipe.time ? `<span class="meta-chip">⏱ ${escHtml(recipe.time)}</span>` : ""}
          ${recipe.difficulty ? `<span class="meta-chip diff-${escHtml(recipe.difficulty)}">${escHtml(recipe.difficulty)}</span>` : ""}
        </div>
      </div>
    </div>

    ${score != null ? `
    <div class="modal-score-ring">
      <div class="score-ring-wrap">
        <svg width="64" height="64" viewBox="0 0 64 64">
          <circle class="ring-bg" cx="32" cy="32" r="${r}"/>
          <circle class="ring-fill" cx="32" cy="32" r="${r}"
            stroke="${scoreColor}"
            stroke-dasharray="${circ}"
            stroke-dashoffset="${offset}"/>
        </svg>
        <div class="score-ring-num" style="color:${scoreColor}">${score}%</div>
      </div>
      <div class="score-ring-label">
        <strong>Ingredient Match</strong>
        ${score >= 80 ? "Great — you have almost everything!" : score >= 60 ? "Good match with a few substitutions." : "You'll need a few more ingredients."}
      </div>
    </div>` : ""}

    <div class="modal-section-title">Ingredients</div>
    <div class="modal-ing-tags">${ingTagsHtml}</div>
    ${missingNote}

    <div class="modal-section-title">Steps</div>
    <ol class="modal-steps">${(recipe.steps || []).map(s => `<li>${escHtml(s)}</li>`).join("")}</ol>

    <a href="${escHtml(ytUrl)}" target="_blank" rel="noopener" class="modal-yt-link">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6a3 3 0 0 0-2.1 2.1C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.8 15.5V8.5l6.3 3.5-6.3 3.5z"/></svg>
      Watch on YouTube
    </a>`;

  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  modal.classList.add("hidden");
  document.body.style.overflow = "";
}

modalClose.addEventListener("click", closeModal);
modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

/* ════════════════════════════════════════════════
   INIT ALL NEW FEATURES on page load
════════════════════════════════════════════════ */
(function init() {
  initFilterBar();
  initQuickMatch();
  initSidebarTabs();
  // pantry panel inits after app shown — see showApp patch below
})();


}); // end DOMContentLoaded