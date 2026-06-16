/* QI Platform - API sync layer: replicates local project/case mutations to the backend. */
(function (root) {
  "use strict";

  // ---- ID mapping: local uid() <-> server cuid ----
  var localToServer = {};
  var serverToLocal = {};

  function registerMapping(localId, serverId) {
    if (localId && serverId) {
      localToServer[localId] = serverId;
      serverToLocal[serverId] = localId;
    }
  }
  function mapLocalToServer(localId) { return localToServer[localId] || null; }
  function mapServerToLocal(serverId) { return serverToLocal[serverId] || null; }

  // ---- Sync enabled check ----
  function syncEnabled() {
    return !!(root.QIAuth && root.QIAuth.currentUser);
  }

  // ---- Toast helper ----
  function showError(msg) {
    try {
      var toast = (typeof document !== "undefined") && document.getElementById("toast");
      if (toast) {
        toast.textContent = "Sync: " + msg;
        toast.hidden = false;
        toast.className = "toast toast-error";
        setTimeout(function () { toast.hidden = true; toast.className = "toast"; }, 4000);
      }
    } catch (e) { /* ignore */ }
  }

  // ---- API helpers (fire-and-forget pattern) ----
  function apiFetch(url, opts) {
    if (!syncEnabled()) return Promise.resolve(null);
    return root.QIAuth.authFetch(url, opts).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          showError((body && body.message) || "Request failed (" + res.status + ")");
          return null;
        });
      }
      return res.json().catch(function () { return null; });
    }).catch(function (err) {
      showError(err.message || "Network error");
      return null;
    });
  }

  // ---- Fire-and-forget sync wrappers ----

  function syncCreateProject(name, localId) {
    apiFetch("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name: name, status: "PLANNING" })
    }).then(function (data) {
      if (data && data.project && data.project.id) {
        registerMapping(localId, data.project.id);
      }
    });
  }

  function syncRenameProject(serverId, name) {
    if (!serverId) return;
    apiFetch("/api/projects/" + serverId, {
      method: "PUT",
      body: JSON.stringify({ name: name })
    });
  }

  function syncDeleteProject(serverId) {
    if (!serverId) return;
    apiFetch("/api/projects/" + serverId, { method: "DELETE" });
  }

  function syncCreateCase(projectServerId, caseData, localId) {
    if (!projectServerId) return;
    var body = {};
    if (caseData.problem) body.problem = caseData.problem;
    if (caseData.category) body.category = caseData.category;
    if (caseData.priority) body.priority = caseData.priority;
    if (caseData.status) body.status = caseData.status;
    if (caseData.owner) body.owner = caseData.owner;
    if (caseData.leanMethod) body.leanMethod = caseData.leanMethod;
    if (caseData.target) body.target = caseData.target;
    if (caseData.rootCause) body.rootCause = caseData.rootCause;
    if (caseData.sev != null) body.sev = Number(caseData.sev);
    if (caseData.occ != null) body.occ = Number(caseData.occ);
    if (caseData.det != null) body.det = Number(caseData.det);
    if (caseData.percent != null) body.percent = Number(caseData.percent);
    apiFetch("/api/projects/" + projectServerId + "/cases", {
      method: "POST",
      body: JSON.stringify(body)
    }).then(function (data) {
      if (data && data.case && data.case.id) {
        registerMapping(localId, data.case.id);
      }
    });
  }

  function syncUpdateCase(projectServerId, caseServerId, patch) {
    if (!projectServerId || !caseServerId) return;
    apiFetch("/api/projects/" + projectServerId + "/cases/" + caseServerId, {
      method: "PUT",
      body: JSON.stringify(patch)
    });
  }

  function syncDeleteCase(projectServerId, caseServerId) {
    if (!projectServerId || !caseServerId) return;
    apiFetch("/api/projects/" + projectServerId + "/cases/" + caseServerId, { method: "DELETE" });
  }

  function syncBulkUpdate(projectServerId, ids, patch) {
    if (!projectServerId || !ids || !ids.length) return;
    apiFetch("/api/projects/" + projectServerId + "/cases/bulk-update", {
      method: "POST",
      body: JSON.stringify({ ids: ids, updates: patch })
    });
  }

  function syncBulkDelete(projectServerId, ids) {
    if (!projectServerId || !ids || !ids.length) return;
    apiFetch("/api/projects/" + projectServerId + "/cases/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ ids: ids })
    });
  }

  // ---- Load from server (async, returns workspace-compatible structure) ----
  function loadFromServer() {
    if (!syncEnabled()) return Promise.resolve(null);

    return apiFetch("/api/projects", { method: "GET" }).then(function (data) {
      if (!data || !data.projects) return null;

      var projects = data.projects;
      if (!projects.length) {
        // Create a default project on the server
        return apiFetch("/api/projects", {
          method: "POST",
          body: JSON.stringify({ name: "QI Intelligence Program", status: "PLANNING" })
        }).then(function (created) {
          if (!created || !created.project) return null;
          return [created.project];
        }).then(function (projList) {
          if (!projList) return null;
          return buildWorkspaceFromServer(projList);
        });
      }

      return buildWorkspaceFromServer(projects);
    });
  }

  function buildWorkspaceFromServer(projects) {
    // Fetch cases for each project in parallel
    var casePromises = projects.map(function (proj) {
      return apiFetch("/api/projects/" + proj.id + "/cases", { method: "GET" }).then(function (data) {
        return { projectId: proj.id, cases: (data && data.cases) || [] };
      });
    });

    return Promise.all(casePromises).then(function (results) {
      var caseMap = {};
      results.forEach(function (r) { caseMap[r.projectId] = r.cases; });

      // Build structure for each project
      var wsProjects = {};
      var order = [];
      projects.forEach(function (proj) {
        var localId = mapServerToLocal(proj.id) || proj.id;
        registerMapping(localId, proj.id);
        order.push(localId);

        var serverCases = (caseMap[proj.id] || []).map(function (sc) {
          var caseLocalId = mapServerToLocal(sc.id) || sc.id;
          registerMapping(caseLocalId, sc.id);
          return {
            id: caseLocalId,
            problem: sc.problem || "",
            category: sc.category || "",
            priority: sc.priority || "",
            status: sc.status || "OPEN",
            owner: sc.owner || "",
            leanMethod: sc.leanMethod || "",
            target: sc.target || "",
            rootCause: sc.rootCause || "",
            sev: sc.sev != null ? sc.sev : "",
            occ: sc.occ != null ? sc.occ : "",
            det: sc.det != null ? sc.det : "",
            percent: sc.percent != null ? sc.percent : 0,
            dateLogged: sc.createdAt ? sc.createdAt.slice(0, 10) : "",
            startDate: sc.startDate || "",
            costCat: sc.costCat || "",
            estCost: sc.estCost != null ? sc.estCost : "",
            actCost: sc.actCost != null ? sc.actCost : "",
            whys: ["", "", "", "", ""],
            pinned: false
          };
        });

        wsProjects[localId] = {
          project: {
            name: proj.name || "Untitled",
            status: proj.status || "PLANNING",
            sponsor: "", manager: "", org: "",
            start: "", end: "", version: "", currency: "$",
            spec: { usl: 11, lsl: 9, target: 10 }
          },
          cases: serverCases,
          roster: [],
          sigma: [],
          stakeholders: [],
          registers: {},
          audit: [],
          snapshots: [],
          gage: null,
          cashflow: null,
          xbarR: null
        };
      });

      return {
        activeId: order[0],
        order: order,
        projects: wsProjects
      };
    });
  }

  // ---- Expose module ----
  root.QISync = {
    syncEnabled: syncEnabled,
    loadFromServer: loadFromServer,
    syncCreateProject: syncCreateProject,
    syncRenameProject: syncRenameProject,
    syncDeleteProject: syncDeleteProject,
    syncCreateCase: syncCreateCase,
    syncUpdateCase: syncUpdateCase,
    syncDeleteCase: syncDeleteCase,
    syncBulkUpdate: syncBulkUpdate,
    syncBulkDelete: syncBulkDelete,
    registerMapping: registerMapping,
    mapLocalToServer: mapLocalToServer,
    mapServerToLocal: mapServerToLocal
  };

})(typeof window !== "undefined" ? window : globalThis);
