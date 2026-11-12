// Oferta de lançamento na tela do Vox Pro (C9, 12/11/2026). Nenhuma rede.
//  1. Fora das datas (antes de 01/12/2026 ou depois de 10/01/2027): tela igual à de antes.
//  2. Dentro das datas: aviso da oferta, US$ 149 riscado, botão "Vitalício por US$ 99"
//     com o link de compra do vitalício e o cupom LAUNCH99. Em PT e EN, no celular.
// Rodar (na raiz do repositório): node testes/oferta-lancamento.js
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const RAIZ = path.resolve(__dirname, '..');
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? 'OK     ' : 'FALHA  ') + m + (!c && x !== undefined ? ' ' + JSON.stringify(x) : '')); if (!c) falhas++; };
(async () => {
  const srv = http.createServer((q, r) => {
    const p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
    const a = path.join(RAIZ, p === '/' ? 'index.html' : p);
    if (!a.startsWith(RAIZ) || !fs.existsSync(a) || fs.statSync(a).isDirectory()) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': a.endsWith('.html') ? 'text/html; charset=utf-8' : a.endsWith('.js') ? 'text/javascript' : a.endsWith('.json') ? 'application/json' : 'application/octet-stream' });
    fs.createReadStream(a).pipe(r);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  for (const loc of ['en-US', 'pt-BR']) for (const quando of ['antes', 'durante', 'depois']) {
    const en = loc === 'en-US', nome = loc + ' ' + quando;
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: loc });
    const page = await ctx.newPage(); const erros = []; page.on('pageerror', e => erros.push(e.message));
    await page.route(u => !u.href.startsWith(base), r => r.fulfill({ status: 404, body: '' }));
    const data = { antes: '2026-11-30T12:00:00-08:00', durante: '2026-12-15T12:00:00-08:00', depois: '2027-01-11T12:00:00-08:00' }[quando];
    await page.clock.install({ time: new Date(data) });
    await page.goto(base + '/'); await page.clock.runFor(4000);
    await page.evaluate(() => { try { _cortesiaFechar(); } catch (e) {} abrirVoxPro(); });
    await page.clock.runFor(300);
    const st = await page.evaluate(() => { const c = document.querySelector('#proOverlay .ob-body'); const b = c.querySelector('.pro-oferta-btn');
      return { txt: c.innerText, risco: !!c.querySelector('.pro-preco s'), btn: b ? b.textContent : '', href: b ? b.getAttribute('href') : '', assinar: c.querySelector('.pro-assinar').getAttribute('href') }; });
    if (quando === 'durante') {
      ok(en ? /Launch offer: lifetime for US\$ 99/.test(st.txt) : /Oferta de lançamento: vitalício por US\$ 99/.test(st.txt), nome + ': aviso da oferta', st.txt.slice(0, 200));
      ok(st.risco, nome + ': US$ 149 riscado');
      ok(st.btn === (en ? 'Lifetime for US$ 99' : 'Vitalício por US$ 99'), nome + ': botão do vitalício em oferta', st.btn);
      ok(/billing_cycle=lifetime/.test(st.href) && /coupon=LAUNCH99/.test(st.href), nome + ': link com o cupom', st.href);
      await page.locator('#proOverlay').screenshot({ path: path.join(require('os').tmpdir(), 'oferta-app-' + loc + '.png') });
    } else {
      ok(!st.btn && !st.risco && !/LAUNCH99|Launch offer|Oferta de lançamento/.test(st.txt), nome + ': sem oferta, tela de antes', st.txt.slice(0, 200));
      ok(en ? /US\$ 149 once/.test(st.txt) : /US\$ 149 uma vez só/.test(st.txt), nome + ': preço normal', st.txt.slice(0, 300));
    }
    ok(!/coupon=LAUNCH99/.test(st.assinar), nome + ': o botão "Assinar o Pro" continua sem o cupom da oferta');
    ok(erros.length === 0, nome + ': sem erros na página', erros.slice(0, 3));
    await ctx.close();
  }
  await browser.close(); srv.close();
  console.log(falhas ? '\n' + falhas + ' falha(s).' : '\nTudo verde.');
  process.exit(falhas ? 1 : 0);
})();
