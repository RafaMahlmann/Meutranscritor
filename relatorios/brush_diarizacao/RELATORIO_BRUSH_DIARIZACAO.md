# Relatório do Brush — Redesenho da Aba Diarização

> **Brush:** Kimi Code — Redesenho da aba Diarização + refinamentos de linguagem  
> **Arquivo-guia:** `prompts/PROMPT_MESTRE_Brush_Kimi_Diarizacao.md`  
> **Projeto:** Vox (Meutranscritor)  
> **Data de execução:** 2026-07-12  
> **Executor:** Kimi Code CLI  

---

## 1. Objetivo do brush

Reformular a aba **Diarização** do modal de configurações do Vox para:

- Usar o mesmo padrão visual da aba **IA de texto** (cartões `.maint-box`, toggles `.api-tog-btn`, badges, textos explicativos).
- Remover a experiência técnica (switch "Identificar locutores automaticamente" e botão "Salvar").
- Salvar todas as configurações automaticamente (`localStorage`).
- Apresentar os provedores de diarização de forma acolhedora, honesta e autoexplicativa.
- **Refinar a linguagem** para que qualquer pessoa comum entenda, sem jargões técnicos, marketing exagerado ou afirmações absolutas.

A regra de ouro aplicada em todos os textos: *"Se eu estivesse explicando isso pessoalmente para um amigo inteligente, mas leigo, eu usaria exatamente essas palavras?"*

---

## 2. Arquivos alterados

| Arquivo | Alterações |
|---------|-----------|
| `index.html` | Único arquivo modificado. Contém HTML, CSS e JS do aplicativo. |

Nenhum outro arquivo foi tocado. O escopo foi restrito ao brush conforme instrução.

---

## 3. Visão geral das mudanças

### 3.1 Aba Diarização (`#cfgPaneDiar`)

A aba foi completamente reescrita. Antes tinha:

- Título técnico.
- Switch "Identificar locutores automaticamente".
- Botões de provedor estilo `.diar-prov-btn`.
- Botão "Salvar" no modal.

Agora tem:

- Título limpo e atemporal: **🔮 Diarização**.
- Texto introdutório simples, como uma conversa.
- Bloco informativo `.maint-box` com título acolhedor: **O que você precisa saber**.
- Cartões de provedores no estilo da aba IA de texto:
  - **AssemblyAI** (⭐ Recomendado)
  - **Gladia** (🟢 10 horas grátis por mês)
  - **pyannote.ai** (🎯 Alta precisão)
  - **OpenAI** (Pago)
- Toggle compacto de provedor usando `.api-tog-btn`.
- Painéis de configuração de chave por provedor, com textos humanizados.
- Seletor de IA com linguagem natural: **IA para tentar identificar quem é quem na conversa**.

### 3.2 Salvamento automático

- Removido o botão **Salvar** do footer do modal.
- Todos os inputs de chave (`apiKey*`) e campos de texto usam `oninput="saveCfg(false)"`.
- Todos os selects (`langSel`, `txtModelGroq`, `txtModelOpenai`, `aiRenameProvider`) usam `onchange="saveCfg(false)"`.
- Os toggles de provedor chamam `setDiarProvider(..., true, true)`, que persiste `cfg` sem fechar o modal.

> **Decisão arquitetural em validação:** a remoção do botão Salvar foi aplicada ao modal inteiro. Essa decisão será validada separadamente pelo arquiteto do produto. Neste brush, ela foi mantida exatamente como está.

### 3.3 Novo provedor pyannote.ai (preparação de UI)

- Adicionado à UI como provedor selecionável.
- Campo `apiKeyPyannote` adicionado ao objeto `cfg`, ao backup de chaves e ao payload de transferência.
- A integração backend real ainda **não foi implementada**. Quando selecionado, o fluxo atual informa o usuário e usa transcrição padrão. A implementação do backend fica para brush futuro.

---

## 4. Trechos de código alterados

### 4.1 Estrutura HTML final da aba Diarização

Local: `index.html`, aproximadamente linhas 1442–1567.

