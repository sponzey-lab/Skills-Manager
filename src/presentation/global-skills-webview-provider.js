export function createGlobalSkillsWebviewProvider({
  loadReadModel,
  onRemoveEnrollment,
  vscodeApi,
  extensionUri,
}) {
  let view;
  let readModel;

  return {
    kind: "webview",
    async resolveWebviewView(nextView) {
      view = nextView;
      view.webview.options = { enableScripts: true };
      view.webview.onDidReceiveMessage(async (message) => {
        if (message?.type !== "remove-global-enrollment" || !message.source) return;
        await onRemoveEnrollment?.({ source: message.source });
      });
      await refresh();
    },
    async refresh() {
      readModel = await loadReadModel();
      render();
    },
    setReadModel(nextReadModel) {
      readModel = nextReadModel;
      render();
    },
  };

  async function refresh() {
    readModel = await loadReadModel();
    render();
  }

  function render() {
    if (!view || !readModel) return;
    view.webview.html = globalSkillsHtml({
      readModel,
      iconUri: (clientType) => iconUriForClient({
        clientType,
        vscodeApi,
        extensionUri,
        webview: view.webview,
      }),
    });
  }
}

export function globalSkillsHtml({ readModel, iconUri = () => "" }) {
  const sources = new Map((readModel.mainRepositorySkills ?? []).map((skill) => [
    skill.id ?? skill.name,
    { id: skill.id ?? skill.name, name: skill.name, sourcePath: skill.sourcePath },
  ]));
  const rows = (readModel.globalSkills ?? []).map((row) => {
    const source = row.sourceId ? sources.get(row.sourceId) : undefined;
    const icons = (row.clientBadges ?? []).map((clientType) =>
      `<img class="client-icon" src="${escapeHtml(iconUri(clientType))}" alt="${escapeHtml(clientType)}" title="${escapeHtml(clientType)}">`,
    ).join("");
    const removal = source
      ? `<button class="context-action" data-source-id="${escapeHtml(source.id)}" data-source-name="${escapeHtml(source.name)}" data-source-path="${escapeHtml(source.sourcePath)}">Remove Global Skill Enrollment</button>`
      : "";
    return `<li class="skill-row"><span class="skill-name">${escapeHtml(row.name)}</span><span class="client-icons">${icons}</span><span class="detail">${escapeHtml(row.kind)} · ${row.placements?.length ?? 0} targets</span>${removal}</li>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { color: var(--vscode-foreground); font: var(--vscode-font-weight) var(--vscode-font-size) var(--vscode-font-family); padding: 0; }
    ul { list-style: none; margin: 0; padding: 0; } .skill-row { align-items: center; display: flex; gap: 6px; min-height: 24px; padding: 0 8px 0 36px; position: relative; }
    .skill-row:hover { background: var(--vscode-list-hoverBackground); } .skill-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .client-icons { display: inline-flex; gap: 4px; } .client-icon { height: 14px; width: 14px; } .detail { color: var(--vscode-descriptionForeground); }
    .context-action { background: var(--vscode-menu-background); border: 1px solid var(--vscode-menu-border); color: var(--vscode-menu-foreground); display: none; left: 36px; padding: 5px 8px; position: absolute; top: 22px; z-index: 1; }
    .context-action.visible { display: block; }
  </style></head><body><ul>${rows}</ul><script>
    const vscode = acquireVsCodeApi();
    document.addEventListener('contextmenu', (event) => { event.preventDefault(); document.querySelectorAll('.context-action').forEach((item) => item.classList.remove('visible')); event.target.closest('.skill-row')?.querySelector('.context-action')?.classList.add('visible'); });
    document.addEventListener('click', (event) => { const action = event.target.closest('.context-action'); if (action) vscode.postMessage({ type: 'remove-global-enrollment', source: { id: action.dataset.sourceId, name: action.dataset.sourceName, sourcePath: action.dataset.sourcePath } }); document.querySelectorAll('.context-action').forEach((item) => item.classList.remove('visible')); });
  </script></body></html>`;
}

export function iconFileNameForClient(clientType) {
  const normalizedClientType = String(clientType ?? "").trim().toLowerCase();
  return KNOWN_AI_ICON_FILES[normalizedClientType] ?? "agent-generic.svg";
}

const KNOWN_AI_ICON_FILES = Object.freeze({
  codex: "agent-openai.svg",
  openai: "agent-openai.svg",
  chatgpt: "agent-openai.svg",
  gpt: "agent-openai.svg",
  claude: "agent-claude.svg",
  gemini: "agent-gemini.svg",
  "google gemini": "agent-gemini.svg",
  copilot: "agent-copilot.svg",
  "github copilot": "agent-copilot.svg",
  cursor: "agent-cursor.svg",
  perplexity: "agent-perplexity.svg",
  mistral: "agent-mistral.svg",
  "mistral ai": "agent-mistral.svg",
  deepseek: "agent-deepseek.svg",
  meta: "agent-meta-ai.svg",
  "meta ai": "agent-meta-ai.svg",
  huggingface: "agent-hugging-face.svg",
  "hugging face": "agent-hugging-face.svg",
  ollama: "agent-ollama.svg",
});

function iconUriForClient({ clientType, vscodeApi, extensionUri, webview }) {
  const fileName = iconFileNameForClient(clientType);
  const uri = vscodeApi?.Uri?.joinPath?.(extensionUri, "media", fileName);
  return uri && typeof webview?.asWebviewUri === "function" ? String(webview.asWebviewUri(uri)) : "";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
