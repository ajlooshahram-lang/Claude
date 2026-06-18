// Headless smoke test for SLD Installation Data Model
// Run with: node test-sld.js

const fs = require('fs');
const assert = require('assert');

// --- Minimal DOM mocks ---
const mockStorage = {};
const localStorage = {
  getItem: (k) => mockStorage[k] || null,
  setItem: (k, v) => { mockStorage[k] = v; },
  removeItem: (k) => { delete mockStorage[k]; }
};

const document = {
  getElementById: () => ({ innerHTML: '', textContent: '', style: {}, classList: { add(){}, remove(){}, toggle(){} } }),
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: (tag) => ({ style: {}, innerHTML: '', appendChild(){}, setAttribute(){}, classList: { add(){}, remove(){} } }),
  body: { classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } } },
  documentElement: { setAttribute(){}, getAttribute(){ return 'ltr'; } }
};

const window = {
  innerWidth: 1024,
  innerHeight: 768,
  addEventListener: () => {},
  matchMedia: () => ({ matches: false, addEventListener(){} }),
  location: { hash: '', search: '' },
  open: () => {}
};

const navigator = { language: 'da', clipboard: { writeText: () => Promise.resolve() } };
const alert = () => {};
const confirm = () => true;
const prompt = () => null;
const fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
const AbortController = function() { this.signal = {}; this.abort = () => {}; };
const setTimeout = (fn) => fn();
const setInterval = () => 0;
const clearInterval = () => {};
const clearTimeout = () => {};
const requestAnimationFrame = (fn) => fn();
const history = { pushState(){}, replaceState(){} };
const location = window.location;
const matchMedia = window.matchMedia;
const HTMLElement = function(){};
const ResizeObserver = function(){ this.observe = () => {}; this.disconnect = () => {}; };
const MutationObserver = function(){ this.observe = () => {}; this.disconnect = () => {}; };
const IntersectionObserver = function(){ this.observe = () => {}; this.disconnect = () => {}; };

// --- Extract and evaluate the script ---
const html = fs.readFileSync(__dirname + '/el-dimensionering.html', 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) {
  console.error('ERROR: Could not extract <script> from HTML');
  process.exit(1);
}

let jsCode = scriptMatch[1];
// Remove the INIT calls at end that try to render to actual DOM
jsCode = jsCode.replace(/renderNav\(\);\s*renderStatusBar\(\);\s*renderModule\(activeModule\);/, '// INIT calls removed for testing');
jsCode = jsCode.replace(/\(function\(\)\{[^}]*verBadge[^}]*\}\)\(\);/, '// verBadge removed for testing');
// Convert const and let to var so they are accessible in this scope after eval
jsCode = jsCode.replace(/^const /gm, 'var ');
jsCode = jsCode.replace(/^let /gm, 'var ');

try {
  eval(jsCode);
} catch (e) {
  console.error('ERROR evaluating JS:', e.message);
  console.error('At:', e.stack ? e.stack.split('\n').slice(0, 5).join('\n') : '');
  process.exit(1);
}

console.log('JS evaluated successfully');

// --- Test Suite ---
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  PASS: ' + name);
  } catch (e) {
    failed++;
    console.error('  FAIL: ' + name);
    console.error('        ' + e.message);
  }
}

console.log('\n=== Installation Data Model Tests ===\n');

// Test 1: Create tree
test('sldCreateTree creates a valid tree', function() {
  const tree = sldCreateTree();
  assert(tree.rootId, 'Tree must have a rootId');
  assert(tree.nodes[tree.rootId], 'Root node must exist');
  assert.strictEqual(tree.nodes[tree.rootId].type, 'transformer');
});

// Test 2: Tree structure
test('Default tree has transformer -> main board -> 3 final circuits', function() {
  sldNextId = 1;
  const tree = sldCreateTree();
  const root = tree.nodes[tree.rootId];
  assert.strictEqual(root.childIds.length, 1, 'Transformer has 1 child (main board)');
  const mainBoard = tree.nodes[root.childIds[0]];
  assert.strictEqual(mainBoard.type, 'main_board');
  assert.strictEqual(mainBoard.childIds.length, 3, 'Main board has 3 final circuits');
  mainBoard.childIds.forEach(function(cid) {
    assert.strictEqual(tree.nodes[cid].type, 'final_circuit');
  });
});

