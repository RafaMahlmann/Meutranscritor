// Diário do leigo: abre o Vox do zero num Chromium de verdade e faz o caminho de
// quem quer manter um diário falado (céu → planeta Diário → pergunta do dia →
// gravar no abajur → selar o dia → ver os dias → Meu dia). Falha se uma das
// travas que o jogador leigo encontrou no Diário (17/10/2026) voltar.
//
// Rodar (na raiz do repositório):
//   npm install --no-save playwright && npx playwright install chromium
//   node testes/diario-leigo.js [pasta-das-fotos]
//
// As fotos vão por padrão para PLANO_DIRETOR/diario-leigo/ (pasta ignorada pelo git).
// Nenhuma chave de verdade é usada: Groq (fala e texto) é simulado.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const FOTOS = path.join(path.resolve(process.argv[2] || path.join(RAIZ, 'PLANO_DIRETOR', 'diario-leigo')), new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'));
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.mp4': 'video/mp4', '.webmanifest': 'application/manifest+json' };
const FALA = 'Hoje acordei cansado, a reunião foi tensa mas almocei com a Ana e ri muito. Amanhã quero caminhar.';
const MEU_DIA = '**Como foi**\nAcordei **cansado**; a **reunião foi tensa**.\n\n**O que senti**\n**Ri muito** no almoço.\n\n**Gente**\nAna\n\n**Para amanhã**\n- [ ] Caminhar';

