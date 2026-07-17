# Fix cirúrgico: badge de velocidade (`#speedBadge`) — uma linha só, alinhado à esquerda, sem sobreposição

## Contexto do projeto
- Repo: `C:\Users\xrafa\Programas\Meutranscritor` (app Vox · My Transcriber, single-file `index.html`).
- Fluxo: criar branch `kimi/fix-speedbadge-linha` a partir da `main`, commit descritivo, push, e merge direto na `main` sem perguntar (o usuário autorizou merge automático).
- Antes de commitar: validar os 3 blocos `<script>` com Node (`new Function()`) e fazer bump de `VOX_VERSION`.
- Este prompt é autocontido: você não vê imagens, então o estado atual e o estado desejado estão descritos em texto abaixo. Confie na descrição.

## O elemento
O badge de velocidade do provedor é o `#speedBadge`, que fica dentro de `.cfg-wrap`, logo abaixo do botão `#btnCfg` (o "balão" verde que mostra ⚙ + `Groq`/`Whisper`). Ele exibe a velocidade de transcrição e a contagem: `⏱ 2s/min · 31 gravações` (o `⏱ Xs/min` em verde, o `· N gravações` em azul no tema escuro / escuro no tema claro).

Antes de editar, rode `grep -n "speedBadge\|cfg-wrap" index.html` e leia o markup, o CSS e o JS atual desse bloco.

## Estado atual (o bug, descrito em texto)
Hoje o `#speedBadge` está com `position:absolute; top:calc(100% + 2px); right:0; text-align:right` dentro de `.cfg-wrap` (que tem só a largura do botão). Resultado renderizado:

- **Windows/desktop:** o texto quebra em 2 linhas empilhadas:
  ```
  ⏱ 2s/min · 31
        gravações
  ```
- **iPhone/mobile:** o texto quebra em 3 linhas e a última **sobrepõe os botões de tamanho de fonte (A A A)** da barra `.stats` que vem abaixo:
  ```
  ⏱ 9s/min
       · 24
  gravações   ← renderizada EM CIMA dos botões A A A
  ```

## Causa raiz (não desvie dela)
1. `right:0` + container com largura do botão (~70px) ⇒ largura útil insuficiente ⇒ a string quebra em 2–3 linhas.
2. `position:absolute` tira o badge do fluxo ⇒ nenhum espaço é reservado abaixo do header ⇒ no mobile o texto escorrido sobrepõe a barra `.stats`.

## Resultado desejado (especificação visual exata)
Uma **única linha horizontal**, sem quebra, **alinhada à esquerda**, começando sob a borda esquerda do balão `#btnCfg`:

```
[Exportar] [⚙ Groq] [PT]
           ⏱ 2s/min · 31 gravações
─────────────────────────────────────  (barra .stats, intacta, NUNCA sobreposta)
```

Regras:
1. `⏱ Xs/min` e `· N gravações` na **mesma linha**, nunca empilhados, em qualquer viewport (desktop e mobile).
2. **Alinhamento à esquerda** do badge com a borda esquerda do balão (a linha pode se estender para a direita além do balão — não há problema; há espaço livre abaixo do header).
3. **Cores inalteradas**: verde no `Xs/min`, azul/escuro no `· N gravações`. As cores atuais estão aprovadas — não tocar.
4. **Nada de sobreposição**: a barra `.stats` (e os botões A A A) nunca pode ser coberta, em nenhum viewport.
5. Quando o badge estiver oculto (`display:none`, sem dados de velocidade), **nenhum espaço extra** pode aparecer no header.
6. Se a linha estender para a direita, manter `z-index` e `pointer-events` corretos para não bloquear clique no botão `PT` nem no próprio badge (o `onclick="toggleModelPicker()"` deve continuar funcionando).

## Implementação sugerida
1. **Linha única:** no CSS/markup do `#speedBadge`, garantir `white-space:nowrap`. Se hoje são dois blocos empilhados (ex.: `#speedBadgeLine1` / `#speedBadgeLine2`), transformar em `display:inline-flex; align-items:baseline; gap:5px` no badge (ou fundir em uma linha só), preservando os estilos de cor de cada trecho.
2. **Alinhar à esquerda:** trocar `right:0` por `left:0` e `text-align:right` por `text-align:left`.
3. **Reservar espaço (mata a sobreposição):** o badge continua `position:absolute`, mas o `.cfg-wrap` só ganha respiro quando o badge está visível:
   - CSS: `.cfg-wrap.has-badge{ margin-bottom:18px }` (o `margin-bottom` de um flex item aumenta a altura da fileira de botões, empurrando todo o conteúdo abaixo — inclusive no mobile).
   - JS: no lugar onde o badge recebe `display:none`/é exibido, sincronizar a classe: `wrap.classList.toggle('has-badge', visivel)` (pegue o wrap via `badge.closest('.cfg-wrap')`).
   - Desktop: como `.stats` já tem `margin-top` próprio, verifique o resultado e, se ficar espaço duplo exagerado, reduza o `margin-top` da `.stats` no `@media(min-width:641px)` para compensar (alvo: respiro visual equivalente ao atual, nem grudado nem distante).
4. Não alterar `top:calc(100% + 2px)` (posição vertical logo abaixo do balão está correta).

## O que NÃO mexer (escopo fechado)
- Não tocar em `.brand-stats`, `#bsc`, `#bstime` (linha de stats sob o título no mobile — está aprovada).
- Não tocar em `#statCount`, `#statTime`, nem na ordem dos itens da `.stats`.
- Não tocar no alinhamento dos balões do header (`.hd-actions`, `#btnCfg`, botão `PT`) — está aprovado.
- Não mudar cores, fontes ou tamanhos — só geometria (linha única, esquerda, espaço reservado).
- Nenhuma outra alteração fora desse bloco.

## Critérios de aceite (valide antes de commitar)
- [ ] Desktop: badge renderiza `⏱ 2s/min · 31 gravações` em **uma linha só**, alinhada à esquerda sob o balão, sem quebrar "gravações" para baixo.
- [ ] Mobile (≤640px): mesma linha única; a palavra "gravações" **não encosta** nem sobrepõe os botões A A A da `.stats`.
- [ ] Badge oculto ⇒ header sem espaço extra.
- [ ] `toggleModelPicker()` continua abrindo ao clicar no badge.
- [ ] 3 blocos `<script>` validados com Node; `VOX_VERSION` bumpado.

## Entrega
Branch `kimi/fix-speedbadge-linha`, commit tipo `fix: badge de velocidade em linha única alinhado à esquerda sem sobrepor stats`, push, e me perguntar se autorizo o merge na main.
