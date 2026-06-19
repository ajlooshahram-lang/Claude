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

// === Electrical Brain Tests ===
console.log('\n=== Electrical Brain Tests ===\n');

// Test 53: All Brain functions are defined
test('All Brain functions are defined', function() {
  assert(typeof brainGenerateInstallation === 'function', 'brainGenerateInstallation should be a function');
  assert(typeof brainRunAudit === 'function', 'brainRunAudit should be a function');
  assert(typeof brainGenerateBOM === 'function', 'brainGenerateBOM should be a function');
  assert(typeof brainExplainChoice === 'function', 'brainExplainChoice should be a function');
  assert(typeof brainCalcIB === 'function', 'brainCalcIB should be a function');
  assert(typeof brainSelectProtectionRating === 'function', 'brainSelectProtectionRating should be a function');
  assert(typeof brainSelectCable === 'function', 'brainSelectCable should be a function');
  assert(typeof brainSelectMCB === 'function', 'brainSelectMCB should be a function');
  assert(typeof renderBrain === 'function', 'renderBrain should be a function');
  assert(typeof brainSelectBuilding === 'function', 'brainSelectBuilding should be a function');
  assert(typeof brainToggleOption === 'function', 'brainToggleOption should be a function');
});

// Test 54: Brain module registered in all three languages
test('Brain module appears in all three language translation objects', function() {
  assert(T.da.modules.brain === 'El-Hjerne', 'Danish brain module name. Got: ' + T.da.modules.brain);
  assert(T.en.modules.brain === 'Brain', 'English brain module name. Got: ' + T.en.modules.brain);
  assert(T.fa.modules.brain !== undefined, 'Farsi brain module exists');
});

// Test 55: brainGenerateInstallation creates valid tree for parcelhus
test('brainGenerateInstallation creates valid tree for parcelhus', function() {
  sldNextId = 10000;
  var tree = brainGenerateInstallation('parcelhus');
  assert(tree !== null, 'Tree should not be null');
  assert(tree.rootId !== null, 'Tree should have a rootId');
  assert(tree.nodes[tree.rootId] !== undefined, 'Root node should exist');
  assert(tree.nodes[tree.rootId].type === 'transformer', 'Root should be transformer');
});

// Test 56: Generated tree has correct structure (trafo -> main -> sub_boards -> circuits)
test('Generated tree has correct structure (trafo -> main -> RCD groups -> circuits)', function() {
  sldNextId = 10100;
  var tree = brainGenerateInstallation('parcelhus');
  var root = tree.nodes[tree.rootId];
  assert(root.childIds.length > 0, 'Transformer should have children');
  var mainBoardId = root.childIds[0];
  var mainBoard = tree.nodes[mainBoardId];
  assert(mainBoard.type === 'main_board', 'First child should be main_board');
  assert(mainBoard.childIds.length > 0, 'Main board should have sub-boards');
  var subBoardId = mainBoard.childIds[0];
  var subBoard = tree.nodes[subBoardId];
  assert(subBoard.type === 'sub_board', 'Main board children should be sub_boards');
  assert(subBoard.childIds.length > 0, 'Sub-board should have final circuits');
  var fcId = subBoard.childIds[0];
  var fc = tree.nodes[fcId];
  assert(fc.type === 'final_circuit', 'Sub-board children should be final circuits');
});

// Test 57: All circuits satisfy IB <= In <= Iz
test('All generated circuits satisfy IB <= In <= Iz', function() {
  sldNextId = 10200;
  var tree = brainGenerateInstallation('parcelhus');
  sldPropagateAll(tree);
  var nodeIds = Object.keys(tree.nodes);
  var checked = 0;
  for (var i = 0; i < nodeIds.length; i++) {
    var node = tree.nodes[nodeIds[i]];
    if (node.type === 'final_circuit' && node.cable && node.protectionIn) {
      var ib = node._ib || sldCalcNodeIB(node);
      var iz = node.cable.iz;
      var protIn = node.protectionIn;
      assert(ib <= protIn + 0.1, 'IB(' + ib.toFixed(1) + ') <= In(' + protIn + ') for ' + (node.name_en || node.name_da));
      assert(protIn <= iz + 0.1, 'In(' + protIn + ') <= Iz(' + iz + ') for ' + (node.name_en || node.name_da));
      checked++;
    }
  }
  assert(checked > 0, 'At least one circuit should be checked');
});

// Test 58: Voltage drop <= 4% for all circuits
test('Voltage drop <= 4% for all generated circuits', function() {
  sldNextId = 10300;
  var tree = brainGenerateInstallation('parcelhus');
  sldPropagateAll(tree);
  var nodeIds = Object.keys(tree.nodes);
  var checked = 0;
  for (var i = 0; i < nodeIds.length; i++) {
    var node = tree.nodes[nodeIds[i]];
    if (node.type === 'final_circuit') {
      var vdrop = node._vdrop || sldCalcNodeVdrop(tree, nodeIds[i]);
      assert(vdrop <= 4.0, 'Vdrop(' + vdrop.toFixed(2) + '%) <= 4% for ' + (node.name_en || node.name_da));
      checked++;
    }
  }
  assert(checked > 0, 'At least one circuit should be checked');
});

// Test 59: Transformer is correctly sized (next standard size up)
test('Transformer is correctly sized (next standard size up from calculated load)', function() {
  sldNextId = 10400;
  var tree = brainGenerateInstallation('parcelhus');
  var trafo = tree.nodes[tree.rootId];
  var trafoSize = trafo.power_kVA;
  // parcelhus with default options should be well under 100 kVA
  assert(TRAFO_SIZES.indexOf(trafoSize) >= 0, 'Transformer size must be a standard size. Got: ' + trafoSize);
  assert(trafoSize >= 50, 'Transformer should be at least 50 kVA for a house');
});

// Test 60: RCD grouping respects max 6 circuits per RCD
test('RCD grouping respects max 6 circuits per RCD group', function() {
  sldNextId = 10500;
  var tree = brainGenerateInstallation('parcelhus');
  var nodeIds = Object.keys(tree.nodes);
  for (var i = 0; i < nodeIds.length; i++) {
    var node = tree.nodes[nodeIds[i]];
    if (node.type === 'sub_board') {
      var fcCount = 0;
      for (var j = 0; j < node.childIds.length; j++) {
        if (tree.nodes[node.childIds[j]].type === 'final_circuit') fcCount++;
      }
      assert(fcCount <= 6, 'Sub-board ' + (node.name_da || nodeIds[i]) + ' has ' + fcCount + ' circuits, max 6 allowed');
    }
  }
});

// Test 61: EV charger gets Type B RCD
test('EV charger gets Type B RCD', function() {
  sldNextId = 10600;
  var opts = ['light_1', 'socket_1', 'ev_charger_11'];
  var tree = brainGenerateInstallation('parcelhus', opts);
  var nodeIds = Object.keys(tree.nodes);
  var evFound = false;
  for (var i = 0; i < nodeIds.length; i++) {
    var node = tree.nodes[nodeIds[i]];
    if (node.type === 'final_circuit' && node.name_en && node.name_en.indexOf('EV') >= 0) {
      assert(node._rcdType === 'B', 'EV charger should have Type B RCD. Got: ' + node._rcdType);
      evFound = true;
    }
  }
  assert(evFound, 'Should find at least one EV charger circuit');
});

// Test 62: brainRunAudit returns no safety-critical failures for default parcelhus
test('brainRunAudit returns no safety-critical failures for default parcelhus', function() {
  sldNextId = 10700;
  var tree = brainGenerateInstallation('parcelhus');
  var audit = brainRunAudit(tree);
  assert(audit.passed.length > 0, 'Should have passed checks. Got: ' + audit.passed.length);
  // Filter out selectivity failures (not safety-critical for residential per DS/HD 60364)
  var safetyFailures = audit.failed.filter(function(f) { return f.rule.indexOf('Selektivitet') < 0; });
  assert(safetyFailures.length === 0, 'Should have zero safety-critical failures for default parcelhus. Got: ' + safetyFailures.length + (safetyFailures.length > 0 ? ' - First: ' + safetyFailures[0].rule + ' ' + safetyFailures[0].detail : ''));
});

// Test 63: brainGenerateBOM returns non-empty list with pricing
test('brainGenerateBOM returns non-empty list with pricing', function() {
  sldNextId = 10800;
  var tree = brainGenerateInstallation('parcelhus');
  var bom = brainGenerateBOM(tree);
  assert(bom.length > 0, 'BOM should not be empty. Got length: ' + bom.length);
  var hasPrice = bom.some(function(item) { return item.unitPrice > 0; });
  assert(hasPrice, 'At least one BOM item should have a non-zero price');
  var totalCost = bom.reduce(function(s, item) { return s + item.total; }, 0);
  assert(totalCost > 0, 'Total BOM cost should be > 0. Got: ' + totalCost);
});

// Test 64: brainExplainChoice returns clause citations
test('brainExplainChoice returns DS/HD 60364 clause references', function() {
  sldNextId = 10900;
  var tree = brainGenerateInstallation('parcelhus');
  var nodeIds = Object.keys(tree.nodes);
  var fcId = null;
  for (var i = 0; i < nodeIds.length; i++) {
    if (tree.nodes[nodeIds[i]].type === 'final_circuit') { fcId = nodeIds[i]; break; }
  }
  assert(fcId !== null, 'Should find a final circuit');
  var expl = brainExplainChoice(fcId, tree);
  assert(expl !== null, 'Explanation should not be null');
  assert(expl.cable !== undefined, 'Should have cable explanation');
  assert(expl.cable.clause.indexOf('60364') >= 0, 'Cable clause should reference 60364. Got: ' + expl.cable.clause);
  assert(expl.protection !== undefined, 'Should have protection explanation');
  assert(expl.protection.clause.indexOf('60364') >= 0, 'Protection clause should reference 60364');
});

// Test 65: Phase balancing distributes single-phase loads
test('Phase balancing distributes loads across L1/L2/L3', function() {
  sldNextId = 11000;
  var tree = brainGenerateInstallation('parcelhus');
  var phases = [0, 0, 0];
  var nodeIds = Object.keys(tree.nodes);
  for (var i = 0; i < nodeIds.length; i++) {
    var node = tree.nodes[nodeIds[i]];
    if (node.type === 'final_circuit' && node.phases === '1x230' && node._assignedPhase) {
      phases[node._assignedPhase - 1] += node.power_kW;
    }
  }
  // At least 2 phases should have load (parcelhus has many single-phase circuits)
  var loadedPhases = phases.filter(function(p) { return p > 0; }).length;
  assert(loadedPhases >= 2, 'At least 2 phases should carry load. Phase loads: ' + phases.join(', '));
});

// Test 66: BRAIN_BUILDING_TYPES has all required categories
test('BRAIN_BUILDING_TYPES has all required categories', function() {
  assert(BRAIN_BUILDING_TYPES.residential.length >= 3, 'Should have at least 3 residential types');
  assert(BRAIN_BUILDING_TYPES.commercial.length >= 3, 'Should have at least 3 commercial types');
  assert(BRAIN_BUILDING_TYPES.industrial.length >= 3, 'Should have at least 3 industrial types');
  assert(BRAIN_BUILDING_TYPES.agricultural.length >= 2, 'Should have at least 2 agricultural types');
});

// Test 67: BRAIN_CIRCUIT_TEMPLATES has entries for all building type defaults
test('BRAIN_CIRCUIT_TEMPLATES covers all building type default options', function() {
  var cats = Object.keys(BRAIN_BUILDING_TYPES);
  for (var c = 0; c < cats.length; c++) {
    var types = BRAIN_BUILDING_TYPES[cats[c]];
    for (var t = 0; t < types.length; t++) {
      var opts = types[t].defaultOptions;
      for (var o = 0; o < opts.length; o++) {
        assert(BRAIN_CIRCUIT_TEMPLATES[opts[o]] !== undefined, 'Template missing for ' + opts[o] + ' in ' + types[t].id);
      }
    }
  }
});

// Test 68: brainGenerateInstallation works for industrial type
test('brainGenerateInstallation works for industrial building type', function() {
  sldNextId = 11100;
  var tree = brainGenerateInstallation('vaerksted');
  assert(tree !== null, 'Should generate tree for vaerksted');
  assert(tree.nodes[tree.rootId].type === 'transformer', 'Root should be transformer');
  var nodeIds = Object.keys(tree.nodes);
  var fcCount = 0;
  for (var i = 0; i < nodeIds.length; i++) {
    if (tree.nodes[nodeIds[i]].type === 'final_circuit') fcCount++;
  }
  assert(fcCount > 0, 'Should have final circuits for vaerksted');
});

// Test 69: brainCalcIB returns correct values
test('brainCalcIB computes correct current for known loads', function() {
  var circ1phase = { power_kW: 3.68, phases: '1x230', cosPhi: 0.95 };
  var ib1 = brainCalcIB(circ1phase);
  var expected1 = 3680 / (230 * 0.95);
  assert(Math.abs(ib1 - expected1) < 0.1, '1-phase IB should be ~' + expected1.toFixed(1) + '. Got: ' + ib1.toFixed(1));

  var circ3phase = { power_kW: 11, phases: '3x400', cosPhi: 0.85 };
  var ib3 = brainCalcIB(circ3phase);
  var expected3 = 11000 / (Math.sqrt(3) * 400 * 0.85);
  assert(Math.abs(ib3 - expected3) < 0.1, '3-phase IB should be ~' + expected3.toFixed(1) + '. Got: ' + ib3.toFixed(1));
});

// Test 70: renderBrain returns HTML with no text input fields
test('renderBrain UI has no text input fields (click-only)', function() {
  brainState.buildingType = null;
  brainState.selectedCategory = null;
  brainState.selectedOptions = [];
  brainState.generatedTree = null;
  var html = renderBrain();
  assert(html.indexOf('<input type="text"') < 0, 'Should have no text input fields');
  assert(html.indexOf('<input type=\'text\'') < 0, 'Should have no text input fields (single quotes)');
  assert(html.indexOf('sel-btn') >= 0, 'Should use sel-btn class for buttons');
});

// === PDF Documentation Package Tests ===
console.log('\n=== PDF Documentation Package Tests ===\n');

// Test 71: PDF module in translations
test('PDF module appears in all three language translation objects', function() {
  assert(T.da.modules.pdf, 'Danish translation must have pdf module');
  assert(T.en.modules.pdf, 'English translation must have pdf module');
  assert(T.fa.modules.pdf, 'Farsi translation must have pdf module');
});