// Test 3: IB calculation
test('sldCalcNodeIB computes correct current for 3.68kW single-phase', function() {
  const node = { type: 'final_circuit', power_kW: 3.68, cosPhi: 0.95, phases: '1x230', voltage: 230 };
  const ib = sldCalcNodeIB(node);
  // IB = P / (U * cos) = 3680 / (230 * 0.95) = 16.84 A
  const expected = 3680 / (230 * 0.95);
  assert(Math.abs(ib - expected) < 0.01, 'IB should be ~' + expected.toFixed(2) + ' but got ' + ib.toFixed(2));
});

test('sldCalcNodeIB computes correct current for 7.36kW three-phase', function() {
  const node = { type: 'final_circuit', power_kW: 7.36, cosPhi: 0.95, phases: '3x400', voltage: 400 };
  const ib = sldCalcNodeIB(node);
  // IB = P / (sqrt(3) * 400 * cos) = 7360 / (692.82 * 0.95) = 11.18 A
  const expected = 7360 / (Math.sqrt(3) * 400 * 0.95);
  assert(Math.abs(ib - expected) < 0.01, 'IB should be ~' + expected.toFixed(2) + ' but got ' + ib.toFixed(2));
});

// Test 4: Zs calculation
test('sldCalcNodeZs accumulates impedance correctly', function() {
  sldNextId = 1;
  const tree = sldCreateTree();
  const root = tree.nodes[tree.rootId];
  const mainBoardId = root.childIds[0];
  const mainBoard = tree.nodes[mainBoardId];
  const fcId = mainBoard.childIds[0]; // First final circuit (lighting, 1.5mm2, 20m)

  // Ztrafo = (uk/100) * U^2 / Sn = (6/100) * 160000 / 630000 = 0.01524 ohm
  const zsTrafo = (6 / 100) * (400 * 400) / (630 * 1000);
  // Main board cable: 50mm2, r=0.388, x=0.084, L=10m -> 2*10*(0.388+0.084)/1000 = 0.00944
  const zsMain = 2 * 10 * (0.388 + 0.084) / 1000;
  // Final circuit cable: 1.5mm2, r=12.1, x=0.113, L=20m -> 2*20*(12.1+0.113)/1000 = 0.48852
  const zsFC = 2 * 20 * (12.1 + 0.113) / 1000;
  const expectedZs = zsTrafo + zsMain + zsFC;

  const actualZs = sldCalcNodeZs(tree, fcId);
  assert(Math.abs(actualZs - expectedZs) < 0.001,
    'Zs should be ~' + expectedZs.toFixed(4) + ' but got ' + actualZs.toFixed(4));
});

// Test 5: Voltage drop calculation
test('sldCalcNodeVdrop computes cumulative voltage drop', function() {
  sldNextId = 1;
  const tree = sldCreateTree();
  sldPropagateAll(tree);
  const root = tree.nodes[tree.rootId];
  const mainBoardId = root.childIds[0];
  const mainBoard = tree.nodes[mainBoardId];
  const fcId = mainBoard.childIds[1]; // Sockets: 3.68kW, 1x230, 2.5mm2, 25m, cos=0.95

  const vdrop = sldCalcNodeVdrop(tree, fcId);
  // Should be > 0 (there is cable length and current)
  assert(vdrop > 0, 'Voltage drop should be > 0, got ' + vdrop.toFixed(4));
  // Rough check: for 16A through 2.5mm2 at 25m single-phase, vdrop is significant
  assert(vdrop < 10, 'Voltage drop should be reasonable (<10%), got ' + vdrop.toFixed(2));
});

// Test 6: Ik calculation (IEC 60909)
test('sldCalcNodeIk returns valid short-circuit currents', function() {
  sldNextId = 1;
  const tree = sldCreateTree();
  const root = tree.nodes[tree.rootId];
  const mainBoardId = root.childIds[0];
  const ik = sldCalcNodeIk(tree, mainBoardId);
  // Main board: Zs = Ztrafo + Zcable_main
  // Ikmax = cmax * U / (sqrt(3) * Zs)
  assert(ik.ikmax > 0, 'Ikmax should be > 0');
  assert(ik.ikmin > 0, 'Ikmin should be > 0');
  assert(ik.ikmax > ik.ikmin, 'Ikmax should be > Ikmin');
  // At main board with short cable, Ik should be in kA range
  assert(ik.ikmax > 1000, 'Ikmax at main board should be > 1 kA');
});

