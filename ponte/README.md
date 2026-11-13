# Ponte do Vox

O Vox não tem servidor: a chave de cada pessoa vai direto do aparelho para o
serviço de IA. A ponte é a **única exceção**, e é opcional: ela faz as
primeiras transcrições "por nossa conta", antes de a pessoa ter chave própria.

A chave do Vox não pode morar no app, porque o código do app é público. Então
ela mora aqui, como segredo do Cloudflare.

## O que ela faz

1. Recebe o áudio de uma gravação feita no app.
2. Pede a transcrição ao Groq (`whisper-large-v3-turbo`) com a chave do Vox.
3. Devolve o texto e esquece.

Desde 07/10/2026 também faz as primeiras **lentes** por nossa conta: recebe a
instrução da lente e o texto da nota, pede ao Groq (`openai/gpt-oss-120b`),
devolve a resposta e esquece. É o que deixa a pessoa sentir o "o Vox pensa com
você" antes de ter chave.

E informa ao app quantos **dias de Pro de presente** quem começa a usar ganha
(ajuste `pro_dias`; 0 desliga a promoção pra quem chegar depois).

**Não guarda** áudio, **não guarda** texto e não registra conteúdo em log.

**Conta só números** (tabelas em `schema.sql`):
- um código sorteado no próprio aparelho, sem nome nem e-mail, e quantas
  cortesias ele usou;
- totais por dia: transcrições, minutos, recusas;
- quantas lentes cada aparelho usou, e quantas por dia (sem o texto);
- se o aparelho depois conectou a própria chave (um sinal único, sem conteúdo);
- o endereço de internet, só embaralhado com o dia, para limitar abuso. É
  apagado no dia seguinte.

## Medição da landing

A landing (voxcharmai.com) avisa a ponte quando a página abre e quando alguém
clica em "Comece grátis" ou "Assinar" (`POST /v1/landing/evento`). Sem cookie e
sem código de terceiros. Fica guardado só:
- totais por dia: visitas, visitantes únicos, cliques em cada botão e pessoas
  que clicaram em cada botão (uma vez por visitante por dia, desde 08/10/2026:
  antes, uma pessoa que clicava 3 vezes fazia a taxa passar de 100%);
- de que site a visita veio (ou o `utm_source` do link), uma vez por visitante;
- o endereço de internet embaralhado com o dia, pra contar visitante único e
  frear abuso (60 eventos por endereço por dia). Apagado no dia seguinte.

Robôs conhecidos são ignorados. O painel junta isso com a cortesia num funil:
visitaram → clicaram em "Comece grátis" → usaram a cortesia → conectaram a
própria chave. As vendas ficam no painel do Freemius.

## Medição opcional do uso do app (08/10/2026)