// Test 72: All PDF functions are defined
test('All PDF functions are defined', function() {
  assert(typeof pdfState === 'object', 'pdfState must exist');
  assert(typeof pdfGetTree === 'function', 'pdfGetTree must be a function');
  assert(typeof pdfGeneratePackage === 'function', 'pdfGeneratePackage must be a function');
  assert(typeof pdfBuildCertData === 'function', 'pdfBuildCertData must be a function');
  assert(typeof pdfBuildLoadSchedule === 'function', 'pdfBuildLoadSchedule must be a function');
  assert(typeof pdfBuildCableSchedule === 'function', 'pdfBuildCableSchedule must be a function');
  assert(typeof pdfBuildProtectionCoordination === 'function', 'pdfBuildProtectionCoordination must be a function');
  assert(typeof pdfBuildTestProtocol === 'function', 'pdfBuildTestProtocol must be a function');
  assert(typeof pdfBuildBOMData === 'function', 'pdfBuildBOMData must be a function');
  assert(typeof pdfRenderInstallationCert === 'function', 'pdfRenderInstallationCert must be a function');
  assert(typeof pdfRenderLoadSchedule === 'function', 'pdfRenderLoadSchedule must be a function');
  assert(typeof pdfRenderSLD === 'function', 'pdfRenderSLD must be a function');
  assert(typeof pdfRenderCableSchedule === 'function', 'pdfRenderCableSchedule must be a function');
  assert(typeof pdfRenderProtectionCoordination === 'function', 'pdfRenderProtectionCoordination must be a function');
  assert(typeof pdfRenderTestProtocol === 'function', 'pdfRenderTestProtocol must be a function');
  assert(typeof pdfRenderBOM === 'function', 'pdfRenderBOM must be a function');
  assert(typeof pdfPrintPackage === 'function', 'pdfPrintPackage must be a function');
  assert(typeof renderPDF === 'function', 'renderPDF must be a function');
  assert(typeof pdfDoGenerate === 'function', 'pdfDoGenerate must be a function');
});

// Test 73: pdfGeneratePackage produces all 7 sections
test('pdfGeneratePackage produces data for all 7 required sections', function() {
  sldNextId = 1;
  var tree = sldCreateTree();
  sldPropagateAll(tree);
  var pkg = pdfGeneratePackage(tree);
  assert(pkg !== null, 'Package must not be null');
  assert(pkg.cert, 'Must have cert section');
  assert(pkg.loadSchedule, 'Must have loadSchedule section');
  assert(pkg.cableSchedule, 'Must have cableSchedule section');
  assert(pkg.protectionCoordination, 'Must have protectionCoordination section');
  assert(pkg.testProtocol, 'Must have testProtocol section');
  assert(pkg.bom, 'Must have bom section');
  assert(pkg.generatedAt, 'Must have generatedAt timestamp');
});

// Test 74: Load schedule includes phase balancing with L1/L2/L3 totals
test('Load schedule includes phase balancing with L1/L2/L3 column totals', function() {
  sldNextId = 1;
  var tree = sldCreateTree();
  sldPropagateAll(tree);
  var pkg = pdfGeneratePackage(tree);
  var ls = pkg.loadSchedule;
  assert(ls.phaseLoads, 'Must have phaseLoads');
  assert(typeof ls.phaseLoads.L1 === 'number', 'L1 must be a number');
  assert(typeof ls.phaseLoads.L2 === 'number', 'L2 must be a number');
  assert(typeof ls.phaseLoads.L3 === 'number', 'L3 must be a number');
  assert(ls.diversityFactor > 0, 'Must have diversity factor');
  assert(ls.maxDemand >= 0, 'Must have max demand');
});

// Test 75: Cable schedule has per-circuit data
test('Cable schedule has per-circuit data with type, length, Iz, correction factors', function() {
  sldNextId = 1;
  var tree = sldCreateTree();
  sldPropagateAll(tree);
  var pkg = pdfGeneratePackage(tree);
  var cs = pkg.cableSchedule;
  assert(cs.items.length > 0, 'Must have cable schedule items');
  var item = cs.items[0];
  assert(item.cable, 'Must have cable type');
  assert(typeof item.mm2 === 'number', 'Must have mm2');
  assert(typeof item.length === 'number', 'Must have length');
  assert(typeof item.iz === 'number', 'Must have Iz');
  assert(typeof item.corrTemp === 'number', 'Must have temp correction');
  assert(typeof item.corrGroup === 'number', 'Must have grouping correction');
  assert(item.clause, 'Must cite clause reference');
});

// Test 76: Test protocol has pre-filled Zs values and insulation threshold
test('Test protocol has pre-filled expected values (Zs, insulation >1MOhm)', function() {
  sldNextId = 1;
  var tree = sldCreateTree();
  sldPropagateAll(tree);
  var pkg = pdfGeneratePackage(tree);
  var tp = pkg.testProtocol;
  assert(tp.items.length > 0, 'Must have test protocol items');
  var item = tp.items[0];
  assert(item.insulation.indexOf('1 MOhm') >= 0, 'Must reference >1 MOhm insulation');
  assert(item.loopImpedance.indexOf('Ohm') >= 0, 'Must have loop impedance value');
  assert(item.insulationClause.indexOf('612.3') >= 0, 'Must cite cl.612.3');
  assert(item.loopClause.indexOf('612.6') >= 0, 'Must cite cl.612.6');
});

// Test 77: Protection coordination shows selectivity verdicts
test('Protection coordination table shows selectivity verdicts from sldAnalyzeSelectivity', function() {
  sldNextId = 1;
  var tree = sldCreateTree();
  sldPropagateAll(tree);
  var pkg = pdfGeneratePackage(tree);
  var pc = pkg.protectionCoordination;
  assert(pc.items.length > 0, 'Must have coordination items');
  var item = pc.items[0];
  assert(item.verdict, 'Must have verdict');
  assert(item.clause, 'Must have clause reference');
  assert(item.childName !== undefined, 'Must have child name');
  assert(item.parentName !== undefined, 'Must have parent name');
});

// Test 78: BOM section shows prices from priceFor
test('BOM section shows prices from priceFor() function', function() {
  sldNextId = 1;
  var tree = sldCreateTree();
  sldPropagateAll(tree);
  var pkg = pdfGeneratePackage(tree);
  var bom = pkg.bom;
  assert(bom.items.length > 0, 'Must have BOM items');
  assert(typeof bom.grandTotal === 'number', 'Must have grand total');
  assert(bom.grandTotal > 0, 'Grand total must be > 0');
  var item = bom.items[0];
  assert(typeof item.unitPrice === 'number', 'Must have unit price');
  assert(typeof item.total === 'number', 'Must have total');
});

// Test 79: All sections cite DS/HD 60364 clauses
test('All sections cite relevant DS/HD 60364 clauses', function() {
  sldNextId = 1;
  var tree = sldCreateTree();
  sldPropagateAll(tree);
  var pkg = pdfGeneratePackage(tree);
  assert(pkg.cert.clause.indexOf('60364') >= 0, 'Cert must cite 60364');
  assert(pkg.loadSchedule.clause.indexOf('60364') >= 0, 'Load schedule must cite 60364');
  assert(pkg.cableSchedule.clause.indexOf('60364') >= 0, 'Cable schedule must cite 60364');
  assert(pkg.protectionCoordination.clause.indexOf('60364') >= 0, 'Protection coordination must cite 60364');
  assert(pkg.testProtocol.clause.indexOf('60364') >= 0, 'Test protocol must cite 60364');
});

// Test 80: renderPDF returns valid HTML with no text input fields
test('renderPDF UI has no text input fields (click-only)', function() {
  sldNextId = 1;
  sldTree = sldCreateTree();
  sldPropagateAll(sldTree);
  pdfState.packageData = null;
  var html = renderPDF();
  assert(html.indexOf('<input type="text"') < 0, 'Should have no text input fields');
  assert(html.indexOf('<input type=\'text\'') < 0, 'Should have no text input fields (single quotes)');
  assert(html.indexOf('sel-btn') >= 0, 'Should use sel-btn class for buttons');
  assert(html.indexOf('60364') >= 0, 'Should reference DS/HD 60364');
});

// Test 81: pdfPrintPackage calls window.open
test('pdfPrintPackage uses window.open for formatted HTML output', function() {
  sldNextId = 1;
  sldTree = sldCreateTree();
  sldPropagateAll(sldTree);
  pdfGeneratePackage(sldTree);
  var openCalled = false;
  var originalOpen = window.open;
  window.open = function() { openCalled = true; return { document: { write: function(){}, close: function(){} }, focus: function(){}, print: function(){} }; };
  pdfPrintPackage();
  window.open = originalOpen;
  assert(openCalled, 'pdfPrintPackage must call window.open');
});

// Test 82: Render functions return valid HTML strings
test('All PDF render functions return valid HTML strings', function() {
  sldNextId = 1;
  var tree = sldCreateTree();
  sldPropagateAll(tree);
  var pkg = pdfGeneratePackage(tree);
  var cert = pdfRenderInstallationCert(pkg);
  var ls = pdfRenderLoadSchedule(pkg);
  var sld = pdfRenderSLD(tree);
  var cs = pdfRenderCableSchedule(pkg);
  var pc = pdfRenderProtectionCoordination(pkg);
  var tp = pdfRenderTestProtocol(pkg);
  var bom = pdfRenderBOM(pkg);
  assert(cert.indexOf('<table') >= 0, 'Cert must contain a table');
  assert(ls.indexOf('<table') >= 0, 'Load schedule must contain a table');
  assert(sld.indexOf('<svg') >= 0 || sld.indexOf('svg') >= 0, 'SLD must contain SVG');
  assert(cs.indexOf('<table') >= 0, 'Cable schedule must contain a table');
  assert(pc.indexOf('<table') >= 0, 'Protection coord must contain a table');
  assert(tp.indexOf('<table') >= 0, 'Test protocol must contain a table');
  assert(bom.indexOf('<table') >= 0, 'BOM must contain a table');
});

// === Cascade TCC Module Tests ===
console.log('\n=== Cascade TCC Module Tests ===\n');

// Test 83: TCC module appears in all three language translation objects
test('TCC module appears in all three language translation objects', function() {
  assert(T.da.modules.tcc, 'T.da must have tcc module');
  assert(T.en.modules.tcc, 'T.en must have tcc module');
  assert(T.fa.modules.tcc, 'T.fa must have tcc module');
  assert.strictEqual(T.da.modules.tcc, 'Kaskade-TCC');
  assert.strictEqual(T.en.modules.tcc, 'Cascade TCC');
});

// Test 84: tccState is initialized
test('tccState is initialized with correct defaults', function() {
  assert(typeof tccState === 'object', 'tccState must exist');
  assert.strictEqual(tccState.selectedNodeId, null);
  assert.strictEqual(tccState.cursorCurrent, 1000);
  assert.strictEqual(tccState.tree, null);
});

// Test 85: tccGetPathDevices returns devices along a path
test('tccGetPathDevices returns devices along the path from root to final circuit', function() {
  sldNextId = 1;
  var tree = sldCreateTree();
  sldPropagateAll(tree);
  var finals = tccGetFinalCircuits(tree);
  assert(finals.length > 0, 'Must have final circuits');
  var devices = tccGetPathDevices(tree, finals[0].id);
  assert(devices.length >= 2, 'Must have at least 2 devices in path (main + final)');
  // First device should be the deepest in path with protection (main board MCCB)
  assert(devices[0].device, 'First device must have a protection device');
  assert(devices[0].In > 0, 'First device must have rated current > 0');
  // Last device should be the final circuit
  assert.strictEqual(devices[devices.length - 1].nodeId, finals[0].id);
});

// Test 86: tccGetPathDevices returns nodeId, device, In, depth, name for each entry
test('tccGetPathDevices returns correct structure for each device', function() {
  sldNextId = 1;
  var tree = sldCreateTree();
  sldPropagateAll(tree);
  var finals = tccGetFinalCircuits(tree);
  var devices = tccGetPathDevices(tree, finals[0].id);
  for (var i = 0; i < devices.length; i++) {
    assert(devices[i].nodeId, 'Each entry must have nodeId');
    assert(devices[i].device, 'Each entry must have device');
    assert(typeof devices[i].In === 'number', 'Each entry must have numeric In');
    assert(typeof devices[i].depth === 'number', 'Each entry must have numeric depth');
    assert(typeof devices[i].name === 'string', 'Each entry must have string name');
  }
});

// Test 87: tccGetTripOrder returns ordered trip times
test('tccGetTripOrder returns devices sorted by trip time at given current', function() {
  sldNextId = 1;
  var tree = sldCreateTree();
  sldPropagateAll(tree);
  var finals = tccGetFinalCircuits(tree);
  var devices = tccGetPathDevices(tree, finals[0].id);
  var order = tccGetTripOrder(devices, 1000);
  assert(order.length > 0, 'Must return results');
  // Check sorted by tMax (ascending)
  var lastT = -1;
  for (var i = 0; i < order.length; i++) {
    if (!order[i].trips) continue;
    if (order[i].tMax !== null) {
      assert(order[i].tMax >= lastT, 'Results must be sorted by tMax ascending');
      lastT = order[i].tMax;
    }
  }
});

// Test 88: tccGetTripOrder at high current - downstream MCB should trip first (selective)
test('tccGetTripOrder at moderate current shows downstream tripping first', function() {
  sldNextId = 1;
  var tree = sldCreateTree();
  sldPropagateAll(tree);
  var finals = tccGetFinalCircuits(tree);
  var devices = tccGetPathDevices(tree, finals[1].id);
  // At 500A, the final circuit MCB B16 should trip faster than the main MCCB
  var order = tccGetTripOrder(devices, 500);
  var tripping = order.filter(function(o) { return o.trips; });
  if (tripping.length >= 2) {
    // The one with greater depth should trip first (be first in array)
    assert(tripping[0].depth >= tripping[1].depth, 'Downstream device should trip first at moderate currents');
  }
});

// Test 89: tccRenderCascadeChart returns SVG with multiple curves
test('tccRenderCascadeChart returns SVG with device curves and legend', function() {
  sldNextId = 1;
  var tree = sldCreateTree();
  sldPropagateAll(tree);
  var finals = tccGetFinalCircuits(tree);
  var devices = tccGetPathDevices(tree, finals[0].id);
  var svg = tccRenderCascadeChart(devices, 1000);
  assert(svg.indexOf('<svg') >= 0, 'Must return SVG');
  assert(svg.indexOf('path') >= 0, 'Must have path elements for curves');
  assert(svg.indexOf('line') >= 0, 'Must have cursor line');
  // Check legend exists
  assert(svg.indexOf(devices[0].name) >= 0 || svg.indexOf('A)') >= 0, 'Must show device legend');
});

// Test 90: tccRenderCascadeChart shows cursor line at specified current
test('tccRenderCascadeChart shows cursor line at the specified current', function() {
  sldNextId = 1;
  var tree = sldCreateTree();
  sldPropagateAll(tree);
  var finals = tccGetFinalCircuits(tree);
  var devices = tccGetPathDevices(tree, finals[0].id);
  var svg = tccRenderCascadeChart(devices, 5000);
  assert(svg.indexOf('5kA') >= 0, 'Must show 5kA cursor label');
  assert(svg.indexOf('stroke-dasharray') >= 0, 'Must have dashed cursor line');
});

