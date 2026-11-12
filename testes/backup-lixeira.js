// Backup e Lixeira: nota apagada (na Lixeira) volta quando a pessoa restaura a
// cópia. Defeito achado pelo Kimi no WebKit em 11/11/2026: a restauração contava
// a nota da Lixeira como "já existe" e dizia "nada novo a adicionar".
//
// Rodar (na raiz do repositório):
//   npm install --no-save playwright && npx playwright install chromium
//   node testes/backup-lixeira.js

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json' };
let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK    ' : 'FALHOU') + ' ' + msg); if (!cond) falhas++; };

function servidor() {
  return new Promise(res => {
    const s = http.createServer((req, resp) => {
      const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const arq = path.join(RAIZ, p === '/' ? 'index.html' : p);
      if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { resp.writeHead(404); resp.end(); return; }
      resp.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq)] || 'application/octet-stream' });
      fs.createReadStream(arq).pipe(resp);
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });
}

(async () => {
  const srv = await servidor();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 }, locale: 'pt-BR' });
  await ctx.addInitScript(() => { try { if (!localStorage.getItem('vox_cfg')) localStorage.setItem('vox_cfg', JSON.stringify({ provider: 'groqwhisper', apiKeyGroq: 'simulada', aiRenameProvider: 'nao', lang: 'pt' })); } catch (e) {} });
  const page = await ctx.newPage();
  await page.route(u => !u.href.startsWith(base), r => r.fulfill({ status: 404, body: '' }));
  const erros = []; page.on('pageerror', e => erros.push(e.message));
  const ver = (f, a) => page.evaluate(f, a);
  const arq = path.join(os.tmpdir(), 'vox-backup-lixeira-' + Date.now() + '.json');
  try {
    await page.goto(base + '/index.html'); await page.waitForTimeout(3500);
    await page.getByText('Pular', { exact: true }).first().click(); await page.waitForTimeout(2500);
    await page.getByText(/Do meu jeito/).first().click().catch(() => {}); await page.waitForTimeout(3000);
    await ver(() => { try { fecharGalaxia(true); } catch (e) {} }); await page.waitForTimeout(1200);
    await ver(() => document.querySelectorAll('.tx-overlay.on,#galaxia.on,.vintro-overlay.on').forEach(e => { e.classList.remove('on'); e.style.display = 'none'; }));
    await ver(() => setViewMode('list')); await page.waitForTimeout(500);

    await page.click('#btnNewCard'); await page.waitForTimeout(800);
    await page.keyboard.type('Nota que vai pra Lixeira e volta'); await page.mouse.click(5, 400); await page.waitForTimeout(800);
    const visivel = () => ver(() => [...document.querySelectorAll('.card:not(.proc-card)')].some(c => c.offsetParent && /vai pra Lixeira e volta/.test(c.querySelector('textarea')?.value || '')));
    ok(await visivel(), 'a nota nova aparece na tela');

    const json = await ver(async () => { let out = null; const o = window.dl; window.dl = c => { out = c; }; await exportProject(); window.dl = o; return out; });
    ok(/vai pra Lixeira e volta/.test(json || ''), 'a cópia de segurança leva a nota');
    fs.writeFileSync(arq, json || '');

    const cid = await ver(() => [...document.querySelectorAll('.card')].find(c => /vai pra Lixeira e volta/.test(c.querySelector('textarea')?.value || '')).id);
    await ver(c => paraLixeira(c, true), cid); await page.waitForTimeout(800);
    ok(!(await visivel()), 'apagada, a nota some da tela (vai pra Lixeira)');

    const [fc] = await Promise.all([page.waitForEvent('filechooser'), ver(() => triggerImportProject())]);
    await fc.setFiles(arq); await page.waitForTimeout(2500);
    ok(await visivel(), 'restaurar a cópia traz a nota de volta da Lixeira');
    ok(await ver(() => document.querySelectorAll('.card[data-del]').length === 0), 'a Lixeira fica vazia (sem cópia duplicada)');
    const aviso = await ver(() => document.getElementById('toastWrap')?.innerText.replace(/\s+/g, ' ') || '');
    ok(/saiu da Lixeira/.test(aviso), 'o aviso diz que a nota saiu da Lixeira (' + aviso.trim() + ')');

    // De novo: restaurar com a nota já de volta não duplica.
    const n = await ver(() => document.querySelectorAll('.card:not(.proc-card)').length);
    const [fc2] = await Promise.all([page.waitForEvent('filechooser'), ver(() => triggerImportProject())]);
    await fc2.setFiles(arq); await page.waitForTimeout(2500);
    ok(await ver(() => document.querySelectorAll('.card:not(.proc-card)').length) === n, 'restaurar de novo não duplica a nota');
    ok(erros.length === 0, 'sem erro na página' + (erros.length ? ': ' + erros[0] : ''));
  } catch (e) { ok(false, 'o teste rodou até o fim: ' + e.message); }
  finally { try { fs.unlinkSync(arq); } catch (e) {} await browser.close(); srv.close(); }
  console.log(falhas ? '\n' + falhas + ' verificação(ões) falharam' : '\nTudo certo');
  process.exit(falhas ? 1 : 0);
})();
