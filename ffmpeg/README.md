# Vendored: ffmpeg.wasm

Arquivos oficiais do projeto [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) (licença MIT), hospedados aqui mesmo (não via CDN) para manter o app 100% autocontido e compatível com nossa Content-Security-Policy.

- `@ffmpeg/ffmpeg` v0.12.15 — `ffmpeg.js` + `814.ffmpeg.js` (chunk interno, não mover/renomear)
- `@ffmpeg/util` v0.12.2 — `ffmpeg-util.js`
- `@ffmpeg/core` v0.12.10 (single-thread, sem exigência de COOP/COEP) — `core/ffmpeg-core.js` + `core/ffmpeg-core.wasm`

Usado como rede de segurança silenciosa: só é baixado pelo navegador do usuário quando a decodificação nativa de áudio falha (ex: OGG grande no Safari) ou o formato é raro (AMR, WMA, 3GP). Ver `transcodeWithFFmpeg()` em `index.html`.
