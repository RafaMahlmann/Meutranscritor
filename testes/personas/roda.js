// Um personagem usando o Vox do começo ao fim (ver kit.js para rodar).
// node testes/personas/roda.js <personagem> [chromium|webkit]   (SUFIXO=-v2 muda o nome da pasta)
const fs = require('fs');
const path = require('path');
const { abrir } = require('./kit');
const PERSONAS = require('./personas');

const quem = process.argv[2], motor = process.argv[3] || 'chromium';
const P = PERSONAS[quem]; if (!P) { console.log('persona?', Object.keys(PERSONAS).join(' ')); process.exit(2); }
const EN = P.lang === 'en';
const L = (pt, en) => EN ? en : pt;

(async () => {
  const viewport = P.mobile ? { width: 390, height: 844 } : { width: 1280, height: 820 };
  const a = await abrir({ nome: quem + (process.env.SUFIXO || ''), motor, lang: P.lang, viewport, falas: P.falas, mobile: !!P.mobile });
  const { page } = a;
  console.log('== ' + P.titulo + ' [' + motor + ']');
  const passo = async (nome, fn) => {
    try { await fn(); }
    catch (e) { a.nota('TRAVOU em "' + nome + '": ' + String(e.message).split('\n')[0].slice(0, 200)); try { await a.foto('travou-' + nome.replace(/\W+/g, '-')); } catch (e2) {} }
  };
  const visivel = async sel => a.ver(s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.hidden; }, sel);
  // No celular os modos ficam recolhidos num chip ("Consulta v"): abre a gaveta antes.
  const modo = async m => {
    await page.click('#dicaBalao .dica-ok', { timeout: 4000 }).catch(() => {}); await a.semDica();
    // no celular o botão do modo existe, mas fica na gaveta fechada (fora da tela): abre pelo chip
    if (await visivel('#smodeChip') && (await a.ver(() => document.getElementById('smodeChip').getAttribute('aria-expanded'))) !== 'true') { await page.click('#smodeChip'); await a.espera(800); await a.foto('gaveta-modos'); }
    await page.click('.smode-btn[data-m="' + m + '"]'); await a.espera(700);
  };
  const abreGaveta = async () => { if (await visivel('#smodeChip') && (await a.ver(() => document.getElementById('smodeChip').getAttribute('aria-expanded'))) !== 'true') { await page.click('#smodeChip'); await a.espera(700); } };
  const clicaTexto = async (re, escopo) => { const loc = (escopo ? page.locator(escopo) : page).getByText(re).first(); await loc.click({ timeout: 5000 }); };
  const textoDe = sel => a.ver(s => { const e = document.querySelector(s); return e ? e.innerText : null; }, sel);
  const clip = async () => motor === 'chromium' ? page.evaluate(() => navigator.clipboard.readText()).catch(e => 'ERRO ' + e.message) : '(sem leitura de área de transferência no WebKit)';
  const cardsGrav = () => a.ver(() => [...document.querySelectorAll('#cardsList .card')].filter(c => c.dataset.type === 'gravacao').map(c => c.id));
  const ultimosCards = (n) => a.ver(n => [...document.querySelectorAll('#cardsList .card:not(.proc-card)')].slice(0, n).map(c => ({ id: c.id, tipo: c.dataset.type, nome: c.dataset.sessionName || '', tags: c.dataset.tags || '', pasta: c.dataset.folder || '', texto: (c.querySelector('textarea') || {}).value || '' })), n);
  const guarda = (nome, obj) => fs.writeFileSync(path.join(a.pasta, nome), typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));

  // 1. Chegar
  await passo('abrir', async () => {
    await page.goto(a.base + '/index.html'); await a.espera(3500);
    await a.foto('abertura');
    const pular = page.getByText(/^(Pular|Skip)$/).first();
    if (await pular.count()) await pular.click().catch(() => {});
    await a.espera(2500); await a.foto('ceu');
  });

  // 2. Entrar no mundo do jeito de quem usa
  await passo('entrar no mundo', async () => {
    const pos = await a.ver(id => { const p = document.querySelector('.pw[data-id="' + id + '"]'); if (!p) return null; const r = p.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, 'sug:' + P.sid);
    if (pos) {
      await page.mouse.click(pos[0], pos[1]); await a.espera(1500);
      await a.foto('planeta');
      guarda('planeta.txt', await a.texto());
      const jeito = page.locator('.d1a-jeito').first();
      if (await jeito.count()) await jeito.click(); else await a.ver(s => adotarSugestao(s), P.sid);
    } else {
      // não está no céu: vai pelo "+" (Um mundo novo)
      const mais = await a.ver(() => { const e = document.querySelector('.pw[data-id="__novo__"]'); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
      if (mais) { await page.mouse.click(mais[0], mais[1]); await a.espera(1500); await a.foto('mais-mundo'); guarda('bancada.txt', await a.texto()); }
      a.nota('"' + P.sid + '" não está no céu de quem chega; precisa achar pelo "+" (Um mundo novo)');
      await page.click('.dchip[data-sid="' + P.sid + '"]'); await a.espera(600);
      await a.foto('bancada-escolheu');
      await page.click('#btCriar');
    }
    await page.waitForLoadState('load'); await a.espera(2000);
    await page.waitForFunction(() => typeof _mundosLista === 'function' && document.readyState === 'complete', null, { timeout: 20000 });
    await a.espera(4000);
    // a primeira entrada pode reabrir o céu perguntando "como você vai usar"
    if (await a.ver(() => !!document.querySelector('.d1a-jeito') && [...document.querySelectorAll('.d1a-jeito')].some(b => b.getBoundingClientRect().width > 0))) {
      await a.foto('ceu-de-novo');
      const ficha = await a.ver(() => (document.querySelector('.d1a-jeito')?.closest('div[class]')?.parentElement?.innerText || '').slice(0, 400));
      a.nota('depois de criar o mundo, o céu abriu DE NOVO perguntando como vai usar: ' + ficha.split('\n').filter(Boolean).join(' | '));
      await page.locator('.d1a-jeito').first().click(); await page.waitForLoadState('load'); await a.espera(5000);
    }
    // se a galáxia reabrir, fecha
    if (await visivel('#gx.on, .gx.on')) { await page.keyboard.press('Escape'); await a.espera(800); }
    await a.foto('mundo');
    const m = await a.ver(() => ({ mundo: _mundosLista().find(x => x.id === _mundoAtivo), modo: sessionMode, versao: VOX_VERSION, painel: !document.getElementById('btnPainel')?.hidden }));
    a.nota('mundo: ' + JSON.stringify(m));
    guarda('mundo.txt', await a.texto());
  });
  await a.semDica();

  // 3. Dizer o ofício (só Consultas)
  if (P.sid === 'consultas') await passo('escolher ofício', async () => {
    await a.semDica(); await modo('consulta'); await a.espera(300);
    if (!(await visivel('.of-modal'))) { await a.ver(() => _oficioPerguntar()); await a.espera(600); a.nota('a pergunta do ofício não apareceu sozinha ao tocar em Consulta; abri pelo ⋯ › trocar'); }
    await a.foto('oficio');
    const ofs = await a.ver(() => [...document.querySelectorAll('.of-az')].map(b => b.innerText.replace(/\n/g, ' — ')));
    a.nota('ofícios oferecidos: ' + ofs.join(' | '));
    const alvo = P.oficio || 'saude';
    if (!P.oficio) a.nota('procurou Fisioterapia na lista e não achou; escolheu Saúde');
    await page.click('.of-az[data-of="' + alvo + '"]'); await a.espera(800);
    await a.semDica();
  });

  // 4. Ajustes antes de gravar (⋯)
  if (P.sid === 'consultas' || P.sid === 'entrevistas') await passo('ajustes ⋯', async () => {
    if (P.sid === 'entrevistas') { await modo('entrevista'); await a.semDica(); }
    if (P.mobile || !(await visivel('#csMais'))) await abreGaveta();
    if (!(await visivel('#csMais'))) { a.nota('o botão ⋯ de ajustes não aparece neste modo'); return; }
    await page.click('#csMais'); await a.espera(600);
    await a.foto('ajustes');
    guarda('ajustes.txt', (await textoDe('#csPop')) || '');
    const pb = page.locator('#csPop .cs-seg button', { hasText: new RegExp('^' + (P.pessoas === 4 ? '4' : String(P.pessoas || 2))) }).first();
    if (await pb.count()) await pb.click();
    if (P.palavras) { await page.fill('#csPalavras', P.palavras); await page.dispatchEvent('#csPalavras', 'change'); }
    if (P.roteiro && await visivel('#enRoteiro')) { await page.fill('#enRoteiro', P.roteiro); await page.dispatchEvent('#enRoteiro', 'change'); }
    const aviso = page.locator('#csPop .cs-link', { hasText: /avisar|let .*know|notify|tell/i }).first();
    if (await aviso.count()) { await aviso.click(); await a.espera(500); a.nota('frase para avisar quem é atendido: ' + (await clip())); }
    else a.nota('não há frase pronta de aviso/consentimento neste ⋯');
    await page.keyboard.press('Escape'); await a.espera(400);
    if (P.mobile && (await a.ver(() => document.getElementById('smodeChip')?.getAttribute('aria-expanded'))) === 'true') { await page.click('#smodeChip').catch(() => {}); await a.espera(500); }
  });

  // 5. Gravar
  const grava = async (rotulo) => {
    await a.semDica();
    if (await visivel('#csPro')) { a.nota('antes de gravar apareceu o convite do Pro: ' + (await textoDe('#csPro')).replace(/\n/g, ' ')); await a.foto('convite-pro'); await page.click('#csPro .cs-pro-nao').catch(() => {}); }
    const antes = (await cardsGrav()).length;
    await page.click('#btnRec'); await a.espera(2500);
    const enc = await visivel('#encOv');
    if (enc) {
      await a.foto(rotulo + '-tela-gravando');
      guarda(rotulo + '-tela-gravando.txt', (await textoDe('#encOv')) || '');
      if (await visivel('#encMarcaBtn')) { await page.click('#encMarcaBtn'); await a.espera(500); await a.foto(rotulo + '-marcou'); }
      await a.espera(2500);
      await page.click('.eo-parar');
    } else {
      await a.foto(rotulo + '-gravando');
      await a.espera(3000);
      if (await visivel('#btnStop')) await page.click('#btnStop'); else await a.ver(() => stopRec());
    }
    await page.waitForFunction(n => [...document.querySelectorAll('#cardsList .card')].filter(c => c.dataset.type === 'gravacao').length > n, antes, { timeout: 45000 }).catch(() => a.nota('a gravação "' + rotulo + '" não virou card em 45s'));
    await a.espera(5000);
    await a.foto(rotulo + '-card');
    const ids = await cardsGrav();
    return ids[0];
  };
  let cardId = null;
  await passo('gravar o atendimento', async () => {
    cardId = await grava('gravacao');
    const c = await a.ver(id => { const c = document.getElementById(id); if (!c) return null; return { modo: c.dataset.mode, vozes: c.dataset.speakers, diar: c.dataset.diarized, nome: c.dataset.sessionName, dono: !!c.querySelector('.cs-dono'), texto: (c.querySelector('textarea') || {}).value, visivel: c.innerText.slice(0, 3000) }; }, cardId);
    guarda('card-gravacao.json', c);
    a.nota('card gravado: modo=' + (c && c.modo) + ' vozes=' + (c && c.vozes) + ' pergunta de quem é=' + (c && c.dono));
  });

  // 6. De quem é
  if (P.pessoa && cardId) await passo('dizer de quem é', async () => {
    await a.semDica();
    const tem = await a.ver(id => !!document.querySelector('#' + id + ' .cs-dono'), cardId);
    if (!tem) { a.nota('o card não perguntou de quem é a sessão'); return; }
    await page.fill('#' + cardId + ' .cs-dono-n input', P.pessoa); await page.press('#' + cardId + ' .cs-dono-n input', 'Enter');
    await a.espera(1000); await a.semDica();
    a.nota('guardado como: ' + JSON.stringify(await a.ver(id => { const c = document.getElementById(id); return { sessao: c.dataset.sessionName, pasta: (folders.find(f => f.id === c.dataset.folder) || {}).name }; }, cardId)));
    await a.foto('de-quem-e');
  });

  // 7. Fechar atendimento (Consultas) / lentes do tipo (os outros)
  if (cardId && P.sid === 'consultas') await passo('fechar atendimento', async () => {
    await a.semDica();
    await page.click('#' + cardId + ' .cs-fechar'); await a.espera(800);
    await a.foto('fechar-atendimento');
    guarda('fechar-atendimento.txt', (await textoDe('.fa-modal')) || '');
    if (P.modelo) {
      await page.locator('.fa-modal .cs-link').first().click(); await a.espera(600);
      await page.fill('#mnNome', P.modelo.nome);
      await a.ver(() => document.querySelectorAll('#mnTops .mn-top.on').forEach(b => b.click()));
      for (const tp of P.modelo.topicos) { await page.fill('#mnTopNovo', tp); await page.press('#mnTopNovo', 'Enter'); }
      await a.foto('meu-modelo');
      await page.locator('.fa-modal .conv-p').click(); await a.espera(900);
      await a.foto('fechar-com-meu-modelo');
      guarda('fechar-atendimento-2.txt', (await textoDe('.fa-modal')) || '');
      const marcou = await a.ver(() => { const i = [...document.querySelectorAll('.fa-lista label')].find(l => /Evolução fisio/.test(l.innerText)); if (i) { const cb = i.querySelector('input'); if (!cb.checked) cb.click(); return true; } return false; });
      a.nota('o modelo próprio aparece na lista do Fechar atendimento: ' + marcou);
    }
    const n0 = a.ia.length;
    await page.locator('.fa-modal .conv-p').click();
    await page.waitForFunction(n => true, n0); await a.espera(12000);
    await a.foto('depois-de-gerar');
    a.nota('pedidos à IA no Fechar atendimento: ' + (a.ia.length - n0));
    guarda('notas-geradas.json', await ultimosCards(6));
  });
  if (cardId && P.sid !== 'consultas') await passo('lentes do mundo', async () => {
    await a.semDica();
    await a.ver(id => toggleLensMenu(id), cardId); await a.espera(900);
    await a.foto('menu-lentes');
    guarda('menu-lentes.txt', await a.texto());
    const cats = await a.ver(() => Object.keys(LENS_CATS).map(k => k + ':' + LENS_CATS[k].title));
    const tipo = await a.ver(() => Object.keys(LENSES).filter(k => /^(en_|of_|di_|mod_)/.test(k)));
    a.nota('categorias de lente: ' + cats.join(', ') + ' · lentes próprias do mundo: ' + (tipo.join(', ') || 'nenhuma'));
    await page.keyboard.press('Escape'); await a.espera(300);
    const roda = { entrevistas: ['en_aspas', 'en_roteiro'], reunioes: ['decisoes'], aulas: ['flashcards', 'cornell'] }[P.sid] || ['resumo'];
    for (const k of roda) {
      const ok = await a.ver(k => !!LENSES[k], k);
      if (!ok) { a.nota('lente ' + k + ' não existe neste mundo'); continue; }
      await a.ver(([id, k]) => runLens(id, k), [cardId, k]); await a.espera(5000);
    }
    await a.foto('depois-das-lentes');
    guarda('notas-geradas.json', await ultimosCards(5));
  });

  // 8. O essencial
  if (cardId) await passo('o essencial', async () => {
    await a.semDica();
    const tem = await a.ver(id => !!document.querySelector('#convbar-' + id + ' .conversa-btn.primary'), cardId);
    if (!tem) { a.nota('o card não tem a barra do encontro ("O essencial")'); return; }
    await a.ver(id => _encEssencial(id), cardId); await a.espera(4000);
    await a.foto('o-essencial');
    guarda('o-essencial.txt', (await textoDe('.es-modal')) || '(sem modal)');
    await page.keyboard.press('Escape'); await a.ver(() => typeof closeTxOverlay === 'function' && closeTxOverlay()); await a.espera(400);
  });

  // 9. Copiar para colar no prontuário / no e-mail
  await passo('copiar', async () => {
    const cs = await ultimosCards(4);
    const alvo = cs.find(c => c.tipo !== 'gravacao') || cs[0];
    if (!alvo) return;
    await a.ver(id => copyCard(id), alvo.id); await a.espera(600);
    const c = await clip();
    guarda('copiado.txt', c);
    a.nota('copiar a nota "' + alvo.nome + '": tem ** de markdown=' + /\*\*/.test(c) + ' · tem #hashtag no fim=' + /(^|\s)#[\wÀ-ú-]+\s*$/.test(c.trim()));
  });

  // 10. Ditado depois da sessão (psicóloga)
  if (P.ditado) await passo('ditado pós-sessão', async () => {
    await modo('livre'); await a.semDica();
    a.estado.falas = [['A', P.ditado]];
    const id = await grava('ditado');
    const c = await a.ver(id => { const c = document.getElementById(id); return c ? { modo: c.dataset.mode, pasta: (folders.find(f => f.id === c.dataset.folder) || {}).name || '(sem pessoa)', dono: !!c.querySelector('.cs-dono'), nome: c.dataset.sessionName } : null; }, id);
    a.nota('ditado depois da sessão (modo Livre): ' + JSON.stringify(c));
  });

  // 11. Painel
  if (P.sid === 'consultas') await passo('painel', async () => {
    await a.semDica();
    await page.click('#btnPainel'); await a.espera(1000);
    if (await visivel('.mg-modal')) {
      await a.foto('guia-painel');
      guarda('guia-painel.txt', (await textoDe('.mg-modal')) || '');
      for (let i = 0; i < 4 && await visivel('.mg-modal'); i++) {
        const b = page.locator('.mg-modal button').filter({ hasText: /Continuar|Continue|Agora não|Not now|Pular|Skip|Fechar|Close/ }).first();
        if (!(await b.count())) break; await b.click(); await a.espera(600);
      }
    }
    await a.espera(800); await a.semDica();
    await a.foto('painel');
    guarda('painel.txt', (await textoDe('#painelOv')) || '');
  });

  // 12. Perguntar ao Vox
  if (P.sid === 'consultas') await passo('perguntar ao vox', async () => {
    const respostas = [];
    for (const q of P.perguntas || []) {
      await a.semDica();
      if (!(await visivel('.pn-perg-bt'))) { await page.click('#btnPainel').catch(() => {}); await a.espera(900); await a.semDica(); }
      if (!(await visivel('.pn-perg-bt'))) { a.nota('sem botão "Perguntar ao Vox" à vista'); break; }
      await page.click('.pn-perg-bt'); await page.fill('#pgInput', q); await page.press('#pgInput', 'Enter'); await a.espera(2500);
      const r = (await textoDe('.pg-resp')) || (await textoDe('#pgOv')) || '';
      respostas.push({ pergunta: q, resposta: r });
      await a.foto('pergunta');
      await page.keyboard.press('Escape'); await a.espera(500);
    }
    guarda('perguntar-ao-vox.json', respostas);
    await page.keyboard.press('Escape'); await a.ver(() => { try { fecharPainel && fecharPainel(); } catch (e) {} }); await a.espera(500);
  });

  // 13. Exportar
  await passo('exportar', async () => {
    await a.semDica();
    if (await visivel('#painelOv.on')) { await a.ver(() => { try { fecharPainel(); } catch (e) { document.getElementById('painelOv').classList.remove('on'); } }); await a.espera(500); }
    if (!(await visivel('#btnExport'))) { a.nota('botão Exportar não está à vista nesta tela'); return; }
    await page.click('#btnExport'); await a.espera(800);
    await a.foto('exportar');
    guarda('exportar.txt', await a.texto());
    await page.keyboard.press('Escape');
  });

  // 14. Final: texto da tela, o que a IA recebeu, para onde saiu
  await passo('final', async () => {
    await a.foto('final');
    guarda('tela-final.txt', await a.texto());
  });
  a.nota('chamadas à IA de texto: ' + a.ia.length + ' · endereços de fora: ' + [...new Set(a.saiu.map(s => s.replace(/^\w+ /, '').split('/').slice(0, 3).join('/')))].join(', '));
  a.nota('erros de console: ' + a.erros.length);
  await a.fechar();
  console.log('pasta: ' + a.pasta);
})();