let falhas = 0, passo = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK    ' : 'TRAVOU') + ' ' + msg); if (!cond) falhas++; };

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
  fs.mkdirSync(FOTOS, { recursive: true });
  const srv = await servidor();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 }, locale: 'pt-BR' });
  await ctx.grantPermissions(['microphone'], { origin: base });
  // A pessoa já colou as chaves grátis, inclusive a da AssemblyAI: o Diário tem que
  // desligar o "Separar vozes" sozinho (era a trava do "Locutor 1:").
  await ctx.addInitScript(() => { try { if (!localStorage.getItem('vox_cfg')) localStorage.setItem('vox_cfg', JSON.stringify({ provider: 'groqwhisper', apiKeyGroq: 'simulada', diarEnabled: true, diarProvider: 'assemblyai', apiKeyAssembly: 'simulada', aiRenameProvider: 'nao', lang: 'pt' })); } catch (e) {} });
  const page = await ctx.newPage();
  const chamadas = [];
  await page.route(u => !u.href.startsWith(base), async route => {
    const u = route.request().url(); chamadas.push(u);
    if (u.includes('audio/transcriptions')) return route.fulfill({ status: 200, contentType: 'text/plain', body: FALA });
    if (u.includes('chat/completions')) return route.fulfill({ json: { id: 'x', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: MEU_DIA }, finish_reason: 'stop' }] } });
    if (u.includes('/v2/')) return route.fulfill({ status: 500, body: '' });
    return route.fulfill({ status: 404, body: '' });
  });
  const erros = []; page.on('pageerror', e => erros.push(e.message));
  const foto = async nome => { passo++; await page.screenshot({ path: path.join(FOTOS, String(passo).padStart(2, '0') + '-' + nome + '.png') }); };
  const ver = (f, arg) => page.evaluate(f, arg);
  const naVista = async sel => { await ver(s => document.querySelector(s)?.scrollIntoView({ block: 'center' }), sel); await page.waitForTimeout(300); };
  const nota = '#cardsList .card[data-type="gravacao"]';

  try {
    // 1. Céu → planeta Diário
    await page.goto(base + '/index.html'); await page.waitForTimeout(3500);
    await page.getByText('Pular', { exact: true }).first().click(); await page.waitForTimeout(2500);
    // O planeta gira: clica no centro dele, como o dedo.
    const pl = await ver(() => { const p = document.querySelector('.pw[data-id="sug:diario"]'); if (!p) return null; const r = p.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    ok(!!pl, 'o céu mostra o planeta Diário');
    await page.mouse.click(pl[0], pl[1]); await page.waitForTimeout(1500);
    ok(await ver(() => !/Na dúvida/.test(document.querySelector('.d1a-sub')?.textContent || '')), 'a ficha do planeta dá uma recomendação só');
    await page.locator('.d1a-jeito.on').click();
    await page.waitForFunction(() => typeof _mundosLista === 'function', null, { timeout: 20000 });
    // 2. "Este diário é só seu" aparece sozinho
    await page.waitForSelector('#dioSoSeuOv', { timeout: 25000 });
    await foto('so-seu');
    await page.locator('#dioSoSeuOv .dio-ok').click(); await page.waitForTimeout(500);
    ok(await ver(() => cfg.diarEnabled === false), 'no Diário, "Separar vozes" começa desligado');
    // 3. A pergunta do dia, e responder falando
    const perg = await ver(() => document.querySelector('#dioTopo .dio-q')?.innerText || '');
    ok(/\?$/.test(perg), 'uma pergunta no lugar da página em branco: ' + perg);
    await page.locator('#dioTopo .dio-falar').click(); await page.waitForTimeout(3000);
    ok(await ver(q => document.getElementById('dioOv')?.classList.contains('on') && document.querySelector('#dioOv .da-q')?.innerText === q, perg), 'gravar abre o abajur, com a pergunta e um botão de parar');
    await foto('abajur');
    await page.locator('#dioImporta').click();
    await page.locator('#dioOv .da-p').click(); await page.waitForTimeout(10000);
    const n = await ver(s => { const c = document.querySelector(s); return c && { dia: c.dataset.quando === _calChave(new Date()), txt: c.querySelector('textarea').value, perg: _dioLer(c).perg }; }, nota);
    ok(n && n.dia, 'a gravação cai no dia de hoje, sem arrastar');
    ok(n && !/Locutor/.test(n.txt) && n.perg === perg, 'sem "Locutor 1:", e a nota guarda a pergunta');
    // 4. Selar o dia: humor num toque, segurar para selar
    await naVista(nota + ' .dio-humores');
    await page.getByRole('radio', { name: 'Bom' }).click(); await page.waitForTimeout(300);
    await naVista(nota + ' .dio-segura');
    const seg = await ver(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, nota + ' .dio-segura');
    await page.mouse.move(seg[0], seg[1]); await page.mouse.down(); await page.waitForTimeout(1100); await page.mouse.up(); await page.waitForTimeout(1500);
    await foto('selado');
    ok(await ver(s => !!_dioLer(document.querySelector(s)).selado && !!document.querySelector(s + ' .dio-carimbo'), nota), 'segurar sela o dia com o carimbo');
    // 5. A coleção que só sobe e os dias
    const cole = await ver(() => document.querySelector('#dioTopo .dio-cole')?.innerText.replace(/\s+/g, ' ') || '');
    ok(/1 dia falado/.test(cole) && /1 página selada/.test(cole), 'a coleção conta o dia: ' + cole);
    ok(!/sequência/i.test(await ver(() => document.body.innerText)), 'nenhuma "sequência" para quebrar');
    await page.getByRole('button', { name: 'Ver meus dias' }).click(); await page.waitForTimeout(500);
    ok(await ver(() => document.querySelectorAll('#dioAnoOv .dio-sem-dia').length === 7), 'a semana aparece, dia por dia');
    await foto('semana');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    // 6. Meu dia: o falado arrumado, já lido
    await naVista(nota + ' .dio-meudia');
    await page.locator(nota + ' .dio-meudia').click(); await page.waitForTimeout(4000);
    const md = await ver(() => { const c = [...document.querySelectorAll('#cardsList .card')].find(x => x.dataset.origemLente === 'di_meudia'); return c && (document.getElementById('mdp-' + c.id)?.innerHTML || ''); });
    ok(md && /<strong>Como foi<\/strong>/.test(md) && !/\*\*/.test(md), 'Meu dia nasce arrumado, sem ** aparecendo');
    await foto('meu-dia');
    // 7. Só seu: sem IA, nada sai para a IA de texto
    await page.locator('#dioTopo .dio-soseu:not(.dio-esconder):not(.dio-tranca-ja)').click(); await page.waitForTimeout(300);
    await page.getByRole('switch', { name: 'IA de texto no Diário' }).click(); await page.keyboard.press('Escape');
    const antes = chamadas.filter(u => u.includes('chat/completions')).length;
    await ver(() => callAI('teste', 'x').catch(() => {}));
    ok(chamadas.filter(u => u.includes('chat/completions')).length === antes && await ver(() => document.body.classList.contains('dio-sem-ia')), 'IA desligada no Diário: nenhuma chamada e os botões somem');
  } catch (e) {
    ok(false, 'o caminho quebrou no passo ' + (passo + 1) + ': ' + e.message.split('\n')[0]);
    try { await foto('quebrou'); } catch (e2) {}
  }
  ok(!erros.length, 'sem erros no console ' + JSON.stringify(erros.slice(0, 3)));
  await browser.close(); srv.close();
  console.log((falhas ? falhas + ' trava(s).' : 'Diário do leigo sem travas.') + ' Fotos em ' + FOTOS);
  process.exit(falhas ? 1 : 0);
})();
