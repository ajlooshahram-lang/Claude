/* QI Platform - Auth: session gating, login/register/MFA flows, logout. */
(function () {
  "use strict";

  // Skip auth entirely when running headless smoke tests or when no auth gate exists in the DOM.
  if (typeof window.__SKIP_AUTH !== "undefined" && window.__SKIP_AUTH) {
    window.QIAuth = { logout: function () {}, login: function () {}, register: function () {}, enrollMfa: function () {}, verifyMfa: function () {}, disableMfa: function () {}, currentUser: null };
    // ui.js will self-call QIBoot() when __SKIP_AUTH is set; no need to trigger from here.
    return;
  }

  // API base: same-origin by default, fallback to localhost:8080 for local dev
  var API_BASE = (function () {
    if (typeof window !== "undefined" && window.location && window.location.origin && window.location.origin !== "null" && window.location.protocol !== "file:") {
      return "";
    }
    return "http://localhost:8080";
  })();

  var currentUser = null;
  var pendingMfaToken = null;

  // ---- Cookie helpers ----
  function getCsrfToken() {
    var match = (document.cookie || "").match(/(^|;\s*)qi_csrf=([^;]*)/);
    return match ? decodeURIComponent(match[2]) : "";
  }

  // ---- Fetch wrapper ----
  function authFetch(url, opts) {
    opts = opts || {};
    opts.credentials = "include";
    opts.headers = opts.headers || {};
    opts.headers["Content-Type"] = opts.headers["Content-Type"] || "application/json";
    var csrf = getCsrfToken();
    if (csrf) opts.headers["x-csrf-token"] = csrf;
    var fullUrl = API_BASE + url;
    return fetch(fullUrl, opts).then(function (res) {
      // 401 interceptor: if session expired, re-gate the UI
      if (res.status === 401 && url !== "/auth/me" && url !== "/auth/login" && url !== "/auth/login/mfa") {
        currentUser = null;
        showLoginScreen();
      }
      return res;
    });
  }

  // ---- Auth API functions ----
  function checkSession() {
    return authFetch("/auth/me", { method: "GET" })
      .then(function (res) {
        if (!res.ok) return null;
        return res.json().then(function (data) { return data.user || null; });
      })
      .catch(function () { return null; });
  }

  function login(email, password) {
    return authFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: email, password: password })
    }).then(function (res) { return res.json(); });
  }

  function completeMfa(pendingToken, totpCode) {
    return authFetch("/auth/login/mfa", {
      method: "POST",
      body: JSON.stringify({ pendingToken: pendingToken, totpCode: totpCode })
    }).then(function (res) { return res.json(); });
  }

  function register(email, password, displayName) {
    return authFetch("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: email, password: password, displayName: displayName })
    }).then(function (res) { return res.json(); });
  }

  function logout() {
    return authFetch("/auth/logout", { method: "POST" })
      .then(function () {
        currentUser = null;
        showLoginScreen();
      })
      .catch(function () {
        currentUser = null;
        showLoginScreen();
      });
  }

  function enrollMfa() {
    return authFetch("/auth/mfa/enroll", { method: "POST" })
      .then(function (res) { return res.json(); });
  }

  function verifyMfa(totpCode) {
    return authFetch("/auth/mfa/verify", {
      method: "POST",
      body: JSON.stringify({ totpCode: totpCode })
    }).then(function (res) { return res.json(); });
  }

  function disableMfa(password, totpCode) {
    return authFetch("/auth/mfa/disable", {
      method: "POST",
      body: JSON.stringify({ password: password, totpCode: totpCode })
    }).then(function (res) { return res.json(); });
  }

  // ---- UI manipulation ----
  function showLoginScreen() {
    var gate = document.getElementById("authGate");
    var app = document.getElementById("app");
    if (gate) gate.hidden = false;
    if (app) app.hidden = true;
    // Show login panel, hide register and MFA
    var lp = document.getElementById("authLogin");
    var rp = document.getElementById("authRegister");
    var mp = document.getElementById("authMfa");
    var ep = document.getElementById("authError");
    if (lp) lp.hidden = false;
    if (rp) rp.hidden = true;
    if (mp) mp.hidden = true;
    if (ep) ep.hidden = true;
  }

  function showRegisterScreen() {
    var lp = document.getElementById("authLogin");
    var rp = document.getElementById("authRegister");
    var mp = document.getElementById("authMfa");
    var ep = document.getElementById("authError");
    if (lp) lp.hidden = true;
    if (rp) rp.hidden = false;
    if (mp) mp.hidden = true;
    if (ep) ep.hidden = true;
  }

  function showMfaScreen() {
    var lp = document.getElementById("authLogin");
    var rp = document.getElementById("authRegister");
    var mp = document.getElementById("authMfa");
    var ep = document.getElementById("authError");
    if (lp) lp.hidden = true;
    if (rp) rp.hidden = true;
    if (mp) mp.hidden = false;
    if (ep) ep.hidden = true;
  }

  function showAuthError(msg) {
    var ep = document.getElementById("authError");
    if (ep) { ep.textContent = msg; ep.hidden = false; }
  }

  function hideAuthGate() {
    var gate = document.getElementById("authGate");
    var app = document.getElementById("app");
    if (gate) gate.hidden = true;
    if (app) app.hidden = false;
  }

  // ---- Boot logic ----
  function boot() {
    var gate = document.getElementById("authGate");
    // If there is no auth gate in the DOM (e.g. test environments), skip auth
    if (!gate) {
      if (window.QIBoot) window.QIBoot();
      return;
    }

    showLoginScreen();

    checkSession().then(function (user) {
      if (user) {
        currentUser = user;
        hideAuthGate();
        if (window.QIBoot) window.QIBoot();
      } else {
        showLoginScreen();
      }
    }).catch(function () {
      showAuthError("Backend connection required. Please ensure the server is running.");
    });

    // Wire up login form
    var loginForm = document.getElementById("loginForm");
    if (loginForm) {
      loginForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var email = document.getElementById("loginEmail").value;
        var pw = document.getElementById("loginPassword").value;
        var ep = document.getElementById("authError");
        if (ep) ep.hidden = true;

        login(email, pw).then(function (data) {
          if (data.mfaRequired) {
            pendingMfaToken = data.pendingToken;
            showMfaScreen();
          } else if (data.user) {
            currentUser = data.user;
            hideAuthGate();
            if (window.QIBoot) window.QIBoot();
          } else {
            showAuthError(data.message || data.error || "Login failed.");
          }
        }).catch(function () {
          showAuthError("Unable to reach the server. Please check your connection.");
        });
      });
    }

    // Wire up register form
    var regForm = document.getElementById("registerForm");
    if (regForm) {
      regForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var email = document.getElementById("regEmail").value;
        var pw = document.getElementById("regPassword").value;
        var name = document.getElementById("regDisplayName").value;
        var ep = document.getElementById("authError");
        if (ep) ep.hidden = true;

        register(email, pw, name).then(function (data) {
          if (data.user) {
            currentUser = data.user;
            hideAuthGate();
            if (window.QIBoot) window.QIBoot();
          } else {
            showAuthError(data.message || data.error || "Registration failed.");
          }
        }).catch(function () {
          showAuthError("Unable to reach the server.");
        });
      });
    }

    // Wire up MFA form
    var mfaForm = document.getElementById("mfaForm");
    if (mfaForm) {
      mfaForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var code = document.getElementById("mfaCode").value;
        var token = pendingMfaToken;
        var ep = document.getElementById("authError");
        if (ep) ep.hidden = true;

        completeMfa(token, code).then(function (data) {
          if (data.user) {
            currentUser = data.user;
            hideAuthGate();
            if (window.QIBoot) window.QIBoot();
          } else {
            showAuthError(data.message || data.error || "MFA verification failed.");
          }
        }).catch(function () {
          showAuthError("Unable to reach the server.");
        });
      });
    }

    // Wire up screen switch links
    var showRegLink = document.getElementById("showRegister");
    if (showRegLink) showRegLink.addEventListener("click", function (e) { e.preventDefault(); showRegisterScreen(); });
    var showLoginLink = document.getElementById("showLogin");
    if (showLoginLink) showLoginLink.addEventListener("click", function (e) { e.preventDefault(); showLoginScreen(); });
  }

  // Expose module
  window.QIAuth = {
    boot: boot,
    login: login,
    register: register,
    completeMfa: completeMfa,
    logout: logout,
    enrollMfa: enrollMfa,
    verifyMfa: verifyMfa,
    disableMfa: disableMfa,
    checkSession: checkSession,
    getCsrfToken: getCsrfToken,
    authFetch: authFetch,
    get currentUser() { return currentUser; }
  };

  // Auto-boot on DOMContentLoaded
  document.addEventListener("DOMContentLoaded", boot);
})();