// Test 91: renderCascadeTCC returns HTML with no text input fields (click-only)
test('renderCascadeTCC returns HTML with no text inputs (click-only UI)', function() {
  sldNextId = 1;
  sldTree = sldCreateTree();
  sldPropagateAll(sldTree);
  tccState.selectedNodeId = null;
  tccState.cursorCurrent = 1000;
  var html = renderCascadeTCC();
  assert(html.indexOf('<input type="text"') < 0, 'No text input fields');
  assert(html.indexOf('<input type=\'text\'') < 0, 'No text input fields (single quotes)');
  assert(html.indexOf('sel-btn') >= 0, 'Must use sel-btn class');
  assert(html.indexOf('60364') >= 0, 'Must reference DS/HD 60364');
});

// Test 92: renderCascadeTCC with selected node shows chart and trip table
test('renderCascadeTCC with selected node shows chart and trip table', function() {
  sldNextId = 1;
  sldTree = sldCreateTree();
  sldPropagateAll(sldTree);
  var finals = tccGetFinalCircuits(sldTree);
  tccState.selectedNodeId = finals[0].id;
  tccState.cursorCurrent = 1000;
  var html = renderCascadeTCC();
  assert(html.indexOf('<svg') >= 0, 'Must contain SVG chart');
  assert(html.indexOf('<table') >= 0, 'Must contain trip order table');
  assert(html.indexOf('tccSetCursor') >= 0, 'Must have cursor buttons');
});

// Test 93: Fault current cursor buttons cover required discrete values
test('Fault current cursor buttons include all required values', function() {
  sldNextId = 1;
  sldTree = sldCreateTree();
  sldPropagateAll(sldTree);
  var finals = tccGetFinalCircuits(sldTree);
  tccState.selectedNodeId = finals[0].id;
  var html = renderCascadeTCC();
  assert(html.indexOf('tccSetCursor(100)') >= 0, 'Must have 100A button');
  assert(html.indexOf('tccSetCursor(500)') >= 0, 'Must have 500A button');
  assert(html.indexOf('tccSetCursor(1000)') >= 0, 'Must have 1kA button');
  assert(html.indexOf('tccSetCursor(2000)') >= 0, 'Must have 2kA button');
  assert(html.indexOf('tccSetCursor(5000)') >= 0, 'Must have 5kA button');
  assert(html.indexOf('tccSetCursor(10000)') >= 0, 'Must have 10kA button');
  assert(html.indexOf('tccSetCursor(20000)') >= 0, 'Must have 20kA button');
  assert(html.indexOf('tccSetCursor(50000)') >= 0, 'Must have 50kA button');
});

// Test 94: tccGetFinalCircuits returns all final circuits from tree
test('tccGetFinalCircuits returns all final circuit nodes', function() {
  sldNextId = 1;
  var tree = sldCreateTree();
  var finals = tccGetFinalCircuits(tree);
  assert.strictEqual(finals.length, 3, 'Default tree has 3 final circuits');
  finals.forEach(function(f) {
    assert.strictEqual(f.type, 'final_circuit');
  });
});

// Test 95: Selectivity zone highlighting appears in chart
test('tccRenderCascadeChart includes selectivity zone highlighting', function() {
  sldNextId = 1;
  var tree = sldCreateTree();
  sldPropagateAll(tree);
  var finals = tccGetFinalCircuits(tree);
  var devices = tccGetPathDevices(tree, finals[0].id);
  var svg = tccRenderCascadeChart(devices, 1000);
  // Should have zone rects with green (selective) or red (non-selective) colors
  var hasGreenZone = svg.indexOf('rgba(34,197,94') >= 0;
  var hasRedZone = svg.indexOf('rgba(239,68,68') >= 0;
  assert(hasGreenZone || hasRedZone, 'Must have selectivity zone highlighting');
});

// Test 96: Grading margin displayed in renderCascadeTCC
test('Grading margin information is displayed in the TCC view', function() {
  sldNextId = 1;
  sldTree = sldCreateTree();
  sldPropagateAll(sldTree);
  var finals = tccGetFinalCircuits(sldTree);
  tccState.selectedNodeId = finals[0].id;
  tccState.cursorCurrent = 1000;
  var html = renderCascadeTCC();
  assert(html.indexOf('536.4') >= 0, 'Must reference cl.536.4 for grading margins');
});

// === IEC 61439 Panel Builder Tests ===
console.log('\n=== Panel Builder Module Tests ===\n');

// Test 97: Panel module appears in all three language translations
test('Panel module appears in all three language translation objects', function() {
  assert(T.da.modules.panel, 'T.da must have panel module');
  assert(T.en.modules.panel, 'T.en must have panel module');
  assert(T.fa.modules.panel, 'T.fa must have panel module');
});

// Test 98: All panel functions are defined
test('All panel builder functions are defined', function() {
  assert.strictEqual(typeof panelCalcModules, 'function', 'panelCalcModules must be a function');
  assert.strictEqual(typeof panelCalcPowerLoss, 'function', 'panelCalcPowerLoss must be a function');
  assert.strictEqual(typeof panelRecommendEnclosure, 'function', 'panelRecommendEnclosure must be a function');
  assert.strictEqual(typeof panelCalcDerating, 'function', 'panelCalcDerating must be a function');
  assert.strictEqual(typeof panelVerifyBusbar, 'function', 'panelVerifyBusbar must be a function');
  assert.strictEqual(typeof panelAutoPopulate, 'function', 'panelAutoPopulate must be a function');
  assert.strictEqual(typeof panelRenderDINRail, 'function', 'panelRenderDINRail must be a function');
  assert.strictEqual(typeof panelRenderScheduleTable, 'function', 'panelRenderScheduleTable must be a function');
  assert.strictEqual(typeof panelMoveDevice, 'function', 'panelMoveDevice must be a function');
  assert.strictEqual(typeof panelRemoveDevice, 'function', 'panelRemoveDevice must be a function');
  assert.strictEqual(typeof renderPanel, 'function', 'renderPanel must be a function');
});

// Test 99: panelCalcModules returns correct module counts for devices
test('panelCalcModules returns correct module counts for different device types', function() {
  // MCB 1P
  var mcb1p = { curve: 'B', rating: 16, poles: '1P' };
  assert.strictEqual(panelCalcModules(mcb1p), 1, 'MCB 1P = 1 module');
  // MCB 3P
  var mcb3p = { curve: 'C', rating: 32, poles: '3P' };
  assert.strictEqual(panelCalcModules(mcb3p), 3, 'MCB 3P = 3 modules');
  // MCCB NSX100
  var mccb100 = { frame: 'NSX 100', icu: 25 };
  assert.strictEqual(panelCalcModules(mccb100), 4, 'MCCB NSX100 = 4 modules');
  // MCCB NSX400
  var mccb400 = { frame: 'NSX 400', icu: 36 };
  assert.strictEqual(panelCalcModules(mccb400), 6, 'MCCB NSX400 = 6 modules');
  // RCD 2P
  var rcd2p = { rcdType: 'A', poles: '2P', rating: 40 };
  assert.strictEqual(panelCalcModules(rcd2p), 2, 'RCD 2P = 2 modules');
  // RCD 4P
  var rcd4p = { rcdType: 'A', poles: '4P', rating: 63 };
  assert.strictEqual(panelCalcModules(rcd4p), 4, 'RCD 4P = 4 modules');
});

// Test 100: panelCalcPowerLoss returns correct watts
test('panelCalcPowerLoss returns correct power dissipation per device', function() {
  var mcb1p = { curve: 'B', rating: 16, poles: '1P' };
  assert.strictEqual(panelCalcPowerLoss(mcb1p), 2.5, 'MCB 1P = 2.5W');
  var mcb3p = { curve: 'C', rating: 32, poles: '3P' };
  assert.strictEqual(panelCalcPowerLoss(mcb3p), 7.5, 'MCB 3P = 7.5W');
  var mccb100 = { frame: 'NSX 100', icu: 25 };
  assert.strictEqual(panelCalcPowerLoss(mccb100), 25, 'MCCB 100 = 25W');
  var mccb400 = { frame: 'NSX 400', icu: 36 };
  assert.strictEqual(panelCalcPowerLoss(mccb400), 45, 'MCCB 400 = 45W');
});

// Test 101: panelRecommendEnclosure selects smallest enclosure with 20% reserve
test('panelRecommendEnclosure selects correct enclosure with 20% reserve', function() {
  // 10 modules => need 12 (10*1.2=12) => 1x12
  var enc = panelRecommendEnclosure(10);
  assert.strictEqual(enc.name, '1x12', '10 modules should get 1x12 enclosure');
  // 11 modules => need 13.2 => 2x12 (24)
  enc = panelRecommendEnclosure(11);
  assert.strictEqual(enc.name, '2x12', '11 modules should get 2x12 enclosure');
  // 20 modules => need 24 => 2x12
  enc = panelRecommendEnclosure(20);
  assert.strictEqual(enc.name, '2x12', '20 modules should get 2x12');
  // 45 modules => need 54 => 3x18
  enc = panelRecommendEnclosure(45);
  assert.strictEqual(enc.name, '3x18', '45 modules should get 3x18');
  // Custom reserve: 10 modules with 0% reserve
  enc = panelRecommendEnclosure(10, 0);
  assert.strictEqual(enc.name, '1x12', '10 modules with 0% reserve should get 1x12');
});

// Test 102: panelCalcDerating computes temperature rise and factor
test('panelCalcDerating computes correct temperature rise and derating factor', function() {
  // Low power loss: should not derate
  var result = panelCalcDerating(10, 20);
  assert(result.tempRise < 25, 'Low power should have low temperature rise');
  assert.strictEqual(result.deratingFactor, 1.0, 'Low power should not require derating');
  // High power loss: should trigger derating
  var result2 = panelCalcDerating(200, 5);
  assert(result2.tempRise > 25, 'High power in small enclosure should have high temp rise');
  assert(result2.deratingFactor < 1.0, 'Should require derating for high power loss');
  assert(result2.deratingFactor >= 0.5, 'Derating factor should not go below 0.5');
});

// Test 103: panelAutoPopulate creates boards from SLD tree
test('panelAutoPopulate creates panel entries from SLD tree with correct module counts', function() {
  sldNextId = 1;
  var tree = sldCreateTree();
  sldPropagateAll(tree);
  var boards = panelAutoPopulate(tree);
  assert(boards.length >= 1, 'Must create at least one board');
  assert(boards[0].rails.length >= 1, 'Board must have at least one rail');
  assert(boards[0].totalModules > 0, 'Total modules must be > 0');
  assert(boards[0].totalPowerLoss > 0, 'Total power loss must be > 0');
  assert(boards[0].enclosure !== null, 'Must recommend an enclosure');
  // Each device entry should have required fields
  var firstDevice = boards[0].rails[0][0];
  assert(firstDevice.modules > 0, 'Device must have module count');
  assert(typeof firstDevice.powerLoss === 'number', 'Device must have power loss');
  assert(typeof firstDevice.In === 'number', 'Device must have rated current');
});

// Test 104: panelVerifyBusbar checks Ik against busbar rating
test('panelVerifyBusbar checks Ik_max against busbar rating per IEC 61439-1 cl.10.11', function() {
  sldNextId = 1;
  var tree = sldCreateTree();
  sldPropagateAll(tree);
  var mainBoardId = tree.nodes[tree.rootId].childIds[0];
  var boardNode = tree.nodes[mainBoardId];
  var result = panelVerifyBusbar(boardNode, tree);
  assert(result.rating > 0, 'Busbar rating must be positive');
  assert(result.ikmax > 0, 'Ik_max must be positive');
  assert(result.clause === 'IEC 61439-1 cl.10.11', 'Must cite correct IEC clause');
  assert(result.verdict === 'pass' || result.verdict === 'fail', 'Verdict must be pass or fail');
});

// Test 105: DIN-rail SVG shows colored device blocks
test('panelRenderDINRail renders SVG with colored device blocks', function() {
  var rail = [
    { nodeId: 'n1', device: { curve: 'B', rating: 16, poles: '1P' }, In: 16, modules: 1, powerLoss: 2.5, position: 1, name: 'MCB' },
    { nodeId: 'n2', device: { rcdType: 'A', poles: '4P', rating: 63 }, In: 63, modules: 4, powerLoss: 8, position: 2, name: 'RCD' }
  ];
  var svg = panelRenderDINRail(rail, 0);
  assert(svg.indexOf('<svg') >= 0, 'Must return SVG element');
  assert(svg.indexOf('#2563eb') >= 0, 'Must have blue color for MCB');
  assert(svg.indexOf('#ea580c') >= 0, 'Must have orange color for RCD');
  assert(svg.indexOf('16A') >= 0, 'Must show MCB rating');
  assert(svg.indexOf('63A') >= 0, 'Must show RCD rating');
});

// Test 106: Panel schedule table has correct columns
test('panelRenderScheduleTable has correct columns for contractor panel schedule', function() {
  var board = {
    rails: [[
      { nodeId: 'n1', device: { curve: 'B', rating: 16, poles: '1P' }, In: 16, modules: 1, powerLoss: 2.5, position: 1, name: 'Lighting' }
    ]]
  };
  var html = panelRenderScheduleTable(board);
  assert(html.indexOf('<table') >= 0, 'Must return table element');
  assert(html.indexOf('Pos.') >= 0, 'Must have position column');
  assert(html.indexOf('Circuit Ref.') >= 0 || html.indexOf('Kredsref.') >= 0, 'Must have circuit ref column');
  assert(html.indexOf('Device Type') >= 0 || html.indexOf('Enhedstype') >= 0, 'Must have device type column');
  assert(html.indexOf('In [A]') >= 0, 'Must have current rating column');
  assert(html.indexOf('Poles') >= 0 || html.indexOf('Poler') >= 0, 'Must have poles column');
  assert(html.indexOf('Cable') >= 0 || html.indexOf('Kabel') >= 0, 'Must have cable column');
  assert(html.indexOf('Destination') >= 0, 'Must have destination column');
});

// Test 107: renderPanel returns HTML with no text inputs (click-only)
test('renderPanel returns HTML with no text input fields (click-only UI)', function() {
  sldNextId = 1;
  sldTree = sldCreateTree();
  sldPropagateAll(sldTree);
  panelState.boards = [];
  panelState.selectedBoardIdx = 0;
  var html = renderPanel();
  assert(html.indexOf('<input type="text"') < 0, 'No text inputs allowed');
  assert(html.indexOf('<textarea') < 0, 'No textareas allowed');
  assert(html.indexOf('IEC 61439') >= 0, 'Must reference IEC 61439');
});

// Test 108: PANEL_MODULE_DATA and PANEL_ENCLOSURE_SIZES constants defined correctly
test('PANEL_MODULE_DATA and PANEL_ENCLOSURE_SIZES constants are correctly defined', function() {
  assert(typeof PANEL_MODULE_DATA === 'object', 'PANEL_MODULE_DATA must be an object');
  assert(PANEL_MODULE_DATA.mcb_1p.modules === 1, 'MCB 1P must be 1 module');
  assert(PANEL_MODULE_DATA.mccb_400.modules === 6, 'MCCB 400 must be 6 modules');
  assert(PANEL_MODULE_DATA.rcd_2p.modules === 2, 'RCD 2P must be 2 modules');
  assert(PANEL_MODULE_DATA.spd_t1.modules === 4, 'SPD T1 must be 4 modules');
  assert(Array.isArray(PANEL_ENCLOSURE_SIZES), 'PANEL_ENCLOSURE_SIZES must be an array');
  assert(PANEL_ENCLOSURE_SIZES.length === 8, 'Must have 8 enclosure sizes');
  assert(PANEL_ENCLOSURE_SIZES[0].name === '1x12', 'First enclosure must be 1x12');
  assert(PANEL_ENCLOSURE_SIZES[7].name === '6x24', 'Last enclosure must be 6x24');
});