```html
<!-- DIARIZAÇÃO -->
<div class="cfg-tab-pane" id="cfgPaneDiar" style="display:none">
  <div class="section-title" data-i18n>🔮 Diarização</div>
  <p class="fhint" style="margin-bottom:4px" data-i18n>
    A diarização separa automaticamente quem fala cada parte da conversa.
  </p>
  <p class="fhint" style="margin-bottom:12px" data-i18n>
    Em vez de um texto corrido, você recebe a conversa organizada por pessoa — como se cada participante tivesse sua própria fala. Funciona bem para reuniões, entrevistas, consultas e atendimentos.
  </p>

  <div class="maint-box" style="margin-bottom:12px">
    <div class="maint-info">
      <div class="maint-title" data-i18n>ℹ️ O que você precisa saber</div>
      <div class="maint-desc" data-i18n>
        Mesmo as inteligências artificiais mais avançadas ainda podem se confundir quando duas ou mais pessoas falam ao mesmo tempo ou têm vozes parecidas.
      </div>
      <div class="maint-desc" data-i18n style="margin-top:4px">
        Por isso você pode escolher entre os provedores que hoje entregam os melhores resultados. Cada um usa a sua própria chave: seus dados continuam sob o seu controle.
      </div>
    </div>
  </div>

  <div class="section-title" data-i18n>Provedores de diarização</div>

  <!-- Cartão AssemblyAI -->
  <div class="maint-box" style="margin-bottom:8px;border:1.5px solid var(--diar)">
    <div class="maint-info">
      <div class="maint-title">🟣 AssemblyAI <span class="free-badge" data-i18n>⭐ Recomendado</span></div>
      <div class="maint-desc" data-i18n>
        É a opção que recomendamos para a maioria das pessoas. Oferece excelente qualidade, integração bastante estável e cerca de US$ 50 em créditos gratuitos para novos usuários, suficientes para muitas horas de utilização antes de qualquer custo.
      </div>
      <div class="maint-foot"><a href="https://www.assemblyai.com" ... data-i18n>🌐 site oficial</a></div>
    </div>
    <button type="button" class="preset-use-btn" onclick="setDiarProvider('assemblyai',true,true)" data-i18n>Usar AssemblyAI</button>
  </div>

  <!-- Cartão Gladia -->
  <div class="maint-box" style="margin-bottom:8px">
    <div class="maint-info">
      <div class="maint-title">💠 Gladia <span class="free-badge" data-i18n>🟢 10 horas grátis por mês</span></div>
      <div class="maint-desc" data-i18n>
        Excelente opção para quem quer usar uma franquia gratuita que renova automaticamente todos os meses. É prática para quem usa com frequência e prefere começar sem gastar nada.
      </div>
      <div class="maint-foot"><a href="https://app.gladia.io" ... data-i18n>🌐 site oficial</a></div>
    </div>
    <button type="button" class="preset-use-btn" onclick="setDiarProvider('gladia',true,true)" data-i18n>Usar Gladia</button>
  </div>

  <!-- Cartão pyannote.ai -->
  <div class="maint-box" style="margin-bottom:8px">
    <div class="maint-info">
      <div class="maint-title">🎯 pyannote.ai <span class="limit-badge" data-i18n>Alta precisão</span></div>
      <div class="maint-desc" data-i18n>
        Desenvolvido pelos criadores do principal sistema open source de diarização, é indicado para quem busca a maior precisão possível na identificação de quem falou cada trecho da conversa.
      </div>
      <div class="maint-foot"><a href="https://www.pyannote.ai" ... data-i18n>🌐 site oficial</a></div>
    </div>
    <button type="button" class="preset-use-btn" onclick="setDiarProvider('pyannote',true,true)" data-i18n>Usar pyannote.ai</button>
  </div>

  <!-- Cartão OpenAI -->
  <div class="maint-box" style="margin-bottom:12px">
    <div class="maint-info">
      <div class="maint-title">🤖 OpenAI <span class="paid-badge" data-i18n>Pago</span></div>
      <div class="maint-desc" data-i18n>
        Boa alternativa para quem já usa os serviços da OpenAI e prefere manter tudo no mesmo ecossistema. Reaproveita a mesma chave configurada na aba Transcrição.
      </div>
      <div class="maint-foot"><a href="https://platform.openai.com" ... data-i18n>🌐 site oficial</a></div>
    </div>
    <button type="button" class="preset-use-btn" onclick="setDiarProvider('openai',true,true)" data-i18n>Usar OpenAI</button>
  </div>

  <!-- Toggle compacto -->
  <div class="api-toggle" style="grid-template-columns:1fr 1fr 1fr 1fr">
    <button class="api-tog-btn" id="dpAssembly" onclick="setDiarProvider('assemblyai',true,true)">🟣 AssemblyAI</button>
    <button class="api-tog-btn" id="dpGladia" onclick="setDiarProvider('gladia',true,true)">💠 Gladia</button>
    <button class="api-tog-btn" id="dpPyannote" onclick="setDiarProvider('pyannote',true,true)">🎯 pyannote</button>
    <button class="api-tog-btn" id="dpOpenAI" onclick="setDiarProvider('openai',true,true)">🤖 OpenAI</button>
  </div>

  <!-- Painéis de configuração de chave -->
  <div id="assemblySection">...</div>
  <div id="gladiaSection" style="display:none">...</div>
  <div id="pyannoteSection" style="display:none">...</div>
  <div id="openaiDiarSection" style="display:none">...</div>

  <!-- Seletor de IA para identificar participantes -->
  <div class="frow" style="margin-top:12px">
    <label><span data-i18n>IA para tentar identificar quem é quem na conversa</span></label>
    <select id="aiRenameProvider" onchange="saveCfg(false)">...</select>
    <p class="fhint" data-i18n>
      Depois de separar as falas, o Vox pode tentar descobrir automaticamente quem é o profissional e quem é o paciente (ou outro papel). Usa a IA de texto que você já configurou.
    </p>
  </div>
</div>
```