// Test 7: Propagation
test('sldPropagateAll updates all derived values', function() {
  sldNextId = 1;
  const tree = sldCreateTree();
  sldPropagateAll(tree);
  const root = tree.nodes[tree.rootId];
  const mainBoardId = root.childIds[0];
  const mainBoard = tree.nodes[mainBoardId];
  // Main board power should be sum of children
  const expectedPower = mainBoard.childIds.reduce(function(sum, cid) {
    return sum + (tree.nodes[cid].power_kW || 0);
  }, 0);
  assert(Math.abs(mainBoard.power_kW - expectedPower) < 0.01,
    'Main board power should be sum of children: ' + expectedPower + ', got ' + mainBoard.power_kW);
  // Check that _ib is computed
  mainBoard.childIds.forEach(function(cid) {
    const node = tree.nodes[cid];
    assert(node._ib > 0, 'Final circuit _ib should be > 0');
  });
});

// Test 8: Compliance verification - non-compliant node
test('sldVerifyNode detects IB > In (non-compliant)', function() {
  sldNextId = 1;
  const tree = sldCreateTree();
  const root = tree.nodes[tree.rootId];
  const mainBoardId = root.childIds[0];
  const mainBoard = tree.nodes[mainBoardId];
  // Set first circuit to 22kW single-phase with only B10 protection
  const fcId = mainBoard.childIds[0];
  const fc = tree.nodes[fcId];
  fc.power_kW = 22;
  fc.protectionIn = 10; // Way too small
  fc.cosPhi = 0.95;
  fc.phases = '1x230';
  sldPropagateAll(tree);

  const results = sldVerifyNode(tree, fcId);
  assert(results.length > 0, 'Should have compliance results');
  const ibFail = results.find(function(r) { return r.rule === 'IB <= In <= Iz' && r.status === 'fail'; });
  assert(ibFail, 'Should detect IB > In failure');
  assert(ibFail.clause.indexOf('433.1') >= 0, 'Should cite clause 433.1');
});

// Test 9: Compliance - OK node
test('sldVerifyNode passes for properly sized circuit', function() {
  sldNextId = 1;
  const tree = sldCreateTree();
  sldPropagateAll(tree);
  const root = tree.nodes[tree.rootId];
  const mainBoardId = root.childIds[0];
  const mainBoard = tree.nodes[mainBoardId];
  // Sockets: 3.45kW, B16, 2.5mm2 (Iz=24A) - should be OK
  // IB = 3450 / (230 * 0.95) = 15.79A <= In=16A <= Iz=24A
  const fcId = mainBoard.childIds[1];
  const results = sldVerifyNode(tree, fcId);
  const ibCheck = results.find(function(r) { return r.rule === 'IB <= In <= Iz'; });
  if (ibCheck) {
    assert.strictEqual(ibCheck.status, 'ok', 'IB <= In <= Iz should pass for standard circuit. Got: ' + ibCheck.detail);
  }
});

// Test 10: Persistence (toJSON / fromJSON round-trip)
test('sldToJSON/sldFromJSON round-trip preserves tree structure', function() {
  sldNextId = 1;
  const tree = sldCreateTree();
  sldPropagateAll(tree);
  const json = sldToJSON(tree);
  assert(json, 'toJSON should return data');
  assert(json.rootId, 'JSON should have rootId');
  assert(Object.keys(json.nodes).length >= 5, 'Should have at least 5 nodes');

  const restored = sldFromJSON(json);
  assert(restored, 'fromJSON should return a tree');
  assert.strictEqual(restored.rootId, json.rootId, 'Root ID should match');
  assert.strictEqual(Object.keys(restored.nodes).length, Object.keys(json.nodes).length, 'Node count should match');
  // Check propagation happened
  const root = restored.nodes[restored.rootId];
  const mb = restored.nodes[root.childIds[0]];
  assert(mb._ib >= 0, 'Restored tree should have propagated values');
});

// Test 11: Add/remove nodes
test('Adding and removing nodes works correctly', function() {
  sldNextId = 1;
  sldTree = sldCreateTree();
  sldPropagateAll(sldTree);
  const root = sldTree.nodes[sldTree.rootId];
  const mainBoardId = root.childIds[0];
  const mainBoard = sldTree.nodes[mainBoardId];
  const initialCount = mainBoard.childIds.length;

  // Add a new final circuit
  const newNode = sldCreateNode('final_circuit', mainBoardId);
  sldTree.nodes[newNode.id] = newNode;
  mainBoard.childIds.push(newNode.id);
  assert.strictEqual(mainBoard.childIds.length, initialCount + 1);

  // Remove it
  mainBoard.childIds = mainBoard.childIds.filter(function(id) { return id !== newNode.id; });
  delete sldTree.nodes[newNode.id];
  assert.strictEqual(mainBoard.childIds.length, initialCount);
});