Só de quem respondeu "sim" à pergunta do app ("Podemos contar como você usa o
Vox?", com "Sim" e "Não" do mesmo tamanho; muda no menu ⋯ › "Contar meu uso").
Sem cookie, sem Google, sem terceiros. O app manda `POST /v1/uso/eventos` só
com **nomes** de eventos de uma lista fechada (a ponte confere de novo e
ignora o resto) e o dia:
`abriu`, `gravou`, `arquivo`, `lente:<nome da lente do app>` (lente criada pela
pessoa vira `lente:propria`), `chave`, `presente_inicio`, `presente_fim`,
`tela_pro`, `assinou`, `limite_gravacao`, `limite_arquivo`,
`limite_diarizacao`, `limite_pasta`, `limite_recurso_pro`.

O aparelho entra com um código sorteado só pra isto (não é o da cortesia). Fica:
- `uso_aparelhos`: o código, o primeiro e o último dia contado;
- `uso_ativos`: em que dias ele abriu o app (é o que mostra quem volta);
- `uso_marcos`: a primeira vez em cada passo do funil;
- `uso_eventos`: totais por dia e por evento, de todo mundo somado.

As três primeiras somem 90 dias depois do último uso, e na hora se a pessoa
desligar no app (`POST /v1/uso/apagar`). Os totais por dia ficam. O endereço de
internet não é usado aqui. O painel mostra: quantos disseram sim, quem abriu em
7 e 30 dias, onde as pessoas param no funil, quem volta na semana 1, 2 e 3,
lentes mais usadas e limites do grátis batidos.

## Por que a conta não chega

- A chave é de uma conta **grátis** do Groq, **sem cartão**. Quando o limite
  do dia acaba, o Groq recusa. Não cobra.
- A ponte para antes disso, no teto escolhido no painel.
- A ponte roda no plano grátis do Cloudflare (Workers + D1), que bloqueia em
  vez de cobrar quando passa do limite.

Se um dia um cartão for colocado na conta do Groq, o teto do painel continua
valendo: ele é o máximo que a cortesia gasta por dia.

## As travas, na ordem

1. Cortesia ligada? (painel)
2. Arquivo até 5 MB (sobra para ~2 min no formato mais pesado que o app grava).
3. Teto de minutos do dia, somando todo mundo.
4. Pedidos por endereço de internet por dia.
5. Cortesias por aparelho. Aumentar vale para todos; diminuir só para
   aparelhos novos (quem já viu um número fica com ele).
6. Áudio muito mais longo que o permitido não veio do app: devolve o texto,
   mas fecha aquele endereço pelo resto do dia.

Falha do Groq não gasta a cortesia da pessoa.

## Painel

Desde 13/11/2026 o painel **não fica mais na ponte**: mora num Worker só dele,
`vox-painel` (`src/painel.js`, configuração `wrangler.painel.toml`), que usa o
**mesmo banco** da ponte. A ponte pública só manda quem abrir `/painel` pra lá
(302).

**Como entrar:** abra `https://vox-painel.flordeplasma.workers.dev/painel`. O
Cloudflare Access pede o login da conta Cloudflare (o mesmo que o cofre de senhas
já preenche) ou, se estiver ligado, manda um **código de uso único** pro e-mail. Sem senha pra lembrar. Só entram os
e-mails da lista.

Duas fechaduras:
1. **Cloudflare Access**, na frente do Worker: quem não está na regra nem chega
   ao código.
2. **O próprio código** confere o crachá que o Access põe em toda requisição
   (`Cf-Access-Jwt-Assertion`): assinatura RS256 com as chaves de
   `https://<TEAM_DOMAIN>/cdn-cgi/access/certs`, `aud` com o `POLICY_AUD`,
   `iss` = `https://<TEAM_DOMAIN>`, validade, e o e-mail dentro de
   `PAINEL_EMAILS`. Sem crachá válido: 403. Assim, se o Access for desligado ou
   não cobrir algum endereço, o painel continua fechado.

**Fecha por padrão:** faltando `TEAM_DOMAIN`, `POLICY_AUD` ou `PAINEL_EMAILS`, o
painel responde 503 ("painel desligado"). Publicar antes de ligar o Access não
abre nada. Os três são **segredos** (o repositório é público), nunca no código nem
no `.toml`. Prévias (`preview_urls`) estão desligadas no `vox-painel`.

**Chave do Groq:** mora só na ponte. O painel pergunta pela ligação interna
`PONTE` (Service Binding pro `vox-ponte`, porta `PonteParaPainel`), que só responde
"tem chave: sim/não" e não é um endereço da internet. Por isso **a ponte é publicada
antes do painel**. Se a ligação não responder, o painel diz isso, sem alarme falso.

**Erros do Groq por tipo** (desde 13/11/2026, tabela `erros_groq`, criada sozinha,
não apaga nada): por dia e por lugar (transcrição ou lente), quantos foram de cada
tipo: ocupado (429), formato (400), tamanho (413), chave (401/403), falha do Groq
(5xx), rede, resposta vazia. Só o número. O painel mostra um quadro e põe um
**alerta vermelho no topo** se houve erro nos últimos 7 dias. Erros de antes dessa
data aparecem como "sem tipo".

**Nome do áudio:** o app manda `gravacao.webm` quando a gravação não tem nome, mas o
Safari grava em MP4. Desde 13/11 a ponte manda pro Groq um nome que combina com o
tipo do áudio (`gravacao.m4a`, `.ogg`...).

O formulário de ajustes só aceita envio feito do próprio painel: `Origin` igual
à do painel (exata); sem `Origin`, `Referer` começando com o endereço do painel e
`/`. Ajuste salvo vale na hora, sem publicar nada.

O painel mostra os minutos de hoje, quantos aparelhos usaram, quantos chegaram ao
fim, quantos conectaram a própria chave, os últimos 30 dias, "De onde vieram", o
uso do app e os ajustes (liga/desliga, cortesias por aparelho, minutos por
gravação, teto do dia, limite por endereço).

Teste (Node 22+, sem conta da Cloudflare nem internet; gera a própria chave RSA no
papel do Access): `node --no-warnings testes/painel.mjs`, na pasta `ponte/`.

### Ligar o painel (uma vez)

Na pasta `ponte/`, com `npx wrangler login` feito:

```bash
npx wrangler deploy -c wrangler.painel.toml
```

1. **Zero Trust ativo na conta** (dash.cloudflare.com → Zero Trust). O plano
   **Free** ($0, até 50 pessoas) só ativa com um meio de pagamento cadastrado
   (cobra só o que passar do grátis). Os botões "Set up Zero Trust" e "Manage
   Access app" abrem outra aba; se o navegador bloquear, ir direto por
   `dash.cloudflare.com/<conta>/one`.
2. **Workers e Pages → vox-painel → aba Access → "Protect this Worker behind
   Access" → All traffic** (cobre workers.dev, rotas e prévias). Política:
   **"Cloudflare account"** (só quem é membro da conta Cloudflare). **Nunca "Email
   domain" com gmail.com**: abriria a porta de fora pra qualquer Gmail. **Apply
   Access.** Sem login, o endereço passa a mandar pra tela de entrada do Access.
   - Opcional, código por e-mail (não vem ligado): Zero Trust → Integrations →
     Identity providers → Add new → **One-time PIN**, e na aplicação do
     `vox-painel` (Zero Trust → Access → Applications) uma política com os e-mails
     do Rafa. O código vale 10 minutos e vem de `noreply@notify.cloudflare.com`.
3. Na mesma aba Access, em **"Application values"**: o **AUD** (vai em
   `POLICY_AUD`) e o JWKS `https://<time>.cloudflareaccess.com/cdn-cgi/access/certs`
   (o `<time>.cloudflareaccess.com` vai em `TEAM_DOMAIN`).
4. Gravar os segredos (o wrangler pede o valor escondido; no Windows **não** use
   `valor | wrangler ...`, o PowerShell 5.1 põe um caractere invisível no começo):

```bash
npx wrangler secret put TEAM_DOMAIN -c wrangler.painel.toml
npx wrangler secret put POLICY_AUD -c wrangler.painel.toml
npx wrangler secret put PAINEL_EMAILS -c wrangler.painel.toml
```

`PAINEL_EMAILS`: os e-mails separados por vírgula. Tem que ter o **e-mail da conta
Cloudflare** (é o que vem no crachá de quem entra pelo login do Cloudflare) e os do
código por e-mail, se ele estiver ligado.

## Colocar no ar

```bash
npx wrangler login
npx wrangler d1 create vox-ponte        # copie o database_id pro wrangler.toml
npx wrangler d1 execute vox-ponte --remote --file schema.sql
npx wrangler deploy
npx wrangler secret put GROQ_KEY        # a chave do Groq (conta grátis, sem cartão)
npx wrangler secret put SAL_IP          # qualquer texto aleatório longo
```

Depois, o endereço publicado (`https://vox-ponte.<conta>.workers.dev`) entra em
`VOX_PONTE_URL`, no `index.html`. O painel é publicado à parte (ver "Ligar o
painel", acima).

## Endereços

- `POST /v1/cortesia/estado` `{aparelho}` → se ainda há cortesia para este aparelho.
- `POST /v1/cortesia/transcrever` (form: `audio`, `aparelho`, `idioma`) → `{texto, restantes, ultima}`.
- `POST /v1/cortesia/formou` `{aparelho}` → "este aparelho conectou a própria chave".
- `POST /v1/cortesia/lente` `{aparelho, messages, max_tokens, temperature}` → resposta no formato do OpenAI (`choices[0].message.content`) + `{restantes, ultima}`. Recusa: `esgotada` (402), `teto_dia`/`limite_ip`/`ocupado` (429), `grande` (413).
- `POST /v1/landing/evento` `{tipo:"visita",origem}` ou `{tipo:"clique",alvo:"gratis"|"assinar"}` → medição da landing (só aceita a origem voxcharmai.com).
- `POST /v1/uso/eventos` `{id, eventos:[{e, dia}]}` (até 50 por pedido, 400 por código por dia) → medição opcional do app.
- `POST /v1/uso/apagar` `{id}` → apaga tudo deste código (a pessoa desligou a medição).
- `GET /painel` → redireciona (302) pro painel no `vox-painel` (`PAINEL_URL`, no `wrangler.toml`).

Só aceita pedidos com `Origin` do app (`ORIGENS` no `wrangler.toml`) ou de
`localhost`, para testes.
