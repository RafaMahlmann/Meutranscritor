# Vendored: renderização de Markdown

Arquivos oficiais, hospedados aqui mesmo (não via CDN) para manter o app 100% autocontido
e compatível com nossa Content-Security-Policy — mesmo padrão do `ffmpeg/`.

- `marked.js` — [marked](https://github.com/markedjs/marked) v18.0.5 (licença MIT), build UMD (`lib/marked.umd.js`). Converte Markdown → HTML.
- `dompurify.js` — [DOMPurify](https://github.com/cure53/DOMPurify) v3.4.11 (licença Apache-2.0/MPL-2.0), build `dist/purify.min.js`. Sanitiza o HTML gerado antes de qualquer `innerHTML`.

Usado só na visualização (👁 Preview) do card: `marked.parse(texto)` seguido SEMPRE de
`DOMPurify.sanitize(...)` antes de inserir no DOM — o texto do usuário nunca vai puro pro
`innerHTML`. Ver `toggleCardPreview()` em `index.html`.