// Test 12: Path calculation
test('sldGetPath returns correct path from root to leaf', function() {
  sldNextId = 1;
  const tree = sldCreateTree();
  const root = tree.nodes[tree.rootId];
  const mainBoardId = root.childIds[0];
  const mainBoard = tree.nodes[mainBoardId];
  const fcId = mainBoard.childIds[0];

  const path = sldGetPath(tree, fcId);
  assert.strictEqual(path.length, 3, 'Path should be: transformer -> main board -> final circuit');
  assert.strictEqual(path[0], tree.rootId);
  assert.strictEqual(path[1], mainBoardId);
  assert.strictEqual(path[2], fcId);
});

// Test 13: Module translations exist
test('SLD module exists in all three language translation objects', function() {
  assert(T.da.modules.sld, 'Danish translation missing');
  assert(T.en.modules.sld, 'English translation missing');
  assert(T.fa.modules.sld, 'Persian translation missing');
});

// Test 14: Existing modules still have their render functions
test('All existing render functions are defined', function() {
  assert(typeof renderLoad === 'function', 'renderLoad missing');
  assert(typeof renderFuse === 'function', 'renderFuse missing');
  assert(typeof renderMCB === 'function', 'renderMCB missing');
  assert(typeof renderMCCB === 'function', 'renderMCCB missing');
  assert(typeof renderCable === 'function', 'renderCable missing');
  assert(typeof renderVdrop === 'function', 'renderVdrop missing');
  assert(typeof renderShortCircuit === 'function', 'renderShortCircuit missing');
  assert(typeof renderTrafo === 'function', 'renderTrafo missing');
  assert(typeof renderStandards === 'function', 'renderStandards missing');
  assert(typeof renderBank === 'function', 'renderBank missing');
  assert(typeof renderSLD === 'function', 'renderSLD missing');
});

// Test 15: Self-tests still pass
test('runSelfTests still passes', function() {
  if (typeof runSelfTests === 'function') {
    const results = runSelfTests();
    if (results && results.failed) {
      assert.strictEqual(results.failed, 0, 'Self-tests should all pass. Failed: ' + results.failed);
    }
  }
});

// Test 16: Farsi mode does not crash (fix for _FA undefined)
test('tx() function does not crash in Farsi mode', function() {
  var prevLang = lang;
  lang = 'fa';
  try {
    var result = tx('Belysning', 'Lighting');
    // Should return English text as fallback (since _FA is empty by default)
    assert.strictEqual(result, 'Lighting', 'tx() in Farsi should return English fallback');
    // Also test that a Danish call still works
    lang = 'da';
    result = tx('Belysning', 'Lighting');
    assert.strictEqual(result, 'Belysning', 'tx() in Danish should return Danish text');
    lang = 'en';
    result = tx('Belysning', 'Lighting');
    assert.strictEqual(result, 'Lighting', 'tx() in English should return English text');
  } finally {
    lang = prevLang;
  }
});

// Test 17: Nested sub-board propagation correctness (two-pass fix)
test('Nested sub-board propagation computes correct power aggregation', function() {
  sldNextId = 100;
  var tree = { nodes: {}, rootId: null };
  // Build: transformer -> main_board -> sub_board -> 2 final circuits
  var trafo = sldCreateNode('transformer', null);
  tree.nodes[trafo.id] = trafo;
  tree.rootId = trafo.id;
  var mb = sldCreateNode('main_board', trafo.id);
  tree.nodes[mb.id] = mb;
  trafo.childIds.push(mb.id);
  var sb = sldCreateNode('sub_board', mb.id, { power_kW: 0 });
  tree.nodes[sb.id] = sb;
  mb.childIds.push(sb.id);
  var fc1 = sldCreateNode('final_circuit', sb.id, { power_kW: 5.0 });
  tree.nodes[fc1.id] = fc1;
  sb.childIds.push(fc1.id);
  var fc2 = sldCreateNode('final_circuit', sb.id, { power_kW: 3.0 });
  tree.nodes[fc2.id] = fc2;
  sb.childIds.push(fc2.id);

  // Single call to propagateAll should correctly aggregate even nested boards
  sldPropagateAll(tree);

  // Sub-board should have sum of final circuits
  assert.strictEqual(sb.power_kW, 8.0, 'Sub-board power should be 8.0 kW, got ' + sb.power_kW);
  // Main board should also reflect the sub-board's aggregated power
  assert.strictEqual(mb.power_kW, 8.0, 'Main board power should be 8.0 kW, got ' + mb.power_kW);
  // IB should reflect the actual aggregated power
  var expectedIB = 8000 / (Math.sqrt(3) * 400 * 0.9);
  assert(Math.abs(mb._ib - expectedIB) < 0.01,
    'Main board IB should be ' + expectedIB.toFixed(2) + 'A, got ' + mb._ib.toFixed(2) + 'A');
});

