// Pastas em tinta índigo, testado por duas pessoas de mentira num Chromium de verdade.
//
//  LEIGO (celular, 390x844, toque): nunca viu o Vox. Abre do zero, recebe as
//  primeiras notas, segue a mãozinha, cria uma pasta e guarda uma nota nela
//  pela interface (Selecionar → Mais → mover), como uma pessoa faria.
//
//  ESPECIALISTA (computador, 1366x800, teclado): usa o Vox todo dia, com
//  pastas e 12 notas guardadas. Recarrega, abre e fecha rápido pelo teclado,
//  tira notas de pasta, guarda várias de uma vez, liga "reduzir movimento",
//  troca de idioma e encolhe a janela até o tamanho de celular.
//
// Rodar (na raiz do repositório):
//   npm install --no-save playwright && npx playwright install chromium
//   node testes/pastas-leigo-especialista.js [pasta-das-fotos]
//
// Fotos em PLANO_DIRETOR/pastas-personas/ (pasta ignorada pelo git).
// "TRAVOU" é defeito; "ATENÇÃO" é coisa que funciona mas dá pra melhorar.
// As notas chegam por addCard(), como se a transcrição tivesse terminado:
// nenhuma gravação nem chave de verdade é usada.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const FOTOS = path.join(path.resolve(process.argv[2] || path.join(RAIZ, 'PLANO_DIRETOR', 'pastas-personas')), new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'));
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.mp4': 'video/mp4', '.webmanifest': 'application/manifest+json' };

let falhas = 0, avisos = 0, passo = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK      ' : 'TRAVOU  ') + msg); if (!cond) falhas++; return cond; };
const atencao = (cond, msg) => { if (!cond) { console.log('ATENÇÃO ' + msg); avisos++; } return cond; };

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

// Vigia instalado em toda página: conta voos, engolidas, espiadas, balões
// duplicados e balão em cima de aviso, o tempo todo.
const VIGIA = () => {
  window.__pt = { voos: 0, engole: 0, espia: 0, pop: 0, viol: [] };
  const obs = () => {
    new MutationObserver(ms => ms.forEach(m => {
      m.addedNodes.forEach(n => { if (n.classList && n.classList.contains('pt-voo')) __pt.voos++; });
      if (m.type === 'attributes' && m.target.classList) {
        if (m.target.id === 'btnFolders' && m.target.classList.contains('engole')) __pt.engole++;
        if (m.target.id === 'foldersBar' && m.target.classList.contains('pt-espia')) __pt.espia++;
        if (m.target.classList.contains('pt-soltas') && m.target.classList.contains('pop')) __pt.pop++;
      }
    })).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    setInterval(() => {
      const b = document.querySelectorAll('#dicaBalao');
      if (b.length > 1) __pt.viol.push('dois balões');
      if (b[0] && b[0].style.visibility !== 'hidden' && document.getElementById('toastWrap')?.classList.contains('on')) __pt.viol.push('balão em cima de aviso');
      const bar = document.getElementById('foldersBar'), bt = document.getElementById('btnFolders');
      if (bar && bt && bar.classList.contains('open') !== bt.classList.contains('folders-on')) __pt.viol.push('botão e painel discordam');
    }, 100);
  };
  if (document.body) obs(); else addEventListener('DOMContentLoaded', obs);
};

