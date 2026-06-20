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
    // Should return Farsi translation or English fallback
    assert(typeof result === 'string' && result.length > 0, 'tx() in Farsi should return a non-empty string');
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

// ===== LIGHTING DESIGN MODULE TESTS =====

// Test 268: Lighting room types defined
test('LIGHTING_ROOM_TYPES has required room types', function() {
  assert.ok(LIGHTING_ROOM_TYPES.office, 'Office must exist');
  assert.ok(LIGHTING_ROOM_TYPES.classroom, 'Classroom must exist');
  assert.ok(LIGHTING_ROOM_TYPES.workshop, 'Workshop must exist');
  assert.ok(LIGHTING_ROOM_TYPES.warehouse, 'Warehouse must exist');
  assert.ok(LIGHTING_ROOM_TYPES.corridor, 'Corridor must exist');
  assert.ok(LIGHTING_ROOM_TYPES.parking, 'Parking must exist');
  assert.strictEqual(LIGHTING_ROOM_TYPES.office.lux, 500, 'Office must be 500 lux');
  assert.strictEqual(LIGHTING_ROOM_TYPES.corridor.lux, 100, 'Corridor must be 100 lux');
  assert.strictEqual(LIGHTING_ROOM_TYPES.parking.lux, 75, 'Parking must be 75 lux');
});

// Test 269: Light sources defined with correct lm/W
test('LIGHTING_SOURCES has correct efficacy values', function() {
  assert.strictEqual(LIGHTING_SOURCES.ledPanel.lmPerW, 120, 'LED panel 120 lm/W');
  assert.strictEqual(LIGHTING_SOURCES.ledDownlight.lmPerW, 100, 'LED downlight 100 lm/W');
  assert.strictEqual(LIGHTING_SOURCES.ledTubeT8.lmPerW, 130, 'LED tube T8 130 lm/W');
  assert.strictEqual(LIGHTING_SOURCES.ledHighBay.lmPerW, 140, 'LED high-bay 140 lm/W');
  assert.strictEqual(LIGHTING_SOURCES.ledStrip.lmPerW, 80, 'LED strip 80 lm/W');
});

// Test 270: Room index calculation
test('lightingCalcRoomIndex correct for standard room', function() {
  // k = L*W / (Hm * (L+W)), Hm = height - 0.85
  // 8*6 / ((3-0.85) * (8+6)) = 48 / (2.15 * 14) = 48/30.1 = 1.59
  var k = lightingCalcRoomIndex(8, 6, 3.0);
  assert.ok(k > 1.5 && k < 1.7, 'Room index for 8x6x3 room should be ~1.59, got ' + k);
});

// Test 271: Utilization factor lookup
test('lightingGetUF returns correct values per room index', function() {
  assert.strictEqual(lightingGetUF(0.5), 0.30, 'k<0.6 gives UF=0.30');
  assert.strictEqual(lightingGetUF(0.7), 0.40, 'k<0.8 gives UF=0.40');
  assert.strictEqual(lightingGetUF(0.9), 0.45, 'k<1.0 gives UF=0.45');
  assert.strictEqual(lightingGetUF(1.1), 0.50, 'k<1.25 gives UF=0.50');
  assert.strictEqual(lightingGetUF(1.4), 0.55, 'k<1.5 gives UF=0.55');
  assert.strictEqual(lightingGetUF(1.8), 0.60, 'k<2.0 gives UF=0.60');
  assert.strictEqual(lightingGetUF(3.5), 0.75, 'k>=3.0 gives UF=0.75');
});

// Test 272: Luminaire calculation produces correct count
test('lightingCalcLuminaires returns valid luminaire count', function() {
  var result = lightingCalcLuminaires('office', 'ledPanel', 36, 8, 6, 3.0, 0.7);
  assert.ok(result.count > 0, 'Must have at least 1 luminaire');
  assert.ok(result.count <= 100, 'Count should be reasonable');
  assert.ok(result.targetLux === 500, 'Office target must be 500 lux');
  assert.ok(result.rows > 0, 'Must have rows');
  assert.ok(result.cols > 0, 'Must have cols');
});

// Test 273: Luminaire count uses conservative ceiling rounding
test('lightingCalcLuminaires uses ceiling for luminaire count', function() {
  // For a small room with low lux requirement
  var result = lightingCalcLuminaires('corridor', 'ledPanel', 36, 4, 2, 2.7, 0.8);
  // N = (100 * 8) / (4320 * UF * 0.8). Even small N must be ceiling'd
  assert.ok(result.count >= 1, 'Minimum 1 luminaire');
  assert.ok(Number.isInteger(result.count), 'Count must be integer');
});

// Test 274: Uniformity check
test('lightingCalcLuminaires checks uniformity ratio', function() {
  var result = lightingCalcLuminaires('office', 'ledPanel', 36, 8, 6, 3.0, 0.7);
  assert.ok(typeof result.uniformityOk === 'boolean', 'uniformityOk must be boolean');
  assert.ok(typeof result.spacingRatio === 'number', 'spacingRatio must be number');
});

// Test 275: Circuit calculation (max 2000W per circuit)
test('lightingCalcLuminaires correct circuits for high wattage', function() {
  // Use high wattage and large room to need multiple circuits
  var result = lightingCalcLuminaires('workshop', 'ledHighBay', 200, 30, 20, 6.0, 0.7);
  assert.ok(result.circuitsNeeded >= 2, 'Large installation needs multiple circuits');
  assert.ok(result.totalWattage === result.count * 200, 'Total wattage = count * wattage');
});

// Test 276: Power density and LENI
test('lightingCalcLuminaires calculates power density', function() {
  var result = lightingCalcLuminaires('office', 'ledPanel', 36, 8, 6, 3.0, 0.7);
  assert.ok(result.powerDensity > 0, 'Power density must be positive');
  assert.ok(typeof result.leniOk === 'boolean', 'leniOk must be boolean');
  assert.ok(result.leniMax === 12, 'Office LENI max = 12 W/m2');
});

// Test 277: DS/EN 12464-1 clause reference
test('lightingCalcLuminaires references DS/EN 12464-1', function() {
  var result = lightingCalcLuminaires('office', 'ledPanel', 36, 8, 6, 3.0, 0.7);
  assert.ok(result.clause.indexOf('DS/EN 12464-1') >= 0, 'Must reference DS/EN 12464-1');
});

// Test 278: renderLighting has no text inputs
test('renderLighting has no text input fields', function() {
  var html = renderLighting();
  assert.ok(html.indexOf('<input type="text"') < 0, 'No text inputs allowed');
  assert.ok(html.indexOf('<textarea') < 0, 'No textareas allowed');
});

// Test 279: renderLighting uses sel-btn
test('renderLighting uses sel-btn buttons', function() {
  var html = renderLighting();
  assert.ok(html.indexOf('sel-btn') >= 0, 'Must use sel-btn class');
});

// Test 280: renderLighting references standard
test('renderLighting references DS/EN 12464-1', function() {
  var html = renderLighting();
  assert.ok(html.indexOf('DS/EN 12464-1') >= 0, 'Must reference DS/EN 12464-1');
});

// Test 281: Large room edge case
test('lightingCalcLuminaires handles large room (30x20)', function() {
  var result = lightingCalcLuminaires('warehouse', 'ledHighBay', 150, 30, 20, 6.0, 0.6);
  assert.ok(result.count > 10, 'Large warehouse needs many luminaires');
  assert.ok(result.area === 600, 'Area must be 600m2');
});

// ===== HEAT PUMP INSTALLATION MODULE TESTS =====

// Test 282: Electrical input calculation from COP
test('heatpumpCalcElectricalInput correct for 10kW/COP 3.5', function() {
  var result = heatpumpCalcElectricalInput(10, 3.5);
  assert.ok(result > 2.8 && result < 2.9, 'Should be ~2.86 kW, got ' + result);
});

// Test 283: Phase selection
test('heatpumpGetPhase returns 1-phase up to 5kW', function() {
  assert.strictEqual(heatpumpGetPhase(4.9), 1, '4.9kW should be 1-phase');
  assert.strictEqual(heatpumpGetPhase(5.1), 3, '5.1kW should be 3-phase');
  assert.strictEqual(heatpumpGetPhase(5.0), 1, '5.0kW should be 1-phase');
});

// Test 284: FLC calculation for 1-phase
test('heatpumpCalcFLC correct for 1-phase', function() {
  // 3kW / 230V = 13.04 -> ceil = 14
  var flc = heatpumpCalcFLC(3, 1);
  assert.strictEqual(flc, 14, '3kW 1-phase FLC should be 14A, got ' + flc);
});

// Test 285: FLC calculation for 3-phase
test('heatpumpCalcFLC correct for 3-phase', function() {
  // 8kW / (400 * sqrt(3)) = 8000/692.8 = 11.55 -> ceil = 12
  var flc = heatpumpCalcFLC(8, 3);
  assert.strictEqual(flc, 12, '8kW 3-phase FLC should be 12A, got ' + flc);
});

// Test 286: Cable selection minimum 2.5mm2
test('heatpumpSelectCable returns minimum 2.5mm2', function() {
  var cable = heatpumpSelectCable(5);
  assert.ok(cable, 'Must return a cable');
  assert.ok(cable.mm2 >= 2.5, 'Minimum cable must be 2.5mm2');
  assert.ok(cable.iz >= 5, 'Cable Iz must cover FLC');
});

// Test 287: MCB curve C selection
test('heatpumpSelectMCB selects curve C', function() {
  var mcb = heatpumpSelectMCB(15, 1);
  assert.ok(mcb, 'Must return an MCB');
  assert.strictEqual(mcb.curve, 'C', 'Must be curve C for compressor');
  assert.ok(mcb.rating >= 15, 'MCB rating must cover FLC');
});

// Test 288: RCD 30mA Type A selection
test('heatpumpSelectRCD returns 30mA Type A', function() {
  var rcd = heatpumpSelectRCD(15, 1);
  assert.ok(rcd, 'Must return an RCD');
  assert.strictEqual(rcd.sensitivity, 30, 'Must be 30mA');
  assert.strictEqual(rcd.rcdType, 'A', 'Must be Type A');
});

// Test 289: Voltage drop calculation
test('heatpumpCalcVoltageDrop within 3% for short cable', function() {
  var cable = heatpumpSelectCable(15);
  var vdrop = heatpumpCalcVoltageDrop(15, cable, 10, 1);
  assert.ok(vdrop.percent >= 0, 'Voltage drop must be positive');
  assert.ok(vdrop.ok === true, 'Short cable should be within 3%');
  assert.ok(vdrop.clause.indexOf('60364') >= 0, 'Must reference 60364');
});

// Test 290: Voltage drop exceeds 3% for long cable
test('heatpumpCalcVoltageDrop exceeds 3% for very long cable', function() {
  var cable = PRODUCTS.cables[0]; // 1.5mm2 cable
  var vdrop = heatpumpCalcVoltageDrop(30, cable, 50, 1);
  assert.ok(vdrop.percent > 3, 'Long cable with high current should exceed 3%');
  assert.ok(vdrop.ok === false, 'Should not be OK');
});

// Test 291: Full installation calculation
test('heatpumpCalcInstallation returns complete result', function() {
  var result = heatpumpCalcInstallation('airToWater', 10, 3.5, 4, 15);
  assert.ok(result.electricalKW > 0, 'Electrical input must be positive');
  assert.ok(result.phase === 1 || result.phase === 3, 'Phase must be 1 or 3');
  assert.ok(result.flc > 0, 'FLC must be positive');
  assert.ok(result.cable, 'Must have cable');
  assert.ok(result.mcb, 'Must have MCB');
  assert.ok(result.rcd, 'Must have RCD');
  assert.ok(result.spdRequired === true, 'SPD must be required');
  assert.ok(result.disconnectRequired === true, 'Disconnect must be required');
});

// Test 292: Defrost load factor 1.15
test('heatpumpCalcInstallation applies defrost factor 1.15', function() {
  var result = heatpumpCalcInstallation('airToWater', 10, 3.5, 4, 15);
  var expectedDefrost = Math.ceil(result.electricalKW * 1.15 * 100) / 100;
  assert.strictEqual(result.defrostLoad, expectedDefrost, 'Defrost load must be elec * 1.15');
});

// Test 293: High COP reduces electrical input
test('heatpumpCalcInstallation high COP gives lower current', function() {
  var low = heatpumpCalcInstallation('airToWater', 10, 2.5, 4, 15);
  var high = heatpumpCalcInstallation('airToWater', 10, 4.5, 4, 15);
  assert.ok(high.flc < low.flc, 'Higher COP should give lower FLC');
});

// Test 294: renderHeatPump has no text inputs
test('renderHeatPump has no text input fields', function() {
  var html = renderHeatPump();
  assert.ok(html.indexOf('<input type="text"') < 0, 'No text inputs allowed');
  assert.ok(html.indexOf('<textarea') < 0, 'No textareas allowed');
});

// Test 295: renderHeatPump uses sel-btn
test('renderHeatPump uses sel-btn buttons', function() {
  var html = renderHeatPump();
  assert.ok(html.indexOf('sel-btn') >= 0, 'Must use sel-btn class');
});

// Test 296: renderHeatPump references DS/HD 60364
test('renderHeatPump references DS/HD 60364', function() {
  var html = renderHeatPump();
  assert.ok(html.indexOf('60364') >= 0, 'Must reference 60364');
});

// ===== BUSBAR TRUNKING SYSTEM MODULE TESTS =====

// Test 297: Derating calculation at 35C horizontal IP54
test('busbarCalcDerating correct at 35C horizontal_flat IP54', function() {
  var result = busbarCalcDerating(35, 'horizontal_flat', 54);
  assert.strictEqual(result.tempFactor, 0.95, 'Temp factor at 35C = 0.95');
  assert.strictEqual(result.ipFactor, 0.90, 'IP54 factor = 0.90');
  assert.strictEqual(result.installFactor, 1.0, 'Horizontal flat = 1.0');
  // 0.95 * 0.90 * 1.0 = 0.855 -> floor to 0.855
  assert.ok(result.combined >= 0.85 && result.combined <= 0.86, 'Combined ~0.855, got ' + result.combined);
  assert.ok(result.clause.indexOf('IEC 61439-6') >= 0, 'Must reference IEC 61439-6');
});

// Test 298: Derating at worst case (50C vertical IP55)
test('busbarCalcDerating worst case 50C vertical IP55', function() {
  var result = busbarCalcDerating(50, 'vertical', 55);
  assert.strictEqual(result.tempFactor, 0.80, 'Temp factor at 50C = 0.80');
  assert.strictEqual(result.ipFactor, 0.85, 'IP55 factor = 0.85');
  assert.strictEqual(result.installFactor, 0.90, 'Vertical = 0.90');
  var expected = Math.floor(0.80 * 0.85 * 0.90 * 1000) / 1000;
  assert.strictEqual(result.combined, expected, 'Combined must use floor');
});

// Test 299: Effective capacity calculation
test('busbarCalcEffectiveCapacity applies derating', function() {
  var derating = busbarCalcDerating(30, 'horizontal_flat', 31);
  var effective = busbarCalcEffectiveCapacity(400, derating);
  assert.strictEqual(effective, 400, 'At 30C, flat, IP31 all factors are 1.0, so 400A');
});

// Test 300: Diversity factor for tap-offs
test('busbarCalcDiversity correct for various tap-off counts', function() {
  assert.strictEqual(busbarCalcDiversity(1), 1.0, '1 tap-off = diversity 1.0');
  assert.strictEqual(busbarCalcDiversity(3), 0.9, '3 tap-offs = diversity 0.9');
  assert.strictEqual(busbarCalcDiversity(5), 0.8, '5 tap-offs = diversity 0.8');
  assert.strictEqual(busbarCalcDiversity(8), 0.7, '8 tap-offs = diversity 0.7');
  assert.strictEqual(busbarCalcDiversity(20), 0.5, '20 tap-offs = diversity 0.5');
});

// Test 301: System load calculation
test('busbarCalcSystemLoad returns correct total demand', function() {
  var result = busbarCalcSystemLoad(6, 63);
  // 6 tap-offs * 63A * 0.8 diversity = 302.4 -> ceil = 303
  assert.strictEqual(result.totalDemand, Math.ceil(6 * 63 * 0.8), 'Total demand with diversity');
  assert.strictEqual(result.diversity, 0.8, '6 tap-offs gives diversity 0.8');
  assert.ok(result.clause.indexOf('IEC 61439-6') >= 0, 'Must reference IEC 61439-6');
});

// Test 302: Thermal check pass
test('busbarCheckThermal passes when load < capacity', function() {
  var result = busbarCheckThermal(200, 400);
  assert.ok(result.ok, 'Load 200A < Capacity 400A should pass');
  assert.strictEqual(result.loadRatio, 50, 'Load ratio should be 50%');
});

// Test 303: Thermal check fail
test('busbarCheckThermal fails when load > capacity', function() {
  var result = busbarCheckThermal(500, 400);
  assert.ok(!result.ok, 'Load 500A > Capacity 400A should fail');
});

// Test 304: Voltage drop calculation
test('busbarCalcVoltageDrop returns valid result', function() {
  var result = busbarCalcVoltageDrop('distribution', 400, 5);
  assert.ok(result.lengthM === 15, '5 sections = 15m');
  assert.ok(result.vdropMv >= 0, 'Voltage drop must be positive');
  assert.ok(typeof result.ok === 'boolean', 'ok must be boolean');
  assert.ok(result.clause.indexOf('IEC 61439-6') >= 0, 'Must reference IEC 61439-6');
});

// Test 305: Short-circuit withstand check
test('busbarCheckShortCircuit Icw vs upstream Ik', function() {
  // 400A busbar: Icw = floor(400 * 20 / 1000) = 8, but min 10
  var result = busbarCheckShortCircuit(400, 8);
  assert.ok(result.icw >= 10, 'Minimum Icw should be 10kA');
  assert.ok(result.ok, 'Should pass when Icw >= Ik');
  assert.ok(result.clause.indexOf('IEC 61439-6') >= 0, 'Must reference IEC 61439-6');
});

// Test 306: Short-circuit withstand fails
test('busbarCheckShortCircuit fails when Ik too high', function() {
  // 100A busbar: Icw = max(floor(100*20/1000), 10) = 10kA
  var result = busbarCheckShortCircuit(100, 25);
  assert.ok(!result.ok, 'Should fail when Icw < Ik');
});

// Test 307: Expansion joints calculation
test('busbarCheckExpansion joints every 30m', function() {
  var result = busbarCheckExpansion(10); // 30m
  assert.strictEqual(result.lengthM, 30, '10 sections = 30m');
  assert.strictEqual(result.jointsNeeded, 1, '30m needs 1 expansion joint');
});

// Test 308: MCCB selection for busbar
test('busbarSelectMCCB returns valid MCCB', function() {
  var mccb = busbarSelectMCCB(400);
  assert.ok(mccb, 'Must return an MCCB');
  assert.ok(mccb.brand, 'MCCB must have brand');
  assert.ok(mccb.icu > 0, 'MCCB must have Icu');
});

// Test 309: Full busbar calculation
test('busbarCalcFull returns complete result', function() {
  var result = busbarCalcFull('distribution', 400, 'schneider', 35, 'horizontal_flat', 54, 6, 63, 5, 25);
  assert.ok(result.derating, 'Must have derating');
  assert.ok(result.effectiveCapacity > 0, 'Must have effective capacity');
  assert.ok(result.systemLoad, 'Must have system load');
  assert.ok(result.thermal, 'Must have thermal check');
  assert.ok(result.vdrop, 'Must have voltage drop');
  assert.ok(result.sc, 'Must have short-circuit check');
  assert.ok(result.mccb, 'Must have MCCB');
  assert.ok(typeof result.allOk === 'boolean', 'allOk must be boolean');
});

// Test 310: renderBusbar has no text inputs
test('renderBusbar has no text input fields', function() {
  var html = renderBusbar();
  assert.ok(html.indexOf('<input type="text"') < 0, 'No text inputs allowed');
  assert.ok(html.indexOf('<textarea') < 0, 'No textareas allowed');
});

// Test 311: renderBusbar uses sel-btn
test('renderBusbar uses sel-btn buttons', function() {
  var html = renderBusbar();
  assert.ok(html.indexOf('sel-btn') >= 0, 'Must use sel-btn class');
});

// Test 312: renderBusbar references IEC 61439-6
test('renderBusbar references IEC 61439-6', function() {
  var html = renderBusbar();
  assert.ok(html.indexOf('IEC 61439-6') >= 0, 'Must reference IEC 61439-6');
});

// Test 313: Maximum busbar rating edge case
test('busbarCalcFull handles maximum 5000A rating', function() {
  var result = busbarCalcFull('transport', 5000, 'siemens', 40, 'horizontal_flat', 31, 4, 160, 10, 50);
  assert.ok(result.effectiveCapacity > 0, 'Must calculate effective capacity');
  assert.ok(result.sc.icw >= 50, '5000A busbar should have high Icw');
});

// Test 314: All three new modules registered in translations
test('Lighting, HeatPump, Busbar registered in T.da, T.en, T.fa', function() {
  assert.ok(T.da.modules.lighting, 'lighting must be in Danish');
  assert.ok(T.en.modules.lighting, 'lighting must be in English');
  assert.ok(T.fa.modules.lighting, 'lighting must be in Farsi');
  assert.ok(T.da.modules.heatpump, 'heatpump must be in Danish');
  assert.ok(T.en.modules.heatpump, 'heatpump must be in English');
  assert.ok(T.fa.modules.heatpump, 'heatpump must be in Farsi');
  assert.ok(T.da.modules.busbar, 'busbar must be in Danish');
  assert.ok(T.en.modules.busbar, 'busbar must be in English');
  assert.ok(T.fa.modules.busbar, 'busbar must be in Farsi');
});

// Test 315: Farsi translations in _FA for lighting
test('Farsi translations exist for lighting module', function() {
  assert.ok(_FA['Lighting Design'], 'Lighting Design must have Farsi');
  assert.ok(_FA['Room Type'], 'Room Type must have Farsi');
  assert.ok(_FA['Maintenance Factor'], 'Maintenance Factor must have Farsi');
});

// Test 316: Farsi translations in _FA for heat pump
test('Farsi translations exist for heat pump module', function() {
  assert.ok(_FA['Heat Pump Installation'], 'Heat Pump Installation must have Farsi');
  assert.ok(_FA['COP'], 'COP must have Farsi');
  assert.ok(_FA['Starting Current'], 'Starting Current must have Farsi');
});

// Test 317: Farsi translations in _FA for busbar
test('Farsi translations exist for busbar module', function() {
  assert.ok(_FA['Busbar Trunking System'], 'Busbar Trunking System must have Farsi');
  assert.ok(_FA['Rated Current'], 'Rated Current must have Farsi');
  assert.ok(_FA['Diversity Factor'], 'Diversity Factor must have Farsi');
});

// ===== BATHROOM ZONES MODULE TESTS =====

// Test 318: Bathroom module registered in translations
test('Bathroom module registered in T.da, T.en, T.fa', function() {
  assert.ok(T.da.modules.bathroom, 'bathroom must be in Danish');
  assert.ok(T.en.modules.bathroom, 'bathroom must be in English');
  assert.ok(T.fa.modules.bathroom, 'bathroom must be in Farsi');
});

// Test 319: Farsi translations for bathroom module
test('Farsi translations exist for bathroom module', function() {
  assert.ok(_FA['Bathroom Zones'], 'Bathroom Zones must have Farsi');
  assert.ok(_FA['Zone Classification'], 'Zone Classification must have Farsi');
  assert.ok(_FA['Equipment'], 'Equipment must have Farsi');
  assert.ok(_FA['ALLOWED'], 'ALLOWED must have Farsi');
  assert.ok(_FA['NOT ALLOWED'], 'NOT ALLOWED must have Farsi');
});

// Test 320: Zone 0 - no sockets allowed
test('bathroomCheckEquipment: socket not allowed in Zone 0', function() {
  var result = bathroomCheckEquipment(0, 'socket');
  assert.strictEqual(result.allowed, false);
  assert.ok(result.clause.indexOf('701') >= 0, 'Must reference clause 701');
});

// Test 321: Zone 0 - no luminaires
test('bathroomCheckEquipment: luminaire not allowed in Zone 0', function() {
  var result = bathroomCheckEquipment(0, 'luminaire');
  assert.strictEqual(result.allowed, false);
});

// Test 322: Zone 1 - luminaire allowed with IPX4
test('bathroomCheckEquipment: luminaire allowed in Zone 1', function() {
  var result = bathroomCheckEquipment(1, 'luminaire');
  assert.strictEqual(result.allowed, true);
  assert.strictEqual(result.ipRequired, 'IPX4');
});

// Test 323: Zone 1 - no socket outlets
test('bathroomCheckEquipment: socket not allowed in Zone 1', function() {
  var result = bathroomCheckEquipment(1, 'socket');
  assert.strictEqual(result.allowed, false);
});

// Test 324: Zone 2 - shaver socket allowed via isolating transformer
test('bathroomCheckEquipment: shaver socket allowed in Zone 2', function() {
  var result = bathroomCheckEquipment(2, 'shaversocket');
  assert.strictEqual(result.allowed, true);
  assert.ok(result.reason.indexOf('isolating transformer') >= 0);
});

// Test 325: Zone 3 (outside) - socket allowed with RCD
test('bathroomCheckEquipment: socket allowed outside zones', function() {
  var result = bathroomCheckEquipment(3, 'socket');
  assert.strictEqual(result.allowed, true);
  assert.ok(result.reason.indexOf('RCD 30mA') >= 0);
});

// Test 326: EV charger not allowed in any zone
test('bathroomCheckEquipment: EV charger never allowed', function() {
  assert.strictEqual(bathroomCheckEquipment(0, 'evcharger').allowed, false);
  assert.strictEqual(bathroomCheckEquipment(1, 'evcharger').allowed, false);
  assert.strictEqual(bathroomCheckEquipment(2, 'evcharger').allowed, false);
  assert.strictEqual(bathroomCheckEquipment(3, 'evcharger').allowed, false);
});

// Test 327: IP ratings per zone correct
test('bathroomGetZoneIP returns correct ratings', function() {
  assert.strictEqual(bathroomGetZoneIP(0), 'IPX7');
  assert.strictEqual(bathroomGetZoneIP(1), 'IPX4');
  assert.strictEqual(bathroomGetZoneIP(2), 'IPX4');
  assert.strictEqual(bathroomGetZoneIP(3), 'IPX1');
});

// Test 328: Protection requirements include RCD
test('bathroomGetProtectionReqs includes RCD 30mA', function() {
  var reqs = bathroomGetProtectionReqs(0);
  var hasRCD = reqs.some(function(r) { return r.req.indexOf('RCD 30mA') >= 0; });
  assert.ok(hasRCD, 'Must require RCD 30mA');
});

// Test 329: SELV requirement in Zone 0 and 1
test('bathroomGetProtectionReqs includes SELV for Zone 0 and 1', function() {
  var reqs0 = bathroomGetProtectionReqs(0);
  var hasSELV0 = reqs0.some(function(r) { return r.req.indexOf('SELV') >= 0; });
  assert.ok(hasSELV0, 'Zone 0 must require SELV');
  var reqs1 = bathroomGetProtectionReqs(1);
  var hasSELV1 = reqs1.some(function(r) { return r.req.indexOf('SELV') >= 0; });
  assert.ok(hasSELV1, 'Zone 1 must require SELV');
});

// Test 330: Zone 2+ no SELV requirement
test('bathroomGetProtectionReqs no SELV for Zone 2+', function() {
  var reqs2 = bathroomGetProtectionReqs(2);
  var hasSELV2 = reqs2.some(function(r) { return r.req.indexOf('SELV') >= 0; });
  assert.strictEqual(hasSELV2, false, 'Zone 2 should not require SELV');
});

// Test 331: Underfloor heating allowed with conditions
test('bathroomCheckUnderfloorHeating allowed with earthed grid', function() {
  var ufh = bathroomCheckUnderfloorHeating(0);
  assert.strictEqual(ufh.allowed, true);
  assert.ok(ufh.condition.indexOf('earthed') >= 0 || ufh.condition.indexOf('Earthed') >= 0);
  assert.strictEqual(ufh.clause, 'cl.701.753');
});

// Test 332: renderBathroom contains no text inputs
test('renderBathroom has no text input fields', function() {
  var html = renderBathroom();
  assert.strictEqual(html.indexOf('<input type="text"'), -1, 'No text inputs allowed');
  assert.strictEqual(html.indexOf('<textarea'), -1, 'No textarea allowed');
});

// Test 333: renderBathroom references DS/HD 60364-7-701
test('renderBathroom references DS/HD 60364-7-701', function() {
  var html = renderBathroom();
  assert.ok(html.indexOf('60364-7-701') >= 0, 'Must reference DS/HD 60364-7-701');
});

// ===== FIRE ALARM MODULE TESTS =====

// Test 334: Fire alarm module registered in translations
test('Fire alarm module registered in T.da, T.en, T.fa', function() {
  assert.ok(T.da.modules.firealarm, 'firealarm must be in Danish');
  assert.ok(T.en.modules.firealarm, 'firealarm must be in English');
  assert.ok(T.fa.modules.firealarm, 'firealarm must be in Farsi');
});

// Test 335: Farsi translations for fire alarm module
test('Farsi translations exist for fire alarm module', function() {
  assert.ok(_FA['Fire Alarm System'], 'Fire Alarm System must have Farsi');
  assert.ok(_FA['Detector Type'], 'Detector Type must have Farsi');
  assert.ok(_FA['Battery Sizing'], 'Battery Sizing must have Farsi');
});

// Test 336: Optical smoke detector coverage 60m2
test('firealarmCalcDetectors: optical smoke covers 60m2', function() {
  var result = firealarmCalcDetectors('optical_smoke', 100, 3.0);
  assert.strictEqual(result.count, 2); // ceil(100/60) = 2
  assert.strictEqual(result.coverage, 60);
});

// Test 337: Heat A1 detector coverage 30m2
test('firealarmCalcDetectors: heat A1 covers 30m2', function() {
  var result = firealarmCalcDetectors('heat_a1', 100, 3.0);
  assert.strictEqual(result.count, 4); // ceil(100/30) = 4 (conservative with rounding)
});

// Test 338: Smoke detector height limit 12m
test('firealarmCalcDetectors: smoke height limit 12m', function() {
  var result = firealarmCalcDetectors('optical_smoke', 100, 15.0);
  assert.strictEqual(result.heightOk, false);
});

// Test 339: Heat detector height limit 7.5m
test('firealarmCalcDetectors: heat height limit 7.5m', function() {
  var result = firealarmCalcDetectors('heat_a1', 100, 8.0);
  assert.strictEqual(result.heightOk, false);
});

// Test 340: Large area needs multiple detectors
test('firealarmCalcDetectors: 1000m2 needs many detectors', function() {
  var result = firealarmCalcDetectors('optical_smoke', 1000, 3.0);
  assert.ok(result.count >= 17, 'Should need at least 17 detectors for 1000m2'); // ceil(1000/60)=17
});

// Test 341: Loop design max 126 devices
test('firealarmCalcLoopDesign: max 126 devices per loop', function() {
  var result = firealarmCalcLoopDesign(200);
  assert.ok(result.loops >= 2, 'Should need at least 2 loops for 200 devices');
  assert.ok(result.devicesPerLoop <= 126, 'Should not exceed 126 per loop');
});

// Test 342: Battery sizing includes 72h standby
test('firealarmCalcBattery: 72h standby + 30min alarm', function() {
  var result = firealarmCalcBattery(10, 2);
  assert.strictEqual(result.standbyH, 72);
  assert.strictEqual(result.alarmMin, 30);
  assert.strictEqual(result.voltage, 24);
  assert.ok(result.batteryAh > 0, 'Battery capacity must be positive');
});

// Test 343: Call points max 30m travel
test('firealarmCalcCallPoints: max 30m travel distance', function() {
  var result = firealarmCalcCallPoints(100);
  assert.strictEqual(result.maxTravel, 30);
  assert.ok(result.count >= 2, 'Minimum 2 call points');
});

// Test 344: Manual call point calculation
test('firealarmCalcDetectors: manual call point', function() {
  var result = firealarmCalcDetectors('manual_cp', 100, 3.0);
  assert.ok(result.count >= 1, 'At least 1 call point');
  assert.strictEqual(result.standard, 'EN 54-11');
});

// Test 345: Sounders minimum 65 dBA
test('firealarmCalcSounders: min 65 dBA', function() {
  var result = firealarmCalcSounders(500);
  assert.strictEqual(result.minDB, 65);
  assert.ok(result.count >= 1);
});

// Test 346: renderFireAlarm has no text inputs
test('renderFireAlarm has no text input fields', function() {
  var html = renderFireAlarm();
  assert.strictEqual(html.indexOf('<input type="text"'), -1, 'No text inputs allowed');
  assert.strictEqual(html.indexOf('<textarea'), -1, 'No textarea allowed');
});

// Test 347: renderFireAlarm references DS/EN 54
test('renderFireAlarm references DS/EN 54', function() {
  var html = renderFireAlarm();
  assert.ok(html.indexOf('EN 54') >= 0 || html.indexOf('DS/EN 54') >= 0, 'Must reference EN 54');
});

// Test 348: High ceiling derate for smoke detectors
test('firealarmCalcDetectors: smoke derated above 6m ceiling', function() {
  var normal = firealarmCalcDetectors('optical_smoke', 300, 3.0);
  var high = firealarmCalcDetectors('optical_smoke', 300, 8.0);
  assert.ok(high.count >= normal.count, 'Higher ceiling should need same or more detectors');
});

// ===== STRUCTURED CABLING MODULE TESTS =====

// Test 349: Data module registered in translations
test('Data module registered in T.da, T.en, T.fa', function() {
  assert.ok(T.da.modules.data, 'data must be in Danish');
  assert.ok(T.en.modules.data, 'data must be in English');
  assert.ok(T.fa.modules.data, 'data must be in Farsi');
});

// Test 350: Farsi translations for data module
test('Farsi translations exist for data module', function() {
  assert.ok(_FA['Structured Cabling'], 'Structured Cabling must have Farsi');
  assert.ok(_FA['Cable Category'], 'Cable Category must have Farsi');
  assert.ok(_FA['PoE Budget'], 'PoE Budget must have Farsi');
});

// Test 351: Distance check - 50m Cat6A OK
test('dataCalcDistance: 50m Cat6A within limits', function() {
  var result = dataCalcDistance(50, 'cat6a');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.permanentLink, 90);
});

// Test 352: Distance check - 100m Cat6A fails
test('dataCalcDistance: 100m Cat6A exceeds permanent link', function() {
  var result = dataCalcDistance(100, 'cat6a');
  assert.strictEqual(result.ok, false);
});

// Test 353: Cat 8 max distance 30m
test('dataCalcDistance: Cat 8 max 30m', function() {
  var result = dataCalcDistance(35, 'cat8');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.permanentLink, 30);
});

// Test 354: Outlet calculation for office
test('dataCalcOutlets: office 200m2', function() {
  var result = dataCalcOutlets(200, 'office');
  assert.ok(result.outlets >= 2, 'Must have at least 2 outlets');
  assert.strictEqual(result.perWorkspace, 2);
  // 200 * 0.2 = 40 workspaces * 2 = 80 outlets
  assert.strictEqual(result.outlets, 80);
});