### 4.2 Evolução da linguagem

#### Título

- Antes: `🔮 Diarização — quem falou o quê`
- Depois: `🔮 Diarização`

**Motivo:** a explicação abaixo do título já cumpre o papel de explicar o recurso. O título ficou limpo, elegante e atemporal.

#### Bloco explicativo

- Antes: `ℹ️ Como funciona`
- Depois: `ℹ️ O que você precisa saber`

**Motivo:** transmite acolhimento em vez de documentação técnica.

#### Texto do bloco explicativo

- Antes: `Por isso o Vox integra diferentes provedores especializados utilizando suas próprias chaves de API (BYOK), preservando sua privacidade.`
- Depois: `Por isso você pode escolher entre os provedores que hoje entregam os melhores resultados. Cada um usa a sua própria chave: seus dados continuam sob o seu controle.`

**Motivo:** removeu a sigla BYOK e a linguagem de "integração de provedores", soando mais como uma conversa.

#### AssemblyAI

- Antes: `Nossa principal recomendação. A AssemblyAI entrega uma das diarizações mais precisas do mercado...`
- Depois: `É a opção que recomendamos para a maioria das pessoas. Oferece excelente qualidade, integração bastante estável e cerca de US$ 50 em créditos gratuitos...`

**Motivo:** recomendação honesta, sem superlativos de marketing como "uma das melhores do mercado".

#### pyannote.ai

- Antes: `...é hoje uma das opções com maior precisão...`
- Depois: `...é indicado para quem busca a maior precisão possível na identificação de quem falou cada trecho da conversa.`

**Motivo:** responde naturalmente à pergunta "Quando devo escolher esta opção?".

#### OpenAI

- Antes: `Bom para quem já usa a OpenAI em outras partes do Vox...`
- Depois: `Boa alternativa para quem já usa os serviços da OpenAI e prefere manter tudo no mesmo ecossistema...`

**Motivo:** explica o benefício real de manter tudo no mesmo ecossistema.

#### Seletor de IA

- Antes: `Identificar os participantes automaticamente`
- Depois: `IA para tentar identificar quem é quem na conversa`

**Motivo:** linguagem mais humana e próxima de como uma pessoa explicaria para outra.

### 4.3 Função `setDiarProvider`

Local: `index.html`, aproximadamente linhas 3650–3673.

