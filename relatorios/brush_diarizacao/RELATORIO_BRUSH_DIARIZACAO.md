# Relatório do Brush — Redesenho da Aba Diarização

> **Brush:** Kimi Code — Redesenho da aba Diarização + refinamento de linguagem  
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
- **Refinar a linguagem** para que qualquer pessoa comum entenda, sem jargões técnicos.

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

- Título amigável: **🔮 Diarização — quem falou o quê**.
- Texto introdutório explicando o que é diarização em linguagem natural.
- Bloco informativo `.maint-box` sobre os desafios reais de separar falantes e sobre o controle dos dados.
- Cartões de provedores no estilo da aba IA de texto:
  - **AssemblyAI** (⭐ Recomendado)
  - **Gladia** (🟢 10 horas grátis por mês)
  - **pyannote.ai** (🎯 Alta precisão)
  - **OpenAI** (Pago)
- Toggle compacto de provedor usando `.api-tog-btn`.
- Painéis de configuração de chave por provedor, com textos humanizados.
- Seletor de IA para identificar os participantes automaticamente.

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

### 4.1 Estrutura HTML da nova aba Diarização

Local: `index.html`, aproximadamente linhas 1442–1567.

```html
<!-- DIARIZAÇÃO -->
<div class="cfg-tab-pane" id="cfgPaneDiar" style="display:none">
  <div class="section-title" data-i18n>🔮 Diarização — quem falou o quê</div>
  <p class="fhint" style="margin-bottom:4px" data-i18n>
    Com a diarização, o Vox separa automaticamente quem fala cada parte da conversa.
  </p>
  <p class="fhint" style="margin-bottom:12px" data-i18n>
    Em vez de um texto corrido, você recebe a conversa organizada por pessoa — como se cada participante tivesse sua própria fala. É ideal para reuniões, entrevistas, consultas e atendimentos.
  </p>

  <div class="maint-box" style="margin-bottom:12px">
    <div class="maint-info">
      <div class="maint-title" data-i18n>ℹ️ Como funciona</div>
      <div class="maint-desc" data-i18n>
        Mesmo as inteligências artificiais mais avançadas ainda podem se confundir quando duas ou mais pessoas falam ao mesmo tempo ou têm vozes parecidas.
      </div>
      <div class="maint-desc" data-i18n style="margin-top:4px">
        Por isso o Vox permite que você escolha entre os provedores especializados que hoje oferecem os melhores resultados. Cada um usa a sua própria chave de API: seus dados continuam sob o seu controle.
      </div>
    </div>
  </div>

  <div class="section-title" data-i18n>Provedores de diarização</div>

  <!-- Cartão AssemblyAI -->
  <div class="maint-box" style="margin-bottom:8px;border:1.5px solid var(--diar)">
    <div class="maint-info">
      <div class="maint-title">🟣 AssemblyAI <span class="free-badge" data-i18n>⭐ Recomendado</span></div>
      <div class="maint-desc" data-i18n>
        Nossa principal recomendação. A AssemblyAI entrega uma das diarizações mais precisas do mercado, com uma integração madura e estável. Ao criar a conta, você recebe cerca de US$ 50 em créditos gratuitos — o que normalmente dá para usar por muitas horas antes de precisar pagar qualquer coisa.
      </div>
      <div class="maint-foot"><a href="https://www.assemblyai.com" ... data-i18n>🌐 site oficial</a></div>
    </div>
    <button type="button" class="preset-use-btn" onclick="setDiarProvider('assemblyai',true,true)" data-i18n>Usar AssemblyAI</button>
  </div>

  <!-- Cartões Gladia, pyannote.ai, OpenAI... -->

  <div class="api-toggle" style="grid-template-columns:1fr 1fr 1fr 1fr">
    <button class="api-tog-btn" id="dpAssembly" onclick="setDiarProvider('assemblyai',true,true)">🟣 AssemblyAI</button>
    <button class="api-tog-btn" id="dpGladia" onclick="setDiarProvider('gladia',true,true)">💠 Gladia</button>
    <button class="api-tog-btn" id="dpPyannote" onclick="setDiarProvider('pyannote',true,true)">🎯 pyannote</button>
    <button class="api-tog-btn" id="dpOpenAI" onclick="setDiarProvider('openai',true,true)">🤖 OpenAI</button>
  </div>

  <div id="assemblySection">...</div>
  <div id="gladiaSection" style="display:none">...</div>
  <div id="pyannoteSection" style="display:none">...</div>
  <div id="openaiDiarSection" style="display:none">...</div>

  <div class="frow" style="margin-top:12px">
    <label><span data-i18n>Identificar os participantes automaticamente</span></label>
    <select id="aiRenameProvider" onchange="saveCfg(false)">...</select>
    <p class="fhint" data-i18n>
      Depois de separar as falas, o Vox pode tentar descobrir automaticamente quem é o profissional e quem é o paciente (ou outro papel). Usa a IA de texto que você já configurou.
    </p>
  </div>
</div>
```