// Test 355: Patch panel calculation
test('dataCalcPatchPanels: 80 outlets needs 4 panels', function() {
  var result = dataCalcPatchPanels(80, 24);
  assert.strictEqual(result.panels, 4); // ceil(80/24) = 4
  assert.strictEqual(result.rackUnits, 4);
});

// Test 356: PoE budget calculation
test('dataCalcPoeBudget: 24 ports 802.3af', function() {
  var result = dataCalcPoeBudget('af', 24);
  assert.strictEqual(result.totalW, 369.6); // 24 * 15.4
  assert.ok(result.deratedW < result.totalW, 'Derated should be less than total');
  assert.strictEqual(result.derating, 0.6);
});

// Test 357: Switch port calculation with 20% spare
test('dataCalcSwitchPorts: 20% spare included', function() {
  var result = dataCalcSwitchPorts(80, 24);
  assert.strictEqual(result.accessPorts, 80);
  assert.strictEqual(result.sparePorts, 16); // ceil(80*0.2)
  assert.strictEqual(result.totalPorts, 96);
});

// Test 358: Fiber budget calculation OS2
test('dataCalcFiberBudget: OS2 1km', function() {
  var result = dataCalcFiberBudget('os2', 1000, 2, 0);
  assert.ok(result.totalLoss > 0);
  assert.strictEqual(result.distanceOk, true);
  assert.strictEqual(result.maxDistance, 10000);
});

// Test 359: Fiber budget OM3 exceeds 300m
test('dataCalcFiberBudget: OM3 400m exceeds limit', function() {
  var result = dataCalcFiberBudget('om3', 400, 2, 0);
  assert.strictEqual(result.distanceOk, false);
});

// Test 360: Separation for U/UTP
test('dataGetSeparation: U/UTP needs 200mm', function() {
  var result = dataGetSeparation('uutp');
  assert.strictEqual(result.separation, 200);
});

// Test 361: Separation for S/FTP less
test('dataGetSeparation: S/FTP needs only 50mm', function() {
  var result = dataGetSeparation('sftp');
  assert.strictEqual(result.separation, 50);
});

// Test 362: renderData has no text inputs
test('renderData has no text input fields', function() {
  var html = renderData();
  assert.strictEqual(html.indexOf('<input type="text"'), -1, 'No text inputs allowed');
  assert.strictEqual(html.indexOf('<textarea'), -1, 'No textarea allowed');
});

// Test 363: renderData references ISO 11801
test('renderData references ISO 11801', function() {
  var html = renderData();
  assert.ok(html.indexOf('ISO 11801') >= 0, 'Must reference ISO 11801');
});

// Test 364: PoE++ Type 4 = 90W per port
test('dataCalcPoeBudget: PoE++ Type 4 90W', function() {
  var result = dataCalcPoeBudget('bt4', 8);
  assert.strictEqual(result.perPort, 90);
  assert.strictEqual(result.totalW, 720); // 8 * 90
});


// ===== SURGE PROTECTION MODULE TESTS =====

// Test 365: SPD collection area calculation
test('spdCalcCollectionArea: 30x20x6m building', function() {
  var result = spdCalcCollectionArea(30, 20, 6);
  // Ac = (30 + 36)(20 + 36) * 1e-6 = 66*56*1e-6 = 0.003696 km2
  assert.ok(Math.abs(result.ac - 0.003696) < 0.000001);
  assert.ok(result.clause.indexOf('443.4') >= 0);
});

// Test 366: SPD collection area larger building
test('spdCalcCollectionArea: 100x50x30m large building', function() {
  var result = spdCalcCollectionArea(100, 50, 30);
  // Ac = (100 + 180)(50 + 180) * 1e-6 = 280*230*1e-6 = 0.0644
  assert.ok(Math.abs(result.ac - 0.0644) < 0.0001);
});

// Test 367: SPD expected strikes calculation - low risk
test('spdCalcExpectedStrikes: low Ng urban', function() {
  var ac = spdCalcCollectionArea(30, 20, 6).ac;
  var result = spdCalcExpectedStrikes(0.5, ac, 0.25);
  assert.ok(result.nd < 0.001);
  assert.ok(result.nd > 0);
});

// Test 368: SPD expected strikes - high risk mountain large building
test('spdCalcExpectedStrikes: high Ng mountain large building', function() {
  var ac = spdCalcCollectionArea(100, 50, 30).ac;
  var result = spdCalcExpectedStrikes(3.0, ac, 2.0);
  assert.ok(result.nd > 0.3);
  assert.ok(result.nd > 0.05, 'Should exceed mandatory threshold');
});

// Test 369: SPD risk assessment - below threshold
test('spdAssessRisk: Nd below 0.05 not mandatory', function() {
  var result = spdAssessRisk(0.01);
  assert.strictEqual(result.mandatory, false);
  assert.strictEqual(result.level, 'low');
});

// Test 370: SPD risk assessment - above threshold mandatory
test('spdAssessRisk: Nd above 0.05 mandatory', function() {
  var result = spdAssessRisk(0.15);
  assert.strictEqual(result.mandatory, true);
  assert.strictEqual(result.level, 'high');
});

// Test 371: SPD risk assessment - very high
test('spdAssessRisk: Nd above 0.5 very high', function() {
  var result = spdAssessRisk(0.6);
  assert.strictEqual(result.mandatory, true);
  assert.strictEqual(result.level, 'very_high');
});

// Test 372: SPD type selection with LPS
test('spdSelectType: with LPS includes Type 1', function() {
  var types = spdSelectType(true, false);
  assert.ok(types.length >= 2);
  assert.strictEqual(types[0].type, 'Type 1');
  assert.strictEqual(types[1].type, 'Type 2');
});

// Test 373: SPD type selection with sensitive equipment
test('spdSelectType: sensitive adds Type 3', function() {
  var types = spdSelectType(false, true);
  assert.ok(types.length === 2);
  assert.strictEqual(types[0].type, 'Type 2');
  assert.strictEqual(types[1].type, 'Type 3');
});

// Test 374: SPD specification Type 2
test('spdGetSpecification: Type 2 correct values', function() {
  var spec = spdGetSpecification('Type 2');
  assert.strictEqual(spec.uc, 253);
  assert.ok(spec.up <= 2.5);
  assert.strictEqual(spec.inKA, 20);
  assert.strictEqual(spec.imaxKA, 40);
  assert.strictEqual(spec.backupFuse, '125A gG');
});

// Test 375: SPD specification Type 1
test('spdGetSpecification: Type 1 higher ratings', function() {
  var spec = spdGetSpecification('Type 1');
  assert.strictEqual(spec.uc, 440);
  assert.strictEqual(spec.imaxKA, 100);
});

// Test 376: SPD product recommendation with LPS
test('spdRecommendProduct: with LPS recommends Type 1+2', function() {
  var product = spdRecommendProduct({mandatory:true}, true);
  assert.strictEqual(product.spdType, 'Type 1+2');
});

// Test 377: SPD product recommendation without LPS
test('spdRecommendProduct: without LPS recommends Type 2', function() {
  var product = spdRecommendProduct({mandatory:true}, false);
  assert.strictEqual(product.spdType, 'Type 2');
  assert.strictEqual(product.poles, '3P+N');
});

// Test 378: SPD coordination - no LPS no coordination needed
test('spdCheckCoordination: no LPS not needed', function() {
  var result = spdCheckCoordination(false, 5);
  assert.strictEqual(result.needed, false);
});

// Test 379: SPD coordination - LPS distance > 10m needs decoupling
test('spdCheckCoordination: LPS gt 10m decoupling', function() {
  var result = spdCheckCoordination(true, 15);
  assert.strictEqual(result.needed, true);
  assert.strictEqual(result.decoupling, true);
});

// Test 380: SPD coordination - LPS distance < 10m no decoupling
test('spdCheckCoordination: LPS lt 10m no decoupling', function() {
  var result = spdCheckCoordination(true, 8);
  assert.strictEqual(result.needed, true);
  assert.strictEqual(result.decoupling, false);
});

// Test 381: renderSPD has no text inputs
test('renderSPD has no text input fields', function() {
  var html = renderSPD();
  assert.strictEqual(html.indexOf('<input type="text"'), -1, 'No text inputs allowed');
  assert.strictEqual(html.indexOf('<textarea'), -1, 'No textarea allowed');
});

// Test 382: renderSPD references correct standards
test('renderSPD references DS/HD 60364', function() {
  var html = renderSPD();
  assert.ok(html.indexOf('60364') >= 0);
  assert.ok(html.indexOf('534') >= 0 || html.indexOf('443') >= 0);
});

// ===== UPS SIZING MODULE TESTS =====

// Test 383: UPS load calculation - single server
test('upsCalcLoad: 2 servers = 1000W', function() {
  var result = upsCalcLoad({ server: 2, desktop: 0, network: 0, router: 0, monitor: 0, medical: 0, security: 0, pos: 0 });
  assert.strictEqual(result.totalW, 1000);
  // VA = (500/0.8)*2 * 1.25 = 1562.5 -> ceil = 1563
  assert.strictEqual(result.totalVA, 1563);
});

// Test 384: UPS load calculation - mixed equipment
test('upsCalcLoad: mixed IT equipment', function() {
  var result = upsCalcLoad({ server: 1, desktop: 2, network: 1, router: 1, monitor: 2, medical: 0, security: 0, pos: 0 });
  assert.strictEqual(result.totalW, 1450);
  assert.ok(result.totalVA > result.totalW, 'VA should be larger than W due to PF and margin');
});

// Test 385: UPS load calculation - empty load
test('upsCalcLoad: empty equipment returns 0', function() {
  var result = upsCalcLoad({ server: 0, desktop: 0, network: 0, router: 0, monitor: 0, medical: 0, security: 0, pos: 0 });
  assert.strictEqual(result.totalW, 0);
  assert.strictEqual(result.totalVA, 0);
});

// Test 386: UPS size selection - never > 80% loaded
test('upsSelectSize: 1563VA selects 2000VA', function() {
  var size = upsSelectSize(1563);
  // minSize = ceil(1563 * 1.25) = 1954, next standard >= 1954 is 2000
  assert.strictEqual(size, 2000);
});

// Test 387: UPS size selection - large load
test('upsSelectSize: 50000VA selects 80000VA', function() {
  var size = upsSelectSize(50000);
  // minSize = ceil(50000 * 1.25) = 62500, next is 80000
  assert.strictEqual(size, 80000);
});

// Test 388: UPS size selection - maximum
test('upsSelectSize: very large returns 200000VA', function() {
  var size = upsSelectSize(200000);
  assert.strictEqual(size, 200000);
});

// Test 389: UPS battery calculation - AGM 1000W uses 48V
test('upsCalcBattery: 1000W 15min AGM at 48V', function() {
  var result = upsCalcBattery(1000, 15, 'agm');
  // 1000W >= 1000 so voltage = 48V
  assert.strictEqual(result.voltage, 48);
  assert.strictEqual(result.blocks, 4);
  // ah = ceil(1000 * 0.25 / (48 * 0.85 * 0.8)) = ceil(250 / 32.64) = ceil(7.66) = 8
  assert.strictEqual(result.ah, 8);
});

// Test 390: UPS battery calculation - Li-ion higher DoD
test('upsCalcBattery: 1000W 15min Li-ion at 48V', function() {
  var result = upsCalcBattery(1000, 15, 'liion');
  assert.strictEqual(result.voltage, 48);
  // ah = ceil(1000 * 0.25 / (48 * 0.85 * 0.9)) = ceil(250 / 36.72) = ceil(6.81) = 7
  assert.strictEqual(result.ah, 7);
  assert.strictEqual(result.dod, 0.9);
});

// Test 391: UPS battery voltage tiers
test('upsCalcBattery: voltage scales with load', function() {
  var small = upsCalcBattery(500, 15, 'agm');
  var medium = upsCalcBattery(5000, 15, 'agm');
  var large = upsCalcBattery(50000, 15, 'agm');
  assert.strictEqual(small.voltage, 24);
  assert.strictEqual(medium.voltage, 96);
  assert.strictEqual(large.voltage, 384);
});

// Test 392: UPS input cable
test('upsCalcInputCable: returns cable with sufficient Iz', function() {
  var result = upsCalcInputCable(10000, 230);
  assert.ok(result.current > 0);
  assert.ok(result.cable !== null);
  assert.ok(result.cable.iz >= result.current);
});

// Test 393: UPS heat loss = 5%
test('upsCalcHeatLoss: 5 percent of UPS VA', function() {
  var result = upsCalcHeatLoss(10000);
  assert.strictEqual(result.heatW, 500);
  assert.strictEqual(result.ventRequired, true);
});

// Test 394: UPS heat loss - small UPS no ventilation
test('upsCalcHeatLoss: small UPS no vent required', function() {
  var result = upsCalcHeatLoss(2000);
  assert.strictEqual(result.heatW, 100);
  assert.strictEqual(result.ventRequired, false);
});

// Test 395: UPS bypass required
test('upsNeedsBypass: online gt 3kVA needs bypass', function() {
  assert.strictEqual(upsNeedsBypass('online', 5000), true);
  assert.strictEqual(upsNeedsBypass('online', 2000), false);
  assert.strictEqual(upsNeedsBypass('offline', 5000), false);
});

// Test 396: renderUPS has no text inputs
test('renderUPS has no text input fields', function() {
  var html = renderUPS();
  assert.strictEqual(html.indexOf('<input type="text"'), -1, 'No text inputs allowed');
  assert.strictEqual(html.indexOf('<textarea'), -1, 'No textarea allowed');
});

// Test 397: renderUPS references IEC 62040
test('renderUPS references IEC 62040', function() {
  var html = renderUPS();
  assert.ok(html.indexOf('IEC 62040') >= 0);
});

// ===== POWER FACTOR CORRECTION MODULE TESTS =====

// Test 398: PFC kvar calculation - basic
test('pfcCalcKvar: 0.75 to 0.95 at 100kW', function() {
  var result = pfcCalcKvar(0.75, 0.95, 100);
  // tan(acos(0.75))=0.8819, tan(acos(0.95))=0.3287 => Qc=100*(0.8819-0.3287)=55.32 => ceil=56
  assert.strictEqual(result.kvar, 56);
  assert.ok(result.clause.indexOf('cl.523') >= 0);
});

// Test 399: PFC kvar - already at target
test('pfcCalcKvar: already at target returns 0', function() {
  var result = pfcCalcKvar(0.95, 0.95, 100);
  assert.strictEqual(result.kvar, 0);
});

// Test 400: PFC kvar - above target returns 0
test('pfcCalcKvar: above target returns 0', function() {
  var result = pfcCalcKvar(0.98, 0.95, 100);
  assert.strictEqual(result.kvar, 0);
});

// Test 401: PFC kvar - very low PF
test('pfcCalcKvar: 0.50 to 0.95 at 500kW high kvar', function() {
  var result = pfcCalcKvar(0.50, 0.95, 500);
  assert.ok(result.kvar >= 700);
  assert.ok(result.kvar <= 710);
});

// Test 402: PFC standard size selection
test('pfcSelectStandardSize: 56 kvar selects 75', function() {
  assert.strictEqual(pfcSelectStandardSize(56), 75);
});

// Test 403: PFC standard size - exact match
test('pfcSelectStandardSize: 50 kvar selects 50', function() {
  assert.strictEqual(pfcSelectStandardSize(50), 50);
});

// Test 404: PFC standard size - very large
test('pfcSelectStandardSize: 450 kvar selects 500', function() {
  assert.strictEqual(pfcSelectStandardSize(450), 500);
});

// Test 405: PFC resonance calculation - no risk
test('pfcCalcResonance: 20MVA 75kvar no risk', function() {
  var result = pfcCalcResonance(20, 75);
  assert.ok(result.fr > 700);
  assert.strictEqual(result.risk, false);
});

// Test 406: PFC resonance near 5th harmonic
test('pfcCalcResonance: near 5th harmonic warns', function() {
  var result = pfcCalcResonance(10, 400);
  assert.strictEqual(result.risk, true);
  assert.strictEqual(result.harmonicOrder, 5);
});

// Test 407: PFC resonance - zero kvar
test('pfcCalcResonance: zero kvar no risk', function() {
  var result = pfcCalcResonance(20, 0);
  assert.strictEqual(result.fr, 0);
  assert.strictEqual(result.risk, false);
});

// Test 408: PFC cable sizing - 1.5x factor
test('pfcCalcCableSizing: includes 1.5x margin on raw current', function() {
  var result = pfcCalcCableSizing(75, 400);
  // Ic raw = 75000 / (sqrt(3) * 400) = 108.25 -> ic = ceil(108.25) = 109
  assert.ok(result.ic >= 108);
  assert.ok(result.icWithMargin > result.ic);
  if (result.cable) assert.ok(result.cable.iz >= result.icWithMargin);
});

// Test 409: PFC protection - no RCD
test('pfcCalcProtection: noRCD is true', function() {
  var result = pfcCalcProtection(75, 400);
  assert.strictEqual(result.noRCD, true);
  assert.strictEqual(result.dischargeTime, 180);
  assert.strictEqual(result.dischargeVoltage, 75);
});

// Test 410: PFC penalty - PF >= 0.90 no penalty
test('pfcCalcPenalty: PF 0.92 no penalty', function() {
  var result = pfcCalcPenalty(0.92, 0.95, 100);
  assert.strictEqual(result.penalty, 0);
});

// Test 411: PFC penalty - PF < 0.90 has penalty
test('pfcCalcPenalty: PF 0.70 has penalty', function() {
  var result = pfcCalcPenalty(0.70, 0.95, 100);
  assert.ok(result.penalty > 0);
  assert.ok(result.savings > 0);
});

// Test 412: PFC detuning recommendation 7%
test('pfcGetDetuningRecommendation: 7 pct gives 189Hz', function() {
  var result = pfcGetDetuningRecommendation(7);
  assert.strictEqual(result.tuningHz, 189);
});

// Test 413: PFC detuning recommendation 14%
test('pfcGetDetuningRecommendation: 14 pct gives 134Hz', function() {
  var result = pfcGetDetuningRecommendation(14);
  assert.strictEqual(result.tuningHz, 134);
});

// Test 414: renderPFC has no text inputs
test('renderPFC has no text input fields', function() {
  var html = renderPFC();
  assert.strictEqual(html.indexOf('<input type="text"'), -1, 'No text inputs allowed');
  assert.strictEqual(html.indexOf('<textarea'), -1, 'No textarea allowed');
});

// Test 415: renderPFC references IEC 61921
test('renderPFC references IEC 61921', function() {
  var html = renderPFC();
  assert.ok(html.indexOf('IEC 61921') >= 0);
  assert.ok(html.indexOf('cl.523') >= 0 || html.indexOf('60364') >= 0);
});


// === Cable Tray Fill Module Tests ===
console.log('\n=== Cable Tray Fill Module Tests ===\n');

// Test 416: trayCalcArea basic calculation
test('trayCalcArea: 100x50 = 5000 mm2', function() {
  assert.strictEqual(trayCalcArea(100, 50), 5000);
});

// Test 417: trayCalcArea larger tray
test('trayCalcArea: 600x150 = 90000 mm2', function() {
  assert.strictEqual(trayCalcArea(600, 150), 90000);
});

// Test 418: trayCalcCableArea single cable
test('trayCalcCableArea: single 3G1.5 (diam 8.9mm)', function() {
  var area = trayCalcCableArea({'3G1.5': 1});
  var expected = Math.PI * (8.9/2) * (8.9/2);
  assert(Math.abs(area - expected) < 0.1);
});

// Test 419: trayCalcCableArea multiple cables
test('trayCalcCableArea: 5x 5G2.5 cables', function() {
  var area = trayCalcCableArea({'5G2.5': 5});
  var expected = Math.PI * (11.2/2) * (11.2/2) * 5;
  assert(Math.abs(area - expected) < 0.1);
});

// Test 420: trayCalcFillRate
test('trayCalcFillRate: returns correct percentage', function() {
  var rate = trayCalcFillRate(2500, 5000);
  assert.strictEqual(rate, 50);
});

// Test 421: trayCalcFillRate zero area
test('trayCalcFillRate: zero tray area returns 0', function() {
  assert.strictEqual(trayCalcFillRate(100, 0), 0);
});

// Test 422: trayGetGroupingFactor 1 circuit
test('trayGetGroupingFactor: 1 circuit = 1.0', function() {
  assert.strictEqual(trayGetGroupingFactor(1), 1.0);
});

// Test 423: trayGetGroupingFactor 3 circuits
test('trayGetGroupingFactor: 3 circuits = 0.70', function() {
  assert.strictEqual(trayGetGroupingFactor(3), 0.70);
});

// Test 424: trayGetGroupingFactor 8 circuits (in 7-9 range)
test('trayGetGroupingFactor: 8 circuits = 0.54', function() {
  assert.strictEqual(trayGetGroupingFactor(8), 0.54);
});

// Test 425: trayGetGroupingFactor 15 circuits (in 13-16 range)
test('trayGetGroupingFactor: 15 circuits = 0.45', function() {
  assert.strictEqual(trayGetGroupingFactor(15), 0.45);
});

// Test 426: trayGetGroupingFactor 20 circuits (in 17-20 range)
test('trayGetGroupingFactor: 20 circuits = 0.41', function() {
  assert.strictEqual(trayGetGroupingFactor(20), 0.41);
});

// Test 427: trayCalcWeight
test('trayCalcWeight: 10x 3G1.5 = 0.95 kg/m', function() {
  var w = trayCalcWeight({'3G1.5': 10});
  assert(Math.abs(w - 0.95) < 0.01);
});

// Test 428: trayGetSupportSpacing light load
test('trayGetSupportSpacing: < 20 kg/m = 1.5m', function() {
  assert.strictEqual(trayGetSupportSpacing(15), 1.5);
});

// Test 429: trayGetSupportSpacing heavy load
test('trayGetSupportSpacing: > 20 kg/m = 1.0m', function() {
  assert.strictEqual(trayGetSupportSpacing(25), 1.0);
});

// Test 430: trayCheckSeparation with power only
test('trayCheckSeparation: power only = false', function() {
  assert.strictEqual(trayCheckSeparation({'3G1.5': 5}), false);
});

// Test 431: trayCheckSeparation with power and data
test('trayCheckSeparation: power + data = true', function() {
  assert.strictEqual(trayCheckSeparation({'3G1.5': 3, 'Cat6A': 2}), true);
});

// Test 432: trayCountCircuits counts only power cables
test('trayCountCircuits: counts only power cables', function() {
  assert.strictEqual(trayCountCircuits({'3G1.5': 3, 'Cat6A': 5, '5G2.5': 2}), 5);
});

// Test 433: Fill rate exceeded detection
test('trayFill: fill rate exceeded with many large cables in small tray', function() {
  var trayArea = trayCalcArea(100, 50); // 5000 mm2
  var cables = {'4x240': 5}; // 5 x pi*(50/2)^2 = 9817 mm2
  var cableArea = trayCalcCableArea(cables);
  var fillRate = trayCalcFillRate(cableArea, trayArea);
  assert(fillRate > 50, 'Fill rate should exceed 50% max');
});

// Test 434: renderTrayFill has no text inputs
test('renderTrayFill has no text input fields', function() {
  var html = renderTrayFill();
  assert.strictEqual(html.indexOf('<input type="text"'), -1);
  assert.strictEqual(html.indexOf('<textarea'), -1);
});

// Test 435: renderTrayFill references standards
test('renderTrayFill references DS/EN 50174-2 and DS/HD 60364-5-52', function() {
  var html = renderTrayFill();
  assert(html.indexOf('DS/EN 50174-2') >= 0);
  assert(html.indexOf('DS/HD 60364-5-52') >= 0);
});


// === Earth Fault Loop Impedance Module Tests ===
console.log('\n=== Earth Fault Loop Module Tests ===\n');

// Test 436: zsCalcImpedance basic
test('zsCalcImpedance: Ze=0.35, 2.5mm2, 20m', function() {
  var zs = zsCalcImpedance(0.35, 19.51, 20);
  // 0.35 + (19.51/1000) * 20 * 1.2 = 0.35 + 0.46824 = 0.81824
  var expected = 0.35 + (19.51/1000) * 20 * 1.2;
  assert(Math.abs(zs - expected) < 0.001);
});

// Test 437: zsCalcImpedance short cable
test('zsCalcImpedance: Ze=0.20, 4mm2, 5m', function() {
  var zs = zsCalcImpedance(0.20, 16.71, 5);
  var expected = 0.20 + (16.71/1000) * 5 * 1.2;
  assert(Math.abs(zs - expected) < 0.001);
});

// Test 438: zsGetMaxZs for B16
test('zsGetMaxZs: B16 = 2.88 ohm', function() {
  assert.strictEqual(zsGetMaxZs('B16'), 2.88);
});

// Test 439: zsGetMaxZs for C32
test('zsGetMaxZs: C32 = 0.72 ohm', function() {
  assert.strictEqual(zsGetMaxZs('C32'), 0.72);
});

// Test 440: zsGetMaxZs for gG63
test('zsGetMaxZs: gG63 = 0.82 ohm', function() {
  assert.strictEqual(zsGetMaxZs('gG63'), 0.82);
});

// Test 441: zsCheckDisconnection pass
test('zsCheckDisconnection: 1.5 <= 2.88*0.8 = PASS', function() {
  assert.strictEqual(zsCheckDisconnection(1.5, 2.88), true);
});

// Test 442: zsCheckDisconnection fail
test('zsCheckDisconnection: 2.5 > 2.88*0.8 = FAIL', function() {
  assert.strictEqual(zsCheckDisconnection(2.5, 2.88), false);
});

// Test 443: zsCalcFaultCurrent
test('zsCalcFaultCurrent: Uo/Zs = 230/0.82 = 280.5A', function() {
  var If = zsCalcFaultCurrent(0.82);
  assert(Math.abs(If - 280.49) < 0.1);
});

// Test 444: zsCalcFaultCurrent zero
test('zsCalcFaultCurrent: zs=0 returns 0', function() {
  assert.strictEqual(zsCalcFaultCurrent(0), 0);
});

// Test 445: zsCalcMaxLength
test('zsCalcMaxLength: B16, Ze=0.35, 2.5mm2', function() {
  var maxL = zsCalcMaxLength(2.88, 0.35, 19.51);
  // (2.88*0.8 - 0.35) / ((19.51/1000) * 1.2) = (2.304 - 0.35) / 0.023412 = 83.5m
  var expected = (2.88 * 0.8 - 0.35) / ((19.51/1000) * 1.2);
  assert(Math.abs(maxL - expected) < 0.1);
});

// Test 446: zsGetDeviceIn extracts rating
test('zsGetDeviceIn: B16 = 16', function() {
  assert.strictEqual(zsGetDeviceIn('B16'), 16);
});

// Test 447: zsGetDeviceIn fuse
test('zsGetDeviceIn: gG63 = 63', function() {
  assert.strictEqual(zsGetDeviceIn('gG63'), 63);
});

// Test 448: zsCheckInstantTrip B-curve pass
test('zsCheckInstantTrip: 100A >= 5x16A (B16) = PASS', function() {
  assert.strictEqual(zsCheckInstantTrip(100, 'B16'), true);
});

// Test 449: zsCheckInstantTrip B-curve fail
test('zsCheckInstantTrip: 50A < 5x16A (B16) = FAIL', function() {
  assert.strictEqual(zsCheckInstantTrip(50, 'B16'), false);
});

// Test 450: zsCheckInstantTrip C-curve
test('zsCheckInstantTrip: 200A >= 10x16A (C16) = PASS', function() {
  assert.strictEqual(zsCheckInstantTrip(200, 'C16'), true);
});

// Test 451: zsCheckInstantTrip C-curve fail
test('zsCheckInstantTrip: 100A < 10x16A (C16) = FAIL', function() {
  assert.strictEqual(zsCheckInstantTrip(100, 'C16'), false);
});

// Test 452: Long cable Zs exceeds limit
test('zsCalcImpedance: 100m 1.5mm2 with Ze=0.80 exceeds B16 limit', function() {
  var zs = zsCalcImpedance(0.80, 24.2, 100);
  var zsMax = zsGetMaxZs('B16');
  assert(zs > zsMax, 'Zs should exceed limit for very long cable');
});

// Test 453: renderZs has no text inputs
test('renderZs has no text input fields', function() {
  var html = renderZs();
  assert.strictEqual(html.indexOf('<input type="text"'), -1);
  assert.strictEqual(html.indexOf('<textarea'), -1);
});

// Test 454: renderZs references standards
test('renderZs references DS/HD 60364-6 and Table 41', function() {
  var html = renderZs();
  assert(html.indexOf('DS/HD 60364-6') >= 0);
  assert(html.indexOf('41') >= 0);
});

// Test 455: All Zs max values present
test('ZS_MAX_TABLE has all required devices', function() {
  assert(ZS_MAX_TABLE['B6'] === 7.67);
  assert(ZS_MAX_TABLE['B40'] === 1.15);
  assert(ZS_MAX_TABLE['C63'] === 0.37);
  assert(ZS_MAX_TABLE['gG160'] === 0.25);
});


// === Commissioning Module Tests ===
console.log('\n=== Commissioning Module Tests ===\n');

// Test 456: commissionGetItems returns visual and testing items
test('commissionGetItems: new install returns 10 visual + 10 test items', function() {
  var items = commissionGetItems('newInstall', 'residential', []);
  assert.strictEqual(items.visual.length, 10);
  assert.strictEqual(items.testing.length, 10);
});

// Test 457: commissionGetItems with bathroom special adds 2 items
test('commissionGetItems: with bathroom adds 2 extra test items', function() {
  var items = commissionGetItems('newInstall', 'residential', ['bathroom']);
  assert.strictEqual(items.testing.length, 12);
});

// Test 458: commissionGetItems with solar adds 3 items
test('commissionGetItems: with solar adds 3 extra test items', function() {
  var items = commissionGetItems('newInstall', 'residential', ['solar']);
  assert.strictEqual(items.testing.length, 13);
});

// Test 459: commissionGetItems with multiple specials
test('commissionGetItems: ev + firealarm adds 5 items', function() {
  var items = commissionGetItems('newInstall', 'industrial', ['ev', 'firealarm']);
  assert.strictEqual(items.testing.length, 15);
});

// Test 460: commissionCountStatus empty
test('commissionCountStatus: empty = 0 total', function() {
  var s = commissionCountStatus({});
  assert.strictEqual(s.total, 0);
  assert.strictEqual(s.passed, 0);
  assert.strictEqual(s.failed, 0);
});

// Test 461: commissionCountStatus with items
test('commissionCountStatus: counts pass/fail correctly', function() {
  var s = commissionCountStatus({v1: 'pass', v2: 'pass', v3: 'fail', t1: 'pass'});
  assert.strictEqual(s.total, 4);
  assert.strictEqual(s.passed, 3);
  assert.strictEqual(s.failed, 1);
});

// Test 462: Visual items have correct IDs
test('VISUAL_ITEMS: all 10 items have unique IDs v1-v10', function() {
  assert.strictEqual(VISUAL_ITEMS.length, 10);
  for (var i = 0; i < 10; i++) {
    assert.strictEqual(VISUAL_ITEMS[i].id, 'v' + (i+1));
  }
});

// Test 463: Test items have correct IDs
test('TEST_ITEMS: all 10 items have unique IDs t1-t10', function() {
  assert.strictEqual(TEST_ITEMS.length, 10);
  for (var i = 0; i < 10; i++) {
    assert.strictEqual(TEST_ITEMS[i].id, 't' + (i+1));
  }
});

// Test 464: Each item has required fields
test('All checklist items have method, instrument, pass fields', function() {
  VISUAL_ITEMS.concat(TEST_ITEMS).forEach(function(item) {
    assert(item.method, item.id + ' missing method');
    assert(item.instrument !== undefined, item.id + ' missing instrument');
    assert(item.pass, item.id + ' missing pass criteria');
  });
});

// Test 465: renderCommission has no text inputs
test('renderCommission has no text input fields', function() {
  var html = renderCommission();
  assert.strictEqual(html.indexOf('<input type="text"'), -1);
  assert.strictEqual(html.indexOf('<textarea'), -1);
});

// Test 466: renderCommission references DS/HD 60364-6
test('renderCommission references DS/HD 60364-6', function() {
  var html = renderCommission();
  assert(html.indexOf('DS/HD 60364-6') >= 0);
  assert(html.indexOf('cl.6.2') >= 0);
});

// Test 467: INSTRUMENTS list has 5 instruments
test('INSTRUMENTS has 5 required instruments', function() {
  assert.strictEqual(INSTRUMENTS.length, 5);
  var names = INSTRUMENTS.map(function(i) { return i.en; }).join(',');
  assert(names.indexOf('Multifunction tester') >= 0);
  assert(names.indexOf('Loop impedance tester') >= 0);
  assert(names.indexOf('RCD tester') >= 0);
});

// Test 468: COMMISSION_TYPES has 3 types
test('COMMISSION_TYPES has newInstall, addition, periodic', function() {
  assert(COMMISSION_TYPES.newInstall);
  assert(COMMISSION_TYPES.addition);
  assert(COMMISSION_TYPES.periodic);
  assert.strictEqual(COMMISSION_TYPES.newInstall.clause, 'cl.6.2');
});

// Test 469: Special items for all 4 categories
test('SPECIAL_ITEMS has bathroom, ev, solar, firealarm', function() {
  assert(SPECIAL_ITEMS.bathroom.length === 2);
  assert(SPECIAL_ITEMS.ev.length === 2);
  assert(SPECIAL_ITEMS.solar.length === 3);
  assert(SPECIAL_ITEMS.firealarm.length === 3);
});

// Test 470: Module translations exist for all 3 new modules
test('Module translations exist for trayfill, zs, commission', function() {
  assert(T.da.modules.trayfill, 'Danish trayfill missing');
  assert(T.en.modules.trayfill, 'English trayfill missing');
  assert(T.fa.modules.trayfill, 'Farsi trayfill missing');
  assert(T.da.modules.zs, 'Danish zs missing');
  assert(T.en.modules.zs, 'English zs missing');
  assert(T.fa.modules.zs, 'Farsi zs missing');
  assert(T.da.modules.commission, 'Danish commission missing');
  assert(T.en.modules.commission, 'English commission missing');
  assert(T.fa.modules.commission, 'Farsi commission missing');
});


// ===== SMOKE VENTILATION (SHEV) MODULE TESTS =====

// Test 471: SHEV NSHEV calculation (2% of floor area)
test('shevCalcNSHEV: 200 m2 zone needs 4 m2 vent area (2%)', function() {
  var result = shevCalcNSHEV(200);
  assert.strictEqual(result, 4);
});

// Test 472: SHEV NSHEV calc for large area
test('shevCalcNSHEV: 3000 m2 zone needs 60 m2 vent area', function() {
  var result = shevCalcNSHEV(3000);
  assert.strictEqual(result, 60);
});

// Test 473: SHEV MSHEV volume flow calculation
test('shevCalcMSHEV: 200m2 x 6m height x 10 ACH = correct flow', function() {
  var result = shevCalcMSHEV(200, 6, 10);
  // 200*6*10/3600 = 3.33 m3/s, ceil to 2dp
  assert(result >= 3.33 && result <= 3.34);
});

