// Ponte do Vox — Cloudflare Worker.
//
// Por que ela existe: o Vox não tem servidor, e a chave de cada pessoa vai
// direto do aparelho pro serviço de IA. A ÚNICA exceção são as primeiras
// transcrições "por nossa conta", feitas com a chave do Vox. Essa chave não
// pode morar no app (o código é público), então mora aqui, como segredo.
//
// O que ela faz: recebe o áudio, pede a transcrição ao Groq, devolve o texto
// e esquece. Não guarda áudio, não guarda texto, não registra conteúdo em log.
// Só conta números: quantas cortesias cada aparelho usou (aparelho = código
// sorteado no próprio aparelho), minutos gastos por dia, e se o aparelho
// depois conectou a própria chave.
//
// MEDIÇÃO OPCIONAL (08/10/2026): só de quem disse "sim" no app. Recebe nomes
// de eventos de uma lista fechada ("gravou", "usou a lente resumo"…), nunca
// texto, áudio, nome ou e-mail. Ver a seção "Medição opcional" mais abaixo.
//
// Por que a conta não chega: a chave é de uma conta GRÁTIS do Groq, sem
// cartão — quando o limite do dia acaba, o Groq recusa, não cobra. E esta
// ponte para antes disso, no teto que o Rafa escolhe no painel.

const GROQ_URL_PADRAO = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODELO = 'whisper-large-v3-turbo';

// Maior arquivo aceito. Folga pra ~3 min no formato mais pesado que o app
// grava (AAC do Safari). Quem manda arquivo maior não é o app.
const MAX_BYTES = 8 * 1024 * 1024;

// LENTES por nossa conta (07/10/2026): o presente passou a incluir algumas
// lentes, pra pessoa sentir o "o Vox pensa com você" antes de ter chave.
// Mesmo modelo que o app usa com a chave do Groq.
const GROQ_CHAT_PADRAO = 'https://api.groq.com/openai/v1/chat/completions';
const MODELO_TEXTO = 'openai/gpt-oss-120b';
// Texto que cabe numa lente por nossa conta (~3,5 mil tokens). Nota maior que
// isso precisa da chave da pessoa. Mantém cada pedido abaixo do limite por
// minuto do Groq grátis (8 mil tokens, somando entrada e resposta).
const LENTE_MAX_CHARS = 14000;
const LENTE_MAX_TOKENS = 3000;

// O Groq cobra (e conta no limite) no mínimo 10 segundos por pedido.
const SEGUNDOS_MINIMOS = 10;

// Valores de fábrica. O painel grava por cima, na tabela `ajustes`.
const PADROES = {
  ligada: 1,             // liga e desliga a cortesia inteira
  por_aparelho: 5,       // transcrições por nossa conta, por aparelho (era 3 até 07/10/2026)
  max_segundos: 180,     // duração máxima de cada uma (era 120)
  teto_minutos_dia: 400, // soma de todo mundo por dia (o Groq grátis dá 480)
  por_ip_dia: 10,        // pedidos por endereço de internet por dia
  lentes_por_aparelho: 5, // lentes por nossa conta, por aparelho
  lentes_dia: 40,        // lentes por nossa conta por dia, todo mundo somado
  pro_dias: 14,          // dias de Pro de presente pra quem começa (0 = promoção desligada)
};
const LIMITES = {
  ligada: [0, 1],
  por_aparelho: [0, 20],
  max_segundos: [30, 600],
  teto_minutos_dia: [0, 2000],
  por_ip_dia: [1, 200],
  lentes_por_aparelho: [0, 30],
  lentes_dia: [0, 3000],
  pro_dias: [0, 60],
};

const CAMPOS_DIA = new Set([
  'segundos', 'transcricoes', 'aparelhos_novos', 'chegaram_ao_fim', 'formaram',
  'recusa_teto', 'recusa_esgotada', 'recusa_ip', 'recusa_grande', 'erros',
]);

const RE_APARELHO = /^[A-Za-z0-9_-]{16,64}$/;
const RE_IDIOMA = /^[a-z]{2}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origem = request.headers.get('Origin') || '';
    try {
      if (url.pathname === '/v1/landing/evento') {
        if (!origemLanding(origem)) return new Response(null, { status: 403 });
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origem) });
        if (request.method !== 'POST') return new Response(null, { status: 405 });
        return await landingEvento(request, env, origem);
      }
      if (url.pathname.startsWith('/v1/')) {
        if (!origemPermitida(origem, env)) return json({ ok: false, motivo: 'origem' }, 403);
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origem) });
        if (request.method !== 'POST') return json({ ok: false, motivo: 'pedido_invalido' }, 405, origem);
        if (url.pathname === '/v1/cortesia/estado') return await estado(request, env, origem);
        if (url.pathname === '/v1/cortesia/transcrever') return await transcrever(request, env, origem);
        if (url.pathname === '/v1/cortesia/formou') return await formou(request, env, origem);
        if (url.pathname === '/v1/cortesia/lente') return await lente(request, env, origem);
        if (url.pathname === '/v1/uso/eventos') return await usoEventos(request, env, origem);
        if (url.pathname === '/v1/uso/apagar') return await usoApagar(request, env, origem);
        // (A licença do Freemius NÃO passa por aqui: o app fala direto com a API deles.)
        return json({ ok: false, motivo: 'pedido_invalido' }, 404, origem);
      }
      if (url.pathname === '/painel' || url.pathname === '/painel/ajustes') {
        return await painel(request, env, url);
      }
      if (url.pathname === '/') {
        return new Response('Ponte do Vox. Código aberto em github.com/RafaMahlmann/Meutranscritor/tree/main/ponte\n', {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
      return new Response('Não encontrado\n', { status: 404 });
    } catch (e) {
      // Nunca devolve o erro cru: ele pode carregar pedaço do pedido.
      return json({ ok: false, motivo: 'falha' }, 500, origemPermitida(origem, env) ? origem : '');
    }
  },
};

// ── Cortesia ────────────────────────────────────────────────────────────────

async function estado(request, env, origem) {
  const corpo = await request.json().catch(() => ({}));
  const aparelho = String(corpo.aparelho || '');
  if (!RE_APARELHO.test(aparelho)) return json({ ok: false, motivo: 'pedido_invalido' }, 400, origem);
  const aj = await lerAjustes(env);
  // pro_dias vai sempre (mesmo com a cortesia desligada): o presente de Pro
  // é outra promoção, e o app só começa a contar na primeira gravação.
  const base = { ok: true, max_segundos: aj.max_segundos, pro_dias: aj.pro_dias, lentes_restantes: 0 };
  if (aj.ligada && env.GROQ_KEY && aj.lentes_por_aparelho > 0) {
    await garantirTabelasLentes(env);
    const l = await env.DB.prepare('SELECT cota, usadas FROM lentes WHERE id = ?').bind(aparelho).first();
    base.lentes_restantes = Math.max(0, Math.max(l?.cota || 0, aj.lentes_por_aparelho) - (l?.usadas || 0));
  }
  if (!aj.ligada || !env.GROQ_KEY) return json({ ...base, disponivel: false, restantes: 0, motivo: 'desligada' }, 200, origem);
  const dia = hoje();
  const d = await env.DB.prepare('SELECT segundos FROM dias WHERE dia = ?').bind(dia).first();
  const row = await env.DB.prepare('SELECT cota, usadas FROM aparelhos WHERE id = ?').bind(aparelho).first();
  const restantes = row ? Math.max(0, Math.max(row.cota, aj.por_aparelho) - row.usadas) : aj.por_aparelho;
  if (restantes <= 0) return json({ ...base, disponivel: false, restantes: 0, motivo: 'esgotada' }, 200, origem);
  if ((d?.segundos || 0) >= aj.teto_minutos_dia * 60) return json({ ...base, disponivel: false, restantes, motivo: 'teto_dia' }, 200, origem);
  return json({ ...base, disponivel: true, restantes, motivo: '' }, 200, origem);
}