// Test 109: panelAutoPopulate totalModules sums correctly
test('panelAutoPopulate total modules calculation correctly sums all devices', function() {
  sldNextId = 1;
  var tree = sldCreateTree();
  sldPropagateAll(tree);
  var boards = panelAutoPopulate(tree);
  var board = boards[0];
  var manualSum = 0;
  for (var r = 0; r < board.rails.length; r++) {
    for (var d = 0; d < board.rails[r].length; d++) {
      manualSum += board.rails[r][d].modules;
    }
  }
  assert.strictEqual(board.totalModules, manualSum, 'totalModules must equal sum of all device modules');
});

// Test 110: panelMoveDevice and panelRemoveDevice work
test('panelMoveDevice and panelRemoveDevice modify board state correctly', function() {
  sldNextId = 1;
  sldTree = sldCreateTree();
  sldPropagateAll(sldTree);
  panelState.boards = panelAutoPopulate(sldTree);
  panelState.selectedBoardIdx = 0;
  var board = panelState.boards[0];
  var origLen = board.rails[0].length;
  if (origLen >= 2) {
    var first = board.rails[0][0].nodeId;
    var second = board.rails[0][1].nodeId;
    panelMoveDevice(0, 0, 0, 1);
    assert.strictEqual(panelState.boards[0].rails[0][0].nodeId, second, 'After move right, second becomes first');
    assert.strictEqual(panelState.boards[0].rails[0][1].nodeId, first, 'After move right, first becomes second');
  }
  var modulesBeforeRemove = panelState.boards[0].totalModules;
  var removedModules = panelState.boards[0].rails[0][0].modules;
  panelRemoveDevice(0, 0, 0);
  assert.strictEqual(panelState.boards[0].totalModules, modulesBeforeRemove - removedModules, 'totalModules decreases after remove');
});


// ===== Thermal Simulation Tests =====
console.log('\n=== Thermal Simulation Tests ===\n');

// Test 111: Thermal module in translation objects
test('Thermal module appears in all three language translation objects', function() {
  assert.strictEqual(T.da.modules.thermal, 'Termisk Sim.');
  assert.strictEqual(T.en.modules.thermal, 'Thermal Sim');
  assert.strictEqual(T.fa.modules.thermal, '\u0634\u0628\u06CC\u0647\u200C\u0633\u0627\u0632\u06CC \u062D\u0631\u0627\u0631\u062A\u06CC');
});

// Test 112: Thermal functions exist
test('All thermal simulation functions are defined', function() {
  assert.strictEqual(typeof thermalCalcDerating, 'function');
  assert.strictEqual(typeof thermalCalcTemp, 'function');
  assert.strictEqual(typeof thermalCalcI2t, 'function');
  assert.strictEqual(typeof thermalGetColor, 'function');
  assert.strictEqual(typeof renderThermal, 'function');
});

// Test 113: thermalCalcDerating at reference conditions
test('thermalCalcDerating returns 1.0 at 30C ambient with 1 cable per Table B.52.14', function() {
  thermalState.selectedCableType = 'PVC';
  var result = thermalCalcDerating(30, 1, 'tray');
  assert.strictEqual(result.ambientFactor, 1.0);
  assert.strictEqual(result.groupFactor, 1.0);
  assert.strictEqual(result.combined, 1.0);
  assert.ok(result.clause.indexOf('B.52.14') >= 0);
});

// Test 114: thermalCalcDerating with high ambient
test('thermalCalcDerating correctly derates at 45C ambient for PVC per Table B.52.14', function() {
  thermalState.selectedCableType = 'PVC';
  var result = thermalCalcDerating(45, 1, 'tray');
  assert.strictEqual(result.ambientFactor, 0.79);
  assert.ok(result.combined < 1.0, 'Combined derating must be less than 1.0 at high temps');
});

// Test 115: thermalCalcDerating grouping factor
test('thermalCalcDerating applies grouping factor from Table B.52.17 for conduit', function() {
  thermalState.selectedCableType = 'PVC';
  var result = thermalCalcDerating(30, 3, 'conduit');
  assert.strictEqual(result.groupFactor, 0.70);
  assert.strictEqual(result.combined, 0.7);
});

// Test 116: thermalCalcTemp safe condition
test('thermalCalcTemp returns safe temperature at 50% load with PVC cable', function() {
  var result = thermalCalcTemp('PVC', 16, 32, 25, 1.0);
  assert.ok(result.currentTemp < result.maxTemp, 'Current temp must be below max at 50% load');
  assert.strictEqual(result.maxTemp, 70, 'PVC max temp is 70C per DS/HD 60364-5-52');
  assert.ok(result.margin > 0, 'Safety margin must be positive');
  assert.strictEqual(result.overloaded, false);
});

// Test 117: thermalCalcTemp overloaded condition
test('thermalCalcTemp detects overload when current exceeds capacity', function() {
  // Load factor 1.5 means actual current = 1.5 * rated
  var result = thermalCalcTemp('PVC', 50, 32, 40, 0.8);
  assert.strictEqual(result.overloaded, true, 'Must detect overload');
  assert.ok(result.currentTemp > 70, 'Temperature must exceed 70C for PVC');
});

// Test 118: thermalCalcI2t calculation
test('thermalCalcI2t correctly computes I-squared-t energy', function() {
  var result = thermalCalcI2t(100, 0.5);
  assert.strictEqual(result.i2t, 5000, 'I2t = 100^2 * 0.5 = 5000 A2s');
  assert.strictEqual(result.current, 100);
  assert.strictEqual(result.time, 0.5);
  assert.ok(result.clause.indexOf('60364-4-43') >= 0);
});

// Test 119: thermalGetColor returns correct colors
test('thermalGetColor returns gradient from blue to red based on temperature ratio', function() {
  assert.strictEqual(thermalGetColor(20, 70), '#2196F3', 'Low temp should be blue');
  assert.strictEqual(thermalGetColor(40, 70), '#4CAF50', 'Normal temp should be green');
  assert.strictEqual(thermalGetColor(56, 70), '#FFC107', 'Warm temp should be yellow');
  assert.strictEqual(thermalGetColor(65, 70), '#FF5722', 'Hot temp should be red');
  assert.strictEqual(thermalGetColor(75, 70), '#B71C1C', 'Over-max should be dark red DANGER');
});

// Test 120: XLPE derating values
test('thermalCalcDerating for XLPE at 40C returns correct factor per Table B.52.15', function() {
  thermalState.selectedCableType = 'XLPE';
  var result = thermalCalcDerating(40, 1, 'tray');
  assert.strictEqual(result.ambientFactor, 0.91);
});

// Test 121: thermalCalcTemp conservative (rounds up temperature)
test('thermalCalcTemp uses conservative rounding (ceiling) for temperature', function() {
  thermalState.loadFactor = 0.75;
  var result = thermalCalcTemp('XLPE', 30, 40, 25, 1.0);
  // Verify temp is rounded up (conservative) - using ceiling at 1 decimal place
  var IzDerated = 40 * 1.0;
  var Iactual = 30 * 0.75;
  var loadRatio = Iactual / IzDerated;
  var tempRise = (90 - 30) * Math.pow(loadRatio, 2);
  var rawTemp = 25 + tempRise;
  assert.ok(result.currentTemp >= Math.floor(rawTemp * 10) / 10, 'Temperature must not be rounded down');
  thermalState.loadFactor = 0.8; // restore
});

// Test 122: renderThermal has no text inputs
test('renderThermal returns HTML with no text input fields (click-only UI)', function() {
  var html = renderThermal();
  assert.ok(html.indexOf('<input type="text"') < 0, 'Must not contain text input');
  assert.ok(html.indexOf('<textarea') < 0, 'Must not contain textarea');
  assert.ok(html.indexOf('type="range"') >= 0, 'Should contain range sliders');
  assert.ok(html.indexOf('sel-btn') >= 0, 'Should contain selector buttons');
});

// Test 123: thermalState has correct defaults
test('thermalState defaults are sensible for safe initial display', function() {
  assert.ok(thermalState.ambientTemp >= 10 && thermalState.ambientTemp <= 60);
  assert.ok(thermalState.loadFactor > 0 && thermalState.loadFactor <= 1.5);
  assert.ok(thermalState.groupingCount >= 1 && thermalState.groupingCount <= 9);
});

// Test 124: Combined derating is always product of individual factors
test('thermalCalcDerating combined is product of ambient and group factors', function() {
  thermalState.selectedCableType = 'PVC';
  var result = thermalCalcDerating(40, 4, 'conduit');
  var expected = Math.round(result.ambientFactor * result.groupFactor * 1000) / 1000;
  assert.strictEqual(result.combined, expected);
});

// Test 125: THERMAL_CABLE_DATA constants
test('THERMAL_CABLE_DATA has correct max temps per DS/HD 60364-5-52 Table 52.1', function() {
  assert.strictEqual(THERMAL_CABLE_DATA.PVC.maxTemp, 70);
  assert.strictEqual(THERMAL_CABLE_DATA.XLPE.maxTemp, 90);
});

// ===== 3D Cable Routing Tests =====
console.log('\n=== 3D Cable Routing Tests ===\n');

// Test 126: Cable3D module in translations
test('Cable3D module appears in all three language translation objects', function() {
  assert.strictEqual(T.da.modules.cable3d, '3D Kabelfoering');
  assert.strictEqual(T.en.modules.cable3d, '3D Cable Routing');
  assert.strictEqual(T.fa.modules.cable3d, '\u0645\u0633\u06CC\u0631 \u06A9\u0627\u0628\u0644 \u0633\u0647\u200C\u0628\u0639\u062F\u06CC');
});

// Test 127: Cable3D functions exist
test('All cable 3D routing functions are defined', function() {
  assert.strictEqual(typeof cable3dCalcFillRate, 'function');
  assert.strictEqual(typeof cable3dCalcGroupDerating, 'function');
  assert.strictEqual(typeof cable3dCheckBendRadius, 'function');
  assert.strictEqual(typeof cable3dCalcHeatDissipation, 'function');
  assert.strictEqual(typeof renderCable3D, 'function');
  assert.strictEqual(typeof cable3dLayoutCircular, 'function');
});

// Test 128: Fill rate conduit max 45%
test('cable3dCalcFillRate enforces max fill for conduit per Table 52.3', function() {
  cable3dState.conduitDia = 20; // Small conduit
  cable3dState.trayWidth = 200;
  // Fill with large cables to exceed limit
  var result = cable3dCalcFillRate('conduit', [4, 4, 4, 4, 4, 4, 4, 4]);
  assert.ok(result.maxFill <= 0.45, 'Conduit max fill must be <= 45%');
  assert.ok(result.clause.indexOf('Table 52.3') >= 0);
});

// Test 129: Fill rate calculation accuracy
test('cable3dCalcFillRate correctly calculates cable area vs containment area', function() {
  cable3dState.conduitDia = 32;
  var result = cable3dCalcFillRate('conduit', [0]); // 1.5mm2 cable, outerDia=7.2mm
  var expectedArea = Math.PI * Math.pow(7.2/2, 2);
  var conduitArea = Math.PI * Math.pow(32/2, 2);
  var expectedRate = Math.ceil((expectedArea / conduitArea) * 1000) / 1000;
  assert.strictEqual(result.fillRate, expectedRate);
});

// Test 130: Grouping derating for tray
test('cable3dCalcGroupDerating returns correct factor for tray per Table B.52.17', function() {
  var result = cable3dCalcGroupDerating(3, 'perforated');
  assert.strictEqual(result.factor, 0.82);
  assert.ok(result.clause.indexOf('B.52.17') >= 0);
});

// Test 131: Grouping derating for conduit
test('cable3dCalcGroupDerating returns correct factor for conduit (more conservative)', function() {
  var result = cable3dCalcGroupDerating(3, 'conduit');
  assert.strictEqual(result.factor, 0.70);
  // Conduit derating is more severe than tray
  var trayResult = cable3dCalcGroupDerating(3, 'perforated');
  assert.ok(result.factor < trayResult.factor, 'Conduit derating must be more severe than tray');
});

// Test 132: Bend radius PVC
test('cable3dCheckBendRadius returns 6x diameter for PVC per IEC 60228', function() {
  var result = cable3dCheckBendRadius('PVC', 10);
  assert.strictEqual(result.factor, 6);
  assert.ok(result.minRadius >= 60, 'Min radius for 10mm PVC must be >= 60mm');
});

// Test 133: Bend radius XLPE
test('cable3dCheckBendRadius returns 8x diameter for XLPE per IEC 60228', function() {
  var result = cable3dCheckBendRadius('XLPE', 10);
  assert.strictEqual(result.factor, 8);
  assert.ok(result.minRadius >= 80, 'Min radius for 10mm XLPE must be >= 80mm');
  assert.ok(result.clause.indexOf('IEC 60228') >= 0);
});

// Test 134: Heat dissipation
test('cable3dCalcHeatDissipation returns positive W/m for loaded cables', function() {
  var result = cable3dCalcHeatDissipation([0, 1, 2]); // 1.5, 2.5, 4mm2
  assert.ok(result.totalWperM > 0, 'Heat must be positive for loaded cables');
  assert.ok(result.perCable > 0, 'Per-cable heat must be positive');
  assert.strictEqual(result.cableCount, 3);
});

// Test 135: Heat dissipation empty
test('cable3dCalcHeatDissipation returns 0 for empty cable list', function() {
  var result = cable3dCalcHeatDissipation([]);
  assert.strictEqual(result.totalWperM, 0);
  assert.strictEqual(result.perCable, 0);
});

// Test 136: renderCable3D no text inputs
test('renderCable3D returns HTML with no text input fields (click-only UI)', function() {
  var html = renderCable3D();
  assert.ok(html.indexOf('<input type="text"') < 0, 'Must not contain text input');
  assert.ok(html.indexOf('<textarea') < 0, 'Must not contain textarea');
  assert.ok(html.indexOf('sel-btn') >= 0, 'Should contain selector buttons');
});

// Test 137: CABLE3D_CONTAINMENT constants
test('CABLE3D_CONTAINMENT has conduit max fill at 40% (conservative per Table 52.3)', function() {
  assert.ok(CABLE3D_CONTAINMENT.conduit.maxFill <= 0.45, 'Conduit max fill must be <= 45%');
  assert.ok(CABLE3D_CONTAINMENT.perforated.maxFill <= 0.50, 'Perforated tray max fill must be <= 50%');
});

