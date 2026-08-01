# Regras para agentes de IA neste repositório

Este repositório é editado por mais de um agente de IA (e pelo mantenedor).
Estas regras existem para que um agente nunca destrua ou "varra" o trabalho
de outro. Elas NÃO são opcionais.

## 1. Branch obrigatório para tarefas delegadas

- Antes de editar qualquer arquivo, crie um branch com seu nome e a tarefa:
  `git checkout -b kimi/nome-da-tarefa` (ou `<seu-agente>/nome-da-tarefa`).
- NUNCA commite diretamente na `main`. Ao terminar, faça push do branch e
  informe o usuário — o merge é decisão dele.

## 2. Árvore suja não é sua

- Antes de começar: rode `git status`. Se houver mudanças que você não fez,
  **PARE e avise o usuário** — outro agente pode estar trabalhando agora.
- Jamais commite mudanças que não são suas. Isso já aconteceu duas vezes
  neste repo (commits `751e758` e `b668404` levaram trabalho alheio junto).

## 3. Commits cirúrgicos

- Use `git add <arquivo específico>` — NUNCA `git add -A`, `git add .` ou
  `git commit -a`.
- Um commit por assunto, mensagem descrevendo só o que VOCÊ fez.

## 4. O que nunca entra no repositório (é público!)

- Relatórios de execução, prompts-mestres e documentação interna de trabalho.
  Salve-os em `PLANO_DIRETOR/` (pasta local, já ignorada pelo git).
- Chaves de API, senhas ou qualquer segredo — em nenhuma hipótese, nem em
  comentário, nem em exemplo.
- Não edite o `.gitignore`.

## 5. Convenções do código (index.html é o app inteiro)

- Toda string de interface nova passa por `t()` e ganha tradução no `I18N_EN`.
- Valide os 3 blocos `<script>` com `new Function()` no Node antes de commitar.
- Dados de usuário no DOM: sempre `escHtml()` / `escJs()` / `safeColor()`.
- Não adicione scripts de CDN (a CSP bloqueia; bibliotecas são vendorizadas).
- Bump de `VOX_VERSION` (formato `ano.mês.dia.sequência`) em mudança visível.

## 6. Testar o app navegando de verdade (não só ler código)

- Use o simulador **`playwright-cli`** (instalado via `npm install -g @playwright/cli`,
  pelo agente Kimi). Ele controla um **Chromium real** — melhor que o emulador do
  Cloud Desktop. Comandos: `open <url>`, `goto`, `click <target>`, `fill <target> <txt>`,
  `snapshot`, `eval <func>`. Sempre confirme o **comportamento observado** (ex.: o texto
  final está num idioma diferente do original), não apenas "a função foi chamada".
- `file://` é **bloqueado** pelo Chromium. Para testar `index.html`, suba um servidor HTTP
  **totalmente destacado** (nunca em foreground no terminal, senão trava):
  `Start-Process -WindowStyle Hidden py -ArgumentList "-m","http.server",<PORT> -RedirectStandardOutput log.txt`
  e depois `playwright-cli goto http://localhost:<PORT>/index.html`.
- NUNCA use `Start-Process -NoNewWindow` com `http.server` — o servidor segura o terminal
  e a sessão "congela" (não é loop, é o processo filho esperando).
- Ao terminar o teste, mate o servidor: `Stop-Process -Name python* -Force`.
