// Lentes à vista: um leigo abre o Vox pela primeira vez, grava, e tem que
// achar a lente SEM adivinhar nenhum ícone (doc 33, L3.9, 11/11/2026).
//
// Antes: todo card nascia recolhido, e Conversar/Transformar só apareciam
// depois de tocar nos três pontinhos. Da fala à primeira lente eram 2 toques
// no computador e 3 no celular. Agora o card que acabou de nascer de uma
// gravação mostra esses dois botões, com o cabeçalho ainda recolhido.
//
//  1. Computador (1280×720) e celular (390×844, toque), perfil novo, sem chave.
//  2. Pula a abertura, entra pelo "Do meu jeito", aperta gravar, para, aceita
//     as primeiras por nossa conta. A ponte é simulada aqui (nenhuma rede).
//  3. Confere: o card novo mostra "Transformar" dentro da tela, e tocar nele
//     abre as lentes. No celular: um toque no card e "Transformar" já está lá.
//  4. Confere o que NÃO pode mudar: o cabeçalho do card novo segue recolhido;
//     card digitado nasce sem a barra; recarregar recolhe; os três pontinhos
//     abrem e recolhem tudo.
//
// Rodar (na raiz do repositório):
//   npm install --no-save playwright && npx playwright install chromium
//   node testes/lentes-a-vista.js [pasta-das-fotos]

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const dia = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
const SAIDA = path.join(process.argv[2] || path.join(RAIZ, 'PLANO_DIRETOR', 'lentes-a-vista'), dia);
fs.mkdirSync(SAIDA, { recursive: true });
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.wasm': 'application/wasm' };
const FALA = 'So the plan for next week is three things. First, send the proposal to the client by Thursday. Second, ask Dana for the pricing sheet. Third, book thirty minutes on Friday.';

let falhas = 0;
const ok = (c, m, x) => { console.log((c ? 'OK     ' : 'FALHA  ') + m + (x !== undefined && !c ? ' ' + JSON.stringify(x) : '')); if (!c) falhas++; };

