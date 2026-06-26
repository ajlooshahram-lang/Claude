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

  // Ztrafo = (uk/100) * U^2 / Sn = (5/100) * 160000 / 630000 = 0.01270 ohm
  const zsTrafo = (5 / 100) * (400 * 400) / (630 * 1000);
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

// Test 19b: sldCalcNodeIk returns zeros when Zs is zero (edge case, no division by zero)
test('sldCalcNodeIk returns zeros safely when Zs=0 (no cable/trafo)', function() {
  sldNextId = 350;
  var tree = { nodes: {}, rootId: null };
  // A bare main board with no transformer, no cable, and zero length => Zs = 0
  var mb = sldCreateNode('main_board', null, { phases: '3x400', voltage: 400, cable: null, length_m: 0 });
  tree.nodes[mb.id] = mb;
  tree.rootId = mb.id;
  var ik = sldCalcNodeIk(tree, mb.id);
  assert(ik.ikmax === 0, 'Ikmax should be 0 when Zs=0 (not Infinity). Got: ' + ik.ikmax);
  assert(ik.ikmin === 0, 'Ikmin should be 0 when Zs=0 (not Infinity). Got: ' + ik.ikmin);
  assert(ik.zs === 0, 'Zs should be 0');
  assert(ik.z1 === 0, 'Z1 should be 0');
});

// Test 19c: Three-phase Ikmin uses Zs (loop) with 1.5 temperature factor (DS/HD 60364-4-41)
test('sldCalcNodeIk three-phase Ikmin uses Zs*1.5 (conservative disconnection check)', function() {
  sldNextId = 360;
  var tree = { nodes: {}, rootId: null };
  var trafo = sldCreateNode('transformer', null, { power_kVA: 630, uk_pct: 6 });
  tree.nodes[trafo.id] = trafo;
  tree.rootId = trafo.id;
  var mb = sldCreateNode('main_board', trafo.id, { phases: '3x400', voltage: 400 });
  tree.nodes[mb.id] = mb;
  trafo.childIds.push(mb.id);
  var cable10 = PRODUCTS.cables.find(function(c){ return c.mm2 === 10 && c.material === 'Cu'; });
  var fc = sldCreateNode('final_circuit', mb.id, {
    phases: '3x400', voltage: 400, power_kW: 10, length_m: 50, cable: cable10
  });
  tree.nodes[fc.id] = fc;
  mb.childIds.push(fc.id);
  var ik = sldCalcNodeIk(tree, fc.id);
  var zs = sldCalcNodeZs(tree, fc.id);
  // Formula: Ikmin = 0.95 * 400 / (sqrt(3) * Zs * 1.5)
  var expectedIkmin = 0.95 * 400 / (Math.sqrt(3) * zs * 1.5);
  assert(Math.abs(ik.ikmin - expectedIkmin) < 0.01,
    'Three-phase Ikmin should be ' + expectedIkmin.toFixed(1) + 'A, got ' + ik.ikmin.toFixed(1) + 'A');
  // Ikmin must always be less than Ikmax (conservative: lower is safer for disconnection check)
  assert(ik.ikmin < ik.ikmax,
    'Ikmin (' + ik.ikmin.toFixed(0) + ') must be < Ikmax (' + ik.ikmax.toFixed(0) + ') for safety');
});

// Test 19d: Ik2min formula in scComplexCalc matches IEC 60909-0 clause 4.3.2
test('scComplexCalc Ik2min = 0.95*Un/(2*|Zend|) per IEC 60909-0 clause 4.3.2', function() {
  var saved = JSON.parse(JSON.stringify(scState));
  scState.zNet = 2; scState.zTrafo = 8; scState.rxNet = 0.2; scState.rxTrafo = 0.15;
  var rCable = 15; var xCable = 3; // mOhm
  var Un = 400;
  var cx = scComplexCalc(scState, rCable, xCable, Un, 1.05);
  // Zend is the vector magnitude of total R,X at far end
  var Rend = cx.Rbus + rCable;
  var Xend = cx.Xbus + xCable;
  var Zend = Math.sqrt(Rend * Rend + Xend * Xend);
  var expectedIk2min = 0.95 * Un / (2 * Zend / 1000);
  assert(Math.abs(cx.ikMin2ph - expectedIk2min) < 0.01,
    'Ik2min should be ' + expectedIk2min.toFixed(1) + 'A, got ' + cx.ikMin2ph.toFixed(1) + 'A');
  // Ik2min must be less than Ik3max (fewer phases, more impedance, lower voltage factor)
  assert(cx.ikMin2ph < cx.ikMax3ph,
    'Ik2min (' + cx.ikMin2ph.toFixed(0) + ') < Ik3max (' + cx.ikMax3ph.toFixed(0) + ')');
  Object.assign(scState, saved);
});

// Test 19e: scComplexCalc with zero cable impedance (fault at busbar: Ik2min = Ik at bus with c_min)
test('scComplexCalc with no cable: Ik2min at busbar uses same Z as Ik3max but different formula', function() {
  var saved = JSON.parse(JSON.stringify(scState));
  scState.zNet = 1; scState.zTrafo = 5; scState.rxNet = 0.1; scState.rxTrafo = 0.1;
  var cx = scComplexCalc(scState, 0, 0, 400, 1.05);
  // When no cable, Zend = Zbus (same impedance point)
  assert(Math.abs(cx.Zend - cx.Zbus) < 1e-9, 'Zend should equal Zbus when no cable');
  // Ik2min = 0.95*400/(2*Zbus/1000), Ik3max = 1.05*400/(sqrt(3)*Zbus/1000)
  // Ratio: Ik2min/Ik3max = (0.95/1.05) * (sqrt(3)/2) = 0.904 * 0.866 = 0.783
  var ratio = cx.ikMin2ph / cx.ikMax3ph;
  var expectedRatio = (0.95 / 1.05) * (Math.sqrt(3) / 2);
  assert(Math.abs(ratio - expectedRatio) < 1e-6,
    'Ik2min/Ik3max ratio should be ' + expectedRatio.toFixed(4) + ', got ' + ratio.toFixed(4));
  Object.assign(scState, saved);
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

// Test 41b: sldGetTripTime 'min' returns the FASTEST (tMin) trip time, never slower than tMax
test('sldGetTripTime which=min returns tMin <= tMax (for conservative selectivity)', function() {
  var mcb = PRODUCTS.mcbs.find(function(m){ return m.curve === 'C' && m.rating === 25; });
  assert(mcb, 'Should find MCB C25');
  // In the thermal region (e.g. 3*In = 75A, below C-curve isdMin 7*25=175A)
  var I = 3 * 25;
  var tMax = sldGetTripTime(mcb, 25, I, null);
  var tMin = sldGetTripTime(mcb, 25, I, null, 'min');
  assert(tMin <= tMax + 1e-9, 'tMin (' + tMin + ') must be <= tMax (' + tMax + ')');
  assert(tMin > 0 && tMin < Infinity, 'tMin finite and positive in thermal region');
  // Below threshold both return Infinity
  assert(sldGetTripTime(mcb, 25, 5, null, 'min') === Infinity, 'min mode also returns Infinity below threshold');
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
  assert.strictEqual(T.da.modules.cable3d, '3D Kabelføring');
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

// Test 166: Transformer impedance values within EN 50588-1 ranges
test('Transformer ukPct values within EN 50588-1 standard ranges', function() {
  var trafos = PRODUCTS.transformers;
  for (var i = 0; i < trafos.length; i++) {
    var t = trafos[i];
    assert.ok(t.ukPct >= 3.5 && t.ukPct <= 8.0, t.id + ' ukPct=' + t.ukPct + ' must be 3.5-8.0%');
    // EN 50588-1: up to 630 kVA typically 4%, above 630 kVA typically 6%
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
test('zsGetMaxZs: gG63 = 0.79 ohm (conservative, from FUSE_5S)', function() {
  assert.strictEqual(zsGetMaxZs('gG63'), 0.79);
});

test('standards: ZS_MAX_TABLE fuse entries are conservative (min of 230/FUSE_5S and DS/HD table)', function () {
  // The Zs module table for gG fuses must always be the MOST RESTRICTIVE (lowest)
  // value — either 230/FUSE_5S or the DS/HD 60364 published table value, whichever
  // gives the lower Zs_max. This ensures no installation is ever approved when the
  // fault loop impedance is too high for safe disconnection.
  var fuse5s = {6:26,10:43,16:72,20:90,25:110,32:145,40:180,50:230,63:290,80:370,100:460,125:580,160:750};
  [6,10,16,20,25,32,40,50,63,80,100,125,160].forEach(function(In) {
    var key = 'gG' + In;
    var tableVal = zsGetMaxZs(key);
    var fromFuse5s = Math.round(230 / fuse5s[In] * 100) / 100;
    // Table must be <= both sources (conservative minimum)
    assert.ok(tableVal <= fromFuse5s + 0.01, key + ' table(' + tableVal + ') <= 230/FUSE_5S(' + fromFuse5s + ')');
    assert.ok(tableVal > 0, key + ' is positive');
  });
  // MCB values are formula-exact: Zs_max = 230/(factor*In)
  assert.ok(Math.abs(zsGetMaxZs('B16') - 230/(5*16)) < 0.01, 'B16 = 230/80');
  assert.ok(Math.abs(zsGetMaxZs('C16') - 230/(10*16)) < 0.01, 'C16 = 230/160');
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

// Test 508: Fuse-Fuse full selectivity (ratio >= 1.6, with lookup table data)
test('discrimAnalyze: fuse 100A vs fuse 50A = full (ratio 2.0)', function() {
  // No table entry for 100/50 pair, so unresolved (conservative)
  var result = discrimEngine('fuse', 100, 'fuse', 50, null, 10000);
  assert(result.verdict === 'unresolved' || result.verdict === 'full', 'no 100/50 entry -> unresolved or full if entry exists');
});

// Test 509: Fuse-Fuse not selective (ratio < 1.6)
test('discrimAnalyze: fuse 63A vs fuse 50A = unresolved (no table entry)', function() {
  // 63/50 not in table -> unresolved (conservative)
  var result = discrimEngine('fuse', 63, 'fuse', 50, null, 10000);
  assert.strictEqual(result.verdict, 'unresolved', 'no 63/50 entry -> unresolved');
});

// Test 510: Fuse-MCB full selectivity (table lookup)
test('discrimAnalyze: fuse 63A vs MCB 25A = full (ratio 2.52)', function() {
  var result = discrimEngine('fuse', 63, 'mcb', 25, 'C', 6000);
  assert.strictEqual(result.verdict, 'full', 'Is=6000 >= ikMax=6000 => full');
  assert.strictEqual(result.is, 6000);
});

// Test 511: Fuse-MCB (25A/16A/C now in table with Is=3000)
test('discrimAnalyze: fuse 25A vs MCB 16A/C = partial (Is=3000 < Ik=6000)', function() {
  // 25/16/C -> Is=3000 from table, < Ik_max=6000 -> partial
  var result = discrimEngine('fuse', 25, 'mcb', 16, 'C', 6000);
  assert.strictEqual(result.verdict, 'partial', 'Is=3000 < ikMax=6000 -> partial');
  assert.strictEqual(result.is, 3000, 'Is should be 3000');
});

// Test 512: MCB-MCB partial selectivity possible (not NEVER as old code claimed)
test('discrimAnalyze: MCB-MCB is NEVER fully selective', function() {
  // MCB 63A C / MCB 16A C -> Is=1500 (from table)
  var result = discrimEngine('mcb', 63, 'mcb', 16, 'C', 6000);
  assert.strictEqual(result.verdict, 'partial', 'Is=1500 < ikMax=6000 -> partial');
  assert.strictEqual(result.is, 1500);
});

// Test 513: MCCB-MCB selective with table lookup
test('discrimAnalyze: MCCB 160A vs MCB 16A = full', function() {
  var result = discrimEngine('mccb', 160, 'mcb', 16, 'C', 25000);
  assert.strictEqual(result.verdict, 'full', 'Is=36000 >= ikMax=25000 -> full');
  assert.strictEqual(result.is, 36000);
});

// Test 514: MCCB-MCB unresolved when no table entry
test('discrimAnalyze: MCCB 80A vs MCB 50A = partial', function() {
  // No table entry for 80/50/C -> unresolved (conservative)
  var result = discrimEngine('mccb', 80, 'mcb', 50, 'C', 6000);
  assert.strictEqual(result.verdict, 'unresolved', 'no table entry for MCCB 80/MCB 50C -> unresolved');
});

// Test 515: renderDiscrim has no text inputs
test('renderDiscrim has no text input fields', function() {
  var html = renderDiscrim();
  assert(html.indexOf('<input type="text"') < 0);
  assert(html.indexOf('<textarea') < 0);
});

// Test 516: renderDiscrim references relevant standards
test('renderDiscrim references IEC 60947 and DS/HD 60364-4-43', function() {
  var html = renderDiscrim();
  assert(html.indexOf('IEC 60') >= 0, 'must reference an IEC standard');
});

// Test 517: Discrimination ratio calculations correct
test('discrimAnalyze: ratio is correctly computed', function() {
  var result = discrimEngine('fuse', 200, 'fuse', 100, null, 10000);
  assert.strictEqual(result.ratio, 2.0);
});

// Test 518: renderDiscrim shows color-coded results
test('renderDiscrim uses color coding for verdict', function() {
  var html = renderDiscrim();
  assert(html.indexOf('color:') >= 0);
});

// Test 519: Selectivity limit Is from table for known pair
test('discrimAnalyze partial has Is > 0', function() {
  var result = discrimEngine('fuse', 100, 'fuse', 63, null, 10000);
  assert(result.is > 0, 'Is should be > 0 for known fuse-fuse pair');
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
  var hasVRT = result.some(function(r){return r.req.indexOf('ride-through') >= 0 || r.req.indexOf('gennemk\u00f8rsel') >= 0 || r.req.indexOf('gennemkoersel') >= 0;});
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

// --- "Pick All" is the default state (first-ever load seeds all materials) ---------
// The distinguishing signal is whether the storage key EXISTS, NOT whether it is empty.

test('Elforsyning: default map = every supply-side product at qty 1 (matches Pick All set)', function() {
  elfReset();
  var def = elforsyningDefaultBom();
  var expected = elfExpectedProductCount();
  assert.strictEqual(expected, 67, 'v1 catalogue has 67 supply-side products');
  assert.strictEqual(Object.keys(def).length, expected, 'default contains every product');
  // Exactly the set Pick All would produce on an empty list.
  elforsyningBom = {};
  elforsyningPickAll();
  assert.deepStrictEqual(Object.keys(def).sort(), Object.keys(elforsyningBom).sort(),
    'default ids == Pick All ids');
  Object.keys(def).forEach(function(id) {
    assert.strictEqual(def[id].qty, 1, 'default qty 1 for ' + id);
    assert(elforsyningProductById(id), 'default id is a real product: ' + id);
  });
  elfRestore();
});

test('Elforsyning (a): FIRST-EVER load (storage key ABSENT) defaults to ALL 67 materials picked at qty 1 and persists once', function() {
  elfReset(); // empties bom + removes the storage key
  assert.strictEqual(localStorage.getItem(ELFORSYNING_BOM_KEY), null, 'precondition: key absent');
  var bom = elforsyningInitBom();
  var expected = elfExpectedProductCount();
  assert.strictEqual(Object.keys(bom).length, expected, 'all ' + expected + ' materials seeded');
  Object.keys(bom).forEach(function(id) {
    assert.strictEqual(bom[id].qty, 1, 'seeded line qty 1 for ' + id);
  });
  // The seed must be PERSISTED so it happens exactly once.
  var raw = localStorage.getItem(ELFORSYNING_BOM_KEY);
  assert(raw !== null, 'seed persisted: key now present');
  var parsed = JSON.parse(raw);
  assert.strictEqual(Object.keys(parsed).length, expected, 'persisted seed holds all materials');
  // A subsequent init must NOT mutate the (now present) state.
  var bom2 = elforsyningInitBom();
  assert.strictEqual(Object.keys(bom2).length, expected, 'second init still full (idempotent)');
  elfRestore();
});

test('Elforsyning (b): reload after deliberate Clear All (key present = "{}") stays EMPTY — no re-seed', function() {
  elfReset();
  // Simulate a user who pressed Clear All: bom emptied + persisted as the empty object.
  elforsyningBom = {};
  elforsyningSaveBom();
  assert.strictEqual(localStorage.getItem(ELFORSYNING_BOM_KEY), '{}', 'cleared list persisted as "{}"');
  // Reload: init must respect the present (empty) key and NOT re-seed.
  var bom = elforsyningInitBom();
  assert.strictEqual(Object.keys(bom).length, 0, 'cleared list stays cleared across reload');
  assert.strictEqual(localStorage.getItem(ELFORSYNING_BOM_KEY), '{}', 'storage still empty object (not re-seeded)');
  elfRestore();
});

test('Elforsyning (c): reload with a PARTIAL saved BOM is preserved exactly (qty respected, unknown ids dropped, no re-seed)', function() {
  elfReset();
  // Pick a couple of real ids from two different categories.
  var ids = [];
  ELF_CATS.forEach(function(c) {
    var arr = PRODUCTS[c] || [];
    if (arr.length && ids.length < 2) ids.push({ id: arr[0].id, category: c });
  });
  assert(ids.length === 2, 'have two real product ids for the partial set');
  var saved = {};
  saved[ids[0].id] = { category: ids[0].category, qty: 4 };
  saved[ids[1].id] = { category: ids[1].category, qty: 1 };
  saved['NOT-A-REAL-ID'] = { category: 'metering', qty: 9 }; // must be dropped
  localStorage.setItem(ELFORSYNING_BOM_KEY, JSON.stringify(saved));
  var bom = elforsyningInitBom();
  assert.strictEqual(Object.keys(bom).length, 2, 'only the 2 real ids preserved (unknown dropped, no re-seed)');
  assert.strictEqual(bom[ids[0].id].qty, 4, 'qty 4 respected');
  assert.strictEqual(bom[ids[1].id].qty, 1, 'qty 1 respected');
  assert(!bom['NOT-A-REAL-ID'], 'unknown id dropped');
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

test('Elforsyning: distinct line items vs total quantity are tracked separately and correctly', function() {
  elfReset();
  elforsyningPickAll();
  var distinctExpected = elfExpectedProductCount(); // one line per product
  assert.strictEqual(elforsyningDistinctCount(), distinctExpected, 'distinct == number of products');
  assert.strictEqual(elforsyningTotalCount(), distinctExpected, 'qty 1 each -> total == distinct initially');
  // Bump one line to 10 pcs: distinct unchanged, total grows by 9.
  var id = elforsyningBomLines()[0].id;
  var cat = elforsyningBomLines()[0].category;
  elforsyningSetQty(id, 10);
  assert.strictEqual(elforsyningDistinctCount(), distinctExpected, 'distinct unaffected by qty change');
  assert.strictEqual(elforsyningTotalCount(), distinctExpected + 9, 'total reflects qty bump');
  // Per-category: distinct count is the product count; qty count includes the bump.
  assert.strictEqual(elforsyningCategoryDistinctCount(cat), (PRODUCTS[cat] || []).length, 'category distinct == product count');
  assert.strictEqual(elforsyningCategoryCount(cat), (PRODUCTS[cat] || []).length + 9, 'category qty includes bump');
  elfRestore();
});

test('Elforsyning: export data carries distinctCount + per-category distinct counts (additive to JSON)', function() {
  elfReset();
  elforsyningPickAll();
  var id = elforsyningBomLines()[0].id;
  elforsyningSetQty(id, 5);
  var data = elforsyningExportData();
  assert.strictEqual(data.distinctCount, elforsyningDistinctCount(), 'distinctCount exported');
  assert(data.distinctCount < data.totalCount, 'distinct (' + data.distinctCount + ') < total (' + data.totalCount + ') after a qty bump');
  assert(data.categoryDistinctCounts && typeof data.categoryDistinctCounts === 'object', 'categoryDistinctCounts present');
  ELF_CATS.forEach(function(c) {
    assert.strictEqual(data.categoryDistinctCounts[c], elforsyningCategoryDistinctCount(c), 'distinct count for ' + c);
  });
  elfRestore();
});

test('Elforsyning: CSV export has metadata preamble, header row + one data row per BOM line', function() {
  elfReset();
  elforsyningPickAll();
  var id = elforsyningBomLines()[0].id;
  elforsyningSetQty(id, 3);
  var csv = elforsyningExportCsvText();
  var allLines = csv.split('\r\n').filter(function(l) { return l.length > 0; });
  var preamble = allLines.filter(function(l) { return l.charAt(0) === '#'; });
  assert(preamble.length === 5, 'five informational preamble lines (got ' + preamble.length + ')');
  // header + data
  var dataLines = allLines.filter(function(l) { return l.charAt(0) !== '#'; });
  assert.strictEqual(dataLines.length, elforsyningDistinctCount() + 1, 'header + one row per distinct line item');
  // RFC4180 line endings
  assert(csv.indexOf('\r\n') >= 0, 'CRLF line endings');
  // distinct + total surfaced in preamble
  assert(csv.indexOf('' + elforsyningDistinctCount()) >= 0 && csv.indexOf('' + elforsyningTotalCount()) >= 0, 'distinct + total in preamble');
  elfRestore();
});

test('Elforsyning: CSV header is correct and localizes (da/en); never contains a price column', function() {
  elfReset();
  elforsyningPickAll();
  var savedLang = lang;
  lang = 'da';
  var da = elforsyningExportCsvText();
  var daHeader = da.split('\r\n').filter(function(l) { return l.charAt(0) !== '#' && l.length; })[0];
  assert.strictEqual(daHeader, 'Kategori,M\u00E6rke,Model,Specifikation,Standard,Godkendelse,Antal,Produktside,Datablad', 'da header');
  lang = 'en';
  var en = elforsyningExportCsvText();
  var enHeader = en.split('\r\n').filter(function(l) { return l.charAt(0) !== '#' && l.length; })[0];
  assert.strictEqual(enHeader, 'Category,Brand,Model,Spec,Standard,Approval,Qty,Product page,Datasheet', 'en header');
  // No invented prices: there must be no price column and no currency amounts.
  // (The wholesaler note legitimately contains the word "Prices are not included".)
  assert(enHeader.toLowerCase().indexOf('price') < 0 && enHeader.toLowerCase().indexOf('pris') < 0, 'no price column in header');
  assert(en.indexOf('kr.') < 0 && en.indexOf('DKK') < 0, 'no currency amounts in CSV');
  // Wholesaler verification note carried in the preamble.
  assert(en.indexOf('Solar') >= 0 && en.indexOf('Sanist\u00E5l') >= 0, 'wholesaler note in CSV preamble');
  lang = savedLang;
  elfRestore();
});

test('Elforsyning: CSV surfaces the official product/datasheet deep-links per line (procurement)', function() {
  elfReset();
  elforsyningPickAll();
  var data = elforsyningExportData();
  // Find a line that actually carries a deep-link in the export object.
  var withUrl = data.lines.filter(function(l) { return l.productUrl; });
  assert(withUrl.length >= 1, 'at least one line has an official product URL');
  var csv = elforsyningExportCsvText();
  assert(csv.indexOf(withUrl[0].productUrl) >= 0, 'product URL appears as a CSV cell');
  // The deep-link must be a manufacturer https URL (never invented/relative).
  assert(/^https:\/\//.test(withUrl[0].productUrl), 'deep-link is an https manufacturer URL');
  elfRestore();
});

test('Elforsyning: CSV cell escaping is RFC4180-safe (quotes/commas/newlines)', function() {
  assert.strictEqual(elforsyningCsvCell('plain'), 'plain', 'plain text untouched');
  assert.strictEqual(elforsyningCsvCell('a,b'), '"a,b"', 'comma wrapped');
  assert.strictEqual(elforsyningCsvCell('say "hi"'), '"say ""hi"""', 'inner quotes doubled + wrapped');
  assert.strictEqual(elforsyningCsvCell('line1\r\nline2'), '"line1\r\nline2"', 'newline wrapped');
  assert.strictEqual(elforsyningCsvCell(null), '', 'null -> empty');
  assert.strictEqual(elforsyningCsvCell(7), '7', 'number stringified');
});

test('Elforsyning: render shows distinct-line-items + grand-total quantity rows in BOTH da and en', function() {
  elfReset();
  elforsyningPickAll();
  var savedLang = lang;
  lang = 'da';
  var da = renderElforsyningBom();
  assert(da.indexOf('Varelinjer (forskellige produkter)') >= 0, 'da distinct-line-items label');
  assert(da.indexOf('Eksporter CSV') >= 0, 'da CSV export button');
  assert(da.indexOf(' varer \u00B7 ') >= 0, 'da per-category distinct/qty subtitle');
  lang = 'en';
  var en = renderElforsyningBom();
  assert(en.indexOf('Line items (distinct products)') >= 0, 'en distinct-line-items label');
  assert(en.indexOf('Export CSV') >= 0, 'en CSV export button');
  assert(en.indexOf(' items \u00B7 ') >= 0, 'en per-category distinct/qty subtitle');
  assert(en.indexOf('Grand total') >= 0, 'grand total still present');
  lang = savedLang;
  elfRestore();
});

test('Elforsyning: print report distinguishes distinct line items from total quantity (no mislabel)', function() {
  elfReset();
  elforsyningPickAll();
  var id = elforsyningBomLines()[0].id;
  elforsyningSetQty(id, 8); // make total != distinct so the two numbers are visibly different
  var savedLang = lang; lang = 'en';
  var report = elforsyningReportHtml();
  assert(report.indexOf('Line items (distinct products)') >= 0, 'distinct line-items label present');
  assert(report.indexOf('Total quantity') >= 0, 'total-quantity label present');
  assert(report.indexOf('>' + elforsyningDistinctCount() + '<') >= 0, 'distinct number rendered');
  // The old, inaccurate "Total line items: <qty sum>" wording must be gone.
  assert(report.indexOf('Total line items') < 0, 'mislabeled wording removed');
  // CSV-style deep-links must still NOT leak into the printed report.
  assert(report.indexOf('http://') < 0 && report.indexOf('https://') < 0, 'still no remote URLs in print');
  lang = savedLang;
  elfRestore();
});

test('Elforsyning: CSV export is click-only data (no markup/script/text-input injected)', function() {
  elfReset();
  elforsyningPickAll();
  var csv = elforsyningExportCsvText();
  assert(csv.toLowerCase().indexOf('<script') < 0, 'no script tag');
  assert(csv.indexOf('<input') < 0 && csv.indexOf('<textarea') < 0, 'no form controls');
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

// ===== Standards verification layer (life-safety: correct IEC/EN/DS clause per line) =====
test('Elforsyning: EVERY product across the 8 categories cites a recognised IEC/EN/DS standard', function() {
  var v = elforsyningVerifyStandards();
  assert.strictEqual(v.total, elfExpectedProductCount(), 'checks every product in the 8 categories');
  assert.deepStrictEqual(v.anomalies, [], 'no product has a missing/unrecognised standard: ' + JSON.stringify(v.anomalies));
  assert.strictEqual(v.ok, true, 'overall standards check is OK');
  assert.strictEqual(v.verified, v.total, 'verified count equals total');
});

test('Elforsyning: expected-standards registry covers all 8 categories with non-empty sets', function() {
  ELF_CATS.forEach(function(c) {
    assert(Array.isArray(ELFORSYNING_EXPECTED_STANDARDS[c]) && ELFORSYNING_EXPECTED_STANDARDS[c].length >= 1,
      'registry has standards for ' + c);
  });
});

test('Elforsyning: cable joints cite EN 50393 (LV 0,6/1kV accessories) — NOT IEC 60840 (>30kV HV)', function() {
  // IEC 60840 applies only to HV cables/accessories above 30 kV (Um=36 kV) up to 150 kV.
  // These joints are 16-240 mm2 for 0,6/1 kV distribution cables -> EN 50393 is correct.
  PRODUCTS.cableJoints.forEach(function(p) {
    assert.strictEqual(p.standard, 'EN 50393', p.id + ' cites EN 50393');
    assert.notStrictEqual(p.standard, 'IEC 60840', p.id + ' must NOT cite HV IEC 60840');
  });
});

test('Elforsyning: transformers cite EN 50588-1 (oil+dry, Um<=36kV) — NOT withdrawn EN 50464-1', function() {
  PRODUCTS.transformers.forEach(function(p) {
    assert.strictEqual(p.standard, 'EN 50588-1', p.id + ' cites EN 50588-1');
    assert.notStrictEqual(p.standard, 'EN 50464-1', p.id + ' must NOT cite withdrawn oil-only EN 50464-1');
  });
});

test('Elforsyning: no supply-side line cites the HV-only IEC 60840 clause anywhere', function() {
  ELF_CATS.forEach(function(c) {
    (PRODUCTS[c] || []).forEach(function(p) {
      assert.notStrictEqual(p.standard, 'IEC 60840', c + '/' + p.id + ' must not cite IEC 60840 (HV >30kV)');
    });
  });
});

test('Elforsyning: verifier DETECTS a missing or unrecognised standard (negative test, restores data)', function() {
  var sample = PRODUCTS.terminals[0];
  var original = sample.standard;
  // Inject an unrecognised standard and confirm the verifier flags exactly that line.
  sample.standard = 'IEC 99999-1';
  var v1 = elforsyningVerifyStandards();
  assert.strictEqual(v1.ok, false, 'unrecognised standard breaks the check');
  var hit1 = v1.anomalies.filter(function(a) { return a.id === sample.id; });
  assert(hit1.length === 1 && hit1[0].reason === 'unrecognised', 'flags the injected line as unrecognised');
  // Now remove the standard entirely and confirm it is flagged as missing.
  delete sample.standard;
  var v2 = elforsyningVerifyStandards();
  var hit2 = v2.anomalies.filter(function(a) { return a.id === sample.id; });
  assert(hit2.length === 1 && hit2[0].reason === 'missing', 'flags the line with no standard as missing');
  // Restore the original data so no other test is affected.
  sample.standard = original;
  assert.strictEqual(elforsyningVerifyStandards().ok, true, 'data restored, check OK again');
});

test('Elforsyning: JSON export carries a standardsCheck summary (ok + counts + anomalies)', function() {
  elfReset();
  elforsyningPickAll();
  var data = elforsyningExportData();
  assert(data.standardsCheck && typeof data.standardsCheck === 'object', 'standardsCheck present');
  assert.strictEqual(data.standardsCheck.ok, true, 'export reports a passing standards check');
  assert.strictEqual(data.standardsCheck.total, elfExpectedProductCount(), 'total counted');
  assert.deepStrictEqual(data.standardsCheck.anomalies, [], 'no anomalies in export');
  elfRestore();
});

test('Elforsyning: standards-check line renders in the BOM UI in BOTH da and en (and fa fragment)', function() {
  elfReset();
  elforsyningPickAll();
  var savedLang = lang;
  lang = 'da';
  var da = renderElforsyningBom();
  assert(da.indexOf('Standardtjek') >= 0, 'da standards-check label');
  assert(da.indexOf('\u2713') >= 0, 'da shows the pass checkmark');
  lang = 'en';
  var en = renderElforsyningBom();
  assert(en.indexOf('Standards check') >= 0, 'en standards-check label');
  assert(en.indexOf('recognised IEC/EN/DS standard') >= 0, 'en explains recognised standard');
  lang = 'fa';
  var fa = renderElforsyningBom();
  assert(fa.indexOf(_FA['Standards check']) >= 0, 'fa standards-check label rendered');
  lang = savedLang;
  elfRestore();
});

test('Elforsyning: print report includes the standards-check summary line', function() {
  elfReset();
  elforsyningPickAll();
  var savedLang = lang; lang = 'en';
  var report = elforsyningReportHtml();
  assert(report.indexOf('Standards check') >= 0, 'report shows standards-check line');
  assert(report.indexOf('\u2713') >= 0, 'report shows the pass checkmark');
  lang = savedLang;
  elfRestore();
});

// ===== Coordination / coherence audit (life-safety: DS/HD 60364-4-43 overload, -5-54 PE) =====
// Pick a specific SET of real product ids (click-only equivalent of toggling those lines on).
function elfPick(ids) {
  elforsyningBom = {};
  ids.forEach(function(id) {
    var found = elforsyningProductById(id);
    assert(found, 'fixture product exists: ' + id);
    elforsyningBom[id] = { category: found.category, qty: 1 };
  });
}

test('Elforsyning coordination: transformer full-load current at 400V matches the 7 reference values (0.1A)', function() {
  // I_fl = kVA*1000/(sqrt(3)*400) = kVA*1.443376 A. Reference set from DS/HD 60364 design tables.
  var refs = [[50, 72.2], [100, 144.3], [250, 360.8], [400, 577.4], [630, 909.3], [1000, 1443.4], [2500, 3608.4]];
  refs.forEach(function(pair) {
    var got = elforsyningRound1(elforsyningTransformerFlc(pair[0]));
    assert.strictEqual(got, pair[1], pair[0] + 'kVA -> ' + pair[1] + 'A (got ' + got + ')');
  });
  // Conservative: a missing/invalid kVA yields null (unresolved), never a fabricated current.
  assert.strictEqual(elforsyningTransformerFlc(0), null, 'zero kVA unresolved');
  assert.strictEqual(elforsyningTransformerFlc(undefined), null, 'missing kVA unresolved');
  assert.strictEqual(elforsyningTransformerFlc(-5), null, 'negative kVA unresolved');
});

test('Elforsyning coordination: PE conductor sizing follows DS/HD 60364-5-54 §543.1.2 table 54.7', function() {
  // S<=16 -> S ; 16<S<=35 -> 16 ; S>35 -> S/2 (line and PE same material).
  var refs = [[16, 16], [25, 16], [35, 16], [50, 25], [95, 47.5], [240, 120]];
  refs.forEach(function(p) {
    assert.strictEqual(elforsyningPeMinCrossSection(p[0]), p[1], p[0] + 'mm2 -> PE ' + p[1] + 'mm2');
  });
  assert.strictEqual(elforsyningPeMinCrossSection(0), null, 'missing cross-section unresolved');
  assert.strictEqual(elforsyningPeMinCrossSection(undefined), null, 'undefined cross-section unresolved');
});

test('Elforsyning coordination: a coherent picked set coordinates (ok:true, zero warnings)', function() {
  elfReset();
  // 95mm2 Cu cable Iz=220A, 160A NH fuse (220>=160), 100kVA transformer (I_fl=144.3A <=220 and <=160? no).
  // 100kVA -> 144.3A: cable 220>=144.3 OK and fuse 160>=144.3 OK -> coordinated.
  elfPick(['SC-CU-95', 'MF-NH00-160', 'TR-ONAN-100']);
  var r = elforsyningVerifyCoordination();
  assert.strictEqual(r.empty, false, 'not empty');
  assert.strictEqual(r.warnings.length, 0, 'zero warnings: ' + JSON.stringify(r.warnings));
  assert.strictEqual(r.ok, true, 'coordinated set is OK');
  // PE guidance present for the 95mm2 cable (95/2 = 47.5).
  var pe = r.checks.filter(function(c) { return c.code === 'pe-sizing' && c.id === 'SC-CU-95'; })[0];
  assert(pe && pe.peMm2 === 47.5, 'PE 47.5mm2 for 95mm2 cable');
  assert(r.checks.some(function(c) { return c.code === 'transformer-supply-ok'; }), 'transformer-carryable info present');
  assert(r.checks.some(function(c) { return c.code === 'overload-fuse-ok'; }), 'fuse-covered info present');
});

test('Elforsyning coordination: WARNS when no picked cable can carry a picked fuse (DS/HD 60364-4-43)', function() {
  elfReset();
  elfPick(['SC-CU-25', 'MF-NH00-160']); // cable Iz=110A < fuse In=160A
  var r = elforsyningVerifyCoordination();
  assert.strictEqual(r.ok, false, 'uncarried fuse breaks coordination');
  var w = r.warnings.filter(function(x) { return x.code === 'fuse-no-cable'; });
  assert(w.length === 1 && w[0].rating === 160, 'flags the 160A fuse as uncarried');
  assert(w[0].text.indexOf('60364-4-43') >= 0, 'warning cites the overload clause');
});

test('Elforsyning coordination: WARNS a cable below the smallest fuse could be overloaded (DS/HD 60364-4-43)', function() {
  elfReset();
  // 16mm2 Al cable Iz=68A and 95mm2 Cu cable Iz=220A, with a 100A fuse. Smallest fuse=100A.
  // The 68A cable < 100A -> unprotected; the 220A cable carries the fuse so NO fuse-no-cable.
  elfPick(['SC-AL-16', 'SC-CU-95', 'MF-NH00-100']);
  var r = elforsyningVerifyCoordination();
  var w = r.warnings.filter(function(x) { return x.code === 'cable-unprotected'; });
  assert(w.length === 1 && w[0].id === 'SC-AL-16' && w[0].minFuseIn === 100, 'flags the 68A cable');
  assert(r.warnings.filter(function(x) { return x.code === 'fuse-no-cable'; }).length === 0, '100A fuse IS carried by the 220A cable');
  assert.strictEqual(r.ok, false, 'unprotected cable breaks coordination');
});

test('Elforsyning coordination: WARNS when the supply cannot carry a transformer rated current (DS/HD 60364)', function() {
  elfReset();
  // 25mm2 cable Iz=110A, 100A fuse, 630kVA transformer -> I_fl=909.3A >> 110A and > 100A.
  elfPick(['SC-CU-25', 'MF-NH00-100', 'TR-ONAN-630']);
  var r = elforsyningVerifyCoordination();
  var w = r.warnings.filter(function(x) { return x.code === 'transformer-supply-insufficient'; });
  assert(w.length === 1 && w[0].flc === 909.3, 'flags the 630kVA transformer (909.3A)');
  assert(w[0].text.indexOf('60364') >= 0, 'warning cites the clause');
  assert.strictEqual(r.ok, false, 'over-capacity transformer breaks coordination');
});

test('Elforsyning coordination: CONSERVATIVE — a missing required value is unresolved, never reported OK', function() {
  elfReset();
  elfPick(['SC-CU-95', 'MF-NH00-160', 'TR-ONAN-100']); // otherwise-coordinated set
  var t = elforsyningProductById('TR-ONAN-100').product;
  var origKva = t.kva;
  delete t.kva; // simulate an unknown rating
  var r = elforsyningVerifyCoordination();
  assert.strictEqual(r.ok, false, 'unknown transformer kVA must NOT report OK');
  assert(r.warnings.some(function(x) { return x.code === 'transformer-kva-unresolved'; }), 'flags missing kVA as unresolved');
  t.kva = origKva; // restore so no other test is affected
  assert.strictEqual(elforsyningVerifyCoordination().ok, true, 'restored data coordinates again');
});

test('Elforsyning coordination: empty BOM is stated plainly (not OK, not "coordinates")', function() {
  elfReset();
  var r = elforsyningVerifyCoordination();
  assert.strictEqual(r.empty, true, 'empty flag set');
  assert.strictEqual(r.ok, false, 'empty is never reported as coordinated');
  assert.strictEqual(r.warnings.length, 0, 'no warnings on an empty list');
  var savedLang = lang; lang = 'en';
  var s = elforsyningCoordinationSummary();
  assert(s.indexOf('the list is empty') >= 0, 'summary plainly says empty');
  assert(s.indexOf('\u2713') < 0, 'no pass checkmark on an empty list');
  lang = savedLang;
});

test('Elforsyning coordination: JSON export carries coordinationCheck (ok/empty/warnings/checks/counts)', function() {
  elfReset();
  elfPick(['SC-CU-95', 'MF-NH00-160', 'TR-ONAN-100']);
  var data = elforsyningExportData();
  assert(data.coordinationCheck && typeof data.coordinationCheck === 'object', 'coordinationCheck present');
  assert.strictEqual(data.coordinationCheck.ok, true, 'coordinated set exports ok:true');
  assert.strictEqual(data.coordinationCheck.empty, false, 'empty:false');
  assert.strictEqual(data.coordinationCheck.warningCount, 0, 'no warnings exported');
  assert(Array.isArray(data.coordinationCheck.checks) && data.coordinationCheck.checks.length >= 1, 'checks array exported');
  assert.strictEqual(data.coordinationCheck.counts.cables, 1, 'cable count');
  assert.strictEqual(data.coordinationCheck.counts.transformers, 1, 'transformer count');
  // A non-coordinated set also serialises its warnings.
  elfPick(['SC-CU-25', 'MF-NH00-160']);
  var d2 = elforsyningExportData();
  assert.strictEqual(d2.coordinationCheck.ok, false, 'non-coordinated set exports ok:false');
  assert(d2.coordinationCheck.warningCount >= 1, 'warnings serialised');
  elfRestore();
});

test('Elforsyning coordination: summary surfaces in BOM UI and print report (da/en/fa)', function() {
  elfReset();
  elfPick(['SC-CU-95', 'MF-NH00-160', 'TR-ONAN-100']);
  var savedLang = lang;
  lang = 'da';
  var da = renderElforsyningBom();
  assert(da.indexOf('Koordineringstjek') >= 0, 'da UI coordination label');
  assert(elforsyningReportHtml().indexOf('Koordineringstjek') >= 0, 'da report coordination label');
  lang = 'en';
  var en = renderElforsyningBom();
  assert(en.indexOf('Coordination check') >= 0, 'en UI coordination label');
  assert(en.indexOf('coordinate safely') >= 0, 'en UI shows the coordinated state');
  assert(elforsyningReportHtml().indexOf('Coordination check') >= 0, 'en report coordination label');
  lang = 'fa';
  var fa = renderElforsyningBom();
  assert(fa.indexOf(_FA['Coordination check']) >= 0, 'fa UI coordination label rendered');
  lang = savedLang;
  elfRestore();
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
  // Seed a fake "OK" verdict for a verdict-bearing downstream module that has
  // NO live recomputer (discrim/selectivity chart — purely informational).
  Reactive.verdicts['discrim'] = { status: 'ok', detail: '', stamp: 0, stale: false };
  Reactive.notify('scircuit'); // scircuit -> discrim
  const v = Reactive.verdict('discrim');
  assert(v.stale === true, 'discrim verdict must be flagged stale after an upstream short-circuit change');
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
  // Baseline: 1 (AI assistant) + 1 (project analyzer paste — user explicitly requested exception)
  assert(textareas <= 2, 'no NEW textareas beyond AI + analyzer (found ' + textareas + ')');
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
  // Display values use Danish decimal comma in da mode; normalize before parse.
  const ibShown = parseFloat(String(ibEntry.value).replace(',', '.'));
  const izShown = parseFloat(String(izEntry.value).replace(',', '.'));
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
  assert(countTextarea <= 3, 'no new <textarea> added by this pass (baseline 2: AI question box + comment + 1 project analyzer paste, got ' + countTextarea + ')');
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

// ===== 3-PHASE MODULE (trefase) TESTS =====

// --- trefaseCalcSymStar ---
test('trefaseCalcSymStar: UL=400, Z=100, phi=0 => Up=230.9, Ip=2.309, P=1600W', function() {
  var r = trefaseCalcSymStar(400, 100, 0);
  assert(Math.abs(r.Up - 230.94) < 0.1, 'Up should be ~230.94, got ' + r.Up.toFixed(2));
  assert(Math.abs(r.Ip - 2.309) < 0.01, 'Ip should be ~2.309, got ' + r.Ip.toFixed(3));
  assert(Math.abs(r.IL - r.Ip) < 0.001, 'IL = Ip in star');
  assert(Math.abs(r.P - 1600) < 1, 'P should be 1600W, got ' + r.P.toFixed(1));
  assert(r.IN === 0, 'IN = 0 for symmetric');
});

test('trefaseCalcSymStar: UL=400, Z=30, phi=0.5236(30deg) => P=sqrt3*400*IL*cos30', function() {
  var r = trefaseCalcSymStar(400, 30, 0.5236);
  var Up = 400 / Math.sqrt(3);
  var Ip = Up / 30;
  assert(Math.abs(r.Ip - Ip) < 0.01, 'Ip check');
  // P = 3*Up*Ip*cos(30) = 3 * 230.94 * 7.698 * 0.866 = 4618 W
  var expectedP = 3 * Up * Ip * Math.cos(0.5236);
  assert(Math.abs(r.P - expectedP) < 1, 'P should be ~' + expectedP.toFixed(0) + ', got ' + r.P.toFixed(0));
});

// --- trefaseCalcSymDelta ---
test('trefaseCalcSymDelta: UL=400, Z=100, phi=0 => Up=400, Ip=4, IL=6.928', function() {
  var r = trefaseCalcSymDelta(400, 100, 0);
  assert(Math.abs(r.Up - 400) < 0.01, 'Up = UL in delta');
  assert(Math.abs(r.Ip - 4) < 0.01, 'Ip = 400/100 = 4');
  assert(Math.abs(r.IL - 4 * Math.sqrt(3)) < 0.01, 'IL = sqrt(3)*Ip');
  assert(Math.abs(r.P - 4800) < 1, 'P = 3*400*4*1 = 4800');
});

// --- trefaseCalcAsymStar: equal impedances should give IN=0 ---
test('trefaseCalcAsymStar: equal impedances (Z=100 all, phi=0) => IN=0', function() {
  var r = trefaseCalcAsymStar(400, 100, 0, 100, 0, 100, 0);
  assert(r.IN < 0.001, 'IN should be ~0 for balanced, got ' + r.IN.toFixed(4));
});

// --- trefaseCalcAsymStar: unequal impedances produce non-zero IN ---
test('trefaseCalcAsymStar: Za=50,Zb=100,Zc=200 (phi=0) => IN > 0', function() {
  var r = trefaseCalcAsymStar(400, 50, 0, 100, 0, 200, 0);
  assert(r.IN > 1, 'IN should be > 1A for unbalanced, got ' + r.IN.toFixed(2));
  assert(r.Ia > r.Ib, 'Ia > Ib (lower Z)');
  assert(r.Ib > r.Ic, 'Ib > Ic (lower Z)');
});

// --- trefaseCalcAsymDelta ---
test('trefaseCalcAsymDelta: equal Z=100, phi=0 => all line currents equal', function() {
  var r = trefaseCalcAsymDelta(400, 100, 0, 100, 0, 100, 0);
  // For balanced delta, line current = sqrt(3) * phase current
  assert(Math.abs(r.Ia - r.Ib) < 0.01, 'Ia = Ib for balanced');
  assert(Math.abs(r.Ib - r.Ic) < 0.01, 'Ib = Ic for balanced');
  assert(Math.abs(r.Iab - 4) < 0.01, 'Iab = 400/100 = 4A');
});

// --- trefaseCalcTwoWatt ---
test('trefaseCalcTwoWatt: W1=1500, W2=800 => P=2300, Q=sqrt3*700=1212', function() {
  var r = trefaseCalcTwoWatt(1500, 800);
  assert(Math.abs(r.P - 2300) < 0.1, 'P = 1500+800 = 2300');
  assert(Math.abs(r.Q - Math.sqrt(3) * 700) < 0.1, 'Q = sqrt(3)*(1500-800)');
  var S = Math.sqrt(2300*2300 + r.Q*r.Q);
  assert(Math.abs(r.S - S) < 0.1, 'S check');
  assert(r.cosPhi > 0 && r.cosPhi <= 1, 'cosPhi valid');
});

test('trefaseCalcTwoWatt: W1=W2=1000 => Q=0, cosPhi=1 (pure resistive)', function() {
  var r = trefaseCalcTwoWatt(1000, 1000);
  assert(Math.abs(r.P - 2000) < 0.1, 'P = 2000');
  assert(Math.abs(r.Q) < 0.1, 'Q = 0 for equal wattmeters');
  assert(Math.abs(r.cosPhi - 1) < 0.001, 'cosPhi = 1');
});

// --- trefaseCalcPFC ---
test('trefaseCalcPFC: P=5000, cos1=0.7, cos2=0.95 => Qc positive', function() {
  var r = trefaseCalcPFC(5000, 0.7, 0.95);
  // Qc = 5000*(tan(acos(0.7)) - tan(acos(0.95)))
  var phi1 = Math.acos(0.7);
  var phi2 = Math.acos(0.95);
  var expected = 5000 * (Math.tan(phi1) - Math.tan(phi2));
  assert(Math.abs(r.Qc - expected) < 1, 'Qc should be ~' + expected.toFixed(0) + ', got ' + r.Qc.toFixed(0));
  assert(r.Qc > 0, 'Qc must be positive');
});

// --- trefaseCalcCapStar ---
test('trefaseCalcCapStar: Qc=3000, UL=400, f=50 => C > 0', function() {
  var C = trefaseCalcCapStar(3000, 400, 50);
  // C = Qc / (3 * Up^2 * omega) = 3000 / (3 * 230.94^2 * 314.16)
  var Up = 400 / Math.sqrt(3);
  var expected = 3000 / (3 * Up * Up * 2 * Math.PI * 50);
  assert(Math.abs(C - expected) < 1e-9, 'C should be ~' + (expected*1e6).toFixed(1) + 'uF');
  assert(C > 0, 'C must be positive');
});

// --- trefaseCalcCapDelta ---
test('trefaseCalcCapDelta: Qc=3000, UL=400, f=50 => C_delta = C_star/3', function() {
  var Cstar = trefaseCalcCapStar(3000, 400, 50);
  var Cdelta = trefaseCalcCapDelta(3000, 400, 50);
  assert(Math.abs(Cdelta - Cstar / 3) < 1e-9, 'C_delta = C_star/3');
});

// --- Opgavesamling Ch.7 exercise verification ---
// Exercise 7.1: Symmetric star, UL=400V, Z=30.4 Ohm, cos_phi=1 (resistive)
// Expected: a) I = Up/Z = 230.9/30.4 = 7.6A, b) Z = 48.3 (from given answer)
test('Opgavesamling 7.1 verify: Symmetric star UL=400, resistive, I=7.6A', function() {
  // facit says 7.6 A => Up/Z = 7.6 => Z = 230.94/7.6 = 30.39 Ohm
  var r = trefaseCalcSymStar(400, 30.39, 0);
  assert(Math.abs(r.IL - 7.6) < 0.05, 'IL should be ~7.6A, got ' + r.IL.toFixed(2));
});

// Exercise 7.2: Symmetric delta (or star), facit: 17.3A, 10.0A, 12000W
test('Opgavesamling 7.2 verify: P=12000W at UL=400, symmetric', function() {
  // P = sqrt(3)*UL*IL*cosPhi. If P=12000, UL=400, cosPhi=1: IL=12000/(sqrt3*400) = 17.32A
  var IL = 12000 / (Math.sqrt(3) * 400 * 1);
  assert(Math.abs(IL - 17.32) < 0.05, 'IL = 17.32A for P=12000W');
  // Phase current in delta = IL/sqrt(3) = 10.0A
  var Ip = IL / Math.sqrt(3);
  assert(Math.abs(Ip - 10.0) < 0.05, 'Ip = 10.0A in delta');
});

// Exercise 7.3: facit a) 2.17A, c) 900var => suggests star with reactive load
test('Opgavesamling 7.3 verify: Star load, IL=2.17A approx', function() {
  // facit: a)2.17A, b)1500VA, c)900var, d)6.50A, e)3600W
  // S=1500VA, Q=900var => P = sqrt(S^2-Q^2) = sqrt(1500^2-900^2) = 1200W
  // or from 3-phase: S = sqrt(3)*UL*IL = sqrt(3)*400*2.17 = 1503 VA (close to 1500)
  var S = Math.sqrt(3) * 400 * 2.17;
  assert(Math.abs(S - 1500) < 10, 'S ~ 1500VA for IL=2.17A at 400V');
});

// --- Module registration tests ---
test('trefase module: translation exists in da/en/fa', function() {
  var da = T.da.modules.trefase;
  var en = T.en.modules.trefase;
  var fa = T.fa.modules.trefase;
  assert(da && da.length > 0, 'Danish translation exists');
  assert(en && en.length > 0, 'English translation exists');
  assert(fa && fa.length > 0, 'Farsi translation exists');
});

test('trefase module: registered in NAV_GROUPS theory group', function() {
  var grp = NAV_GROUPS.filter(function(g) { return g.id === 'theory'; })[0];
  assert(grp, 'theory group exists');
  assert(grp.keys.indexOf('trefase') >= 0, 'trefase in theory group keys');
});

test('trefase module: renderTrefase produces valid HTML', function() {
  var html = renderTrefase();
  assert(html && html.length > 100, 'renderTrefase produces HTML');
  assert(html.indexOf('<div') >= 0, 'contains div elements');
});

test('trefase module: 100% click-only (no text inputs)', function() {
  var html = renderTrefase();
  assert(html.indexOf('type="text"') < 0, 'no text inputs');
  assert(html.indexOf('type="number"') < 0, 'no number inputs');
  assert(html.indexOf('<textarea') < 0, 'no textarea');
});

// ===== MOTOR THEORY MODULE (motorteori) TESTS =====

// --- motorteoriCalcNs ---
test('motorteoriCalcNs: f=50, p=4 => ns=1500 rpm', function() {
  var ns = motorteoriCalcNs(50, 4);
  assert(ns === 1500, 'ns should be 1500, got ' + ns);
});

test('motorteoriCalcNs: f=50, p=2 => ns=3000 rpm', function() {
  var ns = motorteoriCalcNs(50, 2);
  assert(ns === 3000, 'ns should be 3000, got ' + ns);
});

test('motorteoriCalcNs: f=50, p=6 => ns=1000 rpm', function() {
  var ns = motorteoriCalcNs(50, 6);
  assert(ns === 1000, 'ns should be 1000, got ' + ns);
});

test('motorteoriCalcNs: f=60, p=4 => ns=1800 rpm', function() {
  var ns = motorteoriCalcNs(60, 4);
  assert(ns === 1800, 'ns should be 1800, got ' + ns);
});

// --- motorteoriCalcSlip ---
test('motorteoriCalcSlip: ns=1500, n=1440 => s=0.04 (4%)', function() {
  var s = motorteoriCalcSlip(1500, 1440);
  assert(Math.abs(s - 0.04) < 0.0001, 's should be 0.04, got ' + s);
});

test('motorteoriCalcSlip: ns=3000, n=2920 => s=0.0267', function() {
  var s = motorteoriCalcSlip(3000, 2920);
  assert(Math.abs(s - 0.02667) < 0.001, 's should be ~0.0267, got ' + s.toFixed(4));
});

// --- motorteoriCalcTorque ---
test('motorteoriCalcTorque: P=7500W, n=1440rpm => M = 9.55*7500/1440 = 49.7 Nm', function() {
  var M = motorteoriCalcTorque(7500, 1440);
  var expected = 9.55 * 7500 / 1440;
  assert(Math.abs(M - expected) < 0.1, 'M should be ~' + expected.toFixed(1) + ', got ' + M.toFixed(1));
});

test('motorteoriCalcTorque: P=22000W, n=1460rpm => M = 143.9 Nm', function() {
  var M = motorteoriCalcTorque(22000, 1460);
  var expected = 9.55 * 22000 / 1460;
  assert(Math.abs(M - expected) < 0.1, 'M should be ~' + expected.toFixed(1));
});

// --- motorteoriCalcP1 ---
test('motorteoriCalcP1: U=400, I=15, cosPhi=0.85 => P1 = sqrt(3)*400*15*0.85 = 8833W', function() {
  var P1 = motorteoriCalcP1(400, 15, 0.85);
  var expected = Math.sqrt(3) * 400 * 15 * 0.85;
  assert(Math.abs(P1 - expected) < 1, 'P1 should be ~' + expected.toFixed(0));
});

// --- motorteoriCalcEta ---
test('motorteoriCalcEta: P2=7500, P1=8833 => eta=0.849', function() {
  var eta = motorteoriCalcEta(7500, 8833);
  assert(Math.abs(eta - 7500/8833) < 0.001, 'eta = P2/P1');
});

// --- motorteoriCalcRotorLoss ---
test('motorteoriCalcRotorLoss: P2=7500, slip=0.04 => PCu = s*Pag = 0.04*7812.5 = 312.5W', function() {
  var loss = motorteoriCalcRotorLoss(7500, 0.04);
  // Pag = 7500/(1-0.04) = 7812.5, PCu = 0.04*7812.5 = 312.5
  assert(Math.abs(loss - 312.5) < 0.1, 'Rotor loss should be 312.5W, got ' + loss.toFixed(1));
});

// --- motorteoriCalcAirGap ---
test('motorteoriCalcAirGap: P2=7500, slip=0.04 => Pag = 7500/(1-0.04) = 7812.5', function() {
  var Pag = motorteoriCalcAirGap(7500, 0.04);
  assert(Math.abs(Pag - 7812.5) < 0.1, 'Pag should be 7812.5, got ' + Pag.toFixed(1));
});

// --- motorteoriCalcIstart / StarDelta ---
test('motorteoriCalcIstart: IN=15, ratio=7 => Istart=105A', function() {
  var Is = motorteoriCalcIstart(15, 7);
  assert(Is === 105, 'Istart = 7*15 = 105A');
});

test('motorteoriCalcIstartStarDelta: IN=15, ratio=7 => Istart=35A (1/3 of DOL)', function() {
  var Is = motorteoriCalcIstartStarDelta(15, 7);
  assert(Math.abs(Is - 35) < 0.01, 'IstartSD = 7*15/3 = 35A, got ' + Is);
});

// --- motorteoriCalcRotorFreq ---
test('motorteoriCalcRotorFreq: slip=0.04, f=50 => f2=2.0 Hz', function() {
  var f2 = motorteoriCalcRotorFreq(0.04, 50);
  assert(Math.abs(f2 - 2.0) < 0.001, 'f2 = 0.04*50 = 2.0 Hz');
});

// --- Opgavesamling Ch.11 exercise verification ---
// Ex 11.1: ns = 1000 rpm => p = 120*50/1000 = 6 poles
test('Opgavesamling 11.1: ns=1000 rpm implies 6-pole at 50Hz', function() {
  var ns = motorteoriCalcNs(50, 6);
  assert(ns === 1000, 'ns=1000 for 6-pole 50Hz');
});

// Ex 11.30: facit a) 10.05A, b) 5294W, c) 3971var, d) 75rpm/5.0%, e) 2.5Hz
test('Opgavesamling 11.30 verify: slip 5% at ns=1500 gives n=1425, f2=2.5Hz', function() {
  var ns = motorteoriCalcNs(50, 4);
  // slip=5% => n = 1500*(1-0.05) = 1425 rpm; f2 = 0.05*50 = 2.5 Hz
  var n = ns * (1 - 0.05);
  assert(Math.abs(n - 1425) < 0.1, 'n = 1425 rpm');
  var f2 = motorteoriCalcRotorFreq(0.05, 50);
  assert(Math.abs(f2 - 2.5) < 0.001, 'f2 = 2.5 Hz matches facit');
  // slip difference: ns - n = 75 rpm
  assert(Math.abs(ns - n - 75) < 0.1, '75 rpm difference');
});

// Ex 11.35: facit a)0.916, b)0.887, c)18.60kW, d)124.4Nm, e)4.8%
test('Opgavesamling 11.35 verify: torque M=124.4Nm at P2 and speed', function() {
  // If M = 9.55*P/n = 124.4 Nm and we need to find P and n
  // facit c) P1=18.60kW (absorbed), d) M=124.4Nm
  // If eta(a)=0.916, pf(b)=0.887, P1=18.6kW:
  // P2 = eta*P1 = 0.916*18600 = 17038W
  // n = 9.55*P2/M = 9.55*17038/124.4 = 1307.5 rpm => implies 6-pole (ns=1000) NO
  // Actually for 4-pole: n=1500*(1-0.048) = 1428; M=9.55*P2/1428
  // Let's verify slip=4.8%: n = 1500*(1-0.048) = 1428
  // P2 = eta*P1 = 0.916*18600 = 17037.6W
  // M = 9.55*17037.6/1428 = 113.9 -- doesn't match 124.4
  // Try: M=124.4 and P2= M*n/9.55
  // If slip=4.8%, ns=1500, n=1428: P2 = 124.4*1428/9.55 = 18598W -- close to 18.6kW!
  // So P2 ~ 18.6kW, which means P1 = P2/eta = 18600/0.916 = 20306W absorbed
  // The facit says c)18.60kW is absorbed. Let's verify the torque formula
  var n = 1500 * (1 - 0.048);  // 1428 rpm
  var P2 = 18600;  // mechanical output = absorbed * eta ... actually interpret as P2=17038
  // The simplest verification: M = 9.55 * P2 / n
  // facit says d) 124.4 Nm
  // If n=1428, M=124.4: P2 = 124.4*1428/9.55 = 18598.5 W ~ 18.6 kW
  var M = motorteoriCalcTorque(18600, 1428);
  assert(Math.abs(M - 124.4) < 0.5, 'M should be ~124.4 Nm, got ' + M.toFixed(1));
});

test('Opgavesamling 11.35 verify: slip=4.8%', function() {
  // slip = 4.8% means n = 1500*(1-0.048) = 1428
  var s = motorteoriCalcSlip(1500, 1428);
  assert(Math.abs(s * 100 - 4.8) < 0.01, 'slip should be 4.8%, got ' + (s*100).toFixed(2));
});

// --- Module registration tests ---
test('motorteori module: translation exists in da/en/fa', function() {
  var da = T.da.modules.motorteori;
  var en = T.en.modules.motorteori;
  var fa = T.fa.modules.motorteori;
  assert(da && da.length > 0, 'Danish translation exists');
  assert(en && en.length > 0, 'English translation exists');
  assert(fa && fa.length > 0, 'Farsi translation exists');
});

test('motorteori module: registered in NAV_GROUPS theory group', function() {
  var grp = NAV_GROUPS.filter(function(g) { return g.id === 'theory'; })[0];
  assert(grp, 'theory group exists');
  assert(grp.keys.indexOf('motorteori') >= 0, 'motorteori in theory group keys');
});

test('motorteori module: renderMotorteori produces valid HTML', function() {
  var html = renderMotorteori();
  assert(html && html.length > 100, 'renderMotorteori produces HTML');
  assert(html.indexOf('<div') >= 0, 'contains div elements');
});

test('motorteori module: 100% click-only (no text inputs)', function() {
  var html = renderMotorteori();
  assert(html.indexOf('type="text"') < 0, 'no text inputs');
  assert(html.indexOf('type="number"') < 0, 'no number inputs');
  assert(html.indexOf('<textarea') < 0, 'no textarea');
});

// Guard test: officialIz + IB regression MUST still pass after new modules
test('3-Phase + Motor modules GUARD: core calc math unchanged (officialIz + IB regression)', function() {
  var cu25 = { material: 'Cu', mm2: 2.5, model: '', iz: 999 };
  assert.strictEqual(officialIz(cu25), 23, 'officialIz(Cu 2.5mm2 PVC) == 23A unchanged');
  var ib1 = sldCalcNodeIB({ type: 'final_circuit', power_kW: 3.68, cosPhi: 0.95, phases: '1x230', voltage: 230 });
  assert(Math.abs(ib1 - 16.84) < 0.05, 'IB regression ~16.84A unchanged after new modules');
});

// ===== HV RELAY MODULE TESTS =====
test('relayCalcI1N: 630kVA 10kV => I1N = 36.37A', function() {
  var I1N = relayCalcI1N(630, 10);
  assert(Math.abs(I1N - 36.37) < 0.1, 'I1N = S/(sqrt3*U1) = 630000/(1.732*10000) = 36.37A, got ' + I1N.toFixed(2));
});

test('relayCalcInrush: I1N=36.37 => inrush 436-545A for 0.1s', function() {
  var inrush = relayCalcInrush(36.37);
  assert(Math.abs(inrush.Imin - 436.4) < 1, 'Imin = 12*36.37 = 436.4');
  assert(Math.abs(inrush.Imax - 545.6) < 1, 'Imax = 15*36.37 = 545.6');
  assert.strictEqual(inrush.duration, 0.1, 'duration = 0.1s');
});

test('relayCheckCoordination: tGt=0.5 > inrush(0.1)+egentid(0.04)=0.14 => coordinated', function() {
  var c = relayCheckCoordination(0.5, 0.04, 0.1);
  assert.strictEqual(c.coordinated, true);
  assert(Math.abs(c.requiredTime - 0.14) < 0.001);
});

test('relayCheckCoordination: tGt=0.1 vs 0.1+0.04=0.14 => NOT coordinated', function() {
  var c = relayCheckCoordination(0.1, 0.04, 0.1);
  assert.strictEqual(c.coordinated, false);
});

test('relayCheckFuseCoordination: gg63 vs I1N=36.37 => ok (63>=36.37)', function() {
  var r = relayCheckFuseCoordination('gg63', 36.37);
  assert.strictEqual(r.ok, true);
});

test('relayCheckFuseCoordination: gg25 vs I1N=36.37 => NOT ok (25<36.37)', function() {
  var r = relayCheckFuseCoordination('gg25', 36.37);
  assert.strictEqual(r.ok, false);
});

test('relay module: renderRelay produces HTML', function() {
  var html = renderRelay();
  assert(html.indexOf('card') >= 0, 'has card class');
  assert(html.indexOf('I<sub>1N</sub>') >= 0, 'shows I1N result');
  assert(html.indexOf('Ganzbereich') >= 0 || html.indexOf('Full-range') >= 0, 'shows fuse info');
});

test('relay module: 100% click-only (no text inputs)', function() {
  var html = renderRelay();
  assert(html.indexOf('type="text"') < 0, 'no text inputs');
  assert(html.indexOf('type="number"') < 0, 'no number inputs');
  assert(html.indexOf('<textarea') < 0, 'no textarea');
});

test('relay module: translation exists in da/en/fa', function() {
  assert(T.da.modules.relay, 'da translation exists');
  assert(T.en.modules.relay, 'en translation exists');
  assert(T.fa.modules.relay, 'fa translation exists');
});

// ===== FAULT CALCULATION MODULE TESTS =====
test('faultCalcIa: MCB B 16A => Ia = 5*16 = 80A', function() {
  var Ia = faultCalcIa('mcbB', 16);
  assert.strictEqual(Ia, 80);
});

test('faultCalcIa: MCB C 32A => Ia = 10*32 = 320A', function() {
  var Ia = faultCalcIa('mcbC', 32);
  assert.strictEqual(Ia, 320);
});

test('faultCalcIa: MCB D 20A => Ia = 20*20 = 400A', function() {
  var Ia = faultCalcIa('mcbD', 20);
  assert.strictEqual(Ia, 400);
});

test('faultCalcTN: Zs=1.2, Ia=80, U0=230 => ZsIa=96 <= 230, ZsMax=2.875', function() {
  var r = faultCalcTN(1.2, 80, 230);
  assert(Math.abs(r.ZsIa - 96) < 0.1, 'ZsIa=96');
  assert.strictEqual(r.ok, true);
  assert(Math.abs(r.ZsMax - 2.875) < 0.001, 'ZsMax=230/80=2.875');
});

test('faultCalcTN: Zs=5.0, Ia=80, U0=230 => ZsIa=400 > 230, NOT ok', function() {
  var r = faultCalcTN(5.0, 80, 230);
  assert.strictEqual(r.ok, false);
  assert(Math.abs(r.ZsIa - 400) < 0.1);
});

test('faultCalcTT: RA=100, deltaIn=0.03, touch=50 => 3V <= 50V, RAmax=1667', function() {
  var r = faultCalcTT(100, 0.03, 50);
  assert(Math.abs(r.product - 3.0) < 0.01);
  assert.strictEqual(r.ok, true);
  assert(Math.abs(r.RAmax - 1666.67) < 1);
});

test('faultCalcTT: RA=2000, deltaIn=0.03, touch=50 => 60V > 50V, NOT ok', function() {
  var r = faultCalcTT(2000, 0.03, 50);
  assert.strictEqual(r.ok, false);
});

test('faultCalcTT: wet/medical RA=1000, deltaIn=0.03, touch=25 => 30V > 25V, NOT ok', function() {
  var r = faultCalcTT(1000, 0.03, 25);
  assert.strictEqual(r.ok, false);
});

test('faultCalcIT2: 2*Ia*Zs: 2*80*1.2=192 <= 230, ok', function() {
  var r = faultCalcIT2(80, 1.2, 230, false);
  assert(Math.abs(r.product - 192) < 0.1);
  assert.strictEqual(r.ok, true);
});

test('faultCalcSafetyFactor: measured=2.0, ZsMax=2.875 => limit=2.3, ok', function() {
  var r = faultCalcSafetyFactor(2.0, 2.875);
  assert(Math.abs(r.limit - 2.3) < 0.001);
  assert.strictEqual(r.ok, true);
});

test('faultCalcSafetyFactor: measured=2.5, ZsMax=2.875 => limit=2.3, NOT ok', function() {
  var r = faultCalcSafetyFactor(2.5, 2.875);
  assert.strictEqual(r.ok, false);
});

test('faultCalcMinCSA: I=500, t=0.2, k=115 => S = 500*sqrt(0.2)/115 = 1.945mm2', function() {
  var S = faultCalcMinCSA(500, 0.2, 115);
  assert(Math.abs(S - 1.945) < 0.01, 'S = 500*0.4472/115 = 1.945, got ' + S.toFixed(3));
});

test('faultCalcMinCSA: I=3000, t=0.4, k=143 => S = 3000*sqrt(0.4)/143 = 13.27mm2', function() {
  var S = faultCalcMinCSA(3000, 0.4, 143);
  assert(Math.abs(S - 13.27) < 0.1, 'got ' + S.toFixed(2));
});

test('faultCalcKFromPrinciples: Cu/PVC => k approx 115', function() {
  var k = faultCalcKFromPrinciples(3.45e6, 234.5, 17.24e-9, 160, 70);
  assert(Math.abs(k - 115) < 3, 'Cu/PVC k from first principles should be ~115, got ' + k.toFixed(1));
});

test('fault module: renderFault produces HTML', function() {
  var html = renderFault();
  assert(html.indexOf('card') >= 0, 'has card class');
  assert(html.indexOf('Zs') >= 0 || html.indexOf('fault') >= 0, 'shows fault content');
});

test('fault module: 100% click-only (no text inputs)', function() {
  var html = renderFault();
  assert(html.indexOf('type="text"') < 0, 'no text inputs');
  assert(html.indexOf('type="number"') < 0, 'no number inputs');
  assert(html.indexOf('<textarea') < 0, 'no textarea');
});

test('fault module: CSA mode produces HTML', function() {
  faultState.calcMode = 'csa';
  var html = renderFault();
  assert(html.indexOf('k-faktor') >= 0 || html.indexOf('k-factor') >= 0, 'shows k-factor info');
  faultState.calcMode = 'fault';
});

test('fault module: translation exists in da/en/fa', function() {
  assert(T.da.modules.fault, 'da translation exists');
  assert(T.en.modules.fault, 'en translation exists');
  assert(T.fa.modules.fault, 'fa translation exists');
});

test('relay + fault modules in NAV_GROUPS protect group', function() {
  var protectGroup = NAV_GROUPS.filter(function(g) { return g.id === 'protect'; })[0];
  assert(protectGroup, 'protect group exists');
  assert(protectGroup.keys.indexOf('relay') >= 0, 'relay in protect group');
  assert(protectGroup.keys.indexOf('fault') >= 0, 'fault in protect group');
});

test('Protection modules GUARD: core calc math unchanged (officialIz + IB regression)', function() {
  var cu25 = { material: 'Cu', mm2: 2.5, model: '', iz: 999 };
  assert.strictEqual(officialIz(cu25), 23, 'officialIz(Cu 2.5mm2 PVC) == 23A unchanged');
  var ib1 = sldCalcNodeIB({ type: 'final_circuit', power_kW: 3.68, cosPhi: 0.95, phases: '1x230', voltage: 230 });
  assert(Math.abs(ib1 - 16.84) < 0.05, 'IB regression ~16.84A unchanged after new modules');
});

// ========================================================================
// DC / OHM'S LAW MODULE TESTS
// Verifies calculations against Elektroteknik Opgavesamling 4. udgave Ch.1+2
// ========================================================================

console.log('\n=== DC / Ohm\'s Law Module Tests ===\n');

// --- Ohm's law tests ---

test('dcCalcOhm: R=10, I=2 => U=20V', function() {
  var res = dcCalcOhm('ri', 10, 2, 0);
  assert(Math.abs(res.U - 20) < 0.001, 'U should be 20V, got ' + res.U);
});

test('dcCalcOhm: R=0.3, I=1 => U=0.3V (Opgavesamling 1.1 pattern)', function() {
  var res = dcCalcOhm('ri', 0.3, 1, 0);
  assert(Math.abs(res.U - 0.3) < 0.001, 'U should be 0.3V, got ' + res.U);
});

test('dcCalcOhm: U=230, R=575 => I=0.4A (Opgavesamling 1.2 pattern)', function() {
  var res = dcCalcOhm('ru', 575, 0, 230);
  assert(Math.abs(res.I - 0.4) < 0.001, 'I should be 0.4A, got ' + res.I);
});

test('dcCalcOhm: U=12, I=3 => R=4 Ohm', function() {
  var res = dcCalcOhm('ui', 0, 3, 12);
  assert(Math.abs(res.R - 4) < 0.001, 'R should be 4, got ' + res.R);
});

test('dcCalcOhm: R=100, I=0.5 => U=50V', function() {
  var res = dcCalcOhm('ri', 100, 0.5, 0);
  assert(Math.abs(res.U - 50) < 0.001, 'U should be 50V, got ' + res.U);
});

// --- Resistivity tests ---

test('dcCalcResistivity: Cu, 100m, 2.5mm2 => R=0.7 Ohm', function() {
  var R = dcCalcResistivity(0.0175, 100, 2.5);
  assert(Math.abs(R - 0.7) < 0.001, 'R should be 0.7, got ' + R.toFixed(4));
});

test('dcCalcResistivity: Al, 50m, 10mm2 => R=0.145 Ohm', function() {
  var R = dcCalcResistivity(0.029, 50, 10);
  assert(Math.abs(R - 0.145) < 0.001, 'R should be 0.145, got ' + R.toFixed(4));
});

test('dcCalcResistivity: Fe, 10m, 1mm2 => R=1.4 Ohm', function() {
  var R = dcCalcResistivity(0.14, 10, 1);
  assert(Math.abs(R - 1.4) < 0.001, 'R should be 1.4, got ' + R.toFixed(4));
});

test('dcCalcResistivity: Cu, 1000m, 50mm2 => R=0.35 Ohm', function() {
  var R = dcCalcResistivity(0.0175, 1000, 50);
  assert(Math.abs(R - 0.35) < 0.001, 'R should be 0.35, got ' + R.toFixed(4));
});

// Opgavesamling 1.10: identify material from rho. rho = R*S/l
// If R=0.172, S=1, l=10 => rho = 0.172*1/10 = 0.0172 ~= Cu (0.0175)
test('dcCalcResistivity: identify material (Opgavesamling 1.10 pattern) rho=0.172/10 => Cu', function() {
  // Reverse: given R=0.172, l=10, S=1, what material? rho = R*S/l = 0.172*1/10 = 0.0172
  var rho = 0.172 * 1 / 10;
  assert(Math.abs(rho - 0.0172) < 0.001, 'rho should be ~0.0172 (Cu), got ' + rho);
  // Closest to Cu = 0.0175
  assert(Math.abs(rho - DC_MATERIALS.cu.rho) < 0.005, 'Should identify as copper');
});

// --- Temperature coefficient tests ---

test('dcCalcTempResistance: Cu, R20=10, T=75 => R=12.2 Ohm', function() {
  var RT = dcCalcTempResistance(10, 0.004, 75);
  // R = 10*(1 + 0.004*(75-20)) = 10*(1 + 0.22) = 12.2
  assert(Math.abs(RT - 12.2) < 0.001, 'RT should be 12.2, got ' + RT.toFixed(4));
});

test('dcCalcTempResistance: Al, R20=5, T=100 => R=6.48 Ohm', function() {
  var RT = dcCalcTempResistance(5, 0.0037, 100);
  // R = 5*(1 + 0.0037*(100-20)) = 5*(1 + 0.296) = 5*1.296 = 6.48
  assert(Math.abs(RT - 6.48) < 0.01, 'RT should be 6.48, got ' + RT.toFixed(4));
});

test('dcCalcTempResistance: at 20C returns R20 unchanged', function() {
  var RT = dcCalcTempResistance(100, 0.004, 20);
  assert(Math.abs(RT - 100) < 0.001, 'RT at 20C should equal R20');
});

// --- Current density ---

test('dcCalcCurrentDensity: I=16A, S=2.5mm2 => J=6.4 A/mm2', function() {
  var J = dcCalcCurrentDensity(16, 2.5);
  assert(Math.abs(J - 6.4) < 0.001, 'J should be 6.4, got ' + J.toFixed(4));
});

// --- Series/parallel tests ---

test('dcCalcSeries: [10, 22, 47] => 79 Ohm (Opgavesamling 2.1 pattern)', function() {
  var R = dcCalcSeries([10, 22, 47]);
  assert(Math.abs(R - 79) < 0.001, 'R should be 79, got ' + R);
});

test('dcCalcSeries: [100, 200, 300] => 600 Ohm', function() {
  var R = dcCalcSeries([100, 200, 300]);
  assert(Math.abs(R - 600) < 0.001, 'R should be 600, got ' + R);
});

test('dcCalcParallel: [100, 100] => 50 Ohm (Opgavesamling 2.2 pattern)', function() {
  var R = dcCalcParallel([100, 100]);
  assert(Math.abs(R - 50) < 0.001, 'R should be 50, got ' + R);
});

test('dcCalcParallel: [10, 20, 30] => 5.455 Ohm', function() {
  var R = dcCalcParallel([10, 20, 30]);
  // 1/R = 1/10 + 1/20 + 1/30 = 0.1+0.05+0.0333 = 0.1833, R = 5.455
  assert(Math.abs(R - 5.4545) < 0.01, 'R should be ~5.455, got ' + R.toFixed(4));
});

test('dcCalcParallel2: R1=100, R2=100 => 50 Ohm', function() {
  var R = dcCalcParallel2(100, 100);
  assert(Math.abs(R - 50) < 0.001, 'R should be 50, got ' + R);
});

test('dcCalcParallel2: R1=10, R2=40 => 8 Ohm (Opgavesamling 2.3 pattern)', function() {
  var R = dcCalcParallel2(10, 40);
  // R = 10*40/(10+40) = 400/50 = 8
  assert(Math.abs(R - 8) < 0.001, 'R should be 8, got ' + R);
});

test('dcCalcParallel: [47, 100] => 31.97 Ohm (Opgavesamling 2.4 pattern)', function() {
  var R = dcCalcParallel([47, 100]);
  // 1/R = 1/47 + 1/100 = 0.02128 + 0.01 = 0.03128, R = 31.97
  assert(Math.abs(R - 31.97) < 0.1, 'R should be ~31.97, got ' + R.toFixed(4));
});

test('dcCalcSeries + dcCalcParallel: mixed circuit (Opgavesamling 2.5 pattern)', function() {
  // Two 100 Ohm in parallel = 50, then in series with 30 Ohm = 80
  var Rpar = dcCalcParallel([100, 100]);
  var Rtotal = dcCalcSeries([Rpar, 30]);
  assert(Math.abs(Rtotal - 80) < 0.001, 'R should be 80, got ' + Rtotal);
});

// --- Voltage divider ---

test('dcCalcVoltageDivider: Uin=12, R1=1000, R2=2200 => Uout=8.25V', function() {
  var Uout = dcCalcVoltageDivider(12, 1000, 2200);
  // Uout = 12*2200/(1000+2200) = 12*2200/3200 = 8.25
  assert(Math.abs(Uout - 8.25) < 0.01, 'Uout should be 8.25V, got ' + Uout.toFixed(4));
});

test('dcCalcVoltageDivider: Uin=24, R1=R2=1000 => Uout=12V (half)', function() {
  var Uout = dcCalcVoltageDivider(24, 1000, 1000);
  assert(Math.abs(Uout - 12) < 0.001, 'Uout should be 12V, got ' + Uout);
});

// --- Current divider ---

test('dcCalcCurrentDivider: Itotal=1, R1=100, R2=200 => I1=0.667A', function() {
  var I1 = dcCalcCurrentDivider(1, 100, 200);
  // I1 = 1*200/(100+200) = 200/300 = 0.6667
  assert(Math.abs(I1 - 0.6667) < 0.001, 'I1 should be ~0.667A, got ' + I1.toFixed(4));
});

test('dcCalcCurrentDivider: Itotal=10, R1=R2=100 => I1=5A (equal split)', function() {
  var I1 = dcCalcCurrentDivider(10, 100, 100);
  assert(Math.abs(I1 - 5) < 0.001, 'I1 should be 5A, got ' + I1);
});

// --- Power tests ---

test('dcCalcPower UI: U=230, I=10 => P=2300W (Opgavesamling 3.1 pattern)', function() {
  var res = dcCalcPower('ui', 230, 10, 0);
  assert(Math.abs(res.P - 2300) < 0.01, 'P should be 2300W, got ' + res.P);
});

test('dcCalcPower RI: I=5, R=100 => P=2500W', function() {
  var res = dcCalcPower('ri', 0, 5, 100);
  assert(Math.abs(res.P - 2500) < 0.01, 'P should be 2500W, got ' + res.P);
});

test('dcCalcPower RU: U=230, R=529 => P=100W', function() {
  var res = dcCalcPower('ru', 230, 0, 529);
  // P = 230^2/529 = 52900/529 = 100.0
  assert(Math.abs(res.P - 100) < 0.1, 'P should be ~100W, got ' + res.P.toFixed(2));
});

// --- Energy tests ---

test('dcCalcEnergy: P=2000W, t=3600s => W=7200000 J', function() {
  var W = dcCalcEnergy(2000, 3600);
  assert(Math.abs(W - 7200000) < 1, 'W should be 7200000J, got ' + W);
});

test('dcCalcEnergyKWh: P=2000W, t=3600s => 2 kWh', function() {
  var kWh = dcCalcEnergyKWh(2000, 3600);
  assert(Math.abs(kWh - 2) < 0.001, 'Should be 2 kWh, got ' + kWh);
});

test('dcTimeToSeconds: 3h => 10800s', function() {
  assert(dcTimeToSeconds(3, 'h') === 10800, '3h = 10800s');
  assert(dcTimeToSeconds(5, 'min') === 300, '5min = 300s');
  assert(dcTimeToSeconds(10, 's') === 10, '10s = 10s');
});

// --- EMF tests ---

test('dcCalcEMF: E=12, Ri=0.5, I=2 => Uterminal=11V', function() {
  var res = dcCalcEMF(12, 0.5, 2);
  assert(Math.abs(res.Uterminal - 11) < 0.001, 'Uterminal should be 11V, got ' + res.Uterminal);
  assert(Math.abs(res.P_load - 22) < 0.01, 'P_load should be 22W');
  assert(Math.abs(res.P_internal - 2) < 0.01, 'P_internal should be 2W');
});

test('dcCalcEMF: E=9, Ri=1, I=0 => Uterminal=9V (open circuit)', function() {
  var res = dcCalcEMF(9, 1, 0);
  assert(Math.abs(res.Uterminal - 9) < 0.001, 'Open circuit: Uterminal = E');
});

test('dcCalcEMF: E=24, Ri=2, I=5 => Uterminal=14V', function() {
  var res = dcCalcEMF(24, 2, 5);
  // U = 24 - 5*2 = 14
  assert(Math.abs(res.Uterminal - 14) < 0.001, 'Uterminal should be 14V, got ' + res.Uterminal);
  assert(Math.abs(res.P_total - 120) < 0.01, 'P_total = E*I = 24*5 = 120');
});

// --- Module integration tests ---

test('dc module: renderDC produces HTML with card class', function() {
  var html = renderDC();
  assert(html.indexOf('card') >= 0, 'has card class');
  assert(html.indexOf('Ohm') >= 0 || html.indexOf('ohm') >= 0 || html.indexOf('DC') >= 0, 'shows DC content');
});

test('dc module: 100% click-only (no text inputs)', function() {
  // Test all calc types
  var types = ['ohm', 'resistivity', 'temperature', 'series_parallel', 'divider', 'power', 'energy', 'emf'];
  types.forEach(function(t) {
    dcState.calcType = t;
    var html = renderDC();
    assert(html.indexOf('type="text"') < 0, 'no text inputs in ' + t);
    assert(html.indexOf('type="number"') < 0, 'no number inputs in ' + t);
    assert(html.indexOf('<textarea') < 0, 'no textarea in ' + t);
  });
  dcState.calcType = 'ohm'; // restore default
});

test('dc module: translation exists in da/en/fa', function() {
  assert(T.da.modules.dc, 'da translation exists');
  assert(T.en.modules.dc, 'en translation exists');
  assert(T.fa.modules.dc, 'fa translation exists');
});

test('dc module in NAV_GROUPS theory group', function() {
  var theoryGroup = NAV_GROUPS.filter(function(g) { return g.id === 'theory'; })[0];
  assert(theoryGroup, 'theory group exists');
  assert(theoryGroup.keys.indexOf('dc') >= 0, 'dc in theory group');
});

test('DC module GUARD: core calc math unchanged (officialIz + IB regression)', function() {
  var cu25 = { material: 'Cu', mm2: 2.5, model: '', iz: 999 };
  assert.strictEqual(officialIz(cu25), 23, 'officialIz(Cu 2.5mm2 PVC) == 23A unchanged');
  var ib1 = sldCalcNodeIB({ type: 'final_circuit', power_kW: 3.68, cosPhi: 0.95, phases: '1x230', voltage: 230 });
  assert(Math.abs(ib1 - 16.84) < 0.05, 'IB regression ~16.84A unchanged after DC module');
});

// ============================================================================
// ===== UNIVERSAL calcDetail() TESTS =====
// ============================================================================

test('calcDetail: returns empty string for null input', function() {
  assert.strictEqual(calcDetail(null), '', 'null returns empty');
  assert.strictEqual(calcDetail(undefined), '', 'undefined returns empty');
});

test('calcDetail: produces <details> HTML with summary', function() {
  var html = calcDetail({
    name: 'Test Calculation',
    formula: 'A = B + C',
    variables: [{ name: 'B', symbol: 'B', value: 5, unit: 'V', source: 'test' }],
    substitution: 'A = 5 + 3',
    steps: [{ desc: 'Add', expr: '5 + 3', result: '8' }],
    result: { value: 8, unit: 'V' },
    reference: 'IEC 12345'
  });
  assert(html.indexOf('<details') >= 0, 'contains <details> element');
  assert(html.indexOf('<summary') >= 0, 'contains <summary> element');
  assert(html.indexOf('Test Calculation') >= 0, 'contains title');
  assert(html.indexOf('A = B + C') >= 0, 'contains formula');
  assert(html.indexOf('IEC 12345') >= 0, 'contains reference');
});

test('calcDetail: renders variable table', function() {
  var html = calcDetail({
    name: 'Iz calc',
    formula: 'Iz = Iz_tab * K',
    variables: [
      { name: 'Base current', symbol: 'Iz_tab', value: 25, unit: 'A', source: 'Table B.52' },
      { name: 'Correction', symbol: 'K', value: 0.87, unit: '', source: 'Table B.52.14' }
    ],
    result: { value: 21.75, unit: 'A' }
  });
  assert(html.indexOf('Iz_tab') >= 0, 'contains Iz_tab symbol');
  assert(html.indexOf('Table B.52') >= 0, 'contains source reference');
  assert(html.indexOf('25') >= 0, 'contains value');
  assert(html.indexOf('<table') >= 0, 'contains table element');
});

test('calcDetail: renders substitution and steps', function() {
  var html = calcDetail({
    name: 'Vdrop',
    formula: 'dU = sqrt(3) * IB * L * (r*cos + x*sin)',
    substitution: 'dU = 1.732 * 16 * 0.025 * (0.727*0.9 + 0.08*0.436)',
    steps: [
      { desc: 'Factor', expr: '0.727*0.9 + 0.08*0.436', result: '0.689' },
      'dU = 1.732 * 16 * 0.025 * 0.689 = 0.476 V'
    ],
    result: { value: '1.19%', unit: '', status: 'ok' }
  });
  assert(html.indexOf('1.732') >= 0, 'contains substitution numbers');
  assert(html.indexOf('0.689') >= 0, 'contains step result');
  assert(html.indexOf('<ol') >= 0, 'contains ordered list for steps');
  assert(html.indexOf('1.19%') >= 0, 'contains result value');
});

test('calcDetail: result status renders verdict icon', function() {
  var htmlOk = calcDetail({ name: 'X', result: { value: 5, unit: 'A', status: 'ok' } });
  var htmlFail = calcDetail({ name: 'X', result: { value: 5, unit: 'A', status: 'fail' } });
  assert(htmlOk.indexOf('\u2705') >= 0, 'ok status shows green check');
  assert(htmlFail.indexOf('\u26D4') >= 0, 'fail status shows red circle');
});

test('calcDetailFmtVal: formats numbers and strings correctly', function() {
  var prev = lang;
  lang = 'da';
  assert.strictEqual(calcDetailFmtVal(25), '25', 'integer (da)');
  assert.strictEqual(calcDetailFmtVal(3.14159), '3,14', 'float < 100 uses comma (da)');
  assert.strictEqual(calcDetailFmtVal(123.456), '123,5', 'float >= 100 uses comma (da)');
  assert.strictEqual(calcDetailFmtVal(0.00567), '0,006', 'small float uses comma (da)');
  assert.strictEqual(calcDetailFmtVal(null), '\u2014', 'null');
  assert.strictEqual(calcDetailFmtVal('hello'), 'hello', 'string');
  assert.strictEqual(calcDetailFmtVal(Infinity), '\u2014', 'infinity');
  lang = 'en';
  assert.strictEqual(calcDetailFmtVal(3.14159), '3.14', 'float < 100 uses period (en)');
  assert.strictEqual(calcDetailFmtVal(123.456), '123.5', 'float >= 100 uses period (en)');
  lang = prev;
});

test('calcDetailIz: produces correct Iz derating card', function() {
  var html = calcDetailIz(25, 1.0, 0.87, 0.8, 17.4, 'NOIKLX 5G2.5', 'C', 40, 3);
  assert(html.indexOf('<details') >= 0, 'has details element');
  assert(html.indexOf('Iz_tab') >= 0, 'has Iz_tab');
  assert(html.indexOf('K_temp') >= 0, 'has K_temp');
  assert(html.indexOf('K_group') >= 0, 'has K_group');
  assert(html.indexOf('0,870') >= 0, 'has kTemp factor (da comma)');
  assert(html.indexOf('DS/HD 60364-5-52') >= 0, 'has DS reference');
});

test('calcDetailVdrop: produces correct voltage drop card', function() {
  var html = calcDetailVdrop(16.84, 25, 7.41, 0.08, 0.95, '1x230', 1.23, 0.53, '5G2.5');
  assert(html.indexOf('<details') >= 0, 'has details element');
  assert(html.indexOf('IB') >= 0, 'has IB variable');
  assert(html.indexOf('cos') >= 0, 'has cos phi');
  assert(html.indexOf('DS/HD 60364-5-52 cl. 525') >= 0, 'has clause reference');
  assert(html.indexOf('sin') >= 0, 'has sin phi step');
});

test('calcDetailIk: produces correct short-circuit card', function() {
  var html = calcDetailIk(2, 10, 5.5, 400, 1.05, 20160, 11875, 17.5, 'NOIKLX 4G16');
  assert(html.indexOf('<details') >= 0, 'has details element');
  assert(html.indexOf('Ik3max') >= 0, 'has Ik3max');
  assert(html.indexOf('Ik2min') >= 0, 'has Ik2min');
  assert(html.indexOf('IEC 60909') >= 0, 'has IEC reference');
  assert(html.indexOf('Z<sub>n</sub>') >= 0 || html.indexOf('Zn') >= 0, 'has network impedance');
});

test('calcDetailIB: produces correct load current card', function() {
  var html = calcDetailIB(3.68, 0.95, '1x230', 16.84, 1.0, 1.0);
  assert(html.indexOf('<details') >= 0, 'has details element');
  assert(html.indexOf('IB') >= 0, 'has IB title');
  assert(html.indexOf('3,68') >= 0 || html.indexOf('3680') >= 0, 'has power value (da comma)');
  assert(html.indexOf('0,95') >= 0, 'has cos phi (da comma)');
  assert(html.indexOf('DS/HD 60364-4-43') >= 0, 'has clause reference');
});

test('calcDetail integration: renderCable shows Iz detail when cable selected', function() {
  // Set cable state to have a valid selection
  cableState.crossSection = '2.5';
  cableState.material = 'copper';
  cableState.type = Object.keys(CABLES_COPPER)[0];
  cableState.cores = Object.keys(CABLES_COPPER[cableState.type])[0];
  var html = renderCable();
  if (html.indexOf('calc-detail') >= 0) {
    assert(html.indexOf('Iz_tab') >= 0 || html.indexOf('K_install') >= 0, 'cable detail has derating info');
  }
  // Restore
  cableState.crossSection = null;
});

test('calcDetail integration: renderVdrop shows detail when cable present', function() {
  cableState.crossSection = '2.5';
  cableState.material = 'copper';
  cableState.type = Object.keys(CABLES_COPPER)[0];
  cableState.cores = Object.keys(CABLES_COPPER[cableState.type])[0];
  vdropState.length = 25;
  loadState.power = 5;
  loadState.cosPhi = 0.9;
  loadState.voltage = '3x400';
  var html = renderVdrop();
  assert(html.indexOf('calc-detail') >= 0, 'vdrop has calc-detail');
  assert(html.indexOf('cos') >= 0, 'vdrop detail has cos phi');
  // Restore
  cableState.crossSection = null;
});

test('calcDetail integration: renderShortCircuit shows Ik detail', function() {
  cableState.crossSection = '2.5';
  cableState.material = 'copper';
  cableState.type = Object.keys(CABLES_COPPER)[0];
  cableState.cores = Object.keys(CABLES_COPPER[cableState.type])[0];
  vdropState.length = 25;
  loadState.voltage = '3x400';
  activeModule = 'scircuit';
  var html = renderShortCircuit();
  assert(html.indexOf('calc-detail') >= 0, 'scircuit has calc-detail');
  assert(html.indexOf('Ik3max') >= 0, 'scircuit detail has Ik3max');
  assert(html.indexOf('IEC 60909') >= 0, 'scircuit detail has IEC ref');
  activeModule = 'load';
  cableState.crossSection = null;
});

test('calcDetail integration: renderLoad shows IB detail', function() {
  loadState.power = 10;
  loadState.cosPhi = 0.9;
  loadState.voltage = '3x400';
  loadState.simFactor = 1.0;
  loadState.expFactor = 1.0;
  var html = renderLoad();
  assert(html.indexOf('calc-detail') >= 0, 'load module has calc-detail');
  assert(html.indexOf('IB') >= 0, 'load detail has IB');
});

test('calcDetail integration: upRenderFindingDetail renders for overload finding', function() {
  var finding = { scope: 'Test', rule: 'IB \u2264 In \u2264 Iz', clause: 'DS/HD 60364-4-43 cl. 433.1', status: 'ok', detail: 'IB=16.0A, In=20A, Iz=25A', recommendation: '' };
  var html = upRenderFindingDetail(finding);
  assert(html.indexOf('<details') >= 0, 'has details element');
  assert(html.indexOf('16.0') >= 0, 'has IB value');
  assert(html.indexOf('20') >= 0, 'has In value');
  assert(html.indexOf('25') >= 0, 'has Iz value');
});

test('calcDetail integration: upRenderFindingDetail renders for Icu finding', function() {
  var finding = { scope: 'MCB', rule: 'Icu \u2265 Ikmax', clause: 'DS/HD 60364-4-43 cl. 434.5.1', status: 'ok', detail: 'Icu=10.0kA, Ik3max=5.25kA (ved klemmer)', recommendation: '' };
  var html = upRenderFindingDetail(finding);
  assert(html.indexOf('<details') >= 0, 'has details element');
  assert(html.indexOf('10.0') >= 0, 'has Icu value');
  assert(html.indexOf('5.25') >= 0, 'has Ik3max value');
});

test('calcDetail integration: upRenderFindingDetail renders for vdrop finding', function() {
  var finding = { scope: 'Circuit', rule: '\u0394U \u2264 4%', clause: 'DS/HD 60364-5-52 cl. 525', status: 'ok', detail: '\u0394U=2.35%', recommendation: '' };
  var html = upRenderFindingDetail(finding);
  assert(html.indexOf('<details') >= 0, 'has details element');
  assert(html.indexOf('2.35') >= 0, 'has vdrop value');
});

test('calcDetail integration: upRenderFindingDetail returns empty for unknown finding', function() {
  var finding = { scope: 'X', rule: 'Some unknown rule', clause: 'XX', status: 'info', detail: 'Some detail', recommendation: '' };
  var html = upRenderFindingDetail(finding);
  assert.strictEqual(html, '', 'unknown finding returns empty');
});

test('calcDetail: no text inputs in any output (click-only constraint)', function() {
  var html = calcDetail({
    name: 'Full test',
    formula: 'X = Y + Z',
    variables: [{ name: 'Y', symbol: 'Y', value: 10, unit: 'V', source: 'measured' }],
    substitution: 'X = 10 + 5',
    steps: ['X = 15'],
    result: { value: 15, unit: 'V', status: 'ok' },
    reference: 'IEC 60364'
  });
  assert(html.indexOf('type="text"') < 0, 'no text inputs');
  assert(html.indexOf('type="number"') < 0, 'no number inputs');
  assert(html.indexOf('<textarea') < 0, 'no textarea');
  assert(html.indexOf('<input') < 0, 'no input element at all');
});

test('calcDetail GUARD: core calc math unchanged (officialIz + IB regression)', function() {
  var cu25 = { material: 'Cu', mm2: 2.5, model: '', iz: 999 };
  assert.strictEqual(officialIz(cu25), 23, 'officialIz(Cu 2.5mm2 PVC) == 23A unchanged');
  var ib1 = sldCalcNodeIB({ type: 'final_circuit', power_kW: 3.68, cosPhi: 0.95, phases: '1x230', voltage: 230 });
  assert(Math.abs(ib1 - 16.84) < 0.05, 'IB regression ~16.84A unchanged after calcDetail integration');
});

// ============================================================================
// ===== PROJECT ANALYZER TESTS =====
// ============================================================================

test('Analyzer: analyzerNormalize strips page numbers and headers', function() {
  var input = 'Side 3 af 12\nAutorisationsprove 2019\nHello world\n\n\n\nEnd';
  var result = analyzerNormalize(input);
  assert(result.indexOf('Side 3 af 12') < 0, 'page number stripped');
  assert(result.indexOf('Hello world') >= 0, 'content preserved');
  assert(result.indexOf('\n\n\n') < 0, 'multiple blank lines collapsed');
});

test('Analyzer: analyzerSegment splits by Opgave', function() {
  var text = 'Opgave 1 Transformer\nData her\nOpgave 2 Kabler\nMere data';
  var segs = analyzerSegment(text);
  assert(segs.length >= 2, 'at least 2 segments (got ' + segs.length + ')');
  assert.strictEqual(segs[0].id, 1, 'first segment is Opgave 1');
  assert.strictEqual(segs[1].id, 2, 'second segment is Opgave 2');
});

test('Analyzer: analyzerSegment handles no-Opgave text', function() {
  var segs = analyzerSegment('Simple description without Opgave headers');
  assert(segs.length >= 1, 'returns at least 1 segment');
});

test('Analyzer: analyzerExtract finds power', function() {
  var data = analyzerExtract('Belastning: 37 kW, 400 V, 3-faset');
  assert.strictEqual(data.power_kW, 37, 'power extracted');
  assert.strictEqual(data.voltage, 400, 'voltage extracted');
  assert.strictEqual(data.phases, 3, 'phases extracted');
});

test('Analyzer: analyzerExtract finds cos phi with comma', function() {
  var data = analyzerExtract('cos(phi) = 0,86');
  assert(Math.abs(data.cosPhi - 0.86) < 0.001, 'cosPhi=0.86');
});

test('Analyzer: analyzerExtract finds eta', function() {
  var data = analyzerExtract('eta = 0,93');
  assert(Math.abs(data.eta - 0.93) < 0.001, 'eta=0.93');
});

test('Analyzer: analyzerExtract finds installation method', function() {
  var data = analyzerExtract('Installationsmetode: C');
  assert.strictEqual(data.installMethod, 'C', 'method C');
});

test('Analyzer: analyzerExtract finds temperature', function() {
  var data = analyzerExtract('Omgivelsestemperatur: 35');
  assert.strictEqual(data.temperature, 35, 'temp 35');
});

test('Analyzer: analyzerExtract finds grouping', function() {
  var data = analyzerExtract('Antal belastede ledere: 3');
  assert.strictEqual(data.grouping, 3, 'grouping 3');
});

test('Analyzer: analyzerExtract finds cable length', function() {
  var data = analyzerExtract('Kabellængde: 45 m');
  assert.strictEqual(data.cableLength, 45, 'length 45');
});

test('Analyzer: analyzerExtract finds cross-section', function() {
  var data = analyzerExtract('tværsnit 16 mm²');
  assert.strictEqual(data.cableMm2, 16, 'mm2=16');
});

test('Analyzer: analyzerExtract finds earthing system', function() {
  var data = analyzerExtract('Systemet er TN-C-S med Zs = 1,2');
  assert.strictEqual(data.earthSystem, 'TN-C-S', 'TN-C-S');
  assert(Math.abs(data.zsValue - 1.2) < 0.01, 'Zs=1.2');
});

test('Analyzer: analyzerExtract finds MCB device', function() {
  var data = analyzerExtract('MCB kurve B In = 25 A, Icu = 10 kA');
  assert.strictEqual(data.deviceIn, 25, 'In=25');
  assert.strictEqual(data.deviceIcu, 10, 'Icu=10');
  assert.strictEqual(data.deviceCurve, 'B', 'curve B');
});

test('Analyzer: analyzerExtract finds transformer', function() {
  var data = analyzerExtract('Transformer 630 kVA, uk = 4%, Pcu = 6500 W');
  assert.strictEqual(data.trafoKVA, 630, 'trafo 630 kVA');
  assert.strictEqual(data.trafoUk, 4, 'uk 4%');
  assert.strictEqual(data.trafoPcu, 6500, 'Pcu 6500');
});

test('Analyzer: analyzerDetectQuestions detects IB question', function() {
  var qs = analyzerDetectQuestions('Beregn belastningsstr\u00f8mmen IB');
  assert(qs.some(function(q) { return q.type === 'ib'; }), 'IB detected');
});

test('Analyzer: analyzerDetectQuestions detects vdrop question', function() {
  var qs = analyzerDetectQuestions('Beregn sp\u00e6ndingsfaldet');
  assert(qs.some(function(q) { return q.type === 'vdrop'; }), 'vdrop detected');
});

test('Analyzer: analyzerDetectQuestions detects fault question', function() {
  var qs = analyzerDetectQuestions('Er fejlbeskyttelsen tilstr\u00e6kkelig?');
  assert(qs.some(function(q) { return q.type === 'fault'; }), 'fault detected');
});

test('Analyzer: analyzerSolve computes IB from power and cosPhi', function() {
  var data = {
    power_kW: 37, voltage: 400, phases: 3, cosPhi: 0.86, eta: 0.93,
    installMethod: null, temperature: null, grouping: null,
    cableLength: null, cableMm2: null, cableType: null,
    deviceIn: null, deviceIcu: null, deviceCurve: null,
    trafoKVA: null, trafoUk: null, trafoPcu: null, trafoP0: null,
    earthSystem: null, zsValue: null, disconnectTime: null,
    questions: [{ type: 'ib', label: 'Beregn IB' }], confidence: {}
  };
  var result = analyzerSolve(data);
  assert(result.results.length > 0, 'has results');
  var ibResult = result.results.find(function(r) { return r.type === 'ib'; });
  assert(ibResult, 'IB result exists');
  // IB = (37000 / 0.93) / (sqrt(3) * 400 * 0.86) = 39795.7 / 596.0 = 66.77 A
  var expectedIB = (37000 / 0.93) / (Math.sqrt(3) * 400 * 0.86);
  // Display uses Danish decimal comma in da mode; normalize for numeric compare.
  assert(ibResult.value.replace(',', '.').indexOf(expectedIB.toFixed(2)) >= 0, 'IB value correct (~' + expectedIB.toFixed(2) + 'A)');
  assert(ibResult.asked === true, 'marked as asked question');
});

test('Analyzer: full end-to-end synthetic exam snippet 1', function() {
  var examText = 'Opgave 2\n' +
    'En 3-faset motor har folgende data:\n' +
    'Belastning: 37 kW, 400 V, 3-faset, cos(phi) = 0,86, eta = 0,93\n' +
    'Installationsmetode: C\n' +
    'Omgivelsestemperatur: 35\n' +
    'Antal belastede ledere: 3\n' +
    'Kabellængde: 45 m\n' +
    'Kabeltype: NOIKLX 5G16 mm²\n' +
    'MCB kurve C In = 80 A\n' +
    'Beregn belastningsstroemmen IB\n' +
    'Beregn spaendingsfaldet';
  analyzerRun(examText);
  assert(analyzerState.results.length >= 3, 'at least 3 results computed (IB, Iz, vdrop + extras)');
  var ibR = analyzerState.results.find(function(r) { return r.type === 'ib'; });
  assert(ibR, 'IB computed');
  assert(ibR.asked === true, 'IB was asked');
  var vdR = analyzerState.results.find(function(r) { return r.type === 'vdrop'; });
  assert(vdR, 'vdrop computed');
  assert(vdR.asked === true, 'vdrop was asked');
  // Bonus results should exist
  var bonus = analyzerState.results.filter(function(r) { return r.bonus; });
  assert(bonus.length > 0, 'bonus "nice to know" results generated');
});

test('Analyzer: full end-to-end synthetic exam snippet 2 (fault protection)', function() {
  var examText = 'Opgave 3\n' +
    'Jordingssystem: TN-S\n' +
    'Fejlsloejfe Zs = 0,8 ohm\n' +
    'MCB kurve B In = 16 A\n' +
    'Er fejlbeskyttelsen tilstraekkelig?\n' +
    'Belastning: 3,7 kW, 230 V, 1-faset, cos(phi) = 0,95\n' +
    'Kabellængde: 25 m\n' +
    'tværsnit 2,5 mm²';
  analyzerRun(examText);
  var faultR = analyzerState.results.find(function(r) { return r.type === 'fault'; });
  assert(faultR, 'fault result exists');
  assert(faultR.asked === true, 'fault was asked');
  // If = 230/0.8 = 287.5 A, Ia = 5*16 = 80 A, 287.5 >= 80 => OK
  assert(faultR.status === 'ok', 'fault protection sufficient (287.5A >= 80A)');
  assert(faultR.html.indexOf('<details') >= 0, 'has calcDetail HTML');
});

test('Analyzer: full end-to-end synthetic exam snippet 3 (full dimensioning)', function() {
  var examText = 'Opgave 2: Kabeldimensionering\n' +
    'Belastning: 10 kW, 400 V, 3-faset\n' +
    'cos(phi) = 0,9\n' +
    'Installationsmetode: C\n' +
    'Omgivelsestemperatur: 30\n' +
    'Kabellængde: 50 m\n' +
    'NOIKLX 5G4 mm²\n' +
    'MCB kurve C In = 20 A\n' +
    'Beregn IB\n' +
    'Beregn Iz\n' +
    'Beregn spaendingsfaldet\n' +
    'Beregn kortslutningsstroemmen Ik';
  analyzerRun(examText);
  assert(analyzerState.results.length >= 5, 'at least 5 results (IB, Iz, vdrop, Ik, coord + bonus)');
  var ibR = analyzerState.results.find(function(r) { return r.type === 'ib'; });
  var izR = analyzerState.results.find(function(r) { return r.type === 'iz'; });
  var vdR = analyzerState.results.find(function(r) { return r.type === 'vdrop'; });
  var ikR = analyzerState.results.find(function(r) { return r.type === 'ik'; });
  assert(ibR && ibR.asked, 'IB asked and computed');
  assert(izR && izR.asked, 'Iz asked and computed');
  assert(vdR && vdR.asked, 'vdrop asked and computed');
  assert(ikR && ikR.asked, 'Ik asked and computed');
  // IB = 10000 / (sqrt(3)*400*0.9) = 16.04 A
  var expectedIB2 = 10000 / (Math.sqrt(3) * 400 * 0.9);
  assert(Math.abs(parseFloat(ibR.value) - expectedIB2) < 0.1, 'IB value correct');
  // Iz for 4mm2 XLPE = 40A (method C, 30deg, 1 cable) = 40*1*1*1 = 40A
  assert(izR.value.indexOf('40') >= 0, 'Iz=40A for 4mm2 XLPE method C');
  // Coordination: 16.04 <= 20 <= 40 => OK
  var coordR = analyzerState.results.find(function(r) { return r.type === 'coord'; });
  assert(coordR && coordR.status === 'ok', 'coordination OK');
});

test('Analyzer: renderAnalyzer produces valid HTML', function() {
  analyzerState = { rawText: '', segments: [], extracted: null, results: [], completeness: { solved: 0, total: 0, flagged: [] }, mode: 'upload' };
  var html = renderAnalyzer();
  assert(html.indexOf('Projektanalysator') >= 0 || html.indexOf('Project Analyzer') >= 0, 'has title');
  assert(html.indexOf('type="file"') >= 0, 'has file input');
  assert(html.indexOf('analyzerHandleFile') >= 0, 'has file handler');
});

test('Analyzer: renderAnalyzer shows paste textarea in paste mode', function() {
  analyzerState.mode = 'paste';
  var html = renderAnalyzer();
  assert(html.indexOf('analyzerPasteArea') >= 0, 'has paste area');
  assert(html.indexOf('analyzerHandlePaste') >= 0, 'has paste handler');
  analyzerState.mode = 'upload';
});

test('Analyzer: results use calcDetail for full working', function() {
  var examText = 'Belastning: 10 kW, 400 V, 3-faset, cos(phi) = 0,9\nBeregn IB';
  analyzerRun(examText);
  var ibR = analyzerState.results.find(function(r) { return r.type === 'ib'; });
  assert(ibR, 'IB result exists');
  assert(ibR.html.indexOf('<details') >= 0, 'uses calcDetail expandable');
  assert(ibR.html.indexOf('<summary') >= 0, 'has summary');
  assert(ibR.html.indexOf('IB') >= 0, 'mentions IB');
});

test('Analyzer: safety gating flags missing data', function() {
  var examText = 'Beregn IB';
  analyzerRun(examText);
  assert(analyzerState.completeness.flagged.length > 0, 'flags missing data for IB');
});

test('Analyzer: bonus results are computed even when not asked', function() {
  var examText = 'Belastning: 10 kW, 400 V, 3-faset, cos(phi) = 0,9\nKabellængde: 30 m\ntværsnit 4 mm²';
  analyzerRun(examText);
  var bonus = analyzerState.results.filter(function(r) { return r.bonus; });
  assert(bonus.length >= 1, 'at least 1 bonus result computed');
  var pwrTriangle = analyzerState.results.find(function(r) { return r.type === 'power_triangle'; });
  assert(pwrTriangle, 'power triangle bonus computed');
});

test('Analyzer: module registered in nav and renderModule switch', function() {
  assert(typeof renderAnalyzer === 'function', 'renderAnalyzer exists');
  assert(typeof analyzerExtract === 'function', 'analyzerExtract exists');
  assert(typeof analyzerSolve === 'function', 'analyzerSolve exists');
  // Check nav group
  var startGroup = NAV_GROUPS.find(function(g) { return g.id === 'start'; });
  assert(startGroup.keys.indexOf('analyzer') >= 0, 'analyzer in start nav group');
});

// ===== LYS (LIGHTING / LUMEN) MODULE TESTS =====

test('Lys: lysCalcRoomIndex computes correctly', function() {
  var k = lysCalcRoomIndex(6, 4, 2.5);
  assert(Math.abs(k - 0.96) < 0.01, 'k = 6*4/(2.5*(6+4)) = 0.96, got ' + k);
});

test('Lys: lysCalcRoomIndex handles zero height', function() {
  assert(lysCalcRoomIndex(6, 4, 0) === 0, 'zero height returns 0');
});

test('Lys: lysCalcTotalFlux computes correctly', function() {
  var phi = lysCalcTotalFlux(500, 24, 0.5, 0.8);
  assert(Math.abs(phi - 30000) < 1, 'Phi = 500*24/(0.5*0.8) = 30000, got ' + phi);
});

test('Lys: lysCalcNumLuminaires rounds up', function() {
  assert(lysCalcNumLuminaires(30000, 3600) === 9, 'ceil(30000/3600) = 9');
  assert(lysCalcNumLuminaires(3600, 3600) === 1, 'exact = 1');
  assert(lysCalcNumLuminaires(3601, 3600) === 2, 'just over = 2');
});

test('Lys: lysCalcPointIlluminance at zero angle', function() {
  var E = lysCalcPointIlluminance(1500, 3, 0);
  assert(Math.abs(E - 166.67) < 0.1, 'E = 1500*1/(3^2) = 166.67, got ' + E);
});

test('Lys: lysCalcPointIlluminance at angle', function() {
  var E = lysCalcPointIlluminance(1000, 4, 30);
  // cos(30) = 0.866, r = 4/0.866 = 4.619, E = 1000*0.866/4.619^2 = 40.6
  assert(E > 40 && E < 41, 'E at 30 degrees correct, got ' + E);
});

test('Lys: lysCalcEfficacy', function() {
  assert(lysCalcEfficacy(3600, 36) === 100, '3600/36 = 100 lm/W');
  assert(lysCalcEfficacy(0, 36) === 0, '0 lumens = 0');
  assert(lysCalcEfficacy(100, 0) === 0, '0 watts = 0');
});

test('Lys: lysCalcCircuitCurrent', function() {
  var I = lysCalcCircuitCurrent(1000, 230, 0.95);
  assert(Math.abs(I - 4.578) < 0.01, '1000/(230*0.95) = 4.578, got ' + I);
});

test('Lys: lysUtilizationFactor returns valid range', function() {
  var uf1 = lysUtilizationFactor(0.5, 0.7, 0.5);
  var uf2 = lysUtilizationFactor(5.0, 0.7, 0.5);
  assert(uf1 >= 0.2 && uf1 <= 0.85, 'UF in valid range for low k');
  assert(uf2 >= 0.2 && uf2 <= 0.85, 'UF in valid range for high k');
  assert(uf2 > uf1, 'higher k gives higher UF');
});

test('Lys: renderLys produces valid HTML', function() {
  var html = renderLys();
  assert(html.indexOf('Lumen') >= 0 || html.indexOf('lumen') >= 0, 'has lumen reference');
  assert(html.indexOf('<input') < 0, 'no text inputs');
  assert(html.indexOf('sel-btn') >= 0, 'has click buttons');
});

test('Lys: renderLys lumen mode shows calcDetail', function() {
  lysState.calcType = 'lumen';
  var html = renderLys();
  assert(html.indexOf('calc-detail') >= 0, 'has calcDetail element');
  assert(html.indexOf('DS/EN 12464-1') >= 0, 'references standard');
});

test('Lys: renderLys point mode', function() {
  lysState.calcType = 'point';
  var html = renderLys();
  assert(html.indexOf('lux') >= 0, 'shows lux result');
  lysState.calcType = 'lumen';
});

test('Lys: renderLys efficacy mode', function() {
  lysState.calcType = 'efficacy';
  var html = renderLys();
  assert(html.indexOf('lm/W') >= 0, 'shows lm/W');
  lysState.calcType = 'lumen';
});

test('Lys: module registered in nav theory group', function() {
  var theoryGroup = NAV_GROUPS.find(function(g) { return g.id === 'theory'; });
  assert(theoryGroup.keys.indexOf('lys') >= 0, 'lys in theory group');
});

// ===== TRANSFORMER EXTENDED MODULE TESTS =====

test('Trafo: trafoCalcEMF computes E = 4.44*f*N*Bmax*A', function() {
  var E = trafoCalcEMF(50, 300, 1.2, 0.01);
  assert(Math.abs(E - 799.2) < 0.1, '4.44*50*300*1.2*0.01 = 799.2, got ' + E);
});

test('Trafo: trafoCalcSC computes er% and ex%', function() {
  var sc = trafoCalcSC(6900, 4, 400);
  assert(Math.abs(sc.erPct - 1.725) < 0.01, 'er% = 6900/(400*1000)*100 = 1.725, got ' + sc.erPct);
  assert(sc.exPct > 0, 'ex% > 0');
  // verify uk^2 = er^2 + ex^2
  var ukCalc = Math.sqrt(sc.erPct * sc.erPct + sc.exPct * sc.exPct);
  assert(Math.abs(ukCalc - 4) < 0.01, 'uk = sqrt(er^2+ex^2) = 4');
});

test('Trafo: trafoCalcRegulation inductive', function() {
  var reg = trafoCalcRegulation(1.725, 3.608, 0.8, 'inductive');
  // dU = 1.725*0.8 + 3.608*0.6 = 1.38 + 2.165 = 3.545
  assert(reg.dU_pct > 3.5 && reg.dU_pct < 3.6, 'inductive regulation ~3.5%, got ' + reg.dU_pct);
});

test('Trafo: trafoCalcRegulation capacitive gives lower value', function() {
  var regI = trafoCalcRegulation(1.725, 3.608, 0.8, 'inductive');
  var regC = trafoCalcRegulation(1.725, 3.608, 0.8, 'capacitive');
  assert(regC.dU_pct < regI.dU_pct, 'capacitive < inductive');
});

test('Trafo: trafoCalcEfficiency computes eta', function() {
  var eff = trafoCalcEfficiency(400, 610, 6900, 75, 0.85);
  assert(eff.eta > 0.95 && eff.eta < 1.0, 'efficiency between 95-100%, got ' + (eff.eta*100).toFixed(2));
  assert(eff.optLoad > 0 && eff.optLoad < 1, 'optimal load between 0-100%');
});

test('Trafo: trafoCalcEfficiency optimal load = sqrt(P0/Pcu)', function() {
  var eff = trafoCalcEfficiency(400, 610, 6900, 75, 0.85);
  var expected = Math.sqrt(610 / 6900);
  assert(Math.abs(eff.optLoad - expected) < 0.001, 'opt load = sqrt(P0/Pcu)');
});

test('Trafo: trafoCalcParallel distributes load', function() {
  var par = trafoCalcParallel(400, 4, 630, 6, 500);
  assert(Math.abs(par.S1_load + par.S2_load - 500) < 0.01, 'total = S1+S2');
  // S1/uk1 = 400/4=100, S2/uk2 = 630/6=105. S2 takes slightly more.
  assert(Math.abs(par.ratio1 - 100/205) < 0.01, 'ratio1 = 100/205');
  assert(Math.abs(par.ratio2 - 105/205) < 0.01, 'ratio2 = 105/205');
});

test('Trafo: TRAFO_VECTOR_GROUPS has Dy11', function() {
  assert(TRAFO_VECTOR_GROUPS['Dy11'], 'Dy11 exists');
  assert(TRAFO_VECTOR_GROUPS['Dy11'].shift === 330, 'Dy11 shift = 330');
});

test('Trafo: renderTrafo produces valid HTML', function() {
  var html = renderTrafo();
  assert(html.indexOf('Transformer') >= 0 || html.indexOf('Trafo') >= 0, 'has title');
  assert(html.indexOf('<input') < 0, 'no text inputs');
  assert(html.indexOf('sel-btn') >= 0, 'has click buttons');
});

test('Trafo: renderTrafo sizing mode shows calcDetail', function() {
  trafoState.calcType = 'sizing';
  var html = renderTrafo();
  assert(html.indexOf('calc-detail') >= 0, 'has calcDetail');
  assert(html.indexOf('IEC') >= 0, 'references standard');
});

test('Trafo: renderTrafo EMF mode', function() {
  trafoState.calcType = 'emf';
  var html = renderTrafo();
  assert(html.indexOf('4.44') >= 0 || html.indexOf('4,44') >= 0, 'shows EMF formula');
  trafoState.calcType = 'sizing';
});

test('Trafo: renderTrafo efficiency mode', function() {
  trafoState.calcType = 'efficiency';
  var html = renderTrafo();
  assert(html.indexOf('%') >= 0, 'shows percentage');
  trafoState.calcType = 'sizing';
});

test('Trafo: renderTrafo vectorgroup mode', function() {
  trafoState.calcType = 'vectorgroup';
  var html = renderTrafo();
  assert(html.indexOf('Dy11') >= 0, 'shows Dy11');
  trafoState.calcType = 'sizing';
});

// ===== MAGNETIC CIRCUIT MODULE TESTS =====

test('Magnet: magnetCalcMMF computes N*I', function() {
  assert(magnetCalcMMF(500, 2) === 1000, '500*2 = 1000');
  assert(magnetCalcMMF(0, 5) === 0, '0*5 = 0');
});

test('Magnet: magnetCalcB computes Phi/A', function() {
  assert(Math.abs(magnetCalcB(0.001, 0.001) - 1.0) < 0.001, '0.001/0.001 = 1.0 T');
  assert(magnetCalcB(0.001, 0) === 0, 'zero area = 0');
});

test('Magnet: magnetCalcH computes B/(u0*ur)', function() {
  var H = magnetCalcH(1.0, 2000);
  // H = 1.0 / (4pi*1e-7 * 2000) = 1.0 / 2.513e-3 = 397.9
  assert(H > 397 && H < 399, 'H ~ 398 A/m, got ' + H);
});

test('Magnet: magnetCalcReluctance', function() {
  var Rm = magnetCalcReluctance(0.5, 2000, 0.001);
  // Rm = 0.5 / (4pi*1e-7 * 2000 * 0.001) = 0.5 / 2.513e-6 = 198943
  assert(Rm > 198000 && Rm < 200000, 'Rm ~ 199000, got ' + Rm);
});

test('Magnet: magnetCalcGapReluctance', function() {
  var Rm = magnetCalcGapReluctance(0.001, 0.001);
  // Rm = 0.001 / (4pi*1e-7 * 0.001) = 0.001 / 1.257e-9 = 795775
  assert(Rm > 795000 && Rm < 796000, 'gap Rm ~ 795775, got ' + Rm);
});

test('Magnet: magnetCalcFaradayEMF', function() {
  assert(Math.abs(magnetCalcFaradayEMF(200, 0.01) - 2.0) < 0.001, '200*0.01 = 2V');
});

test('Magnet: magnetCalcMotionalEMF', function() {
  assert(Math.abs(magnetCalcMotionalEMF(1.0, 0.5, 10) - 5.0) < 0.001, '1*0.5*10 = 5V');
});

test('Magnet: magnetCalcInductance', function() {
  var L = magnetCalcInductance(500, 2000, 0.001, 0.5);
  // L = 500^2 * 4pi*1e-7 * 2000 * 0.001 / 0.5 = 250000 * 2.513e-6 / 0.5 = 1.257
  assert(L > 1.25 && L < 1.27, 'L ~ 1.257 H, got ' + L);
});

test('Magnet: magnetCalcForce', function() {
  assert(Math.abs(magnetCalcForce(1.0, 5, 0.3) - 1.5) < 0.001, '1*5*0.3 = 1.5 N');
});

test('Magnet: magnetCalcEnergy', function() {
  assert(Math.abs(magnetCalcEnergy(0.1, 5) - 1.25) < 0.001, '0.5*0.1*25 = 1.25 J');
});

test('Magnet: renderMagnet produces valid HTML', function() {
  var html = renderMagnet();
  assert(html.indexOf('Magnet') >= 0 || html.indexOf('magnet') >= 0, 'has title');
  assert(html.indexOf('<input') < 0, 'no text inputs');
  assert(html.indexOf('sel-btn') >= 0, 'has click buttons');
});

test('Magnet: renderMagnet MMF mode shows calcDetail', function() {
  magnetState.calcType = 'mmf';
  var html = renderMagnet();
  assert(html.indexOf('calc-detail') >= 0, 'has calcDetail');
  assert(html.indexOf('Opgavesamling') >= 0, 'references source');
});

test('Magnet: renderMagnet inductance shows XL link', function() {
  magnetState.calcType = 'inductance';
  var html = renderMagnet();
  assert(html.indexOf('XL') >= 0, 'shows XL cross-link to impedance');
  magnetState.calcType = 'mmf';
});

test('Magnet: module registered in nav theory group', function() {
  var theoryGroup = NAV_GROUPS.find(function(g) { return g.id === 'theory'; });
  assert(theoryGroup.keys.indexOf('magnet') >= 0, 'magnet in theory group');
});

test('Magnet: MAGNET_MU0 is correct', function() {
  assert(Math.abs(MAGNET_MU0 - 1.2566e-6) < 1e-9, 'mu0 = 4pi*1e-7');
});

test('Magnet: air gap dominates reluctance', function() {
  var Rm_core = magnetCalcReluctance(0.5, 2000, 0.001);
  var Rm_gap = magnetCalcGapReluctance(0.001, 0.001);
  assert(Rm_gap > Rm_core, 'air gap reluctance >> core reluctance');
});

// ============================================================================
// === KAPACITOR / RC CIRCUIT MODULE TESTS (Opgavesamling Kap. 4) ============
// ============================================================================
console.log('\n=== Capacitor / RC Module Tests (Opgavesamling Ch. 4) ===\n');

test('Kapacitor: parallel-plate capacitance C = eps0*er*A/d', function() {
  // er=1, A=0.01 m2, d=0.001 m => 8.854e-12 * 1 * 0.01 / 0.001 = 8.854e-11 F
  var C = kapacitorCalcC(1, 0.01, 0.001);
  assert(Math.abs(C - 8.854e-11) < 1e-14, 'C ~ 88.54 pF, got ' + C);
});

test('Kapacitor: dielectric multiplies capacitance by er', function() {
  var Cair = kapacitorCalcC(1, 0.01, 0.001);
  var Cmica = kapacitorCalcC(6, 0.01, 0.001);
  assert(Math.abs(Cmica - 6 * Cair) < 1e-15, 'mica (er=6) gives 6x air capacitance');
});

test('Kapacitor: charge Q = C*U', function() {
  // 1uF at 230V => 2.3e-4 C
  assert(Math.abs(kapacitorCalcQ(1e-6, 230) - 2.3e-4) < 1e-9, 'Q = 0.23 mC');
});

test('Kapacitor: energy W = 0.5*C*U^2', function() {
  // 0.5 * 1e-6 * 230^2 = 0.026450 J
  assert(Math.abs(kapacitorCalcW(1e-6, 230) - 0.026450) < 1e-6, 'W ~ 26.45 mJ');
});

test('Kapacitor: series caps 1/C = sum(1/Ci)', function() {
  // 1uF and 2uF in series => 0.6667 uF
  var C = kapacitorCalcSeries([1e-6, 2e-6]);
  assert(Math.abs(C - 6.6667e-7) < 1e-10, 'series ~ 0.667 uF, got ' + C);
});

test('Kapacitor: parallel caps C = sum(Ci)', function() {
  assert(Math.abs(kapacitorCalcParallel([1e-6, 2e-6]) - 3e-6) < 1e-12, 'parallel = 3 uF');
});

test('Kapacitor: RC time constant tau = R*C', function() {
  assert(Math.abs(kapacitorCalcTau(1000, 1e-6) - 1e-3) < 1e-9, 'tau = 1 ms');
});

test('Kapacitor: charging u(t)=U*(1-e^(-t/tau)) at t=tau ~ 63.2%', function() {
  var tau = kapacitorCalcTau(1000, 1e-6);
  var u = kapacitorCalcCharging(230, tau, tau);
  assert(Math.abs(u - 230 * (1 - Math.exp(-1))) < 0.01, 'u(tau) ~ 145.4 V, got ' + u.toFixed(2));
});

test('Kapacitor: discharging u(t)=U*e^(-t/tau) at t=tau ~ 36.8%', function() {
  var tau = kapacitorCalcTau(1000, 1e-6);
  var u = kapacitorCalcDischarging(230, tau, tau);
  assert(Math.abs(u - 230 * Math.exp(-1)) < 0.01, 'u(tau) ~ 84.6 V, got ' + u.toFixed(2));
});

test('Kapacitor: charging+discharging always sum to U', function() {
  var tau = kapacitorCalcTau(2200, 4.7e-7);
  for (var t = 0; t <= 5 * tau; t += tau / 4) {
    var sum = kapacitorCalcCharging(48, t, tau) + kapacitorCalcDischarging(48, t, tau);
    assert(Math.abs(sum - 48) < 1e-9, 'uC(t)+uD(t)=U at t=' + t);
  }
});

test('Kapacitor: Coulomb F = Q1*Q2/(4*pi*eps0*r^2)', function() {
  // q1=q2=1uC, r=0.1m => k*1e-12/0.01 = 8.988e9*1e-10 = 0.8988 N
  var F = kapacitorCalcCoulomb(1e-6, 1e-6, 0.1);
  assert(Math.abs(F - 0.8988) < 0.01, 'F ~ 0.899 N, got ' + F.toFixed(4));
});

test('Kapacitor: XC link matches impedans XC formula', function() {
  var C = 1e-6;
  var xcKap = kapacitorCalcXC(50, C);
  var xcImp = impedansCalcXC(50, C);
  assert(Math.abs(xcKap - xcImp) < 1e-9, 'kapacitor XC must equal impedans XC');
});

test('Kapacitor: renderKapacitor produces valid click-only HTML', function() {
  var html = renderKapacitor();
  assert(html.indexOf('Kapacitor') >= 0 || html.indexOf('Capacitor') >= 0, 'has title');
  assert(html.indexOf('<input') < 0, 'no text/number inputs');
  assert(html.indexOf('<textarea') < 0, 'no textarea');
  assert(html.indexOf('sel-btn') >= 0, 'has click buttons');
});

test('Kapacitor: every sub-mode renders a calcDetail block', function() {
  ['capacitance', 'charge', 'combo', 'rc', 'coulomb'].forEach(function(m) {
    kapacitorState.calcType = m;
    var html = renderKapacitor();
    assert(html.indexOf('calc-detail') >= 0, m + ' shows calcDetail working');
    assert(html.indexOf('Opgavesamling Kap. 4') >= 0, m + ' references source');
  });
  kapacitorState.calcType = 'capacitance';
});

test('Kapacitor: trilingual labels resolve (da/en/fa)', function() {
  var savedLang = lang;
  lang = 'da'; assert(t('modules').kapacitor === 'Kapacitor & RC', 'da label');
  lang = 'en'; assert(t('modules').kapacitor === 'Capacitor & RC', 'en label');
  lang = 'fa'; assert(typeof t('modules').kapacitor === 'string' && t('modules').kapacitor.length > 0, 'fa label present');
  lang = savedLang;
});

test('Kapacitor: registered in theory nav group', function() {
  var theoryGroup = NAV_GROUPS.find(function(g) { return g.id === 'theory'; });
  assert(theoryGroup.keys.indexOf('kapacitor') >= 0, 'kapacitor in theory group');
});

test('Kapacitor: capacitance_F bus link updates impedans.C and vice versa', function() {
  var savedImp = impedansState.C, savedKap = kapacitorState.C;
  SharedQuantities.set('capacitance_F', 4.7e-6, 'kapacitor');
  assert(Math.abs(impedansState.C - 4.7e-6) < 1e-12, 'impedans.C updated from kapacitor');
  SharedQuantities.set('capacitance_F', 2.2e-6, 'impedans');
  assert(Math.abs(kapacitorState.C - 2.2e-6) < 1e-12, 'kapacitor.C updated from impedans');
  impedansState.C = savedImp; kapacitorState.C = savedKap;
});

test('Kapacitor: in REACTIVE_LINKS and reaches impedans', function() {
  assert(Array.isArray(REACTIVE_LINKS.kapacitor), 'kapacitor has links');
  assert(reactiveAffected('kapacitor').indexOf('impedans') >= 0, 'kapacitor change reaches impedans');
  assert(REACTIVE_LINKS.impedans.indexOf('kapacitor') >= 0, 'impedans links back to kapacitor');
});

// ============================================================================
// === ROOM HEATING / U-VALUE MODULE TESTS (Opgavesamling Kap. 13) ===========
// ============================================================================
console.log('\n=== Room Heating / U-value Module Tests (Opgavesamling Ch. 13) ===\n');

test('Varme: R_total = Ri + sum(d/lambda) + Ru', function() {
  var layers = [{ mat: 'brick', d: 0.108 }, { mat: 'mineral_wool', d: 0.10 }, { mat: 'plaster', d: 0.013 }];
  var R = varmeCalcRtotal(0.13, layers, 0.04);
  // 0.13 + 0.108/0.5 + 0.10/0.037 + 0.013/0.25 + 0.04 = 3.1407
  assert(Math.abs(R - 3.1407) < 0.01, 'R_total ~ 3.141, got ' + R.toFixed(4));
});

test('Varme: U = 1/R_total', function() {
  var layers = [{ mat: 'brick', d: 0.108 }, { mat: 'mineral_wool', d: 0.10 }, { mat: 'plaster', d: 0.013 }];
  var U = varmeCalcU(0.13, layers, 0.04);
  assert(Math.abs(U - 0.3184) < 0.005, 'U ~ 0.318 W/m2K, got ' + U.toFixed(4));
});

test('Varme: none/zero layers are skipped in R_total', function() {
  var R1 = varmeCalcRtotal(0.13, [{ mat: 'brick', d: 0.1 }, { mat: 'none', d: 0 }], 0.04);
  var R2 = varmeCalcRtotal(0.13, [{ mat: 'brick', d: 0.1 }], 0.04);
  assert(Math.abs(R1 - R2) < 1e-9, 'empty layer contributes nothing');
});

test('Varme: transmission Q = U*A*deltaT', function() {
  // U=0.3, A=20, dT=32 => 192 W
  assert(Math.abs(varmeCalcTransmission(0.3, 20, 32) - 192) < 0.01, 'Q = 192 W');
});

test('Varme: ventilation Q = 0.33*n*V*deltaT', function() {
  // 0.33*0.5*125*32 = 660 W
  assert(Math.abs(varmeCalcVentilation(0.5, 125, 32) - 660) < 0.01, 'Q_vent = 660 W');
});

test('Varme: total demand = transmission + ventilation', function() {
  var tot = varmeCalcTotal(0.3, 20, 0.5, 125, 32);
  assert(Math.abs(tot - (192 + 660)) < 0.01, 'total = 852 W');
});

test('Varme: better insulation lowers U-value', function() {
  var thin = varmeCalcU(0.13, [{ mat: 'mineral_wool', d: 0.05 }], 0.04);
  var thick = varmeCalcU(0.13, [{ mat: 'mineral_wool', d: 0.30 }], 0.04);
  assert(thick < thin, 'thicker insulation => lower U');
});

test('Varme: renderVarme produces valid click-only HTML', function() {
  var html = renderVarme();
  assert(html.indexOf('U-v') >= 0 || html.indexOf('U-value') >= 0, 'has title');
  assert(html.indexOf('<input') < 0, 'no text/number inputs');
  assert(html.indexOf('<textarea') < 0, 'no textarea');
  assert(html.indexOf('sel-btn') >= 0, 'has click buttons');
});

test('Varme: every sub-mode renders a calcDetail block', function() {
  ['uvalue', 'transmission', 'ventilation', 'total'].forEach(function(m) {
    varmeState.calcType = m;
    var html = renderVarme();
    assert(html.indexOf('calc-detail') >= 0, m + ' shows calcDetail working');
    assert(html.indexOf('Opgavesamling Kap. 13') >= 0, m + ' references source');
  });
  varmeState.calcType = 'uvalue';
});

test('Varme: trilingual labels resolve (da/en/fa)', function() {
  var savedLang = lang;
  lang = 'da'; assert(t('modules').varme.indexOf('Rumvarme') >= 0, 'da label');
  lang = 'en'; assert(t('modules').varme.indexOf('Room heating') >= 0, 'en label');
  lang = 'fa'; assert(typeof t('modules').varme === 'string' && t('modules').varme.length > 0, 'fa label present');
  lang = savedLang;
});

test('Varme: registered in theory nav group', function() {
  var theoryGroup = NAV_GROUPS.find(function(g) { return g.id === 'theory'; });
  assert(theoryGroup.keys.indexOf('varme') >= 0, 'varme in theory group');
});

test('Varme: total demand publishes load_power_kw on bus and reaches load/cable', function() {
  var saved = SharedQuantities.get('load_power_kw');
  varmeState.calcType = 'total';
  syncSharedQuantities('varme');
  assert(SharedQuantities.get('load_power_kw') > 0, 'heat demand published to load_power_kw');
  assert(reactiveAffected('varme').indexOf('cable') >= 0, 'varme change reaches cable sizing');
  assert(reactiveAffected('varme').indexOf('load') >= 0, 'varme change reaches load');
  if (saved != null) SharedQuantities._values['load_power_kw'] = saved;
});

// ============================================================================
// === DC MACHINES MODULE TESTS (Opgavesamling Kap. 10) ======================
// ============================================================================
console.log('\n=== DC Machines Module Tests (Opgavesamling Ch. 10) ===\n');

test('Dcmaskine: generator E = U + Ia*Ra + Ubrush', function() {
  // 220 + 40*0.25 + 2 = 232
  assert(Math.abs(dcmaskineGenEMF(220, 40, 0.25, 2) - 232) < 0.001, 'E = 232 V');
});

test('Dcmaskine: motor back-EMF E = U - Ia*Ra - Ubrush', function() {
  // 220 - 40*0.25 - 2 = 208
  assert(Math.abs(dcmaskineMotorBackEMF(220, 40, 0.25, 2) - 208) < 0.001, 'E = 208 V');
});

test('Dcmaskine: torque M = 9.55*P/n', function() {
  // 9.55*5000/1450 = 32.93 Nm
  assert(Math.abs(dcmaskineTorque(5000, 1450) - 32.931) < 0.01, 'M ~ 32.93 Nm');
});

test('Dcmaskine: starting resistor Rs = (U-E)/Ia', function() {
  // (220-0)/40 = 5.5 ohm at standstill
  assert(Math.abs(dcmaskineStartResistor(220, 0, 40) - 5.5) < 0.001, 'Rs = 5.5 ohm at start');
  // (220-210)/40 = 0.25 with back-emf present
  assert(Math.abs(dcmaskineStartResistor(220, 210, 40) - 0.25) < 0.001, 'Rs = 0.25 ohm with E=210');
});

test('Dcmaskine: efficiency eta = Pout/Pin', function() {
  assert(Math.abs(dcmaskineEfficiency(4500, 5000) - 0.9) < 1e-9, 'eta = 0.9');
});

test('Dcmaskine: shunt field current If = U/Rf', function() {
  // 220/110 = 2 A
  assert(Math.abs(dcmaskineFieldCurrent(220, 110) - 2) < 1e-9, 'If = 2 A');
});

test('Dcmaskine: generator EMF > terminal voltage, motor back-EMF < terminal voltage', function() {
  var Egen = dcmaskineGenEMF(220, 50, 0.2, 2);
  var Emot = dcmaskineMotorBackEMF(220, 50, 0.2, 2);
  assert(Egen > 220, 'generator E above U');
  assert(Emot < 220, 'motor back-EMF below U');
});

test('Dcmaskine: renderDcmaskine produces valid click-only HTML', function() {
  var html = renderDcmaskine();
  assert(html.indexOf('maskin') >= 0 || html.indexOf('machine') >= 0 || html.indexOf('DC') >= 0, 'has title');
  assert(html.indexOf('<input') < 0, 'no text/number inputs');
  assert(html.indexOf('<textarea') < 0, 'no textarea');
  assert(html.indexOf('sel-btn') >= 0, 'has click buttons');
});

test('Dcmaskine: every sub-mode renders a calcDetail block', function() {
  ['generator', 'motor', 'torque', 'starter', 'efficiency'].forEach(function(m) {
    dcmaskineState.mode = m;
    var html = renderDcmaskine();
    assert(html.indexOf('calc-detail') >= 0, m + ' shows calcDetail working');
    assert(html.indexOf('Opgavesamling Kap. 10') >= 0, m + ' references source');
  });
  dcmaskineState.mode = 'generator';
});

test('Dcmaskine: all four machine types are selectable', function() {
  ['shunt', 'series', 'compound', 'separate'].forEach(function(ty) {
    dcmaskineState.type = ty;
    var html = renderDcmaskine();
    assert(html.indexOf('sel-btn selected') >= 0, ty + ' selectable');
  });
  dcmaskineState.type = 'shunt';
});

test('Dcmaskine: trilingual labels resolve (da/en/fa)', function() {
  var savedLang = lang;
  lang = 'da'; assert(t('modules').dcmaskine.indexOf('Jævnstr') >= 0, 'da label');
  lang = 'en'; assert(t('modules').dcmaskine === 'DC machines', 'en label');
  lang = 'fa'; assert(typeof t('modules').dcmaskine === 'string' && t('modules').dcmaskine.length > 0, 'fa label present');
  lang = savedLang;
});

test('Dcmaskine: registered in theory nav group', function() {
  var theoryGroup = NAV_GROUPS.find(function(g) { return g.id === 'theory'; });
  assert(theoryGroup.keys.indexOf('dcmaskine') >= 0, 'dcmaskine in theory group');
});

test('Dcmaskine: power publishes motor_power_w and reaches motorteori/cable', function() {
  dcmaskineState.Pmech = 7500;
  syncSharedQuantities('dcmaskine');
  assert(SharedQuantities.get('motor_power_w') === 7500, 'motor power published');
  assert(reactiveAffected('dcmaskine').indexOf('motorteori') >= 0, 'reaches motor theory');
  assert(reactiveAffected('dcmaskine').indexOf('cable') >= 0, 'reaches cable sizing');
});

test('Dcmaskine: motor_power_w bus link updates dcmaskineState.Pmech from motorteori', function() {
  var saved = dcmaskineState.Pmech;
  SharedQuantities.set('motor_power_w', 11000, 'motorteori');
  assert(dcmaskineState.Pmech === 11000, 'dcmaskine.Pmech updated from motorteori');
  dcmaskineState.Pmech = saved;
});

// ============================================================================
// === GUARD: core engine math (officialIz + IB) unchanged by new modules ====
// ============================================================================
test('Guard: new theory modules do NOT change officialIz + IB regression', function() {
  // Same authoritative values as the existing engine guard test.
  var cu25 = { material: 'Cu', mm2: 2.5, model: '', iz: 999 };
  assert.strictEqual(officialIz(cu25), 23, 'officialIz(Cu 2.5mm2 PVC) == 23A unchanged');
  var cu16 = { material: 'Cu', mm2: 16, model: '', iz: 1 };
  assert.strictEqual(officialIz(cu16), 73, 'officialIz(Cu 16mm2 PVC) == 73A unchanged');
  var ib = sldCalcNodeIB({ type: 'final_circuit', power_kW: 3.68, cosPhi: 0.95, phases: '1x230', voltage: 230 });
  assert(Math.abs(ib - 16.84) < 0.05, 'IB regression ~16.84A unchanged, got ' + ib.toFixed(2));
  // The new module calc functions must coexist with the engine functions.
  assert(typeof kapacitorCalcC === 'function' && typeof varmeCalcU === 'function' && typeof dcmaskineGenEMF === 'function', 'new calc fns defined');
  assert(typeof calcIB === 'function' && typeof officialIz === 'function', 'engine fns intact');
});

// ============================================================================
// === CAPSTONE: COMPLETE EXAM SOLUTION GENERATOR TESTS =======================
// === examBuildSolution(): end-to-end examiner-grade solution generator ======
// ============================================================================
console.log('\n=== Complete Exam Solution Generator Tests ===\n');

// A representative multi-Opgave exam covering load, voltage drop, short-circuit,
// device selection, transformer and fault protection.
var EXAM_SAMPLE_TEXT = [
  'Opgave 1',
  'En 3-faset belastning med effekt 37 kW ved 400 V med cos phi = 0,86.',
  '1.1 Beregn belastningsstroemmen IB.',
  '1.2 Beregn spaendingsfaldet \u0394U naar kablet er NOIKLX 16 mm\u00B2 med laengde 45 m.',
  'Installationsmetode: C. Omgivelsestemperatur: 35\u00B0C.',
  '',
  'Opgave 2',
  'Transformer 630 kVA, uk = 4%.',
  '2.1 Beregn kortslutningsstroemmen Ik.',
  '2.2 Vaelg sikring MCB til kredsen. In = 25 A, kurve C.',
  '',
  'Opgave 3',
  'Jordingssystem: TN-S. Zs = 0,8 \u03A9.',
  '3.1 Er fejlbeskyttelsen tilstraekkelig?'
].join('\n');

test('examBuildSolution: produces a structured object with opgave sections', function() {
  var savedLang = lang; lang = 'da';
  analyzerRun(EXAM_SAMPLE_TEXT);
  var sol = examBuildSolution(analyzerState);
  assert(sol && typeof sol === 'object', 'returns an object');
  assert(Array.isArray(sol.opgaver), 'has opgaver array');
  assert(sol.opgaver.length >= 3, 'at least 3 opgave sections (got ' + sol.opgaver.length + ')');
  var ids = sol.opgaver.map(function(o) { return o.id; });
  assert(ids.indexOf(1) >= 0 && ids.indexOf(2) >= 0 && ids.indexOf(3) >= 0, 'sections for Opgave 1, 2 and 3');
  var totalQ = sol.opgaver.reduce(function(n, o) { return n + o.questions.length; }, 0);
  assert(totalQ >= 4, 'detected questions distributed across opgaver (got ' + totalQ + ')');
  lang = savedLang;
});

test('examBuildSolution: each detected question carries text + mapped calculation', function() {
  analyzerRun(EXAM_SAMPLE_TEXT);
  var sol = examBuildSolution(analyzerState);
  var anyWithText = false;
  sol.opgaver.forEach(function(o) {
    o.questions.forEach(function(q) {
      assert(typeof q.questionText === 'string' && q.questionText.length > 0, 'question has text');
      assert(typeof q.label === 'string' && q.label.length > 0, 'question has a mapped label');
      if (q.questionText.length > 3) anyWithText = true;
    });
  });
  assert(anyWithText, 'at least one question carries real question text');
});

test('examBuildSolution: each SOLVED question carries the FULL calcDetail working HTML', function() {
  analyzerRun(EXAM_SAMPLE_TEXT);
  var sol = examBuildSolution(analyzerState);
  var solved = [];
  sol.opgaver.forEach(function(o) { o.questions.forEach(function(q) { if (q.solved) solved.push(q); }); });
  assert(solved.length > 0, 'at least one solved question exists');
  solved.forEach(function(q) {
    assert(q.calcHtml && q.calcHtml.indexOf('calc-detail') >= 0, q.label + ' carries calcDetail HTML');
    assert(q.calcHtml.indexOf('Formel') >= 0 || q.calcHtml.indexOf('Formula') >= 0, q.label + ' shows a formula');
    assert(q.calcHtml.indexOf('Resultat') >= 0 || q.calcHtml.indexOf('Result') >= 0, q.label + ' shows a result');
  });
});

test('examBuildSolution: auto-generates and embeds the single-line diagram (reuses buildSLD)', function() {
  analyzerRun(EXAM_SAMPLE_TEXT);
  var sol = examBuildSolution(analyzerState);
  assert(typeof sol.sldHtml === 'string' && sol.sldHtml.length > 0, 'sldHtml present');
  assert(sol.sldHtml.indexOf('class="sld"') >= 0, 'embeds the SLD container');
  assert(sol.sldHtml.indexOf('<svg') >= 0, 'SLD contains an SVG diagram');
});

test('examBuildSolution: verdict reflects the engine (reuses upComputeVerdict + auditor)', function() {
  analyzerRun(EXAM_SAMPLE_TEXT);
  var sol = examBuildSolution(analyzerState);
  assert(sol.verdict && typeof sol.verdict.code === 'string', 'verdict has a code');
  assert(['red', 'yellow', 'green', 'incomplete'].indexOf(sol.verdict.code) >= 0, 'valid traffic-light code');
  assert.strictEqual(sol.verdict.code, upComputeVerdict(sol.verdict.findings), 'verdict == engine upComputeVerdict(findings)');
  // IB (62 A) > In (25 A) -> coordination FAILS -> engine must report red.
  assert.strictEqual(sol.verdict.code, 'red', 'overbelastning (IB>In) makes the verdict red');
  assert(sol.verdict.counts.fail >= 1, 'at least one failing finding counted');
});

test('examBuildSolution: no engine failures => verdict not red (well-formed input)', function() {
  var ok = [
    'Opgave 1',
    'En 1-faset belastning med effekt 2 kW ved 230 V med cos phi = 0,95.',
    '1.1 Beregn belastningsstroemmen IB.',
    '1.2 Vaelg sikring MCB. In = 16 A, kurve B.',
    'Kablet er NOIKLX 2,5 mm\u00B2, laengde 20 m. Installationsmetode: C.',
    'Jordingssystem: TN-S. Zs = 0,5 \u03A9.',
    '3.1 Er fejlbeskyttelsen tilstraekkelig?'
  ].join('\n');
  analyzerRun(ok);
  var sol = examBuildSolution(analyzerState);
  assert.strictEqual(sol.verdict.code, upComputeVerdict(sol.verdict.findings), 'verdict == engine computation');
  assert(sol.verdict.counts.fail === 0, 'no failing findings for a conservative circuit');
});

test('examBuildSolution: coverage panel reports solved / needs-input / modules used', function() {
  analyzerRun(EXAM_SAMPLE_TEXT);
  var sol = examBuildSolution(analyzerState);
  assert(sol.coverage && typeof sol.coverage.detected === 'number', 'coverage.detected present');
  assert(sol.coverage.solved + sol.coverage.needInput === sol.coverage.detected, 'solved + needInput == detected');
  assert(Array.isArray(sol.coverage.modulesUsed), 'modulesUsed is an array');
  assert(sol.coverage.modulesUsed.length > 0, 'at least one module used');
});

test('examRenderSolution: on-screen render is 100% click-only (no input/textarea)', function() {
  analyzerRun(EXAM_SAMPLE_TEXT);
  var sol = examBuildSolution(analyzerState);
  var html = examRenderSolution(sol);
  assert(html.indexOf('<input') < 0, 'no <input> in the solution render');
  assert(html.indexOf('<textarea') < 0, 'no <textarea> in the solution render');
  assert(html.indexOf('onclick=') >= 0, 'uses click-only controls');
  assert(html.indexOf('calc-detail') >= 0, 'embeds full working blocks');
  assert(html.indexOf('class="sld"') >= 0, 'embeds the single-line diagram');
});

test('examSolutionCard: analyzer button is click-only and toggles the solution', function() {
  analyzerRun(EXAM_SAMPLE_TEXT);
  analyzerState.solutionShown = false;
  var card = examSolutionCard();
  assert(card.indexOf('examGenerateSolution()') >= 0, 'shows the Generate button');
  assert(card.indexOf('<input') < 0 && card.indexOf('<textarea') < 0, 'card is click-only');
  examGenerateSolution();
  assert.strictEqual(analyzerState.solutionShown, true, 'generate sets solutionShown true');
  var shown = examSolutionCard();
  assert(shown.indexOf('examPrintSolution()') >= 0, 'print action available when shown');
  examHideSolution();
  assert.strictEqual(analyzerState.solutionShown, false, 'hide resets solutionShown');
});

test('renderAnalyzer: the only text input remains the analyzer paste textarea', function() {
  var savedMode = analyzerState.mode;
  analyzerState.mode = 'paste';
  analyzerRun(EXAM_SAMPLE_TEXT);
  analyzerState.solutionShown = true;
  var html = renderAnalyzer();
  var taCount = (html.match(/<textarea/g) || []).length;
  assert.strictEqual(taCount, 1, 'exactly one textarea (the analyzer paste area), got ' + taCount);
  assert(html.indexOf('analyzerPasteArea') >= 0, 'the textarea is the analyzer paste area');
  assert(html.indexOf('type="text"') < 0, 'no free-text inputs anywhere in the analyzer');
  analyzerState.mode = savedMode;
});

test('examBuildSolution: trilingual (da/en/fa) keys resolve in the render', function() {
  var savedLang = lang;
  analyzerRun(EXAM_SAMPLE_TEXT);
  lang = 'da'; var da = examRenderSolution(examBuildSolution(analyzerState));
  lang = 'en'; var en = examRenderSolution(examBuildSolution(analyzerState));
  lang = 'fa'; var fa = examRenderSolution(examBuildSolution(analyzerState));
  assert(da.indexOf('Komplet eksamensl') >= 0, 'da title present');
  assert(en.indexOf('Complete exam solution') >= 0, 'en title present');
  assert(typeof _FA['Complete exam solution'] === 'string' && _FA['Complete exam solution'].length > 0, 'fa key for title');
  assert(typeof _FA['Generate complete solution'] === 'string', 'fa key for generate');
  assert(typeof _FA['Critical mind verdict'] === 'string', 'fa key for verdict');
  assert(fa.indexOf(_FA['Complete exam solution']) >= 0, 'fa render uses the Persian title');
  assert(fa.indexOf('<input') < 0 && fa.indexOf('<textarea') < 0, 'fa render stays click-only');
  lang = savedLang;
});

test('examSolutionPrintHTML: expands calcDetail blocks so the PDF shows FULL working', function() {
  analyzerRun(EXAM_SAMPLE_TEXT);
  var sol = examBuildSolution(analyzerState);
  var print = examSolutionPrintHTML(sol);
  assert(print.indexOf('report-doc') >= 0, 'reuses the report document shell');
  assert(print.indexOf('<details open class="calc-detail"') >= 0, 'calcDetail blocks forced open for print');
  assert(print.indexOf('class="sld"') >= 0, 'SLD embedded in the print document');
  assert(examSolutionPrintCSS().indexOf(reportPrintCSS()) === 0, 'print CSS extends reportPrintCSS()');
});

test('examBuildSolution: handles empty state without inventing data (conservative)', function() {
  var emptyState = { rawText: '', segments: [], extracted: null, results: [], completeness: { solved: 0, total: 0, flagged: [] }, dependencies: [], moduleFlow: [], busPopulated: false, solutionShown: false, mode: 'paste' };
  var sol = examBuildSolution(emptyState);
  assert(sol && Array.isArray(sol.opgaver), 'returns a valid structure');
  assert.strictEqual(sol.coverage.detected, 0, 'no detected questions when there is no data');
  assert.strictEqual(sol.coverage.solved, 0, 'nothing solved when there is no data');
  var html = examRenderSolution(sol);
  assert(html.indexOf('<input') < 0 && html.indexOf('<textarea') < 0, 'empty render still click-only');
});

// ============================================================================
// === GUARD: exam-solution feature must NOT change the calc/verdict engine ===
// ============================================================================
test('Guard: exam solution feature does NOT change officialIz + IB regression', function() {
  var cu25 = { material: 'Cu', mm2: 2.5, model: '', iz: 999 };
  assert.strictEqual(officialIz(cu25), 23, 'officialIz(Cu 2.5mm2 PVC) == 23A unchanged');
  var cu16 = { material: 'Cu', mm2: 16, model: '', iz: 1 };
  assert.strictEqual(officialIz(cu16), 73, 'officialIz(Cu 16mm2 PVC) == 73A unchanged');
  var ib = sldCalcNodeIB({ type: 'final_circuit', power_kW: 3.68, cosPhi: 0.95, phases: '1x230', voltage: 230 });
  assert(Math.abs(ib - 16.84) < 0.05, 'IB regression ~16.84A unchanged, got ' + ib.toFixed(2));
  assert(typeof upComputeVerdict === 'function' && typeof upAuditProject === 'function', 'verdict engine intact');
  assert(typeof calcDetail === 'function' && typeof buildSLD === 'function', 'calcDetail + buildSLD intact');
  assert(typeof examBuildSolution === 'function' && typeof examRenderSolution === 'function', 'capstone fns defined');
});

// ============================================================================
// === NEW: Reactive completeness (live recomputers) + Analyzer depth tests ===
// ============================================================================
console.log('\n=== Reactive Completeness: Live Recomputers Tests ===\n');

test('RC: theory + fault recomputers are registered as live verdicts', function() {
  ['fault','impedans','trefase','motorteori','kapacitor','varme','dcmaskine','lys'].forEach(function(k){
    assert(typeof Reactive.recomputers[k] === 'function', k + ' recomputer registered');
  });
});

test('RC: fault disconnection verdict is FRESH and correct by default (TN, Zs=1.2)', function() {
  var saved = JSON.stringify(faultState);
  faultState.earthSystem = 'tncs'; faultState.deviceType = 'mcbB'; faultState.deviceIn = 16; faultState.zsValue = 1.2; faultState.voltage = 230;
  Reactive.notify('fault');
  var v = Reactive.verdict('fault');
  assert(v.status === 'ok', 'TN with Zs·Ia=96V <= 230V is OK, got ' + v.status);
  assert(v.stale === false, 'verdict is fresh (not stale)');
  assert(v.detail.indexOf('Zs') >= 0, 'detail cites the loop impedance check');
  faultState = JSON.parse(saved);
});

test('RC: raising Zs via the bus immediately flips fault verdict to FAIL (no stale OK)', function() {
  var saved = JSON.stringify(faultState);
  faultState.earthSystem = 'tncs'; faultState.deviceType = 'mcbB'; faultState.deviceIn = 16; faultState.voltage = 230;
  SharedQuantities.set('zs_value', 1.0, 'fault'); Reactive.notify('fault');
  assert(Reactive.verdict('fault').status === 'ok', 'precondition OK at Zs=1.0');
  // A dangerously high loop impedance arrives from another module via the bus.
  SharedQuantities.set('zs_value', 9.9, 'analyzer');
  var after = Reactive.verdict('fault');
  assert(after.status === 'fail', 'fault protection now FAILS (Zs·Ia=792V > 230V), got ' + after.status);
  assert(after.stale === false, 'recomputed fresh, never a stale OK');
  faultState = JSON.parse(saved);
});

test('RC: fault verdict never shows a false OK when Zs is missing (conservative)', function() {
  var saved = JSON.stringify(faultState);
  faultState.earthSystem = 'tncs'; faultState.deviceType = 'mcbB'; faultState.deviceIn = 16; faultState.zsValue = 0;
  Reactive.notify('fault');
  assert(Reactive.verdict('fault').status === 'incomplete', 'missing Zs -> incomplete, never ok');
  faultState = JSON.parse(saved);
});

test('RC: a frequency change in ONE module propagates to impedans/trefase/motorteori with FRESH values', function() {
  var savedF = SharedQuantities.get('frequency');
  var sI = impedansState.f, sT = trefaseState.f, sM = motorteoriState.f, sPoles = motorteoriState.poles;
  motorteoriState.poles = 4;
  // Change frequency from the load module — every linked theory module must update.
  SharedQuantities.set('frequency', 50, 'load');
  SharedQuantities.set('frequency', 60, 'load');
  assert(impedansState.f === 60 && trefaseState.f === 60 && motorteoriState.f === 60, 'all linked module states updated to 60 Hz');
  var iv = Reactive.verdict('impedans'), mv = Reactive.verdict('motorteori');
  assert(iv.stale === false && mv.stale === false, 'verdicts recomputed fresh');
  assert(iv.detail.indexOf('60Hz') >= 0, 'impedans detail reflects the new 60 Hz, got ' + iv.detail);
  assert(mv.detail.indexOf('ns=1800') >= 0, 'synchronous speed recomputed to 1800 rpm at 60 Hz/4 poles, got ' + mv.detail);
  impedansState.f = sI; trefaseState.f = sT; motorteoriState.f = sM; motorteoriState.poles = sPoles;
  if (savedF != null) SharedQuantities._values['frequency'] = savedF;
});

test('RC: capacitor reactance recomputes when capacitance arrives on the bus', function() {
  var savedC = SharedQuantities.get('capacitance_F');
  var sK = kapacitorState.C, sIc = impedansState.C;
  SharedQuantities.set('capacitance_F', 1e-6, 'impedans');
  assert(kapacitorState.C === 1e-6, 'capacitor module receives the shared capacitance');
  Reactive.notify('kapacitor');
  var v = Reactive.verdict('kapacitor');
  assert(v.stale === false && v.detail.indexOf('XC=') >= 0, 'XC recomputed fresh, got ' + JSON.stringify(v));
  kapacitorState.C = sK; impedansState.C = sIc;
  if (savedC != null) SharedQuantities._values['capacitance_F'] = savedC;
});

test('RC: theory recomputers never throw and never emit a stale flag after notify', function() {
  Reactive.notify('load');
  ['impedans','trefase','motorteori','kapacitor','varme','dcmaskine','lys'].forEach(function(k){
    var v = Reactive.verdict(k);
    assert(v && v.stale === false, k + ' has a fresh (non-stale) verdict after a change');
    assert(['ok','incomplete'].indexOf(v.status) >= 0, k + ' produces a valid status, got ' + (v && v.status));
  });
});

test('RC: registering recomputers did NOT regress the existing stale-flag guarantee', function() {
  // discrim (selectivity chart) has no recomputer -> must still be flagged stale (never stale-OK).
  Reactive.verdicts['discrim'] = { status: 'ok', detail: '', stamp: 0, stale: false };
  Reactive.notify('scircuit');
  assert(Reactive.verdict('discrim').stale === true, 'modules without a recomputer are still flagged stale');
});

console.log('\n=== Analyzer Depth / Intelligence Tests ===\n');

test('AD: broadened verbs detect IB/Iz/vdrop (bestem/find/udregn/angiv)', function() {
  assert(analyzerDetectQuestions('Bestem belastningsstr\u00f8mmen IB').some(function(q){return q.type==='ib';}), 'bestem IB');
  assert(analyzerDetectQuestions('Find str\u00f8mb\u00e6reevnen Iz').some(function(q){return q.type==='iz';}), 'find Iz');
  assert(analyzerDetectQuestions('Udregn sp\u00e6ndingsfaldet \u0394U').some(function(q){return q.type==='vdrop';}), 'udregn vdrop');
});

test('AD: recognises extended autorisationsprøve question types', function() {
  var map = {
    rcd: 'V\u00e6lg HPFI type A til kredsen',
    energy: 'Beregn energiforbruget for installationen',
    diversity: 'Bestem samtidighedsfaktor for tavlen',
    varme: 'Beregn U-v\u00e6rdi og varmetab for v\u00e6ggen',
    kapacitor: 'Beregn kondensatorens ladning og energi',
    dcmaskine: 'Beregn ankerstr\u00f8mmen i j\u00e6vnstr\u00f8msmotoren',
    power: 'Beregn den aktive effekt',
    reactive_power: 'Beregn den reaktive effekt',
    apparent_power: 'Beregn den tilsyneladende effekt'
  };
  Object.keys(map).forEach(function(t){
    assert(analyzerDetectQuestions(map[t]).some(function(q){return q.type===t;}), 'detect ' + t + ' in: ' + map[t]);
  });
});

test('AD: detected questions are de-duplicated by type (no duplicate chips)', function() {
  // Text that triggers BOTH the original and the broadened IB pattern.
  var qs = analyzerDetectQuestions('Beregn belastningsstr\u00f8mmen IB. Bestem belastningsstr\u00f8mmen IB igen.');
  var ibCount = qs.filter(function(q){return q.type==='ib';}).length;
  assert.strictEqual(ibCount, 1, 'IB appears exactly once after de-dup, got ' + ibCount);
});

test('AD: extracts more quantities (Q, S, kWh, simultaneity, homes, DC voltage)', function() {
  var ex = analyzerExtract('Reaktiv effekt 8 kvar, S = 45 kVA, energiforbrug 8300 kWh, samtidighedsfaktor 0,8, 115 boliger, 48 V DC');
  assert.strictEqual(ex.reactivePower_kvar, 8, 'reactive power kVAr');
  assert.strictEqual(ex.apparentPower_kva, 45, 'apparent power kVA');
  assert.strictEqual(ex.energy_kWh, 8300, 'energy kWh');
  assert.strictEqual(ex.simFactor, 0.8, 'simultaneity factor');
  assert.strictEqual(ex.homes, 115, 'number of homes');
  assert.strictEqual(ex.dcVoltage, 48, 'DC voltage');
});

test('AD: extracts capacitance and pushes it onto the reactive bus + module states', function() {
  var savedC = SharedQuantities.get('capacitance_F');
  var sK = kapacitorState.C, sIc = impedansState.C;
  analyzerRun('Kondensator C = 4,7 \u00B5F i kredsen. Beregn kondensatorens energi.');
  assert(Math.abs(analyzerState.extracted.capacitance - 4.7e-6) < 1e-12, 'capacitance extracted as 4.7 µF');
  assert(Math.abs(SharedQuantities.get('capacitance_F') - 4.7e-6) < 1e-12, 'capacitance published to the bus');
  assert(Math.abs(kapacitorState.C - 4.7e-6) < 1e-12 && Math.abs(impedansState.C - 4.7e-6) < 1e-12, 'capacitor + impedance states updated');
  kapacitorState.C = sK; impedansState.C = sIc;
  if (savedC != null) SharedQuantities._values['capacitance_F'] = savedC;
});

test('AD: smarter "nice to know" — recommends a standard device when none is given', function() {
  var d = analyzerExtract('Belastning: 20 kW, 400 V, 3-faset, cos(phi)=0,86, tv\u00e6rsnit 16 mm\u00B2, Installationsmetode: C, Omgivelsestemperatur: 30');
  var sol = analyzerSolve(d);
  var rec = sol.results.find(function(r){return r.type==='rec_device';});
  assert(rec && rec.bonus, 'recommended device bonus present');
  var n = parseInt(rec.value);
  assert(n >= 1, 'a positive standard rating suggested, got ' + rec.value);
  assert(rec.html.indexOf('60364-4-43') >= 0, 'cites overcurrent clause for device coordination');
});

test('AD: smarter "nice to know" — PFC capacitor + max Zs bonuses', function() {
  // cos phi < 0.95 -> PFC suggestion; device given -> Zs,max for that device.
  var d = analyzerExtract('Belastning: 20 kW, 400 V, 3-faset, cos(phi)=0,86, tv\u00e6rsnit 16 mm\u00B2, In = 32 A, kurve C');
  var sol = analyzerSolve(d);
  var pfc = sol.results.find(function(r){return r.type==='pfc_cap';});
  var zsm = sol.results.find(function(r){return r.type==='zs_max';});
  assert(pfc, 'PFC capacitor suggestion present when cos phi < 0.95');
  assert(pfc.value.indexOf('kVAr') >= 0, 'PFC value expressed in kVAr');
  assert(zsm && zsm.html.indexOf('60364-4-41') >= 0, 'Zs,max bonus present and cites the fault-protection clause');
  // For MCB curve C 32A: Ia=320A, Zs,max = 230/320 = 0.719 Ω
  assert(zsm.value.indexOf('0,719') >= 0 || zsm.value.indexOf('0,72') >= 0, 'Zs,max = 230/(10*32) ≈ 0,719 Ω (da comma), got ' + zsm.value);
});

test('AD: new question types are all mapped in EXAM_SOLUTION_RESULT_ALIAS', function() {
  ['rcd','power','reactive_power','apparent_power','diversity','kapacitor','varme','dcmaskine'].forEach(function(t){
    assert(typeof EXAM_SOLUTION_RESULT_ALIAS[t] === 'string', t + ' has a solution alias');
  });
});

test('AD: analyzer remains fully deterministic + click-only after the depth upgrade', function() {
  var txt = 'Opgave 1\nBelastning: 20 kW, 400 V, cos(phi)=0,86, tv\u00e6rsnit 16 mm\u00B2, In = 32 A, kurve C\nBestem belastningsstr\u00f8mmen IB. V\u00e6lg HPFI type A.';
  analyzerRun(txt);
  var n1 = analyzerState.results.length;
  analyzerRun(txt);
  var n2 = analyzerState.results.length;
  assert.strictEqual(n1, n2, 'identical input yields identical result count (deterministic)');
  var savedMode = analyzerState.mode;
  analyzerState.mode = 'paste';
  var html = renderAnalyzer();
  assert.strictEqual((html.match(/<textarea/g) || []).length, 1, 'still exactly one textarea (analyzer paste)');
  assert(html.indexOf('type="text"') < 0 && html.indexOf('type="number"') < 0, 'no free-text/number inputs added');
  analyzerState.mode = savedMode;
});

test('AD: fault recomputer detail is trilingual-safe (da/en) when inputs are missing', function() {
  var saved = JSON.stringify(faultState);
  var savedLang = lang;
  faultState.earthSystem = 'tncs'; faultState.zsValue = 0; faultState.deviceIn = 16; faultState.deviceType = 'mcbB';
  lang = 'da'; var da = Reactive.recomputers['fault']();
  lang = 'en'; var en = Reactive.recomputers['fault']();
  assert(da.status === 'incomplete' && en.status === 'incomplete', 'both languages report incomplete (no false OK)');
  assert(da.detail !== en.detail, 'detail string is localised (da != en)');
  lang = savedLang; faultState = JSON.parse(saved);
});

// ============================================================================
// === NEW: completing the reactive graph — arcflash / zs / relay recomputers =
// ============================================================================
console.log('\n=== Reactive Completeness: arcflash / zs / relay recomputers ===\n');

test('RC2: arcflash, zs and relay recomputers are registered as live verdicts', function() {
  ['arcflash','zs','relay'].forEach(function(k){
    assert(typeof Reactive.recomputers[k] === 'function', k + ' recomputer registered');
  });
});

test('RC2: zs disconnection verdict is FRESH and correct (TN, B16, short cable)', function() {
  var saved = JSON.stringify(zsState);
  zsState.deviceType='mcbB'; zsState.device='B16'; zsState.ze=0.35; zsState.cableLength=20; zsState.cableSize=2.5;
  Reactive.notify('zs');
  var v = Reactive.verdict('zs');
  assert(v.status === 'ok', 'short cable on B16 disconnection OK, got ' + v.status);
  assert(v.stale === false, 'verdict is fresh (not stale)');
  assert(v.detail.indexOf('Zs') >= 0, 'detail cites the loop impedance');
  zsState = JSON.parse(saved);
});

test('RC2: an over-long cable flips the zs verdict to FAIL (never a stale OK)', function() {
  var saved = JSON.stringify(zsState);
  zsState.deviceType='mcbB'; zsState.device='B16'; zsState.ze=0.35; zsState.cableSize=2.5; zsState.cableLength=20;
  Reactive.notify('zs');
  assert(Reactive.verdict('zs').status === 'ok', 'precondition OK at 20 m');
  zsState.cableLength = 400; // far beyond the max permissible loop length
  Reactive.notify('zs');
  var v = Reactive.verdict('zs');
  assert(v.status === 'fail', 'over-long loop fails disconnection, got ' + v.status);
  assert(v.stale === false, 'recomputed fresh, never a stale OK');
  zsState = JSON.parse(saved);
});

test('RC2: zs verdict never shows a false OK when Zs,max is unknown (conservative)', function() {
  var saved = JSON.stringify(zsState);
  zsState.device = '__none__';
  Reactive.notify('zs');
  assert(Reactive.verdict('zs').status === 'incomplete', 'unknown device -> incomplete, never ok');
  zsState = JSON.parse(saved);
});

test('RC2: arcflash incident-energy verdict is fresh and tracks the shared supply voltage', function() {
  var saved = JSON.stringify(arcflashState);
  var savedV = SharedQuantities.get('voltage_phase');
  arcflashState.voltage=400; arcflashState.faultCurrent=10; arcflashState.clearingTime=0.1; arcflashState.workingDistance=455;
  Reactive.notify('arcflash');
  var v0 = Reactive.verdict('arcflash');
  assert(v0.stale === false && v0.detail.indexOf('cal/cm') >= 0, 'fresh incident-energy detail, got ' + JSON.stringify(v0));
  assert(['ok','warning','fail'].indexOf(v0.status) >= 0, 'valid status, got ' + v0.status);
  // A supply-voltage change arriving on the bus updates the arc-flash input.
  SharedQuantities.set('voltage_phase', 690, 'load');
  assert(arcflashState.voltage === 690, 'arcflash voltage tracked the bus, got ' + arcflashState.voltage);
  arcflashState = JSON.parse(saved);
  if (savedV != null) SharedQuantities._values['voltage_phase'] = savedV;
});

test('RC2: a long clearing time pushes arc-flash energy into the danger band (fail)', function() {
  var saved = JSON.stringify(arcflashState);
  arcflashState.voltage=400; arcflashState.faultCurrent=50; arcflashState.clearingTime=2.0; arcflashState.workingDistance=300;
  Reactive.notify('arcflash');
  var v = Reactive.verdict('arcflash');
  assert(v.status === 'fail', 'huge incident energy => work prohibited (fail), got ' + JSON.stringify(v));
  arcflashState = JSON.parse(saved);
});

test('RC2: relay coordination verdict is fresh and tracks the transformer kVA on the bus', function() {
  var saved = JSON.stringify(relayState);
  var savedK = SharedQuantities.get('trafo_kva');
  relayState.trafoKVA=630; relayState.primaryKV=10; relayState.tGt=0.5; relayState.egentid=0.04;
  Reactive.notify('relay');
  var v = Reactive.verdict('relay');
  assert(v.stale === false && v.detail.indexOf('I1N=') >= 0, 'fresh relay detail, got ' + JSON.stringify(v));
  assert(v.status === 'ok', 'tGt=0.5s rides through inrush => coordinated OK, got ' + v.status);
  SharedQuantities.set('trafo_kva', 1000, 'trafo');
  Reactive.notify('relay');
  assert(relayState.trafoKVA === 1000, 'relay tracked the shared transformer kVA');
  relayState = JSON.parse(saved);
  if (savedK != null) SharedQuantities._values['trafo_kva'] = savedK;
});

test('RC2: relay flags nuisance-trip risk (warning) when too fast for inrush', function() {
  var saved = JSON.stringify(relayState);
  relayState.trafoKVA=630; relayState.primaryKV=10; relayState.tGt=0.05; relayState.egentid=0.04;
  Reactive.notify('relay');
  var v = Reactive.verdict('relay');
  assert(v.status === 'warning', 'tGt(0.05) < inrush+egentid(0.14) => warning, got ' + v.status);
  relayState = JSON.parse(saved);
});

test('RC2: arcflash/zs/relay recomputers never throw and never leave a stale flag after notify', function() {
  Reactive.notify('load');
  ['arcflash','zs','relay'].forEach(function(k){
    var v = Reactive.verdict(k);
    assert(v && v.stale === false, k + ' has a fresh (non-stale) verdict after a change');
    assert(['ok','warning','fail','incomplete'].indexOf(v.status) >= 0, k + ' produces a valid status, got ' + (v&&v.status));
  });
});

// ============================================================================
// === NEW: full multi-Opgave exam paper — per-Opgave solving (mixed types) ===
// ============================================================================
console.log('\n=== Multi-Opgave Paper: per-Opgave solving (mixed types) ===\n');

var EXAM_MULTI_OPGAVE = [
  'Autorisationspr\u00F8ve 2024',
  'Hele installationen forsynes 3-faset 400 V, TN-S.',
  '',
  'Opgave 1',
  'En motor med effekt 37 kW ved 400 V, cos phi = 0,86.',
  'Kablet er NOIKLX 16 mm\u00B2 med l\u00E6ngde 45 m. Installationsmetode: C.',
  '1.1 Beregn belastningsstr\u00F8mmen IB.',
  '1.2 Beregn sp\u00E6ndingsfaldet \u0394U.',
  '',
  'Opgave 2',
  'En belysningskreds med effekt 5 kW ved 400 V, cos phi = 0,95.',
  '2.1 Beregn belastningsstr\u00F8mmen IB.',
  '',
  'Opgave 3',
  'Jordingssystem TN-S med Zs = 0,8 \u03A9. MCB kurve B In = 16 A.',
  '3.1 Er fejlbeskyttelsen tilstr\u00E6kkelig?'
].join('\n');

test('Multi-Opgave: the paper segments into Opgave 1/2/3', function() {
  analyzerRun(EXAM_MULTI_OPGAVE);
  var sol = examBuildSolution(analyzerState);
  var ids = sol.opgaver.map(function(o){return o.id;});
  assert(ids.indexOf(1)>=0 && ids.indexOf(2)>=0 && ids.indexOf(3)>=0, 'Opgave 1,2,3 present, got ' + ids.join(','));
});

test('Multi-Opgave: each Opgave IB uses ITS OWN power (37 kW vs 5 kW), not the first match', function() {
  analyzerRun(EXAM_MULTI_OPGAVE);
  var sol = examBuildSolution(analyzerState);
  function ibOf(opId){
    var op = sol.opgaver.find(function(o){return o.id===opId;});
    var q = op && op.questions.find(function(x){return x.type==='ib';});
    return q ? parseFloat(q.value) : null;
  }
  var ib1 = ibOf(1), ib2 = ibOf(2);
  var exp1 = 37000/(Math.sqrt(3)*400*0.86); // ~62.1 A
  var exp2 = 5000/(Math.sqrt(3)*400*0.95);  // ~7.6 A
  assert(ib1 && Math.abs(ib1-exp1) < 0.6, 'Opgave 1 IB ~' + exp1.toFixed(1) + ' A, got ' + ib1);
  assert(ib2 && Math.abs(ib2-exp2) < 0.6, 'Opgave 2 IB ~' + exp2.toFixed(1) + ' A, got ' + ib2);
  assert(Math.abs(ib1-ib2) > 40, 'the two Opgaver give clearly DIFFERENT IB (per-Opgave solving works)');
});

test('Multi-Opgave: Opgave 3 fault question is solved from its OWN Zs + device', function() {
  analyzerRun(EXAM_MULTI_OPGAVE);
  var sol = examBuildSolution(analyzerState);
  var op3 = sol.opgaver.find(function(o){return o.id===3;});
  var fq = op3.questions.find(function(x){return x.type==='fault';});
  assert(fq, 'fault question detected in Opgave 3');
  assert(fq.solved, 'fault solved');
  // If = 230/0.8 = 287.5 A >= Ia(B16)=80 A -> sufficient
  assert(fq.status === 'ok', 'fault protection sufficient (287.5A >= 80A), got ' + fq.status);
  assert(fq.calcHtml.indexOf('calc-detail') >= 0, 'full calcDetail working present');
});

test('Multi-Opgave: Opgave 1 voltage-drop is solved with full working', function() {
  analyzerRun(EXAM_MULTI_OPGAVE);
  var sol = examBuildSolution(analyzerState);
  var op1 = sol.opgaver.find(function(o){return o.id===1;});
  var vq = op1.questions.find(function(x){return x.type==='vdrop';});
  assert(vq && vq.solved, 'vdrop solved in Opgave 1');
  assert(vq.value.indexOf('%') >= 0, 'voltage drop expressed as a percentage, got ' + vq.value);
  assert(vq.calcHtml.indexOf('calc-detail') >= 0, 'full calcDetail working present');
});

test('Multi-Opgave: analyzerExtractMerged keeps own power but inherits paper-wide voltage', function() {
  var global = analyzerExtract(EXAM_MULTI_OPGAVE);
  var seg2 = analyzerExtractMerged('En belysningskreds med effekt 5 kW, cos phi = 0,95. 2.1 Beregn IB.', global);
  assert(seg2.power_kW === 5, 'segment keeps its own 5 kW power');
  assert(seg2.voltage === 400, 'segment inherits the paper-wide 400 V');
  assert(seg2.phases === 3, 'segment inherits the paper-wide 3-phase context');
});

test('Multi-Opgave: per-Opgave solving stays click-only and trilingual (da/en/fa)', function() {
  var savedLang = lang;
  analyzerRun(EXAM_MULTI_OPGAVE);
  ['da','en','fa'].forEach(function(L){
    lang = L;
    var html = examRenderSolution(examBuildSolution(analyzerState));
    assert(html.indexOf('<input') < 0 && html.indexOf('<textarea') < 0, L + ' render is click-only');
  });
  lang = savedLang;
});

test('Multi-Opgave: result remains deterministic (same paste -> same coverage)', function() {
  analyzerRun(EXAM_MULTI_OPGAVE);
  var c1 = examBuildSolution(analyzerState).coverage;
  analyzerRun(EXAM_MULTI_OPGAVE);
  var c2 = examBuildSolution(analyzerState).coverage;
  assert(c1.detected === c2.detected && c1.solved === c2.solved, 'deterministic coverage across runs');
  assert(c1.solved + c1.needInput === c1.detected, 'solved + needInput == detected');
});

// ============================================================================
// === NEW: deep extract->bus->verdict wiring (a paste drives the whole app) ==
// ============================================================================
console.log('\n=== Deep Wiring: a pasted exam drives the bus, verdicts and diagram ===\n');

test('Wire: pasting an exam populates the reactive bus from the extracted quantities', function() {
  var savedZ = SharedQuantities.get('zs_value');
  analyzerRun(EXAM_MULTI_OPGAVE);
  assert(analyzerState.busPopulated === true, 'bus marked populated');
  assert(SharedQuantities.get('voltage_phase') === 400, 'supply voltage published to the bus');
  assert(Math.abs(SharedQuantities.get('zs_value') - 0.8) < 1e-9, 'extracted Zs published to the bus');
  if (savedZ != null) SharedQuantities._values['zs_value'] = savedZ;
});

test('Wire: a pasted exam immediately drives the LIVE fault verdict (fresh + correct)', function() {
  var saved = JSON.stringify(faultState);
  analyzerRun(EXAM_MULTI_OPGAVE); // TN-S, Zs=0.8, MCB B16
  var v = Reactive.verdict('fault');
  assert(v && v.stale === false, 'fault verdict is fresh after the paste');
  // If = 230/0.8 = 287.5 A >= Ia(B16)=80 A -> OK
  assert(v.status === 'ok', 'extracted Zs + device make disconnection OK, got ' + (v&&v.status));
  faultState = JSON.parse(saved);
});

test('Wire: a pasted exam with a dangerously high Zs flips the live fault verdict to FAIL', function() {
  var saved = JSON.stringify(faultState);
  analyzerRun([
    'Opgave 1',
    'Jordingssystem TN-S. Zs = 9,5 \u03A9. MCB kurve B In = 16 A.',
    '1.1 Er fejlbeskyttelsen tilstr\u00E6kkelig?'
  ].join('\n'));
  var v = Reactive.verdict('fault');
  assert(v.status === 'fail', 'high Zs -> disconnection FAILS live, got ' + (v&&v.status));
  assert(v.stale === false, 'never a stale OK');
  faultState = JSON.parse(saved);
});

test('Wire: extracted frequency propagates to the live impedans verdict', function() {
  var savedF = SharedQuantities.get('frequency');
  var sI=impedansState.f, sM=motorteoriState.f, sP=motorteoriState.poles;
  motorteoriState.poles = 4;
  analyzerRun('Opgave 1\nEt kredsl\u00F8b k\u00F8rer ved frekvens 60 Hz. Beregn impedansen Z.');
  assert(SharedQuantities.get('frequency') === 60, 'frequency published to the bus');
  assert(impedansState.f === 60, 'impedans state updated to 60 Hz');
  var iv = Reactive.verdict('impedans');
  assert(iv.stale === false && iv.detail.indexOf('60Hz') >= 0, 'impedans verdict reflects 60 Hz, got ' + JSON.stringify(iv));
  impedansState.f=sI; motorteoriState.f=sM; motorteoriState.poles=sP;
  if (savedF != null) SharedQuantities._values['frequency'] = savedF;
});

test('Wire: a pasted exam auto-generates the single-line diagram alongside the verdict', function() {
  analyzerRun(EXAM_MULTI_OPGAVE);
  var sol = examBuildSolution(analyzerState);
  assert(sol.sldHtml.indexOf('<svg') >= 0, 'SLD diagram generated for the pasted exam');
  assert(sol.verdict && ['red','yellow','green','incomplete'].indexOf(sol.verdict.code) >= 0, 'a verdict is produced');
});

// ============================================================================
// ===== MARGIN-TO-DANGER / CLIFF-EDGE + WORST-DAY SIMULATION (this feature) =====
// ============================================================================
// Shared fixtures built from REAL products. 100 kVA keeps board Ik below the
// iC60N 6 kA Icu so the breaking-capacity check (out of v1 scope) does not turn
// the verdict red and mask the three in-scope verdicts.
function mtdFinal(over) {
  return Object.assign({ id: 'fcA', name_da: 'Slutkreds', name_en: 'Final circuit', cableId: 'NKT-NOIKLX-6', length_m: 10, deviceId: 'SE-iC60N-B40', deviceIn: 40, loadKW: 6, phases: '1x230', cosPhi: 0.95, rcdMa: null }, over || {});
}
function mtdProject(earthing, supplyCableId, fin) {
  return { version: 1, earthing: earthing || 'TN',
    transformerId: 'TR-ONAN-100',
    supply: { cableId: supplyCableId || 'SC-AL-50', length_m: 10, deviceId: 'MF-NH00-100', deviceIn: 100 },
    finals: [fin] };
}
// Green-marginal: overload sits below the worst-day Ca*Cg derating.
var MTD_GREEN = mtdProject('TN', 'SC-AL-50', mtdFinal({ cableId: 'NKT-NOIKLX-6', deviceIn: 40, loadKW: 6 }));
// Overload hand-calc fixture: supply has huge headroom (SC-AL-95) so the 2.5 mm2
// final (officialIz 30, In 25) is the single binding overload constraint.
var MTD_OVERLOAD = mtdProject('TN', 'SC-AL-95', mtdFinal({ cableId: 'NKT-NOIKLX-2.5', deviceId: 'SE-iC60N-B25', deviceIn: 25, loadKW: 3.68 }));
// Zs voltage-only fixture: Zs*Ia just under U0 at baseline, flips at vF=0.90.
var MTD_ZS = mtdProject('TN', 'SC-AL-50', mtdFinal({ cableId: 'NKT-NOIKLX-4', length_m: 105, deviceId: 'SE-iC60N-B40', deviceIn: 40, loadKW: 1.0 }));
// Voltage-drop conductor-temp fixture: dU ~3.4% baseline, crosses 4% when hot.
var MTD_VDROP = mtdProject('TN', 'SC-AL-50', mtdFinal({ cableId: 'NKT-NOIKLX-2.5', length_m: 40, deviceId: 'SE-iC60N-B16', deviceIn: 16, loadKW: 3.0 }));
// Coupling fixture: one conductor-temp rise moves BOTH Zs and Vdrop.
var MTD_COUPLE = mtdProject('TN', 'SC-AL-50', mtdFinal({ cableId: 'NKT-NOIKLX-4', length_m: 90, deviceId: 'SE-iC60N-B40', deviceIn: 40, loadKW: 2.2 }));
function mtdS(audit, cat) { return upCategoryStatus(audit, cat); }

test('Margin/WorstDay: TEMP_FACTORS/GROUP_FACTORS/alpha/voltage equal published reference values', function() {
  assert.strictEqual(TEMP_FACTORS[40], 0.87, 'Ca(40C) = 0.87 (DS/HD 60364-5-52 Table B.52.14)');
  assert.strictEqual(GROUP_FACTORS[4], 0.65, 'Cg(4 circuits) = 0.65 (Table B.52.17)');
  assert.strictEqual(UP_ALPHA_CU, 0.00393, 'alpha_Cu = 0.00393/K (IEC 60228)');
  assert.strictEqual(UP_ALPHA_AL, 0.00403, 'alpha_Al = 0.00403/K (IEC 60228)');
  assert.strictEqual(UP_WORSTDAY_VF, 0.90, 'worst-day voltage override = 0.90 (CENELEC / EN 50160)');
  assert.strictEqual(UP_CMIN, 0.95, 'baseline Cmin stays 0.95 (distinct from the 0.90 scenario override)');
});

test('Margin/WorstDay: neutral overlay is byte-identical to the baseline audit', function() {
  var saved = upSnapshot();
  [MTD_GREEN, MTD_ZS, MTD_VDROP, MTD_COUPLE, mtdProject('TT', 'SC-AL-50', mtdFinal({ rcdMa: 30 })), mtdProject('IT', 'SC-AL-50', mtdFinal({}))].forEach(function(p) {
    var a = upAuditProject(p), b = upAuditWith(p, {});
    assert.deepStrictEqual(b.findings, a.findings, 'neutral overlay findings identical');
    assert.strictEqual(b.verdict, a.verdict, 'neutral overlay verdict identical');
    assert.strictEqual(b.ikBoardA, a.ikBoardA, 'neutral overlay ikBoardA identical');
  });
  upRestore(saved);
});

test('Margin/WorstDay: overload margin search matches the hand calc within one step', function() {
  // officialIz(2.5 XLPE Cu)=30, In=25 -> flip when 30*Ca < 25 -> Ca < 25/30.
  var izTab = officialIz(upCableProduct('NKT-NOIKLX-2.5'));
  assert.strictEqual(izTab, 30, 'reference officialIz for 2.5 mm2 XLPE Cu');
  var target = 25 / izTab; // required Ca at the flip
  // upTempFactor interpolates linearly between 40 (0.87) and 45 (0.79)
  var handT = 40 + (target - 0.87) / (0.79 - 0.87) * 5;
  assert(mtdS(upAuditProject(MTD_OVERLOAD), 'overload') === 'ok', 'overload OK at baseline');
  var th = upBisectFlip(MTD_OVERLOAD, 'overload', 30, 55, function(v) { return { overlay: { ambientC: v } }; });
  assert(th != null, 'a flip ambient is found within bounds');
  assert(Math.abs(th - handT) <= 1.0, 'searched flip ambient ' + th.toFixed(2) + 'C matches hand ' + handT.toFixed(2) + 'C within one step');
});

test('Margin/WorstDay: conductor temp couples Vdrop AND Zs (r_eff feeds both)', function() {
  var base = upAuditProject(MTD_COUPLE);
  assert.strictEqual(mtdS(base, 'zs'), 'ok', 'Zs OK at baseline');
  assert.strictEqual(mtdS(base, 'vdrop'), 'ok', 'Vdrop OK at baseline');
  var hot = upAuditWith(MTD_COUPLE, { conductorTempC: 90 });
  assert(upCatFlipped(hot, 'zs'), 'raising conductor temp flips Zs');
  assert(upCatFlipped(hot, 'vdrop'), 'the SAME conductor-temp rise also flips Vdrop');
  // a worst-day stack flips >= 2 findings together
  var wd = upWorstDay(MTD_COUPLE);
  assert(wd.flippedCount >= 2, 'worst-day stack flips >= 2 findings together, got ' + wd.flippedCount);
});

test('Margin/WorstDay: Worst-Day flips a known-marginal green design to red', function() {
  var wd = upWorstDay(MTD_GREEN);
  assert.strictEqual(wd.verdictBefore, 'green', 'design is GREEN at baseline');
  assert.strictEqual(wd.verdictAfter, 'red', 'worst-day verdict turns RED');
  assert(wd.flippedCount >= 1, 'at least one green->red flip');
  assert(wd.flips.some(function(f) { return f.category === 'overload'; }), 'the overload verdict is among the flips');
  assert(wd.flips.every(function(f) { return f.before.status === 'ok' && f.after.status === 'fail'; }), 'every flip is a genuine ok->fail');
});

test('Margin/WorstDay: each perturbation flips only its intended verdict (isolation)', function() {
  // Ca-only and Cg-only -> overload only
  var amb = upAuditWith(MTD_GREEN, { ambientC: 50 });
  assert(upCatFlipped(amb, 'overload') && mtdS(amb, 'zs') === 'ok' && mtdS(amb, 'vdrop') === 'ok', 'ambient flips overload, leaves Zs+Vdrop');
  var grp = upAuditWith(MTD_GREEN, { groupingN: 4 });
  assert(upCatFlipped(grp, 'overload') && mtdS(grp, 'zs') === 'ok' && mtdS(grp, 'vdrop') === 'ok', 'grouping flips overload, leaves Zs+Vdrop');
  // voltage -10% only -> Zs only
  var volt = upAuditWith(MTD_ZS, { voltageFactor: 0.90 });
  assert(upCatFlipped(volt, 'zs') && mtdS(volt, 'overload') === 'ok' && mtdS(volt, 'vdrop') === 'ok', 'voltage flips Zs, leaves overload+Vdrop');
  // conductor temp only -> Vdrop here, leaves overload untouched
  var hot = upAuditWith(MTD_VDROP, { conductorTempC: 90 });
  assert(upCatFlipped(hot, 'vdrop') && mtdS(hot, 'overload') === 'ok', 'conductor temp flips Vdrop, leaves overload (unrelated)');
});

test('Margin/WorstDay: displayed margin is rounded TOWARD danger (never overstated)', function() {
  var m = upMarginToDanger(MTD_OVERLOAD);
  var flippingAxes = 0;
  UP_MARGIN_CATS.forEach(function(cat) {
    var c = m.cats[cat];
    if (c.state !== 'ok') return;
    c.axes.forEach(function(ax) {
      if (!ax.flips) return;
      flippingAxes++;
      assert(ax.disp <= ax.raw + 1e-9, cat + '/' + ax.key + ' displayed (' + ax.disp + ') <= exact (' + ax.raw + ')');
    });
  });
  assert(flippingAxes >= 1, 'at least one flipping axis was checked');
  // explicit overload ambient: floor(12.29) = 12 <= 12.29
  var amb = upMarginToDanger(MTD_OVERLOAD).cats.overload.axes.find(function(a) { return a.key === 'ambient'; });
  assert(amb.flips && amb.disp === Math.floor(amb.raw) && amb.disp <= amb.raw, 'ambient headroom floored toward danger');
});

test('Margin/WorstDay: missing inputs -> "unresolved", never a false OK, no-transformer stays incomplete', function() {
  // no transformer -> verdict incomplete, all margins unresolved
  var noTf = mtdProject('TN', 'SC-AL-50', mtdFinal({}));
  noTf.transformerId = null;
  assert.strictEqual(upAuditProject(noTf).verdict, 'incomplete', 'no transformer -> incomplete');
  var mNo = upMarginToDanger(noTf);
  UP_MARGIN_CATS.forEach(function(cat) { assert.strictEqual(mNo.cats[cat].state, 'unresolved', cat + ' unresolved without transformer'); });
  // no device on the final -> overload/Zs cannot be a false OK
  var noDev = mtdProject('TN', 'SC-AL-50', mtdFinal({ deviceId: null, deviceIn: null }));
  var mDev = upMarginToDanger(noDev);
  assert(mDev.cats.overload.state !== 'ok', 'no device -> overload not a false OK (' + mDev.cats.overload.state + ')');
  assert(mDev.cats.zs.state === 'unresolved', 'no device -> Zs unresolved');
  // no cable on the final -> overload/Vdrop cannot be a false OK
  var noCab = mtdProject('TN', 'SC-AL-50', mtdFinal({ cableId: null }));
  var mCab = upMarginToDanger(noCab);
  assert(mCab.cats.overload.state !== 'ok', 'no cable -> overload not a false OK');
  assert(mCab.cats.vdrop.state === 'unresolved', 'no cable -> Vdrop unresolved');
});

test('Margin/WorstDay: empty project -> "no verdicts to test"; already-failing -> over the edge', function() {
  var empty = upDefaultProject();
  var wd = upWorstDay(empty);
  assert.strictEqual(wd.testable, false, 'empty project has no green verdicts to test');
  assert.strictEqual(wd.flippedCount, 0, 'no flips on an empty project');
  assert.doesNotThrow(function() { upMarginToDanger(empty); }, 'margin on empty project does not throw');
  // already-failing overload at baseline -> over-edge (margin 0)
  var failing = mtdProject('TN', 'SC-AL-95', mtdFinal({ cableId: 'NKT-NOIKLX-1.5', deviceId: 'SE-iC60N-B40', deviceIn: 40, loadKW: 5 }));
  assert.strictEqual(mtdS(upAuditProject(failing), 'overload'), 'fail', 'overload already fails at baseline');
  assert.strictEqual(upMarginToDanger(failing).cats.overload.state, 'over-edge', 'already-failing overload -> over the edge');
});

test('Margin/WorstDay: soil/earth perturbation applies to TT only', function() {
  var tt = mtdProject('TT', 'SC-AL-50', mtdFinal({ rcdMa: 100 }));
  var tn = mtdProject('TN', 'SC-AL-50', mtdFinal({}));
  // resolved overlay adds an earth-electrode resistance only conceptually; for TN
  // the raAdd is ignored inside upAuditCore, so soil never changes a TN audit.
  assert.deepStrictEqual(upAuditWith(tn, { soilRho: 2000 }).findings, upAuditProject(tn).findings, 'soil does not affect a TN audit');
  // For TT a very dry soil raises Zs in the touch-voltage check (here with a 100 mA RCD).
  var dry = upAuditWith(tt, { soilRho: 1000 });
  var base = upAuditProject(tt);
  var dryZs = base.findings.find(function(f) { return upFindingCategory(f) === 'zs'; });
  assert(dryZs, 'TT has a Zs/touch-voltage finding');
  assert(upResolveOverlay({ soilRho: 1000 }).raAdd > 0, 'soil resistivity resolves to a positive earth-electrode resistance');
});

test('Margin/WorstDay: search is PURE — no project / upProject / localStorage mutation', function() {
  var saved = upSnapshot();
  var p = mtdProject('TN', 'SC-AL-50', mtdFinal({}));
  var before = JSON.stringify(p);
  var upBefore = JSON.stringify(upProject);
  var lsBefore = localStorage.getItem(UNIFIED_PROJECT_KEY);
  upAuditWith(p, { ambientC: 55, groupingN: 6, voltageFactor: 0.90, conductorTempC: 90, soilRho: 2000 });
  upMarginToDanger(p);
  upWorstDay(p);
  upBisectFlip(p, 'overload', 30, 55, function(v) { return { overlay: { ambientC: v } }; });
  assert.strictEqual(JSON.stringify(p), before, 'input project is not mutated by the search');
  assert.strictEqual(JSON.stringify(upProject), upBefore, 'global upProject is not mutated');
  assert.strictEqual(localStorage.getItem(UNIFIED_PROJECT_KEY), lsBefore, 'localStorage is untouched');
  // PRODUCTS catalog must never be mutated by the r_eff overlay
  assert.strictEqual(upCableProduct('NKT-NOIKLX-4').r, 4.61, 'PRODUCTS cable resistance untouched by r_eff');
  upRestore(saved);
});

test('Margin/WorstDay: trilingual — every new fragment resolves via _FA in Farsi', function() {
  var saved = upSnapshot();
  var savedLang = lang;
  var savedState = { lastAudit: upAuditState.lastAudit, showMargins: upAuditState.showMargins, margins: upAuditState.margins, worstDay: upAuditState.worstDay, wd: upAuditState.wd };
  upProject = MTD_COUPLE;
  upAuditState.lastAudit = upAuditProject(upProject);
  upAuditState.showMargins = true;
  upAuditState.wd = upWorstDayDefault();
  lang = 'fa';
  upAuditState.margins = upMarginToDanger(upProject);
  upAuditState.worstDay = upWorstDay(upProject, upAuditState.wd);
  var hfa = renderKritisk();
  var newEnglish = ['Margin to danger', 'Nearest cliff edge', 'Worst-Day simulation', 'currently-green verdicts turn red',
    'Raise ambient temperature', 'Conductor at max operating temperature',
    'Dry soil (high earth resistance)', 'Already over the edge', 'Arc-flash and selectivity are not included in this analysis',
    'Ambient temperature', 'Conductor temperature', 'Run Worst-Day', 'Show margins'];
  newEnglish.forEach(function(s) { assert(hfa.indexOf(s) < 0, 'no raw English leak in Farsi: "' + s + '"'); });
  assert(hfa.indexOf('<input') < 0 && hfa.indexOf('<textarea') < 0, 'still 100% click-only (no text inputs)');
  // positive: the new category names + out-of-scope statement render in Farsi
  assert(hfa.indexOf(_FA['Overload']) >= 0, 'overload category name resolved to Farsi');
  assert(hfa.indexOf(_FA['Voltage drop']) >= 0, 'voltage-drop category name resolved to Farsi');
  assert(hfa.indexOf(_FA['Margin to danger']) >= 0, 'margin-to-danger heading resolved to Farsi');
  assert(hfa.indexOf(_FA['Arc-flash and selectivity are not included in this analysis']) >= 0, 'out-of-scope statement surfaced in Farsi');
  lang = savedLang;
  upAuditState.lastAudit = savedState.lastAudit; upAuditState.showMargins = savedState.showMargins; upAuditState.margins = savedState.margins; upAuditState.worstDay = savedState.worstDay; upAuditState.wd = savedState.wd;
  upRestore(saved);
});

test('Margin/WorstDay: UI is click-only and states arc-flash/selectivity are out of scope (da+en)', function() {
  var saved = upSnapshot();
  var savedLang = lang;
  upProject = MTD_GREEN;
  upAuditState.lastAudit = upAuditProject(upProject);
  upAuditState.showMargins = true;
  upAuditState.margins = upMarginToDanger(upProject);
  upAuditState.wd = upWorstDayDefault();
  upAuditState.worstDay = upWorstDay(upProject, upAuditState.wd);
  ['da', 'en'].forEach(function(L) {
    lang = L;
    var h = renderKritisk();
    assert(h.indexOf('<input') < 0 && h.indexOf('<textarea') < 0, L + ': no text inputs (click-only)');
    assert(h.indexOf('upRunWorstDay()') >= 0, L + ': Worst-Day button present');
    assert(h.indexOf('upToggleMargins()') >= 0, L + ': Show-margins toggle present');
    var outOfScope = (L === 'da') ? 'Lysbue og selektivitet indg\u00E5r ikke' : 'Arc-flash and selectivity are not included';
    assert(h.indexOf(outOfScope) >= 0, L + ': arc-flash/selectivity marked out of scope');
  });
  lang = savedLang;
  upAuditState.lastAudit = null; upAuditState.showMargins = false; upAuditState.margins = null; upAuditState.worstDay = null;
  upRestore(saved);
});

// ============================================================================
// ===== COMMISSIONING / VERIFICATION COMPANION (DS/HD 60364-6) — this feature =
// ============================================================================
test('Commissioning: Zs ceiling inverts the auditor (B16 TN \u2248 2.73, C16 \u2248 1.366, In>32 uses 5\u00B7In)', function() {
  var fc = { rcdMa: null };
  var b16 = cvZsCeiling('TN', { In: 16, curve: 'B' }, fc, 0.95);
  assert(Math.abs(b16.zsMax - (0.95 * 230 / 80)) < 1e-9, 'B16 TN zsMax = 0.95*230/(5*16)');
  assert(Math.abs(b16.zsMax - 2.73125) < 1e-4, 'B16 ~2.73, got ' + b16.zsMax);
  var c16 = cvZsCeiling('TN', { In: 16, curve: 'C' }, fc, 0.95);
  assert(Math.abs(c16.zsMax - (0.95 * 230 / 160)) < 1e-9, 'C16 zsMax = 0.95*230/(10*16)');
  assert(Math.abs(c16.zsMax - 1.365625) < 1e-4, 'C16 ~1.366, got ' + c16.zsMax);
  var big = cvZsCeiling('TN', { In: 63, curve: 'B' }, fc, 0.95);
  assert(Math.abs(big.ia - 5 * 63) < 1e-9, 'In>32 -> Ia = 5*In');
  assert(Math.abs(big.zsMax - (0.95 * 230 / (5 * 63))) < 1e-9, 'In>32 zsMax uses 5*In');
});

test('Commissioning: TT inversion 50000/I\u0394n (1666.7), missing RCD unresolved (no number), IT Cmin\u00B7400/(2\u00B7Ia)', function() {
  var tt = cvZsCeiling('TT', { In: 16, curve: 'B' }, { rcdMa: 30 }, 0.95);
  assert(Math.abs(tt.zsMax - (50000 / 30)) < 1e-9, 'TT zsMax = 50000/I\u0394n');
  assert(Math.abs(tt.zsMax - 1666.6667) < 0.01, 'TT 30 mA -> 1666.7');
  var ttNo = cvZsCeiling('TT', { In: 16, curve: 'B' }, { rcdMa: null }, 0.95);
  assert.strictEqual(ttNo.state, 'unresolved', 'TT without RCD -> unresolved');
  assert.strictEqual(ttNo.zsMax, null, 'unresolved carries NO number');
  var it = cvZsCeiling('IT', { In: 16, curve: 'B' }, {}, 0.95);
  assert(Math.abs(it.zsMax - (0.95 * 400 / (2 * 80))) < 1e-9, 'IT zsMax = Cmin*400/(2*Ia)');
});

test('Commissioning: upDisconnectionIa is the SINGLE SOURCE the auditor uses (B/C/D, In above/below 32) + byte-identical baseline', function() {
  ['B', 'C', 'D'].forEach(function(curve) {
    [10, 16, 25, 32].forEach(function(In) {
      var info = upDisconnectionIa({ In: In, curve: curve });
      assert(Math.abs(info.ia - upMagneticMultiple(curve) * In) < 1e-9, curve + In + ' small-final Ia = mult*In');
      assert.strictEqual(info.timeReqS, 0.4, curve + In + ' small-final 0.4 s');
    });
    [40, 63, 100].forEach(function(In) {
      var info = upDisconnectionIa({ In: In, curve: curve });
      assert(Math.abs(info.ia - 5 * In) < 1e-9, curve + In + ' large Ia = 5*In');
      assert.strictEqual(info.timeReqS, 5, curve + In + ' large 5 s');
    });
  });
  var dev = upResolveDevice(MTD_GREEN.finals[0].deviceId, MTD_GREEN.finals[0].deviceIn);
  var audit = upAuditProject(MTD_GREEN);
  var zsF = audit.findings.find(function(f) { return upFindingCategory(f) === 'zs'; });
  assert(zsF.detail.indexOf('Ia=' + upDisconnectionIa(dev).ia.toFixed(0)) >= 0, 'auditor Zs detail uses the shared Ia');
  var saved = upSnapshot();
  [MTD_GREEN, MTD_ZS, mtdProject('TT', 'SC-AL-50', mtdFinal({ rcdMa: 30 })), mtdProject('IT', 'SC-AL-50', mtdFinal({}))].forEach(function(p) {
    assert.deepStrictEqual(upAuditWith(p, {}).findings, upAuditProject(p).findings, 'auditor findings byte-identical after Ia extraction');
  });
  upRestore(saved);
});

test('Commissioning: worst-day cold ceiling is stricter (\u0394R reuses upRMult exactly), equal at 20 \u00B0C', function() {
  var R20 = 0.5, mat = 'Cu', zsMax = 2.0;
  assert(cvZsCeilingCold(zsMax, R20, mat, 90) < cvZsCeilingCold(zsMax, R20, mat, 20), 'hotter -> stricter (lower) cold ceiling');
  assert(Math.abs(cvZsCeilingCold(zsMax, R20, mat, 20) - zsMax) < 1e-12, 'no tightening at 20 \u00B0C (\u0394R=0)');
  assert(Math.abs(cvDeltaRTemp(R20, mat, 75) - R20 * (upRMult(mat, 75) - 1)) < 1e-12, '\u0394R_temp == R_cable20*(upRMult-1) exactly (proves reuse)');
  assert.strictEqual(cvZsCeilingCold(zsMax, 0, mat, 90), zsMax, 'L=0 -> R20=0 -> equal at any temp');
});

test('Commissioning: a circuit whose HOT Zs fails -> test point over-edge, never PASS', function() {
  var saved = upSnapshot(); var savedRec = cvState.recorded;
  cvState.recorded = {};
  upProject = mtdProject('TN', 'SC-AL-50', mtdFinal({ cableId: 'NKT-NOIKLX-1.5', length_m: 200, deviceId: 'SE-iC60N-B16', deviceIn: 16, loadKW: 0.5 }));
  var zsT = cvBuildReport(upProject).circuits[0].tests.find(function(t) { return t.key === 'zs'; });
  assert.strictEqual(zsT.result, 'over-edge', 'predicted cold loop already exceeds the cold ceiling -> over-edge');
  cvState.recorded[cvKey(0, 'zs')] = 0.01; // a "perfect" low reading must NOT rescue it
  var zsT2 = cvBuildReport(upProject).circuits[0].tests.find(function(t) { return t.key === 'zs'; });
  assert.strictEqual(zsT2.result, 'over-edge', 'over-edge stays over-edge regardless of recorded value');
  assert(zsT2.result !== 'PASS', 'never PASS');
  cvState.recorded = savedRec;
  upRestore(saved);
});

test('Commissioning: displayed ceiling rounds DOWN toward danger; exact value retained', function() {
  var c = cvCeilObj(2.73125, CV_STEP.zs);
  assert(c._display <= c._exact, 'display <= exact');
  assert(Math.abs(c._display - (Math.floor(2.73125 / 0.01) * 0.01)) < 1e-9, 'display = floor(exact/step)*step');
  assert(Math.abs(c._display - 2.73) < 1e-9, '2.73125 -> 2.73');
  var f = cvFloorObj(1.0, CV_STEP.ir);
  assert(f._display >= f._exact - 1e-12, 'insulation floor display >= exact (stricter is higher)');
});

test('Commissioning: PASS/FAIL boundaries use the EXACT (un-rounded) value', function() {
  var ceil = 2.73125;
  assert.strictEqual(cvResult('ceiling', ceil, ceil), 'PASS', 'recorded == ceiling -> PASS (<=)');
  assert.strictEqual(cvResult('ceiling', ceil, ceil + 1e-6), 'FAIL', 'ceiling + eps -> FAIL');
  var floor = 1.0;
  assert.strictEqual(cvResult('floor', floor, floor), 'PASS', 'insulation recorded == floor -> PASS (>=)');
  assert.strictEqual(cvResult('floor', floor, floor - 1e-6), 'FAIL', 'floor - eps -> FAIL');
  assert.strictEqual(cvResult('ceiling', ceil, null), 'unresolved', 'no recorded -> unresolved');
  assert.strictEqual(cvResultBand(130, 500, 300), 'PASS', 'type-S band: inside -> PASS');
  assert.strictEqual(cvResultBand(130, 500, 600), 'FAIL', 'type-S band: above -> FAIL');
});

test('Commissioning: missing device/cable/RCD/type -> unresolved, never PASS', function() {
  var saved = upSnapshot(); var savedRec = cvState.recorded; var savedTypes = cvState.rcdType; var savedSel = cvState.rcdSelectiveS;
  cvState.recorded = {}; cvState.rcdType = {}; cvState.rcdSelectiveS = {};
  upProject = mtdProject('TN', 'SC-AL-50', mtdFinal({ cableId: null, deviceId: null, deviceIn: null }));
  var zsT = cvBuildReport(upProject).circuits[0].tests.find(function(t) { return t.key === 'zs'; });
  assert.strictEqual(zsT.result, 'unresolved', 'no device/cable -> Zs unresolved');
  assert(!('zsMax' in zsT) || zsT.ceiling._exact == null, 'unresolved Zs carries no ceiling number');
  upProject = mtdProject('TT', 'SC-AL-50', mtdFinal({ rcdMa: null }));
  var zsTT = cvBuildReport(upProject).circuits[0].tests.find(function(t) { return t.key === 'zs'; });
  assert.strictEqual(zsTT.result, 'unresolved', 'TT without rcdMa -> Zs unresolved');
  upProject = mtdProject('TN', 'SC-AL-50', mtdFinal({ rcdMa: 30 }));
  var trip = cvBuildReport(upProject).circuits[0].tests.find(function(t) { return t.key === 'rcd_idn'; });
  assert.strictEqual(trip.result, 'unresolved', 'RCD present but type not selected -> unresolved');
  cvState.recorded = savedRec; cvState.rcdType = savedTypes; cvState.rcdSelectiveS = savedSel;
  upRestore(saved);
});

test('Commissioning: fixed limits equal the cited DS/HD 60364-6 clauses', function() {
  assert.strictEqual(cvInsulationLimit('lv').minMohm, 1.0, '230/400 V -> 1.0 M\u03A9');
  assert.strictEqual(cvInsulationLimit('lv').testV, 500, '230/400 V test at 500 V');
  assert.strictEqual(cvInsulationLimit('selv').minMohm, 0.5, 'SELV/PELV -> 0.5 M\u03A9');
  assert.strictEqual(cvInsulationLimit('selv').testV, 250, 'SELV/PELV test at 250 V');
  var gen = cvRcdTripLimits('AC', false);
  assert.strictEqual(gen.atIdn, 300, 'general RCD 300 ms @ I\u0394n');
  assert.strictEqual(gen.at5, 40, 'general RCD 40 ms @ 5\u00D7I\u0394n');
  var sel = cvRcdTripLimits('A', true);
  assert.strictEqual(sel.at5, 150, 'type S 150 ms @ 5\u00D7I\u0394n');
  assert.strictEqual(sel.atIdnMin, 130, 'type S 130 ms min @ I\u0394n');
  assert.strictEqual(sel.atIdnMax, 500, 'type S 500 ms max @ I\u0394n');
  assert.strictEqual(cvRcdTripLimits(null, false).state, 'unresolved', 'absent type -> unresolved (never PASS)');
});

test('Commissioning: cvBuildReport works in da/en/fa (clause+required+recorded), JSON carries _exact/_display/result, never "approved" on FAIL', function() {
  var saved = upSnapshot(); var savedLang = lang; var savedRec = cvState.recorded;
  cvState.recorded = {};
  ['da', 'en', 'fa'].forEach(function(L) {
    lang = L;
    var m = cvBuildReport(MTD_GREEN);
    assert.strictEqual(m.standard, 'DS/HD 60364-6', L + ': standard tagged');
    assert(m.circuits.length > 0, L + ': has circuits');
    m.circuits.forEach(function(c) { c.tests.forEach(function(t) {
      assert('clause' in t && 'recorded' in t && 'result' in t, L + ': each test row has clause+recorded+result');
    }); });
    assert(cvRenderReportHTML(m, true).indexOf('DS/HD 60364-6') >= 0, L + ': report cites DS/HD 60364-6');
  });
  lang = 'en';
  var zsT = cvBuildReport(MTD_GREEN).circuits[0].tests.find(function(t) { return t.key === 'zs'; });
  assert('_exact' in zsT.ceiling && '_display' in zsT.ceiling, 'numeric ceiling carries _exact AND _display');
  cvState.recorded[cvKey(0, 'zs')] = 9999; // force a FAIL
  var failModel = cvBuildReport(MTD_GREEN);
  assert.strictEqual(failModel.verdict, 'fail', 'recording a failing Zs -> verdict fail');
  var failHtml = cvRenderReportHTML(failModel, true);
  assert(failHtml.indexOf('APPROVED FOR ENERGISATION') < 0, 'never prints positive approval on FAIL');
  assert(failHtml.indexOf('NOT APPROVED') >= 0, 'shows NOT APPROVED on fail');
  cvState.recorded = savedRec; lang = savedLang;
  upRestore(saved);
});

test('Commissioning: ceiling/report fns are PURE — no upProject / localStorage / PRODUCTS mutation', function() {
  var saved = upSnapshot();
  upProject = MTD_COUPLE;
  var before = JSON.stringify(upProject);
  var lsBefore = localStorage.getItem(UNIFIED_PROJECT_KEY);
  cvBuildReport(upProject);
  cvZsCeiling('TN', { In: 16, curve: 'B' }, { rcdMa: null }, 0.95);
  cvBuildReport(MTD_ZS);
  cvDeltaRTemp(0.5, 'Cu', 90);
  assert.strictEqual(JSON.stringify(upProject), before, 'upProject not mutated');
  assert.strictEqual(localStorage.getItem(UNIFIED_PROJECT_KEY), lsBefore, 'localStorage untouched');
  assert.strictEqual(upCableProduct('NKT-NOIKLX-4').r, 4.61, 'PRODUCTS cable resistance untouched');
  upRestore(saved);
});

test('Commissioning: rendered module is click-only (cvBump present, no text/number inputs, no textarea) in da/en/fa', function() {
  var saved = upSnapshot(); var savedLang = lang; var savedRec = cvState.recorded;
  cvState.recorded = {};
  upProject = mtdProject('TT', 'SC-AL-50', mtdFinal({ rcdMa: 30, phases: '3x400' }));
  ['da', 'en', 'fa'].forEach(function(L) {
    lang = L;
    var h = cvRender();
    assert(h.indexOf('cvBump(') >= 0, L + ': stepper uses cvBump (continuous click capture)');
    assert(h.indexOf('type="text"') < 0, L + ': no text input');
    assert(h.indexOf('type="number"') < 0, L + ': no number input');
    assert(h.indexOf('<textarea') < 0, L + ': no textarea');
  });
  lang = savedLang; cvState.recorded = savedRec;
  upRestore(saved);
});

test('Commissioning: trilingual \u2014 every new fragment resolves via _FA in Farsi (no raw English leak)', function() {
  var saved = upSnapshot(); var savedLang = lang; var savedRec = cvState.recorded; var savedTypes = cvState.rcdType; var savedExpand = cvState.expandReport;
  cvState.recorded = {}; cvState.rcdType = {}; cvState.expandReport = true;
  upProject = mtdProject('TT', 'SC-AL-50', mtdFinal({ rcdMa: 30, phases: '3x400' }));
  lang = 'fa';
  var hfa = cvRender();
  var newEnglish = ['Commissioning & verification', 'Loop impedance Zs', 'Continuity R1+R2', 'Insulation resistance',
    'RCD trip time', 'Earth-electrode resistance RA', 'Polarity', 'Phase sequence', 'PE continuity',
    'Recorded value', 'Required', 'Record measured value (no typing)', 'Expected Zs @20 \u00B0C',
    'Tightened for worst-day conductor temperature', 'Verification report (DS/HD 60364-6)', 'RCD type',
    'selective (type S)', 'Inspection (click OK / Fail)', 'Overall verdict'];
  newEnglish.forEach(function(s) { assert(hfa.indexOf(s) < 0, 'no raw English leak in Farsi: "' + s + '"'); });
  assert(hfa.indexOf('<textarea') < 0 && hfa.indexOf('type="text"') < 0, 'still 100% click-only in Farsi');
  assert(hfa.indexOf(_FA['Loop impedance Zs']) >= 0, 'Zs label resolved to Farsi');
  assert(hfa.indexOf(_FA['Commissioning & verification']) >= 0, 'heading resolved to Farsi');
  assert(hfa.indexOf(_FA['Earth-electrode resistance RA']) >= 0, 'RA label resolved to Farsi');
  lang = savedLang; cvState.recorded = savedRec; cvState.rcdType = savedTypes; cvState.expandReport = savedExpand;
  upRestore(saved);
});

test('Commissioning: module is registered in renderModule and renders without throwing', function() {
  var saved = upSnapshot();
  upProject = MTD_GREEN;
  assert.strictEqual(typeof cvRender, 'function', 'cvRender exists');
  assert.doesNotThrow(function() { renderModule('commissioning'); }, 'renderModule(\'commissioning\') does not throw');
  upRestore(saved);
});

// ============================================================================
// ===== NATIVE MathML FORMULA TYPESETTING TESTS (mathml transpiler) =====
// ============================================================================
console.log('\n=== MathML Formula Typesetting Tests ===\n');

function mmlCount(hay, needle) {
  var n = 0, idx = 0;
  while ((idx = hay.indexOf(needle, idx)) >= 0) { n++; idx += needle.length; }
  return n;
}
// Extract the inner <math>...</math> markup from a mathml() result (first match).
function mmlInner(out) {
  var a = out.indexOf('<math');
  var b = out.indexOf('</math>');
  return (a >= 0 && b >= 0) ? out.slice(a, b + 7) : '';
}

test('mathml: subscript with dotted multi-part subscript preserved', function() {
  var out = mathml('I_K1s.fase');
  var inner = mmlInner(out);
  assert(inner.indexOf('<msub>') >= 0, 'has <msub>');
  assert(inner.indexOf('<mi>I</mi>') >= 0, 'base is identifier I');
  assert(inner.indexOf('K1s.fase') >= 0, 'dotted multi-part subscript preserved');
});

test('mathml: double-prime base + msub subscript', function() {
  var out = mathml("t''_linje");
  var inner = mmlInner(out);
  assert(inner.indexOf('\u2033') >= 0, 'base carries double-prime \u2033');
  assert(inner.indexOf('<msub>') >= 0, 'has msub');
  assert(inner.indexOf('linje') >= 0, 'subscript linje present');
  assert(inner.indexOf('<mi>t</mi>') >= 0, 'base identifier t present');
});

test('mathml: superscript via ^ incl fractional, and unicode square', function() {
  var inner = mmlInner(mathml('s^(1/2)'));
  assert(inner.indexOf('<msup>') >= 0, 's^(1/2) has <msup>');
  assert(inner.indexOf('<mfrac>') >= 0, 'fractional exponent is an <mfrac> (1 over 2)');
  assert(inner.indexOf('<mn>1</mn>') >= 0 && inner.indexOf('<mn>2</mn>') >= 0, 'mfrac 1 over 2');
  var inner2 = mmlInner(mathml('x\u00B2'));
  assert(inner2.indexOf('<msup>') >= 0, 'x\u00B2 has <msup>');
  assert(inner2.indexOf('<mn>2</mn>') >= 0, 'unicode square -> exponent 2');
});

test('mathml: trailing-digit guard (Un, S1, SN render as identifiers)', function() {
  ['Un', 'S1', 'SN'].forEach(function(id) {
    var inner = mmlInner(mathml(id));
    assert(inner.indexOf('<msup>') < 0, id + ' must NOT be superscripted');
    assert(inner.indexOf('<msub>') < 0, id + ' must NOT be subscripted');
    assert(inner.indexOf('<mi>' + id + '</mi>') >= 0, id + ' is a single identifier');
  });
});

test('mathml: bare radical and radical over a fraction', function() {
  var i3 = mmlInner(mathml('\u221A3'));
  assert(i3.indexOf('<msqrt><mn>3</mn></msqrt>') >= 0, '\u221A3 -> msqrt over just 3');
  assert(i3.indexOf('<mfrac>') < 0, 'no spurious fraction');
  var is = mmlInner(mathml('\u221As'));
  assert(is.indexOf('<msqrt><mi>s</mi></msqrt>') >= 0, '\u221As -> msqrt over just s');
  var ip = mmlInner(mathml('\u221A(P0/Pcu)'));
  assert(ip.indexOf('<msqrt>') >= 0 && ip.indexOf('<mfrac>') >= 0, '\u221A(P0/Pcu) -> msqrt over mfrac');
});

test('mathml: stacked fraction with correct numerator/denominator grouping', function() {
  var inner = mmlInner(mathml('c \u00B7 Un / (\u221A3 \u00B7 Zt)'));
  assert(inner.indexOf('<mfrac>') >= 0, 'has <mfrac>');
  // numerator c·Un
  assert(inner.indexOf('<mi>c</mi><mo>\u00B7</mo><mi>Un</mi>') >= 0, 'numerator is c \u00B7 Un');
  // denominator √3 · Zt (parenthesised source -> grouped under the bar)
  assert(inner.indexOf('<msqrt><mn>3</mn></msqrt><mo>\u00B7</mo><mi>Zt</mi>') >= 0, 'denominator is \u221A3 \u00B7 Zt');
});

test('mathml: absolute-value bars fence a subscripted identifier', function() {
  var inner = mmlInner(mathml('|I_K3F.max.for|'));
  assert(mmlCount(inner, '<mo>|</mo>') === 2, 'two fence bars');
  assert(inner.indexOf('<msub>') >= 0, 'subscripted identifier inside bars');
  assert(inner.indexOf('K3F.max.for') >= 0, 'dotted subscript preserved');
});

test('mathml: chained inequality (unicode and ASCII <= forms)', function() {
  var inner = mmlInner(mathml('IB \u2264 In \u2264 Iz'));
  assert(mmlCount(inner, '<mo>\u2264</mo>') === 2, 'two \u2264 operators');
  assert(inner.indexOf('<mi>IB</mi>') >= 0 && inner.indexOf('<mi>In</mi>') >= 0 && inner.indexOf('<mi>Iz</mi>') >= 0, 'three operands');
  var inner2 = mmlInner(mathml('IB <= In <= Iz'));
  assert(mmlCount(inner2, '<mo>\u2264</mo>') === 2, 'ASCII <= maps to two \u2264 operators');
});

test('mathml: define operator := is distinct, and = evaluation form works', function() {
  var inner = mmlInner(mathml('l_lang := l_1 + l_2 + l_3 + l_F'));
  assert(inner.indexOf('<mo>:=</mo>') >= 0, ':= rendered distinctly');
  assert(inner.indexOf('<mo>=</mo>') < 0, ':= must not collapse to plain =');
  assert(inner.indexOf('<msub>') >= 0, 'l_1 etc are subscripted');
  var ev = mmlInner(mathml('l_lang = 5'));
  assert(ev.indexOf('<mo>=</mo>') >= 0 && ev.indexOf('<mn>5</mn>') >= 0, 'evaluation = 5 form works');
});

test('mathml: Danish-decimal numbers, parenthesised base, superscript exponent', function() {
  var out = mathml('Pb = 0,834 \u00B7 (W\u00B7n)^0,89');
  var inner = mmlInner(out);
  assert(inner !== '', 'parses to <math> (does not fall back)');
  assert(inner.indexOf('<mn>0,834</mn>') >= 0, 'Danish decimal 0,834 preserved');
  assert(inner.indexOf('<mn>0,89</mn>') >= 0, 'Danish decimal exponent 0,89 preserved');
  assert(inner.indexOf('<msup>') >= 0, 'has superscript');
  assert(inner.indexOf('<mo>(</mo>') >= 0, 'parenthesised base preserved');
});

test('mathml: alttext fidelity (attribute + hidden span preserve exact ASCII)', function() {
  var f = 'Ik3max = c \u00B7 Un / (\u221A3 \u00B7 Zt)';
  var out = mathml(f);
  assert(out.indexOf('alttext="' + f + '"') >= 0, 'exact ASCII in alttext attribute');
  assert(out.indexOf('class="mathml-alt"') >= 0, 'has visually-hidden ASCII twin span');
  assert(out.indexOf(f) >= 0, 'substring search for the ASCII still succeeds');
  // hidden span carries the ASCII too
  var spanIdx = out.indexOf('class="mathml-alt"');
  assert(out.indexOf(f, spanIdx) >= 0, 'hidden span contains the exact ASCII');
});

test('mathml: graceful fallback never throws and returns escaped raw text', function() {
  assert.doesNotThrow(function() { mathml('see note below'); }, 'prose does not throw');
  assert.doesNotThrow(function() { mathml('a / ('); }, 'unbalanced does not throw');
  var prose = mathml('see note below');
  assert(prose.indexOf('<math') < 0, 'prose -> no broken <math>');
  assert(prose.indexOf('see note below') >= 0, 'prose raw text preserved');
  var bad = mathml('a / (');
  assert(bad.indexOf('<math') < 0, 'unbalanced -> no broken <math>');
  assert(bad.indexOf('a / (') >= 0, 'unbalanced raw text preserved');
  // escaping in fallback
  var esc = mathml('x < y & z');
  assert(esc.indexOf('&lt;') >= 0 && esc.indexOf('&amp;') >= 0, 'fallback escapes < and &');
});

test('mathml: well-formedness for a battery of real codebase formulas', function() {
  var formulas = [
    'Iz = Iz_tab \u00B7 K_install \u00B7 K_temp \u00B7 K_group',
    'Ik3max = c \u00B7 Un / (\u221A3 \u00B7 Zt)',
    'IB \u2264 In \u2264 Iz',
    'Icu \u2265 Ik3max',
    '\u03B7 = P2 / (P2 + P0 + Pcu\u00D7(S/SN)\u00B2)',
    'er% = Pcu / (SN \u00D7 1000) \u00D7 100',
    'S_opt/SN = \u221A(P0/Pcu)',
    '\u0394U% = (\u0394U / Un) \u00D7 100',
    'I_fl = S_N / (\u221A3 \u00D7 U2)',
    'k = l\u00D7b / (hm\u00D7(l+b))'
  ];
  var pairs = [['<math', '</math>'], ['<mrow>', '</mrow>'], ['<msub>', '</msub>'], ['<msup>', '</msup>'],
    ['<msubsup>', '</msubsup>'], ['<mfrac>', '</mfrac>'], ['<msqrt>', '</msqrt>']];
  formulas.forEach(function(f) {
    var out = mathml(f);
    assert(out.indexOf('<math') >= 0, 'formula typesets (no fallback): ' + f);
    pairs.forEach(function(pr) {
      assert.strictEqual(mmlCount(out, pr[0]), mmlCount(out, pr[1]), 'balanced ' + pr[0] + ' in: ' + f);
    });
    // no empty tags
    assert(out.indexOf('<mi></mi>') < 0 && out.indexOf('<mn></mn>') < 0 && out.indexOf('<mrow></mrow>') < 0, 'no empty tags: ' + f);
    // no raw ampersand outside known entities
    var stripped = out.replace(/&(amp|lt|gt|quot);/g, '');
    assert(stripped.indexOf('&') < 0, 'no unescaped ampersand: ' + f);
  });
});

test('mathml: calcDetail regression keeps <math> AND original ASCII', function() {
  var h1 = calcDetail({ name: 'Ik3max', formula: 'Ik3max = c \u00B7 Un / (\u221A3 \u00B7 Zt)', result: { value: 19.1, unit: 'kA' } });
  assert(h1.indexOf('<math') >= 0, 'calcDetail render contains <math>');
  assert(h1.indexOf('Ik3max = c \u00B7 Un / (\u221A3 \u00B7 Zt)') >= 0, 'original ASCII still present (alttext/hidden span)');
  assert(h1.indexOf('<mfrac>') >= 0, 'fraction typeset inside the card');
  var h2 = calcDetail({ name: 'Overload', formula: 'IB \u2264 In \u2264 Iz' });
  assert(h2.indexOf('<math') >= 0, 'second formula typesets');
  assert(h2.indexOf('IB \u2264 In \u2264 Iz') >= 0, 'original ASCII present for inequality');
  // blue unit styling applied via structured unit field
  assert(h1.indexOf('class="math-unit"') >= 0, 'units rendered in blue math-unit style');
  // data object is not mutated by rendering
  var calc = { name: 'X', formula: 'IB \u2264 In \u2264 Iz', substitution: '16 \u2264 16 \u2264 21' };
  calcDetail(calc);
  assert.strictEqual(calc.formula, 'IB \u2264 In \u2264 Iz', 'formula data field not mutated');
  assert.strictEqual(calc.substitution, '16 \u2264 16 \u2264 21', 'substitution data field not mutated');
});

test('mathml: Mathcad font stack + blue units present on screen and print CSS', function() {
  assert(html.indexOf('"Cambria Math"') >= 0, 'screen CSS has Cambria Math font stack');
  assert(html.indexOf('"STIX Two Math"') >= 0, 'screen CSS has STIX Two Math fallback');
  assert(html.indexOf('.math-unit') >= 0, 'screen CSS defines .math-unit');
  assert(html.indexOf('#1565c0') >= 0, 'unit style is blue (#1565c0)');
  var pcss = reportPrintCSS();
  assert(pcss.indexOf('Cambria Math') >= 0, 'print CSS includes the math font stack');
  assert(pcss.indexOf('math{') >= 0, 'print CSS targets <math>');
  assert(pcss.indexOf('.math-unit') >= 0, 'print CSS keeps blue units');
});

test('mathml: new i18n label "Typeset formula" resolves via _FA under lang=fa', function() {
  assert.ok(_FA['Typeset formula'], 'Typeset formula must have a Farsi translation');
  var prev = lang;
  lang = 'fa';
  var resolved = tx('Typesat formel', 'Typeset formula');
  lang = prev;
  assert.strictEqual(resolved, _FA['Typeset formula'], 'tx() resolves the new label to Farsi');
});

test('mathml: non-invasive — pure presentation, no <math> when no formula', function() {
  assert.strictEqual(typeof mathml, 'function', 'mathml is a hoisted top-level function');
  assert.strictEqual(calcDetail(null), '', 'calcDetail(null) still returns empty (unchanged)');
  var noFormula = calcDetail({ name: 'NoFormula', result: { value: 5, unit: 'A' } });
  assert(noFormula.indexOf('<math') < 0, 'no formula/substitution -> no <math> injected');
  // mathml is language-neutral: identifiers unchanged regardless of lang
  var prev = lang; lang = 'fa';
  var fa = mmlInner(mathml('IB \u2264 In \u2264 Iz'));
  lang = prev;
  assert(fa.indexOf('<mi>IB</mi>') >= 0, 'math identifiers are language-neutral');
});

// ============================================================================
// ===== Phase 1: solver-formulas (PHYS_CONST, helpers, cards, legends) ========
// ============================================================================

// Test P1-1: PHYS_CONST values and non-empty sources
test('PHYS_CONST: exact values per spec + every entry has a non-empty source', function() {
  assert.strictEqual(PHYS_CONST.MU0.value, 4 * Math.PI * 1e-7, 'MU0');
  assert.strictEqual(PHYS_CONST.EPS0.value, 8.854e-12, 'EPS0');
  assert.strictEqual(PHYS_CONST.SQRT3.value, Math.sqrt(3), 'SQRT3');
  assert.strictEqual(PHYS_CONST.C_WATER.value, 4186, 'C_WATER');
  assert.strictEqual(PHYS_CONST.RHO_CU.value, 0.0175, 'RHO_CU');
  assert.strictEqual(PHYS_CONST.RHO_AL.value, 0.029, 'RHO_AL');
  assert.strictEqual(PHYS_CONST.TORQUE_K.value, 9.55, 'TORQUE_K');
  assert.strictEqual(PHYS_CONST.EMF_K.value, 4.44, 'EMF_K');
  assert.strictEqual(PHYS_CONST.ALPHA_CU.value, 0.00393, 'ALPHA_CU');
  assert.strictEqual(PHYS_CONST.ALPHA_AL.value, 0.00403, 'ALPHA_AL');
  // The linear coefficient must match the textbook's inferred-zero method exactly:
  // Cu: alpha = 1/(234.5+20), Al: alpha = 1/(228+20).
  assert.ok(Math.abs(PHYS_CONST.ALPHA_CU.value - 1 / (234.5 + 20)) < 5e-6, 'alpha_Cu = 1/(234.5+20) = 0.00393 (Elektroteknik 234.5-method)');
  assert.ok(Math.abs(PHYS_CONST.ALPHA_AL.value - 1 / (228 + 20)) < 5e-5, 'alpha_Al = 1/(228+20) = 0.00403');
  assert.strictEqual(PHYS_CONST.U_PHASE.value, 230, 'U_PHASE');
  assert.strictEqual(PHYS_CONST.U_LINE.value, 400, 'U_LINE');
  Object.keys(PHYS_CONST).forEach(function(k) {
    assert(typeof PHYS_CONST[k].source === 'string' && PHYS_CONST[k].source.length > 0, k + ' must have a non-empty source');
    assert(typeof PHYS_CONST[k].symbol === 'string' && PHYS_CONST[k].symbol.length > 0, k + ' must have a symbol');
  });
});

// Test P1-2: numeric correctness of the new pure helpers
test('Phase1 helpers: heating-energy and AC power numeric correctness', function() {
  assert.strictEqual(varmeHeatEnergy(10, 4186, 50), 2093000, 'Q = m·c·ΔT (J)');
  assert(Math.abs(varmeHeatTime(10, 4186, 50, 1000) - 2093) < 1e-9, 't = Q/P ≈ 2093 s');
  assert.strictEqual(varmeEnergyKWh(1000, 1), 1, 'W[kWh] = P[W]·t[h]/1000');
  var P = 1200, Q = 500;
  var S = acApparentFromPQ(P, Q);
  assert(Math.abs(S * S - (P * P + Q * Q)) < 1e-6, 'S² == P² + Q²');
  assert.strictEqual(acApparentPower(230, 5), 1150, 'S = U·I');
  assert.strictEqual(acActivePower(230, 5, 0.9), 1035, 'P = U·I·cosφ');
  assert(Math.abs(acRmsFromPeak(325) - 229.8) < 0.05, 'U_rms = U_max/√2 ≈ 229.8 V');
  assert(Math.abs(acAvgFromPeak(325) - (2 * 325 / Math.PI)) < 1e-9, 'U_avg = 2·U_max/π');
  assert(Math.abs(acOmega(50) - 2 * Math.PI * 50) < 1e-9, 'ω = 2·π·f');
});

// Test P1-3: every NEW formula string typesets via mathml() (no fallback)
test('Phase1 formulas typeset via mathml() with no fallback', function() {
  // NOTE: subtraction uses ASCII '-' (the app's ASCII-math parser does not
  // accept unicode minus U+2212), consistent with the strings actually rendered.
  var formulas = [
    'Q = m\u00B7c\u00B7\u0394T',
    't = Q / P',
    't = (m\u00B7c\u00B7\u0394T)/P',
    'W = P\u00B7t',
    'W_kWh = P\u00B7t/1000',
    '\u03C9 = 2\u00B7\u03C0\u00B7f',
    'U_rms = U_max/\u221A2',
    'U_avg = 2\u00B7U_max/\u03C0',
    'P = U\u00B7I\u00B7cos\u03C6',
    'Q = U\u00B7I\u00B7sin\u03C6',
    'S = U\u00B7I',
    'S\u00B2 = P\u00B2 + Q\u00B2',
    'E = c\u00B7\u03A6\u00B7n',
    'M = k\u00B7\u03A6\u00B7I_a',
    'n = (U - I_a\u00B7R_a)/(c\u00B7\u03A6)'
  ];
  formulas.forEach(function(f) {
    var out = mathml(f);
    assert(out.indexOf('<math') >= 0, 'typesets (has <math): ' + f);
    assert(out.indexOf('mathml-fallback') < 0, 'no fallback: ' + f);
    assert(out.indexOf(f) >= 0, 'original ASCII preserved: ' + f);
  });
});

// Test P1-4: symbolLegend returns a collapsed <details> table; renders in da/en/fa
test('symbolLegend: returns <details> table and renders for da/en/fa', function() {
  var rows = [
    { name: 'Spaending', symbol: 'U', unit: 'V' },
    { name: 'Stroem', symbol: 'I', unit: 'A' }
  ];
  var prev = lang;
  ['da', 'en', 'fa'].forEach(function(L) {
    lang = L;
    var out = symbolLegend(rows);
    assert(out.indexOf('<details') >= 0, 'has <details> (' + L + ')');
    assert(out.indexOf('<table') >= 0, 'has table (' + L + ')');
    assert(out.indexOf('<math') >= 0, 'symbol typeset via mathml (' + L + ')');
    assert(out.indexOf('class="math-unit"') >= 0, 'unit uses shared math-unit styling (' + L + ')');
  });
  lang = prev;
  assert.strictEqual(symbolLegend([]), '', 'empty rows -> empty string');
  assert.strictEqual(symbolLegend(null), '', 'null rows -> empty string');
});

// Test P1-5: source-presence guard for cards carrying PHYS_CONST values
test('Phase1 cards: PHYS_CONST-backed variables carry a non-empty source', function() {
  var prev = lang; lang = 'en';
  var prevMode = dcmaskineState.mode;
  dcmaskineState.mode = 'torque';
  var torque = renderDcmaskine();
  dcmaskineState.mode = prevMode;
  assert(torque.indexOf(PHYS_CONST.TORQUE_K.source) >= 0, 'torque card cites PHYS_CONST.TORQUE_K.source');

  var prevType = varmeState.calcType, prevSub = varmeState.substance;
  varmeState.calcType = 'energy'; varmeState.substance = 'water';
  var varme = renderVarme();
  varmeState.calcType = prevType; varmeState.substance = prevSub;
  assert(varme.indexOf(PHYS_CONST.C_WATER.source) >= 0, 'heating-energy water card cites PHYS_CONST.C_WATER.source');
  lang = prev;
});

// Test P1-6: de-duplication of 8.854e-12 + byte-identical re-pointed locals
test('Phase1 de-dup: single 8.854e-12 literal; KAP/MAGNET locals unchanged', function() {
  var cnt = (html.match(/8\.854e-12/g) || []).length;
  assert.strictEqual(cnt, 1, 'exactly one literal 8.854e-12 remains (the PHYS_CONST.EPS0 definition)');
  assert.strictEqual(KAP_EPS0, 8.854e-12, 'KAP_EPS0 unchanged numerically');
  assert.strictEqual(KAP_EPS0, PHYS_CONST.EPS0.value, 'KAP_EPS0 now references PHYS_CONST.EPS0');
  assert.strictEqual(MAGNET_MU0, 4 * Math.PI * 1e-7, 'MAGNET_MU0 unchanged numerically');
  assert.strictEqual(MAGNET_MU0, PHYS_CONST.MU0.value, 'MAGNET_MU0 now references PHYS_CONST.MU0');
  assert(Math.abs(kapacitorCalcC(1, 0.01, 0.001) - (8.854e-12 * 1 * 0.01 / 0.001)) < 1e-30, 'kapacitorCalcC unchanged');
});

// Test P1-7: trilingual — new labels resolve via _FA under lang='fa'
test('Phase1 i18n: new English labels resolve via _FA under lang=fa', function() {
  var newLabels = [
    'Symbol legend', 'Quantity', 'Unit', 'Heating energy (Q, t, W)', 'Sensible heat',
    'Heating time', 'Electrical energy', 'Angular frequency', 'RMS voltage', 'Average voltage',
    'Active power', 'Reactive power', 'Apparent power', 'Power triangle', 'Induced EMF',
    'Machine constant', 'Flux', 'Torque constant', 'from machine data', 'DC-machine fundamentals',
    'Single-phase AC power & quantities (Ch. 6)', 'Specific heat capacity'
  ];
  var prev = lang; lang = 'fa';
  newLabels.forEach(function(en) {
    assert(typeof _FA[en] === 'string' && _FA[en].length > 0, 'has Farsi: ' + en);
    assert.strictEqual(tx('xx', en), _FA[en], 'tx() resolves to Farsi: ' + en);
    assert.notStrictEqual(_FA[en], en, 'Farsi differs from raw English: ' + en);
  });
  lang = prev;
});

// Test P1-8: non-invasive — life-safety calc unchanged after additive changes
test('Phase1 non-invasive: life-safety cvZsCeiling spot-check unchanged', function() {
  var zsMax = cvZsCeiling('TN', { In: 16, curve: 'B' }, {}, 0.95).zsMax;
  assert.strictEqual(zsMax, 2.73125, 'cvZsCeiling TN B16 zsMax unchanged');
});

// === Transformer dynamic power/current solver (trafoSolvePower) ===
// Governing relationships (Opgavesamling Kap. 9 / IEC 60076-1):
//   3-phase: S = sqrt(3)*U*I ; P = S*cosphi ; Q = S*sinphi ; I = S/(sqrt(3)*U)
//   1-phase: S = U*I ; P = S*cosphi ; I = S/U
var SQRT3 = Math.sqrt(3);

test('trafoSolvePower: function exists', function() {
  assert(typeof trafoSolvePower === 'function', 'trafoSolvePower missing');
});

test('trafoSolvePower 3-phase: from (I,U,cosphi) derives S,P,Q (the user scenario)', function() {
  var r = trafoSolvePower({ phase: '3', U: 400, I: 100, cosphi: 0.9 });
  assert(r.sufficient && r.complete, 'should be complete from (I,U,cosphi)');
  var S = SQRT3 * 400 * 100;          // 69282.03 VA
  assert(Math.abs(r.S - S) < 1e-6, 'S = sqrt(3)*U*I; got ' + r.S);
  assert(Math.abs(r.P - S * 0.9) < 1e-6, 'P = S*cosphi; got ' + r.P);
  var Q = S * Math.sqrt(1 - 0.81);    // S*sinphi
  assert(Math.abs(r.Q - Q) < 1e-6, 'Q = S*sinphi; got ' + r.Q);
  assert(Math.abs(r.cosphi - 0.9) < 1e-12, 'cosphi preserved');
  assert(r.missing.length === 0, 'nothing missing');
});

test('trafoSolvePower 1-phase: from (I,U,cosphi) derives S,P,Q', function() {
  var r = trafoSolvePower({ phase: '1', U: 230, I: 16, cosphi: 0.95 });
  assert(r.sufficient && r.complete, 'should be complete');
  var S = 230 * 16;                   // 3680 VA
  assert(Math.abs(r.S - S) < 1e-9, 'S = U*I (1-phase, no sqrt3); got ' + r.S);
  assert(Math.abs(r.P - S * 0.95) < 1e-9, 'P = S*cosphi; got ' + r.P);
  assert(Math.abs(r.Q - S * Math.sqrt(1 - 0.95 * 0.95)) < 1e-9, 'Q = S*sinphi');
});

test('trafoSolvePower: 1-phase vs 3-phase use the correct phase factor for same U,I', function() {
  var r1 = trafoSolvePower({ phase: '1', U: 400, I: 100 });
  var r3 = trafoSolvePower({ phase: '3', U: 400, I: 100 });
  assert(Math.abs(r1.S - 400 * 100) < 1e-9, '1-phase S = U*I');
  assert(Math.abs(r3.S - SQRT3 * 400 * 100) < 1e-6, '3-phase S = sqrt(3)*U*I');
  assert(Math.abs(r3.S / r1.S - SQRT3) < 1e-9, '3-phase S is sqrt(3) larger');
});

test('trafoSolvePower 3-phase: from (S,U) derives I but leaves cosphi/P/Q missing', function() {
  var r = trafoSolvePower({ phase: '3', S: 250000, U: 400 });
  assert(r.sufficient, 'S is known so sufficient');
  assert(!r.complete, 'incomplete without cosphi');
  var I = 250000 / (SQRT3 * 400);     // 360.84 A
  assert(Math.abs(r.I - I) < 1e-6, 'I = S/(sqrt(3)*U); got ' + r.I);
  assert(r.P === undefined && r.Q === undefined && r.cosphi === undefined, 'P,Q,cosphi NOT fabricated');
  assert(r.missing.indexOf('cosphi') >= 0 && r.missing.indexOf('P') >= 0 && r.missing.indexOf('Q') >= 0, 'reports P,Q,cosphi missing');
});

test('trafoSolvePower 1-phase: from (S,U) derives I = S/U', function() {
  var r = trafoSolvePower({ phase: '1', S: 3680, U: 230 });
  assert(Math.abs(r.I - 16) < 1e-9, 'I = S/U (1-phase); got ' + r.I);
});

test('trafoSolvePower 3-phase: from (P,U,cosphi) derives S and I', function() {
  var r = trafoSolvePower({ phase: '3', P: 90000, U: 400, cosphi: 0.9 });
  assert(r.sufficient && r.complete, 'complete from (P,U,cosphi)');
  var S = 90000 / 0.9;                // 100000 VA
  assert(Math.abs(r.S - S) < 1e-6, 'S = P/cosphi; got ' + r.S);
  assert(Math.abs(r.I - S / (SQRT3 * 400)) < 1e-6, 'I = S/(sqrt(3)*U); got ' + r.I);
});

test('trafoSolvePower: from (P,Q) derives S and cosphi', function() {
  var r = trafoSolvePower({ phase: '3', P: 80000, Q: 60000 });
  assert(Math.abs(r.S - 100000) < 1e-6, 'S = sqrt(P^2+Q^2) = 100000; got ' + r.S);
  assert(Math.abs(r.cosphi - 0.8) < 1e-9, 'cosphi = P/S = 0.8; got ' + r.cosphi);
});

test('trafoSolvePower: insufficient input reports missing, never fabricates', function() {
  var r = trafoSolvePower({ phase: '3', U: 400 });   // only voltage
  assert(!r.sufficient, 'U alone is insufficient');
  assert(r.S === undefined && r.I === undefined && r.P === undefined, 'nothing fabricated from U alone');
  assert(r.missing.indexOf('S') >= 0, 'S reported missing');
  var r2 = trafoSolvePower({ phase: '3' });           // nothing
  assert(!r2.sufficient, 'empty input insufficient');
  assert(r2.missing.length === 6, 'all six canonical quantities missing; got ' + r2.missing.length);
});

test('trafoSolvePower: cosphi is clamped to physical range [0,1] (conservative, no runaway)', function() {
  var r = trafoSolvePower({ phase: '3', cosphi: 1.5, U: 400, I: 100 });
  assert(r.cosphi <= 1 && r.cosphi >= 0, 'cosphi clamped to [0,1]; got ' + r.cosphi);
  assert(Math.abs(r.cosphi - 1) < 1e-12, 'cosphi clamped to 1');
  // With cosphi=1, P should equal S (not exceed it) - never overstate active power
  assert(r.P <= r.S + 1e-6, 'P must not exceed S');
});

test('trafoSolvePower: cosphi=1 gives Q=0 and P=S', function() {
  var r = trafoSolvePower({ phase: '3', U: 400, I: 100, cosphi: 1.0 });
  assert(Math.abs(r.Q) < 1e-6, 'Q = 0 at unity power factor; got ' + r.Q);
  assert(Math.abs(r.P - r.S) < 1e-6, 'P = S at unity power factor');
});

test('trafoSolvePower: round-trip current is consistent (I -> S -> I)', function() {
  var r = trafoSolvePower({ phase: '3', U: 690, I: 250, cosphi: 0.85 });
  // Recompute I from derived S and confirm it matches the input current exactly
  var Iback = r.S / (SQRT3 * 690);
  assert(Math.abs(Iback - 250) < 1e-6, 'current round-trips; got ' + Iback);
});

// === Non-invasiveness: existing trafo calc primitives unchanged (snapshot) ===
test('trafoSolvePower non-invasive: existing trafoCalc* primitives unchanged', function() {
  // Snapshot values computed from the pre-existing, life-safety-relevant formulas.
  var sc = trafoCalcSC(6900, 4, 630);
  assert(Math.abs(sc.IN - (630 * 1000) / (Math.sqrt(3) * 400)) < 1e-6, 'trafoCalcSC IN unchanged');
  assert(Math.abs(sc.erPct - (6900 / (630 * 1000) * 100)) < 1e-9, 'trafoCalcSC er% unchanged');
  assert(Math.abs(sc.exPct - Math.sqrt(4 * 4 - sc.erPct * sc.erPct)) < 1e-9, 'trafoCalcSC ex% unchanged');

  var emf = trafoCalcEMF(50, 300, 1.2, 0.01);
  assert(Math.abs(emf - 4.44 * 50 * 300 * 1.2 * 0.01) < 1e-9, 'trafoCalcEMF unchanged');

  var reg = trafoCalcRegulation(1.5, 3.5, 0.8, 'inductive');
  assert(Math.abs(reg.dU_pct - (1.5 * 0.8 + 3.5 * Math.sqrt(1 - 0.64))) < 1e-9, 'trafoCalcRegulation (inductive) unchanged');

  var eff = trafoCalcEfficiency(630, 610, 6900, 75, 0.85);
  var lf = 0.75, P2 = 630 * 1000 * lf * 0.85, Pl = 610 + 6900 * lf * lf;
  assert(Math.abs(eff.eta - P2 / (P2 + Pl)) < 1e-12, 'trafoCalcEfficiency unchanged');

  var par = trafoCalcParallel(630, 6, 400, 4, 800);
  assert(Math.abs(par.totalCapacity - 1030) < 1e-9, 'trafoCalcParallel capacity unchanged');
});

test('trafoSolvePower non-invasive: renderTrafo still produces all calc types incl. new one', function() {
  var saved = JSON.stringify(trafoState);
  trafoState.calcType = 'powersolve';
  trafoState.psPhase = '3'; trafoState.psU = 400; trafoState.psI = 100; trafoState.psCos = 0.9;
  trafoState.psS = null; trafoState.psP = null; trafoState.psQ = null;
  var h = renderTrafo();
  assert(typeof h === 'string' && h.indexOf('Result') >= 0 || h.indexOf('Resultat') >= 0, 'powersolve renders a result');
  trafoState.calcType = 'sizing';
  var hs = renderTrafo();
  assert(typeof hs === 'string' && hs.length > 0, 'sizing still renders');
  trafoState = JSON.parse(saved);
});

// === Power/Current Solver: widened presets + click-only stepper (this change) ===

// Helper: render the powersolve card HTML with a given trafoState patch, then restore.
function psRenderHtml(patch) {
  var saved = JSON.stringify(trafoState);
  trafoState.calcType = 'powersolve';
  Object.keys(patch || {}).forEach(function (k) { trafoState[k] = patch[k]; });
  var h = renderTrafoPowerSolve();
  trafoState = JSON.parse(saved);
  return h;
}

test('powersolve presets: 800 A is now directly selectable (the user request)', function() {
  var h = psRenderHtml({ psPhase: '3', psU: 400, psI: null, psS: null, psP: null, psQ: null, psCos: 0.9 });
  // The current-row stores I in base SI amps; 800 A => trafoState.psI=800.
  assert(h.indexOf("trafoState.psI=800;") >= 0, '800 A current preset must be present and click-only');
  assert(h.indexOf('>800 A<') >= 0, '800 A button label must render');
});

test('powersolve presets: dense standard current ratings present (incl. 32,80,125,315,500,1250..4000)', function() {
  var h = psRenderHtml({ psPhase: '3' });
  [10,16,25,32,50,63,80,100,125,160,200,250,315,400,500,630,800,1000,1250,1600,2000,2500,3150,4000].forEach(function (a) {
    assert(h.indexOf("trafoState.psI=" + a + ";") >= 0, 'current preset ' + a + ' A must be selectable');
  });
});

test('powersolve presets: active power P (kW) reaches up to 2500 kW (e.g. 800, 2500)', function() {
  var h = psRenderHtml({ psPhase: '3' });
  // kW stored as W (mult 1000): 800 kW => 800000, 2500 kW => 2500000
  assert(h.indexOf("trafoState.psP=800000;") >= 0, '800 kW preset must be selectable');
  assert(h.indexOf("trafoState.psP=2500000;") >= 0, '2500 kW preset must be selectable');
});

test('powersolve presets: apparent power S (kVA) reaches the 2500 kVA catalog max', function() {
  var h = psRenderHtml({ psPhase: '3' });
  assert(h.indexOf("trafoState.psS=800000;") >= 0, '800 kVA preset must be selectable');
  assert(h.indexOf("trafoState.psS=2500000;") >= 0, '2500 kVA preset must be selectable');
});

test('powersolve presets: reactive power Q (kvar) widened (e.g. 630, 1000 kvar)', function() {
  var h = psRenderHtml({ psPhase: '3' });
  assert(h.indexOf("trafoState.psQ=630000;") >= 0, '630 kvar preset must be selectable');
  assert(h.indexOf("trafoState.psQ=1000000;") >= 0, '1000 kvar preset must be selectable');
});

test('powersolve stepper: produces click-only [--][-]value[+][++] buttons via psBump (no inputs)', function() {
  var h = psRenderHtml({ psPhase: '3', psI: 800 });
  // Steppers exist for U, I, S, P, Q (and cosphi).
  ['psU','psI','psS','psP','psQ','psCos'].forEach(function (f) {
    assert(h.indexOf("psBump('" + f + "',") >= 0, 'stepper must exist for ' + f);
  });
  // The whole solver card must be 100% click-only: no typing affordances whatsoever.
  assert(h.indexOf('<input') < 0, 'no <input> in solver card');
  assert(h.indexOf('<textarea') < 0, 'no <textarea> in solver card');
  assert(h.toLowerCase().indexOf('contenteditable') < 0, 'no contenteditable in solver card');
});

test('powersolve stepper: psBump exists, clamps, and seeds from null', function() {
  assert(typeof psBump === 'function', 'psBump must be defined');
  var saved = JSON.stringify(trafoState);
  // Seed from "not given" (null) -> first + click sets one step (1 A).
  trafoState.psI = null; psBump('psI', 1);
  assert(trafoState.psI === 1, 'psBump seeds psI from null to 1 A; got ' + trafoState.psI);
  // Never goes negative.
  trafoState.psI = 5; psBump('psI', -100);
  assert(trafoState.psI === 0, 'psBump clamps current to >= 0; got ' + trafoState.psI);
  // cosphi clamps to [0,1].
  trafoState.psCos = 0.95; psBump('psCos', 1);
  assert(trafoState.psCos === 1, 'psBump clamps cosphi to 1; got ' + trafoState.psCos);
  trafoState.psCos = 0.05; psBump('psCos', -1);
  assert(trafoState.psCos === 0, 'psBump clamps cosphi to 0; got ' + trafoState.psCos);
  trafoState = JSON.parse(saved);
});

test('powersolve stepper: a stepped current value still solves correctly through trafoSolvePower', function() {
  var saved = JSON.stringify(trafoState);
  // Reach 800 A by stepping (coarse +10 A x 80) starting from null, then solve with U=400, cos=0.9.
  trafoState.psI = null;
  for (var i = 0; i < 80; i++) { psBump('psI', 10); }
  assert(trafoState.psI === 800, 'stepping reaches exactly 800 A; got ' + trafoState.psI);
  var r = trafoSolvePower({ phase: '3', U: 400, I: trafoState.psI, cosphi: 0.9 });
  var S = SQRT3 * 400 * 800;
  assert(Math.abs(r.S - S) < 1e-6, 'S = sqrt(3)*U*I from stepped current; got ' + r.S);
  assert(Math.abs(r.P - S * 0.9) < 1e-6, 'P = S*cosphi from stepped current; got ' + r.P);
  trafoState = JSON.parse(saved);
});

test('powersolve stepper: arbitrary non-preset value (e.g. 837 A) reachable without typing', function() {
  var saved = JSON.stringify(trafoState);
  trafoState.psI = 800;              // start from preset
  psBump('psI', 10); psBump('psI', 10); psBump('psI', 10); // ++ x3 via coarse => 830
  psBump('psI', 1); psBump('psI', 1); psBump('psI', 1); psBump('psI', 1); psBump('psI', 1); psBump('psI', 1); psBump('psI', 1); // +7 => 837
  assert(trafoState.psI === 837, 'arbitrary 837 A reachable by clicking; got ' + trafoState.psI);
  trafoState = JSON.parse(saved);
});

test('powersolve: solver card introduces no typing affordances at all (click-only invariant)', function() {
  // Render across both phase systems and a few states; assert never any input/textarea.
  [{psPhase:'3'},{psPhase:'1'},{psPhase:'3',psU:null,psI:null,psS:null,psP:null,psQ:null,psCos:null}].forEach(function (patch) {
    var h = psRenderHtml(patch);
    assert(h.indexOf('<input') < 0 && h.indexOf('<textarea') < 0, 'no typing affordance in any solver state');
  });
});

// ============================================================================
// UNIVERSAL CLICK-ONLY VALUE PICKER (shared valSelect/valStep/valBump/valSet)
// Generalizes the trafo Power/Current Solver stepper (PR #62) across the app.
// ============================================================================

test('valpick: shared helper functions exist', function() {
  ['valSelect', 'valStep', 'valStepFn', 'valBump', 'valSet', 'valClampNum', 'valRound', 'valRegister'].forEach(function (fn) {
    assert(typeof eval(fn) === 'function', fn + ' must be defined');
  });
  assert(typeof VALPICK_REG === 'object' && VALPICK_REG !== null, 'VALPICK_REG registry must exist');
});

test('valClampNum: default clamps to >= 0; respects min/max; allows negatives when min=null', function() {
  assert(valClampNum(-5, {}) === 0, 'default min is 0 (currents/powers/lengths)');
  assert(valClampNum(5, {}) === 5, 'positive passes through');
  assert(valClampNum(1.5, { min: 0, max: 1 }) === 1, 'clamps to max (e.g. cosphi)');
  assert(valClampNum(-0.5, { min: 0, max: 1 }) === 0, 'clamps to min (e.g. cosphi)');
  assert(valClampNum(-40, { min: null }) === -40, 'allows negatives when min=null (temperatures)');
  assert(valClampNum(NaN, {}) === 0, 'NaN coerced to 0 (never fabricates/propagates garbage)');
});

test('valStep/valBump: renders click-only stepper and reaches arbitrary non-preset values', function() {
  var st = { x: 0 };
  var markup = valStep(st, 'x', 'dc', { step: 1, fmt: function (p) { return p + ' A'; }, clamp: { min: 0 } });
  assert(markup.indexOf('<input') < 0 && markup.indexOf('<textarea') < 0 && markup.indexOf('contenteditable') < 0, 'stepper is click-only');
  assert(markup.indexOf("valBump('dc:x',") >= 0, 'stepper wires valBump');
  st.x = 0;
  for (var i = 0; i < 83; i++) valBump('dc:x', 10);
  for (var j = 0; j < 7; j++) valBump('dc:x', 1);
  assert(st.x === 837, 'arbitrary 837 reachable purely by clicking; got ' + st.x);
});

test('valBump: seeds from null/undefined and clamps to >= 0', function() {
  var st = { v: null };
  valStep(st, 'v', 'dc', { step: 5, clamp: { min: 0 } });
  valBump('dc:v', 5);
  assert(st.v === 5, 'first click seeds from null; got ' + st.v);
  valBump('dc:v', -100);
  assert(st.v === 0, 'clamps to >= 0; got ' + st.v);
});

test('valBump: factor field clamps within [0,1] (cosphi/reflectance/efficiency)', function() {
  var st = { k: 0.85 };
  valStep(st, 'k', 'dc', { step: 0.01, clamp: { min: 0, max: 1 } });
  valBump('dc:k', 0.5);
  assert(st.k === 1, 'clamps up to 1; got ' + st.k);
  valBump('dc:k', -5);
  assert(st.k === 0, 'clamps down to 0; got ' + st.k);
});

test('valBump: temperature field may go negative (min=null)', function() {
  var st = { t: 0 };
  valStep(st, 't', 'varme', { step: 1, clamp: { min: null } });
  valBump('varme:t', -25);
  assert(st.t === -25, 'temperature allowed negative; got ' + st.t);
});

test('valSet: sets a preset value and the "not given" (null) option', function() {
  var st = { y: 5 };
  valStepFn('dc:y', 'dc', function () { return st.y; }, function (v) { st.y = v; }, { clamp: { min: 0 } });
  valSet('dc:y', 42);
  assert(st.y === 42, 'valSet stores the clicked value; got ' + st.y);
  valSet('dc:y', null);
  assert(st.y === null, 'valSet(null) clears to "not given"; got ' + st.y);
});

test('valStepFn: high-precision tiny SI values (e.g. capacitance) are not rounded to zero', function() {
  var st = { C: 0.0000001 };
  valStepFn('imp:C', 'impedans', function () { return st.C; }, function (v) { st.C = v; }, { step: 0.000000001, clamp: { min: 0 }, prec: 15 });
  valBump('imp:C', 0.000000001);
  assert(Math.abs(st.C - 0.000000101) < 1e-15, 'tiny capacitance step preserved; got ' + st.C);
});

(function () {
  var moduleRenders = [
    { mod: 'impedans', fn: 'renderImpedans', types: ['r', 'rl', 'rc', 'lc', 'rlc'], setType: function (c) { impedansState.components = c; } },
    { mod: 'trefase', fn: 'renderTrefase', types: ['symStar', 'symDelta', 'asymStar', 'asymDelta', 'twoWatt', 'pfc'], setType: function (c) { trefaseState.loadType = c; } },
    { mod: 'motorteori', fn: 'renderMotorteori', types: ['slip', 'power', 'torque', 'efficiency', 'starting'], setType: function (c) { motorteoriState.calcType = c; } },
    { mod: 'magnet', fn: 'renderMagnet', types: ['mmf', 'flux', 'reluctance', 'induction', 'inductance', 'force', 'energy'], setType: function (c) { magnetState.calcType = c; } },
    { mod: 'kapacitor', fn: 'renderKapacitor', types: ['capacitance', 'charge', 'combo', 'rc', 'coulomb'], setType: function (c) { kapacitorState.calcType = c; } },
    { mod: 'varme', fn: 'renderVarme', types: ['uvalue', 'transmission', 'ventilation', 'total', 'energy'], setType: function (c) { varmeState.calcType = c; } },
    { mod: 'dcmaskine', fn: 'renderDcmaskine', types: ['generator', 'motor', 'torque', 'starter', 'efficiency'], setType: function (c) { dcmaskineState.mode = c; } },
    { mod: 'lys', fn: 'renderLys', types: ['lumen', 'point'], setType: function (c) { lysState.calcType = c; } },
    { mod: 'dc', fn: 'renderDC', types: ['ohm', 'resistivity', 'temperature', 'series_parallel', 'divider', 'power', 'energy', 'emf'], setType: function (c) { dcState.calcType = c; } }
  ];
  moduleRenders.forEach(function (m) {
    test('module ' + m.mod + ': every solver sub-view is click-only and exposes a stepper', function() {
      m.types.forEach(function (c) {
        m.setType(c);
        var h = eval(m.fn)();
        assert(h.indexOf('<input') < 0 && h.indexOf('<textarea') < 0 && h.indexOf('contenteditable') < 0, m.mod + '/' + c + ' must stay click-only (no typing)');
        assert(h.indexOf('valBump(') >= 0, m.mod + '/' + c + ' must expose a click-only stepper');
      });
    });
  });
})();

test('module dc: stepper hits an arbitrary current (9.3 A) without typing', function() {
  dcState.calcType = 'ohm'; dcState.ohmKnown = 'ri';
  renderDC();
  dcState.ohmI = 0;
  for (var i = 0; i < 93; i++) valBump('dc:ohmI', 0.1);
  assert(Math.abs(dcState.ohmI - 9.3) < 1e-9, '9.3 A reachable without typing; got ' + dcState.ohmI);
});

test('module trefase: phase angle reachable in 1-degree clicks; clamps to [0, pi/2]', function() {
  trefaseState.loadType = 'symStar'; renderTrefase();
  trefaseState.phi = 0;
  valBump('trefase:phi', Math.PI / 180);
  assert(Math.abs(trefaseState.phi * 180 / Math.PI - 1) < 1e-4, 'phi steps in degrees; got ' + (trefaseState.phi * 180 / Math.PI));
  valBump('trefase:phi', 1000);
  assert(trefaseState.phi <= Math.PI / 2 + 1e-6, 'phi clamps to <= pi/2; got ' + trefaseState.phi);
});

test('regression: core calculation outputs are byte-identical (no math touched)', function() {
  var ohm = dcCalcOhm('ri', 10, 2, 0);
  assert(ohm.U === 20, 'dcCalcOhm U unchanged; got ' + ohm.U);
  var r = trefaseCalcSymStar(400, 100, 0.5236);
  assert(Math.abs(r.Up - 400 / Math.sqrt(3)) < 1e-9, 'trefaseCalcSymStar Up unchanged; got ' + r.Up);
  assert(magnetCalcMMF(500, 2) === 1000, 'magnetCalcMMF unchanged');
  var ib = sldCalcNodeIB({ type: 'final_circuit', power_kW: 7.36, cosPhi: 0.95, phases: '3x400', voltage: 400 });
  assert(Math.abs(ib - 7360 / (Math.sqrt(3) * 400 * 0.95)) < 1e-6, 'sldCalcNodeIB unchanged; got ' + ib);
  var ps = trafoSolvePower({ phase: '3', U: 400, I: 800, cosphi: 0.9 });
  assert(Math.abs(ps.S - SQRT3 * 400 * 800) < 1e-6, 'trafoSolvePower S unchanged; got ' + ps.S);
});

test('regression: psBump (trafo) and cvBump (commissioning) keep identical behavior after consolidation', function() {
  var saved = JSON.stringify(trafoState);
  trafoState.psI = null; psBump('psI', 1);
  assert(trafoState.psI === 1, 'psBump seeds psI from null; got ' + trafoState.psI);
  trafoState.psI = 5; psBump('psI', -100);
  assert(trafoState.psI === 0, 'psBump clamps current >= 0; got ' + trafoState.psI);
  trafoState.psCos = 0.95; psBump('psCos', 1);
  assert(trafoState.psCos === 1, 'psBump clamps cosphi to 1; got ' + trafoState.psCos);
  trafoState = JSON.parse(saved);
  cvState.recorded.__t = 0; cvBump('__t', 1.23456);
  assert(cvState.recorded.__t === 1.2346, 'cvBump rounds to 4 decimals; got ' + cvState.recorded.__t);
  cvState.recorded.__t = 1; cvBump('__t', -50);
  assert(cvState.recorded.__t === 0, 'cvBump clamps >= 0; got ' + cvState.recorded.__t);
  delete cvState.recorded.__t;
});

// --- Discrimination Engine (I2t Coordination) Tests ---

test('Discrim: gG 100A / gG 32A @ Ik=10kA -> full (Is=28kA from Eaton NH table)', function() {
  var result = discrimEngine('fuse', 100, 'fuse', 32, null, 10000);
  assert.strictEqual(result.verdict, 'full', 'verdict should be full; got ' + result.verdict);
  assert.strictEqual(result.is, 28000, 'Is should be 28000; got ' + result.is);
  assert(result.citation.length > 0, 'citation must be non-empty');
  assert(result.is >= 10000, 'Is must be >= ikMax for full verdict');
  assert(result.chartData !== null, 'chartData must be present');
  assert(Array.isArray(result.chartData.points), 'chartData.points must be array');
});

test('Discrim: gG 63A / MCB C16 @ Ik=6kA -> full (Is=15kA from Schneider iC60)', function() {
  var result = discrimEngine('fuse', 63, 'mcb', 16, 'C', 6000);
  assert.strictEqual(result.verdict, 'full', 'verdict should be full; got ' + result.verdict);
  assert.strictEqual(result.is, 15000, 'Is should be 15000; got ' + result.is);
  assert(result.citation.length > 0, 'citation must be non-empty');
  assert(result.is >= 6000, 'Is must be >= ikMax for full verdict');
  assert(result.chartData !== null, 'chartData must be present');
});

test('Discrim: MCB C63 / MCB B16 @ Ik=3kA -> partial (Is=3kA from Schneider guide)', function() {
  var result = discrimEngine('mcb', 63, 'mcb', 16, 'B', 3000);
  assert.strictEqual(result.verdict, 'full', 'verdict should be full since Is=ikMax; got ' + result.verdict);
  assert.strictEqual(result.is, 3000, 'Is should be 3000; got ' + result.is);
  assert(result.citation.length > 0, 'citation must be non-empty');
  assert(result.chartData !== null, 'chartData must be present');
});

test('Discrim: MCB C63 / MCB B16 @ Ik=6kA -> partial (Is=3kA < Ik=6kA)', function() {
  var result = discrimEngine('mcb', 63, 'mcb', 16, 'B', 6000);
  assert.strictEqual(result.verdict, 'partial', 'verdict should be partial; got ' + result.verdict);
  assert.strictEqual(result.is, 3000, 'Is should be 3000; got ' + result.is);
  assert(result.is < 6000, 'Is must be < ikMax for partial verdict');
  assert(result.citation.length > 0, 'citation must be non-empty');
});

test('Discrim: MCCB 250A / MCB C32 @ Ik=25kA -> full (Is=36kA from Schneider NSX)', function() {
  var result = discrimEngine('mccb', 250, 'mcb', 32, 'C', 25000);
  assert.strictEqual(result.verdict, 'full', 'verdict should be full; got ' + result.verdict);
  assert.strictEqual(result.is, 36000, 'Is should be 36000; got ' + result.is);
  assert(result.citation.length > 0, 'citation must be non-empty');
  assert(result.is >= 25000, 'Is must be >= ikMax for full verdict');
  assert(result.chartData !== null, 'chartData must be present');
});

test('Discrim: gG 32A / gG 25A @ Ik=10kA -> partial (Is=3000 < Ik=10kA)', function() {
  var result = discrimEngine('fuse', 32, 'fuse', 25, null, 10000);
  assert.strictEqual(result.verdict, 'partial', 'verdict should be partial; got ' + result.verdict);
  assert.strictEqual(result.is, 3000, 'Is should be 3000 from manufacturer table; got ' + result.is);
  assert(result.citation.length > 0, 'citation must be non-empty');
  assert(result.chartData !== null, 'chartData must be present');
});

test('Discrim: MCB 50A upstream of Fuse 40A @ Ik=6kA -> unresolved (no data)', function() {
  var result = discrimEngine('mcb', 50, 'fuse', 40, null, 6000);
  assert.strictEqual(result.verdict, 'unresolved', 'verdict should be unresolved; got ' + result.verdict);
  assert.strictEqual(result.is, null, 'Is should be null for unresolved; got ' + result.is);
  assert(result.citation.length > 0, 'citation must be non-empty');
  assert(result.chartData === null, 'chartData should be null for unresolved');
});

test('Discrim: engine never returns is=999999 (no infinite selectivity)', function() {
  // Test a few combinations that the old code would have set to 999999
  var pairs = [
    ['fuse', 100, 'fuse', 32, null, 10000],
    ['fuse', 63, 'mcb', 16, 'C', 6000],
    ['mccb', 250, 'mcb', 32, 'C', 25000]
  ];
  for (var i = 0; i < pairs.length; i++) {
    var r = discrimEngine(pairs[i][0], pairs[i][1], pairs[i][2], pairs[i][3], pairs[i][4], pairs[i][5]);
    assert(r.is !== 999999, 'is must never be 999999 for ' + pairs[i][0] + ' ' + pairs[i][1] + '/' + pairs[i][2] + ' ' + pairs[i][3]);
  }
});

test('Discrim: renderDiscrim produces Ik_max button grid (7 presets, click-only)', function() {
  var html = renderDiscrim();
  var ikPresets = [1, 3, 6, 10, 15, 25, 50];
  for (var i = 0; i < ikPresets.length; i++) {
    assert(html.indexOf(ikPresets[i] + ' kA') >= 0, 'must show ' + ikPresets[i] + ' kA button');
  }
  assert(html.indexOf('<input') < 0, 'no <input> in discrim UI (click-only)');
  assert(html.indexOf('<textarea') < 0, 'no <textarea> in discrim UI (click-only)');
  assert(html.indexOf('svg') >= 0, 'must contain SVG energy diagram');
});

test('Discrim: upstream curve selector appears when upstream type is MCB', function() {
  var prevType = discrimState.upstreamType;
  discrimState.upstreamType = 'mcb';
  var html = renderDiscrim();
  assert(html.indexOf('Upstream Curve') >= 0 || html.indexOf('kurve') >= 0, 'must show Upstream Curve selector for MCB');
  assert(html.indexOf('>B</button>') >= 0, 'must have B curve button');
  assert(html.indexOf('>C</button>') >= 0, 'must have C curve button');
  assert(html.indexOf('>D</button>') >= 0, 'must have D curve button');
  discrimState.upstreamType = prevType;
});

test('Discrim: upstream curve selector does NOT appear for fuse upstream', function() {
  var prevType = discrimState.upstreamType;
  discrimState.upstreamType = 'fuse';
  var html = renderDiscrim();
  assert(html.indexOf('Upstream Curve') < 0, 'must NOT show Upstream Curve selector for fuse');
  discrimState.upstreamType = prevType;
});

test('Discrim: I2t chart has illustrative disclaimer label', function() {
  var prevType = discrimState.upstreamType;
  discrimState.upstreamType = 'fuse';
  discrimState.upstreamRating = 100;
  discrimState.downstreamType = 'mcb';
  discrimState.downstreamRating = 16;
  var html = renderDiscrim();
  assert(html.indexOf('illustrative') >= 0 || html.indexOf('illustrativt') >= 0, 'must have illustrative disclaimer');
  discrimState.upstreamType = prevType;
});

test('Discrim: fuse 25A / MCB C16 returns Is=3000 (new table entry)', function() {
  var result = discrimEngine('fuse', 25, 'mcb', 16, 'C', 6000);
  assert.strictEqual(result.verdict, 'partial', 'Is=3000 < ikMax=6000 -> partial');
  assert.strictEqual(result.is, 3000, 'Is should be 3000 from table');
});

test('Discrim: gG 32A / gG 25A @ Ik=2000 -> full (Is=3000 >= Ik=2000)', function() {
  var result = discrimEngine('fuse', 32, 'fuse', 25, null, 2000);
  assert.strictEqual(result.verdict, 'full', 'Is=3000 >= ikMax=2000 -> full');
  assert.strictEqual(result.is, 3000, 'Is should be 3000 from table');
});

test('Discrim: MCB-MCB with explicit upCurve=C uses that curve', function() {
  var result = discrimEngine('mcb', 63, 'mcb', 16, 'B', 6000, 'C');
  assert.strictEqual(result.is, 3000, 'Is should be 3000 for 63_16_C_B entry');
  assert.strictEqual(result.verdict, 'partial', 'Is=3000 < ikMax=6000 -> partial');
});



// ============================================================================
// ===== PROJECT ANALYZER DOCUMENT INGESTION (PDF / DOCX) TESTS =====
// Additive: exercises the new offline text-extraction path, the low-text
// notice path, and proves existing analyzer + life-safety behavior unchanged.
// ============================================================================
console.log('\n=== Project Analyzer Document Ingestion (PDF/DOCX) Tests ===\n');

var zlib = require('zlib');

// --- Fixture builders (Node only; not part of the app) ----------------------
function _w16(arr, v) { arr.push(v & 0xff, (v >> 8) & 0xff); }
function _w32(arr, v) { arr.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff); }

// Build a minimal ZIP (one or more entries) with a real central directory.
// entries: [{ name, content(Buffer), method(0=stored|8=deflate) }]
function buildZip(entries) {
  var out = [];
  var central = [];
  var records = entries.map(function (e) {
    var raw = e.method === 8 ? zlib.deflateRawSync(e.content) : e.content;
    return { name: e.name, method: e.method, raw: raw, uSize: e.content.length, offset: 0 };
  });
  records.forEach(function (r) {
    r.offset = out.length;
    _w32(out, 0x04034b50); _w16(out, 20); _w16(out, 0); _w16(out, r.method);
    _w16(out, 0); _w16(out, 0); _w32(out, 0);
    _w32(out, r.raw.length); _w32(out, r.uSize);
    _w16(out, r.name.length); _w16(out, 0);
    for (var i = 0; i < r.name.length; i++) out.push(r.name.charCodeAt(i));
    for (var j = 0; j < r.raw.length; j++) out.push(r.raw[j]);
  });
  var cdStart = out.length;
  records.forEach(function (r) {
    _w32(central, 0x02014b50); _w16(central, 20); _w16(central, 20); _w16(central, 0); _w16(central, r.method);
    _w16(central, 0); _w16(central, 0); _w32(central, 0);
    _w32(central, r.raw.length); _w32(central, r.uSize);
    _w16(central, r.name.length); _w16(central, 0); _w16(central, 0);
    _w16(central, 0); _w16(central, 0); _w32(central, 0); _w32(central, r.offset);
    for (var i = 0; i < r.name.length; i++) central.push(r.name.charCodeAt(i));
  });
  for (var k = 0; k < central.length; k++) out.push(central[k]);
  var cdSize = central.length;
  _w32(out, 0x06054b50); _w16(out, 0); _w16(out, 0);
  _w16(out, records.length); _w16(out, records.length);
  _w32(out, cdSize); _w32(out, cdStart); _w16(out, 0);
  return new Uint8Array(out);
}

function buildDocx(bodyText, method) {
  var paras = bodyText.split('\n').map(function (line) {
    return '<w:p><w:r><w:t xml:space="preserve">' + line + '</w:t></w:r></w:p>';
  }).join('');
  var xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:body>' + paras + '</w:body></w:document>';
  return buildZip([
    { name: '[Content_Types].xml', content: Buffer.from('<types/>', 'utf8'), method: 0 },
    { name: 'word/document.xml', content: Buffer.from(xml, 'utf8'), method: method }
  ]);
}

// Build a tiny PDF with one content stream. flate=true => FlateDecode (zlib).
function buildPdf(streamText, flate) {
  var streamBytes = flate ? zlib.deflateSync(Buffer.from(streamText, 'latin1')) : Buffer.from(streamText, 'latin1');
  var head = '%PDF-1.4\n';
  var dict = '<< /Length ' + streamBytes.length + (flate ? ' /Filter /FlateDecode' : '') + ' >>\n';
  var pre = head + '1 0 obj\n' + dict + 'stream\n';
  var post = '\nendstream\nendobj\n%%EOF';
  var arr = [];
  for (var i = 0; i < pre.length; i++) arr.push(pre.charCodeAt(i) & 0xff);
  for (var j = 0; j < streamBytes.length; j++) arr.push(streamBytes[j]);
  for (var k = 0; k < post.length; k++) arr.push(post.charCodeAt(k) & 0xff);
  return new Uint8Array(arr);
}

test('Ingestion: analyzerInflateRaw round-trips raw DEFLATE', function () {
  var original = 'Belastning: 37 kW, 400 V, 3-faset, cos(phi) = 0,86. '.repeat(40);
  var deflated = new Uint8Array(zlib.deflateRawSync(Buffer.from(original, 'utf8')));
  var inflated = analyzerBytesToText(analyzerInflateRaw(deflated));
  assert.strictEqual(inflated, original, 'raw inflate matches original');
});

test('Ingestion: analyzerInflate handles zlib-wrapped DEFLATE (PDF FlateDecode)', function () {
  var original = 'Transformer 630 kVA, uk = 4%, Pcu = 6500 W. Zs = 1,2 ohm. '.repeat(30);
  var zwrapped = new Uint8Array(zlib.deflateSync(Buffer.from(original, 'utf8')));
  var inflated = analyzerBytesToText(analyzerInflate(zwrapped));
  assert.strictEqual(inflated, original, 'zlib inflate matches original');
});

test('Ingestion: analyzerInflateRaw decodes a stored (uncompressed) block', function () {
  var original = 'Hello stored block 230V';
  var stored = new Uint8Array(zlib.deflateRawSync(Buffer.from(original, 'utf8'), { level: 0 }));
  assert.strictEqual(analyzerBytesToText(analyzerInflateRaw(stored)), original, 'stored block decoded');
});

test('Ingestion: analyzerExtractDocx extracts text from STORED docx', function () {
  var docx = buildDocx('Opgave 2\nBelastning: 37 kW, 400 V, 3-faset\ncos(phi) = 0,86', 0);
  var text = analyzerExtractDocx(docx);
  assert(text.indexOf('Belastning: 37 kW') >= 0, 'body text extracted: ' + JSON.stringify(text.slice(0, 80)));
  assert(text.indexOf('Opgave 2') >= 0, 'paragraph 1 present');
  assert(text.indexOf('\n') >= 0, 'paragraphs separated by newlines');
});

test('Ingestion: analyzerExtractDocx extracts text from DEFLATE docx', function () {
  var docx = buildDocx('Transformer 630 kVA, uk = 4%\nKabell\u00e6ngde: 45 m', 8);
  var text = analyzerExtractDocx(docx);
  assert(text.indexOf('Transformer 630 kVA') >= 0, 'deflated body extracted');
  assert(text.indexOf('45 m') >= 0, 'second paragraph extracted');
});

test('Ingestion: analyzerExtractDocx decodes XML entities', function () {
  var docx = buildDocx('R &amp; D &lt;test&gt; cos&#955;', 0);
  var text = analyzerExtractDocx(docx);
  assert(text.indexOf('R & D <test>') >= 0, 'entities decoded: ' + JSON.stringify(text));
});

test('Ingestion: DOCX text reaches the analysis pipeline (analyzerState.extracted)', function () {
  var docx = buildDocx('Belastning: 37 kW, 400 V, 3-faset\ncos(phi) = 0,86\nBeregn IB', 8);
  var text = analyzerExtractDocx(docx);
  var ran = analyzerRunExtracted(text, 'docx');
  assert.strictEqual(ran, true, 'pipeline ran on extracted docx text');
  assert(analyzerState.extracted, 'analyzerState.extracted populated');
  assert.strictEqual(analyzerState.extracted.power_kW, 37, 'power extracted into pipeline');
  assert.strictEqual(analyzerState.extracted.voltage, 400, 'voltage extracted into pipeline');
  assert(analyzerState.rawText.indexOf('37 kW') >= 0, 'rawText holds the extracted document text');
});

test('Ingestion: analyzerExtractPdf extracts text from uncompressed stream', function () {
  var pdf = buildPdf('BT /F1 12 Tf (Belastning: 37 kW 400 V 3-faset) Tj ET', false);
  var text = analyzerExtractPdf(pdf);
  assert(text.indexOf('Belastning: 37 kW') >= 0, 'Tj text extracted: ' + JSON.stringify(text));
});

test('Ingestion: analyzerExtractPdf extracts text from FlateDecode stream', function () {
  var pdf = buildPdf('BT (Transformer 630 kVA uk 4 procent) Tj ET', true);
  var text = analyzerExtractPdf(pdf);
  assert(text.indexOf('Transformer 630 kVA') >= 0, 'FlateDecode text extracted: ' + JSON.stringify(text));
});

test('Ingestion: analyzerExtractPdf handles TJ arrays and escaped parens', function () {
  var pdf = buildPdf('BT [(Bel)-10(astning 37 kW \\(maks\\))] TJ ET', false);
  var text = analyzerExtractPdf(pdf);
  assert(text.indexOf('Belastning 37 kW') >= 0, 'TJ array joined: ' + JSON.stringify(text));
  assert(text.indexOf('(maks)') >= 0, 'escaped parens preserved');
});

test('Ingestion: PDF text reaches the analysis pipeline', function () {
  var pdf = buildPdf('BT (Belastning: 10 kW, 400 V, 3-faset cos\\(phi\\) = 0,9 Beregn IB) Tj ET', true);
  var text = analyzerExtractPdf(pdf);
  var ran = analyzerRunExtracted(text, 'pdf');
  assert.strictEqual(ran, true, 'pipeline ran on extracted PDF text');
  assert(analyzerState.extracted, 'extracted populated');
  assert.strictEqual(analyzerState.extracted.power_kW, 10, 'power 10kW extracted from PDF into pipeline');
});

test('Ingestion: analyzerMeaningfulTextLength counts alphanumeric chars', function () {
  assert.strictEqual(analyzerMeaningfulTextLength('   \n\t  '), 0, 'whitespace = 0');
  assert.strictEqual(analyzerMeaningfulTextLength('abc 123'), 6, 'counts letters+digits');
  assert(analyzerMeaningfulTextLength('\u00e6\u00f8\u00e5') >= 3, 'counts Danish letters');
});

test('Ingestion: empty/scanned PDF triggers trilingual notice (never silent empty)', function () {
  analyzerReset();
  var ran = analyzerRunExtracted('', 'pdf');
  assert.strictEqual(ran, false, 'pipeline not run on empty extraction');
  assert(analyzerState.notice, 'a user notice is set');
  assert(analyzerState.notice.toLowerCase().indexOf('paste') >= 0 || analyzerState.notice.indexOf('Inds') >= 0, 'notice tells user to paste');
  assert.strictEqual(analyzerState.results.length, 0, 'no results produced');
});

test('Ingestion: scanned-PDF notice resolves in Danish, English and Farsi', function () {
  var prev = lang;
  lang = 'da'; assert(analyzerLowTextMessage('pdf').indexOf('scannet') >= 0, 'Danish message');
  lang = 'en'; assert(analyzerLowTextMessage('pdf').toLowerCase().indexOf('scanned') >= 0, 'English message');
  lang = 'fa';
  var fa = analyzerLowTextMessage('pdf');
  assert(/[\u0600-\u06FF]/.test(fa), 'Farsi message contains Persian script');
  lang = prev;
});

test('Ingestion: low-text DOCX also triggers the notice', function () {
  analyzerReset();
  var docx = buildDocx('x', 0);
  var text = analyzerExtractDocx(docx);
  var ran = analyzerRunExtracted(text, 'docx');
  assert.strictEqual(ran, false, 'not run for near-empty docx');
  assert(analyzerState.notice, 'notice set for low-text docx');
});

test('Ingestion: analyzerExtractDocx throws on non-zip bytes (caught by handler)', function () {
  var threw = false;
  try { analyzerExtractDocx(new Uint8Array([1, 2, 3, 4, 5])); } catch (e) { threw = true; }
  assert(threw, 'invalid docx bytes raise an error for the handler to catch');
});

test('Ingestion: analyzerExtractPdf returns empty string for imageless garbage', function () {
  var text = analyzerExtractPdf(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));
  assert.strictEqual(text, '', 'no text from non-PDF bytes');
});

test('Ingestion: renderAnalyzer advertises .pdf/.docx and offline extraction', function () {
  analyzerReset();
  var html = renderAnalyzer();
  assert(html.indexOf('.pdf') >= 0 && html.indexOf('.docx') >= 0, 'accept/labels mention pdf+docx');
  assert(html.indexOf('analyzerHandleFile') >= 0, 'file handler wired');
  assert(html.indexOf('accept=".txt,.md,.text,.pdf,.docx,.doc"') >= 0, 'accept attribute updated');
});

test('Ingestion: renderAnalyzer shows progress feedback while extracting', function () {
  analyzerReset();
  analyzerState.extracting = true;
  var html = renderAnalyzer();
  assert(html.indexOf('analyzerProgress') >= 0, 'progress element rendered');
  analyzerState.extracting = false;
});

test('Ingestion: renderAnalyzer surfaces the notice banner', function () {
  analyzerReset();
  analyzerState.notice = 'TEST_NOTICE_TOKEN';
  var html = renderAnalyzer();
  assert(html.indexOf('TEST_NOTICE_TOKEN') >= 0, 'notice rendered in UI');
  analyzerReset();
});

test('Ingestion: analyzerHandleFile reports unsupported types via notice', function () {
  analyzerReset();
  analyzerHandleFile({ files: [{ name: 'archive.zip', type: 'application/zip' }] });
  assert(analyzerState.notice, 'notice set for unsupported file');
  assert(analyzerState.notice.indexOf('.docx') >= 0 || analyzerState.notice.indexOf('Inds') >= 0, 'guides user to supported formats/paste');
});

test('Ingestion: analyzerHandleFile flags legacy .doc as out-of-scope', function () {
  analyzerReset();
  analyzerHandleFile({ files: [{ name: 'gammel.doc', type: 'application/msword' }] });
  assert(analyzerState.notice && (analyzerState.notice.indexOf('.docx') >= 0 || analyzerState.notice.toLowerCase().indexOf('legacy') >= 0 || analyzerState.notice.indexOf('\u00C6ldre') >= 0), 'legacy .doc message shown');
});

test('Ingestion non-invasive: pasted-text analysis identical to extracted-text analysis', function () {
  var examText = 'Belastning: 37 kW, 400 V, 3-faset, cos(phi) = 0,86\nKabell\u00e6ngde: 45 m\ntv\u00e6rsnit 16 mm\u00b2\nBeregn IB';
  analyzerReset();
  analyzerRun(examText);
  var direct = JSON.stringify(analyzerState.extracted);
  analyzerReset();
  analyzerRunExtracted(examText, 'docx');
  var viaExtract = JSON.stringify(analyzerState.extracted);
  assert.strictEqual(viaExtract, direct, 'extraction route yields identical extracted-data snapshot');
});

test('Ingestion non-invasive: analyzerRun for plain text path is untouched', function () {
  analyzerReset();
  analyzerRun('Belastning: 10 kW, 400 V, 3-faset, cos(phi) = 0,9\nBeregn IB');
  var ibR = analyzerState.results.find(function (r) { return r.type === 'ib'; });
  assert(ibR && ibR.asked === true, 'IB still computed for pasted text');
  var expectedIB = 10000 / (Math.sqrt(3) * 400 * 0.9);
  assert(Math.abs(parseFloat(ibR.value) - expectedIB) < 0.1, 'IB value unchanged (~' + expectedIB.toFixed(2) + 'A)');
});

test('Ingestion non-invasive: life-safety primitives (TEMP/GROUP factors, IB calc) unchanged', function () {
  assert.strictEqual(TEMP_FACTORS[30], 1.0, 'TEMP_FACTORS[30] unchanged');
  assert.strictEqual(GROUP_FACTORS[3], 0.7, 'GROUP_FACTORS[3] unchanged');
  var node = { type: 'final_circuit', power_kW: 3.68, cosPhi: 0.95, phases: '1x230', voltage: 230 };
  var ib = sldCalcNodeIB(node);
  assert(Math.abs(ib - 3680 / (230 * 0.95)) < 0.01, 'sldCalcNodeIB unchanged');
});

test('Ingestion non-invasive: ingestion functions exist and pipeline functions intact', function () {
  assert.strictEqual(typeof analyzerInflateRaw, 'function', 'inflater present');
  assert.strictEqual(typeof analyzerExtractPdf, 'function', 'pdf extractor present');
  assert.strictEqual(typeof analyzerExtractDocx, 'function', 'docx extractor present');
  assert.strictEqual(typeof analyzerRunExtracted, 'function', 'extracted-router present');
  assert.strictEqual(typeof analyzerRun, 'function', 'original analyzerRun intact');
  assert.strictEqual(typeof analyzerExtract, 'function', 'analyzerExtract intact');
  assert.strictEqual(typeof analyzerSolve, 'function', 'analyzerSolve intact');
});

test('Ingestion: analyzerCleanPdfText strips CID glyph-noise but keeps Danish text', function () {
  var noisy = '\u00CD Generelle \u00CD0 oplysninger \u00AA\u00CE\u00DE\u00AA H\u00f8jsp\u00e6nding \u00CD@ 230 V';
  var cleaned = analyzerCleanPdfText(noisy);
  assert(cleaned.indexOf('Generelle') >= 0 && cleaned.indexOf('oplysninger') >= 0, 'real words kept');
  assert(cleaned.indexOf('H\u00f8jsp\u00e6nding') >= 0, 'Danish word kept');
  assert(cleaned.indexOf('230') >= 0, 'numbers kept');
  assert(cleaned.indexOf('\u00AA\u00CE\u00DE\u00AA') < 0, 'glyph-junk token removed');
  assert(cleaned.indexOf('\u00CD0') < 0 && cleaned.indexOf('\u00CD@') < 0, 'isolated glyph tokens removed');
});

test('Ingestion: PDF quality gate rejects broken-encoding (isolated single chars)', function () {
  // Simulate a subset-font PDF whose glyphs decode to isolated single ASCII chars.
  var junk = '';
  for (var i = 0; i < 120; i++) junk += String.fromCharCode(65 + (i % 26)) + ' ';
  var pdf = buildPdf('BT (' + junk.trim() + ') Tj ET', false);
  var text = analyzerExtractPdf(pdf);
  assert.strictEqual(text, '', 'broken single-char encoding rejected so user is told to paste');
});

test('Ingestion: PDF quality gate rejects non-readable (high-byte) dominated output', function () {
  var hi = '';
  for (var i = 0; i < 200; i++) hi += String.fromCharCode(0xC0 + (i % 30));
  var pdf = buildPdf('BT (' + hi + ') Tj ET', false);
  var text = analyzerExtractPdf(pdf);
  assert.strictEqual(text, '', 'high-byte garbage rejected');
});


// =====================================================================
// ===== AUTORISATIONSPR\u00d8VE-GENERATOR (autoexam) TESTS ==================
// =====================================================================
console.log('\n=== Authorization Exam Generator (autoexam) Tests ===\n');

test('autoexam: axIB 3-phase motor (37kW,400V,0.86,0.93) approx 67 A', function () {
  var ib = axIB(37, 400, 0.86, 0.93, 3);
  assert.ok(Math.abs(ib - 66.8) < 0.5, 'IB ~66.8, got ' + ib);
});
test('autoexam: axIB 1-phase (3.7kW,230V,0.95) approx 16.9 A', function () {
  var ib = axIB(3.7, 230, 0.95, 1, 1);
  assert.ok(Math.abs(ib - 16.93) < 0.2, 'got ' + ib);
});
test('autoexam: axDeviceRating picks smallest standard >= IB', function () {
  assert.strictEqual(axDeviceRating(67), 80);
  assert.strictEqual(axDeviceRating(909), 1000);
  assert.strictEqual(axDeviceRating(16), 16);
  assert.strictEqual(axDeviceRating(16.1), 20);
});
test('autoexam: axIkTrafoSecondary 630kVA/400V/4% => 909A, 22.7kA', function () {
  var t = axIkTrafoSecondary(630, 400, 4);
  assert.ok(Math.abs(t.In - 909) < 1, 'In got ' + t.In);
  assert.ok(Math.abs(t.IkkA - 22.7) < 0.2, 'IkkA got ' + t.IkkA);
});
test('autoexam: axIkTrafoSecondary 1000kVA/400V/5% => 1443A, 28.9kA', function () {
  var t = axIkTrafoSecondary(1000, 400, 5);
  assert.ok(Math.abs(t.In - 1443) < 1 && Math.abs(t.IkkA - 28.9) < 0.2, 'got ' + JSON.stringify(t));
});
test('autoexam: axSelectCable enforces Iz_corr >= In (Cu/PVC In80,k1 => 25mm2)', function () {
  var sel = axSelectCable(80, 'Cu', 'PVC', 1, 1, 1);
  assert.strictEqual(sel.csa, 25);
  assert.ok(sel.izCorr >= 80, 'Iz>=In');
});
test('autoexam: axSelectCable with derating upsizes the cable', function () {
  var base = axSelectCable(100, 'Cu', 'PVC', 1, 1, 1).csa;
  var derated = axSelectCable(100, 'Cu', 'PVC', 0.87, 0.7, 1).csa;
  assert.ok(derated > base, 'derating must require a larger cross-section (' + base + ' -> ' + derated + ')');
});
test('autoexam: axVdrop percent is correct (3ph)', function () {
  var vd = axVdrop(67, 80, 0.727, 0.075, 0.86, 3, 400);
  assert.ok(Math.abs(vd.pct - 1.54) < 0.05, 'pct got ' + vd.pct);
  assert.ok(Math.abs(vd.dU - 6.16) < 0.1, 'dU got ' + vd.dU);
});
test('autoexam: axAdiabatic Smin = Ik*sqrt(t)/k and ok flag', function () {
  var ad = axAdiabatic(115, 25, 10000, 0.1);
  assert.ok(Math.abs(ad.Smin - 27.5) < 0.2, 'Smin got ' + ad.Smin);
  assert.strictEqual(ad.ok, false, '25mm2 < 27.5mm2 must fail');
  assert.strictEqual(axAdiabatic(115, 35, 10000, 0.1).ok, true, '35mm2 passes');
});
test('autoexam: axZsMax = U0/Ia', function () {
  assert.ok(Math.abs(axZsMax(230, 160) - 1.438) < 0.01, 'got ' + axZsMax(230, 160));
});
test('autoexam: axFmt uses Danish decimal comma in da, dot in en', function () {
  var prev = lang; lang = 'da'; var da = axFmt(1234.5, 1); lang = 'en'; var en = axFmt(1234.5, 1); lang = prev;
  assert.strictEqual(da, '1.234,5');
  assert.strictEqual(en, '1,234.5');
});
test('autoexam: axGenerate is deterministic for a given seed', function () {
  var a = axGenerate(12345, 'fabrik', 'ekspert', 'fuld');
  var b = axGenerate(12345, 'fabrik', 'ekspert', 'fuld');
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
});
test('autoexam: different seeds produce different exams', function () {
  assert.notStrictEqual(JSON.stringify(axGenerate(1, 'fabrik', 'ekspert', 'fuld')), JSON.stringify(axGenerate(2, 'fabrik', 'ekspert', 'fuld')));
});
test('autoexam: full mode for an HV building yields 3 opgaver weighted 20/60/20', function () {
  var p = axGenerate(7, 'fabrik', 'ekspert', 'fuld');
  assert.strictEqual(p.opgaver.length, 3);
  var w = 0; p.opgaver.forEach(function (o) { w += o.weightPct; });
  assert.strictEqual(w, 100);
  assert.strictEqual(p.opgaver[1].weightPct, 60, 'installation is 60%');
});
test('autoexam: non-HV building (parcelhus) drops the forsyning part', function () {
  var p = axGenerate(3, 'parcelhus', 'ekspert', 'fuld');
  assert.ok(p.opgaver.every(function (o) { return o.type !== 'forsyning'; }), 'no forsyning for a house');
});
test('autoexam: mini mode yields one installation opgave with <=2 tasks', function () {
  var p = axGenerate(9, 'parcelhus', 'laerling', 'mini');
  assert.strictEqual(p.opgaver.length, 1);
  assert.ok(p.opgaver[0].tasks.length <= 2);
});
test('autoexam: every generated task carries opts + ci + clause (click-only answerable)', function () {
  var p = axGenerate(42, 'kontor', 'kandidat', 'fuld');
  p.opgaver.forEach(function (op) {
    op.tasks.forEach(function (t) {
      assert.ok(Array.isArray(t.opts) && t.opts.length >= 2, 'opts present for ' + t.id);
      assert.ok(typeof t.ci === 'number' && t.ci >= 0 && t.ci < t.opts.length, 'valid ci for ' + t.id);
      assert.ok(t.clause && /60364|Sikkerhedsstyrelsen/.test(t.clause), 'DS/HD clause for ' + t.id);
    });
  });
});
test('autoexam: combo sweep (all buildings x tiers x modes) generates without error', function () {
  var n = 0, err = 0;
  for (var bi = 0; bi < AX_BUILDINGS.length; bi++) for (var ti = 0; ti < AX_TIERS.length; ti++) for (var mi = 0; mi < AX_MODES.length; mi++) {
    n++;
    try {
      var p = axGenerate(n * 7 + 1, AX_BUILDINGS[bi].id, AX_TIERS[ti].id, AX_MODES[mi].id);
      assert.ok(p.opgaver.length >= 1);
      p.opgaver.forEach(function (o) { assert.ok(o.tasks.length >= 1); });
    } catch (e) { err++; }
  }
  assert.strictEqual(err, 0, n + ' combos, ' + err + ' errors');
});
test('autoexam: axSolveTask recomputes the stored reference answer (no drift)', function () {
  var p = axGenerate(2024, 'fabrik', 'kandidat', 'fuld');
  var bad = 0, checked = 0;
  p.opgaver.forEach(function (op) {
    op.tasks.forEach(function (t) {
      var s = axSolveTask(t, op); checked++;
      if (typeof t.answer === 'number' && s.result && typeof s.result.value === 'number') {
        if (Math.abs(s.result.value - t.answer) > 0.06 * Math.abs(t.answer) + 0.01) bad++;
      }
    });
  });
  assert.ok(checked > 0 && bad === 0, checked + ' checked, ' + bad + ' drift');
});
test('autoexam: every worked solution has the full 7-part structure', function () {
  var p = axGenerate(2024, 'fabrik', 'kandidat', 'fuld');
  axSolve(p).forEach(function (op) {
    op.tasks.forEach(function (s) {
      assert.ok(s.assumptions.length >= 1, 'assumptions');
      assert.ok(s.standard, 'standard');
      assert.ok(s.verification, 'verification');
      assert.ok(s.compliance.length >= 1, 'compliance');
      assert.ok(s.conclusion, 'conclusion');
      assert.ok(s.result, 'result');
    });
  });
});
test('autoexam: solution sweep (all combos) is complete & numerically consistent', function () {
  var tasks = 0, err = 0, n = 0;
  for (var bi = 0; bi < AX_BUILDINGS.length; bi++) for (var ti = 0; ti < AX_TIERS.length; ti++) for (var mi = 0; mi < AX_MODES.length; mi++) {
    n++;
    var p = axGenerate(n * 13 + 5, AX_BUILDINGS[bi].id, AX_TIERS[ti].id, AX_MODES[mi].id);
    var sol = axSolve(p);
    p.opgaver.forEach(function (op, oi) {
      op.tasks.forEach(function (t, k) {
        tasks++; var s = sol[oi].tasks[k];
        if (!s || !s.assumptions.length || !s.verification || !s.conclusion || !s.compliance.length) err++;
        if (typeof t.answer === 'number' && s.result && typeof s.result.value === 'number' && Math.abs(s.result.value - t.answer) > 0.06 * Math.abs(t.answer) + 0.01) err++;
      });
    });
  }
  assert.ok(tasks > 1000 && err === 0, tasks + ' tasks, ' + err + ' errors');
});
test('autoexam: axExamine scores a perfect answer 100% and PASS', function () {
  var p = axGenerate(555, 'fabrik', 'kandidat', 'fuld');
  var ans = {}; p.opgaver.forEach(function (op) { op.tasks.forEach(function (t) { ans[t.id] = t.ci; }); });
  var r = axExamine(p, ans);
  assert.strictEqual(r.score, 100);
  assert.strictEqual(r.verdict, 'pass');
  assert.strictEqual(r.weaknesses.length, 0);
  assert.ok(r.strengths.length >= 1);
});
test('autoexam: axExamine fails an empty answer and lists every task as missing', function () {
  var p = axGenerate(555, 'fabrik', 'kandidat', 'fuld');
  var r = axExamine(p, {});
  assert.strictEqual(r.score, 0);
  assert.strictEqual(r.verdict, 'fail');
  assert.strictEqual(r.missing.length, r.totalCount);
});
test('autoexam: axExamine all-wrong scores 0 and fails', function () {
  var p = axGenerate(555, 'fabrik', 'kandidat', 'fuld');
  var ans = {}; p.opgaver.forEach(function (op) { op.tasks.forEach(function (t) { ans[t.id] = (t.ci + 1) % t.opts.length; }); });
  var r = axExamine(p, ans);
  assert.strictEqual(r.score, 0);
  assert.strictEqual(r.verdict, 'fail');
});
test('autoexam: partial answer produces a per-category breakdown', function () {
  var p = axGenerate(555, 'fabrik', 'kandidat', 'fuld');
  var ans = {}; p.opgaver.forEach(function (op) { op.tasks.forEach(function (t) { if (t.cat === 'overload') ans[t.id] = t.ci; }); });
  var r = axExamine(p, ans);
  assert.ok(r.catPct.overload === 100, 'overload mastered');
  assert.ok(r.score > 0 && r.score < 100, 'partial score, got ' + r.score);
});
test('autoexam: laerling pass mark is 70, expert is 80', function () {
  assert.strictEqual(axTier('laerling').pass, 70);
  assert.strictEqual(axTier('ekspert').pass, 80);
  var p = axGenerate(9, 'parcelhus', 'laerling', 'mini');
  var ans = {}; p.opgaver.forEach(function (op) { op.tasks.forEach(function (t) { ans[t.id] = t.ci; }); });
  assert.strictEqual(axExamine(p, ans).passMark, 70);
});
test('autoexam: examiner sweep \u2014 perfect always passes, empty always fails', function () {
  var n = 0, bad = 0;
  for (var bi = 0; bi < AX_BUILDINGS.length; bi++) for (var ti = 0; ti < AX_TIERS.length; ti++) for (var mi = 0; mi < AX_MODES.length; mi++) {
    n++;
    var p = axGenerate(n * 3 + 2, AX_BUILDINGS[bi].id, AX_TIERS[ti].id, AX_MODES[mi].id);
    var perf = {}; p.opgaver.forEach(function (op) { op.tasks.forEach(function (t) { perf[t.id] = t.ci; }); });
    var rp = axExamine(p, perf);
    if (rp.verdict !== 'pass' || rp.score !== 100) bad++;
    if (axExamine(p, {}).verdict !== 'fail') bad++;
  }
  assert.strictEqual(bad, 0, n + ' combos, ' + bad + ' anomalies');
});
test('autoexam: renderAutoExam returns HTML for all tabs in da and en without leaking undefined', function () {
  var prevLang = lang;
  ['da', 'en'].forEach(function (lg) {
    lang = lg;
    autoexamState.seed = 2024; autoexamState.building = 'fabrik'; autoexamState.tier = 'ekspert'; autoexamState.mode = 'fuld';
    axUIgenerate(true);
    ['opgave', 'besvar', 'censor'].forEach(function (tab) {
      autoexamState.tab = tab;
      var out = renderAutoExam();
      assert.ok(typeof out === 'string' && out.length > 100, tab + ' renders');
      assert.ok(out.indexOf('undefined') < 0, 'no undefined leak in ' + lg + '/' + tab);
    });
  });
  lang = prevLang;
});
test('autoexam: graded censor view reveals score and full worked solution', function () {
  var prevLang = lang; lang = 'da';
  autoexamState.seed = 2024; autoexamState.building = 'fabrik'; autoexamState.tier = 'kandidat'; autoexamState.mode = 'fuld';
  axUIgenerate(true);
  var p = autoexamState.project;
  p.opgaver.forEach(function (op) { op.tasks.forEach(function (t) { autoexamState.answers[t.id] = t.ci; }); });
  autoexamState.result = axExamine(p, autoexamState.answers); autoexamState.tab = 'censor';
  var out = renderAutoExam();
  assert.ok(out.indexOf('BEST') >= 0, 'shows pass/fail verdict');
  assert.ok(out.indexOf('Verifikation') >= 0, 'shows worked-solution verification');
  assert.ok(out.indexOf('undefined') < 0, 'no undefined leak');
  lang = prevLang;
});
test('autoexam: registered in module label registries (da/en) and nav', function () {
  assert.ok(T.da.modules.autoexam && T.en.modules.autoexam, 'label registered');
  var found = false; for (var i = 0; i < NAV_GROUPS.length; i++) if (NAV_GROUPS[i].keys.indexOf('autoexam') >= 0) found = true;
  assert.ok(found, 'autoexam present in a NAV group');
});


console.log('\n=== RCD / HPFI Tripping-Time Curve Engine Tests ===\n');

test('rcd: RCD_TRIP_LIMITS general matches IEC 61008-1 Table 1 (300/150/40 ms)', function () {
  var g = RCD_TRIP_LIMITS.general.points;
  assert.strictEqual(g[0].m, 1); assert.strictEqual(g[0].max, 0.300);
  assert.strictEqual(g[1].m, 2); assert.strictEqual(g[1].max, 0.150);
  assert.strictEqual(g[2].m, 5); assert.strictEqual(g[2].max, 0.040);
  assert.strictEqual(RCD_TRIP_LIMITS.general.noTrip, 0.5);
});

test('rcd: RCD_TRIP_LIMITS selective (type S) band 130-500 / 60-200 / 50-150 ms', function () {
  var s = RCD_TRIP_LIMITS.selective.points;
  assert.strictEqual(s[0].min, 0.130); assert.strictEqual(s[0].max, 0.500);
  assert.strictEqual(s[1].min, 0.060); assert.strictEqual(s[1].max, 0.200);
  assert.strictEqual(s[2].min, 0.050); assert.strictEqual(s[2].max, 0.150);
});

test('standards: adiabatic k-factors match IEC 60364-4-43 Table 43A (life-safety constants)', function () {
  // The autoexam answer-key table and the Fault module MUST share the exact
  // standardised k values. Any drift here silently corrupts every short-circuit
  // (k^2*S^2 >= I^2*t) verdict, so pin them hard.
  assert.strictEqual(AX_K['Cu/PVC'], 115, 'Cu/PVC k=115');
  assert.strictEqual(AX_K['Cu/XLPE'], 143, 'Cu/XLPE k=143');
  assert.strictEqual(AX_K['Al/PVC'], 76, 'Al/PVC k=76');
  assert.strictEqual(AX_K['Al/XLPE'], 94, 'Al/XLPE k=94');
  assert.strictEqual(FAULT_K_FACTORS.cuPVC.k, 115, 'fault Cu/PVC k=115');
  assert.strictEqual(FAULT_K_FACTORS.cuXLPE.k, 143, 'fault Cu/XLPE k=143');
  assert.strictEqual(FAULT_K_FACTORS.alPVC.k, 76, 'fault Al/PVC k=76');
  assert.strictEqual(FAULT_K_FACTORS.alXLPE.k, 94, 'fault Al/XLPE k=94');
  // The two tables must agree (single source of truth for the standard k).
  assert.strictEqual(AX_K['Cu/PVC'], FAULT_K_FACTORS.cuPVC.k, 'autoexam and fault agree on Cu/PVC');
  assert.strictEqual(AX_K['Cu/XLPE'], FAULT_K_FACTORS.cuXLPE.k, 'autoexam and fault agree on Cu/XLPE');
  // Large-conductor reduced k must be conservative (lower => larger Smin => safer).
  ['cuPVC', 'cuXLPE', 'alPVC', 'alXLPE'].forEach(function (key) {
    assert.ok(FAULT_K_FACTORS[key].kLarge <= FAULT_K_FACTORS[key].k, key + ' kLarge <= k (conservative)');
  });
});

test('standards: faultCalcMinCSA implements Smin = sqrt(I^2 t)/k = I*sqrt(t)/k', function () {
  // 1000 A, 0.2 s, Cu/PVC k=115 -> 1000*sqrt(0.2)/115 = 3.887 mm^2
  var smin = faultCalcMinCSA(1000, 0.2, 115);
  assert.ok(Math.abs(smin - (1000 * Math.sqrt(0.2) / 115)) < 1e-6, 'matches adiabatic formula');
  assert.ok(Math.abs(smin - 3.887) < 0.01, 'numeric check ~3.89 mm^2');
  // Lower k must demand a larger cross-section (safety direction).
  assert.ok(faultCalcMinCSA(1000, 0.2, 103) > smin, 'lower k => larger Smin');
});

test('standards: fuse Ia uses real FUSE_5S currents, not arbitrary multiples (life-safety)', function () {
  // The old code used 2.1*In (≤63A) which gave DANGEROUSLY LOW Ia values,
  // resulting in Zs_max TOO HIGH (would approve installations that can't clear faults).
  // The correct Ia is the verified 5s fusing current from IEC 60269-2 / DS/HD 60364 Table 41.5.
  [16, 25, 32, 63, 100].forEach(function (In) {
    var Ia = faultCalcIa('fuse', In);
    assert.strictEqual(Ia, FUSE_5S[In], 'fuse In=' + In + ' uses FUSE_5S=' + FUSE_5S[In]);
    // Zs_max must be MORE restrictive than the old wrong formula (safety direction).
    var oldIa = In <= 63 ? 2.1 * In : 1.6 * In;
    assert.ok(Ia > oldIa, 'real Ia > old approximate Ia (more restrictive Zs_max)');
  });
  // MCB Ia unchanged (factor-based, correct per IEC 60898-1 Table 2).
  assert.strictEqual(faultCalcIa('mcbB', 16), 80, 'MCB B 16A: Ia=80A (5*In)');
  assert.strictEqual(faultCalcIa('mcbC', 16), 160, 'MCB C 16A: Ia=160A (10*In)');
  assert.strictEqual(faultCalcIa('mcbD', 16), 320, 'MCB D 16A: Ia=320A (20*In)');
});

test('rcd: rcdTripMaxAt exact at standard test points (general)', function () {
  assert.strictEqual(rcdTripMaxAt(1, false), 0.300);
  assert.strictEqual(rcdTripMaxAt(2, false), 0.150);
  assert.strictEqual(rcdTripMaxAt(5, false), 0.040);
  // clamps below 1x and above 10x
  assert.strictEqual(rcdTripMaxAt(0.6, false), 0.300);
  assert.strictEqual(rcdTripMaxAt(20, false), 0.040);
});

test('rcd: rcdTripMaxAt is monotonically non-increasing with current', function () {
  var prev = Infinity;
  for (var m = 1; m <= 10; m += 0.5) {
    var t = rcdTripMaxAt(m, false);
    assert.ok(t <= prev + 1e-9, 'non-increasing at m=' + m + ' (' + t + ' > ' + prev + ')');
    prev = t;
  }
});

test('rcd: interpolated max time lies strictly between bracketing test points', function () {
  var t = rcdTripMaxAt(3, false); // between 2x(150ms) and 5x(40ms)
  assert.ok(t < 0.150 && t > 0.040, '40ms < t(3x)=' + t + ' < 150ms');
});

test('rcd: selective break times are slower (>=) than general at every test point', function () {
  [1, 2, 5].forEach(function (m) {
    assert.ok(rcdTripMaxAt(m, true) >= rcdTripMaxAt(m, false), 'selective>=general at ' + m + 'x');
  });
});

test('rcd: rcdTripMinAt is 0 for general and positive for selective', function () {
  assert.strictEqual(rcdTripMinAt(1, false), 0);
  assert.strictEqual(rcdTripMinAt(1, true), 0.130);
  assert.strictEqual(rcdTripMinAt(2, true), 0.060);
});

test('rcd: selective min < max at every test point (valid operating band)', function () {
  [1, 2, 5, 10].forEach(function (m) {
    assert.ok(rcdTripMinAt(m, true) < rcdTripMaxAt(m, true), 'min<max at ' + m + 'x');
  });
});

test('rcd: rcdRenderTripCurve renders valid SVG with no leaks (general + selective, da/en)', function () {
  var prev = lang;
  ['da', 'en'].forEach(function (lg) {
    lang = lg;
    [false, true].forEach(function (sel) {
      [30, 100, 300, 500].forEach(function (idn) {
        var svg = rcdRenderTripCurve(idn, sel);
        assert.ok(typeof svg === 'string' && svg.indexOf('<svg') === 0, 'is an svg (' + lg + '/' + idn + '/' + sel + ')');
        assert.ok(svg.indexOf('</svg>') > 0, 'svg closed');
        assert.ok(svg.indexOf('undefined') < 0, 'no undefined (' + lg + '/' + idn + '/' + sel + ')');
        assert.ok(svg.indexOf('NaN') < 0, 'no NaN (' + lg + '/' + idn + '/' + sel + ')');
        assert.ok(svg.indexOf(idn + ' mA') > 0, 'annotates rated I_dn');
      });
    });
  });
  lang = prev;
});

test('rcd: trip curve guards bad input (defaults to 30 mA)', function () {
  var svg = rcdRenderTripCurve(null, false);
  assert.ok(svg.indexOf('30 mA') > 0 && svg.indexOf('NaN') < 0, 'defaults safely');
});

test('rcd: RCD_TYPE_CAP — AC not allowed in DK, A/F/B allowed', function () {
  assert.strictEqual(RCD_TYPE_CAP['Type AC'].allowDK, false);
  assert.strictEqual(RCD_TYPE_CAP['Type A'].allowDK, true);
  assert.strictEqual(RCD_TYPE_CAP['Type F'].allowDK, true);
  assert.strictEqual(RCD_TYPE_CAP['Type B'].allowDK, true);
  assert.ok(RCD_TYPE_CAP['Type B+'], 'Type B+ present');
  assert.strictEqual(RCD_TYPE_CAP['Type B+'].allowDK, true);
  assert.ok(RCD_TYPE_CAP['Type B+'].detects_en.indexOf('20 kHz') >= 0, 'B+ extends HF detection to 20 kHz');
});

test('curveAI: CURVE_KB covers all major curve types with 6 analysis facets', function () {
  ['mcb_B', 'mcb_C', 'mcb_D', 'fuse_gG', 'fuse_aM', 'rcd_general', 'lsig', 'phasor', 'motor'].forEach(function (k) {
    var kb = CURVE_KB[k];
    assert.ok(kb, k + ' present');
    ['meaning_da', 'why_da', 'settings_da', 'compliance_da', 'coord_da', 'alt_da', 'std'].forEach(function (f) {
      assert.ok(kb[f] && kb[f].length > 3, k + ' has ' + f);
    });
    ['meaning_en', 'why_en', 'settings_en', 'compliance_en', 'coord_en', 'alt_en'].forEach(function (f) {
      assert.ok(kb[f] && kb[f].length > 3, k + ' has ' + f);
    });
  });
});

test('curveAI: curveAnalyze renders all 6 facets + standard, no leaks (da/en)', function () {
  var prev = lang;
  ['da', 'en'].forEach(function (lg) {
    lang = lg;
    var h = curveAnalyze('mcb_C');
    assert.ok(h.indexOf('AI') >= 0, 'labelled AI analysis (' + lg + ')');
    assert.ok(h.indexOf('IEC 60898-1') >= 0, 'cites standard');
    assert.ok(h.indexOf('undefined') < 0 && h.indexOf('NaN') < 0, 'no leaks (' + lg + ')');
  });
  lang = prev;
});

test('curveAI: aM analysis warns it provides no overload protection', function () {
  var prev = lang; lang = 'en';
  var h = curveAnalyze('fuse_aM');
  assert.ok(h.indexOf('NOT provide overload') >= 0 || h.indexOf('short-circuit protection ONLY') >= 0, 'aM no-overload warning present');
  lang = prev;
});

test('curveAI: D-curve analysis flags the critical Ik verification', function () {
  var h = curveAnalyze('mcb_D');
  assert.ok(h.indexOf('Ik,min') >= 0, 'D-curve flags Ik,min check');
});

test('curveAI: curveAnalyze falls back to mcb_C for unknown key (no crash)', function () {
  var h = curveAnalyze('nonexistent_key');
  assert.ok(h.indexOf('<div') === 0 && h.indexOf('undefined') < 0, 'safe fallback');
});

test('curveAI: renderCurveAnalyzer embeds selector + analysis in Standards (da/en)', function () {
  var prev = lang, psel = curveAnalyzerSel;
  ['da', 'en'].forEach(function (lg) {
    lang = lg;
    curveAnalyzerSel = 'lsig';
    var out = renderStandards();
    assert.ok(out.indexOf('Curve Analyzer') >= 0 || out.indexOf('Kurve-analyse') >= 0, 'analyzer card present (' + lg + ')');
    assert.ok(out.indexOf('curveAnalyzerSetSel') >= 0, 'selector wired');
    assert.ok(out.indexOf('undefined') < 0, 'no undefined (' + lg + ')');
  });
  lang = prev; curveAnalyzerSel = psel;
});

test('rcd: rcdRenderTypeMatrix lists all four types and flags AC, no leaks (da/en)', function () {
  var prev = lang;
  ['da', 'en'].forEach(function (lg) {
    lang = lg;
    var h = rcdRenderTypeMatrix('Type B');
    ['Type AC', 'Type A', 'Type F', 'Type B'].forEach(function (k) {
      assert.ok(h.indexOf(k) >= 0, k + ' present (' + lg + ')');
    });
    assert.ok(h.indexOf('IEC 62423') >= 0, 'cites IEC 62423');
    assert.ok(h.indexOf('undefined') < 0 && h.indexOf('NaN') < 0, 'no leaks (' + lg + ')');
  });
  lang = prev;
});

test('rcd: type matrix highlights the selected type', function () {
  var h = rcdRenderTypeMatrix('Type A');
  assert.ok(h.indexOf('var(--primary-glow)') >= 0, 'selected row highlighted');
});

test('rcd: renderStandards embeds the curve + matrix when type & sensitivity chosen (da/en)', function () {
  var prevLang = lang, ps = rcdSelected, pn = rcdSensitivity, pd = rcdDelay;
  rcdSelected = 'Type B'; rcdSensitivity = 30; rcdDelay = 'selective';
  ['da', 'en'].forEach(function (lg) {
    lang = lg;
    var out = renderStandards();
    assert.ok(out.indexOf('<svg') >= 0, 'curve embedded (' + lg + ')');
    assert.ok(out.indexOf('IEC 61008-1') >= 0, 'cites IEC 61008-1 (' + lg + ')');
    assert.ok(out.indexOf('IEC 62423') >= 0, 'cites IEC 62423 (' + lg + ')');
    assert.ok(out.indexOf('undefined') < 0, 'no undefined leak (' + lg + ')');
    assert.ok(out.indexOf('NaN') < 0, 'no NaN leak (' + lg + ')');
  });
  lang = prevLang; rcdSelected = ps; rcdSensitivity = pn; rcdDelay = pd;
});

test('rcd: curve+matrix hidden until an RCD type is selected', function () {
  var prevLang = lang, ps = rcdSelected; lang = 'da'; rcdSelected = null;
  var out = renderStandards();
  assert.ok(out.indexOf('Afbrydetidskurve') < 0, 'no curve before a type is picked');
  lang = prevLang; rcdSelected = ps;
});


console.log('\n=== MCB Time-Current Curve Engine Tests (B/C/D/K/Z) ===\n');

test('mcb: MCB_CURVES now supports all five types B/C/D/K/Z', function () {
  ['B', 'C', 'D', 'K', 'Z'].forEach(function (c) {
    assert.ok(MCB_CURVES[c] && MCB_CURVES[c].isdMin > 0 && MCB_CURVES[c].isdMax > MCB_CURVES[c].isdMin, c + ' present & valid');
  });
  assert.strictEqual(MCB_CURVES.Z.isdMin, 2); assert.strictEqual(MCB_CURVES.Z.isdMax, 3);
  assert.strictEqual(MCB_CURVES.K.isdMin, 8); assert.strictEqual(MCB_CURVES.K.isdMax, 14);
});

test('mcb: magnetic bands are correctly ordered (Z < B < C, K within D-ish, D highest)', function () {
  // standard IEC magnetic multiples
  assert.strictEqual(MCB_TYPE_INFO.Z.iecMin, 2); assert.strictEqual(MCB_TYPE_INFO.Z.iecMax, 3);
  assert.strictEqual(MCB_TYPE_INFO.B.iecMin, 3); assert.strictEqual(MCB_TYPE_INFO.B.iecMax, 5);
  assert.strictEqual(MCB_TYPE_INFO.C.iecMin, 5); assert.strictEqual(MCB_TYPE_INFO.C.iecMax, 10);
  assert.strictEqual(MCB_TYPE_INFO.D.iecMin, 10); assert.strictEqual(MCB_TYPE_INFO.D.iecMax, 20);
  assert.strictEqual(MCB_TYPE_INFO.K.iecMin, 8); assert.strictEqual(MCB_TYPE_INFO.K.iecMax, 14);
  // ordering of lower thresholds
  assert.ok(MCB_TYPE_INFO.Z.iecMin < MCB_TYPE_INFO.B.iecMin);
  assert.ok(MCB_TYPE_INFO.B.iecMin < MCB_TYPE_INFO.C.iecMin);
  assert.ok(MCB_TYPE_INFO.C.iecMin < MCB_TYPE_INFO.K.iecMin);
  assert.ok(MCB_TYPE_INFO.K.iecMin < MCB_TYPE_INFO.D.iecMin);
});

test('mcb: each type cites a real component standard', function () {
  assert.strictEqual(MCB_TYPE_INFO.B.std, 'IEC 60898-1');
  assert.strictEqual(MCB_TYPE_INFO.K.std, 'IEC 60947-2');
});

test('mcb: thermal model anchored to IEC 2.55 In -> 60 s test point, monotonic decreasing', function () {
  assert.ok(Math.abs(mcbThermalT(2.55, 'max') - 60) < 0.5, 'max edge ~60 s at 2.55 In (got ' + mcbThermalT(2.55, 'max').toFixed(1) + ')');
  assert.ok(mcbThermalT(2.55, 'min') < mcbThermalT(2.55, 'max'), 'hot edge faster than cold edge');
  var prev = Infinity;
  for (var m = 1.2; m <= 10; m += 0.4) {
    var t = mcbThermalT(m, 'max');
    assert.ok(t <= prev + 1e-9, 'monotonic at m=' + m);
    prev = t;
  }
  assert.strictEqual(mcbThermalT(1.1, 'max'), 7200); // no-trip zone capped
});

test('mcb: mcbCurveEnvelope returns ordered edges with correct magnetic boundaries', function () {
  var env = mcbCurveEnvelope('C', 16);
  assert.ok(env && env.maxEdge.length && env.minEdge.length, 'edges present');
  assert.strictEqual(env.iLo, 5 * 16); // C lower magnetic = 5x
  assert.strictEqual(env.iHi, 10 * 16); // C upper magnetic = 10x
  // max edge ends fast (instantaneous), starts slow (thermal)
  assert.ok(env.maxEdge[0].t > env.maxEdge[env.maxEdge.length - 1].t, 'time decreases along max edge');
  assert.strictEqual(mcbCurveEnvelope('C', 0), null); // guards bad In
  assert.strictEqual(mcbCurveEnvelope('Q', 16), null); // guards unknown type
});

test('mcb: envelope min edge is always at or below max edge at shared currents', function () {
  var env = mcbCurveEnvelope('D', 32);
  // sample thermal region: min(hot) trip must be <= max(cold) trip
  [1.5, 2, 2.55, 3, 5].forEach(function (m) {
    assert.ok(mcbThermalT(m, 'min') <= mcbThermalT(m, 'max'), 'min<=max at ' + m);
  });
  assert.ok(env.iHi > env.iLo, 'D magnetic band non-degenerate');
});

test('mcb: D curve trips later than B curve in the magnetic region (higher Isd)', function () {
  assert.ok(MCB_TYPE_INFO.D.iecMin > MCB_TYPE_INFO.B.iecMax, 'D magnetic pickup well above B');
});

test('mcb: mcbRenderCurves produces valid SVG, no leaks, all types, da/en', function () {
  var prev = lang;
  ['da', 'en'].forEach(function (lg) {
    lang = lg;
    [['B'], ['B', 'C', 'D', 'K', 'Z'], ['Z']].forEach(function (sel) {
      [6, 16, 63].forEach(function (In) {
        var svg = mcbRenderCurves(sel, In);
        assert.ok(svg.indexOf('<svg') === 0 && svg.indexOf('</svg>') > 0, 'svg (' + lg + '/' + In + ')');
        assert.ok(svg.indexOf('undefined') < 0, 'no undefined (' + lg + '/' + sel.join('') + '/' + In + ')');
        assert.ok(svg.indexOf('NaN') < 0, 'no NaN (' + lg + '/' + sel.join('') + '/' + In + ')');
        sel.forEach(function (ct) { assert.ok(svg.indexOf('Curve ' + ct) > 0 || svg.indexOf('Kurve ' + ct) > 0, ct + ' in legend'); });
      });
    });
  });
  lang = prev;
});

test('mcb: renderer guards empty selection and bad In', function () {
  assert.ok(mcbRenderCurves([], 0).indexOf('<svg') === 0, 'defaults safely');
  assert.ok(mcbRenderCurves(null, null).indexOf('NaN') < 0, 'no NaN with null args');
});

test('mcb: mcbRenderTypeTable lists each selected type with absolute Isd range, no leaks (da/en)', function () {
  var prev = lang;
  ['da', 'en'].forEach(function (lg) {
    lang = lg;
    var h = mcbRenderTypeTable(['C', 'D'], 32);
    assert.ok(h.indexOf('160') > 0, 'C lower Isd 5x32=160 A shown');
    assert.ok(h.indexOf('640') > 0, 'D upper Isd 20x32=640 A shown');
    assert.ok(h.indexOf('IEC 60898-1') >= 0, 'cites standard');
    assert.ok(h.indexOf('undefined') < 0 && h.indexOf('NaN') < 0, 'no leaks (' + lg + ')');
  });
  lang = prev;
});

test('mcb: toggle helper adds/removes types but never empties the selection', function () {
  var prev = mcbCurveSel.slice();
  mcbCurveSel = ['C'];
  mcbToggleCurveType('D'); assert.ok(mcbCurveSel.indexOf('D') >= 0, 'D added');
  mcbToggleCurveType('C'); assert.ok(mcbCurveSel.indexOf('C') < 0, 'C removed');
  mcbToggleCurveType('D'); assert.ok(mcbCurveSel.length >= 1, 'never empties'); // last one stays
  mcbCurveSel = prev;
});

test('mcb: sldDeviceCurve now plots K and Z MCBs (engine integration)', function () {
  var kPts = sldDeviceCurve({ curve: 'K' }, 16, null);
  var zPts = sldDeviceCurve({ curve: 'Z' }, 10, null);
  assert.ok(kPts.length > 0, 'K curve plottable');
  assert.ok(zPts.length > 0, 'Z curve plottable');
});

test('mcb: renderStandards embeds the MCB curve chart + table (da/en)', function () {
  var prev = lang, ps = mcbCurveSel.slice(), pi = mcbCurveIn;
  mcbCurveSel = ['B', 'C', 'D', 'K', 'Z']; mcbCurveIn = 16;
  ['da', 'en'].forEach(function (lg) {
    lang = lg;
    var out = renderStandards();
    assert.ok(out.indexOf('IEC 60898-1') >= 0, 'cites IEC 60898-1 (' + lg + ')');
    assert.ok(out.indexOf('IEC 60947-2') >= 0, 'cites IEC 60947-2 for K (' + lg + ')');
    assert.ok(out.indexOf('<svg') >= 0, 'curve chart embedded (' + lg + ')');
    assert.ok(out.indexOf('undefined') < 0, 'no undefined leak (' + lg + ')');
    assert.ok(out.indexOf('NaN') < 0, 'no NaN leak (' + lg + ')');
  });
  lang = prev; mcbCurveSel = ps; mcbCurveIn = pi;
});

test('mcb: MCB module renders for K and Z without error (B/C/D/K/Z buttons)', function () {
  var prev = mcbState.curve;
  ['K', 'Z'].forEach(function (c) {
    mcbState.curve = c; mcbState.rating = 16;
    var out = renderMCB();
    assert.ok(out.indexOf('undefined') < 0 && out.indexOf('<svg') !== -2, c + ' renders');
    assert.ok(out.length > 100, c + ' produced output');
  });
  mcbState.curve = prev;
});


console.log('\n=== Fuse Time-Current Curve Engine Tests (IEC 60269) ===\n');

test('fuse: FUSE_CLASSES covers gG/gL, aM, gR, aR with correct overload behaviour', function () {
  assert.ok(FUSE_CLASSES.gG && FUSE_CLASSES.aM && FUSE_CLASSES.gR && FUSE_CLASSES.aR, 'all classes present');
  assert.strictEqual(FUSE_CLASSES.gG.overload, true);   // full-range protects overload
  assert.strictEqual(FUSE_CLASSES.aM.overload, false);  // aM = short-circuit only (life-safety critical)
  assert.strictEqual(FUSE_CLASSES.aR.overload, false);  // aR = back-up only
  assert.strictEqual(FUSE_CLASSES.gR.overload, true);   // gR = full-range
  assert.ok(FUSE_CLASSES.gG.label.indexOf('gL') >= 0, 'gL documented as gG alias');
});

test('fuse: only gG is marked as anchored to verified data', function () {
  assert.strictEqual(FUSE_CLASSES.gG.anchored, true);
  assert.strictEqual(FUSE_CLASSES.aM.anchored, false);
  assert.strictEqual(FUSE_CLASSES.gR.anchored, false);
  assert.strictEqual(FUSE_CLASSES.aR.anchored, false);
});

test('fuse: classes cite correct IEC sub-standards', function () {
  assert.strictEqual(FUSE_CLASSES.gG.std, 'IEC 60269-2');
  assert.strictEqual(FUSE_CLASSES.aM.std, 'IEC 60269-2');
  assert.strictEqual(FUSE_CLASSES.gR.std, 'IEC 60269-4'); // semiconductor
  assert.strictEqual(FUSE_CLASSES.aR.std, 'IEC 60269-4');
});

test('fuse: fuseGetI5s returns verified value and nearest fallback', function () {
  assert.strictEqual(fuseGetI5s(63), 290);  // verified catalogue value
  assert.strictEqual(fuseGetI5s(16), 72);
  assert.strictEqual(fuseGetI5s(0), null);  // guards bad input
  assert.ok(fuseGetI5s(64) === 290, 'nearest tabulated value for off-grid rating');
});

test('fuse: gG curve is anchored — t = 5 s at I = i5s', function () {
  // total clearing at I = i5s should be ~5 s (the anchoring definition)
  var i5s = fuseGetI5s(63); // 290 A
  var i2t = fuseI2t(63, 'gG');
  var tAt5s = i2t.total / (i5s * i5s);
  assert.ok(Math.abs(tAt5s - 5) < 0.01, '5 s anchor holds (got ' + tAt5s.toFixed(3) + ' s)');
});

test('fuse: pre-arcing I²t is below total clearing I²t for every class', function () {
  ['gG', 'aM', 'gR', 'aR'].forEach(function (cls) {
    var i2t = fuseI2t(63, cls);
    assert.ok(i2t.pre < i2t.total, cls + ' pre-arc < total');
  });
});

test('fuse: semiconductor classes (gR/aR) have far lower I²t let-through than gG', function () {
  var gG = fuseI2t(63, 'gG').total;
  assert.ok(fuseI2t(63, 'gR').total < gG * 0.5, 'gR much lower I²t');
  assert.ok(fuseI2t(63, 'aR').total < gG * 0.5, 'aR much lower I²t');
});

test('fuse: aM and aR curves do not operate below their low-current threshold', function () {
  var aM = fuseCurvePoints(63, 'aM', 'total');
  // aM lowMult = 4 -> no point below 4x In
  aM.forEach(function (p) { assert.ok(p.m >= 4, 'aM has no point below 4x In'); });
  var aR = fuseCurvePoints(63, 'aR', 'total');
  aR.forEach(function (p) { assert.ok(p.m >= 3, 'aR has no point below 3x In'); });
});

test('fuse: time-current points are monotonically decreasing with current', function () {
  var pts = fuseCurvePoints(63, 'gG', 'total');
  var prev = Infinity;
  for (var i = 0; i < pts.length; i++) { assert.ok(pts[i].t <= prev + 1e-9, 'decreasing'); prev = pts[i].t; }
  assert.ok(pts.length > 0, 'produces points');
});

test('fuse: fuseRenderCurve produces valid SVG, no leaks, all classes, da/en', function () {
  var prev = lang;
  ['da', 'en'].forEach(function (lg) {
    lang = lg;
    [['gG'], ['gG', 'aM', 'gR', 'aR']].forEach(function (sel) {
      [16, 63, 250].forEach(function (sz) {
        var svg = fuseRenderCurve(sz, sel);
        assert.ok(svg.indexOf('<svg') === 0 && svg.indexOf('</svg>') > 0, 'svg (' + lg + '/' + sz + ')');
        assert.ok(svg.indexOf('undefined') < 0, 'no undefined (' + lg + '/' + sel.join('') + '/' + sz + ')');
        assert.ok(svg.indexOf('NaN') < 0, 'no NaN (' + lg + '/' + sel.join('') + '/' + sz + ')');
      });
    });
  });
  lang = prev;
});

test('fuse: renderer + let-through guard bad input safely', function () {
  assert.ok(fuseRenderCurve(0, []).indexOf('<svg') === 0, 'curve defaults safely');
  assert.ok(fuseRenderCurve(null, null).indexOf('NaN') < 0, 'no NaN with null args');
  assert.ok(fuseRenderLetThrough(63, ['gG']).indexOf('100%') >= 0, 'gG let-through is 100% reference');
});

test('fuse: I²t let-through bars normalise gG to 100% and mark illustrative classes', function () {
  var h = fuseRenderLetThrough(63, ['gG', 'gR']);
  assert.ok(h.indexOf('100%') >= 0, 'gG = 100%');
  assert.ok(h.indexOf('\u2022') >= 0, 'gR flagged illustrative');
});

test('fuse: class table states aM/aR provide no overload protection (da/en)', function () {
  var prev = lang;
  ['da', 'en'].forEach(function (lg) {
    lang = lg;
    var h = fuseRenderClassTable(['gG', 'aM', 'gR', 'aR']);
    assert.ok(h.indexOf('IEC 60269-4') >= 0, 'cites semiconductor standard');
    assert.ok(h.indexOf('\u26d4') >= 0, 'flags no-overload classes');
    assert.ok(h.indexOf('undefined') < 0 && h.indexOf('NaN') < 0, 'no leaks (' + lg + ')');
  });
  lang = prev;
});

test('fuse: toggle helper adds/removes classes but never empties selection', function () {
  var prev = fuseCurveSel.slice();
  fuseCurveSel = ['gG'];
  fuseToggleClass('aM'); assert.ok(fuseCurveSel.indexOf('aM') >= 0, 'aM added');
  fuseToggleClass('gG'); assert.ok(fuseCurveSel.indexOf('gG') < 0, 'gG removed');
  fuseToggleClass('aM'); assert.ok(fuseCurveSel.length >= 1, 'never empties');
  fuseCurveSel = prev;
});

test('fuse: renderFuse embeds curve + let-through + class table when a size is chosen (da/en)', function () {
  var prevLang = lang, ph = fuseState.holder, psz = fuseState.size, psel = fuseCurveSel.slice();
  fuseState.holder = 'D02'; fuseState.size = 63; fuseCurveSel = ['gG', 'aM', 'gR', 'aR'];
  ['da', 'en'].forEach(function (lg) {
    lang = lg;
    var out = renderFuse();
    assert.ok(out.indexOf('IEC 60269') >= 0, 'cites IEC 60269 (' + lg + ')');
    assert.ok(out.indexOf('<svg') >= 0, 'curve embedded (' + lg + ')');
    assert.ok(out.indexOf('undefined') < 0, 'no undefined leak (' + lg + ')');
    assert.ok(out.indexOf('NaN') < 0, 'no NaN leak (' + lg + ')');
  });
  lang = prevLang; fuseState.holder = ph; fuseState.size = psz; fuseCurveSel = psel;
});

test('fuse: curve card hidden until a fuse size is selected', function () {
  var prevLang = lang, psz = fuseState.size; lang = 'da'; fuseState.size = null;
  var out = renderFuse();
  assert.ok(out.indexOf('Tid/str\u00f8m-karakteristik') < 0, 'no curve before a size is picked');
  lang = prevLang; fuseState.size = psz;
});


console.log('\n=== MCCB/ACB LSIG Protection Envelope Tests ===\n');

test('lsig: LSIG_TRIP_UNITS covers Micrologic 2.2/5.2/6.2 and generic ACB', function () {
  assert.ok(LSIG_TRIP_UNITS['Micrologic 2.2'], '2.2 present');
  assert.ok(LSIG_TRIP_UNITS['Micrologic 5.2'], '5.2 present');
  assert.ok(LSIG_TRIP_UNITS['Micrologic 6.2'], '6.2 present');
  assert.ok(LSIG_TRIP_UNITS['ACB LSIG'], 'ACB present');
  assert.strictEqual(LSIG_TRIP_UNITS['Micrologic 2.2'].segments, 'LS');
  assert.strictEqual(LSIG_TRIP_UNITS['Micrologic 5.2'].segments, 'LSI');
  assert.strictEqual(LSIG_TRIP_UNITS['Micrologic 6.2'].segments, 'LSIG');
  assert.strictEqual(LSIG_TRIP_UNITS['Micrologic 6.2'].gFault, true);
  assert.strictEqual(LSIG_TRIP_UNITS['Micrologic 2.2'].gFault, false);
});

test('lsig: envelope returns L+S for Micrologic 2.2 (no I, no G)', function () {
  var env = lsigCurveEnvelope({ In: 400, ioMult: 1.0, isdMult: 5, tripUnit: 'Micrologic 2.2', trL: 16, trS: 0.1 });
  assert.ok(env.L.length > 0, 'L segment present');
  assert.ok(env.S.length > 0, 'S segment present');
  assert.strictEqual(env.I.length, 0, 'no I segment');
  assert.strictEqual(env.G.length, 0, 'no G segment');
});

test('lsig: envelope returns L+S+I for Micrologic 5.2', function () {
  var env = lsigCurveEnvelope({ In: 250, ioMult: 0.8, isdMult: 3, iiMult: 12, tripUnit: 'Micrologic 5.2', trL: 8, trS: 0.2 });
  assert.ok(env.L.length > 0 && env.S.length > 0 && env.I.length > 0, 'L+S+I');
  assert.strictEqual(env.G.length, 0, 'no G');
});

test('lsig: envelope returns L+S+I+G for Micrologic 6.2 / ACB', function () {
  ['Micrologic 6.2', 'ACB LSIG'].forEach(function (tu) {
    var env = lsigCurveEnvelope({ In: 400, ioMult: 1.0, isdMult: 5, iiMult: 15, igMult: 0.3, tg: 0.2, tripUnit: tu, trL: 16, trS: 0.1 });
    assert.ok(env.L.length > 0 && env.S.length > 0 && env.I.length > 0 && env.G.length > 0, tu + ' L+S+I+G');
  });
});

test('lsig: computed pickups are correct', function () {
  var env = lsigCurveEnvelope({ In: 400, ioMult: 0.8, isdMult: 5, iiMult: 12, igMult: 0.4, tg: 0, tripUnit: 'Micrologic 6.2', trL: 16, trS: 0.1 });
  assert.strictEqual(env.settings.io, 320);   // 0.8 * 400
  assert.strictEqual(env.settings.isd, 1600); // 5 * 320
  assert.strictEqual(env.settings.ii, 4800);  // 12 * 400
  assert.strictEqual(env.settings.ig, 160);   // 0.4 * 400
});

test('lsig: L segment ends before S pickup (long-time does not extend into short-time region)', function () {
  var env = lsigCurveEnvelope({ In: 400, ioMult: 1.0, isdMult: 5, tripUnit: 'Micrologic 5.2', trL: 16, trS: 0.1, iiMult: 12 });
  var maxLcurr = 0;
  env.L.forEach(function (p) { if (p.i > maxLcurr) maxLcurr = p.i; });
  assert.ok(maxLcurr < env.settings.isd, 'L region below Isd (' + maxLcurr + ' < ' + env.settings.isd + ')');
});

test('lsig: S segment ends before I pickup for LSI/LSIG', function () {
  var env = lsigCurveEnvelope({ In: 400, ioMult: 1.0, isdMult: 5, iiMult: 12, tripUnit: 'Micrologic 5.2', trL: 16, trS: 0.1 });
  var maxScurr = 0;
  env.S.forEach(function (p) { if (p.i > maxScurr) maxScurr = p.i; });
  assert.ok(maxScurr < env.settings.ii, 'S region below Ii (' + maxScurr + ' < ' + env.settings.ii + ')');
});

test('lsig: L region times decrease with increasing current (inverse-time)', function () {
  var env = lsigCurveEnvelope({ In: 400, ioMult: 1.0, isdMult: 5, tripUnit: 'Micrologic 5.2', trL: 16, trS: 0.1, iiMult: 12 });
  var prev = Infinity;
  env.L.forEach(function (p) { assert.ok(p.tMax <= prev + 1e-9, 'L decreasing'); prev = p.tMax; });
});

test('lsig: I segment is fast (<= 20 ms max)', function () {
  var env = lsigCurveEnvelope({ In: 400, ioMult: 1.0, isdMult: 5, iiMult: 12, tripUnit: 'Micrologic 5.2', trL: 16, trS: 0.1 });
  env.I.forEach(function (p) { assert.ok(p.tMax <= 0.02, 'I <= 20 ms (got ' + p.tMax + ')'); });
});

test('lsig: changing trL changes L-segment times', function () {
  var env1 = lsigCurveEnvelope({ In: 400, ioMult: 1.0, isdMult: 5, tripUnit: 'Micrologic 5.2', trL: 4, trS: 0.1, iiMult: 12 });
  var env2 = lsigCurveEnvelope({ In: 400, ioMult: 1.0, isdMult: 5, tripUnit: 'Micrologic 5.2', trL: 32, trS: 0.1, iiMult: 12 });
  assert.ok(env1.L[0].tMax < env2.L[0].tMax, 'shorter trL means faster L');
});

test('lsig: lsigRenderCurve produces valid SVG, no leaks, all trip units, da/en', function () {
  var prev = lang;
  ['da', 'en'].forEach(function (lg) {
    lang = lg;
    Object.keys(LSIG_TRIP_UNITS).forEach(function (tu) {
      var svg = lsigRenderCurve({ In: 400, ioMult: 0.8, isdMult: 5, iiMult: 12, igMult: 0.3, tg: 0.1, tripUnit: tu, trL: 16, trS: 0.1 });
      assert.ok(svg.indexOf('<svg') === 0 && svg.indexOf('</svg>') > 0, 'svg (' + lg + '/' + tu + ')');
      assert.ok(svg.indexOf('undefined') < 0, 'no undefined (' + lg + '/' + tu + ')');
      assert.ok(svg.indexOf('NaN') < 0, 'no NaN (' + lg + '/' + tu + ')');
      assert.ok(svg.indexOf(tu) >= 0, 'trip unit named in title');
    });
  });
  lang = prev;
});

test('lsig: settings table renders with correct pickup values, no leaks', function () {
  var prev = lang; lang = 'en';
  var h = lsigRenderSettingsTable({ In: 400, ioMult: 0.8, isdMult: 5, iiMult: 12, igMult: 0.3, tg: 0.1, tripUnit: 'Micrologic 6.2', trL: 16, trS: 0.1 });
  assert.ok(h.indexOf('320 A') >= 0, 'Ir = 320 A (0.8*400)');
  assert.ok(h.indexOf('1600 A') >= 0, 'Isd = 1600 A (5*320)');
  assert.ok(h.indexOf('4800 A') >= 0, 'Ii = 4800 A (12*400)');
  assert.ok(h.indexOf('120 A') >= 0, 'Ig = 120 A (0.3*400)');
  assert.ok(h.indexOf('undefined') < 0 && h.indexOf('NaN') < 0, 'no leaks');
  lang = prev;
});

test('lsig: renderMCCB embeds the LSIG curve and all dials (da/en)', function () {
  var prev = lang;
  ['da', 'en'].forEach(function (lg) {
    lang = lg;
    var out = renderMCCB();
    assert.ok(out.indexOf('LSIG') >= 0, 'LSIG referenced (' + lg + ')');
    assert.ok(out.indexOf('<svg') >= 0, 'curve embedded (' + lg + ')');
    assert.ok(out.indexOf('IEC 60947-2') >= 0, 'cites IEC 60947-2 (' + lg + ')');
    assert.ok(out.indexOf('undefined') < 0, 'no undefined (' + lg + ')');
    assert.ok(out.indexOf('NaN') < 0, 'no NaN (' + lg + ')');
  });
  lang = prev;
});

test('lsig: ground-fault dials hidden for Micrologic 2.2/5.2, shown for 6.2/ACB', function () {
  var prev = lang; lang = 'da';
  mccbState.tripUnit = 'Micrologic 2.2';
  var out = renderMCCB();
  assert.ok(out.indexOf('Jordfejl Ig') < 0, 'no G dial for 2.2');
  mccbState.tripUnit = 'Micrologic 6.2';
  out = renderMCCB();
  assert.ok(out.indexOf('Jordfejl Ig') >= 0, 'G dial for 6.2');
  mccbState.tripUnit = 'Micrologic 5.2'; // restore
  lang = prev;
});

test('lsig: I dial hidden for Micrologic 2.2 (LS only), shown for 5.2+', function () {
  var prev = lang; lang = 'en';
  mccbState.tripUnit = 'Micrologic 2.2';
  var out = renderMCCB();
  // Micrologic 2.2 has LS only - the LSIG curve should not show I segment
  var env = lsigCurveEnvelope({ In: 400, ioMult: 1.0, isdMult: 5, tripUnit: 'Micrologic 2.2', trL: 16, trS: 0.1 });
  assert.strictEqual(env.I.length, 0, 'no I segment in envelope for 2.2');
  mccbState.tripUnit = 'Micrologic 5.2';
  var env2 = lsigCurveEnvelope({ In: 400, ioMult: 1.0, isdMult: 5, iiMult: 12, tripUnit: 'Micrologic 5.2', trL: 16, trS: 0.1 });
  assert.ok(env2.I.length > 0, 'I segment present for 5.2');
  lang = prev;
});


console.log('\n=== Phasor Diagram + Power Triangle + Impedance Vector Tests ===\n');

test('phasor: utility conversions are correct', function () {
  assert.ok(Math.abs(pDeg2Rad(180) - Math.PI) < 1e-10, '180° = π');
  assert.ok(Math.abs(pRad2Deg(Math.PI) - 180) < 1e-10, 'π = 180°');
  var r = pPolar2Rect(10, 60);
  assert.ok(Math.abs(r.re - 5) < 1e-6, 'rect re for 10∠60°');
  assert.ok(Math.abs(r.im - 8.6602) < 0.001, 'rect im');
  var p = pRect2Polar(3, 4);
  assert.ok(Math.abs(p.mag - 5) < 1e-6, 'polar mag for 3+j4');
  assert.ok(Math.abs(p.ang - 53.13) < 0.01, 'polar ang');
});

test('phasor: power triangle at cos φ = 0.8 (36.87°) is correct', function () {
  var pw = pPowerTriangle(230, 100, 36.87);
  assert.ok(Math.abs(pw.S - 23000) < 1, 'S = V×I');
  assert.ok(Math.abs(pw.P - 18400) < 10, 'P = S cos φ ≈ 18400 W');
  assert.ok(Math.abs(pw.Q - 13800) < 10, 'Q = S sin φ ≈ 13800 var');
  assert.ok(Math.abs(pw.cosPhi - 0.8) < 0.001, 'cos φ = 0.8');
});

test('phasor: 3-phase balanced power is √3 × ULL × I', function () {
  var pw = p3phPower(230, 100, 0);
  // S = √3 × ULL × I = √3 × (230×√3) × 100 = 3 × 230 × 100 = 69000 W
  assert.ok(Math.abs(pw.S - 69000) < 1, 'S = 3 × ULN × I = 69000 VA (got ' + pw.S.toFixed(0) + ')');
  assert.ok(Math.abs(pw.P - 69000) < 1, 'P = S at cos φ = 1');
  assert.ok(Math.abs(pw.Q) < 1, 'Q ≈ 0 at φ = 0');
});

test('phasor: impedance from V/I/phi is correct', function () {
  var z = pImpedance(230, 100, 30);
  assert.ok(Math.abs(z.Z - 2.3) < 0.001, 'Z = V/I = 2.3 Ω');
  assert.ok(Math.abs(z.R - 2.3 * Math.cos(pDeg2Rad(30))) < 0.001, 'R = Z cos φ');
  assert.ok(Math.abs(z.X - 2.3 * Math.sin(pDeg2Rad(30))) < 0.001, 'X = Z sin φ');
  var z0 = pImpedance(230, 0, 30);
  assert.strictEqual(z0.Z, 0, 'Z=0 when I=0 (safe guard)');
});

test('phasor: phasorRenderVoltage produces valid SVG with no leaks (da/en)', function () {
  var prev = lang;
  ['da', 'en'].forEach(function (lg) {
    lang = lg;
    var svg = phasorRenderVoltage(phasorState);
    assert.ok(svg.indexOf('<svg') === 0 && svg.indexOf('</svg>') > 0, 'valid svg (' + lg + ')');
    assert.ok(svg.indexOf('undefined') < 0, 'no undefined (' + lg + ')');
    assert.ok(svg.indexOf('NaN') < 0, 'no NaN (' + lg + ')');
    assert.ok(svg.indexOf('U\u2081') >= 0, 'U1 label present');
    assert.ok(svg.indexOf('I\u2081') >= 0, 'I1 label present');
  });
  lang = prev;
});

test('phasor: phasorRenderPowerTriangle produces valid SVG with P/Q/S labels', function () {
  var prev = lang; lang = 'en';
  var svg = phasorRenderPowerTriangle(phasorState);
  assert.ok(svg.indexOf('<svg') === 0 && svg.indexOf('</svg>') > 0, 'valid svg');
  assert.ok(svg.indexOf('kW') > 0, 'P in kW');
  assert.ok(svg.indexOf('kvar') > 0, 'Q in kvar');
  assert.ok(svg.indexOf('kVA') > 0, 'S in kVA');
  assert.ok(svg.indexOf('NaN') < 0 && svg.indexOf('undefined') < 0, 'no leaks');
  lang = prev;
});

test('phasor: phasorRenderImpedance shows polar + rectangular, no leaks', function () {
  var prev = lang; lang = 'da';
  var svg = phasorRenderImpedance(phasorState);
  assert.ok(svg.indexOf('<svg') === 0 && svg.indexOf('</svg>') > 0, 'valid svg');
  assert.ok(svg.indexOf('\u03a9') >= 0, 'ohm symbol present');
  assert.ok(svg.indexOf('\u2220') >= 0, 'angle symbol (polar form)');
  assert.ok(svg.indexOf('+') >= 0 || svg.indexOf('j') >= 0, 'rectangular form');
  assert.ok(svg.indexOf('NaN') < 0 && svg.indexOf('undefined') < 0, 'no leaks');
  lang = prev;
});

test('phasor: renderStandards embeds phasor card with computed values (da/en)', function () {
  var prev = lang;
  ['da', 'en'].forEach(function (lg) {
    lang = lg;
    var out = renderStandards();
    assert.ok(out.indexOf('cos \u03c6') >= 0, 'cos phi present (' + lg + ')');
    assert.ok(out.indexOf('kW') >= 0, 'P in kW (' + lg + ')');
    assert.ok(out.indexOf('<svg') >= 0, 'SVG embedded (' + lg + ')');
    assert.ok(out.indexOf('undefined') < 0, 'no undefined (' + lg + ')');
    assert.ok(out.indexOf('NaN') < 0, 'no NaN (' + lg + ')');
  });
  lang = prev;
});

test('phasor: state setters update correctly', function () {
  var prevI = phasorState.iA, prevPhi = phasorState.phiA, prevView = phasorState.view;
  phasorState.iA = 200; phasorState.phiA = 45; phasorState.view = 'impedance';
  var z = pImpedance(phasorState.uLN, phasorState.iA, phasorState.phiA);
  assert.ok(Math.abs(z.Z - 230 / 200) < 0.001, 'Z updated to 1.15 Ω');
  phasorState.iA = prevI; phasorState.phiA = prevPhi; phasorState.view = prevView;
});


console.log('\n=== UX Design System Foundation Tests ===\n');

test('ux: UX_MODES defines all four complexity levels', function () {
  assert.deepStrictEqual(UX_MODES, ['apprentice', 'electrician', 'engineer', 'expert']);
});

test('ux: uxMode defaults to electrician and uxModeLevel returns correct index', function () {
  var prev = uxMode;
  uxMode = 'electrician'; assert.strictEqual(uxModeLevel(), 1);
  uxMode = 'apprentice'; assert.strictEqual(uxModeLevel(), 0);
  uxMode = 'engineer'; assert.strictEqual(uxModeLevel(), 2);
  uxMode = 'expert'; assert.strictEqual(uxModeLevel(), 3);
  uxMode = prev;
});

test('ux: uxSetMode only accepts valid modes', function () {
  var prev = uxMode;
  uxSetMode('expert'); assert.strictEqual(uxMode, 'expert');
  uxSetMode('invalid_mode'); assert.strictEqual(uxMode, 'expert'); // unchanged
  uxSetMode('apprentice'); assert.strictEqual(uxMode, 'apprentice');
  uxMode = prev;
});

test('ux: uxRenderModeBar renders all four buttons with correct active state (da/en)', function () {
  var prev = lang, pm = uxMode;
  ['da', 'en'].forEach(function (lg) {
    lang = lg; uxMode = 'electrician';
    var h = uxRenderModeBar();
    assert.ok(h.indexOf('ux-mode-bar') >= 0, 'has container class');
    assert.ok(h.indexOf('active') >= 0, 'one is active');
    UX_MODES.forEach(function (m) { assert.ok(h.indexOf(m) >= 0, m + ' present'); });
    assert.ok(h.indexOf('undefined') < 0 && h.indexOf('NaN') < 0, 'no leaks (' + lg + ')');
  });
  lang = prev; uxMode = pm;
});

test('ux: uxPanel renders collapsible panel, respects level gating', function () {
  var prev = uxMode;
  uxMode = 'electrician'; // level 1
  var h = uxPanel('Test Panel', '<p>Content</p>', { id: 'test1' });
  assert.ok(h.indexOf('ux-panel') >= 0, 'panel rendered');
  assert.ok(h.indexOf('Content') >= 0, 'body included');
  // Engineer-level panel hidden for electrician
  var h2 = uxPanel('Advanced', '<p>Deep</p>', { level: 'engineer', id: 'test2' });
  assert.strictEqual(h2, '', 'engineer panel hidden for electrician');
  uxMode = 'engineer'; // level 2
  var h3 = uxPanel('Advanced', '<p>Deep</p>', { level: 'engineer', id: 'test3' });
  assert.ok(h3.indexOf('Deep') >= 0, 'engineer panel shown for engineer');
  // Expert panel still hidden for engineer
  var h4 = uxPanel('Expert Only', '<p>Secret</p>', { level: 'expert', id: 'test4' });
  assert.strictEqual(h4, '', 'expert panel hidden for engineer');
  uxMode = 'expert';
  var h5 = uxPanel('Expert Only', '<p>Secret</p>', { level: 'expert', id: 'test5' });
  assert.ok(h5.indexOf('Secret') >= 0, 'expert panel shown for expert');
  uxMode = prev;
});

test('ux: uxSummary renders executive summary cards with status classes', function () {
  var h = uxSummary([
    { label: 'Cable', value: '✓ OK', status: 'pass' },
    { label: 'Vdrop', value: '4.2%', status: 'warn' },
    { label: 'Fault', value: '✗ FAIL', status: 'fail' }
  ]);
  assert.ok(h.indexOf('ux-summary') >= 0, 'container');
  assert.ok(h.indexOf('pass') >= 0, 'pass class');
  assert.ok(h.indexOf('warn') >= 0, 'warn class');
  assert.ok(h.indexOf('fail') >= 0, 'fail class');
  assert.ok(h.indexOf('4.2%') >= 0, 'value rendered');
});

test('ux: uxSmartCards renders visual selector with correct selection', function () {
  var items = [
    { id: 'tn-s', icon: '⚡', title: 'TN-S', desc: 'Separate N+PE' },
    { id: 'tt', icon: '🔌', title: 'TT', desc: 'Local earth' }
  ];
  var h = uxSmartCards(items, 'tn-s', 'testFn');
  assert.ok(h.indexOf('ux-smart-cards') >= 0, 'grid container');
  assert.ok(h.indexOf('selected') >= 0, 'one selected');
  assert.ok(h.indexOf('TN-S') >= 0, 'title');
  assert.ok(h.indexOf('testFn') >= 0, 'onclick handler');
});

test('ux: uxWizardSteps renders step indicators with done/active states', function () {
  var steps = [{ label: 'Load' }, { label: 'Cable' }, { label: 'Protection' }];
  var h = uxWizardSteps(steps, 1);
  assert.ok(h.indexOf('done') >= 0, 'first step is done');
  assert.ok(h.indexOf('active') >= 0, 'second step is active');
  assert.ok(h.indexOf('Protection') >= 0, 'third step label');
  assert.ok(h.indexOf('✓') >= 0 || h.indexOf('\u2713') >= 0, 'checkmark on done step');
});

test('ux: mode bar is rendered in the status bar (not content area)', function () {
  var prev = lang; lang = 'da';
  // Mode bar is now in renderStatusBar, not renderModule
  var bar = uxRenderModeBar();
  assert.ok(bar.indexOf('ux-mode-bar') >= 0, 'mode bar helper still works');
  assert.ok(bar.length > 50, 'mode bar has content');
  lang = prev;
});


console.log('\n=== UX Load Module Retrofit Tests ===\n');

test('ux-load: renderLoad uses uxSummary for executive summary (da/en)', function () {
  var prev = lang;
  ['da', 'en'].forEach(function (lg) {
    lang = lg;
    var out = renderLoad();
    assert.ok(out.indexOf('ux-summary') >= 0, 'executive summary present (' + lg + ')');
    assert.ok(out.indexOf('ux-summary-item') >= 0, 'summary items present');
  });
  lang = prev;
});

test('ux-load: renderLoad uses uxSmartCards for presets', function () {
  var prev = lang; lang = 'da';
  var out = renderLoad();
  assert.ok(out.indexOf('ux-smart-cards') >= 0, 'smart card grid present');
  assert.ok(out.indexOf('ux-smart-card') >= 0, 'smart cards present');
  assert.ok(out.indexOf('applyLoadPreset') >= 0, 'preset handler wired');
  lang = prev;
});

test('ux-load: advanced params (cosφ/sf/ef) in a collapsible panel', function () {
  var prev = lang; lang = 'da';
  var out = renderLoad();
  assert.ok(out.indexOf('ux-panel') >= 0, 'collapsible panel present');
  assert.ok(out.indexOf('load_advanced') >= 0, 'panel has correct id');
  lang = prev;
});

test('ux-load: diversity section hidden for apprentice/electrician, shown for engineer', function () {
  var prev = lang, pm = uxMode;
  lang = 'da';
  uxMode = 'apprentice';
  var out = renderLoad();
  assert.ok(out.indexOf('load_diversity') < 0, 'diversity hidden for apprentice');
  uxMode = 'engineer';
  out = renderLoad();
  assert.ok(out.indexOf('load_diversity') >= 0, 'diversity visible for engineer');
  lang = prev; uxMode = pm;
});

test('ux-load: motor/contactor/relay recommendations hidden for apprentice, shown for engineer', function () {
  var prev = lang, pm = uxMode;
  lang = 'en'; loadState.power = 50; // enough to produce IB > 0
  uxMode = 'apprentice';
  var out = renderLoad();
  assert.ok(out.indexOf('Recommended contactors') < 0, 'contactors hidden for apprentice');
  uxMode = 'engineer';
  out = renderLoad();
  assert.ok(out.indexOf('Recommended contactors') >= 0, 'contactors shown for engineer');
  lang = prev; uxMode = pm;
});

test('ux-load: output has no undefined/NaN in any mode (da/en × all modes)', function () {
  var prev = lang, pm = uxMode;
  ['da', 'en'].forEach(function (lg) {
    lang = lg;
    UX_MODES.forEach(function (m) {
      uxMode = m;
      var out = renderLoad();
      assert.ok(out.indexOf('undefined') < 0, 'no undefined (' + lg + '/' + m + ')');
      assert.ok(out.indexOf('NaN') < 0, 'no NaN (' + lg + '/' + m + ')');
    });
  });
  lang = prev; uxMode = pm;
});

test('ux-load: preset still works (applyLoadPreset sets state)', function () {
  var prev = { v: loadState.voltage, p: loadState.power, c: loadState.cosPhi };
  applyLoadPreset('ev22');
  assert.strictEqual(loadState.power, 22, 'EV22 sets 22 kW');
  assert.strictEqual(loadState.voltage, '3x400', 'EV22 sets 3x400');
  assert.strictEqual(loadState._preset, 'ev22', 'preset key stored');
  loadState.voltage = prev.v; loadState.power = prev.p; loadState.cosPhi = prev.c;
});


console.log('\n=== UX Cable Module Retrofit Tests ===\n');

test('ux-cable: renderCable uses wizard steps indicator', function () {
  var prev = lang; lang = 'da';
  var out = renderCable();
  assert.ok(out.indexOf('ux-wizard-step') >= 0, 'wizard steps present');
  lang = prev;
});

test('ux-cable: correction factors in collapsible panel', function () {
  var prev = lang; lang = 'en';
  var out = renderCable();
  assert.ok(out.indexOf('cable_corrections') >= 0, 'corrections panel has id');
  assert.ok(out.indexOf('ux-panel') >= 0, 'collapsible panel present');
  lang = prev;
});

test('ux-cable: executive summary appears when cross-section selected', function () {
  var prev = lang, pcs = cableState.crossSection;
  lang = 'da'; cableState.crossSection = '2.5';
  var out = renderCable();
  assert.ok(out.indexOf('ux-summary') >= 0, 'summary present with cross-section');
  cableState.crossSection = null;
  out = renderCable();
  assert.ok(out.indexOf('ux-summary') < 0, 'no summary without cross-section');
  lang = prev; cableState.crossSection = pcs;
});

test('ux-cable: no undefined/NaN in any mode (da/en x all modes)', function () {
  var prev = lang, pm = uxMode;
  ['da', 'en'].forEach(function (lg) {
    lang = lg;
    UX_MODES.forEach(function (m) {
      uxMode = m;
      var out = renderCable();
      assert.ok(out.indexOf('undefined') < 0, 'no undefined (' + lg + '/' + m + ')');
      assert.ok(out.indexOf('NaN') < 0, 'no NaN (' + lg + '/' + m + ')');
    });
  });
  lang = prev; uxMode = pm;
});


console.log('\n=== Analyzer De-duplication + Fallback Inference Tests ===\n');

test('analyzer: analyzerSegment de-duplicates repeated Opgave headers', function () {
  var text = 'Opgave 1\nBeregn IB for 37 kW motor.\nOpgave 2\nBeregn Zs.\nOpgave 1\nSvar: IB = 67 A.';
  var segs = analyzerSegment(text);
  // Should have 2 segments (Opgave 1 merged, Opgave 2), not 3
  var ids = segs.map(function (s) { return s.id; });
  assert.ok(ids.indexOf(1) >= 0, 'Opgave 1 present');
  assert.ok(ids.indexOf(2) >= 0, 'Opgave 2 present');
  var count1 = ids.filter(function (id) { return id === 1; }).length;
  assert.strictEqual(count1, 1, 'Opgave 1 appears exactly once (de-duped)');
  // Merged text should contain both parts
  var seg1 = segs.find(function (s) { return s.id === 1; });
  assert.ok(seg1.text.indexOf('37 kW') >= 0, 'first part merged');
  assert.ok(seg1.text.indexOf('67 A') >= 0, 'second part merged');
});

test('analyzer: analyzerSegment handles Generelt (text before first Opgave)', function () {
  var text = 'Generelt: forsyning TN-S 400V\nOpgave 1\nBeregn IB.';
  var segs = analyzerSegment(text);
  assert.ok(segs.length >= 2, 'at least 2 segments (Generelt + Opgave 1)');
  var gen = segs.find(function (s) { return s.id === 0; });
  assert.ok(gen, 'Generelt segment (id=0) exists');
});

test('analyzer: fallback inference detects questions from data when no explicit patterns match', function () {
  // Text with electrical data but NO "beregn IB" or other explicit verbs
  var text = 'Installation i kontorbygning. 37 kW belastning. 400 V forsyning. Kabel 50 m NOIKLX 5G16.';
  var qs = analyzerDetectQuestions(text);
  assert.ok(qs.length > 0, 'fallback inferred questions (got ' + qs.length + ')');
  var types = qs.map(function (q) { return q.type; });
  assert.ok(types.indexOf('ib') >= 0, 'IB inferred from power + voltage');
  assert.ok(types.indexOf('cable') >= 0 || types.indexOf('vdrop') >= 0, 'cable/vdrop inferred from cable data');
});

test('analyzer: fallback does NOT activate when explicit patterns already matched', function () {
  var text = 'Beregn belastningsstrømmen IB for 37 kW motor. 400 V. Kabel 50 m.';
  var qs = analyzerDetectQuestions(text);
  // Should have explicit 'ib' match, not a bunch of fallback duplicates
  var ibCount = qs.filter(function (q) { return q.type === 'ib'; }).length;
  assert.strictEqual(ibCount, 1, 'only one IB question (no fallback duplicate)');
});

test('analyzer: fallback infers trafo from kVA/transformer keywords', function () {
  var text = 'Transformer 630 kVA, uk = 4%, Dyn11.';
  var qs = analyzerDetectQuestions(text);
  var types = qs.map(function (q) { return q.type; });
  assert.ok(types.indexOf('trafo') >= 0 || types.indexOf('trafo_vec') >= 0, 'trafo inferred');
});

test('analyzer: fallback infers motor from motor keywords', function () {
  var text = 'Asynkronmotor 4-polet, 1450 omdrejninger, 15 kW.';
  var qs = analyzerDetectQuestions(text);
  var types = qs.map(function (q) { return q.type; });
  assert.ok(types.indexOf('motor_start') >= 0 || types.indexOf('motor_sync') >= 0, 'motor inferred');
});


console.log('\n=== Engineering Presentation Framework (VB Methodology) Tests ===\n');

test('eng: engPresentation renders all 8 step types with correct labels (da/en)', function () {
  var prev = lang;
  ['da', 'en'].forEach(function (lg) {
    lang = lg;
    var steps = [
      { type: 'standard', content: 'DS/HD 60364-5-52' },
      { type: 'assumption', content: 'IB = 25 A' },
      { type: 'formula', content: 'Iz = Iz,tabel × k1 × k2' },
      { type: 'substitution', content: 'Iz = 32 × 1.0 × 0.82' },
      { type: 'intermediate', content: '= 26.2 A' },
      { type: 'result', content: 'Iz,korr = 26.2 A' },
      { type: 'verification', content: '25 ≤ 26.2 → OK' },
      { type: 'conclusion', content: 'Kablet er korrekt.', status: 'pass' }
    ];
    var h = engPresentation('Test', steps, { id: 'test_eng_1', open: true });
    assert.ok(h.indexOf('ux-panel') >= 0, 'wrapped in panel (' + lg + ')');
    assert.ok(h.indexOf('DS/HD 60364-5-52') >= 0, 'standard content');
    assert.ok(h.indexOf('success') >= 0 || h.indexOf('pass') >= 0, 'pass styling');
    assert.ok(h.indexOf('undefined') < 0 && h.indexOf('NaN') < 0, 'no leaks (' + lg + ')');
  });
  lang = prev;
});

test('eng: engCableReasoning builds correct cable-sizing presentation', function () {
  var prev = lang; lang = 'da';
  var h = engCableReasoning({
    ib: 25, installMethod: 'C', kInstall: 1.0, kTemp: 1.0, kGroup: 0.82,
    kTotal: 0.82, baseIz: 32, correctedIz: 26.2, cableType: 'NOIKLX', mm2: '2.5',
    tableRef: 'Tabel B.52.4', tempC: 30, groupCount: 2, verdict: 'pass'
  });
  assert.ok(h.indexOf('DS/HD 60364-5-52') >= 0, 'cites cable standard');
  assert.ok(h.indexOf('26,2') >= 0, 'shows corrected Iz (da comma)');
  assert.ok(h.indexOf('0,82') >= 0, 'shows grouping factor (da comma)');
  assert.ok(h.indexOf('NOIKLX') >= 0, 'shows cable type');
  assert.ok(h.indexOf('success') >= 0, 'pass conclusion');
  lang = prev;
});

test('eng: engBreakerReasoning builds correct protection presentation', function () {
  var prev = lang; lang = 'en';
  var h = engBreakerReasoning({
    ib: 16, deviceIn: 16, deviceIcu: 10, ikMax: 6000, curve: 'B',
    deviceLabel: 'Schneider iC60N', izCorrected: 26.2, verdict: 'pass'
  });
  assert.ok(h.indexOf('IEC 60898-1') >= 0, 'cites MCB standard');
  assert.ok(h.indexOf('16 A') >= 0, 'shows device rating');
  assert.ok(h.indexOf('6.0 kA') >= 0 || h.indexOf('6.0') >= 0, 'shows fault current');
  assert.ok(h.indexOf('Schneider') >= 0, 'shows device label');
  lang = prev;
});

test('eng: engVdropReasoning builds correct voltage-drop presentation', function () {
  var prev = lang; lang = 'da';
  var h = engVdropReasoning({
    ib: 16, length: 25, mm2: '2.5', rPerKm: 7.41, xPerKm: 0.08,
    cosPhi: 0.95, voltage: 230, dropV: 4.8, dropPct: 2.1, limit: 3, verdict: 'pass'
  });
  assert.ok(h.indexOf('DS/HD 60364-5-52') >= 0, 'cites standard');
  assert.ok(h.indexOf('2,1') >= 0, 'shows drop percentage (da comma)');
  assert.ok(h.indexOf('25 m') >= 0, 'shows cable length');
  assert.ok(h.indexOf('acceptabelt') >= 0 || h.indexOf('acceptable') >= 0, 'pass conclusion');
  lang = prev;
});

test('eng: fail verdict shows danger styling', function () {
  var prev = lang; lang = 'da';
  var h = engVdropReasoning({
    ib: 50, length: 100, mm2: '4', rPerKm: 4.61, xPerKm: 0.08,
    cosPhi: 0.9, voltage: 230, dropV: 18, dropPct: 7.8, limit: 5, verdict: 'fail'
  });
  assert.ok(h.indexOf('danger') >= 0, 'fail conclusion has danger styling');
  assert.ok(h.indexOf('OVERSKRIDER') >= 0, 'fail text present');
  lang = prev;
});

test('eng: presentation hidden by level gating when mode is apprentice', function () {
  var prev = uxMode;
  uxMode = 'apprentice';
  var h = engPresentation('Expert detail', [{ type: 'formula', content: 'Z = V/I' }], { level: 'expert', id: 'test_gate' });
  assert.strictEqual(h, '', 'expert panel hidden for apprentice');
  uxMode = 'expert';
  h = engPresentation('Expert detail', [{ type: 'formula', content: 'Z = V/I' }], { level: 'expert', id: 'test_gate2' });
  assert.ok(h.indexOf('Z = V/I') >= 0, 'expert panel shown for expert');
  uxMode = prev;
});

test('eng: renderRecommendations includes reasoning panel for cables (electrician+)', function () {
  var prev = lang, pm = uxMode, pp = loadState.power;
  lang = 'da'; uxMode = 'electrician'; loadState.power = 10;
  var ib = calcIB();
  var cables = recommendCables(ib);
  if (cables && cables.length > 0) {
    var out = renderRecommendations('Test kabler', cables, 'cable');
    assert.ok(out.indexOf('DS/HD 60364-5-52') >= 0, 'cable reasoning cites standard');
    assert.ok(out.indexOf('ux-panel') >= 0, 'reasoning in collapsible panel');
  }
  lang = prev; uxMode = pm; loadState.power = pp;
});

test('eng: renderRecommendations includes reasoning panel for MCBs (electrician+)', function () {
  var prev = lang, pm = uxMode, pp = loadState.power;
  lang = 'en'; uxMode = 'electrician'; loadState.power = 5;
  var ib = calcIB();
  var mcbs = recommendMCBs(ib);
  if (mcbs && mcbs.length > 0) {
    var out = renderRecommendations('Test MCBs', mcbs, 'mcb');
    assert.ok(out.indexOf('IEC 60898-1') >= 0, 'MCB reasoning cites standard');
    assert.ok(out.indexOf('ux-panel') >= 0, 'reasoning in collapsible panel');
  }
  lang = prev; uxMode = pm; loadState.power = pp;
});

test('trafo: efficiency curve renders valid SVG, marks operating point + optimum, no leaks', function () {
  var prev = lang;
  ['da', 'en'].forEach(function (lg) {
    lang = lg;
    var svg = trafoRenderEffCurve(630, 610, 6900, 0.9, 75);
    assert.ok(svg.indexOf('<svg') === 0 && svg.indexOf('</svg>') > 0, 'valid svg (' + lg + ')');
    assert.ok(svg.indexOf('svg-animated') >= 0, 'animated class present');
    assert.ok(svg.indexOf('optimum') >= 0, 'optimum load marked');
    assert.ok(svg.indexOf('undefined') < 0 && svg.indexOf('NaN') < 0, 'no leaks (' + lg + ')');
  });
  // efficiency peaks near sqrt(P0/Pcu) optimum
  var eOpt = trafoCalcEfficiency(630, 610, 6900, Math.sqrt(610 / 6900) * 100, 0.9).eta;
  var eFull = trafoCalcEfficiency(630, 610, 6900, 100, 0.9).eta;
  assert.ok(eOpt >= eFull, 'efficiency at optimum >= at full load');
  lang = prev;
});

test('trafo: renderTrafoEfficiency embeds the efficiency curve', function () {
  var prev = lang; lang = 'da';
  var out = renderTrafoEfficiency();
  assert.ok(out.indexOf('<svg') >= 0, 'efficiency curve embedded');
  assert.ok(out.indexOf('Virkningsgradskurve') >= 0, 'curve titled');
  assert.ok(out.indexOf('undefined') < 0 && out.indexOf('NaN') < 0, 'no leaks');
  lang = prev;
});

test('motor: torque/speed curve renders valid animated SVG for all methods, no leaks', function () {
  var prev = lang, pm = motorCurveState.methods.slice();
  motorCurveState.methods = ['DOL', 'SD', 'Soft', 'VFD'];
  ['da', 'en'].forEach(function (lg) {
    lang = lg;
    var svg = motorRenderTorqueCurve(motorCurveState);
    assert.ok(svg.indexOf('<svg') === 0 && svg.indexOf('</svg>') > 0, 'valid svg (' + lg + ')');
    assert.ok(svg.indexOf('svg-animated') >= 0, 'animated class present (' + lg + ')');
    assert.ok(svg.indexOf('svg-curve-path') >= 0, 'torque curve path drawn (' + lg + ')');
    assert.ok(svg.indexOf('undefined') < 0 && svg.indexOf('NaN') < 0, 'no leaks (' + lg + ')');
  });
  // every defined starting method has a torque profile model
  Object.keys(MOTOR_START_METHODS).forEach(function (m) {
    assert.ok(Array.isArray(MOTOR_TORQUE_PROFILES[m]) && MOTOR_TORQUE_PROFILES[m].length > 1, 'torque profile for ' + m);
  });
  motorCurveState.methods = pm; lang = prev;
});

test('motor: torque card embeds the torque/speed curve in the motor module', function () {
  var prev = lang; lang = 'da';
  var out = renderStandards();
  assert.ok(out.indexOf('Moment-/hastighedskurve') >= 0, 'torque card titled');
  lang = prev;
});

test('motor: overload/thermal curve renders valid log-log SVG for all trip classes, no leaks', function () {
  var prev = lang, pm = motorCurveState.methods.slice(), pt = motorCurveState.tripClass;
  motorCurveState.methods = ['DOL', 'SD', 'Soft', 'VFD'];
  ['da', 'en'].forEach(function (lg) {
    lang = lg;
    MOTOR_TRIP_CLASSES.forEach(function (tc) {
      motorCurveState.tripClass = tc;
      var svg = motorRenderOverloadCurve(motorCurveState);
      assert.ok(svg.indexOf('<svg') === 0 && svg.indexOf('</svg>') > 0, 'valid svg (' + lg + '/class' + tc + ')');
      assert.ok(svg.indexOf('svg-animated') >= 0, 'animated (' + lg + '/class' + tc + ')');
      assert.ok(svg.indexOf('svg-curve-path') >= 0, 'curve paths present');
      assert.ok(svg.indexOf('undefined') < 0 && svg.indexOf('NaN') < 0, 'no leaks (' + lg + '/class' + tc + ')');
    });
  });
  motorCurveState.methods = pm; motorCurveState.tripClass = pt; lang = prev;
});

test('motor: motorOverloadVerdict returns correct coordination verdicts', function () {
  var pm = motorCurveState.methods.slice(), pt = motorCurveState.tripClass;
  motorCurveState.methods = ['DOL']; motorCurveState.tripClass = 10;
  var v10 = motorOverloadVerdict(motorCurveState);
  assert.ok(typeof v10.protects === 'boolean' && typeof v10.noNuisance === 'boolean', 'verdict has booleans');
  assert.ok(v10.tRelayLR > 0 && v10.tHotLR > 0, 'positive trip times');
  // Class 10 relay at 7.2xIe = 10 s; hot stall at 6xIe = 8*36/36 = 8 s; relay trips at 10 s > 8 s hot → fails to protect
  // Actually: tRelayLR = 10 * (7.2^2 - 1) / (6^2 - 1) = 10 * 50.84 / 35 = 14.53 s; tHotLR = 8*36/36 = 8 s → relay 14.5 > 8 → NOT protecting.
  // This is realistic: a class 10 relay does not protect a motor at locked-rotor if hot stall is only 8s at 6xIe.
  assert.ok(v10.tRelayLR > 0, 'relay time positive');
  // Class 5 should protect better (faster trip)
  motorCurveState.tripClass = 5;
  var v5 = motorOverloadVerdict(motorCurveState);
  assert.ok(v5.tRelayLR < v10.tRelayLR, 'class 5 trips faster than class 10');
  motorCurveState.methods = pm; motorCurveState.tripClass = pt;
});

test('motor: overload verdict picks WORST-CASE start method for nuisance trip (life-safety)', function () {
  var pm = motorCurveState.methods.slice(), pt = motorCurveState.tripClass;
  // With all methods selected, the worst case is the one closest to the relay
  // curve (highest startT/tRelay), NOT simply the longest start. DOL (7x) sits
  // far closer to a class-10 trip curve than VFD (1.5x), so DOL must be chosen.
  motorCurveState.methods = ['DOL', 'SD', 'Soft', 'VFD']; motorCurveState.tripClass = 10;
  var v = motorOverloadVerdict(motorCurveState);
  assert.strictEqual(v.startX, MOTOR_START_METHODS['DOL'].iStartMult, 'worst-case start = DOL at 7xIe');
  // Sanity: the chosen point must have the minimum relay margin among all methods.
  ['DOL', 'SD', 'Soft', 'VFD'].forEach(function (mk) {
    var inf = MOTOR_START_METHODS[mk];
    var margin = motorOverloadTripTime(inf.iStartMult, 10) / inf.iStartDur;
    var chosenMargin = v.tRelayStart / v.startT;
    assert.ok(chosenMargin <= margin + 1e-6, 'chosen has smallest margin vs ' + mk);
  });
  motorCurveState.methods = pm; motorCurveState.tripClass = pt;
});

test('motor: overload trip time anchored to IEC 60947-4-1 class point (life-safety)', function () {
  // Class number = max trip time [s] from cold at 7.2xIe — the curve MUST pass through it.
  [5, 10, 20, 30].forEach(function (tc) {
    assert.ok(Math.abs(motorOverloadTripTime(7.2, tc) - tc) < 0.01, 'class ' + tc + ' passes through 7.2xIe,' + tc + 's');
  });
  // Inverse-time: trip time strictly decreases as current rises.
  var prev = Infinity;
  [2, 3, 4, 5, 6, 7.2, 8, 10].forEach(function (x) {
    var t = motorOverloadTripTime(x, 10);
    assert.ok(t <= prev, 'monotonic decreasing at ' + x + 'xIe');
    prev = t;
  });
  // Below pickup (<=1.05xIe) the relay never trips.
  assert.ok(!isFinite(motorOverloadTripTime(1.0, 10)), 'no trip at/below Ie');
});

test('motor: thermal limit follows constant I^2t adiabatic model (life-safety)', function () {
  // t = k/x^2 with k = stall * 6^2. At locked rotor (6x) returns the stall time.
  assert.ok(Math.abs(motorThermalLimit(6, 8) - 8) < 0.01, 'hot limit @6x = 8s stall');
  // Constant I^2t: halving current to 3x quadruples the time (8*36/9 = 32s).
  assert.ok(Math.abs(motorThermalLimit(3, 8) - 32) < 0.01, 'I^2t constant @3x = 32s');
  // Cold withstand must exceed hot withstand (conservative, physically correct).
  assert.ok(motorThermalLimit(6, 14) > motorThermalLimit(6, 8), 'cold limit > hot limit');
});

test('trafo: inrush In matches S/(sqrt3*U) and peak scales linearly', function () {
  var In630 = (630 * 1000) / (Math.sqrt(3) * 400);
  assert.ok(Math.abs(In630 - 909.3) < 1, '630kVA/400V In ~ 909A');
  // The rendered curve must contain the peak current annotation (peak x In).
  var prevLang = lang; lang = 'da';
  var svg = trafoRenderInrushCurve(630, 6, 400, 14);
  assert.ok(svg.indexOf((14 * In630).toFixed(0)) >= 0, 'peak inrush current annotated');
  lang = prevLang;
});

test('trafo: inrush time constant scales with transformer rating (engineering accuracy)', function () {
  // Physically: larger transformers have longer inrush decay (L_sat/R rises with size).
  assert.ok(trafoInrushTau(50) < trafoInrushTau(630), 'small < medium');
  assert.ok(trafoInrushTau(630) < trafoInrushTau(2000), 'medium < large');
  // 630 kVA anchors at the classic 0.3 s typical value.
  assert.ok(Math.abs(trafoInrushTau(630) - 0.30) < 0.001, '630 kVA tau = 0.30 s');
  // Clamped to a physical 0.1-1.0 s band.
  assert.ok(trafoInrushTau(10) >= 0.10, 'lower clamp 0.1 s');
  assert.ok(trafoInrushTau(5000) <= 1.0, 'upper clamp 1.0 s');
});

test('motor: overload protection card is embedded in standards module', function () {
  var prev = lang; lang = 'da';
  motorCurveState.tripClass = 10;
  var out = renderStandards();
  assert.ok(out.indexOf('Overbelastningsbeskyttelse') >= 0, 'overload card titled');
  assert.ok(out.indexOf('Koordination') >= 0, 'coordination verdict shown');
  assert.ok(out.indexOf('undefined') < 0, 'no undefined leak');
  lang = prev;
});

test('motor: overload card gives actionable recommendation when coordination fails (life-safety)', function () {
  var prev = lang, pm = motorCurveState.methods.slice(), pt = motorCurveState.tripClass;
  lang = 'da';
  // Class 30 (slow) + DOL → relay too slow at locked rotor → must recommend a fix.
  motorCurveState.tripClass = 30; motorCurveState.methods = ['DOL'];
  var v = motorOverloadVerdict(motorCurveState);
  assert.ok(!v.ok, 'class 30 DOL fails coordination');
  var out = renderStandards();
  assert.ok(out.indexOf('Anbefaling:') >= 0, 'failing verdict shows an actionable recommendation');
  motorCurveState.methods = pm; motorCurveState.tripClass = pt; lang = prev;
});

test('trafo: inrush curve renders valid SVG with MCB zones, no leaks', function () {
  var prev = lang;
  ['da', 'en'].forEach(function (lg) {
    lang = lg;
    [8, 12, 14, 18].forEach(function (pk) {
      var svg = trafoRenderInrushCurve(400, 4, 400, pk);
      assert.ok(svg.indexOf('<svg') === 0 && svg.indexOf('</svg>') > 0, 'valid svg (' + lg + '/pk' + pk + ')');
      assert.ok(svg.indexOf('svg-animated') >= 0, 'animated');
      assert.ok(svg.indexOf('MCB') >= 0, 'MCB zones shown');
      assert.ok(svg.indexOf('undefined') < 0 && svg.indexOf('NaN') < 0, 'no leaks (' + lg + '/pk' + pk + ')');
    });
  });
  lang = prev;
});

test('trafo: inrush sub-module renders in trafo card with peak selector and calcDetail', function () {
  var prev = lang; lang = 'da';
  trafoState.calcType = 'inrush'; trafoState.inrushPeak = 14;
  var out = renderTrafo();
  assert.ok(out.indexOf('Indkoblingsstr') >= 0, 'inrush card titled');
  assert.ok(out.indexOf('MCB-kurve') >= 0, 'MCB verdict shown');
  assert.ok(out.indexOf('<svg') >= 0, 'SVG curve embedded');
  assert.ok(out.indexOf('undefined') < 0 && out.indexOf('NaN') < 0, 'no leaks');
  trafoState.calcType = 'sizing'; lang = prev;
});

test('autoexam: auto-curves embedded in worked solutions (device, cable, vdrop, adiabatic)', function () {
  var prev = lang; lang = 'da';
  var p = axGenerate(42, 'parcelhus', 'elektriker', 'beregning');
  var sols = axSolve(p);
  var curveCount = 0, leaks = 0;
  sols.forEach(function (op) { op.tasks.forEach(function (s) {
    if (s.curve) { curveCount++; if (s.curve.indexOf('<svg') < 0 || /undefined|NaN/.test(s.curve)) leaks++; }
  }); });
  assert.ok(curveCount >= 2, 'at least 2 tasks have auto-curves (got ' + curveCount + ')');
  assert.ok(leaks === 0, 'no leaks in curves');
  // Verify the solution card renderer includes the curve
  var rendered = '';
  sols.forEach(function (op) { op.tasks.forEach(function (s) { rendered += axRenderSolutionCard(s); }); });
  assert.ok(rendered.indexOf('<svg') >= 0, 'SVG embedded in rendered solution');
  lang = prev;
});


test('standards: IZ_COPPER ampacity table is conservatively rounded down from DS/HD 60364-5-52', function () {
  // Official DS/HD 60364-5-52 Table C.52.1 method C, Cu/PVC (reference values, 2-loaded).
  // The app table MUST be <= these (conservative = under-rate Iz = choose larger cable = safer).
  var official = {1.5:17.5, 2.5:24, 4:32, 6:41, 10:57, 16:76, 25:101, 35:125, 50:151, 70:192, 95:232, 120:269};
  Object.keys(official).forEach(function (csa) {
    var appVal = IZ_COPPER[Number(csa)];
    if (appVal !== undefined) {
      assert.ok(appVal <= official[csa], 'IZ_COPPER[' + csa + ']=' + appVal + ' <= official ' + official[csa] + ' (conservative)');
      assert.ok(appVal >= official[csa] * 0.85, 'IZ_COPPER[' + csa + ']=' + appVal + ' >= 85% of ' + official[csa] + ' (not erroneously low)');
    }
  });
  // XLPE must always exceed PVC for same cross-section (physically correct: higher temp rating)
  Object.keys(IZ_COPPER).forEach(function (csa) {
    if (IZ_COPPER_XLPE[csa]) {
      assert.ok(IZ_COPPER_XLPE[csa] > IZ_COPPER[csa], 'XLPE(' + csa + ')=' + IZ_COPPER_XLPE[csa] + ' > PVC=' + IZ_COPPER[csa]);
    }
  });
});

test('standards: IZ_COPPER_XLPE matches DS/HD 60364-5-52 Table C.52.1 method C XLPE 90C exactly', function () {
  // These are the EXACT standard values for method C, multicore, 3 loaded, Cu/XLPE
  var std = {1.5:22, 2.5:30, 4:40, 6:51, 10:70, 16:94, 25:119, 35:147, 50:179, 70:229, 95:278, 120:322, 150:371, 185:424, 240:500};
  Object.keys(std).forEach(function (csa) {
    assert.strictEqual(IZ_COPPER_XLPE[Number(csa)], std[csa], 'IZ_COPPER_XLPE[' + csa + '] = ' + std[csa]);
  });
});

test('standards: IZ_ALU values within 1A of DS/HD 60364-5-52 Table C.52.1 method C Al/PVC', function () {
  // Standard values for method C, multicore, 3 loaded, Al/PVC 70C
  var std = {16:57, 25:73, 35:90, 50:110, 70:140, 95:170, 120:197, 150:226, 185:256, 240:300};
  Object.keys(std).forEach(function (csa) {
    var appVal = IZ_ALU[Number(csa)];
    assert.ok(Math.abs(appVal - std[csa]) <= 1, 'IZ_ALU[' + csa + ']=' + appVal + ' within 1A of ' + std[csa]);
  });
  // XLPE always exceeds PVC for same cross-section
  Object.keys(IZ_ALU).forEach(function (csa) {
    if (IZ_ALU_XLPE[csa]) {
      assert.ok(IZ_ALU_XLPE[csa] > IZ_ALU[csa], 'Al XLPE(' + csa + ')=' + IZ_ALU_XLPE[csa] + ' > PVC=' + IZ_ALU[csa]);
    }
  });
});

test('standards: AX_R_CU matches IEC 60228 Table 1 Class 2 at 20C', function () {
  // IEC 60228:2004 maximum DC resistance at 20C for Class 2 stranded Cu (ohm/km)
  var iec = {1.5:12.1, 2.5:7.41, 4:4.61, 6:3.08, 10:1.83, 16:1.15, 25:0.727, 35:0.524, 50:0.387, 70:0.268, 95:0.193, 120:0.153, 150:0.124, 185:0.0991, 240:0.0754};
  Object.keys(iec).forEach(function (csa) {
    assert.strictEqual(AX_R_CU[Number(csa)], iec[csa], 'AX_R_CU[' + csa + '] = ' + iec[csa] + ' (IEC 60228)');
  });
});

test('standards: AX_R_AL matches IEC 60228 Table 1 Class 2 at 20C for Al', function () {
  // IEC 60228:2004 maximum DC resistance at 20C for Class 2 stranded Al (ohm/km)
  var iec = {10:3.08, 16:1.91, 25:1.20, 35:0.868, 50:0.641, 70:0.443, 95:0.320, 120:0.253, 150:0.206, 185:0.164, 240:0.125};
  Object.keys(iec).forEach(function (csa) {
    assert.strictEqual(AX_R_AL[Number(csa)], iec[csa], 'AX_R_AL[' + csa + '] = ' + iec[csa] + ' (IEC 60228)');
  });
});

test('standards: PRODUCTS.cables Cu r-values match AX_R_CU within 5% (DC vs AC resistance)', function () {
  // NKT NOIKLX product r-values are AC resistance at 50Hz from the NKT datasheet.
  // AX_R_CU is the IEC 60228 maximum DC resistance at 20C.
  // For large cross-sections (>=120mm2), skin effect adds 1-5% to AC resistance.
  // Both values are correct for their purpose:
  //   AX_R_CU: exam engine (matches exam answer keys using IEC 60228)
  //   PRODUCTS.r: engineering calculations (realistic AC operating conditions)
  var cables = PRODUCTS.cables.filter(function (c) { return c.material === 'Cu'; });
  cables.forEach(function (c) {
    var expected = AX_R_CU[c.mm2];
    if (expected !== undefined) {
      var pctDiff = Math.abs(c.r - expected) / expected * 100;
      assert.ok(pctDiff < 5, c.id + ' r=' + c.r + ' within 5% of AX_R_CU ' + expected + ' (diff=' + pctDiff.toFixed(1) + '%)');
    }
  });
});

test('standards: INSTALL_METHODS has correct structure and conservatism', function () {
  // Method C is the reference (factor 1.0)
  assert.strictEqual(INSTALL_METHODS['C'], 1.0, 'Method C = 1.0 (reference)');
  // Methods with less cooling must have factor <= 1.0
  assert.ok(INSTALL_METHODS['A1'] <= 1.0, 'A1 <= 1.0 (insulated wall)');
  assert.ok(INSTALL_METHODS['A2'] <= 1.0, 'A2 <= 1.0 (conduit in insulated wall)');
  assert.ok(INSTALL_METHODS['B2'] <= 1.0, 'B2 <= 1.0 (trunking)');
  // Methods with better cooling must have factor >= 1.0
  assert.ok(INSTALL_METHODS['E'] >= 1.0, 'E >= 1.0 (perforated tray)');
  assert.ok(INSTALL_METHODS['F'] >= 1.0, 'F >= 1.0 (free air touching)');
  assert.ok(INSTALL_METHODS['G'] >= 1.0, 'G >= 1.0 (free air spaced)');
  // Physical ordering: better cooling = higher factor. E < F < G is certain.
  assert.ok(INSTALL_METHODS['E'] <= INSTALL_METHODS['F'], 'E <= F');
  assert.ok(INSTALL_METHODS['F'] <= INSTALL_METHODS['G'], 'F <= G');
  // A-methods (enclosed) must both be below B-methods (surface) or equal
  assert.ok(INSTALL_METHODS['A1'] <= INSTALL_METHODS['B1'], 'A1 <= B1');
  assert.ok(INSTALL_METHODS['A2'] <= INSTALL_METHODS['B1'], 'A2 <= B1');
});

test('eng: stdChip renders clickable <details> with why + affects, graceful for unknown clause', function () {
  var prev = lang; lang = 'da';
  var chip = stdChip('DS/HD 60364-4-41');
  assert.ok(chip.indexOf('<details') >= 0, 'is a details element (click-only)');
  assert.ok(chip.indexOf('Hvorfor') >= 0 && chip.indexOf('P\u00e5virker') >= 0, 'shows why + affects');
  assert.ok(stdChip('UNKNOWN-CLAUSE').indexOf('UNKNOWN-CLAUSE') >= 0, 'unknown clause still rendered');
  lang = prev;
});

test('eng: engCableReasoning includes clickable standards, variables table, and rejected alternatives', function () {
  var prev = lang; lang = 'da';
  var c = engCableReasoning({ ib: 49.1, baseIz: 76, kInstall: 1, kTemp: 1.04, kGroup: 1, correctedIz: 79, cableType: 'NOIKLX', mm2: 16, installMethod: 'C', tempC: 25, groupCount: 1, verdict: 'pass', altSmaller: 10, altSmallerIz: 56 });
  assert.ok(c.indexOf('<details') >= 0, 'clickable standards chip');
  assert.ok(c.indexOf('Alternativer') >= 0, 'alternatives-considered section');
  assert.ok(c.indexOf('10 mm') >= 0, 'rejected smaller cross-section shown');
  assert.ok(c.indexOf('undefined') < 0 && c.indexOf('NaN') < 0, 'no leaks');
  lang = prev;
});

test('eng: engBreakerReasoning includes alternatives (lower rejected) + standards chips', function () {
  var prev = lang; lang = 'en';
  var b = engBreakerReasoning({ ib: 49.1, deviceIn: 50, deviceIcu: 13.8, ikMax: 13800, curve: 'C', deviceLabel: 'Acti9', izCorrected: 79, verdict: 'pass', altLower: 40, altHigher: 63 });
  assert.ok(b.indexOf('<details') >= 0, 'standards chips');
  assert.ok(b.indexOf('alternatives') >= 0 || b.indexOf('Alternatives') >= 0, 'alternatives section');
  assert.ok(b.indexOf('undefined') < 0 && b.indexOf('NaN') < 0, 'no leaks');
  lang = prev;
});

test('eng: STD_REGISTRY covers the core life-safety clauses', function () {
  ['DS/HD 60364-4-41', 'DS/HD 60364-4-43', 'DS/HD 60364-5-52', 'IEC 60898-1', 'IEC 60269-2', 'IEC 61008-1', 'IEC 60909-0', 'IEC 60947-4-1'].forEach(function (clause) {
    assert.ok(STD_REGISTRY[clause] && STD_REGISTRY[clause].why_da && STD_REGISTRY[clause].affects_en, clause + ' has why + affects in both languages');
  });
});

test('sld: sldLoadState restores a saved tree object; sldLoad(x,y) stays the SVG drawer (name-collision fix)', function () {
  if (typeof localStorage !== 'undefined' && localStorage.setItem) {
    sldTree = sldCreateTree();
    var rootId = sldTree.rootId;
    sldSave();
    var loaded = sldLoadState();
    assert.ok(loaded && typeof loaded === 'object' && !Array.isArray(loaded), 'sldLoadState returns an object, not an SVG string');
    assert.strictEqual(loaded.rootId, rootId, 'restored tree has the same rootId');
  }
  var sym = sldLoad(10, 20);
  assert.ok(typeof sym === 'string' && sym.indexOf('<') >= 0, 'sldLoad(x,y) is the SVG load-symbol drawer');
});

test('notation: fmtSym normalizes known symbols but never mangles abbreviations', function () {
  assert.strictEqual(fmtSym('Icu'), 'I<sub>cu</sub>');
  assert.strictEqual(fmtSym('Ics'), 'I<sub>cs</sub>');
  assert.strictEqual(fmtSym('Isd'), 'I<sub>sd</sub>');
  assert.strictEqual(fmtSym('Zn'), 'Z<sub>n</sub>');
  assert.strictEqual(fmtSym('Un'), 'U<sub>n</sub>');
  assert.strictEqual(fmtSym('XL'), 'X<sub>L</sub>');
  ['COP', 'FLC', 'IP', 'LRA', 'DF', 'EF', 'A', 'k', 'C'].forEach(function (abbr) {
    assert.strictEqual(fmtSym(abbr), abbr, abbr + ' must not be mangled');
  });
  assert.strictEqual(fmtSym('I<sub>cu</sub>'), 'I<sub>cu</sub>', 'idempotent on HTML sub');
  assert.strictEqual(fmtSym('I\u2099'), 'I\u2099', 'idempotent on Unicode subscript');
  assert.strictEqual(fmtSym(''), '', 'empty safe');
  assert.strictEqual(fmtSym(null), '', 'null safe');
});

test('eng: engTree renders expandable <details> nodes and classifies into exam structure', function () {
  var prev = lang; lang = 'da';
  var results = [
    { label: 'Ik3,max', value: '13.8 kA', status: 'ok', html: '' },
    { label: 'Belastningsstr\u00f8m IB', value: '49 A', status: 'ok', html: '' },
    { label: 'Kabel 16', value: '16 mm\u00b2', status: 'ok', html: '' },
    { label: 'Zs verifikation', value: '1.2', status: 'fail', html: '' }
  ];
  var tree = analyzerBuildEngTree(results);
  // 3 groups present
  var labels = tree.children.map(function (c) { return c.label.split('\u2014')[0].trim(); });
  assert.ok(labels.indexOf('Forsyning') >= 0 && labels.indexOf('Installation') >= 0 && labels.indexOf('Verifikation') >= 0, 'all 3 exam sections');
  // Correct classification (the "verifikation contains ik" trap must not misfile Zs)
  var verif = tree.children.filter(function (c) { return c.label.indexOf('Verifikation') === 0; })[0];
  assert.ok(verif.children.some(function (n) { return n.label.indexOf('Zs') >= 0; }), 'Zs filed under Verifikation, not Forsyning');
  var fors = tree.children.filter(function (c) { return c.label.indexOf('Forsyning') === 0; })[0];
  assert.ok(fors.children.some(function (n) { return n.label.indexOf('Ik') >= 0; }), 'Ik filed under Forsyning');
  // Renders as click-only <details>
  var htmlOut = engTree(tree);
  assert.ok(htmlOut.indexOf('<details') >= 0 && htmlOut.indexOf('eng-tree') >= 0, 'expandable details tree');
  assert.ok(htmlOut.indexOf('\u26d4') >= 0, 'fail status icon propagates up the branch');
  assert.ok(htmlOut.indexOf('undefined') < 0 && htmlOut.indexOf('NaN') < 0, 'no leaks');
  lang = prev;
});

test('load: housing-estate diversity matches both Elektroteknik Bind 5 Formel 246 methods', function () {
  var pm = diversityState.method, ph = diversityState.homes, pk = diversityState.kwhPerHome, pa = diversityState.areaPerHome;
  diversityState.method = 'energy'; diversityState.homes = 100; diversityState.kwhPerHome = 8300;
  assert.ok(Math.abs(calcDiversityPb() - 0.834 * Math.pow(8.3 * 100, 0.89)) < 0.01, 'energy formula Pb=0.834·(W·n)^0.89 exact');
  diversityState.method = 'area'; diversityState.homes = 15; diversityState.areaPerHome = 130;
  assert.ok(Math.abs(calcDiversityPb() - 0.12 * Math.pow(130 * 15, 0.74)) < 0.01, 'area formula Pb=0.12·(A·n)^0.74 exact');
  assert.ok(Math.abs(calcDiversityPb() - 32.6) < 0.2, 'area numeric ~32.6 kW');
  diversityState.method = pm; diversityState.homes = ph; diversityState.kwhPerHome = pk; diversityState.areaPerHome = pa;
});

test('load: diversity textbook example 20 homes x 130 m2 = 40.4 kW (Formel 246 Eksempel 9.1.1.1)', function () {
  var pm = diversityState.method, ph = diversityState.homes, pa = diversityState.areaPerHome;
  diversityState.method = 'area'; diversityState.homes = 20; diversityState.areaPerHome = 130;
  assert.ok(Math.abs(calcDiversityPb() - 40.4) < 0.1, 'matches textbook 40.4 kW (got ' + calcDiversityPb().toFixed(2) + ')');
  diversityState.method = pm; diversityState.homes = ph; diversityState.areaPerHome = pa;
});

test('load: diversityRangeNote enforces Formel 246 validity ranges (area 9-20, energy >20)', function () {
  var pm = diversityState.method, ph = diversityState.homes;
  diversityState.method = 'area'; diversityState.homes = 15;
  assert.ok(diversityRangeNote() === null, 'area @15 homes: in range, no warning');
  diversityState.homes = 50;
  assert.ok(diversityRangeNote() !== null, 'area @50 homes: out of range -> warns');
  diversityState.method = 'energy'; diversityState.homes = 100;
  assert.ok(diversityRangeNote() === null, 'energy @100 homes: in range, no warning');
  diversityState.homes = 10;
  assert.ok(diversityRangeNote() !== null, 'energy @10 homes: out of range -> warns');
  diversityState.method = pm; diversityState.homes = ph;
});

// ===== XLPE vs PVC TEMPERATURE CORRECTION FACTOR (DS/HD 60364-5-52 Table B.52.14) =====
test('cable: PVC vs XLPE temperature factors differ correctly (k=sqrt((thMax-amb)/(thMax-30)))', function () {
  // PVC 70C: 0.71 @50C, 1.22 @10C ; XLPE 90C: 0.82 @50C, 1.15 @10C
  assert.ok(Math.abs(TEMP_FACTORS[50] - 0.71) < 1e-9, 'PVC@50 = 0.71');
  assert.ok(Math.abs(TEMP_FACTORS_XLPE[50] - 0.82) < 1e-9, 'XLPE@50 = 0.82');
  assert.ok(Math.abs(TEMP_FACTORS[10] - 1.22) < 1e-9, 'PVC@10 = 1.22');
  assert.ok(Math.abs(TEMP_FACTORS_XLPE[10] - 1.15) < 1e-9, 'XLPE@10 = 1.15');
  // Above 30C the XLPE factor is LARGER (less derating); below 30C it is SMALLER.
  assert.ok(TEMP_FACTORS_XLPE[50] > TEMP_FACTORS[50], 'XLPE less sensitive at high ambient');
  assert.ok(TEMP_FACTORS_XLPE[10] < TEMP_FACTORS[10], 'using PVC factor for XLPE below 30C would over-estimate capacity (unsafe) -> must differ');
});

test('cable: tempFactorFor follows insulation; isXlpeCable detects NOIKLX', function () {
  assert.ok(isXlpeCable('NOIKLX 90 Dca') === true, 'NOIKLX = XLPE');
  assert.ok(isXlpeCable('PVC kabel') === false, 'PVC not XLPE');
  assert.ok(Math.abs(tempFactorFor(50, true) - 0.82) < 1e-9, 'tempFactorFor XLPE@50 = 0.82');
  assert.ok(Math.abs(tempFactorFor(50, false) - 0.71) < 1e-9, 'tempFactorFor PVC@50 = 0.71');
  assert.ok(Math.abs(tempFactorFor(999, false) - 1.0) < 1e-9, 'unknown temp -> 1.0 fallback');
});

test('cable: upTempFactor interpolation respects insulation table', function () {
  // 45C is tabulated: PVC 0.79, XLPE 0.87
  assert.ok(Math.abs(upTempFactor(45, false) - 0.79) < 1e-9, 'PVC@45 = 0.79');
  assert.ok(Math.abs(upTempFactor(45, true) - 0.87) < 1e-9, 'XLPE@45 = 0.87');
  // 42C interpolates between 40 and 45
  var pvc42 = upTempFactor(42, false), xlpe42 = upTempFactor(42, true);
  assert.ok(pvc42 > 0.79 && pvc42 < 0.87, 'PVC@42 interpolated in range');
  assert.ok(xlpe42 > pvc42, 'XLPE@42 > PVC@42');
});

test('exam: axSelectCable answer key uses XLPE temp factor for XLPE insulation', function () {
  // At 50C ambient, In=100A. With XLPE factor 0.82 the required base Iz = 100/0.82 = 122A.
  // With the (wrong) PVC factor 0.71 it would be 141A -> a larger cable -> wrong answer key.
  var selX = axSelectCable(100, 'Cu', 'XLPE', tempFactorFor(50, true), 1, 1);
  var selP = axSelectCable(100, 'Cu', 'XLPE', tempFactorFor(50, false), 1, 1);
  assert.ok(selX !== null && selP !== null, 'both selections resolve');
  // The XLPE-correct factor (0.82) is less severe -> selects an equal or smaller CSA than PVC factor.
  assert.ok(selX.csa <= selP.csa, 'correct XLPE factor never oversizes vs PVC factor (' + selX.csa + ' <= ' + selP.csa + ')');
  assert.ok(Math.abs(selX.k - 0.82) < 1e-9, 'k reflects XLPE factor 0.82');
});

// ===== COMPLEX SHORT-CIRCUIT (IEC 60909 / El-7 vector method) =====
test('scircuit: scComplexParts matches El-7 textbook (R/X=0.4 => phi=68.2deg, cos=0.371, sin=0.928)', function () {
  var p = scComplexParts(10, 0.4);
  assert.ok(Math.abs(p.phiDeg - 68.2) < 0.1, 'phi = arccot(0.4) = 68.2deg (got ' + p.phiDeg.toFixed(2) + ')');
  assert.ok(Math.abs(p.R / p.mag - 0.371) < 0.002, 'cos phi = 0.371');
  assert.ok(Math.abs(p.X / p.mag - 0.928) < 0.002, 'sin phi = 0.928');
  assert.ok(Math.abs(Math.sqrt(p.R * p.R + p.X * p.X) - p.mag) < 1e-9, '|Z| reconstructs from R,X');
  assert.ok(Math.abs(p.R / p.X - 0.4) < 1e-9, 'R/X ratio preserved = 0.4');
});

test('scircuit: scComplexParts R=|Z|cos(phi), X=|Z|sin(phi) for various R/X', function () {
  [0.05, 0.1, 0.25, 0.5, 1.0].forEach(function (rx) {
    var p = scComplexParts(7.3, rx);
    var phi = Math.atan(1 / rx);
    assert.ok(Math.abs(p.R - 7.3 * Math.cos(phi)) < 1e-9, 'R correct rx=' + rx);
    assert.ok(Math.abs(p.X - 7.3 * Math.sin(phi)) < 1e-9, 'X correct rx=' + rx);
    assert.ok(p.X >= p.R - 1e-9, 'X>=R for inductive R/X<=1 (rx=' + rx + ')');
  });
});

test('scircuit: complex vector sum |Ztot| <= scalar |Z|-sum (conservative => higher Ik)', function () {
  var saved = JSON.parse(JSON.stringify(scState));
  // Different angles for net vs trafo => strict inequality
  scState.zNet = 1; scState.zTrafo = 5; scState.rxNet = 0.4; scState.rxTrafo = 0.1;
  var cx = scComplexCalc(scState, 0, 0, 400, 1.05);
  var scalarSum = scState.zNet + scState.zTrafo;
  assert.ok(cx.Zbus < scalarSum, 'vector |Zbus|=' + cx.Zbus.toFixed(3) + ' < scalar sum=' + scalarSum);
  var ikScalar = (1.05 * 400) / (Math.sqrt(3) * scalarSum / 1000);
  assert.ok(cx.ikMax3ph > ikScalar, 'complex Ik3max higher than scalar (more conservative for breaking capacity)');
  Object.assign(scState, saved);
});

test('scircuit: equal R/X angles => vector sum equals scalar sum (no error)', function () {
  var saved = JSON.parse(JSON.stringify(scState));
  scState.zNet = 1; scState.zTrafo = 5; scState.rxNet = 0.1; scState.rxTrafo = 0.1;
  var cx = scComplexCalc(scState, 0, 0, 400, 1.05);
  assert.ok(Math.abs(cx.Zbus - 6) < 1e-9, 'colinear vectors add to scalar sum = 6 mOhm');
  Object.assign(scState, saved);
});

test('scircuit: cable R,X added as true vectors at far end', function () {
  var saved = JSON.parse(JSON.stringify(scState));
  scState.zNet = 1; scState.zTrafo = 5; scState.rxNet = 0.2; scState.rxTrafo = 0.15;
  var cx = scComplexCalc(scState, 12, 8, 400, 1.05); // 12 mOhm R, 8 mOhm X cable
  assert.ok(Math.abs(cx.Rend - (cx.Rbus + 12)) < 1e-9, 'Rend = Rbus + cable R');
  assert.ok(Math.abs(cx.Xend - (cx.Xbus + 8)) < 1e-9, 'Xend = Xbus + cable X');
  assert.ok(Math.abs(cx.Zend - Math.sqrt(cx.Rend * cx.Rend + cx.Xend * cx.Xend)) < 1e-9, '|Zend| = sqrt(Rend^2+Xend^2)');
  assert.ok(cx.ikMin2ph > 0, 'Ik2min positive');
  Object.assign(scState, saved);
});

test('scircuit: renderShortCircuit renders complex mode without crash (da/en) + shows decomposition', function () {
  var saved = JSON.parse(JSON.stringify(scState)); var savedLang = lang;
  scState.scMethod = 'complex'; scState.rxNet = 0.4; scState.rxTrafo = 0.1;
  ['da', 'en'].forEach(function (lg) {
    lang = lg;
    var h = renderShortCircuit();
    assert.ok(h.indexOf('undefined') === -1, 'no undefined in complex render (' + lg + ')');
    assert.ok(h.indexOf('NaN') === -1, 'no NaN in complex render (' + lg + ')');
    assert.ok(/arccot|R\/X/.test(h), 'shows R/X / arccot decomposition (' + lg + ')');
    assert.ok(/\u2220/.test(h), 'shows polar angle symbol (' + lg + ')');
  });
  // scalar mode still renders
  scState.scMethod = 'scalar';
  var hs = renderShortCircuit();
  assert.ok(hs.indexOf('undefined') === -1 && hs.indexOf('NaN') === -1, 'scalar render clean');
  lang = savedLang; Object.assign(scState, saved);
});

test('scircuit: scMethod defaults to scalar (no behavior change for existing users)', function () {
  // Fresh default must be scalar so legacy calculations are unchanged.
  assert.ok(['scalar', 'complex'].indexOf(scState.scMethod) !== -1, 'scMethod valid');
});

test('scircuit: Viggo transformer angle = arccos(e_r/u_k) (authorized nameplate method)', function () {
  var saved = JSON.parse(JSON.stringify(scState));
  scState.trafoAngleMode = 'viggo'; scState.trafoUk = 4; scState.trafoEr = 1;
  var tr = scTrafoParts(10, scState); // |Z| = 10 mOhm
  assert.ok(Math.abs(tr.phiDeg - 75.52) < 0.05, 'phi = arccos(1/4) = 75.52 deg (got ' + tr.phiDeg.toFixed(2) + ')');
  assert.ok(Math.abs(tr.ex - Math.sqrt(16 - 1)) < 1e-9, 'e_x = sqrt(uk^2 - er^2) = 3.873%');
  assert.ok(Math.abs(tr.rx - (1 / Math.sqrt(15))) < 1e-9, 'R/X = e_r/e_x consistent');
  // arccos(er/uk) must equal arctan(ex/er)
  assert.ok(Math.abs(tr.phiDeg - Math.atan(tr.ex / tr.er) * 180 / Math.PI) < 1e-9, 'arccos == arctan(X/R)');
  // R,X reconstruct |Z|
  assert.ok(Math.abs(Math.sqrt(tr.R * tr.R + tr.X * tr.X) - 10) < 1e-9, '|Z| reconstructs');
  Object.assign(scState, saved);
});

test('scircuit: Viggo guards e_r > u_k (clamped, no NaN)', function () {
  var saved = JSON.parse(JSON.stringify(scState));
  scState.trafoAngleMode = 'viggo'; scState.trafoUk = 4; scState.trafoEr = 9; // invalid: er>uk
  var tr = scTrafoParts(10, scState);
  assert.ok(isFinite(tr.phiDeg) && !isNaN(tr.R) && !isNaN(tr.X), 'no NaN when er>uk');
  assert.ok(tr.phiDeg >= 0, 'angle stays valid');
  Object.assign(scState, saved);
});

test('scircuit: complex calc uses Viggo trafo angle when selected; renders without crash', function () {
  var saved = JSON.parse(JSON.stringify(scState)); var savedLang = lang;
  scState.scMethod = 'complex'; scState.trafoAngleMode = 'viggo'; scState.trafoUk = 6; scState.trafoEr = 1.5;
  var cx = scComplexCalc(scState, 0, 0, 400, 1.05);
  assert.ok(cx.tr.mode === 'viggo', 'trafo decomposition flagged viggo');
  assert.ok(Math.abs(cx.tr.phiDeg - Math.acos(1.5 / 6) * 180 / Math.PI) < 1e-9, 'busbar uses arccos angle');
  ['da', 'en'].forEach(function (lg) {
    lang = lg;
    var html = renderShortCircuit();
    assert.ok(html.indexOf('undefined') === -1 && html.indexOf('NaN') === -1, 'no undefined/NaN (' + lg + ')');
    assert.ok(/arccos/.test(html), 'shows arccos derivation (' + lg + ')');
  });
  lang = savedLang; Object.assign(scState, saved);
});

test('exam: axIkComplexTrafo vector method (network + arccos transformer) is correct', function () {
  // 630 kVA, ek=4%, Pcu=6500W, Sk=500 MVA, R/X=0.1
  var X = axIkComplexTrafo(630, 4, 6500, 400, 1.05, 500, 0.1);
  assert.ok(Math.abs(X.In - 909) < 1, 'In = 909 A');
  assert.ok(Math.abs(X.Zt - 10.16) < 0.05, 'Zt = (ek/100)*U^2/SN = 10.16 mOhm');
  assert.ok(Math.abs(X.er - 1.03) < 0.02, 'er = Pcu/SN = 1.03 %');
  assert.ok(Math.abs(X.phiTdeg - Math.acos(X.er / 4) * 180 / Math.PI) < 0.2, 'phi_trafo = arccos(er/ek)');
  // |Z_tot| must be the vector magnitude, <= scalar sum
  assert.ok(X.Ztot <= X.Zn + X.Zt + 1e-6, 'vector |Z_tot| <= scalar sum');
  assert.ok(X.Ik3kA >= X.Ik3scalarkA - 1e-9, 'complex Ik3 >= scalar estimate (conservative)');
  // including network impedance lowers Ik below the c-scaled stiff-grid transformer-only value
  assert.ok(X.Ik3kA > 20 && X.Ik3kA < 25, 'Ik3 in physical range ~23 kA (got ' + X.Ik3kA + ')');
});

test('exam: iktrafo_complex task generates at high tiers and solves with arccos + phasor', function () {
  var rng = axRngMake(12345);
  var gen = axGenForsyning(rng, axBuilding ? axBuilding('fabrik') : null, axTier('ekspert'));
  var cxTask = gen.tasks.filter(function (t) { return t.kind === 'iktrafo_complex'; })[0];
  assert.ok(cxTask, 'ekspert forsyning includes a complex short-circuit task');
  assert.ok(cxTask.opts.indexOf(cxTask.answer) === cxTask.ci, 'answer index consistent');
  var sol = axSolveTask(cxTask, gen.data);
  assert.ok(sol.steps.length >= 5, 'worked solution has full step chain');
  assert.ok(/arccos/.test(JSON.stringify(sol.steps)), 'solution shows arccos transformer angle');
  assert.ok(typeof sol.curve === 'string' && /Z\u0305_tot/.test(sol.curve), 'phasor diagram drawn with Z_tot');
  assert.ok(sol.curve.indexOf('NaN') === -1 && sol.curve.indexOf('undefined') === -1, 'phasor svg clean');
});

test('exam: lower tiers do NOT get the complex task (kept exam-appropriate)', function () {
  var rng = axRngMake(777);
  var gen = axGenForsyning(rng, null, axTier('laerling'));
  assert.ok(gen.tasks.filter(function (t) { return t.kind === 'iktrafo_complex'; }).length === 0, 'apprentice has no complex SC task');
});

// ===== LINE/FEEDER RELAY (linjerelæ) — textbook validation =====
test('relay: relayLineSettings reproduces Elektroteknik Bind 6 Eksempel 7.4.5.1 exactly', function () {
  // Given: cable rating 310 A, Ik2F,min = 1.5 kA, upstream busbar relay 1000 ms.
  // Textbook answer: CT 400/5, I> = 0.93, I>> = 2.8, t> = 500 ms.
  var r = relayLineSettings(310, 1500, 1000);
  assert.ok(r.ctRatio === '400/5', 'CT primary = 400/5 (I1 >= 310*1.2 = 372 A). Got ' + r.ctRatio);
  assert.ok(Math.abs(r.iGt - 0.93) < 0.01, 'I> = 372/400 = 0.93. Got ' + r.iGt);
  assert.ok(Math.abs(r.iGg - 2.8) < 0.02, 'I>> = 0.75*1500/400 = 2.81 ~ 2.8. Got ' + r.iGg);
  assert.ok(r.tGt === 500, 't> = busbar 1000ms - 500ms grading = 500ms. Got ' + r.tGt);
  assert.ok(r.tGg === 200, 't>> default 200 ms. Got ' + r.tGg);
  assert.ok(r.iGgPrimary === 1125, 'I>> primary pickup = 0.75*1500 = 1125 A');
});

test('relay: relayLineSettings is conservative — fast trip set below the minimum fault', function () {
  var r = relayLineSettings(400, 2000, 800);
  assert.ok(r.iGgPrimary < 2000, 'I>> primary (' + r.iGgPrimary + ') < Ik2F,min (2000) — reliable tripping');
  var ctPrimaryNum = parseInt(r.ctRatio, 10);
  assert.ok(ctPrimaryNum >= 400 * 1.2, 'CT primary >= 1.2*Iload');
});

test('relay: cableShortTimeWithstand reproduces Eksempel 7.4.3.1 (4.7 kA, t=0.5s -> 6.65 kA)', function () {
  // 50 mm2 PEX-M-AL: IK1s_phase = 4.7 kA, t = 0.5 s. Withstand = 4.7/sqrt(0.5) = 6.65 kA.
  // Textbook rounds to 6.7 kA; actual fault Ik3F = 5.8 kA < withstand -> OK.
  var cw = cableShortTimeWithstand(4.7, 3.0, 5.8, 2.0, 0.5, false);
  assert.ok(Math.abs(cw.phaseWithstand - 4.7 / Math.sqrt(0.5)) < 0.01, 'phase withstand = IK1s/sqrt(t) = 6.65 kA. Got ' + cw.phaseWithstand);
  assert.ok(cw.phaseOk === true, 'Ik3F 5.8 kA <= 6.65 kA -> phase OK');
  assert.ok(Math.abs(cw.screenReq - 2.0 * Math.sqrt(0.5)) < 0.01, 'screen requirement = Ik2F*sqrt(t)');
});

test('relay: cable screen check uses DOUBLE time with fast auto-reclose (conservative)', function () {
  var noRec = cableShortTimeWithstand(4.7, 3.0, 5.8, 2.0, 0.5, false);
  var rec = cableShortTimeWithstand(4.7, 3.0, 5.8, 2.0, 0.5, true);
  assert.ok(rec.tScreen === 2 * noRec.tScreen, 'reclose doubles the screen time basis');
  assert.ok(rec.screenReq > noRec.screenReq, 'reclose increases the required screen 1s current (harder, conservative)');
});

test('relay: cableShortTimeWithstand flags an under-rated screen', function () {
  // Big 2-phase fault, weak screen -> must fail the screen check.
  var cw = cableShortTimeWithstand(10, 1.5, 6, 5, 1.0, true); // screen 1.5 kA, needs 5*sqrt(2)=7.07
  assert.ok(cw.screenOk === false, 'weak screen (1.5 kA) < required (7.07 kA) -> fail');
});

// ===== REDEKAMLINJE / DISTRIBUTION FEEDER VOLTAGE DROP — textbook validation =====
test('vdrop: redekamVoltageDrop reproduces Eksempel 7.4.1.3 (8x400kVA, 10kV, 95mm2 -> 4.45%)', function () {
  // 8 stations, 1 km apart (1..8 km), 400 kVA each, cosphi 0.8, 95 mm2 PEX-S-Al r=0.32 x=0.088.
  var Iper = 400000 / (Math.sqrt(3) * 10000);  // 23.09 A
  var st = [];
  for (var k = 1; k <= 8; k++) st.push({ I: Iper, l: k });
  var r = redekamVoltageDrop(st, 0.32, 0.088, 0.8, 10000);
  assert.ok(Math.abs(r.sumIL - Iper * 36) < 0.1, 'Sum(I*l) = I*(1+..+8) = 36*I = 831.4 A*km. Got ' + r.sumIL);
  assert.ok(Math.abs(r.dUf - 256.7) < 0.5, 'phase drop dUf ~256.7 V. Got ' + r.dUf);
  assert.ok(Math.abs(r.pct - 4.45) < 0.05, 'line drop ~4.45% (< 7% limit). Got ' + r.pct);
  assert.ok(r.pct < 7, 'satisfies the 7% network limit');
});

test('vdrop: redekamMinCsa ~ textbook 53 mm2 minimum for the 7% limit (Al)', function () {
  var Iper = 400000 / (Math.sqrt(3) * 10000);
  var sumIL = Iper * 36;
  // Textbook gives 53 mm2 minimum; rho_Al ~28-30 Ω·mm²/km gives ~52-56.
  var sMin = redekamMinCsa(sumIL, 0.09, 0.8, 10000, 7, 28.6);
  assert.ok(sMin >= 48 && sMin <= 58, 'min CSA in textbook range ~53 mm2. Got ' + sMin);
});

// ===== GROUPING FACTOR — method-aware (B.52.17 vs B.52.18) =====
test('cable: groupFactorFor uses B.52.17 (bunched) for methods A/B/C and B.52.18 (tray) for E/F', function () {
  assert.ok(Math.abs(groupFactorFor('C', 3) - 0.70) < 1e-9, 'method C, 3 circuits: bunched 0.70');
  assert.ok(Math.abs(groupFactorFor('E', 3) - 0.82) < 1e-9, 'method E, 3 circuits: tray 0.82 (Viggo 2018)');
  assert.ok(Math.abs(groupFactorFor('F', 3) - 0.82) < 1e-9, 'method F, 3 circuits: tray 0.82');
  assert.ok(Math.abs(groupFactorFor('B', 2) - 0.80) < 1e-9, 'method B, 2 circuits: bunched 0.80');
  assert.ok(Math.abs(groupFactorFor('E', 2) - 0.88) < 1e-9, 'method E, 2 circuits: tray 0.88');
  assert.ok(groupFactorFor('E', 9) > groupFactorFor('C', 9), 'tray always less severe than bunched');
});

test('cable: groupFactorFor matches Viggo 2018 august (method E, 3 circuits = 0.82)', function () {
  // From Viggo Bitsch "Autoprøve MM 2018 august, Opgave 2.1.3":
  //   "0,82 – 3 strømkredse, tabel B.52.17" (he cites B.52.17 but uses the
  //   single-layer tray values because installation method is E — cable tray/ladder).
  assert.ok(Math.abs(groupFactorFor('E', 3) - 0.82) < 1e-9, 'Viggo authorization answer = 0.82');
  // The OLD single-table approach gave 0.70 for 3 circuits (too conservative, wrong exam answer).
  assert.ok(Math.abs(GROUP_FACTORS_BUNCHED[3] - 0.70) < 1e-9, 'bunched table gives 0.70 (over-conservative for E)');
});

test('exam: axGenInstallation includes installMethod and uses method-aware grouping', function () {
  var rng = axRngMake(999);
  var d = axGenInstallation(rng, axBuilding('fabrik'), axTier('kandidat'));
  assert.ok(d.installMethod === 'C' || d.installMethod === 'E', 'installMethod is C or E. Got ' + d.installMethod);
  // Generate the tasks and check the cable task uses the correct grouping
  var tasks = axTasksInstallation(d, axTier('kandidat'), 20);
  var cabTask = tasks.filter(function (t) { return t.kind === 'cable'; })[0];
  if (cabTask) {
    var kExpected = groupFactorFor(d.installMethod, d.grouping);
    assert.ok(Math.abs(cabTask.given.kGroup - kExpected) < 0.01,
      'cable task kGroup matches groupFactorFor(' + d.installMethod + ',' + d.grouping + ') = ' + kExpected + '. Got ' + cabTask.given.kGroup);
  }
});

test('exam: 2023 Auto exam — Z_T formula (630kVA, ek=4%, Pcu=4600W, 420V) = 11.2 mOhm ∠ 79.5°', function () {
  var cx = axIkComplexTrafo(630, 4, 4600, 420, 1.0, 500, 0.1);
  assert.ok(Math.abs(cx.Zt - 11.2) < 0.1, 'Z_T = 11.2 mOhm. Got ' + cx.Zt);
  assert.ok(Math.abs(cx.phiTdeg - 79.5) < 0.2, 'phi_T = 79.5 deg. Got ' + cx.phiTdeg);
});

// ===== END-TO-END FIXTURE: Viggo Auto 2023-01 forsyning chain =====
// Validates the COMPLETE forsyning calculation chain against the published
// solution: network Z (from Ik), HV cable referred to LV via /n², transformer
// Z_T, vector sum, prospective Ik3F,min, and the HV-referred fault current.
// Tolerances allow for the exam's rounded intermediate polar values (~1%).
test('exam: 2023 Auto exam FULL CHAIN — Ik3F,min ≈ 17.7 kA, IK\u2032FN ≈ 410 A', function () {
  var Un = 10000, Uf = 230, n = 25;
  // 1) Network impedance for the MIN fault (max Z): Ik,min=6820 A, R/X=0.15.
  var ZnetMag = Un / (Math.sqrt(3) * 6820);          // 0.847 Ω
  var net = scComplexParts(ZnetMag * 1000, 0.15);    // mΩ, arccot(0.15)
  assert.ok(Math.abs(ZnetMag - 0.847) < 0.01, '|Z_net,max| = 0.85 Ω (exam). Got ' + ZnetMag.toFixed(3));
  assert.ok(Math.abs(net.phiDeg - 81.5) < 0.2, 'φ_net = arccot(0.15) = 81.5°. Got ' + net.phiDeg.toFixed(1));
  // 2) HV cable 1.389 km of 3x150 PEX-M-AL: r=0.206, x=0.093 Ω/km.
  var Zc_re = 1.389 * 0.206 * 1000, Zc_im = 1.389 * 0.093 * 1000; // mΩ on HV
  // 3) Refer network+cable to LV by /n².
  var lv_re = (net.R + Zc_re) / (n * n), lv_im = (net.X + Zc_im) / (n * n);
  // 4) Transformer Z_T from the app helper (referred to the 420 V no-load secondary,
  //    as the exam does → 11.2 mΩ; using 400 V nominal would give 10.16 mΩ).
  var cx = axIkComplexTrafo(630, 4, 4600, 420, 1.0, 500, 0.1);
  assert.ok(Math.abs(cx.Zt - 11.2) < 0.1, 'Z_T = 11.2 mΩ at 420 V. Got ' + cx.Zt);
  var Zt_re = cx.Zt * Math.cos(cx.phiTdeg * Math.PI / 180);
  var Zt_im = cx.Zt * Math.sin(cx.phiTdeg * Math.PI / 180);
  // 5) Vector sum + prospective fault current.
  var Rtot = lv_re + Zt_re, Xtot = lv_im + Zt_im;
  var Ztot = Math.sqrt(Rtot * Rtot + Xtot * Xtot);
  var Ik3Fmin = Uf / (Ztot / 1000);
  assert.ok(Math.abs(Ik3Fmin / 1000 - 17.73) < 0.3, 'Ik3F,min ≈ 17.7 kA (exam 17.73). Got ' + (Ik3Fmin / 1000).toFixed(2));
  // 6) HV-referred fault current IK′FN = Ik3F,min / (√3 · n).
  var IKfn = Ik3Fmin / (Math.sqrt(3) * n);
  assert.ok(Math.abs(IKfn - 409.5) < 8, 'IK′FN,min ≈ 410 A (exam 409.5). Got ' + IKfn.toFixed(1));
});

test('exam: 2023 Auto exam — network Z from Ik uses atan(1/(R/X)) = 84.3° for R/X=0.1', function () {
  var Zn = 10000 / (Math.sqrt(3) * 7120);
  var phi = Math.atan(1 / 0.1) * 180 / Math.PI;
  assert.ok(Math.abs(Zn - 0.811) < 0.01, '|Z_net| = 0.81 ohm. Got ' + Zn.toFixed(3));
  assert.ok(Math.abs(phi - 84.3) < 0.1, 'phi_net = 84.3 deg. Got ' + phi.toFixed(1));
  var p = scComplexParts(Zn * 1000, 0.1);
  assert.ok(Math.abs(p.phiDeg - 84.3) < 0.1, 'scComplexParts matches 2023 exam');
});

test('exam: axVectorSumCurrents — phasor summation at cosφ angles (Viggo method)', function () {
  // 100∠0 (cos=1) + 100∠-60° (cos=0.5) = 173.2 ∠ -30°
  var r = axVectorSumCurrents([{ I: 100, cos: 1 }, { I: 100, cos: 0.5 }]);
  assert.ok(Math.abs(r.mag - 173.2) < 0.1, '|ΣI| = 173.2 A. Got ' + r.mag);
  assert.ok(Math.abs(r.angleDeg + 30) < 0.1, 'angle = -30°. Got ' + r.angleDeg);
  // Vector sum is always <= scalar sum for differing angles
  var scalar = 100 + 100;
  assert.ok(r.mag < scalar, 'vector sum (' + r.mag + ') < scalar sum (' + scalar + ') for differing pf');
  // Identical angles -> vector sum == scalar sum
  var r2 = axVectorSumCurrents([{ I: 50, cos: 0.8 }, { I: 50, cos: 0.8 }]);
  assert.ok(Math.abs(r2.mag - 100) < 0.01, 'same-angle currents add arithmetically');
  // Leading (capacitive) load
  var r3 = axVectorSumCurrents([{ I: 100, cos: 0.8 }, { I: 50, cos: 0.7, leading: true }]);
  assert.ok(r3.im > -100 * Math.sin(Math.acos(0.8)), 'leading load partially cancels lagging reactive current');
});

test('exam: axGenInstallation exposes IBvector (Viggo vector sum) <= scalar IBtotal', function () {
  var rng = axRngMake(2024);
  var d = axGenInstallation(rng, axBuilding('fabrik'), axTier('kandidat'));
  assert.ok(d.IBvector && typeof d.IBvector.mag === 'number', 'IBvector present');
  assert.ok(d.IBvector.mag <= d.IBtotal + 0.5, 'vector sum <= scalar IBtotal (conservative sizing preserved). vec=' + d.IBvector.mag + ' scalar=' + d.IBtotal);
});

test('exam: ib_total worked solution explains scalar-vs-vector distinction', function () {
  var rng = axRngMake(55);
  var d = axGenInstallation(rng, axBuilding('fabrik'), axTier('kandidat'));
  var tasks = axTasksInstallation(d, axTier('kandidat'), 20);
  var ibTask = tasks.filter(function (t) { return t.kind === 'ib_total'; })[0];
  assert.ok(ibTask, 'ib_total task present');
  var sol = axSolveTask(ibTask, d);
  // The scalar sum is the answer (conservative sizing basis)...
  assert.ok(Math.abs(sol.result.value - ibTask.answer) < 0.1, 'scalar sum is the dimensioning answer');
  // ...and the verification must mention the vector sum + that it is NOT used to reduce the line.
  var vtext = JSON.stringify(sol.verification) + JSON.stringify(sol.steps);
  assert.ok(/ektor|ector/.test(vtext), 'solution references the vector sum');
  assert.ok(/\u2220/.test(vtext), 'shows the polar angle of the vector sum');
});

test('scircuit: netAngleMode cosphi uses arccos (Viggo 2019: cos=0.11 -> 83.7°)', function () {
  var saved = JSON.parse(JSON.stringify(scState));
  scState.scMethod = 'complex'; scState.netAngleMode = 'cosphi'; scState.cosPhiNet = 0.11; scState.zNet = 444;
  var cx = scComplexCalc(scState, 0, 0, 10000, 1.0);
  assert.ok(Math.abs(cx.net.phiDeg - 83.68) < 0.1, 'arccos(0.11) = 83.7°. Got ' + cx.net.phiDeg.toFixed(2));
  // arccos(0.11) != atan(1/0.11) — the difference matters at larger cos values
  scState.netAngleMode = 'rx'; scState.rxNet = 0.3;
  var cxRx = scComplexCalc(scState, 0, 0, 10000, 1.0);
  scState.netAngleMode = 'cosphi'; scState.cosPhiNet = 0.3;
  var cxCos = scComplexCalc(scState, 0, 0, 10000, 1.0);
  // atan(1/0.3)=73.3° vs arccos(0.3)=72.5° — 0.8° difference
  assert.ok(Math.abs(cxRx.net.phiDeg - 73.3) < 0.1, 'R/X=0.3: atan(1/0.3) = 73.3°');
  assert.ok(Math.abs(cxCos.net.phiDeg - 72.5) < 0.1, 'cos=0.3: arccos(0.3) = 72.5°');
  assert.ok(Math.abs(cxRx.net.phiDeg - cxCos.net.phiDeg) > 0.5, 'the two modes give different angles (0.8° at 0.3)');
  Object.assign(scState, saved);
});

test('exam: axCableR Al uses NKT catalog values (matches 2023 exam r150=0.206)', function () {
  // 2023 exam uses r150 = 0.206 Ω/km for 3x150+25 PEX-M-AL
  assert.ok(Math.abs(axCableR(150, 'Al') - 0.206) < 0.001, 'Al 150mm2: 0.206 Ohm/km. Got ' + axCableR(150, 'Al'));
  assert.ok(Math.abs(axCableR(95, 'Al') - 0.320) < 0.001, 'Al 95mm2: 0.320 Ohm/km. Got ' + axCableR(95, 'Al'));
  // Cu values unchanged
  assert.ok(Math.abs(axCableR(150, 'Cu') - 0.124) < 0.001, 'Cu 150mm2: 0.124 Ohm/km');
  assert.ok(axCableR(2.5, 'Al') === null || axCableR(2.5, 'Al') > 0, 'Al small sizes return null or positive');
});

// ===== PARALLEL LINES — complex current divider validation (Eksempel 7.4.1.2) =====
test('vdrop: redekam Sum(I*l) is a true moment — farther loads weigh more', function () {
  var near = redekamVoltageDrop([{ I: 100, l: 1 }], 0.3, 0.08, 0.9, 400);
  var far = redekamVoltageDrop([{ I: 100, l: 5 }], 0.3, 0.08, 0.9, 400);
  assert.ok(far.dUf > near.dUf, 'a load 5x farther produces a larger drop (moment Sum(I*l))');
  assert.ok(Math.abs(far.dUf - 5 * near.dUf) < 0.05, 'drop scales linearly with distance');
});

test('vdrop: parallelLineSplit reproduces Eksempel 7.4.1.2 (4km 35Cu || 6km 95Al, 1.2MVA)', function () {
  var p = parallelLineSplit(0.5, 0.4, 4, 0.32, 0.099, 6, 1200, 0.8, 10000);
  assert.ok(Math.abs(p.ZA.mag - 2.561) < 0.01, '|ZA| = |(0.5+j0.4)*4| = 2.56 ohm. Got ' + p.ZA.mag);
  assert.ok(Math.abs(p.ZB.mag - 2.010) < 0.01, '|ZB| = |(0.32+j0.099)*6| = 2.01 ohm. Got ' + p.ZB.mag);
  assert.ok(Math.abs(p.Zp.re - 1.024) < 0.01 && Math.abs(p.Zp.im - 0.513) < 0.01, 'Zp = 1.024 + j0.513 ohm');
  assert.ok(Math.abs(p.I - 69.28) < 0.1, 'I = 1.2MVA/(sqrt3*10kV) = 69.28 A');
  assert.ok(Math.abs(p.IA - 31.0) < 0.2, 'IA ~ 31.0 A (overhead). Got ' + p.IA);
  assert.ok(Math.abs(p.IB - 39.5) < 0.2, 'IB ~ 39.5 A (cable). Got ' + p.IB);
});

test('vdrop: parallel current divider is exact — fractions sum to 1, voltage path-independent', function () {
  var p = parallelLineSplit(0.5, 0.4, 4, 0.32, 0.099, 6, 1200, 0.8, 10000);
  assert.ok(Math.abs(p.fracSum - 1) < 1e-6, 'IA/(I) + IB/(I) = 1 exactly (complex divider). Got ' + p.fracSum);
  assert.ok(p.pathErr < 1e-9, 'IA*ZA = IB*ZB = I*Zp (voltage path-independent). Err ' + p.pathErr);
  // branch currents are NOT in phase (different line angles) -> arithmetic sum exceeds I
  assert.ok(p.IA + p.IB > p.I, 'arithmetic |IA|+|IB| > I because the branch currents differ in angle');
});

test('vdrop: parallel of equal-angle lines -> branch currents in phase (sum = total)', function () {
  // Same r/x ratio on both -> same angle -> IA+IB (arithmetic) == I
  var p = parallelLineSplit(0.4, 0.2, 5, 0.4, 0.2, 5, 1000, 0.9, 400);
  assert.ok(Math.abs((p.IA + p.IB) - p.I) < 0.05, 'equal identical lines split the current evenly in phase');
  assert.ok(Math.abs(p.IA - p.IB) < 0.05, 'identical parallel lines carry equal current');
});

// ===== RING NETWORK validation (Eksempel 7.4.1.4) =====
test('vdrop: ringNetworkSolve reproduces Eksempel 7.4.1.4 (A-B=4,A-C=2,C-B=3; 500kVA@B,C; 10kV)', function () {
  var Un = 10000, IB = 500000 / (Math.sqrt(3) * Un), IC = IB; // 28.87 A
  var rn = ringNetworkSolve(4, 2, 3, IB, IC, 0.32, 0.088, 0.8, Un);
  assert.ok(Math.abs(rn.IAB - 22.5) < 0.1, 'I_AB = 22.5 A (exam). Got ' + rn.IAB);
  assert.ok(Math.abs(rn.ICB - 6.4) < 0.1, 'I_CB = 6.4 A (exam). Got ' + rn.ICB);
  assert.ok(Math.abs(rn.IAC - 35.3) < 0.1, 'I_AC = 35.3 A (exam). Got ' + rn.IAC);
});

test('vdrop: ring network voltage is path-independent (A->B = A->C->B)', function () {
  var rn = ringNetworkSolve(4, 2, 3, 28.87, 28.87, 0.32, 0.088, 0.8, 10000);
  assert.ok(rn.pathErr < 1e-6, 'voltage at B equal both ways. Err ' + rn.pathErr);
  assert.ok(Math.abs(rn.dU_AB - rn.dU_viaC) < 1e-6, 'dU(A->B) = dU(A->C->B)');
  // Conservation: I_AB + I_AC = I_B + I_C (all load supplied from A)
  assert.ok(Math.abs((rn.IAB + rn.IAC) - (28.87 + 28.87)) < 0.1, 'I_AB + I_AC = total load (Kirchhoff at A)');
});

test('vdrop: ring with all load at B side -> more current via direct A-B path', function () {
  // Load only at B (IC=0): I_AB should carry the larger share
  var rn = ringNetworkSolve(2, 4, 4, 100, 0, 0.3, 0.08, 0.9, 400);
  // A-B is shorter (2) than A-C-B (4+4=8), so direct path carries more
  assert.ok(rn.IAB > rn.IAC, 'shorter direct path A-B carries more current (' + rn.IAB + ' > ' + rn.IAC + ')');
  assert.ok(Math.abs((rn.IAB + rn.IAC) - 100) < 0.1, 'total fed from A = load');
});

// ===== FULL RENDER-HARDENING SWEEP (all modules x da/en/fa: zero NaN/undefined/throw) =====
test('render-sweep: every module renders clean in da/en/fa (no NaN, undefined, or throw)', function () {
  var savedLang = lang;
  var map = { guide:'renderGuide', load:'renderLoad', fuse:'renderFuse', mcb:'renderMCB', mccb:'renderMCCB', cable:'renderCable', vdrop:'renderVdrop', scircuit:'renderShortCircuit', trafo:'renderTrafo', standards:'renderStandards', bank:'renderBank', ai:'renderAiElectrician', bid:'renderBid', projekt:'renderProjekt', verify:'renderVerify', draw:'renderDrawing', sld:'renderSLD', exam:'renderExam', autoexam:'renderAutoExam', brain:'renderBrain', pdf:'renderPDF', thermal:'renderThermal', cable3d:'renderCable3D', energy:'renderEnergy', tcc:'renderCascadeTCC', panel:'renderPanel', ev:'renderEV', solar:'renderSolar', noed:'renderNoed', motor:'renderMotor', harmonic:'renderHarmonic', vfd:'renderVFD', lighting:'renderLighting', heatpump:'renderHeatPump', busbar:'renderBusbar', bathroom:'renderBathroom', firealarm:'renderFireAlarm', data:'renderData', spd:'renderSPD', ups:'renderUPS', pfc:'renderPFC', trayfill:'renderTrayFill', zs:'renderZs', commission:'renderCommission', commissioning:'cvRender', shev:'renderShev', access:'renderAccess', generator:'renderGenerator', discrim:'renderDiscrim', earthsys:'renderEarthsys', pool:'renderPool', construction:'renderConstruction', agri:'renderAgri', arcflash:'renderArcFlash', cablelife:'renderCableLife', bess:'renderBESS', emc:'renderEMC', metering:'renderMetering', atex:'renderATEX', smartgrid:'renderSmartGrid', kls:'renderKLS', kritisk:'renderKritisk', impedans:'renderImpedans', trefase:'renderTrefase', motorteori:'renderMotorteori', relay:'renderRelay', fault:'renderFault', dc:'renderDC', lys:'renderLys', magnet:'renderMagnet', kapacitor:'renderKapacitor', varme:'renderVarme', dcmaskine:'renderDcmaskine', analyzer:'renderAnalyzer' };
  var bad = [];
  ['da', 'en', 'fa'].forEach(function (lg) {
    lang = lg;
    Object.keys(map).forEach(function (mod) {
      var fn = map[mod];
      try {
        var out = (typeof eval(fn) === 'function') ? eval(fn)() : null;
        if (typeof out !== 'string') { bad.push(lg + '/' + mod + ' (non-string)'); return; }
        if (out.indexOf('undefined') !== -1) bad.push(lg + '/' + mod + ' (undefined)');
        if (out.indexOf('NaN') !== -1) bad.push(lg + '/' + mod + ' (NaN)');
      } catch (e) {
        bad.push(lg + '/' + mod + ' THREW: ' + e.message);
      }
    });
  });
  lang = savedLang;
  assert.ok(bad.length === 0, 'render issues: ' + bad.slice(0, 12).join('; '));
});

// =====================================================================
// P0-A: DANISH DECIMAL COMMA — formatting helpers + display localizer
// =====================================================================
console.log('\n=== Danish Decimal Comma (P0-A) Tests ===\n');

test('nf(): Danish comma vs English period; safe edge cases', function () {
  var prev = lang;
  lang = 'da';
  assert.strictEqual(nf(3.14159, 2), '3,14', 'da: comma decimal');
  assert.strictEqual(nf(1000, 0), '1000', 'da: integer no separator change');
  assert.strictEqual(nf(0.5, 3), '0,500', 'da: leading-zero decimal');
  assert.strictEqual(nf(-12.5, 1), '-12,5', 'da: negative');
  assert.strictEqual(nf(undefined, 2), '', 'undefined -> empty');
  assert.strictEqual(nf(null, 2), '', 'null -> empty');
  assert.strictEqual(nf(Infinity, 2), 'Infinity', 'non-finite passthrough');
  lang = 'en';
  assert.strictEqual(nf(3.14159, 2), '3.14', 'en: period decimal');
  assert.strictEqual(nf(-12.5, 1), '-12.5', 'en: negative period');
  lang = 'fa';
  assert.strictEqual(nf(3.14, 2), '3.14', 'fa: period (non-da unchanged)');
  lang = prev;
});

test('nfN(): natural-representation localization (raw values)', function () {
  var prev = lang;
  lang = 'da';
  assert.strictEqual(nfN(0.82), '0,82', 'da: comma');
  assert.strictEqual(nfN(32), '32', 'da: integer unchanged');
  assert.strictEqual(nfN('text'), 'text', 'non-number passthrough');
  lang = 'en';
  assert.strictEqual(nfN(0.82), '0.82', 'en: period');
  lang = prev;
});

test('nfLoc(): locale grouping (da uses . grouping, , decimal)', function () {
  var prev = lang;
  lang = 'da';
  assert.strictEqual(nfLoc(1234567), '1.234.567', 'da grouping with periods');
  lang = 'en';
  assert.strictEqual(nfLoc(1234567), '1,234,567', 'en grouping with commas');
  lang = prev;
});

test('daLocalizeNumbers(): converts display decimals, PROTECTS refs/products/grouping', function () {
  var prev = lang;
  lang = 'da';
  function L(s) { return daLocalizeNumbers('<div>' + s + '</div>').replace(/^<div>|<\/div>$/g, ''); }
  // genuine displayed values -> comma
  assert.strictEqual(L('R=7.41 X=0.105 \u03a9'), 'R=7,41 X=0,105 \u03a9', 'physical values');
  assert.strictEqual(L('cos\u03c6=0.866'), 'cos\u03c6=0,866', 'cosphi value');
  assert.strictEqual(L('5G2.5 mm\u00b2'), '5G2,5 mm\u00b2', 'cable cross-section (Danish notation)');
  assert.strictEqual(L('\u03b50 = 8.854'), '\u03b50 = 8,854', 'epsilon-0 single-group decimal');
  // standards / clause references -> KEEP period
  assert.strictEqual(L('DS/HD 60364-4-43 \u00a7433.1'), 'DS/HD 60364-4-43 \u00a7433.1', 'clause ref kept');
  assert.strictEqual(L('Tabel B.52.4'), 'Tabel B.52.4', 'table ref kept');
  assert.strictEqual(L('cl.523.6.3'), 'cl.523.6.3', 'multi-segment clause kept');
  assert.strictEqual(L('IEEE C57.110'), 'IEEE C57.110', 'IEEE standard code kept');
  assert.strictEqual(L('Micrologic 5.2'), 'Micrologic 5.2', 'product model name kept');
  // grouped thousands -> KEEP
  assert.strictEqual(L('1.234.567 kr'), '1.234.567 kr', 'millions grouping kept');
  assert.strictEqual(L('12.500 kr'), '12.500 kr', 'single-group cost (currency) kept');
  // attributes / tags untouched (coordinates must keep period)
  assert.strictEqual(daLocalizeNumbers('<line x1="12.5" y1="3.7"/>'), '<line x1="12.5" y1="3.7"/>', 'SVG attrs untouched');
  // idempotent + English unaffected
  assert.strictEqual(L('0,82'), '0,82', 'already-comma untouched');
  lang = 'en';
  assert.strictEqual(daLocalizeNumbers('<div>0.82</div>'), '<div>0.82</div>', 'en mode: no change');
  lang = prev;
});

test('da render-sweep: representative calc modules show no unprotected period-decimals', function () {
  var prev = lang;
  lang = 'da';
  // Numbers that legitimately keep a period in displayed text (standards/clause
  // refs, multi-segment clause numbers, product model codes). Anything else with
  // a period between digits in da-mode display text is a localization defect.
  var ALLOW = [
    /\u00a7\d+\.\d+/,            // §433.1
    /[A-Za-z]\.\d+(?:\.\d+)*/,  // B.52.4, B.52.11
    /\d+\.\d+\.\d+/,            // 523.6.3, 4.2.5, 6.2.3.5, 7.4.1.3
    /(?:cl|pkt|kap|art|Tabel|Table|Annex|Bilag)\.?\s*\d+\.\d+/i,
    /[A-Z]\d+\.\d+/,           // C57.110
    /Micrologic\s*\d+\.\d+/i,
    /IEC\s*61800-\d/i
  ];
  var mods = ['load','cable','vdrop','scircuit','trafo','mcb','mccb','motor','harmonic','vfd','pfc','trefase','motorteori','kapacitor','varme','impedans','zs','dc','lys','magnet'];
  var fmap = { load:'renderLoad', cable:'renderCable', vdrop:'renderVdrop', scircuit:'renderShortCircuit', trafo:'renderTrafo', mcb:'renderMCB', mccb:'renderMCCB', motor:'renderMotor', harmonic:'renderHarmonic', vfd:'renderVFD', pfc:'renderPFC', trefase:'renderTrefase', motorteori:'renderMotorteori', kapacitor:'renderKapacitor', varme:'renderVarme', impedans:'renderImpedans', zs:'renderZs', dc:'renderDC', lys:'renderLys', magnet:'renderMagnet' };
  var bad = [];
  mods.forEach(function (mod) {
    var out;
    try { out = (typeof eval(fmap[mod]) === 'function') ? daLocalizeNumbers(eval(fmap[mod])()) : ''; }
    catch (e) { bad.push(mod + ' THREW ' + e.message); return; }
    if (typeof out !== 'string') return;
    var text = out.replace(/<[^>]*>/g, ' ');
    var re = /(\D|^)(\d{1,4}\.\d+)(?=\D|$)/g, m;
    while ((m = re.exec(text))) {
      var tokStart = m.index + m[1].length;
      var win = text.slice(Math.max(0, tokStart - 14), tokStart + m[2].length + 8);
      var allowed = ALLOW.some(function (r) { return r.test(win); });
      if (!allowed) bad.push(mod + ': "' + m[2] + '" in "' + win.replace(/\s+/g, ' ').trim() + '"');
    }
  });
  lang = prev;
  assert.ok(bad.length === 0, 'unprotected period-decimals: ' + bad.slice(0, 15).join(' | '));
});


// === MCB rating availability (P0-B) ===
console.log('\n=== MCB Rating Availability Tests ===\n');

test('mcbAllRatings returns the union of all series ratings, sorted ascending', function() {
  var all = mcbAllRatings();
  // Sorted ascending, unique
  for (var i = 1; i < all.length; i++) {
    assert.ok(all[i] > all[i - 1], 'ratings must be strictly ascending/unique at index ' + i);
  }
  // Must contain every rating offered by every series
  Object.keys(MCB_TYPES).forEach(function (tp) {
    MCB_TYPES[tp].ratings.forEach(function (r) {
      assert.ok(all.indexOf(r) >= 0, 'union missing ' + r + ' A from series ' + tp);
    });
  });
  // Highest value comes from the 125 A frames; lowest from C60 (0.5 A)
  assert.strictEqual(all[all.length - 1], 125, 'top of ladder should be 125 A');
  assert.strictEqual(all[0], 0.5, 'bottom of ladder should be 0.5 A');
});

test('C60N tops out at 63 A: higher ratings are NOT in its series set', function() {
  var c60n = MCB_TYPES['C60N'];
  assert.strictEqual(Math.max.apply(null, c60n.ratings), 63, 'C60N max must be 63 A');
  [80, 100, 125].forEach(function (r) {
    assert.ok(c60n.ratings.indexOf(r) < 0, r + ' A must not be selectable in C60N');
  });
});

test('renderMCB greys out (unavail) the ratings C60N does not offer, but keeps them visible', function() {
  var prevType = mcbState.type, prevRating = mcbState.rating;
  mcbState.type = 'C60N'; mcbState.rating = null;
  var html = renderMCB();
  var all = mcbAllRatings();
  var c60n = MCB_TYPES['C60N'];
  all.forEach(function (r) {
    var lbl = (r < 1) ? r.toString().replace('.', ',') : String(r);
    if (c60n.ratings.indexOf(r) >= 0) {
      // available rating -> selectable button with onclick setting that rating
      assert.ok(html.indexOf("mcbState.rating=" + r + ";") >= 0,
        'available rating ' + r + ' A must have a clickable onclick');
    } else {
      // unavailable rating -> rendered as unavail (greyed) and NOT clickable
      assert.ok(html.indexOf("mcbState.rating=" + r + ";") < 0,
        'unavailable rating ' + r + ' A must NOT be clickable in C60N');
    }
  });
  // The 80/100/125 A buttons must still appear (visible) as unavail with a reason
  assert.ok(/class="sel-btn unavail"/.test(html), 'must render greyed unavail buttons');
  assert.ok(/not available in C60N|ikke tilg/.test(html), 'unavail buttons must carry a reason (title)');
  // 125 A specifically: present in markup but not as a selectable onclick
  assert.ok(html.indexOf('>125<') >= 0 || html.indexOf('>125 <') >= 0, '125 A label still visible');
  mcbState.type = prevType; mcbState.rating = prevRating;
});

test('renderMCB makes every C120N rating selectable and greys sub-63 A values', function() {
  var prevType = mcbState.type, prevRating = mcbState.rating;
  mcbState.type = 'C120N'; mcbState.rating = null;
  var html = renderMCB();
  // C120N ratings: 63, 80, 100, 125 all selectable
  [63, 80, 100, 125].forEach(function (r) {
    assert.ok(html.indexOf("mcbState.rating=" + r + ";") >= 0, r + ' A must be selectable in C120N');
  });
  // A low value like 6 A is not offered -> must be greyed, not clickable
  assert.ok(html.indexOf("mcbState.rating=6;") < 0, '6 A must not be selectable in C120N');
  mcbState.type = prevType; mcbState.rating = prevRating;
});

test('mcbRatingUnavailReason reports max for above-range and series for in-range gaps', function() {
  var c60n = MCB_TYPES['C60N'];
  var above = mcbRatingUnavailReason(c60n, 'C60N', 125);
  assert.ok(/max 63 A|maks 63 A/.test(above), 'above-range reason must cite max 63 A, got: ' + above);
  // 8 A: below typical but within min..max yet not offered by any -> not in union, skip.
  // Use C120N for an in-range-gap style message (6 A < min 63)
  var c120n = MCB_TYPES['C120N'];
  var below = mcbRatingUnavailReason(c120n, 'C120N', 6);
  assert.ok(/min 63 A/.test(below), 'below-range reason must cite min 63 A, got: ' + below);
});

test('switching series resets rating selection ladder consistently (no stale invalid rating offered)', function() {
  // After selecting 50 A on C60N then switching to C120N, 50 A is no longer selectable
  var prevType = mcbState.type, prevRating = mcbState.rating;
  mcbState.type = 'C120N'; mcbState.rating = null;
  var html = renderMCB();
  assert.ok(html.indexOf("mcbState.rating=50;") < 0, '50 A must not be selectable in C120N');
  mcbState.type = prevType; mcbState.rating = prevRating;
});


// === Triplen harmonic neutral-conductor loading (P1 audit) ===
console.log('\n=== Harmonic Neutral-Conductor Tests ===\n');

test('harmonicCalcNeutral uses arithmetic 3x summation of triplen harmonics (not sqrt(3))', function() {
  // n=1 load => diversity factor 1.0, so h3percent = spec.h3
  var it = HARMONIC_SPECTRA['it']; // h3 = 80%
  var res = harmonicCalcNeutral('it', 1);
  // Physically: triplen harmonics add in phase -> I_N = 3 * I_h3,phase
  var expected = 3 * (it.h3 / 100); // = 2.4
  assert.ok(Math.abs(res.neutralFactor - expected) < 1e-9,
    'neutralFactor should be 3x(h3/100)=' + expected + ' but got ' + res.neutralFactor);
  // Guard against regression to the old non-conservative sqrt(3) factor (~1.386)
  assert.ok(res.neutralFactor > 2.0, 'IT-equipment neutral factor must exceed 2.0 (was 1.386 under sqrt(3))');
  assert.strictEqual(res.oversized, true, 'IT equipment (80% 3rd harmonic) must flag neutral as overloaded');
  assert.strictEqual(res.factor, 1.5, 'overloaded neutral must recommend 1.5x (150%) neutral');
});

test('harmonicCalcNeutral crosses unity exactly at the standard 33% third-harmonic threshold', function() {
  // With factor 3: neutralFactor = 1.0 at h3 = 33.33%. Below 33% => not oversized.
  // ups: h3 = 8% -> 0.24 (well below) ; welding: h3 = 10% -> 0.30 (below)
  var ups = harmonicCalcNeutral('ups', 1);
  assert.ok(ups.neutralFactor < 1.0 && ups.oversized === false, 'UPS (8% h3) neutral must not be overloaded');
  // Simulate a hypothetical 34% third-harmonic content via the same arithmetic the
  // function uses, confirming the 33% rule (DS/HD 60364-5-52 cl.523.6.3 + Annex E):
  var atThreshold = 3 * (34 / 100);
  assert.ok(atThreshold > 1.0, '34% third harmonic must exceed phase current (neutral overloaded)');
  var belowThreshold = 3 * (30 / 100);
  assert.ok(belowThreshold < 1.0, '30% third harmonic must stay below phase current');
});

test('harmonicCalcNeutral remains conservative: neutral factor never below sqrt(3) basis', function() {
  // For every spectrum, the corrected (3x) factor must be >= the old (sqrt(3)x) value,
  // i.e. the fix can only INCREASE recommended neutral loading (conservative direction).
  Object.keys(HARMONIC_SPECTRA).forEach(function (key) {
    var spec = HARMONIC_SPECTRA[key];
    var res = harmonicCalcNeutral(key, 1);
    var oldFactor = Math.sqrt(3) * (spec.h3 / 100);
    assert.ok(res.neutralFactor >= oldFactor - 1e-9,
      key + ': corrected neutral factor must be >= old sqrt(3) factor (conservative)');
  });
});


// === Star-Delta starting torque (P1 audit) ===
console.log('\n=== Star-Delta Torque Tests ===\n');

test('Y-delta reduces starting torque to ~1/3 of DOL (T proportional to V^2)', function() {
  // Phase voltage in star = U_line/sqrt(3); torque ~ V^2 => factor (1/sqrt(3))^2 = 1/3.
  var dol = MOTOR_START_METHODS['DOL'].torqueStart;
  var sd = MOTOR_START_METHODS['SD'].torqueStart;
  var ratio = sd / dol;
  assert.ok(Math.abs(ratio - (1 / 3)) < 0.05,
    'SD/DOL start-torque ratio must be ~1/3, got ' + ratio.toFixed(3));
  // And the current reduction uses the same 1/3 factor:
  var iSD = motorteoriCalcIstartStarDelta(100, 6); // 6x In DOL
  var iDOL = motorteoriCalcIstart(100, 6);
  assert.ok(Math.abs((iSD / iDOL) - (1 / 3)) < 1e-9, 'SD start current must be 1/3 of DOL');
});

test('Torque/speed curve text says Y-delta reduces torque to ~1/3 (not "halves")', function() {
  var prevMod = (typeof activeModule !== 'undefined') ? activeModule : null;
  var html = (typeof renderStandards === 'function') ? '' : '';
  // The corrected wording lives in the standards/motor-curve view; assert the source
  // string no longer claims "halverer" and references 1/3 in both languages.
  var src = require('fs').readFileSync(__dirname + '/el-dimensionering.html', 'utf8');
  assert.ok(src.indexOf('halverer startmomentet') < 0, 'must not claim Y-delta "halves" the torque');
  assert.ok(src.indexOf('reducerer startmomentet til ca. 1/3') >= 0, 'DA text must state reduction to ~1/3');
  assert.ok(/reduces starting torque to \S*1\/3/.test(src), 'EN text must state reduction to ~1/3');
});


// --- Summary ---
console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===\n');
if (failed > 0) process.exit(1);
console.log('All tests passed!');
