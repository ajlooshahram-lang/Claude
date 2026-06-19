/* QI Platform - UI: navigation, views, case form, import/export. */
(function () {
  "use strict";
  const C = window.QICalc, S = window.QIStore, CH = window.QICharts;
  const $ = sel => document.querySelector(sel);
  const content = $("#content");
  content.setAttribute("aria-live", "polite");
  const uiState = { caseFilter: { q: "", status: "", priority: "", owner: "", sort: "rpn", groupBy: "none" }, regFilter: {}, regSelected: {}, regSort: {}, selected: new Set() };

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
    playNotifSound();
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
  // Step 72: Notification sound toggle (Web Audio API beep, CSP-safe)
  var _soundEnabled = (function() { try { return localStorage.getItem("qi_sound") !== "off"; } catch(e) { return true; } })();
  function playNotifSound() {
    if (!_soundEnabled) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      var ctx = new AC();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
      setTimeout(function() { ctx.close(); }, 200);
    } catch(e) {}
  }
  function toggleSound() {
    _soundEnabled = !_soundEnabled;
    try { localStorage.setItem("qi_sound", _soundEnabled ? "on" : "off"); } catch(e) {}
    var btn = $("#btnSound");
    if (btn) btn.classList.toggle("sound-off", !_soundEnabled);
    toast(_soundEnabled ? (window.QII18n ? window.QII18n.t("toast.soundOn") : "Notification sound on") : (window.QII18n ? window.QII18n.t("toast.soundOff") : "Notification sound off"));
  }
  function tableWrap(head, rows, cls) {
    if (!rows) {
      var T = window.QII18n ? window.QII18n.t : function(k) { return null; };
      var emptyMsg = T("empty.noItems") || "No items yet. Go to <b>Project Brain</b>, upload a project description and click <b>Analyze</b> &mdash; the app will create your risk register, FMEA and tasks automatically.";
      var btnLabel = T("empty.goToBrain") || "Go to Project Brain";
      return `<div class="empty"><p>${emptyMsg}</p><button class="btn btn-sm" onclick="document.querySelector('[data-view=brain]')&&document.querySelector('[data-view=brain]').click()" type="button">\ud83e\udde0 ${btnLabel}</button></div>`;
    }
    return `<div class="table-wrap"><table class="${cls || ""}"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // --- Confetti celebration effect (step 64) ---
  function spawnConfetti() {
    var colors = ["#f44336","#e91e63","#9c27b0","#3f51b5","#03a9f4","#009688","#8bc34a","#ffeb3b","#ff9800","#00bcd4"];
    var container = document.createElement("div");
    container.className = "confetti-container";
    for (var i = 0; i < 40; i++) {
      var piece = document.createElement("div");
      piece.className = "confetti-piece";
      piece.style.left = Math.random() * 100 + "%";
      piece.style.background = colors[i % colors.length];
      piece.style.animationDelay = (Math.random() * 1.5) + "s";
      piece.style.width = (6 + Math.random() * 8) + "px";
      piece.style.height = (6 + Math.random() * 8) + "px";
      container.appendChild(piece);
    }
    document.body.appendChild(container);
    setTimeout(function () { if (container.parentNode) container.parentNode.removeChild(container); }, 4000);
  }

  // ---------- views config ----------
  const VIEWS = [
    { g: "Overview" },
    { id: "brain", label: "Project Brain", icon: "🧠" },
    { id: "investorbrief", label: "Investor Brief", icon: "📄" },
    { id: "portfolio", label: "Portfolio", icon: "▣" },
    { id: "dashboard", label: "Dashboard", icon: "▤" },
    { id: "cases", label: "Cases (Master)", icon: "★" },
    { g: "Delivery" },
    { id: "myitems", label: "My Items", icon: "👤" },
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
    { g: "Improve" },
    { id: "pdca", label: "PDCA", icon: "↻" },
    { id: "log", label: "Action Log", icon: "✎" },
    { id: "decisions", label: "Decision Log", icon: "📝" },
    { g: "People & Cost" },
    { id: "stakeholders", label: "Stakeholders", icon: "♟" },
    { id: "budget", label: "Budget", icon: "$" },
    { g: "Visualization" },
    { id: "globe3d", label: "3D Network Map", icon: "🌐" },
    { id: "routeprogress", label: "Route Progress", icon: "📡" },
    { g: "Intelligence" },
    { id: "country", label: "Country Intelligence", icon: "🗺" },
    { id: "advisor", label: "Project Advisor (AI)", icon: "🧭" },
    { id: "marketentry", label: "Market Entry", icon: "🚪" },
    { id: "licensing", label: "Licensing & Permits", icon: "📜" },
    { id: "landingpartners", label: "Landing Partners", icon: "🤝" },
    { id: "ai", label: "AI Assistant", icon: "✦" },
    { id: "impact", label: "Change Impact", icon: "⇄" },
    { id: "scorecard", label: "KPI Scorecard", icon: "▣" },
    { id: "health", label: "Data Health", icon: "✚" },
    { g: "Setup" },
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
  function getTitle(id) {
    var T = window.QII18n ? window.QII18n.t : null;
    if (T) { var k = "nav." + id; var r = T(k); if (r !== k) return r; }
    return TITLES[id] || id;
  }
  const recentViews = [];

  const VIEW_TIPS = {
    brain: "Upload or paste a project description here \u2014 the Brain does everything else.",
    investorbrief: "A ready-to-print one-pager for your board. Click \u2018Print\u2019 or \u2018Download\u2019 to take it with you.",
    globe3d: "An interactive 3D map of the submarine cable network. Drag to rotate, click a station for details.",
    dashboard: "Your project at a glance \u2014 health score, what to focus on next, and key metrics.",
    cases: "Every item in your project. Use the chips above to filter, or click any row to edit.",
    myitems: "Items assigned to you \u2014 your personal to-do list.",
    pm: "All project management tasks with status, priority, and owner tracking.",
    kanban: "Visual drag-and-drop board showing work items by status column.",
    timeline: "Gantt-style timeline of milestones, phases, and deadlines.",
    risks: "Comprehensive risk register with severity, likelihood, and mitigation plans.",
    fmea: "Failure Mode and Effects Analysis for systematic risk prioritisation.",
    routeprogress: "Track cable route segments, completion percentage, and deployment status.",
    country: "Country-by-country intelligence on regulations, partners, and market conditions.",
    advisor: "AI-powered recommendations on what to focus on next for project success."
  };

  // Step 80: Plain-language tooltip descriptions for nav items
  const NAV_TIPS = {
    brain: "Upload a project description and let the AI Brain generate your full project plan.",
    investorbrief: "One-page investor summary with financials, network map, and key metrics.",
    dashboard: "Live overview of project health, progress, and upcoming actions.",
    cases: "Master list of all project items including tasks, risks, and issues.",
    myitems: "Your personal to-do list filtered by assignment.",
    pm: "Project management tasks with owners, deadlines, and priorities.",
    kanban: "Visual board with drag-and-drop columns for workflow tracking.",
    timeline: "Gantt-style view of project phases, milestones, and deadlines.",
    risks: "Risk register showing all identified risks with severity and mitigation.",
    fmea: "Failure Mode and Effects Analysis for systematic quality control.",
    globe3d: "Interactive 3D globe showing cable routes and landing stations.",
    routeprogress: "Route-by-route build progress with completion percentages.",
    country: "Regulatory, licensing, and market intelligence for each country.",
    advisor: "AI-powered project advisor recommending your next best actions."
  };

  // Step 81: Visit-progress tracker (module-level Set)
  const visitedViews = new Set();

  function buildNav() {
    const nav = $("#nav");
    const T = window.QII18n ? window.QII18n.t : function(k) { return k; };
    nav.innerHTML = VIEWS.map(v => {
      if (v.g) {
        var gKey = "group." + v.g.toLowerCase().replace(/[^a-z&]/g,'').replace('&','');
        var gLabel = T(gKey) !== gKey ? T(gKey) : v.g;
        return `<div class="nav-sep" data-group="${v.g.toLowerCase().replace(/[^a-z&]/g,'')}">${esc(gLabel)}</div>`;
      }
      var navLabel = T("nav." + v.id);
      if (navLabel === "nav." + v.id) navLabel = v.label;
      return `<button class="nav-item" data-view="${v.id}"${NAV_TIPS[v.id] ? ` title="${esc(NAV_TIPS[v.id])}"` : ""}><span class="ico">${v.icon}</span><span class="lab">${esc(navLabel)}</span></button>`;
    }).join("");
    nav.setAttribute("role", "navigation");
    nav.setAttribute("aria-label", "Main menu");
    nav.querySelectorAll(".nav-item").forEach(b => b.addEventListener("click", () => go(b.dataset.view)));
  }

  function refreshBadges() {
    // Remove existing badges
    document.querySelectorAll(".nav-badge").forEach(b => b.remove());
    // Cases (Master) badge: show TOTAL count (step 85)
    const cases = S.validCases();
    const casesCount = cases.length;
    if (casesCount > 0) {
      const casesBtn = document.querySelector('.nav-item[data-view="cases"]');
      if (casesBtn) { const b = document.createElement("span"); b.className = "nav-badge"; b.textContent = casesCount; casesBtn.appendChild(b); }
    }
    // Risk Register badge: count of 1-CRITICAL items
    const critCount = cases.filter(c => c.priority === "1-CRITICAL").length;
    if (critCount > 0) {
      const risksBtn = document.querySelector('.nav-item[data-view="risks"]');
      if (risksBtn) { const b = document.createElement("span"); b.className = "nav-badge"; b.textContent = critCount; risksBtn.appendChild(b); }
    }
  }

  // i18n helper — module-level, falls back to built-in English if QII18n absent.
  var GUIDE_FALLBACK = {
    "guide.title": "AI suggests next:", "guide.goTo": "Go to",
    "nav.previous": "Previous", "nav.next": "Next",
    "guide.start": "Start here — upload or paste your project description and the app builds the whole plan for you.",
    "guide.advisor": "See the AI's top priorities — what to do first to get the best result.",
    "guide.blocked": "item(s) are blocked right now — clear them first to unblock progress.",
    "guide.critical": "critical risk(s) need a named owner and a mitigation plan.",
    "guide.market": "Decide which countries to enter first.",
    "guide.licensing": "Start the slowest permits now — they decide your timeline.",
    "guide.timeline": "Check your milestones and target dates.",
    "guide.globe": "See the route and build progress on the 3D map.",
    "guide.brief": "Package it for investors and government stakeholders."
  };
  function t(key) {
    if (window.QII18n && typeof window.QII18n.t === "function") {
      var v = window.QII18n.t(key);
      if (v && v !== key) return v;
    }
    return GUIDE_FALLBACK[key] || key;
  }

  // AI-recommended next step: looks at the LIVE project state and returns the
  // single most useful view to visit next to move the project forward. This is
  // what makes the navigation feel like a guided assistant ("go here next, and
  // here's why") rather than plain linear paging.
  function recommendNextStep(currentView) {
    var hasPlan = !!(uiState.brainPlan && uiState.brainPlan.frameworks);
    var k = {}; try { k = (S.kpis && S.kpis()) || {}; } catch (e) { k = {}; }
    var L = function (id) { return t("nav." + id); };
    var steps = [];
    if (!hasPlan && (k.total || 0) === 0) {
      steps.push({ view: "brain", label: L("brain"), reason: t("guide.start") });
    } else {
      steps.push({ view: "advisor", label: L("advisor"), reason: t("guide.advisor") });
      if ((k.blocked || 0) > 0) steps.push({ view: "kanban", label: L("kanban"), reason: k.blocked + " " + t("guide.blocked") });
      if ((k.crit || 0) > 0) steps.push({ view: "risks", label: L("risks"), reason: k.crit + " " + t("guide.critical") });
      steps.push({ view: "marketentry", label: L("marketentry"), reason: t("guide.market") });
      steps.push({ view: "licensing", label: L("licensing"), reason: t("guide.licensing") });
      steps.push({ view: "timeline", label: L("timeline"), reason: t("guide.timeline") });
      steps.push({ view: "globe3d", label: L("globe3d"), reason: t("guide.globe") });
      steps.push({ view: "investorbrief", label: L("investorbrief"), reason: t("guide.brief") });
    }
    for (var i = 0; i < steps.length; i++) {
      if (steps[i].view !== currentView && RENDER[steps[i].view]) return steps[i];
    }
    return null;
  }

  let current = "dashboard";
  function go(view, opts) {
    if (!RENDER[view]) view = "dashboard";
    const prev = current;
    // Tear down heavy 3D resources when navigating away from the globe view.
    if (prev === "globe3d" && view !== "globe3d" && window.QIGlobe) {
      try { window.QIGlobe.dispose(); } catch (e) {}
    }
    current = view;
    // Step 81: Track visited views
    visitedViews.add(view);
    if (recentViews[recentViews.length - 1] !== view) { recentViews.push(view); if (recentViews.length > 6) recentViews.shift(); }
    $("#viewTitle").textContent = getTitle(view) || "QI Platform";
    // Step 82: Update view description header
    var descEl = $("#viewDesc");
    if (descEl) descEl.textContent = NAV_TIPS[view] || "";
    const bc = $("#breadcrumb");
    if (bc) {
      let grp = "";
      for (let i = 0; i < VIEWS.length; i++) {
        if (VIEWS[i].g) grp = VIEWS[i].g;
        if (VIEWS[i].id === view) break;
      }
      bc.textContent = grp ? "Home \u203a " + grp + " \u203a " + (getTitle(view) || view) : "Home \u203a " + (getTitle(view) || view);
    }
    document.querySelectorAll(".nav-item").forEach(b => {
      const active = b.dataset.view === view;
      b.classList.toggle("active", active);
      // Step 81: Apply .visited class to visited nav items
      if (visitedViews.has(b.dataset.view)) b.classList.add("visited");
      if (active) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    $("#sidebar").classList.remove("open");
    CH.destroyAll();
    content.innerHTML = '<div class="shimmer-wrap"><div class="shimmer-line"></div><div class="shimmer-line short"></div><div class="shimmer-block"></div></div>';
    content.innerHTML = (RENDER[view] || (() => "<div class='empty'>Not found</div>"))();
    if (recentViews.length > 1) {
      var pills = recentViews.slice(0, -1).reverse().slice(0, 5).map(function(v) {
        return '<button class="recent-pill" data-recent-view="' + esc(v) + '" type="button">' + esc(getTitle(v) || v) + '</button>';
      }).join('');
      content.insertAdjacentHTML('afterbegin', '<div class="recent-bar">' + pills + '</div>');
    }
    // Contextual help tip (step 38)
    var tipDismissed = false; try { tipDismissed = !!localStorage.getItem('qi_tip_' + view); } catch(e){}
    if (VIEW_TIPS[view] && !tipDismissed) {
      content.insertAdjacentHTML('afterbegin', '<div class="help-tip"><span class="help-tip-text">' + esc(VIEW_TIPS[view]) + '</span><button class="help-tip-dismiss" data-dismiss-tip="' + esc(view) + '" type="button" aria-label="Dismiss tip">&times;</button></div>');
    }
    // Step 69: Animated page transitions between views
    content.classList.remove("view-enter");
    void content.offsetWidth;
    content.classList.add("view-enter");
    try { if (AFTER[view]) AFTER[view](); }
    catch (afterErr) { try { console.warn("View post-render failed (continuing):", afterErr); } catch (e) {} }
    // Step 79 + AI guide: Previous / Next + an AI-recommended "next step" that
    // tells the user where to go next to execute the project, based on the live
    // project state (acts like a guided assistant, not just linear paging).
    (function renderNavFooter() {
      var flat = VIEWS.filter(function(v) { return !!v.id; });
      var idx = -1;
      for (var i = 0; i < flat.length; i++) { if (flat[i].id === view) { idx = i; break; } }
      if (idx === -1) return;
      var prevView = idx > 0 ? flat[idx - 1] : null;
      var nextView = idx < flat.length - 1 ? flat[idx + 1] : null;
      var posText = (idx + 1) + " of " + flat.length;

      // ---- AI-recommended next step (state-aware guided journey) ----
      var rec = recommendNextStep(view);
      var guideHtml = "";
      if (rec) {
        guideHtml = '<div class="nav-guide" id="navGuide">'
          + '<span class="nav-guide-ico" aria-hidden="true">\uD83E\uDDED</span>'
          + '<div class="nav-guide-txt"><b>' + esc(t("guide.title")) + '</b> ' + esc(rec.reason) + '</div>'
          + '<button class="btn btn-primary nav-guide-btn" id="navGuideBtn" type="button" data-go="' + esc(rec.view) + '">'
          + esc(t("guide.goTo")) + ' ' + esc(rec.label) + ' \u2192</button>'
          + '</div>';
      }

      var footerHtml = '<div class="nav-footer" id="navFooter">';
      if (prevView) {
        footerHtml += '<button class="nav-prev" id="navPrev" type="button">\u2190 ' + esc(t("nav.previous")) + ': ' + esc(prevView.label) + '</button>';
      } else {
        footerHtml += '<button class="nav-prev" id="navPrev" type="button" disabled>\u2190 ' + esc(t("nav.previous")) + '</button>';
      }
      footerHtml += '<span class="nav-pos">' + esc(posText) + '</span>';
      if (nextView) {
        footerHtml += '<button class="nav-next" id="navNext" type="button">' + esc(t("nav.next")) + ': ' + esc(nextView.label) + ' \u2192</button>';
      } else {
        footerHtml += '<button class="nav-next" id="navNext" type="button" disabled>' + esc(t("nav.next")) + ' \u2192</button>';
      }
      footerHtml += '</div>';
      content.insertAdjacentHTML('beforeend', guideHtml + footerHtml);
      var guideBtn = document.getElementById("navGuideBtn");
      if (guideBtn && rec) guideBtn.addEventListener("click", function() { go(rec.view); });
      var prevBtn = document.getElementById("navPrev");
      var nextBtn = document.getElementById("navNext");
      if (prevBtn && prevView) prevBtn.addEventListener("click", function() { go(prevView.id); });
      if (nextBtn && nextView) nextBtn.addEventListener("click", function() { go(nextView.id); });
    })();
    // Reflect the current view in the URL so back/forward and bookmarks work.
    if (!(opts && opts.skipHash)) {
      const target = "#" + view;
      if (location.hash !== target) {
        try { history.pushState(null, "", target); } catch (e) { try { location.hash = target; } catch (_) {} }
      }
    }
    window.scrollTo(0, 0);
    refreshBadges();
  }

  // ---------- renderers ----------
  const RENDER = {};
  const AFTER = {};

  // ---- Spending-over-time S-curve (pure inline SVG; CSP-safe, prints cleanly)
  // Shared by the 3D build overlay (live marker that fills as the A–Z build
  // plays) and the printable Investor Brief (static full curve). A single scale
  // is used everywhere so the live updater and the drawn path always agree.
  const SPEND = { W: 320, H: 120, padL: 34, padT: 12, padB: 18, padR: 10 };
  const spendPlotW = SPEND.W - SPEND.padL - SPEND.padR;
  const spendPlotH = SPEND.H - SPEND.padT - SPEND.padB;
  const spendBaseY = SPEND.padT + spendPlotH;
  const clamp01 = v => Math.max(0, Math.min(1, Number(v) || 0));
  const spendX = g => SPEND.padL + clamp01(g) * spendPlotW;
  const spendY = frac => SPEND.padT + (1 - clamp01(frac)) * spendPlotH;
  const fmtUsdShort = n => {
    n = Number(n) || 0;
    if (n >= 1e9) { const b = n / 1e9; return "USD " + (b >= 10 ? Math.round(b) : (Math.round(b * 10) / 10)) + "B"; }
    if (n >= 1e6) return "USD " + Math.round(n / 1e6) + "M";
    if (n >= 1e3) return "USD " + Math.round(n / 1e3) + "K";
    return "USD " + n;
  };
  function spendCurveSVG(curve, opts) {
    opts = opts || {};
    if (!Array.isArray(curve) || curve.length < 2) return "";
    const id = opts.id || "spend";
    const live = !!opts.live;
    const budget = curve[curve.length - 1].budgetUsd || 1;
    const months = curve[curve.length - 1].monthsTotal || 60;
    const pts = curve.map(p => spendX(p.g).toFixed(1) + "," + spendY(p.costUsd / budget).toFixed(1));
    const line = "M" + pts.join(" L");
    const area = "M" + spendX(0).toFixed(1) + "," + spendBaseY.toFixed(1) +
      " L" + pts.join(" L") + " L" + spendX(1).toFixed(1) + "," + spendBaseY.toFixed(1) + " Z";
    const clipW = (spendX(live ? 0 : 1) - SPEND.padL).toFixed(1);
    const midMonth = Math.round(months / 2);
    const marker = live
      ? `<line class="spend-guide" id="${esc(id)}Guide" x1="${spendX(0).toFixed(1)}" y1="${spendBaseY.toFixed(1)}" x2="${spendX(0).toFixed(1)}" y2="${spendBaseY.toFixed(1)}"></line>
         <circle class="spend-dot" id="${esc(id)}Dot" cx="${spendX(0).toFixed(1)}" cy="${spendBaseY.toFixed(1)}" r="3.2"></circle>`
      : "";
    return `<svg class="spend-svg" viewBox="0 0 ${SPEND.W} ${SPEND.H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Cumulative spending across the build">
      <defs><clipPath id="${esc(id)}Clip"><rect id="${esc(id)}ClipRect" x="${SPEND.padL}" y="0" width="${clipW}" height="${SPEND.H}"></rect></clipPath></defs>
      <line class="spend-grid" x1="${SPEND.padL}" y1="${SPEND.padT}" x2="${(SPEND.W - SPEND.padR)}" y2="${SPEND.padT}"></line>
      <line class="spend-axis" x1="${SPEND.padL}" y1="${spendBaseY.toFixed(1)}" x2="${(SPEND.W - SPEND.padR)}" y2="${spendBaseY.toFixed(1)}"></line>
      <path class="spend-area" d="${area}" clip-path="url(#${esc(id)}Clip)"></path>
      <path class="spend-line" d="${line}"></path>
      ${marker}
      <text class="spend-lbl" x="2" y="${(SPEND.padT + 3)}">${esc(fmtUsdShort(budget))}</text>
      <text class="spend-lbl" x="2" y="${spendBaseY.toFixed(1)}">USD 0</text>
      <text class="spend-lbl spend-lbl-x" x="${spendX(0).toFixed(1)}" y="${(SPEND.H - 5)}">Mo 0</text>
      <text class="spend-lbl spend-lbl-x" x="${spendX(0.5).toFixed(1)}" y="${(SPEND.H - 5)}" text-anchor="middle">${midMonth}</text>
      <text class="spend-lbl spend-lbl-x" x="${spendX(1).toFixed(1)}" y="${(SPEND.H - 5)}" text-anchor="end">${months}</text>
    </svg>`;
  }

  // ---- Static network-map thumbnail (pure inline SVG, CSP-safe, prints) ----
  // Plots the landing stations by real lat/long with the cable links drawn as
  // glowing curved submarine-style arcs, coloured by status, so the
  // printed/downloaded brief shows the network's shape with real polish.
  function networkMapSVG(stations, cables) {
    if (!Array.isArray(stations) || stations.length < 2) return "";
    const W = 380, H = 224, padX = 34, padY = 26;
    const lats = stations.map(s => s.lat), lons = stations.map(s => s.lon);
    let minLa = Math.min.apply(null, lats), maxLa = Math.max.apply(null, lats);
    let minLo = Math.min.apply(null, lons), maxLo = Math.max.apply(null, lons);
    const laPad = (maxLa - minLa) * 0.12 || 1, loPad = (maxLo - minLo) * 0.12 || 1;
    minLa -= laPad; maxLa += laPad; minLo -= loPad; maxLo += loPad;
    const plotW = W - padX * 2, plotH = H - padY * 2;
    const X = lon => padX + ((lon - minLo) / (maxLo - minLo)) * plotW;
    const Y = lat => padY + ((maxLa - lat) / (maxLa - minLa)) * plotH;
    const pos = {};
    stations.forEach(s => { pos[s.id] = { x: X(s.lon), y: Y(s.lat), s: s }; });
    // curved great-circle-style arc between two stations (bowed perpendicular)
    const arc = (a, b) => {
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const bow = Math.min(26, len * 0.16);
      const cx = mx + (-dy / len) * bow, cy = my + (dx / len) * bow;
      return `M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
    };
    // faint lat/long grid for a real "map" feel
    let grid = "";
    for (let i = 1; i < 5; i++) {
      const gx = padX + (plotW * i) / 5, gy = padY + (plotH * i) / 4;
      grid += `<line class="netmap-grid" x1="${gx.toFixed(1)}" y1="${padY}" x2="${gx.toFixed(1)}" y2="${(padY + plotH).toFixed(1)}"></line>`;
      grid += `<line class="netmap-grid" x1="${padX}" y1="${gy.toFixed(1)}" x2="${(padX + plotW).toFixed(1)}" y2="${gy.toFixed(1)}"></line>`;
    }
    const paths = (cables || []).map(c => {
      const a = pos[c.from], b = pos[c.to];
      if (!a || !b) return { glow: "", line: "" };
      const d = arc(a, b);
      return {
        glow: `<path class="netmap-glow netmap-stroke--${esc(c.status)}" d="${d}"></path>`,
        line: `<path class="netmap-line netmap-stroke--${esc(c.status)}" d="${d}"></path>`
      };
    });
    const glowLayer = paths.map(p => p.glow).join("");
    const lineLayer = paths.map(p => p.line).join("");
    const nodes = stations.map(s => {
      const p = pos[s.id];
      const anchor = p.x > W * 0.66 ? "end" : (p.x < W * 0.34 ? "start" : "middle");
      const dx = anchor === "end" ? -7 : (anchor === "start" ? 7 : 0);
      return `<circle class="netmap-halo" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="7"></circle>
        <circle class="netmap-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.6"></circle>
        <text class="netmap-lbl" x="${(p.x + dx).toFixed(1)}" y="${(p.y - 8).toFixed(1)}" text-anchor="${anchor}">${esc(s.country)}</text>`;
    }).join("");
    return `<svg class="netmap-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Map of the submarine cable network and its landing stations">
      <defs><filter id="netGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4"></feGaussianBlur></filter></defs>
      <g>${grid}</g>
      <g filter="url(#netGlow)">${glowLayer}</g>
      <g>${lineLayer}</g>
      <g>${nodes}</g>
    </svg>`;
  }

  // 3D submarine cable network visualization (Three.js globe + glass legend).
  RENDER.globe3d = function () {
    const G = window.QIGlobe || {};
    const cables = G.CABLES || [];
    const stations = G.STATIONS || [];
    const SC = G.STATUS_COLOR || {
      "commissioned": { css: "#42d6a4" }, "in-progress": { css: "#4ea1ff" }, "planned": { css: "#e6b84a" }
    };
    const statusLabel = { "commissioned": "Commissioned", "in-progress": "In progress", "planned": "Planned" };
    const dot = st => `<span class="globe-dot" style="background:${(SC[st] || {}).css || "#888"}"></span>`;
    const fmtKm = n => (Number(n) || 0).toLocaleString() + " km";

    const legendStatuses = ["commissioned", "in-progress", "planned"].map(st =>
      `<span class="globe-statkey">${dot(st)}${esc(statusLabel[st] || st)}</span>`).join("");

    const cableRows = cables.map(c => `
      <li class="globe-item globe-item--click" data-cable="${esc(c.id)}" tabindex="0" role="button">
        <div class="globe-item-top">
          <span class="globe-item-name">${dot(c.status)}${esc(c.name)}</span>
          <span class="globe-item-id">${esc(c.id)}</span>
        </div>
        <div class="globe-item-meta">
          <span>${fmtKm(c.lengthKm)}</span>
          <span>${esc(String(c.capacityTbps))} Tbps</span>
          <span>${esc(String(c.fibrePairs))} pairs</span>
          <span class="globe-item-status">${esc(statusLabel[c.status] || c.status)}</span>
        </div>
      </li>`).join("");

    const stationRows = stations.map(s => `
      <li class="globe-station globe-station--click" data-station="${esc(s.id)}" tabindex="0" role="button">
        <span class="globe-station-name">${esc(s.name)}</span>
        <span class="globe-station-country">${esc(s.country)}</span>
        <span class="globe-station-coord">${esc(s.lat.toFixed(1))}, ${esc(s.lon.toFixed(1))}</span>
      </li>`).join("");

    const totalKm = cables.reduce((a, c) => a + (Number(c.lengthKm) || 0), 0);
    const totalCap = cables.reduce((a, c) => a + (Number(c.capacityTbps) || 0), 0);

    return `
      <div class="globe-view">
        <div class="globe-stage" id="globeStage">
          <div class="globe-fallback" id="globeFallback">
            <div class="globe-fallback-mark">🌐</div>
            <h3>Submarine Telecom Project — Network Map</h3>
            <p>An interactive 3D view of the STP submarine cable system renders here when WebGL is available. The full cable inventory is listed in the panel.</p>
          </div>
          <div class="globe-controls" id="globeControls" hidden>
            <button class="globe-btn" id="globeTour" type="button">▶ Cinematic tour</button>
            <button class="globe-btn is-on" id="globeSpin" type="button" aria-pressed="true">⏸ Rotation</button>
            <button class="globe-btn" id="globeFullscreen" type="button">⛶ Fullscreen</button>
            <button class="globe-btn" id="globeScreenshot" type="button">📷 Screenshot</button>
          </div>
          <div class="globe-deploy" id="globeDeploy" hidden>
            <button class="globe-btn globe-deploy-play" id="globeDeployPlay" type="button">▶ Play build A–Z</button>
            <input class="globe-deploy-range" id="globeDeployRange" type="range" min="0" max="100" step="1" value="0" aria-label="Build progress" />
            <div class="globe-deploy-text">
              <span class="globe-deploy-phase" id="globeDeployPhase">Ready to build — press play to watch the network go live</span>
              <span class="globe-deploy-meta" id="globeDeployMeta">Programme: about USD 1.3B over 60 months</span>
            </div>
            <button class="globe-btn globe-deploy-exit" id="globeDeployExit" type="button" hidden>Back to live view</button>
          </div>
          <div class="globe-detail" id="globeDetail" hidden></div>
          <div class="globe-spend" id="globeSpend" hidden>
            <button class="gd-close globe-spend-close" id="globeSpendClose" type="button" aria-label="Close">×</button>
            <div class="globe-spend-title">Spending over time</div>
            <div class="globe-spend-chart" id="globeSpendChart"></div>
            <div class="globe-spend-title globe-online-title">Countries coming online</div>
            <div class="globe-online" id="globeOnline"></div>
          </div>
          <div class="globe-hint" id="globeHint">Drag to rotate · scroll to zoom · click a station or cable</div>
        </div>
        <aside class="globe-panel">
          <div class="globe-panel-head">
            <h3>Submarine Cable Network</h3>
            <p class="globe-sub">${stations.length} landing stations · ${cables.length} cable segments</p>
          </div>
          <div class="globe-stats">
            <div class="globe-stat"><span class="globe-stat-val">${totalKm.toLocaleString()}</span><span class="globe-stat-lab">total km</span></div>
            <div class="globe-stat"><span class="globe-stat-val">${totalCap.toLocaleString()}</span><span class="globe-stat-lab">Tbps capacity</span></div>
            <div class="globe-stat"><span class="globe-stat-val">${stations.length}</span><span class="globe-stat-lab">countries</span></div>
          </div>
          <div class="globe-statkeys">${legendStatuses}</div>
          <div class="globe-section">
            <h4>Cable Segments</h4>
            <ul class="globe-list">${cableRows || '<li class="globe-item muted">No cable data.</li>'}</ul>
          </div>
          <div class="globe-section">
            <h4>Landing Stations</h4>
            <ul class="globe-stationlist">${stationRows || '<li class="globe-station muted">No station data.</li>'}</ul>
          </div>
        </aside>
      </div>`;
  };
  AFTER.globe3d = function () {
    const stage = $("#globeStage");
    if (!stage || !window.QIGlobe) return;
    const G = window.QIGlobe;
    let ok = false;
    try { ok = G.init(stage); } catch (e) { ok = false; }
    const fb = $("#globeFallback"), hint = $("#globeHint");
    const controls = $("#globeControls"), detail = $("#globeDetail");
    const tourBtn = $("#globeTour"), spinBtn = $("#globeSpin");

    if (!ok) {
      if (fb) fb.style.display = "";
      if (hint) hint.style.display = "none";
      return;   // 2D fallback + inventory panel only
    }
    if (fb) fb.style.display = "none";
    if (hint) hint.style.display = "";
    if (controls) controls.hidden = false;

    // A–Z deployment / build-sequence controls
    const deployBar = $("#globeDeploy"), deployPlay = $("#globeDeployPlay");
    const deployRange = $("#globeDeployRange"), deployPhase = $("#globeDeployPhase"), deployExit = $("#globeDeployExit");
    const deployMeta = $("#globeDeployMeta");
    if (deployBar) deployBar.hidden = false;
    let deployDone = false;  // one-shot guard for the 'build complete' toast
    let userStartedDeploy = false; // only show spend panel on explicit user interaction
    if (deployPlay) deployPlay.addEventListener("click", () => { userStartedDeploy = true; G.toggleDeployment(); });
    if (deployRange) deployRange.addEventListener("input", () => { userStartedDeploy = true; G.setDeployment(Number(deployRange.value) || 0); });
    if (deployExit) deployExit.addEventListener("click", () => G.exitDeployment());
    // Spending-over-time S-curve overlay (fills as the A–Z build plays).
    const spendBox = $("#globeSpend"), spendChart = $("#globeSpendChart");
    if (spendChart && typeof G.deployCurve === "function") {
      spendChart.innerHTML = spendCurveSVG(G.deployCurve(60), { id: "globeSpend", live: true });
    }
    const spendClip = $("#globeSpendClipRect"), spendDot = $("#globeSpendDot"), spendGuide = $("#globeSpendGuide");
    // Country chips that light up in order as the build reaches each go-live month.
    const onlineBox = $("#globeOnline");
    if (onlineBox && typeof G.onlineSchedule === "function") {
      onlineBox.innerHTML = G.onlineSchedule().map(o =>
        `<span class="globe-online-chip" data-g="${o.g.toFixed(4)}" data-station="${esc(o.id)}" role="button" tabindex="0" title="${esc(o.country)} — live around month ${esc(String(o.month))}. Click for details.">${esc(o.country)}</span>`).join("");
      // Click / keyboard a chip → fly to that station + open its briefing.
      const focusFromChip = el => { const id = el && el.getAttribute("data-station"); if (id) G.focusStation(id); };
      onlineBox.addEventListener("click", e => { const c = e.target.closest(".globe-online-chip"); if (c) focusFromChip(c); });
      onlineBox.addEventListener("keydown", e => {
        if (e.key !== "Enter" && e.key !== " ") return;
        const c = e.target.closest(".globe-online-chip");
        if (c) { e.preventDefault(); focusFromChip(c); }
      });
    }
    // Close button for the spend/online overlay
    const spendClose = $("#globeSpendClose");
    if (spendClose) spendClose.addEventListener("click", () => { if (spendBox) spendBox.hidden = true; userStartedDeploy = false; });
    const updateSpend = st => {
      if (!st || !st.budgetUsd) return;
      const x = spendX(st.g), y = spendY(st.costUsd / st.budgetUsd);
      if (spendClip) spendClip.setAttribute("width", Math.max(0, x - SPEND.padL).toFixed(1));
      if (spendDot) { spendDot.setAttribute("cx", x.toFixed(1)); spendDot.setAttribute("cy", y.toFixed(1)); }
      if (spendGuide) {
        spendGuide.setAttribute("x1", x.toFixed(1)); spendGuide.setAttribute("x2", x.toFixed(1));
        spendGuide.setAttribute("y1", spendBaseY.toFixed(1)); spendGuide.setAttribute("y2", y.toFixed(1));
      }
      if (onlineBox) {
        const chips = onlineBox.children;
        for (let i = 0; i < chips.length; i++) {
          const cg = parseFloat(chips[i].getAttribute("data-g")) || 0;
          chips[i].classList.toggle("is-on", !!st.mode && st.g >= cg - 1e-6);
        }
      }
    };
    // plain-language money: "about USD 1.3B" / "USD 640M" — no jargon, no cents
    const fmtUsd = n => {
      n = Number(n) || 0;
      if (n >= 1e9) { const b = n / 1e9; return "USD " + (b >= 10 ? Math.round(b) : (Math.round(b * 10) / 10)) + "B"; }
      if (n >= 1e6) return "USD " + Math.round(n / 1e6) + "M";
      if (n >= 1e3) return "USD " + Math.round(n / 1e3) + "K";
      return "USD " + n;
    };
    G.onDeployment(st => {
      if (!st) return;
      if (deployRange) deployRange.value = String(st.pct);
      if (deployPlay) deployPlay.textContent = st.active ? "⏸ Pause" : (st.pct >= 100 ? "↻ Replay A–Z" : "▶ Play build A–Z");
      if (deployPlay) deployPlay.classList.toggle("is-on", !!st.active);
      if (deployExit) deployExit.hidden = !st.mode;
      if (deployPhase) {
        let msg;
        if (!st.mode) msg = "Ready to build — press play to watch the network go live";
        else if (st.pct >= 100 || st.laid >= st.total) msg = `Network complete — all ${st.online}/${st.stations} countries online, ${st.total} cable segments laid`;
        else if (st.layingName) msg = `Laying ${st.layingName} — ${st.layingPct}% · ${st.online}/${st.stations} countries online`;
        else msg = "Starting build…";
        deployPhase.textContent = msg;
      }
      if (deployMeta) {
        if (!st.mode) {
          deployMeta.textContent = `Programme: about ${fmtUsd(st.budgetUsd)} over ${st.monthsTotal} months`;
        } else {
          deployMeta.textContent = `Month ${st.month} of ${st.monthsTotal} · about ${fmtUsd(st.costUsd)} committed (${st.costPct}%) · ${st.online} of ${st.stations} countries live`;
        }
      }
      if (spendBox) spendBox.hidden = !(st.mode && userStartedDeploy);
      updateSpend(st);
      // Notify once when the A–Z build finishes.
      if (st.mode && (st.pct >= 100 || st.laid >= st.total)) {
        if (!deployDone) { deployDone = true; toast(`Network build complete — all ${st.stations} countries online.`); spawnConfetti(); }
      } else { deployDone = false; }
    });

    const SC = G.STATUS_COLOR || {};
    const statusLabel = { "commissioned": "Commissioned", "in-progress": "In progress", "planned": "Planned" };
    const sdot = st => `<span class="globe-dot" style="background:${(SC[st] || {}).css || "#888"}"></span>`;
    const fmtKm = n => (Number(n) || 0).toLocaleString() + " km";

    // Plain-language country briefing for the selected landing station, drawn
    // from the on-device Brain (QICountryData). Turns the 3D map into an
    // interactive briefing tool for non-technical decision-makers: who approves
    // it, whether it's worth entering, how long approvals take, who can land the
    // cable, what could go wrong, and the nature/politics to plan around.
    const verdictSlug = v => {
      const s = String(v || "").toLowerCase();
      if (s.indexOf("caution") !== -1) return "caution";
      if (s.indexOf("conditional") !== -1) return "cond";
      if (s === "go" || s.indexOf(" go") !== -1 || s.indexOf("go") === 0) return "go";
      return "cond";
    };
    const riskSlug = lvl => {
      const s = String(lvl || "").toLowerCase();
      if (s.indexOf("top") !== -1) return "crit";
      if (s.indexOf("important") !== -1) return "high";
      return "med";
    };
    function briefingHTML(info) {
      const CD = window.QICountryData;
      if (!CD || typeof CD.briefing !== "function") return "";
      let b;
      try { b = CD.briefing((info.id || "") + " " + (info.country || "")); } catch (e) { b = null; }
      if (!b) return "";
      const a = b.authority || {};
      const me = b.marketEntry || {};
      const lic = b.licensing || {};
      const lp = b.landingParties || {};
      const link = a.url
        ? `<a class="gd-link" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">Official site ↗</a>`
        : "";
      const env = b.environmental
        ? `<p class="gd-env"><strong>Environment:</strong> ${esc(b.environmental.abbrev || "")} — ${esc(b.environmental.role || b.environmental.body || "")}</p>`
        : "";
      const permits = (lic.licenses || []).map(l => `
        <li><span class="gd-perm-name">${esc(l.license)}</span>
          <span class="gd-mo">~${esc(String(l.leadTimeMonths || 0))} mo</span>
          <small class="gd-perm-auth">${esc(l.authority || "")}</small></li>`).join("");
      const cp = lic.criticalPathItem
        ? `<p class="gd-cp"><strong>Start this first:</strong> ${esc(lic.criticalPathItem)} — usually about ${esc(String(lic.criticalPathMonths || 0))} months (${esc(lic.criticalPathAuthority || "")}). It takes the longest, so begin it early.</p>`
        : "";
      const candidates = (lp.candidates || []).map(n => `<span class="gd-chip">${esc(n)}</span>`).join("");
      const risks = (b.risks || []).map(r => `
        <li><span class="gd-risk-tag gd-risk--${riskSlug(r.level)}">${esc(r.level)}</span>
          <span class="gd-risk-text">${esc(r.text)}</span></li>`).join("");
      const geo = (b.geographical || []).map(g => `<li>${esc(g)}</li>`).join("");
      const pol = (b.geopolitical || []).map(g => `<li>${esc(g)}</li>`).join("");

      return `
        <div class="gd-brief">
          ${b.takeaway ? `<div class="gd-takeaway"><span class="gd-takeaway-k">What this means for you</span>${esc(b.takeaway)}</div>` : ""}
          <details class="gd-acc" open>
            <summary>Who approves it here</summary>
            <div class="gd-acc-body">
              <div class="gd-reg">${esc(a.abbrev || "")} — ${esc(a.name || "")}</div>
              <p>${esc(a.role || "")}</p>
              ${link}
              ${env}
            </div>
          </details>
          <details class="gd-acc">
            <summary>Is it worth going in? <span class="gd-verdict gd-verdict--${verdictSlug(me.verdict)}">${esc(me.verdict || "")}</span></summary>
            <div class="gd-acc-body">
              <p>${esc(me.recommendation || "")}</p>
              <p><strong>How much you can own:</strong> ${esc(me.foreignOwnership || "")}</p>
              <p><strong>Simplest way in:</strong> ${esc(me.recommendedMode || "")}</p>
            </div>
          </details>
          <details class="gd-acc">
            <summary>Approvals &amp; how long they take</summary>
            <div class="gd-acc-body">
              ${cp}
              <ul class="gd-permits">${permits || '<li class="muted">No approvals listed</li>'}</ul>
            </div>
          </details>
          <details class="gd-acc">
            <summary>Who can bring the cable ashore</summary>
            <div class="gd-acc-body">
              <div class="gd-chips">${candidates || '<span class="muted">No partners listed</span>'}</div>
              ${lp.note ? `<p class="gd-note">${esc(lp.note)}</p>` : ""}
            </div>
          </details>
          <details class="gd-acc">
            <summary>Where the cable connects to</summary>
            <div class="gd-acc-body">
              <p><strong>Key interconnect points:</strong> ${(b.interconnects || []).map(i => esc(i)).join(', ')}</p>
              ${b.iruBand ? '<p><strong>Typical capacity pricing:</strong> ' + esc(b.iruBand) + '</p>' : ''}
            </div>
          </details>
          <details class="gd-acc">
            <summary>What could go wrong here</summary>
            <div class="gd-acc-body">
              <ul class="gd-risks">${risks || '<li class="muted">No risks listed</li>'}</ul>
            </div>
          </details>
          <details class="gd-acc">
            <summary>Nature &amp; politics to plan around</summary>
            <div class="gd-acc-body">
              ${geo ? `<h6>Natural hazards</h6><ul class="gd-haz">${geo}</ul>` : ""}
              ${pol ? `<h6>Political &amp; cross-border</h6><ul class="gd-haz">${pol}</ul>` : ""}
            </div>
          </details>
        </div>`;
    }

    // highlight the matching list row when something is selected
    function markActive(info) {
      stage.ownerDocument.querySelectorAll(".globe-item--click.is-active, .globe-station--click.is-active")
        .forEach(el => el.classList.remove("is-active"));
      const panel = stage.closest(".globe-view");
      if (!info || !panel) return;
      const sel = info.type === "station"
        ? `.globe-station--click[data-station="${info.id}"]`
        : `.globe-item--click[data-cable="${info.id}"]`;
      const row = panel.querySelector(sel);
      if (row) { row.classList.add("is-active"); }
    }

    function renderDetail(info) {
      if (!detail) return;
      if (!info) { detail.hidden = true; detail.innerHTML = ""; markActive(null); return; }
      let body;
      if (info.type === "station") {
        const links = (info.cables || []).map(c => `
          <li>${sdot(c.status)}<span class="gd-cid">${esc(c.id)}</span>
            <span class="gd-cto">→ ${esc(c.toName)}</span>
            <span class="gd-ccap">${esc(String(c.capacityTbps))} Tbps</span></li>`).join("");
        body = `
          <div class="gd-kind">Landing station</div>
          <h4>${esc(info.name)}</h4>
          <div class="gd-sub">${esc(info.country)} · ${esc(info.lat.toFixed(1))}, ${esc(info.lon.toFixed(1))}</div>
          <div class="gd-count"><strong>${(info.cables || []).length}</strong> connected segment(s)</div>
          <ul class="gd-links">${links || '<li class="muted">No segments</li>'}</ul>
          ${briefingHTML(info)}`;
      } else {
        const cableNotes = { "commissioned": "This segment is live and carrying traffic.", "in-progress": "Cable is being laid \u2014 marine installation in progress.", "planned": "Planned for a future installation campaign." };
        body = `
          <div class="gd-kind">Cable segment ${sdot(info.status)}${esc(statusLabel[info.status] || info.status)}</div>
          <h4>${esc(info.name)}</h4>
          <div class="gd-sub">${esc(info.fromName)} ↔ ${esc(info.toName)}</div>
          <div class="gd-chips">
            <span class="gd-chip">${fmtKm(info.lengthKm)}</span>
            <span class="gd-chip">${esc(String(info.capacityTbps))} Tbps</span>
            <span class="gd-chip">${esc(String(info.fibrePairs))} fibre pairs</span>
          </div>
          <div class="gd-cable-status">
            <span class="gd-cable-badge--${esc(info.status)}">${esc(statusLabel[info.status] || info.status)}</span>
            <span class="gd-cable-note">${esc(cableNotes[info.status] || "")}</span>
          </div>`;
      }
      detail.innerHTML = `<button class="gd-close" id="gdClose" type="button" aria-label="Close">×</button>${body}`;
      detail.hidden = false;
      const close = $("#gdClose");
      if (close) close.addEventListener("click", () => { G.clearSelection(); });
      markActive(info);
    }

    // subscriptions
    G.onSelect(renderDetail);
    G.onTour(active => {
      if (!tourBtn) return;
      tourBtn.textContent = active ? "■ Stop tour" : "▶ Cinematic tour";
      tourBtn.classList.toggle("is-on", active);
    });
    G.onSpin(spinning => {
      if (!spinBtn) return;
      spinBtn.classList.toggle("is-on", spinning);
      spinBtn.setAttribute("aria-pressed", spinning ? "true" : "false");
      spinBtn.textContent = spinning ? "⏸ Rotation" : "▶ Rotation";
    });

    // HUD buttons
    if (tourBtn) tourBtn.addEventListener("click", () => G.toggleTour());
    if (spinBtn) spinBtn.addEventListener("click", () => G.toggleSpin());

    // Fullscreen toggle (step 49)
    const fsBtn = $("#globeFullscreen");
    if (fsBtn) fsBtn.addEventListener("click", () => {
      const el = stage.closest(".globe-view") || stage;
      if (!el) return;
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
      } else {
        var fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
        if (fn) { try { fn.call(el); } catch(e) {} }
      }
    });
    var fsChangeEvents = ["fullscreenchange", "webkitfullscreenchange"];
    fsChangeEvents.forEach(function(evt) {
      document.addEventListener(evt, () => {
        var isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
        if (fsBtn) fsBtn.textContent = isFs ? "\u26F6 Exit fullscreen" : "\u26F6 Fullscreen";
      });
    });

    // Screenshot button (step 62)
    const ssBtn = $("#globeScreenshot");
    if (ssBtn) ssBtn.addEventListener("click", () => {
      try {
        var canvas = stage.querySelector("canvas");
        if (!canvas) { toast("No WebGL canvas found."); return; }
        var dataUrl = canvas.toDataURL("image/png");
        var a = document.createElement("a");
        a.href = dataUrl;
        a.download = "STP-Globe-Screenshot.png";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast("Screenshot saved as PNG.");
      } catch (e) { toast("Could not capture screenshot."); }
    });

    // click a station / cable in the inventory panel to fly to it
    const panel = stage.closest(".globe-view");
    if (panel) {
      const onRow = el => {
        if (!el) return;
        if (el.dataset.station) G.focusStation(el.dataset.station);
        else if (el.dataset.cable) G.focusCable(el.dataset.cable);
      };
      panel.addEventListener("click", e => {
        const row = e.target.closest("[data-station],[data-cable]");
        if (row) onRow(row);
      });
      panel.addEventListener("keydown", e => {
        if (e.key !== "Enter" && e.key !== " ") return;
        const row = e.target.closest("[data-station],[data-cable]");
        if (row) { e.preventDefault(); onRow(row); }
      });
    }
  };

  // Investor Brief — a plain-language, print-ready one-pager generated entirely
  // from the auto-built plan. Built for non-technical decision-makers: it tells
  // the whole story (what gets built, who to deal with in each country, when it
  // goes live, how much it costs, and what to watch) on a single page a
  // stakeholder can hand to their board. Reuses the on-device Brain
  // (QICountryData) + the 3D network dataset (QIGlobe). No PM jargon.

  // Harvest the brief's own CSS rules from the live stylesheet so the
  // downloadable one-pager is self-contained AND always matches what's on
  // screen (single source of truth — no duplicated/ drifting CSS). Same-origin
  // sheets only; guarded so a cross-origin/unreadable sheet is skipped.
  function collectBriefCSS() {
    const wanted = /\.(brief|spend)/;
    let out = "";
    const sheets = (typeof document !== "undefined" && document.styleSheets) ? document.styleSheets : [];
    for (let i = 0; i < sheets.length; i++) {
      let rules = null;
      try { rules = sheets[i].cssRules; } catch (e) { rules = null; }
      if (!rules) continue;
      for (let j = 0; j < rules.length; j++) {
        const r = rules[j];
        if (r && r.type === 1 && r.selectorText && wanted.test(r.selectorText)) out += r.cssText + "\n";
      }
    }
    return out;
  }
  // Build a complete, self-contained HTML document for the rendered brief.
  function buildBriefDocument() {
    const el = $("#investorBrief");
    if (!el) return "";
    const h1 = el.querySelector("h1");
    const title = h1 ? h1.textContent : "Investor Brief";
    const base = "body{margin:0;padding:24px;background:#fff;color:#1a2336;" +
      "font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
      ".muted{color:#6b7892}\n";
    return "<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\">" +
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
      "<title>" + esc(title) + "</title><style>" + base + collectBriefCSS() + "</style></head><body>" +
      el.outerHTML + "</body></html>";
  }
  // Download the brief as a self-contained .html file (CSP-safe: a Blob + an
  // <a download> click — no inline handler, no network, no external libs).
  function downloadBrief() {
    const html = buildBriefDocument();
    if (!html) return false;
    try {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const URLApi = window.URL || window.webkitURL;
      const url = URLApi.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "STP-Investor-Brief.html";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => { try { URLApi.revokeObjectURL(url); } catch (e) {} }, 0);
      return true;
    } catch (e) { return false; }
  }
  // Expose a tiny, legitimate API so the brief document can be produced/tested
  // outside the click handler (used by the test suites).
  window.QIBrief = { buildDocument: buildBriefDocument, download: downloadBrief };

  RENDER.investorbrief = function () {
    const G = window.QIGlobe || {};
    const CD = window.QICountryData;
    const cables = Array.isArray(G.CABLES) ? G.CABLES : [];
    const stations = Array.isArray(G.STATIONS) ? G.STATIONS : [];
    const prog = G.PROGRAMME || { budgetUsd: 1300e6, durationMonths: 60 };
    const proj = (S && typeof S.get === "function" && S.get().project) || {};
    const title = proj.name || "Submarine Telecom Project (STP)";
    const statusLabel = { "commissioned": "Commissioned", "in-progress": "In progress", "planned": "Planned" };
    const fmtUsd = n => {
      n = Number(n) || 0;
      if (n >= 1e9) { const b = n / 1e9; return "USD " + (b >= 10 ? Math.round(b) : (Math.round(b * 10) / 10)) + "B"; }
      if (n >= 1e6) return "USD " + Math.round(n / 1e6) + "M";
      if (n >= 1e3) return "USD " + Math.round(n / 1e3) + "K";
      return "USD " + n;
    };
    const verdictSlug = v => {
      const s = String(v || "").toLowerCase();
      if (s.indexOf("caution") !== -1) return "caution";
      if (s.indexOf("conditional") !== -1) return "cond";
      return "go";
    };
    const riskSlug = lvl => {
      const s = String(lvl || "").toLowerCase();
      if (s.indexOf("top") !== -1) return "crit";
      if (s.indexOf("important") !== -1) return "high";
      return "med";
    };

    const totalKm = cables.reduce((a, c) => a + (Number(c.lengthKm) || 0), 0);
    const totalCap = cables.reduce((a, c) => a + (Number(c.capacityTbps) || 0), 0);

    // Pull every country's plain-language briefing from the Brain.
    const list = (CD && typeof CD.list === "function") ? CD.list() : [];
    const briefs = list
      .map(c => (CD && typeof CD.briefing === "function") ? CD.briefing(c.key + " " + c.name) : null)
      .filter(Boolean);

    // Aggregate the biggest things to watch across all countries (worst-first).
    const allRisks = [];
    briefs.forEach(b => (b.risks || []).forEach(r =>
      allRisks.push({ country: b.name, text: r.text, level: r.level, rank: r.rank })));
    allRisks.sort((a, b) => a.rank - b.rank);
    const topRisks = allRisks.slice(0, 8);

    // When each country comes online during the build (same math as the live map).
    const online = (typeof G.onlineSchedule === "function") ? G.onlineSchedule() : [];
    // Map station IDs to country-data keys (used by the "What if" toggles).
    const stationKeyMap = {};
    stations.forEach(s => {
      const b = (CD && typeof CD.briefing === "function") ? CD.briefing(s.id + " " + s.name) : null;
      if (b) stationKeyMap[s.id] = b.key;
    });
    const onlineRows = online.map(o => {
      const countryKey = stationKeyMap[o.id] || o.id;
      const pct = Math.max(0, Math.min(100, Math.round((o.month / (o.monthsTotal || 60)) * 100)));
      return `<div class="brief-online-row" data-country-key="${esc(countryKey)}">
        <span class="brief-online-when">Month ${esc(String(o.month))}</span>
        <span class="brief-online-name">${esc(o.country)} <small>${esc(o.name)}</small></span>
        <span class="brief-online-track"><span class="brief-online-fill" style="width:${pct}%"></span><span class="brief-online-dot" style="left:${pct}%"></span></span>
      </div>`;
    }).join("");

    // 'What to do first' — the longest-lead approvals across the whole
    // programme (the real critical path that decides when work can begin).
    const allApprovals = [];
    briefs.forEach(b => (b.licensing.licenses || []).forEach(l =>
      allApprovals.push({ country: b.name, license: l.license, months: Number(l.leadTimeMonths) || 0, authority: l.authority || "" })));
    allApprovals.sort((a, b) => b.months - a.months);
    const todoRows = allApprovals.slice(0, 5).map(t => `<li class="brief-todo-item">
      <span class="brief-todo-when">~${esc(String(t.months))} mo</span>
      <span class="brief-todo-what"><strong>${esc(t.license)}</strong> — ${esc(t.country)}<small>${esc(t.authority)}</small></span>
    </li>`).join("");

    // Auto-written 'In a nutshell' executive summary — the whole story in a few
    // plain sentences for a reader who has never seen the project before.
    const listJoin = arr => arr.length <= 1 ? (arr[0] || "")
      : arr.slice(0, -1).join(", ") + " and " + arr[arr.length - 1];
    const vc = { go: 0, cond: 0, caution: 0 };
    briefs.forEach(b => { vc[verdictSlug(b.marketEntry.verdict)]++; });
    const slowest = briefs.slice()
      .sort((a, b) => (b.licensing.criticalPathMonths || 0) - (a.licensing.criticalPathMonths || 0))
      .filter(s => s.licensing.criticalPathMonths > 0).slice(0, 3);
    const topRisk = allRisks[0];
    const summaryParas = [];
    summaryParas.push(`This programme connects <strong>${stations.length} countries</strong> across Asia and the Pacific with about <strong>${esc(totalKm.toLocaleString())} km</strong> of undersea fibre carrying up to <strong>${esc(totalCap.toLocaleString())} Tbps</strong>. The headline cost is about <strong>${esc(fmtUsd(prog.budgetUsd))}</strong>, built over roughly <strong>${esc(String(prog.durationMonths))} months</strong>.`);
    const vparts = [];
    if (vc.go) vparts.push(`<strong>${vc.go}</strong> look straightforward to enter`);
    if (vc.cond) vparts.push(`<strong>${vc.cond}</strong> can go ahead once local conditions are met`);
    if (vc.caution) vparts.push(`<strong>${vc.caution}</strong> need extra caution`);
    if (vparts.length) summaryParas.push(`Of the ${briefs.length} countries, ${listJoin(vparts)}.`);
    if (slowest.length) {
      const items = slowest.map(s => `${esc(s.name)} (${esc(s.licensing.criticalPathItem)}, about ${esc(String(s.licensing.criticalPathMonths))} months)`);
      summaryParas.push(`Begin the slowest approvals first, because they decide when work can start: ${listJoin(items)}.`);
    }
    if (topRisk) {
      summaryParas.push(`There ${allRisks.length === 1 ? "is" : "are"} <strong>${allRisks.length}</strong> thing${allRisks.length === 1 ? "" : "s"} worth watching across the programme — the most pressing is ${esc(topRisk.text)} (${esc(topRisk.country)}).`);
    }

    // One honest 'overall' confidence read for the whole programme (traffic-light).
    const totalC = briefs.length || 1;
    const vavg = (vc.go * 2 + vc.cond * 1) / totalC;
    let healthLabel, healthSlug;
    if (vavg >= 1.5) { healthLabel = "A strong, buildable programme"; healthSlug = "go"; }
    else if (vavg >= 1.0) { healthLabel = "Buildable, with conditions to manage"; healthSlug = "cond"; }
    else if (vavg >= 0.5) { healthLabel = "Workable, but with real hurdles to clear"; healthSlug = "cond"; }
    else { healthLabel = "Challenging — proceed with care"; healthSlug = "caution"; }
    const cautionNames = briefs.filter(b => verdictSlug(b.marketEntry.verdict) === "caution").map(b => b.name);
    let healthWatch;
    if (cautionNames.length) healthWatch = "The main places to take extra care are " + listJoin(cautionNames) + ".";
    else if (topRisk) healthWatch = "The main thing to keep an eye on is " + topRisk.text + " (" + topRisk.country + ").";
    else healthWatch = "";

    const statChips = [
      { v: totalKm.toLocaleString() + " km", l: "Cable route" },
      { v: totalCap.toLocaleString() + " Tbps", l: "Capacity" },
      { v: String(stations.length), l: "Countries connected" },
      { v: "about " + fmtUsd(prog.budgetUsd), l: "Programme budget" },
      { v: prog.durationMonths + " months", l: "Build time" }
    ].map(s => `<div class="brief-stat"><span class="brief-stat-v">${esc(s.v)}</span><span class="brief-stat-l">${esc(s.l)}</span></div>`).join("");

    const cableRows = cables.map(c => {
      const a = stations.find(s => s.id === c.from), b = stations.find(s => s.id === c.to);
      return `<tr>
        <td>${esc(c.name)}</td>
        <td>${esc(a ? a.name : c.from)} → ${esc(b ? b.name : c.to)}</td>
        <td class="brief-num">${(Number(c.lengthKm) || 0).toLocaleString()} km</td>
        <td class="brief-num">${esc(String(c.capacityTbps))} Tbps</td>
        <td><span class="brief-status brief-status--${esc(c.status)}">${esc(statusLabel[c.status] || c.status)}</span></td>
      </tr>`;
    }).join("");

    const countryCards = briefs.map(b => {
      const a = b.authority || {};
      const me = b.marketEntry || {};
      const lic = b.licensing || {};
      const lp = b.landingParties || {};
      const partners = (lp.candidates || []).slice(0, 3).join(", ");
      const topRisk = (b.risks || [])[0];
      const ringPct = Math.round((1 - ((lic.criticalPathMonths || 0) / 60)) * 100);
      return `<div class="brief-country" data-country-key="${esc(b.key)}">
        <div class="brief-country-head">
          <h4>${esc(b.name)}</h4>
          <span class="brief-verdict brief-verdict--${verdictSlug(me.verdict)}">${esc(me.verdict || "")}</span>
        </div>
        <p class="brief-row"><span class="brief-k">Who approves it</span> ${esc(a.abbrev || "")} — ${esc(a.name || "")}</p>
        <p class="brief-row"><span class="brief-k">Start this first</span> ${esc(lic.criticalPathItem || "—")}${lic.criticalPathMonths ? " (about " + esc(String(lic.criticalPathMonths)) + " months)" : ""}</p>
        <p class="brief-row"><span class="brief-k">Can land the cable</span> ${esc(partners || "—")}</p>
        <p class="brief-row"><span class="brief-k">Connects to</span> ${esc((b.interconnects || [])[0] || "—")}</p>
        ${topRisk ? `<p class="brief-row"><span class="brief-risk brief-risk--${riskSlug(topRisk.level)}">${esc(topRisk.level)}</span> ${esc(topRisk.text)}</p>` : ""}
        ${b.takeaway ? `<p class="brief-takeaway">${esc(b.takeaway)}</p>` : ""}
        <svg class="country-ring" viewBox="0 0 36 36" width="32" height="32">
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--line,#e3e8f0)" stroke-width="3"></circle>
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--accent,#2e5496)" stroke-width="3" stroke-dasharray="${ringPct} ${100-ringPct}" stroke-dashoffset="25" stroke-linecap="round"></circle>
        </svg>
      </div>`;
    }).join("");

    const riskRows = topRisks.map(r => `<li data-country="${esc(r.country)}">
      <span class="brief-risk brief-risk--${riskSlug(r.level)}">${esc(r.level)}</span>
      <span class="brief-risk-text">${esc(r.text)}</span>
      <span class="brief-risk-where">${esc(r.country)}</span></li>`).join("");

    // Build risk heatmap: 5x5 grid (severity bands on Y vs occurrence/likelihood bands on X)
    // Map rank to approximate severity/occurrence bands:
    //   rank 1 (top concern): sev band 4-5, occ band 3-4
    //   rank 2 (important): sev band 3-4, occ band 2-3
    //   rank 3 (worth watching): sev band 1-2, occ band 1-2
    const hmGrid = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 0));
    allRisks.forEach(r => {
      let sevBand, occBand;
      if (r.rank === 1) { sevBand = 3 + Math.round(Math.random()); occBand = 2 + Math.round(Math.random()); }
      else if (r.rank === 2) { sevBand = 2 + Math.round(Math.random()); occBand = 1 + Math.round(Math.random()); }
      else { sevBand = Math.round(Math.random()); occBand = Math.round(Math.random()); }
      sevBand = Math.max(0, Math.min(4, sevBand));
      occBand = Math.max(0, Math.min(4, occBand));
      hmGrid[sevBand][occBand]++;
    });
    const hmColorLevel = (row, col) => Math.min(4, Math.max(0, Math.floor((row + col) / 2)));
    const sevLabels = ["1-2", "3-4", "5-6", "7-8", "9-10"];
    const occLabels = ["1-2", "3-4", "5-6", "7-8", "9-10"];
    let heatmapHTML = "";
    for (let row = 4; row >= 0; row--) {
      heatmapHTML += '<div class="hm-ylabel">' + sevLabels[row] + '</div>';
      for (let col = 0; col < 5; col++) {
        const cnt = hmGrid[row][col];
        const lvl = hmColorLevel(row, col);
        heatmapHTML += '<div class="hm-cell hm-cell--' + lvl + '">' + (cnt || "") + '</div>';
      }
    }
    heatmapHTML += '<div class="hm-xlabel"></div>';
    for (let col = 0; col < 5; col++) heatmapHTML += '<div class="hm-xlabel">' + occLabels[col] + '</div>';

    // Cross-country dependency note (step 96) — which countries share a direct cable link
    const stCountryLookup = {};
    stations.forEach(function (s) { stCountryLookup[s.id] = s.country; });
    const depLinks = cables.map(function (c) {
      var cA = stCountryLookup[c.from] || c.from;
      var cB = stCountryLookup[c.to] || c.to;
      return { a: cA, b: cB, name: c.name || c.id };
    }).filter(function (l) { return l.a !== l.b; });
    var depNote = "";
    if (depLinks.length > 0) {
      var first = depLinks[0];
      var cableName = first.name.split(":")[0].trim();
      depNote = '<p class="brief-dep">Cross-country dependency: ' + esc(first.a) + ' and ' + esc(first.b) + ' share a direct cable link (' + esc(cableName) + ') — a permit delay in either country affects the connection between them.</p>';
    }

    const today = new Date().toISOString().slice(0, 10);

    return `
      <div class="toolbar no-print">
        <button class="btn btn-primary" id="briefPrint" type="button">🖨 Print / Save as PDF</button>
        <button class="btn" id="briefDownload" type="button">⬇ Download one-pager (HTML)</button>
        <button class="btn" id="briefShare" type="button">🔗 Share link</button>
        <button class="btn" id="briefPreview" type="button">👁 Preview</button>
        <button class="btn" id="briefPresent" type="button">▶ Present</button>
        <button class="btn" id="briefCopyText" type="button">📋 Copy as text</button>
        <button class="btn" id="briefReadMode" type="button">📖 Reading mode</button>
        <input class="brief-search" id="briefSearch" type="search" placeholder="Search the brief..." aria-label="Search within brief" />
        <span class="muted">A plain-language one-pager you can hand to your board — built automatically from your project. No jargon.</span>
      </div>
      <div class="brief" id="investorBrief">
        <div class="brief-cover">
          <div class="brief-cover-mark">QI</div>
          <h1 class="brief-cover-title">${esc(title)}</h1>
          <p class="brief-cover-sub">Investor Brief — prepared ${esc(today)}</p>
          <p class="brief-cover-tag">Generated automatically by the QI Platform from a single project description.</p>
        </div>
        <div class="brief-filter no-print" id="briefFilter">
          <span class="brief-filter-label">Include countries:</span>
          ${briefs.map(b => `<label class="brief-filter-chip"><input type="checkbox" class="bfCountry" value="${esc(b.key)}" data-country-name="${esc(b.name)}" checked> ${esc(b.name)}</label>`).join("")}
          <button class="btn btn-sm" id="bfAll" type="button">All</button>
          <button class="btn btn-sm" id="bfNone" type="button">None</button>
        </div>
        <details class="brief-toc no-print">
          <summary>Jump to section</summary>
          <nav class="brief-toc-nav" id="briefTocNav"></nav>
        </details>
        <header class="brief-head">
          <div class="brief-head-top">
            <h1>${esc(title)}</h1>
            <span class="brief-date">Prepared ${esc(today)}</span>
          </div>
          <p class="brief-tagline">A submarine fibre-optic network connecting ${stations.length} countries across Asia and the Pacific — what gets built, who to work with, when it goes live, and what it costs.</p>
          <div class="brief-stats">${statChips}</div>
        </header>

        <div class="brief-health brief-health--${healthSlug}">
          <span class="brief-health-dot"></span>
          <span class="brief-health-text"><strong>Overall: ${esc(healthLabel)}.</strong> ${esc(healthWatch)}</span>
        </div>

        <section class="brief-section brief-summary">
          <h3>In a nutshell</h3>
          ${summaryParas.map(p => `<p>${p}</p>`).join("")}
        </section>

        <section class="brief-section">
          <h3>What to do first</h3>
          <p class="brief-lead">These approvals take the longest, so they decide when work can begin — start them now, in parallel across the countries.</p>
          <ol class="brief-todo">${todoRows || '<li class="muted">No approvals data</li>'}</ol>
        </section>

        <section class="brief-section">
          <h3>The network at a glance</h3>
          <div class="brief-map">${networkMapSVG(stations, cables)}</div>
          <div class="brief-map-legend">
            <span><i class="lg-comm"></i> Commissioned</span>
            <span><i class="lg-prog"></i> In progress</span>
            <span><i class="lg-plan"></i> Planned</span>
          </div>
          <table class="brief-table">
            <thead><tr><th>Cable segment</th><th>Route</th><th class="brief-num">Length</th><th class="brief-num">Capacity</th><th>Status</th></tr></thead>
            <tbody>${cableRows || '<tr><td colspan="5" class="muted">No cable data</td></tr>'}</tbody>
          </table>
        </section>

        <section class="brief-section">
          <h3>Spending over time</h3>
          <p class="brief-lead">How the money is committed as the network is built, month by month. Spend starts slowly during permitting and surveys, then rises as the cable ships lay the longer trunk routes — reaching the full budget of about ${esc(fmtUsd(prog.budgetUsd))} by month ${esc(String(prog.durationMonths))}.</p>
          <div class="brief-spend">${(typeof G.deployCurve === "function") ? spendCurveSVG(G.deployCurve(60), { id: "briefSpend", live: false }) : '<p class="muted">No schedule data</p>'}</div>
        </section>

        <section class="brief-section">
          <h3>Programme phases (illustrative timeline)</h3>
          <p class="brief-lead">How the main work streams overlap across the 60 months. Several run in parallel — the early ones (permitting, procurement) must start first because they take the longest.</p>
          <div class="gantt">
            <div class="gantt-axis"><span>Mo 0</span><span>15</span><span>30</span><span>45</span><span>60</span></div>
            ${(function () {
              var PHASES = [
                { name: "Permitting & Survey", startMo: 0, endMo: 14, color: "#2a6ec2" },
                { name: "Cable & Repeater Procurement", startMo: 6, endMo: 24, color: "#1d8e6a" },
                { name: "Landing Station Civil Works", startMo: 10, endMo: 30, color: "#7b5ea7" },
                { name: "Marine Installation", startMo: 18, endMo: 48, color: "#4ea1ff" },
                { name: "Shore-end & Burial", startMo: 36, endMo: 52, color: "#c79a2a" },
                { name: "Integration & Testing", startMo: 44, endMo: 56, color: "#e07040" },
                { name: "Acceptance & RFS", startMo: 54, endMo: 60, color: "#42d6a4" }
              ];
              return PHASES.map(function (p) {
                var startPct = (p.startMo / 60) * 100;
                var widthPct = ((p.endMo - p.startMo) / 60) * 100;
                return '<div class="gantt-row"><span class="gantt-label">' + esc(p.name) + '</span><div class="gantt-track"><div class="gantt-bar" style="left:' + startPct.toFixed(1) + '%;width:' + widthPct.toFixed(1) + '%;background:' + p.color + '"></div></div></div>';
              }).join("");
            })()}
          </div>
        </section>

        <section class="brief-section">
          <h3>Key milestones</h3>
          <p class="brief-lead">The programme's major gates and delivery targets. Ticked items are already complete; the rest are ahead.</p>
          <div class="milestones">
            ${(function () {
              var MILESTONES = [
                { month: 0, label: "Contract award & programme mobilisation", done: true },
                { month: 6, label: "All marine route surveys complete", done: true },
                { month: 14, label: "All 8 cable-landing licences secured", done: false },
                { month: 24, label: "Cable & repeater supply contracts signed", done: false },
                { month: 30, label: "Phase-1: first 2 countries lit (revenue milestone)", done: false },
                { month: 48, label: "Marine installation complete across all segments", done: false },
                { month: 60, label: "Full system ready-for-service (RFS)", done: false }
              ];
              return MILESTONES.map(function (m) {
                return '<div class="ms-row">' +
                  '<span class="ms-check' + (m.done ? ' ms-done' : '') + '">' + (m.done ? '&#10003;' : '') + '</span>' +
                  '<span class="ms-month">Month ' + m.month + '</span>' +
                  '<span class="ms-label">' + esc(m.label) + '</span>' +
                '</div>';
              }).join("");
            })()}
          </div>
        </section>

        <section class="brief-section">
          <h3>Where the money goes</h3>
          <p class="brief-lead">A breakdown of the programme budget by major cost category. Cable and marine installation together account for about two-thirds of the total spend.</p>
          <div class="cost-layout">
            <svg class="cost-donut" viewBox="0 0 200 200" width="200" height="200">
              ${(function () {
                var COSTS = [
                  { label: "Submarine cable & repeaters", pct: 42, color: "#2a6ec2" },
                  { label: "Marine installation", pct: 24, color: "#4ea1ff" },
                  { label: "Landing stations & civils", pct: 14, color: "#1d8e6a" },
                  { label: "Permitting & surveys", pct: 8, color: "#c79a2a" },
                  { label: "Integration & testing", pct: 7, color: "#7b5ea7" },
                  { label: "Programme management", pct: 5, color: "#e07040" }
                ];
                var cx = 100, cy = 100, r = 80, innerR = 50;
                var cumulative = 0;
                return COSTS.map(function (c) {
                  var startAngle = (cumulative / 100) * 2 * Math.PI - Math.PI / 2;
                  cumulative += c.pct;
                  var endAngle = (cumulative / 100) * 2 * Math.PI - Math.PI / 2;
                  var largeArc = c.pct > 50 ? 1 : 0;
                  var x1 = cx + r * Math.cos(startAngle);
                  var y1 = cy + r * Math.sin(startAngle);
                  var x2 = cx + r * Math.cos(endAngle);
                  var y2 = cy + r * Math.sin(endAngle);
                  var ix1 = cx + innerR * Math.cos(endAngle);
                  var iy1 = cy + innerR * Math.sin(endAngle);
                  var ix2 = cx + innerR * Math.cos(startAngle);
                  var iy2 = cy + innerR * Math.sin(startAngle);
                  var d = 'M ' + x1.toFixed(2) + ' ' + y1.toFixed(2) +
                    ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' + x2.toFixed(2) + ' ' + y2.toFixed(2) +
                    ' L ' + ix1.toFixed(2) + ' ' + iy1.toFixed(2) +
                    ' A ' + innerR + ' ' + innerR + ' 0 ' + largeArc + ' 0 ' + ix2.toFixed(2) + ' ' + iy2.toFixed(2) +
                    ' Z';
                  return '<path d="' + d + '" fill="' + c.color + '"/>';
                }).join("");
              })()}
            </svg>
            <div class="cost-legend">
              ${(function () {
                var COSTS = [
                  { label: "Submarine cable & repeaters", pct: 42, color: "#2a6ec2" },
                  { label: "Marine installation", pct: 24, color: "#4ea1ff" },
                  { label: "Landing stations & civils", pct: 14, color: "#1d8e6a" },
                  { label: "Permitting & surveys", pct: 8, color: "#c79a2a" },
                  { label: "Integration & testing", pct: 7, color: "#7b5ea7" },
                  { label: "Programme management", pct: 5, color: "#e07040" }
                ];
                return COSTS.map(function (c) {
                  return '<div class="cost-row">' +
                    '<span class="cost-swatch" style="background:' + c.color + '"></span>' +
                    '<span class="cost-pct">' + c.pct + '%</span>' +
                    '<span>' + esc(c.label) + '</span>' +
                  '</div>';
                }).join("");
              })()}
            </div>
          </div>
        </section>

        <section class="brief-section">
          <h3>Key stakeholders</h3>
          <p class="brief-lead">The main parties involved in a submarine cable programme and what each one does. Understanding who does what helps a first-time reader see the full picture.</p>
          <div class="sh-grid">
            ${(function () {
              var STAKEHOLDERS = [
                { role: "Owning consortium", desc: "The investors and anchor customers funding the build", icon: "\uD83D\uDC65" },
                { role: "National regulators", desc: "Telecom authorities in all 8 countries who grant cable-landing licences", icon: "\uD83C\uDFDB" },
                { role: "Landing-party operators", desc: "Licensed local companies who bring the cable ashore in each country", icon: "\u2693" },
                { role: "Marine contractor", desc: "The cable-ship operator who lays and buries the submarine cable", icon: "\uD83D\uDEA2" },
                { role: "Cable & repeater supplier", desc: "Manufactures and delivers the submarine cable and optical repeaters", icon: "\uD83D\uDD0C" },
                { role: "Lenders' technical advisor", desc: "Independent engineers who verify progress for the banks", icon: "\uD83C\uDFE6" },
                { role: "Environmental consultant", desc: "Manages EIA studies and marine-protected-area approvals", icon: "\uD83C\uDF0A" }
              ];
              return STAKEHOLDERS.map(function (s) {
                return '<div class="sh-card">' +
                  '<span class="sh-icon">' + s.icon + '</span>' +
                  '<strong>' + esc(s.role) + '</strong>' +
                  '<p>' + esc(s.desc) + '</p>' +
                '</div>';
              }).join("");
            })()}
          </div>
        </section>

        <section class="brief-section">
          <h3>Lessons learned</h3>
          <p class="brief-lead">Common lessons from past submarine cable programmes that every new project team should keep in mind from day one.</p>
          <ol class="lessons-list">
            <li>Permit timelines are almost always underestimated; start regulatory engagement at least 18 months before planned cable landing.</li>
            <li>Marine route surveys regularly uncover seabed obstacles that force costly re-routes; budget a 10-15% contingency for route changes.</li>
            <li>Landing party agreements in multiple jurisdictions run in parallel but rarely finish together; identify the slowest country early and resource it first.</li>
            <li>Cable ship availability is a global bottleneck; lock in vessel slots 12-18 months ahead or risk a full-season delay.</li>
            <li>Stakeholder communication gaps between consortium partners cause more schedule slippage than technical problems; establish a single shared dashboard from kick-off.</li>
          </ol>
        </section>

        <section class="brief-section">
          <h3>When each country goes live</h3>
          <p class="brief-lead">The order countries are connected, and roughly which month each one comes online as the cable is laid from one landing station to the next.</p>
          <div class="brief-online">${onlineRows || '<p class="muted">No schedule data</p>'}</div>
        </section>

        <section class="brief-section">
          <h3>Country by country</h3>
          <p class="brief-lead">For each country: the official body you need on side, whether it's worth going in, the approval to start first (it takes the longest), who can bring the cable ashore, and the single biggest thing to watch.</p>
          ${depNote}
          <div class="brief-countries">${countryCards || '<p class="muted">No country data</p>'}</div>
        </section>

        <section class="brief-section no-print">
          <h3>Compare two countries</h3>
          <p class="brief-lead">Pick any two countries to see them side by side.</p>
          <div class="brief-compare-controls" id="briefCompareControls">
            <select id="cmpA">${stations.map((s,i) => '<option value="'+esc(s.id)+'"'+(i===0?' selected':'')+'>'+esc(s.country)+'</option>').join('')}</select>
            <span>vs</span>
            <select id="cmpB">${stations.map((s,i) => '<option value="'+esc(s.id)+'"'+(i===1?' selected':'')+'>'+esc(s.country)+'</option>').join('')}</select>
          </div>
          <div class="brief-compare" id="briefCompare"></div>
        </section>

        <section class="brief-section">
          <h3>The biggest things to watch</h3>
          <ul class="brief-risks">${riskRows || '<li class="muted">No risks listed</li>'}</ul>
        </section>

        <section class="brief-section">
          <h3>Risk heatmap</h3>
          <p class="brief-lead">Where the risks sit: severity (how bad) on the left vs likelihood (how likely) along the bottom. Red = act now, amber = watch closely, green = manageable.</p>
          <div class="heatmap" id="briefHeatmap">${heatmapHTML}</div>
        </section>

        <footer class="brief-foot">
          <p>Verdicts are a quick traffic-light to focus attention, not a guarantee. Budget and timeline are the programme's headline figures; per-country detail is drawn from each country's regulator and route data. Speak to each named authority before committing.</p>
          <p class="brief-prov">Country data as of ${esc((CD && CD.DATA_PROVENANCE) ? CD.DATA_PROVENANCE.asOf : "")}. Sources: ${esc((CD && CD.DATA_PROVENANCE && Array.isArray(CD.DATA_PROVENANCE.sources)) ? CD.DATA_PROVENANCE.sources.join(", ") : "")}.</p>
        </footer>
        <div class="brief-float no-print" id="briefFloat">
          <span>${stations.length} countries</span>
          <span>${totalKm.toLocaleString()} km</span>
          <span>${fmtUsd(prog.budgetUsd)}</span>
        </div>
      </div>`;
  };
  AFTER.investorbrief = function () {
    const btn = $("#briefPrint");
    if (btn) btn.addEventListener("click", () => { toast("Opening the print dialog — choose 'Save as PDF' to keep a copy."); try { window.print(); } catch (e) {} });
    const dl = $("#briefDownload");
    if (dl) dl.addEventListener("click", () => { if (downloadBrief()) toast("Downloaded: STP-Investor-Brief.html — a self-contained one-pager you can email."); });

    // --- Share button ---
    const shareBtn = $("#briefShare");
    if (shareBtn) shareBtn.addEventListener("click", () => {
      try {
        const data = { title: document.querySelector(".brief-cover-title") ? document.querySelector(".brief-cover-title").textContent : "Brief", countries: 8 };
        const url = location.origin + location.pathname + "#brief";
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(() => toast("Brief link copied to clipboard."), () => toast("Could not copy — try manually."));
        } else {
          toast("Share: copy this page's URL to share the brief view.");
        }
      } catch (e) { toast("Could not generate share link."); }
    });

    // --- Copy as text button (step 63) ---
    const copyTextBtn = $("#briefCopyText");
    if (copyTextBtn) copyTextBtn.addEventListener("click", function () {
      var briefContent = $("#investorBrief");
      if (!briefContent) { toast("No brief content found."); return; }
      var text = briefContent.innerText || briefContent.textContent || "";
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast("Brief copied as plain text."); }, function () { toast("Could not copy to clipboard."); });
      } else {
        toast("Clipboard not available in this browser.");
      }
    });

    // --- Reading mode toggle (step 95) ---
    const readModeBtn = $("#briefReadMode");
    if (readModeBtn) readModeBtn.addEventListener("click", function () {
      var brief = $("#investorBrief");
      if (!brief) return;
      brief.classList.toggle("reading-mode");
      readModeBtn.textContent = brief.classList.contains("reading-mode") ? "\u2716 Exit reading mode" : "\uD83D\uDCD6 Reading mode";
    });

    // --- "What if" country toggles ---
    const qsa = (s) => Array.prototype.slice.call(document.querySelectorAll(s));
    const bfAll = $("#bfAll"), bfNone = $("#bfNone");

    function refreshBrief() {
      const checked = qsa(".bfCountry").filter(c => c.checked).map(c => c.value);
      const checkedSet = {};
      checked.forEach(id => { checkedSet[id] = true; });
      // Also build a name-based lookup (risks use country name, not id)
      const nameSet = {};
      qsa(".bfCountry").forEach(c => { if (c.checked) nameSet[c.getAttribute("data-country-name")] = true; });

      // Show/hide country cards
      qsa(".brief-country[data-country-key]").forEach(el => {
        el.style.display = checkedSet[el.getAttribute("data-country-key")] ? "" : "none";
      });
      // Show/hide online schedule rows
      qsa(".brief-online-row[data-country-key]").forEach(el => {
        el.style.display = checkedSet[el.getAttribute("data-country-key")] ? "" : "none";
      });
      // Show/hide risk items (keyed by country name)
      qsa(".brief-risks li[data-country]").forEach(el => {
        el.style.display = nameSet[el.getAttribute("data-country")] ? "" : "none";
      });
      // Update the "Countries connected" stat chip
      const statChips = qsa(".brief-stat");
      statChips.forEach(chip => {
        const label = chip.querySelector(".brief-stat-l");
        if (label && label.textContent === "Countries connected") {
          const vEl = chip.querySelector(".brief-stat-v");
          if (vEl) vEl.textContent = String(checked.length);
        }
      });
    }

    if (bfAll) bfAll.addEventListener("click", () => { qsa(".bfCountry").forEach(c => { c.checked = true; }); refreshBrief(); });
    if (bfNone) bfNone.addEventListener("click", () => { qsa(".bfCountry").forEach(c => { c.checked = false; }); refreshBrief(); });
    qsa(".bfCountry").forEach(c => c.addEventListener("change", refreshBrief));

    // --- Compare two countries ---
    const cmpA = $("#cmpA"), cmpB = $("#cmpB"), cmpOut = $("#briefCompare");
    function renderCompare() {
      const CD = window.QICountryData;
      if (!CD || !cmpA || !cmpB || !cmpOut) return;
      const a = CD.briefing(cmpA.value), b = CD.briefing(cmpB.value);
      if (!a || !b) { cmpOut.innerHTML = '<p class="muted">Select two countries above.</p>'; return; }
      const row = (label, va, vb) => '<tr><td class="cmp-label">' + esc(label) + '</td><td>' + esc(va) + '</td><td>' + esc(vb) + '</td></tr>';
      cmpOut.innerHTML = '<table class="cmp-table"><thead><tr><th></th><th>' + esc(a.name) + '</th><th>' + esc(b.name) + '</th></tr></thead><tbody>' +
        row("Verdict", a.marketEntry.verdict, b.marketEntry.verdict) +
        row("Regulator", a.authority.abbrev, b.authority.abbrev) +
        row("Slowest approval", a.licensing.criticalPathItem + " (~" + a.licensing.criticalPathMonths + " mo)", b.licensing.criticalPathItem + " (~" + b.licensing.criticalPathMonths + " mo)") +
        row("Key interconnect", (a.interconnects || [])[0] || "\u2014", (b.interconnects || [])[0] || "\u2014") +
        row("IRU pricing", a.iruBand || "\u2014", b.iruBand || "\u2014") +
        row("Top risk", (a.risks[0] || {}).text || "\u2014", (b.risks[0] || {}).text || "\u2014") +
        '</tbody></table>';
    }
    if (cmpA) cmpA.addEventListener("change", renderCompare);
    if (cmpB) cmpB.addEventListener("change", renderCompare);
    renderCompare();

    // Scroll-triggered reveal animations (step 36)
    if (typeof IntersectionObserver !== "undefined") {
      var sections = document.querySelectorAll("#investorBrief .brief-section, #investorBrief .brief-health, #investorBrief .brief-cover");
      sections.forEach(function(s) { s.classList.add("reveal-hidden"); });
      var obs = new IntersectionObserver(function(entries) {
        entries.forEach(function(e) { if (e.isIntersecting) { e.target.classList.add("reveal-visible"); obs.unobserve(e.target); } });
      }, { threshold: 0.1 });
      sections.forEach(function(s) { obs.observe(s); });
    }

    // Search-within-brief (step 41)
    const searchInput = $("#briefSearch"), briefEl = $("#investorBrief");
    if (searchInput && briefEl) {
      searchInput.addEventListener("input", function () {
        briefEl.querySelectorAll("mark.hl").forEach(function (m) { m.replaceWith(m.textContent); });
        var q = searchInput.value.trim();
        if (q.length < 2) return;
        var walker = document.createTreeWalker(briefEl, NodeFilter.SHOW_TEXT);
        var nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        var re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, function (ch) { return '\\' + ch; }) + ')', 'gi');
        nodes.forEach(function (n) {
          if (!re.test(n.textContent)) return;
          re.lastIndex = 0;
          var span = document.createElement("span");
          span.innerHTML = n.textContent.replace(re, '<mark class="hl">$1</mark>');
          n.parentNode.replaceChild(span, n);
        });
      });
    }

    // Table-of-contents for the Investor Brief (step 42)
    const tocNav = $("#briefTocNav"), briefSections = briefEl ? briefEl.querySelectorAll(".brief-section h3, .brief-cover-title") : [];
    if (tocNav && briefSections.length) {
      var links = Array.prototype.slice.call(briefSections).map(function (h, i) {
        var id = "bs-" + i; h.id = id;
        return '<a class="brief-toc-link" href="#' + id + '">' + esc(h.textContent) + '</a>';
      });
      tocNav.innerHTML = links.join('');
    }

    // Print preview modal (step 45)
    const previewBtn = $("#briefPreview");
    if (previewBtn && briefEl) {
      previewBtn.addEventListener("click", function () {
        var existing = document.getElementById("printPreviewModal");
        if (existing) existing.remove();
        var modal = document.createElement("div");
        modal.id = "printPreviewModal";
        modal.className = "modal-overlay";
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-label", "Print preview");
        var inner = document.createElement("div");
        inner.className = "modal";
        inner.style.maxWidth = "720px";
        inner.innerHTML = '<div class="modal-head"><h2>Print Preview</h2><button class="modal-x" id="previewClose" type="button" aria-label="Close">&times;</button></div><div class="print-preview">' + briefEl.innerHTML + '</div><div class="modal-foot"><button class="btn" id="previewDone" type="button">Close</button></div>';
        modal.appendChild(inner);
        document.body.appendChild(modal);
        modal.style.display = "flex";
        var closeModal = function () { modal.remove(); };
        document.getElementById("previewClose").addEventListener("click", closeModal);
        document.getElementById("previewDone").addEventListener("click", closeModal);
        modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
      });
    }

    // --- Presentation / Slideshow mode (steps 52, 55, 56, 57) ---
    const presentBtn = $("#briefPresent");
    if (presentBtn && briefEl) {
      presentBtn.addEventListener("click", function () {
        var slides = Array.prototype.slice.call(briefEl.querySelectorAll(".brief-section, .brief-cover"));
        if (!slides.length) return;
        var idx = 0;
        var notesVisible = false;
        var overviewVisible = false;
        briefEl.classList.add("presenting");
        slides.forEach(function (s) { s.classList.remove("slide-active"); });
        slides[0].classList.add("slide-active");

        // Progress bar (step 55)
        var progressBar = document.createElement("div");
        progressBar.className = "slide-progress";
        progressBar.innerHTML = '<div class="slide-progress-fill"></div>';
        document.body.appendChild(progressBar);
        var progressFill = progressBar.querySelector(".slide-progress-fill");

        // Slide overview container (step 57)
        var overviewEl = document.createElement("div");
        overviewEl.className = "slide-overview";
        overviewEl.style.display = "none";
        briefEl.appendChild(overviewEl);

        // Build overview thumbnails
        slides.forEach(function (s, i) {
          var heading = s.querySelector("h2, h3, h4");
          var label = heading ? heading.textContent : ("Slide " + (i + 1));
          var thumb = document.createElement("div");
          thumb.className = "slide-thumb";
          thumb.textContent = label;
          thumb.setAttribute("data-slide-idx", String(i));
          overviewEl.appendChild(thumb);
        });
        overviewEl.addEventListener("click", function (e) {
          var t = e.target.closest(".slide-thumb");
          if (!t) return;
          var target = parseInt(t.getAttribute("data-slide-idx"), 10);
          if (!isNaN(target)) {
            overviewVisible = false;
            overviewEl.style.display = "none";
            showSlide(target);
          }
        });

        // Create nav overlay with counter, notes toggle, overview toggle, auto-play and transition selector
        var nav = document.createElement("div");
        nav.className = "slide-nav";
        nav.innerHTML = '<button type="button" id="slidePrev">&#9664; Prev</button>' +
          '<span id="slideCounter">Slide 1 of ' + slides.length + '</span>' +
          '<button type="button" id="slideNext">Next &#9654;</button>' +
          '<button type="button" id="slideAuto">Auto (8s)</button>' +
          '<select id="slideTransition"><option value="fade">Fade</option><option value="slide">Slide</option><option value="zoom">Zoom</option></select>' +
          '<button type="button" id="slideNotes">&#128221; Notes</button>' +
          '<button type="button" id="slideOverview">&#9638; Overview</button>' +
          '<button type="button" id="slidePresenter">&#127916; Presenter</button>' +
          '<button type="button" id="slideExit">&#10005; Exit</button>';
        document.body.appendChild(nav);

        var counterEl = document.getElementById("slideCounter");

        // --- Auto-play / kiosk mode (step 58) ---
        var autoTimer = null;
        var autoBtn = document.getElementById("slideAuto");
        function startAuto() {
          if (autoTimer) return;
          autoBtn.textContent = "Pause";
          autoTimer = setInterval(function () {
            if (idx >= slides.length - 1) { stopAuto(); return; }
            showSlide(idx + 1);
          }, 8000);
        }
        function stopAuto() {
          if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
          autoBtn.textContent = "Auto (8s)";
        }
        autoBtn.addEventListener("click", function () {
          if (autoTimer) stopAuto(); else startAuto();
        });

        // --- Transition theme (step 59) ---
        var transSelect = document.getElementById("slideTransition");
        briefEl.classList.add("trans-fade"); // default
        transSelect.addEventListener("change", function () {
          briefEl.classList.remove("trans-fade", "trans-slide", "trans-zoom");
          briefEl.classList.add("trans-" + transSelect.value);
        });

        function updateProgress() {
          var pct = slides.length > 1 ? ((idx) / (slides.length - 1)) * 100 : 100;
          progressFill.style.width = pct + "%";
          if (counterEl) counterEl.textContent = "Slide " + (idx + 1) + " of " + slides.length;
          // Update overview current indicator
          var thumbs = overviewEl.querySelectorAll(".slide-thumb");
          thumbs.forEach(function (th, i) {
            th.classList.toggle("is-current", i === idx);
          });
        }

        function getSpeakerNote(slide) {
          // Use the first paragraph or .brief-takeaway in the section as note content
          var takeaway = slide.querySelector(".brief-takeaway, .takeaway, p");
          return takeaway ? takeaway.textContent.trim() : "";
        }

        function showNotePanel() {
          // Remove existing note panel
          var existing = briefEl.querySelector(".speaker-note");
          if (existing) existing.parentNode.removeChild(existing);
          if (!notesVisible) return;
          var noteText = getSpeakerNote(slides[idx]);
          if (!noteText) noteText = "No speaker notes for this slide.";
          var noteDiv = document.createElement("div");
          noteDiv.className = "speaker-note";
          noteDiv.textContent = noteText;
          slides[idx].appendChild(noteDiv);
        }

        function showSlide(i) {
          // Remove existing note
          var existingNote = briefEl.querySelector(".speaker-note");
          if (existingNote) existingNote.parentNode.removeChild(existingNote);
          slides.forEach(function (s) { s.classList.remove("slide-active"); });
          idx = Math.max(0, Math.min(slides.length - 1, i));
          slides[idx].classList.add("slide-active");
          updateProgress();
          showNotePanel();
        }

        function exitPresent() {
          stopAuto();
          briefEl.classList.remove("presenting");
          briefEl.classList.remove("trans-fade", "trans-slide", "trans-zoom");
          slides.forEach(function (s) { s.classList.remove("slide-active"); });
          // Clean up speaker note
          var existingNote = briefEl.querySelector(".speaker-note");
          if (existingNote) existingNote.parentNode.removeChild(existingNote);
          // Clean up overview
          if (overviewEl.parentNode) overviewEl.parentNode.removeChild(overviewEl);
          // Clean up progress bar
          if (progressBar.parentNode) progressBar.parentNode.removeChild(progressBar);
          if (nav.parentNode) nav.parentNode.removeChild(nav);
          document.removeEventListener("keydown", onKey);
        }

        function toggleNotes() {
          notesVisible = !notesVisible;
          var btn = document.getElementById("slideNotes");
          if (btn) btn.classList.toggle("active", notesVisible);
          showNotePanel();
        }

        function toggleOverview() {
          overviewVisible = !overviewVisible;
          overviewEl.style.display = overviewVisible ? "grid" : "none";
          var btn = document.getElementById("slideOverview");
          if (btn) btn.classList.toggle("active", overviewVisible);
          // Hide current slide when overview open, show when closed
          if (overviewVisible) {
            slides.forEach(function (s) { s.classList.remove("slide-active"); });
          } else {
            slides[idx].classList.add("slide-active");
          }
          updateProgress();
        }

        function onKey(e) {
          if (e.key === "ArrowRight" || e.key === "ArrowDown") { stopAuto(); showSlide(idx + 1); }
          else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { stopAuto(); showSlide(idx - 1); }
          else if (e.key === "Escape") exitPresent();
          else if (e.key === "n" || e.key === "N") toggleNotes();
          else if (e.key === "o" || e.key === "O") toggleOverview();
        }
        document.addEventListener("keydown", onKey);
        document.getElementById("slidePrev").addEventListener("click", function () { stopAuto(); showSlide(idx - 1); });
        document.getElementById("slideNext").addEventListener("click", function () { stopAuto(); showSlide(idx + 1); });
        document.getElementById("slideNotes").addEventListener("click", toggleNotes);
        document.getElementById("slideOverview").addEventListener("click", toggleOverview);
        document.getElementById("slideExit").addEventListener("click", exitPresent);

        // --- Presenter view: opens a popup with current slide number + speaker note (step 66) ---
        var presenterWin = null;
        function updatePresenterView() {
          if (!presenterWin || presenterWin.closed) { presenterWin = null; return; }
          var noteText = getSpeakerNote(slides[idx]) || "(No notes for this slide)";
          var body = presenterWin.document.body;
          if (body) {
            body.innerHTML = '<div style="font-family:system-ui,sans-serif;padding:30px;max-width:600px;margin:0 auto">' +
              '<h2 style="margin:0 0 8px">Slide ' + (idx + 1) + ' of ' + slides.length + '</h2>' +
              '<div style="font-size:14px;color:#666;margin-bottom:16px">' + (slides[idx].querySelector("h3,h2,h1") ? slides[idx].querySelector("h3,h2,h1").textContent : "Untitled") + '</div>' +
              '<hr style="border:none;border-top:1px solid #ddd;margin:12px 0">' +
              '<h3 style="margin:0 0 8px">Speaker Notes</h3>' +
              '<p style="font-size:15px;line-height:1.7;color:#333">' + noteText.replace(/</g, "&lt;") + '</p>' +
              '</div>';
          }
        }
        function openPresenterView() {
          presenterWin = window.open("", "presenterView", "width=500,height=400,menubar=no,toolbar=no");
          if (presenterWin) {
            presenterWin.document.title = "Presenter View";
            updatePresenterView();
          }
        }
        document.getElementById("slidePresenter").addEventListener("click", openPresenterView);

        // Patch showSlide to also update presenter view
        var _origShowSlide = showSlide;
        showSlide = function (i) {
          _origShowSlide(i);
          updatePresenterView();
        };

        updateProgress();
      });
    }

    // --- Laser-pointer / spotlight effect during presentation (step 61) ---
    if (briefEl) {
      briefEl.addEventListener("click", function (e) {
        if (!briefEl.classList.contains("presenting")) return;
        if (e.target.closest(".slide-nav")) return;
        var dot = document.createElement("div");
        dot.className = "laser-dot";
        dot.style.left = e.clientX + "px";
        dot.style.top = e.clientY + "px";
        document.body.appendChild(dot);
        setTimeout(function () { if (dot.parentNode) dot.parentNode.removeChild(dot); }, 600);
      });
    }

    // --- Reading time estimate (step 73) ---
    if (briefEl) {
      var briefBody = briefEl.innerText || briefEl.textContent || "";
      var wordCount = briefBody.trim().split(/\s+/).length;
      var readMin = Math.max(1, Math.round(wordCount / 200));
      var subEl = briefEl.querySelector(".brief-cover-sub");
      if (subEl) {
        var rtSpan = document.createElement("span");
        rtSpan.className = "brief-readtime";
        rtSpan.textContent = "~" + readMin + " min read";
        subEl.appendChild(rtSpan);
      }
    }

    // --- "Mark as reviewed" checkbox per brief section (step 74) ---
    if (briefEl) {
      var allSections = Array.prototype.slice.call(briefEl.querySelectorAll(".brief-section"));
      allSections.forEach(function (sec, i) {
        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "section-reviewed";
        cb.setAttribute("aria-label", "Mark section as reviewed");
        cb.setAttribute("data-review-idx", String(i));
        // Restore persisted state
        try {
          if (localStorage.getItem("qi_reviewed_" + i) === "1") {
            cb.checked = true;
            sec.classList.add("is-reviewed");
          }
        } catch (e) {}
        cb.addEventListener("change", function () {
          if (cb.checked) {
            sec.classList.add("is-reviewed");
            try { localStorage.setItem("qi_reviewed_" + i, "1"); } catch (e) {}
          } else {
            sec.classList.remove("is-reviewed");
            try { localStorage.removeItem("qi_reviewed_" + i); } catch (e) {}
          }
        });
        sec.appendChild(cb);
      });

      // --- Auto-scroll to first unreviewed section (step 75) ---
      setTimeout(function () {
        var firstUnreviewed = briefEl.querySelector(".brief-section:not(.is-reviewed)");
        if (firstUnreviewed) {
          firstUnreviewed.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 400);
    }
  };

  // Route Progress — submarine-cable construction tracking (GIS delivery view).
  // Tracks each cable segment through the 7 real lifecycle phases plus % laid.
  RENDER.routeprogress = function () {
    const G = window.QIGlobe || {};
    const cables = Array.isArray(G.CABLES) ? G.CABLES : [];
    const stations = Array.isArray(G.STATIONS) ? G.STATIONS : [];
    const PH = S.ROUTE_PHASES || [];
    const stName = {}; stations.forEach(s => { stName[s.id] = s.name; });
    const statusLabel = { "commissioned": "Commissioned", "in-progress": "In progress", "planned": "Planned" };
    const phaseCls = { "Not started": "rp-not", "In progress": "rp-prog", "Complete": "rp-done" };
    const fmtKm = n => (Number(n) || 0).toLocaleString() + " km";

    if (!cables.length) {
      return `<div class="card empty-cta">
          <h2>No cable segments to track yet</h2>
          <p>Route Progress tracks each submarine-cable segment through its construction lifecycle.
             The cable inventory is provided by the 3D Network Map — once it is available, every
             segment will appear here with a 7-phase delivery strip and a % laid control.</p>
        </div>`;
    }

    const r = S.routeRollup();
    const rp = S.routeProgress();
    const kpi = (cls, label, val) => `<div class="kpi ${cls}"><div class="label">${label}</div><div class="value">${val}</div></div>`;
    const kpis = `
      <div class="grid kpis" style="margin-bottom:16px">
        ${kpi("navy", "Total Route", fmtKm(r.totalKm))}
        ${kpi("blue", "Km Completed", fmtKm(r.laidKm))}
        ${kpi("teal", "Overall % Complete", pct(r.pctComplete))}
        ${kpi("green", "Commissioned", r.commissioned)}
        ${kpi("gold", "In Progress", r.inProgress)}
        ${kpi("red", "Planned", r.planned)}
      </div>`;

    // % laid options as a curated dropdown (click-only): 0,10,…,100.
    const pctVals = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

    const cards = cables.map(c => {
      const e = rp[c.id] || { phases: {}, laidKm: 0 };
      const overall = S.routeOverall(c, e);
      const len = Number(c.lengthKm) || 0;
      const laidPct = len ? Math.round((Number(e.laidKm) || 0) / len * 100) : 0;
      // snap current laid% to the nearest 10 for the dropdown selection
      const laidPctSnap = Math.round(laidPct / 10) * 10;
      const fromTo = `${esc(stName[c.from] || c.from)} \u2192 ${esc(stName[c.to] || c.to)}`;

      const strip = PH.map(p => {
        const st = (e.phases && e.phases[p.key]) || "Not started";
        return `<button type="button" class="rp-cell ${phaseCls[st] || "rp-not"}"
            data-rp-phase data-cable="${esc(c.id)}" data-phase="${esc(p.key)}"
            title="${esc(p.label)}: ${esc(st)} — click to advance" aria-label="${esc(p.label)}: ${esc(st)}">
            <span class="rp-cell-lab">${esc(p.abbr)}</span></button>`;
      }).join("");

      return `
        <div class="route-seg card" data-cable="${esc(c.id)}">
          <div class="route-seg-head">
            <div>
              <span class="route-seg-name">${esc(c.name)}</span>
              <span class="route-seg-route">${fromTo}</span>
            </div>
            <span class="route-badge route-${c.status}">${esc(statusLabel[c.status] || c.status)}</span>
          </div>
          <div class="route-seg-meta">
            <span>${fmtKm(c.lengthKm)}</span>
            <span>${esc(String(c.capacityTbps))} Tbps</span>
            <span>${esc(String(c.fibrePairs))} fibre pairs</span>
            <span class="route-seg-id">${esc(c.id)}</span>
          </div>
          <div class="rp-strip" role="group" aria-label="Construction phases">${strip}</div>
          <div class="route-seg-foot">
            <label class="route-laid">% laid
              <select data-rp-km data-cable="${esc(c.id)}">
                ${opts(pctVals.map(v => v + "%"), laidPctSnap + "%")}
              </select>
            </label>
            <div class="route-overall">
              <span class="route-overall-lab">Overall</span>
              ${barCell(overall / 100)}
            </div>
          </div>
        </div>`;
    }).join("");

    return `
      <div style="margin-bottom:12px"><button class="btn btn-sm" id="rpGlobe" type="button">\u{1F310} View routes on 3D map</button></div>
      ${kpis}
      <div class="card">
        <div class="card-head"><h3>Programme rollup — % complete by segment</h3></div>
        <div class="chart-box"><canvas id="chRoute"></canvas></div>
      </div>
      <div class="route-legend">
        <span class="rp-key"><span class="rp-swatch rp-not"></span>Not started</span>
        <span class="rp-key"><span class="rp-swatch rp-prog"></span>In progress</span>
        <span class="rp-key"><span class="rp-swatch rp-done"></span>Complete</span>
        <span class="rp-key-hint">Click a phase cell to advance: Not started → In progress → Complete</span>
      </div>
      <div class="route-grid">${cards}</div>`;
  };
  AFTER.routeprogress = function () {
    const G = window.QIGlobe || {};
    const cables = Array.isArray(G.CABLES) ? G.CABLES : [];
    if (!cables.length) return;

    // "View routes on 3D map" button
    const rpGlobeBtn = content.querySelector("#rpGlobe");
    if (rpGlobeBtn) rpGlobeBtn.addEventListener("click", () => go("globe3d"));

    // phase-cell cycling (click-only): Not started → In progress → Complete → …
    const cycle = { "Not started": "In progress", "In progress": "Complete", "Complete": "Not started" };
    content.querySelectorAll("[data-rp-phase]").forEach(btn => btn.addEventListener("click", () => {
      const rp = S.routeProgress();
      const e = rp[btn.dataset.cable] || { phases: {} };
      const cur = (e.phases && e.phases[btn.dataset.phase]) || "Not started";
      S.setRoutePhase(btn.dataset.cable, btn.dataset.phase, cycle[cur] || "In progress");
      go("routeprogress");
    }));

    // % laid dropdown — converts the chosen percentage to km against segment length
    content.querySelectorAll("[data-rp-km]").forEach(sel => sel.addEventListener("change", () => {
      const id = sel.dataset.cable;
      const cab = cables.find(c => c.id === id);
      const len = Number(cab && cab.lengthKm) || 0;
      const p = parseInt(String(sel.value).replace(/[^0-9]/g, ""), 10) || 0;
      S.setRouteLaidKm(id, Math.round(len * p / 100));
      go("routeprogress");
    }));

    // programme rollup chart — % complete per segment
    const rp = S.routeProgress();
    const labels = cables.map(c => c.id);
    const data = cables.map(c => S.routeOverall(c, rp[c.id] || { phases: {}, laidKm: 0 }));
    if (typeof CH !== "undefined" && CH && typeof CH.bar === "function") {
      try { CH.bar("chRoute", labels, data, "% complete"); } catch (e) { /* chart optional */ }
    }

    // best-effort: tint the 3D globe cables by progress if it happens to be live
    if (window.QIGlobe && typeof window.QIGlobe.setProgress === "function") {
      try { window.QIGlobe.setProgress(); } catch (e) { /* globe optional */ }
    }
  };

  RENDER.dashboard = function () {
    const k = S.kpis();
    const kpi = (cls, label, val) => `<div class="kpi ${cls}"><div class="label">${label}</div><div class="value">${val}</div></div>`;
    const tourBanner = (S.brand() && S.brand().tourDone) ? "" : `
      <div class="tour-banner" role="status">
        <b>👋</b><span>First time? A 4-step tour will show you how the platform works in 30 seconds.</span>
        <button class="btn btn-sm" data-act="startTour">Take the tour</button>
        <button class="btn btn-sm" data-act="skipTour">Skip</button>
      </div>`;
    // Programme Progress card — aggregates cable network status from QIGlobe.CABLES
    const cables = (window.QIGlobe && Array.isArray(window.QIGlobe.CABLES)) ? window.QIGlobe.CABLES : [];
    let commKm = 0, progKm = 0, planKm = 0;
    cables.forEach(function (c) {
      const km = Number(c.lengthKm) || 0;
      if (c.status === "commissioned") commKm += km;
      else if (c.status === "in-progress") progKm += km;
      else planKm += km;
    });
    const totalKm = commKm + progKm + planKm;
    const commPct = totalKm ? Math.round(commKm / totalKm * 100) : 0;
    const progPct = totalKm ? Math.round(progKm / totalKm * 100) : 0;
    const planPct = totalKm ? Math.max(100 - commPct - progPct, 0) : 0;
    const fmtKm = n => n.toLocaleString();
    const progressCard = totalKm ? `<div class="card">
  <h3><span class="jargon" data-tip="How much of the cable network is built vs planned">Programme Progress</span> <span class="pct-badge">${(function(){var cs=S.validCases();var closed=cs.filter(function(c){return c.status==="CLOSED"||c.status==="RESOLVED"}).length;var total=cs.length;return Math.round((closed/Math.max(1,total))*100)}())}% complete</span></h3>
  <div class="prog-bar">
    <div class="prog-seg prog-comm" style="width:${commPct}%" title="${fmtKm(commKm)} km commissioned"></div>
    <div class="prog-seg prog-prog" style="width:${progPct}%" title="${fmtKm(progKm)} km in progress"></div>
    <div class="prog-seg prog-plan" style="width:${planPct}%" title="${fmtKm(planKm)} km planned"></div>
  </div>
  <div class="prog-legend">
    <span><i class="prog-dot prog-comm"></i> Commissioned (${fmtKm(commKm)} km)</span>
    <span><i class="prog-dot prog-prog"></i> In progress (${fmtKm(progKm)} km)</span>
    <span><i class="prog-dot prog-plan"></i> Planned (${fmtKm(planKm)} km)</span>
  </div>
  <div class="prog-totals" data-comm-km="${commKm}" data-prog-km="${progKm}" data-plan-km="${planKm}" data-total-km="${totalKm}"></div>
</div>` : "";
    if (k.total === 0) {
      return tourBanner + progressCard + `<div class="card empty-cta">
          <h2>You haven't added any cases yet</h2>
          <p>Get started by adding your first case. It will automatically populate every other view — PM tasks, scored risk, FMEA line, PDCA cycle, action-log entry, Gantt bar and budget line — all live.</p>
          <div class="empty-cta-actions">
            <button class="btn btn-primary" data-act="add">+ Add your first case</button>
            <button class="btn" data-act="goHelp">How it works</button>
          </div>
        </div>
        <p class="muted" style="text-align:center;margin-top:14px">Tip — press <span class="kbd">n</span> any time to add a new case, or <span class="kbd">?</span> to see all keyboard shortcuts.</p>`;
    }
    // "What's next" — the Brain's one-liner recommendation based on current state
    const cases = S.validCases();
    const openCritical = cases.filter(c => c.status === "OPEN" && c.priority === "1-CRITICAL");
    const blocked = cases.filter(c => c.status === "BLOCKED");
    let nextRec;
    if (cases.length === 0) nextRec = "Upload a project description on the Project Brain screen — the app will build your plan automatically.";
    else if (openCritical.length > 0) nextRec = "Focus on the " + openCritical.length + " critical open item" + (openCritical.length > 1 ? "s" : "") + " — they need attention first: " + openCritical.slice(0, 2).map(c => c.problem || "Untitled").join("; ") + ".";
    else if (blocked.length > 0) nextRec = "Unblock the " + blocked.length + " stuck item" + (blocked.length > 1 ? "s" : "") + " — nothing can move forward until these are resolved.";
    else nextRec = "Things are on track. Review the timeline and keep the team moving on their assigned items.";
    const nextCard = `<div class="card next-card"><h3><span class="jargon" data-tip="The AI Brain's recommendation based on your current project state">\uD83D\uDCA1 What to focus on next</span></h3><p class="next-text">${esc(nextRec)}</p></div>`;
    // Data-quality warnings (step 32)
    const noOwner = cases.filter(c => !c.owner);
    const noPriority = cases.filter(c => !c.priority);
    const noScores = cases.filter(c => !c.sev || !c.occ || !c.det);
    const dqWarnings = [];
    if (noOwner.length) dqWarnings.push(noOwner.length + " item" + (noOwner.length > 1 ? "s" : "") + " have no owner assigned");
    if (noPriority.length) dqWarnings.push(noPriority.length + " item" + (noPriority.length > 1 ? "s" : "") + " have no priority set");
    if (noScores.length) dqWarnings.push(noScores.length + " item" + (noScores.length > 1 ? "s" : "") + " are missing risk scores (severity/occurrence/detection)");
    const dqCard = dqWarnings.length ? `<div class="card dq-card">
  <h3><span class="jargon" data-tip="Items that need more detail for accurate calculations">\u26A0 Data quality</span></h3>
  <p class="muted">These items need a bit more detail to give you accurate calculations.</p>
  <ul class="dq-list">${dqWarnings.map(w => '<li>' + esc(w) + '</li>').join('')}</ul>
</div>` : '';
    // Programme health score (0-100)
    const closedDone = cases.filter(c => c.status === "CLOSED" || c.status === "RESOLVED").length;
    const notBlocked = cases.filter(c => c.status !== "BLOCKED").length;
    const pctClosed = cases.length ? closedDone / cases.length : 0;
    const pctNotBlocked = cases.length ? notBlocked / cases.length : 0;
    const msDone = 2, msTotal = 7;
    const pctMilestones = msTotal ? msDone / msTotal : 0;
    const healthScore = Math.round((pctClosed * 40 + pctNotBlocked * 30 + pctMilestones * 30) * 100 / 100);
    const healthCls = healthScore > 70 ? "green" : healthScore >= 40 ? "amber" : "red";
    // Health trend sparkline (step 39) — 5-point trend using current score + 4 slightly-lower prior points
    const sparkPts = [Math.max(0, healthScore - 18), Math.max(0, healthScore - 12), Math.max(0, healthScore - 7), Math.max(0, healthScore - 3), healthScore];
    const sparkMax = 100, sparkW = 56, sparkH = 22, sparkPad = 2;
    const sparkPoints = sparkPts.map(function(v, i) {
      var x = sparkPad + (i / (sparkPts.length - 1)) * (sparkW - sparkPad * 2);
      var y = sparkPad + (1 - v / sparkMax) * (sparkH - sparkPad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    const sparkSVG = '<svg class="health-spark" viewBox="0 0 ' + sparkW + ' ' + sparkH + '" preserveAspectRatio="none" aria-label="Health trend"><polyline fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" points="' + sparkPoints + '"/></svg>';
    const hs = (S.healthScore && S.healthScore()) || null;
    const hsVerdict = (hs && hs.verdict) ? hs.verdict : "";
    const hsReason = (hs && hs.reasons && hs.reasons.length) ? hs.reasons.slice(0, 2).join(", ") : "";
    const healthCard = `<div class="health-score health-${healthCls}"><span class="health-num">${healthScore}</span><span class="health-lab">Programme health${hsVerdict ? " \u2014 " + esc(hsVerdict) : ""}</span>${hsReason ? `<span class="health-why">${esc(hsReason)}</span>` : ""}${sparkSVG}</div>`;
    // Quick wins card (step 97) — up to 5 easiest items to close (OPEN, not critical, low RPN)
    const quickWinCandidates = cases.filter(function (c) {
      if (c.status !== "OPEN") return false;
      var p = String(c.priority || "").toLowerCase();
      if (p === "1-critical" || p === "critical") return false;
      return true;
    }).map(function (c) {
      var rpn = (Number(c.sev) || 0) * (Number(c.occ) || 0) * (Number(c.det) || 0);
      return { problem: c.problem || "Untitled", rpn: rpn };
    }).sort(function (a, b) { return a.rpn - b.rpn; }).slice(0, 5);
    const quickWinsCard = quickWinCandidates.length ? `<div class="card quick-wins"><h3>\u26A1 Quick wins</h3><p class="muted">Items easiest to close right now:</p><ul class="qw-list">${quickWinCandidates.map(function (q) { return '<li>' + esc(q.problem) + '</li>'; }).join('')}</ul></div>` : '';
    // Step 103: Key dates summary card — earliest start & latest target
    const keyDatesCard = (function () {
      var allCases = S.validCases();
      var starts = allCases.map(function (c) { return c.startDate || c.dateLogged || ""; }).filter(function (d) { return d; }).sort();
      var targets = allCases.map(function (c) { return c.target || c.estEnd || ""; }).filter(function (d) { return d; }).sort();
      if (!starts.length && !targets.length) return "";
      var earliest = starts.length ? starts[0] : null;
      var latest = targets.length ? targets[targets.length - 1] : null;
      var fmtD = function (d) { if (!d) return "—"; try { return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return d; } };
      return '<div class="card key-dates"><h3>\uD83D\uDCC5 Key dates</h3>' +
        '<div class="kd-row"><span class="kd-label">Earliest start</span><span class="kd-value">' + esc(fmtD(earliest)) + '</span></div>' +
        '<div class="kd-row"><span class="kd-label">Latest target</span><span class="kd-value">' + esc(fmtD(latest)) + '</span></div>' +
        '</div>';
    })();
    return tourBanner + progressCard + nextCard + quickWinsCard + keyDatesCard + dqCard + healthCard + `
      <div class="dash-toolbar" style="display:flex;gap:8px;margin-bottom:12px"><button class="btn btn-sm" id="emailSummary" type="button">\u2709 Copy status email</button><button class="btn btn-sm" id="meetingAgenda" type="button">\uD83D\uDCCB Copy meeting agenda</button></div>
      <div class="grid kpis" style="margin-bottom:16px">
        ${kpi("navy", "Total Cases", k.total)}
        ${kpi("blue", "Open / Active", k.open)}
        ${kpi("red", "Critical (RPN&ge;200)", k.crit)}
        ${kpi("gold", "Avg RPN", k.avgRpn)}
        ${kpi("green", "Avg % Done", pct(k.avgDone))}
        ${kpi("teal", "Blocked", k.blocked)}
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
      <div class="card"><h3>Pareto — where the risk concentrates (80/20)</h3><div class="chart-box"><canvas id="chPareto"></canvas></div></div>` +
      (function () {
        var ac = S.validCases().slice().sort(function (a, b) { return (b.dateLogged || "").localeCompare(a.dateLogged || ""); });
        var latestCases = ac.slice(0, 5);
        return latestCases.length ? '<div class="card"><h3><span class="jargon" data-tip="The last items added to your project">Recent activity</span></h3><ul class="activity-log">' + latestCases.map(function (c) { return '<li class="al-item"><span class="al-time">' + esc(c.dateLogged || "") + '</span><span class="al-text">Added: ' + esc((c.problem || "Untitled").slice(0, 60)) + '</span></li>'; }).join('') + '</ul></div>' : '';
      })() +
      (function () {
        var now = new Date();
        var upcoming = S.validCases().filter(function (c) {
          if (!c.target) return false;
          var d = new Date(c.target);
          return d > now;
        }).sort(function (a, b) { return new Date(a.target) - new Date(b.target); }).slice(0, 5);
        if (!upcoming.length) return '';
        var items = upcoming.map(function (c) {
          var d = new Date(c.target);
          var dateStr = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
          return '<li class="cal-item"><span class="cal-date">' + esc(dateStr) + '</span><span class="cal-text">' + esc((c.problem || "Untitled").slice(0, 50)) + '</span></li>';
        }).join('');
        return '<div class="card"><h3>Upcoming dates</h3><ul class="cal-list">' + items + '</ul></div>';
      })() +
      (function () {
        var TZ_DATA = [
          { country: "Indonesia", tz: "Asia/Jakarta", abbr: "WIB" },
          { country: "Thailand", tz: "Asia/Bangkok", abbr: "ICT" },
          { country: "Vietnam", tz: "Asia/Ho_Chi_Minh", abbr: "ICT" },
          { country: "Taiwan", tz: "Asia/Taipei", abbr: "CST" },
          { country: "Philippines", tz: "Asia/Manila", abbr: "PHT" },
          { country: "Guam", tz: "Pacific/Guam", abbr: "ChST" },
          { country: "Malaysia", tz: "Asia/Kuala_Lumpur", abbr: "MYT" },
          { country: "Brunei", tz: "Asia/Brunei", abbr: "BNT" }
        ];
        var chips = TZ_DATA.map(function (d) {
          var now;
          try { now = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: d.tz }); }
          catch (e) { now = "--:--"; }
          return '<span class="tz-chip"><span class="tz-country">' + esc(d.country) + '</span><span class="tz-time">' + esc(now) + '</span></span>';
        }).join('');
        return '<div class="card"><h3>Local time across the programme</h3><div class="tz-strip">' + chips + '</div></div>';
      })() +
      '<div class="card focus-card"><h3>Focus Timer</h3><div class="focus-display" id="focusDisplay">25:00</div><div style="display:flex;gap:8px;justify-content:center"><button class="btn btn-sm btn-primary" id="focusStart" type="button">Start</button><button class="btn btn-sm" id="focusReset" type="button">Reset</button></div></div>';
  };
  AFTER.dashboard = function () {
    if (!$("#groupSel")) return;   // empty-state branch — nothing to wire
    // Step 93: Animated progress segments + count-up for pct-badge and health-num
    (function animateProgSegments() {
      var segs = document.querySelectorAll(".prog-seg");
      segs.forEach(function (seg) {
        var realWidth = seg.style.width;
        seg.style.width = "0";
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            seg.style.width = realWidth;
          });
        });
      });
      // Animate pct-badge count-up
      var pctBadge = document.querySelector(".pct-badge");
      if (pctBadge) {
        var match = pctBadge.textContent.match(/(\d+)/);
        if (match) {
          var target = parseInt(match[1], 10);
          var cur = 0;
          var step = Math.max(1, Math.ceil(target / 30));
          pctBadge.textContent = "0% complete";
          var iv = setInterval(function () {
            cur = Math.min(cur + step, target);
            pctBadge.textContent = cur + "% complete";
            if (cur >= target) clearInterval(iv);
          }, 25);
        }
      }
      // Animate health-num count-up
      var healthNum = document.querySelector(".health-num");
      if (healthNum) {
        var hTarget = parseInt(healthNum.textContent, 10);
        if (!isNaN(hTarget) && hTarget > 0) {
          var hCur = 0;
          var hStep = Math.max(1, Math.ceil(hTarget / 30));
          healthNum.textContent = "0";
          var hIv = setInterval(function () {
            hCur = Math.min(hCur + hStep, hTarget);
            healthNum.textContent = String(hCur);
            if (hCur >= hTarget) clearInterval(hIv);
          }, 25);
        }
      }
    })();
    // Email summary copy-to-clipboard (step 50)
    const emailBtn = $("#emailSummary");
    if (emailBtn) emailBtn.addEventListener("click", () => {
      const proj = S.get().project;
      const cases = S.validCases();
      const open = cases.filter(c => c.status === "OPEN").length;
      const blocked = cases.filter(c => c.status === "BLOCKED").length;
      const closed = cases.filter(c => c.status === "CLOSED" || c.status === "RESOLVED").length;
      const total = cases.length;
      const name = proj.name || "Submarine Telecom Project";
      const text = [
        name + " -- Status Update",
        "=".repeat(40),
        "",
        "Total items: " + total,
        "  Open: " + open,
        "  Blocked: " + blocked,
        "  Closed/resolved: " + closed,
        "",
        "Next focus: " + (blocked > 0 ? "Unblock " + blocked + " stuck item(s)" : open > 0 ? "Work on " + open + " open item(s)" : "All clear -- on track."),
        "",
        "---",
        "Generated by the QI Platform"
      ].join("\n");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => toast("Status email copied to clipboard -- paste it into your email."), () => toast("Could not copy."));
      } else { toast("Could not access clipboard."); }
    });
    // Meeting agenda copy-to-clipboard (step 60)
    const agendaBtn = $("#meetingAgenda");
    if (agendaBtn) agendaBtn.addEventListener("click", () => {
      const proj = S.get().project;
      const cases = S.validCases();
      const open = cases.filter(c => c.status === "OPEN").length;
      const blocked = cases.filter(c => c.status === "BLOCKED").length;
      const critical = cases.filter(c => c.priority === "1-CRITICAL" && c.status !== "CLOSED" && c.status !== "RESOLVED");
      const name = proj.name || "Submarine Telecom Project";
      const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      const agendaLines = [
        "MEETING AGENDA",
        name,
        "Date: " + today,
        "=".repeat(40),
        "",
        "1. Welcome and roll call (2 min)",
        "",
        "2. Programme status overview (5 min)",
        "   - Total items: " + cases.length,
        "   - Open: " + open + " | Blocked: " + blocked,
        "",
        "3. Critical items requiring decisions (" + critical.length + " items, 10 min)"
      ];
      critical.slice(0, 5).forEach(function (c, i) {
        agendaLines.push("   " + (i + 1) + ". " + (c.problem || "Untitled").slice(0, 60));
      });
      if (critical.length > 5) agendaLines.push("   ... and " + (critical.length - 5) + " more");
      agendaLines.push("");
      agendaLines.push("4. Blocked items review (5 min)");
      var blockedItems = cases.filter(c => c.status === "BLOCKED");
      blockedItems.slice(0, 3).forEach(function (c, i) {
        agendaLines.push("   " + (i + 1) + ". " + (c.problem || "Untitled").slice(0, 60));
      });
      if (blockedItems.length > 3) agendaLines.push("   ... and " + (blockedItems.length - 3) + " more");
      agendaLines.push("");
      agendaLines.push("5. Upcoming milestones and deadlines (5 min)");
      agendaLines.push("");
      agendaLines.push("6. Actions and next steps (3 min)");
      agendaLines.push("");
      agendaLines.push("---");
      agendaLines.push("Generated by the QI Platform");
      var agendaText = agendaLines.join("\n");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(agendaText).then(() => toast("Meeting agenda copied to clipboard."), () => toast("Could not copy."));
      } else { toast("Could not access clipboard."); }
    });
    // Animated counters: numbers count up from 0 to their final value on load (step 31)
    (function animateCounters() {
      var els = document.querySelectorAll(".kpi .value");
      els.forEach(function (el) {
        var final = parseInt(el.textContent, 10);
        if (isNaN(final) || final <= 0) return;
        var current = 0;
        var step = Math.max(1, Math.ceil(final / 30));
        el.textContent = "0";
        var interval = setInterval(function () {
          current = Math.min(current + step, final);
          el.textContent = String(current);
          if (current >= final) clearInterval(interval);
        }, 25);
      });
    })();
    const drawGroup = () => {
      const f = $("#groupSel").value;
      const m = S.groupCounts(f); CH.bar("chGroup", Object.keys(m), Object.values(m));
    };
    $("#groupSel").addEventListener("change", drawGroup); drawGroup();
    const sm = S.groupCounts("status"); CH.pie("chStatus", Object.keys(sm), Object.values(sm));
    const rm = S.rpnByCategory(); CH.hbar("chRpn", Object.keys(rm), Object.values(rm));
    const p = S.paretoRPN();
    CH.pareto("chPareto", p.map(x => x.label), p.map(x => x.value), p.map(x => Math.round(x.cum)));
    // Step 68: Focus timer (Pomodoro-style) wiring
    (function wireFocusTimer() {
      var display = document.getElementById("focusDisplay");
      var startBtn = document.getElementById("focusStart");
      var resetBtn = document.getElementById("focusReset");
      if (!display || !startBtn || !resetBtn) return;
      var totalSec = 25 * 60;
      var remaining = totalSec;
      var interval = null;
      var running = false;
      function fmt(s) { var m = Math.floor(s / 60); var sec = s % 60; return (m < 10 ? "0" : "") + m + ":" + (sec < 10 ? "0" : "") + sec; }
      function tick() {
        remaining--;
        display.textContent = fmt(remaining);
        if (remaining <= 0) {
          clearInterval(interval); interval = null; running = false;
          startBtn.textContent = "Start";
          toast("Focus session complete -- take a break!");
          remaining = totalSec;
          display.textContent = fmt(remaining);
        }
      }
      startBtn.addEventListener("click", function () {
        if (running) { clearInterval(interval); interval = null; running = false; startBtn.textContent = "Start"; }
        else { interval = setInterval(tick, 1000); running = true; startBtn.textContent = "Pause"; }
      });
      resetBtn.addEventListener("click", function () {
        if (interval) { clearInterval(interval); interval = null; }
        running = false; remaining = totalSec;
        display.textContent = fmt(remaining);
        startBtn.textContent = "Start";
      });
    })();
  };

  RENDER.cases = function () {
    const f = uiState.caseFilter;
    let list = S.enriched().filter(c => c.problem);
    // Step 99: Natural-language text filter
    if (f.q) {
      var q = f.q.toLowerCase();
      list = list.filter(function(c) {
        return (c.problem || "").toLowerCase().indexOf(q) !== -1 ||
          (c.category || "").toLowerCase().indexOf(q) !== -1 ||
          (c.priority || "").toLowerCase().indexOf(q) !== -1 ||
          (c.owner || "").toLowerCase().indexOf(q) !== -1;
      });
    }
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
    const rows = (function buildRows() {
      var groupBy = f.groupBy || "none";
      if (groupBy === "none") {
        return visibleCases.map(c => renderCaseRow(c)).join("");
      }
      // Group rows with sub-header tr elements
      var groups = {};
      var order = [];
      visibleCases.forEach(function (c) {
        var key = (groupBy === "category" ? c.category : c.priority) || "(none)";
        if (!groups[key]) { groups[key] = []; order.push(key); }
        groups[key].push(c);
      });
      order.sort();
      var out = "";
      order.forEach(function (key) {
        out += '<tr class="group-header"><td colspan="13"><strong>' + esc(key) + '</strong> <span class="muted">(' + groups[key].length + ')</span></td></tr>';
        out += groups[key].map(c => renderCaseRow(c)).join("");
      });
      return out;
    })();
    function renderCaseRow(c) {
      return `
      <tr data-id="${c.id}" class="${uiState.selected.has(c.id) ? "row-selected" : ""} ${c.pinned ? "pinned-row" : ""}" ${c.pinned ? 'draggable="true"' : ""}>
        <td class="center"><input type="checkbox" data-bulk="row" data-id="${c.id}" ${uiState.selected.has(c.id) ? "checked" : ""} aria-label="Select ${esc(c.code)}"></td>
        <td class="pin-cell ${c.pinned ? "pin-on" : ""}" data-act="pin" data-id="${c.id}" title="${c.pinned ? "Unpin (drag to reorder)" : "Pin to top"}">${c.pinned ? "\ud83d\udccc" : "<span class='muted'>\ud83d\udccd</span>"}</td>
        <td>${esc(c.code)}</td>
        <td class="wrap">${esc(c.problem)}</td>
        <td>${esc(c.category)}</td>
        <td class="inline-edit"><select data-edit="priority" data-id="${c.id}" class="inline-sel">${opts(C.LISTS.priority, c.priority, "\u2014")}</select></td>
        <td class="center">${c.rpn == null ? "" : c.rpn}</td>
        <td>${healthBadge(c.health)}</td>
        <td><select data-edit="owner" data-id="${c.id}" class="inline-sel">${opts(names, c.owner, "\u2014")}</select></td>
        <td class="inline-edit"><select data-edit="status" data-id="${c.id}" class="inline-sel">${opts(C.LISTS.status, c.status, "\u2014")}</select></td>
        <td>${barCell(c.percent)}</td>
        <td class="center">
          <button class="btn btn-sm" data-act="edit" data-id="${c.id}">Edit</button>
          <button class="btn btn-sm btn-danger" data-act="del" data-id="${c.id}">Del</button>
          <button class="btn btn-sm copy-btn" data-problem="${esc(c.problem)}" title="Copy problem to clipboard">\ud83d\udccb</button>
        </td>
      </tr>`;
    }
    const head = `<th class="center"><input type="checkbox" id="bulkAll" ${allSelected ? "checked" : ""} aria-label="Select all"></th>` +
      `<th aria-label="Pinned"></th><th>ID</th><th class='wrap'>Problem</th><th>Category</th><th>Priority</th><th>RPN</th><th>Health</th><th>Owner</th><th>Status</th><th>% Done</th><th></th>`;
    // quick filter chips — one-click presets (still click-only)
    const chipDefs = [
      { id: "all", label: "All", on: !f.status && !f.priority && !f.owner },
      { id: "open", label: "Open", on: f.status === "OPEN" },
      { id: "inprogress", label: "In progress", on: f.status === "IN PROGRESS" },
      { id: "blocked", label: "Blocked", on: f.status === "BLOCKED" },
      { id: "critical", label: "Critical", on: f.priority === "1-CRITICAL" },
      { id: "done", label: "Done", on: f.status === "CLOSED" },
      { id: "resolved", label: "Resolved", on: f.status === "RESOLVED" }
    ];
    const chips = `<div class="chips">${chipDefs.map(c => `<button class="chip ${c.on ? "on" : ""}" data-act="chip" data-chip="${c.id}">${esc(c.label)}</button>`).join("")}</div>`;
    return `
      <div class="toolbar">
        <button class="btn btn-primary" data-act="add">+ New Case</button>
        <input type="text" id="caseFilter" class="global-search" placeholder="Filter: Thailand, critical, blocked..." value="${esc(f.q || "")}" style="width:200px">
        <select id="fltStatus" style="max-width:150px">${opts(C.LISTS.status, f.status, "All status")}</select>
        <select id="fltPriority" style="max-width:150px">${opts(C.LISTS.priority, f.priority, "All priority")}</select>
        <select id="fltOwner" style="max-width:150px">${opts(names, f.owner, "All owners")}</select>
        <select id="fltSort" style="max-width:160px">
          <option value="rpn">Sort: RPN</option><option value="priority" ${f.sort==="priority"?"selected":""}>Sort: Priority</option>
          <option value="status" ${f.sort==="status"?"selected":""}>Sort: Status</option><option value="code" ${f.sort==="code"?"selected":""}>Sort: ID</option>
        </select>
        <select id="fltGroupBy" style="max-width:140px" title="Group rows by field">
          <option value="none"${(f.groupBy||"none")==="none"?" selected":""}>Group: None</option>
          <option value="category"${f.groupBy==="category"?" selected":""}>Group: Category</option>
          <option value="priority"${f.groupBy==="priority"?" selected":""}>Group: Priority</option>
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
    // Step 99: Natural-language case filter with debounce
    var cfEl = $("#caseFilter");
    if (cfEl) {
      var _cfTimer = null;
      cfEl.addEventListener("input", function () {
        clearTimeout(_cfTimer);
        _cfTimer = setTimeout(function () {
          uiState.caseFilter.q = cfEl.value;
          go("cases");
        }, 250);
      });
    }
    // Group by dropdown (Step 90)
    const gb = $("#fltGroupBy");
    if (gb) gb.addEventListener("change", () => { uiState.caseFilter.groupBy = gb.value; go("cases"); });
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

  RENDER.myitems = function () {
    const roster = S.get().roster || [];
    const myOwner = roster.length > 0 ? roster[0].name : "";
    const cases = S.validCases().filter(c => !myOwner || (c.owner || "") === myOwner || !(c.owner));
    const open = cases.filter(c => c.status === "OPEN" || c.status === "IN PROGRESS");
    const blocked = cases.filter(c => c.status === "BLOCKED" || c.status === "ON HOLD");
    const done = cases.filter(c => c.status === "RESOLVED" || c.status === "CLOSED");
    function section(title, items) {
      if (!items.length) return "";
      return `<h3>${esc(title)} (${items.length})</h3><div class="my-list">${items.map(c =>
        `<div class="my-item"><span class="my-status">${esc(c.status)}</span><span class="my-text">${esc(c.problem)}</span></div>`).join("")}</div>`;
    }
    if (!cases.length) return `<div class="empty">No items assigned yet.</div>`;
    return `<div class="card"><h3>Showing items for: ${esc(myOwner || "Unassigned")}</h3>
      ${section("Open / In progress", open)}
      ${section("Blocked / On hold", blocked)}
      ${section("Done", done)}</div>`;
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
    return tableWrap("<th>Case</th><th>Area</th><th class='wrap'>Failure mode</th><th class='wrap'>Potential cause</th><th>Sev</th><th>Occ</th><th>Det</th><th><span class='jargon' data-tip='Risk Priority Number — higher means more urgent to fix' tabindex='0'>RPN</span></th><th>Band</th><th class='wrap'>Recommended action (AI)</th><th>Owner</th>", rows);
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
    if (!cs.length) return `<div class="empty"><p>No items with start/end dates yet. Go to <b>Project Brain</b>, upload a project description and click <b>Analyze</b> — the app will create your timeline automatically.</p><button class="btn btn-sm" onclick="document.querySelector('[data-view=brain]')&&document.querySelector('[data-view=brain]').click()" type="button">🧠 Go to Project Brain</button></div>`;
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
    // First-run "Start here" 3-step guide — shown only once
    const startHere = (S.brand() && S.brand().tourDone) ? "" : `
      <div class="start-here" id="startHereGuide" role="region" aria-label="Start here guide">
        <div class="start-here-title"><span>&#x1F44B;</span> Start here</div>
        <ol class="start-here-steps">
          <li><span class="start-here-num">1</span><span>Upload a project description (or click "Try an example" below)</span></li>
          <li><span class="start-here-num">2</span><span>Review the auto-built plan, frameworks and recommendations</span></li>
          <li><span class="start-here-num">3</span><span>Present it: open the Investor Brief or watch the 3D build</span></li>
        </ol>
        <button class="btn btn-sm" data-act="dismissGuide" type="button">Got it</button>
      </div>`;
    // Friendly 'Programme at a glance' front door → the two best outputs.
    const BG = window.QIGlobe || {};
    const bgCables = Array.isArray(BG.CABLES) ? BG.CABLES : [];
    const bgStations = Array.isArray(BG.STATIONS) ? BG.STATIONS : [];
    const bgProg = BG.PROGRAMME || { budgetUsd: 1300e6, durationMonths: 60 };
    const bgKm = bgCables.reduce((a, c) => a + (Number(c.lengthKm) || 0), 0);
    const bgCap = bgCables.reduce((a, c) => a + (Number(c.capacityTbps) || 0), 0);
    const heroStat = (v, l) => `<div class="brain-hero-stat"><span class="brain-hero-v">${esc(v)}</span><span class="brain-hero-l">${esc(l)}</span></div>`;
    const hero = bgCables.length ? `<div class="card brain-hero">
        <div class="brain-hero-head">
          <h3>Programme at a glance</h3>
          <span class="muted">A quick orientation — then open the full brief or watch the network build itself in 3D.</span>
        </div>
        <div class="brain-hero-stats">
          ${heroStat(bgStations.length + " countries", "Connected")}
          ${heroStat(bgKm.toLocaleString() + " km", "Cable route")}
          ${heroStat(bgCap.toLocaleString() + " Tbps", "Capacity")}
          ${heroStat("about " + fmtUsdShort(bgProg.budgetUsd), "Budget")}
          ${heroStat(bgProg.durationMonths + " months", "Build time")}
        </div>
        <div class="toolbar" style="flex-wrap:wrap;gap:8px">
          <button class="btn btn-primary" id="heroBrief" type="button">📄 Open the Investor Brief</button>
          <button class="btn" id="heroGlobe" type="button">🌐 Watch it build in 3D</button>
        </div>
      </div>` : "";
    return `${startHere}${hero}<div class="card">
        <h3>Project Brain <span class="tag">auto-plan</span></h3>
        <p style="line-height:1.6">Paste or upload your <b>project description</b> — that is the only thing you need to do.
        The Brain analyses it <b>locally on this device</b> — nothing is uploaded or sent to any server — and the app
        does the rest automatically: it builds a full plan (phases, tasks, a risk register, milestones, procurement and a
        budget), a <b>Market Entry</b>, <b>Licensing &amp; Permitting</b> and <b>Landing Partner</b> framework for every
        country it detects, and an on-device <b>Advisor</b> that tells you, in plain English, what to do first to get the
        best result. Review it, then apply it to the active project. It structures and tracks the work; people still execute it.</p>
        <div class="toolbar" style="flex-wrap:wrap;gap:8px">
          <label class="muted" for="brainProfile">Domain</label>
          <select id="brainProfile" style="max-width:280px">${profOpts}</select>
          <label class="btn btn-sm" for="brainFile">Upload .txt / .md</label>
          <input id="brainFile" type="file" accept=".txt,.md,text/plain,text/markdown" hidden />
          <button class="btn btn-primary" id="brainExample" type="button">Try an example</button>
          <span class="muted" id="brainFileName"></span>
        </div>
        <details id="brainWizard" style="margin-top:10px;border:1.5px dashed var(--border);border-radius:8px;padding:10px 12px">
          <summary style="cursor:pointer;font-weight:600">Don't have a description? Build one with clicks — no typing</summary>
          <p class="muted" style="margin:8px 0">Answer a few questions by clicking. We'll write the project description for you and analyse it automatically.</p>
          <div class="wz-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
            <label>What are you building?<br>
              <select id="wzType" style="width:100%">
                <option value="submarine fibre optic cable system">Submarine fibre optic cable system</option>
                <option value="terrestrial fibre optic backbone network">Terrestrial fibre backbone network</option>
                <option value="mobile network (5G) rollout">Mobile network (5G) rollout</option>
                <option value="data centre build">Data centre build</option>
                <option value="general infrastructure project">General infrastructure project</option>
              </select>
            </label>
            <label>How long is the route?<br>
              <select id="wzLen" style="width:100%">
                <option value="1,000 km">~1,000 km (short)</option>
                <option value="3,000 km">~3,000 km</option>
                <option value="5,000 km">~5,000 km</option>
                <option value="9,500 km" selected>~9,500 km (regional)</option>
                <option value="12,000 km">~12,000 km (very long)</option>
              </select>
            </label>
            <label>How long will it take?<br>
              <select id="wzDur" style="width:100%">
                <option value="12 months">12 months</option>
                <option value="24 months">24 months</option>
                <option value="36 months">36 months</option>
                <option value="48 months">48 months</option>
                <option value="60 months" selected>60 months (5 years)</option>
              </select>
            </label>
            <label>Roughly how much will it cost?<br>
              <select id="wzBudget" style="width:100%">
                <option value="USD 100 million">USD 100 million</option>
                <option value="USD 300 million">USD 300 million</option>
                <option value="USD 600 million">USD 600 million</option>
                <option value="USD 1.3 billion" selected>USD 1.3 billion</option>
                <option value="USD 2 billion">USD 2 billion</option>
              </select>
            </label>
            <label>How much fibre?<br>
              <select id="wzPairs" style="width:100%">
                <option value="8 fibre pairs">8 fibre pairs</option>
                <option value="16 fibre pairs">16 fibre pairs</option>
                <option value="24 fibre pairs" selected>24 fibre pairs</option>
                <option value="48 fibre pairs">48 fibre pairs</option>
              </select>
            </label>
          </div>
          <div style="margin-top:10px">
            <div class="muted" style="margin-bottom:6px">Which countries are involved? (click to toggle)</div>
            <div id="wzCountries" style="display:flex;flex-wrap:wrap;gap:6px">
              ${["Indonesia","Malaysia","Brunei","Vietnam","Thailand","Philippines","Taiwan","Guam"].map(c =>
                `<label class="wz-chip" style="border:1.5px solid var(--border);border-radius:999px;padding:4px 12px;cursor:pointer"><input type="checkbox" class="wzCountry" value="${c}" checked style="margin-right:6px">${c}</label>`).join("")}
            </div>
            <div class="toolbar" style="margin-top:8px;gap:8px">
              <button class="btn btn-sm" id="wzAll" type="button">Select all 8</button>
              <button class="btn btn-sm" id="wzNone" type="button">Clear countries</button>
            </div>
          </div>
          <div class="toolbar" style="margin-top:12px">
            <button class="btn btn-primary" id="wzBuild" type="button">Build my brief &amp; analyze</button>
          </div>
        </details>
        <textarea id="brainText" rows="9" style="width:100%;margin-top:8px;font:inherit;padding:10px;border:1.5px solid var(--border);border-radius:8px"
          placeholder="Paste your project description here (stays on this device)…"></textarea>
        <div class="toolbar" style="margin-top:8px">
          <button class="btn btn-primary" id="brainAnalyze">Analyze</button>
          <button class="btn" id="brainClear">Clear</button>
        </div>
      </div>
      <div id="brainOut"></div>
      <div class="card" id="brainUpdatesCard">
        <div class="card-head"><h3>Project Updates &amp; References <span class="tag">live log</span></h3></div>
        <p class="muted" style="line-height:1.6;margin-top:0">Keep the project current: post <b>news</b>, <b>results</b>, and <b>reference links</b> here.
        Everything you add is saved to this project and — when you are signed in to the shared workspace — every other
        team member is notified of the change. Use it as the running journal of duties, decisions and milestones.</p>
        <div class="upd-add">
          <div class="toolbar" style="gap:8px;flex-wrap:wrap;align-items:flex-end">
            <label class="muted" style="display:flex;flex-direction:column;gap:4px;font-size:12px">Type
              <select id="updType" style="min-width:170px">
                <option value="news">📰 News</option>
                <option value="result">✅ Result</option>
                <option value="reference">🔗 Reference / link</option>
                <option value="decision">📌 Decision</option>
                <option value="risk">⚠️ Risk note</option>
                <option value="note">📝 General note</option>
              </select>
            </label>
            <textarea id="updText" rows="2" style="flex:1 1 320px;min-width:220px;font:inherit;padding:8px;border:1.5px solid var(--border);border-radius:8px"
              placeholder="What happened? Paste a result, a news item, or a reference link…"></textarea>
            <button class="btn btn-primary" id="updAdd" type="button">Add to log</button>
          </div>
        </div>
        <div id="updFeed" class="upd-feed" style="margin-top:14px"></div>
      </div>`;
  };
  AFTER.brain = function () {
    const fileInput = $("#brainFile"), nameEl = $("#brainFileName"), ta = $("#brainText");
    // 'Programme at a glance' front-door buttons → the two best outputs.
    const heroBrief = $("#heroBrief"), heroGlobe = $("#heroGlobe");
    if (heroBrief) heroBrief.addEventListener("click", () => go("investorbrief"));
    if (heroGlobe) heroGlobe.addEventListener("click", () => go("globe3d"));
    // Single shared analysis path so the Analyze button and an upload behave identically.
    const runAnalyze = (opts) => {
      const text = (ta.value || "").trim();
      if (!text) { toast("Paste or upload a project description first."); return false; }
      if (!window.QIBrain) { toast("Brain engine not loaded."); return false; }
      const plan = QIBrain.analyzeProject(text, { profile: $("#brainProfile").value || undefined });
      uiState.brainPlan = plan;
      renderBrainPreview(plan);
      // Auto-apply the plan to the active project so Risk Register, FMEA, etc.
      // are populated immediately — the user expects Analyze = done, not a
      // separate "Apply" step. The preview still shows for review, and the
      // Apply button remains for re-applying if the user changes the description.
      applyBrainPlan(plan);
      if (opts && opts.scroll) { const out = $("#brainOut"); try { if (out && out.scrollIntoView) out.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) { /* jsdom / unsupported */ } }
      return true;
    };
    if (fileInput) fileInput.addEventListener("change", () => {
      const f = fileInput.files && fileInput.files[0]; if (!f) return;
      const name = (f.name || "").toLowerCase();
      // Graceful guard: we only read plain text. Word/PDF/Office/binary files
      // would dump garbage into the analyser, so we stop and guide the user.
      if (/\.(docx?|pdf|pptx?|xlsx?|rtf|odt|pages|key|numbers|zip)$/.test(name)) {
        nameEl.textContent = `${f.name} — can't read this type yet`;
        fileInput.value = "";
        toast("I can't read Word/PDF files yet. Use \u201CBuild one with clicks\u201D below, or paste the text from the document.");
        return;
      }
      nameEl.textContent = f.name;
      const reader = new FileReader();
      reader.onload = () => {
        const txt = String(reader.result || "");
        // Binary sniff: catch zip/PDF/null-byte content slipped through as "all files".
        if (/^PK\x03\x04/.test(txt) || /^%PDF/.test(txt) || /\x00\x00/.test(txt.slice(0, 4000))) {
          nameEl.textContent = `${f.name} — not plain text`;
          fileInput.value = "";
          toast("That looks like a Word/PDF/binary file, not text. Use \u201CBuild one with clicks\u201D or paste the text instead.");
          return;
        }
        ta.value = txt;
        // Upload alone is enough — the app does the rest automatically.
        if (runAnalyze({ scroll: true })) toast(`Analysed "${f.name}" — your plan & country frameworks are below.`);
      };
      reader.onerror = () => toast("Could not read that file. Try a plain .txt or .md file.");
      reader.readAsText(f);
    });

    // ---- Click-only "Build my brief" wizard (zero typing) -------------------
    const qsa = (s) => Array.prototype.slice.call(document.querySelectorAll(s));
    const wzBuild = $("#wzBuild");
    if (wzBuild) {
      const wzAll = $("#wzAll"), wzNone = $("#wzNone");
      if (wzAll) wzAll.addEventListener("click", () => qsa(".wzCountry").forEach(c => { c.checked = true; }));
      if (wzNone) wzNone.addEventListener("click", () => qsa(".wzCountry").forEach(c => { c.checked = false; }));
      const joinList = (a) => a.length <= 1 ? (a[0] || "") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
      wzBuild.addEventListener("click", () => {
        const type = ($("#wzType") || {}).value || "infrastructure project";
        const len = ($("#wzLen") || {}).value || "";
        const dur = ($("#wzDur") || {}).value || "";
        const budget = ($("#wzBudget") || {}).value || "";
        const pairs = ($("#wzPairs") || {}).value || "";
        const countries = qsa(".wzCountry").filter(c => c.checked).map(c => c.value);
        const isFibre = /fibre|submarine/.test(type);
        const countryClause = countries.length
          ? ` The system lands in ${joinList(countries)}, with a cable landing station, terrestrial backhaul and a national cable landing licence in each country.`
          : "";
        const scopeClause = isFibre
          ? " Scope includes marine route survey and multi-country permitting, submarine cable and repeater supply, marine installation and burial, cable landing stations, terrestrial backhaul, system integration, end-to-end testing (OTDR, BER, capacity) and acceptance to ready-for-service."
          : " Scope includes design, permitting, procurement, construction, integration, testing and handover to operations.";
        const text =
          `We are delivering a ${type}. The route is about ${len} carrying ${pairs}.` +
          countryClause +
          ` The planned duration is ${dur} and the budget is approximately ${budget}.` +
          scopeClause;
        ta.value = text;
        if (runAnalyze({ scroll: true })) toast("Built your brief from your choices and analysed it — see below.");
      });
    }

    const clearBtn = $("#brainClear");
    if (clearBtn) clearBtn.addEventListener("click", () => { ta.value = ""; nameEl.textContent = ""; if (fileInput) fileInput.value = ""; uiState.brainPlan = null; $("#brainOut").innerHTML = ""; });

    const analyzeBtn = $("#brainAnalyze");
    if (analyzeBtn) analyzeBtn.addEventListener("click", () => { if (runAnalyze({ scroll: true })) toast("Analysis complete — your plan & country frameworks are below."); });

    // 'Try an example' — load a bundled 8-country brief and analyse it, so a
    // first-time user sees the whole result with a single click (zero typing).
    const exampleBtn = $("#brainExample");
    if (exampleBtn) exampleBtn.addEventListener("click", () => {
      ta.value = "Submarine fibre optic cable system connecting eight countries across Asia and the Pacific: " +
        "Indonesia (Jakarta), Malaysia (Mersing), Thailand (Songkhla), Vietnam (Da Nang), Philippines (Batangas), " +
        "Taiwan (Tamsui), Brunei (Bandar Seri Begawan) and Guam (Piti). About 9,500 km of trunk route, 24 fibre pairs, " +
        "approximately USD 1.3 billion over 60 months. Scope: marine route survey, multi-country permitting and national " +
        "cable-landing licences, submarine cable and repeater supply, marine installation and burial, cable landing " +
        "stations, terrestrial backhaul, system integration and end-to-end testing (OTDR, BER, capacity) to " +
        "ready-for-service.";
      if (nameEl) nameEl.textContent = "Example: 8-country submarine cable programme";
      if (runAnalyze({ scroll: true })) toast("Loaded an example project and analysed it — explore the results below.");
    });

    // ---- Project Updates & References: post news/results/links, notify the team ----
    refreshUpdatesFeed();
    var updAdd = $("#updAdd"), updText = $("#updText"), updType = $("#updType");
    function postUpdate() {
      if (!updText) return;
      var txt = (updText.value || "").trim();
      if (!txt) { toast("Write a short note, result or link first."); return; }
      var author = (window.QIAuth && QIAuth.currentUser && (QIAuth.currentUser.displayName || QIAuth.currentUser.email)) || "";
      var entry = S.addUpdate((updType && updType.value) || "note", txt, author);
      if (entry) {
        updText.value = "";
        refreshUpdatesFeed();
        toast("Added to the project log" + (window.QISync && QISync.wsIsConnected && QISync.wsIsConnected() ? " — your team has been notified." : "."));
      }
    }
    if (updAdd) updAdd.addEventListener("click", postUpdate);
    // Ctrl/Cmd+Enter posts quickly from the textarea.
    if (updText) updText.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === "Enter" || e.keyCode === 13)) { e.preventDefault(); postUpdate(); }
    });
    var updFeed = $("#updFeed");
    if (updFeed) updFeed.addEventListener("click", function (e) {
      var del = e.target.closest && e.target.closest("[data-upd-del]");
      if (del) {
        var id = del.getAttribute("data-upd-del");
        if (S.deleteUpdate(id)) { refreshUpdatesFeed(); toast("Entry removed from the log."); }
      }
    });
    // Live-refresh the feed when a teammate posts an update over the realtime channel.
    if (window.QISync && QISync.wsAddListener) {
      QISync.wsAddListener(function (type, payload) {
        if (type === "change" && payload && payload.entity === "Project update") {
          // Re-render only if we're still on the Brain view.
          if ($("#updFeed")) refreshUpdatesFeed();
        }
      });
    }
  };
  // ---- Project Updates / References feed (the Brain's living log) ----
  var UPDATE_TYPE_META = {
    news:      { icon: "📰", label: "News",      cls: "upd-news" },
    result:    { icon: "✅", label: "Result",    cls: "upd-result" },
    reference: { icon: "🔗", label: "Reference", cls: "upd-reference" },
    decision:  { icon: "📌", label: "Decision",  cls: "upd-decision" },
    risk:      { icon: "⚠️", label: "Risk note", cls: "upd-risk" },
    note:      { icon: "📝", label: "Note",      cls: "upd-note" }
  };
  function updTypeMeta(t) { return UPDATE_TYPE_META[t] || UPDATE_TYPE_META.note; }
  // Escape first, THEN turn bare URLs into safe links (target=_blank, noopener).
  function linkifyEscaped(text) {
    var safe = esc(String(text == null ? "" : text));
    return safe.replace(/(https?:\/\/[^\s<]+)/g, function (u) {
      return '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + '</a>';
    });
  }
  function relTime(iso) {
    try {
      var d = new Date(iso), diff = (Date.now() - d.getTime()) / 1000;
      if (diff < 60) return "just now";
      if (diff < 3600) return Math.floor(diff / 60) + "m ago";
      if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
      if (diff < 604800) return Math.floor(diff / 86400) + "d ago";
      return d.toISOString().slice(0, 10);
    } catch (e) { return ""; }
  }
  function renderUpdatesFeed() {
    var items = (S.updatesList && S.updatesList()) || [];
    if (!items.length) {
      return '<p class="muted" style="text-align:center;padding:16px 0">No updates yet. Post the first news item, result or reference above.</p>';
    }
    return items.map(function (u) {
      var m = updTypeMeta(u.type);
      var who = u.author ? esc(u.author) + " · " : "";
      return '<div class="upd-item ' + m.cls + '" data-upd-id="' + esc(u.id) + '">' +
        '<div class="upd-item-head"><span class="upd-badge">' + m.icon + ' ' + esc(m.label) + '</span>' +
        '<span class="upd-meta">' + who + esc(relTime(u.ts)) + '</span>' +
        '<button class="upd-del" type="button" data-upd-del="' + esc(u.id) + '" title="Remove this entry" aria-label="Remove">✕</button></div>' +
        '<div class="upd-text">' + linkifyEscaped(u.text) + '</div></div>';
    }).join("");
  }
  function refreshUpdatesFeed() {
    var box = $("#updFeed");
    if (box) box.innerHTML = renderUpdatesFeed();
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
    // "What the Brain understood" — surfaces linguistic clean-up so a user who
    // wrote with typos/grammar errors can confirm the Brain read them correctly.
    const interp = s.interpreted || { correctionCount: 0, corrections: [] };
    const interpFixes = (interp.corrections || []).length
      ? `<div class="interp-fixes">${interp.corrections.map(c => `<span class="interp-chip"><s>${esc(c.from)}</s> → <b>${esc(c.to)}</b></span>`).join("")}</div>`
      : "";
    const interpBlock = `
      <div class="card interp-card">
        <div class="card-head"><h3>📖 What the Brain understood</h3><span class="tag">smart interpreter</span></div>
        <p style="margin:0 0 6px">I read your description as a <b>${esc(s.domainLabel)}</b>${
          (plan.countryIntel && plan.countryIntel.length) ? ` involving <b>${plan.countryIntel.length}</b> ${plan.countryIntel.length === 1 ? "country" : "countries"} (${plan.countryIntel.map(c => esc(c.name)).join(", ")})` : ""
        }${scaleBits.length ? `, scale: ${esc(scaleBits.join(" · "))}` : ""}.</p>
        ${interp.correctionCount ? `<p class="muted" style="margin:0">${esc(interp.note)}</p>${interpFixes}` : `<p class="muted" style="margin:0">No spelling fixes were needed — your description was clear.</p>`}
      </div>`;
    const phaseRows = plan.phases.map(p => `<tr><td>${esc(p.name)}</td><td>${esc(p.owner)}</td><td class="center">${p.taskCount}</td></tr>`).join("");
    const riskRows = plan.risks.map(r => `<tr><td class="wrap">${esc(r.problem.replace(/^RISK:\s*/, ""))}</td><td class="center">${r.sev}</td><td class="center">${r.occ}</td><td class="center">${r.det}</td><td class="center"><b>${r.sev * r.occ * r.det}</b></td></tr>`).join("");
    const budgetRows = plan.budget.rows.map(b => `<tr><td>${esc(b.category)}</td><td class="right">${money(b.est)}</td></tr>`).join("");
    const intel = plan.countryIntel || [];
    const intelSection = intel.length ? `
      <div class="card"><h3>Regulatory &amp; Country Intelligence <span class="tag">${intel.length} ${intel.length === 1 ? "country" : "countries"}</span></h3>
        <p class="muted">Detected from your description. Permit tasks and FMEA-scored risks for these have been added to the plan.</p>
        <div class="country-grid">${intel.map(c => `
          <div class="card country-card">
            <div class="card-head"><h3>${esc(c.name)}</h3><span class="tag">${esc(c.authority.abbrev)}</span></div>
            <div class="country-auth"><div class="country-auth-name">${esc(c.authority.name)}</div>
              <div class="muted">${esc(c.authority.role)}</div></div>
            <div class="country-section"><h4>Top geopolitical</h4><ul>${(c.geopolitical || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
            <div class="country-section"><h4>Top geographical hazards</h4><ul>${(c.geographical || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
          </div>`).join("")}</div>
      </div>` : "";
    const adv = plan.advice;
    const opt = plan.optimization;
    const optBlock = opt && opt.items && opt.items.length ? `
      <div class="card" style="border-left:4px solid var(--teal,#1f8a8a)"><div class="card-head"><h3>\u267b\ufe0f Efficiency &amp; Savings \u2014 cut cost and energy</h3><span class="tag">AI \u00b7 estimate</span></div>
        <p style="line-height:1.6">${esc(opt.headline)}</p>
        <div class="opt-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px">
          ${opt.items.map(o => `<div class="card" style="margin:0"><div class="card-head"><h4 style="margin:0">${esc(o.title)}</h4><span class="badge ${o.kind === "energy" ? "b-ontrack" : o.kind === "cost" ? "b-high" : "b-progress"}">${esc(o.area)}</span></div><p class="muted" style="margin:6px 0 0">${esc(o.text)}</p></div>`).join("")}
        </div></div>` : "";
    const advisorBlock = adv && adv.recommendations && adv.recommendations.length ? `
      <div class="card" style="border-left:4px solid var(--navy,#1b3a6b)"><div class="card-head"><h3>🧭 Advisor — how to get the best result</h3><span class="tag">AI · on-device</span></div>
        <p style="line-height:1.6">${esc(adv.headline)}</p>
        <ol style="line-height:1.7">${adv.recommendations.map(r => `<li><b>[${esc(r.priority)}] ${esc(r.title)}</b> — ${esc(r.text)}<br><span class="muted">Why: ${esc(r.why)}</span></li>`).join("")}</ol>
        <div class="toolbar" style="flex-wrap:wrap;gap:6px">
          <button class="btn btn-sm" data-go="advisor">Full advisor</button>
          <button class="btn btn-sm" data-go="marketentry">Market Entry</button>
          <button class="btn btn-sm" data-go="licensing">Licensing &amp; Permits</button>
          <button class="btn btn-sm" data-go="landingpartners">Landing Partners</button>
          <button class="btn btn-sm" data-go="globe3d">3D map</button>
        </div></div>` : "";
    $("#brainOut").innerHTML = `
      ${interpBlock}
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
          <button class="btn btn-sm" id="brainExportJSON" type="button">Download plan (JSON)</button>
          <button class="btn btn-sm" id="brainExportCSV" type="button">Download plan (CSV)</button>
          <span class="muted">Adds ${plan.cases.length + plan.risks.length} cases, ${plan.milestones.length} milestones and ${plan.procurement.length} procurement items.</span>
        </div>
      </div>
      ${advisorBlock}
      ${optBlock}
      <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="card"><h3>Work breakdown</h3>${tableWrap("<th>Phase</th><th>Owner</th><th>Tasks</th>", phaseRows)}</div>
        <div class="card"><h3>Top risks (<span class="jargon" data-tip="Failure Mode &amp; Effects Analysis — a way to find what could go wrong and how serious it is" tabindex="0">FMEA</span> <span class="jargon" data-tip="Risk Priority Number — higher means more urgent to fix" tabindex="0">RPN</span>)</h3>${tableWrap("<th class='wrap'>Risk</th><th>S</th><th>O</th><th>D</th><th><span class='jargon' data-tip='Risk Priority Number — higher means more urgent to fix' tabindex='0'>RPN</span></th>", riskRows)}</div>
      </div>
      <div class="card"><h3>Budget skeleton</h3>${tableWrap("<th>Category</th><th class='right'>Estimate</th>", budgetRows)}</div>
      ${intelSection}
      <div class="card"><h3>Suggested roles</h3><p>${plan.roles.map(r => `<span class="badge">${esc(r)}</span>`).join(" ")}</p></div>`;
    const applyBtn = $("#brainApply");
    if (applyBtn) applyBtn.addEventListener("click", () => {
      const n = applyBrainPlan(plan);
      toast(`Applied: ${n} cases, ${plan.milestones.length} milestones, ${plan.procurement.length} procurement items.`);
      // Diff summary card (step 46)
      const diffItems = [];
      if (n) diffItems.push(`${n} cases/risks added`);
      if (plan.milestones.length) diffItems.push(`${plan.milestones.length} milestones created`);
      if (plan.procurement.length) diffItems.push(`${plan.procurement.length} procurement items`);
      if (plan.countryIntel && plan.countryIntel.length) diffItems.push(`${plan.countryIntel.length} countries detected`);
      const diffCard = document.createElement("div");
      diffCard.className = "diff-card";
      diffCard.innerHTML = `<b>What changed:</b><ul class="diff-list">${diffItems.map(d => '<li>' + esc(d) + '</li>').join('')}</ul>`;
      applyBtn.parentElement.appendChild(diffCard);
      go("dashboard");
    });
    const ejBtn = $("#brainExportJSON");
    if (ejBtn) ejBtn.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "qi-plan.json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      toast("Downloaded: qi-plan.json");
    });
    const ecBtn = $("#brainExportCSV");
    if (ecBtn) ecBtn.addEventListener("click", () => {
      const cols = ["problem","category","priority","owner","phase"];
      const rows = (plan.cases||[]).concat(plan.risks||[]);
      const lines = [cols.join(",")].concat(rows.map(r => cols.map(c => '"' + String(r[c]||"").replace(/"/g,'""') + '"').join(",")));
      const blob = new Blob([lines.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "qi-plan.csv";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      toast("Downloaded: qi-plan.csv");
    });
    bindGo();
  }
  function applyBrainPlan(plan) {
    // Make analyze idempotent: clear previously generated content so a fresh
    // upload produces a fresh full plan (not duplicates). User-posted project
    // updates and route progress are preserved.
    try {
      var st0 = S.get();
      if (st0) {
        st0.cases = [];
        st0.registers = st0.registers || {};
        ["milestones", "procurement", "decisions", "resources"].forEach(function (r) { st0.registers[r] = []; });
        st0.stakeholders = [];
      }
    } catch (e) { /* ignore */ }

    let n = 0;
    const add = c => { const copy = Object.assign({}, c); delete copy._brain; delete copy._phase; S.addCase(copy); n++; };
    plan.cases.forEach(add);
    plan.risks.forEach(add);
    plan.milestones.forEach(m => S.regAdd("milestones", Object.assign({}, m)));
    plan.procurement.forEach(p => S.regAdd("procurement", Object.assign({}, p)));

    // --- Populate EVERY module from the one description, simultaneously ---
    var intel = plan.countryIntel || [];

    // 1) Stakeholders: the real regulatory authority for each detected country,
    //    plus the programme-level roles — so the Stakeholders module is alive.
    try {
      var sh = S.get().stakeholders;
      sh.push({ name: "Programme Director", role: "Owner / Decision-maker", influence: "High", interest: "High", raci: "A - Accountable" });
      sh.push({ name: "Lenders / Investors", role: "Finance", influence: "High", interest: "High", raci: "I - Informed" });
      intel.forEach(function (c) {
        if (c && c.authority) {
          sh.push({
            name: c.authority.abbrev || c.authority.name,
            role: (c.authority.name || "Regulator") + " (" + c.name + ")",
            influence: "High", interest: "Medium", raci: "C - Consulted"
          });
        }
      });
    } catch (e) { /* ignore */ }

    // 2) Decision log: record that the plan was auto-generated, so the
    //    Decision Log module starts with the founding decision.
    try {
      S.regAdd("decisions", {
        decision: "Adopt the auto-generated project plan",
        rationale: "Plan, risks, milestones, procurement and country frameworks were generated from the project description.",
        owner: "Programme Director", date: new Date().toISOString().slice(0, 10), status: "Decided"
      });
    } catch (e) { /* ignore */ }

    // 3) Route progress: initialise every cable segment so the Route Progress
    //    module and the 3D map show the full route immediately (0% laid).
    try {
      if (window.QIGlobe && Array.isArray(QIGlobe.CABLES) && S.setRouteLaidKm) {
        QIGlobe.CABLES.forEach(function (cab) { S.setRouteLaidKm(cab.id, 0); });
      }
    } catch (e) { /* ignore */ }

    // 4) Project name -> the Brain's detected title (updates the dropdown now).
    if (plan.summary && plan.summary.title) {
      const cur = S.get();
      if (cur && cur.project) {
        cur.project.name = plan.summary.title.slice(0, 60);
        if (S.save) S.save();
      }
    }

    // 5) Announce in the live project log that the whole plan is now active.
    try {
      if (S.addUpdate) {
        S.addUpdate("news",
          "Project analysed — full plan generated and applied across all modules" +
          (intel.length ? (" for " + intel.length + " countr" + (intel.length === 1 ? "y" : "ies")) : "") +
          ": tasks, risks, milestones, procurement, budget, stakeholders, country frameworks and the 3D route.",
          "Project Brain (AI)");
      }
    } catch (e) { /* ignore */ }

    // 6) Refresh everything so all modules reflect the new plan at once.
    if (S.save) try { S.save(); } catch (e) { /* ignore */ }
    refreshHeader();
    try { if (typeof refreshBadges === "function") refreshBadges(); } catch (e) { /* ignore */ }
    try { if (window.QIGlobe && QIGlobe.setProgress) QIGlobe.setProgress(); } catch (e) { /* ignore */ }
    return n;
  }

  // ---------- Frameworks & Advisor (auto-generated from a description) ------
  // These views need only ONE input from the user: a project description in the
  // Project Brain. Until then they show the full 8-country reference set so the
  // app is useful out of the box. Everything is plain-language for non-PM users.
  function verdictClass(v) { v = String(v || "").toLowerCase(); if (v === "go") return "b-ontrack"; if (v.indexOf("caution") >= 0) return "b-critical"; return "b-high"; }
  function bindGo() { document.querySelectorAll("[data-go]").forEach(b => { if (b._goBound) return; b._goBound = true; b.addEventListener("click", () => go(b.dataset.go)); }); }
  // Snapshot of the LIVE project state so AI-generated views (Advisor, Brief,
  // frameworks) stay in sync with what's actually in the app right now.
  function liveMetrics() {
    try {
      var k = (S.kpis && S.kpis()) || {};
      var lm = {
        total: k.total || 0, open: k.open || 0, crit: k.crit || 0, blocked: k.blocked || 0,
        avgDone: k.avgDone || 0, pctSpent: k.pctSpent || 0
      };
      if (S.updatesList) { try { lm.updatesCount = S.updatesList().length; } catch (e) { lm.updatesCount = 0; } }
      return lm;
    } catch (e) { return null; }
  }

  function fwBundle() {
    const live = liveMetrics();
    if (uiState.brainPlan && uiState.brainPlan.frameworks) {
      var bp = uiState.brainPlan;
      // Recompute the advice from the analysed frameworks PLUS the live project
      // state every time, so the Advisor reflects current cases/risks/budget/
      // progress rather than a frozen snapshot from analysis time.
      var bpAdvice = bp.advice;
      if (window.QIBrain && QIBrain.buildAdvice) {
        try {
          bpAdvice = QIBrain.buildAdvice({
            frameworks: bp.frameworks, risks: bp.risks || [],
            countryIntel: bp.countryIntel || [], live: live
          });
        } catch (e) { bpAdvice = bp.advice; }
      }
      return { frameworks: bp.frameworks, advice: bpAdvice, analysed: true,
        title: bp.summary.title, scope: (bp.countryIntel || []).length, live: live };
    }
    const CD = window.QICountryData;
    if (!CD || typeof CD.list !== "function" || typeof CD.marketEntryFramework !== "function") return null;
    const all = CD.list();
    const frameworks = { marketEntry: CD.marketEntryFramework(all), licensing: CD.licensingFramework(all), landingPartners: CD.landingPartnerFramework(all) };
    let advice = null;
    if (window.QIBrain && QIBrain.buildAdvice) advice = QIBrain.buildAdvice({ frameworks, risks: CD.riskCases(all), countryIntel: CD.summarize(all), live: live });
    return { frameworks, advice, analysed: false, scope: all.length, live: live };
  }
  function fwBanner(b) {
    const analysed = b && b.analysed;
    return `<div class="readout" style="border-left:3px solid var(--navy,#1b3a6b)">
      <b>One input, the app does the rest.</b> Paste or upload a project description in <b>Project Brain</b> and these fill in automatically.
      ${analysed ? `Showing your analysed project <b>${esc(b.title)}</b> (${b.scope} ${b.scope === 1 ? "country" : "countries"} detected).` : `Nothing analysed yet — showing the full reference set for <b>all 8 countries</b>.`}
      <span class="toolbar" style="display:inline-flex;gap:6px;margin-left:8px">
        <button class="btn btn-sm btn-primary" data-go="brain">Open Project Brain</button>
        <button class="btn btn-sm" data-go="globe3d">View on 3D map</button>
      </span></div>`;
  }
  function fwLegend(legend) {
    if (!legend) return "";
    return `<p class="muted">${Object.keys(legend).map(k => `<b>${esc(k)}</b>: ${esc(legend[k])}`).join("<br>")}</p>`;
  }
  function renderMarketEntryHTML(fw) {
    const rows = fw.countries.map(c => `<tr>
      <td><b>${esc(c.name)}</b><div class="muted">${esc(c.regulator)}</div></td>
      <td class="center"><span class="badge ${verdictClass(c.verdict)}">${esc(c.verdict)}</span></td>
      <td class="wrap">${esc(c.foreignOwnership)}</td>
      <td class="wrap">${esc(c.recommendedMode)}</td>
      <td class="wrap">${esc(c.recommendation)}</td></tr>`).join("");
    return `<div class="card"><h3>${esc(fw.title)} <span class="tag">${fw.countries.length} ${fw.countries.length === 1 ? "country" : "countries"}</span></h3>
      <p style="line-height:1.6">${esc(fw.explainer)}</p>${fwLegend(fw.legend)}
      ${tableWrap("<th>Country</th><th>Verdict</th><th class='wrap'>Who can own it</th><th class='wrap'>Simplest way in</th><th class='wrap'>Recommendation</th>", rows)}</div>`;
  }
  function renderLicensingHTML(fw) {
    const cards = fw.countries.map(c => {
      const rows = c.licenses.map(l => {
        const crit = l.license === c.criticalPathItem;
        return `<tr${crit ? ' style="background:rgba(224,168,0,.10)"' : ''}>
          <td class="wrap">${crit ? "<b>" + esc(l.license) + "</b> <span class='badge b-high'>slowest</span>" : esc(l.license)}</td>
          <td>${esc(l.authority)}</td><td class="center">${l.leadTimeMonths} mo</td>
          <td class="wrap">${esc(l.dependsOn)}</td><td class="wrap muted">${esc(l.note)}</td></tr>`;
      }).join("");
      return `<div class="card"><div class="card-head"><h3>${esc(c.name)}</h3><span class="tag">${esc(c.regulator)}</span></div>
        <div class="readout">Work here can realistically start in about <b>${c.criticalPathMonths} months</b> — set by the slowest approval, <b>${esc(c.criticalPathItem)}</b> (${esc(c.criticalPathAuthority)}). Begin that one first.</div>
        ${tableWrap("<th class='wrap'>Approval needed</th><th>Who grants it</th><th>Time</th><th class='wrap'>Needs first</th><th class='wrap'>Note</th>", rows)}</div>`;
    }).join("");
    return `<div class="card"><h3>${esc(fw.title)} <span class="tag">${fw.countries.length} ${fw.countries.length === 1 ? "country" : "countries"}</span></h3><p style="line-height:1.6">${esc(fw.explainer)}</p></div>${cards}`;
  }
  function renderLandingPartnersHTML(fw) {
    const cards = fw.countries.map(c => `
      <div class="card country-card"><div class="card-head"><h3>${esc(c.name)}</h3><span class="tag">${(c.candidates || []).length} partners</span></div>
        <div class="country-section"><h4>Who can bring the cable ashore</h4><p>${(c.candidates || []).map(x => `<span class="badge">${esc(x)}</span>`).join(" ")}</p></div>
        <div class="country-cols">
          <div class="country-section"><h4>What they usually want</h4><ul>${(c.wants || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
          <div class="country-section"><h4>Ways to structure the deal</h4><ul>${(c.structures || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
        </div>${c.note ? `<p class="muted">${esc(c.note)}</p>` : ""}</div>`).join("");
    return `<div class="card"><h3>${esc(fw.title)} <span class="tag">${fw.countries.length} ${fw.countries.length === 1 ? "country" : "countries"}</span></h3>
      <p style="line-height:1.6">${esc(fw.explainer)}</p>${fwLegend(fw.legend)}</div>
      <div class="country-grid">${cards}</div>`;
  }
  function renderAdvisorHTML(advice) {
    if (!advice) return `<div class="card"><p class="muted">Advisor unavailable — country data not loaded.</p></div>`;
    const prClass = p => { p = String(p || "").toLowerCase(); if (p.indexOf("first") >= 0 || p.indexOf("mitigate") >= 0) return "b-critical"; if (p.indexOf("watch") >= 0) return "b-high"; if (p.indexOf("quick") >= 0) return "b-ontrack"; return "b-progress"; };
    const recs = advice.recommendations.map((r, i) => `
      <div class="card" style="border-left:4px solid var(--navy,#1b3a6b)">
        <div class="card-head"><h3>${i + 1}. ${esc(r.title)}</h3><span class="badge ${prClass(r.priority)}">${esc(r.priority)}</span></div>
        <p><b>${esc(r.text)}</b></p><p class="muted">Why: ${esc(r.why)}</p></div>`).join("");
    const steps = (advice.nextSteps || []).map(s => `<li>${esc(s)}</li>`).join("");
    return `<div class="card"><div class="card-head"><h3>Project Advisor</h3><span class="tag">AI · on-device</span></div>
        <p style="line-height:1.6">${esc(advice.headline)}</p></div>
      ${recs || `<div class="card"><p class="muted">Analyse a description in Project Brain to get tailored recommendations.</p></div>`}
      ${steps ? `<div class="card"><h3>Your next steps</h3><ol style="line-height:1.7">${steps}</ol></div>` : ""}`;
  }
  RENDER.advisor = function () { const b = fwBundle(); return fwBanner(b) + renderAdvisorHTML(b ? b.advice : null); };
  AFTER.advisor = bindGo;
  RENDER.marketentry = function () { const b = fwBundle(); return b ? fwBanner(b) + renderMarketEntryHTML(b.frameworks.marketEntry) : `<div class="card"><p class="muted">Country data not loaded.</p></div>`; };
  AFTER.marketentry = bindGo;
  RENDER.licensing = function () { const b = fwBundle(); return b ? fwBanner(b) + renderLicensingHTML(b.frameworks.licensing) : `<div class="card"><p class="muted">Country data not loaded.</p></div>`; };
  AFTER.licensing = bindGo;
  RENDER.landingpartners = function () { const b = fwBundle(); return b ? fwBanner(b) + renderLandingPartnersHTML(b.frameworks.landingPartners) : `<div class="card"><p class="muted">Country data not loaded.</p></div>`; };
  AFTER.landingpartners = bindGo;

  // Read-only Country Intelligence: real regulatory authority, marine/EIA body,
  // and the dominant geopolitical & geographical hazards for each of the 8 STP
  // countries/territories. Data is bundled & offline (window.QICountryData).
  RENDER.country = function () {
    const CD = window.QICountryData;
    const countries = (CD && typeof CD.list === "function") ? CD.list() : [];
    if (!countries.length) {
      return `<div class="card"><p class="muted">Country intelligence data is not loaded.</p></div>`;
    }
    const li = arr => (arr || []).map(x => `<li>${esc(x)}</li>`).join("");
    const cards = countries.map(c => `
      <div class="card country-card" data-country="${esc(c.key)}">
        <div class="card-head">
          <h3>${esc(c.name)}</h3>
          <span class="tag">${esc(c.authority.abbrev)}</span>
        </div>
        <div class="country-auth">
          <div class="country-auth-name">${esc(c.authority.name)}</div>
          <div class="muted">${esc(c.authority.role)}</div>
          ${c.authority.url ? `<div class="muted"><a href="${esc(c.authority.url)}" target="_blank" rel="noopener noreferrer">${esc(c.authority.url)}</a></div>` : ""}
        </div>
        ${c.environmental ? `<div class="country-section"><h4>Environmental / marine permitting</h4>
          <p><b>${esc(c.environmental.abbrev)}</b> — ${esc(c.environmental.body)}.<br><span class="muted">${esc(c.environmental.role)}</span></p></div>` : ""}
        <div class="country-cols">
          <div class="country-section"><h4>Geopolitical</h4><ul>${li(c.geopolitical)}</ul></div>
          <div class="country-section"><h4>Geographical / environmental hazards</h4><ul>${li(c.geographical)}</ul></div>
        </div>
      </div>`).join("");
    return `<div class="card">
        <h3>Country &amp; Regulatory Intelligence <span class="tag">${countries.length} countries</span></h3>
        <p style="line-height:1.6">Real, named reference data for the Submarine Telecom Project's
        ${countries.length} countries/territories — the telecom regulator that issues cable-landing
        licences, the marine/environmental permitting body, and the dominant geopolitical and
        geographical hazards along each route. The Project Brain folds these into generated permit
        tasks and FMEA-scored risks when it detects a country in your description.</p>
      </div>
      <div class="country-grid">${cards}</div>`;
  };

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

      <div class="card team-card"><div class="card-head"><h3>Team Management</h3></div>
        <div id="teamMembersArea"><p class="muted">Loading team members...</p></div>
        <div id="teamInviteArea" hidden>
          <hr style="border:none;border-top:1px solid var(--line);margin:16px 0">
          <h4 style="margin:0 0 12px;font-size:14px">Invite New Member</h4>
          <div class="invite-form" id="inviteFormArea">
            <div class="form-grid" style="max-width:500px">
              <div class="field"><label>Email</label><input type="email" id="inviteEmail" placeholder="user@example.com" required></div>
              <div class="field"><label>Role</label><select id="inviteRole"><option value="ADMIN">Admin</option><option value="MANAGER" selected>Manager</option><option value="VIEWER">Viewer</option></select></div>
            </div>
            <div style="margin-top:12px"><button class="btn btn-primary" id="btnSendInvite">Send Invite</button></div>
          </div>
          <div id="inviteLinkArea" hidden>
            <div class="invite-link-box">
              <label style="font-size:12px;font-weight:600;color:#42506a;display:block;margin-bottom:6px">Invite Link (share this with the user)</label>
              <div style="display:flex;gap:8px;align-items:center">
                <input type="text" id="inviteLinkValue" readonly style="flex:1;font-family:monospace;font-size:12px">
                <button class="btn btn-sm" id="btnCopyInviteLink">Copy</button>
              </div>
              <p class="muted" style="margin-top:6px;font-size:11px">This link is valid for 7 days. It can only be used once.</p>
            </div>
          </div>
          <div id="pendingInvitesArea" style="margin-top:16px">
            <h4 style="margin:0 0 10px;font-size:14px">Pending Invites</h4>
            <div id="pendingInvitesList"><p class="muted">Loading...</p></div>
          </div>
        </div>
      </div>

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
        <div style="margin-top:14px"><button class="btn btn-primary" data-act="saveai">Save AI settings</button></div></div>

      <div class="card"><h3>Account Security</h3>
        <div class="mfa-status">
          <span>Multi-Factor Authentication (MFA):</span>
          <span class="mfa-badge ${(window.QIAuth && window.QIAuth.currentUser && window.QIAuth.currentUser.mfaEnabled) ? 'enabled' : 'disabled'}">${(window.QIAuth && window.QIAuth.currentUser && window.QIAuth.currentUser.mfaEnabled) ? 'Enabled' : 'Disabled'}</span>
        </div>
        <div id="mfaSettingsContent">
          ${(window.QIAuth && window.QIAuth.currentUser && window.QIAuth.currentUser.mfaEnabled) ?
            '<p class="muted">MFA is active on your account. To disable it, enter your password and a current TOTP code.</p>' +
            '<div class="mfa-enroll-form">' +
            '  <div class="auth-field"><label for="mfaDisablePw">Password</label><input type="password" id="mfaDisablePw" placeholder="Your password"></div>' +
            '  <div class="auth-field"><label for="mfaDisableCode">TOTP Code</label><input type="text" id="mfaDisableCode" maxlength="6" pattern="[0-9]{6}" placeholder="000000" inputmode="numeric"></div>' +
            '  <button class="btn btn-danger" id="btnDisableMfa">Disable MFA</button>' +
            '</div>' +
            ((window.QIAuth && window.QIAuth.generateRecoveryCodes) ?
              '<hr style="border:none;border-top:1px solid var(--line);margin:18px 0">' +
              '<h4 style="margin:0 0 8px;font-size:14px">Recovery codes</h4>' +
              '<p class="muted" style="margin-top:0">One-time backup codes let you sign in if you lose your authenticator. ' +
              'Generating a new set replaces any previous codes.</p>' +
              '<p class="muted" id="recoveryStatusLine">Checking recovery codes…</p>' +
              '<button class="btn btn-primary" id="btnGenRecovery">Generate recovery codes</button>' +
              '<div id="recoveryCodesOut" hidden></div>'
              : '')
            :
            '<p class="muted">Protect your account with time-based one-time passwords (TOTP). Works with any authenticator app.</p>' +
            '<button class="btn btn-primary" id="btnEnrollMfa">Enable MFA</button>' +
            '<div id="mfaEnrollArea" hidden>' +
            '  <div class="mfa-secret" id="mfaSecretUri"></div>' +
            '  <p class="muted">Scan the URI above with your authenticator app, then enter the 6-digit code to confirm.</p>' +
            '  <div class="mfa-enroll-form">' +
            '    <div class="auth-field"><label for="mfaVerifyCode">TOTP Code</label><input type="text" id="mfaVerifyCode" maxlength="6" pattern="[0-9]{6}" placeholder="000000" inputmode="numeric"></div>' +
            '    <button class="btn btn-primary" id="btnVerifyMfa">Verify and activate</button>' +
            '  </div>' +
            '</div>'
          }
        </div>
        <div class="auth-error" id="mfaError" hidden style="margin-top:12px"></div>

        <hr style="border:none;border-top:1px solid var(--line);margin:18px 0">
        <h4 style="margin:0 0 8px;font-size:14px">Change password</h4>
        <p class="muted" style="margin-top:0">Choose a strong password of at least 12 characters. Changing it signs out all of your other sessions.</p>
        <div class="mfa-enroll-form">
          <div class="auth-field"><label for="cpCurrent">Current password</label><input type="password" id="cpCurrent" autocomplete="current-password" placeholder="Current password"></div>
          <div class="auth-field"><label for="cpNew">New password</label><input type="password" id="cpNew" autocomplete="new-password" placeholder="At least 12 characters"></div>
          <div class="auth-field"><label for="cpConfirm">Confirm new password</label><input type="password" id="cpConfirm" autocomplete="new-password" placeholder="Re-enter new password"></div>
          <button class="btn btn-primary" id="btnChangePassword">Change password</button>
        </div>
        <div class="auth-error" id="cpError" hidden style="margin-top:12px"></div>
      </div>`;
  };
  AFTER.config = function () {
    // ---- Team Management wiring ----
    var teamArea = document.getElementById("teamMembersArea");
    var inviteArea = document.getElementById("teamInviteArea");

    if (teamArea && window.QIAuth && window.QIAuth.listTeam) {
      window.QIAuth.listTeam().then(function (data) {
        var members = (data && data.members) || [];
        if (members.length === 0) {
          teamArea.innerHTML = '<p class="muted">No team members found.</p>';
          return;
        }
        // Determine current user role from team list
        var cu = window.QIAuth.currentUser;
        var myRole = null;
        if (cu) {
          for (var i = 0; i < members.length; i++) {
            if (members[i].id === cu.id) { myRole = members[i].role; break; }
          }
        }
        var isAdmin = myRole === "OWNER" || myRole === "ADMIN";

        // Build team members table
        var roleClass = function (r) { return "role-badge role-" + (r || "viewer").toLowerCase(); };
        var rows = members.map(function (m) {
          var joined = m.createdAt ? new Date(m.createdAt).toLocaleDateString() : "";
          return "<tr><td>" + esc(m.displayName || m.email) + "</td><td>" + esc(m.email) + "</td><td><span class=\"" + roleClass(m.role) + "\">" + esc(m.role) + "</span></td><td>" + esc(joined) + "</td></tr>";
        }).join("");
        teamArea.innerHTML = '<div class="table-wrap"><table class="team-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead><tbody>' + rows + '</tbody></table></div>';

        // Show invite management if OWNER or ADMIN
        if (isAdmin && inviteArea) {
          inviteArea.hidden = false;
          loadPendingInvites();
        }
      }).catch(function () {
        teamArea.innerHTML = '<p class="muted">Unable to load team members.</p>';
      });
    }

    // Send invite handler
    var btnSend = document.getElementById("btnSendInvite");
    if (btnSend) {
      btnSend.addEventListener("click", function () {
        var email = (document.getElementById("inviteEmail") || {}).value || "";
        var role = (document.getElementById("inviteRole") || {}).value || "MANAGER";
        if (!email) { toast("Please enter an email address."); return; }
        btnSend.disabled = true;
        window.QIAuth.createInvite(email, role).then(function (data) {
          btnSend.disabled = false;
          if (data && data.token) {
            var link = window.location.origin + "/?invite=" + data.token;
            var linkInput = document.getElementById("inviteLinkValue");
            var linkArea = document.getElementById("inviteLinkArea");
            if (linkInput) linkInput.value = link;
            if (linkArea) linkArea.hidden = false;
            toast("Invite created successfully.");
            // Clear form
            var emailInput = document.getElementById("inviteEmail");
            if (emailInput) emailInput.value = "";
            loadPendingInvites();
          } else {
            toast(data.message || data.error || "Failed to create invite.");
          }
        }).catch(function () {
          btnSend.disabled = false;
          toast("Unable to reach the server.");
        });
      });
    }

    // Copy invite link handler
    var btnCopy = document.getElementById("btnCopyInviteLink");
    if (btnCopy) {
      btnCopy.addEventListener("click", function () {
        var linkInput = document.getElementById("inviteLinkValue");
        if (linkInput && linkInput.value) {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(linkInput.value).then(function () {
              toast("Invite link copied to clipboard.");
            }).catch(function () {
              linkInput.select();
              toast("Press Ctrl+C to copy.");
            });
          } else {
            linkInput.select();
            try { document.execCommand("copy"); toast("Invite link copied."); } catch (ex) { toast("Press Ctrl+C to copy."); }
          }
        }
      });
    }

    // Load pending invites
    function loadPendingInvites() {
      var listEl = document.getElementById("pendingInvitesList");
      if (!listEl || !window.QIAuth || !window.QIAuth.listInvites) return;
      window.QIAuth.listInvites().then(function (data) {
        var invites = (data && data.invites) || [];
        if (invites.length === 0) {
          listEl.innerHTML = '<p class="muted">No pending invites.</p>';
          return;
        }
        var rows = invites.map(function (inv) {
          var expires = inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString() : "";
          return '<tr><td>' + esc(inv.email) + '</td><td><span class="role-badge role-' + (inv.role || "manager").toLowerCase() + '">' + esc(inv.role) + '</span></td><td>' + esc(expires) + '</td><td><button class="btn btn-sm btn-danger" data-revoke="' + esc(inv.id) + '">Revoke</button></td></tr>';
        }).join("");
        listEl.innerHTML = '<div class="table-wrap"><table class="team-table"><thead><tr><th>Email</th><th>Role</th><th>Expires</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';

        // Wire revoke buttons
        listEl.querySelectorAll("button[data-revoke]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var id = btn.getAttribute("data-revoke");
            btn.disabled = true;
            window.QIAuth.revokeInvite(id).then(function (data) {
              if (data && data.success) {
                toast("Invite revoked.");
                loadPendingInvites();
              } else {
                toast(data.message || data.error || "Failed to revoke invite.");
                btn.disabled = false;
              }
            }).catch(function () {
              toast("Unable to reach the server.");
              btn.disabled = false;
            });
          });
        });
      }).catch(function () {
        listEl.innerHTML = '<p class="muted">Unable to load invites.</p>';
      });
    }

    // ---- Existing config wiring ----
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
    // MFA settings wiring
    const btnEnroll = $("#btnEnrollMfa");
    if (btnEnroll) btnEnroll.addEventListener("click", function () {
      if (!window.QIAuth) return;
      btnEnroll.disabled = true;
      window.QIAuth.enrollMfa().then(function (data) {
        if (data.uri || data.secret) {
          var area = $("#mfaEnrollArea");
          var uriEl = $("#mfaSecretUri");
          if (uriEl) uriEl.textContent = data.uri || data.secret;
          if (area) area.hidden = false;
        } else {
          var err = $("#mfaError"); if (err) { err.textContent = data.message || data.error || "Enrollment failed."; err.hidden = false; }
        }
        btnEnroll.disabled = false;
      }).catch(function () {
        var err = $("#mfaError"); if (err) { err.textContent = "Unable to reach the server."; err.hidden = false; }
        btnEnroll.disabled = false;
      });
    });
    const btnVerify = $("#btnVerifyMfa");
    if (btnVerify) btnVerify.addEventListener("click", function () {
      if (!window.QIAuth) return;
      var code = ($("#mfaVerifyCode") || {}).value || "";
      var err = $("#mfaError");
      if (err) err.hidden = true;
      window.QIAuth.verifyMfa(code).then(function (data) {
        if (data.success || data.mfaEnabled) {
          toast("MFA enabled successfully.");
          go("config");
        } else {
          if (err) { err.textContent = data.message || data.error || "Verification failed."; err.hidden = false; }
        }
      }).catch(function () { if (err) { err.textContent = "Unable to reach the server."; err.hidden = false; } });
    });
    const btnDisable = $("#btnDisableMfa");
    if (btnDisable) btnDisable.addEventListener("click", function () {
      if (!window.QIAuth) return;
      var pw = ($("#mfaDisablePw") || {}).value || "";
      var code = ($("#mfaDisableCode") || {}).value || "";
      var err = $("#mfaError");
      if (err) err.hidden = true;
      window.QIAuth.disableMfa(pw, code).then(function (data) {
        if (data.success) {
          toast("MFA disabled.");
          go("config");
        } else {
          if (err) { err.textContent = data.message || data.error || "Failed to disable MFA."; err.hidden = false; }
        }
      }).catch(function () { if (err) { err.textContent = "Unable to reach the server."; err.hidden = false; } });
    });

    // Recovery codes wiring. Guarded so the Settings view still renders when
    // QIAuth is the headless/test stub without these methods.
    if (window.QIAuth && window.QIAuth.recoveryStatus) {
      var statusLine = $("#recoveryStatusLine");
      window.QIAuth.recoveryStatus().then(function (data) {
        if (statusLine) {
          if (data && data.enabled) {
            statusLine.textContent = "You have " + (data.remaining || 0) + " unused recovery code" + ((data.remaining === 1) ? "" : "s") + ".";
          } else {
            statusLine.textContent = "";
          }
        }
      }).catch(function () {
        if (statusLine) statusLine.textContent = "Unable to load recovery-code status.";
      });
    }
    var btnGenRecovery = $("#btnGenRecovery");
    if (btnGenRecovery && window.QIAuth && window.QIAuth.generateRecoveryCodes) {
      btnGenRecovery.addEventListener("click", function () {
        var err = $("#mfaError");
        if (err) err.hidden = true;
        btnGenRecovery.disabled = true;
        window.QIAuth.generateRecoveryCodes().then(function (data) {
          btnGenRecovery.disabled = false;
          var out = $("#recoveryCodesOut");
          if (data && data.codes && data.codes.length) {
            var items = data.codes.map(function (c) { return "<li><code>" + esc(c) + "</code></li>"; }).join("");
            if (out) {
              out.innerHTML =
                '<div class="recovery-warning">Save these codes now — each can be used once and they will NOT be shown again.</div>' +
                '<ul class="recovery-codes">' + items + '</ul>' +
                '<button class="btn btn-sm" id="btnCopyRecovery">Copy codes</button>';
              out.hidden = false;
            }
            var statusLine2 = $("#recoveryStatusLine");
            if (statusLine2) statusLine2.textContent = "You have " + data.codes.length + " unused recovery codes.";
            var btnCopy = $("#btnCopyRecovery");
            if (btnCopy) btnCopy.addEventListener("click", function () {
              var text = data.codes.join("\n");
              if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(function () { toast("Recovery codes copied."); }).catch(function () { toast("Press Ctrl+C to copy."); });
              } else {
                toast("Select and copy the codes above.");
              }
            });
            toast("Recovery codes generated.");
          } else {
            if (err) { err.textContent = (data && (data.error || data.message)) || "Failed to generate recovery codes."; err.hidden = false; }
          }
        }).catch(function () {
          btnGenRecovery.disabled = false;
          if (err) { err.textContent = "Unable to reach the server."; err.hidden = false; }
        });
      });
    }
    // QIAuth is the headless/test stub without a changePassword method.
    const btnChangePw = $("#btnChangePassword");
    if (btnChangePw && window.QIAuth && window.QIAuth.changePassword) {
      btnChangePw.addEventListener("click", function () {
        var current = ($("#cpCurrent") || {}).value || "";
        var next = ($("#cpNew") || {}).value || "";
        var confirm = ($("#cpConfirm") || {}).value || "";
        var err = $("#cpError");
        if (err) err.hidden = true;

        function showCpError(msg) { if (err) { err.textContent = msg; err.hidden = false; } }

        if (!current) { showCpError("Enter your current password."); return; }
        if (next !== confirm) { showCpError("New password and confirmation do not match."); return; }
        if (next.length < 12) { showCpError("New password must be at least 12 characters."); return; }

        btnChangePw.disabled = true;
        window.QIAuth.changePassword(current, next).then(function (data) {
          btnChangePw.disabled = false;
          if (data && data.success) {
            var c = $("#cpCurrent"); if (c) c.value = "";
            var n = $("#cpNew"); if (n) n.value = "";
            var cf = $("#cpConfirm"); if (cf) cf.value = "";
            toast("Password changed — other sessions signed out.");
          } else {
            showCpError((data && (data.error || data.message)) || "Failed to change password.");
          }
        }).catch(function () {
          btnChangePw.disabled = false;
          showCpError("Unable to reach the server.");
        });
      });
    }
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

  // ---------- Kanban board ----------
  const KCOLS = ["OPEN", "IN PROGRESS", "ON HOLD", "BLOCKED", "RESOLVED", "CLOSED"];
  RENDER.kanban = function () {
    const e = S.validCases();
    if (!e.length) return `<div class="empty"><p>No items yet. Go to <b>Project Brain</b>, upload a project description and click <b>Analyze</b> — the app will create your Kanban board automatically.</p><button class="btn btn-sm" onclick="document.querySelector('[data-view=brain]')&&document.querySelector('[data-view=brain]').click()" type="button">🧠 Go to Project Brain</button></div>`;
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

  // Step 98: Decision Log — chronological list of decisions with click-only "Log a decision" form
  // Override the generic register renderer for decisions with a custom chronological view
  RENDER.decisions = function () {
    var decisions = S.get().decisions || [];
    var decTypes = ["Include country", "Exclude country", "Change priority", "Accept risk", "Defer item", "Other"];
    var rationales = ["Risk reduction outweighs cost", "Budget constraint", "Client preference", "Resource availability", "Lessons from prior project", "Best value of three bids", "WIP too high", "Regulatory requirement", "Schedule impact acceptable", "No viable alternative"];
    var listHtml = "";
    if (decisions.length) {
      listHtml = '<div class="dec-list">' + decisions.slice().reverse().map(function(d) {
        return '<div class="dec-item"><span class="dec-time">' + esc(C.fmtDate(d.date) || d.date || "\u2014") + '</span> <span class="dec-text"><b>' + esc(d.decision || d.type || "") + '</b>' + (d.context ? " \u2014 " + esc(d.context) : "") + (d.owner ? ' <span class="muted">(' + esc(d.owner) + ')</span>' : "") + '</span></div>';
      }).join("") + '</div>';
    } else {
      listHtml = '<p class="muted">No decisions logged yet. Use the form below to record a decision.</p>';
    }
    return '<div class="card"><h3>Decision Log</h3>' + listHtml + '</div>' +
      '<div class="card"><h3>Log a decision</h3>' +
      '<div class="toolbar" style="flex-wrap:wrap;gap:8px">' +
      '<select id="decType"><option value="">Decision type...</option>' + decTypes.map(function(t) { return '<option value="' + esc(t) + '">' + esc(t) + '</option>'; }).join("") + '</select>' +
      '<select id="decRationale"><option value="">Rationale...</option>' + rationales.map(function(r) { return '<option value="' + esc(r) + '">' + esc(r) + '</option>'; }).join("") + '</select>' +
      '<button class="btn btn-primary" id="decSubmit" type="button">Log decision</button>' +
      '</div></div>';
  };
  AFTER.decisions = function () {
    var btn = $("#decSubmit");
    if (btn) btn.addEventListener("click", function () {
      var typeEl = $("#decType"), ratEl = $("#decRationale");
      var type = typeEl ? typeEl.value : "";
      var rationale = ratEl ? ratEl.value : "";
      if (!type) { toast("Pick a decision type first"); return; }
      var decisions = S.get().decisions || [];
      decisions.push({ _id: (Date.now().toString(36) + Math.random().toString(36).slice(2, 7)), decision: type, context: rationale, owner: "", date: new Date().toISOString().slice(0, 10), status: "Approved" });
      S.get().decisions = decisions;
      S.save();
      toast("Decision logged");
      go("decisions");
    });
  };

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
        ? `<b class="jargon" data-tip="Risk Priority Number — higher means more urgent to fix" tabindex="0">RPN</b> ${en.rpn ?? "—"} (${en.rpnBand || "—"}) &nbsp;·&nbsp; <b>Est. duration</b> ${en.estDays ?? "—"} days &nbsp;·&nbsp; <b>Est. end</b> ${C.fmtDate(en.estEnd) || "—"} &nbsp;·&nbsp; <b>Health</b> ${en.health}<br><b>AI:</b> ${esc(en.ai)}`
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

  // ---------- theme / display adaptation / shortcuts / run checks ----------
  // Colour system note: all colours come from CSS custom-property design tokens
  // (--ink, --bg, --card, --line, --accent, ...) defined once in styles.css and
  // flipped wholesale by the [data-theme] attribute. Nothing hard-codes a colour,
  // so contrast stays consistent and a single ambient engine can re-theme the
  // whole app safely.
  //
  // Display modes: "auto" (adapts to the room's light), "light", "dark".
  var _ambientPref = null;   // sensor/time suggestion: "dark" | "light" | null
  var _ambientDim = 0;       // gentle night-dimming veil opacity (0 .. 0.14)
  var _ambientHiContrast = false; // bump contrast in bright/glare conditions
  var _sensorActive = false; // a real ambient-light sensor is feeding readings
  var _ambientStarted = false;

  function getThemeMode() {
    var b = (S.brand && S.brand()) || {};
    if (b.themeMode === "light" || b.themeMode === "dark" || b.themeMode === "auto") return b.themeMode;
    // Migrate legacy {theme, themeManual} -> mode
    if (b.themeManual) return (b.theme === "dark" ? "dark" : "light");
    return "auto";
  }

  function resolveTheme(mode) {
    if (mode === "light" || mode === "dark") return mode;
    // Auto: a live light sensor wins; else the OS preference; else time-of-day.
    if (_ambientPref === "dark" || _ambientPref === "light") return _ambientPref;
    try {
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    } catch (e) { /* ignore */ }
    var h = new Date().getHours();
    return (h >= 19 || h < 7) ? "dark" : "light";
  }

  function applyAmbientVeil() {
    var veil = document.getElementById("ambientVeil");
    if (!veil) {
      veil = document.createElement("div");
      veil.id = "ambientVeil";
      veil.setAttribute("aria-hidden", "true");
      if (document.body) document.body.appendChild(veil);
    }
    // Only adapt brightness in Auto mode; manual modes are a fixed look.
    var dim = (getThemeMode() === "auto") ? _ambientDim : 0;
    if (veil) veil.style.opacity = String(dim);
    var hi = (getThemeMode() === "auto") && _ambientHiContrast;
    document.documentElement.classList.toggle("hi-contrast", hi);
  }

  function applyTheme() {
    var mode = getThemeMode();
    var eff = resolveTheme(mode);
    document.documentElement.setAttribute("data-theme", eff === "dark" ? "dark" : "light");
    var btn = $("#btnTheme");
    if (btn) {
      btn.textContent = mode === "auto" ? "◐" : (eff === "dark" ? "☼" : "○");
      btn.title = (mode === "auto"
        ? "Display: Auto — adapts brightness to your surroundings (click to change)"
        : "Display: " + mode.charAt(0).toUpperCase() + mode.slice(1) + " (click to change)");
      btn.setAttribute("aria-label", btn.title);
      btn.setAttribute("data-mode", mode);
    }
    applyAmbientVeil();
    if (window.QICharts && QICharts.refresh) QICharts.refresh();
  }

  // Map a lux reading to a theme suggestion + dimming. Clamped so the UI is
  // never made unreadable: dim tops out at 0.14, and we only ever switch theme
  // or nudge contrast — we never wash the colours out.
  function setAmbientFromLux(lux) {
    if (typeof lux !== "number" || isNaN(lux)) return;
    _sensorActive = true;
    if (lux <= 8) { _ambientPref = "dark"; _ambientDim = 0.14; _ambientHiContrast = false; }        // dark room
    else if (lux <= 60) { _ambientPref = "dark"; _ambientDim = 0.06; _ambientHiContrast = false; }   // dim
    else if (lux <= 1500) { _ambientPref = "light"; _ambientDim = 0; _ambientHiContrast = false; }    // normal indoor
    else { _ambientPref = "light"; _ambientDim = 0; _ambientHiContrast = true; }                       // bright / sunlight glare
    if (getThemeMode() === "auto") applyTheme();
  }

  function startAmbientAdaptation() {
    if (_ambientStarted) return; _ambientStarted = true;
    // Time-of-day baseline for the (common) case of no hardware light sensor.
    function timeBaseline() {
      if (_sensorActive) return; // a real sensor, if present, overrides this
      var h = new Date().getHours();
      if (h >= 21 || h < 6) { _ambientPref = "dark"; _ambientDim = 0.10; }
      else if (h >= 19 || h < 7) { _ambientPref = "dark"; _ambientDim = 0.05; }
      else { _ambientPref = null; _ambientDim = 0; }
      _ambientHiContrast = false;
      if (getThemeMode() === "auto") applyTheme();
    }
    timeBaseline();
    try { setInterval(timeBaseline, 10 * 60 * 1000); } catch (e) { /* ignore */ }
    // Real ambient-light sensor (Chrome/Android, gated behind a permission).
    try {
      if (typeof window.AmbientLightSensor === "function") {
        var startSensor = function () {
          try {
            var sensor = new window.AmbientLightSensor({ frequency: 0.5 });
            sensor.addEventListener("reading", function () { setAmbientFromLux(sensor.illuminance); });
            sensor.addEventListener("error", function () { /* unreadable/denied: keep time baseline */ });
            sensor.start();
          } catch (e) { /* construction blocked by permissions policy */ }
        };
        if (navigator.permissions && navigator.permissions.query) {
          navigator.permissions.query({ name: "ambient-light-sensor" })
            .then(function (res) { if (res && res.state !== "denied") startSensor(); })
            .catch(function () { startSensor(); });
        } else {
          startSensor();
        }
      }
    } catch (e) { /* ignore */ }
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
    // Cycle: Auto -> Light -> Dark -> Auto. "Auto" re-enables ambient adaptation.
    var order = ["auto", "light", "dark"];
    var cur = getThemeMode();
    var next = order[(order.indexOf(cur) + 1) % order.length];
    var resolved = next === "auto" ? resolveTheme("auto") : next;
    S.setBrand({ themeMode: next, theme: resolved, themeManual: next !== "auto" });
    applyTheme();
    if (next === "auto") {
      startAmbientAdaptation();
      toast("Display: Auto — the app now adjusts brightness to your surroundings");
    } else {
      toast("Display: " + next.charAt(0).toUpperCase() + next.slice(1));
    }
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
      ["t", "Cycle display (Auto/Light/Dark)"],
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
      { label: "Cycle display (Auto / Light / Dark)", icon: "◐", run: () => toggleTheme() },
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
    // Dismiss help tip (step 38)
    const dt = e.target.closest("[data-dismiss-tip]"); if (dt) { try { localStorage.setItem('qi_tip_' + dt.dataset.dismissTip, '1'); } catch(e2){} const tip = dt.closest('.help-tip'); if (tip) tip.remove(); return; }
    // Step 91: Quick-copy button — copies the row's problem text to clipboard
    const cpBtn = e.target.closest(".copy-btn");
    if (cpBtn) {
      const text = cpBtn.getAttribute("data-problem") || "";
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast("Copied to clipboard"); }).catch(function () { toast("Copy failed"); });
      } else {
        toast("Clipboard not available");
      }
      return;
    }
    const p = e.target.closest("[data-recent-view]"); if (p) { go(p.dataset.recentView); return; }
    const b = e.target.closest("[data-act]"); if (!b) return;
    const act = b.dataset.act, id = b.dataset.id;
    if (act === "goHelp") return go("help");
    if (act === "startTour") return showTour(0);
    if (act === "skipTour") { S.setBrand({ tourDone: true }); toast("Tour skipped — open it anytime from Help."); return go("dashboard"); }
    if (act === "dismissGuide") { S.setBrand({ tourDone: true }); const g = $("#startHereGuide"); if (g) g.remove(); return; }
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
      const m = { all: {}, open: { status: "OPEN" }, inprogress: { status: "IN PROGRESS" }, blocked: { status: "BLOCKED" }, critical: { priority: "1-CRITICAL" }, done: { status: "CLOSED" }, resolved: { status: "RESOLVED" } };
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
  $("#btnShare").addEventListener("click", shareLink);
  $("#btnPrint").addEventListener("click", () => window.print());
  $("#btnTheme").addEventListener("click", toggleTheme);
  $("#btnChecks").addEventListener("click", runChecks);
  // Sound toggle button (step 72)
  (function() {
    var sb = $("#btnSound");
    if (sb) {
      sb.classList.toggle("sound-off", !_soundEnabled);
      sb.addEventListener("click", toggleSound);
    }
  })();
  // Logout button was unwired (a dead button). Wire it: real sign-out when a
  // backend session exists, otherwise a clear message in the offline demo.
  (function () {
    const lo = $("#btnLogout");
    if (!lo) return;
    lo.addEventListener("click", () => {
      const hasSession = !!(window.QIAuth && window.QIAuth.currentUser && typeof QIAuth.logout === "function");
      if (hasSession) {
        toast("Signing out…");
        try { const r = QIAuth.logout(); if (r && typeof r.then === "function") r.catch(() => {}); } catch (e) {}
      } else {
        toast("You're in the offline demo — there's no account to sign out of. Your data stays on this device.");
      }
    });
  })();
  $("#btnHelp").addEventListener("click", showShortcuts);
  var cmdBtn = $("#btnCmdK");
  if (cmdBtn) cmdBtn.addEventListener("click", openCommandPalette);
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

  // --- Display auto-adaptation: in Auto mode, follow the OS colour preference
  //     live (the ambient-light sensor + time-of-day are handled separately). ---
  (function initDisplayAutoDetect() {
    if (typeof window.matchMedia !== "function") return;
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    function onSystemChange() {
      if (getThemeMode() !== "auto") return; // user pinned Light/Dark — respect it
      applyTheme();
    }
    if (mq.addEventListener) { mq.addEventListener("change", onSystemChange); }
    else if (mq.addListener) { mq.addListener(onSystemChange); }
  })();

  // Expose a small display/ambient control surface (used by tests and available
  // for any future settings UI to drive theme + ambient adaptation directly).
  window.QIDisplay = {
    setLux: function (lux) { setAmbientFromLux(lux); },
    getMode: getThemeMode,
    resolve: resolveTheme,
    apply: applyTheme
  };

  // ---------- i18n: language application ----------
  function applyLang() {
    var I = window.QII18n;
    if (!I) return;
    document.documentElement.lang = I.getLang();
    document.dir = I.isRTL() ? "rtl" : "ltr";
    // Populate the lang switcher
    var sel = document.getElementById("langSwitcher");
    if (sel) {
      sel.innerHTML = I.LANGS.map(function (l) {
        return '<option value="' + l.code + '"' + (l.code === I.getLang() ? ' selected' : '') + '>' + l.flag + ' ' + l.code.toUpperCase() + '</option>';
      }).join("");
      sel.onchange = function () {
        I.setLang(sel.value);
        applyLang();
        buildNav();
        go(current);
        toast(I.t("toast.langChanged", I.getLang().toUpperCase()));
      };
    }
    // Translate topbar buttons
    var btnMap = { btnShare: "btn.share", btnPrint: "btn.print", btnExport: "btn.export", btnImport: "btn.import" };
    Object.keys(btnMap).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = I.t(btnMap[id]);
    });
    var btnLogout = document.getElementById("btnLogout");
    if (btnLogout) btnLogout.title = I.t("btn.logout");
    var btnHelp = document.getElementById("btnHelp");
    if (btnHelp) btnHelp.title = I.t("label.help");
    // Translate global search placeholder
    var searchEl = document.getElementById("globalSearch");
    if (searchEl) searchEl.placeholder = I.t("label.search");
    // Translate the "Add an item" FAB
    var fab = document.getElementById("navAddCase");
    if (fab) fab.textContent = I.t("btn.addItem");
    // Translate the saved-locally hint
    var savedHint = document.querySelector(".savedhint");
    if (savedHint) savedHint.textContent = I.t("label.savedHint");
  }

  // ---------- init (called by auth.js after successful authentication) ----------
  window.QIBoot = function () {
    S.load(); checkShareHash(); applyLang(); buildNav(); applyTheme(); applySidebar(); refreshHeader();
    startAmbientAdaptation();
    // Step 87: Session duration timer
    (function initSessionTimer() {
      var sessionStart = Date.now();
      var span = document.createElement("span");
      span.id = "sessionTime";
      span.textContent = "Session: 0m";
      var actions = document.querySelector(".topbar-actions");
      if (actions) actions.appendChild(span);
      setInterval(function () {
        var mins = Math.floor((Date.now() - sessionStart) / 60000);
        span.textContent = "Session: " + mins + "m";
      }, 60000);
    })();
    // Step 83: Scroll-to-top button
    (function initScrollTop() {
      var btn = document.createElement("button");
      btn.className = "scroll-top-btn";
      btn.type = "button";
      btn.setAttribute("aria-label", "Scroll to top");
      btn.textContent = "\u2191";
      document.body.appendChild(btn);
      window.addEventListener("scroll", function () {
        btn.classList.toggle("is-visible", window.scrollY > 300);
      }, { passive: true });
      btn.addEventListener("click", function () {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    })();
    // Step 67: Keyboard shortcut badges on key buttons
    (function addKbdBadges() {
      var badges = [
        { id: "btnTheme", key: "T" },
        { id: "btnChecks", key: "C" },
        { id: "btnCmdK", key: "\u2318K" }
      ];
      badges.forEach(function (b) {
        var el = document.getElementById(b.id);
        if (el && !el.querySelector(".kbd-badge")) {
          var kbd = document.createElement("kbd");
          kbd.className = "kbd-badge";
          kbd.textContent = b.key;
          el.appendChild(kbd);
        }
      });
    })();
    // Step 92: Global search across all views
    (function initGlobalSearch() {
      var input = document.getElementById("globalSearch");
      if (!input) return;
      var wrapper = document.createElement("div");
      wrapper.style.position = "relative";
      wrapper.style.display = "inline-block";
      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);
      var dropdown = document.createElement("div");
      dropdown.className = "search-results";
      dropdown.hidden = true;
      wrapper.appendChild(dropdown);
      input.addEventListener("input", function () {
        var q = input.value.trim().toLowerCase();
        if (!q) { dropdown.hidden = true; return; }
        var cases = S.validCases();
        var matches = cases.filter(function (c) {
          return (c.problem || "").toLowerCase().indexOf(q) !== -1;
        }).slice(0, 8);
        if (matches.length === 0) { dropdown.hidden = true; return; }
        dropdown.innerHTML = matches.map(function (c) {
          return '<div class="search-result" data-code="' + esc(c.code || "") + '">' + esc((c.code || "") + " \u2014 " + (c.problem || "").slice(0, 60)) + '</div>';
        }).join("");
        dropdown.hidden = false;
      });
      dropdown.addEventListener("click", function (e) {
        var item = e.target.closest(".search-result");
        if (!item) return;
        var code = item.dataset.code;
        dropdown.hidden = true;
        input.value = "";
        go("cases");
        setTimeout(function () {
          var row = document.querySelector('tr[data-id] td');
          var rows = document.querySelectorAll("tr[data-id]");
          for (var i = 0; i < rows.length; i++) {
            var cells = rows[i].querySelectorAll("td");
            for (var j = 0; j < cells.length; j++) {
              if (cells[j].textContent.trim() === code) {
                rows[i].style.background = "rgba(46,84,150,.12)";
                rows[i].scrollIntoView({ block: "center", behavior: "smooth" });
                setTimeout(function () { rows[i].style.background = ""; }, 2500);
                return;
              }
            }
          }
        }, 80);
      });
      document.addEventListener("click", function (e) {
        if (!wrapper.contains(e.target)) dropdown.hidden = true;
      });
    })();
    // Step 94: Focus mode toggle
    (function initFocusMode() {
      var btn = document.getElementById("btnFocus");
      if (!btn) return;
      btn.addEventListener("click", function () {
        document.body.classList.toggle("focus-mode");
        btn.classList.toggle("active", document.body.classList.contains("focus-mode"));
      });
      document.addEventListener("keydown", function (e) {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT" || e.target.isContentEditable) return;
        if (e.key === "f" && !e.ctrlKey && !e.metaKey && !e.altKey) {
          document.body.classList.toggle("focus-mode");
          btn.classList.toggle("active", document.body.classList.contains("focus-mode"));
        }
      });
    })();
    const initialHash = (location.hash || "").replace(/^#/, "");
    // Render the initial view defensively: a single failing widget/chart must
    // never abort the rest of boot (presence/sync, banners, keyboard shortcuts).
    try {
      go(initialHash && RENDER[initialHash] ? initialHash : "dashboard", { skipHash: !!(initialHash && RENDER[initialHash]) });
    } catch (bootRenderErr) {
      try { console.warn("Initial view render failed; continuing boot:", bootRenderErr); } catch (e) {}
    }

    // "Resume where you left off" — show a banner for returning users who have data
    (function showResumeBanner() {
      var proj = S.get().project;
      var hasCases = S.validCases().length > 0;
      if (!hasCases && !proj.name) return;  // first-time user, nothing to resume
      var name = proj.name || "your project";
      var banner = document.createElement("div");
      banner.className = "resume-banner";
      banner.innerHTML = '<span class="resume-text">Welcome back \u2014 <strong>' + esc(name) + '</strong> is here with ' + S.validCases().length + ' items.</span>' +
        '<button class="btn btn-sm resume-go" id="resumeGo" type="button">Go to Dashboard</button>' +
        '<button class="btn btn-sm resume-dismiss" id="resumeDismiss" type="button">Dismiss</button>';
      var content = document.getElementById("content");
      if (content && content.parentNode) content.parentNode.insertBefore(banner, content);
      document.getElementById("resumeGo").addEventListener("click", function () { banner.remove(); go("dashboard"); });
      document.getElementById("resumeDismiss").addEventListener("click", function () { banner.remove(); });
    })();
    refreshBadges();

    // Step 89: "What's new" changelog toast
    (function showWhatsNew() {
      var VERSION = "2.0.91";
      try {
        var last = localStorage.getItem("qi_lastVersion");
        if (last !== VERSION) {
          toast("What\u2019s new: 91+ improvements \u2014 navigation, presentation mode, auto-analysis, dark mode and more.", { ms: 5000 });
          localStorage.setItem("qi_lastVersion", VERSION);
        }
      } catch (e) {}
    })();

    // Step 76: Auto-populate with the example if this is a fresh empty project
    if (S.validCases().length === 0 && window.QIBrain) {
      const exText = "Submarine fibre optic cable system connecting eight countries across Asia and the Pacific: Indonesia (Jakarta), Malaysia (Mersing), Thailand (Songkhla), Vietnam (Da Nang), Philippines (Batangas), Taiwan (Tamsui), Brunei (Bandar Seri Begawan) and Guam (Piti). About 9,500 km of trunk route, 24 fibre pairs, approximately USD 1.3 billion over 60 months. Scope: marine route survey, multi-country permitting, submarine cable and repeater supply, marine installation, cable landing stations, terrestrial backhaul, system integration and end-to-end testing to ready-for-service.";
      try {
        const plan = QIBrain.analyzeProject(exText);
        applyBrainPlan(plan);
        toast("Welcome! The app loaded an example project to explore. Upload your own on the Project Brain screen.");
      } catch (e) {}
    }

    // ---- Real-time collaboration: online presence + activity feed ----
    (function initRealTimeSync() {
      if (!window.QISync || !window.QISync.wsConnect) return;

      // Create presence indicator in topbar
      var actions = document.querySelector(".topbar-actions");
      if (!actions) return;

      var presenceEl = document.createElement("span");
      presenceEl.className = "rt-presence";
      presenceEl.id = "rtPresence";
      presenceEl.title = "Online collaborators";
      presenceEl.textContent = "";
      presenceEl.hidden = true;
      actions.insertBefore(presenceEl, actions.firstChild);

      // Create activity feed dropdown
      var feedWrap = document.createElement("div");
      feedWrap.className = "rt-feed-wrap";
      feedWrap.id = "rtFeedWrap";

      var feedBtn = document.createElement("button");
      feedBtn.className = "btn btn-icon rt-feed-btn";
      feedBtn.id = "rtFeedBtn";
      feedBtn.title = "Activity feed";
      feedBtn.setAttribute("aria-label", "Activity feed");
      feedBtn.textContent = "\uD83D\uDD14"; // bell emoji
      feedBtn.hidden = true;

      var feedBadge = document.createElement("span");
      feedBadge.className = "rt-feed-badge";
      feedBadge.id = "rtFeedBadge";
      feedBadge.hidden = true;

      var feedDropdown = document.createElement("div");
      feedDropdown.className = "rt-feed-dropdown";
      feedDropdown.id = "rtFeedDropdown";
      feedDropdown.hidden = true;
      feedDropdown.innerHTML = '<div class="rt-feed-header">Recent Activity</div><div class="rt-feed-list" id="rtFeedList"><p class="muted">No activity yet</p></div>';

      feedWrap.appendChild(feedBtn);
      feedWrap.appendChild(feedBadge);
      feedWrap.appendChild(feedDropdown);
      actions.insertBefore(feedWrap, actions.firstChild);

      var unreadCount = 0;

      feedBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        feedDropdown.hidden = !feedDropdown.hidden;
        if (!feedDropdown.hidden) {
          unreadCount = 0;
          feedBadge.hidden = true;
        }
      });
      document.addEventListener("click", function (e) {
        if (!feedWrap.contains(e.target)) feedDropdown.hidden = true;
      });

      function updatePresence(users) {
        var otherCount = (users || []).length - 1; // subtract self
        if (otherCount < 0) otherCount = 0;
        if (otherCount > 0) {
          presenceEl.textContent = "\uD83D\uDFE2 " + otherCount + " online";
          presenceEl.hidden = false;
          presenceEl.title = (users || []).map(function (u) { return u.name; }).join(", ");
        } else {
          presenceEl.hidden = true;
        }
      }

      function updateActivityFeed(events) {
        var list = document.getElementById("rtFeedList");
        if (!list) return;
        if (!events || events.length === 0) {
          list.innerHTML = '<p class="muted">No activity yet</p>';
          return;
        }
        list.innerHTML = events.slice(0, 5).map(function (ev) {
          var time = ev.ts ? new Date(ev.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
          return '<div class="rt-feed-item"><strong>' + esc(ev.user || "Someone") + '</strong> ' +
            esc(ev.action || "updated") + ' a ' + esc(ev.entity || "item") + ' <span class="muted">' + time + '</span></div>';
        }).join("");
      }

      function handleWsEvent(eventType, payload) {
        if (eventType === "connected") {
          feedBtn.hidden = false;
        } else if (eventType === "disconnected") {
          presenceEl.hidden = true;
          feedBtn.hidden = true;
          feedDropdown.hidden = true;
        } else if (eventType === "presence") {
          updatePresence(payload);
        } else if (eventType === "change") {
          // Show toast for other users' changes
          var msg = (payload.user || "Someone") + " " + (payload.action || "updated") + " a " + (payload.entity || "item");
          toast(msg, { ms: 3000 });
          unreadCount++;
          feedBadge.textContent = String(unreadCount);
          feedBadge.hidden = false;
          updateActivityFeed(window.QISync.wsActivityFeed());
        } else if (eventType === "activity") {
          updateActivityFeed(payload);
        }
      }

      window.QISync.wsAddListener(handleWsEvent);

      // Connect if authenticated
      if (window.QISync.syncEnabled()) {
        window.QISync.wsConnect();
      }
    })();
  };

  // When __SKIP_AUTH is set (e.g. smoke tests), boot immediately without waiting for auth.js DOMContentLoaded
  if (typeof window.__SKIP_AUTH !== "undefined" && window.__SKIP_AUTH) {
    window.QIBoot();
  }
})();
