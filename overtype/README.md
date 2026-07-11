# Vendorizado: editor de card no Modo Foco

Arquivo oficial, hospedado aqui mesmo (não via CDN) para manter o app 100% autocontido e
compatível com nossa Content-Security-Policy — mesmo padrão do `md/` e do `ffmpeg/`.

- `overtype.js` — [OverType](https://github.com/panphora/overtype) v2.4.0 (licença MIT), build
  `dist/overtype.min.js`. Sobrepõe um textarea transparente a um preview estilizado, dando a
  sensação de editar texto formatado (negrito, títulos, listas) mantendo o dado como markdown
  puro — sem depender de nada externo, sem CSS/fonte separados.

Usado só no card em Modo Foco (`.focus-active`), montado/desmontado em `applyFocusCard()` —
ver `index.html`. O `<textarea>` original do card continua existindo (só escondido) e é ele
quem todo o resto do app (lentes de IA, tags, contagem de palavras, undo/refazer) lê/escreve
— o OverType só espelha o valor.
