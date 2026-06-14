/* QI Platform - UI: navigation, views, case form, import/export. */
(function () {
  "use strict";
  const C = window.QICalc, S = window.QIStore, CH = window.QICharts;
  const $ = sel => document.querySelector(sel);
  const content = $("#content");
  const uiState = { caseFilter: { q: "", status: "", priority: "", owner: "", sort: "rpn" }, regFilter: {}, regSelected: {}, regSort: {}, selected: new Set() };

  // ---------- helpers ----------
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }
  function cur() { return (S.get().project.currency) || "$"; }
  function money(v) { return cur() + (Number(v) || 0).toLocaleString(); }
  function pct(v) { return Math.round((Number(v) || 0) * 100) + "%"; }
  function opts(arr, sel, blank) {
    let h = blank ? `<option value="">${esc(blank)}</option>` : "";
    return h + arr.map(v => `<option value="${esc(v)}" ${String(v) === String(sel) ? "selected" : ""}>${esc(v)}</option>`).join("");
  }
  function datalist(id, arr) { return `<datalist id="${id}">${arr.map(v => `<option value="${esc(v)}">`).join("")}</datalist>`; }
  function healthBadge(h) {
    const map = { "Critical": "b-critical", "High": "b-high", "On track": "b-ontrack", "Blocked": "b-blocked", "Resolved": "b-resolved", "Closed": "b-closed" };
    return h ? `<span class="badge ${map[h] || ""}">${esc(h)}</span>` : "";
  }
  function statusBadge(s) {
    const map = { "OPEN": "b-open", "IN PROGRESS": "b-progress", "ON HOLD": "b-hold", "BLOCKED": "b-blocked", "RESOLVED": "b-resolved", "CLOSED": "b-closed" };
    return s ? `<span class="badge ${map[s] || ""}">${esc(s)}</span>` : "";
  }
  function barCell(p) { p = Number(p) || 0; return `<span class="bar"><span style="width:${Math.round(p * 100)}%"></span></span> ${pct(p)}`; }
  function toast(msg, opts) {
    const t = $("#toast"); if (!t) return;
    opts = opts || {};
    const ms = opts.ms || (opts.action ? 5000 : 2200);
    t.innerHTML = `<span>${esc(msg)}</span>` + (opts.action ? `<button class="toast-action" id="toastAct">${esc(opts.action.label)}</button>` : "");
    t.hidden = false;
    clearTimeout(t._t);
    t._t = setTimeout(() => { t.hidden = true; if (opts.onTimeout) opts.onTimeout(); }, ms);
    if (opts.action) {
      const btn = $("#toastAct");
      if (btn) btn.addEventListener("click", () => {
        clearTimeout(t._t); t.hidden = true;
        try { opts.action.handler(); } catch (e) {}
      });
    }
  }
  function tableWrap(head, rows, cls) {
    if (!rows) return `<div class="empty">No data yet. Click <b>+ New Case</b> to start.</div>`;
    return `<div class="table-wrap"><table class="${cls || ""}"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // ---------- i18n multi-language system ----------
  const I18N = {
    da: {
      // Nav group labels
      "Overview": "Overblik", "Delivery": "Levering", "Risk & Quality": "Risiko & Kvalitet",
      "Improve": "Forbedring", "People & Cost": "Mennesker & Omkostninger", "Intelligence": "Intelligens",
      "Setup": "Opsaetning", "Engineering": "Teknik", "Business": "Forretning",
      // View titles
      "Dashboard": "Instrumentbraet", "Portfolio": "Portefoelje", "Cases (Master)": "Sager (Master)",
      "Kanban Board": "Kanban-tavle", "Timeline": "Tidslinje", "Risk Register": "Risikoregister",
      "Budget": "Budget", "Settings": "Indstillinger", "Help": "Hjaelp", "Project Brain": "Projekthjerne",
      // KPI labels
      "Total Cases": "Samlede Sager", "Open / Active": "Aabne / Aktive", "Critical": "Kritisk",
      "Blocked": "Blokeret", "Budget": "Budget", "Projects": "Projekter",
      // Buttons
      "Save": "Gem", "Cancel": "Annuller", "Delete": "Slet", "Apply": "Anvend", "Close": "Luk",
      "Export": "Eksporter", "Import": "Importer", "Login": "Log ind", "Logout": "Log ud", "Register": "Registrer"
    },
    th: {
      // Nav group labels
      "Overview": "\u0e20\u0e32\u0e1e\u0e23\u0e27\u0e21", "Delivery": "\u0e01\u0e32\u0e23\u0e2a\u0e48\u0e07\u0e21\u0e2d\u0e1a", "Risk & Quality": "\u0e04\u0e27\u0e32\u0e21\u0e40\u0e2a\u0e35\u0e48\u0e22\u0e07\u0e41\u0e25\u0e30\u0e04\u0e38\u0e13\u0e20\u0e32\u0e1e",
      "Improve": "\u0e1b\u0e23\u0e31\u0e1a\u0e1b\u0e23\u0e38\u0e07", "People & Cost": "\u0e1a\u0e38\u0e04\u0e25\u0e32\u0e01\u0e23\u0e41\u0e25\u0e30\u0e15\u0e49\u0e19\u0e17\u0e38\u0e19", "Intelligence": "\u0e2d\u0e31\u0e08\u0e09\u0e23\u0e34\u0e22\u0e30",
      "Setup": "\u0e15\u0e31\u0e49\u0e07\u0e04\u0e48\u0e32", "Engineering": "\u0e27\u0e34\u0e28\u0e27\u0e01\u0e23\u0e23\u0e21", "Business": "\u0e18\u0e38\u0e23\u0e01\u0e34\u0e08",
      // View titles
      "Dashboard": "\u0e41\u0e14\u0e0a\u0e1a\u0e2d\u0e23\u0e4c\u0e14", "Portfolio": "\u0e1e\u0e2d\u0e23\u0e4c\u0e15\u0e42\u0e1f\u0e25\u0e34\u0e42\u0e2d", "Cases (Master)": "\u0e01\u0e23\u0e13\u0e35 (\u0e2b\u0e25\u0e31\u0e01)",
      "Kanban Board": "\u0e01\u0e23\u0e30\u0e14\u0e32\u0e19\u0e04\u0e31\u0e19\u0e1a\u0e31\u0e19", "Timeline": "\u0e44\u0e17\u0e21\u0e4c\u0e44\u0e25\u0e19\u0e4c", "Risk Register": "\u0e17\u0e30\u0e40\u0e1a\u0e35\u0e22\u0e19\u0e04\u0e27\u0e32\u0e21\u0e40\u0e2a\u0e35\u0e48\u0e22\u0e07",
      "Budget": "\u0e07\u0e1a\u0e1b\u0e23\u0e30\u0e21\u0e32\u0e13", "Settings": "\u0e01\u0e32\u0e23\u0e15\u0e31\u0e49\u0e07\u0e04\u0e48\u0e32", "Help": "\u0e0a\u0e48\u0e27\u0e22\u0e40\u0e2b\u0e25\u0e37\u0e2d", "Project Brain": "\u0e2a\u0e21\u0e2d\u0e07\u0e42\u0e04\u0e23\u0e07\u0e01\u0e32\u0e23",
      // KPI labels
      "Total Cases": "\u0e01\u0e23\u0e13\u0e35\u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14", "Open / Active": "\u0e40\u0e1b\u0e34\u0e14 / \u0e14\u0e33\u0e40\u0e19\u0e34\u0e19\u0e01\u0e32\u0e23", "Critical": "\u0e27\u0e34\u0e01\u0e24\u0e15",
      "Blocked": "\u0e16\u0e39\u0e01\u0e1a\u0e25\u0e47\u0e2d\u0e01", "Projects": "\u0e42\u0e04\u0e23\u0e07\u0e01\u0e32\u0e23",
      // Buttons
      "Save": "\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01", "Cancel": "\u0e22\u0e01\u0e40\u0e25\u0e34\u0e01", "Delete": "\u0e25\u0e1a", "Apply": "\u0e19\u0e33\u0e44\u0e1b\u0e43\u0e0a\u0e49", "Close": "\u0e1b\u0e34\u0e14",
      "Export": "\u0e2a\u0e48\u0e07\u0e2d\u0e2d\u0e01", "Import": "\u0e19\u0e33\u0e40\u0e02\u0e49\u0e32", "Login": "\u0e40\u0e02\u0e49\u0e32\u0e2a\u0e39\u0e48\u0e23\u0e30\u0e1a\u0e1a", "Logout": "\u0e2d\u0e2d\u0e01\u0e08\u0e32\u0e01\u0e23\u0e30\u0e1a\u0e1a", "Register": "\u0e25\u0e07\u0e17\u0e30\u0e40\u0e1a\u0e35\u0e22\u0e19"
    },
    vi: {
      // Nav group labels
      "Overview": "T\u1ed5ng quan", "Delivery": "Giao h\u00e0ng", "Risk & Quality": "R\u1ee7i ro & Ch\u1ea5t l\u01b0\u1ee3ng",
      "Improve": "C\u1ea3i ti\u1ebfn", "People & Cost": "Nh\u00e2n s\u1ef1 & Chi ph\u00ed", "Intelligence": "Th\u00f4ng minh",
      "Setup": "C\u00e0i \u0111\u1eb7t", "Engineering": "K\u1ef9 thu\u1eadt", "Business": "Kinh doanh",
      // View titles
      "Dashboard": "B\u1ea3ng \u0111i\u1ec1u khi\u1ec3n", "Portfolio": "Danh m\u1ee5c", "Cases (Master)": "Tr\u01b0\u1eddng h\u1ee3p (Ch\u00ednh)",
      "Kanban Board": "B\u1ea3ng Kanban", "Timeline": "D\u00f2ng th\u1eddi gian", "Risk Register": "S\u1ed5 r\u1ee7i ro",
      "Budget": "Ng\u00e2n s\u00e1ch", "Settings": "C\u00e0i \u0111\u1eb7t", "Help": "Tr\u1ee3 gi\u00fap", "Project Brain": "B\u1ed9 n\u00e3o d\u1ef1 \u00e1n",
      // KPI labels
      "Total Cases": "T\u1ed5ng s\u1ed1 tr\u01b0\u1eddng h\u1ee3p", "Open / Active": "M\u1edf / Ho\u1ea1t \u0111\u1ed9ng", "Critical": "Nghi\u00eam tr\u1ecdng",
      "Blocked": "B\u1ecb ch\u1eb7n", "Projects": "D\u1ef1 \u00e1n",
      // Buttons
      "Save": "L\u01b0u", "Cancel": "H\u1ee7y", "Delete": "X\u00f3a", "Apply": "\u00c1p d\u1ee5ng", "Close": "\u0110\u00f3ng",
      "Export": "Xu\u1ea5t", "Import": "Nh\u1eadp", "Login": "\u0110\u0103ng nh\u1eadp", "Logout": "\u0110\u0103ng xu\u1ea5t", "Register": "\u0110\u0103ng k\u00fd"
    },
    id: {
      // Nav group labels
      "Overview": "Ikhtisar", "Delivery": "Pengiriman", "Risk & Quality": "Risiko & Kualitas",
      "Improve": "Peningkatan", "People & Cost": "SDM & Biaya", "Intelligence": "Inteligensi",
      "Setup": "Pengaturan", "Engineering": "Rekayasa", "Business": "Bisnis",
      // View titles
      "Dashboard": "Dasbor", "Portfolio": "Portofolio", "Cases (Master)": "Kasus (Utama)",
      "Kanban Board": "Papan Kanban", "Timeline": "Lini Masa", "Risk Register": "Daftar Risiko",
      "Budget": "Anggaran", "Settings": "Pengaturan", "Help": "Bantuan", "Project Brain": "Otak Proyek",
      // KPI labels
      "Total Cases": "Total Kasus", "Open / Active": "Terbuka / Aktif", "Critical": "Kritis",
      "Blocked": "Terblokir", "Projects": "Proyek",
      // Buttons
      "Save": "Simpan", "Cancel": "Batal", "Delete": "Hapus", "Apply": "Terapkan", "Close": "Tutup",
      "Export": "Ekspor", "Import": "Impor", "Login": "Masuk", "Logout": "Keluar", "Register": "Daftar"
    },
    ja: {
      // Nav group labels
      "Overview": "\u6982\u8981", "Delivery": "\u7d0d\u54c1", "Risk & Quality": "\u30ea\u30b9\u30af\u3068\u54c1\u8cea",
      "Improve": "\u6539\u5584", "People & Cost": "\u4eba\u54e1\u3068\u30b3\u30b9\u30c8", "Intelligence": "\u30a4\u30f3\u30c6\u30ea\u30b8\u30a7\u30f3\u30b9",
      "Setup": "\u8a2d\u5b9a", "Engineering": "\u30a8\u30f3\u30b8\u30cb\u30a2\u30ea\u30f3\u30b0", "Business": "\u30d3\u30b8\u30cd\u30b9",
      // View titles
      "Dashboard": "\u30c0\u30c3\u30b7\u30e5\u30dc\u30fc\u30c9", "Portfolio": "\u30dd\u30fc\u30c8\u30d5\u30a9\u30ea\u30aa", "Cases (Master)": "\u30b1\u30fc\u30b9 (\u30de\u30b9\u30bf\u30fc)",
      "Kanban Board": "\u30ab\u30f3\u30d0\u30f3\u30dc\u30fc\u30c9", "Timeline": "\u30bf\u30a4\u30e0\u30e9\u30a4\u30f3", "Risk Register": "\u30ea\u30b9\u30af\u767b\u9332\u7c3f",
      "Budget": "\u4e88\u7b97", "Settings": "\u8a2d\u5b9a", "Help": "\u30d8\u30eb\u30d7", "Project Brain": "\u30d7\u30ed\u30b8\u30a7\u30af\u30c8\u30d6\u30ec\u30a4\u30f3",
      // KPI labels
      "Total Cases": "\u7dcf\u30b1\u30fc\u30b9\u6570", "Open / Active": "\u30aa\u30fc\u30d7\u30f3 / \u30a2\u30af\u30c6\u30a3\u30d6", "Critical": "\u91cd\u5927",
      "Blocked": "\u30d6\u30ed\u30c3\u30af\u6e08\u307f", "Projects": "\u30d7\u30ed\u30b8\u30a7\u30af\u30c8",
      // Buttons
      "Save": "\u4fdd\u5b58", "Cancel": "\u30ad\u30e3\u30f3\u30bb\u30eb", "Delete": "\u524a\u9664", "Apply": "\u9069\u7528", "Close": "\u9589\u3058\u308b",
      "Export": "\u30a8\u30af\u30b9\u30dd\u30fc\u30c8", "Import": "\u30a4\u30f3\u30dd\u30fc\u30c8", "Login": "\u30ed\u30b0\u30a4\u30f3", "Logout": "\u30ed\u30b0\u30a2\u30a6\u30c8", "Register": "\u767b\u9332"
    },
    zh: {
      // Nav group labels
      "Overview": "\u6982\u89c8", "Delivery": "\u4ea4\u4ed8", "Risk & Quality": "\u98ce\u9669\u4e0e\u8d28\u91cf",
      "Improve": "\u6539\u8fdb", "People & Cost": "\u4eba\u5458\u4e0e\u6210\u672c", "Intelligence": "\u667a\u80fd",
      "Setup": "\u8bbe\u7f6e", "Engineering": "\u5de5\u7a0b", "Business": "\u4e1a\u52a1",
      // View titles
      "Dashboard": "\u4eea\u8868\u677f", "Portfolio": "\u9879\u76ee\u96c6", "Cases (Master)": "\u6848\u4f8b (\u4e3b\u8868)",
      "Kanban Board": "\u770b\u677f", "Timeline": "\u65f6\u95f4\u7ebf", "Risk Register": "\u98ce\u9669\u767b\u8bb0\u518c",
      "Budget": "\u9884\u7b97", "Settings": "\u8bbe\u7f6e", "Help": "\u5e2e\u52a9", "Project Brain": "\u9879\u76ee\u5927\u8111",
      // KPI labels
      "Total Cases": "\u6848\u4f8b\u603b\u6570", "Open / Active": "\u5f00\u653e / \u6d3b\u8dc3", "Critical": "\u5173\u952e",
      "Blocked": "\u5df2\u963b\u585e", "Projects": "\u9879\u76ee",
      // Buttons
      "Save": "\u4fdd\u5b58", "Cancel": "\u53d6\u6d88", "Delete": "\u5220\u9664", "Apply": "\u5e94\u7528", "Close": "\u5173\u95ed",
      "Export": "\u5bfc\u51fa", "Import": "\u5bfc\u5165", "Login": "\u767b\u5f55", "Logout": "\u9000\u51fa", "Register": "\u6ce8\u518c"
    }
  };

  const LANG_OPTIONS = [
    { code: "en", label: "English" },
    { code: "da", label: "Dansk" },
    { code: "th", label: "\u0e44\u0e17\u0e22" },
    { code: "vi", label: "Ti\u1ebfng Vi\u1ec7t" },
    { code: "id", label: "Bahasa Indonesia" },
    { code: "ja", label: "\u65e5\u672c\u8a9e" },
    { code: "zh", label: "\u4e2d\u6587" }
  ];

  function langCode() {
    return (S.brand() && S.brand().lang) || "en";
  }

  function translatePhrase(s) {
    var code = langCode();
    if (code === "en" || !I18N[code]) return s;
    return I18N[code][s] || s;
  }

  function applyI18n(root) {
    var code = langCode();
    if (code === "en") {
      // Restore originals if switching back to English
      (root || document).querySelectorAll("[data-i18n-orig]").forEach(function (el) {
        el.textContent = el.getAttribute("data-i18n-orig");
        el.removeAttribute("data-i18n-orig");
      });
      return;
    }
    var dict = I18N[code];
    if (!dict) return;
    // Walk text nodes and translate known phrases
    var targets = (root || document).querySelectorAll(".nav-sep, .kpi .label, .nav-item .lab, h1#viewTitle, .btn, [data-i18n]");
    targets.forEach(function (el) {
      if (el.closest("[data-i18n-skip]")) return;
      var orig = el.getAttribute("data-i18n-orig") || el.textContent.trim();
      if (dict[orig]) {
        if (!el.getAttribute("data-i18n-orig")) el.setAttribute("data-i18n-orig", orig);
        el.textContent = dict[orig];
      }
    });
  }

  function applyLang() {
    var code = langCode();
    document.documentElement.setAttribute("lang", code);
    var sel = document.getElementById("langSelect");
    if (sel) sel.value = code;
    applyI18n();
  }

  function setLanguage(code) {
    S.setBrand({ lang: code });
    applyLang();
    // Re-render the current view so translated content appears in dynamic HTML
    if (current && RENDER[current]) {
      content.innerHTML = RENDER[current]();
      if (AFTER[current]) AFTER[current]();
    }
    buildNav();
    applyI18n();
  }

  // ---------- views config ----------
  const VIEWS = [
    { g: "Overview" },
    { id: "clientview", label: "Client Portal", icon: "👁" },
    { id: "brain", label: "Project Brain", icon: "🧠" },
    { id: "programme", label: "Programme Timeline", icon: "⟿" },
    { id: "repair", label: "Repair Planning", icon: "🔧" },
    { id: "portfolio", label: "Portfolio", icon: "▣" },
    { id: "dashboard", label: "Dashboard", icon: "▤" },
    { id: "cases", label: "Cases (Master)", icon: "★" },
    { g: "Delivery" },
    { id: "pm", label: "PM Tasks", icon: "✔" },
    { id: "kanban", label: "Kanban Board", icon: "▥" },
    { id: "timeline", label: "Timeline", icon: "▦" },
    { g: "Risk & Quality" },
    { id: "risks", label: "Risk Register", icon: "⚠" },
    { id: "fmea", label: "FMEA", icon: "⌖" },
    { id: "sigma", label: "Six Sigma", icon: "∿" },
    { id: "gage", label: "Gage R&R (MSA)", icon: "📐" },
    { id: "riskmatrix", label: "Risk Matrix", icon: "▦" },
    { id: "xbarr", label: "X̄-R Control Chart", icon: "⎍" },
    { id: "capability", label: "Process Capability", icon: "◊" },
    { id: "ncrpareto", label: "NCR Pareto", icon: "▟" },
    { id: "riskheat", label: "Risk Heat Map", icon: "\uD83D\uDD25" },
    { g: "Improve" },
    { id: "pdca", label: "PDCA", icon: "↻" },
    { id: "log", label: "Action Log", icon: "✎" },
    { g: "People & Cost" },
    { id: "stakeholders", label: "Stakeholders", icon: "♟" },
    { id: "raci", label: "RACI Matrix", icon: "⊞" },
    { id: "budget", label: "Budget", icon: "$" },
    { g: "Intelligence" },
    { id: "ai", label: "AI Assistant", icon: "✦" },
    { id: "impact", label: "Change Impact", icon: "⇄" },
    { id: "scorecard", label: "KPI Scorecard", icon: "▣" },
    { id: "health", label: "Data Health", icon: "✚" },
    { g: "Setup" },
    { id: "workflows", label: "Workflows", icon: "⇉" },
    { id: "documents", label: "Documents", icon: "📄" },
    { id: "report", label: "Report Pack", icon: "🖨" },
    { id: "audit", label: "History & Backups", icon: "⟲" },
    { id: "config", label: "Settings", icon: "⚙" },
    { id: "help", label: "Help", icon: "?" }
  ];
  // splice in schema-driven Engineering & Business registers (+ EVM)
  (function insertRegisters() {
    const items = [{ g: "Engineering" }];
    C.REGISTERS.filter(r => r.group === "Engineering").forEach(r => items.push({ id: r.id, label: r.label, icon: r.icon }));
    items.push({ id: "bowtie", label: "Bow-tie (HAZOP)", icon: "🎀" });
    items.push({ g: "Business" }, { id: "evm", label: "Earned Value (EVM)", icon: "∑" }, { id: "cashflow", label: "Cash Flow / S-curve", icon: "〽" }, { id: "prioritise", label: "Prioritisation (RICE/WSJF)", icon: "⤒" });
    C.REGISTERS.filter(r => r.group === "Business").forEach(r => items.push({ id: r.id, label: r.label, icon: r.icon }));
    const idx = VIEWS.findIndex(v => v.g === "Intelligence");
    VIEWS.splice(idx, 0, ...items);
  })();
  const TITLES = {}; VIEWS.forEach(v => { if (v.id) TITLES[v.id] = v.label; });

  function buildNav() {
    const nav = $("#nav");
    nav.innerHTML = VIEWS.map(v => v.g
      ? `<div class="nav-sep">${esc(translatePhrase(v.g))}</div>`
      : `<button class="nav-item" data-view="${v.id}"><span class="ico">${v.icon}</span><span class="lab">${esc(translatePhrase(v.label))}</span></button>`).join("");
    nav.querySelectorAll(".nav-item").forEach(b => b.addEventListener("click", () => go(b.dataset.view)));
  }

  let current = "dashboard";
  function go(view, opts) {
    if (!RENDER[view]) view = "dashboard";
    current = view;
    $("#viewTitle").textContent = translatePhrase(TITLES[view] || "QI Platform");
    document.querySelectorAll(".nav-item").forEach(b => {
      const active = b.dataset.view === view;
      b.classList.toggle("active", active);
      if (active) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    $("#sidebar").classList.remove("open");
    CH.destroyAll();
    content.innerHTML = (RENDER[view] || (() => "<div class='empty'>Not found</div>"))();
    if (AFTER[view]) AFTER[view]();
    // Refresh alert badge on each navigation
    refreshAlertBadge();
    // Reflect the current view in the URL so back/forward and bookmarks work.
    if (!(opts && opts.skipHash)) {
      const target = "#" + view;
      if (location.hash !== target) {
        try { history.pushState(null, "", target); } catch (e) { try { location.hash = target; } catch (_) {} }
      }
    }
    window.scrollTo(0, 0);
  }

  // ---------- Alert / Notification System ----------
  const DISMISSED_ALERTS_KEY = "qi_dismissed_alerts";

  function getDismissedAlerts() {
    try {
      const raw = localStorage.getItem(DISMISSED_ALERTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function dismissAlert(alertId) {
    try {
      const dismissed = getDismissedAlerts();
      if (dismissed.indexOf(alertId) < 0) dismissed.push(alertId);
      localStorage.setItem(DISMISSED_ALERTS_KEY, JSON.stringify(dismissed));
    } catch (e) { /* no-op */ }
  }

  function getActiveAlerts() {
    if (!window.QIBrain || typeof QIBrain.checkAlerts !== "function") return { alerts: [], summary: { critical: 0, warning: 0, info: 0 } };
    const state = buildProjectState();
    const result = QIBrain.checkAlerts(state);
    const dismissed = getDismissedAlerts();
    const active = result.alerts.filter(a => dismissed.indexOf(a.id) < 0);
    let crit = 0, warn = 0, info = 0;
    active.forEach(a => { if (a.severity === "critical") crit++; else if (a.severity === "warning") warn++; else info++; });
    return { alerts: active, allAlerts: result.alerts, summary: { critical: crit, warning: warn, info: info } };
  }

  function refreshAlertBadge() {
    const badge = $("#alertBadge");
    if (!badge) return;
    const data = getActiveAlerts();
    const count = data.summary.critical + data.summary.warning;
    if (count > 0) {
      badge.textContent = count > 99 ? "99+" : String(count);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  function renderAlertDropdown() {
    const dropdown = $("#alertDropdown");
    if (!dropdown) return;
    const data = getActiveAlerts();
    if (data.alerts.length === 0) {
      dropdown.innerHTML = `<h4>Alerts</h4><p class="muted">No active alerts.</p>`;
      return;
    }
    // Group by severity
    const groups = { critical: [], warning: [], info: [] };
    data.alerts.forEach(a => { (groups[a.severity] || groups.info).push(a); });
    let html = `<h4>Alerts <span class="muted">(${data.alerts.length})</span></h4>`;
    ["critical", "warning", "info"].forEach(sev => {
      if (groups[sev].length === 0) return;
      html += `<div style="margin:8px 0 4px"><b style="text-transform:capitalize">${sev}</b> (${groups[sev].length})</div>`;
      groups[sev].forEach(a => {
        html += `<div class="alert-item">
          <span class="badge ${sev === "critical" ? "b-critical" : sev === "warning" ? "b-high" : "b-open"}">${esc(sev)}</span>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:13px">${esc(a.title)}</div>
            <div class="muted" style="font-size:12px">${esc(a.detail.slice(0, 100))}</div>
          </div>
          <button class="alert-dismiss" data-alert-id="${esc(a.id)}">Dismiss</button>
        </div>`;
      });
    });
    dropdown.innerHTML = html;
    dropdown.querySelectorAll(".alert-dismiss").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        dismissAlert(btn.dataset.alertId);
        renderAlertDropdown();
        refreshAlertBadge();
      });
    });
  }

  function toggleAlertDropdown() {
    const dropdown = $("#alertDropdown");
    if (!dropdown) return;
    const isOpen = !dropdown.hidden;
    if (isOpen) {
      dropdown.hidden = true;
    } else {
      renderAlertDropdown();
      dropdown.hidden = false;
    }
  }

  // Wire alert dropdown close on outside click & initial badge refresh
  document.addEventListener("click", () => {
    const dropdown = $("#alertDropdown");
    if (dropdown) dropdown.hidden = true;
  });
  refreshAlertBadge();

  // ---------- renderers ----------
  const RENDER = {};
  const AFTER = {};

  RENDER.dashboard = function () {
    const k = S.kpis();
    const kpi = (cls, label, val) => `<div class="kpi ${cls}"><div class="label">${label}</div><div class="value">${val}</div></div>`;
    const tourBanner = (S.brand() && S.brand().tourDone) ? "" : `
      <div class="tour-banner" role="status">
        <b>👋</b><span>First time? A 4-step tour will show you how the platform works in 30 seconds.</span>
        <button class="btn btn-sm" data-act="startTour">Take the tour</button>
        <button class="btn btn-sm" data-act="skipTour">Skip</button>
      </div>`;
    if (k.total === 0) {
      return tourBanner + `<div class="card empty-cta">
          <h2>You haven't added any cases yet</h2>
          <p>Get started by adding your first case. It will automatically populate every other view — PM tasks, scored risk, FMEA line, PDCA cycle, action-log entry, Gantt bar and budget line — all live.</p>
          <div class="empty-cta-actions">
            <button class="btn btn-primary" data-act="add">+ Add your first case</button>
            <button class="btn" data-act="goHelp">How it works</button>
          </div>
        </div>
        <p class="muted" style="text-align:center;margin-top:14px">Tip — press <span class="kbd">n</span> any time to add a new case, or <span class="kbd">?</span> to see all keyboard shortcuts.</p>`;
    }
    return tourBanner + `
      <div class="grid kpis" style="margin-bottom:16px">
        ${kpi("navy", translatePhrase("Total Cases"), k.total)}
        ${kpi("blue", translatePhrase("Open / Active"), k.open)}
        ${kpi("red", "Critical (RPN&ge;200)", k.crit)}
        ${kpi("gold", "Avg RPN", k.avgRpn)}
        ${kpi("green", "Avg % Done", pct(k.avgDone))}
        ${kpi("teal", translatePhrase("Blocked"), k.blocked)}
      </div>
      <div class="card">
        <div class="card-head"><h3>Cases by</h3>
          <select id="groupSel" style="max-width:170px">
            <option value="priority">Priority</option>
            <option value="status">Status</option>
            <option value="category">Category</option>
            <option value="owner">Owner</option>
          </select>
        </div>
        <div class="chart-box"><canvas id="chGroup"></canvas></div>
      </div>
      <div class="row2">
        <div class="card"><h3>Status mix</h3><div class="chart-box sm"><canvas id="chStatus"></canvas></div></div>
        <div class="card"><h3>Risk exposure (RPN) by category</h3><div class="chart-box sm"><canvas id="chRpn"></canvas></div></div>
      </div>
      <div class="card"><h3>Pareto — where the risk concentrates (80/20)</h3><div class="chart-box"><canvas id="chPareto"></canvas></div></div>`;
  };
  AFTER.dashboard = function () {
    if (!$("#groupSel")) return;   // empty-state branch — nothing to wire
    const drawGroup = () => {
      const f = $("#groupSel").value;
      const m = S.groupCounts(f); CH.bar("chGroup", Object.keys(m), Object.values(m));
    };
    $("#groupSel").addEventListener("change", drawGroup); drawGroup();
    const sm = S.groupCounts("status"); CH.pie("chStatus", Object.keys(sm), Object.values(sm));
    const rm = S.rpnByCategory(); CH.hbar("chRpn", Object.keys(rm), Object.values(rm));
    const p = S.paretoRPN();
    CH.pareto("chPareto", p.map(x => x.label), p.map(x => x.value), p.map(x => Math.round(x.cum)));
  };

  RENDER.cases = function () {
    const f = uiState.caseFilter;
    let list = S.enriched().filter(c => c.problem);
    if (f.status) list = list.filter(c => c.status === f.status);
    if (f.priority) list = list.filter(c => c.priority === f.priority);
    if (f.owner) list = list.filter(c => c.owner === f.owner);
    const sorters = {
      rpn: (a, b) => (b.rpn || 0) - (a.rpn || 0),
      priority: (a, b) => (a.priority || "z").localeCompare(b.priority || "z"),
      status: (a, b) => (a.status || "").localeCompare(b.status || ""),
      code: (a, b) => a.num - b.num
    };
    list.sort(sorters[f.sort] || sorters.rpn);
    // Pinned cases always float to the top, ordered by pinOrder (drag-to-reorder).
    list.sort((a, b) => {
      if (a.pinned && b.pinned) return (a.pinOrder || 0) - (b.pinOrder || 0);
      return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    });
    const names = S.get().roster.map(r => r.name).filter(Boolean);
    // saved views (per-project) and pagination
    const views = S.savedViews();
    const pageSize = (f.pageSize === 0 || f.pageSize) ? f.pageSize : 100;   // 0 means "All"
    const rendered = pageSize === 0 ? list.length : Math.min(pageSize, list.length);
    const visibleCases = list.slice(0, rendered);
    // Drop selections that no longer exist in the filtered list (defensive cleanup).
    const visibleIds = new Set(list.map(c => c.id));
    [...uiState.selected].forEach(id => { if (!visibleIds.has(id)) uiState.selected.delete(id); });
    const allSelected = visibleCases.length > 0 && visibleCases.every(c => uiState.selected.has(c.id));
    const someSelected = uiState.selected.size > 0;
    const rows = visibleCases.map(c => `
      <tr data-id="${c.id}" class="${uiState.selected.has(c.id) ? "row-selected" : ""} ${c.pinned ? "pinned-row" : ""}" ${c.pinned ? 'draggable="true"' : ""}>
        <td class="center"><input type="checkbox" data-bulk="row" data-id="${c.id}" ${uiState.selected.has(c.id) ? "checked" : ""} aria-label="Select ${esc(c.code)}"></td>
        <td class="pin-cell ${c.pinned ? "pin-on" : ""}" data-act="pin" data-id="${c.id}" title="${c.pinned ? "Unpin (drag to reorder)" : "Pin to top"}">${c.pinned ? "📌" : "<span class='muted'>📍</span>"}</td>
        <td>${esc(c.code)}</td>
        <td class="wrap">${esc(c.problem)}</td>
        <td>${esc(c.category)}</td>
        <td><select data-edit="priority" data-id="${c.id}" class="inline-sel">${opts(C.LISTS.priority, c.priority, "—")}</select></td>
        <td class="center">${c.rpn == null ? "" : c.rpn}</td>
        <td>${healthBadge(c.health)}</td>
        <td><select data-edit="owner" data-id="${c.id}" class="inline-sel">${opts(names, c.owner, "—")}</select></td>
        <td><select data-edit="status" data-id="${c.id}" class="inline-sel">${opts(C.LISTS.status, c.status, "—")}</select></td>
        <td>${barCell(c.percent)}</td>
        <td class="center">
          <button class="btn btn-sm" data-act="edit" data-id="${c.id}">Edit</button>
          <button class="btn btn-sm btn-danger" data-act="del" data-id="${c.id}">Del</button>
        </td>
      </tr>`).join("");
    const head = `<th class="center"><input type="checkbox" id="bulkAll" ${allSelected ? "checked" : ""} aria-label="Select all"></th>` +
      `<th aria-label="Pinned"></th><th>ID</th><th class='wrap'>Problem</th><th>Category</th><th>Priority</th><th>RPN</th><th>Health</th><th>Owner</th><th>Status</th><th>% Done</th><th></th>`;
    // quick filter chips — one-click presets (still click-only)
    const chipDefs = [
      { id: "all", label: "All", on: !f.status && !f.priority && !f.owner },
      { id: "open", label: "Open", on: f.status === "OPEN" },
      { id: "inprogress", label: "In progress", on: f.status === "IN PROGRESS" },
      { id: "blocked", label: "Blocked", on: f.status === "BLOCKED" },
      { id: "critical", label: "Critical", on: f.priority === "1-CRITICAL" },
      { id: "resolved", label: "Resolved", on: f.status === "RESOLVED" }
    ];
    const chips = `<div class="chips">${chipDefs.map(c => `<button class="chip ${c.on ? "on" : ""}" data-act="chip" data-chip="${c.id}">${esc(c.label)}</button>`).join("")}</div>`;
    return `
      <div class="toolbar">
        <button class="btn btn-primary" data-act="add">+ New Case</button>
        <select id="fltStatus" style="max-width:150px">${opts(C.LISTS.status, f.status, "All status")}</select>
        <select id="fltPriority" style="max-width:150px">${opts(C.LISTS.priority, f.priority, "All priority")}</select>
        <select id="fltOwner" style="max-width:150px">${opts(names, f.owner, "All owners")}</select>
        <select id="fltSort" style="max-width:160px">
          <option value="rpn">Sort: RPN</option><option value="priority" ${f.sort==="priority"?"selected":""}>Sort: Priority</option>
          <option value="status" ${f.sort==="status"?"selected":""}>Sort: Status</option><option value="code" ${f.sort==="code"?"selected":""}>Sort: ID</option>
        </select>
        <select id="pageSize" style="max-width:100px" title="Rows per page">
          <option value="50" ${f.pageSize===50?"selected":""}>50</option>
          <option value="100" ${(!f.pageSize||f.pageSize===100)?"selected":""}>100</option>
          <option value="200" ${f.pageSize===200?"selected":""}>200</option>
          <option value="0" ${f.pageSize===0?"selected":""}>All</option>
        </select>
        ${(f.status||f.priority||f.owner)?'<button class="btn btn-sm" data-act="clearflt">Clear</button>':''}
        <select id="savedViewPick" title="Saved view" style="max-width:180px">
          <option value="">Saved views…</option>
          ${views.map(v => `<option value="${v.id}">${esc(v.name)}</option>`).join("")}
        </select>
        <button class="btn btn-sm" data-act="saveview" title="Save current filter as a saved view">Save view</button>
        <button class="btn btn-sm" data-act="manageviews" title="Manage saved views">Manage</button>
        ${(f.savedViewId)?`<button class="btn btn-sm btn-danger" data-act="delsavedview" data-id="${f.savedViewId}">Delete view</button>`:''}
        <span class="grow"></span><button class="btn" data-act="csv">Export CSV</button>
        <span class="muted">${list.length} shown${rows === "" ? "" : list.length > rendered ? ` (first ${rendered})` : ""}</span>
      </div>
      ${chips}
      <div class="bulkbar" id="bulkBar" ${someSelected ? "" : "hidden"}>
        <span><b>${uiState.selected.size}</b> selected</span>
        <select id="bulkStatus"><option value="">Set status…</option>${opts(C.LISTS.status, "")}</select>
        <select id="bulkOwner"><option value="">Set owner…</option>${opts(names, "")}</select>
        <select id="bulkPriority"><option value="">Set priority…</option>${opts(C.LISTS.priority, "")}</select>
        <span class="grow"></span>
        <button class="btn btn-sm btn-danger" data-act="bulkdel">Delete selected</button>
        <button class="btn btn-sm" data-act="bulkclear">Clear</button>
      </div>
      ${tableWrap(head, rows)}
      ${rendered < list.length ? `<div class="loadmore" id="loadmore"><span class="muted">Showing first ${rendered} of ${list.length}.</span> <button class="btn btn-sm" data-act="pagemore">Load next ${pageSize}</button> <button class="btn btn-sm" data-act="pageall">Show all</button></div>` : ""}`;
  };
  AFTER.cases = function () {
    const bind = (id, key) => { const el = $("#" + id); if (el) el.addEventListener("change", () => { uiState.caseFilter[key] = el.value; go("cases"); }); };
    bind("fltStatus", "status"); bind("fltPriority", "priority"); bind("fltOwner", "owner"); bind("fltSort", "sort");
    // Page size dropdown
    const ps = $("#pageSize");
    if (ps) ps.addEventListener("change", () => { uiState.caseFilter.pageSize = Number(ps.value); go("cases"); });
    // Saved views — pick one to apply its filter, or use Save view to capture the current combo
    const sv = $("#savedViewPick");
    if (sv) sv.addEventListener("change", () => {
      const view = S.savedViews().find(v => v.id === sv.value);
      if (view) {
        uiState.caseFilter = Object.assign({ q: "", status: "", priority: "", owner: "", sort: uiState.caseFilter.sort, pageSize: uiState.caseFilter.pageSize }, view.filter, { savedViewId: view.id });
        toast("View: " + view.name);
        go("cases");
      }
    });
    // inline-edit: change priority / owner / status without opening the form.
    // Patch only the health badge cell instead of re-rendering the whole view.
    content.querySelectorAll("select[data-edit]").forEach(sel => {
      sel.addEventListener("change", () => {
        const cid = sel.dataset.id, field = sel.dataset.edit;
        S.updateCase(cid, { [field]: sel.value });
        toast("Updated " + field);
        const tr = sel.closest("tr");
        if (tr) {
          const c = S.enriched().find(x => x.id === cid);
          // Health is the cell after RPN. With the pin column inserted, that's nth-child(8).
          const healthCell = tr.querySelector("td:nth-child(8)");
          if (healthCell && c) healthCell.innerHTML = healthBadge(c.health);
        }
      });
    });
    // bulk select
    const bar = $("#bulkBar");
    const refreshBar = () => {
      const n = uiState.selected.size;
      if (!bar) return;
      bar.hidden = n === 0;
      const lbl = bar.querySelector("span"); if (lbl) lbl.innerHTML = `<b>${n}</b> selected`;
      const all = $("#bulkAll");
      const list = content.querySelectorAll('input[data-bulk="row"]');
      if (all) all.checked = list.length > 0 && [...list].every(c => c.checked);
    };
    content.querySelectorAll('input[data-bulk="row"]').forEach(cb => {
      cb.addEventListener("change", () => {
        if (cb.checked) uiState.selected.add(cb.dataset.id); else uiState.selected.delete(cb.dataset.id);
        const tr = cb.closest("tr"); if (tr) tr.classList.toggle("row-selected", cb.checked);
        refreshBar();
      });
    });
    const allCb = $("#bulkAll");
    if (allCb) allCb.addEventListener("change", () => {
      content.querySelectorAll('input[data-bulk="row"]').forEach(cb => {
        cb.checked = allCb.checked;
        if (allCb.checked) uiState.selected.add(cb.dataset.id); else uiState.selected.delete(cb.dataset.id);
        const tr = cb.closest("tr"); if (tr) tr.classList.toggle("row-selected", cb.checked);
      });
      refreshBar();
    });
    // bulk actions
    const bulkApply = (key) => {
      const sel = $("#bulk" + key); if (!sel) return;
      sel.addEventListener("change", () => {
        if (!sel.value) return;
        const ids = [...uiState.selected];
        if (!ids.length) { sel.value = ""; return; }
        const field = key.toLowerCase();
        S.bulkUpdate(ids, { [field]: sel.value });
        toast(`Updated ${ids.length} case(s).`);
        sel.value = "";
        go("cases");
      });
    };
    bulkApply("Status"); bulkApply("Owner"); bulkApply("Priority");
    // Auto-load more rows when scrolling near the bottom (infinite scroll).
    const lm = $("#loadmore");
    if (lm && typeof IntersectionObserver !== "undefined") {
      const io = new IntersectionObserver(entries => {
        if (entries[0] && entries[0].isIntersecting) {
          io.disconnect();
          const cur = uiState.caseFilter.pageSize || 100;
          uiState.caseFilter.pageSize = cur + 100;
          go("cases");
        }
      }, { rootMargin: "200px" });
      io.observe(lm);
    }
    // Drag-to-reorder pinned rows
    let dragRowId = null;
    content.querySelectorAll("tr.pinned-row[draggable]").forEach(tr => {
      tr.addEventListener("dragstart", e => {
        dragRowId = tr.dataset.id;
        if (e.dataTransfer) e.dataTransfer.setData("text/plain", dragRowId);
        tr.style.opacity = ".5";
      });
      tr.addEventListener("dragend", () => { tr.style.opacity = "1"; });
      tr.addEventListener("dragover", e => { e.preventDefault(); tr.classList.add("row-dragover"); });
      tr.addEventListener("dragleave", () => { tr.classList.remove("row-dragover"); });
      tr.addEventListener("drop", e => {
        e.preventDefault(); tr.classList.remove("row-dragover");
        const fromId = dragRowId || (e.dataTransfer && e.dataTransfer.getData("text/plain"));
        const toId = tr.dataset.id;
        if (fromId && toId && fromId !== toId) {
          S.reorderPin(fromId, toId);
          toast("Pin order updated");
          go("cases");
        }
      });
    });
  };

  RENDER.pm = function () {
    const rows = S.validCases().map(c => `<tr>
      <td>${esc(c.code)}</td><td class="wrap">${esc(c.problem)}</td><td>${esc(c.owner || "")}</td>
      <td><span class="pill">${esc(c.priority || "")}</span></td><td>${C.fmtDate(c.startDate)}</td>
      <td>${C.fmtDate(c.estEnd)}</td><td class="center">${c.estDays ?? ""}</td>
      <td>${barCell(c.percent)}</td><td>${statusBadge(c.status)}</td><td>${healthBadge(c.health)}</td></tr>`).join("");
    return tableWrap("<th>Task ID</th><th class='wrap'>Task</th><th>Owner</th><th>Priority</th><th>Start</th><th>Due</th><th>Est days</th><th>% Done</th><th>Status</th><th>Health</th>", rows);
  };

  RENDER.risks = function () {
    const rows = S.validCases().map(c => `<tr>
      <td>${esc(c.code.replace("CASE", "RISK"))}</td><td class="wrap">${esc(c.problem)}</td><td>${esc(c.category)}</td>
      <td class="center">${c.sev ?? ""}</td><td class="center">${c.occ ?? ""}</td><td class="center">${c.det ?? ""}</td>
      <td class="center"><b>${c.rpn ?? ""}</b></td><td><span class="pill">${esc(c.rpnBand)}</span></td>
      <td>${esc(c.leanMethod || "")}</td><td>${esc(c.owner || "")}</td><td>${statusBadge(c.status)}</td></tr>`).join("");
    return tableWrap("<th>Risk ID</th><th class='wrap'>Risk</th><th>Category</th><th>Sev</th><th>Occ</th><th>Det</th><th>RPN</th><th>Band</th><th>Mitigation</th><th>Owner</th><th>Status</th>", rows);
  };

  RENDER.fmea = function () {
    const rows = S.validCases().map(c => `<tr>
      <td>${esc(c.code)}</td><td>${esc(c.category)}</td><td class="wrap">${esc(c.problem)}</td>
      <td class="wrap">${esc(c.rootCause || "")}</td><td class="center">${c.sev ?? ""}</td><td class="center">${c.occ ?? ""}</td>
      <td class="center">${c.det ?? ""}</td><td class="center"><b>${c.rpn ?? ""}</b></td><td><span class="pill">${esc(c.rpnBand)}</span></td>
      <td class="wrap">${esc(c.ai)}</td><td>${esc(c.owner || "")}</td></tr>`).join("");
    return tableWrap("<th>Case</th><th>Area</th><th class='wrap'>Failure mode</th><th class='wrap'>Potential cause</th><th>Sev</th><th>Occ</th><th>Det</th><th>RPN</th><th>Band</th><th class='wrap'>Recommended action (AI)</th><th>Owner</th>", rows);
  };

  RENDER.pdca = function () {
    const rows = S.validCases().map((c, i) => `<tr>
      <td>${esc(c.code)}</td><td>Cycle ${i + 1}</td><td class="wrap">${esc(c.problem)}</td>
      <td class="wrap">${esc((c.rootCause || "") + (c.leanMethod ? " → " + c.leanMethod : ""))}</td>
      <td class="wrap">${esc(c.target || "")}</td><td class="wrap">${esc(c.ai)}</td><td>${statusBadge(c.status)}</td></tr>`).join("");
    return tableWrap("<th>Case</th><th>Cycle</th><th class='wrap'>Plan (problem)</th><th class='wrap'>Do (root cause + method)</th><th class='wrap'>Check (target)</th><th class='wrap'>Act (AI next step)</th><th>Status</th>", rows);
  };

  RENDER.log = function () {
    const rows = S.validCases().map(c => `<tr>
      <td>${esc(c.code)}</td><td>${C.fmtDate(c.dateLogged)}</td>
      <td class="wrap">Apply ${esc(c.leanMethod || "method")} to: ${esc(c.problem)}</td>
      <td>${esc(c.owner || "")}</td><td class="wrap">${esc(c.target || "")}</td><td>${statusBadge(c.status)}</td><td>${C.fmtDate(c.estEnd)}</td></tr>`).join("");
    return tableWrap("<th>Case</th><th>Date</th><th class='wrap'>Action</th><th>Owner</th><th class='wrap'>Expected outcome</th><th>Status</th><th>Due</th>", rows);
  };

  RENDER.timeline = function () {
    const cs = S.validCases().filter(c => c.startDate && c.estEnd);
    if (!cs.length) return `<div class="empty">Add cases with a start date to see the timeline.</div>`;
    let min = Math.min(...cs.map(c => +new Date(c.startDate))), max = Math.max(...cs.map(c => +new Date(c.estEnd)));
    const span = Math.max(max - min, 86400000);
    const day = 86400000, weeks = Math.ceil(span / (7 * day));
    let ticks = "";
    for (let w = 0; w <= weeks; w += Math.max(1, Math.round(weeks / 8))) {
      const d = new Date(min + w * 7 * day); ticks += `<div class="tick">${C.fmtDate(d.toISOString().slice(0, 10))}</div>`;
    }
    const rows = cs.map(c => {
      const s = +new Date(c.startDate), e = +new Date(c.estEnd);
      const left = ((s - min) / span) * 100, width = Math.max(((e - s) / span) * 100, 1.5);
      return `<div class="gantt-row"><div class="gantt-label" title="${esc(c.problem)}">${esc(c.code)} · ${esc(c.problem)}</div>
        <div class="gantt-track"><div class="gantt-bar" style="left:${left}%;width:${width}%" title="${C.fmtDate(c.startDate)} → ${C.fmtDate(c.estEnd)}">
          <span style="width:${Math.round((Number(c.percent) || 0) * 100)}%"></span></div></div></div>`;
    }).join("");
    return `<div class="card gantt">
      <div class="gantt-head"><div class="gantt-label">Case</div>${ticks}</div>
      ${rows}
      <p class="muted" style="margin-top:12px"><span class="badge b-resolved" style="background:#1f8a8a;color:#fff">Scheduled</span>
      <span class="badge b-resolved" style="background:#1f3864;color:#fff">Completed portion</span> · dates are AI-estimated from priority &amp; RPN.</p>
    </div>`;
  };

  RENDER.sigma = function () {
    const rows = S.sigmaRows().map((r, i) => `<tr>
      <td>${esc(r.week)}</td>
      <td><select data-sg="${i}" data-f="units">${opts(C.numSeq(0, 1000, 10), r.units ?? "", "—")}</select></td>
      <td><select data-sg="${i}" data-f="defects">${opts(C.numSeq(0, 200, 1), r.defects ?? "", "—")}</select></td>
      <td><select data-sg="${i}" data-f="opps">${opts(C.numSeq(1, 10, 1), r.opps ?? "", "—")}</select></td>
      <td class="center">${r.rate == null ? "" : (r.rate * 100).toFixed(2) + "%"}</td>
      <td class="center">${r.dpmo == null ? "" : Math.round(r.dpmo).toLocaleString()}</td>
      <td class="center"><b>${r.sigma ?? ""}</b></td><td class="center">${r.target}</td></tr>`).join("");
    return `<div class="card"><h3>Sigma & defect trend</h3>
      <div class="row2"><div class="chart-box"><canvas id="chSigma"></canvas></div><div class="chart-box"><canvas id="chDefect"></canvas></div></div></div>
      <div class="card"><h3>Control chart — defect % with control limits (UCL/LCL)</h3><div class="chart-box"><canvas id="chControl"></canvas></div>
        <p class="muted">Points outside the red limits signal a process shift worth investigating.</p></div>
      <div class="card"><h3>SPC — I-MR (individuals & moving range) for variable data</h3>
        <div class="row2"><div class="chart-box"><canvas id="chImrI"></canvas></div><div class="chart-box"><canvas id="chImrMR"></canvas></div></div>
        <p class="muted">Individuals chart limits use ±2.66·MR̄; the moving-range chart upper limit is 3.267·MR̄ (standard I-MR constants).</p></div>
      <div class="card"><h3>Weekly data (type Units, Defects, Opps/Unit)</h3>
      ${tableWrap("<th>Week</th><th>Units</th><th>Defects</th><th>Opps/Unit</th><th>Defect %</th><th>DPMO</th><th>Sigma</th><th>Target</th>", rows)}</div>`;
  };
  AFTER.sigma = function () {
    const draw = () => {
      const r = S.sigmaRows(), labels = r.map(x => x.week);
      CH.lines("chSigma", labels, [{ label: "Sigma", data: r.map(x => x.sigma) }, { label: "Target", data: r.map(x => x.target), dash: [6, 4] }], "Sigma level vs target");
      CH.lines("chDefect", labels, [{ label: "Defect %", data: r.map(x => x.rate == null ? null : +(x.rate * 100).toFixed(2)) }], "Defect % trend");
      const cc = S.controlChartData();
      CH.control("chControl", cc.labels, cc.values, cc.mean == null ? null : +cc.mean.toFixed(3), cc.ucl == null ? null : +cc.ucl.toFixed(3), cc.lcl == null ? null : +cc.lcl.toFixed(3));
      const sr = S.sigmaRows();
      const series = sr.map(x => x.rate == null ? null : +(x.rate * 100).toFixed(3));
      const im = C.imr(series);
      const imLabels = sr.map(x => x.week);
      CH.control("chImrI", imLabels, im.values, im.mean == null ? null : +im.mean.toFixed(3), im.ucl == null ? null : +im.ucl.toFixed(3), im.lcl == null ? null : +im.lcl.toFixed(3));
      CH.control("chImrMR", imLabels.slice(1), im.mr.filter(x => x !== null), im.mrbar == null ? null : +im.mrbar.toFixed(3), im.mrUcl == null ? null : +im.mrUcl.toFixed(3), 0);
    };
    draw();
    content.querySelectorAll("[data-sg]").forEach(inp => inp.addEventListener("change", () => {
      const i = +inp.dataset.sg, f = inp.dataset.f;
      S.get().sigma[i][f] = inp.value === "" ? null : Number(inp.value); S.save(); go("sigma");
    }));
  };

  RENDER.stakeholders = function () {
    const st = S.get().stakeholders, names = S.get().roster.map(r => r.name).filter(Boolean);
    const rows = st.map((s, i) => `<tr>
      <td><select data-sk="${i}" data-f="name">${opts(names, s.name, "—")}</select></td>
      <td><select data-sk="${i}" data-f="role">${opts(C.LISTS.roles, s.role, "—")}</select></td>
      <td><select data-sk="${i}" data-f="influence">${opts(C.LISTS.hml, s.influence, "—")}</select></td>
      <td><select data-sk="${i}" data-f="interest">${opts(C.LISTS.hml, s.interest, "—")}</select></td>
      <td><select data-sk="${i}" data-f="raci">${opts(C.LISTS.raci, s.raci, "—")}</select></td>
      <td><b>${esc(C.stakeholderStrategy(s.influence, s.interest))}</b></td>
      <td class="center"><button class="btn btn-sm btn-danger" data-act="delsk" data-id="${i}">Del</button></td></tr>`).join("");
    return `<div class="toolbar"><button class="btn btn-primary" data-act="addsk">+ Add stakeholder</button>
      <span class="muted">Engagement strategy auto-calculates from Influence × Interest.</span></div>
      ${tableWrap("<th>Stakeholder</th><th>Role</th><th>Influence</th><th>Interest</th><th>RACI</th><th>Strategy (auto)</th><th></th>", rows || " ")}`;
  };
  AFTER.stakeholders = function () {
    content.querySelectorAll("select[data-sk]").forEach(sel => sel.addEventListener("change", () => {
      const i = +sel.dataset.sk; S.get().stakeholders[i][sel.dataset.f] = sel.value; S.save(); go("stakeholders");
    }));
  };

  // ---------- RACI Matrix / Stakeholder Management ----------
  const RACI_ROLES = (function () {
    var B = window.QIBrain;
    if (B && B._profiles) {
      var fp = B._profiles.find(function (p) { return p.id === "fibre-telecom"; });
      if (fp && fp.roles) return fp.roles;
    }
    return ["Programme Director", "Project Manager", "Design Manager", "Survey Lead", "Permitting & Wayleave Manager", "Civil Works Manager", "OSP Engineer", "Cable Installation Supervisor", "Splicing Supervisor", "Test & Commissioning Lead", "QA/QC Manager", "HSE Officer", "Procurement Manager", "Logistics Coordinator", "Regional Coordinator", "NOC Manager", "GIS/Documentation Specialist", "Warehouse Manager", "Contract Administrator", "Finance Controller"];
  })();

  const RACI_ACTIVITIES = [
    { phase: "Survey & Design", activities: ["Route Survey", "System Design"] },
    { phase: "Permitting", activities: ["Cable Landing Permits"] },
    { phase: "Procurement", activities: ["Cable Manufacturing", "Cable Ship Charter"] },
    { phase: "Installation", activities: ["Marine Installation", "Shore-End Works"] },
    { phase: "Commissioning", activities: ["System Testing", "Acceptance/Handover"] },
    { phase: "Operations", activities: ["Network Operations"] }
  ];

  const RACI_ALL_ACTIVITIES = RACI_ACTIVITIES.reduce(function (arr, g) { return arr.concat(g.activities); }, []);

  const RACI_DEFAULTS = {
    "Route Survey": { "Survey Lead": "R", "Design Manager": "A", "Programme Director": "I", "HSE Officer": "C", "GIS/Documentation Specialist": "C" },
    "System Design": { "Design Manager": "R", "Programme Director": "A", "OSP Engineer": "C", "Survey Lead": "C", "Project Manager": "I" },
    "Cable Landing Permits": { "Permitting & Wayleave Manager": "R", "Programme Director": "A", "Contract Administrator": "C", "Regional Coordinator": "C", "Project Manager": "I" },
    "Cable Manufacturing": { "Procurement Manager": "R", "Project Manager": "A", "QA/QC Manager": "C", "Design Manager": "C", "Finance Controller": "I" },
    "Cable Ship Charter": { "Procurement Manager": "R", "Logistics Coordinator": "A", "Contract Administrator": "C", "Finance Controller": "I", "Programme Director": "I" },
    "Marine Installation": { "Cable Installation Supervisor": "R", "Project Manager": "A", "HSE Officer": "C", "QA/QC Manager": "C", "NOC Manager": "I" },
    "Shore-End Works": { "Civil Works Manager": "R", "Cable Installation Supervisor": "A", "HSE Officer": "C", "Permitting & Wayleave Manager": "C", "Regional Coordinator": "I" },
    "System Testing": { "Test & Commissioning Lead": "R", "QA/QC Manager": "A", "OSP Engineer": "C", "NOC Manager": "C", "Programme Director": "I" },
    "Acceptance/Handover": { "Project Manager": "R", "Programme Director": "A", "Test & Commissioning Lead": "C", "Contract Administrator": "C", "Finance Controller": "I" },
    "Network Operations": { "NOC Manager": "R", "Programme Director": "A", "Regional Coordinator": "C", "GIS/Documentation Specialist": "C", "Warehouse Manager": "I" }
  };

  const RACI_COLORS = { R: "#3b82f6", A: "#ef4444", C: "#eab308", I: "#22c55e" };

  function raciLoad() {
    var s = S.get(); s.registers = s.registers || {};
    var data = s.registers._raci;
    if (data && typeof data === "object" && !Array.isArray(data)) return data;
    // initialize from defaults
    var init = {};
    RACI_ALL_ACTIVITIES.forEach(function (act) {
      init[act] = {};
      RACI_ROLES.forEach(function (role) {
        init[act][role] = (RACI_DEFAULTS[act] && RACI_DEFAULTS[act][role]) || "";
      });
    });
    return init;
  }
  function raciSave(data) {
    var s = S.get(); s.registers = s.registers || {};
    s.registers._raci = data; S.save();
  }

  RENDER.raci = function () {
    var data = raciLoad();
    var abbr = RACI_ROLES.map(function (r) { return r.split(" ").map(function (w) { return w[0]; }).join(""); });
    var thCols = RACI_ROLES.map(function (r, i) {
      return '<th class="raci-col" title="' + esc(r) + '">' + esc(abbr[i]) + '</th>';
    }).join("");
    var rows = "";
    RACI_ACTIVITIES.forEach(function (group) {
      rows += '<tr class="raci-phase"><td colspan="' + (RACI_ROLES.length + 1) + '"><strong>' + esc(group.phase) + '</strong></td></tr>';
      group.activities.forEach(function (act) {
        rows += '<tr><td class="raci-act">' + esc(act) + '</td>';
        RACI_ROLES.forEach(function (role) {
          var val = (data[act] && data[act][role]) || "";
          var bg = val ? RACI_COLORS[val] || "#6b7280" : "#e5e7eb";
          var fg = val ? "#fff" : "#999";
          rows += '<td class="raci-cell" style="background:' + bg + ';color:' + fg + '">';
          rows += '<select class="raci-sel" data-act="' + esc(act) + '" data-role="' + esc(role) + '" style="background:transparent;color:inherit;border:none;width:100%;text-align:center;font-weight:bold">';
          rows += '<option value=""' + (val === "" ? " selected" : "") + '>-</option>';
          rows += '<option value="R"' + (val === "R" ? " selected" : "") + '>R</option>';
          rows += '<option value="A"' + (val === "A" ? " selected" : "") + '>A</option>';
          rows += '<option value="C"' + (val === "C" ? " selected" : "") + '>C</option>';
          rows += '<option value="I"' + (val === "I" ? " selected" : "") + '>I</option>';
          rows += '</select></td>';
        });
        rows += '</tr>';
      });
    });

    var legend = '<div style="margin:12px 0;display:flex;gap:16px;flex-wrap:wrap">' +
      '<span style="padding:2px 10px;background:#3b82f6;color:#fff;border-radius:4px;font-weight:bold">R = Responsible</span>' +
      '<span style="padding:2px 10px;background:#ef4444;color:#fff;border-radius:4px;font-weight:bold">A = Accountable</span>' +
      '<span style="padding:2px 10px;background:#eab308;color:#fff;border-radius:4px;font-weight:bold">C = Consulted</span>' +
      '<span style="padding:2px 10px;background:#22c55e;color:#fff;border-radius:4px;font-weight:bold">I = Informed</span>' +
      '<span style="padding:2px 10px;background:#e5e7eb;color:#999;border-radius:4px">- = Not involved</span></div>';

    var matrix = '<div class="card"><h3>RACI Matrix - Submarine Cable Programme</h3>' + legend +
      '<div class="table-wrap"><table class="raci-table" id="raciTable"><thead><tr><th>Activity</th>' + thCols + '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';

    // Country Authorities section
    var countryHtml = "";
    var B = window.QIBrain;
    if (B && B._profiles) {
      var fp = B._profiles.find(function (p) { return p.id === "fibre-telecom"; });
      if (fp && fp.COUNTRY_DATABASE) {
        var phaseMap = {
          "Route Survey": "feasibility", "System Design": "feasibility",
          "Cable Landing Permits": "permitting", "Cable Manufacturing": "permitting",
          "Cable Ship Charter": "construction", "Marine Installation": "construction",
          "Shore-End Works": "construction", "System Testing": "operations",
          "Acceptance/Handover": "operations", "Network Operations": "operations"
        };
        var countryRows = fp.COUNTRY_DATABASE.map(function (c) {
          var auths = c.regulatoryAuthorities;
          var authList = Object.keys(auths).map(function (k) {
            var a = auths[k];
            var phases = [];
            Object.keys(phaseMap).forEach(function (act) {
              if (c.keyContacts && c.keyContacts[phaseMap[act]]) {
                var contacts = c.keyContacts[phaseMap[act]];
                if (contacts.some(function (ct) { return ct.toLowerCase().indexOf(a.name.split("/")[0].trim().toLowerCase()) >= 0 || ct.toLowerCase().indexOf(a.name.split(" ")[0].toLowerCase()) >= 0; })) {
                  var phase = phaseMap[act];
                  if (phases.indexOf(phase) < 0) phases.push(phase);
                }
              }
            });
            return '<tr><td>' + esc(a.name) + '</td><td class="wrap" style="font-size:0.85em">' + esc(a.fullName) + '</td><td class="wrap" style="font-size:0.85em">' + esc(a.jurisdiction) + '</td><td>' + (phases.length ? phases.map(function (p) { return '<span class="badge" style="margin:1px">' + esc(p) + '</span>'; }).join("") : '<span class="muted">All phases</span>') + '</td></tr>';
          }).join("");
          return '<div class="card" style="margin-top:8px"><h4>' + esc(c.name) + ' (' + esc(c.code) + ')</h4>' +
            '<div class="table-wrap"><table><thead><tr><th>Authority</th><th>Full Name</th><th>Jurisdiction</th><th>Phases</th></tr></thead><tbody>' +
            authList + '</tbody></table></div></div>';
        }).join("");
        countryHtml = '<div id="raciCountryAuthorities"><h3 style="margin-top:24px">Country Regulatory Authorities</h3>' +
          '<p class="muted">Reference data from the Project Brain - showing key authorities for each of the 8 programme countries.</p>' +
          countryRows + '</div>';
      }
    }

    return matrix + countryHtml;
  };

  AFTER.raci = function () {
    content.querySelectorAll(".raci-sel").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var act = sel.dataset.act, role = sel.dataset.role, val = sel.value;
        var data = raciLoad();
        if (!data[act]) data[act] = {};
        data[act][role] = val;
        raciSave(data);
        go("raci");
      });
    });
  };

  // ---------- Repair Planning ----------
  RENDER.repair = function () {
    var B = window.QIBrain;
    var db = null;
    if (B && B._profiles) {
      var fp = B._profiles.find(function (p) { return p.id === "fibre-telecom"; });
      if (fp && fp.REPAIR_DATABASE) db = fp.REPAIR_DATABASE;
    }

    if (!db) {
      return '<div class="card"><h3>Repair Planning</h3><p class="muted">No repair database available. Ensure the fibre-telecom profile is loaded.</p></div>';
    }

    // Ship table
    var shipRows = db.repairShips.map(function (ship) {
      return '<tr>' +
        '<td>' + esc(ship.name) + '</td>' +
        '<td>' + esc(ship.operator) + '</td>' +
        '<td>' + esc(ship.homePort) + '</td>' +
        '<td>' + ship.speed + ' kn</td>' +
        '<td>' + ship.mobilizationDays[0] + '-' + ship.mobilizationDays[1] + ' days</td>' +
        '<td>$' + Math.round(ship.dayRate[0] / 1000) + '-' + Math.round(ship.dayRate[1] / 1000) + 'k/day</td>' +
        '<td>' + ship.depthRating.toLocaleString() + 'm</td>' +
        '</tr>';
    }).join('');

    var shipTable = '<div class="card"><h3>Cable Repair Vessel Fleet</h3>' +
      '<div class="table-wrap"><table id="repairShipTable"><thead><tr>' +
      '<th>Vessel</th><th>Operator</th><th>Home Port</th><th>Speed</th><th>Mobilization</th><th>Day Rate</th><th>Depth Rating</th>' +
      '</tr></thead><tbody>' + shipRows + '</tbody></table></div></div>';

    // Spare depots
    var depotRows = db.spareDepots.map(function (d) {
      return '<tr><td>' + esc(d.location) + '</td><td>' + esc(d.region) + '</td>' +
        '<td>' + d.stockPercent + '% of system length</td>' +
        '<td class="wrap">' + esc(d.description) + '</td></tr>';
    }).join('');

    var depotTable = '<div class="card"><h3>Spare Cable Depots</h3>' +
      '<div class="table-wrap"><table><thead><tr><th>Location</th><th>Region</th><th>Stock Level</th><th>Coverage</th></tr></thead><tbody>' +
      depotRows + '</tbody></table></div></div>';

    // Repair scenarios
    var scenarioRows = db.repairScenarios.map(function (s) {
      return '<tr><td>' + esc(s.label) + '</td>' +
        '<td>' + s.repairDays[0] + '-' + s.repairDays[1] + ' days</td>' +
        '<td>$' + (s.costRange[0] / 1000000).toFixed(0) + '-' + (s.costRange[1] / 1000000).toFixed(0) + 'M</td>' +
        '<td class="wrap">' + esc(s.description) + '</td></tr>';
    }).join('');

    var scenarioTable = '<div class="card"><h3>Repair Scenarios by Depth</h3>' +
      '<div class="table-wrap"><table><thead><tr><th>Scenario</th><th>Duration</th><th>Cost Range</th><th>Description</th></tr></thead><tbody>' +
      scenarioRows + '</tbody></table></div></div>';

    // Repair calculator
    var depthOptions = '<option value="100">Shallow (100m)</option>' +
      '<option value="500">Mid-depth (500m)</option>' +
      '<option value="1000">Mid-depth (1000m)</option>' +
      '<option value="2000">Deep (2000m)</option>' +
      '<option value="4000">Very Deep (4000m)</option>' +
      '<option value="6000">Ultra Deep (6000m)</option>';

    var faultOptions = '<option value="cable-break">Cable Break</option>' +
      '<option value="shunt-fault">Shunt Fault</option>' +
      '<option value="multiple-break">Multiple Break</option>' +
      '<option value="repeater-failure">Repeater Failure</option>';

    var calculator = '<div class="card" id="repairCalculator"><h3>Repair Cost Calculator</h3>' +
      '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;margin-bottom:16px">' +
      '<label style="display:flex;flex-direction:column;gap:4px"><span>Fault Depth</span><select id="repairDepth">' + depthOptions + '</select></label>' +
      '<label style="display:flex;flex-direction:column;gap:4px"><span>Fault Type</span><select id="repairFaultType">' + faultOptions + '</select></label>' +
      '<label style="display:flex;flex-direction:column;gap:4px"><span>Distance from Depot (km)</span><select id="repairDistance">' +
      '<option value="100">100 km</option><option value="300">300 km</option><option value="500" selected>500 km</option><option value="1000">1000 km</option><option value="2000">2000 km</option>' +
      '</select></label>' +
      '<button id="repairCalcBtn" class="btn-primary" style="padding:8px 16px">Calculate</button></div>' +
      '<div id="repairResult" class="muted">Select parameters and click Calculate to estimate repair cost.</div></div>';

    return '<h2 style="margin-bottom:16px">Cable Repair & Restoration Planning</h2>' +
      shipTable + depotTable + scenarioTable + calculator;
  };

  AFTER.repair = function () {
    var calcBtn = document.getElementById("repairCalcBtn");
    if (calcBtn) {
      calcBtn.addEventListener("click", function () {
        var depth = Number(document.getElementById("repairDepth").value);
        var faultType = document.getElementById("repairFaultType").value;
        var distance = Number(document.getElementById("repairDistance").value);
        var B = window.QIBrain;
        if (!B || !B.estimateRepairCost) return;
        var result = B.estimateRepairCost({ depth: depth, distanceFromDepotKm: distance, faultType: faultType });
        if (!result) return;
        var html = '<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px;margin-top:8px">' +
          '<h4 style="margin:0 0 12px 0">Repair Estimate</h4>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">' +
          '<div><strong>Nearest Ship:</strong><br>' + esc(result.nearestShip) + '</div>' +
          '<div><strong>Transit:</strong><br>' + result.transitDays + ' days</div>' +
          '<div><strong>Repair Duration:</strong><br>' + result.repairDays + ' days</div>' +
          '<div><strong>Total Duration:</strong><br>' + result.totalDays + ' days</div>' +
          '<div><strong>Estimated Cost:</strong><br>$' + result.estimatedCost.toLocaleString() + '</div>' +
          '<div><strong>Scenario:</strong><br>' + esc(result.scenario) + '</div>' +
          '</div></div>';
        document.getElementById("repairResult").innerHTML = html;
      });
    }
  };

  // ---------- Risk Heat Map ----------
  RENDER.riskheat = function () {
    var B = window.QIBrain;
    var countryDB = null;
    if (B && B._profiles) {
      var fp = B._profiles.find(function (p) { return p.id === "fibre-telecom"; });
      if (fp && fp.COUNTRY_DATABASE) countryDB = fp.COUNTRY_DATABASE;
    }

    // Risk scoring data for each country across 5 categories
    var RISK_SCORES = {
      Indonesia: { Geopolitical: "High", Geographical: "Critical", Regulatory: "High", Schedule: "Medium", Commercial: "Medium" },
      Thailand: { Geopolitical: "Medium", Geographical: "Medium", Regulatory: "Medium", Schedule: "Low", Commercial: "Low" },
      Vietnam: { Geopolitical: "Critical", Geographical: "High", Regulatory: "High", Schedule: "High", Commercial: "Medium" },
      Taiwan: { Geopolitical: "Critical", Geographical: "High", Regulatory: "Medium", Schedule: "Medium", Commercial: "Low" },
      Philippines: { Geopolitical: "High", Geographical: "Critical", Regulatory: "High", Schedule: "High", Commercial: "Medium" },
      Guam: { Geopolitical: "High", Geographical: "Medium", Regulatory: "High", Schedule: "Medium", Commercial: "Low" },
      Malaysia: { Geopolitical: "Medium", Geographical: "Medium", Regulatory: "Medium", Schedule: "Low", Commercial: "Low" },
      Brunei: { Geopolitical: "Low", Geographical: "Low", Regulatory: "Low", Schedule: "Low", Commercial: "Low" }
    };

    var countries = ["Indonesia", "Thailand", "Vietnam", "Taiwan", "Philippines", "Guam", "Malaysia", "Brunei"];
    var categories = ["Geopolitical", "Geographical", "Regulatory", "Schedule", "Commercial"];

    var severityColor = function (sev) {
      if (sev === "Critical") return "background:#e74c3c;color:#fff";
      if (sev === "High") return "background:#f39c12;color:#fff";
      if (sev === "Medium") return "background:#f1c40f;color:#333";
      return "background:#27ae60;color:#fff";
    };

    var severityRPN = function (sev) {
      if (sev === "Critical") return 4;
      if (sev === "High") return 3;
      if (sev === "Medium") return 2;
      return 1;
    };

    // Build matrix header
    var headerCells = '<th style="min-width:110px">Country</th>' + categories.map(function (c) {
      return '<th style="text-align:center">' + esc(c) + '</th>';
    }).join('');

    // Build matrix rows
    var matrixRows = countries.map(function (country) {
      var scores = RISK_SCORES[country];
      var cells = categories.map(function (cat) {
        var sev = scores[cat];
        return '<td class="riskheat-cell" style="text-align:center;padding:10px;font-weight:bold;' + severityColor(sev) + '">' + esc(sev) + '</td>';
      }).join('');
      return '<tr data-country="' + esc(country) + '"><td style="font-weight:bold;padding:8px 12px">' + esc(country) + '</td>' + cells + '</tr>';
    }).join('');

    var matrix = '<div class="card"><h3>Risk Concentration Matrix</h3>' +
      '<div class="table-wrap"><table id="riskHeatTable"><thead><tr>' + headerCells + '</tr></thead><tbody>' + matrixRows + '</tbody></table></div></div>';

    // Summary bar - count by severity
    var counts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    countries.forEach(function (country) {
      var scores = RISK_SCORES[country];
      categories.forEach(function (cat) {
        counts[scores[cat]]++;
      });
    });
    var total = countries.length * categories.length;
    var summaryBar = '<div class="card" id="riskHeatSummary"><h3>Summary: Total Risks by Severity</h3>' +
      '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:12px">' +
      '<div style="padding:10px 18px;border-radius:8px;background:#e74c3c;color:#fff"><strong>' + counts.Critical + '</strong> Critical</div>' +
      '<div style="padding:10px 18px;border-radius:8px;background:#f39c12;color:#fff"><strong>' + counts.High + '</strong> High</div>' +
      '<div style="padding:10px 18px;border-radius:8px;background:#f1c40f;color:#333"><strong>' + counts.Medium + '</strong> Medium</div>' +
      '<div style="padding:10px 18px;border-radius:8px;background:#27ae60;color:#fff"><strong>' + counts.Low + '</strong> Low</div>' +
      '<div style="padding:10px 18px;border-radius:8px;background:#95a5a6;color:#fff"><strong>' + total + '</strong> Total</div>' +
      '</div></div>';

    // Top 10 Programme Risks - compute RPN based on country challenges
    var allRisks = [];
    countries.forEach(function (country) {
      var scores = RISK_SCORES[country];
      var countryInfo = countryDB ? countryDB.find(function (c) { return c.name === country; }) : null;

      // Add geopolitical risk entry
      var geoPolChallenge = (countryInfo && countryInfo.geopoliticalChallenges && countryInfo.geopoliticalChallenges[0]) || "Geopolitical risk";
      allRisks.push({
        country: country,
        category: "Geopolitical",
        severity: scores.Geopolitical,
        rpn: severityRPN(scores.Geopolitical) * severityRPN(scores.Geographical),
        description: geoPolChallenge
      });

      // Add geographical risk entry
      var geoChallenge = (countryInfo && countryInfo.geographicalChallenges && countryInfo.geographicalChallenges[0]) || "Geographical risk";
      allRisks.push({
        country: country,
        category: "Geographical",
        severity: scores.Geographical,
        rpn: severityRPN(scores.Geographical) * severityRPN(scores.Geopolitical),
        description: geoChallenge
      });
    });

    // Sort by RPN descending, take top 10
    allRisks.sort(function (a, b) { return b.rpn - a.rpn; });
    var top10 = allRisks.slice(0, 10);

    var top10Rows = top10.map(function (r, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(r.country) + '</td>' +
        '<td>' + esc(r.category) + '</td>' +
        '<td style="' + severityColor(r.severity) + ';padding:4px 10px;border-radius:4px;text-align:center">' + esc(r.severity) + '</td>' +
        '<td>' + r.rpn + '</td>' +
        '<td class="wrap">' + esc(r.description) + '</td></tr>';
    }).join('');

    var top10Table = '<div class="card"><h3>Top 10 Programme Risks</h3>' +
      '<div class="table-wrap"><table id="riskHeatTop10"><thead><tr>' +
      '<th>#</th><th>Country</th><th>Category</th><th>Severity</th><th>RPN</th><th>Description</th>' +
      '</tr></thead><tbody>' + top10Rows + '</tbody></table></div></div>';

    return '<h2 style="margin-bottom:16px">Risk Heat Map</h2>' + summaryBar + matrix + top10Table;
  };

  AFTER.riskheat = function () {
    // No interactive elements needed for now; the view is read-only
  };

  RENDER.budget = function () {
    const k = S.kpis();
    const kpi = (cls, l, v) => `<div class="kpi ${cls}"><div class="label">${l}</div><div class="value">${v}</div></div>`;
    const rows = S.enriched().filter(c => c.problem).map(c => {
      const variance = (c.estCost === "" || c.actCost === "" || c.estCost == null || c.actCost == null) ? null : (Number(c.estCost) - Number(c.actCost));
      const vtxt = variance == null ? "" : (variance < 0 ? `<span style="color:#c00000">${money(variance)}</span>` : `<span style="color:#548235">+${money(variance)}</span>`);
      return `<tr><td>${esc(c.code)}</td><td class="wrap">${esc(c.problem)}</td>
        <td><select data-bg="${c.id}" data-f="costCat">${opts(C.LISTS.costCat, c.costCat, "—")}</select></td>
        <td><input type="number" min="0" step="100" data-bg="${c.id}" data-f="estCost" value="${c.estCost ?? ""}" style="width:100px"></td>
        <td><input type="number" min="0" step="100" data-bg="${c.id}" data-f="actCost" value="${c.actCost ?? ""}" style="width:100px"></td>
        <td class="right">${vtxt}</td><td>${statusBadge(c.status)}</td></tr>`;
    }).join("");
    return `<div class="grid kpis" style="margin-bottom:16px">
        ${kpi("navy", "Total Est. Budget", money(k.estTotal))}
        ${kpi("purple", "Total Actual Spend", money(k.actTotal))}
        ${kpi("teal", "Variance", money(k.estTotal - k.actTotal))}
        ${kpi("amber", "% of Budget Spent", pct(k.pctSpent))}</div>
      <div class="card"><h3>Estimate vs Actual by category</h3><div class="chart-box"><canvas id="chBudget"></canvas></div></div>
      <div class="card"><h3>Per-case budget</h3>
      ${tableWrap("<th>Case</th><th class='wrap'>Problem</th><th>Cost category</th><th>Est. cost</th><th>Actual cost</th><th>Variance</th><th>Status</th>", rows)}</div>`;
  };
  AFTER.budget = function () {
    const b = S.budgetByCategory(), labels = Object.keys(b.est);
    CH.grouped("chBudget", labels, [{ label: "Estimate", data: labels.map(l => b.est[l]) }, { label: "Actual", data: labels.map(l => b.act[l]) }]);
    content.querySelectorAll("[data-bg]").forEach(inp => inp.addEventListener("change", () => {
      const patch = {}; const f = inp.dataset.f;
      patch[f] = (inp.type === "number") ? (inp.value === "" ? "" : Number(inp.value)) : inp.value;
      S.updateCase(inp.dataset.bg, patch); go("budget");
    }));
  };

  RENDER.ai = function () {
    const k = S.kpis(), top = S.topRisks(10), e = S.validCases();
    const topExp = e.length ? e.slice().sort((a, b) => (b.rpn || 0) - (a.rpn || 0))[0] : null;
    const summary = `You are tracking ${k.total} case(s). ` +
      (k.crit ? `${k.crit} are CRITICAL (RPN&ge;200) and must be escalated today. ` : "No critical risks — good. ") +
      (k.blocked ? `${k.blocked} case(s) are BLOCKED — clear these first. ` : "") +
      `Average completion is ${pct(k.avgDone)}. ` +
      (topExp ? `Top exposure: "${esc(topExp.problem)}". ` : "") +
      `Budget: ${money(k.actTotal)} spent of ${money(k.estTotal)} (${pct(k.pctSpent)}). ` +
      `Focus: attack the top items in the queue below using their Lean methods.`;
    const rows = top.map((c, i) => `<tr><td class="center">${i + 1}</td><td>${esc(c.code)}</td>
      <td class="wrap">${esc(c.problem)}</td><td class="center"><b>${c.rpn ?? ""}</b></td>
      <td>${esc(c.owner || "")}</td><td class="wrap">${esc(c.ai)}</td></tr>`).join("");
    return `<div class="card"><h3>Executive summary <span class="tag">auto</span></h3><p style="line-height:1.6">${summary}</p></div>
      <div class="card"><h3>Priority action queue — ranked by RPN</h3>
      ${tableWrap("<th>#</th><th>Case</th><th class='wrap'>Problem</th><th>RPN</th><th>Owner</th><th class='wrap'>AI recommended action</th>", rows)}</div>
      <div class="card"><div class="card-head"><h3>Ask the advisor</h3>
        <select id="advSel" style="max-width:220px">${opts(C.LISTS.category)}</select></div>
        <div class="readout" id="advOut"></div></div>
      <div class="card"><div class="card-head"><h3>Ask the AI</h3><span class="muted" id="aiMode"></span></div>
        <div class="toolbar"><select id="aiQ" class="grow">${opts([
          "What should we tackle first this week?",
          "What is blocking delivery and how do we fix it?",
          "Which risks are most urgent and why?",
          "Summarise project status for leadership",
          "Where is the budget overrunning?",
          "What are the top quality issues?",
          "Which cases are overdue or at risk?"
        ], "What should we tackle first this week?")}</select>
          <button class="btn btn-primary" id="aiAsk">Ask</button></div>
        <div class="readout" id="aiOut"><span class="muted">Pick a question and click Ask.</span></div></div>`;
  };
  AFTER.ai = function () {
    const PLAY = {
      "Quality / Defects": "QUALITY: Run a Fishbone + 5-Whys to find the root cause. Add a Poka-Yoke check at the source. Track defect rate weekly on the Six Sigma trend.",
      "Delivery / Schedule": "DELIVERY: Map the value stream, expose handoff delays, set WIP limits with Kanban. Add a daily stand-up; measure on-time delivery %.",
      "Process / Flow": "PROCESS/FLOW: Apply Standard Work to remove variation. Use a Gemba walk to find the real bottleneck, then PDCA the fix in short cycles.",
      "People / Training": "PEOPLE/TRAINING: Build a standard onboarding checklist and skills matrix. Use A3 coaching so the team owns the improvement.",
      "Cost / Waste": "COST/WASTE: Use the 8 Wastes lens. Quantify each waste; attack the Pareto top-3 first for ~80% of the benefit.",
      "Safety / Compliance": "SAFETY/COMPLIANCE: Run an FMEA on high-severity steps, add controls that lower Detection risk, verify with an audit checklist.",
      "Technology / Tools": "TECHNOLOGY/TOOLS: Pilot the change in one team (PDCA), measure cycle-time before/after, then standardise and roll out.",
      "Customer / VOC": "CUSTOMER/VOC: Capture Voice-of-Customer, translate to CTQs, link each CTQ to a measurable target on a case."
    };
    const upd = () => { $("#advOut").textContent = PLAY[$("#advSel").value] || ""; };
    $("#advSel").addEventListener("change", upd); upd();

    // Ask the AI (BYO key, offline fallback)
    const ai = S.aiSettings();
    const modeEl = $("#aiMode");
    modeEl.textContent = ai.key ? `Live · ${ai.model}` : "Offline mode (add a key in Settings for live answers)";
    function context() {
      const k = S.kpis();
      const top = S.topRisks(20).map(c => `${c.code} | ${c.problem} | RPN ${c.rpn} | ${c.status} | owner ${c.owner || "?"} | method ${c.leanMethod || "?"} | target ${c.target || "?"}`).join("\n");
      return `Project: ${S.get().project.name}. Cases ${k.total}, critical ${k.crit}, open ${k.open}, avg %done ${Math.round(k.avgDone * 100)}%, budget ${k.actTotal}/${k.estTotal}.\nCases (top by RPN):\n${top}`;
    }
    function offlineAnswer(q) {
      const top = S.topRisks(3);
      if (!top.length) return "No cases yet — add some on the Cases page.";
      return "Offline summary (add an API key for tailored answers):\n" +
        top.map((c, i) => `${i + 1}. ${c.problem} — ${c.ai}`).join("\n");
    }
    $("#aiAsk").addEventListener("click", async () => {
      const q = $("#aiQ").value.trim(); if (!q) return;
      const out = $("#aiOut");
      if (!ai.key || typeof fetch !== "function") { out.textContent = offlineAnswer(q); return; }
      out.textContent = "Thinking…";
      try {
        const res = await fetch(ai.baseUrl.replace(/\/$/, "") + "/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + ai.key },
          body: JSON.stringify({
            model: ai.model,
            messages: [
              { role: "system", content: "You are a Lean/Six Sigma quality & project-management advisor. Use the provided project data. Be concise and action-oriented; reference case IDs." },
              { role: "user", content: context() + "\n\nQuestion: " + q }
            ],
            temperature: 0.3
          })
        });
        if (!res.ok) { out.textContent = "AI error (" + res.status + "). Check your key/endpoint in Settings. " + offlineAnswer(q); return; }
        const data = await res.json();
        out.textContent = (data.choices && data.choices[0] && data.choices[0].message.content) || "No response.";
      } catch (e) { out.textContent = "Could not reach the AI endpoint. " + offlineAnswer(q); }
    });
  };

  RENDER.brain = function () {
    const profiles = (window.QIBrain && QIBrain.listProfiles && QIBrain.listProfiles()) || [];
    const profOpts = `<option value="">Auto-detect domain</option>` +
      profiles.map(p => `<option value="${esc(p.id)}">${esc(p.label)}</option>`).join("");
    return `<div class="card">
        <h3>Project Brain <span class="tag">auto-plan</span></h3>
        <p style="line-height:1.6">Paste or upload your <b>project description</b>. The Brain analyses it
        <b>locally on this device</b> — nothing is uploaded or sent to any server — and builds a full plan:
        phases, tasks, a risk register, milestones, procurement and a budget skeleton. Review the preview,
        then apply it to the active project. It structures and tracks the work; people still execute it.</p>
        <div class="toolbar" style="flex-wrap:wrap;gap:8px">
          <label class="muted" for="brainProfile">Domain</label>
          <select id="brainProfile" style="max-width:280px">${profOpts}</select>
          <label class="btn btn-sm" for="brainFile">Upload .txt / .md</label>
          <input id="brainFile" type="file" accept=".txt,.md,text/plain,text/markdown" hidden />
          <span class="muted" id="brainFileName"></span>
        </div>
        <textarea id="brainText" rows="9" style="width:100%;margin-top:8px;font:inherit;padding:10px;border:1.5px solid var(--border);border-radius:8px"
          placeholder="Paste your project description here (stays on this device)…"></textarea>
        <div class="toolbar" style="margin-top:8px">
          <button class="btn btn-primary" id="brainAnalyze">Analyze</button>
          <button class="btn" id="brainClear">Clear</button>
        </div>
      </div>
      <div id="brainOut"></div>
      <div id="brainIntel"></div>`;
  };
  AFTER.brain = function () {
    const fileInput = $("#brainFile"), nameEl = $("#brainFileName"), ta = $("#brainText");
    if (fileInput) fileInput.addEventListener("change", () => {
      const f = fileInput.files && fileInput.files[0]; if (!f) return;
      nameEl.textContent = f.name;
      const reader = new FileReader();
      reader.onload = () => { ta.value = String(reader.result || ""); };
      reader.readAsText(f);
    });
    const clearBtn = $("#brainClear");
    if (clearBtn) clearBtn.addEventListener("click", () => { ta.value = ""; nameEl.textContent = ""; uiState.brainPlan = null; $("#brainOut").innerHTML = ""; });

    const analyzeBtn = $("#brainAnalyze");
    if (analyzeBtn) analyzeBtn.addEventListener("click", () => {
      const text = (ta.value || "").trim();
      if (!text) { toast("Paste or upload a project description first."); return; }
      if (!window.QIBrain) { toast("Brain engine not loaded."); return; }
      const plan = QIBrain.analyzeProject(text, { profile: $("#brainProfile").value || undefined });
      uiState.brainPlan = plan;
      renderBrainPreview(plan);
    });

    // --- Intelligence Engine: auto-run analyzeStatus on current project ---
    if (window.QIBrain && typeof QIBrain.analyzeStatus === "function") {
      renderBrainIntel();
    }
  };

  function buildProjectState() {
    return {
      cases: S.validCases(),
      registers: { milestones: S.regRows("milestones") },
      project: S.get().project
    };
  }

  function severityBadge(sev) {
    const map = { critical: "b-critical", high: "b-high", warning: "b-high", medium: "b-progress", low: "b-ontrack" };
    return `<span class="badge ${map[sev] || "b-open"}">${esc(sev)}</span>`;
  }

  function healthStatusBadge(status) {
    const map = { "critical": "b-critical", "warning": "b-high", "on-track": "b-ontrack" };
    return `<span class="badge ${map[status] || "b-open"}">${esc(status)}</span>`;
  }

  function confidenceBadge(conf) {
    const pctVal = Math.round((Number(conf) || 0) * 100);
    const cls = pctVal >= 80 ? "b-ontrack" : pctVal >= 50 ? "b-progress" : "b-high";
    return `<span class="badge ${cls}">${pctVal}%</span>`;
  }

  function renderBrainIntel() {
    const container = $("#brainIntel");
    if (!container) return;

    const state = buildProjectState();
    const status = QIBrain.analyzeStatus(state);
    const patternResult = QIBrain.detectPatterns(state);
    const recResult = QIBrain.recommend(state);
    const selfCheck = QIBrain.selfImproveCheck(state.cases);
    const lessons = QIBrain.recallLessons({ query: "" });

    // Show pending lessons toast/badge
    if (selfCheck.pendingLessons && selfCheck.pendingLessons.length > 0) {
      toast(selfCheck.pendingLessons.length + " pending lesson(s) to review", { ms: 4000 });
    }

    // --- Health Dashboard ---
    const healthHtml = `<div class="card" id="brainHealthDashboard">
      <h3>Health Dashboard ${healthStatusBadge(status.overallHealth)}</h3>
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin:12px 0">
        <div class="kpi navy"><div class="label">SPI</div><div class="value">${status.scores.spiEstimate}</div></div>
        <div class="kpi navy"><div class="label">CPI</div><div class="value">${status.scores.cpiEstimate}</div></div>
        <div class="kpi navy"><div class="label">Risk Exposure</div><div class="value">${status.scores.riskExposure}</div></div>
        <div class="kpi navy"><div class="label">Quality Index</div><div class="value">${status.scores.qualityIndex}</div></div>
      </div>
      ${status.findings.length > 0 ? `<p class="muted">${status.findings.length} finding(s) detected. Top issues:</p>
        <ul style="margin:4px 0;padding-left:20px">${status.findings.slice(0, 3).map(f => `<li>${severityBadge(f.severity)} ${esc(f.detail.slice(0, 100))}</li>`).join("")}</ul>` : `<p class="muted">No findings - project looks healthy.</p>`}
    </div>`;

    // --- Findings List ---
    const findingsRows = status.findings.map(f => `<tr>
      <td>${severityBadge(f.severity)}</td>
      <td>${esc(f.type)}</td>
      <td class="wrap">${esc(f.detail)}</td>
      <td class="wrap muted">${esc(f.type === "risk" ? "Reduce RPN via detection or occurrence improvements" : f.type === "cost" ? "Review budget allocation and change control" : f.type === "schedule" ? "Fast-track critical path or add resources" : f.type === "resource" ? "Redistribute workload" : "Investigate root cause")}</td>
    </tr>`).join("");
    const findingsHtml = `<div class="card" id="brainFindingsList">
      <h3>Findings <span class="tag">${status.findings.length}</span></h3>
      ${status.findings.length > 0 ? tableWrap("<th>Severity</th><th>Type</th><th>Detail</th><th>Recommendation</th>", findingsRows) : `<p class="muted">No findings to report.</p>`}
    </div>`;

    // --- Patterns Panel ---
    const patternsHtml = `<div class="card" id="brainPatternsPanel">
      <h3>Detected Patterns <span class="tag">${patternResult.patterns.length}</span></h3>
      ${patternResult.patterns.length > 0 ? patternResult.patterns.map(p => `<div style="border-left:3px solid var(--${p.severity === "critical" ? "red" : p.severity === "high" ? "amber" : "blue"},#666);padding:8px 12px;margin:8px 0;border-radius:4px">
        <div>${severityBadge(p.severity)} <b>${esc(p.type.replace(/_/g, " "))}</b></div>
        <div style="margin:4px 0">${esc(p.description)}</div>
        <div class="muted" style="font-size:0.9em">Evidence: ${esc(p.evidence)}</div>
        <div style="margin-top:4px;font-size:0.9em">Action: ${esc(p.suggestedAction)}</div>
      </div>`).join("") : `<p class="muted">No patterns detected in current data.</p>`}
    </div>`;

    // --- Recommendations Panel ---
    const recsHtml = `<div class="card" id="brainRecommendationsPanel">
      <h3>Recommendations <span class="tag">${recResult.recommendations.length}</span></h3>
      ${recResult.recommendations.length > 0 ? recResult.recommendations.map((r, i) => `<div style="display:flex;gap:12px;align-items:flex-start;padding:8px 0;${i > 0 ? "border-top:1px solid var(--border,#e0e0e0);" : ""}">
        <span class="badge b-${r.priority === 1 ? "critical" : r.priority === 2 ? "high" : "open"}">P${r.priority}</span>
        <div style="flex:1">
          <div><b>${esc(r.title)}</b> ${confidenceBadge(r.confidence)}</div>
          <div style="margin:4px 0">${esc(r.action)}</div>
          <div class="muted" style="font-size:0.9em">${esc(r.rationale)}</div>
        </div>
      </div>`).join("") : `<p class="muted">No recommendations at this time.</p>`}
    </div>`;

    // --- Lessons Panel ---
    const pendingCount = (selfCheck.pendingLessons || []).length;
    const pendingBadge = pendingCount > 0 ? ` <span class="badge b-high">${pendingCount} pending</span>` : "";
    const pendingHtml = pendingCount > 0 ? `<div style="border:1px dashed var(--amber,#e0a800);padding:12px;border-radius:8px;margin-bottom:12px">
      <b>Pending auto-generated lessons</b>${pendingBadge}
      ${selfCheck.pendingLessons.map((pl, idx) => `<div style="margin:8px 0;padding:6px 0;${idx > 0 ? "border-top:1px solid var(--border,#e0e0e0);" : ""}">
        <div>${esc(pl.challenge.slice(0, 120))}</div>
        <div class="muted" style="font-size:0.9em">${esc(pl.category)} | Impact: ${esc(pl.impact)}</div>
        <button class="btn btn-sm brainConfirmLesson" data-idx="${idx}" style="margin-top:4px">Confirm</button>
      </div>`).join("")}
    </div>` : "";

    const storedHtml = lessons.length > 0 ? lessons.map((l, i) => `<div style="padding:6px 0;${i > 0 ? "border-top:1px solid var(--border,#e0e0e0);" : ""}">
      <div><b>${esc(l.challenge.slice(0, 80))}</b></div>
      <div class="muted" style="font-size:0.9em">${esc(l.category)} | ${esc(l.impact)} impact | Recalled ${l.timesRecalled}x</div>
    </div>`).join("") : `<p class="muted">No lessons recorded yet.</p>`;

    const lessonsHtml = `<div class="card" id="brainLessonsPanel">
      <h3>Lessons Learned${pendingBadge}</h3>
      ${pendingHtml}
      <div style="margin-bottom:12px">${storedHtml}</div>
      <button class="btn btn-primary" id="brainRecordLesson">Record lesson</button>
    </div>`;

    // --- Vendor Directory Panel ---
    const vendorCategories = ["All", "Turnkey Systems", "Cable Manufacturers", "Installation Vessels", "Survey & Engineering", "Equipment & Components", "Landing Stations", "Consulting"];
    const vendorRegions = ["All", "Asia-Pacific", "Europe", "Americas", "Middle East", "Southeast Asia", "Nordic"];
    const vendorBudgets = ["All", "Premium", "Mid-range", "Competitive"];
    const catFilterOpts = vendorCategories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    const regFilterOpts = vendorRegions.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join("");
    const budFilterOpts = vendorBudgets.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join("");

    const vendorHtml = `<div class="card" id="brainVendorPanel">
      <h3>Vendor Directory <span class="tag">submarine telecom</span></h3>
      <div class="toolbar" style="flex-wrap:wrap;gap:8px;margin-bottom:12px">
        <label class="muted">Category</label>
        <select id="vendorCatFilter" style="max-width:200px">${catFilterOpts}</select>
        <label class="muted">Region</label>
        <select id="vendorRegFilter" style="max-width:180px">${regFilterOpts}</select>
        <label class="muted">Budget Tier</label>
        <select id="vendorBudFilter" style="max-width:160px">${budFilterOpts}</select>
        <span class="grow"></span>
        <button class="btn btn-primary" id="vendorCompareBtn" disabled>Compare Selected</button>
      </div>
      <div id="vendorTableWrap"></div>
    </div>`;

    // --- Alert Panel (full list in Brain view) ---
    const alertData = getActiveAlerts();
    const alertSummaryHtml = `<div class="alert-summary-bar">
      <span style="color:#e53e3e">${alertData.summary.critical} critical</span>
      <span style="color:#e0a800">${alertData.summary.warning} warnings</span>
      <span style="color:#3182ce">${alertData.summary.info} info</span>
    </div>`;
    const alertListHtml = alertData.allAlerts.length > 0
      ? alertData.allAlerts.map(a => `<tr>
          <td>${severityBadge(a.severity)}</td>
          <td>${esc(a.category)}</td>
          <td><b>${esc(a.title)}</b></td>
          <td class="wrap">${esc(a.detail)}</td>
          <td class="muted">${a.timestamp ? a.timestamp.slice(0, 10) : ""}</td>
          <td>${a.affectedId ? `<button class="btn btn-sm alertGoToCase" data-case-id="${esc(a.affectedId)}">Go to case</button>` : ""}</td>
        </tr>`).join("")
      : "";
    const alertPanelHtml = `<div class="card" id="brainAlertPanel">
      <h3>Alerts <span class="tag">${alertData.allAlerts.length}</span></h3>
      ${alertSummaryHtml}
      ${alertData.allAlerts.length > 0 ? tableWrap("<th>Severity</th><th>Category</th><th>Title</th><th>Detail</th><th>Time</th><th></th>", alertListHtml, "alert-tbl") : `<p class="muted">No alerts detected - programme health looks good.</p>`}
    </div>`;

    container.innerHTML = `<div style="display:flex;justify-content:flex-end;margin-bottom:12px"><button class="btn" id="brainPrintAnalysis">Print Analysis</button></div>` + alertPanelHtml + healthHtml + findingsHtml + patternsHtml + recsHtml + lessonsHtml + vendorHtml;

    // Wire "Confirm" buttons for pending lessons
    container.querySelectorAll(".brainConfirmLesson").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.idx);
        const pl = selfCheck.pendingLessons[idx];
        if (pl) {
          QIBrain.recordLesson(pl);
          toast("Lesson confirmed and stored.");
          renderBrainIntel();
        }
      });
    });

    // Wire "Go to case" buttons in alert panel
    container.querySelectorAll(".alertGoToCase").forEach(btn => {
      btn.addEventListener("click", () => {
        go("cases");
      });
    });

    // Wire "Record lesson" button
    const recordBtn = $("#brainRecordLesson");
    if (recordBtn) recordBtn.addEventListener("click", openRecordLessonModal);

    // Wire "Print Analysis" button
    const printAnalysisBtn = $("#brainPrintAnalysis");
    if (printAnalysisBtn) printAnalysisBtn.addEventListener("click", function () {
      var printWin = window.open("", "_blank");
      if (!printWin) { toast("Please allow pop-ups to print."); return; }
      var findingsListHtml = status.findings.length > 0
        ? `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:11px;margin-bottom:16px"><thead><tr><th>Severity</th><th>Type</th><th>Detail</th></tr></thead><tbody>${status.findings.map(function(f) { return "<tr><td>" + esc(f.severity) + "</td><td>" + esc(f.type) + "</td><td>" + esc(f.detail) + "</td></tr>"; }).join("")}</tbody></table>`
        : "<p>No findings to report.</p>";
      var recsListHtml = recResult.recommendations.length > 0
        ? `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:11px"><thead><tr><th>Priority</th><th>Title</th><th>Action</th><th>Confidence</th></tr></thead><tbody>${recResult.recommendations.map(function(r) { return "<tr><td>P" + r.priority + "</td><td>" + esc(r.title) + "</td><td>" + esc(r.action) + "</td><td>" + Math.round((Number(r.confidence)||0)*100) + "%</td></tr>"; }).join("")}</tbody></table>`
        : "<p>No recommendations at this time.</p>";
      printWin.document.write(`<!DOCTYPE html><html><head><title>Brain Intelligence Analysis</title><style>
        body{font-family:Arial,Helvetica,sans-serif;margin:20mm 15mm;color:#222}
        h1{font-size:18px;margin:0 0 4px}
        h2{font-size:14px;margin:20px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
        .sub{color:#555;font-size:12px;margin-bottom:16px}
        .scores{display:flex;gap:24px;margin:12px 0}
        .scores div{text-align:center}
        .scores .label{font-size:10px;color:#666;text-transform:uppercase}
        .scores .value{font-size:18px;font-weight:700}
        table{border-collapse:collapse;width:100%;font-size:11px}
        th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}
        th{background:#f0f4f8;font-weight:600}
        p{font-size:12px;color:#555}
        @media print{body{margin:10mm}@page{size:A4;margin:10mm}}
      </style></head><body>
        <h1>QI Platform &mdash; Brain Intelligence Analysis</h1>
        <div class="sub">Generated: ${new Date().toLocaleDateString()}</div>
        <h2>Health Status: ${esc(status.overallHealth)}</h2>
        <div class="scores">
          <div><div class="label">SPI</div><div class="value">${status.scores.spiEstimate}</div></div>
          <div><div class="label">CPI</div><div class="value">${status.scores.cpiEstimate}</div></div>
          <div><div class="label">Risk Exposure</div><div class="value">${status.scores.riskExposure}</div></div>
          <div><div class="label">Quality Index</div><div class="value">${status.scores.qualityIndex}</div></div>
        </div>
        <h2>Findings (${status.findings.length})</h2>
        ${findingsListHtml}
        <h2>Recommendations (${recResult.recommendations.length})</h2>
        ${recsListHtml}
      </body></html>`);
      printWin.document.close();
      printWin.focus();
      printWin.print();
    });

    // --- Vendor Directory wiring ---
    const vendorSelected = new Set();

    function categoryToFilter(cat) {
      const map = { "Turnkey Systems": "turnkey-systems", "Cable Manufacturers": "cable-manufacturers", "Installation Vessels": "installation-vessels", "Survey & Engineering": "survey-engineering", "Equipment & Components": "equipment-components", "Landing Stations": "landing-stations", "Consulting": "consulting" };
      return map[cat] || "";
    }
    function budgetToFilter(b) {
      const map = { "Premium": "premium", "Mid-range": "mid", "Competitive": "competitive" };
      return map[b] || "";
    }
    function regionToFilter(r) {
      const map = { "Asia-Pacific": "asia-pacific", "Europe": "europe", "Americas": "americas", "Middle East": "middle-east", "Southeast Asia": "southeast-asia", "Nordic": "nordic" };
      return map[r] || "";
    }
    function categoryLabel(cat) {
      const map = { "turnkey-systems": "Turnkey", "cable-manufacturers": "Cable Mfr", "installation-vessels": "Vessels", "survey-engineering": "Survey", "equipment-components": "Equipment", "landing-stations": "Landing", "consulting": "Consulting" };
      return map[cat] || cat;
    }
    function priceLabel(p) {
      const map = { "premium": "Premium", "mid": "Mid-range", "competitive": "Competitive" };
      return map[p] || p;
    }
    function priceBadgeCls(p) {
      const map = { "premium": "b-critical", "mid": "b-progress", "competitive": "b-ontrack" };
      return map[p] || "b-open";
    }

    function renderVendorTable() {
      const catVal = ($("#vendorCatFilter") || {}).value || "All";
      const regVal = ($("#vendorRegFilter") || {}).value || "All";
      const budVal = ($("#vendorBudFilter") || {}).value || "All";
      const criteria = {};
      if (catVal !== "All") criteria.category = categoryToFilter(catVal);
      if (regVal !== "All") criteria.region = regionToFilter(regVal);
      if (budVal !== "All") criteria.budgetTier = budgetToFilter(budVal);
      const vendors = QIBrain.vendorSearch(criteria);
      const rows = vendors.map(v => {
        const strengthsStr = (v.strengths || []).slice(0, 2).join(", ");
        const truncStr = strengthsStr.length > 60 ? strengthsStr.slice(0, 57) + "..." : strengthsStr;
        return `<tr>
          <td class="center"><input type="checkbox" class="vendor-chk" data-vid="${esc(v.id)}" ${vendorSelected.has(v.id) ? "checked" : ""}></td>
          <td><b>${esc(v.company)}</b></td>
          <td>${esc(v.hq)}</td>
          <td><span class="badge b-open">${esc(categoryLabel(v.category))}</span></td>
          <td><span class="badge ${priceBadgeCls(v.priceRange)}">${esc(priceLabel(v.priceRange))}</span></td>
          <td class="wrap muted">${esc(truncStr)}</td>
        </tr>`;
      }).join("");
      const head = `<th class="center"><input type="checkbox" id="vendorSelectAll"></th><th>Company</th><th>HQ</th><th>Category</th><th>Price</th><th class="wrap">Key Strengths</th>`;
      const wrap = $("#vendorTableWrap");
      if (wrap) {
        wrap.innerHTML = vendors.length > 0
          ? tableWrap(head, rows, "vendor-tbl")
          : `<p class="muted">No vendors match the selected filters.</p>`;
        wireVendorCheckboxes();
      }
    }

    function wireVendorCheckboxes() {
      const wrap = $("#vendorTableWrap");
      if (!wrap) return;
      wrap.querySelectorAll(".vendor-chk").forEach(cb => {
        cb.addEventListener("change", () => {
          if (cb.checked) vendorSelected.add(cb.dataset.vid);
          else vendorSelected.delete(cb.dataset.vid);
          updateCompareBtn();
          const sa = $("#vendorSelectAll");
          if (sa) {
            const all = wrap.querySelectorAll(".vendor-chk");
            sa.checked = all.length > 0 && [...all].every(c => c.checked);
          }
        });
      });
      const sa = $("#vendorSelectAll");
      if (sa) sa.addEventListener("change", () => {
        wrap.querySelectorAll(".vendor-chk").forEach(cb => {
          cb.checked = sa.checked;
          if (sa.checked) vendorSelected.add(cb.dataset.vid);
          else vendorSelected.delete(cb.dataset.vid);
        });
        updateCompareBtn();
      });
    }

    function updateCompareBtn() {
      const btn = $("#vendorCompareBtn");
      if (btn) {
        btn.disabled = vendorSelected.size < 2;
        btn.textContent = vendorSelected.size > 0 ? `Compare Selected (${vendorSelected.size})` : "Compare Selected";
      }
    }

    function openVendorCompareModal() {
      const ids = [...vendorSelected];
      if (ids.length < 2) { toast("Select at least 2 vendors to compare."); return; }
      const result = QIBrain.vendorComparison(ids);
      if (!result.vendors || result.vendors.length === 0) { toast("No vendors found."); return; }
      const vendors = result.vendors;
      const fields = [
        { key: "company", label: "Company" },
        { key: "hq", label: "HQ" },
        { key: "capabilities", label: "Capabilities", isList: true },
        { key: "products", label: "Products", isList: true },
        { key: "notableProjects", label: "Notable Projects", isList: true },
        { key: "priceRange", label: "Price Range" },
        { key: "leadTime", label: "Lead Time" },
        { key: "strengths", label: "Strengths", isList: true },
        { key: "considerations", label: "Considerations", isList: true }
      ];
      const headerCols = vendors.map(v => `<th>${esc(v.company)}</th>`).join("");
      const bodyRows = fields.map(f => {
        const cells = vendors.map(v => {
          const val = v[f.key];
          if (f.isList && Array.isArray(val)) return `<td class="wrap">${val.map(item => esc(item)).join("<br>")}</td>`;
          return `<td>${esc(val || "")}</td>`;
        }).join("");
        return `<tr><td><b>${esc(f.label)}</b></td>${cells}</tr>`;
      }).join("");
      const modal = $("#modal");
      modal.innerHTML = `<h2>Vendor Comparison</h2>
        <div class="sub">${esc(result.summary)}</div>
        <div class="table-wrap" style="margin:12px 0"><table class="vendor-compare-tbl"><thead><tr><th>Attribute</th>${headerCols}</tr></thead><tbody>${bodyRows}</tbody></table></div>
        <div class="modal-foot"><span></span><div style="display:flex;gap:8px">
          <button class="btn" id="vendorPrintBtn" data-act="print">Print / Save as PDF</button>
          <button class="btn btn-primary" data-act="cancel">Close</button></div></div>`;
      $("#modalOverlay").hidden = false;
      modal.querySelector("[data-act=cancel]").addEventListener("click", closeModal);
      modal.querySelector("#vendorPrintBtn").addEventListener("click", function () {
        var printWin = window.open("", "_blank");
        if (!printWin) { toast("Please allow pop-ups to print."); return; }
        var tableHtml = `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:12px"><thead><tr><th>Attribute</th>${headerCols}</tr></thead><tbody>${bodyRows}</tbody></table>`;
        printWin.document.write(`<!DOCTYPE html><html><head><title>Vendor Comparison</title><style>
          body{font-family:Arial,Helvetica,sans-serif;margin:20mm 15mm;color:#222}
          h1{font-size:18px;margin:0 0 4px}
          .sub{color:#555;font-size:12px;margin-bottom:16px}
          table{border-collapse:collapse;width:100%;font-size:11px}
          th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}
          th{background:#f0f4f8;font-weight:600}
          @media print{body{margin:10mm}@page{size:A4 landscape;margin:10mm}}
        </style></head><body>
          <h1>QI Platform &mdash; Vendor Comparison</h1>
          <div class="sub">Generated: ${new Date().toLocaleDateString()} | ${esc(result.summary)}</div>
          ${tableHtml}
        </body></html>`);
        printWin.document.close();
        printWin.focus();
        printWin.print();
      });
    }

    // Wire filter dropdowns
    const catFilter = $("#vendorCatFilter");
    const regFilter = $("#vendorRegFilter");
    const budFilter = $("#vendorBudFilter");
    if (catFilter) catFilter.addEventListener("change", renderVendorTable);
    if (regFilter) regFilter.addEventListener("change", renderVendorTable);
    if (budFilter) budFilter.addEventListener("change", renderVendorTable);

    // Wire compare button
    const compareBtn = $("#vendorCompareBtn");
    if (compareBtn) compareBtn.addEventListener("click", openVendorCompareModal);

    // Initial render of vendor table
    renderVendorTable();
  }

  function openRecordLessonModal() {
    const catOpts = opts(C.LISTS.category, "", "-- select category --");
    const impactOpts = opts(C.LISTS.hml, "Medium", "-- select impact --");
    const tagsList = ["risk", "cost", "schedule", "quality", "resource", "process", "technical", "stakeholder"];
    const tagOpts = opts(tagsList, "", "-- select tag --");
    const projTypes = ["fibre-telecom", "construction", "software", "manufacturing", "infrastructure", "general"];
    const projOpts = opts(projTypes, "", "-- select type --");
    const modal = $("#modal");
    modal.innerHTML = `<h2>Record Lesson</h2>
      <div class="sub">Capture knowledge from a resolved challenge. All fields use dropdowns except the description.</div>
      <form id="lessonForm">
        <div class="form-grid">
          <div class="field"><label>Category</label><select id="les_category">${catOpts}</select></div>
          <div class="field"><label>Impact</label><select id="les_impact">${impactOpts}</select></div>
          <div class="field"><label>Tag</label><select id="les_tag">${tagOpts}</select></div>
          <div class="field"><label>Project type</label><select id="les_projType">${projOpts}</select></div>
          <div class="field full"><label>Challenge &amp; resolution description</label>
            <textarea id="les_description" rows="4" style="width:100%;font:inherit;padding:8px;border:1.5px solid var(--border);border-radius:6px"
              placeholder="Describe the challenge and how it was resolved..."></textarea></div>
        </div>
        <div class="modal-foot"><span></span><div style="display:flex;gap:8px">
          <button type="button" class="btn" data-act="cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">Save lesson</button></div></div>
      </form>`;
    $("#modalOverlay").hidden = false;
    $("#lessonForm").addEventListener("submit", ev => {
      ev.preventDefault();
      const desc = ($("#les_description").value || "").trim();
      if (!desc) { toast("Please enter a description."); return; }
      const parts = desc.split(/[.;!\n]/).filter(Boolean);
      QIBrain.recordLesson({
        challenge: parts[0] || desc,
        resolution: parts.slice(1).join(". ") || desc,
        category: $("#les_category").value,
        tags: $("#les_tag").value ? [$("#les_tag").value] : [],
        impact: $("#les_impact").value || "medium",
        projectType: $("#les_projType").value
      });
      toast("Lesson recorded.");
      closeModal();
      renderBrainIntel();
    });
    modal.querySelector("[data-act=cancel]").addEventListener("click", closeModal);
  }
  function renderBrainPreview(plan) {
    const kpi = (cls, l, v) => `<div class="kpi ${cls}"><div class="label">${l}</div><div class="value">${v}</div></div>`;
    const s = plan.summary, sc = s.scale;
    const scaleBits = [];
    if (sc.routeKm) scaleBits.push(`${sc.routeKm} km route`);
    if (sc.sites) scaleBits.push(`${sc.sites} sites`);
    if (sc.homesPassed) scaleBits.push(`${sc.homesPassed.toLocaleString()} homes`);
    if (sc.durationMonths) scaleBits.push(`${sc.durationMonths} months`);
    const warn = plan.coverage.warnings.length
      ? `<div class="readout" style="border-left:3px solid var(--amber,#e0a800)">${plan.coverage.warnings.map(esc).join("<br>")}</div>` : "";
    const phaseRows = plan.phases.map(p => `<tr><td>${esc(p.name)}</td><td>${esc(p.owner)}</td><td class="center">${p.taskCount}</td></tr>`).join("");
    const riskRows = plan.risks.map(r => `<tr><td class="wrap">${esc(r.problem.replace(/^RISK:\s*/, ""))}</td><td class="center">${r.sev}</td><td class="center">${r.occ}</td><td class="center">${r.det}</td><td class="center"><b>${r.sev * r.occ * r.det}</b></td></tr>`).join("");
    const budgetRows = plan.budget.rows.map(b => `<tr><td>${esc(b.category)}</td><td class="right">${money(b.est)}</td></tr>`).join("");
    $("#brainOut").innerHTML = `
      <div class="card"><div class="card-head"><h3>Analysis — ${esc(s.title)}</h3>
        <span class="tag">${esc(s.domainLabel)} · ${Math.round(plan.coverage.confidence * 100)}% confidence</span></div>
        <p class="muted">${scaleBits.length ? "Detected scale: " + esc(scaleBits.join(" · ")) : "No explicit scale detected."}</p>
        ${warn}
        <div class="kpi-row" style="display:flex;gap:12px;flex-wrap:wrap;margin:8px 0">
          ${kpi("navy", "Phases", plan.phases.length)}
          ${kpi("navy", "Tasks", plan.cases.length)}
          ${kpi("navy", "Risks", plan.risks.length)}
          ${kpi("navy", "Milestones", plan.milestones.length)}
          ${kpi("navy", "Est. budget", money(plan.budget.total))}
        </div>
        <div class="toolbar">
          <button class="btn btn-primary" id="brainApply">Apply plan to active project</button>
          <span class="muted">Adds ${plan.cases.length + plan.risks.length} cases, ${plan.milestones.length} milestones and ${plan.procurement.length} procurement items.</span>
        </div>
      </div>
      <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="card"><h3>Work breakdown</h3>${tableWrap("<th>Phase</th><th>Owner</th><th>Tasks</th>", phaseRows)}</div>
        <div class="card"><h3>Top risks (FMEA RPN)</h3>${tableWrap("<th class='wrap'>Risk</th><th>S</th><th>O</th><th>D</th><th>RPN</th>", riskRows)}</div>
      </div>
      <div class="card"><h3>Budget skeleton</h3>${tableWrap("<th>Category</th><th class='right'>Estimate</th>", budgetRows)}</div>
      <div class="card"><h3>Suggested roles</h3><p>${plan.roles.map(r => `<span class="badge">${esc(r)}</span>`).join(" ")}</p></div>`;
    const applyBtn = $("#brainApply");
    if (applyBtn) applyBtn.addEventListener("click", () => {
      const n = applyBrainPlan(plan);
      toast(`Applied: ${n} cases, ${plan.milestones.length} milestones, ${plan.procurement.length} procurement items.`);
      go("dashboard");
    });
  }
  function applyBrainPlan(plan) {
    let n = 0;
    const add = c => { const copy = Object.assign({}, c); delete copy._brain; delete copy._phase; S.addCase(copy); n++; };
    plan.cases.forEach(add);
    plan.risks.forEach(add);
    plan.milestones.forEach(m => S.regAdd("milestones", Object.assign({}, m)));
    plan.procurement.forEach(p => S.regAdd("procurement", Object.assign({}, p)));
    return n;
  }

  RENDER.health = function () {
    const issues = S.health();
    if (!issues.length) return `<div class="card"><p class="health-ok">✓ All clear — every case is complete and consistent.</p></div>`;
    return `<div class="card"><h3>${issues.length} item(s) need attention</h3>
      ${issues.map(i => `<div class="health-issue"><span><b>${esc(i.code)}</b> · ${esc(i.msg)}</span></div>`).join("")}</div>`;
  };

  RENDER.config = function () {
    const p = S.get().project, roster = S.get().roster, b = S.brand(), ai = S.aiSettings();
    const names = roster.map(r => r.name).filter(Boolean);
    const rrows = roster.map((r, i) => `<tr>
      <td><select data-ro="${i}" data-f="name">${opts(C.LISTS.personNames, r.name, "—")}</select></td>
      <td><select data-ro="${i}" data-f="role">${opts(C.LISTS.roles, r.role, "—")}</select></td>
      <td class="center"><button class="btn btn-sm btn-danger" data-act="delro" data-id="${i}">Del</button></td></tr>`).join("");
    return `<div class="card"><h3>Project information</h3>
      <div class="form-grid">
        <div class="field"><label>Project name</label><select id="p_name">${opts(C.LISTS.projectNames, p.name, "—")}</select></div>
        <div class="field"><label>Sponsor</label><select id="p_sponsor">${opts(C.LISTS.personNames, p.sponsor, "—")}</select></div>
        <div class="field"><label>Project manager</label><select id="p_manager">${opts(C.LISTS.personNames, p.manager, "—")}</select></div>
        <div class="field"><label>Organization / Dept</label><select id="p_org">${opts(C.LISTS.orgs, p.org, "—")}</select></div>
        <div class="field"><label>Program start</label><input type="date" id="p_start" value="${esc(p.start)}"></div>
        <div class="field"><label>Target end</label><input type="date" id="p_end" value="${esc(p.end)}"></div>
        <div class="field"><label>Overall status</label><select id="p_status">${opts(C.LISTS.status, p.status)}</select></div>
        <div class="field"><label>Currency symbol</label><select id="p_cur">${opts(["$", "€", "£", "kr", "₹", "¥"], p.currency)}</select></div>
      </div>
      <div style="margin-top:14px"><button class="btn btn-primary" data-act="saveproj">Save project</button></div></div>

      <div class="card"><div class="card-head"><h3>Team roster</h3>
        <button class="btn btn-sm btn-primary" data-act="addro">+ Add member</button></div>
        <p class="muted" style="margin-top:-6px">These names populate the Owner &amp; Stakeholder dropdowns.</p>
        ${tableWrap("<th>Name / Owner</th><th>Role</th><th></th>", rrows)}</div>

      <div class="card"><h3>Data</h3>
        <div class="linkbtns">
          <button class="btn" data-act="export">Export JSON (backup)</button>
          <button class="btn" data-act="import">Import JSON (as new project)</button>
          <button class="btn" data-act="csv">Export cases CSV</button>
          <button class="btn btn-danger" data-act="reset">Reset to sample data</button>
        </div>
        <p class="muted" style="margin-top:10px">Your data is saved automatically in this browser. Export a JSON backup to move it to another device.</p></div>

      <div class="card"><h3>Branding</h3>
        <div class="form-grid">
          <div class="field"><label>Company name</label><input id="b_company" value="${esc(b.company || "")}" placeholder="Your company"></div>
          <div class="field"><label>Accent colour</label><input type="color" id="b_accent" value="${esc(b.accent || "#2e5496")}"></div>
          <div class="field full"><label>Logo</label>
            <div class="linkbtns" style="align-items:center">
              ${b.logo ? `<img src="${b.logo}" alt="logo" style="height:40px;border:1px solid var(--line);border-radius:6px;background:#fff;padding:2px">` : '<span class="muted">No logo set</span>'}
              <input type="file" id="logoFile" accept="image/*">
              ${b.logo ? '<button class="btn btn-sm btn-danger" data-act="rmlogo">Remove logo</button>' : ''}
            </div><span class="hint">PNG/SVG/JPG, ideally square. Stored locally, shown in the sidebar &amp; reports.</span></div>
        </div>
        <div style="margin-top:14px"><button class="btn btn-primary" data-act="savebrand">Save branding</button></div></div>

      <div class="card"><h3>AI assistant (optional — bring your own key)</h3>
        <p class="muted" style="margin-top:-6px">Leave blank to use the built-in offline advisor. The only field you type anywhere in the app is the secret API key below (it can't be a dropdown). It is stored only in this browser and sent only to the endpoint you choose.</p>
        <div class="form-grid">
          <div class="field"><label>Provider</label><select id="ai_provider">${opts(["openai", "azure-openai", "openai-compatible"], ai.provider || "openai")}</select></div>
          <div class="field"><label>Model</label><select id="ai_model">${opts(["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1", "o4-mini"], ai.model || "gpt-4o-mini")}</select></div>
          <div class="field full"><label>API base URL</label><select id="ai_base">${opts(["https://api.openai.com/v1"], ai.baseUrl || "https://api.openai.com/v1")}</select></div>
          <div class="field full"><label>API key (the only typed field)</label><input type="password" id="ai_key" value="${esc(ai.key || "")}" placeholder="sk-…"></div>
        </div>
        <div style="margin-top:14px"><button class="btn btn-primary" data-act="saveai">Save AI settings</button></div></div>`;
  };
  AFTER.config = function () {
    content.querySelectorAll("input[data-ro],select[data-ro]").forEach(inp => inp.addEventListener("change", () => {
      const i = +inp.dataset.ro; S.get().roster[i][inp.dataset.f] = inp.value; S.save();
      if (inp.dataset.f === "name") refreshHeader();
    }));
    const lf = $("#logoFile");
    if (lf) lf.addEventListener("change", e => {
      const f = e.target.files[0]; if (!f) return;
      if (f.size > 400000) { toast("Logo too large (max ~400 KB)."); return; }
      const fr = new FileReader();
      fr.onload = () => { S.setBrand({ logo: fr.result }); refreshHeader(); go("config"); toast("Logo set."); };
      fr.readAsDataURL(f);
    });
  };

  RENDER.help = function () {
    return `<div class="card"><div class="card-head"><h3>How it works</h3>
        <button class="btn btn-sm btn-primary" data-act="startTour">Take the tour</button></div><div class="steps">
      1. Set up your project &amp; team on <b>Settings</b> (names feed the Owner dropdowns).<br>
      2. Click <b>+ New Case</b> and fill the form — pick from dropdowns.<br>
      3. RPN, timing, health &amp; an AI recommendation calculate instantly.<br>
      4. That one case auto-appears as a PM task, scored risk, FMEA line, PDCA cycle, action-log entry, Gantt bar &amp; budget line.<br>
      5. Open <b>Dashboard</b> / <b>AI Assistant</b> for live KPIs, charts and the ranked action queue.
    </div></div>
    <div class="card"><h3>Your data is safe</h3><p>Everything is stored locally in your browser and saved automatically as you work — nothing is sent anywhere. Use <b>Export JSON</b> on the Settings page to back up or transfer your data, and <b>Import JSON</b> to restore it.</p></div>
    <div class="card"><h3>Print / share</h3><p>Use the <b>Print</b> button (top right) to print or save the current view as PDF. To share the app itself, host this folder on any static host (e.g. GitHub Pages).</p></div>`;
  };

  // ---------- Portfolio ----------
  RENDER.portfolio = function () {
    const ps = S.portfolio();
    const rows = ps.map(p => `<tr>
      <td><b>${esc(p.name)}</b>${p.active ? ' <span class="tag">active</span>' : ''}</td>
      <td>${statusBadge(p.status)}</td>
      <td class="center">${p.kpis.total}</td>
      <td class="center">${p.kpis.crit}</td>
      <td class="center">${p.kpis.open}</td>
      <td class="center">${pct(p.kpis.avgDone)}</td>
      <td class="right">${money(p.kpis.estTotal)}</td>
      <td class="right">${money(p.kpis.actTotal)}</td>
      <td class="center">
        ${p.active ? '' : `<button class="btn btn-sm" data-act="openproj" data-id="${p.id}">Open</button>`}
        <button class="btn btn-sm" data-act="renproj" data-id="${p.id}">Rename</button>
        <button class="btn btn-sm" data-act="dupproj" data-id="${p.id}">Duplicate</button>
        ${ps.length > 1 ? `<button class="btn btn-sm btn-danger" data-act="delproj" data-id="${p.id}">Del</button>` : ''}
      </td></tr>`).join("");
    const tot = ps.reduce((a, p) => ({ total: a.total + p.kpis.total, crit: a.crit + p.kpis.crit, open: a.open + p.kpis.open, est: a.est + p.kpis.estTotal, act: a.act + p.kpis.actTotal }), { total: 0, crit: 0, open: 0, est: 0, act: 0 });
    const kpi = (cls, l, v) => `<div class="kpi ${cls}"><div class="label">${l}</div><div class="value">${v}</div></div>`;
    return `<div class="grid kpis" style="margin-bottom:16px">
        ${kpi("navy", "Projects", ps.length)}
        ${kpi("blue", "All Cases", tot.total)}
        ${kpi("red", "All Critical", tot.crit)}
        ${kpi("teal", "All Open", tot.open)}
        ${kpi("purple", "Total Spend", money(tot.act))}</div>
      <div class="toolbar"><button class="btn btn-primary" data-act="newproj">+ New project</button>
        <span class="muted">Each project has its own cases, risks, budget, history and backups.</span></div>
      ${tableWrap("<th>Project</th><th>Status</th><th>Cases</th><th>Critical</th><th>Open</th><th>% Done</th><th>Est. budget</th><th>Actual</th><th></th>", rows)}`;
  };

  // ---------- Client / Investor Portal ----------
  RENDER.clientview = function () {
    var totalKm = PROGRAMME_SEGMENTS.reduce(function (a, s) { return a + s.km; }, 0);
    var countries = ["Singapore", "Indonesia", "Thailand", "Vietnam", "Philippines", "Guam", "Malaysia", "Brunei"];
    var completed = PROGRAMME_SEGMENTS.filter(function (s) { return s.status === "installed"; }).length;
    var inProgress = PROGRAMME_SEGMENTS.filter(function (s) { return s.status === "in-progress"; }).length;
    var overallStatus = completed === PROGRAMME_SEGMENTS.length ? "Complete" : inProgress > 0 ? "In Progress" : "Planning";

    // Progress indicators per segment
    var progressBars = PROGRAMME_SEGMENTS.map(function (seg) {
      var pctVal = seg.status === "installed" ? 100 : seg.status === "in-progress" ? 45 : 0;
      var colorStyle = seg.status === "installed" ? "background:#27ae60" : seg.status === "in-progress" ? "background:#2980b9" : "background:#95a5a6";
      return '<div class="client-progress-row" data-segment="' + esc(seg.id) + '">' +
        '<div class="client-progress-label">' + esc(seg.name) + ' <span class="muted">(' + seg.km + ' km)</span></div>' +
        '<div class="client-progress-bar-track">' +
          '<div class="client-progress-bar-fill" style="width:' + pctVal + '%;' + colorStyle + '"></div>' +
        '</div>' +
        '<div class="client-progress-pct">' + pctVal + '%</div>' +
      '</div>';
    }).join('');

    // Key milestones (next 5 upcoming)
    var milestones = [
      { name: "SEA-2 Cable Laying Complete", date: "2026-11-15", status: "On Track" },
      { name: "SEA-3 Route Survey Final", date: "2027-03-01", status: "On Track" },
      { name: "SEA-4 Environmental Permit", date: "2027-06-15", status: "Pending" },
      { name: "SEA-5 Marine Survey Start", date: "2027-09-01", status: "Planned" },
      { name: "SEA-6 Contract Award", date: "2027-12-01", status: "Planned" }
    ];
    var milestoneRows = milestones.map(function (m) {
      var badge = m.status === "On Track" ? "b-ontrack" : m.status === "Pending" ? "b-high" : "b-open";
      return '<tr><td>' + esc(m.name) + '</td><td>' + esc(m.date) + '</td><td><span class="badge ' + badge + '">' + esc(m.status) + '</span></td></tr>';
    }).join('');

    // Financial summary
    var totalBudget = totalKm * 45000;
    var spentToDate = Math.round(totalBudget * 0.18);
    var remaining = totalBudget - spentToDate;
    var cpi = 1.02;
    var cpiClass = cpi >= 0.95 ? "client-cpi-green" : cpi >= 0.85 ? "client-cpi-amber" : "client-cpi-red";

    return '<div class="client-portal" data-view="clientview">' +
      '<div class="client-header">' +
        '<h2>SEA Fibre Optic Network Programme</h2>' +
        '<p class="client-subtitle">Stakeholder Progress Report</p>' +
      '</div>' +

      '<div class="client-card">' +
        '<h3>Programme Summary</h3>' +
        '<div class="client-summary-grid">' +
          '<div class="client-summary-item"><span class="client-summary-label">Programme</span><span class="client-summary-value">SEA Submarine Cable Network</span></div>' +
          '<div class="client-summary-item"><span class="client-summary-label">Total Route</span><span class="client-summary-value">' + totalKm.toLocaleString() + ' km</span></div>' +
          '<div class="client-summary-item"><span class="client-summary-label">Countries Connected</span><span class="client-summary-value">' + countries.length + '</span></div>' +
          '<div class="client-summary-item"><span class="client-summary-label">Overall Status</span><span class="client-summary-value">' + overallStatus + '</span></div>' +
        '</div>' +
      '</div>' +

      '<div class="client-card">' +
        '<h3>Progress Indicators</h3>' +
        '<div class="client-progress-section">' + progressBars + '</div>' +
      '</div>' +

      '<div class="client-card">' +
        '<h3>Key Milestones</h3>' +
        '<div class="table-wrap"><table class="client-table"><thead><tr><th>Milestone</th><th>Target Date</th><th>Status</th></tr></thead>' +
        '<tbody>' + milestoneRows + '</tbody></table></div>' +
      '</div>' +

      '<div class="client-card">' +
        '<h3>Financial Summary</h3>' +
        '<div class="client-summary-grid">' +
          '<div class="client-summary-item"><span class="client-summary-label">Total Budget</span><span class="client-summary-value">$' + (totalBudget / 1e6).toFixed(1) + 'M</span></div>' +
          '<div class="client-summary-item"><span class="client-summary-label">Spent to Date</span><span class="client-summary-value">$' + (spentToDate / 1e6).toFixed(1) + 'M</span></div>' +
          '<div class="client-summary-item"><span class="client-summary-label">Remaining</span><span class="client-summary-value">$' + (remaining / 1e6).toFixed(1) + 'M</span></div>' +
          '<div class="client-summary-item"><span class="client-summary-label">CPI</span><span class="client-summary-value ' + cpiClass + '">' + cpi.toFixed(2) + '</span></div>' +
        '</div>' +
      '</div>' +

      '<div class="client-card client-actions-row">' +
        '<button class="btn btn-primary" data-act="goto3d">View 3D Route Map</button>' +
      '</div>' +

      '<div class="client-card client-safety">' +
        '<div class="client-safety-banner">Zero Lost Time Injuries (LTIs) to date</div>' +
      '</div>' +

      '<div class="client-footer">' +
        '<p>This report was generated by QI Platform.</p>' +
      '</div>' +
    '</div>';
  };

  AFTER.clientview = function () {
    var btn = content.querySelector('[data-act="goto3d"]');
    if (btn) {
      btn.addEventListener("click", function () {
        go("brain");
      });
    }
  };

  // ---------- Programme Timeline / Gantt ----------
  const PROGRAMME_SEGMENTS = [
    { id: "SEA-1", name: "SEA-1: Singapore - Jakarta", km: 1200, startDate: "2025-03-01", installedDate: "2026-09-15", status: "installed" },
    { id: "SEA-2", name: "SEA-2: Jakarta - Surabaya", km: 800, startDate: "2025-06-01", installedDate: "2027-02-28", status: "in-progress" },
    { id: "SEA-3", name: "SEA-3: Singapore - Bangkok", km: 1800, startDate: "2025-09-01", installedDate: "2027-12-31", status: "in-progress" },
    { id: "SEA-4", name: "SEA-4: Bangkok - Hanoi", km: 1500, startDate: "2026-01-01", installedDate: "2028-06-30", status: "planned" },
    { id: "SEA-5", name: "SEA-5: Manila - Guam", km: 2500, startDate: "2026-06-01", installedDate: "2029-03-31", status: "planned" },
    { id: "SEA-6", name: "SEA-6: Kuala Lumpur - Brunei", km: 1400, startDate: "2027-01-01", installedDate: "2029-12-31", status: "planned" }
  ];
  const PROG_TIMELINE_START = new Date("2025-01-01").getTime();
  const PROG_TIMELINE_END = new Date("2030-01-01").getTime();
  const PROG_TIMELINE_SPAN = PROG_TIMELINE_END - PROG_TIMELINE_START;

  function progPct(dateStr) {
    var t = new Date(dateStr).getTime();
    return Math.max(0, Math.min(100, ((t - PROG_TIMELINE_START) / PROG_TIMELINE_SPAN) * 100));
  }

  // Weather Window Calendar: marine cable installation restrictions by country
  const WEATHER_WINDOWS = [
    { country: "Indonesia", sea: "Java Sea", restrictedMonths: [12, 1, 2, 3], reason: "Northwest monsoon, high seas" },
    { country: "Thailand", sea: "Gulf of Thailand", restrictedMonths: [11, 12, 1, 2], reason: "Northeast monsoon" },
    { country: "Vietnam", sea: "South China Sea", restrictedMonths: [6, 7, 8, 9, 10, 11], reason: "Typhoon season" },
    { country: "Taiwan", sea: "Pacific", restrictedMonths: [7, 8, 9, 10], reason: "Typhoon belt" },
    { country: "Philippines", sea: "Philippine Sea", restrictedMonths: [7, 8, 9, 10, 11], reason: "Typhoon alley, 20+/year" },
    { country: "Guam", sea: "Western Pacific", restrictedMonths: [8, 9, 10, 11], reason: "Typhoon exposure" },
    { country: "Malaysia", sea: "South China Sea/Strait", restrictedMonths: [11, 12, 1, 2, 3], reason: "Northeast monsoon" },
    { country: "Brunei", sea: "South China Sea", restrictedMonths: [11, 12, 1, 2, 3], reason: "Northeast monsoon" }
  ];

  function renderWeatherWindows() {
    var rows = WEATHER_WINDOWS.map(function (w) {
      var blocks = '';
      for (var y = 2025; y <= 2029; y++) {
        for (var m = 1; m <= 12; m++) {
          var startDate = new Date(y, m - 1, 1);
          var endDate = new Date(y, m, 0); // last day of month
          var leftPct = progPct(startDate.toISOString().slice(0, 10));
          var rightPct = progPct(endDate.toISOString().slice(0, 10));
          var widthPct = Math.max(rightPct - leftPct, 0.3);
          var isRestricted = w.restrictedMonths.indexOf(m) >= 0;
          var cls = isRestricted ? 'weather-block-restricted' : 'weather-block-operational';
          blocks += '<div class="weather-block ' + cls + '" style="left:' + leftPct + '%;width:' + widthPct + '%" title="' + esc(w.country) + ' - ' + startDate.toLocaleDateString("en", { year: "numeric", month: "short" }) + (isRestricted ? ' (RESTRICTED: ' + esc(w.reason) + ')' : ' (Operational)') + '"></div>';
        }
      }
      return '<div class="weather-row">' +
        '<div class="weather-label">' + esc(w.country) + '<br><small>' + esc(w.sea) + '</small></div>' +
        '<div class="weather-track">' + blocks + '</div>' +
      '</div>';
    }).join('');

    return '<div class="card" id="weatherWindowCard">' +
      '<div class="card-head">' +
        '<h3>Weather Windows (Marine Cable Installation)</h3>' +
        '<label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">' +
          '<input type="checkbox" id="weatherToggle" checked> Show Weather Windows' +
        '</label>' +
      '</div>' +
      '<div id="weatherWindowSection" class="weather-section">' +
        '<div class="weather-chart">' + rows + '</div>' +
        '<div class="weather-legend">' +
          '<span class="weather-leg-item"><span class="weather-leg-swatch weather-block-restricted"></span> Restricted (monsoon/typhoon)</span>' +
          '<span class="weather-leg-item"><span class="weather-leg-swatch weather-block-operational"></span> Operational window</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  RENDER.programme = function () {
    var totalKm = PROGRAMME_SEGMENTS.reduce(function (a, s) { return a + s.km; }, 0);
    var completed = PROGRAMME_SEGMENTS.filter(function (s) { return s.status === "installed"; }).length;
    var overallProgress = Math.round((completed / PROGRAMME_SEGMENTS.length) * 100);
    var estBudget = "$" + (totalKm * 45).toLocaleString() + "k";

    var kpiRow = '<div class="grid kpis" style="margin-bottom:16px">' +
      '<div class="kpi navy"><div class="label">Total km</div><div class="value">' + totalKm.toLocaleString() + ' km</div></div>' +
      '<div class="kpi teal"><div class="label">Segments Completed</div><div class="value">' + completed + ' / ' + PROGRAMME_SEGMENTS.length + '</div></div>' +
      '<div class="kpi blue"><div class="label">Overall Progress</div><div class="value">' + overallProgress + '%</div></div>' +
      '<div class="kpi purple"><div class="label">Est. Budget</div><div class="value">' + estBudget + '</div></div>' +
      '</div>';

    // Monthly tick marks for 2025-2030
    var ticks = '';
    for (var y = 2025; y <= 2029; y++) {
      for (var m = 0; m < 12; m += 6) {
        var tickDate = new Date(y, m, 1);
        var leftPct = progPct(tickDate.toISOString().slice(0, 10));
        var label = tickDate.toLocaleDateString("en", { year: "2-digit", month: "short" });
        ticks += '<div class="prog-tick" style="left:' + leftPct + '%">' + label + '</div>';
      }
    }

    // Today marker
    var todayPct = progPct(new Date().toISOString().slice(0, 10));
    var todayMarker = '<div class="prog-today-marker" style="left:' + todayPct + '%" title="Today"></div>';

    // Segment bars
    var bars = PROGRAMME_SEGMENTS.map(function (seg) {
      var startPct = progPct(seg.startDate);
      var endPct = progPct(seg.installedDate);
      var widthPct = Math.max(endPct - startPct, 1);
      var colorClass = seg.status === "installed" ? "prog-bar-green" :
                       seg.status === "in-progress" ? "prog-bar-blue" : "prog-bar-gray";

      // Milestone diamonds: start, 50% point, end
      var midPct = startPct + (endPct - startPct) / 2;
      var diamonds = '<span class="prog-diamond" style="left:' + startPct + '%" title="Start: ' + seg.startDate + '"></span>' +
                     '<span class="prog-diamond" style="left:' + midPct + '%" title="50% milestone"></span>' +
                     '<span class="prog-diamond" style="left:' + endPct + '%" title="Installed: ' + seg.installedDate + '"></span>';

      return '<div class="prog-row">' +
        '<div class="prog-label">' + esc(seg.id) + '<br><small>' + esc(seg.name.split(": ")[1] || seg.name) + '</small></div>' +
        '<div class="prog-track">' +
          '<div class="prog-bar ' + colorClass + '" data-segment="' + esc(seg.id) + '" style="left:' + startPct + '%;width:' + widthPct + '%" title="' + esc(seg.name) + ' (' + seg.km + ' km)\n' + seg.startDate + ' to ' + seg.installedDate + '"></div>' +
          diamonds +
        '</div></div>';
    }).join("");

    return kpiRow +
      '<div class="card prog-gantt" id="programmeGantt">' +
        '<h3>Programme Timeline (2025 - 2030)</h3>' +
        '<div class="prog-chart">' +
          '<div class="prog-ticks">' + ticks + '</div>' +
          todayMarker +
          bars +
        '</div>' +
        '<div class="prog-legend">' +
          '<span class="prog-leg-item"><span class="prog-leg-swatch prog-bar-green"></span> Installed</span>' +
          '<span class="prog-leg-item"><span class="prog-leg-swatch prog-bar-blue"></span> In Progress</span>' +
          '<span class="prog-leg-item"><span class="prog-leg-swatch prog-bar-gray"></span> Planned</span>' +
          '<span class="prog-leg-item"><span class="prog-diamond-legend"></span> Milestone</span>' +
          '<span class="prog-leg-item"><span class="prog-today-legend"></span> Today</span>' +
        '</div>' +
      '</div>' +
      renderWeatherWindows() +
      '<div class="card" id="sCurveCard">' +
        '<h3>Cumulative Programme Spend (S-Curve)</h3>' +
        '<div class="chart-box"><canvas id="chSCurve"></canvas></div>' +
      '</div>';
  };
  AFTER.programme = function () {
    var bars = content.querySelectorAll(".prog-bar[data-segment]");
    bars.forEach(function (bar) {
      bar.style.cursor = "pointer";
      bar.addEventListener("click", function () {
        toast("Segment: " + bar.dataset.segment + " selected");
      });
    });

    // Weather window toggle
    var weatherToggle = document.getElementById("weatherToggle");
    var weatherSection = document.getElementById("weatherWindowSection");
    if (weatherToggle && weatherSection) {
      weatherToggle.addEventListener("change", function () {
        weatherSection.style.display = weatherToggle.checked ? "" : "none";
      });
    }

    // S-Curve chart
    if (typeof Chart !== "undefined") {
      var totalKm = PROGRAMME_SEGMENTS.reduce(function (a, s) { return a + s.km; }, 0);
      var totalBudget = totalKm * 45000; // USD per km
      var totalBudgetM = totalBudget / 1e6; // in millions
      var totalMonths = 60; // Jan 2025 to Dec 2029

      // Generate month labels
      var monthLabels = [];
      for (var mi = 0; mi < totalMonths; mi++) {
        var yr = 2025 + Math.floor(mi / 12);
        var mo = mi % 12;
        var monthName = new Date(yr, mo, 1).toLocaleDateString("en", { year: "2-digit", month: "short" });
        monthLabels.push(monthName);
      }

      // Planned S-curve: cumulative = totalBudget * (3t^2 - 2t^3) where t = month/totalMonths
      var plannedData = [];
      for (var pi = 0; pi < totalMonths; pi++) {
        var t = (pi + 1) / totalMonths;
        var cumulative = totalBudgetM * (3 * t * t - 2 * t * t * t);
        plannedData.push(Math.round(cumulative * 100) / 100);
      }

      // Actual spend: 8 months of data (SEA-1 installation ramp-up)
      var actualMonths = 8;
      var actualData = [];
      for (var ai = 0; ai < actualMonths; ai++) {
        var at = (ai + 1) / totalMonths;
        // Actual tracks slightly above planned in early months (front-loaded mobilization)
        var actualCum = totalBudgetM * (3 * at * at - 2 * at * at * at) * 1.05;
        actualData.push(Math.round(actualCum * 100) / 100);
      }

      // CPI estimate based on actual vs planned
      var lastActual = actualData[actualData.length - 1];
      var lastPlanned = plannedData[actualMonths - 1];
      var cpi = lastPlanned / lastActual; // cost performance index

      // Forecast: from month 8 to end, extrapolated with CPI adjustment
      var forecastData = new Array(actualMonths - 1).fill(null);
      forecastData.push(lastActual); // start from last actual
      for (var fi = actualMonths; fi < totalMonths; fi++) {
        var ft = (fi + 1) / totalMonths;
        var plannedIncrement = totalBudgetM * (3 * ft * ft - 2 * ft * ft * ft) -
                               totalBudgetM * (3 * ((fi) / totalMonths) * ((fi) / totalMonths) - 2 * Math.pow((fi) / totalMonths, 3));
        var forecastIncrement = plannedIncrement / cpi;
        var prev = forecastData[fi - 1];
        forecastData.push(Math.round((prev + forecastIncrement) * 100) / 100);
      }

      // Budget reference line (horizontal)
      var budgetLine = new Array(totalMonths).fill(totalBudgetM);

      var el = document.getElementById("chSCurve");
      var ctx = el && el.getContext("2d");
      if (ctx) {
        if (window.QICharts && QICharts.destroyAll) QICharts.destroyAll();
        new Chart(ctx, {
          type: "line",
          data: {
            labels: monthLabels,
            datasets: [
              {
                label: "Planned",
                data: plannedData,
                borderColor: "#2563eb",
                borderDash: [8, 4],
                borderWidth: 2,
                pointRadius: 0,
                fill: false,
                tension: 0.3
              },
              {
                label: "Actual",
                data: actualData,
                borderColor: "#16a34a",
                borderWidth: 3,
                pointRadius: 2,
                fill: false,
                tension: 0.2
              },
              {
                label: "Forecast",
                data: forecastData,
                borderColor: "#ea580c",
                borderDash: [4, 4],
                borderWidth: 2,
                pointRadius: 0,
                fill: false,
                tension: 0.3
              },
              {
                label: "Total Budget",
                data: budgetLine,
                borderColor: "#dc2626",
                borderDash: [12, 6],
                borderWidth: 1.5,
                pointRadius: 0,
                fill: false
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: "top" },
              tooltip: {
                callbacks: {
                  label: function (context) {
                    return context.dataset.label + ": $" + (context.parsed.y || 0).toFixed(1) + "M";
                  }
                }
              }
            },
            scales: {
              x: {
                title: { display: true, text: "Month" },
                ticks: { maxTicksLimit: 12 }
              },
              y: {
                title: { display: true, text: "Cumulative USD (Millions)" },
                beginAtZero: true,
                ticks: {
                  callback: function (value) { return "$" + value + "M"; }
                }
              }
            }
          }
        });
      }
    }
  };

  // ---------- Kanban board ----------
  const KCOLS = ["OPEN", "IN PROGRESS", "ON HOLD", "BLOCKED", "RESOLVED", "CLOSED"];
  RENDER.kanban = function () {
    const e = S.validCases();
    const cols = KCOLS.map(st => {
      const cards = e.filter(c => c.status === st).map(c => `
        <div class="kcard" draggable="true" tabindex="0" data-id="${c.id}" aria-label="${esc(c.code)} · ${esc(c.problem)}">
          <div class="kcard-top"><span class="pill">${esc(c.priority || "")}</span><b>RPN ${c.rpn ?? "—"}</b></div>
          <div class="kcard-title" data-act="edit" data-id="${c.id}">${esc(c.problem)}</div>
          <div class="kcard-foot"><span>${esc(c.owner || "—")}</span>${healthBadge(c.health)}</div>
        </div>`).join("");
      return `<div class="kcol" data-status="${st}">
        <div class="kcol-head">${esc(st)} <span class="kcount">${e.filter(c => c.status === st).length}</span></div>
        <div class="kcol-body" data-status="${st}">${cards || '<div class="kempty">—</div>'}</div></div>`;
    }).join("");
    return `<p class="muted" style="margin-bottom:10px">Drag a card to a new column to change its status. Click a title to edit.</p>
      <div class="kanban">${cols}</div>`;
  };
  AFTER.kanban = function () {
    let dragId = null;
    const KCOLS_LIST = KCOLS;
    content.querySelectorAll(".kcard").forEach(card => {
      card.addEventListener("dragstart", e => { dragId = card.dataset.id; if (e.dataTransfer) e.dataTransfer.setData("text/plain", dragId); card.style.opacity = ".5"; });
      card.addEventListener("dragend", () => { card.style.opacity = "1"; });
      // Keyboard reach: Left/Right move the card across columns; Up/Down move focus within the column.
      card.addEventListener("keydown", e => {
        const id = card.dataset.id;
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          const cur = card.closest(".kcol"); if (!cur) return;
          const cols = Array.from(content.querySelectorAll(".kcol"));
          const idx = cols.indexOf(cur);
          const next = e.key === "ArrowRight" ? Math.min(idx + 1, cols.length - 1) : Math.max(idx - 1, 0);
          if (next === idx) return;
          S.moveStatus(id, cols[next].dataset.status);
          toast("Moved to " + cols[next].dataset.status);
          go("kanban");
          const restored = document.querySelector('.kcard[data-id="' + id + '"]');
          if (restored) restored.focus();
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const sib = e.key === "ArrowDown" ? card.nextElementSibling : card.previousElementSibling;
          if (sib && sib.classList.contains("kcard")) sib.focus();
        } else if (e.key === "Enter") {
          e.preventDefault(); openCaseForm(id);
        }
      });
    });
    content.querySelectorAll(".kcol-body").forEach(col => {
      col.addEventListener("dragover", e => { e.preventDefault(); col.classList.add("kover"); });
      col.addEventListener("dragleave", () => col.classList.remove("kover"));
      col.addEventListener("drop", e => {
        e.preventDefault(); col.classList.remove("kover");
        const id = dragId || (e.dataTransfer && e.dataTransfer.getData("text/plain"));
        if (id) { S.moveStatus(id, col.dataset.status); toast("Moved to " + col.dataset.status); go("kanban"); }
      });
    });
  };

  // ---------- History & Backups (audit) ----------
  RENDER.audit = function () {
    const snaps = S.snapshots();
    const cmp = uiState.cmp || { a: "", b: "" };
    const opts2 = (sel) => `<option value="">— pick —</option><option value="live" ${sel === "live" ? "selected" : ""}>Current data (live)</option>` +
      snaps.map(s => `<option value="${s.id}" ${s.id === sel ? "selected" : ""}>${esc(new Date(s.ts).toLocaleString())} · ${esc(s.label)}</option>`).join("");
    const srows = snaps.length ? snaps.map(s => `<tr>
      <td>${esc(new Date(s.ts).toLocaleString())}</td><td>${esc(s.label)}</td>
      <td class="center">${(s.data.cases || []).filter(c => c.problem).length}</td>
      <td class="center"><button class="btn btn-sm" data-act="restore" data-id="${s.id}">Restore</button>
        <button class="btn btn-sm" data-act="snaprename" data-id="${s.id}">Rename</button>
        <button class="btn btn-sm btn-danger" data-act="delsnap" data-id="${s.id}">Del</button></td></tr>`).join("")
      : `<tr><td colspan="4" class="muted center">No snapshots yet — take one to create a restore point.</td></tr>`;
    const log = S.auditList();
    const arows = log.length ? log.slice(0, 200).map(a => `<tr>
      <td>${esc(new Date(a.ts).toLocaleString())}</td><td><span class="pill">${esc(a.action)}</span></td>
      <td>${esc(a.code)}</td><td class="wrap">${esc(a.detail)}</td></tr>`).join("")
      : `<tr><td colspan="4" class="muted center">No activity yet.</td></tr>`;
    return `<div class="card"><div class="card-head"><h3>Restore points (snapshots)</h3>
        <button class="btn btn-sm btn-primary" data-act="snap">+ Take snapshot</button></div>
        <p class="muted" style="margin-top:-6px">A snapshot saves a full copy you can roll back to. The latest 25 are kept.</p>
        ${tableWrap("<th>When</th><th>Label</th><th>Cases</th><th></th>", srows)}</div>
      <div class="card"><h3>Compare two restore points</h3>
        <p class="muted" style="margin-top:-6px">Pick any two snapshots (or compare a snapshot to the current live data) to see exactly what changed.</p>
        <div class="form-grid">
          <div class="field"><label>From</label><select id="cmpA">${opts2(cmp.a)}</select></div>
          <div class="field"><label>To</label><select id="cmpB">${opts2(cmp.b)}</select></div>
        </div>
        <div style="margin-top:14px"><button class="btn btn-primary" data-act="diffSnaps">Show diff</button></div></div>
      <div class="card"><div class="card-head"><h3>Change history</h3>
        <button class="btn btn-sm" data-act="clearaudit">Clear log</button></div>
        ${tableWrap("<th>When</th><th>Action</th><th>Case</th><th class='wrap'>Detail</th>", arows)}</div>`;
  };
  AFTER.audit = function () {
    const cA = $("#cmpA"), cB = $("#cmpB");
    if (cA) cA.addEventListener("change", () => { uiState.cmp = uiState.cmp || {}; uiState.cmp.a = cA.value; });
    if (cB) cB.addEventListener("change", () => { uiState.cmp = uiState.cmp || {}; uiState.cmp.b = cB.value; });
  };
  function showDiffModal() {
    const c = uiState.cmp || {};
    if (!c.a || !c.b) { toast("Pick two snapshots first."); return; }
    const d = S.diffSnapshots(c.a, c.b);
    if (!d) { toast("Could not compute diff."); return; }
    const fmt = (s) => s.ts === "live" ? "Current data (live)" : new Date(s.ts).toLocaleString() + " · " + s.label;
    const sec = (label, items, cls, render) => items.length
      ? `<div class="diff-section"><h4>${label} (${items.length})</h4>${render(items)}</div>`
      : `<div class="diff-section"><h4 class="muted">${label} (0)</h4></div>`;
    const addList = sec("Added cases", d.added, "diff-add", (xs) =>
      `<ul>${xs.map(x => `<li class="diff-add">+ ${esc(x.problem || "(no problem)")}</li>`).join("")}</ul>`);
    const remList = sec("Removed cases", d.removed, "diff-rem", (xs) =>
      `<ul>${xs.map(x => `<li class="diff-rem">− ${esc(x.problem || "(no problem)")}</li>`).join("")}</ul>`);
    const chgList = sec("Changed cases", d.changed, "diff-chg", (xs) =>
      `<div class="table-wrap" style="max-height:300px;overflow:auto"><table><thead><tr><th class="wrap">Case</th><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>` +
      xs.map(c => c.fields.map((f, i) => `<tr>${i === 0 ? `<td rowspan="${c.fields.length}" class="wrap">${esc(c.problem)}</td>` : ""}<td>${esc(f.field)}</td><td class="diff-rem">${esc(String(f.before == null ? "—" : f.before))}</td><td class="diff-add">${esc(String(f.after == null ? "—" : f.after))}</td></tr>`).join("")).join("") +
      `</tbody></table></div>`);
    $("#modal").innerHTML = `<h2>Snapshot diff</h2>
      <div class="sub"><b>From:</b> ${esc(fmt(d.a))} → <b>To:</b> ${esc(fmt(d.b))}</div>
      ${addList}${remList}${chgList}
      <div class="modal-foot"><span></span><div style="display:flex;gap:8px">
        <button class="btn btn-primary" data-act="cancel">Close</button></div></div>`;
    $("#modalOverlay").hidden = false;
  }

  // ---------- generic registers ----------
  function regBadgeClass(v) {
    const s = String(v).toLowerCase();
    if (/(overdue|gap|critical|fail|reject|slipped|major)/.test(s)) return "b-critical";
    if (/(due soon|at risk|under review|partial|requested|rfq|draft)/.test(s)) return "b-high";
    if (/(ok|met|approved|done|pass|verified|delivered|implemented|as-built)/.test(s)) return "b-ontrack";
    return "";
  }
  function regCtx() {
    return {
      owners: S.get().roster.map(r => r.name).filter(Boolean),
      caseCodes: S.enriched().filter(c => c.problem).map(c => c.code)
    };
  }
  function colOptions(col, ctx) {
    if (col.dyn === "owners") return ctx.owners;
    if (col.dyn === "cases") return ctx.caseCodes;
    if (col.list) return C.LISTS[col.list] || [];
    if (col.opts) return col.opts;
    return [];
  }
  function cellEditor(reg, row, col, ctx) {
    const v = row[col.key] == null ? "" : row[col.key];
    const a = `data-reg="${reg.id}" data-row="${row._id}" data-key="${col.key}"`;
    if (col.type === "date") return `<input type="date" ${a} value="${esc(v)}">`;
    let list;
    if (col.type === "select") list = colOptions(col, ctx);
    else if (col.type === "num") list = C.NUMOPTS[`${reg.id}.${col.key}`] || C.numSeq(0, 100, 5);
    else list = C.OPT[`${reg.id}.${col.key}`] || [];           // text -> curated dropdown
    return `<select ${a}>${opts(list, v, "—")}</select>`;
  }
  function cellComputed(col, row) {
    let val = col.compute ? col.compute(row) : "";
    if (val === null || val === undefined) val = "";
    let disp = val;
    if (col.fmt === "date") disp = C.fmtDate(val) || "";
    else if (col.fmt === "money" && val !== "") disp = money(val);
    if (col.badge === "raw" && val !== "") return `<span class="badge ${regBadgeClass(val)}">${esc(val)}</span>`;
    if (typeof col.badge === "function" && val !== "") { const cls = { crit: "b-critical", high: "b-high", ok: "b-ontrack" }[col.badge(val)] || ""; return `<span class="badge ${cls}">${esc(disp)}</span>`; }
    return esc(disp);
  }
  function dispBadge(col, v) {
    if (v === "" || v == null) return "";
    if (col.badge === "status") return statusBadge(v);
    if (col.badge === "raw") return `<span class="badge ${regBadgeClass(v)}">${esc(v)}</span>`;
    return esc(v);
  }
  function renderRegister(reg) {
    const ctx = regCtx();
    const q = (uiState.regFilter[reg.id] || "").toLowerCase();
    const sort = uiState.regSort && uiState.regSort[reg.id] || { key: "", dir: "" };
    const sel = (uiState.regSelected[reg.id] = uiState.regSelected[reg.id] || new Set());
    let rows = S.regRows(reg.id);
    if (q) rows = rows.filter(r => reg.columns.some(c => String(r[c.key] || "").toLowerCase().includes(q)));
    // sort while keeping pinned rows on top
    const sortKey = sort.key, sortDir = sort.dir === "desc" ? -1 : 1;
    rows = rows.slice();
    if (sortKey) {
      rows.sort((a, b) => {
        const col = reg.columns.find(c => c.key === sortKey);
        let va = col && col.type === "computed" ? col.compute(a) : a[sortKey];
        let vb = col && col.type === "computed" ? col.compute(b) : b[sortKey];
        if (va == null) va = "";
        if (vb == null) vb = "";
        const na = Number(va), nb = Number(vb);
        if (!isNaN(na) && !isNaN(nb) && va !== "" && vb !== "") return (na - nb) * sortDir;
        return String(va).localeCompare(String(vb)) * sortDir;
      });
    }
    rows.sort((a, b) => (b._pinned ? 1 : 0) - (a._pinned ? 1 : 0));
    // header
    const allChecked = rows.length > 0 && rows.every(r => sel.has(r._id));
    const sortIcon = (k) => sortKey === k ? (sort.dir === "desc" ? " ▼" : " ▲") : "";
    const head = `<th class="center"><input type="checkbox" data-reg-bulk="all" data-reg="${reg.id}" ${allChecked ? "checked" : ""} aria-label="Select all"></th>` +
      `<th aria-label="Pinned"></th><th>ID</th>` +
      reg.columns.map(c => `<th data-reg-sort="${reg.id}" data-key="${c.key}" tabindex="0" class="${c.type === "text" && c.w >= 200 ? "wrap" : ""} sortable">${esc(c.label)}${sortIcon(c.key)}</th>`).join("") + "<th></th>";
    const body = rows.map(r => {
      const trueIdx = S.regRows(reg.id).indexOf(r);
      const tds = reg.columns.map((c, ci) => {
        if (c.type === "computed") return `<td class="center" data-col="${c.key}">${cellComputed(c, r)}</td>`;
        return `<td${c.w >= 200 ? " class='wrap'" : ""} data-col="${c.key}">${cellEditor(reg, r, c, ctx)}</td>`;
      }).join("");
      const pinned = !!r._pinned;
      return `<tr data-row-id="${r._id}" class="${pinned ? "pinned-row" : ""}${sel.has(r._id) ? " row-selected" : ""}">
        <td class="center"><input type="checkbox" data-reg-bulk="row" data-reg="${reg.id}" data-id="${r._id}" ${sel.has(r._id) ? "checked" : ""}></td>
        <td class="pin-cell ${pinned ? "pin-on" : ""}" data-act="regpin" data-reg="${reg.id}" data-id="${r._id}" title="${pinned ? "Unpin" : "Pin to top"}">${pinned ? "📌" : "<span class='muted'>📍</span>"}</td>
        <td>${reg.idPrefix}-${String(trueIdx + 1).padStart(3, "0")}</td>
        ${tds}
        <td class="center"><button class="btn btn-sm btn-danger" data-act="regdel" data-reg="${reg.id}" data-id="${r._id}">Del</button></td>
      </tr>`;
    }).join("");
    const colg = `<colgroup><col style="width:34px"><col style="width:30px"><col style="width:80px">` +
      reg.columns.map(c => `<col style="width:${c.w || 120}px">`).join("") + `<col style="width:64px"></colgroup>`;
    const someSelected = sel.size > 0;
    return `<div class="toolbar">
        <button class="btn btn-primary" data-act="regadd" data-reg="${reg.id}">+ Add row</button>
        <span class="grow"></span>
        <span class="muted">${rows.length} row(s) · choose-only</span>
      </div>
      <div class="bulkbar" id="regBulkBar" data-reg="${reg.id}" ${someSelected ? "" : "hidden"}>
        <span><b>${sel.size}</b> selected</span>
        <span class="grow"></span>
        <button class="btn btn-sm btn-danger" data-act="regbulkdel" data-reg="${reg.id}">Delete selected</button>
        <button class="btn btn-sm" data-act="regbulkclear" data-reg="${reg.id}">Clear</button>
      </div>
      <div class="table-wrap"><table>${colg}<thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${reg.columns.length + 4}" class="muted center" style="padding:24px">No rows yet — click <b>+ Add row</b>.</td></tr>`}</tbody></table></div>`;
  }
  function afterRegister(reg) {
    const sel = uiState.regSelected[reg.id] = uiState.regSelected[reg.id] || new Set();
    const refreshBar = () => {
      const bar = $("#regBulkBar"); if (!bar) return;
      bar.hidden = sel.size === 0;
      const lbl = bar.querySelector("span"); if (lbl) lbl.innerHTML = `<b>${sel.size}</b> selected`;
    };
    // Cell change → patch only the affected row's computed cells (no full re-render).
    content.querySelectorAll(`[data-reg="${reg.id}"][data-row]`).forEach(el => {
      el.addEventListener("change", () => {
        const key = el.dataset.key, col = reg.columns.find(c => c.key === key);
        let val = el.value;
        if (col && col.type === "num") val = val === "" ? "" : Number(val);
        S.regUpdate(reg.id, el.dataset.row, { [key]: val });
        const tr = el.closest("tr");
        if (tr) {
          const row = S.regRows(reg.id).find(r => r._id === el.dataset.row);
          if (row) {
            // refresh every computed cell on this row
            reg.columns.forEach(c => {
              if (c.type !== "computed") return;
              const td = tr.querySelector(`td[data-col="${c.key}"]`);
              if (td) td.innerHTML = cellComputed(c, row);
            });
          }
        }
      });
    });
    // Bulk select
    content.querySelectorAll(`input[data-reg-bulk="row"][data-reg="${reg.id}"]`).forEach(cb => {
      cb.addEventListener("change", () => {
        if (cb.checked) sel.add(cb.dataset.id); else sel.delete(cb.dataset.id);
        const tr = cb.closest("tr"); if (tr) tr.classList.toggle("row-selected", cb.checked);
        refreshBar();
      });
    });
    const allCb = content.querySelector(`input[data-reg-bulk="all"][data-reg="${reg.id}"]`);
    if (allCb) allCb.addEventListener("change", () => {
      content.querySelectorAll(`input[data-reg-bulk="row"][data-reg="${reg.id}"]`).forEach(cb => {
        cb.checked = allCb.checked;
        if (allCb.checked) sel.add(cb.dataset.id); else sel.delete(cb.dataset.id);
        const tr = cb.closest("tr"); if (tr) tr.classList.toggle("row-selected", cb.checked);
      });
      refreshBar();
    });
    // Sort by clicking a header
    const sortHandler = (th) => {
      const key = th.dataset.key;
      uiState.regSort = uiState.regSort || {};
      const cur = uiState.regSort[reg.id] || { key: "", dir: "" };
      uiState.regSort[reg.id] = (cur.key === key)
        ? (cur.dir === "asc" ? { key, dir: "desc" } : { key: "", dir: "" })
        : { key, dir: "asc" };
      go(reg.id);
    };
    content.querySelectorAll(`th[data-reg-sort="${reg.id}"]`).forEach(th => {
      th.addEventListener("click", () => sortHandler(th));
      th.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sortHandler(th); } });
    });
  }
  C.REGISTERS.forEach(reg => { RENDER[reg.id] = () => renderRegister(reg); AFTER[reg.id] = () => afterRegister(reg); });

  // ---------- Earned Value (EVM) ----------
  RENDER.evm = function () {
    const e = S.evm();
    const kpi = (cls, l, v, sub) => `<div class="kpi ${cls}"><div class="label">${l}</div><div class="value">${v}</div>${sub ? `<div class="muted" style="font-size:11px">${sub}</div>` : ""}</div>`;
    const idx = (v) => v >= 1 ? "green" : v >= 0.9 ? "gold" : "red";
    const f = v => money(Math.round(v));
    return `<div class="grid kpis" style="margin-bottom:16px">
        ${kpi("navy", "BAC — Budget at completion", f(e.bac))}
        ${kpi("blue", "PV — Planned value", f(e.pv), Math.round(e.frac * 100) + "% of schedule elapsed")}
        ${kpi("teal", "EV — Earned value", f(e.ev))}
        ${kpi("purple", "AC — Actual cost", f(e.ac))}</div>
      <div class="grid kpis" style="margin-bottom:16px">
        ${kpi(idx(e.cpi), "CPI — Cost performance", e.cpi.toFixed(2), e.cpi >= 1 ? "On/under budget" : "Over budget")}
        ${kpi(idx(e.spi), "SPI — Schedule performance", e.spi.toFixed(2), e.spi >= 1 ? "On/ahead of schedule" : "Behind schedule")}
        ${kpi(e.cv >= 0 ? "green" : "red", "CV — Cost variance", f(e.cv))}
        ${kpi(e.sv >= 0 ? "green" : "red", "SV — Schedule variance", f(e.sv))}
        ${kpi("amber", "EAC — Est. at completion", f(e.eac))}
        ${kpi(e.vac >= 0 ? "green" : "red", "VAC — Variance at completion", f(e.vac))}</div>
      <div class="card"><h3>Planned vs Earned vs Actual</h3><div class="chart-box"><canvas id="chEvm"></canvas></div></div>
      <div class="card"><h3>How to read this</h3><p class="muted">
        EV is budgeted cost of work actually done (Σ est × %done). <b>CPI = EV/AC</b> (≥1 good) shows cost efficiency;
        <b>SPI = EV/PV</b> (≥1 good) shows schedule efficiency. EAC forecasts the final cost at the current efficiency.
        Figures use each case's estimated/actual cost, % done, and the project start/end dates from Settings.</p></div>`;
  };
  AFTER.evm = function () {
    const e = S.evm();
    CH.bar("chEvm", ["PV", "EV", "AC", "BAC"], [Math.round(e.pv), Math.round(e.ev), Math.round(e.ac), Math.round(e.bac)]);
  };

  // ---------- Gage R&R (MSA) ----------
  RENDER.gage = function () {
    const g = S.gage(), r = S.gageResult();
    const opt = (n, sel) => Array.from({ length: n }, (_, i) => i + 1).map(v => `<option ${v === sel ? "selected" : ""}>${v}</option>`).join("");
    let grid = `<table class="gage"><thead><tr><th>Operator / Trial</th>${Array.from({ length: g.parts }, (_, p) => `<th>Part ${p + 1}</th>`).join("")}</tr></thead><tbody>`;
    const opName = i => String.fromCharCode(65 + i);
    for (let o = 0; o < g.operators; o++) {
      for (let t = 0; t < g.trials; t++) {
        grid += `<tr><td>Op ${opName(o)} · trial ${t + 1}</td>` +
          Array.from({ length: g.parts }, (_, p) => {
            const v = g.data[`${o}_${p}_${t}`]; return `<td><select data-go="${o}" data-gp="${p}" data-gt="${t}" style="width:78px">${opts(C.GAGEVALS, v == null ? "" : v, "—")}</select></td>`;
          }).join("") + `</tr>`;
      }
    }
    grid += "</tbody></table>";
    const vClass = r.verdict === "Acceptable" ? "green" : r.verdict === "Marginal" ? "gold" : "red";
    const kpi = (cls, l, v) => `<div class="kpi ${cls}"><div class="label">${l}</div><div class="value">${v}</div></div>`;
    return `<div class="card"><div class="card-head"><h3>Study setup</h3>
        <label class="muted">Parts <select id="gParts" style="width:64px">${opt(10, g.parts)}</select></label>
        <label class="muted">Operators <select id="gOps" style="width:64px">${opt(3, g.operators)}</select></label>
        <label class="muted">Trials <select id="gTrials" style="width:64px">${opt(3, g.trials)}</select></label></div>
        <div class="table-wrap">${grid}</div></div>
      <div class="grid kpis" style="margin-bottom:16px">
        ${kpi("blue", "% Repeatability (EV)", r.pctEV.toFixed(1) + "%")}
        ${kpi("teal", "% Reproducibility (AV)", r.pctAV.toFixed(1) + "%")}
        ${kpi(vClass, "% Gage R&R", r.pctGRR.toFixed(1) + "%")}
        ${kpi("navy", "% Part variation (PV)", r.pctPV.toFixed(1) + "%")}
        ${kpi("gold", "ndc (distinct categories)", r.ndc)}</div>
      <div class="card"><div class="card-head"><h3>Verdict</h3><span class="badge ${vClass === "green" ? "b-ontrack" : vClass === "gold" ? "b-high" : "b-critical"}">${esc(r.verdict)}</span></div>
        <p class="muted">AIAG guide: %GRR &lt; 10% acceptable · 10–30% marginal (consider improving) · &gt; 30% unacceptable. ndc should be ≥ 5. Computed by the average &amp; range method.</p>
        <div class="chart-box sm"><canvas id="chGage"></canvas></div></div>`;
  };
  AFTER.gage = function () {
    content.querySelectorAll("[data-go]").forEach(inp => inp.addEventListener("change", () => {
      S.setGageCell(+inp.dataset.go, +inp.dataset.gp, +inp.dataset.gt, inp.value); go("gage");
    }));
    const cfg = (id, key) => { const el = $("#" + id); if (el) el.addEventListener("change", () => { S.setGageConfig({ [key]: +el.value }); go("gage"); }); };
    cfg("gParts", "parts"); cfg("gOps", "operators"); cfg("gTrials", "trials");
    const r = S.gageResult();
    CH.bar("chGage", ["%EV", "%AV", "%GRR", "%PV"], [r.pctEV, r.pctAV, r.pctGRR, r.pctPV].map(x => +x.toFixed(1)));
  };

  // ---------- Cash flow / S-curve ----------
  RENDER.cashflow = function () {
    const cf = S.cashflow();
    const CASHVALS = C.numSeq(0, 300000, 5000);
    let pc = 0, ac = 0; const rows = cf.map((m, i) => {
      pc += Number(m.planned) || 0; ac += (m.actual == null ? 0 : Number(m.actual));
      const hasA = m.actual != null;
      return `<tr><td>${esc(m.month)}</td>
        <td><select data-cf="${i}" data-f="planned">${opts(CASHVALS, m.planned == null ? "" : m.planned, "—")}</select></td>
        <td><select data-cf="${i}" data-f="actual">${opts(CASHVALS, m.actual == null ? "" : m.actual, "—")}</select></td>
        <td class="right">${money(pc)}</td><td class="right">${hasA ? money(ac) : "—"}</td></tr>`;
    }).join("");
    return `<div class="card"><h3>Cash-flow S-curve — cumulative planned vs actual</h3>
        <div class="chart-box"><canvas id="chScurve"></canvas></div></div>
      <div class="card"><h3>Monthly spend</h3>
        <div class="table-wrap"><table><thead><tr><th>Period</th><th>Planned</th><th>Actual</th><th>Cum. planned</th><th>Cum. actual</th></tr></thead>
        <tbody>${rows}</tbody></table></div></div>`;
  };
  AFTER.cashflow = function () {
    content.querySelectorAll("[data-cf]").forEach(inp => inp.addEventListener("change", () => {
      S.setCashflow(+inp.dataset.cf, inp.dataset.f, inp.value); go("cashflow");
    }));
    const cf = S.cashflow(); let pc = 0, ac = 0; const labels = [], plan = [], act = [];
    let lastActual = true;
    cf.forEach(m => {
      pc += Number(m.planned) || 0; labels.push(m.month); plan.push(pc);
      if (m.actual == null) lastActual = false;
      if (lastActual) { ac += Number(m.actual) || 0; act.push(ac); } else act.push(null);
    });
    CH.lines("chScurve", labels, [{ label: "Cumulative planned", data: plan }, { label: "Cumulative actual", data: act }], "");
  };

  // resources register gets a custom view (table + utilisation chart)
  (function () {
    const reg = C.REGISTERS.find(r => r.id === "resources");
    if (!reg) return;
    RENDER.resources = () => renderRegister(reg) + `<div class="card"><h3>Utilisation by person</h3><div class="chart-box sm"><canvas id="chRes"></canvas></div></div>`;
    AFTER.resources = () => {
      afterRegister(reg);
      const rows = S.regRows("resources").filter(r => r.person);
      CH.bar("chRes", rows.map(r => r.person), rows.map(r => r.capacity ? Math.round((Number(r.allocated) || 0) / Number(r.capacity) * 100) : 0), "Utilisation %");
    };
  })();

  // ---------- Risk Matrix ----------
  function kpiMini(l, v) { return `<div class="kpi blue"><div class="label">${esc(l)}</div><div class="value" style="font-size:18px">${esc(v)}</div></div>`; }
  RENDER.riskmatrix = function () {
    const m = C.riskMatrix(S.validCases());
    const sevLabels = ["9-10", "7-8", "5-6", "3-4", "1-2"], occLabels = ["1-2", "3-4", "5-6", "7-8", "9-10"];
    let rows = "";
    for (let r = 0; r < 5; r++) {
      const sevBand = 5 - r; let tds = "";
      for (let c = 0; c < 5; c++) {
        const occBand = c + 1, score = sevBand * occBand, cell = m[r][c];
        const cls = score >= 15 ? "rm-red" : score >= 8 ? "rm-amber" : "rm-green";
        tds += `<td class="rmcell ${cls}" title="${esc(cell.codes.join(', '))}">${cell.n || ""}</td>`;
      }
      rows += `<tr><th class="rmrow">Sev ${sevLabels[r]}</th>${tds}</tr>`;
    }
    return `<div class="card"><h3>Risk matrix — Severity × Occurrence (count of cases)</h3>
      <div class="table-wrap"><table class="riskmatrix"><thead><tr><th></th>${occLabels.map(o => `<th>Occ ${o}</th>`).join("")}</tr></thead>
      <tbody>${rows}</tbody></table></div>
      <p class="muted">Coloured by risk zone (Severity band × Occurrence band). Hover a cell to see the case IDs in it. Red = high · amber = medium · green = low.</p></div>`;
  };

  // ---------- Change Impact / Traceability ----------
  RENDER.impact = function () {
    const cases = S.validCases();
    if (!cases.length) return `<div class="empty">Add a case first to see its impact.</div>`;
    const sel = uiState.impactCase && cases.some(c => c.code === uiState.impactCase) ? uiState.impactCase : cases[0].code;
    const c = cases.find(x => x.code === sel);
    const hits = [];
    C.REGISTERS.forEach(reg => {
      if (!reg.columns.some(col => col.key === "case")) return;
      S.regRows(reg.id).forEach(row => { if (row.case === c.code) hits.push({ reg: reg.label, row }); });
    });
    const hitRows = hits.length ? hits.map(h => {
      const summary = h.reg + " values";
      const txt = h.reg === "HAZOP / Hazards" ? (h.row.deviation || h.row.node) : h.reg === "Non-Conformance" ? h.row.desc : h.reg === "Requirements Traceability" ? h.row.req : Object.values(h.row)[1];
      return `<tr><td>${esc(h.reg)}</td><td class="wrap">${esc(txt || "—")}</td><td>${esc(h.row.status || h.row.verify || "")}</td></tr>`;
    }).join("") : `<tr><td colspan="3" class="muted center">No register items linked yet. Use the "Linked case" dropdown in HAZOP, NCR or Requirements to connect them to ${esc(c.code)}.</td></tr>`;
    return `<div class="card"><div class="card-head"><h3>Change impact / traceability</h3>
        <select id="impactSel">${opts(cases.map(x => x.code), sel)}</select></div>
        <p><b>${esc(c.code)}</b> — ${esc(c.problem)}</p>
        <div class="grid kpis">${kpiMini("RPN", c.rpn ?? "—")}${kpiMini("Priority", c.priority || "—")}${kpiMini("Status", c.status || "—")}${kpiMini("Owner", c.owner || "—")}${kpiMini("Est. end", C.fmtDate(c.estEnd) || "—")}</div>
        <p class="muted" style="margin-top:10px">This one case automatically drives: a PM task · a scored risk · an FMEA line · a PDCA cycle · an action-log entry · a budget line · a Gantt bar.</p>
        <h3 style="margin-top:14px">Linked register items</h3>
        ${tableWrap("<th>Register</th><th class='wrap'>Item</th><th>Status</th>", hitRows)}
        <div class="readout" style="margin-top:12px"><b>AI recommendation:</b> ${esc(c.ai)}</div></div>`;
  };
  AFTER.impact = function () { const s = $("#impactSel"); if (s) s.addEventListener("change", () => { uiState.impactCase = s.value; go("impact"); }); };

  // ---------- Workflow Engine ----------
  RENDER.workflows = function () {
    var templates = S.listWorkflows();
    var instances = (S.get().workflowInstances || []).filter(function(inst) { return inst.status; });
    var inProgress = instances.filter(function(inst) { return inst.status === "in-progress"; });
    var completed = instances.filter(function(inst) { return inst.status === "completed"; });
    var rejected = instances.filter(function(inst) { return inst.status === "rejected"; });

    // Render template cards with stage pipeline
    var templateCards = templates.map(function(wf) {
      var pipeline = wf.stages.map(function(st, idx) {
        var circle = '<span class="wf-stage-circle" style="display:inline-block;width:18px;height:18px;border-radius:50%;background:#2e5496;color:#fff;font-size:10px;text-align:center;line-height:18px">' + (idx + 1) + '</span>';
        var label = '<span class="wf-stage-label" style="font-size:11px;margin:0 2px">' + esc(st.name) + '</span>';
        var arrow = idx < wf.stages.length - 1 ? '<span style="margin:0 4px;color:#999">→</span>' : '';
        return circle + label + arrow;
      }).join('');
      return '<div class="card wf-template-card" data-wfid="' + wf.id + '" style="margin-bottom:12px;padding:14px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<h4 style="margin:0">' + esc(wf.name) + '</h4>' +
          '<button class="btn btn-sm btn-delete-wf" data-wfid="' + wf.id + '" title="Delete workflow">✕</button>' +
        '</div>' +
        '<div class="wf-pipeline" style="margin-top:8px;display:flex;align-items:center;flex-wrap:wrap;gap:4px">' + pipeline + '</div>' +
        '<div style="margin-top:8px"><span class="badge" style="background:#eee;padding:2px 8px;border-radius:3px;font-size:11px">' + wf.stages.length + ' stages</span></div>' +
      '</div>';
    }).join('');

    // Render active instances grouped by status
    function renderInstanceGroup(title, list, color) {
      if (list.length === 0) return '<p class="muted" style="margin:4px 0">No ' + title.toLowerCase() + ' instances.</p>';
      var rows = list.map(function(inst) {
        var wf = templates.find(function(w) { return w.id === inst.workflowId; });
        var totalStages = (wf && wf.stages) ? wf.stages.length : 1;
        var pct = inst.status === "completed" ? 100 : Math.round((inst.currentStage / (totalStages - 1)) * 100);
        var stageName = (wf && wf.stages[inst.currentStage]) ? wf.stages[inst.currentStage].name : "Unknown";
        return '<tr><td>' + esc(inst.workflowName || "") + '</td><td>' + esc(inst.entityType || "") + '</td>' +
          '<td>' + esc(stageName) + '</td><td>' + pct + '%</td>' +
          '<td><span class="badge" style="background:' + color + ';color:#fff;padding:2px 8px;border-radius:3px;font-size:11px">' + inst.status + '</span></td></tr>';
      }).join('');
      return '<table class="tbl"><thead><tr><th>Workflow</th><th>Entity</th><th>Stage</th><th>Progress</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table>';
    }

    return '<div class="card" style="margin-bottom:16px">' +
      '<div class="card-head"><h3>Workflow Templates <span class="badge" style="background:#2e5496;color:#fff;padding:2px 8px;border-radius:3px;font-size:11px">' + templates.length + '</span></h3>' +
      '<button class="btn btn-primary btn-sm" id="btnCreateWorkflow">Create Workflow</button></div>' +
      '<div id="workflowTemplates">' + (templateCards || '<p class="muted">No workflow templates.</p>') + '</div>' +
    '</div>' +
    '<div class="card" style="margin-bottom:12px">' +
      '<h3>Active Instances</h3>' +
      '<h4 style="color:#1565c0">In Progress (' + inProgress.length + ')</h4>' +
      renderInstanceGroup("In Progress", inProgress, "#1565c0") +
      '<h4 style="color:#2e7d32;margin-top:12px">Completed (' + completed.length + ')</h4>' +
      renderInstanceGroup("Completed", completed, "#2e7d32") +
      '<h4 style="color:#c62828;margin-top:12px">Rejected (' + rejected.length + ')</h4>' +
      renderInstanceGroup("Rejected", rejected, "#c62828") +
    '</div>' +
    '<div id="wfFormModal" class="modal-overlay" style="display:none">' +
      '<div class="modal" style="max-width:540px">' +
        '<h3>Create Workflow</h3>' +
        '<div style="display:flex;flex-direction:column;gap:10px">' +
          '<input type="text" id="wfName" placeholder="Workflow name" style="padding:6px;border:1px solid #ccc;border-radius:4px" />' +
          '<div id="wfStagesContainer">' +
            '<div class="wf-stage-row" style="display:flex;gap:6px;margin-bottom:6px">' +
              '<input type="text" class="wf-stage-input" placeholder="Stage 1 name" style="flex:1;padding:6px;border:1px solid #ccc;border-radius:4px" />' +
              '<input type="text" class="wf-stage-approver" placeholder="Approver" style="flex:1;padding:6px;border:1px solid #ccc;border-radius:4px" />' +
            '</div>' +
          '</div>' +
          '<button class="btn btn-sm" id="wfAddStageBtn">+ Add Stage</button>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end">' +
          '<button class="btn" id="wfFormCancel">Cancel</button>' +
          '<button class="btn btn-primary" id="wfFormSave">Save</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  };

  AFTER.workflows = function () {
    var createBtn = $("#btnCreateWorkflow");
    if (createBtn) {
      createBtn.addEventListener("click", function() {
        var modal = $("#wfFormModal");
        if (modal) modal.style.display = "flex";
      });
    }
    var cancelBtn = $("#wfFormCancel");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", function() {
        var modal = $("#wfFormModal");
        if (modal) modal.style.display = "none";
      });
    }
    var addStageBtn = $("#wfAddStageBtn");
    if (addStageBtn) {
      addStageBtn.addEventListener("click", function() {
        var container = $("#wfStagesContainer");
        if (!container) return;
        var count = container.querySelectorAll(".wf-stage-row").length + 1;
        var row = doc.createElement("div");
        row.className = "wf-stage-row";
        row.style.cssText = "display:flex;gap:6px;margin-bottom:6px";
        row.innerHTML = '<input type="text" class="wf-stage-input" placeholder="Stage ' + count + ' name" style="flex:1;padding:6px;border:1px solid #ccc;border-radius:4px" />' +
          '<input type="text" class="wf-stage-approver" placeholder="Approver" style="flex:1;padding:6px;border:1px solid #ccc;border-radius:4px" />';
        container.appendChild(row);
      });
    }
    var saveBtn = $("#wfFormSave");
    if (saveBtn) {
      saveBtn.addEventListener("click", function() {
        var name = ($("#wfName") || {}).value || "";
        if (!name) return;
        var stageInputs = document.querySelectorAll(".wf-stage-input");
        var approverInputs = document.querySelectorAll(".wf-stage-approver");
        var stages = [];
        for (var i = 0; i < stageInputs.length; i++) {
          var sn = (stageInputs[i].value || "").trim();
          var ap = approverInputs[i] ? (approverInputs[i].value || "").trim() : "";
          if (sn) stages.push({ name: sn, approver: ap, requiredDocuments: [], autoAdvance: false });
        }
        if (stages.length > 0) {
          S.addWorkflow({ name: name, stages: stages });
          go("workflows");
        }
      });
    }
    // Delete workflow template buttons
    var deleteBtns = document.querySelectorAll(".btn-delete-wf");
    deleteBtns.forEach(function(btn) {
      btn.addEventListener("click", function(e) {
        e.stopPropagation();
        var wfId = btn.getAttribute("data-wfid");
        if (wfId) { S.deleteWorkflow(wfId); go("workflows"); }
      });
    });
  };

  // ---------- Document Management ----------
  RENDER.documents = function () {
    const docs = S.listDocuments({});
    const categories = S.DOC_CATEGORIES;
    const phases = (window.QIBrain && window.QIBrain.fibreProfile && window.QIBrain.fibreProfile.phases)
      ? window.QIBrain.fibreProfile.phases.map(function(p) { return p.name || p; })
      : ["Planning", "Survey", "Permitting", "Procurement", "Installation", "Testing", "Commissioning", "Operations"];
    const catBadge = function(cat) {
      const colors = { "survey-reports": "#1e88e5", "otdr-traces": "#8e24aa", "permits-licenses": "#f57c00",
        "as-built-charts": "#00897b", "correspondence": "#546e7a", "payment-certificates": "#43a047",
        "method-statements": "#5e35b1", "test-certificates": "#d81b60", "environmental": "#2e7d32",
        "hse": "#e53935", "contracts": "#3949ab", "design-drawings": "#00acc1",
        "meeting-minutes": "#6d4c41", "progress-reports": "#fdd835" };
      var c = colors[cat] || "#666";
      return '<span class="badge" style="background:' + c + ';color:#fff;padding:2px 8px;border-radius:3px;font-size:11px">' + esc(cat) + '</span>';
    };
    const rows = docs.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }).map(function(d) {
      return '<tr data-docid="' + d.id + '">' +
        '<td class="wrap">' + esc(d.title) + '</td>' +
        '<td>' + catBadge(d.category) + '</td>' +
        '<td>' + esc(d.phase) + '</td>' +
        '<td>' + esc(d.packageRef) + '</td>' +
        '<td>' + esc(d.fileType) + '</td>' +
        '<td>' + esc(d.uploadedBy) + '</td>' +
        '<td>' + (d.createdAt ? d.createdAt.slice(0, 10) : "") + '</td>' +
        '</tr>';
    }).join("");
    const catOpts = categories.map(function(c) { return '<option value="' + c + '">' + c + '</option>'; }).join("");
    const phaseOpts = phases.map(function(p) { return '<option value="' + esc(p) + '">' + esc(p) + '</option>'; }).join("");
    return '<div class="card">' +
      '<div class="card-head"><h3>Document Management <span class="badge" style="background:#2e5496;color:#fff;padding:2px 8px;border-radius:3px;font-size:11px">' + docs.length + '</span></h3>' +
      '<button class="btn btn-primary btn-sm" id="btnAddDocument">+ Add Document</button></div>' +
      '<div class="doc-filters" style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">' +
        '<select id="docFilterCat" style="max-width:180px"><option value="">All Categories</option>' + catOpts + '</select>' +
        '<select id="docFilterPhase" style="max-width:160px"><option value="">All Phases</option>' + phaseOpts + '</select>' +
        '<select id="docFilterStatus" style="max-width:140px"><option value="">All Status</option><option value="active">Active</option><option value="archived">Archived</option></select>' +
        '<select id="docSortBy" style="max-width:140px"><option value="date">Sort: Newest</option><option value="category">Sort: Category</option></select>' +
      '</div>' +
      '<div class="tbl-wrap"><table class="tbl" id="documentsTable"><thead><tr>' +
        '<th>Title</th><th>Category</th><th>Phase</th><th>Package</th><th>Type</th><th>Uploaded By</th><th>Date</th>' +
      '</tr></thead><tbody>' + (rows || '<tr><td colspan="7" style="text-align:center;padding:24px">No documents yet. Click "Add Document" to begin tracking project documentation.</td></tr>') + '</tbody></table></div>' +
      '</div>' +
      '<div id="docFormModal" class="modal-overlay" style="display:none">' +
        '<div class="modal" style="max-width:500px">' +
          '<h3>Add Document</h3>' +
          '<div style="display:flex;flex-direction:column;gap:10px">' +
            '<input type="text" id="docTitle" placeholder="Document title" style="padding:6px;border:1px solid #ccc;border-radius:4px" />' +
            '<select id="docCategory"><option value="">Select Category</option>' + catOpts + '</select>' +
            '<select id="docPhase"><option value="">Select Phase</option>' + phaseOpts + '</select>' +
            '<input type="text" id="docPackageRef" placeholder="Package reference" style="padding:6px;border:1px solid #ccc;border-radius:4px" />' +
            '<input type="text" id="docDescription" placeholder="Description" style="padding:6px;border:1px solid #ccc;border-radius:4px" />' +
            '<select id="docFileType"><option value="">File Type</option><option value="PDF">PDF</option><option value="DWG">DWG</option><option value="XLSX">XLSX</option><option value="DOCX">DOCX</option><option value="SOR">SOR</option><option value="KML">KML</option><option value="CSV">CSV</option><option value="JPG">JPG</option><option value="PNG">PNG</option></select>' +
            '<input type="text" id="docUploadedBy" placeholder="Uploaded by" style="padding:6px;border:1px solid #ccc;border-radius:4px" />' +
          '</div>' +
          '<div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end">' +
            '<button class="btn" id="docFormCancel">Cancel</button>' +
            '<button class="btn btn-primary" id="docFormSave">Save</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  };

  AFTER.documents = function () {
    var addBtn = $("#btnAddDocument");
    if (addBtn) {
      addBtn.addEventListener("click", function() {
        var modal = $("#docFormModal");
        if (modal) modal.style.display = "flex";
      });
    }
    var cancelBtn = $("#docFormCancel");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", function() {
        var modal = $("#docFormModal");
        if (modal) modal.style.display = "none";
      });
    }
    var saveBtn = $("#docFormSave");
    if (saveBtn) {
      saveBtn.addEventListener("click", function() {
        var title = ($("#docTitle") || {}).value || "";
        var category = ($("#docCategory") || {}).value || "";
        var phase = ($("#docPhase") || {}).value || "";
        var packageRef = ($("#docPackageRef") || {}).value || "";
        var description = ($("#docDescription") || {}).value || "";
        var fileType = ($("#docFileType") || {}).value || "";
        var uploadedBy = ($("#docUploadedBy") || {}).value || "";
        if (title) {
          S.addDocument({ title: title, category: category, phase: phase, packageRef: packageRef, description: description, fileType: fileType, uploadedBy: uploadedBy, tags: [] });
          go("documents");
        }
      });
    }
    // Filter handlers
    var filterCat = $("#docFilterCat");
    var filterPhase = $("#docFilterPhase");
    var filterStatus = $("#docFilterStatus");
    var sortBy = $("#docSortBy");
    function applyFilters() { go("documents"); }
    if (filterCat) filterCat.addEventListener("change", applyFilters);
    if (filterPhase) filterPhase.addEventListener("change", applyFilters);
    if (filterStatus) filterStatus.addEventListener("change", applyFilters);
    if (sortBy) sortBy.addEventListener("change", applyFilters);
  };

  // ---------- Report Pack (printable) ----------
  RENDER.report = function () {
    const p = S.get().project, k = S.kpis(), e = S.evm(), b = S.brand();
    const top = S.topRisks(8).map((c, i) => `<tr><td>${i + 1}</td><td>${esc(c.code)}</td><td class="wrap">${esc(c.problem)}</td><td>${c.rpn ?? ""}</td><td>${esc(c.owner || "")}</td><td>${esc(c.status)}</td></tr>`).join("");
    const ms = S.regRows("milestones").map(r => `<tr><td class="wrap">${esc(r.milestone || "")}</td><td>${C.fmtDate(r.baseline) || "-"}</td><td>${C.fmtDate(r.forecast) || "-"}</td><td>${C.fmtDate(r.actual) || "-"}</td><td>${esc(r.status || "")}</td></tr>`).join("") || `<tr><td colspan="5" class="muted center">none</td></tr>`;
    const ncrOpen = S.regRows("ncr").filter(r => r.status !== "CLOSED").map(r => `<tr><td class="wrap">${esc(r.desc || "")}</td><td>${esc(r.severity || "")}</td><td>${esc(r.disposition || "")}</td><td>${esc(r.status || "")}</td></tr>`).join("") || `<tr><td colspan="4" class="muted center">none open</td></tr>`;
    const hzCrit = S.regRows("hazop").filter(r => (Number(r.sev) || 0) * (Number(r.lik) || 0) >= 15).map(r => `<tr><td class="wrap">${esc(r.node || "")}</td><td class="wrap">${esc(r.deviation || "")}</td><td>${(Number(r.sev) || 0) * (Number(r.lik) || 0)}</td><td class="wrap">${esc(r.action || "")}</td></tr>`).join("") || `<tr><td colspan="4" class="muted center">none high</td></tr>`;
    const punchOpen = S.regRows("punch").filter(r => r.status !== "CLOSED").length;
    const card = (l, v) => `<div class="kpi navy"><div class="label">${l}</div><div class="value">${v}</div></div>`;
    return `<div class="toolbar no-print"><button class="btn btn-primary" onclick="window.print()">Print / Save as PDF</button>
        <span class="muted">A one-click consolidated pack: status, KPIs, EVM, top risks, milestones, NCRs, HAZOP criticals.</span></div>
      <div class="report">
        <h2 style="margin:0">${esc(b.company || "")} ${esc(b.company ? "—" : "")} ${esc(p.name)} — Project Report</h2>
        <p class="muted">Status: ${esc(p.status)} · Manager: ${esc(p.manager || "—")} · ${C.fmtDate(p.start)} → ${C.fmtDate(p.end)} · Generated ${C.fmtDate(new Date().toISOString().slice(0, 10))}</p>
        <div class="grid kpis">${card("Cases", k.total)}${card("Critical", k.crit)}${card("Open", k.open)}${card("Avg % done", pct(k.avgDone))}${card("Blocked", k.blocked)}${card("Punch open", punchOpen)}</div>
        <h3>Earned value</h3>
        <div class="grid kpis">${card("BAC", money(Math.round(e.bac)))}${card("EV", money(Math.round(e.ev)))}${card("AC", money(Math.round(e.ac)))}${card("CPI", e.cpi.toFixed(2))}${card("SPI", e.spi.toFixed(2))}${card("EAC", money(Math.round(e.eac)))}</div>
        <h3>Top risks</h3>${tableWrap("<th>#</th><th>Case</th><th class='wrap'>Problem</th><th>RPN</th><th>Owner</th><th>Status</th>", top)}
        <h3>Milestones</h3>${tableWrap("<th class='wrap'>Milestone</th><th>Baseline</th><th>Forecast</th><th>Actual</th><th>Status</th>", ms)}
        <h3>Open non-conformances</h3>${tableWrap("<th class='wrap'>Description</th><th>Severity</th><th>Disposition</th><th>Status</th>", ncrOpen)}
        <h3>HAZOP — high-risk items (S×L ≥ 15)</h3>${tableWrap("<th class='wrap'>Node</th><th class='wrap'>Deviation</th><th>Risk</th><th class='wrap'>Action</th>", hzCrit)}
      </div>`;
  };

  // ---------- X-bar & R control chart ----------
  RENDER.xbarr = function () {
    const g = S.xbar(), r = S.xbarResult();
    const optN = (n, sel) => Array.from({ length: n }, (_, i) => i + 1).map(v => `<option ${v === sel ? "selected" : ""}>${v}</option>`).join("");
    let grid = `<table class="gage"><thead><tr><th>Subgroup</th>${Array.from({ length: g.size }, (_, j) => `<th>x${j + 1}</th>`).join("")}<th>Mean</th><th>Range</th></tr></thead><tbody>`;
    for (let i = 0; i < g.subgroups; i++) {
      grid += `<tr><td>SG ${i + 1}</td>` + Array.from({ length: g.size }, (_, j) => {
        const v = g.data[`${i}_${j}`]; return `<td><select data-xb="${i}" data-xj="${j}" style="width:74px">${opts(C.numSeq(0, 20, 0.1), v == null ? "" : v, "—")}</select></td>`;
      }).join("") + `<td class="center">${r.means[i] == null ? "" : r.means[i].toFixed(2)}</td><td class="center">${r.ranges[i] == null ? "" : r.ranges[i].toFixed(2)}</td></tr>`;
    }
    grid += "</tbody></table>";
    return `<div class="card"><div class="card-head"><h3>Subgroup data</h3>
        <label class="muted">Subgroups <select id="xbK" style="width:64px">${optN(12, g.subgroups)}</select></label>
        <label class="muted">Size <select id="xbN" style="width:64px">${optN(6, g.size)}</select></label></div>
        <div class="table-wrap">${grid}</div>
        <p class="muted">X̄̄ = ${r.xbb.toFixed(2)} · R̄ = ${r.rbar.toFixed(2)} · X̄ limits ${r.xLcl.toFixed(2)}–${r.xUcl.toFixed(2)} · R UCL ${r.rUcl.toFixed(2)} (constants A2/D4 by subgroup size).</p></div>
      <div class="row2"><div class="card"><h3>X̄ chart (subgroup means)</h3><div class="chart-box"><canvas id="chXbar"></canvas></div></div>
        <div class="card"><h3>R chart (subgroup ranges)</h3><div class="chart-box"><canvas id="chR"></canvas></div></div></div>`;
  };
  AFTER.xbarr = function () {
    content.querySelectorAll("[data-xb]").forEach(s => s.addEventListener("change", () => { S.setXbarCell(+s.dataset.xb, +s.dataset.xj, s.value); go("xbarr"); }));
    const cfg = (id, key) => { const el = $("#" + id); if (el) el.addEventListener("change", () => { S.setXbarConfig({ [key]: +el.value }); go("xbarr"); }); };
    cfg("xbK", "subgroups"); cfg("xbN", "size");
    const r = S.xbarResult(); const labels = r.means.map((_, i) => "SG " + (i + 1));
    CH.control("chXbar", labels, r.means.map(v => v == null ? null : +v.toFixed(3)), +r.xbb.toFixed(3), +r.xUcl.toFixed(3), +r.xLcl.toFixed(3));
    CH.control("chR", labels, r.ranges.map(v => v == null ? null : +v.toFixed(3)), +r.rbar.toFixed(3), +r.rUcl.toFixed(3), +r.rLcl.toFixed(3));
  };

  // ---------- HAZOP Bow-tie ----------
  RENDER.bowtie = function () {
    const rows = S.regRows("hazop").filter(r => r.node);
    const nodes = [...new Set(rows.map(r => r.node))];
    if (!nodes.length) return `<div class="empty">Add HAZOP entries (with a Node) to build a bow-tie.</div>`;
    const sel = uiState.bowtieNode && nodes.includes(uiState.bowtieNode) ? uiState.bowtieNode : nodes[0];
    const set = rows.filter(r => r.node === sel);
    const uniq = (arr) => [...new Set(arr.filter(Boolean))];
    const threats = uniq(set.map(r => r.cause));
    const consequences = uniq(set.map(r => r.consequence));
    const preventive = uniq(set.map(r => r.safeguard));
    const mitigative = uniq(set.map(r => r.action));
    const chips = (arr, cls) => arr.length ? arr.map(x => `<div class="bt-chip ${cls}">${esc(x)}</div>`).join("") : `<div class="bt-chip muted">—</div>`;
    const topEvent = sel + (set[0] && set[0].deviation ? " · " + set[0].deviation : "");
    return `<div class="card"><div class="card-head"><h3>Bow-tie — barrier analysis</h3>
        <select id="btSel">${opts(nodes, sel)}</select></div>
      <div class="bowtie">
        <div class="bt-col"><div class="bt-h">Threats / causes</div>${chips(threats, "bt-threat")}</div>
        <div class="bt-col"><div class="bt-h">Preventive barriers</div>${chips(preventive, "bt-bar")}</div>
        <div class="bt-col bt-center"><div class="bt-top">TOP EVENT<br><b>${esc(topEvent)}</b></div></div>
        <div class="bt-col"><div class="bt-h">Mitigative barriers</div>${chips(mitigative, "bt-bar")}</div>
        <div class="bt-col"><div class="bt-h">Consequences</div>${chips(consequences, "bt-cons")}</div>
      </div>
      <p class="muted">Left-to-right: causes are stopped by preventive barriers; if the top event still occurs, mitigative barriers limit the consequences. Built from the HAZOP entries for this node.</p></div>`;
  };
  AFTER.bowtie = function () { const s = $("#btSel"); if (s) s.addEventListener("change", () => { uiState.bowtieNode = s.value; go("bowtie"); }); };

  // ---------- KPI Scorecard ----------
  RENDER.scorecard = function () {
    const sc = S.scorecard();
    const dot = r => `<span class="rag rag-${r}"></span>`;
    const rows = sc.map(s => `<tr><td>${esc(s.area)}</td><td>${esc(s.metric)}</td><td class="center"><b>${esc(s.value)}</b></td><td class="center">${dot(s.rag)}</td></tr>`).join("");
    const g = sc.filter(s => s.rag === "g").length, a = sc.filter(s => s.rag === "a").length, rr = sc.filter(s => s.rag === "r").length;
    const kpi = (cls, l, v) => `<div class="kpi ${cls}"><div class="label">${l}</div><div class="value">${v}</div></div>`;
    return `<div class="grid kpis" style="margin-bottom:16px">
        ${kpi("green", "On track (green)", g)}${kpi("gold", "Watch (amber)", a)}${kpi("red", "Action needed (red)", rr)}</div>
      <div class="card"><h3>Management KPI scorecard (RAG)</h3>
        ${tableWrap("<th>Area</th><th>Metric</th><th>Value</th><th>RAG</th>", rows)}
        <p class="muted">Auto-calculated live from delivery, cost (EVM), quality (Sigma/NCR), risk and safety data. See the OKR register for objective tracking.</p></div>`;
  };

  // ---------- Process Capability (Cp/Cpk) ----------
  RENDER.capability = function () {
    const sp = S.spec();
    const cap = S.capabilityResult();
    const usl = sp.usl == null ? "" : sp.usl, lsl = sp.lsl == null ? "" : sp.lsl, tgt = sp.target == null ? "" : sp.target;
    const range = C.numSeq(0, 20, 0.1);
    const kpi = (cls, l, v) => `<div class="kpi ${cls}"><div class="label">${l}</div><div class="value">${v}</div></div>`;
    if (!cap) {
      return `<div class="card"><h3>Spec limits</h3>
        <div class="form-grid">
          <div class="field"><label>USL — upper spec limit</label><select id="cap_usl">${opts(range, usl, "—")}</select></div>
          <div class="field"><label>LSL — lower spec limit</label><select id="cap_lsl">${opts(range, lsl, "—")}</select></div>
          <div class="field"><label>Target (optional)</label><select id="cap_target">${opts(range, tgt, "—")}</select></div>
        </div>
        <p class="muted">Pick at least USL or LSL, and add data on the <b>X̄-R Control Chart</b> view. Capability is computed from those subgroups.</p></div>`;
    }
    const cls = (v) => v == null ? "slate" : v >= 1.33 ? "green" : v >= 1.0 ? "gold" : "red";
    const fmt = (v) => v == null ? "—" : v.toFixed(2);
    return `<div class="card"><div class="card-head"><h3>Spec limits</h3>
        <span class="muted">Mean ${cap.mean.toFixed(2)} · n=${cap.n} · σ̂ ST=${cap.st.sigma.toFixed(3)} · σ̂ LT=${cap.lt.sigma.toFixed(3)}</span></div>
        <div class="form-grid">
          <div class="field"><label>USL</label><select id="cap_usl">${opts(range, usl, "—")}</select></div>
          <div class="field"><label>LSL</label><select id="cap_lsl">${opts(range, lsl, "—")}</select></div>
          <div class="field"><label>Target</label><select id="cap_target">${opts(range, tgt, "—")}</select></div>
        </div></div>

      <div class="grid kpis" style="margin-bottom:16px">
        ${kpi(cls(cap.st.cp), "Cp (short-term)", fmt(cap.st.cp))}
        ${kpi(cls(cap.st.cpk), "Cpk (short-term)", fmt(cap.st.cpk))}
        ${kpi(cls(cap.lt.cp), "Pp (long-term)", fmt(cap.lt.cp))}
        ${kpi(cls(cap.lt.cpk), "Ppk (long-term)", fmt(cap.lt.cpk))}
        ${kpi("amber", "PPM out of spec", cap.ppmOut.toLocaleString())}
        ${kpi(cls(cap.st.cpk), "Verdict", cap.verdict)}
      </div>

      <div class="card"><h3>Histogram with spec limits</h3><div class="chart-box"><canvas id="chCap"></canvas></div>
        <p class="muted">Cp uses within-subgroup variation (R̄/d2). Cpk also accounts for off-centre process. Pp/Ppk use the overall standard deviation. Targets: Cpk ≥ 1.33 capable; ≥ 1.67 excellent.</p></div>`;
  };
  AFTER.capability = function () {
    const bind = (id, key) => { const el = $("#" + id); if (el) el.addEventListener("change", () => { S.setSpec({ [key]: el.value === "" ? "" : Number(el.value) }); go("capability"); }); };
    bind("cap_usl", "usl"); bind("cap_lsl", "lsl"); bind("cap_target", "target");
    const cap = S.capabilityResult();
    if (!cap) return;
    // build a histogram
    const all = [];
    const g = S.xbar();
    for (let i = 0; i < g.subgroups; i++) for (let j = 0; j < g.size; j++) {
      const v = g.data[`${i}_${j}`]; if (v !== "" && v != null && !isNaN(v)) all.push(Number(v));
    }
    if (!all.length) return;
    const min = Math.min(...all), max = Math.max(...all);
    const buckets = 12, w = (max - min) / buckets || 1;
    const bins = Array.from({ length: buckets }, () => 0);
    const labels = Array.from({ length: buckets }, (_, i) => (min + i * w).toFixed(2));
    all.forEach(v => { const b = Math.min(Math.floor((v - min) / w), buckets - 1); bins[b]++; });
    if (typeof Chart !== "undefined") {
      const el = document.getElementById("chCap");
      const ctx = el && el.getContext("2d");
      if (!ctx) return;
      const sets = [{ type: "bar", label: "Frequency", data: bins, backgroundColor: "#2e5496", borderRadius: 2 }];
      const annot = (val, color, label) => {
        if (val == null || val === "") return null;
        return { type: "line", label: label, data: [{ x: +val, y: 0 }, { x: +val, y: Math.max(...bins) }], borderColor: color, borderDash: [6, 4], borderWidth: 2, pointRadius: 0 };
      };
      // Use simple vertical lines via separate datasets on category axis index nearest the value
      const idxFor = v => { if (v === "" || v == null) return null; const i = Math.round((v - min) / w); return Math.min(Math.max(i, 0), buckets - 1); };
      const uIdx = idxFor(cap.usl), lIdx = idxFor(cap.lsl), tIdx = idxFor(cap.target);
      const ymax = Math.max(...bins, 1);
      const lineSet = (idx, color, label) => idx == null ? null : { type: "line", label, data: bins.map((_, i) => i === idx ? ymax : null), borderColor: color, borderDash: [6, 4], pointRadius: 0, spanGaps: false };
      [lineSet(lIdx, "#c00000", "LSL"), lineSet(uIdx, "#c00000", "USL"), lineSet(tIdx, "#548235", "Target")].forEach(s => { if (s) sets.push(s); });
      if (window.QICharts && QICharts.destroyAll) QICharts.destroyAll();
      new Chart(ctx, { data: { labels, datasets: sets }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "top" } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
    }
  };

  // ---------- NCR Pareto ----------
  RENDER.ncrpareto = function () {
    const total = S.regRows("ncr").length;
    if (!total) return `<div class="empty">No non-conformances yet. Add some on the <b>Non-Conformance</b> register and they will appear here as a Pareto.</div>`;
    return `<div class="grid kpis" style="margin-bottom:16px">
        <div class="kpi navy"><div class="label">Total NCRs</div><div class="value">${total}</div></div>
        <div class="kpi red"><div class="label">Open</div><div class="value">${S.regRows("ncr").filter(r => r.status !== "CLOSED").length}</div></div>
        <div class="kpi amber"><div class="label">Critical</div><div class="value">${S.regRows("ncr").filter(r => r.severity === "Critical").length}</div></div></div>
      <div class="card"><h3>Pareto by severity</h3><div class="chart-box"><canvas id="chNcrSev"></canvas></div></div>
      <div class="card"><h3>Pareto by disposition</h3><div class="chart-box"><canvas id="chNcrDisp"></canvas></div></div>
      <div class="card"><h3>Pareto by discipline</h3><div class="chart-box"><canvas id="chNcrDisc"></canvas></div></div>`;
  };
  AFTER.ncrpareto = function () {
    const draw = (id, p) => { if (!p.length) return; CH.pareto(id, p.map(x => x.label), p.map(x => x.value), p.map(x => Math.round(x.cum))); };
    draw("chNcrSev", S.ncrParetoBy("severity"));
    draw("chNcrDisp", S.ncrParetoBy("disposition"));
    draw("chNcrDisc", S.ncrParetoBy("discipline"));
  };

  // ---------- Prioritisation (RICE / WSJF) ----------
  RENDER.prioritise = function () {
    const method = uiState.prioMethod || "rice";
    const list = S.prioritised(method);
    const cell = (id, key, optsList) => `<select data-prio="${id}" data-f="${key}">${opts(optsList, list.find(c => c.id === id)[key] === "" ? "" : list.find(c => c.id === id)[key], "—")}</select>`;
    let head, rows;
    if (method === "rice") {
      head = `<th>#</th><th>Case</th><th class="wrap">Problem</th><th>Reach</th><th>Impact</th><th>Confidence%</th><th>Effort</th><th>RICE</th>`;
      rows = list.map((c, i) => `<tr>
        <td class="center">${i + 1}</td>
        <td>${esc(c.code)}</td>
        <td class="wrap">${esc(c.problem)}</td>
        <td>${cell(c.id, "reach", C.NUMOPTS["rice.reach"])}</td>
        <td>${cell(c.id, "impact", C.NUMOPTS["rice.impact"])}</td>
        <td>${cell(c.id, "confidence", C.NUMOPTS["rice.confidence"])}</td>
        <td>${cell(c.id, "effort", C.NUMOPTS["rice.effort"])}</td>
        <td class="center"><b>${c._score == null ? "—" : c._score}</b></td></tr>`).join("");
    } else {
      const s = C.NUMOPTS["wsjf.score"];
      head = `<th>#</th><th>Case</th><th class="wrap">Problem</th><th>User-business value</th><th>Time criticality</th><th>Risk reduction</th><th>Job size</th><th>WSJF</th>`;
      rows = list.map((c, i) => `<tr>
        <td class="center">${i + 1}</td>
        <td>${esc(c.code)}</td>
        <td class="wrap">${esc(c.problem)}</td>
        <td>${cell(c.id, "userValue", s)}</td>
        <td>${cell(c.id, "timeCrit", s)}</td>
        <td>${cell(c.id, "riskRed", s)}</td>
        <td>${cell(c.id, "jobSize", s)}</td>
        <td class="center"><b>${c._score == null ? "—" : c._score}</b></td></tr>`).join("");
    }
    return `<div class="card"><div class="card-head"><h3>Prioritisation method</h3>
        <select id="prioMethod" style="max-width:160px"><option value="rice" ${method==="rice"?"selected":""}>RICE</option><option value="wsjf" ${method==="wsjf"?"selected":""}>WSJF</option></select></div>
        <p class="muted">RICE = Reach × Impact × (Confidence/100) ÷ Effort. WSJF = (Value + Time-criticality + Risk-reduction) ÷ Job size. Pick a method and adjust the dropdowns — the table re-ranks live.</p></div>
      <div class="card"><h3>Top 10 by ${method.toUpperCase()}</h3><div class="chart-box sm"><canvas id="chPrio"></canvas></div></div>
      <div class="card"><h3>All cases ranked</h3>
        <div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>
        <p class="muted">All input cells are dropdowns — click-only.</p></div>`;
  };
  AFTER.prioritise = function () {
    const sel = $("#prioMethod"); if (sel) sel.addEventListener("change", () => { uiState.prioMethod = sel.value; go("prioritise"); });
    content.querySelectorAll("select[data-prio]").forEach(el => el.addEventListener("change", () => {
      const v = el.value === "" ? "" : Number(el.value);
      S.updateCase(el.dataset.prio, { [el.dataset.f]: v });
      go("prioritise");
    }));
    const list = S.prioritised(uiState.prioMethod || "rice").slice(0, 10);
    CH.bar("chPrio", list.map(c => c.code), list.map(c => c._score || 0), (uiState.prioMethod || "rice").toUpperCase() + " score");
  };

  // ---------- case form ----------
  function blankCase() {
    const t = new Date().toISOString().slice(0, 10);
    return { problem: "", category: "", priority: "", sev: "", occ: "", det: "", rootCause: "", leanMethod: "", owner: "", target: "", startDate: t, status: "OPEN", percent: 0, dateLogged: t, costCat: "", estCost: "", actCost: "", whys: ["", "", "", "", ""] };
  }
  function openCaseForm(id) {
    const editing = !!id;
    const c = editing ? Object.assign(blankCase(), S.get().cases.find(x => x.id === id)) : blankCase();
    const names = S.get().roster.map(r => r.name).filter(Boolean);
    const pctSel = [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1];
    const modal = $("#modal");
    modal.innerHTML = `
      <h2>${editing ? "Edit case" : "New case"}</h2>
      <div class="sub">Pick from the dropdowns. Grey box shows what auto-calculates.</div>
      <form id="caseForm">
        <div class="form-grid">
          <div class="field full"><label>Problem / challenge statement *</label>
            <select id="f_problem" required>${opts(C.SUGGEST.problem, c.problem, "— choose —")}</select></div>
          <div class="field"><label>Category</label><select id="f_category">${opts(C.LISTS.category, c.category, "—")}</select></div>
          <div class="field"><label>Priority</label><select id="f_priority">${opts(C.LISTS.priority, c.priority, "—")}</select></div>
          <div class="field"><label>Severity (1-10)</label><select id="f_sev">${opts(C.LISTS.score, c.sev, "—")}</select></div>
          <div class="field"><label>Occurrence (1-10)</label><select id="f_occ">${opts(C.LISTS.score, c.occ, "—")}</select></div>
          <div class="field"><label>Detection (1-10)</label><select id="f_det">${opts(C.LISTS.score, c.det, "—")}</select></div>
          <div class="field"><label>Owner</label><select id="f_owner">${opts(names, c.owner, "—")}</select></div>
          <div class="field full"><label>Root cause hypothesis</label>
            <select id="f_rootCause">${opts(C.SUGGEST.root, c.rootCause, "— choose —")}</select></div>
          <div class="field"><label>Lean method</label><select id="f_leanMethod">${opts(C.LISTS.leanMethod, c.leanMethod, "—")}</select></div>
          <div class="field full"><label>Target outcome (measurable)</label>
            <select id="f_target">${opts(C.SUGGEST.target, c.target, "— choose —")}</select></div>
          <div class="field"><label>Start date</label><input type="date" id="f_startDate" value="${esc(c.startDate)}"></div>
          <div class="field"><label>Status</label><select id="f_status">${opts(C.LISTS.status, c.status)}</select></div>
          <div class="field"><label>% Done</label><select id="f_percent">${pctSel.map(v => `<option value="${v}" ${Number(c.percent) === v ? "selected" : ""}>${Math.round(v * 100)}%</option>`).join("")}</select></div>
          <div class="field"><label>Cost category</label><select id="f_costCat">${opts(C.LISTS.costCat, c.costCat, "—")}</select></div>
          <div class="field"><label>Est. cost</label><select id="f_estCost">${opts(C.MONEY, c.estCost === "" || c.estCost == null ? "" : c.estCost, "—")}</select></div>
          <div class="field"><label>Actual cost</label><select id="f_actCost">${opts(C.MONEY, c.actCost === "" || c.actCost == null ? "" : c.actCost, "—")}</select></div>
          <div class="field full"><label>5 Whys (drill to root cause)</label>
            ${[0,1,2,3,4].map(i => `<select id="f_why${i}" style="margin-bottom:6px">${opts(C.SUGGEST.root, (c.whys||[])[i]||"", "Why "+(i+1)+"? — choose")}</select>`).join("")}</div>
          <div class="field full"><label>Auto-calculated</label><div class="readout" id="f_readout"></div></div>
        </div>
        <div class="modal-foot">
          <div style="display:flex;gap:8px">${editing ? `<button type="button" class="btn btn-danger" data-act="del" data-id="${id}">Delete</button>` : ""}
          ${editing ? `<button type="button" class="btn" data-act="a3" data-id="${id}">A3 report</button>` : ""}</div>
          <div style="display:flex;gap:8px"><button type="button" class="btn" data-act="cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">${editing ? "Save changes" : "Add case"}</button></div>
        </div>
      </form>`;
    $("#modalOverlay").hidden = false;

    const readForm = () => ({
      problem: $("#f_problem").value.trim(), category: $("#f_category").value, priority: $("#f_priority").value,
      sev: $("#f_sev").value, occ: $("#f_occ").value, det: $("#f_det").value, owner: $("#f_owner").value,
      rootCause: $("#f_rootCause").value.trim(), leanMethod: $("#f_leanMethod").value, target: $("#f_target").value.trim(),
      startDate: $("#f_startDate").value, status: $("#f_status").value, percent: Number($("#f_percent").value),
      dateLogged: c.dateLogged, costCat: $("#f_costCat").value,
      estCost: $("#f_estCost").value === "" ? "" : Number($("#f_estCost").value),
      actCost: $("#f_actCost").value === "" ? "" : Number($("#f_actCost").value),
      whys: [0,1,2,3,4].map(i => $("#f_why" + i).value.trim())
    });
    const preview = () => {
      const en = C.enrich(readForm());
      $("#f_readout").innerHTML = en.problem
        ? `<b>RPN</b> ${en.rpn ?? "—"} (${en.rpnBand || "—"}) &nbsp;·&nbsp; <b>Est. duration</b> ${en.estDays ?? "—"} days &nbsp;·&nbsp; <b>Est. end</b> ${C.fmtDate(en.estEnd) || "—"} &nbsp;·&nbsp; <b>Health</b> ${en.health}<br><b>AI:</b> ${esc(en.ai)}`
        : `<span class="muted">Fill the problem statement and scores to see live calculations.</span>`;
    };
    modal.querySelectorAll("input,select").forEach(i => { i.addEventListener("input", preview); i.addEventListener("change", preview); });
    preview();

    $("#caseForm").addEventListener("submit", ev => {
      ev.preventDefault();
      const data = readForm();
      if (!data.problem) { toast("Please enter a problem statement."); return; }
      if (editing) { S.updateCase(id, data); toast("Case updated."); }
      else { S.addCase(data); toast("Case added — all views updated."); }
      closeModal(); go(current === "help" || current === "config" ? "cases" : current);
    });
  }
  function closeModal() { $("#modalOverlay").hidden = true; $("#modal").innerHTML = ""; }
  // After any modal is shown, move keyboard focus into it for accessibility.
  // Observe the overlay so every code-path that opens a modal benefits.
  (function setupModalAutoFocus() {
    const overlay = $("#modalOverlay"), modal = $("#modal");
    if (!overlay || !modal || typeof MutationObserver === "undefined") return;
    const focusFirst = () => {
      if (overlay.hidden) return;
      const f = modal.querySelector("input:not([type=hidden]),select,textarea,button.btn-primary,.btn");
      if (f) try { f.focus(); } catch (e) {}
    };
    new MutationObserver(focusFirst).observe(overlay, { attributes: true, attributeFilter: ["hidden"] });
    new MutationObserver(focusFirst).observe(modal, { childList: true });
    // Focus trap — keep Tab cycling inside the modal while it's open.
    modal.addEventListener("keydown", e => {
      if (e.key !== "Tab" || overlay.hidden) return;
      const list = Array.from(modal.querySelectorAll("input:not([type=hidden]),select,textarea,button,a[href]"))
        .filter(f => !f.disabled && f.tabIndex !== -1);
      if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      const a = document.activeElement;
      if (e.shiftKey && (a === first || !modal.contains(a))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (a === last || !modal.contains(a))) { e.preventDefault(); first.focus(); }
    });
  })();

  // Open a click-only project-name picker modal (no prompt())
  function openProjectNameModal(opts) {
    const cur = opts.current || "";
    const sel = `<select id="proj_name_pick">${optsList(C.LISTS.projectNames, cur, "— choose a project name —")}</select>`;
    $("#modal").innerHTML = `<h2>${esc(opts.title)}</h2>
      <div class="sub">${esc(opts.subtitle || "Pick a name. The Settings page lets you update it later.")}</div>
      <div class="field full"><label>Project name</label>${sel}</div>
      <div class="modal-foot"><span></span><div style="display:flex;gap:8px">
        <button class="btn" data-act="cancel">Cancel</button>
        <button class="btn btn-primary" id="proj_name_ok">${esc(opts.okLabel || "OK")}</button>
      </div></div>`;
    $("#modalOverlay").hidden = false;
    const sf = $("#proj_name_pick"); if (sf) sf.focus();
    $("#proj_name_ok").addEventListener("click", () => {
      const v = $("#proj_name_pick").value;
      if (!v) { toast("Please choose a name."); return; }
      closeModal(); opts.onPick(v);
    });
  }
  // tiny shim because opts() shadows the option-list builder; keep one global
  const optsList = (arr, sel, blank) => opts(arr, sel, blank);

  function openManageViewsModal() {
    const views = S.savedViews();
    const fmtFilter = (fl) => [fl.status, fl.priority, fl.owner].filter(Boolean).join(" · ") || "All";
    const rows = views.length ? views.map(v => `<tr>
        <td><b>${esc(v.name)}</b></td>
        <td class="muted">${esc(fmtFilter(v.filter || {}))}</td>
        <td class="center">
          <button class="btn btn-sm" data-act="applyview" data-id="${v.id}">Apply</button>
          <button class="btn btn-sm btn-danger" data-act="rmview" data-id="${v.id}">Delete</button>
        </td></tr>`).join("")
      : `<tr><td colspan="3" class="muted center" style="padding:20px">No saved views yet. Set a filter on the Cases list and click <b>Save view</b>.</td></tr>`;
    $("#modal").innerHTML = `<h2>Manage saved views</h2>
      <div class="sub">Saved views are stored per project.</div>
      ${tableWrap("<th>Name</th><th>Filter</th><th></th>", rows)}
      <div class="modal-foot"><span></span><div style="display:flex;gap:8px">
        <button class="btn btn-primary" data-act="cancel">Close</button></div></div>`;
    $("#modalOverlay").hidden = false;
  }

  // Save the current Cases filter as a named view (click-only)
  function openSaveViewModal() {
    const f = uiState.caseFilter || {};
    const summary = [
      f.status ? "Status=" + f.status : "Any status",
      f.priority ? "Priority=" + f.priority : "Any priority",
      f.owner ? "Owner=" + f.owner : "Any owner",
      "Sort=" + (f.sort || "rpn")
    ].join(" · ");
    const sel = `<select id="sv_name_pick">${optsList(C.LISTS.savedViewNames, "", "— choose a name —")}</select>`;
    $("#modal").innerHTML = `<h2>Save current view</h2>
      <div class="sub">Pick a name. Choosing an existing name overwrites that view.</div>
      <div class="readout"><b>Filter:</b> ${esc(summary)}</div>
      <div class="field full" style="margin-top:12px"><label>View name</label>${sel}</div>
      <div class="modal-foot"><span></span><div style="display:flex;gap:8px">
        <button class="btn" data-act="cancel">Cancel</button>
        <button class="btn btn-primary" id="sv_save_ok">Save</button>
      </div></div>`;
    $("#modalOverlay").hidden = false;
    const picker = $("#sv_name_pick"); if (picker) picker.focus();
    $("#sv_save_ok").addEventListener("click", () => {
      const v = picker.value;
      if (!v) { toast("Please choose a name."); return; }
      const filter = { status: f.status || "", priority: f.priority || "", owner: f.owner || "", sort: f.sort || "rpn" };
      const saved = S.saveView(v, filter);
      uiState.caseFilter.savedViewId = saved.id;
      closeModal(); toast("View saved: " + v); go("cases");
    });
  }

  // Pick a snapshot label from the curated list (used by the Rename action on History & Backups)
  function openSnapshotRenameModal(id, currentLabel) {
    const sel = `<select id="sn_label_pick">${optsList(C.LISTS.snapshotLabels, currentLabel || "", "— choose a label —")}</select>`;
    $("#modal").innerHTML = `<h2>Rename snapshot</h2>
      <div class="sub">Pick a label that describes this restore point.</div>
      <div class="field full"><label>Label</label>${sel}</div>
      <div class="modal-foot"><span></span><div style="display:flex;gap:8px">
        <button class="btn" data-act="cancel">Cancel</button>
        <button class="btn btn-primary" id="sn_label_ok">Rename</button>
      </div></div>`;
    $("#modalOverlay").hidden = false;
    const picker = $("#sn_label_pick"); if (picker) picker.focus();
    $("#sn_label_ok").addEventListener("click", () => {
      const v = picker.value;
      if (!v) { toast("Please choose a label."); return; }
      S.renameSnapshot(id, v); closeModal(); toast("Renamed."); go("audit");
    });
  }

  function openA3(id) {
    const c = S.get().cases.find(x => x.id === id); if (!c) return;
    const a = C.a3(c);
    const box = (t, v) => `<div class="a3-box"><h4>${t}</h4><div>${v}</div></div>`;
    const whys = a.whys.length ? "<ol>" + a.whys.map(w => `<li>${esc(w)}</li>`).join("") + "</ol>" : `<span class="muted">No 5-Whys captured yet.</span>`;
    $("#modal").innerHTML = `
      <h2>A3 Report</h2><div class="sub">${esc(a.title)} · Owner: ${esc(a.owner)}</div>
      <div class="a3">
        ${box("1. Background", esc(a.background))}
        ${box("2. Current condition", esc(a.current))}
        ${box("3. Goal / target", esc(a.goal))}
        ${box("4. Root-cause analysis", esc(a.rootCause) + whys)}
        ${box("5. Countermeasures", esc(a.countermeasure))}
        ${box("6. Plan", esc(a.plan))}
        ${box("7. Follow-up", esc(a.followup))}
      </div>
      <div class="modal-foot"><span></span><div style="display:flex;gap:8px">
        <button class="btn" data-act="cancel">Close</button>
        <button class="btn btn-primary" onclick="window.print()">Print A3</button></div></div>`;
    $("#modalOverlay").hidden = false;
  }

  function confirmDelete(id) {
    const c = S.get().cases.find(x => x.id === id);
    const modal = $("#modal");
    modal.innerHTML = `<h2>Delete case?</h2><div class="sub">This removes it from every view. This cannot be undone.</div>
      <p>${esc(c ? c.problem : "")}</p>
      <div class="modal-foot"><span></span><div style="display:flex;gap:8px">
      <button class="btn" data-act="cancel">Cancel</button>
      <button class="btn btn-danger" data-act="confirmdel" data-id="${id}">Delete</button></div></div>`;
    $("#modalOverlay").hidden = false;
  }

  // ---------- export / import / csv ----------
  function download(name, text, type) {
    const blob = new Blob([text], { type: type || "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function exportJSON() { download("qi-platform-backup.json", JSON.stringify(S.get(), null, 2)); toast("Backup exported."); }
  function exportCSV() {
    const cols = ["code", "problem", "category", "priority", "sev", "occ", "det", "rpn", "rpnBand", "rootCause", "leanMethod", "owner", "target", "startDate", "estEnd", "status", "percent", "estCost", "actCost", "health"];
    const head = cols.join(",");
    const lines = S.enriched().filter(c => c.problem).map(c => cols.map(k => {
      let v = c[k]; if (v == null) v = ""; v = String(v).replace(/"/g, '""');
      return /[",\n]/.test(v) ? `"${v}"` : v;
    }).join(","));
    download("qi-cases.csv", [head].concat(lines).join("\n"), "text/csv");
    toast("CSV exported.");
  }
  function importJSON() { $("#fileImport").click(); }
  function handleImport(file) {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const obj = JSON.parse(fr.result);
        if (!obj.cases) throw new Error("Not a QI backup");
        S.importAsProject(obj); refreshHeader(); toast("Imported as a new project."); go("dashboard");
      } catch (e) { toast("Import failed: invalid file."); }
    };
    fr.readAsText(file);
  }
  // Page-wide drag-and-drop: drop a JSON backup anywhere to import it as a new project.
  (function setupDragDrop() {
    let depth = 0;
    const looksLikeFiles = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf("Files") !== -1;
    window.addEventListener("dragenter", e => { if (!looksLikeFiles(e)) return; e.preventDefault(); depth++; document.body.classList.add("dragging"); });
    window.addEventListener("dragover", e => { if (!looksLikeFiles(e)) return; e.preventDefault(); });
    window.addEventListener("dragleave", e => { if (!looksLikeFiles(e)) return; depth = Math.max(0, depth - 1); if (depth === 0) document.body.classList.remove("dragging"); });
    window.addEventListener("drop", e => {
      if (!looksLikeFiles(e)) return; e.preventDefault();
      depth = 0; document.body.classList.remove("dragging");
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      if (!/\.json$/i.test(f.name)) { toast("Only JSON backups are supported."); return; }
      handleImport(f);
    });
  })();
  function b64enc(s) { return btoa(unescape(encodeURIComponent(s))); }
  function b64dec(s) { return decodeURIComponent(escape(atob(s))); }
  function shareLink() {
    try {
      const data = b64enc(JSON.stringify(S.get()));
      const url = location.origin + location.pathname + "#p=" + data;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => toast("Share link copied to clipboard."), () => showShareLinkFallback(url));
      } else { showShareLinkFallback(url); }
    } catch (e) { toast("Could not build link (data too large?)."); }
  }
  function showShareLinkFallback(url) {
    $("#modal").innerHTML = `<h2>Share link</h2>
      <div class="sub">Copy this link and paste it to a colleague. They can open it as a new project on their device.</div>
      <textarea id="shareUrl" readonly rows="3" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px">${esc(url)}</textarea>
      <div class="modal-foot"><span></span><div style="display:flex;gap:8px">
        <button class="btn btn-primary" id="copyShare">Copy</button>
        <button class="btn" data-act="cancel">Close</button>
      </div></div>`;
    $("#modalOverlay").hidden = false;
    const t0 = $("#shareUrl"); if (t0) { t0.focus(); t0.select(); }
    $("#copyShare").addEventListener("click", () => {
      const t = $("#shareUrl"); t.select();
      try { document.execCommand("copy"); toast("Copied."); } catch (e) { toast("Press Ctrl/Cmd+C to copy."); }
    });
  }
  function checkShareHash() {
    if (location.hash && location.hash.indexOf("#p=") === 0) {
      try {
        const obj = JSON.parse(b64dec(location.hash.slice(3)));
        if (obj.cases && confirm("Open the shared project from this link as a new project?")) {
          S.importAsProject(obj); refreshHeader();
        }
      } catch (e) { toast("Shared link could not be read."); }
      try { history.replaceState(null, "", location.pathname); } catch (e) { location.hash = ""; }
    }
  }

  // ---------- theme / shortcuts / run checks ----------
  function applyTheme() {
    const dark = !!(S.brand() && S.brand().theme === "dark");
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    const btn = $("#btnTheme"); if (btn) btn.textContent = dark ? "☼" : "◐";
    if (window.QICharts && QICharts.refresh) QICharts.refresh();
  }
  function applySidebar() {
    const collapsed = !!(S.brand() && S.brand().sidebarCollapsed);
    const sb = $("#sidebar"); if (sb) sb.classList.toggle("collapsed", collapsed);
    const btn = $("#btnSidebar"); if (btn) {
      btn.textContent = collapsed ? "»" : "«";
      btn.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
      btn.setAttribute("aria-label", btn.title);
    }
  }
  function toggleSidebar() {
    const cur = !!(S.brand() && S.brand().sidebarCollapsed);
    S.setBrand({ sidebarCollapsed: !cur });
    applySidebar();
  }
  function toggleTheme() {
    const cur = (S.brand() && S.brand().theme) || "light";
    S.setBrand({ theme: cur === "dark" ? "light" : "dark" });
    applyTheme(); toast("Theme: " + (S.brand().theme === "dark" ? "dark" : "light"));
  }
  function runChecks() {
    const issues = S.health();
    const k = S.kpis();
    const sumLines = [
      `<b>${k.total}</b> case(s) · <b>${k.crit}</b> critical · <b>${k.open}</b> open · <b>${k.blocked}</b> blocked`,
      issues.length === 0 ? `<span style="color:var(--green)">✓ Data Health: all clear</span>` : `<span style="color:var(--red)">⚠ Data Health: ${issues.length} issue(s)</span>`
    ];
    const issueRows = issues.length ? `<div class="table-wrap" style="max-height:260px;overflow:auto"><table>${issues.map(i => `<tr><td><b>${esc(i.code)}</b></td><td class="wrap">${esc(i.msg)}</td></tr>`).join("")}</table></div>` : "";
    $("#modal").innerHTML = `<h2>Project checks</h2>
      <div class="sub">A live summary of project status and data integrity.</div>
      <div class="readout" style="margin-bottom:12px">${sumLines.join("<br>")}</div>
      ${issueRows}
      <div class="modal-foot"><span></span><div style="display:flex;gap:8px">
        ${issues.length ? '<button class="btn" data-act="goHealth">Open Data Health</button>' : ''}
        <button class="btn btn-primary" data-act="cancel">Close</button>
      </div></div>`;
    $("#modalOverlay").hidden = false;
  }
  // ---------- onboarding tour ----------
  const TOUR = [
    { icon: "👋", title: "Welcome to the QI Platform", body: "Your single workspace for quality improvement, project management and engineering assurance — multi-project, click-only and works fully offline." },
    { icon: "✚", title: "Add a case once, drive everything", body: "Press <b>n</b> or click <b>+ New Case</b>. The single entry auto-populates a PM task, a scored risk, an FMEA line, a PDCA cycle, an action-log entry, a Gantt bar and a budget line." },
    { icon: "📊", title: "Explore the dashboards", body: "The sidebar is grouped by domain — Risk &amp; Quality, Engineering, Business. Try <b>Kanban</b> (drag cards to change status), <b>Risk Matrix</b>, <b>EVM</b> and the <b>AI Assistant</b>." },
    { icon: "⚙", title: "Tune it for your team", body: "On <b>Settings</b>, set your project name and team roster. Use the topbar <b>◐</b> for dark mode and <b>?</b> for keyboard shortcuts. Snapshots in <b>History &amp; Backups</b> let you roll back anytime." }
  ];
  function showTour(step) {
    step = Math.max(0, Math.min(step || 0, TOUR.length - 1));
    const s = TOUR[step];
    const dots = TOUR.map((_, i) => `<div class="tour-step ${i === step ? "active" : ""}"></div>`).join("");
    const isLast = step === TOUR.length - 1;
    $("#modal").innerHTML = `
      <div class="tour-steps">${dots}</div>
      <h2>${esc(s.title)}</h2>
      <div class="tour-image">${s.icon}</div>
      <div class="sub" style="font-size:14px;line-height:1.6">${s.body}</div>
      <div class="modal-foot">
        <button class="btn" data-act="tourSkip">Skip tour</button>
        <div style="display:flex;gap:8px">
          ${step > 0 ? `<button class="btn" data-act="tourPrev">Back</button>` : ""}
          ${isLast
            ? `<button class="btn btn-primary" data-act="tourDone">Get started</button>`
            : `<button class="btn btn-primary" data-act="tourNext">Next</button>`}
        </div>
      </div>`;
    $("#modalOverlay").hidden = false;
    uiState.tourStep = step;
  }

  function showShortcuts() {
    const rows = [
      ["?", "Show this list"],
      ["⌘/Ctrl K", "Command palette (jump to a view / run an action)"],
      ["n", "New case"],
      ["d", "Dashboard"],
      ["k", "Kanban board"],
      ["p", "Portfolio"],
      ["r", "Report Pack"],
      ["c", "Run checks"],
      ["t", "Toggle theme"],
      ["↑ / ↓", "Move between sidebar items (when nav is focused)"],
      ["Tab / Shift+Tab", "Move focus inside a dialog (focus is trapped)"],
      ["Esc", "Close dialog"]
    ].map(([k, m]) => `<div class="shortcut-row"><span>${m}</span><span><span class="kbd">${esc(k)}</span></span></div>`).join("");
    $("#modal").innerHTML = `<h2>Keyboard shortcuts</h2>
      <div class="sub">Single-letter shortcuts work when no field is focused. Bookmarkable URLs: every view appears in the URL hash (e.g. <code>#kanban</code>) — back/forward works.</div>
      <div>${rows}</div>
      <div class="modal-foot"><span></span><div style="display:flex;gap:8px">
        <button class="btn btn-primary" data-act="cancel">Close</button></div></div>`;
    $("#modalOverlay").hidden = false;
  }

  // ---------- command palette (Cmd/Ctrl+K) ----------
  function paletteCommands() {
    const cmds = [];
    VIEWS.forEach(v => { if (v.id) cmds.push({ label: "Go to " + v.label, icon: v.icon || "▸", run: () => go(v.id) }); });
    cmds.push(
      { label: "New case", icon: "＋", run: () => openCaseForm() },
      { label: "Run all checks", icon: "✓", run: () => runChecks() },
      { label: "Take snapshot", icon: "⟲", run: () => { S.takeSnapshot(); toast("Snapshot saved."); go("audit"); } },
      { label: "Toggle dark mode", icon: "◐", run: () => toggleTheme() },
      { label: "Collapse / expand sidebar", icon: "«", run: () => toggleSidebar() },
      { label: "Export JSON backup", icon: "⭳", run: () => exportJSON() },
      { label: "Share link", icon: "🔗", run: () => shareLink() },
      { label: "Take the tour", icon: "👋", run: () => showTour(0) },
      { label: "Keyboard shortcuts", icon: "⌨", run: () => showShortcuts() }
    );
    S.savedViews().forEach(v => cmds.push({ label: "View: " + v.name, icon: "★", run: () => { uiState.caseFilter = Object.assign({ q: "", status: "", priority: "", owner: "", sort: uiState.caseFilter.sort, pageSize: uiState.caseFilter.pageSize }, v.filter, { savedViewId: v.id }); go("cases"); } }));
    return cmds;
  }
  function openCommandPalette() {
    const cmds = paletteCommands();
    uiState.palette = { items: cmds, active: 0, q: "" };
    const render = () => {
      const q = uiState.palette.q.toLowerCase();
      const matches = cmds.filter(c => c.label.toLowerCase().includes(q));
      uiState.palette.matches = matches;
      if (uiState.palette.active >= matches.length) uiState.palette.active = Math.max(0, matches.length - 1);
      const list = matches.map((c, i) => `<div class="cmd-item ${i === uiState.palette.active ? "active" : ""}" data-cmd="${i}"><span class="cmd-ico">${c.icon}</span><span>${esc(c.label)}</span></div>`).join("") || `<div class="cmd-empty muted">No matching commands</div>`;
      const body = $("#cmdList"); if (body) body.innerHTML = list;
    };
    $("#modal").innerHTML = `<h2 style="margin-bottom:8px">Command palette</h2>
      <input id="cmdInput" class="cmd-input" placeholder="Type to filter… then Enter" autocomplete="off">
      <div class="cmd-list" id="cmdList"></div>
      <div class="sub" style="margin-top:8px">↑/↓ to move · Enter to run · Esc to close</div>`;
    $("#modalOverlay").hidden = false;
    const input = $("#cmdInput");
    render();
    if (input) input.focus();
    const runActive = () => {
      const m = uiState.palette.matches || [];
      const c = m[uiState.palette.active];
      if (c) { closeModal(); c.run(); }
    };
    input.addEventListener("input", () => { uiState.palette.q = input.value; uiState.palette.active = 0; render(); });
    input.addEventListener("keydown", e => {
      const m = uiState.palette.matches || [];
      if (e.key === "ArrowDown") { e.preventDefault(); uiState.palette.active = Math.min(uiState.palette.active + 1, m.length - 1); render(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); uiState.palette.active = Math.max(uiState.palette.active - 1, 0); render(); }
      else if (e.key === "Enter") { e.preventDefault(); runActive(); }
    });
    $("#cmdList").addEventListener("click", e => {
      const it = e.target.closest("[data-cmd]"); if (!it) return;
      uiState.palette.active = +it.dataset.cmd; runActive();
    });
  }

  // ---------- global events ----------
  function refreshHeader() {
    const b = S.brand(), p = S.get().project;
    $("#brandProject").textContent = p.name || "Untitled project";
    $("#brandCompany").textContent = b.company || "QI Platform";
    const logo = $("#brandLogo"), mark = $("#brandMark");
    if (b.logo) { logo.src = b.logo; logo.hidden = false; mark.classList.add("has-logo"); }
    else { logo.hidden = true; logo.removeAttribute("src"); mark.classList.remove("has-logo"); }
    const accent = b.accent || "#2e5496";
    document.documentElement.style.setProperty("--blue", accent);
    buildProjectSwitch();
  }
  function buildProjectSwitch() {
    const sel = $("#projectSwitch"); if (!sel) return;
    const ps = S.listProjects();
    sel.innerHTML = ps.map(p => `<option value="${p.id}" ${p.active ? "selected" : ""}>${esc(p.name)}</option>`).join("")
      + `<option value="__new">＋ New project…</option>`;
  }
  function setBrand() { refreshHeader(); }   // back-compat alias

  content.addEventListener("click", e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const act = b.dataset.act, id = b.dataset.id;
    if (act === "goHelp") return go("help");
    if (act === "startTour") return showTour(0);
    if (act === "skipTour") { S.setBrand({ tourDone: true }); toast("Tour skipped — open it anytime from Help."); return go("dashboard"); }
    if (act === "add") openCaseForm();
    else if (act === "edit") openCaseForm(id);
    else if (act === "del") confirmDelete(id);
    else if (act === "csv") exportCSV();
    else if (act === "export") exportJSON();
    else if (act === "import") importJSON();
    else if (act === "clearflt") { uiState.caseFilter = { q: "", status: "", priority: "", owner: "", sort: uiState.caseFilter.sort }; go("cases"); }
    else if (act === "chip") {
      const f = uiState.caseFilter; const sort = f.sort, pageSize = f.pageSize;
      const base = { q: "", status: "", priority: "", owner: "", sort, pageSize };
      const m = { all: {}, open: { status: "OPEN" }, inprogress: { status: "IN PROGRESS" }, blocked: { status: "BLOCKED" }, critical: { priority: "1-CRITICAL" }, resolved: { status: "RESOLVED" } };
      uiState.caseFilter = Object.assign(base, m[b.dataset.chip] || {});
      go("cases");
    }
    else if (act === "saveview") openSaveViewModal();
    else if (act === "manageviews") openManageViewsModal();
    else if (act === "delsavedview") { S.deleteSavedView(id); uiState.caseFilter.savedViewId = ""; toast("View deleted."); go("cases"); }
    else if (act === "pagemore") { const cur = uiState.caseFilter.pageSize || 100; uiState.caseFilter.pageSize = cur === 0 ? 0 : cur + 100; go("cases"); }
    else if (act === "pageall") { uiState.caseFilter.pageSize = 0; go("cases"); }
    else if (act === "bulkclear") { uiState.selected.clear(); go("cases"); }
    else if (act === "bulkdel") {
      const ids = [...uiState.selected]; if (!ids.length) return;
      if (!confirm("Delete " + ids.length + " selected case(s)? This cannot be undone via the toast Undo (use Snapshots to restore).")) return;
      S.bulkDelete(ids); uiState.selected.clear();
      toast("Deleted " + ids.length + " case(s)."); go("cases");
    }
    else if (act === "pin") { S.togglePin(id); go("cases"); }
    else if (act === "snap") { S.takeSnapshot(); toast("Snapshot saved."); go("audit"); }
    else if (act === "snaprename") { const cur = (S.snapshots().find(s => s.id === id) || {}).label; openSnapshotRenameModal(id, cur); }
    else if (act === "restore") { if (confirm("Restore this snapshot? Current data is auto-backed-up first.")) { S.restoreSnapshot(id); setBrand(); toast("Snapshot restored."); go("dashboard"); } }
    else if (act === "delsnap") { S.deleteSnapshot(id); go("audit"); }
    else if (act === "clearaudit") { if (confirm("Clear the change-history log?")) { S.clearAudit(); go("audit"); } }
    else if (act === "diffSnaps") showDiffModal();
    else if (act === "openproj") { S.switchProject(id); refreshHeader(); go("dashboard"); toast("Switched project."); }
    else if (act === "newproj") { openProjectNameModal({ title: "New project", okLabel: "Create", onPick: n => { S.addProject(n); refreshHeader(); go("dashboard"); toast("Project created."); } }); }
    else if (act === "renproj") { const cur = S.listProjects().find(x => x.id === id); openProjectNameModal({ title: "Rename project", current: cur ? cur.name : "", okLabel: "Rename", onPick: n => { S.renameProject(id, n); refreshHeader(); go("portfolio"); toast("Renamed."); } }); }
    else if (act === "dupproj") { S.duplicateProject(id); refreshHeader(); go("dashboard"); toast("Project duplicated."); }
    else if (act === "delproj") { if (confirm("Delete this project and all its data? This cannot be undone.")) { S.deleteProject(id); refreshHeader(); go("portfolio"); toast("Project deleted."); } }
    else if (act === "savebrand") {
      S.setBrand({ company: $("#b_company").value, accent: $("#b_accent").value });
      refreshHeader(); toast("Branding saved.");
    }
    else if (act === "rmlogo") { S.setBrand({ logo: "" }); refreshHeader(); go("config"); }
    else if (act === "saveai") {
      S.setAi({ provider: $("#ai_provider").value, baseUrl: $("#ai_base").value, model: $("#ai_model").value, key: $("#ai_key").value });
      toast("AI settings saved.");
    }
    else if (act === "regadd") { S.regAdd(b.dataset.reg, {}); go(b.dataset.reg); }
    else if (act === "regdel") { S.regDelete(b.dataset.reg, id); go(b.dataset.reg); }
    else if (act === "regclear") { uiState.regFilter[b.dataset.reg] = ""; go(b.dataset.reg); }
    else if (act === "regpin") { S.regTogglePin(b.dataset.reg, id); go(b.dataset.reg); }
    else if (act === "regbulkclear") { (uiState.regSelected[b.dataset.reg] || new Set()).clear(); uiState.regSelected[b.dataset.reg] = new Set(); go(b.dataset.reg); }
    else if (act === "regbulkdel") {
      const sel = uiState.regSelected[b.dataset.reg] || new Set();
      const ids = [...sel];
      if (!ids.length) return;
      if (!confirm("Delete " + ids.length + " selected row(s)?")) return;
      S.regBulkDelete(b.dataset.reg, ids);
      sel.clear(); uiState.regSelected[b.dataset.reg] = new Set();
      toast("Deleted " + ids.length + " row(s)."); go(b.dataset.reg);
    }
    else if (act === "reset") { if (confirm("Reset to sample data? Your current data will be replaced.")) { S.reset(); setBrand(); go("dashboard"); toast("Reset to sample data."); } }
    else if (act === "addsk") { S.get().stakeholders.push({ name: "", role: "", influence: "", interest: "", raci: "" }); S.save(); go("stakeholders"); }
    else if (act === "delsk") { S.get().stakeholders.splice(+id, 1); S.save(); go("stakeholders"); }
    else if (act === "addro") { S.get().roster.push({ name: "", role: "", email: "" }); S.save(); go("config"); }
    else if (act === "delro") { S.get().roster.splice(+id, 1); S.save(); go("config"); }
    else if (act === "saveproj") {
      Object.assign(S.get().project, {
        name: $("#p_name").value, sponsor: $("#p_sponsor").value, manager: $("#p_manager").value,
        org: $("#p_org").value, start: $("#p_start").value, end: $("#p_end").value,
        status: $("#p_status").value, currency: $("#p_cur").value
      });
      S.save(); setBrand(); toast("Project saved.");
    }
  });

  $("#modalOverlay").addEventListener("click", e => {
    if (e.target.id === "modalOverlay") return closeModal();
    const b = e.target.closest("[data-act]"); if (!b) return;
    const act = b.dataset.act, id = b.dataset.id;
    if (act === "cancel") closeModal();
    else if (act === "goHealth") { closeModal(); go("health"); }
    else if (act === "applyview") {
      const v = S.savedViews().find(x => x.id === id);
      if (v) { uiState.caseFilter = Object.assign({ q: "", status: "", priority: "", owner: "", sort: uiState.caseFilter.sort, pageSize: uiState.caseFilter.pageSize }, v.filter, { savedViewId: v.id }); }
      closeModal(); go("cases");
    }
    else if (act === "rmview") { S.deleteSavedView(id); if (uiState.caseFilter.savedViewId === id) uiState.caseFilter.savedViewId = ""; toast("View deleted."); openManageViewsModal(); }
    else if (act === "goHelp") { go("help"); }
    else if (act === "tourNext") showTour((uiState.tourStep || 0) + 1);
    else if (act === "tourPrev") showTour((uiState.tourStep || 0) - 1);
    else if (act === "tourSkip") { S.setBrand({ tourDone: true }); closeModal(); toast("Tour dismissed."); go("dashboard"); }
    else if (act === "tourDone") { S.setBrand({ tourDone: true }); closeModal(); toast("You're set — happy improving!"); go("dashboard"); }
    else if (act === "a3") openA3(id);
    else if (act === "del") { closeModal(); confirmDelete(id); }
    else if (act === "confirmdel") {
      S.deleteCase(id); closeModal();
      toast("Case deleted.", { action: { label: "Undo", handler: () => { S.undoDelete(); go(current === "help" ? "cases" : current); toast("Restored."); } } });
      go(current === "help" ? "cases" : current);
    }
  });

  $("#navAddCase").addEventListener("click", () => openCaseForm());
  $("#btnExport").addEventListener("click", exportJSON);
  $("#btnImport").addEventListener("click", importJSON);
  // ---------- presentation mode ----------
  const PRESENT_VIEWS = ["dashboard", "brain", "budget", "evm"];
  let presentInterval = null;
  let presentIdx = 0;
  let presentProgressBar = null;
  let presentProgressAnim = null;

  function startPresentation() {
    document.body.classList.add("presenting");
    // Request fullscreen
    try { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen(); } catch (e) {}
    // Create exit button
    if (!document.getElementById("exitPresentBtn")) {
      const btn = document.createElement("button");
      btn.id = "exitPresentBtn";
      btn.className = "exit-present-btn";
      btn.textContent = "Exit";
      btn.title = "Exit presentation mode";
      btn.addEventListener("click", stopPresentation);
      document.body.appendChild(btn);
    }
    // Create progress bar
    if (!document.getElementById("presentProgress")) {
      const bar = document.createElement("div");
      bar.id = "presentProgress";
      bar.className = "present-progress";
      bar.innerHTML = '<div class="present-progress-fill"></div>';
      document.body.appendChild(bar);
      presentProgressBar = bar.querySelector(".present-progress-fill");
    }
    // Start cycling
    presentIdx = 0;
    go(PRESENT_VIEWS[presentIdx]);
    resetProgressAnim();
    presentInterval = setInterval(() => {
      presentIdx = (presentIdx + 1) % PRESENT_VIEWS.length;
      go(PRESENT_VIEWS[presentIdx]);
      resetProgressAnim();
    }, 8000);
  }

  function resetProgressAnim() {
    if (presentProgressBar) {
      presentProgressBar.style.transition = "none";
      presentProgressBar.style.width = "0%";
      // Force reflow then animate
      void presentProgressBar.offsetWidth;
      presentProgressBar.style.transition = "width 8s linear";
      presentProgressBar.style.width = "100%";
    }
  }

  function stopPresentation() {
    document.body.classList.remove("presenting");
    if (presentInterval) { clearInterval(presentInterval); presentInterval = null; }
    // Exit fullscreen
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch (e) {}
    // Remove exit button
    const btn = document.getElementById("exitPresentBtn");
    if (btn) btn.remove();
    // Remove progress bar
    const bar = document.getElementById("presentProgress");
    if (bar) bar.remove();
    presentProgressBar = null;
  }

  // Listen for fullscreenchange to detect ESC exit
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && document.body.classList.contains("presenting")) {
      stopPresentation();
    }
  });

  $("#btnPresent").addEventListener("click", startPresentation);
  $("#btnAlerts").addEventListener("click", function (e) { e.stopPropagation(); toggleAlertDropdown(); });
  $("#langSelect").addEventListener("change", function (e) { setLanguage(e.target.value); });
  $("#btnShare").addEventListener("click", shareLink);
  $("#btnPrint").addEventListener("click", () => window.print());
  $("#btnTheme").addEventListener("click", toggleTheme);
  $("#btnChecks").addEventListener("click", runChecks);
  $("#btnHelp").addEventListener("click", showShortcuts);
  $("#fileImport").addEventListener("change", e => { if (e.target.files[0]) handleImport(e.target.files[0]); e.target.value = ""; });
  $("#hamburger").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  const fab = $("#fab"); if (fab) fab.addEventListener("click", () => openCaseForm());
  const btnSb = $("#btnSidebar"); if (btnSb) btnSb.addEventListener("click", toggleSidebar);
  $("#projectSwitch").addEventListener("change", e => {
    const v = e.target.value;
    if (v === "__new") {
      // restore previous selection while the modal is open
      e.target.value = S.activeProjectId();
      openProjectNameModal({ title: "New project", okLabel: "Create", onPick: n => { S.addProject(n); refreshHeader(); go("dashboard"); toast("Project created."); } });
    }
    else { S.switchProject(v); refreshHeader(); go(current === "portfolio" ? "portfolio" : "dashboard"); }
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { closeModal(); return; }
    // Command palette: Cmd/Ctrl+K works even from inside inputs.
    if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); openCommandPalette(); return; }
    // single-letter shortcuts when no input/select is focused
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const map = { "n": () => openCaseForm(), "d": () => go("dashboard"), "c": () => runChecks(),
      "k": () => go("kanban"), "p": () => go("portfolio"), "r": () => go("report"),
      "t": () => toggleTheme(), "?": () => showShortcuts() };
    if (e.key === "?" || e.shiftKey && e.key === "/") { e.preventDefault(); showShortcuts(); return; }
    if (map[k]) { e.preventDefault(); map[k](); }
  });

  // Hash routing — back/forward buttons & bookmarkable view URLs.
  window.addEventListener("hashchange", () => {
    const id = (location.hash || "").replace(/^#/, "");
    if (id && RENDER[id]) go(id, { skipHash: true });
  });

  // Sidebar arrow-key navigation (Up/Down between items)
  $("#nav").addEventListener("keydown", e => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    const items = Array.from(document.querySelectorAll(".nav-item"));
    const idx = items.indexOf(document.activeElement);
    if (idx === -1) return;
    e.preventDefault();
    const next = e.key === "ArrowDown" ? Math.min(idx + 1, items.length - 1) : Math.max(idx - 1, 0);
    items[next].focus();
  });

  // Surface localStorage quota errors as a friendly toast.
  window.addEventListener("qi-storage-error", () => {
    toast("Storage full — export a JSON backup and delete old snapshots.");
  });

  // ---------- i18n public API ----------
  window.QII18N = { setLanguage: setLanguage, translatePhrase: translatePhrase, langCode: langCode, I18N: I18N, LANG_OPTIONS: LANG_OPTIONS };

  // ---------- init ----------
  S.load(); checkShareHash(); buildNav(); applyTheme(); applySidebar(); refreshHeader(); applyLang();
  const initialHash = (location.hash || "").replace(/^#/, "");
  go(initialHash && RENDER[initialHash] ? initialHash : "dashboard", { skipHash: !!(initialHash && RENDER[initialHash]) });
})();