async function transcrever(request, env, origem) {
  const aj = await lerAjustes(env);
  const dia = hoje();
  const recusar = async (motivo, status, campo, extra = {}) => {
    if (campo) await somarDia(env, dia, { [campo]: 1 })?.run();
    return json({ ok: false, motivo, max_segundos: aj.max_segundos, ...extra }, status, origem);
  };

  if (!aj.ligada || !env.GROQ_KEY) return recusar('desligada', 503);

  // Recusa arquivo grande antes de ler o corpo inteiro.
  const tamanho = Number(request.headers.get('Content-Length') || 0);
  if (tamanho > MAX_BYTES + 64 * 1024) return recusar('grande', 413, 'recusa_grande');

  const form = await request.formData().catch(() => null);
  const audio = form?.get('audio');
  const aparelho = String(form?.get('aparelho') || '');
  const idioma = String(form?.get('idioma') || '').toLowerCase();
  if (!form || !audio || typeof audio === 'string' || !RE_APARELHO.test(aparelho)) return recusar('pedido_invalido', 400);
  if (audio.size > MAX_BYTES) return recusar('grande', 413, 'recusa_grande');

  // Trava 1 — o teto do dia, somando todo mundo. É ela que protege a conta.
  const d = await env.DB.prepare('SELECT segundos FROM dias WHERE dia = ?').bind(dia).first();
  if ((d?.segundos || 0) >= aj.teto_minutos_dia * 60) return recusar('teto_dia', 429, 'recusa_teto');

  // Trava 2 — por endereço de internet (embaralhado, só vale pro dia de hoje).
  const ip = request.headers.get('CF-Connecting-IP') || 'sem-ip';
  const hashIp = await sha256hex(`${ip}|${dia}|${env.SAL_IP || 'vox'}`);
  const ipRow = await env.DB.prepare('SELECT usos FROM ips WHERE dia = ? AND hash = ?').bind(dia, hashIp).first();
  if ((ipRow?.usos || 0) >= aj.por_ip_dia) return recusar('limite_ip', 429, 'recusa_ip');

  // Trava 3 — quantas cada aparelho ganhou. Aumentar vale pra todos,
  // diminuir só pra quem ainda não começou (a `cota` guardada é o máximo já visto).
  const row = await env.DB.prepare('SELECT cota, usadas FROM aparelhos WHERE id = ?').bind(aparelho).first();
  const cota = Math.max(row?.cota || 0, aj.por_aparelho);
  const usadas = row?.usadas || 0;
  if (usadas >= cota) return recusar('esgotada', 402, 'recusa_esgotada', { restantes: 0 });

  const fd = new FormData();
  fd.append('file', audio, audio.name || 'gravacao.webm');
  fd.append('model', MODELO);
  fd.append('response_format', 'verbose_json');
  if (RE_IDIOMA.test(idioma)) fd.append('language', idioma);
  const r = await fetch(env.GROQ_URL || GROQ_URL_PADRAO, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GROQ_KEY}` },
    body: fd,
  });
  if (!r.ok) {
    // 429 do Groq = o limite dele acabou antes do nosso (ex.: o teto por hora).
    // Não gasta a cortesia da pessoa: ela não recebeu nada.
    await somarDia(env, dia, { erros: 1 })?.run();
    return json({ ok: false, motivo: r.status === 429 ? 'ocupado' : 'falha', max_segundos: aj.max_segundos }, r.status === 429 ? 429 : 502, origem);
  }
  const res = await r.json();
  const texto = String(res.text || '').trim();
  const duracao = Number(res.duration) || 0;
  const segundos = Math.max(SEGUNDOS_MINIMOS, Math.ceil(duracao));
  const novas = usadas + 1;
  const restantes = Math.max(0, cota - novas);

  // Áudio bem maior que o permitido não veio do app. Fecha esse endereço pelo resto do dia.
  const abuso = duracao > aj.max_segundos + 20;

  await env.DB.batch([
    env.DB.prepare(`INSERT INTO aparelhos (id, cota, usadas, criado, ultimo) VALUES (?, ?, 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET usadas = usadas + 1, ultimo = excluded.ultimo, cota = MAX(cota, excluded.cota)`)
      .bind(aparelho, cota, dia, dia),
    somarDia(env, dia, {
      segundos,
      transcricoes: 1,
      aparelhos_novos: row ? 0 : 1,
      chegaram_ao_fim: restantes === 0 ? 1 : 0,
    }),
    env.DB.prepare(`INSERT INTO ips (dia, hash, usos) VALUES (?, ?, ?)
      ON CONFLICT(dia, hash) DO UPDATE SET usos = ${abuso ? 'excluded.usos' : 'usos + 1'}`)
      .bind(dia, hashIp, abuso ? aj.por_ip_dia : 1),
    env.DB.prepare('DELETE FROM ips WHERE dia < ?').bind(dia),
  ]);

  return json({ ok: true, texto, restantes, ultima: restantes === 0, max_segundos: aj.max_segundos }, 200, origem);
}

// O único sinal que o app manda depois da cortesia: "este aparelho conectou
// a própria chave". Sem conteúdo, uma vez só. É o que diz se a cortesia converte.
async function formou(request, env, origem) {
  const corpo = await request.json().catch(() => ({}));
  const aparelho = String(corpo.aparelho || '');
  if (!RE_APARELHO.test(aparelho)) return json({ ok: false, motivo: 'pedido_invalido' }, 400, origem);
  const dia = hoje();
  const r = await env.DB.prepare('UPDATE aparelhos SET formou = 1, formou_em = ? WHERE id = ? AND formou = 0')
    .bind(dia, aparelho).run();
  if (r.meta?.changes > 0) await somarDia(env, dia, { formaram: 1 })?.run();
  return json({ ok: true }, 200, origem);
}

// ── Lentes por nossa conta (07/10/2026) ────────────────────────────────────
// O app manda as mensagens da lente (instrução + o texto da nota); a ponte
// pede ao Groq com a chave do Vox, devolve a resposta e esquece. Não guarda
// o texto, não registra conteúdo em log. Conta só: quantas lentes cada
// aparelho usou e quantas por dia, somando todo mundo.
// A resposta imita o formato do OpenAI ({choices:[{message:{content}}]}), pra
// o app tratar igual a qualquer provedor.
let _tabelasLentesOk = false;
async function garantirTabelasLentes(env) {
  if (_tabelasLentesOk) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS lentes (id TEXT PRIMARY KEY, cota INTEGER NOT NULL,
      usadas INTEGER NOT NULL DEFAULT 0, criado TEXT NOT NULL, ultimo TEXT)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS lentes_dias (dia TEXT PRIMARY KEY, usos INTEGER NOT NULL DEFAULT 0,
      aparelhos INTEGER NOT NULL DEFAULT 0, recusas INTEGER NOT NULL DEFAULT 0, erros INTEGER NOT NULL DEFAULT 0)`),
  ]);
  _tabelasLentesOk = true;
}
function somarLentesDia(env, dia, c) {
  return env.DB.prepare(`INSERT INTO lentes_dias (dia, usos, aparelhos, recusas, erros) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(dia) DO UPDATE SET usos = usos + excluded.usos, aparelhos = aparelhos + excluded.aparelhos,
      recusas = recusas + excluded.recusas, erros = erros + excluded.erros`)
    .bind(dia, c.usos || 0, c.aparelhos || 0, c.recusas || 0, c.erros || 0);
}

