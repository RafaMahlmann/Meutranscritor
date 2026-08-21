# Vendored: leitura de QR code pela câmera

Arquivo oficial, hospedado aqui mesmo (não via CDN) para manter o app 100% autocontido
e compatível com nossa Content-Security-Policy — mesmo padrão do `ffmpeg/` e `md/`.

- `jsQR.js` — [jsQR](https://github.com/cozmo/jsQR) v1.4.0 (licença Apache-2.0), build `dist/jsQR.js` minificado com `terser`. Decodifica QR code a partir de `ImageData` de um `<canvas>`.

Usado como fallback em navegadores sem suporte nativo à `BarcodeDetector` API (Safari/iOS,
Firefox). Carregado sob demanda via `_loadScriptOnce('jsqr/jsQR.js')` só quando o usuário
abre "Ler QR pela câmera" em `abrirReceberTransferencia()` — nunca no carregamento inicial
do app.
