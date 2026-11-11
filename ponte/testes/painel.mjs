// Teste da trava de senhas erradas do painel (06/11/2026, lote 17).
// Roda a ponte de verdade no Node, com um banco de mentira (node:sqlite) montado
// a partir do schema.sql. Não precisa de conta da Cloudflare nem de internet.
//
// Rodar (Node 22 ou mais novo), na pasta ponte/:
//   node --no-warnings testes/painel.mjs
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
// D1 de mentira, só o que a ponte usa
const D1 = { prepare(sql) { let args = []; const st = { bind(...a) { args = a; return st; }, async first() { return db.prepare(sql).get(...args) ?? null; }, async run() { db.prepare(sql).run(...args); return {}; }, async all() { return { results: db.prepare(sql).all(...args) }; } }; return st; },
  async batch(sts) { for (const s of sts) await s.run(); return []; } };
if (!crypto.subtle.timingSafeEqual) crypto.subtle.timingSafeEqual = (a, b) => { a = new Uint8Array(a); b = new Uint8Array(b); return a.length === b.length && a.every((x, i) => x === b[i]); };
// O src/index.js é um módulo do Worker; o Node só o lê como módulo com final .mjs.
import os from 'node:os'; import path from 'node:path';
const copia = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ponte-')), 'ponte.mjs');
fs.copyFileSync(new URL('../src/index.js', import.meta.url), copia);
const ponte = (await import('file://' + copia)).default;
const env = { DB: D1, PAINEL_SENHA: 'senha-certa-longa', SAL_IP: 'sal', ORIGENS: 'https://app.voxcharmai.com' };
const pede = (senha, ip = '1.1.1.1') => ponte.fetch(new Request('https://ponte.test/painel', { headers: { 'CF-Connecting-IP': ip, ...(senha != null ? { Authorization: 'Basic ' + btoa('rafa:' + senha) } : {}) } }), env, {});
let falhas = 0; const ok = (c, m) => { console.log((c ? 'OK    ' : 'FALHOU') + ' ' + m); if (!c) falhas++; };
ok((await pede(null)).status === 401, 'primeira visita sem senha: pede a senha (401) e não conta como erro');
ok((await pede('senha-certa-longa')).status === 200, 'senha certa entra (200)');
for (let i = 1; i <= 10; i++) { const r = await pede('errada' + i); if (i < 10) ok(r.status === 401, 'senha errada ' + i + ': recusa (401)'); else ok(r.status === 401, 'senha errada 10: recusa (401)'); }
ok((await pede('errada11')).status === 429, 'depois de 10 erros: painel travado pra este endereço (429)');
ok((await pede('senha-certa-longa')).status === 429, 'travado vale até com a senha certa (quem chutou não descobre que acertou)');
ok((await pede('senha-certa-longa', '2.2.2.2')).status === 200, 'outro endereço continua entrando com a senha certa');
const n = db.prepare("SELECT COUNT(*) n FROM ips").get().n;
ok(n === 1, 'o banco guardou só 1 linha embaralhada (nenhum endereço de verdade): ' + JSON.stringify(db.prepare('SELECT * FROM ips').all()).slice(0, 120));
process.exit(falhas ? 1 : 0);
