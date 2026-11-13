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
for (const f of fs.readdirSync(new URL('../src/', import.meta.url))) fs.copyFileSync(new URL('../src/' + f, import.meta.url), path.join(pasta, f));
fs.writeFileSync(path.join(pasta, 'package.json'), '{"type":"module"}');
const ponte = (await import('file://' + path.join(pasta, 'index.js'))).default;
const painel = (await import('file://' + path.join(pasta, 'painel.js'))).default;

// ── O "Access" de mentira: um par de chaves RSA e o endereço das chaves públicas.
const TIME = 'vox-teste.cloudflareaccess.com';
const AUD = 'aud-de-teste-0123456789abcdef';
const par = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const intruso = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwkPub = await crypto.subtle.exportKey('jwk', par.publicKey);
let buscasChaves = 0;
globalThis.fetch = async (u) => {
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
const env = { DB: D1, TEAM_DOMAIN: TIME, POLICY_AUD: AUD, PAINEL_EMAILS: 'outro@exemplo.com, Rafa@Exemplo.com' };
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

process.exit(falhas ? 1 : 0);