async function lente(request, env, origem) {
  const aj = await lerAjustes(env);
  const dia = hoje();
  // Erro no formato que o app já entende (o mesmo que um provedor devolveria).
  const recusar = async (motivo, status, contar = true) => {
    if (contar) await somarLentesDia(env, dia, { recusas: 1 }).run();
    return json({ ok: false, motivo, error: { message: `cortesia_${motivo}` } }, status, origem);
  };
  if (!aj.ligada || !env.GROQ_KEY || aj.lentes_por_aparelho <= 0) return json({ ok: false, motivo: 'desligada', error: { message: 'cortesia_desligada' } }, 503, origem);
  await garantirTabelasLentes(env);

  const corpo = await request.json().catch(() => null);
  const aparelho = String(corpo?.aparelho || '');
  const msgs = Array.isArray(corpo?.messages) ? corpo.messages : null;
  if (!RE_APARELHO.test(aparelho) || !msgs || !msgs.length || msgs.length > 3) return recusar('pedido_invalido', 400, false);
  let total = 0;
  const messages = [];
  for (const m of msgs) {
    if (!m || !['system', 'user'].includes(m.role) || typeof m.content !== 'string') return recusar('pedido_invalido', 400, false);
    total += m.content.length;
    messages.push({ role: m.role, content: m.content });
  }
  if (total > LENTE_MAX_CHARS + 4000) return recusar('grande', 413);

  // Trava 1 — o teto do dia, somando todo mundo.
  const d = await env.DB.prepare('SELECT usos FROM lentes_dias WHERE dia = ?').bind(dia).first();
  if ((d?.usos || 0) >= aj.lentes_dia) return recusar('teto_dia', 429);
  // Trava 2 — por endereço de internet (embaralhado; linha própria, não come as transcrições).
  const ip = request.headers.get('CF-Connecting-IP') || 'sem-ip';
  const hashIp = await sha256hex(`LENTE|${ip}|${dia}|${env.SAL_IP || 'vox'}`);
  const ipRow = await env.DB.prepare('SELECT usos FROM ips WHERE dia = ? AND hash = ?').bind(dia, hashIp).first();
  if ((ipRow?.usos || 0) >= aj.por_ip_dia) return recusar('limite_ip', 429);
  // Trava 3 — quantas cada aparelho ganhou (mesma regra das transcrições).
  const row = await env.DB.prepare('SELECT cota, usadas FROM lentes WHERE id = ?').bind(aparelho).first();
  const cota = Math.max(row?.cota || 0, aj.lentes_por_aparelho);
  const usadas = row?.usadas || 0;
  if (usadas >= cota) return recusar('esgotada', 402);

  const maxTokens = Math.min(LENTE_MAX_TOKENS, Math.max(200, Math.round(Number(corpo.max_tokens) || 2600)));
  const temperature = Number.isFinite(Number(corpo.temperature)) ? Math.min(1, Math.max(0, Number(corpo.temperature))) : 0.5;
  const r = await fetch(env.GROQ_CHAT_URL || GROQ_CHAT_PADRAO, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GROQ_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODELO_TEXTO, messages, max_tokens: maxTokens, temperature }),
  });
  if (!r.ok) {
    // Falha do Groq não gasta a lente da pessoa.
    await somarLentesDia(env, dia, { erros: 1 }).run();
    const motivo = r.status === 429 ? 'ocupado' : 'falha';
    return json({ ok: false, motivo, error: { message: `cortesia_${motivo}` } }, r.status === 429 ? 429 : 502, origem);
  }
  const res = await r.json().catch(() => ({}));
  const texto = String(res?.choices?.[0]?.message?.content || '').trim();
  if (!texto) {
    await somarLentesDia(env, dia, { erros: 1 }).run();
    return json({ ok: false, motivo: 'falha', error: { message: 'cortesia_falha' } }, 502, origem);
  }
  const restantes = Math.max(0, cota - usadas - 1);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO lentes (id, cota, usadas, criado, ultimo) VALUES (?, ?, 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET usadas = usadas + 1, ultimo = excluded.ultimo, cota = MAX(cota, excluded.cota)`)
      .bind(aparelho, cota, dia, dia),
    somarLentesDia(env, dia, { usos: 1, aparelhos: row ? 0 : 1 }),
    env.DB.prepare('INSERT INTO ips (dia, hash, usos) VALUES (?, ?, 1) ON CONFLICT(dia, hash) DO UPDATE SET usos = usos + 1').bind(dia, hashIp),
  ]);
  return json({ ok: true, restantes, ultima: restantes === 0, choices: [{ message: { role: 'assistant', content: texto }, finish_reason: 'stop' }] }, 200, origem);
}

// ── Medição opcional do uso do app (08/10/2026) ─────────────────────────────
// Só chega aqui o que vem de quem respondeu "sim" à pergunta do app. O app
// manda só NOMES de eventos, de uma lista fechada, com o dia. Nunca texto,
// áudio, nome, e-mail, nome de nota ou de pasta. O aparelho é identificado por
// um código sorteado só pra isto (diferente do código da cortesia): desligar
// a medição apaga tudo o que é dele aqui e joga o código fora.
// O que fica guardado, e por quanto tempo:
// - uso_aparelhos: o código, o primeiro e o último dia em que contou;
// - uso_ativos: em que dias o código abriu o app (é o que mostra quem volta);
// - uso_marcos: a primeira vez que o código passou por cada passo do funil;
// - uso_eventos: totais por dia e por evento, de todo mundo somado.
// As três primeiras somem 90 dias depois do último uso. Os totais por dia não
// dizem de quem são e ficam, como os da cortesia.
const USO_DIAS_GUARDA = 90;
const USO_EVENTOS = new Set([
  'abriu',            // abriu o app (uma vez por dia)
  'gravou',           // uma gravação virou texto
  'arquivo',          // um arquivo enviado virou texto
  'chave',            // conectou a própria chave de IA (uma vez)
  'presente_inicio',  // começou o presente de Pro
  'presente_fim',     // o presente de Pro acabou
  'tela_pro',         // abriu a tela do Pro
  'assinou',          // ativou uma licença Pro
  'limite_gravacao', 'limite_arquivo', 'limite_diarizacao', 'limite_pasta', 'limite_recurso_pro',
]);
// Passos do funil, na ordem. A primeira vez de cada um fica em uso_marcos.
const USO_FUNIL = ['abriu', 'gravou', 'lente', 'chave', 'tela_pro', 'assinou'];
const RE_LENTE_EVENTO = /^lente:[a-z]{2,24}$/;
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
const USO_MAX_POR_PEDIDO = 50;
const USO_MAX_POR_DIA = 400; // por aparelho: ninguém infla a contagem sozinho

let _tabelasUsoOk = false;
async function garantirTabelasUso(env) {
  if (_tabelasUsoOk) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS uso_aparelhos (id TEXT PRIMARY KEY, primeiro TEXT NOT NULL, ultimo TEXT NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS uso_ativos (id TEXT NOT NULL, dia TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (id, dia))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS uso_marcos (id TEXT NOT NULL, passo TEXT NOT NULL, dia TEXT NOT NULL, PRIMARY KEY (id, passo))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS uso_eventos (dia TEXT NOT NULL, evento TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (dia, evento))`),
  ]);
  _tabelasUsoOk = true;
}
function diaMenos(dia, n) {
  return new Date(Date.parse(dia + 'T12:00:00Z') - n * 864e5).toISOString().slice(0, 10);
}
async function usoApagarVelhos(env) {
  const corte = diaMenos(hoje(), USO_DIAS_GUARDA);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM uso_ativos WHERE id IN (SELECT id FROM uso_aparelhos WHERE ultimo < ?)').bind(corte),
    env.DB.prepare('DELETE FROM uso_marcos WHERE id IN (SELECT id FROM uso_aparelhos WHERE ultimo < ?)').bind(corte),
    env.DB.prepare('DELETE FROM uso_aparelhos WHERE ultimo < ?').bind(corte),
    env.DB.prepare('DELETE FROM uso_ativos WHERE dia < ?').bind(corte),
  ]);
}

