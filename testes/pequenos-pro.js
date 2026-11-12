// Pequenos do Vox Pro (C6, 12/11/2026). Tudo simulado: ponte e Freemius
// respondem daqui, nenhum pedido sai pra rede.
//
//  1. Presente de 14 dias: a 1ª gravação liga o presente (o botão já diz
//     "Pro · 14 dias"), mas o aviso "Você ganhou 14 dias de Pro" NÃO abre por
//     cima do card novo. Ele espera a primeira lente dar certo.
//  2. Quem grava e fecha o app sem usar lente vê o aviso na próxima abertura.
//  3. Ativar a licença com um nome de aparelho: o nome vai pro Freemius
//     ("Vox · iPhone da Ana") e o quadro do Pro mostra "2 de 6 em uso".
//  4. Licença sem limite: "1 em uso, sem limite". Sem nome: o de sempre.
//  5. Licença cheia: o aviso cita o portal do Freemius.
//
// Rodar (na raiz do repositório): node testes/pequenos-pro.js

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const FALA = 'So the plan for next week is three things. First, send the proposal to the client by Thursday. Second, ask Dana for the pricing sheet.';

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

  // Freemius simulado: o cenário escolhe o que ele responde.
  let fsCenario = { quota: 6, activated: 2, recusa: '' }, fsTitulo = null;

  const abrir = async (ctx) => {
    const page = await ctx.newPage();
    const erros = [];
    page.on('pageerror', e => erros.push(e.message));
    await page.route(u => !u.href.startsWith(base), async route => {
      const req = route.request(), u = req.url();
      const cab = { 'access-control-allow-origin': '*' };
      if (u.includes('/v1/cortesia/estado')) return route.fulfill({ headers: cab, json: { ok: true, disponivel: true, restantes: 5, lentes_restantes: 5, max_segundos: 120, motivo: '', pro_dias: 14 } });
      if (u.includes('/v1/cortesia/transcrever')) return route.fulfill({ headers: cab, json: { ok: true, texto: FALA, restantes: 4, ultima: false, max_segundos: 120 } });
      if (u.includes('/v1/cortesia/lente')) return route.fulfill({ headers: cab, json: { choices: [{ message: { content: '- Send the proposal by Thursday\n- Ask Dana for the pricing sheet' } }], lentes_restantes: 4 } });
      if (u.includes('api.freemius.com') && u.includes('/licenses/activate.json')) {
        try { fsTitulo = JSON.parse(req.postData() || '{}').title; } catch (e) {}
        if (fsCenario.recusa) return route.fulfill({ status: 400, headers: cab, json: { error: { code: fsCenario.recusa, message: 'License activations limit exceeded.' } } });
        return route.fulfill({ headers: cab, json: { install_id: 777, license_plan_name: 'Pro', license_plan_id: 1 } });
      }
      if (u.includes('api.freemius.com') && u.includes('/license.json')) return route.fulfill({ headers: cab, json: { expiration: null, is_cancelled: false, plan_id: 1, quota: fsCenario.quota, activated: fsCenario.activated } });
      return route.fulfill({ status: 404, body: '' });
    });
    return { page, erros };
  };
  const entrar = async page => {
    await page.goto(base + '/'); await page.waitForTimeout(1500);
    try { await page.getByRole('button', { name: 'Skip', exact: true }).first().click({ timeout: 3000 }); } catch (e) {}
    await page.waitForTimeout(2500);
    try { await page.locator('button:has(.d1a-seta)').first().click({ timeout: 3000 }); } catch (e) {}
    await page.waitForTimeout(3000);
    for (let k = 0; k < 2; k++) for (const tx of ['Not now', 'Got it']) { const l = page.getByRole('button', { name: tx, exact: true }); if (await l.count()) try { await l.first().click({ timeout: 1500 }); } catch (e) {} }
  };
  const avisoPresente = page => page.evaluate(() => { const ov = document.getElementById('cortesiaOverlay'); return !!ov && ov.style.display === 'flex' && /days of Pro|dias de Pro/.test(ov.textContent); });
  const gravar = async page => {
    const antes = await page.evaluate(() => [...document.querySelectorAll('#cardsList .card')].map(c => c.id));
    await page.locator('#btnRec').click(); await page.waitForTimeout(2500);
    const cx = await page.locator('#vuWrap').boundingBox();
    await page.mouse.click(cx.x + cx.width * 0.7, cx.y + cx.height / 2);
    await page.waitForTimeout(1500);
    const aceita = page.locator('.ob-btn', { hasText: /Turn into text|Record now/ }).first();
    if (await aceita.count()) { try { await aceita.click({ timeout: 2000 }); } catch (e) {} }
    await page.waitForFunction(a => [...document.querySelectorAll('#cardsList .card:not(.proc-card)')].some(c => !a.includes(c.id)), antes, { timeout: 15000 }).catch(() => {});
    return page.evaluate(a => { const c = [...document.querySelectorAll('#cardsList .card:not(.proc-card)')].find(c => !a.includes(c.id)); return c ? c.id : ''; }, antes);
  };

  // ── 1. O aviso do presente espera a primeira lente ──
  console.log('\n── presente: espera a primeira lente ──');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'en-US', permissions: ['microphone'] });
    const { page, erros } = await abrir(ctx);
    await entrar(page);
    const id = await gravar(page);
    ok(!!id, 'a gravação virou um card novo');
    await page.waitForTimeout(3500);
    const st = await page.evaluate(() => ({ ativo: _presenteAtivo(), pend: localStorage.getItem('vox_presente_aviso_pendente'), botao: (document.getElementById('btnProFixoTxt') || {}).textContent }));
    ok(st.ativo, 'a 1ª gravação ligou o presente de Pro', st);
    ok(/14/.test(st.botao || ''), 'o botão do Pro já mostra os dias', st.botao);
    ok(!(await avisoPresente(page)), 'o aviso "14 dias de Pro" NÃO abre por cima do card novo');
    ok(st.pend === '1', 'o aviso ficou guardado pra depois', st.pend);
    await page.evaluate(id => runLens(id, 'resumo'), id).catch(() => {});
    await page.evaluate(() => new Promise(r => setTimeout(r, 4000)));
    ok(await avisoPresente(page), 'depois da primeira lente, o aviso do presente aparece');
    ok(await page.evaluate(() => localStorage.getItem('vox_presente_aviso_pendente')) === null, 'e não fica guardado pra aparecer de novo');
    await page.evaluate(() => _cortesiaFechar());
    await page.evaluate(id => runLens(id, 'resumo'), id).catch(() => {});
    await page.waitForTimeout(3500);
    ok(!(await avisoPresente(page)), 'na segunda lente, ele não volta');
    ok(erros.length === 0, 'sem erros na página', erros.slice(0, 3));
    await ctx.close();
  }

  // ── 2. Sem lente: aparece na próxima abertura ──
  console.log('\n── presente: sem lente, aparece ao abrir de novo ──');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'en-US', permissions: ['microphone'] });
    const { page, erros } = await abrir(ctx);
    await entrar(page);
    await gravar(page);
    await page.waitForTimeout(3000);
    ok(!(await avisoPresente(page)), 'logo depois de gravar, sem aviso');
    await page.reload(); await page.waitForTimeout(6000);
    ok(await avisoPresente(page), 'na abertura seguinte, o aviso do presente aparece');
    ok(erros.length === 0, 'sem erros na página', erros.slice(0, 3));
    await ctx.close();
  }

  // ── 3 a 5. Licença: nome do aparelho, X de Y, limite ──
  console.log('\n── licença ──');
  for (const loc of ['en-US', 'pt-BR']) {
    const en = loc === 'en-US';
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: loc });
    const { page, erros } = await abrir(ctx);
    await entrar(page);
    await page.evaluate(() => { _cortesiaFechar(); abrirVoxPro(); });
    await page.waitForTimeout(500);
    ok(await page.locator('#proNomeAparelho').isVisible(), loc + ': campo do nome do aparelho na tela do Pro');
    const ph = await page.locator('#proNomeAparelho').getAttribute('placeholder');
    ok(en ? /Name for this device/.test(ph) : /Nome deste aparelho/.test(ph), loc + ': dica do campo traduzida', ph);

    fsCenario = { quota: 6, activated: 2, recusa: '' };
    await page.fill('#proChave', 'sk_teste_1234567890');
    await page.fill('#proNomeAparelho', '  iPhone   da <b>Ana</b> ');
    await page.click('#proAtivarBtn'); await page.waitForTimeout(1500);
    ok(fsTitulo === 'Vox · iPhone da bAna/b', loc + ': o nome vai limpo pro Freemius', fsTitulo);
    const ficha = await page.evaluate(() => document.querySelector('#proOverlay .pro-ficha')?.innerText || '');
    ok(en ? /Devices\s*2 of 6 in use/.test(ficha) : /Aparelhos\s*2 de 6 em uso/.test(ficha), loc + ': quadro mostra "2 de 6"', ficha);
    ok(en ? /This device\s*iPhone da bAna\/b/.test(ficha) : /Este aparelho\s*iPhone da bAna\/b/.test(ficha), loc + ': quadro mostra o nome do aparelho', ficha);
    await page.screenshot({ path: path.join(require('os').tmpdir(), 'pro-ficha-' + loc + '.png') });

    // Sem limite, sem nome
    await page.evaluate(() => { _licencaSalvar(null); _proRender(''); });
    fsCenario = { quota: null, activated: 1, recusa: '' };
    await page.fill('#proChave', 'sk_teste_1234567890');
    await page.click('#proAtivarBtn'); await page.waitForTimeout(1500);
    ok(/^Vox · /.test(fsTitulo) && !/Ana/.test(fsTitulo), loc + ': sem nome, vai o nome automático de sempre', fsTitulo);
    const ficha2 = await page.evaluate(() => document.querySelector('#proOverlay .pro-ficha')?.innerText || '');
    ok(en ? /1 in use, no limit/.test(ficha2) : /1 em uso, sem limite/.test(ficha2), loc + ': licença sem limite', ficha2);
    ok(!/This device|Este aparelho/.test(ficha2), loc + ': sem nome, a linha do nome não aparece');

    // Cheia
    await page.evaluate(() => { _licencaSalvar(null); _proRender(''); });
    fsCenario = { quota: 6, activated: 6, recusa: 'license_utilized' };
    await page.fill('#proChave', 'sk_teste_1234567890');
    await page.fill('#proNomeAparelho', 'Mac do escritório');
    await page.click('#proAtivarBtn'); await page.waitForTimeout(1500);
    const aviso = await page.evaluate(() => document.querySelector('#proOverlay .pro-aviso.erro')?.textContent || '');
    ok(/users\.freemius\.com/.test(aviso) && (en ? /team license/.test(aviso) : /licença é de um time/.test(aviso)), loc + ': aviso de limite cita o portal do Freemius', aviso);
    ok(await page.inputValue('#proNomeAparelho') === 'Mac do escritório', loc + ': depois da recusa, o nome digitado continua no campo');
    ok(erros.length === 0, loc + ': sem erros na página', erros.slice(0, 3));
    await ctx.close();
  }

  await browser.close(); srv.close();
  console.log(falhas ? '\n' + falhas + ' falha(s).' : '\nTudo verde.');
  process.exit(falhas ? 1 : 0);
})();
