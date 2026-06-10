/* QI Platform - Chart.js helpers. Charts are destroyed/rebuilt on each render. */
(function (root) {
  "use strict";
  const registry = {};
  const PALETTE = ["#2e5496", "#1f8a8a", "#c00000", "#c9a227", "#548235", "#7030a0", "#c55a11", "#44546a"];

  function destroyAll() {
    Object.keys(registry).forEach(k => { try { registry[k].destroy(); } catch (e) {} delete registry[k]; });
  }
  function mk(id, config) {
    const el = document.getElementById(id);
    if (!el || typeof Chart === "undefined") return;
    if (registry[id]) { try { registry[id].destroy(); } catch (e) {} }
    registry[id] = new Chart(el.getContext("2d"), config);
  }

  function bar(id, labels, data, title) {
    mk(id, {
      type: "bar",
      data: { labels, datasets: [{ label: title || "", data, backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]) }] },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, title: { display: !!title, text: title } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
  }
  function hbar(id, labels, data, title) {
    mk(id, {
      type: "bar",
      data: { labels, datasets: [{ label: title || "", data, backgroundColor: "#2e5496" }] },
      options: { indexAxis: "y", responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, title: { display: !!title, text: title } },
        scales: { x: { beginAtZero: true } } }
    });
  }
  function pie(id, labels, data, title) {
    mk(id, {
      type: "doughnut",
      data: { labels, datasets: [{ data, backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]) }] },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: "right" }, title: { display: !!title, text: title } } }
    });
  }
  function grouped(id, labels, series, title) {
    mk(id, {
      type: "bar",
      data: { labels, datasets: series.map((s, i) => ({ label: s.label, data: s.data, backgroundColor: PALETTE[i % PALETTE.length] })) },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { title: { display: !!title, text: title } },
        scales: { y: { beginAtZero: true } } }
    });
  }
  function lines(id, labels, series, title) {
    mk(id, {
      type: "line",
      data: { labels, datasets: series.map((s, i) => ({ label: s.label, data: s.data, borderColor: PALETTE[i % PALETTE.length], backgroundColor: "transparent", tension: .3, spanGaps: true, borderDash: s.dash || [] })) },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { title: { display: !!title, text: title } },
        scales: { y: { beginAtZero: true } } }
    });
  }

  root.QICharts = { destroyAll, bar, hbar, pie, grouped, lines, PALETTE };
})(typeof window !== "undefined" ? window : globalThis);
