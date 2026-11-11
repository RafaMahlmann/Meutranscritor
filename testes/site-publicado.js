// Site publicado: confere que a pasta que vai pro ar (testes/montar-site.sh)
// tem tudo o que o app usa. Desde 06/11/2026 o GitHub Pages publica só essa
// pasta, não o repositório inteiro; arquivo esquecido nela vira 404 no ar.
//
//  1. Leitura: todo arquivo que o index.html, o sw.js, o manifest.json, a
//     Privacidade e os Termos citam, e que existe no repositório, tem que
//     estar na pasta montada.
//  2. Navegador: abre o app servido SÓ da pasta montada, carrega de verdade as
//     bibliotecas sob demanda (Markdown, QR, editor, OCR, ffmpeg) e falha se
//     algum pedido ao próprio site der erro.
//  3. Confere que o que não é do site (AGENTS.md, relatorios/, testes/,
//     ponte/) ficou de fora.
//
// Rodar (na raiz do repositório):
//   npm install --no-save playwright && npx playwright install chromium
//   node testes/site-publicado.js

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const SITE = fs.mkdtempSync(path.join(os.tmpdir(), 'vox-site-'));
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.mp4': 'video/mp4', '.gz': 'application/gzip' };

let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK    ' : 'FALHOU') + ' ' + msg); if (!cond) falhas++; };

execFileSync('sh', [path.join(__dirname, 'montar-site.sh'), SITE], { cwd: RAIZ, stdio: 'inherit' });

// ── 1. Leitura ──
const citados = new Set();
for (const f of ['index.html', 'sw.js', 'manifest.json', 'privacy.html', 'terms.html']) {
  const txt = fs.readFileSync(path.join(RAIZ, f), 'utf8');
  const re = /["'`(](?:\.\/)?((?:[A-Za-z0-9_\-]+\/)*[A-Za-z0-9_.\-]+\.(?:js|wasm|png|jpe?g|svg|mp4|gz|json|html|css))(?:[#?][^"'`)]*)?["'`)]/g;
  let m;
  while ((m = re.exec(txt))) citados.add(m[1]);
}
const faltando = [...citados].filter((p) => fs.existsSync(path.join(RAIZ, p)) && !fs.existsSync(path.join(SITE, p)));
ok(citados.size > 10, `o app cita ${citados.size} arquivos (a leitura achou as referências)`);
ok(!faltando.length, 'todo arquivo citado que existe no repositório está na pasta do site ' + JSON.stringify(faltando));

// ── 3. O que ficou de fora ──
for (const fora of ['AGENTS.md', 'README.md', 'relatorios', 'testes', 'ponte', 'landing', '.github', '.githooks']) {
  ok(!fs.existsSync(path.join(SITE, fora)), `"${fora}" não vai pro ar`);
}

// ── 2. Navegador ──
function servidor() {
  return new Promise((res) => {
    const s = http.createServer((req, resp) => {
      const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const arq = path.join(SITE, p === '/' ? 'index.html' : p);
      if (!arq.startsWith(SITE) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { resp.writeHead(404); resp.end(); return; }
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
  try {
    const ctx = await browser.newContext({ locale: 'pt-BR' });
    const page = await ctx.newPage();
    const ruins = [];
    page.on('response', (r) => { if (r.url().startsWith(base) && r.status() >= 400) ruins.push(r.status() + ' ' + r.url().slice(base.length)); });
    await page.route((u) => !u.href.startsWith(base), (r) => r.fulfill({ status: 404, body: '' }));
    const erros = []; page.on('pageerror', (e) => erros.push(e.message));
    await page.goto(base + '/index.html');
    await page.waitForTimeout(2500);
    ok(await page.evaluate(() => typeof escHtml === 'function' && !!document.body), 'o app abre servido só da pasta do site');
    const r = await page.evaluate(async () => {
      const res = {};
      const tenta = async (nome, fn) => { try { await Promise.race([fn(), new Promise((_, n) => setTimeout(() => n(new Error('demorou')), 20000))]); res[nome] = 'ok'; } catch (e) { res[nome] = 'ERRO ' + String(e && e.message || e).slice(0, 80); } };
      await tenta('Markdown (marked + DOMPurify)', async () => { await _loadMarkdownLibs(); if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') throw new Error('não carregou'); });
      await tenta('leitor de QR', () => _loadScriptOnce('jsqr/jsQR.js'));
      await tenta('editor (overtype)', () => _loadScriptOnce('overtype/overtype.js'));
      await tenta('OCR (tesseract)', () => _loadScriptOnce('lib/tesseract/tesseract.min.js'));
      await tenta('ffmpeg', () => _loadFFmpeg(() => {}));
      for (const f of ['sw.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'privacy.html', 'terms.html', 'Logo/icon-header.png', 'media/vox-intro.mp4',
        'lib/tesseract/worker.min.js', 'lib/tesseract/tesseract-core-simd-lstm.wasm.js', 'lib/tesseract/por.traineddata.gz', 'lib/tesseract/eng.traineddata.gz',
        'ffmpeg/core/ffmpeg-core.js', 'ffmpeg/core/ffmpeg-core.wasm', 'ffmpeg/814.ffmpeg.js']) {
        await tenta(f, async () => { const x = await fetch(f, { method: 'HEAD' }); if (!x.ok) throw new Error(String(x.status)); });
      }
      return res;
    });
    for (const [nome, v] of Object.entries(r)) ok(v === 'ok', `${nome}: ${v}`);
    ok(!ruins.length, 'nenhum pedido ao próprio site deu erro ' + JSON.stringify(ruins));
    ok(!erros.length, 'sem erros no console ' + JSON.stringify(erros.slice(0, 3)));
    const fora = await page.evaluate(async () => (await fetch('AGENTS.md', { method: 'HEAD' })).status);
    ok(fora === 404, 'AGENTS.md não abre pelo site (' + fora + ')');
  } catch (e) {
    ok(false, 'o teste quebrou no meio: ' + e.message);
  } finally {
    await browser.close(); srv.close();
    fs.rmSync(SITE, { recursive: true, force: true });
  }
  console.log(falhas ? `\n${falhas} problema(s) no site publicado.` : '\nA pasta do site tem tudo o que o app usa.');
  process.exit(falhas ? 1 : 0);
})();