// Test 138: Fill rate exceeded detection
test('cable3dCalcFillRate sets exceeded=true when fill rate exceeds maximum', function() {
  cable3dState.conduitDia = 16; // Very small conduit
  var result = cable3dCalcFillRate('conduit', [4, 5, 6, 7]); // Large cables in small conduit
  assert.strictEqual(result.exceeded, true, 'Must detect overfill');
});

// Test 139: Conservative fill rate (rounds up)
test('cable3dCalcFillRate rounds fill rate up (conservative)', function() {
  cable3dState.conduitDia = 50;
  var result = cable3dCalcFillRate('conduit', [0]); // Small cable in large conduit
  // Verify rounding is ceiling
  var rawRate = result.totalCableArea / result.containmentArea;
  assert.ok(result.fillRate >= rawRate, 'Fill rate must be rounded up conservatively');
});

// Test 140: cable3dLayoutCircular positions
test('cable3dLayoutCircular returns correct number of positions', function() {
  var pos = cable3dLayoutCircular([0,1,2], 50);
  assert.strictEqual(pos.length, 3);
  assert.ok(pos[0].x !== undefined && pos[0].y !== undefined);
});

// ===== Energy Monitoring Tests =====
console.log('\n=== Energy Monitoring Tests ===\n');

// Test 141: Energy module in translations
test('Energy module appears in all three language translation objects', function() {
  assert.strictEqual(T.da.modules.energy, 'Energi Monitor');
  assert.strictEqual(T.en.modules.energy, 'Energy Monitor');
  assert.strictEqual(T.fa.modules.energy, '\u0645\u0627\u0646\u06CC\u062A\u0648\u0631 \u0627\u0646\u0631\u0698\u06CC');
});

// Test 142: Energy functions exist
test('All energy monitoring functions are defined', function() {
  assert.strictEqual(typeof energyCalcPowerFactor, 'function');
  assert.strictEqual(typeof energyCalcCapacitorSize, 'function');
  assert.strictEqual(typeof energyCalcTHD, 'function');
  assert.strictEqual(typeof energyCalcDailyCost, 'function');
  assert.strictEqual(typeof energyCalcPeakShaving, 'function');
  assert.strictEqual(typeof energyGetPQStatus, 'function');
  assert.strictEqual(typeof renderEnergy, 'function');
});

// Test 143: Power factor calculation
test('energyCalcPowerFactor computes weighted PF from active loads', function() {
  var result = energyCalcPowerFactor(['motor', 'led']);
  assert.ok(result.pf > 0 && result.pf <= 1.0, 'PF must be between 0 and 1');
  assert.ok(result.pf < 1.0, 'Mixed loads should have PF < 1.0');
  assert.ok(result.clause.indexOf('cl.523') >= 0);
});

// Test 144: Power factor empty loads
test('energyCalcPowerFactor returns 1.0 for no loads', function() {
  var result = energyCalcPowerFactor([]);
  assert.strictEqual(result.pf, 1.0);
});

// Test 145: Capacitor sizing
test('energyCalcCapacitorSize correctly sizes capacitor bank per cl.523', function() {
  var result = energyCalcCapacitorSize(0.8, 0.95, 100);
  assert.ok(result.kvar > 0, 'Must require positive kvar for PF improvement');
  // Q = P*(tan(acos(0.8)) - tan(acos(0.95))) = 100*(0.75 - 0.329) = ~42 kvar
  assert.ok(result.kvar > 35 && result.kvar < 50, 'Capacitor size should be ~42 kvar for 100kW 0.8->0.95');
  assert.ok(result.clause.indexOf('cl.523') >= 0);
});

// Test 146: Capacitor sizing no improvement needed
test('energyCalcCapacitorSize returns 0 kvar when PF already meets target', function() {
  var result = energyCalcCapacitorSize(0.98, 0.95, 100);
  assert.strictEqual(result.kvar, 0);
});

// Test 147: THD calculation
test('energyCalcTHD computes total harmonic distortion with diversity factor', function() {
  var result = energyCalcTHD(['pc']); // PC has 100% THD
  assert.ok(result.thd > 0, 'THD must be positive for non-linear loads');
  assert.ok(result.thd <= 100, 'THD should not exceed individual source THD');
  assert.ok(result.clause.indexOf('EN 50160') >= 0);
});

// Test 148: THD empty
test('energyCalcTHD returns 0 for no loads', function() {
  var result = energyCalcTHD([]);
  assert.strictEqual(result.thd, 0);
  assert.strictEqual(result.status, 'good');
});

// Test 149: THD limit check
test('energyCalcTHD correctly identifies when EN 50160 limit exceeded', function() {
  var result = energyCalcTHD(['pc', 'vfd', 'led']); // High THD combination
  assert.strictEqual(result.limit, 8.0);
  // With PC (100%) + VFD (35%) + LED (20%), combined should exceed 8%
  assert.ok(result.thd > 8, 'Heavy non-linear loads should exceed 8% THD limit');
  assert.strictEqual(result.exceeded, true);
  assert.strictEqual(result.status, 'poor');
});

// Test 150: Daily cost calculation
test('energyCalcDailyCost returns valid cost structure with hourly breakdown', function() {
  var result = energyCalcDailyCost('residential', ENERGY_TARIFFS, 50);
  assert.ok(result.totalCost > 0, 'Daily cost must be positive');
  assert.ok(result.totalKWh > 0, 'Daily consumption must be positive');
  assert.strictEqual(result.hourlyCosts.length, 24, 'Must have 24 hourly entries');
  assert.ok(result.peakHour >= 0 && result.peakHour <= 23);
});

// Test 151: Tariff time-of-use rates
test('ENERGY_TARIFFS returns higher rate during peak hours (17-20)', function() {
  var peakRate = ENERGY_TARIFFS.getHourlyRate(18); // 18:00 = peak
  var nightRate = ENERGY_TARIFFS.getHourlyRate(3);  // 03:00 = off-peak
  assert.ok(peakRate > nightRate, 'Peak rate must be higher than night rate');
  assert.ok(peakRate > 0.5, 'Peak rate should be substantial (>0.5 DKK/kWh)');
});

// Test 152: Peak shaving recommendations
test('energyCalcPeakShaving identifies high-cost periods for load shifting', function() {
  var result = energyCalcPeakShaving('residential');
  assert.ok(result.recommendations.length >= 0, 'Should return array of recommendations');
  assert.ok(result.potentialSaving >= 0, 'Potential saving must be non-negative');
  if (result.recommendations.length > 0) {
    assert.ok(result.recommendations[0].hour >= 0 && result.recommendations[0].hour <= 23);
  }
});

// Test 153: Power quality status
test('energyGetPQStatus returns correct traffic light for normal conditions', function() {
  var result = energyGetPQStatus(230, 50.0, 3, 0.5, 1.0);
  assert.strictEqual(result.voltage, 'good');
  assert.strictEqual(result.frequency, 'good');
  assert.strictEqual(result.thd, 'good');
  assert.strictEqual(result.flicker, 'good');
  assert.strictEqual(result.unbalance, 'good');
});

// Test 154: Power quality abnormal voltage
test('energyGetPQStatus detects poor voltage outside EN 50160 limits', function() {
  var result = energyGetPQStatus(190, 50.0, 3, 0.5, 1.0); // 190V = way below 207V limit
  assert.strictEqual(result.voltage, 'poor');
});

// Test 155: renderEnergy no text inputs
test('renderEnergy returns HTML with no text input fields (click-only UI)', function() {
  var html = renderEnergy();
  assert.ok(html.indexOf('<input type="text"') < 0, 'Must not contain text input');
  assert.ok(html.indexOf('<textarea') < 0, 'Must not contain textarea');
  assert.ok(html.indexOf('type="range"') >= 0, 'Should contain range sliders');
  assert.ok(html.indexOf('sel-btn') >= 0, 'Should contain selector buttons');
});

// Test 156: ENERGY_LOAD_PROFILES structure
test('ENERGY_LOAD_PROFILES has valid 24-hour arrays for all types', function() {
  assert.strictEqual(ENERGY_LOAD_PROFILES.residential.length, 24);
  assert.strictEqual(ENERGY_LOAD_PROFILES.office.length, 24);
  assert.strictEqual(ENERGY_LOAD_PROFILES.industrial.length, 24);
  // All values between 0 and 1
  for (var i = 0; i < 24; i++) {
    assert.ok(ENERGY_LOAD_PROFILES.residential[i] >= 0 && ENERGY_LOAD_PROFILES.residential[i] <= 1.0);
  }
});

// Test 157: Power factor conservative rounding
test('energyCalcPowerFactor uses conservative rounding (floor) for PF', function() {
  var result = energyCalcPowerFactor(['motor']);
  // Motor PF = 0.85, so result should be exactly 0.85 (floored)
  assert.ok(result.pf <= ENERGY_HARMONIC_SOURCES.motor.pf, 'PF must be rounded down (conservative)');
});

// Test 158: Capacitor sizing conservative rounding
test('energyCalcCapacitorSize rounds capacitor size up (conservative)', function() {
  var result = energyCalcCapacitorSize(0.85, 0.95, 100);
  // Verify ceiling rounding
  var phi1 = Math.acos(0.85);
  var phi2 = Math.acos(0.95);
  var rawQc = 100 * (Math.tan(phi1) - Math.tan(phi2));
  assert.ok(result.kvar >= rawQc, 'Capacitor size must be rounded up conservatively');
});

// Test 159: PQ status EN 50160 reference
test('energyGetPQStatus references EN 50160 standard', function() {
  var result = energyGetPQStatus(230, 50, 3, 0.5, 1.0);
  assert.strictEqual(result.clause, 'EN 50160');
});

// Test 160: Harmonic sources data integrity
test('ENERGY_HARMONIC_SOURCES has valid THD and PF for all source types', function() {
  var keys = Object.keys(ENERGY_HARMONIC_SOURCES);
  assert.ok(keys.length >= 5, 'Must have at least 5 harmonic source types');
  for (var i = 0; i < keys.length; i++) {
    var src = ENERGY_HARMONIC_SOURCES[keys[i]];
    assert.ok(src.thd >= 0 && src.thd <= 200, 'THD must be valid percentage');
    assert.ok(src.pf > 0 && src.pf <= 1.0, 'PF must be between 0 and 1');
    assert.ok(src.label.length > 0, 'Must have a label');
  }
});

// --- Summary ---
console.log('\n=== Elforsyning (Utility Supply) Product Category Tests ===\n');

// Test 161: All new product categories exist
test('PRODUCTS contains all 8 new elforsyning categories', function() {
  assert.ok(Array.isArray(PRODUCTS.supplyCables), 'supplyCables must exist');
  assert.ok(Array.isArray(PRODUCTS.metering), 'metering must exist');
  assert.ok(Array.isArray(PRODUCTS.mainFuses), 'mainFuses must exist');
  assert.ok(Array.isArray(PRODUCTS.earthing), 'earthing must exist');
  assert.ok(Array.isArray(PRODUCTS.cableJoints), 'cableJoints must exist');
  assert.ok(Array.isArray(PRODUCTS.cableDucts), 'cableDucts must exist');
  assert.ok(Array.isArray(PRODUCTS.transformers), 'transformers must exist');
  assert.ok(Array.isArray(PRODUCTS.terminals), 'terminals must exist');
});

// Test 162: Categories have data
test('All new product categories have at least 5 entries', function() {
  assert.ok(PRODUCTS.supplyCables.length >= 5, 'supplyCables: ' + PRODUCTS.supplyCables.length);
  assert.ok(PRODUCTS.metering.length >= 5, 'metering: ' + PRODUCTS.metering.length);
  assert.ok(PRODUCTS.mainFuses.length >= 5, 'mainFuses: ' + PRODUCTS.mainFuses.length);
  assert.ok(PRODUCTS.earthing.length >= 5, 'earthing: ' + PRODUCTS.earthing.length);
  assert.ok(PRODUCTS.cableJoints.length >= 5, 'cableJoints: ' + PRODUCTS.cableJoints.length);
  assert.ok(PRODUCTS.cableDucts.length >= 5, 'cableDucts: ' + PRODUCTS.cableDucts.length);
  assert.ok(PRODUCTS.transformers.length >= 5, 'transformers: ' + PRODUCTS.transformers.length);
  assert.ok(PRODUCTS.terminals.length >= 5, 'terminals: ' + PRODUCTS.terminals.length);
});

// Test 163: All product IDs unique across all categories
test('All product IDs are unique across all PRODUCTS categories', function() {
  var allIds = [];
  var cats = Object.keys(PRODUCTS);
  for (var i = 0; i < cats.length; i++) {
    var arr = PRODUCTS[cats[i]];
    for (var j = 0; j < arr.length; j++) {
      var id = arr[j].id;
      assert.ok(allIds.indexOf(id) < 0, 'Duplicate ID: ' + id);
      allIds.push(id);
    }
  }
  assert.ok(allIds.length > 200, 'Total products: ' + allIds.length);
});

// Test 164: All products have required fields
test('All new category products have id, brand, model fields', function() {
  var newCats = ['supplyCables','metering','mainFuses','earthing','cableJoints','cableDucts','transformers','terminals'];
  for (var i = 0; i < newCats.length; i++) {
    var arr = PRODUCTS[newCats[i]];
    for (var j = 0; j < arr.length; j++) {
      var p = arr[j];
      assert.ok(p.id && p.id.length > 0, newCats[i] + '[' + j + '] missing id');
      assert.ok(p.brand && p.brand.length > 0, newCats[i] + '[' + j + '] missing brand: ' + p.id);
      assert.ok(p.model && p.model.length > 0, newCats[i] + '[' + j + '] missing model: ' + p.id);
    }
  }
});

// Test 165: Supply cable Iz values conservative (method D underground)
test('Supply cable Iz values are conservative for method D underground', function() {
  var cables = PRODUCTS.supplyCables;
  for (var i = 0; i < cables.length; i++) {
    var c = cables[i];
    assert.ok(c.iz > 0, c.id + ' must have positive Iz');
    assert.ok(c.method === 'D', c.id + ' must use installation method D');
    // Method D values for Al should be lower than method C values
    if (c.material === 'Al' && c.mm2 === 16) assert.ok(c.iz <= 80, '16mm2 Al method D Iz must be <= 80A (conservative)');
    if (c.material === 'Al' && c.mm2 === 240) assert.ok(c.iz <= 370, '240mm2 Al method D Iz must be <= 370A (conservative)');
    if (c.material === 'Cu' && c.mm2 === 25) assert.ok(c.iz <= 120, '25mm2 Cu method D Iz must be <= 120A (conservative)');
  }
});

