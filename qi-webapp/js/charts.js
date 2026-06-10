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

  // Pareto: bars (value) + cumulative % line on a second axis.
  function pareto(id, labels, values, cum, title) {
    mk(id, {
      data: {
        labels,
        datasets: [
          { type: "bar", label: "Value", data: values, backgroundColor: "#2e5496", yAxisID: "y", order: 2 },
          { type: "line", label: "Cumulative %", data: cum, borderColor: "#c00000", backgroundColor: "transparent", yAxisID: "y1", tension: .2, order: 1 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { title: { display: !!title, text: title } },
        scales: {
          y: { beginAtZero: true, position: "left" },
          y1: { beginAtZero: true, max: 100, position: "right", grid: { drawOnChartArea: false }, ticks: { callback: v => v + "%" } }
        } }
    });
  }

  // Control chart: the metric line + flat center/UCL/LCL reference lines.
  function control(id, labels, values, mean, ucl, lcl, title) {
    const flat = v => labels.map(() => v);
    mk(id, {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Metric", data: values, borderColor: "#2e5496", backgroundColor: "transparent", tension: .2, spanGaps: true, pointRadius: 4 },
          { label: "Center (mean)", data: flat(mean), borderColor: "#548235", borderDash: [4, 3], pointRadius: 0 },
          { label: "UCL", data: flat(ucl), borderColor: "#c00000", borderDash: [6, 4], pointRadius: 0 },
          { label: "LCL", data: flat(lcl), borderColor: "#c00000", borderDash: [6, 4], pointRadius: 0 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { title: { display: !!title, text: title } },
        scales: { y: { beginAtZero: true } } }
    });
  }

  root.QICharts = { destroyAll, bar, hbar, pie, grouped, lines, pareto, control, PALETTE };
})(typeof window !== "undefined" ? window : globalThis);
