// Teste do painel atrás do Cloudflare Access (13/11/2026) e do redirecionamento
// da ponte pública. Roda o código de verdade no Node, com um banco de mentira
// (node:sqlite) montado a partir do schema.sql e uma chave RSA gerada aqui
// mesmo, no papel do Access. Não precisa de conta da Cloudflare nem de internet.
//
// Rodar (Node 22 ou mais novo), na pasta ponte/:
//   node --no-warnings testes/painel.mjs
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
// D1 de mentira, só o que a ponte usa
const D1 = { prepare(sql) { let args = []; const st = { bind(...a) { args = a; return st; }, async first() { return db.prepare(sql).get(...args) ?? null; }, async run() { db.prepare(sql).run(...args); return {}; }, async all() { return { results: db.prepare(sql).all(...args) }; } }; return st; },
  async batch(sts) { for (const s of sts) await s.run(); return []; } };

// Os arquivos de src/ são módulos do Worker (import/export); o Node só os lê
// como módulos se a pasta disser isso. Copia pra uma pasta temporária que diz.
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'ponte-'));
// O "cloudflare:workers" só existe no Cloudflare: aqui vira uma classe de mentira.
for (const f of fs.readdirSync(new URL('../src/', import.meta.url))) fs.writeFileSync(path.join(pasta, f), fs.readFileSync(new URL('../src/' + f, import.meta.url), 'utf8')
  .replace("import { WorkerEntrypoint } from 'cloudflare:workers';", 'class WorkerEntrypoint { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }'));
fs.writeFileSync(path.join(pasta, 'package.json'), '{"type":"module"}');
const ponte = (await import('file://' + path.join(pasta, 'index.js'))).default;
const modPonte = await import('file://' + path.join(pasta, 'index.js'));
const painel = (await import('file://' + path.join(pasta, 'painel.js'))).default;

// ── O "Access" de mentira: um par de chaves RSA e o endereço das chaves públicas.
const TIME = 'vox-teste.cloudflareaccess.com';
const AUD = 'aud-de-teste-0123456789abcdef';
const par = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const intruso = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwkPub = await crypto.subtle.exportKey('jwk', par.publicKey);
let buscasChaves = 0;
let groqResponde = () => new Response(JSON.stringify({ text: 'oi', duration: 3 }), { headers: { 'Content-Type': 'application/json' } });
let groqRecebeu = null;
globalThis.fetch = async (u, init) => {
  if (String(u) === 'https://groq.test/audio') { groqRecebeu = init.body instanceof FormData ? init.body.get('file') : null; return groqResponde(); }
  if (String(u) === `https://${TIME}/cdn-cgi/access/certs`) {
    buscasChaves++;
    return new Response(JSON.stringify({ keys: [{ kid: 'k1', kty: 'RSA', alg: 'RS256', use: 'sig', e: jwkPub.e, n: jwkPub.n }] }), { headers: { 'Content-Type': 'application/json' } });
  }
  throw new Error('fetch inesperado: ' + u);
};
const b64u = (buf) => Buffer.from(buf).toString('base64url');
async function cracha(mudar = {}, chave = par.privateKey) {
  const agora = Math.floor(Date.now() / 1000);
  const cab = { alg: 'RS256', kid: 'k1', typ: 'JWT', ...(mudar.cab || {}) };
  const dados = { aud: [AUD], email: 'rafa@exemplo.com', exp: agora + 3600, iat: agora, nbf: agora, iss: `https://${TIME}`, type: 'app', sub: 'x', ...(mudar.dados || {}) };
  const corpo = b64u(JSON.stringify(cab)) + '.' + b64u(JSON.stringify(dados));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(corpo));
  return corpo + '.' + b64u(sig);
}

const ENDERECO = 'https://vox-painel.teste.workers.dev';
// A ligação PONTE de verdade: a classe da ponte, com a chave só no env da ponte.
const ponteComChave = new modPonte.PonteParaPainel({}, { GROQ_KEY: 'gsk-segredo' });
const env = { DB: D1, TEAM_DOMAIN: TIME, POLICY_AUD: AUD, PAINEL_EMAILS: 'outro@exemplo.com, Rafa@Exemplo.com', PONTE: ponteComChave };
const pede = (jwt, caminho = '/painel', init = {}, e = env) => painel.fetch(new Request(ENDERECO + caminho, {
  ...init, headers: { ...(jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {}), ...(init.headers || {}) },
}), e, {});

let falhas = 0; const ok = (c, m) => { console.log((c ? 'OK    ' : 'FALHOU') + ' ' + m); if (!c) falhas++; };

