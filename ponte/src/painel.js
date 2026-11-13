// Painel da ponte do Vox — Cloudflare Worker próprio (vox-painel), desde 13/11/2026.
//
// Por que separado da ponte: o Cloudflare Access (entrar com um código mandado
// por e-mail, sem senha pra lembrar) fecha o Worker INTEIRO. Ligado na ponte,
// bloquearia o app, que chama a ponte o tempo todo. Então o painel mora aqui,
// usando o MESMO banco D1 da ponte (binding DB) e as mesmas consultas, que
// continuam no src/index.js (importadas abaixo, nada duplicado). A ponte
// pública só redireciona /painel pra cá. Configuração: wrangler.painel.toml.
//
// Duas fechaduras, uma atrás da outra:
// 1. O Access, na frente do Worker: sem e-mail da lista, nem chega aqui.
// 2. Este código confere o crachá que o Access põe em toda requisição
//    (cabeçalho Cf-Access-Jwt-Assertion): assinatura RS256 com as chaves
//    públicas do Access, público (aud), emissor (iss), validade e e-mail.
//    Assim, se o Access for desligado ou não cobrir algum endereço (prévia,
//    rota), o painel continua fechado em vez de aberto.
//
// Fecha por padrão: sem TEAM_DOMAIN, POLICY_AUD ou PAINEL_EMAILS (segredos,
// nunca no código: o repositório é público), responde 503 "painel desligado".
import {
  LIMITES, USO_FUNIL, lerAjustes, hoje, esc, diaMenos, pessoasQueClicaram,
  garantirTabelasLentes, garantirTabelasUso, garantirColunasPessoas, usoApagarVelhos, garantirTabelaErros,
} from './index.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      const cfg = configAccess(env);
      if (!cfg) return texto('Painel desligado: falta configurar o Cloudflare Access (TEAM_DOMAIN, POLICY_AUD, PAINEL_EMAILS).\n', 503);
      const email = await confereCracha(request, cfg);
      if (!email) return texto('Acesso negado.\n', 403);
      if (url.pathname === '/') return Response.redirect(`${url.origin}/painel`, 302);
      if (url.pathname === '/painel' || url.pathname === '/painel/ajustes') return await paginaPainel(request, env, url);
      return texto('Não encontrado\n', 404);
    } catch (e) {
      // Nunca devolve o erro cru.
      return texto('Falha no painel.\n', 500);
    }
  },
};

