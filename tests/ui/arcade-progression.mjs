import { chromium } from 'file:///C:/Users/ASUS/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || process.env.LOCALAPPDATA + '/ms-playwright/chromium-1243/chrome-win64/chrome.exe'});
try {
 const page = await browser.newPage({viewport:{width:1280,height:900}});
 const errors=[];page.on('pageerror',e=>(errors.push(e.message),console.log('PAGE ERROR',e.message)));
 // Component harness: real FieldOperations, deterministic game; no auth/backend required.
 await page.route('**/arcade-qa*',r=>r.fulfill({contentType:'text/html',body:`<html><body style="background:#10212a;color:white;--text:white;--muted:#ccc;--mint:#75c9bd;--body:Arial"><div id="root"></div><script type="module">
 import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true;
 const {default:React}=await import('/node_modules/.vite/deps/react.js');
 const {default:{createRoot}}=await import('/node_modules/.vite/deps/react-dom_client.js');
 const {FieldOperations}=await import('/src/components/FieldOperations.tsx');
 const {createGame}=await import('/src/domain/cureGame.ts');
 const kind=new URLSearchParams(location.search).get('kind')||'shooter';
 createRoot(document.getElementById('root')).render(React.createElement(FieldOperations,{game:createGame({seed:42,scenario:'standard',patientZeroId:'N01',dailyBudget:7500}),nodeId:'N01',kind,onComplete:()=> 'Recompensa aplicada'}));
 </script></body></html>`}));
 await page.goto('http://127.0.0.1:5173/arcade-qa',{waitUntil:'domcontentloaded'});
 await page.locator('.field-progression summary').click();
 assert.match(await page.locator('summary').innerText(),/0 monedas/);
 assert.equal(await page.getByRole('button',{name:/Marco dorado/}).isDisabled(),true);
 console.log('PASS empty wallet prevents purchase');
 await page.evaluate(()=>localStorage.setItem('zero-day-arcade-v1',JSON.stringify({coins:120,wins:5,owned:['default'],equipped:'default'})));
 await page.reload({waitUntil:"domcontentloaded"});await page.locator('summary').click();
 await page.getByRole('button',{name:/Marco dorado/}).click();
 assert.match(await page.locator('summary').innerText(),/0 monedas/);
 assert.equal(await page.locator('.field-viewport').evaluate(e=>getComputedStyle(e).borderTopColor),'rgb(251, 191, 36)');
 console.log('PASS purchase deducts coins and changes visible frame');
 await page.reload({waitUntil:"domcontentloaded"});await page.locator('summary').click();
 assert.match(await page.getByRole('button',{name:/Marco dorado/}).innerText(),/Equipado/);
 await page.getByRole('button',{name:/Clásico/}).click();await page.getByRole('button',{name:/Marco dorado/}).click();
 assert.match(await page.locator('summary').innerText(),/0 monedas/);
 console.log('PASS reload persistence and free re-equipping');
 await page.goto('http://127.0.0.1:5173/arcade-qa?kind=parkour',{waitUntil:'domcontentloaded'});
 await page.locator('summary').click();assert.match(await page.getByRole('button',{name:/Marco dorado/}).innerText(),/Equipado/);
 console.log('PASS parkour shares arcade cosmetics');
 await page.goto('http://127.0.0.1:5173/arcade-qa?kind=lab',{waitUntil:'domcontentloaded'});await page.locator('.field-lab').waitFor();
 assert.equal(await page.locator('.field-progression').count(),0);
 console.log('PASS laboratory excluded');
 await page.evaluate(()=>localStorage.setItem('zero-day-arcade-v1','broken JSON'));
 await page.goto('http://127.0.0.1:5173/arcade-qa',{waitUntil:'domcontentloaded'});await page.locator('summary').waitFor();
 assert.match(await page.locator('summary').innerText(),/0 monedas/);
 console.log('PASS corrupt storage recovers without crashing');
 assert.deepEqual(errors,[]);console.log('PASS no browser errors');
} finally { await browser.close(); }