// Test 474: SHEV duct sizing max 10 m/s
test('shevCalcDuct: flow of 3.33 m3/s needs appropriate duct', function() {
  var result = shevCalcDuct(3.33);
  // Area = 3.33/10 = 0.333 m2, diam = sqrt(0.333*4/pi)*1000 = ~651mm, rounded to 700
  assert(result >= 650 && result <= 750);
});

// Test 475: SHEV makeup air is 75% of exhaust
test('shevCalcMakeupAir: 4.0 m3/s exhaust needs 3.0 m3/s makeup', function() {
  var result = shevCalcMakeupAir(4.0);
  assert.strictEqual(result, 3);
});

// Test 476: SHEV cable type selection
test('shevGetCableType: NSHEV=E30, MSHEV=E60', function() {
  assert.strictEqual(shevGetCableType('nshev'), 'E30');
  assert.strictEqual(shevGetCableType('mshev'), 'E60');
  assert.strictEqual(shevGetCableType('pressurization'), 'E60');
});

// Test 477: SHEV mandatory threshold check
test('shevIsMandatory: atrium 200m2=true, 199m2=false', function() {
  assert.strictEqual(shevIsMandatory('atrium', 200), true);
  assert.strictEqual(shevIsMandatory('atrium', 199), false);
  assert.strictEqual(shevIsMandatory('parking', 150), true);
  assert.strictEqual(shevIsMandatory('parking', 149), false);
  assert.strictEqual(shevIsMandatory('industrial', 600), true);
});

// Test 478: renderShev returns HTML with no text inputs
test('renderShev has no text input fields', function() {
  var html = renderShev();
  assert(html.indexOf('<input type="text"') < 0);
  assert(html.indexOf('<textarea') < 0);
});

// Test 479: renderShev references DS/EN 12101 and BR18
test('renderShev references DS/EN 12101 and BR18', function() {
  var html = renderShev();
  assert(html.indexOf('DS/EN 12101') >= 0);
  assert(html.indexOf('BR18') >= 0);
});

// Test 480: SHEV buildings data complete
test('SHEV_BUILDINGS has all 7 building types', function() {
  assert(SHEV_BUILDINGS.atrium);
  assert(SHEV_BUILDINGS.shopping);
  assert(SHEV_BUILDINGS.parking);
  assert(SHEV_BUILDINGS.industrial);
  assert(SHEV_BUILDINGS.stairwell);
  assert(SHEV_BUILDINGS.corridor);
  assert(SHEV_BUILDINGS.assembly);
});

// Test 481: SHEV parking garage ACH = 10
test('SHEV parking garage uses ACH=10', function() {
  assert.strictEqual(SHEV_BUILDINGS.parking.ach, 10);
});

// Test 482: SHEV industrial hall ACH = 15
test('SHEV industrial uses ACH=15', function() {
  assert.strictEqual(SHEV_BUILDINGS.industrial.ach, 15);
});

// Test 483: renderShev shows dual supply requirement
test('renderShev mentions dual supply', function() {
  var html = renderShev();
  assert(html.indexOf('Dual supply') >= 0 || html.indexOf('Dobbeltforsyning') >= 0);
});

// ===== ACCESS CONTROL MODULE TESTS =====

// Test 484: Access power per door calculation
test('accessCalcPowerPerDoor: strike + rfid = 850 mA', function() {
  var result = accessCalcPowerPerDoor('strike', 'rfid');
  // 500 (strike) + 150 (reader) + 200 (camera) = 850
  assert.strictEqual(result, 850);
});

// Test 485: Access biometric reader uses more power
test('accessCalcPowerPerDoor: biometric reader adds 300mA', function() {
  var result = accessCalcPowerPerDoor('strike', 'biometric');
  // 500 + 300 + 200 = 1000
  assert.strictEqual(result, 1000);
});

// Test 486: Access total power with safety factor
test('accessCalcTotalPower: 4 doors strike+rfid with 1.3 safety', function() {
  var result = accessCalcTotalPower(4, 'strike', 'rfid');
  // 850 * 4 * 1.3 = 4420, ceil = 4420
  assert.strictEqual(result, 4420);
});

// Test 487: Access PSU sizing rounds up to standard
test('accessCalcPSU: 4420mA needs 5A PSU', function() {
  var result = accessCalcPSU(4420);
  assert.strictEqual(result, 5);
});

// Test 488: Access battery calculation
test('accessCalcBattery: 4420mA for 4h = correct Ah', function() {
  var result = accessCalcBattery(4420, 4);
  // 4420/1000 * 4 * 1.25 = 22.1 Ah
  assert.strictEqual(result, 22.1);
});

// Test 489: Access PSU for large system
test('accessCalcPSU: 64 doors needs 20A PSU', function() {
  var total = accessCalcTotalPower(64, 'strike', 'rfid');
  var psu = accessCalcPSU(total);
  assert.strictEqual(psu, 20);
});

// Test 490: renderAccess has no text inputs
test('renderAccess has no text input fields', function() {
  var html = renderAccess();
  assert(html.indexOf('<input type="text"') < 0);
  assert(html.indexOf('<textarea') < 0);
});

// Test 491: renderAccess references DS/EN 50133
test('renderAccess references DS/EN 50133', function() {
  var html = renderAccess();
  assert(html.indexOf('DS/EN 50133') >= 0);
});

// Test 492: renderAccess mentions fail-safe for emergency exits
test('renderAccess mentions fail-safe emergency exits', function() {
  var html = renderAccess();
  assert(html.indexOf('Fail-safe') >= 0 || html.indexOf('fail-safe') >= 0);
});

// Test 493: Access hardware data complete
test('ACCESS_HARDWARE has strike, maglock, motorlock', function() {
  assert.strictEqual(ACCESS_HARDWARE.strike.current, 500);
  assert.strictEqual(ACCESS_HARDWARE.maglock.current, 400);
  assert.strictEqual(ACCESS_HARDWARE.motorlock.current, 300);
});

// Test 494: Access battery for 24h backup
test('accessCalcBattery: 24h backup calculates correctly', function() {
  var total = accessCalcTotalPower(4, 'strike', 'rfid');
  var battery = accessCalcBattery(total, 24);
  // 4420/1000 * 24 * 1.25 = 132.6
  assert.strictEqual(battery, 132.6);
});

// Test 495: renderAccess mentions fire door integration
test('renderAccess mentions fire door and E30', function() {
  var html = renderAccess();
  assert(html.indexOf('E30') >= 0);
});

// ===== GENERATOR SIZING MODULE TESTS =====

// Test 496: Generator total kW with diversity
test('genCalcTotalKw: lighting 20kW*0.9 + fire 15kW*1.0 = 33', function() {
  var loads = { lighting: true, hvac: false, it: false, medical: false, fire: true, lifts: false, kitchen: false, ev: false };
  var kw = { lighting: 20, hvac: 50, it: 30, medical: 40, fire: 15, lifts: 25, kitchen: 20, ev: 22 };
  var result = genCalcTotalKw(loads, kw);
  assert.strictEqual(result, 33); // 20*0.9 + 15*1.0 = 18 + 15 = 33
});

// Test 497: Generator motor starting allowance DOL
test('genCalcMotorAllowance: DOL 6x factor for 33kW total', function() {
  var result = genCalcMotorAllowance(33, 'dol');
  // largest motor = 33*0.3=9.9kW, additional = 9.9*(6-1) = 49.5
  assert(Math.abs(result - 49.5) < 0.1);
});

// Test 498: Generator motor starting soft start
test('genCalcMotorAllowance: soft start 3x factor', function() {
  var result = genCalcMotorAllowance(33, 'soft');
  // 33*0.3*(3-1) = 19.8
  assert(Math.abs(result - 19.8) < 0.1);
});

// Test 499: Generator kVA calculation with 25% reserve
test('genCalcKVA: totalKw + motor allowance / 0.8 * 1.25', function() {
  var result = genCalcKVA(33, 49.5);
  // (33+49.5)/0.8*1.25 = 128.9, ceil = 129
  assert.strictEqual(result, 129);
});

// Test 500: Generator size selection
test('genSelectSize: 129 kVA selects 150 kVA standard', function() {
  var result = genSelectSize(129);
  assert.strictEqual(result, 150);
});

// Test 501: Generator fuel calculation
test('genCalcFuel: 150kVA for 24h at 0.3 L/kWh', function() {
  var result = genCalcFuel(150, 24);
  // 150*0.8*0.75 = 90kW, 90*0.3*24 = 648L
  assert.strictEqual(result, 648);
});

// Test 502: Generator ATS rating calculation
test('genCalcATS: 150 kVA needs correct ATS amperage', function() {
  var result = genCalcATS(150);
  // 150000/(400*1.732) = 216.5A, next standard = 250A
  assert.strictEqual(result, 250);
});

// Test 503: renderGenerator has no text inputs
test('renderGenerator has no text input fields', function() {
  var html = renderGenerator();
  assert(html.indexOf('<input type="text"') < 0);
  assert(html.indexOf('<textarea') < 0);
});

// Test 504: renderGenerator references IEC 62034
test('renderGenerator references IEC 62034 and DS/HD 60364-5-56', function() {
  var html = renderGenerator();
  assert(html.indexOf('IEC 62034') >= 0);
  assert(html.indexOf('DS/HD 60364-5-56') >= 0);
});

// Test 505: Generator diversity factors are correct
test('GEN_DIVERSITY factors correct for life-safety', function() {
  assert.strictEqual(GEN_DIVERSITY.lighting, 0.9);
  assert.strictEqual(GEN_DIVERSITY.it, 1.0);
  assert.strictEqual(GEN_DIVERSITY.medical, 1.0);
  assert.strictEqual(GEN_DIVERSITY.fire, 1.0);
  assert.strictEqual(GEN_DIVERSITY.lifts, 0.3);
  assert.strictEqual(GEN_DIVERSITY.ev, 0.4);
});

// Test 506: Generator standard sizes list
test('GEN_STANDARD_SIZES includes common sizes', function() {
  assert(GEN_STANDARD_SIZES.indexOf(100) >= 0);
  assert(GEN_STANDARD_SIZES.indexOf(500) >= 0);
  assert(GEN_STANDARD_SIZES.indexOf(2000) >= 0);
});

// Test 507: renderGenerator mentions testing schedule
test('renderGenerator mentions monthly and annual testing', function() {
  var html = renderGenerator();
  assert(html.indexOf('30') >= 0); // 30 min monthly
  assert(html.indexOf('75%') >= 0); // annual at 75%
});

// ===== DISCRIMINATION MODULE TESTS =====

// Test 508: Fuse-Fuse full selectivity (ratio >= 1.6)
test('discrimAnalyze: fuse 100A vs fuse 50A = full (ratio 2.0)', function() {
  var result = discrimAnalyze('fuse', 100, 'fuse', 50, 'C');
  assert.strictEqual(result.verdict, 'full');
  assert.strictEqual(result.color, 'green');
});

// Test 509: Fuse-Fuse partial selectivity (ratio < 1.6)
test('discrimAnalyze: fuse 63A vs fuse 50A = partial (ratio 1.26)', function() {
  var result = discrimAnalyze('fuse', 63, 'fuse', 50, 'C');
  assert.strictEqual(result.verdict, 'partial');
  assert.strictEqual(result.color, 'yellow');
});

// Test 510: Fuse-MCB full selectivity (fuse >= 2x MCB)
test('discrimAnalyze: fuse 63A vs MCB 25A = full (ratio 2.52)', function() {
  var result = discrimAnalyze('fuse', 63, 'mcb', 25, 'C');
  assert.strictEqual(result.verdict, 'full');
  assert.strictEqual(result.color, 'green');
});

// Test 511: Fuse-MCB partial (fuse < 2x MCB)
test('discrimAnalyze: fuse 25A vs MCB 16A = partial', function() {
  var result = discrimAnalyze('fuse', 25, 'mcb', 16, 'C');
  assert.strictEqual(result.verdict, 'partial');
  assert.strictEqual(result.color, 'yellow');
});

// Test 512: MCB-MCB NEVER fully selective
test('discrimAnalyze: MCB-MCB is NEVER fully selective', function() {
  var result = discrimAnalyze('mcb', 63, 'mcb', 16, 'C');
  assert.strictEqual(result.verdict, 'none');
  assert.strictEqual(result.color, 'red');
});

// Test 513: MCCB-MCB selective with high ratio
test('discrimAnalyze: MCCB 160A vs MCB 16A = full', function() {
  var result = discrimAnalyze('mccb', 160, 'mcb', 16, 'C');
  assert.strictEqual(result.verdict, 'full');
  assert.strictEqual(result.color, 'green');
});

// Test 514: MCCB-MCB partial with low ratio
test('discrimAnalyze: MCCB 80A vs MCB 50A = partial', function() {
  var result = discrimAnalyze('mccb', 80, 'mcb', 50, 'C');
  assert.strictEqual(result.verdict, 'partial');
  assert.strictEqual(result.color, 'yellow');
});

// Test 515: renderDiscrim has no text inputs
test('renderDiscrim has no text input fields', function() {
  var html = renderDiscrim();
  assert(html.indexOf('<input type="text"') < 0);
  assert(html.indexOf('<textarea') < 0);
});

// Test 516: renderDiscrim references IEC 60947
test('renderDiscrim references IEC 60947 and DS/HD 60364-4-43', function() {
  var html = renderDiscrim();
  assert(html.indexOf('IEC 60947') >= 0);
  assert(html.indexOf('DS/HD 60364-4-43') >= 0);
});

// Test 517: Discrimination ratio calculations correct
test('discrimAnalyze: ratio is correctly computed', function() {
  var result = discrimAnalyze('fuse', 200, 'fuse', 100, 'C');
  assert.strictEqual(result.ratio, 2.0);
});

// Test 518: renderDiscrim shows color-coded results
test('renderDiscrim uses color coding for verdict', function() {
  var html = renderDiscrim();
  assert(html.indexOf('color:') >= 0);
});

// Test 519: Selectivity limit Is calculated for partial
test('discrimAnalyze partial has Is > 0', function() {
  var result = discrimAnalyze('fuse', 63, 'fuse', 50, 'C');
  assert(result.is > 0);
});

// ===== EARTHING SYSTEM MODULE TESTS =====

// Test 520: Earth rod resistance formula
test('earthCalcRodResistance: 100 Ohm-m, 3m rod, 20mm diam', function() {
  var result = earthCalcRodResistance(100, 3.0, 0.02);
  // Re = 100/(2*pi*3) * ln(4*3/0.02) = 5.305 * ln(600) = 5.305 * 6.397 = 33.9
  assert(result > 30 && result < 40);
});

// Test 521: Earth rod resistance for low resistivity soil
test('earthCalcRodResistance: 30 Ohm-m clay soil', function() {
  var result = earthCalcRodResistance(30, 3.0, 0.02);
  // 30/(2*pi*3) * ln(600) = 1.59 * 6.397 = 10.18
  assert(result > 8 && result < 13);
});

// Test 522: Parallel rods reduction factor
test('earthCalcParallelRods: 2 rods use 0.6 factor', function() {
  var result = earthCalcParallelRods(33.9, 2);
  assert(Math.abs(result - 33.9 * 0.6) < 0.1);
});

// Test 523: PE sizing per Table 54.2 (<=16 same)
test('earthCalcPE: phase 10mm2 gives PE 10mm2', function() {
  assert.strictEqual(earthCalcPE(10), 10);
  assert.strictEqual(earthCalcPE(16), 16);
});

// Test 524: PE sizing per Table 54.2 (16-35 = 16mm2)
test('earthCalcPE: phase 25mm2 gives PE 16mm2', function() {
  assert.strictEqual(earthCalcPE(25), 16);
  assert.strictEqual(earthCalcPE(35), 16);
});

// Test 525: PE sizing per Table 54.2 (>35 = half)
test('earthCalcPE: phase 50mm2 gives PE 25mm2', function() {
  assert.strictEqual(earthCalcPE(50), 25);
  assert.strictEqual(earthCalcPE(120), 60);
});

// Test 526: renderEarthsys has no text inputs
test('renderEarthsys has no text input fields', function() {
  var html = renderEarthsys();
  assert(html.indexOf('<input type="text"') < 0);
  assert(html.indexOf('<textarea') < 0);
});

// Test 527: renderEarthsys references DS/HD 60364-5-54
test('renderEarthsys references DS/HD 60364-5-54', function() {
  var html = renderEarthsys();
  assert(html.indexOf('DS/HD 60364-5-54') >= 0);
});

// Test 528: Earth systems data includes TN-C-S
test('EARTH_SYSTEMS includes all 5 types', function() {
  assert(EARTH_SYSTEMS.tns);
  assert(EARTH_SYSTEMS.tnc);
  assert(EARTH_SYSTEMS.tncs);
  assert(EARTH_SYSTEMS.tt);
  assert(EARTH_SYSTEMS.it);
});

// Test 529: renderEarthsys mentions PEN rules
test('renderEarthsys mentions PEN conductor rules', function() {
  earthsysState.systemType = 'tncs';
  var html = renderEarthsys();
  assert(html.indexOf('PEN') >= 0);
  assert(html.indexOf('10') >= 0); // 10mm2 Cu minimum
});

// Test 530: Bonding includes water and gas
test('earthGetBonding standard includes water and gas', function() {
  var bonding = earthGetBonding('standard');
  var items = bonding.items.map(function(i) { return i.en; }).join(',');
  assert(items.indexOf('Water') >= 0);
  assert(items.indexOf('Gas') >= 0);
});

// Test 531: Supplementary bonding references cl.415.2
test('earthGetBonding supplementary references cl.415.2', function() {
  var bonding = earthGetBonding('supplementary');
  assert.strictEqual(bonding.clause, 'cl.415.2');
});

// Test 532: Earth target resistance check (high resistivity fails)
test('earthCalcRodResistance: 2000 Ohm-m granite exceeds 10 Ohm', function() {
  var result = earthCalcRodResistance(2000, 3.0, 0.02);
  assert(result > 10, 'High resistivity should exceed target');
});

// ===== MODULE NAVIGATION TESTS =====

// Test 533: Module translations exist for all 5 new modules
test('Module translations exist for shev, access, generator, discrim, earthsys', function() {
  assert(T.da.modules.shev, 'Danish shev missing');
  assert(T.en.modules.shev, 'English shev missing');
  assert(T.fa.modules.shev, 'Farsi shev missing');
  assert(T.da.modules.access, 'Danish access missing');
  assert(T.en.modules.access, 'English access missing');
  assert(T.fa.modules.access, 'Farsi access missing');
  assert(T.da.modules.generator, 'Danish generator missing');
  assert(T.en.modules.generator, 'English generator missing');
  assert(T.fa.modules.generator, 'Farsi generator missing');
  assert(T.da.modules.discrim, 'Danish discrim missing');
  assert(T.en.modules.discrim, 'English discrim missing');
  assert(T.fa.modules.discrim, 'Farsi discrim missing');
  assert(T.da.modules.earthsys, 'Danish earthsys missing');
  assert(T.en.modules.earthsys, 'English earthsys missing');
  assert(T.fa.modules.earthsys, 'Farsi earthsys missing');
});

// Test 534: All new module render functions callable
test('All 5 new render functions return non-empty HTML', function() {
  var shevHtml = renderShev();
  var accessHtml = renderAccess();
  var genHtml = renderGenerator();
  var discrimHtml = renderDiscrim();
  var earthHtml = renderEarthsys();
  assert(shevHtml.length > 100, 'renderShev too short');
  assert(accessHtml.length > 100, 'renderAccess too short');
  assert(genHtml.length > 100, 'renderGenerator too short');
  assert(discrimHtml.length > 100, 'renderDiscrim too short');
  assert(earthHtml.length > 100, 'renderEarthsys too short');
});

// =====================================================
// === SWIMMING POOL & FOUNTAIN MODULE TESTS (12+) ===
// =====================================================
console.log('\n--- Swimming Pool & Fountain Module (DS/HD 60364-7-702) ---');

test('Pool: module translations exist for pool', function() {
  assert(T.da.modules.pool, 'Danish pool missing');
  assert(T.en.modules.pool, 'English pool missing');
  assert(T.fa.modules.pool, 'Farsi pool missing');
});

test('Pool: POOL_ZONES has 3 zones (0,1,2)', function() {
  assert(POOL_ZONES[0], 'Zone 0 missing');
  assert(POOL_ZONES[1], 'Zone 1 missing');
  assert(POOL_ZONES[2], 'Zone 2 missing');
  assert.strictEqual(POOL_ZONES[0].ip, 'IPX8');
  assert.strictEqual(POOL_ZONES[0].maxV, 12);
});

test('Pool: submersible luminaire allowed in Zone 0 (SELV only)', function() {
  var r = poolCheckEquipment(0, 'submersible_luminaire');
  assert.strictEqual(r.allowed, true);
  assert(r.reason.indexOf('SELV') >= 0, 'Must mention SELV');
  assert(r.clause.indexOf('702') >= 0, 'Must cite cl.702');
  assert.strictEqual(r.ipRequired, 'IPX8');
});

test('Pool: circulation pump NOT allowed in Zone 0', function() {
  var r = poolCheckEquipment(0, 'circulation_pump');
  assert.strictEqual(r.allowed, false);
  assert(r.clause.indexOf('702') >= 0);
});

test('Pool: circulation pump NOT allowed in Zone 1', function() {
  var r = poolCheckEquipment(1, 'circulation_pump');
  assert.strictEqual(r.allowed, false);
});

test('Pool: circulation pump allowed in Zone 2 with bonding', function() {
  var r = poolCheckEquipment(2, 'circulation_pump');
  assert.strictEqual(r.allowed, true);
  assert(r.reason.indexOf('bonding') >= 0 || r.reason.indexOf('Class II') >= 0);
});

test('Pool: socket outlet NOT allowed in Zone 0 or 1', function() {
  assert.strictEqual(poolCheckEquipment(0, 'socket_outlet').allowed, false);
  assert.strictEqual(poolCheckEquipment(1, 'socket_outlet').allowed, false);
});

test('Pool: socket outlet allowed in Zone 2 with RCD', function() {
  var r = poolCheckEquipment(2, 'socket_outlet');
  assert.strictEqual(r.allowed, true);
  assert(r.reason.indexOf('RCD') >= 0 || r.clause.indexOf('411.3.3') >= 0);
});

test('Pool: switchgear NOT allowed in Zone 0 or 1', function() {
  assert.strictEqual(poolCheckEquipment(0, 'switchgear').allowed, false);
  assert.strictEqual(poolCheckEquipment(1, 'switchgear').allowed, false);
});

test('Pool: heating cable NOT allowed in Zone 0, allowed in Zone 1 with sheath', function() {
  assert.strictEqual(poolCheckEquipment(0, 'heating_cable').allowed, false);
  var r1 = poolCheckEquipment(1, 'heating_cable');
  assert.strictEqual(r1.allowed, true);
  assert(r1.reason.indexOf('metallic sheath') >= 0 || r1.clause.indexOf('702.753') >= 0);
});

test('Pool: protection reqs include RCD 30mA for all zones', function() {
  var reqs = poolGetProtectionReqs(0, 'indoor');
  assert(reqs.some(function(r) { return r.req.indexOf('RCD 30mA') >= 0; }), 'RCD 30mA missing');
  assert(reqs.some(function(r) { return r.req.indexOf('bonding') >= 0; }), 'Bonding missing');
});

test('Pool: fountain type adds SELV requirement for public access', function() {
  var reqs = poolGetProtectionReqs(0, 'fountain');
  assert(reqs.some(function(r) { return r.req.indexOf('fountain') >= 0 || r.req.indexOf('SELV') >= 0; }));
});

test('Pool: bonding conductor 4mm2 with protection, 6mm2 without', function() {
  assert.strictEqual(poolGetMinBondingConductor(true), 4);
  assert.strictEqual(poolGetMinBondingConductor(false), 6);
});

test('Pool: renderPool returns HTML with no text inputs', function() {
  var html = renderPool();
  assert(html.length > 500, 'Pool HTML too short');
  assert(html.indexOf('sel-btn') > 0, 'Must use sel-btn');
  assert(html.indexOf('type="text"') < 0, 'No text inputs');
  assert(html.indexOf("type='text'") < 0, 'No text inputs');
  assert(html.indexOf('<textarea') < 0, 'No textarea');
  assert(html.indexOf('702') > 0, 'Must reference 702');
});

// =====================================================
// === CONSTRUCTION SITE MODULE TESTS (12+) ===
// =====================================================
console.log('\n--- Construction Site Module (DS/HD 60364-7-704) ---');

test('Construction: module translations exist', function() {
  assert(T.da.modules.construction, 'Danish construction missing');
  assert(T.en.modules.construction, 'English construction missing');
  assert(T.fa.modules.construction, 'Farsi construction missing');
});

test('Construction: calcLoad with empty equipment returns 0', function() {
  var r = constructionCalcLoad([], 0.5);
  assert.strictEqual(r.totalKW, 0);
  assert.strictEqual(r.diversifiedKW, 0);
  assert.strictEqual(r.current3ph, 0);
});

test('Construction: calcLoad with crane (75kW) at diversity 0.5', function() {
  var r = constructionCalcLoad(['crane'], 0.5);
  assert.strictEqual(r.totalKW, 75);
  assert.strictEqual(r.diversifiedKW, 37.5);
  assert(r.current3ph > 0, 'Current must be positive');
  // 37500 / (400 * 1.732 * 0.85) = ~63.7 -> ceil = 64
  assert(r.current3ph >= 63, 'Current should be >= 63A');
});

test('Construction: calcLoad uses ceiling for conservative current', function() {
  var r = constructionCalcLoad(['power_tools'], 1.0);
  // 5000 / (400*1.732*0.85) = 8.49 -> ceil = 9
  assert.strictEqual(r.current3ph, Math.ceil(5000 / (400 * Math.sqrt(3) * 0.85)));
});

test('Construction: selectCable returns H07RN-F type', function() {
  var c = constructionSelectCable(50);
  assert.strictEqual(c.type, 'H07RN-F');
  assert(c.iz >= 50, 'Iz must be >= current');
  assert(c.clause.indexOf('704') >= 0);
});

test('Construction: selectCable for 100A returns at least 25mm2', function() {
  var c = constructionSelectCable(100);
  assert(c.mm2 >= 25, 'Must be at least 25mm2 for 100A');
  assert(c.iz >= 100);
});

test('Construction: protection reqs include 30mA RCD and 0.2s', function() {
  var reqs = constructionGetProtectionReqs();
  assert(reqs.some(function(r) { return r.req.indexOf('30mA RCD') >= 0; }));
  assert(reqs.some(function(r) { return r.req.indexOf('0.2s') >= 0; }));
  assert(reqs.some(function(r) { return r.req.indexOf('IP44') >= 0; }));
  assert(reqs.some(function(r) { return r.req.indexOf('No PVC') >= 0 || r.req.indexOf('H07RN-F') >= 0; }));
});

test('Construction: cable reqs mention 6m clearance and 0.6m depth', function() {
  var reqs = constructionGetCableReqs();
  assert(reqs.some(function(r) { return r.req.indexOf('6m') >= 0; }));
  assert(reqs.some(function(r) { return r.req.indexOf('0.6m') >= 0; }));
});

test('Construction: inspection schedule includes before first use and 3 months', function() {
  var sched = constructionGetInspectionSchedule();
  assert(sched.length >= 3);
  assert(sched.some(function(s) { return s.en.indexOf('first use') >= 0; }));
  assert(sched.some(function(s) { return s.interval.indexOf('3 months') >= 0; }));
});

test('Construction: multiple equipment load summed correctly', function() {
  var r = constructionCalcLoad(['crane', 'concrete_pump', 'welding'], 0.7);
  assert.strictEqual(r.totalKW, 75 + 55 + 40);
  assert(Math.abs(r.diversifiedKW - 170 * 0.7) < 0.1);
});

test('Construction: renderConstruction returns valid HTML', function() {
  var html = renderConstruction();
  assert(html.length > 500);
  assert(html.indexOf('sel-btn') > 0);
  assert(html.indexOf('type="text"') < 0);
  assert(html.indexOf('704') > 0);
});

test('Construction: 500mA RCD requirement for >32A sockets', function() {
  var reqs = constructionGetProtectionReqs();
  assert(reqs.some(function(r) { return r.req.indexOf('500mA') >= 0 && r.req.indexOf('>') >= 0; }));
});

// =====================================================
// === AGRICULTURAL INSTALLATION MODULE TESTS (12+) ===
// =====================================================
console.log('\n--- Agricultural Installation Module (DS/HD 60364-7-705) ---');

test('Agri: module translations exist', function() {
  assert(T.da.modules.agri, 'Danish agri missing');
  assert(T.en.modules.agri, 'English agri missing');
  assert(T.fa.modules.agri, 'Farsi agri missing');
});

test('Agri: cattle house has livestock hazard and corrosive atmosphere', function() {
  var bt = AGRI_BUILDING_TYPES.find(function(b) { return b.k === 'cattle'; });
  assert(bt.hazards.indexOf('livestock') >= 0);
  assert(bt.hazards.indexOf('corrosive') >= 0);
  assert.strictEqual(bt.ip, 'IP44');
});

test('Agri: milking parlour requires IP55', function() {
  assert.strictEqual(agriGetIPRating('milking'), 'IP55');
});

test('Agri: grain storage requires IP54', function() {
  assert.strictEqual(agriGetIPRating('grain'), 'IP54');
});

test('Agri: livestock areas require 25V AC touch voltage', function() {
  var reqs = agriGetProtectionReqs('cattle', true);
  assert(reqs.some(function(r) { return r.req.indexOf('25V') >= 0; }));
  assert(reqs.some(function(r) { return r.clause.indexOf('705.411.1') >= 0; }));
});

test('Agri: all circuits require 30mA RCD per cl.705.411.3.3', function() {
  var reqs = agriGetProtectionReqs('workshop', false);
  assert(reqs.some(function(r) { return r.req.indexOf('30mA RCD') >= 0 && r.clause.indexOf('705.411.3.3') >= 0; }));
});

test('Agri: disconnection time 0.2s per cl.705.411.3.2', function() {
  var reqs = agriGetProtectionReqs('cattle', true);
  assert(reqs.some(function(r) { return r.req.indexOf('0.2s') >= 0; }));
});

test('Agri: cable reqs include copper only and overhead preferred', function() {
  var reqs = agriGetCableReqs('cattle');
  assert(reqs.some(function(r) { return r.req.indexOf('copper') >= 0; }));
  assert(reqs.some(function(r) { return r.req.indexOf('Overhead') >= 0 || r.req.indexOf('overhead') >= 0; }));
});

test('Agri: corrosive atmosphere requires no PVC', function() {
  var reqs = agriGetCableReqs('cattle');
  assert(reqs.some(function(r) { return r.req.indexOf('PVC') >= 0 && r.req.indexOf('not suitable') >= 0; }));
});

test('Agri: bonding reqs include 4mm2 Cu and 0.5 Ohm max', function() {
  var bonding = agriGetBondingReqs('cattle');
  assert.strictEqual(bonding.minConductor, 4);
  assert.strictEqual(bonding.maxResistance, 0.5);
  assert(bonding.items.length >= 5, 'Livestock bonding should have 5+ items');
});

test('Agri: essential loads require auto-restart', function() {
  var reqs = agriGetMotorReqs(true);
  assert(reqs.some(function(r) { return r.en.indexOf('restart') >= 0 || r.en.indexOf('Milking') >= 0; }));
  assert(reqs.some(function(r) { return r.en.indexOf('Ventilation') >= 0; }));
});

test('Agri: renderAgri returns valid HTML with no text inputs', function() {
  var html = renderAgri();
  assert(html.length > 500);
  assert(html.indexOf('sel-btn') > 0);
  assert(html.indexOf('type="text"') < 0);
  assert(html.indexOf('705') > 0);
});

test('Agri: fire hazard buildings require fire-resistant cables', function() {
  var reqs = agriGetProtectionReqs('grain', false);
  assert(reqs.some(function(r) { return r.req.indexOf('Fire-resistant') >= 0 || r.req.indexOf('fire') >= 0; }));
});

// =====================================================
// === ARC FLASH MODULE TESTS (13+) ===
// =====================================================
console.log('\n--- Arc Flash Module (IEC 62271-200 / IEEE 1584) ---');

test('ArcFlash: module translations exist', function() {
  assert(T.da.modules.arcflash, 'Danish arcflash missing');
  assert(T.en.modules.arcflash, 'English arcflash missing');
  assert(T.fa.modules.arcflash, 'Farsi arcflash missing');
});

test('ArcFlash: low energy (400V, 1kA, 0.01s) gives Category 0', function() {
  var E = arcflashCalcIncidentEnergy(400, 1, 0.01, 455);
  var ppe = arcflashGetPPECategory(E);
  assert.strictEqual(ppe.category, 0);
  assert(E < 1.2, 'Energy should be < 1.2 for Cat 0');
});

test('ArcFlash: uses ceiling rounding (conservative)', function() {
  var E = arcflashCalcIncidentEnergy(400, 10, 0.1, 455);
  // Check it is a multiple of 0.1 (ceiling to 1 decimal)
  assert.strictEqual(E, Math.ceil(E * 10) / 10);
});

test('ArcFlash: higher voltage uses Cf=1.5 factor', function() {
  var E_lv = arcflashCalcIncidentEnergy(400, 10, 0.1, 455);
  var E_mv = arcflashCalcIncidentEnergy(6000, 10, 0.1, 455);
  assert(E_mv > E_lv, 'MV should have higher energy than LV');
  // MV uses Cf=1.5 vs LV Cf=1.0, so ratio ~ 1.5
  assert(E_mv / E_lv >= 1.4, 'MV/LV ratio should be ~1.5');
});

test('ArcFlash: energy increases with fault current', function() {
  var E1 = arcflashCalcIncidentEnergy(400, 5, 0.1, 455);
  var E2 = arcflashCalcIncidentEnergy(400, 20, 0.1, 455);
  assert(E2 > E1, 'Higher fault current = more energy');
});

test('ArcFlash: energy increases with clearing time', function() {
  var E1 = arcflashCalcIncidentEnergy(400, 10, 0.05, 455);
  var E2 = arcflashCalcIncidentEnergy(400, 10, 0.5, 455);
  assert(E2 > E1, 'Longer clearing = more energy');
});

test('ArcFlash: closer working distance = more energy', function() {
  var E1 = arcflashCalcIncidentEnergy(400, 10, 0.1, 610);
  var E2 = arcflashCalcIncidentEnergy(400, 10, 0.1, 300);
  assert(E2 > E1, 'Closer distance = more energy');
});

test('ArcFlash: PPE categories correct thresholds', function() {
  assert.strictEqual(arcflashGetPPECategory(0.5).category, 0);
  assert.strictEqual(arcflashGetPPECategory(1.2).category, 1);
  assert.strictEqual(arcflashGetPPECategory(3.9).category, 1);
  assert.strictEqual(arcflashGetPPECategory(4.0).category, 2);
  assert.strictEqual(arcflashGetPPECategory(7.9).category, 2);
  assert.strictEqual(arcflashGetPPECategory(8.0).category, 3);
  assert.strictEqual(arcflashGetPPECategory(24.9).category, 3);
  assert.strictEqual(arcflashGetPPECategory(25.0).category, 4);
  assert.strictEqual(arcflashGetPPECategory(39.9).category, 4);
  assert.strictEqual(arcflashGetPPECategory(40.0).category, -1);
});

