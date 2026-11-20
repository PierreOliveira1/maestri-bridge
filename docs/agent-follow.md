# 🎯 Follow an agent / Acompanhar um agente

[English](#-english) · [Português do Brasil](#-português-do-brasil) · [Roadmap](agent-follow-roadmap.md)

## 🇺🇸 English

Follow a selected agent's cooperative code activity inside VS Code. The editor reveals the saved file, highlights the current range and shows a short, replyable decision note when the agent supplies one.

### Start and stay in control

1. Open a trusted local project and connect Maestri Bridge to Maestri through its existing pairing flow. In an empty editor window, **Follow agent** offers **Open project**.
2. Choose **Follow agent** in the Chat card, use the **target icon** beside an agent or in the **Agents/Chat** header, or run **Maestri: Follow agent**. Chat and Follow have independent agent choices.
3. Choose an agent and, for a multi-root window, the local project root. The extension sends that agent the session-specific helper instructions.
4. After a meaningful saved change, the agent publishes a `decision` with the provided helper, explaining what the highlighted code does and why it changed. A `focus` event shows a location for navigation. The extension checks the saved revision before revealing the range or displaying the note.
5. Use **Pause**, **Resume** or **Stop** in the colored Chat card, view header or Command Palette. Clicking the follow status also toggles pause/resume.

The Chat card shows the followed agent, Maestri workspace, local root, current file and latest verified note. **Change followed agent** opens the chooser again. Canceling keeps the current session. The latest note stays in the card with its original file and line numbers. The editor centers a verified range that is off-screen and keeps the preview group fixed. To open the preview beside your editor, set `maestriBridge.follow.previewPosition` to `beside` before starting the session.

Navigating, editing or leaving the window pauses following. While paused, the session retains the latest location and its explanation if available. **Resume** rechecks the saved revision before showing them. **Stop** clears the highlight and notes. Following is off after an extension restart.

### 🖼️ Real VS Code evidence

The images below record the original Development Host validation.

![Follow enabled, with a persistent agent indicator and an inline decision](images/agent-follow-active.png)

![Following paused, with the agent still identified](images/agent-follow-paused.png)

![Follow flow in the VS Code Extension Development Host](images/agent-follow.gif)

**Media note:** the GIF is a sequence of four real screenshots from the Extension Development Host: active with a note, paused, resumed and stopped. It is not continuous screen recording. The files and notes shown use a synthetic fixture; no HTML mockup is presented as extension evidence.

#### Live Follow recording

![Agent selection, two synthetic files and four contextual notes in the real Development Host](images/agent-follow-live.gif)

This 38.5-second clip comes from one continuous Development Host recording. Idle intervals were cut and local details were masked. It shows the picker, two saved files, edits to both and the agent's explanations inline and in the Chat card. The three fixture tests passed separately.

### 🔄 Interaction flow

```mermaid
stateDiagram-v2
    [*] --> Off
    Off --> Following: Choose agent and root
    Following --> Following: Saved revision matches
    Following --> Paused: Human navigation or Pause
    Following --> Paused: Dirty, changed or unavailable file
    Paused --> Following: Resume and recheck latest location
    Following --> Completed: Agent finishes
    Following --> Off: Stop or context change
    Paused --> Completed: Agent finishes
    Paused --> Off: Stop or context change
    Completed --> Off: Start a new session
```

### Commands / Comandos

Portable interaction overview / Visão estática do fluxo:

![Follow interaction / Fluxo de acompanhamento](images/agent-follow-flow.svg)

| Command ID | English | PT-BR |
| --- | --- | --- |
| `maestriBridge.follow.start` | Follow agent | Acompanhar agente |
| `maestriBridge.follow.pause` | Pause following | Pausar acompanhamento |
| `maestriBridge.follow.resume` | Resume following | Retomar acompanhamento |
| `maestriBridge.follow.stop` | Stop following | Parar acompanhamento |
| `maestriBridge.follow.reply` | Reply to agent | Responder ao agente |

### 🧩 Cooperative transport and boundaries

This version adds `/activity?event=<JSON>` beside the existing `/show` URI route. The user's explicit selection binds a random local session to an agent and a project root. Events carry a declared agent ID, a growing sequence number and a SHA-256 revision of canonical saved text. `/show` remains the manual walkthrough interface.

The paired Wire connection delivers instructions and replies. The activity URI itself **does not authenticate authorship**: a local process with the session context can construct an event. This is a cooperative pilot, not a new host-authenticated activity API or automatic interception of every editing tool.

The producer and consumer reject invalid paths and Windows alternate streams, bound payloads and ranges, and check file containment/revision. Sensitive file patterns, dirty buffers, stale content and unavailable targets are not automatically revealed. No code edit is repeated when activity publication fails. Pairing, TLS pins and human approvals retain their existing boundaries.

The colored card uses the existing Chat webview and theme colors. Public `StatusBarItem.backgroundColor` supports only error/warning theme backgrounds; the normal follow status therefore uses the agent accent on its text/icon. It does not modify global theme settings.

### ✅ Validation

These results refer to the original Development Host validation shown above.

| Check | Result |
| --- | ---: |
| Core Vitest suite | 266 passed |
| VS Code integration-layer Vitest suite | 254 passed |
| Node emitter suite | 16 passed |
| **Total executed tests** | **536 passed** |
| Typechecks | Core, extension and webview passed |
| Build | Extension, emitter bundle and chat bundle passed |
| Manual Extension Development Host | Follow, inline note, card Pause/Resume/Stop, persistent indicators and file decoration verified |

These counts are executed tests, not code-coverage percentages or latency measurements. Automated editor tests use mocked VS Code APIs; the manual Development Host check supplies the separate real-editor evidence.

![Executed tests / Testes executados](images/agent-follow-tests.svg)

Reproduce from the repository root after installing the existing lockfile dependencies:

```sh
pnpm typecheck
pnpm test
node --test --test-concurrency=1 skills/maestri-bridge/scripts/emit-activity.test.mjs
pnpm build
```

Use **Run Maestri extension** in the debugger, select a demo agent and let it publish a saved text-file range using the supplied session context. Test human navigation, an unsaved/stale target, Pause/Resume and Stop. Do not publish tokens, pairing codes, real secrets or private source in screenshots.

## 🇧🇷 Português do Brasil

Acompanhe a atividade cooperativa de código de um agente no VS Code. O editor revela o arquivo salvo, destaca o intervalo atual e mostra uma nota de decisão respondível quando o agente fornece uma explicação.

### Como usar

1. Abra um projeto local confiável e conecte a Bridge pelo pareamento existente. Em uma janela vazia, **Acompanhar agente** oferece a ação **Abrir projeto**.
2. Use **Acompanhar agente** no cartão do Chat, o **ícone de alvo** da linha do agente ou do cabeçalho de **Agentes/Chat**, ou **Maestri: Acompanhar agente** na paleta. Chat e acompanhamento têm seleções independentes.
3. Escolha o agente e, em uma janela com várias pastas, a raiz local. A extensão envia ao agente as instruções do helper para aquela sessão.
4. Após salvar uma alteração significativa, o agente usa `decision` para explicar o que o trecho faz e por que mudou. O evento `focus` indica uma localização para navegação. A extensão confere a revisão salva antes de revelar o trecho ou apresentar a nota.
5. Use **Pausar**, **Retomar** e **Parar** no cartão colorido, no cabeçalho ou na paleta. O indicador da barra também alterna pausa/retomada.

O cartão mostra agente, workspace Maestri, raiz local, arquivo em foco e a última nota validada. **Trocar agente acompanhado** abre o seletor novamente. Cancelar preserva a sessão atual. A última nota permanece no cartão com o arquivo e as linhas originais. O editor centraliza o trecho validado que está fora da área visível e mantém o grupo de prévia fixo. Para abrir a prévia ao lado, defina `maestriBridge.follow.previewPosition` como `beside` antes de iniciar a sessão.

Navegar, editar ou sair da janela pausa o acompanhamento. Durante a pausa, a sessão guarda a última localização e a explicação correspondente, se houver. **Retomar** confere a revisão salva antes de exibir o trecho e a nota. **Parar** limpa o destaque e as notas. O acompanhamento começa desligado após reiniciar a extensão.

### Limites importantes

Esta versão acompanha **um agente conduzindo o editor por vez**. O canal `/activity` é cooperativo: a identidade é declarada pelo emissor, não autenticada por uma API nova do host. O agente precisa publicar atividade após salvar; a extensão não intercepta universalmente todas as ferramentas de edição.

A conexão Wire pareada entrega instruções e respostas. Sessão, sequência e hash ajudam no roteamento e na consistência, mas não substituem autenticação de autoria. Arquivos sensíveis, fora da raiz física, não salvos, alterados ou indisponíveis não são revelados automaticamente. Pareamento, pins TLS e aprovações continuam humanos.

O fundo colorido fica no cartão do Chat. A API nativa da barra de status limita fundos a aviso/erro; por isso o indicador normal usa o acento no texto/ícone, sem mudar o tema global.

### Evidência e testes

As imagens registram a validação original no Development Host. O GIF reúne quatro screenshots reais com os estados ativo com nota, pausado, retomado e parado.

O [novo recorte de 38,5 segundos](images/agent-follow-live.gif) veio de uma gravação contínua do Development Host. O recorte remove esperas e oculta detalhes locais. Ele mostra o seletor, a criação e a edição de dois arquivos sintéticos e as explicações do agente no trecho e no cartão. Os três testes da demonstração passaram em uma execução separada.

Foram executados **536 testes**: 266 do core, 254 da camada VS Code e 16 do emissor. Typechecks e builds passaram. Os testes automatizados do editor usam mocks; a validação manual comprovou o fluxo no VS Code, incluindo os botões do próprio cartão. Os números não representam cobertura percentual ou desempenho medido.

As futuras capacidades, dependências e critérios propostos estão no [roadmap bilíngue](agent-follow-roadmap.md).

## References / Referências

- [VS Code API: editor, URI handler, status bar and decorations](https://code.visualstudio.com/api/references/vscode-api)
- [VS Code webview accessibility](https://code.visualstudio.com/api/extension-guides/webview#accessibility)
- [Contribution guidelines](../CONTRIBUTING.md)