async function usoEventos(request, env, origem) {
  const corpo = await request.json().catch(() => null);
  const id = String(corpo?.id || '');
  const lista = Array.isArray(corpo?.eventos) ? corpo.eventos : null;
  if (!RE_APARELHO.test(id) || !lista || lista.length > USO_MAX_POR_PEDIDO) return json({ ok: false, motivo: 'pedido_invalido' }, 400, origem);
  await garantirTabelasUso(env);
  const dia = hoje();
  // O app guarda o evento com o dia em que aconteceu e pode mandar depois
  // (estava sem internet). Aceita até 3 dias atrás; fora disso, vale hoje.
  const minimo = diaMenos(dia, 3);
  const evs = [];
  for (const x of lista) {
    const e = String(x?.e || '');
    if (!USO_EVENTOS.has(e) && !RE_LENTE_EVENTO.test(e)) continue; // fora da lista: ignora
    const d = RE_DIA.test(String(x?.dia || '')) && x.dia >= minimo && x.dia <= dia ? x.dia : dia;
    evs.push({ e, d });
  }
  if (!evs.length) return json({ ok: true }, 200, origem);

  const ja = await env.DB.prepare('SELECT n FROM uso_ativos WHERE id = ? AND dia = ?').bind(id, dia).first();
  if ((ja?.n || 0) >= USO_MAX_POR_DIA) return json({ ok: true }, 200, origem);

  // Nomes de lente diferentes por dia têm teto: passou de 80, vira "lente:outra".
  const lentesHoje = (await env.DB.prepare("SELECT evento FROM uso_eventos WHERE dia = ? AND evento LIKE 'lente:%'").bind(dia).all()).results || [];
  const conhecidas = new Set(lentesHoje.map((r) => r.evento));

  const stmts = [
    env.DB.prepare(`INSERT INTO uso_aparelhos (id, primeiro, ultimo) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET ultimo = MAX(ultimo, excluded.ultimo), primeiro = MIN(primeiro, excluded.primeiro)`)
      .bind(id, evs.reduce((m, x) => (x.d < m ? x.d : m), dia), dia),
    env.DB.prepare('INSERT INTO uso_ativos (id, dia, n) VALUES (?, ?, ?) ON CONFLICT(id, dia) DO UPDATE SET n = n + excluded.n')
      .bind(id, dia, evs.length),
  ];
  for (const { e: e0, d } of evs) {
    let e = e0;
    if (e.startsWith('lente:') && !conhecidas.has(e)) {
      if (conhecidas.size >= 80) e = 'lente:outra';
      else conhecidas.add(e);
    }
    stmts.push(env.DB.prepare('INSERT INTO uso_eventos (dia, evento, n) VALUES (?, ?, 1) ON CONFLICT(dia, evento) DO UPDATE SET n = n + 1').bind(d, e));
    // "Abriu" num dia passado (o envio atrasou) também conta como dia ativo.
    if (e === 'abriu' && d !== dia) stmts.push(env.DB.prepare('INSERT OR IGNORE INTO uso_ativos (id, dia, n) VALUES (?, ?, 0)').bind(id, d));
    const passo = e.startsWith('lente:') ? 'lente' : e === 'arquivo' ? 'gravou' : e;
    if (USO_FUNIL.includes(passo)) stmts.push(env.DB.prepare('INSERT OR IGNORE INTO uso_marcos (id, passo, dia) VALUES (?, ?, ?)').bind(id, passo, d));
  }
  await env.DB.batch(stmts);
  if (Math.random() < 0.02) await usoApagarVelhos(env);
  return json({ ok: true }, 200, origem);
}

// "Desligar" no app: apaga tudo o que é deste código. Os totais por dia (que
// não dizem de quem são) ficam.
async function usoApagar(request, env, origem) {
  const corpo = await request.json().catch(() => null);
  const id = String(corpo?.id || '');
  if (!RE_APARELHO.test(id)) return json({ ok: false, motivo: 'pedido_invalido' }, 400, origem);
  await garantirTabelasUso(env);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM uso_aparelhos WHERE id = ?').bind(id),
    env.DB.prepare('DELETE FROM uso_ativos WHERE id = ?').bind(id),
    env.DB.prepare('DELETE FROM uso_marcos WHERE id = ?').bind(id),
  ]);
  return json({ ok: true }, 200, origem);
}

// O que o painel mostra da medição.
async function usoPainel(env, dia) {
  await garantirTabelasUso(env);
  await usoApagarVelhos(env);
  const d30 = diaMenos(dia, 29), d7 = diaMenos(dia, 6);
  const q = (sql, ...b) => env.DB.prepare(sql).bind(...b);
  const [tot, at7, at30, funil, lentes, limites] = await Promise.all([
    q('SELECT COUNT(*) AS n FROM uso_aparelhos').first(),
    q('SELECT COUNT(DISTINCT id) AS n FROM uso_ativos WHERE dia >= ?', d7).first(),
    q('SELECT COUNT(DISTINCT id) AS n FROM uso_ativos WHERE dia >= ?', d30).first(),
    q('SELECT passo, COUNT(*) AS n FROM uso_marcos GROUP BY passo').all(),
    q("SELECT substr(evento, 7) AS lente, SUM(n) AS n FROM uso_eventos WHERE dia >= ? AND evento LIKE 'lente:%' GROUP BY evento ORDER BY n DESC LIMIT 12", d30).all(),
    q("SELECT evento, SUM(n) AS n FROM uso_eventos WHERE dia >= ? AND evento LIKE 'limite_%' GROUP BY evento ORDER BY n DESC", d30).all(),
  ]);
  // Quem volta: dos aparelhos que começaram há pelo menos N semanas, quantos
  // abriram o app de novo na semana N (dias 7–13, 14–20, 21–27 depois do 1º dia).
  const semanas = [];
  for (const s of [1, 2, 3]) {
    const r = await q(`SELECT COUNT(*) AS base, SUM(CASE WHEN EXISTS (
        SELECT 1 FROM uso_ativos t WHERE t.id = a.id
          AND julianday(t.dia) - julianday(a.primeiro) BETWEEN ? AND ?) THEN 1 ELSE 0 END) AS voltaram
      FROM uso_aparelhos a WHERE julianday(?) - julianday(a.primeiro) >= ?`, s * 7, s * 7 + 6, dia, s * 7 + 6).first();
    semanas.push({ s, base: r?.base || 0, voltaram: r?.voltaram || 0 });
  }
  const passos = Object.fromEntries((funil.results || []).map((x) => [x.passo, x.n]));
  return { total: tot?.n || 0, at7: at7?.n || 0, at30: at30?.n || 0, semanas, passos, lentes: lentes.results || [], limites: limites.results || [] };
}

