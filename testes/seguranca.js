// Sonda de segurança: tenta injetar código no Vox pelos caminhos por onde um
// ataque entraria de verdade e falha se alguma armadilha disparar.
//
//  1. Backup / pasta recebida pelo Vox Transfer: as duas caem em _restoreProject.
//     Monta um backup com uma armadilha diferente em CADA campo (nome e código da
//     pasta, cor, título, texto, tags, quem fala, conversa com a IA, links...),
//     restaura e passeia por ~60 telas, passando o mouse e o foco em tudo.
//     Seis jeitos de escapar, uma rodada cada (ver MODELOS).
//  2. Erro devolvido por um serviço de IA (Resumo do dia): a tela mostrava a
//     mensagem como HTML sem escape. Não era explorável porque o callAI já
//     troca o erro por uma frase nossa, mas a tela não pode depender disso
//     (corrigido em 06/11/2026). O teste manda o erro cru direto pra tela.
//
// Toda rodada põe também uma armadilha de CONTROLE, que tem que disparar: se ela
// não disparar, o teste está cego e falha em vez de dizer "passou".
//
// Rodar (na raiz do repositório):
//   npm install --no-save playwright && npx playwright install chromium
//   node testes/seguranca.js
// Para testar outra cópia do app: VOX_RAIZ=/caminho node testes/seguranca.js
// Nenhuma chave de verdade é usada: toda chamada de fora é respondida aqui.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const RAIZ = path.resolve(process.env.VOX_RAIZ || path.join(__dirname, '..'));
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.mp4': 'video/mp4' };

let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK    ' : 'FALHOU') + ' ' + msg); if (!cond) falhas++; };

// Cada modelo recebe a etiqueta do campo e devolve o texto envenenado.
const MODELOS = {
  html: (c) => `<img src=x onerror="__x('${c}')">`,
  aspas_simples: (c) => `x');__x('${c}');('`,
  aspas_duplas: (c) => `x");__x("${c}");("`,
  link_javascript: (c) => `javascript:__x('${c}')`,
  fecha_tag: (c) => `</textarea></title></style><img src=x onerror="__x('${c}')">`,
  atributo: (c) => `red" onmouseover="__x('${c}')" onfocus="__x('${c}')" tabindex="1" x="`,
};

function backup(P) {
  const F1 = P('pasta.id'), F2 = P('subpasta.id');
  const base = { cost: 0, ci: 0, dt: '2026-11-01T10:00:00.000Z', pinned: false };
  return {
    app: 'vox', version: 1,
    folders: [
      { id: F1, name: P('pasta.nome'), color: P('pasta.cor'), parentId: null },
      { id: F2, name: P('subpasta.nome'), color: '#ff0000', parentId: F1 },
    ],
    tagNomes: [P('tagNomes')],
    tagBiblio: { g: [P('tagBiblio.guardada')], a: [P('tagBiblio.arquivada')] },
    history: [
      {
        ...base, type: P('card.tipo'), prov: P('card.provedor'), text: 'Texto ' + P('card.texto'),
        tags: [P('card.tag'), 'normal'], sessionName: P('card.titulo'), mode: 'livre', folder: F1,
        chatHistory: JSON.stringify([{ role: 'user', content: P('conversa.pessoa') }, { role: 'assistant', content: P('conversa.ia') }]),
        links: [P('card.link'), { id: P('link.id'), t: P('link.texto') }],
        textosImagem: { [P('textoImagem.chave')]: P('textoImagem.valor') },
      },
      {
        ...base, dt: '2026-11-02T10:00:00.000Z', type: 'texto', prov: 'whisper', text: 'Segundo',
        tags: [P('card2.tag')], sessionName: 'Normal', mode: P('card2.modo'), folder: F2, chatHistory: '[]',
      },
      {
        ...base, dt: '2026-11-03T10:00:00.000Z', diarized: true, prov: 'assemblyai', tags: [P('diar.tag')],
        sessionName: P('diar.titulo'), mode: 'consulta', view: P('diar.vista'), folder: F1, chatHistory: '[]',
        utterances: JSON.stringify([{ speaker: P('fala.quem'), text: P('fala.texto'), start: 0, end: 1000 }, { speaker: 'B', text: 'oi', start: 1000, end: 2000 }]),
        speakers: JSON.stringify({ [P('fala.quem')]: P('falante.nome'), B: { name: P('falante.obj.nome'), color: P('falante.obj.cor') } }),
      },
    ],
  };
}

function servidor() {
  return new Promise((res) => {
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

async function novaPagina(browser, base, aoChamarFora) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 }, locale: 'pt-BR' });
  await ctx.addInitScript(() => {
    window.__hits = [];
    window.__x = (c) => { window.__hits.push(c + ' @ ' + (window.__tela || '?')); };
    try {
      localStorage.setItem('vox_onboarded', '1');
      localStorage.setItem('vox_cfg', JSON.stringify({ provider: 'groqwhisper', apiKeyGroq: 'simulada' }));
    } catch (e) {}
  });
  const page = await ctx.newPage();
  await page.route((u) => !u.href.startsWith(base), aoChamarFora || ((r) => r.fulfill({ status: 404, body: '' })));
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.goto(base + '/index.html');
  await page.waitForTimeout(2500);
  return { ctx, page };
}

// Põe a armadilha de controle e devolve as armadilhas que dispararam.
const colher = (page) => page.evaluate(async () => {
  window.__tela = 'CONTROLE';
  document.body.insertAdjacentHTML('beforeend', '<img src=x onerror="__x(\'controle\')">');
  await new Promise((r) => setTimeout(r, 400));
  return [...new Set(window.__hits)];
});

