// Ajustes do memorando das 8 perguntas do parecer (C8, 12/11/2026). Nenhuma rede.
// Rodar (na raiz do repositório): node testes/parecer-8.js [pasta-das-fotos]
const http=require('http'),fs=require('fs'),path=require('path');const {chromium}=require('playwright');
const R=path.resolve(__dirname,'..'),OUT=process.argv[2]||require('os').tmpdir();let f=0;const ok=(c,m,x)=>{console.log((c?'OK     ':'FALHA  ')+m+(!c&&x!==undefined?' '+JSON.stringify(x):''));if(!c)f++};
const MT={'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.wasm':'application/wasm'};
(async()=>{const srv=http.createServer((q,r)=>{const p=decodeURIComponent(new URL(q.url,'http://x').pathname);const a=path.join(R,p==='/'?'index.html':p);if(!fs.existsSync(a)||fs.statSync(a).isDirectory()){r.writeHead(404);r.end();return}r.writeHead(200,{'Content-Type':MT[path.extname(a)]||'application/octet-stream'});fs.createReadStream(a).pipe(r)});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+srv.address().port;const b=await chromium.launch();
for(const loc of ['en-US','pt-BR']){const en=loc==='en-US';
 const ctx=await b.newContext({viewport:{width:390,height:844},locale:loc,permissions:['clipboard-read','clipboard-write']});const pg=await ctx.newPage();const er=[];pg.on('pageerror',e=>er.push(e.message));
 await pg.route(u=>!u.href.startsWith(base),r=>r.fulfill({status:404,body:''}));
 await pg.goto(base+'/');await pg.waitForTimeout(4000);
 // Consulta com Gladia (treina por padrão)
 await pg.evaluate(()=>{try{_cortesiaFechar()}catch(e){}cfg.apiKeyGroq='gsk_x';cfg.provider='groqwhisper';cfg.diarEnabled=true;cfg.diarProvider='gladia';cfg.apiKeyGladia='g_x';cfg.audioSource='mic';sessionMode='consulta';_consAbrir(()=>{window.__gravou=1})});
 await pg.waitForTimeout(500);
 let st=await pg.evaluate(()=>{const a=document.querySelector('#consOv .cons-aviso');const ac=document.querySelector('#consOv .cons-aceite');const cs=getComputedStyle(ac),la=getComputedStyle(ac.querySelector('a'));const rs=document.querySelector('#consOv .cons-resps').getBoundingClientRect().top;return{av:a?a.textContent:'',forte:a?a.classList.contains('cons-aviso-forte'):false,fs:cs.fontSize,acima:ac.getBoundingClientRect().bottom<=rs,link:la.fontWeight,copiar:!!document.querySelector('#consOv .cons-copiar')}});
 ok(st.forte&&(en?/In consultations, prefer a service/.test(st.av):/Em consultas, prefira um serviço/.test(st.av)),loc+': Consulta + Gladia: aviso de treino em vermelho com a frase nova',st.av);
 ok(st.fs==='13px'&&st.acima&&+st.link>=600,loc+': linha do aceite 13px, acima das respostas, "Termos" destacado',st);
 ok(!st.copiar,loc+': fora do Online, sem botão de copiar aviso');
 await pg.locator('#consOv').screenshot({path:path.join(OUT,'c8-consulta-'+loc+'.png')});
 await pg.evaluate(()=>_consFechar());await pg.waitForTimeout(300);
 // Reunião sem treino: aviso normal
 await pg.evaluate(()=>{cfg.diarProvider='gladia';sessionMode='reuniao';_consAbrir(()=>{})});await pg.waitForTimeout(400);
 st=await pg.evaluate(()=>{const a=document.querySelector('#consOv .cons-aviso');return{forte:a?a.classList.contains('cons-aviso-forte'):null,av:a?a.textContent:''}});
 ok(st.forte===false&&!/prefer a service|prefira um serviço/.test(st.av),loc+': fora de Consulta, o aviso de treino continua como era',st);
 await pg.evaluate(()=>_consFechar());await pg.waitForTimeout(300);
 // Online
 await pg.evaluate(()=>{cfg.diarEnabled=false;cfg.audioSource='both';sessionMode='reuniao';_consAbrir(()=>{})});await pg.waitForTimeout(400);
 ok(await pg.locator('#consOv .cons-copiar').isVisible(),loc+': no Online, botão "Copiar aviso pra mandar no chat"');
 ok(await pg.evaluate(()=>!document.querySelector('#consOv [data-r="so_eu"]')),loc+': no Online, sem "Só eu falo" (como antes)');
 await pg.click('#consOv .cons-copiar');await pg.waitForTimeout(400);
 const clip=await pg.evaluate(()=>navigator.clipboard.readText()).catch(()=>'');
 ok(en?/I'll transcribe this call on my device/.test(clip):/Vou transcrever esta conversa no meu aparelho/.test(clip),loc+': copiou a frase certa',clip);
 ok(await pg.evaluate(()=>!!document.getElementById('consOv')&&!window.__gravou2),loc+': copiar não fecha a folha nem grava');
 const bt=await pg.textContent('#consOv .cons-copiar');ok(en?/Copied/.test(bt):/Copiado/.test(bt),loc+': botão confirma a cópia',bt);
 await pg.locator('#consOv').screenshot({path:path.join(OUT,'c8-online-'+loc+'.png')});
 await pg.evaluate(()=>_consFechar());
 // Comparativo
 await pg.evaluate(()=>{cfg.diarEnabled=true;cfg.diarProvider='assemblyai';_srvRender('diarizacao')});await pg.waitForTimeout(300);
 const cr=await pg.evaluate(()=>(document.querySelector('#gv-diarizacao .srv-criterio')||{}).textContent||'');
 ok(en?/Facts checked on the official pages on .*2026\. Policies change/.test(cr):/Fatos conferidos nas páginas oficiais em .*2026\. As políticas mudam/.test(cr),loc+': comparativo diz quando os fatos foram conferidos',cr);
 // nota grava a data nova dos termos
 const ln=await pg.evaluate(()=>_consLinha('x'));ok(en?/Terms of Nov 12, 2026/.test(ln):/Termos de 12 de nov/.test(ln),loc+': nota registra os Termos de 12/11',ln);
 ok(er.length===0,loc+': sem erros',er.slice(0,3));await ctx.close()}
const ctx=await b.newContext();const pg=await ctx.newPage();await pg.route(u=>!u.href.startsWith(base),r=>r.fulfill({status:404,body:''}));
await pg.goto(base+'/terms.html');const tt=await pg.textContent('body');
ok(/Last updated: November 12, 2026/.test(tt)&&/doesn't cover claims caused by our own fault/.test(tt)&&/someone else makes against us/.test(tt),'Termos: data nova e indenização estreita');
await pg.goto(base+'/privacy.html');const pp=await pg.textContent('body');
ok(/Last updated: November 12, 2026/.test(pp)&&/Vox never receives your audio or text, not even for these free transcriptions/.test(pp),'Privacidade: data nova e frase sobre dado de saúde');
await b.close();srv.close();console.log(f?f+' falha(s)':'Tudo verde');process.exit(f?1:0)})();
