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

**Não guarda** áudio, **não guarda** texto e não registra conteúdo em log.

**Conta só números** (tabelas em `schema.sql`):
- um código sorteado no próprio aparelho, sem nome nem e-mail, e quantas
  cortesias ele usou;
- totais por dia: transcrições, minutos, recusas;
- se o aparelho depois conectou a própria chave (um sinal único, sem conteúdo);
- o endereço de internet, só embaralhado com o dia, para limitar abuso. É
  apagado no dia seguinte.

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

`https://<endereço-da-ponte>/painel`: pede a senha (`PAINEL_SENHA`). Mostra os
minutos de hoje, quantos aparelhos usaram, quantos chegaram ao fim, quantos
conectaram a própria chave, os últimos 30 dias, e os ajustes (liga/desliga,
cortesias por aparelho, minutos por gravação, teto do dia, limite por
endereço). Ajuste salvo vale na hora, sem publicar nada.

## Colocar no ar

```bash
npx wrangler login
npx wrangler d1 create vox-ponte        # copie o database_id pro wrangler.toml
npx wrangler d1 execute vox-ponte --remote --file schema.sql
npx wrangler deploy
npx wrangler secret put GROQ_KEY        # a chave do Groq (conta grátis, sem cartão)
npx wrangler secret put PAINEL_SENHA    # a senha do painel
npx wrangler secret put SAL_IP          # qualquer texto aleatório longo
```

Depois, o endereço publicado (`https://vox-ponte.<conta>.workers.dev`) entra em
`VOX_PONTE_URL`, no `index.html`.

## Endereços

- `POST /v1/cortesia/estado` `{aparelho}` → se ainda há cortesia para este aparelho.
- `POST /v1/cortesia/transcrever` (form: `audio`, `aparelho`, `idioma`) → `{texto, restantes, ultima}`.
- `POST /v1/cortesia/formou` `{aparelho}` → "este aparelho conectou a própria chave".
- `GET /painel` → painel (com senha).

Só aceita pedidos com `Origin` do app (`ORIGENS` no `wrangler.toml`) ou de
`localhost`, para testes.
