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
export const LIMITES = {
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

import { WorkerEntrypoint } from 'cloudflare:workers';

// Porta interna pro painel (vox-painel), por Service Binding (13/11/2026). Não é
// um endereço da internet: só um Worker da mesma conta, ligado a ela no
// wrangler.painel.toml, consegue chamar. Responde só "tem chave: sim/não";
// a chave do Groq nunca sai da ponte.
export class PonteParaPainel extends WorkerEntrypoint {
  async temChave() {
    return !!this.env.GROQ_KEY;
  }
}

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
      if (url.pathname === '/painel' || url.pathname.startsWith('/painel/')) {
        // Desde 13/11/2026 o painel mora num Worker só dele (vox-painel), atrás
        // do Cloudflare Access: entra-se com um código mandado por e-mail, sem
        // senha pra lembrar. Ver src/painel.js e o README.
        if (!env.PAINEL_URL) return new Response('O painel mudou de endereço.\n', { status: 404 });
        return new Response(null, { status: 302, headers: { Location: env.PAINEL_URL, 'Cache-Control': 'no-store' } });
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
  fd.append('file', audio, nomeDoAudio(audio));
  fd.append('model', MODELO);
  fd.append('response_format', 'verbose_json');
  if (RE_IDIOMA.test(idioma)) fd.append('language', idioma);
  const r = await fetch(env.GROQ_URL || GROQ_URL_PADRAO, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GROQ_KEY}` },
    body: fd,
  }).catch(() => null);
  if (!r || !r.ok) {
    // 429 do Groq = o limite dele acabou antes do nosso (ex.: o teto por hora).
    // Não gasta a cortesia da pessoa: ela não recebeu nada. Guarda o TIPO do
    // erro (só o código, nada da pessoa), pro painel mostrar a causa.
    await garantirTabelaErros(env);
    await env.DB.batch([somarDia(env, dia, { erros: 1 }), somarErroGroq(env, dia, 'transcricao', tipoErroGroq(r))]);
    return json({ ok: false, motivo: r?.status === 429 ? 'ocupado' : 'falha', max_segundos: aj.max_segundos }, r?.status === 429 ? 429 : 502, origem);
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
export async function garantirTabelasLentes(env) {
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
  }).catch(() => null);
  if (!r || !r.ok) {
    // Falha do Groq não gasta a lente da pessoa.
    await garantirTabelaErros(env);
    await env.DB.batch([somarLentesDia(env, dia, { erros: 1 }), somarErroGroq(env, dia, 'lente', tipoErroGroq(r))]);
    const motivo = r?.status === 429 ? 'ocupado' : 'falha';
    return json({ ok: false, motivo, error: { message: `cortesia_${motivo}` } }, r?.status === 429 ? 429 : 502, origem);
  }
  const res = await r.json().catch(() => ({}));
  const texto = String(res?.choices?.[0]?.message?.content || '').trim();
  if (!texto) {
    await garantirTabelaErros(env);
    await env.DB.batch([somarLentesDia(env, dia, { erros: 1 }), somarErroGroq(env, dia, 'lente', 'vazia')]);
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
export const USO_FUNIL = ['abriu', 'gravou', 'lente', 'chave', 'tela_pro', 'assinou'];
const RE_LENTE_EVENTO = /^lente:[a-z]{2,24}$/;
// De onde a pessoa veio (doc 33, L3.8): 'origem:<canal>', uma vez por aparelho,
// só de quem disse "sim". Lista fechada, igual à do app. Entra só no total do
// dia (uso_eventos); não vira passo do funil nem fica ligado ao código.
const USO_ORIGENS = new Set(['landing', 'producthunt', 'hn', 'x', 'reddit', 'alternativeto', 'saashub', 'futuretools', 'launchingnext',
  'microsoft-store', 'appsumo', 'indiehackers', 'youtube', 'newsletter', 'afiliado', 'outra']);
const ehOrigemEvento = (e) => e.startsWith('origem:') && USO_ORIGENS.has(e.slice(7));
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
const USO_MAX_POR_PEDIDO = 50;
const USO_MAX_POR_DIA = 400; // por aparelho: ninguém infla a contagem sozinho

let _tabelasUsoOk = false;
export async function garantirTabelasUso(env) {
  if (_tabelasUsoOk) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS uso_aparelhos (id TEXT PRIMARY KEY, primeiro TEXT NOT NULL, ultimo TEXT NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS uso_ativos (id TEXT NOT NULL, dia TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (id, dia))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS uso_marcos (id TEXT NOT NULL, passo TEXT NOT NULL, dia TEXT NOT NULL, PRIMARY KEY (id, passo))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS uso_eventos (dia TEXT NOT NULL, evento TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (dia, evento))`),
  ]);
  _tabelasUsoOk = true;
}
export function diaMenos(dia, n) {
  return new Date(Date.parse(dia + 'T12:00:00Z') - n * 864e5).toISOString().slice(0, 10);
}
export async function usoApagarVelhos(env) {
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
    if (!USO_EVENTOS.has(e) && !RE_LENTE_EVENTO.test(e) && !ehOrigemEvento(e)) continue; // fora da lista: ignora
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
export async function garantirColunasPessoas(env) {
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
export function pessoasQueClicaram(x, alvo) {
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

// ── Erros do Groq por tipo (13/11/2026) ─────────────────────────────────────
// Antes só se sabia "deu erro" (coluna `erros`). Agora fica também QUAL erro,
// por dia: só o tipo e a quantidade, nada da pessoa nem do áudio. Tabela nova,
// criada sozinha no primeiro uso (não apaga nem muda nada do que já existe).
let _tabelaErrosOk = false;
export async function garantirTabelaErros(env) {
  if (_tabelaErrosOk) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS erros_groq (
    dia TEXT NOT NULL, onde TEXT NOT NULL, tipo TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (dia, onde, tipo))`).run();
  _tabelaErrosOk = true;
}
// r = resposta do Groq, ou null quando nem deu pra falar com ele.
export function tipoErroGroq(r) {
  if (!r) return 'rede';
  const s = r.status;
  if (s === 429) return 'ocupado';
  if (s === 400 || s === 415 || s === 422) return 'formato';
  if (s === 413) return 'tamanho';
  if (s === 401 || s === 403) return 'chave';
  if (s >= 500) return 'falha_groq';
  return 'http_' + (Number.isInteger(s) ? s : 0);
}
function somarErroGroq(env, dia, onde, tipo) {
  return env.DB.prepare('INSERT INTO erros_groq (dia, onde, tipo, n) VALUES (?, ?, ?, 1) ON CONFLICT(dia, onde, tipo) DO UPDATE SET n = n + 1')
    .bind(dia, onde, tipo);
}

// Nome do arquivo que vai pro Groq. O app manda "gravacao.webm" quando a
// gravação não tem nome, mas o Safari grava em MP4: o Groq recebia um MP4
// chamado .webm. Quando o tipo do áudio diz outra coisa, o nome segue o tipo.
const EXT_POR_TIPO = [[/webm/, 'webm'], [/mp4|m4a|aac/, 'm4a'], [/ogg|opus/, 'ogg'], [/wav/, 'wav'], [/mpeg|mp3/, 'mp3'], [/flac/, 'flac']];
export function nomeDoAudio(audio) {
  const nome = String(audio.name || '');
  const tipo = String(audio.type || '').toLowerCase();
  const ext = (EXT_POR_TIPO.find(([re]) => re.test(tipo)) || [])[1];
  const temExt = /\.[a-z0-9]{2,5}$/i.test(nome);
  if (ext && (!temExt || nome === 'gravacao.webm')) return `gravacao.${ext}`;
  return temExt ? nome : 'gravacao.webm';
}

// ── Utilidades ──────────────────────────────────────────────────────────────

export async function lerAjustes(env) {
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
export function hoje() {
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

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