function htmlUso(u) {
  const p = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  const nomes = { abriu: 'Abriram o app', gravou: 'Transformaram uma gravação ou arquivo em texto', lente: 'Usaram uma lente', chave: 'Conectaram a própria chave', tela_pro: 'Abriram a tela do Pro', assinou: 'Ativaram o Pro' };
  const nomesLim = { limite_gravacao: 'Gravações do dia', limite_arquivo: 'Arquivo inteiro do dia', limite_diarizacao: 'Separar vozes do mês', limite_pasta: 'Pastas e subpastas', limite_recurso_pro: 'Recurso só do Pro (Revisão, Pergunte…)' };
  const base = u.passos.abriu || 0;
  let antes = base;
  const linhasFunil = USO_FUNIL.map((k) => {
    const n = u.passos[k] || 0;
    const r = `<tr><td>${nomes[k]}</td><td>${n}</td><td>${p(n, base)}</td><td>${k === 'abriu' ? '—' : p(n, antes)}</td></tr>`;
    antes = n;
    return r;
  }).join('');
  const linhasSem = u.semanas.map((x) => `<tr><td>Semana ${x.s}</td><td>${x.base}</td><td>${x.voltaram}</td><td>${p(x.voltaram, x.base)}</td></tr>`).join('');
  const linhasLentes = u.lentes.map((x) => `<tr><td>${esc(x.lente)}</td><td>${x.n}</td></tr>`).join('') || '<tr><td colspan="2" class="vazio">Sem dados ainda.</td></tr>';
  const linhasLim = u.limites.map((x) => `<tr><td>${esc(nomesLim[x.evento] || x.evento)}</td><td>${x.n}</td></tr>`).join('') || '<tr><td colspan="2" class="vazio">Ninguém bateu num limite ainda.</td></tr>';
  return `<div class="card">
  <h2>Uso do app (só de quem disse "sim")</h2>
  <p class="leg">O app pergunta uma vez se pode contar como a pessoa usa o Vox. Daqui pra baixo, só entra quem respondeu "sim". Sem texto, sem áudio, sem nome.</p>
  <div class="grid" style="margin-top:12px">
    <div class="card"><div class="leg">Disseram "sim" (últimos 90 dias)</div><div class="num">${u.total}</div></div>
    <div class="card"><div class="leg">Abriram nos últimos 7 dias</div><div class="num">${u.at7}</div></div>
    <div class="card"><div class="leg">Abriram nos últimos 30 dias</div><div class="num">${u.at30}</div></div>
  </div>
  <h2 style="margin-top:18px">Onde as pessoas param</h2>
  <div class="rolar"><table><thead><tr><th>Passo</th><th>Pessoas</th><th>De quem abriu</th><th>Do passo anterior</th></tr></thead><tbody>${linhasFunil}</tbody></table></div>
  <p class="leg" style="margin-top:8px">O passo com a maior queda em "do passo anterior" é onde vale mexer primeiro.</p>
  <h2 style="margin-top:18px">Quem volta</h2>
  <div class="rolar"><table><thead><tr><th></th><th>Começaram há tempo suficiente</th><th>Voltaram nessa semana</th><th>%</th></tr></thead><tbody>${linhasSem}</tbody></table></div>
  <p class="leg" style="margin-top:8px">"Semana 1" é a semana depois da primeira: quem começou e abriu de novo entre o 7º e o 13º dia. É o número que diz se o Vox virou hábito.</p>
  <div class="grid" style="margin-top:12px">
    <div class="card"><h2>Lentes mais usadas (30 dias)</h2><table><tbody>${linhasLentes}</tbody></table></div>
    <div class="card"><h2>Limites do grátis batidos (30 dias)</h2><table><tbody>${linhasLim}</tbody></table></div>
  </div>
</div>`;
}

// ── Medição da landing ──────────────────────────────────────────────────────
// A landing (voxcharmai.com) avisa a ponte de duas coisas: "alguém abriu a
// página" e "alguém clicou em Comece grátis / Assinar". Sem cookie e sem
// código de terceiros. Guarda só totais por dia e de que site a visita veio.
// O endereço de internet entra embaralhado com o dia, só pra contar visitante
// único e frear abuso, e é apagado no dia seguinte.
const ORIGENS_LANDING = ['https://voxcharmai.com', 'https://www.voxcharmai.com'];
const RE_ROBO = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python|scrapy/i;
const ALVOS_LANDING = { gratis: 'clique_gratis', assinar: 'clique_assinar' };
const CAMPOS_LANDING = new Set(['visitas', 'visitantes', 'clique_gratis', 'clique_assinar', 'pessoas_gratis', 'pessoas_assinar']);
// Desde 08/10/2026 a landing conta também PESSOAS que clicaram (uma vez por
// visitante por dia), não só cliques: uma pessoa que clica 3 vezes fazia a
// taxa passar de 100% ("162%"). As colunas entram sozinhas no primeiro uso.
let _colunasPessoasOk = false;
async function garantirColunasPessoas(env) {
  if (_colunasPessoasOk) return;
  for (const sql of [
    'ALTER TABLE landing_dias ADD COLUMN pessoas_gratis INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE landing_dias ADD COLUMN pessoas_assinar INTEGER NOT NULL DEFAULT 0',
    "ALTER TABLE landing_vis ADD COLUMN alvos TEXT NOT NULL DEFAULT ''",
  ]) {
    try { await env.DB.prepare(sql).run(); } catch { /* a coluna já existe */ }
  }
  _colunasPessoasOk = true;
}
// Depois da coluna nova, todo dia com clique tem pessoa (o primeiro clique de
// cada visitante conta). Dia com clique e sem pessoa é de antes dela: aí o
// melhor palpite honesto é "no máximo um clique por visitante".
function pessoasQueClicaram(x, alvo) {
  const pessoas = x[`pessoas_${alvo}`] || 0, cliques = x[`clique_${alvo}`] || 0;
  return pessoas > 0 || cliques === 0 ? pessoas : Math.min(cliques, x.visitantes || 0);
}

