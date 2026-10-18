// Bancada de personagens: abre o Vox num navegador de verdade (Chromium ou WebKit),
// com microfone falso, transcrição e IA simuladas, e guarda o que cada personagem viu
// (fotos e textos das telas), tudo o que foi mandado para a IA (ia.json) e os
// endereços de fora que o app chamou (saiu.txt).
//
// Rodar (na raiz do repositório):
//   npm install --no-save playwright && npx playwright install chromium webkit
//   node testes/personas/roda.js medica chromium
//   node testes/personas/roda.js fisio webkit
//   node testes/personas/sessao-longa.js
// Personagens em testes/personas/personas.js. As fotos vão para
// PLANO_DIRETOR/personas/ (pasta ignorada pelo git), ou para a pasta em VOX_SAIDA.
// Nenhuma chave de verdade é usada.
const http = require('http');
const fs = require('fs');
const path = require('path');
function _playwright() {
  for (const m of [process.env.VOX_PLAYWRIGHT, 'playwright', 'playwright-core'].filter(Boolean)) { try { return require(m); } catch (e) {} }
  throw new Error('Playwright não encontrado: npm install --no-save playwright (ou aponte VOX_PLAYWRIGHT para o playwright-core instalado)');
}
const pw = _playwright();

const RAIZ = path.resolve(__dirname, '..', '..');
const SAIDA = process.env.VOX_SAIDA || path.join(RAIZ, 'PLANO_DIRETOR', 'personas');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.mp4': 'video/mp4', '.gz': 'application/gzip' };

function servidor() {
  return new Promise(res => {
    const s = http.createServer((req, resp) => {
      const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const arq = path.join(RAIZ, p === '/' ? 'index.html' : p);
      if (!path.resolve(arq).startsWith(path.resolve(RAIZ)) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { resp.writeHead(404); resp.end(); return; }
      resp.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq)] || 'application/octet-stream' });
      fs.createReadStream(arq).pipe(resp);
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });
}