// Abre as telas. Cada uma que existir é aberta; a que não existir é pulada.
const passear = (page) => page.evaluate(async () => {
  const sl = (ms) => new Promise((r) => setTimeout(r, ms));
  const G = (n) => (typeof window[n] === 'function' ? window[n] : null);
  const abertas = [];
  const tenta = async (nome, fn) => {
    window.__tela = nome; abertas.push(nome);
    try { const v = fn(); if (v && v.then) await Promise.race([v, sl(1500)]); } catch (e) {}
    await sl(300);
    document.querySelectorAll('[onmouseover],[onmouseenter],[onfocus],[tabindex]').forEach((el) => {
      try { el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); el.dispatchEvent(new FocusEvent('focus')); } catch (e) {}
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    try { if (G('closeTxOverlay')) closeTxOverlay(); } catch (e) {}
  };
  const cards = [...document.querySelectorAll('.card:not(.proc-card)')].map((c) => c.id);
  const pastas = (window.folders || JSON.parse(localStorage.getItem('vox_folders') || '[]')).map((f) => f.id);
  for (const f of pastas) await tenta('pasta', () => G('selectFolder') && selectFolder(f));
  await tenta('todas as notas', () => G('selectFolder') && selectFolder(null));
  for (const n of ['renderFolders', 'renderFolderTree', 'showCards', 'abrirCalendario', 'abrirFluxograma', 'abrirOrbital', 'abrirGalaxia', 'abrirPainel', 'openPanorama', 'openRevisao', 'openDaySummary', 'openReviewPanel', 'openRessurgir', 'openPergunte', 'abrirCofreUI', 'renderFiltroCores', 'abrirSalaEnvio', 'abrirTagBiblioteca', 'abrirBibliotecaTags']) {
    const fn = G(n); if (fn) await tenta(n, () => fn());
  }
  for (const id of cards) {
    for (const n of ['openTransferPanel', 'openConversaMode', 'openModal', 'openModalToDiar', 'openDiarExport', 'openExtractPanel', 'openLensOverlay', 'openSheet', 'renderCchat']) {
      const fn = G(n); if (fn) await tenta(n, () => fn(id));
    }
    await tenta('clicar no card', () => { const c = document.getElementById(id); if (c) c.click(); });
  }
  for (const n of Object.keys(window).filter((k) => /^(abrirFicha|abrirPessoa|_ficha|abrirMundo|abrirLista|abrirMural|abrirMapa)/.test(k) && typeof window[k] === 'function')) {
    await tenta(n, () => window[n](pastas[0]));
  }
  return { abertas: abertas.length, cards: cards.length, pastas: pastas.length };
});

(async () => {
  const srv = await servidor();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  try {
    // ── 1. Backup e pasta recebida ──
    for (const [nome, M] of Object.entries(MODELOS)) {
      const { ctx, page } = await novaPagina(browser, base);
      const erros = []; page.on('pageerror', (e) => erros.push(e.message));
      await page.evaluate(async (d) => { window.__tela = 'restaurar'; await _restoreProject(d); }, backup((c) => M(nome + ':' + c)));
      await page.waitForTimeout(800);
      const r = await passear(page);
      const hits = await colher(page);
      const vazou = hits.filter((h) => !h.startsWith('controle'));
      ok(r.cards === 3 && r.pastas >= 2, `backup "${nome}": o app restaurou ${r.cards} notas e ${r.pastas} pastas e abriu ${r.abertas} telas`);
      ok(hits.some((h) => h.startsWith('controle')), `backup "${nome}": a armadilha de controle disparou (o teste enxerga)`);
      ok(!vazou.length, `backup "${nome}": nenhuma armadilha disparou ${JSON.stringify(vazou)}`);
      await ctx.close();
    }

    // ── 2. Erro envenenado devolvido por um serviço de IA (Resumo do dia) ──
    const veneno = `<img src=x onerror="__x('erro.do.servico')">`;
    const { ctx, page } = await novaPagina(browser, base, (r) => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: veneno } }) }));
    await page.evaluate(() => { addCard('Nota de hoje pra resumir', null, 0, 'texto', 'whisper', true); });
    // Hoje o callAI já troca o erro do serviço por uma frase nossa. A tela não
    // pode depender disso: aqui o erro chega cru, como chegaria se essa troca
    // mudasse um dia.
    await page.evaluate((v) => { window.callAI = async () => { throw new Error(v); }; }, veneno);
    await page.evaluate(async () => { window.__tela = 'resumo do dia'; try { await Promise.race([openDaySummary(), new Promise((r) => setTimeout(r, 6000))]); } catch (e) {} });
    await page.waitForTimeout(1500);
    const hits = await colher(page);
    ok(hits.some((h) => h.startsWith('controle')), 'erro do serviço: a armadilha de controle disparou (o teste enxerga)');
    ok(!hits.some((h) => h.startsWith('erro.do.servico')), 'erro do serviço: a mensagem de erro aparece como texto, sem executar');
    await ctx.close();
  } catch (e) {
    ok(false, 'o teste quebrou no meio: ' + e.message);
  } finally {
    await browser.close(); srv.close();
  }
  console.log(falhas ? `\n${falhas} problema(s) de segurança.` : '\nNenhuma brecha encontrada.');
  process.exit(falhas ? 1 : 0);
})();