// Test 18: Single-phase Ik formula accuracy
test('sldCalcNodeIk uses correct formula for single-phase circuits', function() {
  sldNextId = 200;
  var tree = { nodes: {}, rootId: null };
  var trafo = sldCreateNode('transformer', null, { power_kVA: 630, uk_pct: 6 });
  tree.nodes[trafo.id] = trafo;
  tree.rootId = trafo.id;
  var mb = sldCreateNode('main_board', trafo.id);
  tree.nodes[mb.id] = mb;
  trafo.childIds.push(mb.id);
  // Single-phase final circuit with known cable
  var cable25 = PRODUCTS.cables.find(function(c){ return c.mm2 === 2.5 && c.material === 'Cu'; });
  var fc = sldCreateNode('final_circuit', mb.id, {
    phases: '1x230', voltage: 230, power_kW: 3.45, length_m: 25, cable: cable25
  });
  tree.nodes[fc.id] = fc;
  mb.childIds.push(fc.id);

  var ik = sldCalcNodeIk(tree, fc.id);
  var zs = sldCalcNodeZs(tree, fc.id);
  // Single-phase formula: Ikmax = cmax * 230 / Zs
  var expectedIkmax = 1.05 * 230 / zs;
  var expectedIkmin = 0.95 * 230 / (zs * 1.5);
  assert(Math.abs(ik.ikmax - expectedIkmax) < 0.1,
    'Single-phase Ikmax should be ' + expectedIkmax.toFixed(1) + 'A, got ' + ik.ikmax.toFixed(1) + 'A');
  assert(Math.abs(ik.ikmin - expectedIkmin) < 0.1,
    'Single-phase Ikmin should be ' + expectedIkmin.toFixed(1) + 'A, got ' + ik.ikmin.toFixed(1) + 'A');
  // Verify it is NOT using three-phase formula
  var wrongIkmax = 1.05 * 400 / (Math.sqrt(3) * zs);
  assert(Math.abs(ik.ikmax - wrongIkmax) > 1,
    'Should not match three-phase formula result (' + wrongIkmax.toFixed(1) + 'A)');
});

// Test 19: Three-phase Ik formula unchanged for 3-phase circuits
test('sldCalcNodeIk uses three-phase formula for 3x400 circuits', function() {
  sldNextId = 300;
  var tree = { nodes: {}, rootId: null };
  var trafo = sldCreateNode('transformer', null, { power_kVA: 630, uk_pct: 6 });
  tree.nodes[trafo.id] = trafo;
  tree.rootId = trafo.id;
  var mb = sldCreateNode('main_board', trafo.id, { phases: '3x400', voltage: 400 });
  tree.nodes[mb.id] = mb;
  trafo.childIds.push(mb.id);

  var ik = sldCalcNodeIk(tree, mb.id);
  var zs = sldCalcNodeZs(tree, mb.id);
  // Three-phase formula: Ikmax = cmax * 400 / (sqrt(3) * Zs)
  var expectedIkmax = 1.05 * 400 / (Math.sqrt(3) * zs);
  assert(Math.abs(ik.ikmax - expectedIkmax) < 0.1,
    'Three-phase Ikmax should be ' + expectedIkmax.toFixed(1) + 'A, got ' + ik.ikmax.toFixed(1) + 'A');
});