// ── Painel (vox-painel)
ok((await pede(null)).status === 403, 'sem crachá: 403');
ok((await pede('lixo.lixo.lixo')).status === 403, 'crachá malformado: 403');
ok((await pede(await cracha({}, intruso.privateKey))).status === 403, 'assinatura de outra chave: 403');
{ const j = await cracha(); const [a, b, s] = j.split('.'); const d = JSON.parse(Buffer.from(b, 'base64url')); d.email = 'outro-dono@exemplo.com';
  ok((await pede(`${a}.${b64u(JSON.stringify(d))}.${s}`)).status === 403, 'crachá certo com o e-mail trocado depois de assinado: 403'); }
ok((await pede(await cracha({ cab: { alg: 'none' } }))).status === 403, 'alg diferente de RS256: 403');
ok((await pede(await cracha({ cab: { kid: 'desconhecida' } }))).status === 403, 'chave (kid) que o Access não publicou: 403');
ok((await pede(await cracha({ dados: { aud: ['outro-aplicativo'] } }))).status === 403, 'aud errado: 403');
ok((await pede(await cracha({ dados: { iss: 'https://outro-time.cloudflareaccess.com' } }))).status === 403, 'emissor (iss) errado: 403');
ok((await pede(await cracha({ dados: { exp: Math.floor(Date.now() / 1000) - 3600 } }))).status === 403, 'crachá vencido: 403');
ok((await pede(await cracha({ dados: { nbf: Math.floor(Date.now() / 1000) + 3600 } }))).status === 403, 'crachá que ainda não vale (nbf no futuro): 403');
ok((await pede(await cracha({ dados: { email: 'estranho@exemplo.com' } }))).status === 403, 'e-mail fora da lista: 403');
ok((await pede(await cracha({ dados: { email: undefined } }))).status === 403, 'crachá sem e-mail (token de serviço): 403');
{ const r = await pede(await cracha());
  const html = await r.text();
  ok(r.status === 200 && html.includes('Painel da ponte do Vox') && html.includes('De onde vieram') && html.includes('action="/painel/ajustes"'),
    'crachá certo (e-mail da lista, maiúsculas não importam): 200 com os quadros, "De onde vieram" e os ajustes');
  ok(r.headers.get('Cache-Control') === 'no-store' && r.headers.get('X-Frame-Options') === 'DENY', 'página não fica em cache e não abre dentro de outro site'); }
ok((await pede(await cracha({ dados: { aud: 'aud-de-teste-0123456789abcdef' } }))).status === 200, 'aud como texto (não lista) também vale');
ok((await pede(await cracha(), '/')).status === 302, 'raiz do painel leva a /painel (302)');

// Chave do Groq: o painel pergunta à ponte e nunca vê a chave.
const AVISO_CHAVE = 'A chave do Groq ainda não foi colocada na ponte';
{ const html = await (await pede(await cracha())).text();
  ok(!html.includes(AVISO_CHAVE) && !html.includes('gsk-segredo'), 'ponte com chave: sem o aviso falso, e a chave não aparece no painel'); }
ok((await (await pede(await cracha(), '/painel', {}, { ...env, PONTE: new modPonte.PonteParaPainel({}, {}) })).text()).includes(AVISO_CHAVE), 'ponte sem chave: aviso vermelho da chave');
{ const html = await (await pede(await cracha(), '/painel', {}, { ...env, PONTE: undefined })).text();
  ok(!html.includes(AVISO_CHAVE) && html.includes('Não deu pra perguntar à ponte'), 'sem a ligação PONTE: diz que não deu pra perguntar (não alarma à toa)'); }
{ const html = await (await pede(await cracha(), '/painel', {}, { ...env, PONTE: { temChave: async () => { throw new Error('fora'); } } })).text();
  ok(html.includes('Não deu pra perguntar à ponte'), 'ligação PONTE com falha: mesma mensagem, painel abre'); }
ok(Object.getOwnPropertyNames(modPonte.PonteParaPainel.prototype).join() === 'constructor,temChave', 'a porta interna da ponte só tem temChave (nada que devolva a chave)');