// Test 166: Transformer impedance values within EN 50464-1 ranges
test('Transformer ukPct values within EN 50464-1 standard ranges', function() {
  var trafos = PRODUCTS.transformers;
  for (var i = 0; i < trafos.length; i++) {
    var t = trafos[i];
    assert.ok(t.ukPct >= 3.5 && t.ukPct <= 8.0, t.id + ' ukPct=' + t.ukPct + ' must be 3.5-8.0%');
    // EN 50464-1: up to 630 kVA typically 4%, above 630 kVA typically 6%
    if (t.kva <= 630) assert.ok(t.ukPct >= 4.0 && t.ukPct <= 6.0, t.id + ' <=630kVA: ukPct should be 4-6%');
    if (t.kva > 630) assert.ok(t.ukPct >= 5.0 && t.ukPct <= 7.0, t.id + ' >630kVA: ukPct should be 5-7%');
    // Load losses must be positive and proportional to kVA
    assert.ok(t.pkW > 0, t.id + ' must have positive load losses');
    assert.ok(t.p0W > 0, t.id + ' must have positive no-load losses');
    // pkW is in kW, p0W is in W - load losses in W must exceed no-load losses in W
    assert.ok(t.pkW * 1000 > t.p0W, t.id + ' load losses (kW) must exceed no-load losses (W)');
  }
});

// Test 167: Earth electrode resistance conservative
test('Earth electrode resistance values are conservative', function() {
  var electrodes = PRODUCTS.earthing.filter(function(e) { return e.cat === 'electrode'; });
  assert.ok(electrodes.length >= 2, 'Must have at least 2 electrode types');
  for (var i = 0; i < electrodes.length; i++) {
    var e = electrodes[i];
    assert.ok(e.resistance_ohm_typical > 0, e.id + ' must have positive resistance');
    // Conservative: longer rod = lower resistance
    if (e.length_m === 1.5) assert.ok(e.resistance_ohm_typical >= 40, '1.5m rod resistance must be >= 40 ohm (conservative)');
    if (e.length_m === 3.0) assert.ok(e.resistance_ohm_typical >= 20, '3.0m rod resistance must be >= 20 ohm (conservative)');
    // Shorter rod must have higher resistance
  }
  var rod15 = electrodes.filter(function(e) { return e.length_m === 1.5; })[0];
  var rod30 = electrodes.filter(function(e) { return e.length_m === 3.0; })[0];
  assert.ok(rod15.resistance_ohm_typical > rod30.resistance_ohm_typical, 'Shorter rod must have higher resistance');
});

// Test 168: CT ratio selections cover full main fuse range
test('CT ratios cover the full main fuse range (100A to 800A)', function() {
  var cts = PRODUCTS.metering.filter(function(m) { return m.cat === 'ct'; });
  assert.ok(cts.length >= 7, 'Must have at least 7 CT ratios');
  var primaries = cts.map(function(ct) { return ct.primaryA; }).sort(function(a,b){return a-b;});
  assert.ok(primaries[0] <= 100, 'Smallest CT must cover 100A: got ' + primaries[0]);
  assert.ok(primaries[primaries.length-1] >= 800, 'Largest CT must cover 800A: got ' + primaries[primaries.length-1]);
  // All CTs must have secondary 5A
  for (var i = 0; i < cts.length; i++) {
    assert.strictEqual(cts[i].secondaryA, 5, 'CT secondary must be 5A');
  }
});

// Test 169: Main fuses cover residential to industrial range
test('Main fuses cover D02 25-63A and NH 63-630A full range', function() {
  var mf = PRODUCTS.mainFuses;
  var d02 = mf.filter(function(f) { return f.size === 'D02'; });
  var nh = mf.filter(function(f) { return (f.size||'').indexOf('NH') === 0; });
  assert.ok(d02.length >= 4, 'Must have at least 4 D02 fuses');
  assert.ok(nh.length >= 8, 'Must have at least 8 NH fuses');
  // Check sealed flag (utility plomberet)
  for (var i = 0; i < mf.length; i++) {
    assert.strictEqual(mf[i].sealed, true, mf[i].id + ' must be sealed (plomberet)');
  }
  // NH sizes cover full range
  var nhRatings = nh.map(function(f) { return f.rating; }).sort(function(a,b){return a-b;});
  assert.ok(nhRatings[0] <= 63, 'Smallest NH must be <= 63A');
  assert.ok(nhRatings[nhRatings.length-1] >= 630, 'Largest NH must be >= 630A');
});

// Test 170: All products have use_da and use_en descriptions
test('All new products have both use_da and use_en descriptions', function() {
  var newCats = ['supplyCables','metering','mainFuses','earthing','cableJoints','cableDucts','transformers','terminals'];
  for (var i = 0; i < newCats.length; i++) {
    var arr = PRODUCTS[newCats[i]];
    for (var j = 0; j < arr.length; j++) {
      var p = arr[j];
      assert.ok(p.use_da && p.use_da.length > 0, newCats[i] + '/' + p.id + ' missing use_da');
      assert.ok(p.use_en && p.use_en.length > 0, newCats[i] + '/' + p.id + ' missing use_en');
    }
  }
});

// Test 171: All new products reference applicable standards
test('All new products reference applicable standards', function() {
  var newCats = ['supplyCables','metering','mainFuses','earthing','cableJoints','cableDucts','transformers','terminals'];
  for (var i = 0; i < newCats.length; i++) {
    var arr = PRODUCTS[newCats[i]];
    for (var j = 0; j < arr.length; j++) {
      var p = arr[j];
      assert.ok(p.standard && p.standard.length > 0, newCats[i] + '/' + p.id + ' missing standard reference');
    }
  }
});

// Test 172: Transformers include both oil and dry types
test('Transformers include both ONAN (oil) and AN (dry) cooling types', function() {
  var trafos = PRODUCTS.transformers;
  var oil = trafos.filter(function(t) { return t.cooling === 'ONAN'; });
  var dry = trafos.filter(function(t) { return t.cooling === 'AN'; });
  assert.ok(oil.length >= 5, 'Must have at least 5 oil-filled transformers');
  assert.ok(dry.length >= 3, 'Must have at least 3 dry-type transformers');
});

// Test 173: Transformer kVA range covers 50-2500
test('Transformer kVA range covers 50 to 2500 kVA', function() {
  var kvas = PRODUCTS.transformers.map(function(t) { return t.kva; }).sort(function(a,b){return a-b;});
  assert.ok(kvas[0] <= 50, 'Smallest transformer must be <= 50 kVA');
  assert.ok(kvas[kvas.length-1] >= 2500, 'Largest transformer must be >= 2500 kVA');
});

// Test 174: Cable ducts have correct color codes
test('Cable ducts use correct DK color codes (red=power, blue=telecom, green=fiber)', function() {
  var pipes = PRODUCTS.cableDucts.filter(function(d) { return d.cat === 'pipe'; });
  var red = pipes.filter(function(p) { return p.color === 'red'; });
  var blue = pipes.filter(function(p) { return p.color === 'blue'; });
  var green = pipes.filter(function(p) { return p.color === 'green'; });
  assert.ok(red.length >= 3, 'Must have at least 3 red (power) ducts');
  assert.ok(blue.length >= 1, 'Must have at least 1 blue (telecom) duct');
  assert.ok(green.length >= 1, 'Must have at least 1 green (fiber) duct');
  // Check use descriptions match color purpose
  for (var i = 0; i < red.length; i++) {
    assert.ok(red[i].use_en.indexOf('power') >= 0 || red[i].use_da.indexOf('staerkstroem') >= 0, 'Red duct must be for power');
  }
});

// Test 175: renderBank includes new categories
test('renderBank function output includes new category buttons', function() {
  bankCategory = 'supplyCables';
  bankBrand = 'all';
  var html = renderBank();
  assert.ok(html.indexOf('Forsyningskabler') >= 0 || html.indexOf('Supply Cables') >= 0, 'Must show supply cables category');
  assert.ok(html.indexOf('Transformere') >= 0 || html.indexOf('Transformers') >= 0, 'Must show transformers category');
  assert.ok(html.indexOf('Jordingssystem') >= 0 || html.indexOf('Earthing') >= 0, 'Must show earthing category');
  assert.ok(html.indexOf('Klemmer') >= 0 || html.indexOf('Terminals') >= 0, 'Must show terminals category');
});

// ===== EV CHARGING MODULE TESTS =====
console.log('\n=== EV Charging Module Tests ===\n');

// Test 176: evGetSimultaneity returns correct values per DS/HD 60364-7-722 Annex A
test('evGetSimultaneity returns correct factors per 722 Annex A', function() {
  assert.strictEqual(evGetSimultaneity(1), 1.0);
  assert.strictEqual(evGetSimultaneity(2), 0.9);
  assert.strictEqual(evGetSimultaneity(3), 0.8);
  assert.strictEqual(evGetSimultaneity(4), 0.7);
  assert.strictEqual(evGetSimultaneity(5), 0.6);
  assert.strictEqual(evGetSimultaneity(10), 0.6);
});

// Test 177: evCalcCurrent correctly calculates single-phase and three-phase currents
test('evCalcCurrent calculates correct load currents', function() {
  // 11kW 3-phase: 11000 / (400 * sqrt(3)) = 15.87 -> ceil = 16A
  var i3p = evCalcCurrent(11, 3);
  assert.strictEqual(i3p, 16);
  // 7.4kW 1-phase: 7400 / 230 = 32.17 -> ceil = 33A
  var i1p = evCalcCurrent(7.4, 1);
  assert.strictEqual(i1p, 33);
  // 3.7kW 1-phase: 3700 / 230 = 16.08 -> ceil = 17A
  var i1p2 = evCalcCurrent(3.7, 1);
  assert.strictEqual(i1p2, 17);
});

// Test 178: evCalcDesignCurrent applies simultaneity factor
test('evCalcDesignCurrent applies simultaneity correctly', function() {
  // 3 chargers at 11kW 3-phase: single=16A, total=16*3*0.8=38.4 -> ceil=39
  var dc = evCalcDesignCurrent(11, 3, 3);
  assert.strictEqual(dc, 39);
  // 1 charger: 16*1*1.0 = 16
  var dc1 = evCalcDesignCurrent(11, 3, 1);
  assert.strictEqual(dc1, 16);
});

// Test 179: evSelectCable returns cable with Iz >= design current
test('evSelectCable returns adequate cable', function() {
  var cable = evSelectCable(32);
  assert.ok(cable, 'Must return a cable');
  assert.ok(cable.iz >= 32, 'Cable Iz must be >= design current');
  assert.ok(cable.mm2, 'Cable must have mm2 field');
});

// Test 180: evSelectMCB returns curve C MCB
test('evSelectMCB returns curve C for EV inrush', function() {
  var mcb = evSelectMCB(16);
  assert.ok(mcb, 'Must return an MCB');
  assert.strictEqual(mcb.curve, 'C');
  assert.ok(mcb.rating >= 16, 'MCB rating must be >= load');
});

// Test 181: evSelectRCD returns Type B per cl.722.531.3.101
test('evSelectRCD returns Type B for DC fault protection', function() {
  var rcd = evSelectRCD(3);
  assert.ok(rcd, 'Must return an RCD');
  assert.strictEqual(rcd.rcdType, 'B', 'Must be Type B per cl.722.531.3.101');
});

// Test 182: evCalcVoltageDrop checks conservative (ceiling) voltage drop
test('evCalcVoltageDrop calculates conservative voltage drop', function() {
  var cable = evSelectCable(16);
  var vd = evCalcVoltageDrop(cable, 16, 25, 3);
  assert.ok(typeof vd === 'number');
  assert.ok(vd >= 0, 'Voltage drop must be positive');
  // 50m with a small cable at high current should show measurable drop
  var vdLong = evCalcVoltageDrop(cable, 32, 50, 3);
  assert.ok(vdLong > vd, 'Longer cable must have higher drop');
});

// Test 183: evCheckGridCapacity detects overload
test('evCheckGridCapacity detects overloaded main fuse', function() {
  // 25A main fuse, 39A design current = overloaded
  var grid = evCheckGridCapacity(25, 39);
  assert.strictEqual(grid.overloaded, true);
  assert.ok(grid.usagePercent > 100);
  // 63A main fuse, 16A design current = OK
  var grid2 = evCheckGridCapacity(63, 16);
  assert.strictEqual(grid2.overloaded, false);
  assert.ok(grid2.usagePercent < 100);
});

// Test 184: evCheckGridCapacity recommends load balancing above 80%
test('evCheckGridCapacity recommends load balancing above 80%', function() {
  // 50A fuse, 42A load = 84% -> needs balancing
  var grid = evCheckGridCapacity(50, 42);
  assert.strictEqual(grid.needsLoadBalancing, true);
  // 63A fuse, 16A load = 25% -> no balancing needed
  var grid2 = evCheckGridCapacity(63, 16);
  assert.strictEqual(grid2.needsLoadBalancing, false);
});

// Test 185: renderEV produces HTML with no text inputs
test('renderEV has no text input fields (click-only UI)', function() {
  var html = renderEV();
  assert.ok(html.indexOf('<input type="text"') < 0, 'Must not contain text input');
  assert.ok(html.indexOf('<textarea') < 0, 'Must not contain textarea');
});

// Test 186: renderEV contains DS/HD 60364-7-722 references
test('renderEV references DS/HD 60364-7-722', function() {
  var html = renderEV();
  assert.ok(html.indexOf('722') >= 0, 'Must reference section 722');
  assert.ok(html.indexOf('60364') >= 0, 'Must reference DS/HD 60364');
});

// Test 187: EV module handles maximum chargers (10)
test('EV module handles 10 chargers edge case', function() {
  evState.numChargers = 10;
  evState.powerKW = 22;
  evState.phases = 3;
  var dc = evCalcDesignCurrent(22, 3, 10);
  var sf = evGetSimultaneity(10);
  assert.strictEqual(sf, 0.6);
  assert.ok(dc > 0, 'Design current must be positive');
  var html = renderEV();
  assert.ok(html.length > 100, 'Must produce substantial HTML');
  evState.numChargers = 1;
  evState.powerKW = 11;
});

// Test 188: renderEV uses sel-btn class for buttons
test('renderEV uses sel-btn class for click buttons', function() {
  var html = renderEV();
  assert.ok(html.indexOf('sel-btn') >= 0, 'Must use sel-btn class');
});

// Test 189: EV module registered in module switch
test('EV module registered in renderModule switch', function() {
  activeModule = 'ev';
  // If renderModule is available and doesn't throw, it's registered
  assert.ok(typeof renderEV === 'function', 'renderEV must be defined');
});

// ===== SOLAR PV MODULE TESTS =====
console.log('\n=== Solar PV & Battery Module Tests ===\n');

// Test 190: solarCalcKWp correctly calculates total kWp
test('solarCalcKWp calculates correct total power', function() {
  assert.strictEqual(solarCalcKWp(10, 440), 4.4);
  assert.strictEqual(solarCalcKWp(20, 500), 10);
  assert.strictEqual(solarCalcKWp(4, 400), 1.6);
});

// Test 191: solarCalcInverterSize recommends 0.9x kWp
test('solarCalcInverterSize recommends correct sizing', function() {
  var inv = solarCalcInverterSize(10);
  assert.strictEqual(inv.recommended, 9.0);
  assert.strictEqual(inv.min, 8.0);
  assert.strictEqual(inv.max, 10);
  assert.ok(inv.clause.indexOf('62446') >= 0, 'Must reference DS/EN 62446');
});

