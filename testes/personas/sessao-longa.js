// A psicóloga, plano grátis, 2ª consulta com vozes do mês, sessão de 50 min (aqui: arquivo de 21 min).
// Pergunta: o "Fechar atendimento" enxerga o fim da sessão, que vira outra nota?
const fs = require('fs');
const path = require('path');
const os = require('os');
const { abrir } = require('./kit');

function wavSilencio(arq, seg, sr = 8000) {
  const n = seg * sr, dados = n * 2, buf = Buffer.alloc(44 + dados);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dados, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(dados, 40);
  for (let i = 0; i < n; i += 997) buf.writeInt16LE(((i * 7) % 200) - 100, 44 + i * 2); // um chiado leve, não silêncio puro
  fs.writeFileSync(arq, buf);
}

(async () => {
  const motor = process.argv[2] || 'chromium';
  const wav = path.join(os.tmpdir(), 'vox-sessao-21min.wav');
  if (!fs.existsSync(wav)) wavSilencio(wav, 21 * 60);
  const inicio = [['A', 'Oi Marina, como foi a semana?'], ['B', 'Difícil. Dormi mal de novo.'], ['A', 'Vamos olhar isso com calma.']];
  const a = await abrir({ nome: 'sessao-longa', motor, lang: 'pt', falas: inicio });
  const { page } = a;
  a.estado.restoTexto = 'COMBINADOS DO FIM DA SESSÃO: manter o registro de pensamentos, adiar a preocupação para as sete da noite, ligar para o CVV 188 se a ideia de sumir voltar. Próxima sessão quinta.';
  // a transcrição do "resto" (sem vozes) passa pelo Groq: devolve o fim da sessão
  await page.route(/audio\/transcriptions/, r => r.fulfill({ json: { text: a.estado.restoTexto } }));
  try {
    await page.goto(a.base + '/index.html'); await a.espera(3500);
    const pular = page.getByText(/^(Pular|Skip)$/).first(); if (await pular.count()) await pular.click().catch(() => {});
    await a.espera(2500);
    const pos = await a.ver(() => { const p = document.querySelector('.pw[data-id="sug:consultas"]'); const r = p.getBoundingClientRect(); return [r.x, r.y]; });
    await page.mouse.click(pos[0], pos[1]); await a.espera(1500);
    await page.locator('.d1a-jeito').first().click();
    await page.waitForLoadState('load'); await a.espera(6000);
    await a.semDica();
    // Já gastou a diarização inteira do mês; sem Pro.
    await a.ver(() => { localStorage.setItem('vox_diar_mes', JSON.stringify({ mes: _mesLocal(), n: 1 })); _painelGravar({ oficio: 'psico', perguntado: true }); _modelosRegistrar(); });
    a.nota('Pro ativo? ' + await a.ver(() => voxPro()));
    await page.setInputFiles('#fInput', wav); await a.espera(1500); await a.foto('confirmar-arquivo'); await page.getByRole('button', { name: /Transcrever|Transcribe/ }).first().click();
    await page.waitForFunction(() => document.querySelectorAll('#cardsList .card:not(.proc-card)').length >= 3, null, { timeout: 180000 }).catch(() => a.nota('não surgiram as duas notas em 3 min'));
    await a.espera(8000);
    await a.foto('duas-notas');
    const cards = await a.ver(() => [...document.querySelectorAll('#cardsList .card:not(.proc-card)')].map(c => ({ id: c.id, tipo: c.dataset.type, modo: c.dataset.mode, diar: c.dataset.diarized, nome: c.dataset.sessionName || '', pasta: c.dataset.folder || '', texto: ((c.querySelector('textarea') || {}).value || '').slice(0, 220) })));
    fs.writeFileSync(path.join(a.pasta, 'cards.json'), JSON.stringify(cards, null, 2));
    cards.forEach(c => a.nota('nota: diar=' + c.diar + ' nome="' + c.nome + '" pasta=' + (c.pasta || '-') + ' · ' + c.texto.replace(/\n/g, ' ').slice(0, 120)));
    const comVozes = cards.find(c => c.diar === 'true');
    if (comVozes) {
      // diz de quem é, como a psicóloga faria
      if (await a.ver(id => !!document.querySelector('#' + id + ' .cs-dono'), comVozes.id)) { await page.fill('#' + comVozes.id + ' .cs-dono-n input', 'Marina S.'); await page.press('#' + comVozes.id + ' .cs-dono-n input', 'Enter'); await a.espera(800); }
      await a.semDica();
      const depois = await a.ver(() => [...document.querySelectorAll('#cardsList .card:not(.proc-card)')].map(c => ({ diar: c.dataset.diarized, nome: c.dataset.sessionName || '', pasta: (folders.find(f => f.id === c.dataset.folder) || {}).name || '(sem pessoa)' })));
      a.nota('depois de dizer de quem é: ' + JSON.stringify(depois));
      const n0 = a.ia.length;
      await page.click('#' + comVozes.id + ' .cs-fechar'); await a.espera(700);
      await page.locator('.fa-modal .conv-p').click(); await a.espera(12000);
      const pedidos = a.ia.slice(n0).map(r => r.messages.map(m => m.content).join('\n'));
      const viuFim = pedidos.some(p => /COMBINADOS DO FIM/.test(p));
      a.nota('Fechar atendimento mandou ' + pedidos.length + ' pedidos à IA; algum deles contém o fim da sessão? ' + viuFim);
      await a.foto('depois-de-fechar');
    }
  } catch (e) { a.nota('TRAVOU: ' + e.message.split('\n')[0]); await a.foto('travou'); }
  a.nota('erros: ' + a.erros.slice(0, 5).join(' | '));
  await a.fechar();
  // Trava se o fim da sessão continuar de fora da nota (ou sem dono).
  const problema = a.notas.some(n => /fim da sessão\? false|não surgiram|TRAVOU/.test(n));
  console.log(problema ? 'TRAVOU: o Fechar atendimento não enxerga o fim da sessão longa.' : 'Sessão longa inteira na nota.');
  process.exit(problema ? 1 : 0);
})();