// Ajustes: de outra origem, recusa; do próprio painel, grava.
const form = () => { const f = new URLSearchParams({ ligada: '1', por_aparelho: '7', max_minutos: '2', teto_minutos_dia: '100', por_ip_dia: '20', lentes_por_aparelho: '3', lentes_dia: '50', pro_dias: '7' }); return f; };
const valor = (k) => db.prepare('SELECT valor FROM ajustes WHERE chave = ?').get(k)?.valor;
const antes = valor('por_aparelho');
ok((await pede(await cracha(), '/painel/ajustes', { method: 'POST', body: form(), headers: { Origin: 'https://site-malvado.example' } })).status === 403, 'POST de ajustes vindo de outra origem: 403');
ok((await pede(await cracha(), '/painel/ajustes', { method: 'POST', body: form(), headers: { Origin: 'null' } })).status === 403, 'POST de ajustes com Origin "null": 403');
for (const [cab, nome] of [
  [{ Origin: ENDERECO + '.malvado.example' }, 'Origin que só começa com o endereço do painel (…workers.dev.malvado.example)'],
  [{ Origin: ENDERECO + ':8443' }, 'Origin com outra porta'],
  [{ Referer: ENDERECO + '.malvado.example/painel' }, 'sem Origin, Referer de …workers.dev.malvado.example'],
  [{ Referer: ENDERECO + '@malvado.example/' }, 'sem Origin, Referer com @ depois do endereço'],
  [{}, 'sem Origin nem Referer'],
]) ok((await pede(await cracha(), '/painel/ajustes', { method: 'POST', body: form(), headers: cab })).status === 403, `POST de ajustes: ${nome}: 403`);
ok(valor('por_aparelho') === antes, '...e nada foi gravado');
ok((await pede(null, '/painel/ajustes', { method: 'POST', body: form(), headers: { Origin: ENDERECO } })).status === 403, 'POST de ajustes sem crachá, mesmo da origem certa: 403');
{ const r = await pede(await cracha(), '/painel/ajustes', { method: 'POST', body: form(), headers: { Origin: ENDERECO } });
  ok(r.status === 303 && valor('por_aparelho') === 7, 'POST de ajustes do próprio painel, com crachá: grava e volta pro painel (303)'); }
{ db.exec("DELETE FROM ajustes WHERE chave = 'por_aparelho'");
  const r = await pede(await cracha(), '/painel/ajustes', { method: 'POST', body: form(), headers: { Referer: ENDERECO + '/painel' } });
  ok(r.status === 303 && valor('por_aparelho') === 7, 'sem Origin, Referer do próprio painel: grava (303)'); }

// Configuração faltando: fecha.
for (const falta of ['TEAM_DOMAIN', 'POLICY_AUD', 'PAINEL_EMAILS']) {
  const e = { ...env }; delete e[falta];
  const r = await pede(await cracha(), '/painel', {}, e);
  ok(r.status === 503 && (await r.text()).includes('desligado'), `sem ${falta}: 503 "painel desligado", mesmo com crachá certo`);
}
ok((await pede(await cracha(), '/painel', {}, { ...env, TEAM_DOMAIN: 'https://' + TIME + '/' })).status === 200, 'TEAM_DOMAIN com https:// e barra no fim também funciona');
ok(buscasChaves === 1, `as chaves públicas foram buscadas uma vez só e guardadas (buscas: ${buscasChaves})`);

// ── Ponte pública (vox-ponte)
const envPonte = { DB: D1, SAL_IP: 'sal', ORIGENS: 'https://app.voxcharmai.com', PAINEL_URL: ENDERECO + '/painel', PAINEL_SENHA: 'nao-usada-mais' };
const naPonte = (caminho, init = {}, e = envPonte) => ponte.fetch(new Request('https://ponte.test' + caminho, init), e, {});
for (const c of ['/painel', '/painel/ajustes']) {
  const r = await naPonte(c, { headers: { Authorization: 'Basic ' + btoa('rafa:nao-usada-mais') } });
  ok(r.status === 302 && r.headers.get('Location') === ENDERECO + '/painel', `ponte: ${c} redireciona (302) pro painel novo, senha nenhuma abre nada`);
}
ok((await naPonte('/painel/ajustes', { method: 'POST', body: form(), headers: { Origin: 'https://ponte.test' } })).status === 302, 'ponte: POST de ajustes também só redireciona');
ok(valor('por_aparelho') === 7, '...e não grava nada');
{ const e = { ...envPonte }; delete e.PAINEL_URL; ok((await naPonte('/painel', {}, e)).status === 404, 'ponte sem PAINEL_URL: 404, sem painel'); }
ok((await naPonte('/')).status === 200, 'ponte: página inicial continua');
{ const r = await naPonte('/v1/cortesia/estado', { method: 'POST', body: JSON.stringify({ aparelho: 'a'.repeat(20) }), headers: { Origin: 'https://app.voxcharmai.com', 'Content-Type': 'application/json' } });
  ok(r.status === 200 && (await r.json()).ok !== false, 'ponte: rota do app (/v1/cortesia/estado) continua respondendo'); }
ok((await naPonte('/v1/cortesia/estado', { method: 'POST', body: '{}', headers: { Origin: 'https://site-malvado.example' } })).status === 403, 'ponte: rota do app continua recusando outra origem');
ok(db.prepare('SELECT COUNT(*) n FROM ips').get().n === 0, 'nenhuma trava de senha gravada no banco (a trava saiu)');

