# Transcritor local do Vox

Uma versão do transcritor que roda **na sua própria máquina**.

Sem chave, sem cadastro, sem mensalidade de API. Seu áudio não sai do seu
computador, e transcrever não custa nada além da energia elétrica.

São cinco passos e leva uns 15 minutos, sendo que a maior parte é o computador
baixando sozinho enquanto você faz outra coisa. **Você não precisa saber
programar.** Se travar em algum passo, o próprio passo diz o que fazer.

---

## Antes de começar

Você vai precisar de:

- Um computador com **Windows**
- Cerca de **3 GB de espaço livre**
- Internet (só na instalação — depois nunca mais)

E é só. Não precisa de placa de vídeo, não precisa de máquina cara.

> **Um aviso pra você economizar tempo:** vários tutoriais na internet mandam
> instalar um programa chamado **FFmpeg** antes de tudo. **Não precisa.** Ele já
> vem embutido no que a gente vai instalar. Esse é o passo que mais faz gente
> desistir, e ele simplesmente não existe aqui.

---

## Passo 1 — Instale o Python

O Python é o motor que faz o transcritor funcionar. É um programa comum, de
instalador normal.

1. Vá em **https://www.python.org/downloads/**
2. Clique no botão amarelo grande de download
3. Abra o arquivo baixado

**Na primeira tela do instalador, marque a caixinha "Add Python to PATH"**, lá
embaixo, antes de clicar em Install. Ela vem desmarcada, e é o único detalhe
que importa nessa tela.

Depois é só ir clicando em avançar até o fim.

✅ **Deu certo quando:** a última tela do instalador diz *"Setup was successful"*.

---

## Passo 2 — Baixe a pasta do transcritor

Baixe a pasta `transcritor-local` (a mesma onde este arquivo está) e coloque ela
onde você quiser — Documentos, Área de Trabalho, tanto faz. Só evite pastas
sincronizadas com nuvem, tipo OneDrive, pra não ficar subindo arquivo grande à toa.

Dentro dela tem três arquivos:

| Arquivo | Pra que serve |
|---|---|
| `instalar.bat` | Você roda uma vez, na instalação |
| `iniciar_whisper.bat` | Você roda toda vez que for usar |
| `servidor.py` | O transcritor em si — não precisa abrir |

✅ **Deu certo quando:** você consegue ver os três arquivos na pasta.

---

## Passo 3 — Rode o instalador

Dê **dois cliques** no arquivo `instalar.bat`.

Vai abrir uma janela preta com letras — é assim mesmo, não é erro. Ela vai
baixar as ferramentas sozinha. Leva de 2 a 5 minutos, dependendo da sua internet.

Pode deixar rolando e ir fazer outra coisa.

✅ **Deu certo quando:** aparece **"Pronto! Instalação concluída."**

❌ **Se aparecer "O Python não foi encontrado":** o Passo 1 não terminou direito,
provavelmente por causa da caixinha "Add Python to PATH". Instale o Python de
novo, marcando ela, e rode o `instalar.bat` outra vez.

---

## Passo 4 — Ligue o transcritor

Dê **dois cliques** no arquivo `iniciar_whisper.bat`.

Ele pergunta qual modelo você quer. **Aperte Enter** pra escolher o Rápido —
é o recomendado, e você pode trocar depois pelo próprio Vox.

> **Na primeira vez, ele baixa o modelo.** São de 500 MB a 3 GB, conforme o
> tamanho escolhido. Isso acontece **uma vez só** — nas próximas você abre e
> está pronto em segundos. Pode deixar baixando e ir tomar um café.

✅ **Deu certo quando:** aparece **"Modelo carregado! Servidor pronto."**

**Deixe essa janela preta aberta enquanto estiver usando.** Ela é o transcritor.
Se fechar, ele desliga.

---

## Passo 5 — Volte pro Vox

Abra o Vox, vá nas **Configurações** e escolha **Local**.

**E acabou.** Não tem chave pra colar, não tem endereço pra digitar, não tem
nada pra configurar. O Vox procura o transcritor sozinho e liga quando acha.

✅ **Deu certo quando:** o Vox mostra o modo Local ativo e o nome do modelo que
você escolheu.

---

## Usando no dia a dia

**Pra ligar:** dois cliques no `iniciar_whisper.bat`, Enter, e espere aparecer
"Servidor pronto".

**Pra desligar:** feche a janela preta. Nada fica rodando escondido no seu
computador.

**Pra trocar de modelo:** pelo próprio Vox, na tela de configurações. Ele
reinicia o servidor sozinho.

---

## Qual modelo escolher

O medidor de velocidade do Vox mostra quantos **segundos de processamento por
minuto de áudio** a sua máquina gasta. Abaixo de 10 fica verde. Acima de 60, o
transcritor deixa de acompanhar uma gravação ao vivo.

Estes números são de uma máquina comum, sem placa de vídeo dedicada:

| Modelo | Velocidade medida | Quando escolher |
|---|---|---|
| **Rápido** | ~18 s/min | Começa por aqui. Leve e com boa qualidade. |
| **Médio** | ~58 s/min | Só se a sua máquina for forte. |
| **Preciso** | ~95 s/min | Áudio difícil (sala com eco, microfone longe) e paciência. |

Na sua máquina os números vão ser outros — **o medidor te diz os seus**. Se o
Rápido estiver verde, vale testar o Médio; se estiver vermelho, fique no Rápido.

Sobre qualidade: os três acertam bastante. Em áudio limpo a diferença entre eles
é pequena. Ela cresce em áudio ruim, e é aí que o Preciso compensa a espera.

---

## Perguntas que aparecem sempre

**Meu áudio vai pra internet?**
Não. Nem na instalação, nem depois. A internet só é usada pra baixar o Python e
o modelo, uma vez.

**Preciso pagar alguma coisa?**
Não. Nem pra nós, nem pra ninguém. Não tem chave de API envolvida.

**Preciso instalar o FFmpeg?**
Não. Vários tutoriais mandam, mas ele já vem embutido.

**Funciona sem internet?**
Sim, depois de instalado. É justamente a graça.

**E se eu tiver placa de vídeo?**
O transcritor usa sozinho, e fica bem mais rápido. Ele avisa na primeira linha
qual está usando: *"Processando com: placa de vídeo"* ou *"o processador"*.
Isso vale pra placas NVIDIA, e pode exigir ajustes de driver — é um caminho
mais técnico, ainda em desenvolvimento.

**Dá pra usar de outro aparelho da casa?**
Dá — o servidor também entrega o app. De outro computador ou celular na mesma
rede, abra `http://IP-DO-COMPUTADOR:8000`. Só use isso em rede sua, de casa ou
do consultório: não existe senha nenhuma protegendo o transcritor.

**E separar quem falou (diarização)?**
Ainda não roda aqui. Com o transcritor local, a transcrição sai em texto
corrido. Se você precisa saber quem falou, use um serviço de diarização nas
configurações do Vox.

---

## Se você já mexe com Python

Um ambiente virtual é boa prática, e o `servidor.py` funciona igual dentro de um:

```
python -m venv .venv
.venv\Scripts\activate
pip install faster-whisper fastapi uvicorn python-multipart
python servidor.py small
```

O `faster-whisper` já traz o `ctranslate2` e o `av` (PyAV) junto — daí não
precisar de FFmpeg no sistema. Os outros três pacotes são do servidor HTTP.