// Resposta falsa da IA: devolve as seções que o próprio pedido exigiu, para a tela
// ter a forma certa. O que importa aqui é o que FOI PEDIDO, não o que voltou.
function respostaIA(corpo) {
  const msgs = (corpo && corpo.messages) || [];
  const ult = (msgs[msgs.length - 1] || {}).content || '';
  if (/Responda só com JSON|Respond only with JSON|JSON:/i.test(ult) && /\{"A"/.test(ult)) {
    const m = ult.match(/\{"A":"[^"]*","B":"[^"]*"\}/);
    const r = m ? JSON.parse(m[0]) : { A: 'Profissional', B: 'Paciente' };
    // como um modelo obediente faria: a terceira voz recebe o nome que o pedido mandou usar
    try {
      const achados = JSON.parse((ult.match(/Locutores encontrados: (\{[^\n]*\})/) || [])[1] || '{}');
      const terceiro = (ult.match(/chame de "([^"]+)"/) || [])[1];
      Object.keys(achados).forEach(k => { if (!r[k]) r[k] = terceiro || achados[k]; });
    } catch (e) {}
    return JSON.stringify(r);
  }
  const secoes = [...ult.matchAll(/\*\*([^*\n]{2,60}?):?\*\*/g)].map(x => x[1]).slice(0, 10);
  if (secoes.length) return secoes.map(s => '**' + s + ':** [texto simulado da IA para "' + s + '"]').join('\n\n');
  return '[resposta simulada da IA]';
}

async function abrir({ nome, motor = 'chromium', lang = 'pt', viewport = { width: 1280, height: 820 }, falas, cfgExtra = {}, mobile = false }) {
  const pasta = path.join(SAIDA, nome + '-' + motor);
  fs.rmSync(pasta, { recursive: true, force: true }); fs.mkdirSync(pasta, { recursive: true });
  const srv = await servidor();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const args = motor === 'chromium' ? ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] : [];
  const browser = await pw[motor].launch({ args });
  const ctxOpts = { viewport, locale: lang === 'en' ? 'en-US' : 'pt-BR' };
  if (mobile) Object.assign(ctxOpts, { isMobile: motor !== 'firefox', hasTouch: true, deviceScaleFactor: 2 });
  const ctx = await browser.newContext(ctxOpts);
  if (motor === 'chromium') await ctx.grantPermissions(['microphone', 'clipboard-read', 'clipboard-write'], { origin: base });
  const cfg = Object.assign({ provider: 'groqwhisper', apiKeyGroq: 'simulada', diarEnabled: true, diarProvider: 'assemblyai', apiKeyAssembly: 'simulada', lang }, cfgExtra);
  await ctx.addInitScript(([c, l]) => { try { if (!localStorage.getItem('vox_cfg')) { localStorage.setItem('vox_cfg', JSON.stringify(c)); localStorage.setItem('vox_lang', l); } } catch (e) {} }, [cfg, lang]);
  // WebKit não tem microfone falso: um getUserMedia com um oscilador faz o papel.
  if (motor !== 'chromium') await ctx.addInitScript(() => {
    try {
      const fake = async () => { const ac = new (window.AudioContext || window.webkitAudioContext)(); const o = ac.createOscillator(); const d = ac.createMediaStreamDestination(); o.connect(d); o.start(); return d.stream; };
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = fake;
      else Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: fake, enumerateDevices: async () => [] } });
    } catch (e) {}
  });
  const page = await ctx.newPage();
  const estado = { falas };
  const ia = [];      // tudo o que foi mandado para a IA de texto
  const saiu = [];    // todo endereço de fora que o app tentou chamar
  await page.route(u => !u.href.startsWith(base), async route => {
    const req = route.request(); const u = req.url();
    saiu.push(req.method() + ' ' + u.split('?')[0]);
    if (u.includes('/v2/upload')) return route.fulfill({ json: { upload_url: 'https://simulado/u' } });
    if (u.includes('/v2/transcript/')) {
      const utt = (estado.falas || []).map((f, i) => ({ speaker: f[0], text: f[1], start: i * 4000, end: i * 4000 + 3500 }));
      return route.fulfill({ json: { status: 'completed', audio_duration: Math.max(3, utt.length * 4), text: utt.map(x => x.text).join(' '), utterances: utt } });
    }
    if (u.includes('/v2/transcript')) return route.fulfill({ json: { id: 'simulado' } });
    if (/audio\/transcriptions/.test(u)) return route.fulfill({ json: { text: (estado.falas || []).map(f => f[1]).join(' ') } });
    if (/chat\/completions/.test(u)) {
      let corpo = {}; try { corpo = JSON.parse(req.postData() || '{}'); } catch (e) {}
      ia.push({ url: u.split('?')[0], model: corpo.model, temperature: corpo.temperature, messages: corpo.messages });
      return route.fulfill({ json: { choices: [{ message: { role: 'assistant', content: respostaIA(corpo) }, finish_reason: 'stop' }] } });
    }
    if (/\/models$/.test(u)) return route.fulfill({ json: { data: [] } });
    return route.fulfill({ status: 404, body: '' });
  });
  const erros = [];
  page.on('pageerror', e => erros.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text().slice(0, 300)); });
  let n = 0;
  const notas = [];
  const api = {
    page, ctx, browser, base, pasta, ia, saiu, erros, notas, estado,
    foto: async (rot) => { n++; const f = path.join(pasta, String(n).padStart(2, '0') + '-' + rot + '.png'); await page.screenshot({ path: f }); return f; },
    ver: (f, arg) => page.evaluate(f, arg),
    espera: ms => page.waitForTimeout(ms),
    nota: (txt) => { notas.push(txt); console.log('  · ' + txt); },
    texto: () => page.evaluate(() => document.body.innerText),
    // fecha qualquer balão de dica que esteja aberto
    semDica: async () => { for (let i = 0; i < 3; i++) { const tem = await page.evaluate(() => { const b = document.querySelector('#dicaBalao .dica-ok'); return !!b && b.getBoundingClientRect().width > 0; }).catch(() => false); if (!tem) return; await page.click('#dicaBalao .dica-ok', { timeout: 3000 }).catch(() => {}); await page.waitForTimeout(300); } },
    fechar: async () => {
      fs.writeFileSync(path.join(pasta, 'ia.json'), JSON.stringify(ia, null, 2));
      fs.writeFileSync(path.join(pasta, 'saiu.txt'), [...new Set(saiu)].join('\n'));
      fs.writeFileSync(path.join(pasta, 'erros.txt'), erros.join('\n'));
      fs.writeFileSync(path.join(pasta, 'notas.md'), notas.map(x => '- ' + x).join('\n'));
      await browser.close(); srv.close();
    }
  };
  return api;
}

// Entra no app do zero, pula a abertura e adota um mundo-sugestão.
async function entrarNoMundo(a, sid) {
  const { page } = a;
  await page.goto(a.base + '/index.html'); await a.espera(3500);
  const pular = page.getByText(/^(Pular|Skip)$/).first();
  if (await pular.count()) await pular.click().catch(() => {});
  await a.espera(2500);
  await a.foto('ceu');
  await page.evaluate(s => adotarSugestao(s), sid);
  await page.waitForLoadState('load'); await a.espera(1500);
  await page.waitForFunction(() => typeof _mundosLista === 'function', null, { timeout: 20000 });
  await a.espera(3500);
}

module.exports = { abrir, entrarNoMundo, SAIDA };