// ── Erros do Groq por tipo
const envGroq = { ...envPonte, GROQ_KEY: 'gsk-segredo', GROQ_URL: 'https://groq.test/audio' };
let nAparelho = 0;
const transcreve = (tipo = 'audio/webm;codecs=opus', nome = 'gravacao.webm') => {
  const fd = new FormData();
  fd.append('audio', new File([new Uint8Array(2000)], nome, { type: tipo }));
  fd.append('aparelho', 'aparelho-teste-' + String(++nAparelho).padStart(6, '0'));
  return naPonte('/v1/cortesia/transcrever', { method: 'POST', body: fd, headers: { Origin: 'https://app.voxcharmai.com' } }, envGroq);
};
const hojeBR = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
// Erro antigo, de antes da contagem por tipo (como os 7 de 12/11)
const ontem = new Date(Date.now() - 27 * 3600e3).toISOString().slice(0, 10);
db.prepare('INSERT INTO dias (dia, erros) VALUES (?, 7)').run(ontem);
ok((await (await pede(await cracha())).text()).includes('7 transcrições recusadas pelo Groq em ' + ontem.split('-').reverse().join('/')), 'alerta no topo pros 7 erros antigos (sem tipo)');
for (const [status, tipo] of [[400, 'formato'], [400, 'formato'], [429, 'ocupado'], [413, 'tamanho'], [401, 'chave'], [503, 'falha_groq'], [418, 'http_418']]) {
  groqResponde = () => new Response('{"error":{"message":"x"}}', { status });
  const r = await transcreve();
  ok(r.status === (status === 429 ? 429 : 502), `Groq ${status}: a pessoa recebe ${status === 429 ? '429 ocupado' : '502 falha'}, como antes`);
}
groqResponde = () => { throw new TypeError('rede'); };
ok((await transcreve()).status === 502, 'Groq fora da rede: 502 (antes virava 500 sem contar)');
const tipos = Object.fromEntries(db.prepare("SELECT tipo, n FROM erros_groq WHERE dia = ? AND onde = 'transcricao'").all(hojeBR).map((x) => [x.tipo, x.n]));
ok(JSON.stringify(tipos) === JSON.stringify({ chave: 1, falha_groq: 1, formato: 2, http_418: 1, ocupado: 1, rede: 1, tamanho: 1 }), 'erros guardados por tipo: ' + JSON.stringify(tipos));
ok(db.prepare('SELECT erros FROM dias WHERE dia = ?').get(hojeBR).erros === 8, 'e o total antigo (coluna erros) continua somando: 8');
ok(db.prepare('SELECT COUNT(*) n FROM aparelhos').get().n === 0, 'erro do Groq não gasta a cortesia de ninguém');
{ const html = await (await pede(await cracha())).text();
  ok(html.includes('8 transcrições recusadas pelo Groq em ' + hojeBR.split('-').reverse().join('/')), 'alerta no topo com os erros de hoje');
  ok(html.includes('Groq não aceitou o áudio ou o pedido: formato (400): 2') && html.includes('Falha do lado do Groq (5xx)') && html.includes('A ponte não conseguiu falar com o Groq (rede)'), 'tipos em palavras simples no alerta e no quadro');
  ok(html.includes('Sem tipo (de antes de 13/11'), 'os erros antigos aparecem como "sem tipo"'); }
// Lente
{ groqResponde = () => new Response('{}', { status: 500 });
  const r = await naPonte('/v1/cortesia/lente', { method: 'POST', body: JSON.stringify({ aparelho: 'aparelho-lente-0000001', messages: [{ role: 'user', content: 'oi' }] }), headers: { Origin: 'https://app.voxcharmai.com', 'Content-Type': 'application/json' } }, { ...envGroq, GROQ_CHAT_URL: 'https://groq.test/audio' });
  ok(r.status === 502 && db.prepare("SELECT n FROM erros_groq WHERE onde = 'lente' AND tipo = 'falha_groq'").get()?.n === 1, 'lente: erro do Groq também guardado por tipo'); }

// ── Nome do arquivo que vai pro Groq
groqResponde = () => new Response(JSON.stringify({ text: 'oi', duration: 3 }), { headers: { 'Content-Type': 'application/json' } });
for (const [tipo, nome, espera] of [
  ['audio/mp4', 'gravacao.webm', 'gravacao.m4a'],
  ['audio/webm;codecs=opus', 'gravacao.webm', 'gravacao.webm'],
  ['audio/ogg', 'blob', 'gravacao.ogg'],
  ['audio/mpeg', 'reuniao.mp3', 'reuniao.mp3'],
  ['', 'gravacao.webm', 'gravacao.webm'],
]) {
  const r = await transcreve(tipo, nome);
  ok(r.status === 200 && groqRecebeu?.name === espera, `áudio "${tipo || 'sem tipo'}" chamado ${nome} vai pro Groq como ${espera} (foi ${groqRecebeu?.name})`);
}

process.exit(falhas ? 1 : 0);