function origemLanding(origem) {
  return ORIGENS_LANDING.includes(origem) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origem);
}
function limparOrigem(o) {
  return String(o || '').toLowerCase().replace(/^www\./, '').replace(/[^a-z0-9.\-]/g, '').slice(0, 60) || 'direto';
}
function somarLanding(env, dia, somas) {
  const cols = Object.keys(somas).filter((c) => CAMPOS_LANDING.has(c) && somas[c]);
  if (!cols.length) return null;
  const sql = `INSERT INTO landing_dias (dia, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})
    ON CONFLICT(dia) DO UPDATE SET ${cols.map((c) => `${c} = ${c} + excluded.${c}`).join(', ')}`;
  return env.DB.prepare(sql).bind(dia, ...cols.map((c) => somas[c]));
}
async function landingEvento(request, env, origem) {
  const vazio = () => new Response(null, { status: 204, headers: cors(origem) });
  if (RE_ROBO.test(request.headers.get('User-Agent') || '')) return vazio();
  let ev = {};
  try { ev = JSON.parse(await request.text()); } catch { return vazio(); }
  const dia = hoje();
  const ip = request.headers.get('CF-Connecting-IP') || 'sem-ip';
  const hash = await sha256hex(`L|${ip}|${dia}|${env.SAL_IP || 'vox'}`);
  await garantirColunasPessoas(env);
  const v = await env.DB.prepare('SELECT eventos, alvos FROM landing_vis WHERE dia = ? AND hash = ?').bind(dia, hash).first();
  if ((v?.eventos || 0) >= 60) return vazio(); // um endereço sozinho não enche a contagem
  const stmts = [
    env.DB.prepare('INSERT INTO landing_vis (dia, hash, eventos) VALUES (?, ?, 1) ON CONFLICT(dia, hash) DO UPDATE SET eventos = eventos + 1').bind(dia, hash),
    env.DB.prepare('DELETE FROM landing_vis WHERE dia < ?').bind(dia),
  ];
  if (ev.tipo === 'visita') {
    stmts.push(somarLanding(env, dia, { visitas: 1, visitantes: v ? 0 : 1 }));
    if (!v) {
      // De onde veio: contado uma vez por visitante. Passou de 100 origens
      // diferentes no dia, o resto vai pra "outras" (ninguém infla a tabela).
      let o = limparOrigem(ev.origem);
      const q = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM landing_origens WHERE dia = ?) AS n, (SELECT COUNT(*) FROM landing_origens WHERE dia = ? AND origem = ?) AS tem').bind(dia, dia, o).first();
      if (!q.tem && q.n >= 100) o = 'outras';
      stmts.push(env.DB.prepare('INSERT INTO landing_origens (dia, origem, n) VALUES (?, ?, 1) ON CONFLICT(dia, origem) DO UPDATE SET n = n + 1').bind(dia, o));
    }
  } else if (ev.tipo === 'clique' && ALVOS_LANDING[ev.alvo]) {
    const primeiraVez = !String(v?.alvos || '').split(',').includes(ev.alvo);
    stmts.push(somarLanding(env, dia, { [ALVOS_LANDING[ev.alvo]]: 1, [`pessoas_${ev.alvo}`]: primeiraVez ? 1 : 0 }));
    if (primeiraVez) {
      stmts.push(env.DB.prepare("UPDATE landing_vis SET alvos = CASE WHEN alvos = '' THEN ? ELSE alvos || ',' || ? END WHERE dia = ? AND hash = ?")
        .bind(ev.alvo, ev.alvo, dia, hash));
    }
  } else {
    return vazio();
  }
  await env.DB.batch(stmts);
  return vazio();
}

// ── Painel do Rafa ──────────────────────────────────────────────────────────

async function painel(request, env, url) {
  if (!env.PAINEL_SENHA) return new Response('Painel desligado: falta definir a senha (PAINEL_SENHA).\n', { status: 503 });
  if (!(await senhaConfere(request, env.PAINEL_SENHA))) {
    return new Response('Senha necessária.\n', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Painel da ponte do Vox", charset="UTF-8"', 'Cache-Control': 'no-store' },
    });
  }

  if (url.pathname === '/painel/ajustes') {
    if (request.method !== 'POST') return Response.redirect(`${url.origin}/painel`, 303);
    // Sem isto, outro site poderia enviar o formulário usando a senha que o
    // navegador já guardou. Só aceita envio feito a partir do próprio painel.
    const de = request.headers.get('Origin') || request.headers.get('Referer') || '';
    if (!de.startsWith(url.origin)) return new Response('Envio recusado.\n', { status: 403 });
    const form = await request.formData();
    const novos = {
      ligada: form.get('ligada') ? 1 : 0,
      por_aparelho: Number(form.get('por_aparelho')),
      max_segundos: Math.round(Number(form.get('max_minutos')) * 60),
      teto_minutos_dia: Number(form.get('teto_minutos_dia')),
      por_ip_dia: Number(form.get('por_ip_dia')),
      lentes_por_aparelho: Number(form.get('lentes_por_aparelho')),
      lentes_dia: Number(form.get('lentes_dia')),
      pro_dias: Number(form.get('pro_dias')),
    };
    const stmts = [];
    for (const [chave, valor] of Object.entries(novos)) {
      if (!Number.isFinite(valor)) continue;
      const [min, max] = LIMITES[chave];
      stmts.push(env.DB.prepare('INSERT INTO ajustes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor')
        .bind(chave, Math.min(max, Math.max(min, Math.round(valor)))));
    }
    if (stmts.length) await env.DB.batch(stmts);
    return Response.redirect(`${url.origin}/painel?salvo=1`, 303);
  }

  const aj = await lerAjustes(env);
  const dia = hoje();
  const hojeRow = (await env.DB.prepare('SELECT * FROM dias WHERE dia = ?').bind(dia).first()) || {};
  const dias = (await env.DB.prepare('SELECT * FROM dias ORDER BY dia DESC LIMIT 30').all()).results || [];
  const faixas = (await env.DB.prepare(
    'SELECT usadas, COUNT(*) AS n, SUM(formou) AS f FROM aparelhos WHERE usadas > 0 GROUP BY usadas ORDER BY usadas',
  ).all()).results || [];
  const total = faixas.reduce((s, x) => s + x.n, 0);
  const formaram = faixas.reduce((s, x) => s + (x.f || 0), 0);
  const fim = await env.DB.prepare('SELECT COUNT(*) AS n, SUM(formou) AS f FROM aparelhos WHERE usadas > 0 AND usadas >= MAX(cota, ?)')
    .bind(aj.por_aparelho).first();

  await garantirTabelasLentes(env);
  const lentesHoje = (await env.DB.prepare('SELECT * FROM lentes_dias WHERE dia = ?').bind(dia).first()) || {};
  const lentes30 = (await env.DB.prepare('SELECT SUM(usos) AS usos, SUM(aparelhos) AS aparelhos FROM lentes_dias WHERE dia >= ?')
    .bind(new Date(Date.now() - 3 * 3600e3 - 29 * 864e5).toISOString().slice(0, 10)).first()) || {};
  await garantirColunasPessoas(env);
  const landing = (await env.DB.prepare('SELECT * FROM landing_dias ORDER BY dia DESC LIMIT 30').all()).results || [];
  const uso = await usoPainel(env, dia);
  const origens = (await env.DB.prepare("SELECT origem, SUM(n) AS n FROM landing_origens WHERE dia >= ? GROUP BY origem ORDER BY n DESC LIMIT 12")
    .bind(new Date(Date.now() - 3 * 3600e3 - 29 * 864e5).toISOString().slice(0, 10)).all()).results || [];
  return new Response(htmlPainel({ aj, dia, hojeRow, dias, faixas, total, formaram, fim, landing, origens, lentesHoje, lentes30, uso, salvo: url.searchParams.has('salvo'), temChave: !!env.GROQ_KEY }), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}

