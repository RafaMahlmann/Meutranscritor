// Jogador leigo: abre o Vox do zero num Chromium de verdade e faz o caminho de
// quem nunca viu o app, clicando onde uma pessoa clicaria. Falha se uma das
// travas que já encontramos voltar. Tira foto de cada passo.
//
// Rodar (na raiz do repositório):
//   npm install --no-save playwright && npx playwright install chromium
//   node testes/jogador-leigo.js [pasta-das-fotos]
//
// As fotos vão por padrão para PLANO_DIRETOR/jogador-leigo/ (pasta ignorada pelo git).
// Nenhuma chave de verdade é usada: as chamadas para AssemblyAI e Groq são simuladas.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const FOTOS = path.join(path.resolve(process.argv[2] || path.join(RAIZ, 'PLANO_DIRETOR', 'jogador-leigo')), new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'));
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.mp4': 'video/mp4', '.webmanifest': 'application/manifest+json' };

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
  // A pessoa já colou as chaves grátis (o caminho sem chave é outro roteiro).
  await ctx.addInitScript(() => { try { if (!localStorage.getItem('vox_cfg')) localStorage.setItem('vox_cfg', JSON.stringify({ provider: 'groqwhisper', apiKeyGroq: 'simulada', diarEnabled: true, diarProvider: 'assemblyai', apiKeyAssembly: 'simulada', aiRenameProvider: 'nao', lang: 'pt' })); } catch (e) {} });
  const page = await ctx.newPage();
  await page.route(u => !u.href.startsWith(base), async route => {
    const u = route.request().url();
    if (u.includes('/v2/upload')) return route.fulfill({ json: { upload_url: 'https://simulado/u' } });
    if (u.includes('/v2/transcript/')) return route.fulfill({ json: { status: 'completed', audio_duration: 3, utterances: [{ speaker: 'A', text: 'Bom dia, como foi a semana?', start: 0, end: 1000 }, { speaker: 'B', text: 'Foi difícil, dormi mal.', start: 1100, end: 2000 }] } });
    if (u.includes('/v2/transcript')) return route.fulfill({ json: { id: 'simulado' } });
    return route.fulfill({ status: 404, body: '' });
  });
  const erros = []; page.on('pageerror', e => erros.push(e.message));
  const foto = async nome => { passo++; await page.screenshot({ path: path.join(FOTOS, String(passo).padStart(2, '0') + '-' + nome + '.png') }); };
  const ver = (f, arg) => page.evaluate(f, arg);
  // Vigia o tempo todo: dois balões juntos, balão por cima de aviso, balão durante gravação.
  const vigiar = () => ver(() => { window.__leigo = []; setInterval(() => { const b = document.querySelectorAll('#dicaBalao'); const vis = b[0] && b[0].style.visibility !== 'hidden'; if (b.length > 1) __leigo.push('dois balões'); if (vis && document.getElementById('toastWrap')?.classList.contains('on')) __leigo.push('balão em cima de aviso'); if (b.length && typeof isRec !== 'undefined' && isRec) __leigo.push('balão durante gravação'); }, 100); });

  try {
    // 1. Abre e pula a abertura
    await page.goto(base + '/index.html'); await page.waitForTimeout(3500);
    await page.getByText('Pular', { exact: true }).first().click(); await page.waitForTimeout(2500);
    await foto('ceu');
    // 2. O planeta Consultas
    const pl = await ver(() => { const p = document.querySelector('.pw[data-id="sug:consultas"]'); if (!p) return null; const r = p.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    ok(!!pl, 'o céu mostra o planeta Consultas');
    await page.mouse.click(pl[0], pl[1]); await page.waitForTimeout(1500);
    await page.getByText('Grava no modo Consulta').first().click();
    await page.waitForFunction(() => typeof _mundosLista === 'function', null, { timeout: 20000 });
    await page.waitForTimeout(3000); await vigiar(); await page.waitForTimeout(4000);
    await foto('entrou');
    const m = await ver(() => ({ tipo: (_mundosLista().find(x => x.id === _mundoAtivo) || {}).tipo, painel: !document.getElementById('btnPainel').hidden }));
    ok(m.tipo === 'consulta' && m.painel, 'entrar pelo planeta cria um mundo de Consultas, com o botão Painel');
    const tela = await ver(() => ({ chip: document.getElementById('diarChipLbl').textContent, titulo: document.querySelector('#foldersBar .folder-head-title span').textContent, boas: document.querySelector('#cardsList .card textarea')?.value || '' }));
    ok(!/Diariza/.test(tela.chip) && tela.titulo === 'Pessoas', 'a tela fala a língua de quem usa: "' + tela.chip + '", "' + tela.titulo + '"');
    ok(/cada consulta gravada vira uma sessão/.test(tela.boas) && !/SOAP/.test(tela.boas), 'as boas-vindas contam o mapa (pessoa, sessão, Painel)');
    // A dica espera o aviso de boas-vindas sair da tela.
    await page.waitForFunction(() => !!_dicaAtual, null, { timeout: 15000 }).catch(() => {});
    const dica = await ver(() => _dicaAtual && _dicaAtual.id);
    ok(dica === 'painel', 'uma dica aponta o Painel (' + dica + ')');
    if (dica) { await foto('dica-painel'); await page.click('#dicaBalao .dica-ok'); }
    // 3. Grava sem escolher ninguém, como o leigo faria
    await page.click('#btnRec'); await page.waitForTimeout(2500);
    ok(await ver(() => document.getElementById('encOv')?.classList.contains('on')), 'gravando uma consulta, abre a tela de atendimento');
    await foto('tela-atendimento');
    await page.click('#encMarcaBtn'); await page.waitForTimeout(400);
    await page.click('.eo-parar'); await page.waitForTimeout(9000);   // "Parar e guardar", na própria tela
    await foto('gravou');
    const card = await ver(() => { const c = [...document.querySelectorAll('#cardsList .card')].find(x => x.dataset.type === 'gravacao'); return c && { id: c.id, pergunta: !!c.querySelector('.cs-dono') }; });
    ok(card && card.pergunta, 'ao parar, o card pergunta de quem é a consulta');
    if (await ver(() => !!_dicaAtual)) await page.click('#dicaBalao .dica-ok');
    await page.fill('#' + card.id + ' .cs-dono-n input', 'Ana'); await page.press('#' + card.id + ' .cs-dono-n input', 'Enter');
    await page.waitForTimeout(800);
    const dono = await ver(id => { const c = document.getElementById(id); return { sn: c.dataset.sessionName, pasta: (folders.find(f => f.id === c.dataset.folder) || {}).name }; }, card.id);
    ok(dono.pasta === 'Ana' && dono.sn === 'Ana · Sessão 1', 'criar a pessoa ali mesmo guarda a sessão nela: ' + JSON.stringify(dono));
    await page.waitForTimeout(4000);
    if (await ver(() => _dicaAtual && _dicaAtual.id)) { await foto('dica-fechar'); await page.click('#dicaBalao .dica-ok'); }
    // 4. Painel: no primeiro toque abre o guia de 3 passos
    await page.click('#btnPainel'); await page.waitForTimeout(800);
    await foto('guia');
    ok(await ver(() => /Passo 1 de 3/i.test(document.querySelector('.mg-modal')?.innerText || '')), 'o primeiro toque no Painel abre o guia');
    await page.getByText('Continuar', { exact: true }).click(); await page.waitForTimeout(500);
    await page.getByText('Montar rapidinho').click(); await page.waitForTimeout(600);
    await page.getByText('Psicologia', { exact: true }).click(); await page.waitForTimeout(800);
    await page.locator('.mg-modal').getByText('Agora não', { exact: true }).click(); await page.waitForTimeout(1500);
    await foto('painel');
    ok(await ver(() => document.getElementById('painelOv')?.classList.contains('on')), 'o guia termina no Painel');
    const pn = await ver(() => document.getElementById('painelOv').innerText);
    ok(/Ana/.test(pn) && !/SEM PESSOA DEFINIDA|Sem pessoa definida/.test(pn) && !/Boas-vindas/.test(pn), 'o Painel mostra a Ana, sem sessão perdida e sem o cartão de boas-vindas como sessão');
    ok((pn.match(/Ana · /g) || []).length <= 1, 'a mesma sessão não aparece duas vezes no Painel');
    // 5. O desenho e a ficha
    if (await ver(() => _dicaAtual && _dicaAtual.id === 'mapa')) await page.click('#dicaBalao .dica-acao');
    else await page.click('.pn-mapa-bt');
    await page.waitForTimeout(600); await foto('desenho');
    ok(await ver(() => /Como o Vox guarda/.test(document.querySelector('.pn-cab b').textContent)), '"Como o Vox guarda" abre o desenho');
    await page.click('#painelOv .pn-volta'); await page.waitForTimeout(1200);
    if (await ver(() => !!_dicaAtual)) await page.click('#dicaBalao .dica-ok');
    await page.click('.pn-pes'); await page.waitForTimeout(800);
    if (await ver(() => !!_dicaAtual)) await page.click('#dicaBalao .dica-ok');
    await page.click('.pn-ficha .pn-bt'); await page.fill('#fi_objetivo', 'Dormir melhor'); await page.click('.pn-ficha-ed .pn-p'); await page.waitForTimeout(500);
    await foto('ficha');
    ok(await ver(() => /Dormir melhor/.test(document.querySelector('.pn-fdl')?.textContent || '')), 'a ficha da Ana guarda o objetivo');
    // 6. Perguntar ao Vox, como quem esqueceu onde ficava
    await page.click('#painelOv .pn-volta'); await page.waitForTimeout(800);
    if (await ver(() => !!_dicaAtual)) await page.click('#dicaBalao .dica-ok');
    await page.click('.pn-perg-bt'); await page.fill('#pgInput', 'Onde fica o que a Ana precisa lembrar?'); await page.press('#pgInput', 'Enter');
    await page.waitForTimeout(400); await foto('pergunta');
    await page.click('.pg-resp .pn-p'); await page.waitForTimeout(1500);
    ok(await ver(() => document.querySelector('.pn-cab b')?.textContent === 'Ana' && !!_dicaAtual), '"Perguntar ao Vox" responde e o "Me leva lá" abre a ficha da Ana');
    if (await ver(() => !!_dicaAtual)) await page.click('#dicaBalao .dica-ok');
    const viol = await ver(() => window.__leigo || []);
    ok(!viol.length, 'nunca dois balões, nunca balão em cima de aviso, nunca balão durante gravação ' + JSON.stringify([...new Set(viol)]));
  } catch (e) {
    ok(false, 'o caminho quebrou no passo ' + (passo + 1) + ': ' + e.message.split('\n')[0]);
    try { await foto('quebrou'); } catch (e2) {}
  }
  ok(!erros.length, 'sem erros no console ' + JSON.stringify(erros.slice(0, 3)));
  await browser.close(); srv.close();
  console.log((falhas ? falhas + ' trava(s).' : 'Caminho do leigo sem travas.') + ' Fotos em ' + FOTOS);
  process.exit(falhas ? 1 : 0);
})();
