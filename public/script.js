/* ================================================
   MISE EN PLACE — script.js
   Clean rewrite: all logic inside DOMContentLoaded
   ================================================ */

/* ── Constants (no DOM needed) ── */
const PANTRY_KEY       = "mise_pantry_history";
const PANTRY_SAVED_KEY = "mise_pantry_saved";
const MAX_PANTRY       = 10;

const EMOJI_MAP = {
  tomato:"🍅", cheese:"🧀", egg:"🥚", chicken:"🍗", rice:"🍚", pasta:"🍝",
  potato:"🥔", onion:"🧅", garlic:"🧄", carrot:"🥕", spinach:"🥬", mushroom:"🍄",
  lemon:"🍋", butter:"🧈", milk:"🥛", bread:"🍞", beef:"🥩", fish:"🐟",
  shrimp:"🍤", corn:"🌽", pepper:"🌶️", avocado:"🥑", banana:"🍌", apple:"🍎",
  lime:"🍋", bacon:"🥓", tofu:"🍱", broccoli:"🥦", bean:"🫘", noodle:"🍜",
  herb:"🌿", basil:"🌿", chili:"🌶️", ginger:"🫚", coconut:"🥥", mango:"🥭",
  salt:"🧂", oil:"🫒"
};

function ingEmoji(word) {
  const w = (word || "").toLowerCase().trim();
  for (const [k, e] of Object.entries(EMOJI_MAP)) if (w.includes(k)) return e;
  return "🥄";
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month:"short", day:"numeric" }) + " " +
         d.toLocaleTimeString(undefined, { hour:"2-digit", minute:"2-digit" });
}

function getPantryHistory() {
  try { return JSON.parse(localStorage.getItem(PANTRY_KEY) || "[]"); } catch { return []; }
}
function saveToPantry(str) {
  const list = getPantryHistory().filter(s => s !== str);
  list.unshift(str);
  localStorage.setItem(PANTRY_KEY, JSON.stringify(list.slice(0, MAX_PANTRY)));
}
function getSavedPantry() {
  try { return JSON.parse(localStorage.getItem(PANTRY_SAVED_KEY) || "[]"); } catch { return []; }
}
function setSavedPantry(list) {
  localStorage.setItem(PANTRY_SAVED_KEY, JSON.stringify(list));
}

/* ================================================
   EVERYTHING BELOW RUNS AFTER DOM IS READY
   ================================================ */