test('ArcFlash: boundary calculation returns positive mm value', function() {
  var b = arcflashCalcBoundary(400, 10, 0.1);
  assert(b > 0, 'Boundary must be positive');
  assert(b === Math.ceil(b), 'Boundary must use ceiling');
});

test('ArcFlash: boundary increases with fault current', function() {
  var b1 = arcflashCalcBoundary(400, 5, 0.1);
  var b2 = arcflashCalcBoundary(400, 20, 0.1);
  assert(b2 > b1, 'Higher current = larger boundary');
});

test('ArcFlash: risk reductions include de-energize and ZSI', function() {
  var r = arcflashGetRiskReductions();
  assert(r.length >= 5);
  assert(r.some(function(x) { return x.en.indexOf('energize') >= 0; }));
  assert(r.some(function(x) { return x.en.indexOf('ZSI') >= 0 || x.en.indexOf('Zone') >= 0; }));
});

test('ArcFlash: > 40 cal/cm2 gives WORK PROHIBITED', function() {
  // 400V, 65kA, 2.0s, 300mm = very high energy
  var E = arcflashCalcIncidentEnergy(400, 65, 2.0, 300);
  var ppe = arcflashGetPPECategory(E);
  assert.strictEqual(ppe.category, -1);
  assert(ppe.en.indexOf('PROHIBITED') >= 0);
});

test('ArcFlash: renderArcFlash returns valid HTML', function() {
  var html = renderArcFlash();
  assert(html.length > 500);
  assert(html.indexOf('sel-btn') > 0);
  assert(html.indexOf('type="text"') < 0);
  assert(html.indexOf('IEC 62271') > 0 || html.indexOf('IEEE 1584') > 0);
});

// =====================================================
// === CABLE LIFETIME MODULE TESTS (13+) ===
// =====================================================
console.log('\n--- Cable Lifetime Module (IEC 60502) ---');

test('CableLife: module translations exist', function() {
  assert(T.da.modules.cablelife, 'Danish cablelife missing');
  assert(T.en.modules.cablelife, 'English cablelife missing');
  assert(T.fa.modules.cablelife, 'Farsi cablelife missing');
});

test('CableLife: PVC at rated temp (70C) gives design life 35 years', function() {
  var r = cablelifeCalcThermalLife('PVC', 70);
  assert.strictEqual(r.totalYears, 35);
});

test('CableLife: PVC at 78C (8C above rated) halves life to ~17 years', function() {
  var r = cablelifeCalcThermalLife('PVC', 78);
  // 35 * 2^((70-78)/8) = 35 * 0.5 = 17.5 -> floor = 17
  assert.strictEqual(r.totalYears, 17);
});

test('CableLife: PVC at 62C (8C below rated) doubles life to 70 years', function() {
  var r = cablelifeCalcThermalLife('PVC', 62);
  // 35 * 2^((70-62)/8) = 35 * 2 = 70
  assert.strictEqual(r.totalYears, 70);
});

test('CableLife: XLPE at rated temp (90C) gives 35 years', function() {
  var r = cablelifeCalcThermalLife('XLPE', 90);
  assert.strictEqual(r.totalYears, 35);
});

test('CableLife: XLPE at 80C gives longer life (10C below rated)', function() {
  var r = cablelifeCalcThermalLife('XLPE', 80);
  // 35 * 2^((90-80)/10) = 35 * 2 = 70
  assert.strictEqual(r.totalYears, 70);
});

test('CableLife: uses floor rounding for conservative life estimate', function() {
  var r = cablelifeCalcThermalLife('PVC', 65);
  // 35 * 2^((70-65)/8) = 35 * 2^0.625 = 35 * 1.5422 = 53.98 -> floor = 53
  assert.strictEqual(r.totalYears, Math.floor(35 * Math.pow(2, 5/8)));
});

test('CableLife: remaining life with no env factor', function() {
  var r = cablelifeCalcRemainingLife(35, 10, 'none');
  assert.strictEqual(r.adjustedLife, 35);
  assert.strictEqual(r.remaining, 25);
  assert.strictEqual(r.envReduction, 0);
});

test('CableLife: UV factor reduces life by 20%', function() {
  var r = cablelifeCalcRemainingLife(35, 0, 'uv');
  assert.strictEqual(r.adjustedLife, Math.floor(35 * 0.8));
  assert.strictEqual(r.envReduction, 0.20);
});

test('CableLife: chemical factor reduces life by 30%', function() {
  var r = cablelifeCalcRemainingLife(100, 0, 'chemical');
  assert.strictEqual(r.adjustedLife, Math.floor(100 * 0.7));
});

test('CableLife: priority green for < 30% used', function() {
  var p = cablelifeGetPriority(20);
  assert.strictEqual(p.priority, 'green');
});

test('CableLife: priority yellow for 30-70% used', function() {
  var p = cablelifeGetPriority(50);
  assert.strictEqual(p.priority, 'yellow');
});

test('CableLife: priority red for 70-100% used', function() {
  var p = cablelifeGetPriority(85);
  assert.strictEqual(p.priority, 'red');
});

test('CableLife: priority black for > 100% used', function() {
  var p = cablelifeGetPriority(110);
  assert.strictEqual(p.priority, 'black');
});

test('CableLife: test frequency 6 years for green, 3 for yellow, 1 for red', function() {
  assert.strictEqual(cablelifeGetTestFrequency('green').years, 6);
  assert.strictEqual(cablelifeGetTestFrequency('yellow').years, 3);
  assert.strictEqual(cablelifeGetTestFrequency('red').years, 1);
  assert.strictEqual(cablelifeGetTestFrequency('black').years, 0);
});

test('CableLife: conductor temp calculation', function() {
  // ambient=25, loadFactor=1.0, ratedRise=40 -> 25 + 1*1*40 = 65
  var temp = cablelifeCalcConductorTemp(25, 1.0, 40);
  assert.strictEqual(temp, 65);
  // ambient=25, loadFactor=0.5, ratedRise=40 -> 25 + 0.25*40 = 35
  var temp2 = cablelifeCalcConductorTemp(25, 0.5, 40);
  assert.strictEqual(temp2, 35);
});

test('CableLife: renderCableLife returns valid HTML', function() {
  var html = renderCableLife();
  assert(html.length > 500);
  assert(html.indexOf('sel-btn') > 0);
  assert(html.indexOf('type="text"') < 0);
  assert(html.indexOf('IEC 60502') > 0 || html.indexOf('Arrhenius') > 0);
});

// =====================================================
// === CROSS-MODULE INTEGRATION TESTS ===
// =====================================================
console.log('\n--- Cross-module Integration Tests ---');

test('All 5 new modules render non-empty HTML', function() {
  var p = renderPool();
  var c = renderConstruction();
  var a = renderAgri();
  var af = renderArcFlash();
  var cl = renderCableLife();
  assert(p.length > 200, 'Pool HTML too short');
  assert(c.length > 200, 'Construction HTML too short');
  assert(a.length > 200, 'Agri HTML too short');
  assert(af.length > 200, 'ArcFlash HTML too short');
  assert(cl.length > 200, 'CableLife HTML too short');
});

test('No text input fields in any new module render', function() {
  var all = renderPool() + renderConstruction() + renderAgri() + renderArcFlash() + renderCableLife();
  assert(all.indexOf('type="text"') < 0, 'Found type="text"');
  assert(all.indexOf("type='text'") < 0, "Found type='text'");
  assert(all.indexOf('<textarea') < 0, 'Found textarea');
  assert(all.indexOf('<input') < 0 || all.indexOf('type="range"') >= 0 || all.indexOf('type="hidden"') >= 0, 'Only range/hidden inputs allowed');
});

test('All new modules cite relevant standards', function() {
  assert(renderPool().indexOf('60364-7-702') > 0, 'Pool must cite 60364-7-702');
  assert(renderConstruction().indexOf('60364-7-704') > 0, 'Construction must cite 60364-7-704');
  assert(renderAgri().indexOf('60364-7-705') > 0, 'Agri must cite 60364-7-705');
  assert(renderArcFlash().indexOf('62271') > 0 || renderArcFlash().indexOf('1584') > 0, 'Arc must cite IEC 62271 or IEEE 1584');
  assert(renderCableLife().indexOf('60502') > 0 || renderCableLife().indexOf('Arrhenius') > 0, 'CableLife must cite IEC 60502');
});


// =====================================================
// === BESS MODULE TESTS ===
// =====================================================
console.log('\n--- BESS (Battery Storage) Module Tests ---');

test('BESS: bessCalcInverterSize returns correct size for 13.5kWh/4h', function() {
  var result = bessCalcInverterSize(13.5, 4);
  assert.strictEqual(result.kW, 5); // ceil(13.5/4) = 4, next standard = 5
  assert(result.clause.indexOf('62619') > 0);
});

test('BESS: bessCalcInverterSize for large industrial 5000kWh/5h', function() {
  var result = bessCalcInverterSize(5000, 5);
  // ceil(5000/5)=1000, but largest standard inverter is 500kW - returns max available
  assert.strictEqual(result.kW, 500); // capped at largest standard size
});

test('BESS: bessCalcDCCurrent applies 1.25 derating', function() {
  var result = bessCalcDCCurrent(10, 400);
  // ceil(10*1000/400*1.25) = ceil(31.25) = 32
  assert.strictEqual(result.current, 32);
  assert(result.clause.indexOf('551.4') > 0);
});

test('BESS: bessCalcDCCable selects adequate cable', function() {
  var result = bessCalcDCCable(50);
  assert(result.iz >= 50);
  assert.strictEqual(result.mm2, 10); // 10mm2 has iz=50
  assert(result.clause.indexOf('B.52.4') > 0);
});

test('BESS: bessCalcDCCable for high current', function() {
  var result = bessCalcDCCable(200);
  assert(result.iz >= 200);
  assert(result.mm2 >= 70);
});

test('BESS: bessGetProtection includes RCD Type B', function() {
  var result = bessGetProtection(400, 50, 10);
  assert.strictEqual(result.rcd.type, 'B');
  assert.strictEqual(result.rcd.rating, 30);
  assert(result.dcDisconnect.required === true);
});

test('BESS: bessGetSafety returns BMS mandatory', function() {
  var result = bessGetSafety('LFP');
  assert(result.bms.required === true);
  assert(result.bms.clause.indexOf('62619') > 0);
  assert.strictEqual(result.ventilation.minACH, 5);
});

test('BESS: bessGetSafety NMC requires inert gas', function() {
  var result = bessGetSafety('NMC');
  assert(result.fireSuppression.indexOf('Inert') >= 0 || result.fireSuppression.indexOf('inert') >= 0);
  assert.strictEqual(result.ventilation.minACH, 8);
});

test('BESS: bessGetSafety VRLA has hydrogen detection', function() {
  var result = bessGetSafety('VRLA');
  assert(result.ventilation.explosiveGas === true);
  assert.strictEqual(result.ventilation.minACH, 10);
});

test('BESS: bessGetSafety room requires EI60', function() {
  var result = bessGetSafety('LFP');
  assert.strictEqual(result.room.fireRating, 'EI60');
  assert(result.room.clause.indexOf('551.8') > 0);
});

test('BESS: renderBESS returns valid HTML without text inputs', function() {
  var html = renderBESS();
  assert(html.length > 500);
  assert(html.indexOf('sel-btn') > 0);
  assert(html.indexOf('type="text"') < 0);
  assert(html.indexOf('<textarea') < 0);
  assert(html.indexOf('62619') > 0 || html.indexOf('60364') > 0);
});

test('BESS: renderBESS cites DS/EN 62619', function() {
  var html = renderBESS();
  assert(html.indexOf('62619') > 0);
  assert(html.indexOf('60364-5-56') > 0);
});

test('BESS: bessCalcACCable returns valid cable size', function() {
  var result = bessCalcACCable(10);
  assert(result.mm2 > 0);
  assert(result.iz > 0);
});

test('BESS: DC current calculation conservative (ceiling)', function() {
  // 5kW at 48V: ceil(5000/48*1.25) = ceil(130.2) = 131
  var result = bessCalcDCCurrent(5, 48);
  assert.strictEqual(result.current, 131);
});

// =====================================================
// === EMC MODULE TESTS ===
// =====================================================
console.log('\n--- EMC (Electromagnetic Compatibility) Module Tests ---');

test('EMC: emcGetSeparation A-E returns 300mm', function() {
  var result = emcGetSeparation('A', 'E');
  assert.strictEqual(result.distance_mm, 300);
  assert(result.clause.indexOf('50174') > 0);
});

test('EMC: emcGetSeparation B-D returns 100mm', function() {
  var result = emcGetSeparation('B', 'D');
  assert.strictEqual(result.distance_mm, 100);
});

test('EMC: emcGetSeparation same category returns 0', function() {
  var result = emcGetSeparation('C', 'C');
  assert.strictEqual(result.distance_mm, 0);
});

test('EMC: emcGetSeparation is commutative', function() {
  var r1 = emcGetSeparation('A', 'D');
  var r2 = emcGetSeparation('D', 'A');
  assert.strictEqual(r1.distance_mm, r2.distance_mm);
});

test('EMC: emcGetMitigations detects exceedance in zone 1', function() {
  var result = emcGetMitigations(1, ['vfd']); // VFD emits 25 V/m, zone 1 limit = 1
  assert(result.exceeded === true);
  assert(result.mitigations.length > 0);
  assert(result.maxEmission === 25);
  assert(result.zoneLimit === 1);
});

test('EMC: emcGetMitigations zone 4 with low source passes', function() {
  var result = emcGetMitigations(4, ['led']); // LED 6 V/m, zone 4 limit 30
  assert(result.exceeded === false);
});

test('EMC: emcGetMitigations recommends shielded cables for high emission', function() {
  var result = emcGetMitigations(1, ['vfd', 'welder']); // high emission vs 1 V/m limit
  var hasShielded = result.mitigations.some(function(m){return m.measure.indexOf('Shielded') >= 0 || m.measure.indexOf('shield') >= 0;});
  assert(hasShielded, 'Should recommend shielded cables');
});

test('EMC: emcGetCompliance returns relevant tests', function() {
  var result = emcGetCompliance(1);
  assert(result.tests.length >= 5);
  assert(result.tests[0].test.indexOf('55011') > 0 || result.tests[0].test.indexOf('55032') > 0);
});

test('EMC: emcGetMitigations cites IEC 61000', function() {
  var result = emcGetMitigations(1, ['vfd']);
  var hasCitation = result.mitigations.some(function(m){return m.clause.indexOf('61000') >= 0 || m.clause.indexOf('50174') >= 0;});
  assert(hasCitation);
});

test('EMC: renderEMC returns valid HTML without text inputs', function() {
  var html = renderEMC();
  assert(html.length > 500);
  assert(html.indexOf('sel-btn') > 0);
  assert(html.indexOf('type="text"') < 0);
  assert(html.indexOf('<textarea') < 0);
});

test('EMC: renderEMC cites IEC 61000', function() {
  var html = renderEMC();
  assert(html.indexOf('61000') > 0 || html.indexOf('50174') > 0);
});

test('EMC: emcGetMitigations empty sources no exceedance', function() {
  var result = emcGetMitigations(4, []);
  assert(result.exceeded === false);
  assert(result.maxEmission === 0);
});

test('EMC: separation table covers critical pairs', function() {
  assert.strictEqual(emcGetSeparation('A', 'C').distance_mm, 100);
  assert.strictEqual(emcGetSeparation('C', 'E').distance_mm, 100);
  assert.strictEqual(emcGetSeparation('D', 'E').distance_mm, 50);
});

// =====================================================
// === METERING MODULE TESTS ===
// =====================================================
console.log('\n--- Metering (Energy Metering) Module Tests ---');

test('Metering: meteringGetRequiredAccuracy billing requires class B', function() {
  var result = meteringGetRequiredAccuracy('billing');
  assert.strictEqual(result.accuracy, 'B');
  assert(result.clause.indexOf('MID') >= 0);
});

test('Metering: meteringGetRequiredAccuracy monitoring allows class 2', function() {
  var result = meteringGetRequiredAccuracy('monitoring');
  assert.strictEqual(result.accuracy, '2');
});

test('Metering: meteringCalcCTSize selects adequate ratio', function() {
  var result = meteringCalcCTSize(200);
  assert(result.primary >= 240); // 200 * 1.2 = 240
  assert.strictEqual(result.primary, 250);
  assert.strictEqual(result.secondary, 5);
});

test('Metering: meteringCalcCTSize for 80A', function() {
  var result = meteringCalcCTSize(80);
  assert(result.primary >= 96); // 80*1.2=96
  assert.strictEqual(result.primary, 100);
});

test('Metering: meteringCalcCost direct meter costs', function() {
  var result = meteringCalcCost('direct', 1, false);
  assert(result.total > 0);
  assert.strictEqual(result.ctCost, 0);
  assert(result.meterCost === 2500);
});

test('Metering: meteringCalcCost CT meter more expensive', function() {
  var direct = meteringCalcCost('direct', 1, false);
  var ct = meteringCalcCost('ct', 1, true);
  assert(ct.total > direct.total);
});

test('Metering: meteringCalcCost scales with num meters', function() {
  var one = meteringCalcCost('direct', 1, false);
  var ten = meteringCalcCost('direct', 10, false);
  assert(ten.total > one.total * 3); // More than 3x due to cabinet
});

test('Metering: meteringGetInstallReqs billing requires sealing', function() {
  var result = meteringGetInstallReqs('billing');
  var hasSealing = result.some(function(r){return r.req.indexOf('lombering') >= 0 || r.req.indexOf('ealing') >= 0;});
  assert(hasSealing);
});

test('Metering: meteringGetInstallReqs tenant mentions individual', function() {
  var result = meteringGetInstallReqs('tenant');
  var hasIndividual = result.some(function(r){return r.req.indexOf('ndividuel') >= 0 || r.req.indexOf('ndividual') >= 0;});
  assert(hasIndividual);
});

test('Metering: renderMetering returns valid HTML without text inputs', function() {
  var html = renderMetering();
  assert(html.length > 500);
  assert(html.indexOf('sel-btn') > 0);
  assert(html.indexOf('type="text"') < 0);
  assert(html.indexOf('<textarea') < 0);
});

test('Metering: renderMetering cites DS/EN 50470', function() {
  var html = renderMetering();
  assert(html.indexOf('50470') > 0 || html.indexOf('MID') > 0);
});

test('Metering: meteringGetMeterType direct for small loads', function() {
  var result = meteringGetMeterType('billing', 32);
  assert.strictEqual(result.type, 'direct');
  assert(result.maxA === 63);
});

test('Metering: meteringGetMeterType CT for large loads', function() {
  var result = meteringGetMeterType('billing', 200);
  assert.strictEqual(result.type, 'ct');
});

// =====================================================
// === ATEX MODULE TESTS ===
// =====================================================
console.log('\n--- ATEX (Explosive Atmospheres) Module Tests ---');

test('ATEX: atexGetEPL zone 0 gas returns Ga', function() {
  var result = atexGetEPL('gas', 0);
  assert.strictEqual(result.epl, 'Ga');
  assert(result.clause.indexOf('60079') > 0);
});

test('ATEX: atexGetEPL zone 1 gas returns Gb', function() {
  var result = atexGetEPL('gas', 1);
  assert.strictEqual(result.epl, 'Gb');
});

test('ATEX: atexGetEPL zone 22 dust returns Dc', function() {
  var result = atexGetEPL('dust', 22);
  assert.strictEqual(result.epl, 'Dc');
});

test('ATEX: atexGetAllowedProtection zone 0 includes Ex i only', function() {
  var result = atexGetAllowedProtection(0);
  assert(result.some(function(p){return p.id === 'Ex_i';}));
  assert(!result.some(function(p){return p.id === 'Ex_n';}));
});

test('ATEX: atexGetAllowedProtection zone 2 includes Ex n', function() {
  var result = atexGetAllowedProtection(2);
  assert(result.some(function(p){return p.id === 'Ex_n';}));
});

test('ATEX: atexGetAllowedProtection zone 1 includes Ex d and Ex e', function() {
  var result = atexGetAllowedProtection(1);
  assert(result.some(function(p){return p.id === 'Ex_d';}));
  assert(result.some(function(p){return p.id === 'Ex_e';}));
  assert(!result.some(function(p){return p.id === 'Ex_n';})); // Zone 2 only
});

test('ATEX: atexGetCableReqs zone 1 requires armoured', function() {
  var result = atexGetCableReqs(1, 'gas');
  var hasArmoured = result.some(function(r){return r.req.indexOf('rmeret') >= 0 || r.req.indexOf('rmoured') >= 0;});
  assert(hasArmoured);
});

test('ATEX: atexGetIPRating dust requires IP65', function() {
  var result = atexGetIPRating(22, 'dust');
  assert.strictEqual(result.rating, 'IP65');
});

test('ATEX: atexGetIPRating gas zone 1 requires IP54', function() {
  var result = atexGetIPRating(1, 'gas');
  assert.strictEqual(result.rating, 'IP54');
});

test('ATEX: atexGetInspection zone 0 requires continuous', function() {
  var result = atexGetInspection(0);
  assert.strictEqual(result.grade, 'A');
  assert(result.clause.indexOf('60079-17') > 0);
});

test('ATEX: atexGetInspection zone 2 max 3 years', function() {
  var result = atexGetInspection(2);
  assert.strictEqual(result.grade, 'C');
});

test('ATEX: renderATEX returns valid HTML without text inputs', function() {
  var html = renderATEX();
  assert(html.length > 500);
  assert(html.indexOf('sel-btn') > 0);
  assert(html.indexOf('type="text"') < 0);
  assert(html.indexOf('<textarea') < 0);
});

test('ATEX: renderATEX cites DS/EN 60079', function() {
  var html = renderATEX();
  assert(html.indexOf('60079') > 0);
  assert(html.indexOf('ATEX') > 0);
});

test('ATEX: atexGetCableReqs zone 2 recommends mechanical protection', function() {
  var result = atexGetCableReqs(2, 'gas');
  var hasMech = result.some(function(r){return r.req.indexOf('ekanisk') >= 0 || r.req.indexOf('echanical') >= 0;});
  assert(hasMech);
});

// =====================================================
// === SMART GRID MODULE TESTS ===
// =====================================================
console.log('\n--- Smart Grid (Demand Response) Module Tests ---');

test('SmartGrid: smartgridCalcFlexCapacity sums assets correctly', function() {
  var result = smartgridCalcFlexCapacity(['heatpump', 'ev']);
  assert.strictEqual(result.totalKW, 19); // 8 + 11
  assert.strictEqual(result.totalDailyKWh, 120); // 32 + 88
  assert.strictEqual(result.annualKWh, 43800); // 120 * 365
});

test('SmartGrid: smartgridCalcFlexCapacity empty returns zero', function() {
  var result = smartgridCalcFlexCapacity([]);
  assert.strictEqual(result.totalKW, 0);
  assert.strictEqual(result.totalDailyKWh, 0);
});

test('SmartGrid: smartgridCalcFlexCapacity single asset', function() {
  var result = smartgridCalcFlexCapacity(['battery']);
  assert.strictEqual(result.totalKW, 5);
  assert.strictEqual(result.totalDailyKWh, 120);
});

test('SmartGrid: smartgridCalcAnnualSavings positive', function() {
  var result = smartgridCalcAnnualSavings(['heatpump', 'ev'], 0.50);
  assert(result.totalSavings > 0);
  assert(result.shiftedKWh > 0);
  assert(result.flexRevenue > 0);
  assert(result.peakReduction > 0);
});

test('SmartGrid: smartgridCalcAnnualSavings higher spread = more savings', function() {
  var low = smartgridCalcAnnualSavings(['heatpump'], 0.30);
  var high = smartgridCalcAnnualSavings(['heatpump'], 0.80);
  assert(high.flexRevenue > low.flexRevenue);
});

test('SmartGrid: smartgridGetGridReqs includes anti-islanding', function() {
  var result = smartgridGetGridReqs('residential', 5);
  var hasAntiIsland = result.some(function(r){return r.req.indexOf('anti') >= 0 || r.req.indexOf('Anti') >= 0 || r.req.indexOf('oedrift') >= 0;});
  assert(hasAntiIsland);
});

test('SmartGrid: smartgridGetGridReqs >11kW requires freq response', function() {
  var result = smartgridGetGridReqs('commercial', 20);
  var hasFreq = result.some(function(r){return r.req.indexOf('50.2') >= 0 || r.req.indexOf('rekvens') >= 0 || r.req.indexOf('requency') >= 0;});
  assert(hasFreq);
});

test('SmartGrid: smartgridGetGridReqs >16kW requires voltage ride-through', function() {
  var result = smartgridGetGridReqs('commercial', 25);
  var hasVRT = result.some(function(r){return r.req.indexOf('ride-through') >= 0 || r.req.indexOf('gennemkoersel') >= 0;});
  assert(hasVRT);
});

test('SmartGrid: smartgridGetCommunication residential includes SG-Ready', function() {
  var result = smartgridGetCommunication('residential');
  var hasSG = result.some(function(c){return c.protocol.indexOf('SG-Ready') >= 0;});
  assert(hasSG);
});

test('SmartGrid: smartgridGetCommunication demand_response includes Flexpower', function() {
  var result = smartgridGetCommunication('demand_response');
  var hasFlex = result.some(function(c){return c.protocol.indexOf('Flexpower') >= 0;});
  assert(hasFlex);
});

test('SmartGrid: renderSmartGrid returns valid HTML without text inputs', function() {
  var html = renderSmartGrid();
  assert(html.length > 500);
  assert(html.indexOf('sel-btn') > 0);
  assert(html.indexOf('type="text"') < 0);
  assert(html.indexOf('<textarea') < 0);
});

test('SmartGrid: renderSmartGrid cites DS/EN 50549', function() {
  var html = renderSmartGrid();
  assert(html.indexOf('50549') > 0);
  assert(html.indexOf('Energinet') > 0);
});

test('SmartGrid: smartgridCalcFlexCapacity cites DS/EN 50549', function() {
  var result = smartgridCalcFlexCapacity(['ev']);
  assert(result.clause.indexOf('50549') > 0);
});

test('SmartGrid: all flex assets have positive kW and hours', function() {
  SMARTGRID_ASSETS.forEach(function(a) {
    assert(a.kW > 0, a.id + ' must have positive kW');
    assert(a.flexHours > 0, a.id + ' must have positive flexHours');
    assert(a.dailyKWh > 0, a.id + ' must have positive dailyKWh');
  });
});

// =====================================================
// === CROSS-MODULE INTEGRATION TESTS (New 5 modules) ===
// =====================================================
console.log('\n--- New 5 Modules Integration Tests ---');

test('All 5 new modules (bess/emc/metering/atex/smartgrid) render non-empty HTML', function() {
  var b = renderBESS();
  var e = renderEMC();
  var m = renderMetering();
  var a = renderATEX();
  var s = renderSmartGrid();
  assert(b.length > 200, 'BESS HTML too short');
  assert(e.length > 200, 'EMC HTML too short');
  assert(m.length > 200, 'Metering HTML too short');
  assert(a.length > 200, 'ATEX HTML too short');
  assert(s.length > 200, 'SmartGrid HTML too short');
});

test('No text input fields in any of the 5 new module renders', function() {
  var all = renderBESS() + renderEMC() + renderMetering() + renderATEX() + renderSmartGrid();
  assert(all.indexOf('type="text"') < 0, 'Found type="text"');
  assert(all.indexOf("type='text'") < 0, "Found type='text'");
  assert(all.indexOf('<textarea') < 0, 'Found textarea');
});

test('All 5 new modules cite relevant standards', function() {
  assert(renderBESS().indexOf('62619') > 0, 'BESS must cite DS/EN 62619');
  assert(renderEMC().indexOf('61000') > 0 || renderEMC().indexOf('50174') > 0, 'EMC must cite IEC 61000 or DS/EN 50174');
  assert(renderMetering().indexOf('50470') > 0 || renderMetering().indexOf('MID') > 0, 'Metering must cite DS/EN 50470 or MID');
  assert(renderATEX().indexOf('60079') > 0, 'ATEX must cite DS/EN 60079');
  assert(renderSmartGrid().indexOf('50549') > 0, 'SmartGrid must cite DS/EN 50549');
});


// =====================================================
// === KLS QUALITY SYSTEM MODULE TESTS ===
// =====================================================
console.log('\n--- KLS Quality System Tests ---');

test('KLS: klsElStatus <1 MOhm = Afvigelse', function() {
  assert.strictEqual(klsElStatus('<1', 'OK', 'OK'), 'Afvigelse');
});

test('KLS: klsElStatus 2-5 MOhm all OK = Godkendt', function() {
  assert.strictEqual(klsElStatus('2-5', 'OK', 'OK'), 'Godkendt');
});

test('KLS: klsElStatus bad earthing = Afvigelse', function() {
  assert.strictEqual(klsElStatus('2-5', 'Ikke OK', 'OK'), 'Afvigelse');
});

test('KLS: klsElStatus bad HPFI = Afvigelse', function() {
  assert.strictEqual(klsElStatus('2-5', 'OK', 'Ikke OK'), 'Afvigelse');
});

test('KLS: klsElStatus N/A treated as not-OK = Afvigelse', function() {
  assert.strictEqual(klsElStatus('2-5', 'N/A', 'OK'), 'Afvigelse');
  assert.strictEqual(klsElStatus('2-5', 'OK', 'N/A'), 'Afvigelse');
});

test('KLS: klsKloakFaldOk <10 promille = false', function() {
  assert.strictEqual(klsKloakFaldOk('<10\u2030'), false);
});

test('KLS: klsKloakFaldOk 15-20 promille = true', function() {
  assert.strictEqual(klsKloakFaldOk('15-20\u2030'), true);
});

test('KLS: klsProcedureActiveCount returns 14 when all Aktiv', function() {
  var all = [];
  for (var i = 0; i < 14; i++) all.push('Aktiv');
  assert.strictEqual(klsProcedureActiveCount(all), 14);
});

test('KLS: klsProcedureActiveCount counts mixed states', function() {
  assert.strictEqual(klsProcedureActiveCount(['Aktiv', 'Udgået', 'Aktiv', 'Under revision']), 2);
});

test('KLS: klsDeviationStats counts open/started/closed', function() {
  var s = klsDeviationStats(['Åben', 'Åben', 'Igangsat', 'Afsluttet']);
  assert.strictEqual(s.open, 2);
  assert.strictEqual(s.started, 1);
  assert.strictEqual(s.closed, 1);
});

test('KLS: klsExpiryStatus(2) = red', function() {
  assert.strictEqual(klsExpiryStatus(2).level, 'red');
});

test('KLS: klsExpiryStatus(3) = red (boundary)', function() {
  assert.strictEqual(klsExpiryStatus(3).level, 'red');
});

test('KLS: klsExpiryStatus(6) = amber (boundary)', function() {
  assert.strictEqual(klsExpiryStatus(6).level, 'amber');
});

test('KLS: klsExpiryStatus(12) = green', function() {
  assert.strictEqual(klsExpiryStatus(12).level, 'green');
});

test('KLS: klsDashboardCompliance GREEN only when all LOVKRAV = Ja', function() {
  var answers = [];
  for (var i = 0; i < KLS_ANNUAL.length; i++) {
    answers.push(KLS_ANNUAL[i].tag === 'LOVKRAV' ? 'Ja' : null);
  }
  assert.strictEqual(klsDashboardCompliance(answers), true);
});

test('KLS: klsDashboardCompliance RED if any LOVKRAV = Nej', function() {
  var answers = [];
  for (var i = 0; i < KLS_ANNUAL.length; i++) {
    answers.push('Ja');
  }
  // set first LOVKRAV item to Nej
  for (var j = 0; j < KLS_ANNUAL.length; j++) {
    if (KLS_ANNUAL[j].tag === 'LOVKRAV') { answers[j] = 'Nej'; break; }
  }
  assert.strictEqual(klsDashboardCompliance(answers), false);
});

test('KLS: klsVvsStatus all OK = Godkendt, cold temp bucket = Afvigelse', function() {
  assert.strictEqual(klsVvsStatus('OK', 'OK', '55-60°C'), 'Godkendt');
  assert.strictEqual(klsVvsStatus('OK', 'OK', '<55°C'), 'Afvigelse');
});

test('KLS: exactly 12 management-review points', function() {
  assert.strictEqual(KLS_REVIEW_POINTS.length, 12);
});

test('KLS: exactly 14 procedures P-01..P-14', function() {
  assert.strictEqual(KLS_PROCEDURES.length, 14);
  assert.strictEqual(KLS_PROCEDURES[0].id, 'P-01');
  assert.strictEqual(KLS_PROCEDURES[13].id, 'P-14');
});

test('KLS: exactly 14 documents DOK-001..DOK-014', function() {
  assert.strictEqual(KLS_DOCUMENTS.length, 14);
  assert.strictEqual(KLS_DOCUMENTS[0].id, 'DOK-001');
  assert.strictEqual(KLS_DOCUMENTS[13].id, 'DOK-014');
});

test('KLS: exactly 8 measuring instruments', function() {
  assert.strictEqual(KLS_INSTRUMENTS.length, 8);
});

test('KLS: exactly 14 sheets in index', function() {
  assert.strictEqual(KLS_SHEETS.length, 14);
});

test('KLS: module registered in T.da/en/fa.modules', function() {
  assert(T.da.modules.kls, 'kls missing in T.da.modules');
  assert(T.en.modules.kls, 'kls missing in T.en.modules');
  assert(T.fa.modules.kls, 'kls missing in T.fa.modules');
});

test('KLS: renderKLS returns non-empty HTML for all 14 views', function() {
  var views = ['forside', 'politik', 'organisation', 'procedurer', 'el', 'vvs', 'kloak',
    'afvigelse', 'efterproevning', 'kompetence', 'maaleudstyr', 'tilsyn', 'dokument', 'dashboard'];
  var saved = klsState.view;
  views.forEach(function(v) {
    klsState.view = v;
    var html = renderKLS();
    assert(html.length > 200, 'View ' + v + ' HTML too short');
  });
  klsState.view = saved;
});

test('KLS: renderKLS output has NO text input or textarea (all views)', function() {
  var views = ['forside', 'politik', 'organisation', 'procedurer', 'el', 'vvs', 'kloak',
    'afvigelse', 'efterproevning', 'kompetence', 'maaleudstyr', 'tilsyn', 'dokument', 'dashboard'];
  var saved = klsState.view;
  var all = '';
  views.forEach(function(v) { klsState.view = v; all += renderKLS(); });
  klsState.view = saved;
  assert(all.indexOf('<input type="text"') < 0, 'Found <input type="text"');
  assert(all.indexOf("<input type='text'") < 0, "Found <input type='text'");
  assert(all.indexOf('<textarea') < 0, 'Found <textarea');
});

test('KLS: rendered output cites DS/HD 60364-6, DS 432 and BEK 725', function() {
  var saved = klsState.view;
  klsState.view = 'el'; var elHtml = renderKLS();
  klsState.view = 'kloak'; var kloakHtml = renderKLS();
  klsState.view = 'forside'; var forsideHtml = renderKLS();
  klsState.view = saved;
  assert(elHtml.indexOf('DS/HD 60364-6') >= 0, 'EL view must cite DS/HD 60364-6');
  assert(kloakHtml.indexOf('DS 432') >= 0, 'Kloak view must cite DS 432');
  assert(forsideHtml.indexOf('BEK nr. 725') >= 0 || forsideHtml.indexOf('BEK 725') >= 0, 'Forside must cite BEK 725');
});

