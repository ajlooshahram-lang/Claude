/* QI Platform - UI: navigation, views, case form, import/export. */
(function () {
  "use strict";
  const C = window.QICalc, S = window.QIStore, CH = window.QICharts;
  const $ = sel => document.querySelector(sel);
  const content = $("#content");
  const uiState = { caseFilter: { q: "", status: "", priority: "", owner: "", sort: "rpn" }, regFilter: {} };

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
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => t.hidden = true, 2200); }
  function tableWrap(head, rows, cls) {
    if (!rows) return `<div class="empty">No data yet. Click <b>+ New Case</b> to start.</div>`;
    return `<div class="table-wrap"><table class="${cls || ""}"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // ---------- views config ----------
  const VIEWS = [
    { g: "Overview" },
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
    { g: "Improve" },
    { id: "pdca", label: "PDCA", icon: "↻" },
    { id: "log", label: "Action Log", icon: "✎" },
    { g: "People & Cost" },
    { id: "stakeholders", label: "Stakeholders", icon: "♟" },
    { id: "budget", label: "Budget", icon: "$" },
    { g: "Intelligence" },
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

  function buildNav() {
    const nav = $("#nav");
    nav.innerHTML = VIEWS.map(v => v.g
      ? `<div class="nav-sep">${esc(v.g)}</div>`
      : `<button class="nav-item" data-view="${v.id}"><span class="ico">${v.icon}</span>${esc(v.label)}</button>`).join("");
    nav.querySelectorAll(".nav-item").forEach(b => b.addEventListener("click", () => go(b.dataset.view)));
  }

  let current = "dashboard";
  function go(view, opts) {
    if (!RENDER[view]) view = "dashboard";
    current = view;
    $("#viewTitle").textContent = TITLES[view] || "QI Platform";
    document.querySelectorAll(".nav-item").forEach(b => {
      const active = b.dataset.view === view;
      b.classList.toggle("active", active);
      if (active) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    $("#sidebar").classList.remove("open");
    CH.destroyAll();
    content.innerHTML = (RENDER[view] || (() => "<div class='empty'>Not found</div>"))();
    if (AFTER[view]) AFTER[view]();
    // Reflect the current view in the URL so back/forward and bookmarks work.
    if (!(opts && opts.skipHash)) {
      const target = "#" + view;
      if (location.hash !== target) {
        try { history.pushState(null, "", target); } catch (e) { try { location.hash = target; } catch (_) {} }
      }
    }
    window.scrollTo(0, 0);
  }

  // ---------- renderers ----------
  const RENDER = {};
  const AFTER = {};

  RENDER.dashboard = function () {
    const k = S.kpis();
    const kpi = (cls, label, val) => `<div class="kpi ${cls}"><div class="label">${label}</div><div class="value">${val}</div></div>`;
    if (k.total === 0) {
      return `<div class="card empty-cta">
          <h2>You haven't added any cases yet</h2>
          <p>Get started by adding your first case. It will automatically populate every other view — PM tasks, scored risk, FMEA line, PDCA cycle, action-log entry, Gantt bar and budget line — all live.</p>
          <div class="empty-cta-actions">
            <button class="btn btn-primary" data-act="add">+ Add your first case</button>
            <button class="btn" data-act="goHelp">How it works</button>
          </div>
        </div>
        <p class="muted" style="text-align:center;margin-top:14px">Tip — press <span class="kbd">n</span> any time to add a new case, or <span class="kbd">?</span> to see all keyboard shortcuts.</p>`;
    }
    return `
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
    const names = S.get().roster.map(r => r.name).filter(Boolean);
    const rows = list.map(c => `
      <tr data-id="${c.id}">
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
        ${(f.status||f.priority||f.owner)?'<button class="btn btn-sm" data-act="clearflt">Clear</button>':''}
        <span class="grow"></span><button class="btn" data-act="csv">Export CSV</button>
        <span class="muted">${list.length} shown</span>
      </div>
      ${tableWrap("<th>ID</th><th class='wrap'>Problem</th><th>Category</th><th>Priority</th><th>RPN</th><th>Health</th><th>Owner</th><th>Status</th><th>% Done</th><th></th>", rows)}`;
  };
  AFTER.cases = function () {
    const bind = (id, key) => { const el = $("#" + id); if (el) el.addEventListener("change", () => { uiState.caseFilter[key] = el.value; go("cases"); }); };
    bind("fltStatus", "status"); bind("fltPriority", "priority"); bind("fltOwner", "owner"); bind("fltSort", "sort");
    // inline-edit: change priority / owner / status without opening the form
    content.querySelectorAll("select[data-edit]").forEach(sel => {
      sel.addEventListener("change", () => {
        const cid = sel.dataset.id, field = sel.dataset.edit;
        S.updateCase(cid, { [field]: sel.value });
        toast("Updated " + field);
        go("cases");
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
    return `<div class="card"><h3>How it works</h3><div class="steps">
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
    const cols = KCOLS.map(st => {
      const cards = e.filter(c => c.status === st).map(c => `
        <div class="kcard" draggable="true" data-id="${c.id}">
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
    content.querySelectorAll(".kcard").forEach(card => {
      card.addEventListener("dragstart", e => { dragId = card.dataset.id; if (e.dataTransfer) e.dataTransfer.setData("text/plain", dragId); card.style.opacity = ".5"; });
      card.addEventListener("dragend", () => { card.style.opacity = "1"; });
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
    const srows = snaps.length ? snaps.map(s => `<tr>
      <td>${esc(new Date(s.ts).toLocaleString())}</td><td>${esc(s.label)}</td>
      <td class="center">${(s.data.cases || []).filter(c => c.problem).length}</td>
      <td class="center"><button class="btn btn-sm" data-act="restore" data-id="${s.id}">Restore</button>
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
      <div class="card"><div class="card-head"><h3>Change history</h3>
        <button class="btn btn-sm" data-act="clearaudit">Clear log</button></div>
        ${tableWrap("<th>When</th><th>Action</th><th>Case</th><th class='wrap'>Detail</th>", arows)}</div>`;
  };

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
    let rows = S.regRows(reg.id);
    if (q) rows = rows.filter(r => reg.columns.some(c => String(r[c.key] || "").toLowerCase().includes(q)));
    const head = `<th>ID</th>` + reg.columns.map(c => `<th${c.type === "text" && c.w >= 200 ? " class='wrap'" : ""}>${esc(c.label)}</th>`).join("") + "<th></th>";
    const body = rows.map(r => {
      const idx = S.regRows(reg.id).indexOf(r);
      const tds = reg.columns.map(c => {
        if (c.type === "computed") return `<td class="center">${cellComputed(c, r)}</td>`;
        if (c.badge && (c.type === "select")) {
          // editable select but show colour cue via wrapper; keep editor for usability
          return `<td>${cellEditor(reg, r, c, ctx)}</td>`;
        }
        return `<td${c.w >= 200 ? " class='wrap'" : ""}>${cellEditor(reg, r, c, ctx)}</td>`;
      }).join("");
      return `<tr><td>${reg.idPrefix}-${String(idx + 1).padStart(3, "0")}</td>${tds}
        <td class="center"><button class="btn btn-sm btn-danger" data-act="regdel" data-reg="${reg.id}" data-id="${r._id}">Del</button></td></tr>`;
    }).join("");
    for (let i = 0; i < reg.columns.length; i++) { } // (widths set via colgroup below)
    const colg = `<colgroup><col style="width:80px">` + reg.columns.map(c => `<col style="width:${c.w || 120}px">`).join("") + `<col style="width:64px"></colgroup>`;
    return `<div class="toolbar">
        <button class="btn btn-primary" data-act="regadd" data-reg="${reg.id}">+ Add row</button>
        <span class="grow"></span><span class="muted">${rows.length} row(s) · choose-only</span>
      </div>
      <div class="table-wrap"><table>${colg}<thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${reg.columns.length + 2}" class="muted center" style="padding:24px">No rows yet — click <b>+ Add row</b>.</td></tr>`}</tbody></table></div>`;
  }
  function afterRegister(reg) {
    content.querySelectorAll(`[data-reg="${reg.id}"][data-row]`).forEach(el => {
      el.addEventListener("change", () => {
        const key = el.dataset.key, col = reg.columns.find(c => c.key === key);
        let val = el.value;
        if (col && col.type === "num") val = val === "" ? "" : Number(val);
        S.regUpdate(reg.id, el.dataset.row, { [key]: val });
        go(reg.id);
      });
    });
    const sb = $("#regQ");
    if (sb) sb.addEventListener("input", () => {
      uiState.regFilter[reg.id] = sb.value; const pos = sb.selectionStart;
      go(reg.id); const n = $("#regQ"); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} }
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
  function showShortcuts() {
    const rows = [
      ["?", "Show this list"],
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
    if (act === "add") openCaseForm();
    else if (act === "edit") openCaseForm(id);
    else if (act === "del") confirmDelete(id);
    else if (act === "csv") exportCSV();
    else if (act === "export") exportJSON();
    else if (act === "import") importJSON();
    else if (act === "clearflt") { uiState.caseFilter = { q: "", status: "", priority: "", owner: "", sort: uiState.caseFilter.sort }; go("cases"); }
    else if (act === "snap") { S.takeSnapshot(); toast("Snapshot saved."); go("audit"); }
    else if (act === "restore") { if (confirm("Restore this snapshot? Current data is auto-backed-up first.")) { S.restoreSnapshot(id); setBrand(); toast("Snapshot restored."); go("dashboard"); } }
    else if (act === "delsnap") { S.deleteSnapshot(id); go("audit"); }
    else if (act === "clearaudit") { if (confirm("Clear the change-history log?")) { S.clearAudit(); go("audit"); } }
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
    else if (act === "goHelp") { go("help"); }
    else if (act === "a3") openA3(id);
    else if (act === "del") { closeModal(); confirmDelete(id); }
    else if (act === "confirmdel") { S.deleteCase(id); closeModal(); toast("Case deleted."); go(current === "help" ? "cases" : current); }
  });

  $("#navAddCase").addEventListener("click", () => openCaseForm());
  $("#btnExport").addEventListener("click", exportJSON);
  $("#btnImport").addEventListener("click", importJSON);
  $("#btnShare").addEventListener("click", shareLink);
  $("#btnPrint").addEventListener("click", () => window.print());
  $("#btnTheme").addEventListener("click", toggleTheme);
  $("#btnChecks").addEventListener("click", runChecks);
  $("#btnHelp").addEventListener("click", showShortcuts);
  $("#fileImport").addEventListener("change", e => { if (e.target.files[0]) handleImport(e.target.files[0]); e.target.value = ""; });
  $("#hamburger").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
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

  // ---------- init ----------
  S.load(); checkShareHash(); buildNav(); applyTheme(); refreshHeader();
  const initialHash = (location.hash || "").replace(/^#/, "");
  go(initialHash && RENDER[initialHash] ? initialHash : "dashboard", { skipHash: !!(initialHash && RENDER[initialHash]) });
})();
