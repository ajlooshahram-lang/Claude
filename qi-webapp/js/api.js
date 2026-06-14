/* QI Platform - API client (fetch-based, Promise responses). */
(function (root) {
  "use strict";

  function getBase() {
    if (root.QI_API_URL != null) return root.QI_API_URL;
    try {
      if (typeof localStorage !== "undefined") {
        var stored = localStorage.getItem("qi_api_url");
        if (stored) return stored;
      }
    } catch (e) {}
    return "";
  }

  function request(method, path, body) {
    var url = getBase() + path;
    var opts = { method: method, credentials: "include", headers: {} };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    if (typeof fetch !== "function") {
      return Promise.resolve({ ok: false, data: null, error: "fetch not available" });
    }
    return fetch(url, opts).then(function (res) {
      return res.json().then(function (data) {
        if (res.ok) return { ok: true, data: data, error: null };
        return { ok: false, data: null, error: (data && data.error) || res.statusText || "Request failed" };
      }).catch(function () {
        if (res.ok) return { ok: true, data: null, error: null };
        return { ok: false, data: null, error: res.statusText || "Request failed" };
      });
    }).catch(function (err) {
      return { ok: false, data: null, error: err.message || "Network error" };
    });
  }

  var QIAPI = {
    // ---- Auth ----
    register: function (email, password, displayName, tenantName) {
      return request("POST", "/auth/register", { email: email, password: password, displayName: displayName, tenantName: tenantName });
    },
    login: function (email, password, tenantId, mfaToken) {
      var body = { email: email, password: password };
      if (tenantId !== undefined) body.tenantId = tenantId;
      if (mfaToken !== undefined) body.mfaToken = mfaToken;
      return request("POST", "/auth/login", body);
    },
    logout: function () {
      return request("POST", "/auth/logout");
    },
    me: function () {
      return request("GET", "/auth/me");
    },
    changePassword: function (currentPassword, newPassword) {
      return request("POST", "/auth/change-password", { currentPassword: currentPassword, newPassword: newPassword });
    },

    // ---- Cases ----
    listCases: function (projectId) {
      var path = "/cases";
      if (projectId) path += "?projectId=" + encodeURIComponent(projectId);
      return request("GET", path);
    },
    getCase: function (id) {
      return request("GET", "/cases/" + encodeURIComponent(id));
    },
    createCase: function (data) {
      return request("POST", "/cases", data);
    },
    updateCase: function (id, data) {
      return request("PATCH", "/cases/" + encodeURIComponent(id), data);
    },
    deleteCase: function (id) {
      return request("DELETE", "/cases/" + encodeURIComponent(id));
    },

    // ---- Projects ----
    listProjects: function () {
      return request("GET", "/projects");
    },
    createProject: function (data) {
      return request("POST", "/projects", data);
    },
    updateProject: function (id, data) {
      return request("PATCH", "/projects/" + encodeURIComponent(id), data);
    },
    deleteProject: function (id) {
      return request("DELETE", "/projects/" + encodeURIComponent(id));
    },

    // ---- Registers ----
    listRegisters: function (type, projectId) {
      var path = "/registers/" + encodeURIComponent(type);
      if (projectId) path += "?projectId=" + encodeURIComponent(projectId);
      return request("GET", path);
    },
    createRegister: function (type, data) {
      return request("POST", "/registers/" + encodeURIComponent(type), data);
    },
    updateRegister: function (type, id, data) {
      return request("PATCH", "/registers/" + encodeURIComponent(type) + "/" + encodeURIComponent(id), data);
    },
    deleteRegister: function (type, id) {
      return request("DELETE", "/registers/" + encodeURIComponent(type) + "/" + encodeURIComponent(id));
    },

    // ---- Snapshots ----
    listSnapshots: function (projectId) {
      var path = "/snapshots";
      if (projectId) path += "?projectId=" + encodeURIComponent(projectId);
      return request("GET", path);
    },
    createSnapshot: function (data) {
      return request("POST", "/snapshots", data);
    },
    restoreSnapshot: function (id) {
      return request("POST", "/snapshots/" + encodeURIComponent(id) + "/restore");
    },
    deleteSnapshot: function (id) {
      return request("DELETE", "/snapshots/" + encodeURIComponent(id));
    },

    // ---- Shares ----
    createShareToken: function (data) {
      return request("POST", "/shares", data);
    },
    listShareTokens: function (projectId) {
      var path = "/shares";
      if (projectId) path += "?projectId=" + encodeURIComponent(projectId);
      return request("GET", path);
    },
    revokeShareToken: function (id) {
      return request("DELETE", "/shares/" + encodeURIComponent(id));
    }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = QIAPI;
  root.QIAPI = QIAPI;
})(typeof window !== "undefined" ? window : globalThis);