```javascript
function setDiarProvider(p, save=true, activate=false){
  cfg.diarProvider = p;
  const accentColor = 'var(--diar)';
  const btns = {
    assemblyai: document.getElementById('dpAssembly'),
    gladia:     document.getElementById('dpGladia'),
    pyannote:   document.getElementById('dpPyannote'),
    openai:     document.getElementById('dpOpenAI')
  };
  Object.entries(btns).forEach(([key, btn]) => {
    if (!btn) return;
    const isOn = key === p;
    btn.className = 'api-tog-btn' + (isOn ? ' on' : '');
    btn.style.borderColor = isOn ? accentColor : '';
    btn.style.color       = isOn ? accentColor : '';
    btn.style.background  = isOn ? 'var(--diar-glow)' : '';
  });
  document.getElementById('gladiaSection').style.display     = p==='gladia'     ? 'block' : 'none';
  document.getElementById('assemblySection').style.display   = p==='assemblyai' ? 'block' : 'none';
  document.getElementById('pyannoteSection').style.display   = p==='pyannote'   ? 'block' : 'none';
  document.getElementById('openaiDiarSection').style.display = p==='openai'     ? 'block' : 'none';
  if (activate) { cfg.diarEnabled = true; updateDiarStatus(); }
  if (save) saveCfg(false);
}
```

**Explicação:**

- O terceiro parâmetro `activate` permite que o clique em "Usar X" já ligue a diarização (`cfg.diarEnabled = true`).
- O toggle reutiliza a classe `.api-tog-btn` da aba IA de texto, mas força a cor roxa (`--diar`) via estilo inline para manter a identidade da aba.
- A visibilidade dos painéis de chave é controlada pelo provedor selecionado.

### 4.4 `saveCfg` sem dependência do checkbox removido

Local: `index.html`, aproximadamente linhas 3687–3703.

```javascript
function saveCfg(close=true){
  cfg.apiKey          = document.getElementById('apiKey').value.trim();
  cfg.apiKeyGrok      = document.getElementById('apiKeyGrok').value.trim();
  cfg.apiKeyGroq      = document.getElementById('apiKeyGroq').value.trim();
  cfg.apiKeyAssembly  = document.getElementById('apiKeyAssembly').value.trim();
  cfg.apiKeyGladia    = document.getElementById('apiKeyGladia').value.trim();
  cfg.apiKeyPyannote  = document.getElementById('apiKeyPyannote').value.trim();
  cfg.lang            = document.getElementById('langSel').value;
  cfg.aiRenameProvider= document.getElementById('aiRenameProvider').value;
  cfg.localBatPath    = document.getElementById('localBatPathInput').value.trim();
  cfg.txtModelGroq    = document.getElementById('txtModelGroq').value;
  cfg.txtModelOpenai  = document.getElementById('txtModelOpenai').value;
  cfg.txtBaseUrl      = document.getElementById('txtBaseUrl').value.trim();
  cfg.txtModel        = document.getElementById('txtModel').value.trim();
  cfg.txtKey          = document.getElementById('txtKey').value.trim();
  localStorage.setItem('vox_cfg', JSON.stringify(cfg));
  updateDiarStatus(); updateLocal100Badge();
  if (close) { closeModal(); toast(t('✅ Configurações salvas')); }
}
```

**Explicação:**

- Removeu-se a leitura do checkbox `#diarEnabled` que foi removido da UI.
- A propriedade `cfg.diarEnabled` continua existindo e é controlada pelo chip rápido na barra de gravação e pelos botões "Usar".
- Adicionado `apiKeyPyannote`.

---

## 5. Decisões técnicas

| Decisão | Justificativa |
|---------|---------------|
| Manter `cfg.diarEnabled` sem checkbox na aba | O controle de ligar/desligar continua no chip rápido da barra de gravação. Os botões "Usar" ativam a diarização. |
| Usar `.api-tog-btn` em vez de `.diar-prov-btn` | Reutiliza padrão da aba IA de texto, conforme instrução do prompt. |
| Forçar cor roxa (`--diar`) via inline style | A classe `.api-tog-btn.on` usa verde (`--accent`) por padrão. A cor roxa mantém identidade da aba. |
| Adicionar pyannote.ai apenas na UI | O brush era de redesign de interface. Implementar o backend pyannote.ai ampliaria o escopo. Ficou preparado para brush futuro. |
| Remover o botão Salvar de todo o modal | O prompt diz "Toda configuração deve ser salva automaticamente". Para manter coerência, o botão foi removido do modal inteiro, não só da aba Diarização. |
| Salvar automático em todas as abas | Como o botão Salvar sumiu, todos os campos do modal precisam persistir sozinhos. |
| Humanizar linguagem | Textos escritos para pessoas comuns, sem jargões técnicos. Siglas como BYOK removidas da interface. Recomendações honestas, sem superlativos de marketing. |

