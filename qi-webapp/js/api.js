/* QI Platform - API client for authenticated backend. */
(function (root) {
  "use strict";

  // Restore persisted API URL on boot
  try {
    if (typeof localStorage !== "undefined" && !root.QI_API_URL) {
      var saved = localStorage.getItem("qi_api_url");
      if (saved) root.QI_API_URL = saved;
    }
  } catch (e) {}

  function getBase() {
    return (root.QI_API_URL != null ? root.QI_API_URL : "");
  }

  function request(method, path, body) {
    var url = getBase() + path;
    var opts = {
      method: method,
      credentials: "include",
      headers: {}
    };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    // Guard against environments without fetch (Node tests that don't mock it)
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
    register: function (email, password, displayName, tenantName) {
      return request("POST", "/auth/register", { email: email, password: password, displayName: displayName, tenantName: tenantName });
    },
    login: function (email, password, tenantId, mfaToken) {
      var body = { email: email, password: password };
      if (tenantId) body.tenantId = tenantId;
      if (mfaToken) body.mfaToken = mfaToken;
      return request("POST", "/auth/login", body);
    },
    logout: function () {
      return request("POST", "/auth/logout");
    },
    me: function () {
      return request("GET", "/auth/me");
    },
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
    }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = QIAPI;
  root.QIAPI = QIAPI;
})(typeof window !== "undefined" ? window : globalThis);
