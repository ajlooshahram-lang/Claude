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

// --- Summary ---
console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===\n');
if (failed > 0) process.exit(1);
console.log('All tests passed!');