function htmlPainel({ aj, dia, hojeRow, dias, faixas, total, formaram, fim, landing, origens, lentesHoje, lentes30, uso, salvo, temChave }) {
  const minHoje = Math.round((hojeRow.segundos || 0) / 60);
  const pct = aj.teto_minutos_dia ? Math.min(100, Math.round((minHoje / aj.teto_minutos_dia) * 100)) : 100;
  const p = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  const br = (d) => String(d).split('-').reverse().join('/');
  const linhasDias = dias.map((x) => `<tr>
      <td>${esc(br(x.dia))}</td><td>${x.aparelhos_novos}</td><td>${x.transcricoes}</td><td>${Math.round(x.segundos / 60)}</td>
      <td>${x.chegaram_ao_fim}</td><td>${x.formaram}</td>
      <td>${x.recusa_teto}</td><td>${x.recusa_esgotada}</td><td>${x.recusa_ip}</td><td>${x.recusa_grande}</td><td>${x.erros}</td>
    </tr>`).join('') || '<tr><td colspan="11" class="vazio">Ainda ninguém usou a cortesia.</td></tr>';
  // O funil dos últimos 30 dias: landing -> clique -> cortesia -> chave própria.
  const soma = (lista, campo) => lista.reduce((s, x) => s + (x[campo] || 0), 0);
  const fVis = soma(landing, 'visitantes');
  const fGratis = landing.reduce((s, x) => s + pessoasQueClicaram(x, 'gratis'), 0);
  const fAssinar = landing.reduce((s, x) => s + pessoasQueClicaram(x, 'assinar'), 0);
  const fCortesia = soma(dias, 'aparelhos_novos'), fChave = soma(dias, 'formaram');
  const linhasLanding = landing.map((x) => `<tr><td>${esc(br(x.dia))}</td><td>${x.visitantes}</td><td>${x.visitas}</td><td>${pessoasQueClicaram(x, 'gratis')}</td><td>${x.clique_gratis}</td><td>${pessoasQueClicaram(x, 'assinar')}</td><td>${x.clique_assinar}</td></tr>`).join('')
    || '<tr><td colspan="7" class="vazio">Ainda nenhuma visita contada.</td></tr>';
  const linhasOrigens = origens.map((x) => `<tr><td>${esc(x.origem)}</td><td>${x.n}</td></tr>`).join('')
    || '<tr><td colspan="2" class="vazio">Sem dados ainda.</td></tr>';
  const linhasFaixas = faixas.map((x) => `<tr><td>${x.usadas}</td><td>${x.n}</td><td>${x.f || 0}</td><td>${p(x.f || 0, x.n)}</td></tr>`).join('')
    || '<tr><td colspan="4" class="vazio">Sem dados ainda.</td></tr>';

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Painel da ponte</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--tx:#1b1d21;--tx2:#5b616b;--bd:#e3e6ea;--ac:#10b981;--av:#d97706;--er:#dc2626}
@media (prefers-color-scheme:dark){:root{--bg:#121417;--card:#1b1e22;--tx:#eceef1;--tx2:#9aa1ab;--bd:#2c3137}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:980px;margin:0 auto;padding:24px 16px 48px}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:0 0 10px}
.sub{color:var(--tx2);margin:0 0 20px}.card{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:18px;margin-bottom:16px}
.barra{height:12px;background:var(--bd);border-radius:99px;overflow:hidden;margin:8px 0}.barra>i{display:block;height:100%;background:var(--ac)}
.barra.alto>i{background:var(--av)}.num{font-size:26px;font-weight:700}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.grid .card{margin:0}.leg{color:var(--tx2);font-size:13px}table{width:100%;border-collapse:collapse;font-size:13.5px}
th,td{padding:7px 8px;border-bottom:1px solid var(--bd);text-align:right;white-space:nowrap}th:first-child,td:first-child{text-align:left}
th{color:var(--tx2);font-weight:600}.rolar{overflow-x:auto}.vazio{text-align:center!important;color:var(--tx2)}
label{display:block;margin:0 0 12px}label span{display:block;font-weight:600}label small{color:var(--tx2)}
input[type=number]{width:120px;padding:8px 10px;border:1px solid var(--bd);border-radius:10px;background:var(--bg);color:var(--tx);font:inherit}
button{background:var(--ac);color:#fff;border:0;border-radius:10px;padding:10px 18px;font:inherit;font-weight:700;cursor:pointer}
.ok{background:#10b98122;border:1px solid var(--ac);border-radius:10px;padding:10px 12px;margin-bottom:16px}
.alerta{background:#dc262618;border:1px solid var(--er);border-radius:10px;padding:10px 12px;margin-bottom:16px}
ul{margin:6px 0 0;padding-left:20px}li{margin-bottom:4px}
</style></head><body><main>
<h1>Painel da ponte do Vox</h1>
<p class="sub">Transcrições por nossa conta · hoje é ${esc(br(dia))} (horário de Brasília)</p>
${salvo ? '<div class="ok">Ajustes salvos. Já estão valendo.</div>' : ''}
${temChave ? '' : '<div class="alerta">A chave do Groq ainda não foi colocada na ponte. A cortesia fica desligada até lá.</div>'}
${aj.ligada ? '' : '<div class="alerta">A cortesia está desligada. Ninguém novo recebe transcrição por nossa conta.</div>'}

<div class="card">
  <h2>O funil dos últimos 30 dias</h2>
  <div class="grid">
    <div class="card"><div class="leg">Visitaram a landing</div><div class="num">${fVis}</div></div>
    <div class="card"><div class="leg">Pessoas que clicaram em "Comece grátis"</div><div class="num">${fGratis}</div><div class="leg">${p(fGratis, fVis)} dos visitantes</div></div>
    <div class="card"><div class="leg">Usaram a cortesia</div><div class="num">${fCortesia}</div><div class="leg">${p(fCortesia, fGratis)} dos cliques</div></div>
    <div class="card"><div class="leg">Usaram uma lente (o "pensa com você")</div><div class="num">${lentes30.aparelhos || 0}</div><div class="leg">${p(lentes30.aparelhos || 0, fCortesia)} de quem usou a cortesia</div></div>
    <div class="card"><div class="leg">Conectaram a própria chave</div><div class="num">${fChave}</div><div class="leg">${p(fChave, fCortesia)} de quem usou</div></div>
    <div class="card"><div class="leg">Pessoas que clicaram em "Assinar"</div><div class="num">${fAssinar}</div><div class="leg">${p(fAssinar, fVis)} dos visitantes</div></div>
  </div>
  <p class="leg" style="margin-top:12px">Cada pessoa conta uma vez por dia, mesmo clicando várias vezes (nos dias de antes desta contagem, quando só os cliques eram contados, vale no máximo um por visitante). As vendas em si ficam no painel do Freemius. Quem já tem chave não passa pela cortesia, então "usaram a cortesia" conta só gente nova.</p>
</div>

${htmlUso(uso)}

<div class="card">
  <h2>Minutos de hoje</h2>
  <div class="num">${minHoje} <span class="leg">de ${aj.teto_minutos_dia} minutos do teto</span></div>
  <div class="barra${pct >= 80 ? ' alto' : ''}"><i style="width:${pct}%"></i></div>
  <p class="leg">O Groq grátis dá até 480 minutos por dia e 120 por hora. Quando o teto chega, a ponte para e quem grava vê que a cortesia de hoje acabou. Não gera cobrança.</p>
</div>

<div class="card">
  <h2>Lentes por nossa conta</h2>
  <div class="num">${lentesHoje.usos || 0} <span class="leg">de ${aj.lentes_dia} lentes hoje · ${lentesHoje.aparelhos || 0} aparelho(s) novo(s) · ${lentesHoje.recusas || 0} recusa(s) · ${lentesHoje.erros || 0} erro(s)</span></div>
  <div class="barra${aj.lentes_dia && (lentesHoje.usos || 0) / aj.lentes_dia >= 0.8 ? ' alto' : ''}"><i style="width:${aj.lentes_dia ? Math.min(100, Math.round(((lentesHoje.usos || 0) / aj.lentes_dia) * 100)) : 100}%"></i></div>
  <p class="leg">Últimos 30 dias: ${lentes30.usos || 0} lentes, ${lentes30.aparelhos || 0} aparelhos. O Groq grátis dá ~200 mil "pedaços de texto" (tokens) por dia nesse modelo: dá umas 40 a 60 lentes. Se chegar no teto, quem pede vê o convite pra chave grátis. Não gera cobrança.</p>
</div>

<div class="grid">
  <div class="card"><div class="leg">Aparelhos que usaram</div><div class="num">${total}</div></div>
  <div class="card"><div class="leg">Chegaram ao fim da cortesia</div><div class="num">${fim?.n || 0}</div></div>
  <div class="card"><div class="leg">Conectaram a própria chave</div><div class="num">${formaram}</div><div class="leg">${p(formaram, total)} de quem usou</div></div>
  <div class="card"><div class="leg">Dos que chegaram ao fim, conectaram</div><div class="num">${p(fim?.f || 0, fim?.n || 0)}</div></div>
</div>

<div class="card" style="margin-top:16px">
  <h2>Quantas cada aparelho usou</h2>
  <div class="rolar"><table><thead><tr><th>Usou</th><th>Aparelhos</th><th>Conectaram a chave</th><th>%</th></tr></thead><tbody>${linhasFaixas}</tbody></table></div>
  <p class="leg" style="margin-top:12px"><strong>Como ler:</strong></p>
  <ul class="leg">
    <li>A maioria usa todas e conecta a chave: está funcionando, mantenha.</li>
    <li>A maioria usa todas e some: pode ter faltado tempo, ou o passo da chave está difícil. Teste subir o número e olhe o passo da chave.</li>
    <li>A maioria usa só 1 e some: o número não é o problema. É a primeira experiência.</li>
  </ul>
</div>

<div class="card">
  <h2>Ajustes</h2>
  <form method="post" action="/painel/ajustes">
    <label><input type="checkbox" name="ligada" value="1"${aj.ligada ? ' checked' : ''}> <strong>Cortesia ligada</strong></label>
    <label><span>Transcrições por aparelho</span><input type="number" name="por_aparelho" min="0" max="20" value="${aj.por_aparelho}">
      <small>Aumentar vale pra todos. Diminuir só vale pra aparelhos novos.</small></label>
    <label><span>Minutos máximos por gravação</span><input type="number" name="max_minutos" min="0.5" max="10" step="0.5" value="${aj.max_segundos / 60}">
      <small>15 segundos antes do fim, o app avisa. A gravação para e vira texto normalmente.</small></label>
    <label><span>Teto de minutos por dia (todo mundo somado)</span><input type="number" name="teto_minutos_dia" min="0" max="2000" value="${aj.teto_minutos_dia}">
      <small>Deixe abaixo de 480, que é o limite do Groq grátis.</small></label>
    <label><span>Pedidos por endereço de internet por dia</span><input type="number" name="por_ip_dia" min="1" max="200" value="${aj.por_ip_dia}">
      <small>Protege contra quem tenta esvaziar a cortesia. Escritórios e operadoras de celular dividem endereço, por isso não é 3.</small></label>
    <label><span>Lentes por aparelho</span><input type="number" name="lentes_por_aparelho" min="0" max="30" value="${aj.lentes_por_aparelho}">
      <small>Quantas lentes a pessoa usa antes de ter chave (é aqui que ela sente o "o Vox pensa com você"). 0 desliga.</small></label>
    <label><span>Lentes por dia (todo mundo somado)</span><input type="number" name="lentes_dia" min="0" max="3000" value="${aj.lentes_dia}">
      <small>O teto que protege a sua conta grátis do Groq. Uns 40 cabem folgado.</small></label>
    <label><span>Dias de Pro de presente</span><input type="number" name="pro_dias" min="0" max="60" value="${aj.pro_dias}">
      <small>Quem começa a usar ganha esses dias de Pro (conta da primeira gravação). 0 desliga a promoção pra quem chegar depois; quem já ganhou fica com os dias.</small></label>
    <button type="submit">Salvar ajustes</button>
  </form>
</div>

<div class="card">
  <h2>Últimos 30 dias</h2>
  <div class="rolar"><table>
    <thead><tr><th>Dia</th><th>Novos</th><th>Transcrições</th><th>Minutos</th><th>Chegaram ao fim</th><th>Conectaram</th>
      <th>Recusa: teto</th><th>Recusa: acabou</th><th>Recusa: endereço</th><th>Recusa: grande</th><th>Erros</th></tr></thead>
    <tbody>${linhasDias}</tbody>
  </table></div>
</div>

<div class="card">
  <h2>Landing: últimos 30 dias</h2>
  <div class="rolar"><table>
    <thead><tr><th>Dia</th><th>Visitantes</th><th>Visitas</th><th>Pessoas "Comece grátis"</th><th>Cliques</th><th>Pessoas "Assinar"</th><th>Cliques</th></tr></thead>
    <tbody>${linhasLanding}</tbody>
  </table></div>
</div>

<div class="card">
  <h2>De onde as visitas vieram (30 dias)</h2>
  <div class="rolar"><table><thead><tr><th>Origem</th><th>Visitantes</th></tr></thead><tbody>${linhasOrigens}</tbody></table></div>
  <p class="leg" style="margin-top:12px">"direto" é quem digitou o endereço ou veio de um app que não informa a origem (WhatsApp, e-mail).</p>
</div>

<p class="leg">Nada aqui identifica ninguém. Cada aparelho é um código sorteado nele mesmo, sem nome nem e-mail. Endereços de internet entram embaralhados e são apagados todo dia. Nenhum áudio e nenhum texto ficam guardados. O uso do app só existe pra quem disse "sim", e some 90 dias depois do último uso (ou na hora, se a pessoa desligar).</p>
</main></body></html>`;
}

// ── Utilidades ──────────────────────────────────────────────────────────────

async function lerAjustes(env) {
  const aj = { ...PADROES };
  const { results } = await env.DB.prepare('SELECT chave, valor FROM ajustes').all();
  for (const { chave, valor } of results || []) if (chave in aj) aj[chave] = valor;
  return aj;
}

function somarDia(env, dia, somas) {
  const cols = Object.keys(somas).filter((c) => CAMPOS_DIA.has(c) && somas[c]);
  if (!cols.length) return null;
  const sql = `INSERT INTO dias (dia, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})
    ON CONFLICT(dia) DO UPDATE SET ${cols.map((c) => `${c} = ${c} + excluded.${c}`).join(', ')}`;
  return env.DB.prepare(sql).bind(dia, ...cols.map((c) => somas[c]));
}

// Dia no horário de Brasília (UTC-3, sem horário de verão desde 2019).
function hoje() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

function origemPermitida(origem, env) {
  if (!origem) return false;
  const lista = String(env.ORIGENS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (lista.includes(origem)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origem);
}

function cors(origem) {
  return {
    'Access-Control-Allow-Origin': origem,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(obj, status = 200, origem = '') {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(origem ? cors(origem) : {}) },
  });
}

async function sha256hex(texto) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function senhaConfere(request, senha) {
  const h = request.headers.get('Authorization') || '';
  if (!h.startsWith('Basic ')) return false;
  let dada = '';
  try {
    const dec = new TextDecoder().decode(Uint8Array.from(atob(h.slice(6)), (c) => c.charCodeAt(0)));
    dada = dec.slice(dec.indexOf(':') + 1);
  } catch { return false; }
  // Compara os resumos, não as senhas, pra comparação ter tamanho fixo e tempo constante.
  const [a, b] = await Promise.all([dada, senha].map((s) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
  return crypto.subtle.timingSafeEqual(a, b);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