// Test 20: Installation derating applied to Iz in compliance check
test('sldVerifyNode applies installation method derating to Iz', function() {
  sldNextId = 400;
  var tree = { nodes: {}, rootId: null };
  var trafo = sldCreateNode('transformer', null);
  tree.nodes[trafo.id] = trafo;
  tree.rootId = trafo.id;
  var mb = sldCreateNode('main_board', trafo.id);
  tree.nodes[mb.id] = mb;
  trafo.childIds.push(mb.id);
  // Create a circuit with restrictive installation method A1 (factor 0.87)
  // Cable 2.5mm2 Cu has raw iz=24A. With A1: corrected Iz = 24 * 0.87 = 20.88A
  // Set In=21A (hypothetically) which is > corrected Iz but < raw Iz
  var cable25 = PRODUCTS.cables.find(function(c){ return c.mm2 === 2.5 && c.material === 'Cu'; });
  var fc = sldCreateNode('final_circuit', mb.id, {
    power_kW: 3.0, cable: cable25, protectionIn: 21,
    installMethod: 'A1', temp: 30, grouping: 1, phases: '1x230'
  });
  tree.nodes[fc.id] = fc;
  mb.childIds.push(fc.id);
  sldPropagateAll(tree);

  var results = sldVerifyNode(tree, fc.id);
  var ibCheck = results.find(function(r) { return r.rule === 'IB <= In <= Iz'; });
  // Corrected Iz = 24 * 0.87 = 20.88A; In=21A > corrected Iz -> fail
  assert(ibCheck, 'Should have IB <= In <= Iz check result');
  assert.strictEqual(ibCheck.status, 'fail',
    'In=21A > corrected Iz=20.88A should fail. Got: ' + ibCheck.status + ' ' + ibCheck.detail);
});

// Test 21: I2 <= 1.45*Iz check for MCCB-protected nodes
test('sldVerifyNode checks I2 <= 1.45*Iz for MCCB-protected nodes', function() {
  sldNextId = 500;
  var tree = { nodes: {}, rootId: null };
  var trafo = sldCreateNode('transformer', null);
  tree.nodes[trafo.id] = trafo;
  tree.rootId = trafo.id;
  // Main board with MCCB - should trigger I2 check
  var mb = sldCreateNode('main_board', trafo.id);
  tree.nodes[mb.id] = mb;
  trafo.childIds.push(mb.id);
  // Add a final circuit so the board has power
  var fc = sldCreateNode('final_circuit', mb.id, { power_kW: 50 });
  tree.nodes[fc.id] = fc;
  mb.childIds.push(fc.id);
  sldPropagateAll(tree);

  var results = sldVerifyNode(tree, mb.id);
  var i2Check = results.find(function(r) { return r.rule === 'I2 <= 1.45*Iz'; });
  // Main board has MCCB (PRODUCTS.mccbs[0] which has frame property)
  assert(i2Check, 'Should have I2 <= 1.45*Iz check for MCCB-protected node');
  // With default settings (100A MCCB, 50mm2 cable with Iz~142A in method C):
  // I2 = 1.3 * 100 = 130A; 1.45 * correctedIz should be well above -> ok
  assert.strictEqual(i2Check.status, 'ok',
    'Default MCCB setup should pass I2 check. Got: ' + i2Check.status + ' ' + i2Check.detail);
});

// Test 22: I2 <= 1.45*Iz fails with undersized cable for MCCB
test('sldVerifyNode detects I2 > 1.45*Iz failure', function() {
  sldNextId = 600;
  var tree = { nodes: {}, rootId: null };
  var trafo = sldCreateNode('transformer', null);
  tree.nodes[trafo.id] = trafo;
  tree.rootId = trafo.id;
  // Board with large MCCB rating but small cable
  var cable15 = PRODUCTS.cables.find(function(c){ return c.mm2 === 1.5 && c.material === 'Cu'; });
  var mccb = PRODUCTS.mccbs.find(function(m){ return m.frame === 'NSX 100'; });
  var mb = sldCreateNode('main_board', trafo.id, {
    cable: cable15, protection: mccb, protectionIn: 100,
    installMethod: 'C', temp: 30, grouping: 1
  });
  tree.nodes[mb.id] = mb;
  trafo.childIds.push(mb.id);
  var fc = sldCreateNode('final_circuit', mb.id, { power_kW: 5 });
  tree.nodes[fc.id] = fc;
  mb.childIds.push(fc.id);
  sldPropagateAll(tree);

  var results = sldVerifyNode(tree, mb.id);
  var i2Check = results.find(function(r) { return r.rule === 'I2 <= 1.45*Iz'; });
  assert(i2Check, 'Should have I2 check for MCCB');
  // 1.5mm2 cable: raw Iz ~17.5A, corrected with C,30,1 = 17.5A
  // I2 = 1.3 * 100 = 130A; 1.45 * 17.5 = 25.4A -> 130 > 25.4 -> fail
  assert.strictEqual(i2Check.status, 'fail',
    'Undersized cable should fail I2 check. Got: ' + i2Check.status + ' ' + i2Check.detail);
});

// --- Summary ---
console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===\n');
if (failed > 0) process.exit(1);
console.log('All tests passed!');