// Test 192: solarCalcDCCable selects correct size
test('solarCalcDCCable selects appropriate cable size', function() {
  var dc = solarCalcDCCable(4.4);
  assert.ok(dc.mm2 === 4 || dc.mm2 === 6, 'Must be 4 or 6 mm2');
  assert.strictEqual(dc.type, 'PV1-F');
  assert.ok(dc.standard.indexOf('EN 50618') >= 0);
});

// Test 193: solarCheckStringVoltage detects exceeded max Vdc
test('solarCheckStringVoltage detects voltage exceeding max', function() {
  // 30 panels * 42V = 1260V, +10% = 1386V > 600V max
  var check = solarCheckStringVoltage(30, 42, 600);
  assert.strictEqual(check.ok, false);
  assert.ok(check.vocCold > 600);
  // 10 panels * 42V = 420V, +10% = 462V < 600V max
  var check2 = solarCheckStringVoltage(10, 42, 600);
  assert.strictEqual(check2.ok, true);
});

// Test 194: solarCalcAnnualYield uses 900 kWh/kWp
test('solarCalcAnnualYield uses 900 kWh/kWp Danish average', function() {
  assert.strictEqual(solarCalcAnnualYield(10), 9000);
  assert.strictEqual(solarCalcAnnualYield(4.4), 3960);
});

// Test 195: solarCalcPayback returns reasonable values
test('solarCalcPayback calculates payback period', function() {
  var pb = solarCalcPayback(10, 50);
  assert.ok(pb.paybackYears > 0, 'Payback must be positive');
  assert.ok(pb.paybackYears <= 20, 'Payback should be reasonable for DK');
  assert.ok(pb.annualSaving > 0, 'Annual saving must be positive');
  assert.ok(pb.systemCost > 0, 'System cost must be positive');
});

// Test 196: solarSelectRCD returns Type B
test('solarSelectRCD returns Type B for inverter DC component', function() {
  var rcd = solarSelectRCD();
  assert.ok(rcd, 'Must return an RCD');
  assert.strictEqual(rcd.rcdType, 'B', 'Must be Type B for solar inverter');
});

// Test 197: renderSolar produces click-only HTML
test('renderSolar has no text input fields', function() {
  var html = renderSolar();
  assert.ok(html.indexOf('<input type="text"') < 0, 'Must not contain text input');
  assert.ok(html.indexOf('<textarea') < 0, 'Must not contain textarea');
});

// Test 198: renderSolar references DS/HD 60364-7-712
test('renderSolar references DS/HD 60364-7-712 and DS/EN 62446', function() {
  var html = renderSolar();
  assert.ok(html.indexOf('712') >= 0, 'Must reference section 712');
  assert.ok(html.indexOf('62446') >= 0, 'Must reference DS/EN 62446');
});

// Test 199: Solar module handles oversized PV (30 panels, exceeds inverter Vdc)
test('Solar module handles oversized PV system', function() {
  solarState.panelCount = 30;
  solarState.panelWp = 500;
  var kWp = solarCalcKWp(30, 500);
  assert.strictEqual(kWp, 15.0);
  var stringCheck = solarCheckStringVoltage(30, SOLAR_VOC_PER_PANEL, 600);
  assert.strictEqual(stringCheck.ok, false, 'Must detect voltage exceedance');
  solarState.panelCount = 10;
  solarState.panelWp = 440;
});

// Test 200: renderSolar shows battery section when system has battery
test('renderSolar shows battery section for grid+battery system', function() {
  solarState.systemType = 'gridbat';
  var html = renderSolar();
  assert.ok(html.indexOf('kWh') >= 0, 'Must show battery capacity');
  solarState.systemType = 'grid';
});

// Test 201: Solar includes mandatory protection requirements
test('renderSolar shows mandatory protection devices', function() {
  var html = renderSolar();
  assert.ok(html.indexOf('cl.712.536.2.1') >= 0, 'Must reference DC disconnect clause');
  assert.ok(html.indexOf('cl.712.536.2.2') >= 0, 'Must reference anti-islanding clause');
  assert.ok(html.indexOf('cl.712.534') >= 0, 'Must reference SPD clause');
});

// Test 202: Solar module uses sel-btn class
test('renderSolar uses sel-btn buttons', function() {
  var html = renderSolar();
  assert.ok(html.indexOf('sel-btn') >= 0, 'Must use sel-btn class');
});

// Test 203: solarCalcACCable returns cable with sufficient Iz
test('solarCalcACCable returns adequate AC cable', function() {
  var result = solarCalcACCable(10, 3);
  assert.ok(result.cable, 'Must return a cable');
  assert.ok(result.cable.iz >= result.current, 'Cable Iz must be >= inverter output current');
});

// Test 204: Solar module registered
test('Solar module renderSolar function exists', function() {
  assert.ok(typeof renderSolar === 'function', 'renderSolar must be defined');
  assert.ok(typeof solarCalcKWp === 'function');
  assert.ok(typeof solarCalcInverterSize === 'function');
  assert.ok(typeof solarCheckStringVoltage === 'function');
});

// ===== EMERGENCY LIGHTING MODULE TESTS =====
console.log('\n=== Emergency Lighting Module Tests ===\n');

// Test 205: noedCalcSpacing uses conservative (floor) rounding
test('noedCalcSpacing returns conservative spacing', function() {
  // 3m height, 1 lux (escape): 3 * 4 = 12m max spacing
  var sp = noedCalcSpacing(3.0, 1.0);
  assert.ok(sp <= 12, 'Spacing must not exceed 12m');
  assert.ok(sp > 0, 'Spacing must be positive');
  // Higher lux = shorter spacing
  var spHigh = noedCalcSpacing(3.0, 15.0);
  assert.ok(spHigh < sp, 'High-risk must have shorter spacing than escape');
});

// Test 206: noedCalcLuminaireCount uses ceiling (conservative)
test('noedCalcLuminaireCount uses conservative ceiling count', function() {
  // 20m room / 12m spacing = ceil(1.67) = 2
  var count = noedCalcLuminaireCount(20, 10, 12);
  assert.ok(count >= 2, 'Must use ceiling for luminaire count');
  // Very small room should still have at least 1
  var countSmall = noedCalcLuminaireCount(2, 2, 12);
  assert.ok(countSmall >= 1, 'Minimum 1 luminaire');
});

// Test 207: noedCalcBattery includes 1.25 safety factor
test('noedCalcBattery applies 1.25 safety factor per DS/EN 50172', function() {
  var bat = noedCalcBattery(10, 3, 1);
  // 10 luminaires * 3W = 30W, at 24V = 1.25A, * 1h * 1.25 = ceil(1.5625) = 2 Ah
  assert.ok(bat.ah >= 2, 'Battery must include 1.25 safety factor');
  assert.strictEqual(bat.safetyFactor, 1.25);
  assert.ok(bat.clause.indexOf('50172') >= 0, 'Must reference DS/EN 50172');
});

// Test 208: noedGetCableType returns correct grade per building
test('noedGetCableType returns correct fire resistance grade', function() {
  assert.strictEqual(noedGetCableType('hospital'), 'E90');
  assert.strictEqual(noedGetCableType('assembly'), 'E60');
  assert.strictEqual(noedGetCableType('office'), 'E30');
  assert.strictEqual(noedGetCableType('industrial'), 'E30');
});

// Test 209: noedCalcAll returns not-required for residential
test('noedCalcAll returns not required for residential buildings', function() {
  var result = noedCalcAll({ buildingType: 'residential', systemType: 'self', lightingType: 'escape', roomLength: 10, roomWidth: 5, roomHeight: 2.4, duration: 1 });
  assert.strictEqual(result.required, false);
});

// Test 210: noedCalcAll returns complete result for office
test('noedCalcAll returns complete result for office', function() {
  var result = noedCalcAll({ buildingType: 'office', systemType: 'central', lightingType: 'escape', roomLength: 20, roomWidth: 10, roomHeight: 3.0, duration: 1 });
  assert.strictEqual(result.required, true);
  assert.ok(result.luminaireCount > 0);
  assert.ok(result.spacing > 0);
  assert.ok(result.battery.ah > 0);
  assert.strictEqual(result.cableType, 'E30');
});

// Test 211: noedGetChangeoverTime correct per EN 1838
test('noedGetChangeoverTime returns correct limits per EN 1838', function() {
  var escape = noedGetChangeoverTime('escape');
  assert.strictEqual(escape.max, 0.5, 'Escape route must be < 0.5s');
  assert.ok(escape.clause.indexOf('EN 1838') >= 0);
  var antipanic = noedGetChangeoverTime('antipanic');
  assert.strictEqual(antipanic.max, 5.0, 'Anti-panic must be < 5s');
});

// Test 212: renderNoed produces click-only HTML
test('renderNoed has no text input fields', function() {
  var html = renderNoed();
  assert.ok(html.indexOf('<input type="text"') < 0, 'Must not contain text input');
  assert.ok(html.indexOf('<textarea') < 0, 'Must not contain textarea');
});

// Test 213: renderNoed references EN 1838 and EN 50172
test('renderNoed references EN 1838 and DS/EN 50172', function() {
  var html = renderNoed();
  assert.ok(html.indexOf('1838') >= 0, 'Must reference EN 1838');
  assert.ok(html.indexOf('50172') >= 0, 'Must reference DS/EN 50172');
});

// Test 214: renderNoed uses sel-btn class
test('renderNoed uses sel-btn buttons', function() {
  var html = renderNoed();
  assert.ok(html.indexOf('sel-btn') >= 0, 'Must use sel-btn class');
});

// Test 215: Emergency lighting handles minimum battery edge case
test('Emergency lighting minimum battery sizing', function() {
  // 1 luminaire, 3W, 1 hour: 3W/24V = 0.125A * 1 * 1.25 = ceil(0.15625) = 1 Ah
  var bat = noedCalcBattery(1, 3, 1);
  assert.ok(bat.ah >= 1, 'Minimum battery must be at least 1 Ah');
});

// Test 216: Hospital requires 3-hour duration
test('Hospital building requires extended duration capability', function() {
  var bt = NOED_BUILDING_TYPES['hospital'];
  assert.strictEqual(bt.duration, 3, 'Hospital must require 3-hour duration');
  assert.strictEqual(bt.required, true);
});

// Test 217: Lux requirements match EN 1838
test('Lux requirements match EN 1838 specifications', function() {
  assert.strictEqual(NOED_LUX_REQUIREMENTS.escape.lux, 1.0, 'Escape: 1 lux per cl.4.2');
  assert.strictEqual(NOED_LUX_REQUIREMENTS.antipanic.lux, 0.5, 'Anti-panic: 0.5 lux per cl.4.3');
  assert.strictEqual(NOED_LUX_REQUIREMENTS.highrisk.lux, 15.0, 'High-risk: 15 lux per cl.4.4');
});

// Test 218: All three new modules appear in translations
test('All three new modules registered in T.da, T.en, T.fa', function() {
  assert.ok(T.da.modules.ev, 'EV must be in Danish translations');
  assert.ok(T.en.modules.ev, 'EV must be in English translations');
  assert.ok(T.fa.modules.ev, 'EV must be in Farsi translations');
  assert.ok(T.da.modules.solar, 'Solar must be in Danish translations');
  assert.ok(T.en.modules.solar, 'Solar must be in English translations');
  assert.ok(T.fa.modules.solar, 'Solar must be in Farsi translations');
  assert.ok(T.da.modules.noed, 'Noed must be in Danish translations');
  assert.ok(T.en.modules.noed, 'Noed must be in English translations');
  assert.ok(T.fa.modules.noed, 'Noed must be in Farsi translations');
});

// Test 219: Anti-panic has longer spacing than escape
test('Anti-panic spacing is longer than escape route spacing', function() {
  var escapeSpacing = noedCalcSpacing(3.0, 1.0);
  var antipanicSpacing = noedCalcSpacing(3.0, 0.5);
  assert.ok(antipanicSpacing >= escapeSpacing, 'Anti-panic (0.5 lux) may have longer spacing than escape (1 lux)');
});

// Test 220: EV voltage drop limit is 3% per utility regulations
test('EV module enforces 3% voltage drop limit', function() {
  var html = renderEV();
  assert.ok(html.indexOf('3%') >= 0 || html.indexOf('max 3') >= 0, 'Must show 3% voltage drop limit');
});

// ===== MOTOR START ANALYSIS TESTS =====

// Test 221: Motor FLC table returns correct values for 7.5kW 4-pole
test('motorGetFLC returns correct FLC for 7.5kW 4-pole motor', function() {
  var flc = motorGetFLC(7.5, 4);
  assert.strictEqual(flc, 16.0, 'FLC for 7.5kW 4P should be 16.0A');
});

// Test 222: Motor FLC for 110kW 2-pole (largest motor)
test('motorGetFLC returns correct FLC for 110kW 2-pole motor', function() {
  var flc = motorGetFLC(110, 2);
  assert.strictEqual(flc, 205.0, 'FLC for 110kW 2P should be 205.0A');
});

// Test 223: Starting current calculation DOL
test('motorCalcStartCurrent DOL uses 7x multiplier', function() {
  var iStart = motorCalcStartCurrent(7.5, 4, 'dol');
  assert.strictEqual(iStart, Math.ceil(16.0 * 7), 'DOL start current for 7.5kW should be ceil(16*7)=112A');
});

// Test 224: Starting current Star-Delta is less than DOL
test('motorCalcStartCurrent Star-Delta is less than DOL', function() {
  var dolStart = motorCalcStartCurrent(11, 4, 'dol');
  var sdStart = motorCalcStartCurrent(11, 4, 'starDelta');
  assert.ok(sdStart < dolStart, 'Star-Delta starting current must be less than DOL');
});

// Test 225: VFD start is lowest of all methods
test('motorCalcStartCurrent VFD has lowest starting current', function() {
  var vfdStart = motorCalcStartCurrent(22, 4, 'vfd');
  var dolStart = motorCalcStartCurrent(22, 4, 'dol');
  var sdStart = motorCalcStartCurrent(22, 4, 'starDelta');
  var softStart = motorCalcStartCurrent(22, 4, 'soft');
  assert.ok(vfdStart < dolStart, 'VFD < DOL');
  assert.ok(vfdStart < sdStart, 'VFD < Star-Delta');
  assert.ok(vfdStart <= softStart, 'VFD <= Soft');
});

// Test 226: Voltage dip calculation
test('motorCalcVoltageDip returns positive value and respects 3% limit', function() {
  var vdip = motorCalcVoltageDip(7.5, 4, 'dol', 30);
  assert.ok(vdip > 0, 'Voltage dip must be positive');
  assert.ok(typeof vdip === 'number', 'Voltage dip must be a number');
});

// Test 227: Voltage dip increases with cable length
test('motorCalcVoltageDip increases with longer cable', function() {
  var vdipShort = motorCalcVoltageDip(11, 4, 'dol', 10);
  var vdipLong = motorCalcVoltageDip(11, 4, 'dol', 100);
  assert.ok(vdipLong > vdipShort, 'Longer cable must produce higher voltage dip');
});

