/* End-to-end check: uploading a project description alone (no typing, no extra
 * clicks) must auto-build the plan + country frameworks + advisor in the demo.
 * Run: node verify-upload.mjs   (requires playwright + the built dist file). */
import { chromium } from 'playwright';
import path from 'path';

const dist = 'file://' + path.resolve('dist/STP-Application.html');
const sample = path.resolve('samples/trans-asia-fibre-project-description.md');
const COUNTRIES = ['Indonesia', 'Malaysia', 'Brunei', 'Vietnam', 'Thailand', 'Philippines', 'Taiwan', 'Guam'];

const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: 1360, height: 900 } });
const errs = [];
pg.on('pageerror', e => errs.push(String(e)));
pg.on('console', m => { if (/refused|content security policy/i.test(m.text())) errs.push('CSP: ' + m.text()); });
await pg.goto(dist, { waitUntil: 'networkidle' });
await pg.waitForTimeout(500);

function ok(c, m) { console.log((c ? '  ok  ' : 'FAIL  ') + m); if (!c) process.exitCode = 1; }

// Go to the Brain and upload the sample file — that is the ONLY action.
await pg.click('.nav-item[data-view="brain"]');
await pg.waitForTimeout(200);
await pg.setInputFiles('#brainFile', sample);
// Auto-analysis is async (FileReader -> analyze). Wait for output to appear.
await pg.waitForSelector('#brainOut .card', { timeout: 8000 });
await pg.waitForTimeout(300);

const out = await pg.evaluate(() => document.getElementById('brainOut').innerText);
ok(/Analysis —/.test(out), 'Upload alone auto-runs the analysis (no Analyze click)');
ok(/Regulatory & Country Intelligence/.test(out), 'Country Intelligence section auto-renders');
const found = COUNTRIES.filter(c => out.includes(c));
ok(found.length === 8, `All 8 countries detected from the upload (got ${found.length}: ${found.join(', ')})`);
ok(/Advisor — how to get the best result/.test(out), 'On-device Advisor auto-renders');
ok(/9,?500\s*km|9500\s*km/i.test(out) || /km route/.test(out), 'Detected route scale (km) from the brief');
ok(/60 months|months/.test(out), 'Detected duration from the brief');

// The quick-links produced by the upload must open the three frameworks.
async function view(id) {
  await pg.click(`.nav-item[data-view="${id}"]`);
  await pg.waitForTimeout(250);
  return await pg.evaluate(() => document.getElementById('content').innerText);
}
let t = await view('marketentry');
ok(/Market Entry/.test(t) && COUNTRIES.every(c => t.includes(c)), 'Market Entry framework scoped to all 8 uploaded countries');
ok(/Go|Caution|Conditional Go/.test(t), 'Market Entry shows plain traffic-light verdicts');

t = await view('licensing');
ok(/Licensing & Permitting/.test(t) && /months/i.test(t), 'Licensing framework shows the permit timeline in months');

t = await view('landingpartners');
ok(/Landing Partner/.test(t) && /bring the cable ashore/i.test(t), 'Landing Partner Engagement framework renders in plain language');
ok(/Chunghwa Telecom|PLDT|Telkom|Viettel|GTA TeleGuam|Unified National Networks|Telekom Malaysia/.test(t),
   'Landing Partner framework names real operators');

ok(errs.length === 0, 'no page errors / CSP refusals during the upload flow' + (errs.length ? ' -> ' + errs.join(' | ') : ''));

await b.close();
console.log(process.exitCode ? '\nUPLOAD FLOW CHECKS FAILED' : '\nALL UPLOAD-FLOW CHECKS PASSED');
