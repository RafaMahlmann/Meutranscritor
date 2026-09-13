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