document.addEventListener("DOMContentLoaded", function () {

  /* ── App state ── */
  let userId        = null;
  let userHistory   = [];
  let activeEntryId = null;
  let lastRecipes   = [];
  let currentSort   = "score";
  let currentDiff   = "all";

  /* ── DOM refs — fail loudly if any missing ── */
  function el(id) {
    const e = document.getElementById(id);
    if (!e) console.error("Missing element: #" + id);
    return e;
  }

  const loginScreen      = el("login-screen");
  const appScreen        = el("app-screen");
  const passwordInput    = el("password-input");
  const loginBtn         = el("login-btn");
  const loginError       = el("login-error");
  const userBadge        = el("user-badge");
  const sidebar          = el("sidebar");
  const sidebarOverlay   = el("sidebar-overlay");
  const sidebarToggle    = el("sidebar-toggle");
  const sidebarClose     = el("sidebar-close");
  const sidebarAvatar    = el("sidebar-avatar");
  const sidebarUserid    = el("sidebar-userid");
  const logoutBtn        = el("logout-btn");
  const clearHistoryBtn  = el("clear-history-btn");
  const historyList      = el("history-list");
  const ingredientsInput = el("ingredients-input");
  const tagCloud         = el("tag-cloud");
  const generateBtn      = el("generate-btn");
  const loadingEl        = el("loading");
  const resultsEl        = el("results");
  const resultsTitle     = el("results-title");
  const recipeGrid       = el("recipe-grid");
  const retryBtn         = el("retry-btn");
  const modal            = el("recipe-modal");
  const modalClose       = el("modal-close");
  const modalBody        = el("modal-body");
  const quickMatchBtn    = el("quick-match-btn");
  const pantryAddInput   = el("pantry-add-input");
  const pantryAddBtn     = el("pantry-add-btn");
  const pantryFillBtn    = el("pantry-fill-btn");
  const pantryTagsEl     = el("pantry-tags");
  const resultStats      = el("results-stats");

  console.log("✓ Mise en Place script loaded");

  /* ════════════════════════════════════════════
     AUTH
  ════════════════════════════════════════════ */
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw })
      });
      const data = await res.json();
      if (data.success) {
        userId = data.userId;
        await showApp(data.isNew);
      } else {
        showLoginError(data.message || "Something went wrong.");
      }
    } catch (err) {
      console.error("Auth error:", err);
      showLoginError("Cannot reach the server.");
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
  }

  async function showApp(isNew) {
    loginScreen.classList.remove("active");
    appScreen.style.display = "flex";
    userBadge.textContent   = "👤 " + userId;
    sidebarAvatar.textContent = userId.charAt(0).toUpperCase();
    sidebarUserid.textContent = userId;
    renderPantryPanel();
    if (!isNew) await loadHistory();
    initPantryDropdown();
    ingredientsInput.focus();
  }

  /* ════════════════════════════════════════════
     LOGOUT
  ════════════════════════════════════════════ */
  logoutBtn.addEventListener("click", () => {
    userId = null; userHistory = []; activeEntryId = null;
    closeSidebar();
    appScreen.style.display = "none";
    loginScreen.classList.add("active");
    passwordInput.value = "";
    resultsEl.classList.add("hidden");
    ingredientsInput.value = "";
    tagCloud.innerHTML = "";
  });

  /* ════════════════════════════════════════════
     SIDEBAR
  ════════════════════════════════════════════ */
  sidebarToggle.addEventListener("click", () =>
    sidebar.classList.contains("open") ? closeSidebar() : openSidebar()
  );
  sidebarClose.addEventListener("click", closeSidebar);
  sidebarOverlay.addEventListener("click", closeSidebar);

  function openSidebar()  { sidebar.classList.add("open");    sidebarOverlay.classList.add("visible"); }
  function closeSidebar() { sidebar.classList.remove("open"); sidebarOverlay.classList.remove("visible"); }

  /* Sidebar tabs */
  document.querySelectorAll(".stab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".stab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".sidebar-panel").forEach(p => p.classList.remove("active-panel"));
      tab.classList.add("active");
      const panel = tab.dataset.tab === "pantry" ? el("pantry-panel") : historyList;
      if (panel) panel.classList.add("active-panel");
    });
  });

  /* ════════════════════════════════════════════
     HISTORY
  ════════════════════════════════════════════ */
  async function loadHistory() {
    try {
      const res  = await fetch("/history/" + userId);
      const data = await res.json();
      userHistory = data.history || [];
      renderHistoryList();
    } catch (err) { console.error("Failed to load history:", err); }
  }

  function renderHistoryList() {
    historyList.innerHTML = "";
    if (!userHistory.length) {
      historyList.innerHTML = '<div class="history-empty">No searches yet.<br>Generate your first recipe!</div>';
      return;
    }
    userHistory.forEach(entry => historyList.appendChild(buildHistoryItem(entry)));
  }

  function buildHistoryItem(entry) {
    const div = document.createElement("div");
    div.className = "history-item" + (entry.id === activeEntryId ? " active-item" : "");
    div.dataset.id = entry.id;
    div.innerHTML = `
      <div class="history-item-header">
        <div class="history-ingredients">${escHtml(entry.ingredients)}</div>
        <button type="button" class="history-delete" title="Remove">✕</button>
      </div>
      <div class="history-meta">
        <span class="history-time">${formatTime(entry.timestamp)}</span>
        <span class="history-count">${(entry.recipes||[]).length} recipes</span>
      </div>`;
    div.querySelector(".history-delete").addEventListener("click", e => {
      e.stopPropagation();
      deleteEntry(entry.id);
    });
    div.addEventListener("click", () => recallEntry(entry));
    return div;
  }

  function recallEntry(entry) {
    activeEntryId = entry.id;
    ingredientsInput.value = entry.ingredients;
    updateTagCloud();
    renderRecipes(entry.recipes, entry.ingredients, true);
    closeSidebar();
    document.querySelectorAll(".history-item").forEach(el =>
      el.classList.toggle("active-item", el.dataset.id === entry.id)
    );
  }

  async function deleteEntry(entryId) {
    userHistory = userHistory.filter(h => h.id !== entryId);
    renderHistoryList();
    try { await fetch("/history/" + userId + "/" + entryId, { method: "DELETE" }); }
    catch (err) { console.error("Delete failed:", err); }
  }

  clearHistoryBtn.addEventListener("click", async () => {
    if (!userHistory.length || !confirm("Clear all search history?")) return;
    userHistory = []; activeEntryId = null;
    renderHistoryList();
    try { await fetch("/history/" + userId, { method: "DELETE" }); }
    catch (err) { console.error("Clear failed:", err); }
  });

  /* ════════════════════════════════════════════
     TAG CLOUD
  ════════════════════════════════════════════ */
  ingredientsInput.addEventListener("input", updateTagCloud);

  function updateTagCloud() {
    const words = ingredientsInput.value.split(/[,;\n]+/).map(w => w.trim()).filter(Boolean);
    tagCloud.innerHTML = "";
    words.forEach(word => {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = ingEmoji(word) + " " + word;
      tagCloud.appendChild(tag);
    });
  }

  /* ════════════════════════════════════════════
     PANTRY DROPDOWN (autosuggest)
  ════════════════════════════════════════════ */
  function initPantryDropdown() {
    if (document.getElementById("pantry-dropdown")) return;
    const wrap = ingredientsInput.parentElement;
    wrap.style.position = "relative";
    const dd = document.createElement("div");
    dd.id = "pantry-dropdown";
    dd.className = "pantry-dropdown hidden";
    wrap.appendChild(dd);

    ingredientsInput.addEventListener("focus", showDropdown);
    ingredientsInput.addEventListener("input", showDropdown);
    document.addEventListener("click", e => {
      if (!wrap.contains(e.target)) dd.classList.add("hidden");
    });

    function showDropdown() {
      const all    = getPantryHistory();
      const typed  = ingredientsInput.value.trim().toLowerCase();
      const filtered = typed ? all.filter(s => s.toLowerCase().includes(typed)) : all;
      if (!filtered.length) { dd.classList.add("hidden"); return; }
      dd.innerHTML = "";
      filtered.forEach(item => {
        const opt = document.createElement("div");
        opt.className = "pantry-option";
        opt.textContent = item;
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
  }

  /* ════════════════════════════════════════════
     PANTRY PANEL (sidebar saved items)
  ════════════════════════════════════════════ */
  function renderPantryPanel() {
    if (!pantryTagsEl) return;
    const saved = getSavedPantry();
    pantryTagsEl.innerHTML = "";
    if (!saved.length) {
      pantryTagsEl.innerHTML = '<span style="font-size:.8rem;color:var(--muted)">No items yet.</span>';
    } else {
      saved.forEach(item => {
        const tag = document.createElement("span");
        tag.className = "pantry-saved-tag";
        tag.innerHTML = ingEmoji(item) + " " + escHtml(item) +
          ' <button type="button" title="Remove">✕</button>';
        tag.querySelector("button").addEventListener("click", () => {
          setSavedPantry(getSavedPantry().filter(i => i !== item));
          renderPantryPanel();
        });
        pantryTagsEl.appendChild(tag);
      });
    }
  }

  pantryAddBtn.addEventListener("click", addPantryItem);
  pantryAddInput.addEventListener("keydown", e => { if (e.key === "Enter") addPantryItem(); });

  function addPantryItem() {
    const val = pantryAddInput.value.trim();
    if (!val) return;
    const saved = getSavedPantry();
    if (!saved.includes(val)) { saved.push(val); setSavedPantry(saved); }
    pantryAddInput.value = "";
    renderPantryPanel();
  }

  pantryFillBtn.addEventListener("click", () => {
    const saved = getSavedPantry();
    if (!saved.length) return;
    ingredientsInput.value = saved.join(", ");
    updateTagCloud();
    closeSidebar();
    ingredientsInput.focus();
  });

  /* ════════════════════════════════════════════
     QUICK MATCH
  ════════════════════════════════════════════ */
  quickMatchBtn.addEventListener("click", () => {
    const last = getPantryHistory();
    const fill = last.length ? last[0] : getSavedPantry().join(", ");
    if (fill) {
      ingredientsInput.value = fill;
      updateTagCloud();
      ingredientsInput.focus();
    }
  });

  /* ════════════════════════════════════════════
     GENERATE — THE CORE API CALL
  ════════════════════════════════════════════ */
  generateBtn.addEventListener("click", generate);
  retryBtn.addEventListener("click", generate);
  ingredientsInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate();
  });

  async function generate() {
    const ingredients = ingredientsInput.value.trim();
    if (!ingredients) { ingredientsInput.focus(); return; }

    console.log("→ Calling /generate with:", ingredients);
    saveToPantry(ingredients);

    resultsEl.classList.add("hidden");
    loadingEl.classList.remove("hidden");
    generateBtn.disabled = true;
    generateBtn.querySelector(".btn-text").textContent = "Cooking…";
    activeEntryId = null;

    try {
      const res = await fetch("/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredients, userId })
      });

      console.log("← /generate status:", res.status);

      if (!res.ok) {
        const text = await res.text();
        throw new Error("Server error " + res.status + ": " + text);
      }

      const data = await res.json();
      console.log("← /generate data:", data);

      if (data.error) throw new Error(data.error);

      if (data.entryId) {
        const entry = {
          id: data.entryId,
          ingredients,
          recipes: data.recipes,
          timestamp: new Date().toISOString()
        };
        userHistory = [entry, ...userHistory].slice(0, 50);
        activeEntryId = data.entryId;
        renderHistoryList();
      }

      renderRecipes(data.recipes, ingredients, false);

    } catch (err) {
      console.error("Generate error:", err);
      alert("Error: " + err.message);
    } finally {
      loadingEl.classList.add("hidden");
      generateBtn.disabled = false;
      generateBtn.querySelector(".btn-text").textContent = "Generate Recipes";
    }
  }

  /* ════════════════════════════════════════════
     SORT / FILTER
  ════════════════════════════════════════════ */
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

  const DIFF_ORDER = { easy: 0, medium: 1, hard: 2 };

  function applyFilters() {
    let list = [...lastRecipes];
    if (currentDiff !== "all") list = list.filter(r => r.difficulty === currentDiff);
    if (currentSort === "score") {
      list.sort((a, b) => (b.score || 0) - (a.score || 0));
    } else if (currentSort === "time") {
      list.sort((a, b) => {
        const ta = parseInt((a.time || "99").match(/\d+/)?.[0] || 99);
        const tb = parseInt((b.time || "99").match(/\d+/)?.[0] || 99);
        return ta - tb;
      });
    } else if (currentSort === "difficulty") {
      list.sort((a, b) => (DIFF_ORDER[a.difficulty] || 0) - (DIFF_ORDER[b.difficulty] || 0));
    }

    recipeGrid.innerHTML = "";
    if (!list.length) {
      recipeGrid.innerHTML = '<div class="no-match-msg">No recipes match this filter.</div>';
      if (resultStats) resultStats.innerHTML = "";
      return;
    }

    if (resultStats) {
      const best = list[0];
      resultStats.innerHTML = `Showing <strong>${list.length}</strong> recipe${list.length !== 1 ? "s" : ""}
        · Best: <strong>${escHtml(best.name)}</strong>
        <strong style="color:var(--olive)">${best.score || 0}%</strong> match`;
    }

    list.forEach((r, i) => recipeGrid.appendChild(buildCard(r, i === 0 && currentSort === "score")));
  }

  /* ════════════════════════════════════════════
     RENDER RECIPES
  ════════════════════════════════════════════ */
  let _currentIngredients = "";

  function renderRecipes(recipes, ingredients, isRecall) {
    _currentIngredients = ingredients;

    const ingWords    = ingredients.split(/[,;\n]+/).map(w => w.trim()).filter(Boolean);
    const titleEmojis = [...new Set(ingWords.map(ingEmoji))].slice(0, 4).join(" ");
    resultsTitle.textContent = titleEmojis + "  Here's what you can make";

    const oldBanner = resultsEl.querySelector(".recall-banner");
    if (oldBanner) oldBanner.remove();
    if (isRecall) {
      const banner = document.createElement("div");
      banner.className = "recall-banner";
      banner.innerHTML = "📂 Showing saved result for <strong>" + escHtml(ingredients) + "</strong>";
      resultsEl.insertBefore(banner, recipeGrid);
    }

    lastRecipes = recipes || [];
    applyFilters();

    if (!lastRecipes.length) {
      recipeGrid.innerHTML = '<div class="no-match-msg">😕 No recipes found. Try ingredients like tomato, garlic, egg, or chicken.</div>';
      if (resultStats) resultStats.innerHTML = "";
    }

    resultsEl.classList.remove("hidden");
    resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ════════════════════════════════════════════
     BUILD RECIPE CARD
  ════════════════════════════════════════════ */
  function buildCard(recipe, isBest) {
    const score      = recipe.score != null ? recipe.score : null;
    const scoreColor = score >= 80 ? "#4a7c2a" : score >= 50 ? "#c8832a" : "#8c7a60";

    const scoreBadge = score != null
      ? `<span class="score-badge" style="background:${scoreColor}20;color:${scoreColor};border-color:${scoreColor}40">${score}% match</span>`
      : "";
    const bestBadge = isBest ? `<span class="best-badge">⭐ Best Match</span>` : "";

    const metaChips = [
      recipe.time       ? `<span class="meta-chip">⏱ ${escHtml(recipe.time)}</span>`                          : "",
      recipe.difficulty ? `<span class="meta-chip diff-${escHtml(recipe.difficulty)}">${escHtml(recipe.difficulty)}</span>` : "",
    ].filter(Boolean).join("");

    let missingHtml = "";
    if (recipe.missing && recipe.missing.length) {
      if (score >= 70) {
        missingHtml = `<div class="missing-banner minor">💡 You can still make this with minor substitutions</div>
          <div class="missing-list">${recipe.missing.map(m => `<span class="missing-tag">${escHtml(m)}</span>`).join("")}</div>`;
      } else {
        missingHtml = `<div class="missing-banner">🛒 Missing: ${recipe.missing.map(m => `<span class="missing-tag">${escHtml(m)}</span>`).join("")}</div>`;
      }
    }

    const ytUrl = recipe.youtube ||
      "https://www.youtube.com/results?search_query=" + encodeURIComponent(recipe.name + " recipe");

    const card = document.createElement("div");
    card.className = "recipe-card" + (isBest ? " best-match" : "");
    card.innerHTML = `
      <div class="card-header">
        <div class="card-header-top">
          <span class="card-emoji">${escHtml(recipe.emoji || "🍽️")}</span>
          <div class="card-badges">${bestBadge}${scoreBadge}</div>
        </div>
        <h4>${escHtml(recipe.name)}</h4>
        ${metaChips ? `<div class="meta-chips">${metaChips}</div>` : ""}
      </div>
      <div class="card-body">
        ${missingHtml}
        <div class="card-section-title">Ingredients</div>
        <div class="ing-tags">
          ${(recipe.ingredients||[]).map(i => `<span class="ing-tag">${ingEmoji(i)} ${escHtml(i)}</span>`).join("")}
        </div>
        <div class="card-section-title" style="margin-top:14px">Steps</div>
        <ol class="steps-list">
          ${(recipe.steps||[]).map(s => `<li>${escHtml(s)}</li>`).join("")}
        </ol>
      </div>
      <div class="card-footer">
        <a href="${escHtml(ytUrl)}" target="_blank" rel="noopener" class="youtube-link">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6a3 3 0 0 0-2.1 2.1C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.8 15.5V8.5l6.3 3.5-6.3 3.5z"/>
          </svg>
          Watch on YouTube
        </a>
      </div>
      <button type="button" class="card-view-btn">View full recipe →</button>`;

    card.querySelector(".card-view-btn").addEventListener("click", () =>
      openModal(recipe, _currentIngredients)
    );

    return card;
  }

  /* ════════════════════════════════════════════
     RECIPE DETAIL MODAL
  ════════════════════════════════════════════ */
  function openModal(recipe, userIngredients) {
    const score      = recipe.score != null ? recipe.score : null;
    const scoreColor = score >= 80 ? "#4a7c2a" : score >= 50 ? "#c8832a" : "#9B3A1A";
    const r          = 26, circ = 2 * Math.PI * r;
    const offset     = circ - (circ * (score || 0) / 100);

    const userSet = new Set(
      (userIngredients || "").split(/[,;\n]+/).map(s => s.toLowerCase().trim())
    );

    const ingTagsHtml = (recipe.ingredients || []).map(ing => {
      const norm    = ing.toLowerCase().trim();
      const matched = [...userSet].some(u => norm.includes(u) || u.includes(norm));
      return `<span class="modal-ing-tag ${matched ? "has" : "missing"}">
        ${ingEmoji(ing)} ${escHtml(ing)} <small>${matched ? "✓" : "✕"}</small>
      </span>`;
    }).join("");

    const missingNote = (recipe.missing && recipe.missing.length)
      ? `<div class="modal-missing-note">🛒 <strong>Still needed:</strong> ${recipe.missing.map(m => escHtml(m)).join(", ")}</div>`
      : `<div class="modal-missing-note" style="background:rgba(74,92,42,.08);border-color:rgba(74,92,42,.25);color:var(--olive)">✅ You have everything!</div>`;

    const ytUrl = recipe.youtube ||
      "https://www.youtube.com/results?search_query=" + encodeURIComponent(recipe.name + " recipe");

    modalBody.innerHTML = `
      <div class="modal-hero">
        <span class="modal-emoji">${escHtml(recipe.emoji || "🍽️")}</span>
        <div class="modal-title-block">
          <h2>${escHtml(recipe.name)}</h2>
          <div class="modal-badges">
            ${recipe.time       ? `<span class="meta-chip">⏱ ${escHtml(recipe.time)}</span>` : ""}
            ${recipe.difficulty ? `<span class="meta-chip diff-${escHtml(recipe.difficulty)}">${escHtml(recipe.difficulty)}</span>` : ""}
          </div>
        </div>
      </div>
      ${score != null ? `
      <div class="modal-score-ring">
        <div class="score-ring-wrap">
          <svg width="64" height="64" viewBox="0 0 64 64">
            <circle class="ring-bg"   cx="32" cy="32" r="${r}"/>
            <circle class="ring-fill" cx="32" cy="32" r="${r}"
              stroke="${scoreColor}" stroke-dasharray="${circ}" stroke-dashoffset="${offset}"/>
          </svg>
          <div class="score-ring-num" style="color:${scoreColor}">${score}%</div>
        </div>
        <div class="score-ring-label">
          <strong>Ingredient Match</strong>
          ${score >= 80 ? "Great — you have almost everything!" : score >= 60 ? "Good match, minor substitutions needed." : "You'll need a few more ingredients."}
        </div>
      </div>` : ""}
      <div class="modal-section-title">Ingredients</div>
      <div class="modal-ing-tags">${ingTagsHtml}</div>
      ${missingNote}
      <div class="modal-section-title">Steps</div>
      <ol class="modal-steps">
        ${(recipe.steps || []).map(s => `<li>${escHtml(s)}</li>`).join("")}
      </ol>
      <a href="${escHtml(ytUrl)}" target="_blank" rel="noopener" class="modal-yt-link">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6a3 3 0 0 0-2.1 2.1C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.8 15.5V8.5l6.3 3.5-6.3 3.5z"/>
        </svg>
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

  console.log("✓ All event listeners attached");

}); // end DOMContentLoaded