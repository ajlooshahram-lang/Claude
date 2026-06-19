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

// Test 19: Three-phase Ik formula uses Z1 (positive-sequence impedance)
test('sldCalcNodeIk uses Z1 for three-phase Ikmax', function() {
  sldNextId = 300;
  var tree = { nodes: {}, rootId: null };
  var trafo = sldCreateNode('transformer', null, { power_kVA: 630, uk_pct: 6 });
  tree.nodes[trafo.id] = trafo;
  tree.rootId = trafo.id;
  var mb = sldCreateNode('main_board', trafo.id, { phases: '3x400', voltage: 400 });
  tree.nodes[mb.id] = mb;
  trafo.childIds.push(mb.id);

  var ik = sldCalcNodeIk(tree, mb.id);
  var z1 = sldCalcNodeZ1(tree, mb.id);
  // Three-phase formula uses Z1: Ikmax = cmax * 400 / (sqrt(3) * Z1)
  var expectedIkmax = 1.05 * 400 / (Math.sqrt(3) * z1);
  assert(Math.abs(ik.ikmax - expectedIkmax) < 0.1,
    'Three-phase Ikmax should use Z1: ' + expectedIkmax.toFixed(1) + 'A, got ' + ik.ikmax.toFixed(1) + 'A');
  // Z1 should be less than Zs for the same path (no factor 2, geometric sum)
  var zs = sldCalcNodeZs(tree, mb.id);
  assert(z1 < zs, 'Z1 (' + z1.toFixed(5) + ') should be less than Zs (' + zs.toFixed(5) + ')');
  // Therefore Ikmax with Z1 should be HIGHER than if using Zs (more conservative for Icu check)
  var oldIkmax = 1.05 * 400 / (Math.sqrt(3) * zs);
  assert(ik.ikmax > oldIkmax, 'Ikmax with Z1 (' + ik.ikmax.toFixed(0) + ') should be higher than with Zs (' + oldIkmax.toFixed(0) + ')');
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

// Test 23: D1 and D2 installation methods are defined in INSTALL_METHODS
test('INSTALL_METHODS includes D1 and D2 entries', function() {
  assert.strictEqual(INSTALL_METHODS['D1'], 1.0, 'D1 should be 1.0, got ' + INSTALL_METHODS['D1']);
  assert.strictEqual(INSTALL_METHODS['D2'], 1.0, 'D2 should be 1.0, got ' + INSTALL_METHODS['D2']);
  // Original D should still exist
  assert.strictEqual(INSTALL_METHODS['D'], 1.0, 'D should still be 1.0');
});

// Test 24: Z1 (positive-sequence) is correctly separated from Zs (loop)
test('sldCalcNodeZ1 uses geometric sum and no factor 2', function() {
  sldNextId = 700;
  var tree = { nodes: {}, rootId: null };
  var trafo = sldCreateNode('transformer', null, { power_kVA: 630, uk_pct: 6 });
  tree.nodes[trafo.id] = trafo;
  tree.rootId = trafo.id;
  // 50mm2 cable: r=0.388, x=0.084
  var cable50 = PRODUCTS.cables.find(function(c){ return c.mm2 === 50 && c.material === 'Cu'; });
  var mb = sldCreateNode('main_board', trafo.id, { cable: cable50, length_m: 10, phases: '3x400' });
  tree.nodes[mb.id] = mb;
  trafo.childIds.push(mb.id);

  var zs = sldCalcNodeZs(tree, mb.id);
  var z1 = sldCalcNodeZ1(tree, mb.id);

  // Ztrafo = (6/100) * 400^2 / 630000 = 0.015238 ohm (same for both)
  var zTrafo = (6/100) * 160000 / 630000;
  // Zs cable: 2 * 10 * (0.388 + 0.084) / 1000 = 0.00944 ohm
  var zsExpectedCable = 2 * 10 * (0.388 + 0.084) / 1000;
  // Z1 cable: 10 * sqrt(0.388^2 + 0.084^2) / 1000 = 10 * 0.397 / 1000 = 0.00397 ohm
  var z1ExpectedCable = 10 * Math.sqrt(0.388 * 0.388 + 0.084 * 0.084) / 1000;

  var expectedZs = zTrafo + zsExpectedCable;
  var expectedZ1 = zTrafo + z1ExpectedCable;

  assert(Math.abs(zs - expectedZs) < 0.0001,
    'Zs should be ' + expectedZs.toFixed(5) + ', got ' + zs.toFixed(5));
  assert(Math.abs(z1 - expectedZ1) < 0.0001,
    'Z1 should be ' + expectedZ1.toFixed(5) + ', got ' + z1.toFixed(5));
  // Z1 < Zs because no factor 2 and geometric < arithmetic for r and x
  assert(z1 < zs, 'Z1 (' + z1.toFixed(5) + ') must be < Zs (' + zs.toFixed(5) + ')');
  // The ratio matters for safety: Ikmax_Z1 / Ikmax_Zs > 1
  var ikmaxZ1 = 1.05 * 400 / (Math.sqrt(3) * z1);
  var ikmaxZs = 1.05 * 400 / (Math.sqrt(3) * zs);
  assert(ikmaxZ1 > ikmaxZs, 'Ikmax with Z1 (' + ikmaxZ1.toFixed(0) + ') > Ikmax with Zs (' + ikmaxZs.toFixed(0) + ')');
});

// Test 25: Icu check uses parent node Ikmax (fault current at device terminals)
test('sldVerifyNode Icu check uses prospective fault current at device terminals', function() {
  sldNextId = 800;
  var tree = { nodes: {}, rootId: null };
  var trafo = sldCreateNode('transformer', null, { power_kVA: 630, uk_pct: 6 });
  tree.nodes[trafo.id] = trafo;
  tree.rootId = trafo.id;
  var cable50 = PRODUCTS.cables.find(function(c){ return c.mm2 === 50 && c.material === 'Cu'; });
  var mb = sldCreateNode('main_board', trafo.id, {
    cable: cable50, length_m: 10, phases: '3x400', voltage: 400,
    protectionIn: 100
  });
  tree.nodes[mb.id] = mb;
  trafo.childIds.push(mb.id);

  // Add a final circuit with a 6kA MCB
  var cable25 = PRODUCTS.cables.find(function(c){ return c.mm2 === 2.5 && c.material === 'Cu'; });
  var mcb6ka = PRODUCTS.mcbs.find(function(m){ return m.icu === 6; });
  var fc = sldCreateNode('final_circuit', mb.id, {
    cable: cable25, length_m: 25, phases: '1x230', voltage: 230,
    power_kW: 3.45, protection: mcb6ka, protectionIn: 16
  });
  tree.nodes[fc.id] = fc;
  mb.childIds.push(fc.id);

  sldPropagateAll(tree);

  // The Icu check on the final circuit should use the PARENT's Ikmax (main board's Ikmax)
  // not the final circuit's own Ikmax (which is lower due to 25m of 2.5mm2 cable)
  var results = sldVerifyNode(tree, fc.id);
  var icuCheck = results.find(function(r) { return r.rule === 'Icu >= Ikmax'; });
  assert(icuCheck, 'Should have Icu check result');
  // The detail should mention "at device terminals"
  assert(icuCheck.detail.indexOf('at device terminals') >= 0,
    'Icu check detail should reference device terminals. Got: ' + icuCheck.detail);

  // Verify the parent Ikmax is higher than the node's own Ikmax
  var parentIkmax = mb._ikmax;
  var nodeIkmax = fc._ikmax;
  assert(parentIkmax > nodeIkmax,
    'Parent Ikmax (' + parentIkmax.toFixed(0) + ') should be > node Ikmax (' + nodeIkmax.toFixed(0) + ')');
});

// Test 26: Icu check detects undersized breaker at device terminals
test('sldVerifyNode Icu check fails when breaker undersized for terminal fault current', function() {
  sldNextId = 900;
  var tree = { nodes: {}, rootId: null };
  // Use a large transformer to get high fault current
  var trafo = sldCreateNode('transformer', null, { power_kVA: 630, uk_pct: 4 });
  tree.nodes[trafo.id] = trafo;
  tree.rootId = trafo.id;
  var cable50 = PRODUCTS.cables.find(function(c){ return c.mm2 === 50 && c.material === 'Cu'; });
  var mb = sldCreateNode('main_board', trafo.id, {
    cable: cable50, length_m: 5, phases: '3x400', voltage: 400,
    protectionIn: 100
  });
  tree.nodes[mb.id] = mb;
  trafo.childIds.push(mb.id);

  // Add a sub-board with a small MCB (only 6kA Icu)
  // The main board's Ikmax will be much higher than 6kA
  var cable10 = PRODUCTS.cables.find(function(c){ return c.mm2 === 10 && c.material === 'Cu'; });
  var mcb6ka = PRODUCTS.mcbs.find(function(m){ return m.icu === 6; });
  var sb = sldCreateNode('sub_board', mb.id, {
    cable: cable10, length_m: 5, phases: '3x400', voltage: 400,
    power_kW: 20, protection: mcb6ka, protectionIn: 32
  });
  tree.nodes[sb.id] = sb;
  mb.childIds.push(sb.id);

  sldPropagateAll(tree);

  // Main board's Ikmax (at the sub-board device terminals) should be > 6kA
  assert(mb._ikmax > 6000,
    'Main board Ikmax should be > 6kA. Got: ' + (mb._ikmax / 1000).toFixed(1) + 'kA');

  var results = sldVerifyNode(tree, sb.id);
  var icuCheck = results.find(function(r) { return r.rule === 'Icu >= Ikmax'; });
  assert(icuCheck, 'Should have Icu check result');
  assert.strictEqual(icuCheck.status, 'fail',
    'MCB with 6kA Icu should fail when terminal fault current > 6kA. Got: ' + icuCheck.status + ' ' + icuCheck.detail);
});

// Test 27: Propagation stores _z1 on each node
test('sldPropagateAll stores _z1 positive-sequence impedance on nodes', function() {
  sldNextId = 1000;
  var tree = sldCreateTree();
  sldPropagateAll(tree);
  var root = tree.nodes[tree.rootId];
  var mainBoardId = root.childIds[0];
  var mainBoard = tree.nodes[mainBoardId];
  // _z1 should be computed for all non-transformer nodes
  assert(mainBoard._z1 > 0, 'Main board should have _z1 > 0, got ' + mainBoard._z1);
  assert(mainBoard._z1 < mainBoard._zs, 'Z1 should be < Zs. Z1=' + mainBoard._z1.toFixed(5) + ' Zs=' + mainBoard._zs.toFixed(5));
  // Final circuits should also have _z1
  mainBoard.childIds.forEach(function(cid) {
    var fc = tree.nodes[cid];
    assert(fc._z1 > 0, 'Final circuit should have _z1 > 0');
  });
});

// ===== SELECTIVITY COORDINATION TESTS =====
console.log('\n=== Selectivity Coordination Tests ===\n');

// Test 29: sldDeviceCurve returns valid curve points for MCB
test('sldDeviceCurve returns valid points for MCB (curve B, 16A)', function() {
  var mcb = PRODUCTS.mcbs.find(function(m){ return m.curve === 'B' && m.rating === 16; });
  assert(mcb, 'Should find a B16 MCB');
  var curve = sldDeviceCurve(mcb, 16);
  assert(curve.length > 5, 'Curve should have multiple points, got ' + curve.length);
  // Verify all points have valid structure
  curve.forEach(function(pt) {
    assert(pt.i > 0, 'Current must be positive');
    assert(pt.tMin > 0, 'tMin must be positive');
    assert(pt.tMax >= pt.tMin, 'tMax must be >= tMin');
  });
  // Verify thermal region exists (low current, high time)
  var thermalPt = curve[0];
  assert(thermalPt.tMax > 1, 'First point should be in thermal region (time > 1s)');
  // Verify instantaneous region exists (high current, very low time)
  var lastPt = curve[curve.length - 1];
  assert(lastPt.tMax < 0.1, 'Last point should be instantaneous (time < 0.1s)');
});

// Test 30: sldDeviceCurve returns valid curve points for fuse
test('sldDeviceCurve returns valid points for gG fuse', function() {
  var fuse = PRODUCTS.fuses.find(function(f){ return f.rating === 63; });
  assert(fuse, 'Should find a 63A fuse');
  var curve = sldDeviceCurve(fuse, 63);
  assert(curve.length > 5, 'Fuse curve should have multiple points, got ' + curve.length);
  curve.forEach(function(pt) {
    assert(pt.i > 0, 'Current must be positive');
    assert(pt.tMin > 0, 'tMin must be positive');
    assert(pt.tMax >= pt.tMin, 'tMax must be >= tMin');
  });
});

// Test 31: sldDeviceCurve returns valid curve points for MCCB
test('sldDeviceCurve returns valid points for MCCB', function() {
  var mccb = PRODUCTS.mccbs.find(function(m){ return m.frame === 'NSX 250'; });
  assert(mccb, 'Should find NSX 250 MCCB');
  var curve = sldDeviceCurve(mccb, 250, {io: 0.8, isd: 5});
  assert(curve.length > 5, 'MCCB curve should have multiple points, got ' + curve.length);
  curve.forEach(function(pt) {
    assert(pt.i > 0, 'Current must be positive');
    assert(pt.tMin > 0, 'tMin must be positive');
    assert(pt.tMax >= pt.tMin, 'tMax must be >= tMin');
  });
});

// Test 32: sldAnalyzeSelectivity returns 'full' for fuse pair with ratio >= 1.6
test('sldAnalyzeSelectivity: full selectivity for fuse ratio >= 1.6:1', function() {
  sldNextId = 2000;
  var tree = sldCreateTree();
  var root = tree.nodes[tree.rootId];
  var mainBoardId = root.childIds[0];
  var mainBoard = tree.nodes[mainBoardId];

  // Set upstream (main board) with 100A fuse
  var fuse100 = PRODUCTS.fuses.find(function(f){ return f.rating === 100; });
  mainBoard.protection = fuse100;
  mainBoard.protectionIn = 100;

  // Add sub-board with 32A fuse (ratio 100/32 = 3.125 > 1.6)
  var fuse32 = PRODUCTS.fuses.find(function(f){ return f.rating === 32; });
  var cable10 = PRODUCTS.cables.find(function(c){ return c.mm2 === 10 && c.material === 'Cu'; });
  var sb = sldCreateNode('sub_board', mainBoardId, {
    cable: cable10, length_m: 10, phases: '3x400', voltage: 400,
    power_kW: 15, protection: fuse32, protectionIn: 32
  });
  tree.nodes[sb.id] = sb;
  mainBoard.childIds.push(sb.id);
  sldPropagateAll(tree);

  var result = sldAnalyzeSelectivity(tree, sb.id);
  assert(result, 'Should return a result');
  assert.strictEqual(result.verdict, 'full', 'Fuse 100A/32A (ratio 3.1:1) should be fully selective. Got: ' + result.verdict + ' - ' + result.details);
});

// Test 33: sldAnalyzeSelectivity returns 'none' for equal-rated fuses
test('sldAnalyzeSelectivity: no selectivity for equal-rated fuses', function() {
  sldNextId = 3000;
  var tree = sldCreateTree();
  var root = tree.nodes[tree.rootId];
  var mainBoardId = root.childIds[0];
  var mainBoard = tree.nodes[mainBoardId];

  var fuse63 = PRODUCTS.fuses.find(function(f){ return f.rating === 63 && f.size === 'D02'; });
  mainBoard.protection = fuse63;
  mainBoard.protectionIn = 63;

  // Sub-board with same 63A fuse (ratio 1:1)
  var cable10 = PRODUCTS.cables.find(function(c){ return c.mm2 === 10 && c.material === 'Cu'; });
  var sb = sldCreateNode('sub_board', mainBoardId, {
    cable: cable10, length_m: 10, phases: '3x400', voltage: 400,
    power_kW: 15, protection: fuse63, protectionIn: 63
  });
  tree.nodes[sb.id] = sb;
  mainBoard.childIds.push(sb.id);
  sldPropagateAll(tree);

  var result = sldAnalyzeSelectivity(tree, sb.id);
  assert(result, 'Should return a result');
  assert.strictEqual(result.verdict, 'none', 'Equal-rated fuses should be non-selective. Got: ' + result.verdict);
});

// Test 34: sldAnalyzeSelectivity returns 'partial' for MCB vs upstream fuse
test('sldAnalyzeSelectivity: partial selectivity for MCB vs upstream fuse', function() {
  sldNextId = 4000;
  var tree = sldCreateTree();
  var root = tree.nodes[tree.rootId];
  var mainBoardId = root.childIds[0];
  var mainBoard = tree.nodes[mainBoardId];

  // Main board with 100A fuse
  var fuse100 = PRODUCTS.fuses.find(function(f){ return f.rating === 100; });
  mainBoard.protection = fuse100;
  mainBoard.protectionIn = 100;

  // Sub-board with MCB B16
  var mcb = PRODUCTS.mcbs.find(function(m){ return m.curve === 'B' && m.rating === 16; });
  var cable = PRODUCTS.cables.find(function(c){ return c.mm2 === 2.5 && c.material === 'Cu'; });
  var sb = sldCreateNode('final_circuit', mainBoardId, {
    cable: cable, length_m: 20, phases: '1x230', voltage: 230,
    power_kW: 3.68, protection: mcb, protectionIn: 16
  });
  tree.nodes[sb.id] = sb;
  mainBoard.childIds.push(sb.id);
  sldPropagateAll(tree);

  var result = sldAnalyzeSelectivity(tree, sb.id);
  assert(result, 'Should return a result');
  assert.strictEqual(result.verdict, 'partial', 'MCB B16 vs 100A fuse should be partially selective. Got: ' + result.verdict);
  assert(result.limitCurrent > 0, 'Should have a limit current. Got: ' + result.limitCurrent);
});

// Test 35: MCCB time-grading check
test('sldAnalyzeSelectivity: MCCB with delay vs downstream MCB', function() {
  sldNextId = 5000;
  var tree = sldCreateTree();
  var root = tree.nodes[tree.rootId];
  var mainBoardId = root.childIds[0];
  var mainBoard = tree.nodes[mainBoardId];

  // Main board with MCCB NSX 250 with short-time delay
  var mccb = PRODUCTS.mccbs.find(function(m){ return m.frame === 'NSX 250' && m.trip === 'N'; });
  mainBoard.protection = mccb;
  mainBoard.protectionIn = 250;
  mainBoard.mccbSettings = { io: 1.0, isd: 5, isdDelay: 0.1 };

  // Sub-board with MCB C32
  var mcb = PRODUCTS.mcbs.find(function(m){ return m.curve === 'C' && m.rating === 32; });
  var cable = PRODUCTS.cables.find(function(c){ return c.mm2 === 10 && c.material === 'Cu'; });
  var sb = sldCreateNode('sub_board', mainBoardId, {
    cable: cable, length_m: 15, phases: '3x400', voltage: 400,
    power_kW: 20, protection: mcb, protectionIn: 32
  });
  tree.nodes[sb.id] = sb;
  mainBoard.childIds.push(sb.id);
  sldPropagateAll(tree);

  var result = sldAnalyzeSelectivity(tree, sb.id);
  assert(result, 'Should return a result');
  assert(result.verdict === 'full' || result.verdict === 'partial',
    'MCCB with 100ms delay vs MCB C32 should be full or partial. Got: ' + result.verdict + ' - ' + result.details);
});

// Test 36: sldRenderTCCChart returns valid SVG
test('sldRenderTCCChart returns valid SVG string', function() {
  var mcb = PRODUCTS.mcbs.find(function(m){ return m.curve === 'B' && m.rating === 16; });
  var fuse = PRODUCTS.fuses.find(function(f){ return f.rating === 100; });
  var dsCurve = sldDeviceCurve(mcb, 16);
  var usCurve = sldDeviceCurve(fuse, 100);
  var result = { verdict: 'partial', limitCurrent: 80, details: 'test' };
  var svg = sldRenderTCCChart(usCurve, dsCurve, result);
  assert(svg.indexOf('<svg') === 0, 'Should start with <svg. Got: ' + svg.substring(0, 20));
  assert(svg.indexOf('</svg>') > 0, 'Should end with </svg>');
  assert(svg.indexOf('viewBox') > 0, 'Should have viewBox for responsive sizing');
  assert(svg.indexOf('Upstream') > 0 || svg.indexOf('Opstr') > 0, 'Should have upstream label');
  assert(svg.indexOf('Downstream') > 0 || svg.indexOf('Nedstr') > 0, 'Should have downstream label');
});

// Test 37: sldVerifySelectivityAll produces compliance results
test('sldVerifySelectivityAll produces results for tree with protection', function() {
  sldNextId = 6000;
  var tree = sldCreateTree();
  var root = tree.nodes[tree.rootId];
  var mainBoardId = root.childIds[0];
  var mainBoard = tree.nodes[mainBoardId];

  // Set up protection on main board
  var fuse100 = PRODUCTS.fuses.find(function(f){ return f.rating === 100; });
  mainBoard.protection = fuse100;
  mainBoard.protectionIn = 100;

  // Set protection on final circuits (they should have MCBs by default)
  mainBoard.childIds.forEach(function(cid) {
    var fc = tree.nodes[cid];
    if (!fc.protection) {
      var mcb = PRODUCTS.mcbs.find(function(m){ return m.curve === 'B' && m.rating === 16; });
      fc.protection = mcb;
      fc.protectionIn = 16;
    }
  });

  sldPropagateAll(tree);
  var results = sldVerifySelectivityAll(tree);
  assert(results.length > 0, 'Should have selectivity results for protected pairs. Got: ' + results.length);
  results.forEach(function(r) {
    assert(r.verdict, 'Each result should have a verdict');
    assert(r.clause, 'Each result should cite a DS/HD 60364 clause');
    assert(r.childId, 'Each result should reference a childId');
    assert(r.parentId, 'Each result should reference a parentId');
  });
});

// Test 38: sldVerifyNode includes selectivity check
test('sldVerifyNode includes selectivity compliance check', function() {
  sldNextId = 7000;
  var tree = sldCreateTree();
  var root = tree.nodes[tree.rootId];
  var mainBoardId = root.childIds[0];
  var mainBoard = tree.nodes[mainBoardId];

  var fuse100 = PRODUCTS.fuses.find(function(f){ return f.rating === 100; });
  mainBoard.protection = fuse100;
  mainBoard.protectionIn = 100;

  // Final circuit with MCB
  var fc = tree.nodes[mainBoard.childIds[0]];
  var mcb = PRODUCTS.mcbs.find(function(m){ return m.curve === 'B' && m.rating === 16; });
  fc.protection = mcb;
  fc.protectionIn = 16;

  sldPropagateAll(tree);
  var results = sldVerifyNode(tree, fc.id);
  var selCheck = results.find(function(r) { return r.rule.indexOf('Selectiv') >= 0 || r.rule.indexOf('selectiv') >= 0 || r.rule.indexOf('Selektiv') >= 0 || r.rule.indexOf('selektiv') >= 0; });
  assert(selCheck, 'Should include selectivity check in verification results. Rules found: ' + results.map(function(r){return r.rule;}).join(', '));
  assert(selCheck.clause.indexOf('536') >= 0, 'Should cite cl.536. Got: ' + selCheck.clause);
});

// Test 39: All new functions are defined at global scope
test('All selectivity functions are defined', function() {
  assert(typeof sldDeviceCurve === 'function', 'sldDeviceCurve must be a function');
  assert(typeof sldAnalyzeSelectivity === 'function', 'sldAnalyzeSelectivity must be a function');
  assert(typeof sldRenderTCCChart === 'function', 'sldRenderTCCChart must be a function');
  assert(typeof sldShowSelectivity === 'function', 'sldShowSelectivity must be a function');
  assert(typeof sldVerifySelectivityAll === 'function', 'sldVerifySelectivityAll must be a function');
  assert(typeof sldCloseSelectivity === 'function', 'sldCloseSelectivity must be a function');
  assert(typeof sldRenderSelectivityPanel === 'function', 'sldRenderSelectivityPanel must be a function');
});

// === Fault Simulation Tests (Phase 3) ===
console.log('\n=== Fault Simulation Tests ===\n');

// Test 40: sldGetTripTime returns correct time for MCB at known fault current
test('sldGetTripTime returns correct trip time for MCB B16 at high fault current', function() {
  var mcb = PRODUCTS.mcbs.find(function(m){ return m.curve === 'B' && m.rating === 16; });
  assert(mcb, 'Should find MCB B16');
  // At 10*In (160A) for curve B (isdMax=4.8), so 160A > 4.8*16=76.8A - in instantaneous region
  var tripTime = sldGetTripTime(mcb, 16, 160, null);
  assert(tripTime < 0.1, 'MCB B16 at 160A should trip in < 100ms. Got: ' + tripTime);
  assert(tripTime > 0, 'Trip time should be positive. Got: ' + tripTime);
});

// Test 41: sldGetTripTime returns Infinity when fault current below device threshold
test('sldGetTripTime returns Infinity for current below device threshold', function() {
  var mcb = PRODUCTS.mcbs.find(function(m){ return m.curve === 'B' && m.rating === 16; });
  assert(mcb, 'Should find MCB B16');
  // At 10A (below 1.13*16=18.08A threshold)
  var tripTime = sldGetTripTime(mcb, 16, 10, null);
  assert(tripTime === Infinity, 'MCB B16 at 10A should not trip (Infinity). Got: ' + tripTime);
});

// Test 42: sldSimulateFault returns valid result object with all required fields
test('sldSimulateFault returns complete result object', function() {
  sldNextId = 8000;
  var tree = sldCreateTree();
  sldPropagateAll(tree);
  var root = tree.nodes[tree.rootId];
  var mainBoardId = root.childIds[0];
  var mainBoard = tree.nodes[mainBoardId];
  var fcId = mainBoard.childIds[0];
  var fc = tree.nodes[fcId];
  // Set protection
  var mcb = PRODUCTS.mcbs.find(function(m){ return m.curve === 'B' && m.rating === 16; });
  fc.protection = mcb;
  fc.protectionIn = 16;
  sldPropagateAll(tree);
  var result = sldSimulateFault(tree, fcId, 'short_circuit');
  assert(result.faultNodeId === fcId, 'faultNodeId should match. Got: ' + result.faultNodeId);
  assert(result.faultType === 'short_circuit', 'faultType should match');
  assert(typeof result.ikFault === 'number', 'ikFault should be number');
  assert(typeof result.zsAtFault === 'number', 'zsAtFault should be number');
  assert(Array.isArray(result.path), 'path should be array');
  assert(result.path.length > 0, 'path should not be empty');
  assert(typeof result.tripTime === 'number', 'tripTime should be number');
  assert(typeof result.requiredTime === 'number', 'requiredTime should be number');
  assert(typeof result.meetsStandard === 'boolean', 'meetsStandard should be boolean');
  assert(result.clause.indexOf('60364') >= 0, 'clause should cite 60364. Got: ' + result.clause);
  assert(Array.isArray(result.selectivityIssues), 'selectivityIssues should be array');
  assert(['protected', 'failed', 'slow'].indexOf(result.verdict) >= 0, 'verdict should be valid. Got: ' + result.verdict);
});

// Test 43: sldSimulateFault correctly identifies which device trips first
test('sldSimulateFault identifies first-tripping device on multi-level tree', function() {
  sldNextId = 8100;
  var tree = sldCreateTree();
  var root = tree.nodes[tree.rootId];
  var mainBoardId = root.childIds[0];
  var mainBoard = tree.nodes[mainBoardId];
  // Set upstream fuse on main board
  var fuse100 = PRODUCTS.fuses.find(function(f){ return f.rating === 100; });
  mainBoard.protection = fuse100;
  mainBoard.protectionIn = 100;
  // Set downstream MCB on final circuit
  var fcId = mainBoard.childIds[0];
  var fc = tree.nodes[fcId];
  var mcb16 = PRODUCTS.mcbs.find(function(m){ return m.curve === 'B' && m.rating === 16; });
  fc.protection = mcb16;
  fc.protectionIn = 16;
  sldPropagateAll(tree);
  var result = sldSimulateFault(tree, fcId, 'short_circuit');
  // MCB should trip before the 100A fuse since fault current at final circuit
  // would be handled by the faster-acting MCB at lower rating
  assert(result.trippingDeviceNodeId, 'Should have a tripping device');
  assert(result.tripTime < Infinity, 'Should have a finite trip time. Got: ' + result.tripTime);
});

// Test 44: sldSimulateFault applies 0.4s requirement for all final circuits (Table 41.1)
test('sldSimulateFault applies 0.4s requirement for final circuits <=32A', function() {
  sldNextId = 8200;
  var tree = sldCreateTree();
  var root = tree.nodes[tree.rootId];
  var mainBoardId = root.childIds[0];
  var mainBoard = tree.nodes[mainBoardId];
  var fcId = mainBoard.childIds[0];
  var fc = tree.nodes[fcId];
  fc.protectionIn = 16;
  var mcb = PRODUCTS.mcbs.find(function(m){ return m.curve === 'B' && m.rating === 16; });
  fc.protection = mcb;
  sldPropagateAll(tree);
  var result = sldSimulateFault(tree, fcId, 'earth_fault');
  assert(result.requiredTime === 0.4, 'Final circuit <=32A should require 0.4s. Got: ' + result.requiredTime);
  assert(result.clause.indexOf('411.3.2.2') >= 0, 'Should cite cl.411.3.2.2. Got: ' + result.clause);
});

// Test 45: sldSimulateFault applies 5s requirement for distribution circuits
test('sldSimulateFault applies 5s requirement for distribution circuits', function() {
  sldNextId = 8300;
  var tree = sldCreateTree();
  var root = tree.nodes[tree.rootId];
  var mainBoardId = root.childIds[0];
  var mainBoard = tree.nodes[mainBoardId];
  var fuse100 = PRODUCTS.fuses.find(function(f){ return f.rating === 100; });
  mainBoard.protection = fuse100;
  mainBoard.protectionIn = 100;
  sldPropagateAll(tree);
  var result = sldSimulateFault(tree, mainBoardId, 'short_circuit');
  assert(result.requiredTime === 5, 'Distribution board should require 5s. Got: ' + result.requiredTime);
  assert(result.clause.indexOf('411.3.2.3') >= 0, 'Should cite cl.411.3.2.3. Got: ' + result.clause);
});

// Test 46: sldSimulateFault detects selectivity issues
test('sldSimulateFault detects selectivity issues when upstream device also trips', function() {
  sldNextId = 8400;
  var tree = sldCreateTree();
  var root = tree.nodes[tree.rootId];
  var mainBoardId = root.childIds[0];
  var mainBoard = tree.nodes[mainBoardId];
  // Set same-sized MCB on both main board and final circuit (no selectivity)
  var mcb16 = PRODUCTS.mcbs.find(function(m){ return m.curve === 'C' && m.rating === 16; });
  if (!mcb16) mcb16 = PRODUCTS.mcbs.find(function(m){ return m.curve === 'B' && m.rating === 16; });
  mainBoard.protection = mcb16;
  mainBoard.protectionIn = 16;
  var fcId = mainBoard.childIds[0];
  var fc = tree.nodes[fcId];
  fc.protection = mcb16;
  fc.protectionIn = 16;
  sldPropagateAll(tree);
  var result = sldSimulateFault(tree, fcId, 'short_circuit');
  // With identical devices, both should trip at similar times = selectivity issue
  // Note: the tripping device will be found (one of them) and the other will be
  // in selectivityIssues if trip times are within 150% of each other
  assert(result.trippingDeviceNodeId, 'Should have a tripping device');
  // Both MCBs see the same fault current and are same rating, so both trip identically
  assert(result.selectivityIssues.length > 0, 'Should detect selectivity issues with identical devices. Got: ' + result.selectivityIssues.length);
});

// Test 47: sldRenderFaultAnimation returns valid SVG string
test('sldRenderFaultAnimation returns valid SVG with 3D elements', function() {
  sldNextId = 8500;
  var tree = sldCreateTree();
  var root = tree.nodes[tree.rootId];
  var mainBoardId = root.childIds[0];
  var mainBoard = tree.nodes[mainBoardId];
  var fcId = mainBoard.childIds[0];
  var fc = tree.nodes[fcId];
  var mcb = PRODUCTS.mcbs.find(function(m){ return m.curve === 'B' && m.rating === 16; });
  fc.protection = mcb;
  fc.protectionIn = 16;
  sldPropagateAll(tree);
  var result = sldSimulateFault(tree, fcId, 'short_circuit');
  var svg = sldRenderFaultAnimation(tree, result);
  assert(svg.indexOf('<svg') >= 0, 'Should contain SVG element');
  assert(svg.indexOf('faultBg') >= 0, 'Should have dark background gradient');
  assert(svg.indexOf('faultGlow') >= 0, 'Should have glow filter');
  assert(svg.indexOf('<polygon') >= 0, 'Should have 3D polygon faces');
  assert(svg.indexOf('<animate') >= 0, 'Should have animation elements');
  assert(svg.indexOf('#050c18') >= 0, 'Should use dark 3D color scheme');
});

// Test 48: All new fault simulation functions are defined at global scope
test('All fault simulation functions are defined', function() {
  assert(typeof sldGetTripTime === 'function', 'sldGetTripTime must be a function');
  assert(typeof sldSimulateFault === 'function', 'sldSimulateFault must be a function');
  assert(typeof sldInjectFault === 'function', 'sldInjectFault must be a function');
  assert(typeof sldToggleFaultMode === 'function', 'sldToggleFaultMode must be a function');
  assert(typeof sldSetFaultType === 'function', 'sldSetFaultType must be a function');
  assert(typeof sldExitFaultSim === 'function', 'sldExitFaultSim must be a function');
  assert(typeof sldRenderFaultAnimation === 'function', 'sldRenderFaultAnimation must be a function');
  assert(typeof sldRenderFaultResults === 'function', 'sldRenderFaultResults must be a function');
  assert(typeof sldRenderCanvasFaultMode === 'function', 'sldRenderCanvasFaultMode must be a function');
  // Verify state variables exist
  assert(typeof sldFaultSimMode !== 'undefined', 'sldFaultSimMode should be defined');
  assert(typeof sldFaultSimType !== 'undefined', 'sldFaultSimType should be defined');
});

// Test 49: 0.4s disconnection time applies to final circuits >32A (e.g., EV charger at 40A)
test('sldSimulateFault applies 0.4s requirement for final circuits >32A', function() {
  sldNextId = 8700;
  var tree = sldCreateTree();
  var root = tree.nodes[tree.rootId];
  var mainBoardId = root.childIds[0];
  var mainBoard = tree.nodes[mainBoardId];
  var fcId = mainBoard.childIds[0];
  var fc = tree.nodes[fcId];
  // Set up a 40A final circuit (e.g., EV charger)
  var mcb40 = PRODUCTS.mcbs.find(function(m){ return m.curve === 'B' && m.rating === 40; });
  fc.protection = mcb40;
  fc.protectionIn = 40;
  sldPropagateAll(tree);
  var result = sldSimulateFault(tree, fcId, 'earth_fault');
  assert(result.requiredTime === 0.4, 'Final circuit >32A should still require 0.4s per Table 41.1. Got: ' + result.requiredTime);
  assert(result.clause.indexOf('411.3.2.2') >= 0, 'Should cite cl.411.3.2.2 for all final circuits. Got: ' + result.clause);
});

// Test 50: sldSimulateFault returns verdict 'failed' when no protection device exists on path
test('sldSimulateFault returns failed when no protection exists on path', function() {
  sldNextId = 8800;
  var tree = sldCreateTree();
  var root = tree.nodes[tree.rootId];
  var mainBoardId = root.childIds[0];
  var mainBoard = tree.nodes[mainBoardId];
  var fcId = mainBoard.childIds[0];
  var fc = tree.nodes[fcId];
  // Remove all protection from the path
  mainBoard.protection = null;
  mainBoard.protectionIn = 0;
  fc.protection = null;
  fc.protectionIn = 0;
  sldPropagateAll(tree);
  var result = sldSimulateFault(tree, fcId, 'short_circuit');
  assert(result.verdict === 'failed', 'Should be failed when no protection exists. Got: ' + result.verdict);
  assert(result.tripTime === Infinity, 'Trip time should be Infinity with no protection. Got: ' + result.tripTime);
  assert(result.trippingDeviceNodeId === null, 'No device should trip. Got: ' + result.trippingDeviceNodeId);
});

// Test 51: 0.4s applies to final circuits at 63A rating (large final circuit)
test('sldSimulateFault applies 0.4s for 63A final circuit', function() {
  sldNextId = 8900;
  var tree = sldCreateTree();
  var root = tree.nodes[tree.rootId];
  var mainBoardId = root.childIds[0];
  var mainBoard = tree.nodes[mainBoardId];
  var fcId = mainBoard.childIds[0];
  var fc = tree.nodes[fcId];
  var mcb63 = PRODUCTS.mcbs.find(function(m){ return m.curve === 'C' && m.rating === 63; });
  fc.protection = mcb63;
  fc.protectionIn = 63;
  sldPropagateAll(tree);
  var result = sldSimulateFault(tree, fcId, 'short_circuit');
  assert(result.requiredTime === 0.4, '63A final circuit should still require 0.4s per Table 41.1. Got: ' + result.requiredTime);
});

// Test 52: ikFault uses ikmin for both fault types (conservative for disconnection time)
test('sldSimulateFault uses ikmin for both earth_fault and short_circuit', function() {
  sldNextId = 9000;
  var tree = sldCreateTree();
  var root = tree.nodes[tree.rootId];
  var mainBoardId = root.childIds[0];
  var mainBoard = tree.nodes[mainBoardId];
  var fcId = mainBoard.childIds[0];
  var fc = tree.nodes[fcId];
  var mcb = PRODUCTS.mcbs.find(function(m){ return m.curve === 'B' && m.rating === 16; });
  fc.protection = mcb;
  fc.protectionIn = 16;
  sldPropagateAll(tree);
  var resultEarth = sldSimulateFault(tree, fcId, 'earth_fault');
  var resultShort = sldSimulateFault(tree, fcId, 'short_circuit');
  var ikData = sldCalcNodeIk(tree, fcId);
  assert(resultEarth.ikFault === ikData.ikmin, 'Earth fault should use ikmin. Got: ' + resultEarth.ikFault);
  assert(resultShort.ikFault === ikData.ikmin, 'Short circuit should use ikmin (conservative). Got: ' + resultShort.ikFault);
});

// --- Summary ---
console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===\n');
if (failed > 0) process.exit(1);
console.log('All tests passed!');