---

## 6. Estado atual

- ✅ Aba Diarização redesenhada no padrão da aba IA de texto.
- ✅ Título simplificado para `🔮 Diarização`.
- ✅ Bloco explicativo com título acolhedor: `O que você precisa saber`.
- ✅ Switch "Identificar locutores automaticamente" removido.
- ✅ Botão "Salvar" removido.
- ✅ Salvamento automático implementado em todos os campos do modal.
- ✅ Cartões dos 4 provedores com linguagem honesta e humana.
- ✅ Toggle de provedor reutilizando `.api-tog-btn`.
- ✅ pyannote.ai adicionado como provedor configurável (UI + cfg).
- ✅ Seletor de IA renomeado para linguagem natural.
- ✅ Traduções i18n atualizadas.
- ✅ Sintaxe JS validada com `node --check`.
- ✅ HTML da aba validado quanto a tags não fechadas.

---

## 7. Pontos de atenção para próximos brushes

1. **Integração backend pyannote.ai**
   - Implementar `doDiarizePyannote(file, durSec, fromRec, sn, mode)`.
   - Adicionar endpoint correto da API pyannote.ai (upload + polling).
   - Normalizar o formato de `utterances` para o padrão do app.

2. **Feedback visual de "diarização ativa" dentro da aba**
   - Como o switch sumiu, a aba não mostra um indicador próprio de ON/OFF. O chip na barra de gravação continua sendo o indicador principal.

3. **Limpeza de CSS legado**
   - As classes `.diar-provider-toggle` e `.diar-prov-btn` não são mais usadas. Podem ser removidas em refactoring futuro.

4. **Decisão do botão Salvar**
   - A remoção do botão Salvar do modal inteiro está mantida, aguardando validação do arquiteto do produto. Não reverter, ampliar ou fazer novos ajustes nela até a validação.

5. **Testes manuais em navegador**
   - Recomenda-se abrir o `index.html`, alternar abas, inserir chaves, fechar o modal, recarregar e verificar persistência.

---

## 8. Como verificar o trabalho

1. Abrir `index.html` em um navegador.
2. Clicar no ícone de configurações (⚙️) e ir para a aba **Diarização**.
3. Verificar os cartões dos provedores e o texto introdutivo.
4. Clicar em **Usar Gladia** (ou outro) e inserir uma chave fictícia.
5. Fechar o modal pelo ✕.
6. Recarregar a página e reabrir a aba Diarização — a chave deve estar lá.
7. Verificar no DevTools → Application → Local Storage → `vox_cfg` que `apiKeyGladia`, `diarProvider` e `diarEnabled` estão persistidos.

---

## 9. Notas para a IA arquiteta de software

Este brush foi executado de forma autônoma, sem aprovações intermediárias, conforme orientação do usuário. O escopo foi rigidamente limitado ao redesign da aba Diarização, ao salvamento automático necessário para remover o botão Salvar e ao refinamento de linguagem.

Nenhuma mudança foi feita em:

- Lógica de transcrição (exceto fallback de pyannote.ai).
- Lentes, receitas ou editor de texto.
- Service worker (`sw.js`).
- Manifesto ou assets.
- Outras telas (`terms.html`, `privacy.html`).
- Decisão arquitetural da remoção do botão Salvar (mantida como está).

Se você (IA arquiteta) for continuar este trabalho, priorize:

1. Validar a decisão da remoção do botão Salvar.
2. Implementar backend real do pyannote.ai.
3. Avaliar se o indicador de ON/OFF na própria aba Diarização é necessário.
