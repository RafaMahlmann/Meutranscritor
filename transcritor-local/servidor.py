"""
Transcritor local do Vox — roda na sua própria máquina.

O áudio nunca sai daqui: nada é enviado pra internet, não existe chave de API,
não existe cadastro. O Vox conversa com este servidor pelo endereço
http://localhost:8000 e descobre ele sozinho.

Para iniciar, use o iniciar_whisper.bat (Windows) ou:
    python servidor.py small
"""
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import PlainTextResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
import ctranslate2
import tempfile, os, sys, uvicorn, threading, subprocess, time

AQUI   = os.path.dirname(os.path.abspath(__file__))
PYTHON = sys.executable
SELF   = os.path.abspath(__file__)

# O padrão é o Rápido (small). Foi medido: numa máquina comum, sem placa de
# vídeo dedicada, o Rápido faz ~18s por minuto de áudio, o Médio ~58 e o
# Preciso ~95. Acima de 60 o transcritor deixa de acompanhar uma gravação ao
# vivo, então os dois maiores só valem em máquina forte.
MODEL_NAME   = sys.argv[1] if len(sys.argv) > 1 else "small"
MODEL_LABELS = {"small": "Rápido", "medium": "Médio", "large-v3": "Preciso"}

if MODEL_NAME not in MODEL_LABELS:
    print(f"Modelo desconhecido: {MODEL_NAME}. Use small, medium ou large-v3.")
    sys.exit(1)

# Placa de vídeo: PERGUNTAR, nunca supor. Quem responde é o ctranslate2, que é o
# motor que o faster-whisper usa por baixo — NÃO use torch aqui, ele não é
# instalado junto e a checagem daria "sem placa" pra todo mundo, em silêncio.
try:
    TEM_GPU = ctranslate2.get_cuda_device_count() > 0
except Exception:
    TEM_GPU = False

DEVICE  = "cuda"    if TEM_GPU else "cpu"
COMPUTE = "float16" if TEM_GPU else "int8"

print("=" * 52)
print(f"  Transcritor local do Vox — modelo {MODEL_LABELS[MODEL_NAME]} ({MODEL_NAME})")
print(f"  Processando com: {'placa de vídeo' if TEM_GPU else 'o processador'}")
print("=" * 52)
print()
print("Carregando o modelo…")
print("(na primeira vez com um modelo novo, ele é baixado antes — de 500 MB")
print(" a 3 GB conforme o tamanho. Acontece uma vez só.)")
print()

model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE)

# flush=True porque é ESTA linha que o guia manda a pessoa procurar na tela —
# sem ele, o Python segura o texto no buffer quando a saída não é um console.
print("Modelo carregado! Servidor pronto.", flush=True)
print("Pode voltar pro Vox — ele encontra este servidor sozinho.")
print()
print("Para desligar: feche esta janela.")
print()

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/v1/local/model")
async def get_model():
    """O Vox bate aqui de tempos em tempos pra saber se o servidor está de pé."""
    return JSONResponse({
        "model": MODEL_NAME,
        "label": MODEL_LABELS.get(MODEL_NAME, MODEL_NAME),
        "device": DEVICE,
    })


@app.post("/v1/local/switch")
async def switch_model(body: dict):
    """Troca de modelo pela tela do Vox: sobe uma janela nova e encerra esta."""
    new_model = body.get("model", MODEL_NAME)
    if new_model not in MODEL_LABELS:
        return JSONResponse({"error": "Modelo inválido"}, status_code=400)

    def reiniciar():
        time.sleep(1)
        extra = {}
        if os.name == "nt":  # janela própria no Windows; nos outros, herda o terminal
            extra["creationflags"] = subprocess.CREATE_NEW_CONSOLE
        subprocess.Popen([PYTHON, SELF, new_model], **extra)
        os._exit(0)

    threading.Thread(target=reiniciar, daemon=True).start()
    return JSONResponse({"ok": True, "model": new_model})


@app.post("/v1/audio/transcriptions")
async def transcribe(
    file: UploadFile = File(...),
    language: str = Form(None),
    response_format: str = Form("text"),
):
    """
    Mesmo formato de chamada das APIs de transcrição, pra o Vox não precisar de
    um caminho especial. Separar quem falou (diarização) ainda não existe aqui —
    quando existir, responderá a response_format="diarized_json".
    """
    sufixo = os.path.splitext(file.filename or ".webm")[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=sufixo) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    try:
        segments, _ = model.transcribe(tmp_path, language=language or None)
        texto = " ".join(s.text.strip() for s in segments)
    finally:
        os.unlink(tmp_path)
    return PlainTextResponse(texto)


# Se o app estiver por perto, este servidor também serve ele — assim dá pra abrir
# o Vox direto em http://localhost:8000, sem internet nenhuma. Procura o
# index.html nesta pasta e na de cima; se não achar, segue só como transcritor.
for candidato in (AQUI, os.path.dirname(AQUI)):
    if os.path.isfile(os.path.join(candidato, "index.html")):
        app.mount("/", StaticFiles(directory=candidato, html=True), name="static")
        print(f"O app também está sendo servido em http://localhost:8000")
        break

if __name__ == "__main__":
    # A porta é fixa em 8000 de propósito: é onde o Vox procura o transcritor.
    # Se já tiver alguém nela, o erro cru do uvicorn não diz nada pra quem não
    # programa — então explicamos em português o que aconteceu.
    try:
        # host 0.0.0.0 permite abrir de outro aparelho da mesma rede (celular,
        # tablet) pelo IP deste computador. Em rede pública, prefira 127.0.0.1.
        uvicorn.run(app, host="0.0.0.0", port=8000)
    except OSError:
        print()
        print("=" * 52)
        print("  A porta 8000 já está ocupada.")
        print("=" * 52)
        print()
        print("Quase sempre isso quer dizer que o transcritor JÁ ESTÁ LIGADO")
        print("em outra janela — procure uma janela preta parecida com esta")
        print("e use aquela. Não precisa abrir duas.")
        print()
        print("Se não for o caso, reinicie o computador e tente de novo.")
        print()
        input("Aperte Enter para fechar.")
        sys.exit(1)