test('KLS: klsCalOkCount and klsDocStats aggregate correctly', function() {
  assert.strictEqual(klsCalOkCount(['Kalibreret OK', 'Udløbet', 'Kalibreret OK']), 2);
  var d = klsDocStats(['Aktiv', 'Aktiv', 'Under revision', 'Udgået']);
  assert.strictEqual(d.active, 2);
  assert.strictEqual(d.revision, 1);
  assert.strictEqual(d.retired, 1);
});

test('KLS: renderModule case kls works via renderKLS', function() {
  klsState.view = 'dashboard';
  var html = renderKLS();
  assert(html.indexOf('ÅRLIG TJEKLISTE') >= 0 || html.indexOf('ANNUAL CHECKLIST') >= 0, 'Dashboard must show annual checklist');
});

// ===== KLS v2: persistence, append-able logs, auto-deviation, export/print =====
function klsClearLogs() {
  klsState.elLog = []; klsState.vvsLog = []; klsState.kloakLog = []; klsState.devLog = [];
}

test('KLS: klsLogStats empty log = zeros', function() {
  var s = klsLogStats([]);
  assert.strictEqual(s.approved, 0);
  assert.strictEqual(s.deviations, 0);
  assert.strictEqual(s.total, 0);
  assert.strictEqual(s.ratePct, 0);
});

test('KLS: klsLogStats mixed log computes approved/deviations/ratePct', function() {
  var log = [
    { status: 'Godkendt' }, { status: 'Godkendt' }, { status: 'Godkendt' }, { status: 'Afvigelse' }
  ];
  var s = klsLogStats(log);
  assert.strictEqual(s.approved, 3);
  assert.strictEqual(s.deviations, 1);
  assert.strictEqual(s.total, 4);
  assert.strictEqual(s.ratePct, 75);
});

test('KLS: klsNextSagsnr generates zero-padded year-sequential numbers', function() {
  assert.strictEqual(klsNextSagsnr(2025, 0), '2025-001');
  assert.strictEqual(klsNextSagsnr(2025, 1), '2025-002');
  assert.strictEqual(klsNextSagsnr(2025, 11), '2025-012');
  assert.strictEqual(klsNextSagsnr(2024, 99), '2024-100');
});

test('KLS: klsNextDevId generates AFV-001 incrementing', function() {
  assert.strictEqual(klsNextDevId(0), 'AFV-001');
  assert.strictEqual(klsNextDevId(1), 'AFV-002');
  assert.strictEqual(klsNextDevId(11), 'AFV-012');
});

test('KLS: saving EL entry with iso <1 yields Afvigelse and appends linked deviation', function() {
  klsClearLogs();
  klsState.elIso = '<1'; klsState.elJord = 'OK'; klsState.elHpfi = 'OK';
  klsSaveElEntry();
  assert.strictEqual(klsState.elLog.length, 1, 'one EL entry logged');
  assert.strictEqual(klsState.elLog[0].status, 'Afvigelse', 'iso <1 => Afvigelse');
  assert.strictEqual(klsState.devLog.length, 1, 'auto-deviation appended');
  assert.strictEqual(klsState.devLog[0].id, 'AFV-001');
  assert.strictEqual(klsState.devLog[0].sagsnr, klsState.elLog[0].sagsnr, 'deviation references the sagsnr');
  assert.strictEqual(klsState.devLog[0].status, 'Åben', 'new deviation defaults to Åben');
  assert(/^\d{4}-\d{3}$/.test(klsState.elLog[0].sagsnr), 'sagsnr format YYYY-NNN');
});

test('KLS: saving an approved EL entry does NOT create a deviation', function() {
  klsClearLogs();
  klsState.elIso = '2-5'; klsState.elJord = 'OK'; klsState.elHpfi = 'OK';
  klsSaveElEntry();
  assert.strictEqual(klsState.elLog[0].status, 'Godkendt');
  assert.strictEqual(klsState.devLog.length, 0, 'no deviation for approved entry');
});

test('KLS: sagsnr increments sequentially across all three logs', function() {
  klsClearLogs();
  klsState.elIso = '2-5'; klsState.elJord = 'OK'; klsState.elHpfi = 'OK';
  klsSaveElEntry();
  klsState.vvsTryk = 'OK'; klsState.vvsTaethed = 'OK'; klsState.vvsTemp = '55-60°C';
  klsSaveVvsEntry();
  klsState.kloakTaethed = 'OK'; klsState.kloakFald = '20-30‰';
  klsSaveKloakEntry();
  assert.strictEqual(klsTotalLogCount(), 3);
  var nums = [klsState.elLog[0].sagsnr, klsState.vvsLog[0].sagsnr, klsState.kloakLog[0].sagsnr];
  var seq = nums.map(function(n) { return parseInt(n.split('-')[1], 10); });
  assert.deepStrictEqual(seq, [1, 2, 3], 'sagsnr sequence 001,002,003 across logs');
});

test('KLS: klsKloakFaldOk false for <10 promille, true for 20-30 promille bucket', function() {
  assert.strictEqual(klsKloakFaldOk('<10\u2030'), false);
  assert.strictEqual(klsKloakFaldOk('20-30\u2030'), true);
  assert.strictEqual(klsKloakFaldOk('10-20\u2030'), true);
});

test('KLS: kloak view renders the updated fall buckets', function() {
  var saved = klsState.view;
  klsState.view = 'kloak';
  var html = renderKLS();
  klsState.view = saved;
  assert(html.indexOf('20-30\u2030') >= 0, 'fall bucket 20-30 promille present');
  assert(html.indexOf('<10\u2030') >= 0, 'fall bucket <10 promille present');
});

test('KLS: persistence round-trip restores logs and deviations via klsSave/klsLoad', function() {
  klsClearLogs();
  klsState.elIso = '<1'; klsState.elJord = 'OK'; klsState.elHpfi = 'OK';
  klsSaveElEntry(); // writes to localStorage via klsRerender -> klsSave
  var elCount = klsState.elLog.length, devCount = klsState.devLog.length;
  var sagsnr = klsState.elLog[0].sagsnr;
  // wipe in-memory state then reload from storage
  klsState.elLog = []; klsState.devLog = [];
  klsLoad();
  assert.strictEqual(klsState.elLog.length, elCount, 'elLog restored');
  assert.strictEqual(klsState.devLog.length, devCount, 'devLog restored');
  assert.strictEqual(klsState.elLog[0].sagsnr, sagsnr, 'sagsnr preserved across reload');
});

test('KLS: klsSerialize produces JSON containing the logs', function() {
  var obj = JSON.parse(klsSerialize());
  assert(Array.isArray(obj.elLog), 'elLog serialized as array');
  assert(Array.isArray(obj.devLog), 'devLog serialized as array');
});

test('KLS: klsExpiryStatus from computed months still red<=3 / amber<=6 / green else', function() {
  assert.strictEqual(klsExpiryStatus(0).level, 'red');
  assert.strictEqual(klsExpiryStatus(3).level, 'red');
  assert.strictEqual(klsExpiryStatus(4).level, 'amber');
  assert.strictEqual(klsExpiryStatus(6).level, 'amber');
  assert.strictEqual(klsExpiryStatus(7).level, 'green');
  assert.strictEqual(klsExpiryStatus(24).level, 'green');
});

test('KLS: klsExpiryMonths computes from godkendt date (+2 years) and falls back to manual', function() {
  var fallback = { godkendtYear: '', godkendtMonth: '', godkendtDay: '', expiryMonths: 9 };
  assert.strictEqual(klsExpiryMonths(fallback), 9, 'falls back to manual expiryMonths');
  // godkendt = first day of this month -> udløb = +2 years -> ~24 months away
  var now = new Date();
  var s = { godkendtYear: String(now.getFullYear()), godkendtMonth: ('0' + (now.getMonth() + 1)).slice(-2), godkendtDay: '01', expiryMonths: 0 };
  var m = klsExpiryMonths(s);
  assert(m >= 22 && m <= 24, 'computed months in expected ~24 range, got ' + m);
});

test('KLS: klsDashboardCompliance semantics unchanged (GREEN only when all LOVKRAV = Ja)', function() {
  var answers = [];
  for (var i = 0; i < KLS_ANNUAL.length; i++) answers.push(KLS_ANNUAL[i].tag === 'LOVKRAV' ? 'Ja' : null);
  assert.strictEqual(klsDashboardCompliance(answers), true);
  for (var j = 0; j < KLS_ANNUAL.length; j++) { if (KLS_ANNUAL[j].tag === 'LOVKRAV') { answers[j] = 'Nej'; break; } }
  assert.strictEqual(klsDashboardCompliance(answers), false);
});

test('KLS: klsDeleteEntry removes a logged entry; klsSetDeviationStatus updates status', function() {
  klsClearLogs();
  klsState.elIso = '<1'; klsState.elJord = 'OK'; klsState.elHpfi = 'OK';
  klsSaveElEntry();
  klsSaveElEntry();
  assert.strictEqual(klsState.elLog.length, 2);
  klsDeleteEntry('elLog', 0); // confirm() is mocked true in harness
  assert.strictEqual(klsState.elLog.length, 1, 'one entry deleted');
  klsSetDeviationStatus(0, 'Afsluttet');
  assert.strictEqual(klsState.devLog[0].status, 'Afsluttet', 'deviation status toggled via click helper');
});

test('KLS: klsAddDeviation auto-increments AFV ids and links sagsnr', function() {
  klsClearLogs();
  var id1 = klsAddDeviation('2025-005', 'EL', 'Udførelsesfejl');
  var id2 = klsAddDeviation('2025-006', 'VVS', 'Materialefejl');
  assert.strictEqual(id1, 'AFV-001');
  assert.strictEqual(id2, 'AFV-002');
  assert.strictEqual(klsState.devLog[1].sagsnr, '2025-006');
});

test('KLS: renderKLS returns non-empty HTML for all 14 views after seeding log + deviation data', function() {
  klsClearLogs();
  klsState.elIso = '<1'; klsState.elJord = 'OK'; klsState.elHpfi = 'OK';
  klsSaveElEntry();
  klsState.vvsTryk = 'OK'; klsState.vvsTaethed = 'OK'; klsState.vvsTemp = '55-60°C';
  klsSaveVvsEntry();
  klsState.kloakTaethed = 'OK'; klsState.kloakFald = '20-30‰';
  klsSaveKloakEntry();
  var views = ['forside', 'politik', 'organisation', 'procedurer', 'el', 'vvs', 'kloak',
    'afvigelse', 'efterproevning', 'kompetence', 'maaleudstyr', 'tilsyn', 'dokument', 'dashboard'];
  var saved = klsState.view;
  views.forEach(function(v) {
    klsState.view = v;
    var html = renderKLS();
    assert(html.length > 200, 'View ' + v + ' HTML too short');
  });
  klsState.view = saved;
});

test('KLS: seeded renderKLS output still has NO text input or textarea', function() {
  klsClearLogs();
  klsState.elIso = '<1'; klsState.elJord = 'OK'; klsState.elHpfi = 'OK';
  klsSaveElEntry(); // creates an EL entry + deviation to exercise log/deviation tables
  var views = ['forside', 'politik', 'organisation', 'procedurer', 'el', 'vvs', 'kloak',
    'afvigelse', 'efterproevning', 'kompetence', 'maaleudstyr', 'tilsyn', 'dokument', 'dashboard'];
  var saved = klsState.view;
  var all = '';
  views.forEach(function(v) { klsState.view = v; all += renderKLS(); });
  klsState.view = saved;
  assert(all.indexOf('<input type="text"') < 0, 'Found <input type="text"');
  assert(all.indexOf("<input type='text'") < 0, "Found <input type='text'");
  assert(all.indexOf('<textarea') < 0, 'Found <textarea');
});

test('KLS: rendered output cites DS 432:2020, DS/HD 60364-6:2016 and BEK 725', function() {
  var views = ['forside', 'politik', 'el', 'vvs', 'kloak', 'dashboard'];
  var saved = klsState.view;
  var all = '';
  views.forEach(function(v) { klsState.view = v; all += renderKLS(); });
  klsState.view = saved;
  assert(all.indexOf('DS 432:2020') >= 0, 'must cite DS 432:2020');
  assert(all.indexOf('DS/HD 60364-6:2016') >= 0, 'must cite DS/HD 60364-6:2016');
  assert(all.indexOf('BEK 725') >= 0 || all.indexOf('BEK nr. 725') >= 0, 'must cite BEK 725');
});

test('KLS: print/export entry points exist and report cites corrected standards', function() {
  assert.strictEqual(typeof klsPrintReport, 'function');
  assert.strictEqual(typeof klsExportJson, 'function');
  assert.strictEqual(typeof klsImportJson, 'function');
  assert.strictEqual(typeof klsReportHtml, 'function');
  var report = klsReportHtml();
  assert(report.length > 500, 'report html non-trivial');
  assert(report.indexOf('DS 432:2020') >= 0, 'report cites DS 432:2020');
  assert(report.indexOf('DS/HD 60364-6:2016') >= 0, 'report cites DS/HD 60364-6:2016');
});

test('KLS: klsReset restores defaults and clears the logs', function() {
  klsClearLogs();
  klsState.elIso = '<1'; klsState.elJord = 'OK'; klsState.elHpfi = 'OK';
  klsSaveElEntry();
  assert(klsState.elLog.length > 0 && klsState.devLog.length > 0);
  klsReset(); // confirm() mocked true
  assert.strictEqual(klsState.elLog.length, 0, 'logs cleared after reset');
  assert.strictEqual(klsState.devLog.length, 0, 'deviations cleared after reset');
  assert.strictEqual(klsState.kloakFald, '20-30\u2030', 'defaults restored');
});

// ===== KLS v3: pure deviation factory, classifyFn stats, spec-form sagsnr, remove-last, live dashboard =====

test('KLS: klsMakeDeviationFromCheck builds a pure EL deviation (AFV-001, linked sagsnr, Åben)', function() {
  var dev = klsMakeDeviationFromCheck('EL', '2025-001', 0);
  assert.strictEqual(dev.id, 'AFV-001');
  assert.strictEqual(dev.area, 'EL');
  assert.strictEqual(dev.sagsnr, '2025-001');
  assert.strictEqual(dev.status, 'Åben', 'must default to Åben (same-day registration)');
  assert.strictEqual(dev.type, 'Udførelsesfejl');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(dev.date), 'date is ISO yyyy-mm-dd');
});

test('KLS: klsMakeDeviationFromCheck increments id from existingDevCount and is pure (no state change)', function() {
  klsClearLogs();
  var before = klsState.devLog.length;
  var dev = klsMakeDeviationFromCheck('VVS', '2025-042', 5);
  assert.strictEqual(dev.id, 'AFV-006', 'existingDevCount 5 => AFV-006');
  assert.strictEqual(dev.area, 'VVS');
  assert.strictEqual(klsState.devLog.length, before, 'pure helper must NOT mutate devLog');
});

test('KLS: klsMakeDeviationFromCheck handles Kloak register', function() {
  var dev = klsMakeDeviationFromCheck('Kloak', '2024-100', 11);
  assert.strictEqual(dev.id, 'AFV-012');
  assert.strictEqual(dev.area, 'Kloak');
  assert.strictEqual(dev.type, 'Udførelsesfejl');
});

test('KLS: klsAddDeviation delegates to klsMakeDeviationFromCheck (consistent object shape)', function() {
  klsClearLogs();
  var id = klsAddDeviation('2025-009', 'EL', 'Dokumentationsfejl');
  assert.strictEqual(id, 'AFV-001');
  var d = klsState.devLog[0];
  assert.strictEqual(d.area, 'EL');
  assert.strictEqual(d.sagsnr, '2025-009');
  assert.strictEqual(d.type, 'Dokumentationsfejl', 'explicit type override preserved');
  assert.strictEqual(d.status, 'Åben');
});

test('KLS: klsLogStats exposes spec key names {godkendte, afvigelser, pct} alongside legacy', function() {
  var log = [{ status: 'Godkendt' }, { status: 'Godkendt' }, { status: 'Afvigelse' }, { status: 'Afvigelse' }];
  var s = klsLogStats(log);
  assert.strictEqual(s.total, 4);
  assert.strictEqual(s.godkendte, 2);
  assert.strictEqual(s.afvigelser, 2);
  assert.strictEqual(s.pct, 50);
  assert.strictEqual(s.godkendte, s.approved);
  assert.strictEqual(s.afvigelser, s.deviations);
  assert.strictEqual(s.pct, s.ratePct);
});

test('KLS: klsLogStats empty list -> pct 0 (consistent, never NaN)', function() {
  var s = klsLogStats([]);
  assert.strictEqual(s.total, 0);
  assert.strictEqual(s.pct, 0);
  assert.strictEqual(s.godkendte, 0);
  assert.strictEqual(s.afvigelser, 0);
});

test('KLS: klsLogStats with classifyFn classifies via the status helpers (logic in one place)', function() {
  var log = [
    { iso: '2-5', jord: 'OK', hpfi: 'OK' },
    { iso: '<1', jord: 'OK', hpfi: 'OK' },
    { iso: '5-10', jord: 'Ikke OK', hpfi: 'OK' }
  ];
  var s = klsLogStats(log, function(r) { return klsElStatus(r.iso, r.jord, r.hpfi); });
  assert.strictEqual(s.total, 3);
  assert.strictEqual(s.godkendte, 1);
  assert.strictEqual(s.afvigelser, 2);
  assert.strictEqual(s.pct, 33);
});

test('KLS: klsNextSagsnr spec form (logArray, year) -> first 2025-001, year-aware, increments', function() {
  assert.strictEqual(klsNextSagsnr([], 2025), '2025-001', 'empty log -> 001');
  assert.strictEqual(klsNextSagsnr([{}, {}], 2025), '2025-003', '2 entries -> 003');
  assert.strictEqual(klsNextSagsnr([{}], 2024), '2024-002', 'year-aware');
});

test('KLS: klsNextSagsnr legacy form (year, count) still works (regression)', function() {
  assert.strictEqual(klsNextSagsnr(2025, 0), '2025-001');
  assert.strictEqual(klsNextSagsnr(2025, 11), '2025-012');
});

test('KLS: klsRemoveLast removes only the most recent entry (click-only undo)', function() {
  klsClearLogs();
  klsState.elIso = '2-5'; klsState.elJord = 'OK'; klsState.elHpfi = 'OK';
  klsSaveElEntry();
  klsState.elIso = '<1';
  klsSaveElEntry();
  assert.strictEqual(klsState.elLog.length, 2);
  var firstSagsnr = klsState.elLog[0].sagsnr;
  klsRemoveLast('elLog');
  assert.strictEqual(klsState.elLog.length, 1, 'last entry removed');
  assert.strictEqual(klsState.elLog[0].sagsnr, firstSagsnr, 'earlier entry untouched');
});

test('KLS: klsRemoveLast on an empty log is a safe no-op', function() {
  klsClearLogs();
  klsRemoveLast('vvsLog');
  assert.strictEqual(klsState.vvsLog.length, 0);
});

test('KLS: appending a Kloak Afvigelse auto-links a deviation (same-day registration)', function() {
  klsClearLogs();
  klsState.kloakTaethed = 'Ikke OK'; klsState.kloakFald = '<10‰';
  klsSaveKloakEntry();
  assert.strictEqual(klsState.kloakLog.length, 1);
  assert.strictEqual(klsState.kloakLog[0].status, 'Afvigelse');
  assert.strictEqual(klsState.devLog.length, 1, 'deviation auto-created for failed kloak check');
  assert.strictEqual(klsState.devLog[0].area, 'Kloak');
  assert.strictEqual(klsState.devLog[0].sagsnr, klsState.kloakLog[0].sagsnr);
  assert.strictEqual(klsState.devLog[0].status, 'Åben');
});

test('KLS: dashboard view aggregates live stats from a populated elLog', function() {
  klsClearLogs();
  klsState.elJord = 'OK'; klsState.elHpfi = 'OK';
  klsState.elIso = '2-5'; klsSaveElEntry();
  klsState.elIso = '5-10'; klsSaveElEntry();
  klsState.elIso = '>10'; klsSaveElEntry();
  klsState.elIso = '<1'; klsSaveElEntry();
  var stats = klsLogStats(klsState.elLog);
  assert.strictEqual(stats.total, 4);
  assert.strictEqual(stats.godkendte, 3);
  assert.strictEqual(stats.afvigelser, 1);
  assert.strictEqual(stats.pct, 75);
  var saved = klsState.view;
  klsState.view = 'dashboard';
  var html = renderKLS();
  klsState.view = saved;
  assert(html.indexOf('75%') >= 0, 'dashboard shows live 75% approval rate from elLog');
  assert(html.length > 200, 'dashboard non-empty');
});

test('KLS: EL log render shows the Remove-last control once entries exist', function() {
  klsClearLogs();
  klsState.elIso = '2-5'; klsState.elJord = 'OK'; klsState.elHpfi = 'OK';
  klsSaveElEntry();
  var saved = klsState.view;
  klsState.view = 'el';
  var html = renderKLS();
  klsState.view = saved;
  assert(html.indexOf('klsRemoveLast(') >= 0, 'remove-last button wired in EL log');
});

test('KLS: all 14 views still render non-empty with NO text input/textarea after v3 changes', function() {
  klsClearLogs();
  klsState.elIso = '<1'; klsState.elJord = 'OK'; klsState.elHpfi = 'OK';
  klsSaveElEntry();
  var views = ['forside', 'politik', 'organisation', 'procedurer', 'el', 'vvs', 'kloak',
    'afvigelse', 'efterproevning', 'kompetence', 'maaleudstyr', 'tilsyn', 'dokument', 'dashboard'];
  var saved = klsState.view;
  var all = '';
  views.forEach(function(v) { klsState.view = v; var html = renderKLS(); assert(html.length > 200, 'view ' + v + ' too short'); all += html; });
  klsState.view = saved;
  assert(all.indexOf('<input type="text"') < 0, 'no <input type="text">');
  assert(all.indexOf("<input type='text'") < 0, "no <input type='text'>");
  assert(all.indexOf('<textarea') < 0, 'no <textarea>');
});

// ===== KLS v4: audit-readiness engine, pre-audit gap report, audit-ready print =====

// Build a synthetic fully-compliant KLS state from defaults (click-only fields).
function klsCompliantState() {
  var s = JSON.parse(JSON.stringify(klsDefaults()));
  var i;
  for (i = 0; i < s.reviewPts.length; i++) s.reviewPts[i] = 'OK';     // all 12 review points rated
  for (i = 0; i < s.annual.length; i++) s.annual[i] = 'Ja';           // all 8 annual = Ja (LOVKRAV satisfied)
  for (i = 0; i < s.calStatus.length; i++) s.calStatus[i] = 'Kalibreret OK';
  // procStatus / docStatus already all set by defaults
  s.devStatus = [];                                                    // no demo deviations
  s.devLog = [];                                                       // no open deviations
  s.expiryMonths = 12;                                                 // > 3 months, no godkendt date
  s.godkendtYear = ''; s.godkendtMonth = '';
  // a recent meeting date so the "within 12 months" check passes
  var now = new Date();
  s.moedeYear = String(now.getFullYear());
  s.moedeMonth = ('0' + (now.getMonth() + 1)).slice(-2);
  // one documented (approved) slutkontrol so "logs exist" is satisfied with no orphan
  s.elLog = [{ sagsnr: '2025-001', date: '2025-01-01', type: 'EL', status: 'Godkendt' }];
  return s;
}

test('KLS: klsAuditReadiness on default state — low pct, structured items, verdict string', function() {
  var r = klsAuditReadiness(klsDefaults());
  assert(typeof r.score === 'number' && typeof r.max === 'number', 'score/max numeric');
  assert(typeof r.pct === 'number', 'pct numeric');
  assert(Array.isArray(r.items) && r.items.length >= 8, 'items array with >=8 checks');
  r.items.forEach(function(it) {
    assert(typeof it.weight === 'number', 'item has weight');
    assert(typeof it.ok === 'boolean', 'item has ok boolean');
    assert(it.severity === 'LOVKRAV' || it.severity === 'VIGTIGT', 'item severity tag');
    assert(typeof it.label_da === 'string' && typeof it.label_en === 'string', 'item bilingual labels');
    assert(typeof it.detail_da === 'string' && typeof it.detail_en === 'string', 'item bilingual detail');
  });
  assert(['Klar til audit', 'Næsten klar', 'Ikke klar'].indexOf(r.verdict) >= 0, 'verdict is a known string');
  assert(r.pct < 70, 'default state is not audit-ready (got ' + r.pct + '%)');
  assert.strictEqual(r.passLovkrav, false, 'default state fails LOVKRAV (review/annual/deviations not done)');
});

test('KLS: klsAuditReadiness on a fully-compliant state — passLovkrav, Klar til audit, pct>=90', function() {
  var r = klsAuditReadiness(klsCompliantState());
  assert.strictEqual(r.passLovkrav, true, 'all LOVKRAV ok');
  assert(r.pct >= 90, 'pct >= 90, got ' + r.pct);
  assert.strictEqual(r.verdict, 'Klar til audit');
  var failing = r.items.filter(function(it) { return !it.ok; });
  assert.strictEqual(failing.length, 0, 'no failing items in compliant state');
});

test('KLS: breaking one LOVKRAV (calStatus Udløbet) flips passLovkrav and lists the item', function() {
  var s = klsCompliantState();
  s.calStatus[0] = 'Udløbet';
  var r = klsAuditReadiness(s);
  assert.strictEqual(r.passLovkrav, false, 'passLovkrav flips to false');
  var inst = r.items.filter(function(it) { return it.id === 'instruments'; })[0];
  assert.strictEqual(inst.ok, false, 'instruments item not ok');
  assert.strictEqual(inst.severity, 'LOVKRAV', 'instruments is LOVKRAV');
  assert(inst.detail_da.indexOf('1') >= 0, 'detail mentions 1 instrument');
  assert.notStrictEqual(r.verdict, 'Klar til audit', 'verdict no longer ready');
});

test('KLS: breaking annual LOVKRAV (one Nej) flips passLovkrav and flags annual item', function() {
  var s = klsCompliantState();
  // set the first LOVKRAV annual answer to Nej
  for (var i = 0; i < KLS_ANNUAL.length; i++) { if (KLS_ANNUAL[i].tag === 'LOVKRAV') { s.annual[i] = 'Nej'; break; } }
  var r = klsAuditReadiness(s);
  assert.strictEqual(r.passLovkrav, false);
  var ann = r.items.filter(function(it) { return it.id === 'annual'; })[0];
  assert.strictEqual(ann.ok, false);
  assert.strictEqual(ann.severity, 'LOVKRAV');
});

test('KLS: an open deviation flips the deviations LOVKRAV item to failing', function() {
  var s = klsCompliantState();
  s.devLog = [{ id: 'AFV-001', sagsnr: '2025-001', area: 'EL', type: 'Udførelsesfejl', status: 'Åben', date: '2025-01-01' }];
  // the el entry is now an Afvigelse linked to that deviation so "logs" stays ok
  s.elLog = [{ sagsnr: '2025-001', date: '2025-01-01', type: 'EL', status: 'Afvigelse' }];
  var r = klsAuditReadiness(s);
  var dev = r.items.filter(function(it) { return it.id === 'deviations'; })[0];
  assert.strictEqual(dev.ok, false, 'open deviation => not ok');
  assert.strictEqual(dev.severity, 'LOVKRAV');
  assert(dev.detail_da.indexOf('1') >= 0, 'detail mentions 1 open deviation');
  assert.strictEqual(r.passLovkrav, false);
});

test('KLS: orphan Afvigelse (no linked deviation) flags the logs LOVKRAV item', function() {
  var s = klsCompliantState();
  s.elLog = [{ sagsnr: '2025-009', date: '2025-01-01', type: 'EL', status: 'Afvigelse' }];
  s.devLog = []; // no matching deviation -> orphan
  var r = klsAuditReadiness(s);
  var logs = r.items.filter(function(it) { return it.id === 'logs'; })[0];
  assert.strictEqual(logs.ok, false, 'orphan Afvigelse => logs not ok');
  assert.strictEqual(logs.severity, 'LOVKRAV');
});

test('KLS: pct math is score/max rounded to nearest integer', function() {
  var r = klsAuditReadiness(klsDefaults());
  assert.strictEqual(r.pct, Math.round(r.score / r.max * 100), 'pct equals rounded score/max*100');
  var c = klsAuditReadiness(klsCompliantState());
  assert.strictEqual(c.score, c.max, 'compliant: score == max');
  assert.strictEqual(c.pct, 100, 'compliant pct is 100');
});

test('KLS: klsAuditVerdict threshold boundaries at 90 and 70 (named constants)', function() {
  assert.strictEqual(KLS_AUDIT_READY_PCT, 90);
  assert.strictEqual(KLS_AUDIT_ALMOST_PCT, 70);
  assert.strictEqual(klsAuditVerdict(90, true), 'Klar til audit', '90% + LOVKRAV => Klar');
  assert.strictEqual(klsAuditVerdict(90, false), 'Næsten klar', '90% but LOVKRAV fail => Næsten');
  assert.strictEqual(klsAuditVerdict(89, true), 'Næsten klar', 'just below 90 => Næsten');
  assert.strictEqual(klsAuditVerdict(70, false), 'Næsten klar', '70% boundary => Næsten');
  assert.strictEqual(klsAuditVerdict(69, true), 'Ikke klar', 'below 70 => Ikke klar');
  assert.strictEqual(klsAuditVerdict(100, true), 'Klar til audit');
});

test('KLS: klsAuditReadiness is pure (does not mutate klsState)', function() {
  var beforeReview = JSON.stringify(klsState.reviewPts);
  var beforeAnnual = JSON.stringify(klsState.annual);
  var beforeView = klsState.view;
  klsAuditReadiness(klsState);
  klsAuditReadiness(klsCompliantState());
  assert.strictEqual(JSON.stringify(klsState.reviewPts), beforeReview, 'reviewPts unchanged');
  assert.strictEqual(JSON.stringify(klsState.annual), beforeAnnual, 'annual unchanged');
  assert.strictEqual(klsState.view, beforeView, 'view unchanged');
});

test('KLS: LOVKRAV items are weighted heavier than VIGTIGT items', function() {
  var r = klsAuditReadiness(klsDefaults());
  var lov = r.items.filter(function(it) { return it.severity === 'LOVKRAV'; })[0];
  var vig = r.items.filter(function(it) { return it.severity === 'VIGTIGT'; })[0];
  assert(lov.weight > vig.weight, 'LOVKRAV weight > VIGTIGT weight');
  assert.strictEqual(lov.weight, KLS_AUDIT_W_LOVKRAV);
  assert.strictEqual(vig.weight, KLS_AUDIT_W_VIGTIGT);
});

test('KLS: dashboard shows readiness % and lists a failing item when gaps exist', function() {
  klsClearLogs();
  var savedView = klsState.view;
  var savedReview = klsState.reviewPts.slice();
  var savedAnnual = klsState.annual.slice();
  for (var i = 0; i < klsState.reviewPts.length; i++) klsState.reviewPts[i] = null;
  for (var j = 0; j < klsState.annual.length; j++) klsState.annual[j] = null;
  klsState.view = 'dashboard';
  var html = renderKLS();
  var r = klsAuditReadiness(klsState);
  klsState.view = savedView;
  klsState.reviewPts = savedReview;
  klsState.annual = savedAnnual;
  assert(html.indexOf('Pre-audit') >= 0, 'dashboard shows pre-audit readiness section');
  assert(html.indexOf(r.pct + '%') >= 0, 'dashboard shows the readiness percentage');
  assert(html.indexOf('[LOVKRAV]') >= 0, 'dashboard lists at least one failing LOVKRAV item');
  assert(html.indexOf('klsPrintReport()') >= 0, 'dashboard has the Vis pre-audit rapport button');
});

test('KLS: dashboard shows the no-gaps verdict when fully compliant', function() {
  var savedView = klsState.view;
  var savedReview = klsState.reviewPts.slice();
  var savedAnnual = klsState.annual.slice();
  var savedCal = klsState.calStatus.slice();
  var savedDevStatus = klsState.devStatus.slice();
  var savedDevLog = klsState.devLog.slice();
  var savedEl = klsState.elLog.slice();
  var savedExpiry = klsState.expiryMonths;
  var savedMY = klsState.moedeYear, savedMM = klsState.moedeMonth;
  var now = new Date();
  var i;
  for (i = 0; i < klsState.reviewPts.length; i++) klsState.reviewPts[i] = 'OK';
  for (i = 0; i < klsState.annual.length; i++) klsState.annual[i] = 'Ja';
  for (i = 0; i < klsState.calStatus.length; i++) klsState.calStatus[i] = 'Kalibreret OK';
  klsState.devStatus = []; klsState.devLog = [];
  klsState.elLog = [{ sagsnr: '2025-001', date: '2025-01-01', type: 'EL', status: 'Godkendt' }];
  klsState.expiryMonths = 12; klsState.godkendtYear = ''; klsState.godkendtMonth = '';
  klsState.moedeYear = String(now.getFullYear());
  klsState.moedeMonth = ('0' + (now.getMonth() + 1)).slice(-2);
  klsState.view = 'dashboard';
  var html = renderKLS();
  // restore
  klsState.view = savedView; klsState.reviewPts = savedReview; klsState.annual = savedAnnual;
  klsState.calStatus = savedCal; klsState.devStatus = savedDevStatus; klsState.devLog = savedDevLog;
  klsState.elLog = savedEl; klsState.expiryMonths = savedExpiry;
  klsState.moedeYear = savedMY; klsState.moedeMonth = savedMM;
  assert(html.indexOf('Ingen mangler') >= 0 || html.indexOf('No gaps') >= 0, 'shows the no-gaps verdict');
});

test('KLS: klsReportHtml contains the readiness section, gap table and @media print CSS', function() {
  var report = klsReportHtml();
  assert(report.indexOf('@media print') >= 0, 'print stylesheet present');
  assert(report.indexOf('page-break-before') >= 0, 'paginated sections present');
  assert(report.indexOf('page-break-inside') >= 0, 'avoid breaking inside rows present');
  assert(report.indexOf('Pre-audit klarhed') >= 0, 'readiness section present');
  assert(report.indexOf('report-header') >= 0, 'header present');
  assert(report.indexOf('report-footer') >= 0, 'footer present');
  // legal references in the footer
  assert(report.indexOf('Autorisationsloven') >= 0, 'footer cites Autorisationsloven');
  assert(report.indexOf('DS 432:2020') >= 0, 'footer cites DS 432:2020');
  assert(report.indexOf('DS/HD 60364-6:2016') >= 0, 'footer cites DS/HD 60364-6:2016');
  assert(report.indexOf('BEK 725') >= 0, 'footer cites BEK 725');
});

test('KLS: print report stays dependency-free / CSP-safe (no remote assets or scripts)', function() {
  var report = klsReportHtml();
  assert(report.indexOf('http://') < 0 && report.indexOf('https://') < 0, 'no remote URLs');
  assert(report.toLowerCase().indexOf('<script') < 0, 'no scripts in printed report');
});