// Contraste real do ícone: cor do texto contra o fundo do botão composto sobre o da página.
const CONTRASTE = () => {
  const rgb = s => (s.match(/[\d.]+/g) || []).map(Number);
  const b = document.getElementById('btnFolders'), cs = getComputedStyle(b);
  const fundoPag = rgb(getComputedStyle(document.body).backgroundColor);
  let [r, g, bl, a = 1] = rgb(cs.backgroundColor);
  const tinta = b.classList.contains('folders-on') ? rgb(getComputedStyle(b.querySelector('.pt-tinta')).backgroundColor) : null;
  const fundo = tinta ? tinta : [r * a + fundoPag[0] * (1 - a), g * a + fundoPag[1] * (1 - a), bl * a + fundoPag[2] * (1 - a)];
  const L = c => { const v = c.slice(0, 3).map(x => { x /= 255; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
  const l1 = L(rgb(cs.color)), l2 = L(fundo);
  return +((Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05)).toFixed(2);
};

async function entrarDoZero(page, base) {
  await page.goto(base + '/index.html'); await page.waitForTimeout(3000);
  await page.getByText('Pular', { exact: true }).first().click(); await page.waitForTimeout(2200);
  await page.locator('.d1a-jeito.on').first().click({ force: true });
  await page.waitForFunction(() => typeof _ptSoltasSinc === 'function' && !document.getElementById('galaxia')?.classList.contains('on'), null, { timeout: 20000 });
  await page.waitForTimeout(2500);
}

async function leigo(browser, base) {
  console.log('\n── LEIGO, no celular ──');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR' });
  await ctx.addInitScript(VIGIA);
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(e.message));
  const ver = (f, a) => page.evaluate(f, a);
  const foto = async (nome, clip) => { passo++; await page.screenshot({ path: path.join(FOTOS, 'leigo-' + String(passo).padStart(2, '0') + '-' + nome + '.png'), clip }); };
  const fecharAviso = () => ver(() => { const t = document.getElementById('toastWrap'); if (t) t.classList.remove('on'); });
  try {
    await entrarDoZero(page, base);
    await ver(() => { if (document.getElementById('foldersBar').classList.contains('open')) toggleFolders(); });
    await page.waitForTimeout(400);
    await foto('chegou');
    const c = await ver(CONTRASTE);
    ok(c >= 4.5, 'o retângulo das Pastas se lê de longe: contraste ' + c + ':1 (era 2,55:1)');
    const tam = await ver(() => { const r = document.getElementById('btnFolders').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
    atencao(tam[0] >= 44 || tam[1] >= 44, 'o botão desenhado tem ' + tam.join('×') + ' px; o dedo conta com a área invisível de 44 px (::after), mas o alvo visível continua pequeno');
    await page.waitForTimeout(3000);
    ok(await ver(() => !(_dicaAtual && _dicaAtual.id === 'pastas-botao')), 'sem nota nenhuma, a mãozinha das pastas espera (não briga com as boas-vindas)');
    ok(await ver(() => document.querySelector('#btnFolders .pt-soltas').hidden), 'sem notas, nada de número no botão');

    // 1ª nota chega
    await ver(() => addCard('Reunião com a Carla sobre o orçamento de dezembro. Ficou de mandar a planilha até sexta.'));
    await page.waitForFunction(() => _dicaAtual && _dicaAtual.id === 'pastas-botao', null, { timeout: 15000 }).catch(() => {});
    const d = await ver(() => ({ id: _dicaAtual && _dicaAtual.id, mao: !!document.getElementById('dicaMao'), frase: document.querySelector('#dicaBalao p')?.textContent }));
    ok(d.id === 'pastas-botao' && d.mao, 'depois da 1ª nota, a mãozinha aponta as Pastas: "' + d.frase + '"');
    await page.waitForTimeout(900);
    ok(await ver(() => __pt.espia >= 1), 'enquanto a mão aponta, a gaveta espia e volta');
    await foto('mãozinha');

    // Curioso, toca no próprio botão
    await page.tap('#btnFolders'); await page.waitForTimeout(700);
    const ab = await ver(() => ({ open: document.getElementById('foldersBar').classList.contains('open'), visto: _dicaVistas().includes('pastas-botao'), balao: !!document.getElementById('dicaBalao') }));
    ok(ab.open && ab.visto, 'tocar no botão abre as pastas e conta a dica como vista');
    const c2 = await ver(CONTRASTE);
    ok(c2 >= 4.5, 'aberto, o botão fica cheio de tinta: contraste ' + c2 + ':1');
    const exp = await ver(() => document.getElementById('btnFolders').getAttribute('aria-expanded'));
    ok(exp === 'true', 'o leitor de tela sabe que o painel abriu (aria-expanded="' + exp + '")');
    await foto('abriu');

    // Fecha tocando fora, do jeito de qualquer app
    await page.tap('#foldersBackdrop', { position: { x: 30, y: 400 } }); await page.waitForTimeout(500);
    ok(await ver(() => !document.getElementById('foldersBar').classList.contains('open') && !document.getElementById('btnFolders').classList.contains('folders-on')), 'tocar fora fecha a gaveta e o botão volta ao contorno');

    // Mais duas notas: aparece o número
    await ver(() => { addCard('Ideia de post: os 3 erros mais comuns ao organizar notas de voz.'); });
    await page.waitForTimeout(400);
    await ver(() => { addCard('Lembrar de ligar pro dentista na segunda de manhã.'); });
    await page.waitForTimeout(900);
    const bd = await ver(() => ({ n: document.querySelector('#btnFolders .pt-soltas').hidden ? null : document.querySelector('#btnFolders .pt-soltas').textContent, aria: document.getElementById('btnFolders').getAttribute('aria-label'), pop: __pt.pop }));
    ok(bd.n === '3' && bd.pop >= 1, 'com 3 notas soltas o número amarelo aparece saltando ("' + bd.n + '")');
    ok(/3 notas fora de pasta/.test(bd.aria), 'o leitor de tela também ouve: "' + bd.aria + '"');
    await fecharAviso();
    await foto('numero', { x: 0, y: 0, width: 390, height: 240 });

    // Cria uma pasta pela gaveta, como leigo
    await page.tap('#btnFolders'); await page.waitForTimeout(1600);
    // A dica antiga do "Ver como" entra na 2ª abertura e cobre o "Nova pasta".
    const outra = await ver(() => _dicaAtual && _dicaAtual.id);
    atencao(!outra, 'na 2ª vez que abre as pastas, outra dica ("' + outra + '") aparece logo e cobre o "Nova pasta"; o leigo precisa tocar Entendi antes');
    if (outra) { await foto('segunda-dica'); await page.tap('#dicaBalao .dica-ok'); await page.waitForTimeout(400); }
    await page.locator('#foldersBar .folder-fantasma').first().tap(); await page.waitForTimeout(500);
    await page.fill('#folderNovoNomeInput', 'Trabalho'); await page.press('#folderNovoNomeInput', 'Enter'); await page.waitForTimeout(900);
    const fid = await ver(() => (folders.find(f => f.name === 'Trabalho' && !f.del) || {}).id);
    ok(!!fid, 'criou a pasta "Trabalho" pela linha "Nova pasta" da gaveta');
    await foto('pasta-criada');
    await page.tap('#foldersBackdrop', { position: { x: 30, y: 400 } }).catch(() => ver(() => closeFoldersDrawer()));
    await page.waitForTimeout(800);

    // A pasta nova abre vazia e oferece as notas: marca a da Carla e traz.
    const lista = await ver(() => { const tz = document.getElementById('filterEmptyTrazer'); return !!tz && !tz.hidden && tz.querySelectorAll('input').length; });
    ok(lista >= 3, 'a pasta nova entra vazia e oferece ' + lista + ' notas para trazer');
    await foto('pasta-vazia-oferece');
    const v0 = await ver(() => __pt.voos);
    await page.locator('#filterEmptyTrazer label', { hasText: 'Carla' }).first().tap(); await page.waitForTimeout(300);
    await page.getByText('Trazer 1 nota', { exact: true }).tap(); await page.waitForTimeout(1200);
    const tr = await ver(a => ({ voos: __pt.voos - a, pasta: (folders.find(f => f.id === [...document.querySelectorAll('#cardsList > .card')].find(c => /Carla/.test((c.querySelector('textarea') || {}).value || ''))?.dataset.folder) || {}).name, n: document.querySelector('#btnFolders .pt-soltas').hidden ? null : document.querySelector('#btnFolders .pt-soltas').textContent }), v0);
    ok(tr.pasta === 'Trabalho', 'marcou e trouxe: a nota da Carla está em "' + tr.pasta + '"');
    ok(tr.voos === 0, 'a nota caiu na pasta que está aberta na tela: sem voo repetindo o óbvio');
    ok(tr.n === null, 'com 2 notas soltas o número some');
    await foto('trouxe');

    // Volta pra "Tudo" e guarda outra pelo Selecionar: aí sim a nota voa.
    await page.tap('#btnFolders'); await page.waitForTimeout(700);
    if (await ver(() => !!_dicaAtual)) { await page.tap('#dicaBalao .dica-ok'); await page.waitForTimeout(300); }
    await page.locator('#foldersBar .folder-item', { hasText: 'Tudo' }).first().tap(); await page.waitForTimeout(700);
    if (await ver(() => document.getElementById('foldersBar').classList.contains('open'))) { await page.tap('#foldersBackdrop', { position: { x: 30, y: 400 } }).catch(() => ver(() => closeFoldersDrawer())); await page.waitForTimeout(600); }
    ok(await ver(() => activeFolderId === null), 'tocar em "Tudo" volta para todas as notas');
    await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(300);
    const antes = await ver(() => __pt.voos);
    let pelaTela = false;
    try {
      await page.tap('#btnSelModo'); await page.waitForTimeout(500);
      const alvo = await ver(() => [...document.querySelectorAll('#cardsList > .card')].find(c => /Ideia de post/.test((c.querySelector('textarea') || {}).value || ''))?.id);
      // No celular a caixinha some (o mural esconde o cabeçalho): marca tocando na nota.
      await page.locator('#' + alvo).tap({ position: { x: 60, y: 40 } }); await page.waitForTimeout(400);
      ok(await ver(() => selIds.size === 1), 'no modo Selecionar, tocar na nota marca a nota');
      await page.locator('#selBar [data-sa="mais"]').tap(); await page.waitForTimeout(500);
      await foto('menu-mais');
      const mover = page.getByText(/Mover para (uma )?pasta/).first();
      if (await mover.count()) { await mover.tap(); await page.waitForTimeout(500); }
      await page.getByText('Trabalho', { exact: true }).last().tap(); await page.waitForTimeout(150);
      pelaTela = await ver(id => document.getElementById(id).dataset.folder !== '', alvo);
      await foto('voando');
      await page.waitForTimeout(900);
    } catch (e) {
      const quem = await ver(() => { const q = s => { const e = document.querySelector(s); if (!e) return s + ': não existe'; const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.x + Math.min(r.width / 2, 60), r.y + Math.min(r.height / 2, 40)); return s + ': coberto por ' + (t ? (t.id || String(t.className).slice(0, 40)) : 'nada'); }; return [q('#btnSelModo'), q('#selBar [data-sa="mais"]'), selModo, selIds.size]; });
      console.log('        (caminho pela tela falhou: ' + e.message.split('\n')[0] + ' | ' + JSON.stringify(quem) + ')');
      try { await foto('selecionar-travou'); } catch (e2) {}
    }
    if (!atencao(pelaTela, 'o leigo não achou "mover para pasta" sozinho pelo Selecionar → Mais; guardei por código')) {
      await ver(() => { if (typeof selSair === 'function') selSair(); const c = [...document.querySelectorAll('#cardsList > .card')].find(c => /Ideia de post/.test((c.querySelector('textarea') || {}).value || '')); assignCardToFolder(c.id, folders.find(f => f.name === 'Trabalho').id); });
      await page.waitForTimeout(1200);
    }
    const v = await ver(a => ({ voos: __pt.voos - a, engole: __pt.engole }), antes);
    ok(v.voos === 1 && v.engole >= 1, 'em "Tudo", com o painel fechado, a nota guardada voa até o botão e o botão engole (voos: ' + v.voos + ')');
    await foto('guardou');
    const viol = await ver(() => [...new Set(__pt.viol)]);
    ok(!viol.length, 'nunca dois balões, balão em cima de aviso ou botão discordando do painel ' + JSON.stringify(viol));
  } catch (e) {
    ok(false, 'o caminho do leigo quebrou no passo ' + (passo + 1) + ': ' + e.message.split('\n')[0]);
    try { await foto('quebrou'); } catch (e2) {}
  }
  ok(!erros.length, 'leigo: sem erros no console ' + JSON.stringify(erros.slice(0, 3)));
  await ctx.close();
}

async function especialista(browser, base) {
  console.log('\n── ESPECIALISTA, no computador ──');
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 }, locale: 'pt-BR' });
  await ctx.addInitScript(VIGIA);
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(e.message));
  const ver = (f, a) => page.evaluate(f, a);
  const foto = async (nome, clip) => { passo++; await page.screenshot({ path: path.join(FOTOS, 'especialista-' + String(passo).padStart(2, '0') + '-' + nome + '.png'), clip }); };
  const estado = () => ver(() => ({ open: document.getElementById('foldersBar').classList.contains('open'), on: document.getElementById('btnFolders').classList.contains('folders-on'), n: document.querySelector('#btnFolders .pt-soltas').hidden ? null : document.querySelector('#btnFolders .pt-soltas').textContent, voos: __pt.voos, engole: __pt.engole }));
  try {
    await entrarDoZero(page, base);
    // Meses de uso: 3 pastas, 12 notas, todas guardadas.
    await ver(() => {
      const ps = ['Clientes', 'Pessoal', 'Ideias'].map(n => _mapaNovaPasta(null, n));
      for (let i = 0; i < 12; i++) { const id = addCard('Nota antiga ' + (i + 1) + ': ' + ['proposta do cliente', 'lista de compras', 'roteiro de vídeo'][i % 3]); assignCardToFolder(typeof id === 'string' ? id : document.querySelector('#cardsList > .card').id, ps[i % 3].id, true); }
      saveHistory && saveHistory();
    });
    await page.waitForTimeout(1500);
    await page.reload(); await page.waitForTimeout(5000);
    const e0 = await estado();
    const nCards = await ver(() => document.querySelectorAll('#cardsList > .card').length);
    ok(nCards >= 12, 'depois de recarregar, as ' + nCards + ' notas continuam lá');
    ok(e0.voos === 0, 'abrir o app não dispara voo fantasma (' + e0.voos + ')');
    ok(e0.n === null, 'tudo guardado: nenhum número no botão');
    ok(await ver(() => !(_dicaAtual && _dicaAtual.id === 'pastas-botao')), 'no computador o painel já vem aberto, e a mãozinha não aparece pra quem não precisa');
    await foto('dia-a-dia');

    // Teclado: foco visível e 6 Enter seguidos
    await ver(() => document.getElementById('btnFolders').focus());
    await page.keyboard.press('Shift');
    const foco = await ver(() => { const b = document.getElementById('btnFolders'); return b.matches(':focus-visible') && getComputedStyle(b).outlineStyle !== 'none'; });
    ok(foco, 'com teclado, o botão mostra o anel de foco');
    const ini = (await estado()).open;
    await page.keyboard.press('Enter'); await page.waitForTimeout(400);
    const porEnter = (await estado()).open !== ini;
    ok(porEnter, 'Enter no botão Pastas abre/fecha o painel (bug antigo: o atalho de gravar, spaceHotkey, engole Enter e Espaço em qualquer botão)');
    if (porEnter) await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    for (let i = 0; i < 6; i++) { await page.click('#btnFolders'); await page.waitForTimeout(60); }
    await page.waitForTimeout(900);
    const e1 = await estado();
    const presas = await ver(() => ['mola', 'engole'].filter(c => document.getElementById('btnFolders').classList.contains(c)).concat(document.getElementById('foldersBar').classList.contains('pt-entra') ? ['pt-entra'] : []));
    ok(e1.open === ini && e1.open === e1.on && !presas.length, '6 cliques rápidos: termina como começou, botão e painel de acordo, nenhuma animação presa');
    ok(await ver(() => localStorage.getItem('vox_folders_open')) === (e1.open ? '1' : '0'), 'o app lembra se o painel ficou aberto');

    // Com o painel aberto, mover nota entre pastas não faz voo (seria ruído)
    if (!e1.open) await ver(() => toggleFolders());
    await page.waitForTimeout(500);
    const v0 = (await estado()).voos;
    await ver(() => { const c = document.querySelector('#cardsList > .card'); assignCardToFolder(c.id, folders.find(f => f.name === 'Ideias').id, true); });
    await page.waitForTimeout(900);
    ok((await estado()).voos === v0, 'com o painel aberto, mover nota não faz voo');

    // Tira 3 notas de pasta: número aparece, sem voo
    await ver(() => [...document.querySelectorAll('#cardsList > .card')].slice(0, 3).forEach(c => assignCardToFolder(c.id, '', true)));
    await page.waitForTimeout(900);
    const e2 = await estado();
    ok(e2.n === '3' && e2.voos === v0, 'tirar 3 notas de pasta acende o número 3, sem voo ao contrário');
    await foto('tres-soltas', { x: 700, y: 70, width: 666, height: 70 });

    // Painel fechado, guarda as 3 de uma vez: um voo só, não uma revoada
    await ver(() => toggleFolders()); await page.waitForTimeout(600);
    await page.evaluate(() => scrollTo(0, 0));
    const v1 = (await estado()).voos;
    await ver(() => { const p = folders.find(f => f.name === 'Clientes').id; _cfEmLote ? _cfEmLote(() => [...document.querySelectorAll('#cardsList > .card')].filter(c => !c.dataset.folder).forEach(c => assignCardToFolder(c.id, p, true))) : null; });
    await page.waitForTimeout(250); await foto('lote-voando');
    await page.waitForTimeout(1000);
    const e3 = await estado();
    ok(e3.voos - v1 === 1 && e3.n === null, 'guardar 3 de uma vez com o painel fechado: 1 voo só (' + (e3.voos - v1) + ') e o número some');

    // Reduzir movimento
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await ver(() => assignCardToFolder(document.querySelector('#cardsList > .card').id, '', true)); await page.waitForTimeout(500);
    const v2 = (await estado()).voos;
    await ver(() => assignCardToFolder(document.querySelector('#cardsList > .card').id, folders.find(f => f.name === 'Pessoal').id, true));
    await page.waitForTimeout(900);
    await ver(() => toggleFolders()); await page.waitForTimeout(100);
    const rm = await ver(() => ({ trans: getComputedStyle(document.querySelector('#btnFolders .pt-tinta')).transitionDuration, anim: getComputedStyle(document.getElementById('foldersBar')).animationName }));
    ok((await estado()).voos === v2 && /^0s/.test(rm.trans) && rm.anim === 'none', 'com "reduzir movimento": sem voo, sem tinta animada, sem mola ' + JSON.stringify(rm));
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    // Tema escuro
    await ver(() => { document.documentElement.dataset.theme = 'dark'; if (document.getElementById('foldersBar').classList.contains('open')) toggleFolders(); });
    await page.waitForTimeout(400);
    const ce = await ver(CONTRASTE);
    ok(ce >= 4.5, 'no tema escuro o índigo claro se lê: ' + ce + ':1');
    await foto('escuro', { x: 700, y: 70, width: 666, height: 70 });
    await ver(() => { document.documentElement.dataset.theme = 'light'; });

    // Inglês
    await ver(() => { [...document.querySelectorAll('#cardsList > .card')].slice(0, 3).forEach(c => assignCardToFolder(c.id, '', true)); saveHistory(); });
    await page.waitForTimeout(900);
    // setLang recarrega a página: espera ela voltar.
    await ver(() => setLang('en')); await page.waitForTimeout(5000);
    const en = await ver(() => document.getElementById('btnFolders').getAttribute('aria-label'));
    ok(/notes outside a folder/.test(en) && !/Mostrar|pasta/.test(en), 'em inglês o rótulo fala inglês: "' + en + '"');
    await ver(() => setLang('pt')); await page.waitForTimeout(400);

    // Encolhe a janela até celular com o painel aberto
    await ver(() => { if (!document.getElementById('foldersBar').classList.contains('open')) toggleFolders(); });
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(800);
    const pulo = await ver(() => parseFloat(getComputedStyle(document.querySelector('.stats-ctrls')).marginRight));
    atencao(pulo < 20, 'bug antigo (já registrado): no celular com o painel aberto, os botões da barra andam ' + pulo + ' px para a esquerda');
    await foto('janela-estreita');
    const viol = await ver(() => [...new Set(__pt.viol)]);
    ok(!viol.length, 'nunca dois balões, balão em cima de aviso ou botão discordando do painel ' + JSON.stringify(viol));
  } catch (e) {
    ok(false, 'o caminho do especialista quebrou no passo ' + (passo + 1) + ': ' + e.message.split('\n')[0]);
    try { await foto('quebrou'); } catch (e2) {}
  }
  ok(!erros.length, 'especialista: sem erros no console ' + JSON.stringify(erros.slice(0, 3)));
  await ctx.close();
}

(async () => {
  fs.mkdirSync(FOTOS, { recursive: true });
  const srv = await servidor();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  await leigo(browser, base);
  await especialista(browser, base);
  await browser.close(); srv.close();
  console.log('\n' + (falhas ? falhas + ' trava(s)' : 'Nenhuma trava') + ', ' + avisos + ' ponto(s) de atenção. Fotos em ' + FOTOS);
  process.exit(falhas ? 1 : 0);
})();
