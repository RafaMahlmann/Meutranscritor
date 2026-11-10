# Landing page do Vox

HTML único (sem build, sem framework), mesmo padrão de stack do app
principal (`index.html` na raiz do repo). Reconstruída a partir do export
Elementor/WordPress que estava no repo `CrisMahlmann/VoxCharmai`, que ficou
só como rascunho — nunca foi publicada.

## Estado atual

- 3 preços do Pro (mensal US$6 / anual US$59 / vitalício US$149, com early
  bird US$99 pros 50 primeiros) com seletor deslizante.
- Link de checkout do Freemius já ligado no botão "Assinar VOX Pro".
- Botões "grátis" apontam pra `https://app.voxcharmai.com/` — só funciona
  de verdade depois que o DNS separar `app.voxcharmai.com` (o app) de
  `voxcharmai.com` (esta landing), que é a arquitetura combinada.
- Seletor de idioma e vitrine do app adicionados numa passada seguinte.

## Falta antes de publicar de verdade

- Termos de Uso / Política de Privacidade — os links do rodapé ainda não
  levam a páginas reais.
- DNS: `voxcharmai.com` (raiz) → esta landing; `app.voxcharmai.com` → o
  Vox de verdade (hoje a raiz ainda serve o app).
- Conferir de novo em Chromium e WebKit depois de qualquer mudança nova.

Contexto completo da decisão (preço, gating do Free, ordem de execução)
está no Plano Diretor, que não vai pro Git de propósito (repo público,
doc tem estratégia comercial) — combinar por fora entre máquinas quando
precisar dele.

## Páginas internas (10/11/2026, Equipe D, doc 33 L2.2 e L2.8)

- `vox-vs-audiopen.html`, `vox-vs-otter.html`, `vox-vs-wispr-flow.html`,
  `audiopen-alternative.html` e `affiliates.html`. Só inglês (são páginas de
  busca). Dividem `vox-pages.css` e `vox-pages.js` (a mesma medição da landing).
- **Fato sobre concorrente tem data.** Cada página diz "Checked on the official
  pages on <data>". Antes de mexer em preço ou função de concorrente, abrir a
  página oficial dele de novo e trocar a data.
- Ao copiar pro `vox-landing`: levar os 5 `.html`, `vox-pages.css`,
  `vox-pages.js`, `sitemap.xml` e o `index.html` (ganhou os links no rodapé).
