/* QI Platform - API sync layer: replicates local project/case mutations to the backend. */
(function (root) {
  "use strict";

  // ---- ID mapping: local uid() <-> server cuid ----
  var ID_MAP_KEY = "qi_sync_id_map";
  var localToServer = {};
  var serverToLocal = {};

  // Persist the ID map to localStorage so it survives page reloads.
  function persistIdMap() {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(ID_MAP_KEY, JSON.stringify(localToServer));
      }
    } catch (e) { /* ignore storage errors */ }
  }

  // Restore the ID map from localStorage on module init.
  function restoreIdMap() {
    try {
      if (typeof localStorage !== "undefined") {
        var raw = localStorage.getItem(ID_MAP_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") {
            localToServer = parsed;
            // Rebuild the reverse map
            var keys = Object.keys(localToServer);
            for (var i = 0; i < keys.length; i++) {
              serverToLocal[localToServer[keys[i]]] = keys[i];
            }
          }
        }
      }
    } catch (e) { /* ignore parse errors */ }
  }

  // Initialize ID map from localStorage
  restoreIdMap();

  function registerMapping(localId, serverId) {
    if (localId && serverId) {
      localToServer[localId] = serverId;
      serverToLocal[serverId] = localId;
      persistIdMap();
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
    if (caseData.problem != null) body.problem = caseData.problem;
    if (caseData.category != null) body.category = caseData.category;
    if (caseData.priority != null) body.priority = caseData.priority;
    if (caseData.status != null) body.status = caseData.status;
    if (caseData.owner != null) body.owner = caseData.owner;
    if (caseData.leanMethod != null) body.leanMethod = caseData.leanMethod;
    if (caseData.target != null) body.target = caseData.target;
    if (caseData.rootCause != null) body.rootCause = caseData.rootCause;
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

  // ---- Register row sync wrappers ----

  function syncRegAdd(projectServerId, regType, rowData, localId) {
    if (!projectServerId || !regType) return;
    // Filter out internal keys (prefixed with _) before sending to server
    var cleanData = {};
    Object.keys(rowData).forEach(function(k) { if (k.charAt(0) !== '_') cleanData[k] = rowData[k]; });
    apiFetch("/api/projects/" + projectServerId + "/registers/" + regType, {
      method: "POST",
      body: JSON.stringify({ data: cleanData })
    }).then(function (data) {
      if (data && data.row && data.row.id) {
        registerMapping(localId, data.row.id);
      }
    });
  }

  function syncRegUpdate(projectServerId, regType, rowServerId, patch) {
    if (!projectServerId || !regType || !rowServerId) return;
    apiFetch("/api/projects/" + projectServerId + "/registers/" + regType + "/" + rowServerId, {
      method: "PUT",
      body: JSON.stringify({ data: patch })
    });
  }

  function syncRegDelete(projectServerId, regType, rowServerId) {
    if (!projectServerId || !regType || !rowServerId) return;
    apiFetch("/api/projects/" + projectServerId + "/registers/" + regType + "/" + rowServerId, { method: "DELETE" });
  }

  function syncRegBulkDelete(projectServerId, regType, serverIds) {
    if (!projectServerId || !regType || !serverIds || !serverIds.length) return;
    apiFetch("/api/projects/" + projectServerId + "/registers/" + regType + "/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ ids: serverIds })
    });
  }

  function syncRegTogglePin(projectServerId, regType, rowServerId) {
    if (!projectServerId || !regType || !rowServerId) return;
    apiFetch("/api/projects/" + projectServerId + "/registers/" + regType + "/" + rowServerId + "/pin", { method: "PATCH" });
  }

  // ---- Project analytical data sync ----

  function syncProjectData(projectServerId, field, value) {
    if (!projectServerId || !field) return;
    var body = {};
    body[field] = value;
    apiFetch("/api/projects/" + projectServerId + "/data", {
      method: "PATCH",
      body: JSON.stringify(body)
    });
  }

  // ---- Snapshot sync ----

  function syncTakeSnapshot(projectServerId, label, localSnapshotId) {
    if (!projectServerId) return;
    var body = {};
    if (label) body.label = label;
    apiFetch("/api/projects/" + projectServerId + "/snapshots", {
      method: "POST",
      body: JSON.stringify(body)
    }).then(function (data) {
      if (data && data.snapshot && data.snapshot.id && localSnapshotId) {
        registerMapping(localSnapshotId, data.snapshot.id);
      }
    });
  }

  function syncRestoreSnapshot(projectServerId, snapshotServerId) {
    if (!projectServerId || !snapshotServerId) return;
    apiFetch("/api/projects/" + projectServerId + "/snapshots/" + snapshotServerId + "/restore", {
      method: "POST",
      body: JSON.stringify({})
    });
  }

  function syncDeleteSnapshot(projectServerId, snapshotServerId) {
    if (!projectServerId || !snapshotServerId) return;
    apiFetch("/api/projects/" + projectServerId + "/snapshots/" + snapshotServerId, {
      method: "DELETE"
    });
  }

  function syncRenameSnapshot(projectServerId, snapshotServerId, label) {
    if (!projectServerId || !snapshotServerId || !label) return;
    apiFetch("/api/projects/" + projectServerId + "/snapshots/" + snapshotServerId, {
      method: "PUT",
      body: JSON.stringify({ label: label })
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

  var REGISTER_TYPES = ["hazop", "calibration", "punch", "sil", "rtm", "docs", "ncr", "moc", "milestones", "decisions", "procurement", "resources", "okr"];

  function buildWorkspaceFromServer(projects) {
    // Fetch cases for each project in parallel
    var casePromises = projects.map(function (proj) {
      return apiFetch("/api/projects/" + proj.id + "/cases", { method: "GET" }).then(function (data) {
        return { projectId: proj.id, cases: (data && data.cases) || [] };
      });
    });

    // Fetch analytical data for each project
    var dataPromises = projects.map(function (proj) {
      return apiFetch("/api/projects/" + proj.id + "/data", { method: "GET" }).then(function (data) {
        return { projectId: proj.id, projectData: (data && data.project) || null };
      }).catch(function () {
        return { projectId: proj.id, projectData: null };
      });
    });

    // Fetch register rows for each project in parallel (all 13 types per project)
    var regPromises = [];
    projects.forEach(function (proj) {
      REGISTER_TYPES.forEach(function (regType) {
        regPromises.push(
          apiFetch("/api/projects/" + proj.id + "/registers/" + regType, { method: "GET" }).then(function (data) {
            return { projectId: proj.id, regType: regType, rows: (data && data.rows) || [] };
          })
        );
      });
    });

    // Fetch snapshots for each project to register ID mappings
    var snapshotPromises = projects.map(function (proj) {
      return apiFetch("/api/projects/" + proj.id + "/snapshots", { method: "GET" }).then(function (data) {
        return { projectId: proj.id, snapshots: (data && data.snapshots) || [] };
      }).catch(function () {
        return { projectId: proj.id, snapshots: [] };
      });
    });

    return Promise.all([Promise.all(casePromises), Promise.all(regPromises), Promise.all(dataPromises), Promise.all(snapshotPromises)]).then(function (allResults) {
      var caseResults = allResults[0];
      var regResults = allResults[1];
      var dataResults = allResults[2];
      var snapshotResults = allResults[3];

      var caseMap = {};
      caseResults.forEach(function (r) { caseMap[r.projectId] = r.cases; });

      // Build register map: { projectId: { regType: [rows] } }
      var regMap = {};
      regResults.forEach(function (r) {
        if (!regMap[r.projectId]) regMap[r.projectId] = {};
        regMap[r.projectId][r.regType] = r.rows;
      });

      // Build analytical data map: { projectId: projectData }
      var analyticalMap = {};
      dataResults.forEach(function (r) { analyticalMap[r.projectId] = r.projectData; });

      // Register snapshot ID mappings so restore/delete/rename can find server IDs
      var snapshotMap = {};
      snapshotResults.forEach(function (r) {
        snapshotMap[r.projectId] = r.snapshots;
        r.snapshots.forEach(function (snap) {
          // Register server snapshot IDs; use server ID as local ID if no prior mapping
          var snapLocalId = mapServerToLocal(snap.id) || snap.id;
          registerMapping(snapLocalId, snap.id);
        });
      });

      // Build structure for each project
      var wsProjects = {};
      var order = [];
      projects.forEach(function (proj) {
        var localId = mapServerToLocal(proj.id) || proj.id;
        registerMapping(localId, proj.id);
        order.push(localId);

        var projAnalytical = analyticalMap[proj.id] || null;

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

        // Map register rows from server into local format
        var registers = {};
        var projRegs = regMap[proj.id] || {};
        REGISTER_TYPES.forEach(function (regType) {
          var serverRows = projRegs[regType] || [];
          registers[regType] = serverRows.map(function (row) {
            var rowLocalId = mapServerToLocal(row.id) || row.id;
            registerMapping(rowLocalId, row.id);
            var mapped = { _id: rowLocalId, _pinned: !!row.pinned };
            if (row.data && typeof row.data === "object") {
              var keys = Object.keys(row.data);
              for (var k = 0; k < keys.length; k++) {
                mapped[keys[k]] = row.data[keys[k]];
              }
            }
            return mapped;
          });
        });

        wsProjects[localId] = {
          project: {
            name: proj.name || "Untitled",
            status: proj.status || "PLANNING",
            sponsor: "", manager: "", org: "",
            start: "", end: "", version: "", currency: "$",
            spec: (projAnalytical && projAnalytical.spec) || { usl: 11, lsl: 9, target: 10 }
          },
          cases: serverCases,
          roster: (projAnalytical && projAnalytical.roster) || [],
          sigma: (projAnalytical && projAnalytical.sigma) || [],
          stakeholders: (projAnalytical && projAnalytical.stakeholders) || [],
          registers: registers,
          audit: [],
          snapshots: (snapshotMap[proj.id] || []).map(function (snap) {
            var snapLocalId = mapServerToLocal(snap.id) || snap.id;
            return { id: snapLocalId, ts: snap.createdAt || "", label: snap.label || "", data: snap.data || {} };
          }),
          gage: (projAnalytical && projAnalytical.gage) || null,
          cashflow: (projAnalytical && projAnalytical.cashflow) || null,
          xbarR: (projAnalytical && projAnalytical.xbarR) || null
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
    syncRegAdd: syncRegAdd,
    syncRegUpdate: syncRegUpdate,
    syncRegDelete: syncRegDelete,
    syncRegBulkDelete: syncRegBulkDelete,
    syncRegTogglePin: syncRegTogglePin,
    syncProjectData: syncProjectData,
    syncTakeSnapshot: syncTakeSnapshot,
    syncRestoreSnapshot: syncRestoreSnapshot,
    syncDeleteSnapshot: syncDeleteSnapshot,
    syncRenameSnapshot: syncRenameSnapshot,
    registerMapping: registerMapping,
    mapLocalToServer: mapLocalToServer,
    mapServerToLocal: mapServerToLocal
  };

})(typeof window !== "undefined" ? window : globalThis);