function texto(t, status) {
  return new Response(t, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}

// ── Crachá do Cloudflare Access ─────────────────────────────────────────────

// TEAM_DOMAIN pode vir como "time.cloudflareaccess.com" ou com https:// e barra.
function configAccess(env) {
  const time = String(env.TEAM_DOMAIN || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
  const auds = String(env.POLICY_AUD || '').split(/[\s,;]+/).filter(Boolean);
  const emails = String(env.PAINEL_EMAILS || '').split(/[\s,;]+/).map((e) => e.toLowerCase()).filter(Boolean);
  if (!/^[a-z0-9.-]+$/.test(time) || !auds.length || !emails.length) return null;
  return { time, emissor: `https://${time}`, auds, emails };
}

const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const lerJson = (s) => JSON.parse(new TextDecoder().decode(b64url(s)));
const FOLGA_S = 60; // tolerância de relógio, em segundos

// Devolve o e-mail do crachá, ou null se qualquer conferência falhar.
export async function confereCracha(request, cfg) {
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion') || '';
  const partes = jwt.split('.');
  if (partes.length !== 3) return null;
  let cab, dados;
  try { cab = lerJson(partes[0]); dados = lerJson(partes[1]); } catch { return null; }
  if (cab.alg !== 'RS256' || !cab.kid) return null;
  const chave = await chavePublica(cfg.time, cab.kid);
  if (!chave) return null;
  let assinaturaOk = false;
  try {
    assinaturaOk = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', chave, b64url(partes[2]),
      new TextEncoder().encode(`${partes[0]}.${partes[1]}`));
  } catch { return null; }
  if (!assinaturaOk) return null;
  const agora = Math.floor(Date.now() / 1000);
  const aud = Array.isArray(dados.aud) ? dados.aud : [dados.aud];
  if (!aud.some((a) => cfg.auds.includes(a))) return null;
  if (dados.iss !== cfg.emissor) return null;
  if (typeof dados.exp !== 'number' || dados.exp + FOLGA_S < agora) return null;
  if (typeof dados.nbf === 'number' && dados.nbf - FOLGA_S > agora) return null;
  const email = typeof dados.email === 'string' ? dados.email.toLowerCase() : '';
  if (!email || !cfg.emails.includes(email)) return null;
  return email;
}

// Chaves públicas do Access, guardadas na memória do Worker por 1 hora. Se
// chegar um crachá com chave nova (o Access troca as chaves de tempos em
// tempos), busca de novo, no máximo uma vez por minuto.
let _chaves = { time: '', em: 0, buscouEm: 0, porKid: new Map() };
const CHAVES_VALIDADE_MS = 3600e3, CHAVES_REBUSCA_MS = 60e3;

async function chavePublica(time, kid) {
  const agora = Date.now();
  if (_chaves.time !== time) _chaves = { time, em: 0, buscouEm: 0, porKid: new Map() };
  const velha = agora - _chaves.em > CHAVES_VALIDADE_MS;
  if (velha || (!_chaves.porKid.has(kid) && agora - _chaves.buscouEm > CHAVES_REBUSCA_MS)) {
    _chaves.buscouEm = agora;
    try {
      const r = await fetch(`https://${time}/cdn-cgi/access/certs`);
      if (r.ok) {
        const { keys } = await r.json();
        const porKid = new Map();
        for (const k of keys || []) {
          if (k.kty !== 'RSA' || !k.kid) continue;
          porKid.set(k.kid, await crypto.subtle.importKey('jwk', { kty: 'RSA', n: k.n, e: k.e, alg: 'RS256', ext: true },
            { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
        }
        _chaves = { time, em: agora, buscouEm: agora, porKid };
      }
    } catch { /* fica com as que tinha; sem chave, o crachá é recusado */ }
  }
  return _chaves.porKid.get(kid) || null;
}

// ── Painel ──────────────────────────────────────────────────────────────────

// A chave do Groq mora só na ponte. O painel pergunta, pela ligação interna
// PONTE (Service Binding, wrangler.painel.toml), só "tem chave: sim/não".
// null = não deu pra perguntar (aí o painel diz isso, em vez de alarmar à toa).
async function perguntaChave(env) {
  try {
    if (!env.PONTE || typeof env.PONTE.temChave !== 'function') return null;
    return (await env.PONTE.temChave()) === true;
  } catch { return null; }
}

// Erros do Groq: os tipos (tabela erros_groq, desde 13/11/2026) e o total de
// cada dia (colunas `erros` antigas). A diferença é "sem tipo": erros de antes
// da contagem por tipo.
const DIAS_ALERTA = 7;
const NOMES_ERRO = {
  ocupado: 'Groq ocupado ou limite da conta grátis acabou (429)',
  formato: 'Groq não aceitou o áudio ou o pedido: formato (400)',
  tamanho: 'Arquivo grande demais pro Groq (413)',
  chave: 'Groq recusou a chave (401/403)',
  falha_groq: 'Falha do lado do Groq (5xx)',
  rede: 'A ponte não conseguiu falar com o Groq (rede)',
  vazia: 'Groq respondeu sem texto',
  sem_tipo: 'Sem tipo (de antes de 13/11, quando só se contava o total)',
};
const nomeErro = (t) => NOMES_ERRO[t] || (t.startsWith('http_') ? `Outro código do Groq (${t.slice(5)})` : t);
const ONDE = { transcricao: 'transcrição', lente: 'lente' };

async function errosPainel(env, dia) {
  await garantirTabelaErros(env);
  const d30 = diaMenos(dia, 29);
  const tipos = (await env.DB.prepare('SELECT dia, onde, tipo, n FROM erros_groq WHERE dia >= ? ORDER BY dia DESC, n DESC').bind(d30).all()).results || [];
  const totT = (await env.DB.prepare('SELECT dia, erros FROM dias WHERE dia >= ? AND erros > 0').bind(d30).all()).results || [];
  const totL = (await env.DB.prepare('SELECT dia, erros FROM lentes_dias WHERE dia >= ? AND erros > 0').bind(d30).all()).results || [];
  const linhas = tipos.map((x) => ({ ...x }));
  for (const [onde, tot] of [['transcricao', totT], ['lente', totL]]) {
    for (const x of tot) {
      const comTipo = tipos.filter((t) => t.dia === x.dia && t.onde === onde).reduce((s, t) => s + t.n, 0);
      if (x.erros > comTipo) linhas.push({ dia: x.dia, onde, tipo: 'sem_tipo', n: x.erros - comTipo });
    }
  }
  linhas.sort((a, b) => (a.dia < b.dia ? 1 : a.dia > b.dia ? -1 : b.n - a.n));
  return { linhas, desde: diaMenos(dia, DIAS_ALERTA - 1) };
}

const brDia = (d) => String(d).split('-').reverse().join('/');
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// Alerta vermelho no topo: um item por dia e por lugar, nos últimos 7 dias.
function htmlAlertaErros(erros) {
  const porDia = new Map();
  for (const x of erros.linhas) {
    if (x.dia < erros.desde) continue;
    const k = `${x.dia}|${x.onde}`;
    const g = porDia.get(k) || { dia: x.dia, onde: x.onde, n: 0, tipos: [] };
    g.n += x.n; g.tipos.push(x); porDia.set(k, g);
  }
  if (!porDia.size) return '';
  const itens = [...porDia.values()].map((g) => {
    const oque = g.onde === 'lente' ? plural(g.n, 'lente recusada', 'lentes recusadas') : plural(g.n, 'transcrição recusada', 'transcrições recusadas');
    const motivo = g.tipos.sort((a, b) => b.n - a.n).map((t) => `${esc(nomeErro(t.tipo))}: ${t.n}`).join('; ');
    return `<li><strong>${oque} pelo Groq em ${esc(brDia(g.dia))}</strong> · ${motivo}</li>`;
  }).join('');
  return `<div class="alerta"><strong>Erros do Groq nos últimos ${DIAS_ALERTA} dias.</strong> Quem usou a cortesia nessas horas não recebeu o texto (e não perdeu a cortesia). Detalhes no quadro "Erros do Groq", mais abaixo.<ul>${itens}</ul></div>`;
}

function htmlErros(erros) {
  const linhas = erros.linhas.map((x) => `<tr><td>${esc(brDia(x.dia))}</td><td>${esc(ONDE[x.onde] || x.onde)}</td><td style="text-align:left;white-space:normal">${esc(nomeErro(x.tipo))}</td><td>${x.n}</td></tr>`).join('')
    || '<tr><td colspan="4" class="vazio">Nenhum erro do Groq nos últimos 30 dias.</td></tr>';
  return `<div class="card">
  <h2>Erros do Groq (30 dias)</h2>
  <div class="rolar"><table><thead><tr><th>Dia</th><th>Onde</th><th style="text-align:left">O que foi</th><th>Quantos</th></tr></thead><tbody>${linhas}</tbody></table></div>
  <p class="leg" style="margin-top:12px">Só o tipo e a quantidade: nada da pessoa nem do áudio. "Ocupado" costuma passar sozinho. "Formato" repetido aponta pro jeito que algum navegador grava. "Chave" quer dizer trocar a chave do Groq na ponte.</p>
</div>`;
}

// O que o painel mostra da medição.
async function usoPainel(env, dia) {
  await garantirTabelasUso(env);
  await usoApagarVelhos(env);
  const d30 = diaMenos(dia, 29), d7 = diaMenos(dia, 6);
  const q = (sql, ...b) => env.DB.prepare(sql).bind(...b);
  const [tot, at7, at30, funil, lentes, limites, origens] = await Promise.all([
    q('SELECT COUNT(*) AS n FROM uso_aparelhos').first(),
    q('SELECT COUNT(DISTINCT id) AS n FROM uso_ativos WHERE dia >= ?', d7).first(),
    q('SELECT COUNT(DISTINCT id) AS n FROM uso_ativos WHERE dia >= ?', d30).first(),
    q('SELECT passo, COUNT(*) AS n FROM uso_marcos GROUP BY passo').all(),
    q("SELECT substr(evento, 7) AS lente, SUM(n) AS n FROM uso_eventos WHERE dia >= ? AND evento LIKE 'lente:%' GROUP BY evento ORDER BY n DESC LIMIT 12", d30).all(),
    q("SELECT evento, SUM(n) AS n FROM uso_eventos WHERE dia >= ? AND evento LIKE 'limite_%' GROUP BY evento ORDER BY n DESC", d30).all(),
    q("SELECT substr(evento, 8) AS origem, SUM(n) AS n FROM uso_eventos WHERE dia >= ? AND evento LIKE 'origem:%' GROUP BY evento ORDER BY n DESC", d30).all(),
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
  return { total: tot?.n || 0, at7: at7?.n || 0, at30: at30?.n || 0, semanas, passos, lentes: lentes.results || [], limites: limites.results || [], origens: origens.results || [] };
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
  const linhasOrig = (u.origens || []).map((x) => `<tr><td>${esc(x.origem)}</td><td>${x.n}</td></tr>`).join('') || '<tr><td colspan="2" class="vazio">Ninguém chegou por um link marcado ainda.</td></tr>';
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
    <div class="card"><h2>De onde vieram (30 dias)</h2><table><tbody>${linhasOrig}</tbody></table><p class="leg" style="margin-top:8px">Só quem abriu o app pela primeira vez por um link com <code>?utm_source=</code> e disse "sim" à contagem.</p></div>
  </div>
</div>`;
}


// A página em si (quadros + formulário de ajustes). Só é chamada depois de o
// crachá do Access ter sido conferido, lá embaixo, no `fetch` do Worker.
async function paginaPainel(request, env, url) {
  if (url.pathname === '/painel/ajustes') {
    if (request.method !== 'POST') return Response.redirect(`${url.origin}/painel`, 303);
    // Sem isto, outro site poderia enviar o formulário usando a sessão do
    // Access que o navegador já guardou. Só aceita envio feito do próprio painel.
    // Origem EXATA: "começa com" deixava passar https://<painel>.malvado.example.
    // Sem Origin, vale o Referer, que tem que começar com a origem e uma barra.
    const origem = request.headers.get('Origin');
    const referer = request.headers.get('Referer') || '';
    const doPainel = origem != null ? origem === url.origin : referer.startsWith(url.origin + '/');
    if (!doPainel) return new Response('Envio recusado.\n', { status: 403 });
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
  const erros = await errosPainel(env, dia);
  const temChave = await perguntaChave(env);
  return new Response(htmlPainel({ aj, dia, hojeRow, dias, faixas, total, formaram, fim, landing, origens, lentesHoje, lentes30, uso, erros, salvo: url.searchParams.has('salvo'), temChave }), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}

function htmlPainel({ aj, dia, hojeRow, dias, faixas, total, formaram, fim, landing, origens, lentesHoje, lentes30, uso, erros, salvo, temChave }) {
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
${temChave === false ? '<div class="alerta">A chave do Groq ainda não foi colocada na ponte. A cortesia fica desligada até lá.</div>' : ''}
${temChave === null ? '<div class="alerta">Não deu pra perguntar à ponte se a chave do Groq está lá (a ligação PONTE do painel não respondeu). O resto do painel está certo.</div>' : ''}
${htmlAlertaErros(erros)}
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

${htmlErros(erros)}

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