### 4.2 Bloco informativo humanizado

Antes:

```html
<div class="maint-title" data-i18n>ℹ️ Sobre a diarização</div>
<div class="maint-desc" data-i18n>Separar corretamente quem está falando continua sendo um dos maiores desafios da Inteligência Artificial.</div>
<div class="maint-desc" data-i18n style="margin-top:4px">Por isso o Vox integra diferentes provedores especializados utilizando suas próprias chaves de API (BYOK), preservando sua privacidade.</div>
```

Depois:

```html
<div class="maint-title" data-i18n>ℹ️ Como funciona</div>
<div class="maint-desc" data-i18n>Mesmo as inteligências artificiais mais avançadas ainda podem se confundir quando duas ou mais pessoas falam ao mesmo tempo ou têm vozes parecidas.</div>
<div class="maint-desc" data-i18n style="margin-top:4px">Por isso o Vox permite que você escolha entre os provedores especializados que hoje oferecem os melhores resultados. Cada um usa a sua própria chave de API: seus dados continuam sob o seu controle.</div>
```

**Princípio aplicado:** nenhuma sigla (BYOK removido), nenhuma afirmação de "desafio da IA" sem contexto humano. O usuário entende o porquê e mantém a confiança.

### 4.3 Cartão AssemblyAI melhorado

Antes:

```html
<div class="maint-desc" data-i18n>Nossa principal recomendação. Excelente qualidade de diarização, integração madura e aproximadamente US$50 em créditos gratuitos para novos usuários.</div>
```

Depois:

```html
<div class="maint-desc" data-i18n>Nossa principal recomendação. A AssemblyAI entrega uma das diarizações mais precisas do mercado, com uma integração madura e estável. Ao criar a conta, você recebe cerca de US$ 50 em créditos gratuitos — o que normalmente dá para usar por muitas horas antes de precisar pagar qualquer coisa.</div>
```

**Princípio aplicado:** explica *por que* é recomendado e traduz o crédito em valor concreto ("muitas horas"), sem soar como marketing.

### 4.4 Cartão pyannote.ai melhorado

Antes:

```html
<div class="maint-desc" data-i18n>Desenvolvido pelos criadores do principal sistema open source de diarização.</div>
```

Depois:

```html
<div class="maint-desc" data-i18n>Desenvolvido pelos criadores do principal sistema open source de diarização, é hoje uma das opções com maior precisão para identificar quem falou cada trecho da conversa.</div>
```

### 4.5 Função `setDiarProvider` reformulada

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

### 4.6 `saveCfg` sem dependência do checkbox removido

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
| Humanizar linguagem | Textos escritos para pessoas comuns, sem jargões técnicos. Siglas como BYOK removidas da interface. |

---

## 6. Estado atual

- ✅ Aba Diarização redesenhada no padrão da aba IA de texto.
- ✅ Switch "Identificar locutores automaticamente" removido.
- ✅ Botão "Salvar" removido.
- ✅ Salvamento automático implementado em todos os campos do modal.
- ✅ Cartões dos 4 provedores adicionados.
- ✅ Toggle de provedor reutilizando `.api-tog-btn`.
- ✅ pyannote.ai adicionado como provedor configurável (UI + cfg).
- ✅ Linguagem humanizada: nenhuma sigla técnica visível, explicações honestas e acolhedoras.
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