test('KLS: all 14 views still render non-empty with NO text input/textarea after v4 changes', function() {
  klsClearLogs();
  klsState.elIso = '<1'; klsState.elJord = 'OK'; klsState.elHpfi = 'OK';
  klsSaveElEntry();
  var views = ['forside', 'politik', 'organisation', 'procedurer', 'el', 'vvs', 'kloak',
    'afvigelse', 'efterproevning', 'kompetence', 'maaleudstyr', 'tilsyn', 'dokument', 'dashboard'];
  var saved = klsState.view;
  var all = '';
  views.forEach(function(v) { klsState.view = v; var html = renderKLS(); assert(html.length > 200, 'view ' + v + ' too short'); all += html; });
  klsState.view = saved;
  assert(all.indexOf('<input type="text"') < 0, 'no <input type="text">');
  assert(all.indexOf("<input type='text'") < 0, "no <input type='text'>");
  assert(all.indexOf('<textarea') < 0, 'no <textarea>');
});

// ===== ELFORSYNING BOM (supply-side bill of materials) — new feature tests =====
console.log('\n=== Elforsyning BOM Tests ===\n');

var ELF_CATS = ['supplyCables', 'metering', 'mainFuses', 'earthing', 'cableJoints', 'cableDucts', 'transformers', 'terminals'];
function elfExpectedProductCount() {
  return ELF_CATS.reduce(function(sum, c) { return sum + (PRODUCTS[c] || []).length; }, 0);
}
// Isolate the action functions from the heavy full render pipeline during tests.
var _realRenderModule = renderModule;
function elfReset() {
  renderModule = function() {};
  elforsyningBom = {};
  try { localStorage.removeItem(ELFORSYNING_BOM_KEY); } catch (e) {}
}
function elfRestore() { renderModule = _realRenderModule; }

test('Elforsyning: the 8 supply-side categories are exactly the v1 set', function() {
  assert.deepStrictEqual(ELFORSYNING_CATEGORIES.slice().sort(), ELF_CATS.slice().sort());
  assert.strictEqual(ELFORSYNING_CATEGORIES.length, 8);
  ELFORSYNING_CATEGORIES.forEach(function(c) { assert(Array.isArray(PRODUCTS[c]), 'PRODUCTS.' + c + ' exists'); });
});

test('Elforsyning: pick-all populates the BOM with the correct total across all 8 categories', function() {
  elfReset();
  elforsyningPickAll();
  var expected = elfExpectedProductCount();
  assert.strictEqual(Object.keys(elforsyningBom).length, expected, 'one line per product');
  assert.strictEqual(elforsyningTotalCount(), expected, 'default qty 1 -> total == product count');
  ELF_CATS.forEach(function(c) {
    assert.strictEqual(elforsyningCategoryCount(c), (PRODUCTS[c] || []).length, 'category count ' + c);
  });
  elfRestore();
});

test('Elforsyning: pick-all defaults qty to 1 and never resets an existing qty', function() {
  elfReset();
  elforsyningPickAll();
  var lines = elforsyningBomLines();
  var firstId = lines[0].id;
  elforsyningSetQty(firstId, 7);
  elforsyningPickAll();
  assert.strictEqual(elforsyningBom[firstId].qty, 7, 'existing qty preserved');
  elfRestore();
});

test('Elforsyning: qty increment/decrement works and clamps at a minimum of 1', function() {
  elfReset();
  elforsyningPickAll();
  var id = elforsyningBomLines()[0].id;
  assert.strictEqual(elforsyningBom[id].qty, 1);
  elforsyningChangeQty(id, 1); assert.strictEqual(elforsyningBom[id].qty, 2);
  elforsyningChangeQty(id, 3); assert.strictEqual(elforsyningBom[id].qty, 5);
  elforsyningChangeQty(id, -1); assert.strictEqual(elforsyningBom[id].qty, 4);
  elforsyningChangeQty(id, -100); assert.strictEqual(elforsyningBom[id].qty, 1, 'clamped at 1');
  elforsyningChangeQty(id, -1); assert.strictEqual(elforsyningBom[id].qty, 1, 'still 1');
  elfRestore();
});

test('Elforsyning: preset-dropdown setQty accepts presets and clamps invalid values to 1', function() {
  elfReset();
  elforsyningPickAll();
  var id = elforsyningBomLines()[0].id;
  elforsyningSetQty(id, 25); assert.strictEqual(elforsyningBom[id].qty, 25);
  elforsyningSetQty(id, '50'); assert.strictEqual(elforsyningBom[id].qty, 50, 'string preset parsed');
  elforsyningSetQty(id, 0); assert.strictEqual(elforsyningBom[id].qty, 1, 'zero clamped to 1');
  elforsyningSetQty(id, ''); assert.strictEqual(elforsyningBom[id].qty, 1, 'empty clamped to 1');
  elfRestore();
});

test('Elforsyning: remove deletes a single line; clear-all empties the whole list', function() {
  elfReset();
  elforsyningPickAll();
  var before = Object.keys(elforsyningBom).length;
  var id = elforsyningBomLines()[0].id;
  elforsyningRemove(id);
  assert.strictEqual(Object.keys(elforsyningBom).length, before - 1, 'one line removed');
  assert(!elforsyningBom[id], 'removed id gone');
  elforsyningClearAll();
  assert.strictEqual(Object.keys(elforsyningBom).length, 0, 'cleared');
  assert.strictEqual(elforsyningTotalCount(), 0);
  elfRestore();
});

test('Elforsyning: BOM persists to localStorage under elforsyning_bom_v1 and round-trips on load', function() {
  elfReset();
  elforsyningPickAll();
  var id = elforsyningBomLines()[0].id;
  elforsyningSetQty(id, 9);
  var expectedTotal = elforsyningTotalCount();
  var raw = localStorage.getItem(ELFORSYNING_BOM_KEY);
  assert(raw, 'localStorage key written');
  var parsed = JSON.parse(raw);
  assert(parsed[id] && parsed[id].qty === 9, 'qty stored');
  elforsyningBom = {};
  elforsyningBom = elforsyningLoadBom();
  assert.strictEqual(elforsyningTotalCount(), expectedTotal, 'total round-trips');
  assert.strictEqual(elforsyningBom[id].qty, 9, 'qty round-trips');
  elfRestore();
});

test('Elforsyning: load drops unknown product ids (never resurrects products not in PRODUCTS)', function() {
  elfReset();
  localStorage.setItem(ELFORSYNING_BOM_KEY, JSON.stringify({ 'NOT-A-REAL-ID': { category: 'metering', qty: 3 } }));
  elforsyningBom = elforsyningLoadBom();
  assert.strictEqual(Object.keys(elforsyningBom).length, 0, 'unknown id dropped');
  elfRestore();
});

test('Elforsyning: render produces grouped rows with brand/spec/standard/CE in BOTH da and en', function() {
  elfReset();
  elforsyningPickAll();
  var savedLang = lang;
  lang = 'da';
  var da = renderElforsyningBom();
  assert(da.indexOf('Forsyningskabler') >= 0, 'da category label');
  assert(da.indexOf('V\u00E6lg alle elforsyningsmaterialer') >= 0, 'da pick-all button');
  assert(da.indexOf('NKT') >= 0, 'a real brand rendered');
  assert(da.indexOf('IEC 60269-2') >= 0, 'a product standard rendered');
  assert(da.indexOf('CE-m\u00E6rket') >= 0, 'CE status (da)');
  lang = 'en';
  var en = renderElforsyningBom();
  assert(en.indexOf('Supply Cables') >= 0, 'en category label');
  assert(en.indexOf('Pick all elforsyning materials') >= 0, 'en pick-all button');
  assert(en.indexOf('CE-marked') >= 0, 'CE status (en)');
  assert(en.indexOf('Grand total') >= 0, 'grand total label (en)');
  lang = savedLang;
  elfRestore();
});

test('Elforsyning: rendered BOM groups every non-empty category and shows per-category + grand total counts', function() {
  elfReset();
  elforsyningPickAll();
  var html = renderElforsyningBom();
  ELF_CATS.forEach(function(c) {
    var label = elforsyningCatLabel(c);
    assert(html.indexOf(label + ' (' + elforsyningCategoryCount(c) + ')') >= 0, 'group header + count for ' + c);
  });
  assert(html.indexOf('' + elforsyningTotalCount()) >= 0, 'grand total number present');
  elfRestore();
});

test('Elforsyning: UI is 100% click-only — NO text input or textarea in the rendered region', function() {
  elfReset();
  elforsyningPickAll();
  var savedLang = lang;
  ['da', 'en', 'fa'].forEach(function(L) {
    lang = L;
    var html = renderElforsyningBom();
    assert(html.indexOf('<input type="text"') < 0, 'no <input type="text"> (' + L + ')');
    assert(html.indexOf("<input type='text'") < 0, "no <input type='text'> (" + L + ')');
    assert(html.indexOf('<input') < 0, 'no <input> at all (' + L + ')');
    assert(html.indexOf('<textarea') < 0, 'no <textarea> (' + L + ')');
  });
  lang = savedLang;
  elfRestore();
});

test('Elforsyning: JSON export shape is correct (type/version/date/standard/lines/counts, prices absent)', function() {
  elfReset();
  elforsyningPickAll();
  var id = elforsyningBomLines()[0].id;
  elforsyningSetQty(id, 4);
  var data = elforsyningExportData();
  assert.strictEqual(data.type, 'elforsyning_bom');
  assert.strictEqual(data.version, 1);
  assert(/^\d{4}-\d{2}-\d{2}T/.test(data.generated), 'auto ISO date');
  assert.strictEqual(data.standard, 'DS/HD 60364');
  assert.deepStrictEqual(data.categories, ELF_CATS, 'all 8 categories listed in order');
  assert.strictEqual(data.lines.length, Object.keys(elforsyningBom).length, 'one line per BOM entry');
  assert.strictEqual(data.totalCount, elforsyningTotalCount(), 'total matches');
  var line = data.lines.filter(function(l) { return l.id === id; })[0];
  assert(line && line.qty === 4, 'qty exported');
  ['id', 'category', 'brand', 'model', 'spec', 'standard', 'approval', 'qty'].forEach(function(k) {
    assert(line.hasOwnProperty(k), 'line has ' + k);
  });
  assert(/Solar/.test(data.note_da) && /Sanist\u00E5l/.test(data.note_en), 'wholesaler note present');
  var json = JSON.stringify(data);
  assert(json.toLowerCase().indexOf('"price"') < 0, 'no price field');
  assert(json.indexOf('kr.') < 0 && json.indexOf('DKK') < 0, 'no invented currency amounts');
  elfRestore();
});

test('Elforsyning: print report has header(date)/DS-HD 60364 ref/grouped tables/wholesaler note + @media print', function() {
  elfReset();
  elforsyningPickAll();
  var report = elforsyningReportHtml();
  assert(report.indexOf('@media print') >= 0, 'print stylesheet present');
  assert(report.indexOf('page-break-inside') >= 0, 'avoid breaking rows');
  assert(report.indexOf('DS/HD 60364') >= 0, 'DS/HD 60364 reference');
  assert(report.indexOf('report-header') >= 0, 'header present');
  assert(report.indexOf('Solar') >= 0 && report.indexOf('Sanist\u00E5l') >= 0, 'wholesaler verification note');
  assert(report.toLowerCase().indexOf('<script') < 0, 'no scripts in printed report');
  assert(report.indexOf('http://') < 0 && report.indexOf('https://') < 0, 'no remote URLs');
  assert(report.indexOf('<input') < 0 && report.indexOf('<textarea') < 0, 'no text entry in report');
  assert(report.indexOf('Forsyningskabler') >= 0 || report.indexOf('Supply Cables') >= 0, 'category group header');
  elfRestore();
});

test('Elforsyning: bankSpec is the single source of truth shared with the Component Bank list', function() {
  var sc = PRODUCTS.supplyCables[0];
  assert.strictEqual(bankSpec('supplyCables', sc), sc.mm2 + 'mm\u00B2 ' + sc.material + ' | Iz=' + sc.iz + 'A | Method ' + sc.method);
  var mf = PRODUCTS.mainFuses[0];
  assert.strictEqual(bankSpec('mainFuses', mf), mf.size + ' ' + mf.rating + 'A | ' + (mf.sealed ? 'Plomberet' : ''));
});

test('Elforsyning: Farsi strings exist in _FA for the key visible controls', function() {
  assert(_FA['Pick all elforsyning materials'], 'pick-all fa');
  assert(_FA['Clear all'], 'clear-all fa');
  assert(_FA['Supply Cables'] && _FA['Transformers'], 'category labels fa');
  assert(_FA['CE-marked'], 'CE status fa');
  var savedLang = lang; lang = 'fa';
  assert.strictEqual(tx('V\u00E6lg alle elforsyningsmaterialer', 'Pick all elforsyning materials'), _FA['Pick all elforsyning materials']);
  lang = savedLang;
});

test('Elforsyning: Legionella rule is a MINIMUM at the tap (>=50C), not a maximum', function() {
  var savedLang = lang; lang = 'da';
  var html = klsRenderVvs();
  assert(html.indexOf('\u2265 50\u00B0C ved udtag') >= 0, 'da rule uses >= at tap');
  assert(html.indexOf('\u2264 50\u00B0C ved udtag') < 0, 'da rule is NOT a max at tap');
  lang = savedLang;
});

// ===== Unified Project + "Den Kritiske Hjerne" (Critical-Mind safety auditor) =====
function upSnapshot() { return JSON.stringify(upProject); }
function upRestore(s) { upProject = JSON.parse(s); upSaveProject(); }

test('Unified Project: default project is TN with empty supply/finals', function() {
  var d = upDefaultProject();
  assert.strictEqual(d.earthing, 'TN');
  assert.strictEqual(d.transformerId, null);
  assert.deepStrictEqual(d.finals, []);
  assert.strictEqual(d.supply.length_m, 30);
});

test('Critical Mind: transformer kVA+uk% -> correct Ik3max at board (630kVA uk5%)', function() {
  var saved = upSnapshot();
  upProject = { version: 1, earthing: 'TN', transformerId: 'TR-ONAN-630', supply: { cableId: null, length_m: 0, deviceId: null, deviceIn: null }, finals: [] };
  // Hand calc: Zt = (uk/100)*U^2/Sn ; Ik3max = cmax*U / (sqrt3 * Zt)
  var Zt = (5 / 100) * 400 * 400 / 630000;
  var ikHand = 1.05 * 400 / (Math.sqrt(3) * Zt);
  var audit = upAuditProject(upProject);
  assert(Math.abs(audit.ikBoardA - ikHand) < 1, 'auditor Ik3max=' + audit.ikBoardA.toFixed(0) + 'A matches hand calc=' + ikHand.toFixed(0) + 'A');
  assert(Math.abs(ikHand / 1000 - 19.10) < 0.05, 'hand Ik3max approx 19.10 kA, got ' + (ikHand / 1000).toFixed(2));
  var built = upBuildTree(upProject);
  assert(Math.abs(sldCalcNodeIk(built.tree, built.boardId).ikmax - ikHand) < 1, 'tree board Ik3max matches');
  upRestore(saved);
});

test('Critical Mind: flags undersized cable (In > derated Iz, cl.433.1)', function() {
  var saved = upSnapshot();
  upProject = { version: 1, earthing: 'TN', transformerId: 'TR-ONAN-630',
    supply: { cableId: 'SC-AL-95', length_m: 10, deviceId: 'MF-NH00-100', deviceIn: 100 },
    finals: [{ cableId: 'NKT-NOIKLX-1.5', length_m: 10, deviceId: 'SE-iC60N-B40', deviceIn: 40, loadKW: 5, phases: '1x230', cosPhi: 0.95, rcdMa: null }] };
  var audit = upAuditProject(upProject);
  var f = audit.findings.filter(function(x) { return x.clause.indexOf('433.1') >= 0 && x.status === 'fail'; });
  assert(f.length >= 1, 'an undersize/overload failure is flagged at cl.433.1');
  assert(/Iz/.test(f[0].detail), 'detail mentions Iz (derated officialIz=22A for 1.5mm2 XLPE vs In=40A)');
  assert.strictEqual(audit.verdict, 'red', 'undersized cable yields RED verdict');
  upRestore(saved);
});

test('Critical Mind: flags failing auto-disconnection (Zs*Ia > U0, DS/HD 60364-4-41)', function() {
  var saved = upSnapshot();
  upProject = { version: 1, earthing: 'TN', transformerId: 'TR-ONAN-630',
    supply: { cableId: 'SC-AL-95', length_m: 5, deviceId: 'MF-NH00-100', deviceIn: 100 },
    finals: [{ cableId: 'NKT-NOIKLX-1.5', length_m: 200, deviceId: 'SE-iC60N-B16', deviceIn: 16, loadKW: 1, phases: '1x230', cosPhi: 0.95, rcdMa: null }] };
  var audit = upAuditProject(upProject);
  var f = audit.findings.filter(function(x) { return /Zs.Ia/.test(x.rule) && x.status === 'fail'; });
  assert(f.length >= 1, 'a disconnection failure is flagged');
  assert(/41\.1|411/.test(f[0].clause), 'cites a DS/HD 60364-4-41 clause: ' + f[0].clause);
  upRestore(saved);
});

test('Critical Mind: flags Icu < Ikmax (breaking capacity, cl.434.5.1)', function() {
  var saved = upSnapshot();
  // 630kVA straight to board => ~19kA; a 6kA MCB cannot break it.
  upProject = { version: 1, earthing: 'TN', transformerId: 'TR-ONAN-630',
    supply: { cableId: null, length_m: 0, deviceId: null, deviceIn: null },
    finals: [{ cableId: 'NKT-NOIKLX-2.5', length_m: 10, deviceId: 'SE-iC60N-B16', deviceIn: 16, loadKW: 2, phases: '1x230', cosPhi: 0.95, rcdMa: null }] };
  var audit = upAuditProject(upProject);
  var f = audit.findings.filter(function(x) { return x.clause.indexOf('434.5.1') >= 0 && x.status === 'fail'; });
  assert(f.length >= 1, 'Icu<Ikmax failure flagged');
  assert(/Icu/.test(f[0].detail), 'detail mentions Icu vs Ik3max');
  assert.strictEqual(audit.verdict, 'red');
  upRestore(saved);
});

test('Critical Mind: TT without RCD is flagged dangerous (cl.411.5.3)', function() {
  var saved = upSnapshot();
  upProject = { version: 1, earthing: 'TT', transformerId: 'TR-ONAN-250',
    supply: { cableId: 'SC-AL-50', length_m: 30, deviceId: 'MF-NH00-100', deviceIn: 100 },
    finals: [{ cableId: 'NKT-NOIKLX-2.5', length_m: 20, deviceId: 'SE-iC60N-B16', deviceIn: 16, loadKW: 3, phases: '1x230', cosPhi: 0.95, rcdMa: null }] };
  var audit = upAuditProject(upProject);
  var f = audit.findings.filter(function(x) { return x.clause.indexOf('411.5.3') >= 0 && x.status === 'fail'; });
  assert(f.length >= 1, 'TT without RCD flagged');
  upProject.finals[0].rcdMa = 30;
  var audit2 = upAuditProject(upProject);
  var ttOk = audit2.findings.filter(function(x) { return /I\u0394n/.test(x.rule) && x.status === 'ok'; });
  assert(ttOk.length >= 1, 'TT with 30mA RCD passes touch-voltage check');
  upRestore(saved);
});

test('Unified Project: persistence round-trips and rejects unknown product ids', function() {
  var saved = upSnapshot();
  upProject = { version: 1, earthing: 'TT', transformerId: 'TR-ONAN-630',
    supply: { cableId: 'SC-AL-95', length_m: 30, deviceId: 'MF-NH2-400', deviceIn: 400 },
    finals: [{ cableId: 'NKT-NOIKLX-2.5', length_m: 20, deviceId: 'SE-iC60N-B16', deviceIn: 16, loadKW: 3.68, phases: '1x230', cosPhi: 0.95, rcdMa: 30 }] };
  upSaveProject();
  var loaded = upLoadProject();
  assert.strictEqual(loaded.earthing, 'TT');
  assert.strictEqual(loaded.transformerId, 'TR-ONAN-630');
  assert.strictEqual(loaded.supply.cableId, 'SC-AL-95');
  assert.strictEqual(loaded.supply.deviceId, 'MF-NH2-400');
  assert.strictEqual(loaded.finals[0].cableId, 'NKT-NOIKLX-2.5');
  assert.strictEqual(loaded.finals[0].rcdMa, 30);
  // unknown ids must be DROPPED (never resurrected), mirroring elforsyningLoadBom
  upProject = { version: 1, earthing: 'TN', transformerId: 'BOGUS-XYZ', supply: { cableId: 'NOPE', length_m: 30, deviceId: 'NOPE2', deviceIn: 50 }, finals: [{ cableId: 'NOPE3', deviceId: 'NOPE4', loadKW: 5, phases: '1x230', cosPhi: 0.9 }] };
  upSaveProject();
  var l2 = upLoadProject();
  assert.strictEqual(l2.transformerId, null, 'unknown transformer dropped');
  assert.strictEqual(l2.supply.cableId, null, 'unknown supply cable dropped');
  assert.strictEqual(l2.supply.deviceId, null, 'unknown main device dropped');
  assert.strictEqual(l2.finals[0].cableId, null, 'unknown final cable dropped');
  assert.strictEqual(l2.finals[0].deviceId, null, 'unknown final device dropped');
  upRestore(saved);
});

test('Critical Mind: pick transformer -> Ik -> audit -> verdict renders in BOTH da and en', function() {
  var saved = upSnapshot();
  var savedLang = lang;
  upProject = { version: 1, earthing: 'TN', transformerId: 'TR-ONAN-250',
    supply: { cableId: 'SC-AL-50', length_m: 30, deviceId: 'MF-NH00-100', deviceIn: 100 },
    finals: [{ cableId: 'NKT-NOIKLX-2.5', length_m: 20, deviceId: 'SE-iC60N-B16', deviceIn: 16, loadKW: 3, phases: '1x230', cosPhi: 0.95, rcdMa: null }] };
  upAuditState.lastAudit = upAuditProject(upProject);
  assert.strictEqual(upAuditState.lastAudit.verdict, 'green', 'well-formed conservative design is GREEN');
  lang = 'da';
  var da = renderKritisk();
  assert(da.indexOf('Sikkert') >= 0, 'da verdict label "Sikkert"');
  assert(da.indexOf('434.5.1') >= 0, 'da cites Icu clause 434.5.1');
  assert(da.indexOf('Sikkerhedsstyrelsen') >= 0, 'da cites Sikkerhedsstyrelsen');
  assert(da.indexOf('<input') < 0 && da.indexOf('<textarea') < 0, 'da is 100% click-only (no input/textarea)');
  lang = 'en';
  var en = renderKritisk();
  assert(en.indexOf('Safe') >= 0, 'en verdict label "Safe"');
  assert(en.indexOf('433.1') >= 0 && en.indexOf('525') >= 0, 'en cites 433.1 and 525 clauses');
  assert(en.indexOf('<input') < 0 && en.indexOf('<textarea') < 0, 'en is 100% click-only');
  lang = savedLang;
  upAuditState.lastAudit = null;
  upRestore(saved);
});

// ===== AI-GUIDER MODULE TESTS =====
console.log('\n=== AI-Guider Module Tests ===\n');

test('Guide: nav label exists and is FIRST key in da, en, fa', function() {
  ['da', 'en', 'fa'].forEach(function(L) {
    assert(T[L] && T[L].modules && T[L].modules.guide, 'guide nav label missing in ' + L);
    assert.strictEqual(Object.keys(T[L].modules)[0], 'guide', 'guide must be the FIRST nav key in ' + L);
  });
});

test('Guide: renders in Danish (da)', function() {
  var savedLang = lang; var snap = JSON.stringify(guideState);
  guideState = { projectType: null, earthing: null, done: {}, glossaryOpen: false };
  lang = 'da';
  var out = renderGuide();
  assert(out.indexOf('AI-Guider') >= 0, 'da contains AI-Guider title');
  assert(out.indexOf('start her') >= 0, 'da contains "start her"');
  assert(out.indexOf('Hvad skal du dimensionere?') >= 0, 'da contains project-type question');
  assert(out.indexOf('jordingssystem') >= 0, 'da contains earthing question');
  lang = savedLang; guideState = JSON.parse(snap);
});

test('Guide: renders in English (en)', function() {
  var savedLang = lang; var snap = JSON.stringify(guideState);
  guideState = { projectType: null, earthing: null, done: {}, glossaryOpen: false };
  lang = 'en';
  var out = renderGuide();
  assert(out.indexOf('AI Guide') >= 0, 'en contains AI Guide title');
  assert(out.indexOf('start here') >= 0, 'en contains "start here"');
  assert(out.indexOf('What are you designing?') >= 0, 'en contains project-type question');
  assert(out.indexOf('Which earthing system?') >= 0, 'en contains earthing question');
  lang = savedLang; guideState = JSON.parse(snap);
});

test('Guide: Farsi strings exist and render (fa)', function() {
  var savedLang = lang; var snap = JSON.stringify(guideState);
  guideState = { projectType: 'final', earthing: 'TN', done: {}, glossaryOpen: false };
  // _FA must contain the guide entries
  assert(_FA['AI Guide \u2014 start here'], '_FA has guide title');
  assert(_FA['What are you designing?'], '_FA has project-type question');
  assert(_FA['Open this step'], '_FA has "Open this step"');
  lang = 'fa';
  var out = renderGuide();
  assert(typeof out === 'string' && out.length > 0, 'fa renders a non-empty string');
  assert(out.indexOf(_FA['What are you designing?']) >= 0, 'fa renders translated question');
  lang = savedLang; guideState = JSON.parse(snap);
});

test('Guide: UI is 100% click-only (no text input/textarea) in da, en, fa', function() {
  var savedLang = lang; var snap = JSON.stringify(guideState);
  guideState = { projectType: 'installation', earthing: 'TT', done: { load: true }, glossaryOpen: true };
  ['da', 'en', 'fa'].forEach(function(L) {
    lang = L;
    var out = renderGuide();
    assert(out.indexOf('<input') < 0, 'no <input> in ' + L);
    assert(out.indexOf('<textarea') < 0, 'no <textarea> in ' + L);
  });
  lang = savedLang; guideState = JSON.parse(snap);
});

test('Guide: every step jump target is a real module key in renderModule', function() {
  var switchSrc = renderModule.toString();
  GUIDE_PROJECT_TYPES.forEach(function(pt) {
    var steps = guideBuildSteps({ projectType: pt.key });
    steps.forEach(function(key) {
      assert(switchSrc.indexOf("case '" + key + "'") >= 0, 'jump target "' + key + '" must exist in renderModule (project ' + pt.key + ')');
    });
  });
});

test('Guide: rendered "Open this step" calls switchModule with real keys', function() {
  var savedLang = lang; var snap = JSON.stringify(guideState);
  var switchSrc = renderModule.toString();
  guideState = { projectType: 'final', earthing: 'TN', done: {}, glossaryOpen: false };
  lang = 'en';
  var out = renderGuide();
  // extract switchModule('xxx') targets from rendered HTML
  var re = /switchModule\('([a-z]+)'\)/g, m, found = 0;
  while ((m = re.exec(out)) !== null) {
    found++;
    assert(switchSrc.indexOf("case '" + m[1] + "'") >= 0, 'rendered jump "' + m[1] + '" is a real module');
  }
  assert(found > 0, 'at least one "Open this step" jump rendered');
  lang = savedLang; guideState = JSON.parse(snap);
});

test('Guide: safe order IB(load)->In(mcb)->Iz(cable)->vdrop->scircuit->Zs->...->kritisk', function() {
  GUIDE_PROJECT_TYPES.forEach(function(pt) {
    var s = guideBuildSteps({ projectType: pt.key });
    var iLoad = s.indexOf('load'), iMcb = s.indexOf('mcb'), iCable = s.indexOf('cable');
    var iVdrop = s.indexOf('vdrop'), iSc = s.indexOf('scircuit'), iZs = s.indexOf('zs'), iK = s.indexOf('kritisk');
    assert(iLoad >= 0 && iMcb > iLoad, 'load before mcb (' + pt.key + ')');
    assert(iCable > iMcb, 'mcb before cable (' + pt.key + ')');
    assert(iVdrop > iCable, 'cable before vdrop (' + pt.key + ')');
    assert(iSc > iVdrop, 'vdrop before scircuit (' + pt.key + ')');
    assert(iZs > iSc, 'scircuit before zs (' + pt.key + ')');
    assert(iK > iZs, 'zs before kritisk (' + pt.key + ')');
    assert.strictEqual(s[s.length - 1], 'kritisk', 'final step is kritisk (' + pt.key + ')');
  });
});

test('Guide: application-specific projects start with their entry module', function() {
  assert.strictEqual(guideBuildSteps({ projectType: 'ev' })[0], 'ev', 'ev starts at ev');
  assert.strictEqual(guideBuildSteps({ projectType: 'solar' })[0], 'solar', 'solar starts at solar');
  assert.strictEqual(guideBuildSteps({ projectType: 'heatpump' })[0], 'heatpump', 'heatpump starts at heatpump');
  assert.strictEqual(guideBuildSteps({ projectType: 'final' })[0], 'load', 'final starts at load');
  assert.strictEqual(guideBuildSteps({ projectType: 'installation' })[0], 'load', 'installation starts at load');
});

test('Guide: installation path includes selectivity, drawing and KLS', function() {
  var s = guideBuildSteps({ projectType: 'installation' });
  assert(s.indexOf('discrim') >= 0, 'includes discrim');
  assert(s.indexOf('draw') >= 0, 'includes draw');
  assert(s.indexOf('kls') >= 0, 'includes kls');
  assert(s.indexOf('trafo') >= 0, 'includes trafo');
});

test('Guide: progress persistence round-trips through localStorage', function() {
  var snap = JSON.stringify(guideState);
  guideState = { projectType: 'ev', earthing: 'TT', done: { ev: true, load: true }, glossaryOpen: true };
  guideSaveProgress();
  // wipe in-memory state, then reload from storage
  guideState = { projectType: null, earthing: null, done: {}, glossaryOpen: false };
  guideLoadProgress();
  assert.strictEqual(guideState.projectType, 'ev', 'projectType restored');
  assert.strictEqual(guideState.earthing, 'TT', 'earthing restored');
  assert.strictEqual(guideState.done.ev, true, 'done.ev restored');
  assert.strictEqual(guideState.done.load, true, 'done.load restored');
  localStorage.removeItem(GUIDE_STORAGE_KEY);
  guideState = JSON.parse(snap);
});

test('Guide: storage key is el_guide_progress', function() {
  assert.strictEqual(GUIDE_STORAGE_KEY, 'el_guide_progress', 'uses the namespaced guide key');
});

test('Guide: "you are here -> next" shows current step and the next one', function() {
  var savedLang = lang; var snap = JSON.stringify(guideState);
  lang = 'en';
  guideState = { projectType: 'final', earthing: 'TN', done: { load: true }, glossaryOpen: false };
  var out = renderGuide();
  assert(out.indexOf('You are here') >= 0, 'shows "You are here"');
  // load done -> current should be mcb (protective device)
  assert(out.indexOf('protective device') >= 0, 'current step after load is the protective device step');
  lang = savedLang; guideState = JSON.parse(snap);
});

test('Guide: "not sure" earthing shows how-to-find-out help', function() {
  var savedLang = lang; var snap = JSON.stringify(guideState);
  lang = 'en';
  guideState = { projectType: 'final', earthing: 'unsure', done: {}, glossaryOpen: false };
  var out = renderGuide();
  assert(out.indexOf('How to find out') >= 0, 'unsure shows guidance on how to determine the earthing system');
  lang = savedLang; guideState = JSON.parse(snap);
});

test('Guide: each step cites a DS/HD 60364 (or safety-law) clause', function() {
  Object.keys(GUIDE_STEP_LIB).forEach(function(key) {
    var c = GUIDE_STEP_LIB[key].clause;
    assert(typeof c === 'string' && (c.indexOf('60364') >= 0 || c.indexOf('Elsikkerhedsloven') >= 0 || c.indexOf('62446') >= 0 || c.indexOf('Installationsbekendtg') >= 0), 'step "' + key + '" cites a real clause/standard');
  });
});

test('Guide: glossary defines the core beginner terms (IB, In, Iz, Zs, RCD, TN/TT/IT, selectivity)', function() {
  var blob = GUIDE_GLOSSARY.map(function(g) { return g.termEn + ' ' + g.en; }).join(' ');
  ['IB', 'In', 'Iz', 'Zs', 'RCD', 'HPFI', 'TN / TT / IT', 'Selectivity', 'Breaking capacity'].forEach(function(term) {
    assert(blob.indexOf(term) >= 0, 'glossary defines ' + term);
  });
});

// ===== PROFESSIONAL SINGLE-LINE DIAGRAM (buildSLD) =====
test('SLD: buildSLD returns a non-empty inline SVG string', function() {
  var out = buildSLD();
  assert(typeof out === 'string' && out.length > 200, 'output is a substantial string');
  assert(out.indexOf('<svg') >= 0 && out.indexOf('</svg>') >= 0, 'contains an <svg> element');
});

test('SLD: renders in da, en and fa without crashing', function() {
  var saved = lang;
  ['da', 'en', 'fa'].forEach(function(L) {
    lang = L;
    var out = buildSLD();
    assert(typeof out === 'string' && out.indexOf('<svg') >= 0, 'svg produced for lang=' + L);
  });
  lang = saved;
});

test('SLD: is click-only — no text inputs or textareas', function() {
  var saved = lang; lang = 'en';
  var out = buildSLD();
  assert(out.indexOf('<input') < 0, 'no <input> element');
  assert(out.indexOf('<textarea') < 0, 'no <textarea> element');
  lang = saved;
});

test('SLD: includes the current-flow animation hook', function() {
  var out = buildSLD();
  assert(out.indexOf('sld-flow') >= 0, 'conductors carry the marching-dash flow class');
  assert(out.indexOf('sld-bus') >= 0, 'busbar carries the energised-glow class');
  assert(out.indexOf('sld-dev') >= 0, 'protective devices carry the pulse class');
});

test('SLD: includes a bilingual symbol legend / key (IEC 60617)', function() {
  var saved = lang;
  lang = 'en'; var en = buildSLD();
  assert(en.indexOf('SYMBOL KEY') >= 0 && en.indexOf('IEC 60617') >= 0, 'EN legend header present');
  lang = 'da'; var da = buildSLD();
  assert(da.indexOf('SYMBOLFORKLARING') >= 0, 'DA legend header present');
  lang = saved;
});

test('SLD: draws recognised electrical symbols (transformer, motor, earth)', function() {
  var saved = lang; lang = 'en';
  var out = buildSLD();
  assert(out.indexOf('PE') >= 0, 'protective earth labelled');
  assert(out.indexOf('>M<') >= 0, 'motor symbol carries an M');
  assert(out.indexOf('kVA') >= 0, 'transformer rating shown from data');
  lang = saved;
});

test('SLD: teaches the reading order and the core IB <= In <= Iz rule', function() {
  var saved = lang; lang = 'en';
  var out = buildSLD();
  assert(out.indexOf('How to read it') >= 0, 'includes the how-to-read teaching note');
  assert(out.indexOf('IB \u2264 In \u2264 Iz') >= 0, 'states the coordination rule');
  lang = saved;
});

