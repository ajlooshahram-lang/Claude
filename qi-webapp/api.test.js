/* API module tests - mock fetch to verify request shaping */
var pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log("  PASS:", msg); }
  else { fail++; console.log("  FAIL:", msg); }
}

// Track all fetch calls
var calls = [];
globalThis.fetch = function (url, opts) {
  calls.push({ url: url, method: opts.method, headers: opts.headers, body: opts.body, credentials: opts.credentials });
  return Promise.resolve({
    ok: true,
    status: 200,
    statusText: "OK",
    json: function () { return Promise.resolve({ id: "123", success: true }); }
  });
};

// Set a custom base URL
globalThis.QI_API_URL = "http://localhost:3000";

var QIAPI = require("./js/api.js");

async function runTests() {
  console.log("\n== API Module Tests ==\n");

  // --- register ---
  console.log("-- register --");
  calls = [];
  var r = await QIAPI.register("a@b.com", "pass123", "Alice", "TenantX");
  assert(calls.length === 1, "register sends one fetch");
  assert(calls[0].url === "http://localhost:3000/auth/register", "register URL correct");
  assert(calls[0].method === "POST", "register uses POST");
  assert(calls[0].credentials === "include", "register sends credentials:include");
  var body = JSON.parse(calls[0].body);
  assert(body.email === "a@b.com", "register body has email");
  assert(body.password === "pass123", "register body has password");
  assert(body.displayName === "Alice", "register body has displayName");
  assert(body.tenantName === "TenantX", "register body has tenantName");
  assert(calls[0].headers["Content-Type"] === "application/json", "register has JSON content-type");
  assert(r.ok === true, "register returns ok:true on success");
  assert(r.data && r.data.id === "123", "register returns parsed data");
  assert(r.error === null, "register error is null on success");

  // --- login ---
  console.log("-- login --");
  calls = [];
  await QIAPI.login("a@b.com", "pw", "t1", "654321");
  assert(calls[0].url === "http://localhost:3000/auth/login", "login URL correct");
  assert(calls[0].method === "POST", "login uses POST");
  assert(calls[0].credentials === "include", "login credentials:include");
  body = JSON.parse(calls[0].body);
  assert(body.email === "a@b.com", "login body email");
  assert(body.password === "pw", "login body password");
  assert(body.tenantId === "t1", "login body tenantId");
  assert(body.mfaToken === "654321", "login body mfaToken");

  // --- login without optional fields ---
  console.log("-- login minimal --");
  calls = [];
  await QIAPI.login("x@y.com", "p");
  body = JSON.parse(calls[0].body);
  assert(body.tenantId === undefined, "login without tenantId omits it");
  assert(body.mfaToken === undefined, "login without mfaToken omits it");

  // --- logout ---
  console.log("-- logout --");
  calls = [];
  await QIAPI.logout();
  assert(calls[0].url === "http://localhost:3000/auth/logout", "logout URL");
  assert(calls[0].method === "POST", "logout uses POST");
  assert(calls[0].credentials === "include", "logout credentials");

  // --- me ---
  console.log("-- me --");
  calls = [];
  await QIAPI.me();
  assert(calls[0].url === "http://localhost:3000/auth/me", "me URL");
  assert(calls[0].method === "GET", "me uses GET");
  assert(calls[0].credentials === "include", "me credentials");
  assert(!calls[0].body, "me has no body");

  // --- listCases ---
  console.log("-- listCases --");
  calls = [];
  await QIAPI.listCases("proj42");
  assert(calls[0].url === "http://localhost:3000/cases?projectId=proj42", "listCases URL with projectId");
  assert(calls[0].method === "GET", "listCases uses GET");
  assert(calls[0].credentials === "include", "listCases credentials");
  calls = [];
  await QIAPI.listCases();
  assert(calls[0].url === "http://localhost:3000/cases", "listCases without projectId");

  // --- getCase ---
  console.log("-- getCase --");
  calls = [];
  await QIAPI.getCase("abc123");
  assert(calls[0].url === "http://localhost:3000/cases/abc123", "getCase URL");
  assert(calls[0].method === "GET", "getCase uses GET");
  assert(calls[0].credentials === "include", "getCase credentials");

  // --- createCase ---
  console.log("-- createCase --");
  calls = [];
  await QIAPI.createCase({ problem: "Test", priority: "HIGH" });
  assert(calls[0].url === "http://localhost:3000/cases", "createCase URL");
  assert(calls[0].method === "POST", "createCase uses POST");
  assert(calls[0].credentials === "include", "createCase credentials");
  body = JSON.parse(calls[0].body);
  assert(body.problem === "Test", "createCase body has problem");
  assert(body.priority === "HIGH", "createCase body has priority");

  // --- updateCase ---
  console.log("-- updateCase --");
  calls = [];
  await QIAPI.updateCase("abc123", { status: "CLOSED" });
  assert(calls[0].url === "http://localhost:3000/cases/abc123", "updateCase URL");
  assert(calls[0].method === "PATCH", "updateCase uses PATCH");
  assert(calls[0].credentials === "include", "updateCase credentials");
  body = JSON.parse(calls[0].body);
  assert(body.status === "CLOSED", "updateCase body has status");

  // --- deleteCase ---
  console.log("-- deleteCase --");
  calls = [];
  await QIAPI.deleteCase("xyz789");
  assert(calls[0].url === "http://localhost:3000/cases/xyz789", "deleteCase URL");
  assert(calls[0].method === "DELETE", "deleteCase uses DELETE");
  assert(calls[0].credentials === "include", "deleteCase credentials");

  // --- error handling ---
  console.log("-- error handling --");
  globalThis.fetch = function (url, opts) {
    calls.push({ url: url });
    return Promise.resolve({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: function () { return Promise.resolve({ error: "Not authenticated" }); }
    });
  };
  calls = [];
  r = await QIAPI.me();
  assert(r.ok === false, "error response has ok:false");
  assert(r.error === "Not authenticated", "error response has error message from body");
  assert(r.data === null, "error response data is null");

  // --- network error ---
  console.log("-- network error --");
  globalThis.fetch = function () {
    return Promise.reject(new Error("Connection refused"));
  };
  r = await QIAPI.me();
  assert(r.ok === false, "network error has ok:false");
  assert(r.error === "Connection refused", "network error message captured");
  assert(r.data === null, "network error data is null");

  // --- base URL defaults to empty ---
  console.log("-- base URL default --");
  delete globalThis.QI_API_URL;
  // Re-require to get fresh module with default base URL
  delete require.cache[require.resolve("./js/api.js")];
  globalThis.fetch = function (url, opts) {
    calls.push({ url: url, credentials: opts.credentials });
    return Promise.resolve({ ok: true, status: 200, statusText: "OK", json: function () { return Promise.resolve({}); } });
  };
  var QIAPI2 = require("./js/api.js");
  calls = [];
  await QIAPI2.me();
  assert(calls[0].url === "/auth/me", "default base URL is empty string (same-origin)");

  // --- Summary ---
  console.log("\n== Results: " + pass + " passed, " + fail + " failed ==");
  if (fail > 0) { console.log("API TESTS FAIL"); process.exit(1); }
  else { console.log("API TESTS PASS"); }
}

runTests();