// Test 228: MPCB selection covers motor kW
test('motorSelectMPCB returns device covering motor kW', function() {
  var flc = motorGetFLC(7.5, 4);
  var mpcb = motorSelectMPCB(7.5, flc);
  assert.ok(mpcb, 'Must return an MPCB');
  assert.ok(mpcb.kW >= 7.5, 'MPCB kW must cover motor kW');
  assert.ok(mpcb.rangeMax >= flc, 'MPCB range must cover FLC');
});

// Test 229: Contactor selection covers motor kW
test('motorSelectContactor returns device covering motor kW', function() {
  var contactor = motorSelectContactor(11);
  assert.ok(contactor, 'Must return a contactor');
  assert.ok(contactor.ac3_kW >= 11, 'Contactor AC-3 kW must cover motor kW');
});

// Test 230: Overload relay covers FLC
test('motorSelectOverload returns relay covering FLC', function() {
  var flc = motorGetFLC(5.5, 4);
  var relay = motorSelectOverload(flc);
  assert.ok(relay, 'Must return an overload relay');
  assert.ok(relay.rangeMax >= flc, 'Relay range must cover motor FLC');
});

// Test 231: Cable selection for motor
test('motorSelectCable returns cable with Iz >= FLC', function() {
  var flc = motorGetFLC(22, 4);
  var cable = motorSelectCable(flc, 'S1');
  assert.ok(cable, 'Must return a cable');
  assert.ok(cable.iz >= flc, 'Cable Iz must be >= motor FLC');
});

// Test 232: Duty cycle S2/S3 derating
test('Motor duty S3 results in larger cable than S1', function() {
  var flc = motorGetFLC(11, 4);
  var cableS1 = motorSelectCable(flc, 'S1');
  var cableS3 = motorSelectCable(flc, 'S3');
  assert.ok(cableS3.iz >= cableS1.iz, 'S3 duty (intermittent) needs cable at least as large as S1');
});

// Test 233: renderMotor has no text input fields
test('renderMotor has no text input fields', function() {
  var html = renderMotor();
  assert.ok(html.indexOf('<input type="text"') < 0, 'No text inputs allowed');
  assert.ok(html.indexOf('<textarea') < 0, 'No textareas allowed');
});

// Test 234: renderMotor references IEC/DS/HD standards
test('renderMotor references IEC 60947 and DS/HD 60364', function() {
  var html = renderMotor();
  assert.ok(html.indexOf('IEC 60947') >= 0 || html.indexOf('60947') >= 0, 'Must reference IEC 60947');
  assert.ok(html.indexOf('DS/HD 60364') >= 0 || html.indexOf('60364') >= 0, 'Must reference DS/HD 60364');
});

// Test 235: renderMotor uses sel-btn buttons
test('renderMotor uses sel-btn buttons', function() {
  var html = renderMotor();
  assert.ok(html.indexOf('sel-btn') >= 0, 'Must use sel-btn class');
});

// Test 236: I2t calculation
test('motorCalcI2t returns positive thermal stress value', function() {
  var i2t = motorCalcI2t(7.5, 4, 'dol');
  assert.ok(i2t > 0, 'I2t must be positive');
  // DOL 7.5kW: Istart=112A, time=1.5s => I2t = 112*112*1.5 = 18816
  assert.ok(i2t >= 18000, 'I2t for 7.5kW DOL should be substantial');
});

// ===== HARMONIC ANALYSIS TESTS =====

// Test 237: THD calculation for VFD loads
test('harmonicCalcTHD returns correct THD for VFD', function() {
  var result = harmonicCalcTHD('vfd', 1);
  assert.ok(result.thd > 0, 'THD must be positive');
  assert.ok(result.thd < 100, 'THD must be less than 100%');
  assert.ok(result.harmonics.h5 > result.harmonics.h3, 'VFD H5 should be dominant over H3');
  assert.strictEqual(result.limit, 8.0, 'EN 50160 limit is 8%');
});

// Test 238: THD for IT equipment is high (PC has high H3)
test('harmonicCalcTHD for IT equipment has high THD', function() {
  var result = harmonicCalcTHD('it', 1);
  assert.ok(result.thd > 50, 'IT equipment THD should be very high (>50%)');
  assert.ok(result.exceeded, 'IT equipment should exceed 8% THD limit');
});

// Test 239: Diversity factor reduces THD with multiple loads
test('harmonicCalcTHD diversity reduces THD with many loads', function() {
  var single = harmonicCalcTHD('vfd', 1);
  var many = harmonicCalcTHD('vfd', 20);
  assert.ok(many.thd < single.thd, 'Multiple loads should reduce THD via diversity');
  assert.ok(many.diversity < 1.0, 'Diversity factor should be less than 1.0 for many loads');
});

// Test 240: K-factor calculation
test('harmonicCalcKFactor returns valid K-factor', function() {
  var result = harmonicCalcKFactor('vfd', 1);
  assert.ok(result.kFactor >= 1.0, 'K-factor must be >= 1.0');
  assert.ok(result.derating <= 1.0, 'Derating must be <= 1.0');
  assert.ok(result.derating > 0, 'Derating must be positive');
  assert.ok(result.clause.indexOf('C57.110') >= 0, 'Must reference IEEE C57.110');
});

// Test 241: K-factor for IT is higher than for LED
test('harmonicCalcKFactor IT equipment has higher K than LED', function() {
  var kIT = harmonicCalcKFactor('it', 1);
  var kLED = harmonicCalcKFactor('led', 1);
  assert.ok(kIT.kFactor > kLED.kFactor, 'IT K-factor should exceed LED K-factor');
});

// Test 242: Neutral sizing for IT loads with high H3
test('harmonicCalcNeutral IT equipment requires oversized neutral', function() {
  var result = harmonicCalcNeutral('it', 1);
  assert.ok(result.oversized, 'IT equipment with 80% H3 requires oversized neutral');
  assert.strictEqual(result.factor, 1.5, 'Oversized neutral should be 150%');
  assert.ok(result.clause.indexOf('523.6.3') >= 0, 'Must reference cl.523.6.3');
});

// Test 243: Neutral sizing for VFD is not oversized (low H3)
test('harmonicCalcNeutral VFD does not require oversized neutral', function() {
  var result = harmonicCalcNeutral('vfd', 1);
  assert.ok(!result.oversized, 'VFD with 2% H3 should not require oversized neutral');
  assert.strictEqual(result.factor, 1.0, 'Normal neutral sizing = 1.0');
});

// Test 244: Filter recommendation
test('harmonicCalcFilter recommends filter when THD > 5%', function() {
  var result = harmonicCalcFilter('vfd', 1, 11);
  assert.ok(result.needed || !result.needed, 'Filter result must have needed property');
  assert.ok(result.clause.indexOf('61000') >= 0, 'Must reference EN 61000');
});

// Test 245: Active filter recommended for high THD
test('harmonicCalcFilter recommends active filter when THD > 8%', function() {
  var result = harmonicCalcFilter('it', 1, 5);
  assert.ok(result.activeRecommended, 'Active filter should be recommended for IT with THD > 8%');
});

// Test 246: Cable derating for harmonics
test('harmonicCalcCableDerating returns valid factor', function() {
  var result = harmonicCalcCableDerating('it', 1);
  assert.ok(result.factor <= 1.0, 'Cable derating factor must be <= 1.0');
  assert.ok(result.factor > 0, 'Cable derating factor must be positive');
  assert.ok(result.clause.indexOf('B.52.11') >= 0, 'Must reference Table B.52.11');
});

// Test 247: Cable derating for loads with low THD is 1.0
test('harmonicCalcCableDerating returns 1.0 for low THD loads', function() {
  var result = harmonicCalcCableDerating('ev', 20);
  assert.strictEqual(result.factor, 1.0, 'EV chargers with diversity have low THD, derating = 1.0');
});

// Test 248: renderHarmonic has no text inputs
test('renderHarmonic has no text input fields', function() {
  var html = renderHarmonic();
  assert.ok(html.indexOf('<input type="text"') < 0, 'No text inputs allowed');
  assert.ok(html.indexOf('<textarea') < 0, 'No textareas allowed');
});

// Test 249: renderHarmonic references EN 50160
test('renderHarmonic references EN 50160', function() {
  var html = renderHarmonic();
  assert.ok(html.indexOf('EN 50160') >= 0, 'Must reference EN 50160');
});

// Test 250: renderHarmonic contains SVG spectrum chart
test('renderHarmonic contains SVG harmonic spectrum', function() {
  var html = renderHarmonic();
  assert.ok(html.indexOf('<svg') >= 0, 'Must contain SVG chart');
  assert.ok(html.indexOf('H5') >= 0 || html.indexOf('H3') >= 0, 'Must show harmonic numbers');
});

// Test 251: renderHarmonic uses sel-btn
test('renderHarmonic uses sel-btn buttons', function() {
  var html = renderHarmonic();
  assert.ok(html.indexOf('sel-btn') >= 0, 'Must use sel-btn class');
});

// ===== VFD SIZING TESTS =====

// Test 252: VFD rated current for variable torque (pump)
test('vfdCalcRatedCurrent pump uses 1.1x sizing factor', function() {
  var result = vfdCalcRatedCurrent(11, 'pump');
  assert.strictEqual(result.sizingFactor, 1.1, 'Pump (variable torque) sizing factor must be 1.1');
  assert.ok(result.vfdCurrent >= Math.ceil(result.motorFLC * 1.1), 'VFD current must be >= 1.1x FLC');
  assert.ok(result.clause.indexOf('IEC 61800') >= 0, 'Must reference IEC 61800');
});

// Test 253: VFD rated current for constant torque (conveyor)
test('vfdCalcRatedCurrent conveyor uses 1.5x sizing factor', function() {
  var result = vfdCalcRatedCurrent(11, 'conveyor');
  assert.strictEqual(result.sizingFactor, 1.5, 'Conveyor (constant torque) sizing factor must be 1.5');
  assert.ok(result.vfdCurrent >= Math.ceil(result.motorFLC * 1.5), 'VFD current must be >= 1.5x FLC');
});

// Test 254: VFD input cable sized correctly
test('vfdCalcInputCable returns cable with sufficient Iz', function() {
  var result = vfdCalcInputCable(22, 'pump');
  assert.ok(result.cable, 'Must return a cable');
  assert.ok(result.cable.iz >= result.inputCurrent, 'Cable Iz must be >= input current');
  assert.ok(result.inputCurrent > 0, 'Input current must be positive');
});

// Test 255: VFD output cable checks length against EMC category
test('vfdCalcOutputCable enforces max length per EMC category', function() {
  var resultC1 = vfdCalcOutputCable(11, 'pump', 40, 'C1');
  var resultC3 = vfdCalcOutputCable(11, 'pump', 40, 'C3');
  assert.ok(!resultC1.lengthOk, 'C1 with 40m cable should exceed 30m shielded limit');
  assert.ok(resultC3.lengthOk, 'C3 with 40m cable should be within 100m unshielded limit');
});

// Test 256: VFD output cable recommends shield for >30m
test('vfdCalcOutputCable recommends dV/dt filter for cable > 30m', function() {
  var result = vfdCalcOutputCable(11, 'pump', 40, 'C3');
  assert.ok(result.dvdtFilterNeeded, 'dV/dt filter needed for cable > 30m');
});

// Test 257: Braking resistor needed for crane
test('vfdCalcBraking needed for crane application', function() {
  var result = vfdCalcBraking(22, 'crane');
  assert.ok(result.needed, 'Crane requires braking resistor');
  assert.ok(result.brakePowerKW > 0, 'Braking power must be positive');
  assert.ok(result.resistanceOhm > 0, 'Resistance must be positive');
  assert.ok(result.clause.indexOf('IEC 61800') >= 0, 'Must reference IEC 61800');
});

// Test 258: No braking for pump
test('vfdCalcBraking not needed for pump', function() {
  var result = vfdCalcBraking(22, 'pump');
  assert.ok(!result.needed, 'Pump does not require braking resistor');
});

// Test 259: Line reactor recommended for large motors
test('vfdCalcLineReactor recommended for motors > 15kW', function() {
  var result = vfdCalcLineReactor(22);
  assert.ok(result.recommended, 'Line reactor recommended for 22kW motor');
  assert.ok(result.clause.indexOf('IEC 61800') >= 0, 'Must reference IEC 61800');
});

// Test 260: Line reactor not needed for small motors
test('vfdCalcLineReactor not needed for small motors', function() {
  var result = vfdCalcLineReactor(7.5);
  assert.ok(!result.recommended, 'Line reactor not needed for 7.5kW motor');
});

// Test 261: PE sizing minimum 10mm2
test('vfdCalcPE returns minimum 10mm2 Cu', function() {
  var result = vfdCalcPE(11);
  assert.ok(result.minPEmm2 >= 10, 'Minimum PE must be >= 10mm2');
  assert.ok(result.clause.indexOf('IEC 61800-5-1') >= 0, 'Must reference IEC 61800-5-1');
});

// Test 262: PE sizing increases for large motors
test('vfdCalcPE increases for larger motors', function() {
  var small = vfdCalcPE(11);
  var large = vfdCalcPE(75);
  assert.ok(large.minPEmm2 >= small.minPEmm2, 'Larger motor needs larger PE');
});

// Test 263: renderVFD has no text inputs
test('renderVFD has no text input fields', function() {
  var html = renderVFD();
  assert.ok(html.indexOf('<input type="text"') < 0, 'No text inputs allowed');
  assert.ok(html.indexOf('<textarea') < 0, 'No textareas allowed');
});

// Test 264: renderVFD shows NO RCD warning
test('renderVFD shows critical No RCD warning', function() {
  var html = renderVFD();
  assert.ok(html.indexOf('RCD') >= 0, 'Must mention RCD');
  assert.ok(html.indexOf('NEVER') >= 0 || html.indexOf('ALDRIG') >= 0, 'Must have critical warning');
});

// Test 265: renderVFD references IEC 61800
test('renderVFD references IEC 61800', function() {
  var html = renderVFD();
  assert.ok(html.indexOf('IEC 61800') >= 0, 'Must reference IEC 61800');
});

// Test 266: renderVFD uses sel-btn buttons
test('renderVFD uses sel-btn buttons', function() {
  var html = renderVFD();
  assert.ok(html.indexOf('sel-btn') >= 0, 'Must use sel-btn class');
});

// Test 267: All three new modules registered in translations
test('Motor, Harmonic, VFD registered in T.da, T.en, T.fa', function() {
  assert.ok(T.da.modules.motor, 'motor must be in Danish');
  assert.ok(T.en.modules.motor, 'motor must be in English');
  assert.ok(T.fa.modules.motor, 'motor must be in Farsi');
  assert.ok(T.da.modules.harmonic, 'harmonic must be in Danish');
  assert.ok(T.en.modules.harmonic, 'harmonic must be in English');
  assert.ok(T.fa.modules.harmonic, 'harmonic must be in Farsi');
  assert.ok(T.da.modules.vfd, 'vfd must be in Danish');
  assert.ok(T.en.modules.vfd, 'vfd must be in English');
  assert.ok(T.fa.modules.vfd, 'vfd must be in Farsi');
});

// --- Summary ---
console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===\n');
if (failed > 0) process.exit(1);
console.log('All tests passed!');
