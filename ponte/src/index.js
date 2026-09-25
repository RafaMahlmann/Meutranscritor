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
// Por que a conta não chega: a chave é de uma conta GRÁTIS do Groq, sem
// cartão — quando o limite do dia acaba, o Groq recusa, não cobra. E esta
// ponte para antes disso, no teto que o Rafa escolhe no painel.

const GROQ_URL_PADRAO = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODELO = 'whisper-large-v3-turbo';

// Maior arquivo aceito. Folga pra ~2 min no formato mais pesado que o app
// grava (AAC do Safari). Quem manda arquivo maior não é o app.
const MAX_BYTES = 5 * 1024 * 1024;

// O Groq cobra (e conta no limite) no mínimo 10 segundos por pedido.
const SEGUNDOS_MINIMOS = 10;

// Valores de fábrica. O painel grava por cima, na tabela `ajustes`.
const PADROES = {
  ligada: 1,             // liga e desliga a cortesia inteira
  por_aparelho: 3,       // transcrições por nossa conta, por aparelho
  max_segundos: 120,     // duração máxima de cada uma
  teto_minutos_dia: 400, // soma de todo mundo por dia (o Groq grátis dá 480)
  por_ip_dia: 10,        // pedidos por endereço de internet por dia
};
const LIMITES = {
  ligada: [0, 1],
  por_aparelho: [0, 20],
  max_segundos: [30, 600],
  teto_minutos_dia: [0, 2000],
  por_ip_dia: [1, 200],
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
      if (url.pathname.startsWith('/v1/')) {
        if (!origemPermitida(origem, env)) return json({ ok: false, motivo: 'origem' }, 403);
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origem) });
        if (request.method !== 'POST') return json({ ok: false, motivo: 'pedido_invalido' }, 405, origem);
        if (url.pathname === '/v1/cortesia/estado') return await estado(request, env, origem);
        if (url.pathname === '/v1/cortesia/transcrever') return await transcrever(request, env, origem);
        if (url.pathname === '/v1/cortesia/formou') return await formou(request, env, origem);
        // Aqui entra, mais tarde, a validação de licença do Freemius (mesma ponte).
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
  const base = { ok: true, max_segundos: aj.max_segundos };
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

  return new Response(htmlPainel({ aj, dia, hojeRow, dias, faixas, total, formaram, fim, salvo: url.searchParams.has('salvo'), temChave: !!env.GROQ_KEY }), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}

function htmlPainel({ aj, dia, hojeRow, dias, faixas, total, formaram, fim, salvo, temChave }) {
  const minHoje = Math.round((hojeRow.segundos || 0) / 60);
  const pct = aj.teto_minutos_dia ? Math.min(100, Math.round((minHoje / aj.teto_minutos_dia) * 100)) : 100;
  const p = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  const br = (d) => String(d).split('-').reverse().join('/');
  const linhasDias = dias.map((x) => `<tr>
      <td>${esc(br(x.dia))}</td><td>${x.aparelhos_novos}</td><td>${x.transcricoes}</td><td>${Math.round(x.segundos / 60)}</td>
      <td>${x.chegaram_ao_fim}</td><td>${x.formaram}</td>
      <td>${x.recusa_teto}</td><td>${x.recusa_esgotada}</td><td>${x.recusa_ip}</td><td>${x.recusa_grande}</td><td>${x.erros}</td>
    </tr>`).join('') || '<tr><td colspan="11" class="vazio">Ainda ninguém usou a cortesia.</td></tr>';
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
  <h2>Minutos de hoje</h2>
  <div class="num">${minHoje} <span class="leg">de ${aj.teto_minutos_dia} minutos do teto</span></div>
  <div class="barra${pct >= 80 ? ' alto' : ''}"><i style="width:${pct}%"></i></div>
  <p class="leg">O Groq grátis dá até 480 minutos por dia e 120 por hora. Quando o teto chega, a ponte para e quem grava vê que a cortesia de hoje acabou. Não gera cobrança.</p>
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

<p class="leg">Nada aqui identifica ninguém. Cada aparelho é um código sorteado nele mesmo, sem nome nem e-mail. Endereços de internet entram embaralhados e são apagados todo dia. Nenhum áudio e nenhum texto ficam guardados.</p>
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
