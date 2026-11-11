#!/bin/sh
# Monta a pasta que vai para o ar (GitHub Pages) só com o que o app usa.
# Usado pelo .github/workflows/static.yml (publicação) e pelo teste
# testes/site-publicado.js (que confere se não falta nada).
#
#   sh testes/montar-site.sh <pasta-de-saida>
#
# ARQUIVO NOVO que o app carrega (script, imagem, pasta) entra nas listas
# abaixo, senão ele dá 404 no ar.
set -e
DEST="${1:-_site}"
rm -rf "$DEST"
mkdir -p "$DEST"

# Arquivos soltos da raiz
for f in index.html sw.js manifest.json icon-192.png icon-512.png privacy.html terms.html LICENSE; do
  cp "$f" "$DEST/"
done

# Pastas que o app carrega (bibliotecas embutidas, logo, vídeo)
for d in Logo media ffmpeg jsqr lib md overtype; do
  cp -R "$d" "$DEST/"
done

echo "Site montado em $DEST: $(find "$DEST" -type f | wc -l) arquivos"