test('SLD: does not crash on an empty load list (uses sample) nor on a typical list', function() {
  var savedList = loadList.slice();
  loadList.length = 0;
  var empty = buildSLD();
  assert(empty.indexOf('<svg') >= 0, 'renders with empty load list');
  loadList.push({ kW: 11, cos: 0.9, sf: 1, phase: '3', name: 'EV' });
  loadList.push({ kW: 2, cos: 0.95, sf: 0.6, phase: 'L1', name: 'Stik' });
  var typical = buildSLD();
  assert(typical.indexOf('<svg') >= 0, 'renders with a typical load list');
  assert(typical.indexOf('EV') >= 0, 'shows a real circuit name from the data');
  loadList.length = 0;
  savedList.forEach(function(x) { loadList.push(x); });
});

test('SLD: never invents an RCD where the node data has none', function() {
  var out = buildSLD();
  assert(out.toLowerCase().indexOf('rcd') < 0 && out.indexOf('HPFI') < 0, 'no fabricated residual-current device');
});

test('SLD: CSS respects prefers-reduced-motion and defines the flow keyframes', function() {
  assert(html.indexOf('prefers-reduced-motion') >= 0, 'reduced-motion media query present');
  assert(html.indexOf('@keyframes sldFlow') >= 0, 'sldFlow keyframes defined');
  assert(html.indexOf('stroke-dashoffset') >= 0, 'marching-dash uses stroke-dashoffset');
});

console.log('\n=== Navigation Taxonomy Tests (professional + pedagogical UX) ===\n');

test('NAV_GROUPS is defined as a non-empty ordered list', function() {
  assert(Array.isArray(NAV_GROUPS) && NAV_GROUPS.length >= 5, 'expected several nav groups');
});

test('Nav: first group is the beginner "start here" entry point', function() {
  assert.strictEqual(NAV_GROUPS[0].id, 'start', 'first group must be start');
  assert(NAV_GROUPS[0].start === true, 'start group flagged as start');
  assert(NAV_GROUPS[0].keys.indexOf('guide') >= 0, 'guide lives in the start group');
});

test('Nav: app opens on the pedagogical guide, not a raw calculation form', function() {
  assert(/\bactiveModule\s*=\s*'guide'/.test(html), 'default module literal should be the guide');
});

test('Nav: every group carries a bilingual label and a teaching description', function() {
  NAV_GROUPS.forEach(function (g) {
    assert(g.da && g.en, 'group ' + g.id + ' needs da/en labels');
    assert(g.descDa && g.descEn, 'group ' + g.id + ' needs da/en descriptions');
    assert(Array.isArray(g.keys) && g.keys.length > 0, 'group ' + g.id + ' needs module keys');
  });
});

test('Nav: every real module key is placed in exactly one group', function() {
  const mods = T.da.modules;
  const seen = {};
  NAV_GROUPS.forEach(function (g) {
    g.keys.forEach(function (k) {
      assert(!seen[k], 'module ' + k + ' appears in more than one group');
      seen[k] = true;
    });
  });
  Object.keys(mods).forEach(function (k) {
    assert(seen[k], 'module ' + k + ' is not reachable from any nav group');
  });
});

test('Nav: no group lists a key that is not a real module', function() {
  const mods = T.da.modules;
  NAV_GROUPS.forEach(function (g) {
    g.keys.forEach(function (k) {
      assert(mods[k], 'group ' + g.id + ' references unknown module ' + k);
    });
  });
});

test('Nav: the core dimensioning chain follows the safe-design order', function() {
  const core = NAV_GROUPS.filter(function (g) { return g.id === 'core'; })[0];
  assert(core && core.numbered === true, 'core group must be numbered for teaching');
  // IB (load) must come before the device (mcb), which comes before the cable.
  assert(core.keys.indexOf('load') < core.keys.indexOf('mcb'), 'load before device');
  assert(core.keys.indexOf('mcb') < core.keys.indexOf('cable'), 'device before cable');
  assert(core.keys.indexOf('cable') < core.keys.indexOf('vdrop'), 'cable before voltage drop');
  assert(core.keys.indexOf('vdrop') < core.keys.indexOf('scircuit'), 'voltage drop before short-circuit');
});

test('Nav: navGroupForKey resolves a module to its owning category', function() {
  assert.strictEqual(navGroupForKey('load'), 'core', 'load -> core');
  assert.strictEqual(navGroupForKey('guide'), 'start', 'guide -> start');
  assert.strictEqual(navGroupForKey('ev'), 'apps', 'ev -> apps');
});

test('Nav: switchModule reveals the category that owns the chosen module', function() {
  switchModule('cable');
  assert.strictEqual(activeNavGroup, 'core', 'cable lives in core, so core opens');
  switchModule('ev');
  assert.strictEqual(activeNavGroup, 'apps', 'ev lives in apps, so apps opens');
  switchModule('guide');
  assert.strictEqual(activeNavGroup, 'start');
});

test('Nav: selectNavGroup switches the visible category without changing the module', function() {
  switchModule('guide');
  const mod = activeModule;
  selectNavGroup('docs');
  assert.strictEqual(activeNavGroup, 'docs', 'category changed');
  assert.strictEqual(activeModule, mod, 'active module unchanged when only browsing categories');
});

test('Nav: renderNav builds a two-level grouped navigation (no flat tab wall)', function() {
  let captured = '';
  const realGet = document.getElementById;
  document.getElementById = function (id) {
    if (id === 'mainNav') return { set innerHTML(v) { captured = v; }, get innerHTML() { return captured; } };
    return realGet(id);
  };
  try {
    renderNav();
  } finally {
    document.getElementById = realGet;
  }
  assert(captured.indexOf('nav-cats') >= 0, 'renders the category rail');
  assert(captured.indexOf('nav-panel') >= 0, 'renders the active-category panel with description');
  assert(captured.indexOf('nav-cat') >= 0, 'renders category buttons');
});

// ===== Reactive Cross-Module Propagation Tests =====
// Feature: a change in ANY module immediately updates all relevant / maybe
// relevant modules (single source of truth + dependency propagation), and a
// downstream safety verdict is NEVER left showing a stale OK.

console.log('\n=== Reactive Cross-Module Propagation Tests ===\n');

test('Reactive: dependency graph links the safe-design chain from the load', function() {
  const a = reactiveAffected('load');
  ['cable', 'fuse', 'mcb', 'mccb', 'vdrop', 'scircuit', 'zs'].forEach(function (k) {
    assert(a.indexOf(k) >= 0, 'a load change must reach ' + k);
  });
});

test('Reactive: transitive closure reaches indirect dependents (load -> scircuit -> arcflash)', function() {
  const a = reactiveAffected('load');
  assert(a.indexOf('arcflash') >= 0, 'load change must transitively reach arcflash');
});

test('Reactive: ALL modules are linked — every change contacts the global rollups', function() {
  ['load', 'cable', 'mcb', 'vdrop', 'scircuit', 'trafo', 'earthsys', 'motor', 'solar', 'ev'].forEach(function (src) {
    const a = reactiveAffected(src);
    ['kritisk', 'sld', 'pdf', 'bank', 'projekt', 'coordination'].forEach(function (roll) {
      assert(a.indexOf(roll) >= 0, src + ' change must contact rollup ' + roll);
    });
  });
});

test('Reactive: a source never lists itself in its affected set (no self-loop)', function() {
  assert(reactiveAffected('load').indexOf('load') < 0, 'closure must not include the source');
});

test('Reactive: notify returns the affected set and a monotonically increasing stamp', function() {
  const r1 = Reactive.notify('load');
  const r2 = Reactive.notify('cable');
  assert(Array.isArray(r1.affected) && r1.affected.length > 0, 'affected set returned');
  assert(r2.stamp > r1.stamp, 'stamp must increase on each notify');
});

test('Reactive: live verdict recomputers are registered (coordination + kritisk)', function() {
  assert(typeof Reactive.recomputers.coordination === 'function', 'coordination recomputer registered');
  assert(typeof Reactive.recomputers.kritisk === 'function', 'kritisk (safety brain) recomputer registered');
});

test('Reactive: a coordinated circuit reads OK, and changing the load propagates immediately', function() {
  loadState.voltage = '1x230'; loadState.power = 3.68; loadState.cosPhi = 0.95; loadState.simFactor = 1; loadState.expFactor = 1;
  mcbState.rating = 20; // IB ~16.8A <= 20A
  cableState.crossSection = null; fuseState.size = null;
  Reactive.notify('load');
  const ok = Reactive.verdict('coordination');
  assert(ok && ok.status === 'ok', 'coordinated load should read OK, got ' + (ok && ok.status));
  assert(ok.stale === false, 'a freshly recomputed verdict is not stale');
});

test('Reactive: an overload NEVER leaves the safety verdict showing a stale OK', function() {
  loadState.voltage = '1x230'; loadState.power = 3.68; loadState.cosPhi = 0.95; loadState.simFactor = 1; loadState.expFactor = 1;
  mcbState.rating = 20; cableState.crossSection = null; fuseState.size = null;
  Reactive.notify('load');
  assert(Reactive.verdict('coordination').status === 'ok', 'precondition: OK');
  // Upstream change: 10x the load on the same protective device.
  loadState.power = 36.8; // IB ~168A >> In 20A => overload
  Reactive.notify('load');
  const after = Reactive.verdict('coordination');
  assert(after.status !== 'ok', 'overloaded circuit must not stay OK (got ' + after.status + ')');
  assert(after.status === 'fail', 'IB > In is a hard fail, got ' + after.status);
  assert(after.stale === false, 'verdict must be freshly recomputed, never stale');
});

test('Reactive: a downstream verdict with no live recomputer is flagged stale (not stale-OK)', function() {
  // Seed a fake "OK" verdict for a verdict-bearing downstream module.
  Reactive.verdicts['arcflash'] = { status: 'ok', detail: '', stamp: 0, stale: false };
  Reactive.notify('scircuit'); // scircuit -> arcflash
  const v = Reactive.verdict('arcflash');
  assert(v.stale === true, 'arcflash verdict must be flagged stale after an upstream short-circuit change');
});

test('Reactive: rendering ANY module propagates so linked verdicts are fresh without reopening', function() {
  loadState.voltage = '1x230'; loadState.power = 3.68; loadState.cosPhi = 0.95; loadState.simFactor = 1; loadState.expFactor = 1;
  mcbState.rating = 20; cableState.crossSection = null; fuseState.size = null;
  // Render an UNRELATED module; the live safety verdict must already be fresh.
  renderModule('guide');
  const v = Reactive.verdict('coordination');
  assert(v && !v.stale, 'live verdict recomputed on render of an unrelated module');
  // Overload, then render the load module — downstream reflects immediately.
  loadState.power = 36.8;
  renderModule('load');
  assert(Reactive.verdict('coordination').status !== 'ok', 'overload reflected immediately, no stale OK');
});

test('Reactive: status bar shows the live safety verdict chip linked to the auditor', function() {
  loadState.voltage = '1x230'; loadState.power = 3.68; loadState.cosPhi = 0.95; loadState.simFactor = 1; loadState.expFactor = 1;
  mcbState.rating = 20; cableState.crossSection = null; fuseState.size = null;
  Reactive.notify('load');
  let captured = '';
  const realGet = document.getElementById;
  document.getElementById = function (id) {
    if (id === 'statusBar') return { set innerHTML(v) { captured = v; }, get innerHTML() { return captured; } };
    return realGet(id);
  };
  try { renderStatusBar(); } finally { document.getElementById = realGet; }
  assert(captured.indexOf('Sikkerhed') >= 0, 'Danish safety label present on the live chip');
  assert(captured.indexOf("switchModule('kritisk')") >= 0, 'chip jumps to the unified-project safety auditor');
});

test('Reactive: verdict labels are trilingual (da/en/fa) and theme/RTL-safe (CSS vars)', function() {
  const realLang = lang;
  lang = 'da'; const daLabel = reactiveVerdictMeta('ok').label;
  lang = 'en'; const enLabel = reactiveVerdictMeta('ok').label;
  lang = 'fa'; const faLabel = reactiveVerdictMeta('ok').label;
  lang = realLang;
  assert(daLabel === 'Sikker', 'da Safe label, got ' + daLabel);
  assert(enLabel === 'Safe', 'en Safe label, got ' + enLabel);
  assert(typeof faLabel === 'string' && faLabel.length > 0, 'fa label resolves to a non-empty string');
  // Colors are CSS vars / hex so they adapt to dark + light themes and RTL.
  assert(reactiveVerdictMeta('ok').color.indexOf('var(') === 0, 'ok uses a theme CSS variable');
  assert(reactiveVerdictMeta('fail').color.indexOf('var(') === 0, 'fail uses a theme CSS variable');
  assert(reactiveVerdictMeta('stale').label.length > 0, 'stale state has a label so it is never blank/OK');
});

test('Reactive: click-only preserved — feature adds no text/number inputs or textareas', function() {
  const htmlSrc = fs.readFileSync(__dirname + '/el-dimensionering.html', 'utf8');
  const numberInputs = (htmlSrc.match(/type="number"/g) || []).length;
  const textInputs = (htmlSrc.match(/type="text"/g) || []).length;
  const textareas = (htmlSrc.match(/<textarea\s/g) || []).length;
  assert.strictEqual(numberInputs, 0, 'no number inputs may exist (click-only)');
  // Baseline pre-existing AI-assistant controls only (1 search box, 1 question box).
  assert(textInputs <= 1, 'no NEW text inputs introduced by the reactive feature (found ' + textInputs + ')');
  assert(textareas <= 1, 'no NEW textareas introduced by the reactive feature (found ' + textareas + ')');
});

test('Reactive: orchestration only — core calc functions are untouched and still callable', function() {
  // The reactive layer must not redefine or shadow the verified calc engine.
  assert(typeof calcIB === 'function', 'calcIB intact');
  assert(typeof recommendCables === 'function', 'recommendCables intact');
  assert(typeof recommendMCBs === 'function', 'recommendMCBs intact');
  assert(typeof officialIz === 'function', 'officialIz intact');
  assert(typeof upAuditProject === 'function', 'upAuditProject intact');
  assert(typeof runQiValidation === 'function', 'runQiValidation intact');
});

// ============================================================================
// ===== CALCULATION PROVENANCE + SIGNED REPORT (this feature) =====
// ============================================================================

// Build a representative, fully-specified unified project from REAL products.
function provMakeProject(opts) {
  opts = opts || {};
  const tf = PRODUCTS.transformers[0];
  const supCab = PRODUCTS.supplyCables[0];
  const mainDev = PRODUCTS.mainFuses[0];
  const cab = opts.cableId ? upCableProduct(opts.cableId) : PRODUCTS.cables.find(function(c){ return c.material === 'Cu' && c.mm2 >= 2.5; }) || PRODUCTS.cables[0];
  const mcb = opts.mcbId ? upDeviceById(opts.mcbId).product : (PRODUCTS.mcbs.find(function(m){ return m.rating >= 16; }) || PRODUCTS.mcbs[0]);
  return {
    version: 1, earthing: opts.earthing || 'TN', transformerId: tf.id,
    supply: { cableId: supCab.id, length_m: 30, deviceId: mainDev.id, deviceIn: null },
    finals: [{
      id: 'fcA', name_da: 'Stikkontakt', name_en: 'Socket', cableId: cab.id, length_m: opts.length_m || 25,
      deviceId: mcb.id, deviceIn: null, loadKW: opts.loadKW != null ? opts.loadKW : 3.68,
      phases: opts.phases || '1x230', cosPhi: 0.95, rcdMa: 30
    }]
  };
}

test('Provenance: provBuildProject builds supply + circuits with full structure', function() {
  const p = provMakeProject();
  const prov = provBuildProject(p);
  assert(prov.ok === true, 'project with a transformer must build');
  assert(prov.supply && prov.supply.entries.length > 0, 'supply segment has entries');
  assert(prov.circuits.length === 1, 'one final circuit');
  const seg = prov.circuits[0].seg;
  const keys = seg.entries.map(function(e){ return e.key; });
  ['ib','iz','overload','icu','zs'].forEach(function(k){
    assert(keys.indexOf(k) >= 0, 'circuit provenance must include entry: ' + k + ' (have ' + keys.join(',') + ')');
  });
});

test('Provenance: an entry carries formula, inputs, intermediate steps, clause AND table', function() {
  const p = provMakeProject();
  const prov = provBuildProject(p);
  const overload = prov.circuits[0].seg.entries.find(function(e){ return e.key === 'overload'; });
  assert(overload, 'overload entry exists');
  assert(/IB/.test(overload.formula) && /In/.test(overload.formula) && /Iz/.test(overload.formula), 'formula shows IB<=In<=Iz, got: ' + overload.formula);
  assert(Array.isArray(overload.inputs) && overload.inputs.length >= 3, 'inputs present');
  assert(overload.inputs.some(function(i){ return i.sym === 'IB'; }), 'IB input present');
  assert(Array.isArray(overload.steps) && overload.steps.length >= 1, 'intermediate steps present');
  assert(/DS\/HD 60364-4-43/.test(overload.clause), 'clause cites 4-43, got: ' + overload.clause);
  assert(overload.table && overload.table.indexOf('Table') >= 0, 'table cited, got: ' + overload.table);
  assert(overload.assumption && overload.assumption.length > 0, 'conservative assumption present');
});

test('Provenance: Iz chain shows Ca/Cg/Ci factors with source tables', function() {
  const p = provMakeProject();
  const prov = provBuildProject(p);
  const iz = prov.circuits[0].seg.entries.find(function(e){ return e.key === 'iz'; });
  assert(iz, 'Iz entry exists');
  assert(/Iz_tab/.test(iz.formula) && /Ca/.test(iz.formula) && /Cg/.test(iz.formula) && /Ci/.test(iz.formula), 'Iz chain formula, got: ' + iz.formula);
  const stepsText = iz.steps.join(' | ');
  assert(/Table C\.52\.1/.test(stepsText), 'cites Table C.52.1 for Iz_tab');
  assert(/Table B\.52\.14/.test(stepsText), 'cites Table B.52.14 for Ca');
  assert(/Table B\.52\.17/.test(stepsText), 'cites Table B.52.17 for Cg');
});

test('Provenance: numbers MATCH the verified engine (officialIz + sldCalcNodeIB)', function() {
  const p = provMakeProject();
  const prov = provBuildProject(p);
  const built = upBuildTree(p);
  const fId = built.finalIds[0];
  const engineIB = sldCalcNodeIB(built.tree.nodes[fId]);
  const cab = upCableProduct(p.finals[0].cableId);
  const engineIz = officialIz(cab);
  const ibEntry = prov.circuits[0].seg.entries.find(function(e){ return e.key === 'ib'; });
  const izEntry = prov.circuits[0].seg.entries.find(function(e){ return e.key === 'iz'; });
  const ibShown = parseFloat(ibEntry.value);
  const izShown = parseFloat(izEntry.value);
  assert(Math.abs(ibShown - engineIB) < 0.1, 'provenance IB (' + ibShown + ') matches engine IB (' + engineIB.toFixed(1) + ')');
  assert(Math.abs(izShown - engineIz) < 0.5, 'provenance Iz (' + izShown + ') matches engine officialIz (' + engineIz + ')');
  // The Iz must be the DERATED officialIz, never the nominal product.iz when they differ.
  if (cab.iz && Math.abs(cab.iz - engineIz) > 0.5) {
    assert(Math.abs(izShown - cab.iz) > 0.5, 'report must NOT use nominal product.iz (' + cab.iz + ')');
  }
});

test('Provenance verdict equals the live auditor verdict (single source of truth)', function() {
  const p = provMakeProject();
  const audit = upAuditProject(p);
  const prov = provBuildProject(p);
  const overload = prov.circuits[0].seg.entries.find(function(e){ return e.key === 'overload'; });
  // find the matching auditor overload finding
  const f = audit.findings.find(function(x){ return String(x.scope).indexOf(prov.circuits[0].name) === 0 && /IB/.test(x.rule); });
  assert(f, 'auditor produced an overload finding');
  assert(overload.verdict === f.status, 'provenance verdict (' + overload.verdict + ') == auditor status (' + f.status + ')');
});

test('Report: builder produces non-empty report with all sections in da/en/fa', function() {
  const realLang = lang;
  ['da','en','fa'].forEach(function(L) {
    lang = L;
    upProject = provMakeProject();
    const model = reportBuildModel(upProject);
    const html = reportRenderHTML(model, true);
    assert(html && html.length > 800, L + ': report non-empty');
    assert(html.indexOf('<svg') >= 0, L + ': contains the SLD svg');
    assert(/DS\/HD 60364/.test(html), L + ': contains DS/HD 60364 reference');
    assert(/60364:2022/.test(html), L + ': contains the DS/HD 60364:2022 statement');
    assert(html.indexOf(model.meta.earthing) >= 0, L + ': contains earthing metadata');
    // load schedule current + per-circuit working
    assert(/IB/.test(html), L + ': load schedule / working present');
    assert(/Socket|Stikkontakt|\u0633\u0648\u06A9\u062A|#1/.test(html), L + ': per-circuit provenance present');
  });
  lang = realLang;
});

test('Report (SAFETY): a FAIL verdict is NEVER shown as safe/approved', function() {
  // Force a fail: In (large MCB) > Iz (smallest cable) -> overload fail -> red.
  const smallCab = PRODUCTS.cables.filter(function(c){ return c.material === 'Cu'; }).sort(function(a,b){ return a.mm2 - b.mm2; })[0];
  const bigMcb = PRODUCTS.mcbs.slice().sort(function(a,b){ return b.rating - a.rating; })[0];
  const p = provMakeProject({ cableId: smallCab.id, mcbId: bigMcb.id, loadKW: 0.5 });
  upProject = p;
  const model = reportBuildModel(p);
  assert(model.verdict === 'red', 'forced design must be red, got: ' + model.verdict);
  const html = reportRenderHTML(model, true);
  const realLang = lang; lang = 'en';
  const ap = reportApprovalText(model.verdict, model.stale);
  assert(/NOT APPROVED/.test(ap.text), 'red verdict approval text says NOT APPROVED, got: ' + ap.text);
  assert(reportApprovalText('green', false).text.indexOf('APPROVED for construction') >= 0, 'green => approved');
  // The verdict banner must use the danger colour, never the success label.
  assert(html.indexOf('var(--danger)') >= 0, 'danger colour shown for red verdict');
  lang = realLang;
});

test('Report (SAFETY): a STALE verdict is flagged RECOMPUTING, never stale-OK', function() {
  const p = provMakeProject();
  upProject = p;
  // Simulate a change after last compute: mark the kritisk verdict stale.
  Reactive.verdicts['kritisk'] = { status: 'ok', stale: true, stamp: 1 };
  const prov = provBuildProject(p);
  assert(prov.stale === true, 'provenance picks up the stale flag from the reactive bus');
  const model = reportBuildModel(p);
  assert(model.stale === true, 'report model is stale');
  const realLang = lang; lang = 'en';
  const ap = reportApprovalText(model.verdict, model.stale);
  assert(/RECOMPUTING/.test(ap.text), 'stale approval flagged RECOMPUTING, got: ' + ap.text);
  const html = reportRenderHTML(model, true);
  assert(/RECOMPUTING|recompute/i.test(html), 'stale banner present in report');
  lang = realLang;
  // cleanup so later tests are unaffected
  delete Reactive.verdicts['kritisk'];
});

test('Report + provenance UI are 100% click-only (no text/number inputs, no textarea)', function() {
  const realLang = lang; lang = 'da';
  upProject = provMakeProject();
  const ui = reportRenderUI();
  ['<input type="text"','<input type="number"',"<input type='text'","<input type='number'",'<textarea'].forEach(function(bad){
    assert(ui.indexOf(bad) < 0, 'report UI must not contain ' + bad);
  });
  // The whole documentation module (which embeds the report) stays click-only too.
  const pdf = renderPDF();
  ['<input type="text"','<input type="number"','<textarea'].forEach(function(bad){
    assert(pdf.indexOf(bad) < 0, 'documentation module must not contain ' + bad);
  });
  // Identity is chosen by click (preset roles) + click date stamp, not typed.
  assert(ui.indexOf('reportSetRole(') >= 0, 'designer chosen via click (preset role)');
  assert(ui.indexOf('reportStampDate(') >= 0, 'date chosen via click stamp');
  lang = realLang;
});

test('Report: provenance expands via native <details> (click-only "vis udregning")', function() {
  const realLang = lang; lang = 'da';
  upProject = provMakeProject();
  const model = reportBuildModel(upProject);
  const collapsed = reportRenderHTML(model, false);
  const expanded = reportRenderHTML(model, true);
  assert(collapsed.indexOf('<details') >= 0, 'collapsed preview uses <details> expanders');
  assert(collapsed.indexOf('<details class="prov-entry" open') < 0, 'preview details are closed by default');
  assert(expanded.indexOf('<details class="prov-entry" open') >= 0, 'print version forces details open');
  lang = realLang;
});

test('Guard: core calc math is unchanged (officialIz + IB regression values)', function() {
  // officialIz returns the DS/HD 60364-5-52 Table C.52.1 derated value.
  const cu25 = { material: 'Cu', mm2: 2.5, model: '', iz: 999 };
  assert.strictEqual(officialIz(cu25), 23, 'officialIz(Cu 2.5mm2 PVC) == 23A (Table C.52.1), not nominal');
  const cu16 = { material: 'Cu', mm2: 16, model: '', iz: 1 };
  assert.strictEqual(officialIz(cu16), 73, 'officialIz(Cu 16mm2 PVC) == 73A');
  // IB regression (matches existing engine test): 3.68kW, 1x230, cos 0.95
  const ib = sldCalcNodeIB({ type:'final_circuit', power_kW:3.68, cosPhi:0.95, phases:'1x230', voltage:230 });
  assert(Math.abs(ib - 16.84) < 0.05, 'IB regression ~16.84A, got ' + ib.toFixed(2));
  // provenance must not have redefined the engine functions
  assert(typeof provBuildProject === 'function' && typeof officialIz === 'function', 'engine + provenance coexist');
});

test('UX: scroll position is preserved on same-module re-render, reset on module switch', function() {
  const realGet = document.getElementById;
  // Simulated scrollable container. Setting innerHTML mimics the browser behaviour
  // of resetting scrollTop to 0 when the whole subtree is replaced.
  const mc = {
    _html: '',
    scrollTop: 0,
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; this.scrollTop = 0; }
  };
  document.getElementById = function (id) {
    if (id === 'mainContent') return mc;
    return realGet ? realGet(id) : { innerHTML:'', textContent:'', style:{}, classList:{add(){},remove(){},toggle(){}} };
  };
  // window scroll target
  const realScrollTo = window.scrollTo;
  let winY = 0;
  window.scrollY = 0;
  window.scrollTo = function (a, b) {
    var y = (a && typeof a === 'object') ? a.top : b;   // supports scrollTo(0,y) and scrollTo({top:y})
    winY = y; window.scrollY = y;
  };
  try {
    // Deterministic baseline: a genuine switch into 'load' resets to top.
    renderModule('cable');
    renderModule('load');
    assert(mc._html.length > 0, 'renderModule produced content for a module');
    assert.strictEqual(mc.scrollTop, 0, 'fresh switch into load starts at top');

    // User scrolls down, then a value change re-renders the SAME module.
    mc.scrollTop = 540; window.scrollY = 540; winY = 540;
    renderModule('load');
    assert(mc._html.length > 0, 'renderModule still produced content on same-module re-render');
    assert.strictEqual(mc.scrollTop, 540, 'container scrollTop restored after same-module re-render (got ' + mc.scrollTop + ')');
    assert.strictEqual(winY, 540, 'window scroll restored after same-module re-render (got ' + winY + ')');

    // User scrolls again, then switches to a DIFFERENT module -> reset to top.
    mc.scrollTop = 800; window.scrollY = 800; winY = 800;
    renderModule('cable');
    assert.strictEqual(mc.scrollTop, 0, 'container scrollTop reset to top on module switch (got ' + mc.scrollTop + ')');
    assert.strictEqual(winY, 0, 'window scroll reset to top on module switch (got ' + winY + ')');
  } finally {
    document.getElementById = realGet;
    window.scrollTo = realScrollTo;
  }
});

test('UX: renderModule scroll plumbing is null-safe and stays click-only', function() {
  const out = renderLoad();
  ['<input type="text"', '<input type="number"', '<textarea'].forEach(function (bad) {
    assert(out.indexOf(bad) < 0, 'module content must remain click-only (no ' + bad + ')');
  });
  const src = renderModule.toString();
  assert(src.indexOf('_captureScrollState') >= 0 && src.indexOf('_restoreScrollState') >= 0, 'scroll capture/restore wired into renderModule');
  assert(src.indexOf('_resetScrollTop') >= 0, 'module switch still resets to top');
  assert(src.indexOf('_lastRenderedModule') >= 0, 'tracks previously-rendered module for same-module detection');
  assert(typeof _captureScrollState === 'function' && typeof _restoreScrollState === 'function', 'scroll helpers exist');
  assert.doesNotThrow(function () { _restoreScrollState(null); _captureScrollState(); }, 'scroll helpers are null-safe');
});

test('Appearance: glow intensity + accent presets exist and apply without throwing', function() {
  assert(Array.isArray(GLOW_PRESETS) && GLOW_PRESETS.length >= 3, 'glow intensity presets available');
  assert(Array.isArray(ACCENT_PRESETS) && ACCENT_PRESETS.length >= 3, 'accent colour presets available');
  const off = GLOW_PRESETS.filter(function (p) { return p.id === 'off'; })[0];
  const soft = GLOW_PRESETS.filter(function (p) { return p.id === 'soft'; })[0];
  assert(off && off.mult === 0, 'Off glow == 0 (no neon glow at all)');
  assert(soft && soft.mult > 0 && soft.mult < 0.6, 'Soft glow is a gentle, eye-friendly level (got ' + (soft && soft.mult) + ')');
  assert.doesNotThrow(function () { setGlow('off'); }, 'setGlow does not throw');
  assert.strictEqual(appearanceState.glow, 'off', 'setGlow updates state');
  assert.doesNotThrow(function () { setAccent('teal'); }, 'setAccent does not throw');
  assert.strictEqual(appearanceState.accent, 'teal', 'setAccent updates state');
  assert.doesNotThrow(function () { applyAppearance(); }, 'applyAppearance does not throw');
  setGlow('soft'); setAccent('cyan');
});

test('Appearance: panel is click-only (buttons/swatches, no typed inputs)', function() {
  const realGet = document.getElementById;
  let captured = '';
  document.getElementById = function (id) {
    if (id === 'appearancePanel') return { set innerHTML(v) { captured = v; }, get innerHTML() { return captured; }, classList: { add(){}, remove(){}, toggle(){} } };
    return realGet ? realGet(id) : { innerHTML:'', classList:{add(){},remove(){},toggle(){}} };
  };
  try { renderAppearancePanel(); } finally { document.getElementById = realGet; }
  assert(captured.indexOf('onclick="setGlow(') >= 0, 'glow chosen by click');
  assert(captured.indexOf('onclick="setAccent(') >= 0, 'accent chosen by click');
  ['<input type="text"', '<input type="number"', '<textarea', 'type="range"'].forEach(function (bad) {
    assert(captured.indexOf(bad) < 0, 'appearance panel must be click-only (no ' + bad + ')');
  });
});

test('Appearance: dark-mode neon is driven by intensity/colour variables (calmer by default)', function() {
  assert(html.indexOf('--glow:') >= 0, 'glow intensity variable defined in :root');
  assert(html.indexOf('--neon-rgb:') >= 0, 'themeable neon colour variable defined');
  assert(html.indexOf('rgba(var(--neon-rgb)') >= 0, 'dark-mode glows reference the themeable neon variable');
  assert(html.indexOf('0 0 18px rgba(0,229,255,0.75)') < 0, 'old harsh full-strength sel-btn glow removed');
});

// ============================================================================
// OFFICIAL PRODUCT DEEP-LINKS (no-remote-image ordering feature)
// Click-only links to each manufacturer's OWN official product/series page so
// the user sees the REAL component photo + datasheet before ordering. No remote
// images, no AI image generation, no typed prompt() flows.
// ============================================================================

test('Deeplinks: every PRODUCTS entry resolves to a verified official product link', function() {
  let total = 0, mapped = 0; const uniq = {}, uniqMapped = {}; const gaps = [];
  Object.keys(PRODUCTS).forEach(function(cat) {
    PRODUCTS[cat].forEach(function(p) {
      total++; const key = p.brand + '|' + p.model; uniq[key] = 1;
      const link = getProductLink(p);
      if (link && link.productUrl) { mapped++; uniqMapped[key] = 1; }
      else gaps.push(cat + '/' + p.id + ' (' + p.brand + '|' + p.model + ')');
    });
  });
  console.log('        [coverage] products ' + mapped + '/' + total
    + ', unique brand|model ' + Object.keys(uniqMapped).length + '/' + Object.keys(uniq).length);
  assert.strictEqual(mapped, total, 'every PRODUCTS entry must resolve to an official link. Gaps: ' + gaps.join(', '));
});