(async () => {
  const srv = http.createServer((q, r) => {
    const p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
    const a = path.join(RAIZ, p === '/' ? 'index.html' : p);
    if (!a.startsWith(RAIZ) || !fs.existsSync(a) || fs.statSync(a).isDirectory()) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': TIPOS[path.extname(a)] || 'application/octet-stream' });
    fs.createReadStream(a).pipe(r);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });

  for (const tela of [{ nome: 'computador', viewport: { width: 1280, height: 720 } }, { nome: 'celular', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]) {
    console.log('\n── ' + tela.nome + ' ' + tela.viewport.width + '×' + tela.viewport.height + ' ──');
    const ctx = await browser.newContext({ viewport: tela.viewport, hasTouch: !!tela.hasTouch, isMobile: !!tela.isMobile, locale: 'en-US', permissions: ['microphone'] });
    const page = await ctx.newPage();
    const erros = [];
    page.on('pageerror', e => erros.push(e.message));
    // A ponte da cortesia, simulada. Qualquer outro pedido pra fora: 404.
    await page.route(u => !u.href.startsWith(base), async route => {
      const u = route.request().url();
      const cab = { 'access-control-allow-origin': '*' };
      if (u.includes('/v1/cortesia/estado')) return route.fulfill({ headers: cab, json: { ok: true, disponivel: true, restantes: 5, lentes_restantes: 5, max_segundos: 120, motivo: '' } });
      if (u.includes('/v1/cortesia/transcrever')) return route.fulfill({ headers: cab, json: { ok: true, texto: FALA, restantes: 4, ultima: false, max_segundos: 120 } });
      return route.fulfill({ status: 404, body: '' });
    });
    const toca = async loc => { if (tela.hasTouch) await loc.tap(); else await loc.click(); };
    const foto = n => page.screenshot({ path: path.join(SAIDA, tela.nome + '-' + n + '.png') });
    const fechaDicas = async () => { for (let k = 0; k < 2; k++) for (const tx of ['Not now', 'Got it']) { const l = page.getByRole('button', { name: tx, exact: true }); if (await l.count()) try { await toca(l.first()); } catch (e) {} } };
    // Só conta como "à vista" se está dentro da tela E é o que recebe o toque.
    const aVista = sel => page.evaluate(sel => {
      const e = document.querySelector(sel); if (!e) return false;
      const r = e.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0) || r.top < 0 || r.bottom > innerHeight) return false;
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return el === e || e.contains(el);
    }, sel);

    await page.goto(base + '/'); await page.waitForTimeout(1500);
    try { await toca(page.getByRole('button', { name: 'Skip', exact: true }).first()); } catch (e) {}
    await page.waitForTimeout(2500);
    try { await toca(page.locator('button:has(.d1a-seta)').first()); } catch (e) {}
    await page.waitForTimeout(3000); await fechaDicas();

    const boas = await page.evaluate(() => { const c = document.querySelector('#cardsList .card textarea'); return c ? c.value : ''; });
    ok(/tap Transform, on the note/.test(boas) && !/colored buttons/.test(boas), 'a nota de boas-vindas manda tocar em "Transform", não em "botões coloridos"', boas.slice(0, 160));

    // O leigo grava.
    const antes = await page.evaluate(() => [...document.querySelectorAll('#cardsList .card')].map(c => c.id));
    await toca(page.locator('#btnRec')); await page.waitForTimeout(2500);
    ok(await page.evaluate(() => isRec), 'apertar o botão vermelho começa a gravar');
    // Para tocando na faixa da onda ("Stop recording"), que é o que fica na tela.
    const parar = page.locator('#vuWrap');
    ok(await parar.isVisible().catch(() => false), 'enquanto grava, a faixa de parar está na tela');
    const cx = await parar.boundingBox();
    if (tela.hasTouch) await page.touchscreen.tap(cx.x + cx.width * 0.7, cx.y + cx.height / 2); else await page.mouse.click(cx.x + cx.width * 0.7, cx.y + cx.height / 2);
    await page.waitForTimeout(1500);
    // "As primeiras são por nossa conta": aceita.
    const aceita = page.locator('.ob-btn', { hasText: /Turn into text|Record now/ }).first();
    if (await aceita.count()) { try { await toca(aceita); } catch (e) {} }
    await page.waitForFunction(a => [...document.querySelectorAll('#cardsList .card:not(.proc-card)')].some(c => !a.includes(c.id)), antes, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500); await fechaDicas();
    // Se ainda houver um aviso por cima (presente de Pro etc.), o leigo fecha.
    for (const tx of ['Got it', 'Continue', 'OK', 'Close']) { const l = page.getByRole('button', { name: tx, exact: true }); if (await l.count()) try { await toca(l.first()); await page.waitForTimeout(400); } catch (e) {} }
    const id = await page.evaluate(a => { const c = [...document.querySelectorAll('#cardsList .card:not(.proc-card)')].find(c => !a.includes(c.id)); return c ? c.id : ''; }, antes);
    ok(!!id, 'a gravação virou um card novo');
    if (!id) { await foto('sem-card'); await ctx.close(); continue; }
    const texto = await page.evaluate(id => (document.querySelector('#' + id + ' textarea') || {}).value || '', id);
    ok(texto.includes('three things'), 'o card tem o texto da fala', texto.slice(0, 80));
    await foto('1-card-novo');

    const btTransf = '#' + id + ' .conversa-bar .conversa-btn:not(.primary)';
    if (tela.hasTouch) {
      ok(!(await aVista(btTransf)), 'no celular o card é miniatura (sem botões), como sempre foi');
      await page.locator('#' + id).tap({ position: { x: 50, y: 70 } }); await page.waitForTimeout(1500); await fechaDicas();
      ok(await page.evaluate(id => !!document.getElementById(id).closest('.float-window'), id), 'um toque abre a janela do card');
      await foto('2-janela');
    }
    ok(await aVista(btTransf), tela.hasTouch ? 'na janela, "Transform" já está à vista, sem tocar nos três pontinhos' : '"Transform" está à vista no card novo, sem tocar em mais nada');
    await toca(page.locator(btTransf).first()); await page.waitForTimeout(1200);
    const lentes = await page.evaluate(id => {
      const p = document.getElementById('lens-' + id), ov = document.getElementById('lensMapOverlay');
      const aberto = (p && p.classList.contains('on')) || (ov && ov.classList.contains('on'));
      const raiz = ov && ov.classList.contains('on') ? ov : p;
      return { aberto, itens: raiz ? raiz.querySelectorAll('button,[role="option"],.lens-item,.lens-row').length : 0 };
    }, id);
    ok(lentes.aberto && lentes.itens > 3, 'tocar em "Transform" abre as lentes', lentes);
    await foto('3-lentes');
    await page.evaluate(() => { try { closeLensOverlay(); } catch (e) {} });
    await page.evaluate(id => { const p = document.getElementById('lens-' + id); if (p && p.classList.contains('on')) toggleLensMenu(id); }, id);

    // O que não pode mudar.
    // O cabeçalho do card novo continua recolhido: só a barra das lentes aparece.
    ok(await page.evaluate(i => !document.getElementById(i).classList.contains('ch-header-open'), id), 'o cabeçalho do card novo continua recolhido (sem bandeja de ferramentas)');
    await toca(page.locator('#' + id + ' .ch-mode-badge').first()); await page.waitForTimeout(400);
    ok(await page.evaluate(i => document.getElementById(i).classList.contains('ch-header-open'), id) && await aVista(btTransf), 'os três pontinhos abrem o cabeçalho inteiro, como antes');
    await toca(page.locator('#' + id + ' .ch-mode-badge').first()); await page.waitForTimeout(400);
    ok(!(await aVista(btTransf)), 'e recolhem tudo, inclusive a barra das lentes');
    const digitado = await page.evaluate(() => addCard('typed note', null, 0, 'texto', 'groq', true));
    await page.waitForTimeout(500);
    ok(await page.evaluate(i => { const c = document.getElementById(i); return !c.classList.contains('ch-header-open') && !c.classList.contains('recem'); }, digitado), 'card digitado continua nascendo recolhido, sem a barra');
    await page.evaluate(() => saveHistory()); await page.waitForTimeout(1200);
    await page.reload(); await page.waitForTimeout(3000);
    const abertos = await page.evaluate(() => document.querySelectorAll('#cardsList .card.ch-header-open, #cardsList .card.recem').length);
    ok(abertos === 0, 'depois de recarregar, todos os cards voltam recolhidos', abertos);
    ok(erros.length === 0, 'sem erros na página', erros.slice(0, 3));
    await ctx.close();
  }
  await browser.close(); srv.close();
  console.log(falhas ? '\n' + falhas + ' falha(s). Fotos em ' + SAIDA : '\nO leigo acha a lente. Fotos em ' + SAIDA);
  process.exit(falhas ? 1 : 0);
})();