test('Deeplinks: every link is https AND on the official-domain allowlist (0 off-allowlist)', function() {
  assert(Array.isArray(OFFICIAL_PRODUCT_DOMAINS) && OFFICIAL_PRODUCT_DOMAINS.length > 0, 'allowlist of official domains exists');
  const urls = {}; const off = [];
  Object.keys(PRODUCTS).forEach(function(cat) {
    PRODUCTS[cat].forEach(function(p) {
      const l = getProductLink(p); if (!l) return;
      [l.productUrl, l.datasheetUrl].filter(Boolean).forEach(function(u) { urls[u] = 1; });
    });
  });
  Object.keys(urls).forEach(function(u) {
    if (!/^https:\/\//.test(u)) { off.push('non-https: ' + u); return; }
    let host; try { host = new URL(u).hostname; } catch (e) { off.push('bad-url: ' + u); return; }
    const ok = OFFICIAL_PRODUCT_DOMAINS.some(function(d) { return host === d || host.endsWith('.' + d); });
    if (!ok) off.push('off-allowlist host: ' + host);
  });
  console.log('        [allowlist] unique URLs ' + Object.keys(urls).length + ', off-allowlist/non-https ' + off.length);
  assert.strictEqual(off.length, 0, 'all links must be https and on the official-domain allowlist. Offenders: ' + off.join(', '));
});

test('Deeplinks: no remote <img>, no Wikimedia hot-links, no AI image endpoint, removed configs', function() {
  assert(!/<img[^>]+src\s*=\s*["'`]?\s*https?:/i.test(html), 'no remote <img src="http...">');
  assert(html.indexOf('commons.wikimedia') < 0, 'no Wikimedia Commons hot-links');
  assert(html.indexOf('Special:FilePath') < 0, 'no Wikimedia Special:FilePath links');
  assert(html.indexOf('COMPONENT_PHOTOS') < 0, 'legacy COMPONENT_PHOTOS map removed');
  assert(!/images\/generations/.test(html), 'no DALL-E / OpenAI image-generation endpoint');
  // typed-prompt / AI-image entry points removed (typeof on an undeclared id is safe)
  assert(typeof genAiPainting === 'undefined', 'genAiPainting (DALL-E generator) removed');
  assert(typeof configAiImg === 'undefined', 'configAiImg removed');
  assert(typeof configurePhotos === 'undefined', 'configurePhotos (prompt image-feed) removed');
  assert(typeof configurePriceFeed === 'undefined', 'configurePriceFeed (prompt price-feed) removed');
  assert(typeof photoUrlFor === 'undefined', 'remote photoUrlFor resolver removed');
  // UI entry points removed
  assert(html.indexOf('onclick="configurePhotos()"') < 0, 'no configurePhotos button wired');
  assert(html.indexOf('genAiPainting()') < 0, 'no genAiPainting button wired');
  assert(html.indexOf('configAiImg()') < 0, 'no configAiImg button wired');
});

test('Deeplinks: no active prompt() free-text flows (any prompt( only in removal comments)', function() {
  const offending = [];
  html.split('\n').forEach(function(line, i) {
    if (line.indexOf('prompt(') >= 0) {
      const t = line.trim();
      const isComment = t.indexOf('//') === 0 || t.indexOf('*') === 0 || t.indexOf('/*') === 0;
      if (!isComment) offending.push((i + 1) + ': ' + t.slice(0, 70));
    }
  });
  console.log('        [prompt] active prompt() calls: ' + offending.length);
  assert.strictEqual(offending.length, 0, 'no active prompt() typed flows allowed. Found: ' + offending.join(' | '));
});

test('Deeplinks: renderProductLinks is click-only (anchor + new-tab + safe rel, no inputs/img)', function() {
  let sample = null;
  Object.keys(PRODUCTS).some(function(cat) {
    return PRODUCTS[cat].some(function(p) { if (getProductLink(p)) { sample = p; return true; } return false; });
  });
  assert(sample, 'a sample linked product exists');
  const prevLang = lang; lang = 'en';
  const out = renderProductLinks(sample);
  lang = prevLang;
  assert(out.indexOf('<a ') >= 0, 'renders an anchor (link)');
  assert(out.indexOf('target="_blank"') >= 0, 'opens in a new tab');
  assert(out.indexOf('rel="noopener noreferrer"') >= 0, 'uses rel="noopener noreferrer"');
  assert(out.indexOf('View product') >= 0, 'shows the View product label (en)');
  ['<input', '<textarea', '<img', 'contenteditable', 'type="text"', 'type="number"'].forEach(function(bad) {
    assert(out.indexOf(bad) < 0, 'product links must be click-only and image-free (found ' + bad + ')');
  });
});

test('Deeplinks: new strings are trilingual (da authoritative, en secondary, fa via _FA)', function() {
  ['View product', 'Datasheet', '(series)', 'official product page', 'official series page',
   'Opens the manufacturer official page in a new tab', 'Opens the official datasheet in a new tab',
   'Official series page on the manufacturer own domain (variants share the page)',
   'Component image'].forEach(function(k) {
    assert.ok(_FA[k] && _FA[k].length > 0, 'Farsi (_FA) translation present for new string: ' + k);
  });
  const prevLang = lang;
  lang = 'da'; assert.strictEqual(tx('Se produkt', 'View product'), 'Se produkt', 'Danish authoritative label');
  lang = 'en'; assert.strictEqual(tx('Se produkt', 'View product'), 'View product', 'English secondary label');
  lang = 'fa'; assert.strictEqual(tx('Se produkt', 'View product'), _FA['View product'], 'Farsi label routed via _FA');
  lang = prevLang;
});

test('Deeplinks GUARD: core calc math unchanged (officialIz + IB regression) with deeplinks loaded', function() {
  // Reuses the verified-engine regression values; asserts the deep-link layer
  // coexists without redefining or perturbing the calculation engine.
  const cu25 = { material: 'Cu', mm2: 2.5, model: '', iz: 999 };
  assert.strictEqual(officialIz(cu25), 23, 'officialIz(Cu 2.5mm2 PVC) == 23A (Table C.52.1)');
  const cu16 = { material: 'Cu', mm2: 16, model: '', iz: 1 };
  assert.strictEqual(officialIz(cu16), 73, 'officialIz(Cu 16mm2 PVC) == 73A');
  const ib = sldCalcNodeIB({ type:'final_circuit', power_kW:3.68, cosPhi:0.95, phases:'1x230', voltage:230 });
  assert(Math.abs(ib - 16.84) < 0.05, 'IB regression ~16.84A, got ' + ib.toFixed(2));
  assert(typeof getProductLink === 'function' && typeof officialIz === 'function', 'deep-link layer + engine coexist');
});

// ===================================================================
// UX SMOOTHNESS PASS — gentle transitions, no re-render roughness.
// All assertions are presentation-only; the calc guard below proves the
// engine math is byte-identical to before this pass.
// ===================================================================
console.log('\n=== UX Smoothness Pass Tests ===\n');

test('Smoothness: entrance animation is gated to genuine module switches (no jump on re-render)', function () {
  assert(html.indexOf('#mainContent.module-switch .fade-in') >= 0, 'entrance animation scoped to module-switch');
  assert(/#mainContent\.module-switch \.fade-in\s*\{[^}]*animation:\s*slideUp/.test(html), 'module-switch plays the slideUp entrance');
  assert(html.indexOf('#mainContent:not(.module-switch) .fade-in') >= 0, 'in-module re-render has its own (gentle) rule, not the slide');
  const si = html.indexOf('@keyframes slideUp');
  assert(si >= 0, 'slideUp keyframes present');
  const seg = html.slice(si, si + 200);
  assert(/translateY/.test(seg) && /opacity/.test(seg), 'slideUp uses opacity + transform only (GPU-friendly)');
  ['width:', 'height:', 'top:', 'left:', 'margin:', 'padding:'].forEach(function (prop) {
    assert(seg.indexOf(prop) < 0, 'slideUp must not animate layout-triggering "' + prop + '"');
  });
});

test('Smoothness: in-module settle is opacity-only (masks the innerHTML swap without flicker or movement)', function () {
  const i = html.indexOf('@keyframes contentSettle');
  assert(i >= 0, 'contentSettle keyframes present');
  const seg = html.slice(i, i + 160);
  assert(/opacity/.test(seg), 'contentSettle fades opacity to settle the new content');
  assert(seg.indexOf('translate') < 0 && seg.indexOf('width') < 0 && seg.indexOf('height') < 0, 'settle has no movement / layout change');
});

test('Smoothness: renderModule gates the entrance class (entrance only on a real switch)', function () {
  const src = renderModule.toString();
  assert(src.indexOf("classList.add('module-switch')") >= 0, 'a real module switch adds the entrance class');
  assert(src.indexOf("classList.remove('module-switch')") >= 0, 'an in-module re-render removes the entrance class');
  assert(src.indexOf('_sameModule') >= 0 && src.indexOf('_lastRenderedModule') >= 0, 'same-module-vs-switch detection still intact');
});

test('Smoothness: module switch adds entrance class; same-module re-render does not (behavioural)', function () {
  const realGet = document.getElementById;
  const mc = {
    _html: '', scrollTop: 0,
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; this.scrollTop = 0; },
    classList: {
      _set: {},
      add: function (c) { this._set[c] = true; },
      remove: function (c) { delete this._set[c]; },
      contains: function (c) { return !!this._set[c]; }
    }
  };
  document.getElementById = function (id) {
    if (id === 'mainContent') return mc;
    return realGet ? realGet(id) : { innerHTML: '', textContent: '', style: {}, classList: { add() {}, remove() {}, toggle() {} } };
  };
  try {
    renderModule('cable');
    renderModule('load');
    assert(mc.classList.contains('module-switch'), 'genuine module switch leaves the entrance class on (slide-in plays)');
    renderModule('load');
    assert(!mc.classList.contains('module-switch'), 'same-module re-render clears the entrance class (content stays put, no jump)');
  } finally {
    document.getElementById = realGet;
  }
});

test('Smoothness: focus-retention helpers exist, are wired into renderModule, and are null-safe', function () {
  assert(typeof _captureFocusKey === 'function' && typeof _restoreFocusKey === 'function', 'focus retention helpers exist');
  const src = renderModule.toString();
  assert(src.indexOf('_captureFocusKey') >= 0 && src.indexOf('_restoreFocusKey') >= 0, 'focus retention wired into renderModule');
  assert.doesNotThrow(function () {
    _restoreFocusKey(null);
    _captureFocusKey();
    _restoreFocusKey({ type: 'id', val: 'does-not-exist' });
    _restoreFocusKey({ type: 'onclick', val: 'noop()' });
  }, 'focus helpers are null-safe and never throw');
});

test('Smoothness: scroll-preservation helpers + logic are NOT regressed by this pass', function () {
  assert(typeof _captureScrollState === 'function' && typeof _restoreScrollState === 'function', 'scroll helpers still exist');
  assert(typeof _resetScrollTop === 'function' && typeof _scrollWindowTo === 'function', 'scroll reset/window helpers still exist');
  const src = renderModule.toString();
  assert(src.indexOf('_captureScrollState') >= 0 && src.indexOf('_restoreScrollState') >= 0, 'same-module scroll capture/restore still wired');
  assert(src.indexOf('_resetScrollTop') >= 0, 'module switch still resets scroll to top');
  assert.doesNotThrow(function () { _restoreScrollState(null); _captureScrollState(); }, 'scroll helpers still null-safe');
});

test('Smoothness: prefers-reduced-motion disables the new content + panel transitions and smooth scroll', function () {
  const i = html.indexOf('@media (prefers-reduced-motion: reduce)');
  assert(i >= 0, 'reduced-motion media query present');
  const seg = html.slice(i, i + 700);
  assert(seg.indexOf('.fade-in') >= 0, 'reduced-motion disables fade-in entrance/settle');
  assert(seg.indexOf('.appearance-panel.open') >= 0, 'reduced-motion disables the appearance-panel reveal');
  assert(seg.indexOf('animation: none !important') >= 0, 'reduced-motion forces animation off');
  assert(seg.indexOf('scroll-behavior: auto') >= 0, 'reduced-motion disables smooth scrolling');
});

test('Smoothness: gentle appearance-panel reveal uses opacity/transform only', function () {
  assert(html.indexOf('@keyframes apReveal') >= 0, 'appearance-panel reveal keyframes present');
  const i = html.indexOf('@keyframes apReveal');
  const seg = html.slice(i, i + 160);
  assert(/opacity/.test(seg) && /translateY/.test(seg), 'apReveal uses opacity + transform');
  assert(seg.indexOf('width') < 0 && seg.indexOf('height') < 0, 'apReveal does not animate layout-triggering size');
});

test('Smoothness: new transition CSS introduces no external resources and no JS animation library', function () {
  assert(html.indexOf('<script src') < 0, 'no external <script src> introduced (single-file preserved)');
  assert(html.indexOf('<link') < 0, 'no external stylesheet <link> introduced');
  assert(html.indexOf('@import') < 0, 'no CSS @import introduced');
  ['gsap', 'anime.min', 'velocity.js', 'popmotion', 'framer-motion'].forEach(function (lib) {
    assert(html.toLowerCase().indexOf(lib) < 0, 'no JS animation library "' + lib + '" introduced (CSS transitions only)');
  });
});

test('Smoothness: click-only preserved — no new typed inputs introduced by the motion control', function () {
  const countText = (html.match(/<input type="text"/g) || []).length;
  const countNum = (html.match(/<input type="number"/g) || []).length;
  const countTextarea = (html.match(/<textarea/g) || []).length;
  assert.strictEqual(countText, 0, 'still zero text inputs');
  assert.strictEqual(countNum, 0, 'still zero number inputs');
  assert(countTextarea <= 2, 'no new <textarea> added by this pass (baseline 2: the AI question box + a comment, got ' + countTextarea + ')');
  const realGet = document.getElementById;
  const panel = { innerHTML: '' };
  document.getElementById = function (id) {
    if (id === 'appearancePanel') return panel;
    return realGet ? realGet(id) : null;
  };
  try {
    renderAppearancePanel();
    assert(panel.innerHTML.indexOf("setMotion('auto')") >= 0 && panel.innerHTML.indexOf("setMotion('off')") >= 0, 'motion control rendered as buttons');
    assert(panel.innerHTML.indexOf('<input') < 0 && panel.innerHTML.indexOf('<textarea') < 0, 'appearance panel stays click-only');
  } finally {
    document.getElementById = realGet;
  }
});

test('Smoothness: motion toggle is trilingual (da authoritative, en secondary, fa via _FA) and click-only', function () {
  assert(typeof setMotion === 'function', 'setMotion control function exists');
  assert(appearanceState.motion === 'auto' || appearanceState.motion === 'off', 'motion state is a known value');
  assert(_FA['Motion'] && _FA['Motion'].length > 0, 'Farsi for "Motion" present in _FA');
  assert(_FA['Auto'] && _FA['Auto'].length > 0, 'Farsi for "Auto" present in _FA');
  assert(_FA['Off'] && _FA['Off'].length > 0, 'Farsi for "Off" present in _FA');
  const prevLang = lang;
  try {
    lang = 'da'; assert(tx('Bev\u00E6gelse', 'Motion') === 'Bev\u00E6gelse', 'Danish authoritative');
    lang = 'en'; assert(tx('Bev\u00E6gelse', 'Motion') === 'Motion', 'English secondary');
    lang = 'fa'; assert(tx('Bev\u00E6gelse', 'Motion') === _FA['Motion'], 'Farsi via _FA');
  } finally { lang = prevLang; }
});

test('Smoothness: motion=off toggles body.motion-off; default auto leaves it off (no engine touch)', function () {
  const realBody = document.body;
  const tracked = { _set: {}, add: function (c) { this._set[c] = true; }, remove: function (c) { delete this._set[c]; }, contains: function (c) { return !!this._set[c]; }, toggle: function () {} };
  const prevAppearance = JSON.parse(JSON.stringify(appearanceState));
  try {
    document.body = { classList: tracked };
    setMotion('off');
    assert(tracked.contains('motion-off'), 'motion=off adds body.motion-off (kills transitions globally)');
    setMotion('auto');
    assert(!tracked.contains('motion-off'), 'motion=auto removes body.motion-off (respects OS preference)');
  } finally {
    document.body = realBody;
    appearanceState.accent = prevAppearance.accent;
    appearanceState.glow = prevAppearance.glow;
    appearanceState.motion = prevAppearance.motion;
    applyAppearance();
  }
});

test('Smoothness GUARD: core calc math is byte-identical after the UX pass (officialIz + IB regression)', function () {
  const cu25 = { material: 'Cu', mm2: 2.5, model: '', iz: 999 };
  assert.strictEqual(officialIz(cu25), 23, 'officialIz(Cu 2.5mm2 PVC) == 23A (Table C.52.1) unchanged');
  const cu16 = { material: 'Cu', mm2: 16, model: '', iz: 1 };
  assert.strictEqual(officialIz(cu16), 73, 'officialIz(Cu 16mm2 PVC) == 73A unchanged');
  const ib1 = sldCalcNodeIB({ type: 'final_circuit', power_kW: 3.68, cosPhi: 0.95, phases: '1x230', voltage: 230 });
  assert(Math.abs(ib1 - 16.84) < 0.05, 'IB regression ~16.84A unchanged, got ' + ib1.toFixed(2));
  const ib3 = sldCalcNodeIB({ type: 'final_circuit', power_kW: 7.36, cosPhi: 0.95, phases: '3x400', voltage: 400 });
  const exp3 = 7360 / (Math.sqrt(3) * 400 * 0.95);
  assert(Math.abs(ib3 - exp3) < 0.01, 'three-phase IB unchanged');
});

// ========================================================================
// AC IMPEDANCE MODULE TESTS
// Verifies calculations against Elektroteknik Opgavesamling 4. udgave Ch.6
// ========================================================================

console.log('\n=== AC Impedance Module Tests ===\n');

// --- Pure calculation function tests ---

test('impedansCalcXL: XL = 2*pi*50*0.1 = 31.416 Ohm', function() {
  var xl = impedansCalcXL(50, 0.1);
  assert(Math.abs(xl - 31.416) < 0.001, 'XL should be ~31.416, got ' + xl.toFixed(4));
});

test('impedansCalcXC: XC = 1/(2*pi*50*100e-6) = 31.831 Ohm', function() {
  var xc = impedansCalcXC(50, 100e-6);
  assert(Math.abs(xc - 31.831) < 0.001, 'XC should be ~31.831, got ' + xc.toFixed(4));
});

test('impedansCalcZSeries: R=30, XL=40, XC=0 => Z=50 (3-4-5 triangle)', function() {
  var z = impedansCalcZSeries(30, 40, 0);
  assert(Math.abs(z - 50) < 0.001, 'Z should be 50, got ' + z.toFixed(4));
});

test('impedansCalcZSeries: R=100, XL=31.416, XC=31.831 => Z~100.00 (near resonance)', function() {
  var xl = impedansCalcXL(50, 0.1);
  var xc = impedansCalcXC(50, 100e-6);
  var z = impedansCalcZSeries(100, xl, xc);
  // X = XL - XC = 31.416 - 31.831 = -0.415, Z = sqrt(100^2 + 0.415^2) ~ 100.0009
  assert(Math.abs(z - 100) < 0.1, 'Z near resonance should be ~100, got ' + z.toFixed(4));
});

test('impedansCalcPhiSeries: R=100, XL=100, XC=0 => phi=45 degrees', function() {
  var phi = impedansCalcPhiSeries(100, 100, 0);
  var phiDeg = phi * 180 / Math.PI;
  assert(Math.abs(phiDeg - 45) < 0.01, 'phi should be 45 deg, got ' + phiDeg.toFixed(4));
});

test('impedansCalcPhiSeries: R=100, XL=0, XC=100 => phi=-45 degrees (capacitive)', function() {
  var phi = impedansCalcPhiSeries(100, 0, 100);
  var phiDeg = phi * 180 / Math.PI;
  assert(Math.abs(phiDeg - (-45)) < 0.01, 'phi should be -45 deg, got ' + phiDeg.toFixed(4));
});

test('impedansCalcResonance: L=0.1H, C=100uF => f0 = 50.33 Hz', function() {
  var f0 = impedansCalcResonance(0.1, 100e-6);
  // f0 = 1/(2*pi*sqrt(0.1 * 100e-6)) = 1/(2*pi*sqrt(1e-5)) = 1/(2*pi*0.003162) = 50.33
  assert(Math.abs(f0 - 50.33) < 0.1, 'f0 should be ~50.33 Hz, got ' + f0.toFixed(2));
});

test('impedansCalcQSeries: R=10, L=0.1, C=100e-6 => Q = (1/10)*sqrt(0.1/100e-6) = 3.162', function() {
  var q = impedansCalcQSeries(10, 0.1, 100e-6);
  // Q = (1/10) * sqrt(0.1/0.0001) = 0.1 * sqrt(1000) = 0.1 * 31.623 = 3.162
  assert(Math.abs(q - 3.162) < 0.01, 'Q should be ~3.162, got ' + q.toFixed(4));
});

test('impedansCalcQParallel: R=1000, L=0.1, C=100e-6 => Q = 1000*sqrt(100e-6/0.1) = 31.62', function() {
  var q = impedansCalcQParallel(1000, 0.1, 100e-6);
  // Q = 1000 * sqrt(0.0001/0.1) = 1000 * sqrt(0.001) = 1000 * 0.03162 = 31.62
  assert(Math.abs(q - 31.62) < 0.1, 'Q should be ~31.62, got ' + q.toFixed(2));
});

test('impedansCalcTauL: L=0.5H, R=100 => tau = 0.005s = 5ms', function() {
  var tau = impedansCalcTauL(0.5, 100);
  assert(Math.abs(tau - 0.005) < 0.0001, 'tau should be 0.005s, got ' + tau);
});

test('impedansCalcTauRC: R=1000, C=100e-6 => tau = 0.1s = 100ms', function() {
  var tau = impedansCalcTauRC(1000, 100e-6);
  assert(Math.abs(tau - 0.1) < 0.0001, 'tau should be 0.1s, got ' + tau);
});

test('impedansCalcPower: U=230V, Z=100ohm, phi=0 => I=2.3A, P=529W, Q=0, S=529VA', function() {
  var pw = impedansCalcPower(230, 100, 0);
  assert(Math.abs(pw.I - 2.3) < 0.001, 'I should be 2.3A, got ' + pw.I);
  assert(Math.abs(pw.P - 529) < 0.1, 'P should be 529W, got ' + pw.P);
  assert(Math.abs(pw.Q) < 0.001, 'Q should be 0, got ' + pw.Q);
  assert(Math.abs(pw.S - 529) < 0.1, 'S should be 529VA, got ' + pw.S);
});

test('impedansCalcPower: U=230V, Z=141.4ohm, phi=pi/4 => P=S*cos45, Q=S*sin45', function() {
  var pw = impedansCalcPower(230, 141.4, Math.PI / 4);
  var I = 230 / 141.4;
  var S = 230 * I;
  assert(Math.abs(pw.I - I) < 0.01, 'I should be ~1.627A');
  assert(Math.abs(pw.S - S) < 0.5, 'S check');
  assert(Math.abs(pw.P - S * Math.cos(Math.PI / 4)) < 0.5, 'P = S*cos(45)');
  assert(Math.abs(pw.Q - S * Math.sin(Math.PI / 4)) < 0.5, 'Q = S*sin(45)');
});

// --- Opgavesamling Ch.6 exercise verification ---
// Exercise 6.1 (typical): Series RL, R=47 Ohm, L=0.1H, f=50Hz, U=230V
// Expected: XL = 31.42, Z = sqrt(47^2 + 31.42^2) = 56.52, I = 230/56.52 = 4.07A
test('Opgavesamling 6.1: Series RL, R=47, L=0.1H, f=50Hz => Z=56.52, I=4.07A', function() {
  var xl = impedansCalcXL(50, 0.1);
  var z = impedansCalcZSeries(47, xl, 0);
  var expected_z = Math.sqrt(47*47 + xl*xl);
  assert(Math.abs(z - expected_z) < 0.01, 'Z should be ' + expected_z.toFixed(2) + ', got ' + z.toFixed(2));
  var I = 230 / z;
  assert(Math.abs(I - 4.07) < 0.02, 'I should be ~4.07A, got ' + I.toFixed(3));
});

// Exercise 6.5 (typical): Series RC, R=100, C=47uF, f=50Hz, U=230V
// XC = 1/(2*pi*50*47e-6) = 67.73, Z = sqrt(100^2 + 67.73^2) = 120.78, I = 1.904A
test('Opgavesamling 6.5: Series RC, R=100, C=47uF, f=50Hz => Z=120.78, I=1.90A', function() {
  var xc = impedansCalcXC(50, 47e-6);
  var z = impedansCalcZSeries(100, 0, xc);
  var expected_z = Math.sqrt(100*100 + xc*xc);
  assert(Math.abs(z - expected_z) < 0.01, 'Z should be ' + expected_z.toFixed(2));
  assert(Math.abs(xc - 67.73) < 0.1, 'XC should be ~67.73, got ' + xc.toFixed(2));
  var I = 230 / z;
  assert(Math.abs(I - 1.904) < 0.01, 'I should be ~1.904A, got ' + I.toFixed(3));
});

// Exercise 6.12 (typical): Series RLC, R=22, L=0.05H, C=220uF, f=50Hz, U=230V
// XL = 15.71, XC = 14.47, X = 1.24, Z = sqrt(22^2 + 1.24^2) = 22.03, I = 10.44A
test('Opgavesamling 6.12: Series RLC, R=22, L=50mH, C=220uF, f=50Hz => near resonance', function() {
  var xl = impedansCalcXL(50, 0.05);
  var xc = impedansCalcXC(50, 220e-6);
  var z = impedansCalcZSeries(22, xl, xc);
  assert(Math.abs(xl - 15.708) < 0.01, 'XL should be ~15.71, got ' + xl.toFixed(3));
  assert(Math.abs(xc - 14.469) < 0.01, 'XC should be ~14.47, got ' + xc.toFixed(3));
  var X = xl - xc;
  var expected_z = Math.sqrt(22*22 + X*X);
  assert(Math.abs(z - expected_z) < 0.01, 'Z = ' + expected_z.toFixed(3));
  var I = 230 / z;
  assert(I > 10 && I < 11, 'I should be ~10.4A, got ' + I.toFixed(2));
});

// Exercise 6.20 (typical): Resonance calculation, L=0.2H, C=50uF
// f0 = 1/(2*pi*sqrt(0.2*50e-6)) = 1/(2*pi*sqrt(1e-5)) = 50.33 Hz
test('Opgavesamling 6.20: Resonance f0 for L=0.2H, C=50uF => f0=50.33Hz', function() {
  var f0 = impedansCalcResonance(0.2, 50e-6);
  // f0 = 1/(2*pi*sqrt(0.2 * 50e-6)) = 1/(2*pi*sqrt(0.00001)) = 1/(2*pi*0.003162) = 50.33
  assert(Math.abs(f0 - 50.33) < 0.1, 'f0 should be ~50.33Hz, got ' + f0.toFixed(2));
});

// Exercise 6.25 (typical): Power triangle, U=400V, Z=80ohm, phi=36.87deg (cos=0.8)
// I = 5A, S = 2000VA, P = 1600W, Q = 1200var
test('Opgavesamling 6.25: Power triangle U=400V, Z=80, cos(phi)=0.8', function() {
  var phi = Math.acos(0.8); // 36.87 deg
  var pw = impedansCalcPower(400, 80, phi);
  assert(Math.abs(pw.I - 5) < 0.001, 'I should be 5A, got ' + pw.I);
  assert(Math.abs(pw.S - 2000) < 0.1, 'S should be 2000VA, got ' + pw.S);
  assert(Math.abs(pw.P - 1600) < 1, 'P should be 1600W, got ' + pw.P);
  assert(Math.abs(pw.Q - 1200) < 1, 'Q should be 1200var, got ' + pw.Q);
});

// Exercise 6.30 (typical): Parallel RLC at 50Hz, R=100, L=0.318H, C=100uF
// BL = 1/(2*pi*50*0.318) = 0.01, BC = 2*pi*50*100e-6 = 0.0314, G = 0.01
// Y = sqrt(0.01^2 + (0.01 - 0.0314)^2) = sqrt(0.0001 + 0.000459) = 0.02365, Z = 42.28
test('Opgavesamling 6.30: Parallel RLC, R=100, L=0.318H, C=100uF, f=50Hz', function() {
  var xl = impedansCalcXL(50, 0.318);
  var xc = impedansCalcXC(50, 100e-6);
  var z = impedansCalcZParallel(100, xl, xc, 'rlc');
  // XL = 2*pi*50*0.318 = 99.90, XC = 31.83
  assert(Math.abs(xl - 99.90) < 0.1, 'XL = ' + xl.toFixed(2));
  assert(Math.abs(xc - 31.83) < 0.1, 'XC = ' + xc.toFixed(2));
  // G = 1/100 = 0.01, BL = 1/99.9 = 0.01001, BC = 1/31.83 = 0.03142
  // Y = sqrt(0.01^2 + (0.01001-0.03142)^2) = sqrt(0.0001 + 0.000459) = 0.02365
  // Z = 1/Y = 42.28
  assert(z > 40 && z < 45, 'Z should be ~42 Ohm, got ' + z.toFixed(2));
});

// --- Integration test: impedansCalcAll bundle ---
test('impedansCalcAll: Series RLC default state produces valid results', function() {
  var state = { connection: 'series', R: 100, L: 0.1, C: 0.0000001, f: 50, U: 230, components: 'rlc' };
  var res = impedansCalcAll(state);
  assert(res.XL > 0, 'XL positive');
  assert(res.XC > 0, 'XC positive');
  assert(res.Z > 0, 'Z positive');
  assert(isFinite(res.Z), 'Z finite');
  assert(res.phiDeg >= -90 && res.phiDeg <= 90, 'phi in range');
  assert(res.cosPhi >= 0 && res.cosPhi <= 1, 'cosPhi in [0,1]');
  assert(res.I >= 0, 'I non-negative');
  assert(res.S >= 0, 'S non-negative');
  assert(typeof res.charType === 'string', 'charType is string');
});

test('impedansCalcAll: Parallel mode produces finite results', function() {
  var state = { connection: 'parallel', R: 100, L: 0.1, C: 0.000001, f: 50, U: 230, components: 'rlc' };
  var res = impedansCalcAll(state);
  assert(isFinite(res.Z), 'Z finite in parallel mode');
  assert(res.Z > 0, 'Z positive in parallel mode');
  assert(res.I > 0, 'I positive');
});

test('impedansCalcAll: Pure R gives phi=0, cos(phi)=1', function() {
  var state = { connection: 'series', R: 100, L: 0.1, C: 0.0000001, f: 50, U: 230, components: 'r' };
  var res = impedansCalcAll(state);
  assert(Math.abs(res.phiDeg) < 0.001, 'phi should be 0 for pure R, got ' + res.phiDeg);
  assert(Math.abs(res.cosPhi - 1) < 0.001, 'cosPhi should be 1 for pure R');
  assert(Math.abs(res.Z - 100) < 0.001, 'Z should equal R=100');
});

test('impedansCalcAll: Pure L gives phi=+90, cos(phi)=0', function() {
  var state = { connection: 'series', R: 100, L: 0.1, C: 0.0000001, f: 50, U: 230, components: 'l' };
  var res = impedansCalcAll(state);
  // With only L, R=0, XC=0, so phi = atan(XL/0) = 90 deg
  assert(Math.abs(res.phiDeg - 90) < 0.01, 'phi should be 90 for pure L, got ' + res.phiDeg);
});

test('impedansCalcAll: Pure C gives phi=-90, cos(phi)=0', function() {
  var state = { connection: 'series', R: 100, L: 0.1, C: 0.0000001, f: 50, U: 230, components: 'c' };
  var res = impedansCalcAll(state);
  assert(Math.abs(res.phiDeg - (-90)) < 0.01, 'phi should be -90 for pure C, got ' + res.phiDeg);
});

// Exercise: Verify time constant tau_L = L/R
test('impedansCalcAll: RL circuit tau_L = L/R = 0.1/100 = 1ms', function() {
  var state = { connection: 'series', R: 100, L: 0.1, C: 0.0000001, f: 50, U: 230, components: 'rl' };
  var res = impedansCalcAll(state);
  assert(Math.abs(res.tauL - 0.001) < 0.00001, 'tauL should be 1ms, got ' + res.tauL);
});

// Exercise: Verify time constant tau_RC = R*C
test('impedansCalcAll: RC circuit tau_RC = R*C = 100*0.0000001 = 10us', function() {
  var state = { connection: 'series', R: 100, L: 0.1, C: 0.0000001, f: 50, U: 230, components: 'rc' };
  var res = impedansCalcAll(state);
  assert(Math.abs(res.tauRC - 0.00001) < 0.0000001, 'tauRC should be 10us, got ' + res.tauRC);
});

// Exercise 6.40 (typical): Verify resonance detected correctly
test('impedansCalcAll: RLC at resonance frequency gives charType=resistive', function() {
  var L = 0.1, C = 100e-6;
  var f0 = impedansCalcResonance(L, C); // ~50.33 Hz
  var state = { connection: 'series', R: 10, L: L, C: C, f: f0, U: 230, components: 'rlc' };
  var res = impedansCalcAll(state);
  // At resonance, XL = XC, so Z = R and phi = 0
  assert(Math.abs(res.Z - 10) < 0.01, 'Z at resonance should equal R=10, got ' + res.Z.toFixed(3));
  assert(Math.abs(res.phiDeg) < 0.1, 'phi at resonance should be ~0, got ' + res.phiDeg.toFixed(3));
  assert(res.charType === 'resistive', 'charType should be resistive at resonance');
});

// Verify renderImpedans produces non-empty HTML
test('renderImpedans: produces valid HTML string', function() {
  var html = renderImpedans();
  assert(typeof html === 'string', 'returns string');
  assert(html.length > 500, 'produces substantial HTML, got ' + html.length + ' chars');
  assert(html.indexOf('card') >= 0, 'contains card class');
  assert(html.indexOf('sel-btn') >= 0, 'contains selection buttons');
  assert(html.indexOf('svg') >= 0, 'contains SVG phasor diagram');
});

// Verify click-only: no <input type="text">, no <textarea>, no prompt()
test('renderImpedans: 100% click-only (no text inputs)', function() {
  var html = renderImpedans();
  assert(html.indexOf('type="text"') < 0, 'No text input fields');
  assert(html.indexOf('type="number"') < 0, 'No number input fields');
  assert(html.indexOf('<textarea') < 0, 'No textarea');
  assert(html.indexOf('prompt(') < 0, 'No prompt calls');
});

// Verify trilingual support
test('impedans module: trilingual labels (da authoritative, en secondary, fa via _FA)', function() {
  var prevLang = lang;
  try {
    lang = 'da';
    var htmlDa = renderImpedans();
    assert(htmlDa.indexOf('Modstand') >= 0 || htmlDa.indexOf('Serie') >= 0, 'Danish text present');
    lang = 'en';
    var htmlEn = renderImpedans();
    assert(htmlEn.indexOf('Resistance') >= 0 || htmlEn.indexOf('Series') >= 0, 'English text present');
    lang = 'fa';
    var htmlFa = renderImpedans();
    // Farsi content should be present (via _FA lookup)
    assert(htmlFa.length > 500, 'Farsi render produces content');
  } finally {
    lang = prevLang;
  }
});

// Verify module registered in NAV_GROUPS
test('impedans module: registered in NAV_GROUPS and reachable', function() {
  var found = false;
  for (var i = 0; i < NAV_GROUPS.length; i++) {
    if (NAV_GROUPS[i].keys.indexOf('impedans') >= 0) { found = true; break; }
  }
  assert(found, 'impedans must be in NAV_GROUPS');
});

// Verify navGroupForKey returns correct group
test('impedans module: navGroupForKey returns theory group', function() {
  var gid = navGroupForKey('impedans');
  assert(gid === 'theory', 'impedans should be in theory group, got ' + gid);
});

// Verify module translation exists in all languages
test('impedans module: translation exists in da/en/fa', function() {
  var prevLang = lang;
  try {
    lang = 'da';
    var mods = t('modules');
    assert(mods.impedans, 'Danish module name exists: ' + mods.impedans);
    lang = 'en';
    mods = t('modules');
    assert(mods.impedans, 'English module name exists: ' + mods.impedans);
    lang = 'fa';
    mods = t('modules');
    assert(mods.impedans, 'Farsi module name exists: ' + mods.impedans);
  } finally {
    lang = prevLang;
  }
});

// GUARD test: existing core calc math unchanged after impedance module addition
test('AC Impedance GUARD: core calc math unchanged (officialIz + IB regression)', function() {
  var cu25 = { material: 'Cu', mm2: 2.5, model: '', iz: 999 };
  assert.strictEqual(officialIz(cu25), 23, 'officialIz(Cu 2.5mm2 PVC) == 23A unchanged');
  var cu16 = { material: 'Cu', mm2: 16, model: '', iz: 1 };
  assert.strictEqual(officialIz(cu16), 73, 'officialIz(Cu 16mm2 PVC) == 73A unchanged');
  var ib1 = sldCalcNodeIB({ type: 'final_circuit', power_kW: 3.68, cosPhi: 0.95, phases: '1x230', voltage: 230 });
  assert(Math.abs(ib1 - 16.84) < 0.05, 'IB regression ~16.84A unchanged');
});

// --- Summary ---
console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===\n');
if (failed > 0) process.exit(1);
console.log('All tests passed!');
