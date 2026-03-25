import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

import {
  deleteHost,
  downloadFile,
  downloadFileToLocal,
  listFiles,
  listLocalFiles,
  loadHosts,
  saveHost,
  uploadFile,
  uploadLocalFilePath,
} from "./api";
import type {
  AuthType,
  Host,
  LocalListing,
  Platform,
  RemoteEntry,
  RemoteListing,
  SocketMessage,
} from "./types";

type TerminalTab = {
  id: string;
  host: Host;
  term: Terminal;
  fit: FitAddon;
  socket: WebSocket;
  node: HTMLDivElement;
  status: string;
  syncGroup: SyncGroup;
};

type SyncGroup = "off" | "a" | "b";

type Elements = {
  hostTree: HTMLDivElement;
  openSessions: HTMLDivElement;
  hostCount: HTMLSpanElement;
  hostSearch: HTMLInputElement;
  tabSearch: HTMLInputElement;
  newHostButton: HTMLButtonElement;
  connectSelectedButton: HTMLButtonElement;
  editSelectedButton: HTMLButtonElement;
  syncToggleButton: HTMLButtonElement;
  syncOffButton: HTMLButtonElement;
  syncAButton: HTMLButtonElement;
  syncBButton: HTMLButtonElement;
  editorPanel: HTMLAsideElement;
  closeEditorButton: HTMLButtonElement;
  hostForm: HTMLFormElement;
  formMode: HTMLSpanElement;
  passwordHelp: HTMLElement;
  passwordState: HTMLSpanElement;
  clearPasswordButton: HTMLButtonElement;
  deleteHostButton: HTMLButtonElement;
  tabBar: HTMLDivElement;
  terminalStage: HTMLDivElement;
  fileSplitter: HTMLDivElement;
  statusBanner: HTMLDivElement;
  workspaceTitle: HTMLHeadingElement;
  transferStatus: HTMLDivElement;
  localPath: HTMLSpanElement;
  localStatus: HTMLSpanElement;
  localBody: HTMLDivElement;
  localRefreshButton: HTMLButtonElement;
  localUpButton: HTMLButtonElement;
  remotePath: HTMLSpanElement;
  remoteStatus: HTMLSpanElement;
  remoteBody: HTMLDivElement;
  remoteRefreshButton: HTMLButtonElement;
  remoteUpButton: HTMLButtonElement;
  uploadSelectionButton: HTMLButtonElement;
  downloadSelectionButton: HTMLButtonElement;
  fileUploadButton: HTMLButtonElement;
  fileDownloadButton: HTMLButtonElement;
  fileInput: HTMLInputElement;
  footerStatus: HTMLSpanElement;
};

type State = {
  hosts: Host[];
  selectedHostId: string;
  editingId: string;
  activeTabId: string;
  search: string;
  tabSearch: string;
  editorOpen: boolean;
  terminals: Map<string, TerminalTab>;
  passwordCache: Map<string, string>;
  fileListings: Map<string, RemoteListing>;
  fileSelection: Map<string, string>;
  fileLoadingHostId: string;
  fileErrorHostId: string;
  fileError: string;
  localListing: LocalListing | null;
  localSelection: string;
  localLoading: boolean;
  localError: string;
  filePaneHeight: number;
  draggingFilePane: boolean;
  passwordClearArmed: boolean;
  transferStatus: string;
  syncBroadcastEnabled: boolean;
};

export function bootstrap() {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) {
    throw new Error("app root not found");
  }

  app.innerHTML = `
    <div class="workbench">
      <header class="chrome-bar">
        <div class="chrome-title">zshell</div>
        <nav class="chrome-menu">
          <span>会话</span>
          <span>编辑</span>
          <span>传输</span>
          <span>工具</span>
          <span>窗口</span>
          <span>帮助</span>
        </nav>
      </header>
      <div class="chrome-toolbar">
        <button id="new-host" class="toolbar-button accent">新建会话</button>
        <button id="connect-selected" class="toolbar-button">连接所选</button>
        <button id="edit-selected" class="toolbar-button">编辑</button>
        <div class="toolbar-separator"></div>
        <div id="status-banner" class="status-banner">等待连接</div>
      </div>
      <div class="layout">
        <aside class="session-pane">
          <div class="pane-head">
            <div>
              <p class="eyebrow">Sessions</p>
              <h1>会话树</h1>
            </div>
            <span id="host-count" class="count-pill">0 台</span>
          </div>
          <label class="search-box">
            <span>筛选</span>
            <input id="host-search" placeholder="搜索主机 / 地址 / 用户" />
          </label>
          <div class="tree-groups">
            <section class="tree-group">
              <div class="tree-group-head">Open sessions</div>
              <div id="open-sessions" class="host-tree"></div>
            </section>
            <section class="tree-group">
              <div class="tree-group-head">Shell sessions</div>
              <div id="host-tree" class="host-tree"></div>
            </section>
          </div>
        </aside>

        <main class="terminal-pane">
          <div class="workspace-head">
            <div>
              <p class="eyebrow">Workspace</p>
              <h2 id="workspace-title">远程终端工作台</h2>
            </div>
            <div class="workspace-tools">
              <label class="tab-search-box">
                <input id="tab-search" placeholder="搜索已打开标签  Ctrl+K" />
              </label>
              <div class="sync-strip">
                <button id="sync-toggle" class="mini-button ghost" type="button">群发关</button>
                <button id="sync-off" class="mini-button" type="button">独立</button>
                <button id="sync-a" class="mini-button" type="button">A 通道</button>
                <button id="sync-b" class="mini-button" type="button">B 通道</button>
              </div>
            </div>
          </div>
          <div id="tab-bar" class="tab-bar"></div>
          <section id="terminal-stage" class="terminal-stage">
            <div class="empty-state">
              <h3>选择一台主机并连接</h3>
              <p>左侧管理会话树，中间保留多标签终端，底部保留本地 / 远程双栏文件面板。</p>
            </div>
          </section>
          <div id="file-splitter" class="file-splitter" role="separator" aria-orientation="horizontal"></div>
          <section class="file-pane">
            <div class="file-pane-head">
              <div>
                <p class="eyebrow">Commander</p>
                <h3>双栏文件面板</h3>
              </div>
              <div class="file-toolbar">
                <button id="upload-selection" class="mini-button" type="button">上传选中 →</button>
                <button id="download-selection" class="mini-button" type="button">← 下载选中</button>
                <button id="file-upload" class="mini-button ghost" type="button">选择文件上传</button>
                <button id="file-download" class="mini-button ghost" type="button">浏览器下载</button>
              </div>
            </div>
            <div class="file-transfer-bar">
              <div id="transfer-status" class="transfer-status">本地与远程双栏管理</div>
            </div>
            <div class="file-columns">
              <section class="file-column">
                <div class="file-column-head">
                  <div>
                    <p class="eyebrow">Local</p>
                    <h4>本地</h4>
                  </div>
                  <div class="file-toolbar">
                    <button id="local-up" class="mini-button" type="button">上级</button>
                    <button id="local-refresh" class="mini-button" type="button">刷新</button>
                  </div>
                </div>
                <div class="file-path-strip">
                  <span id="local-path" class="path-pill">加载中</span>
                  <span id="local-status" class="column-status">就绪</span>
                </div>
                <div class="file-grid-head">
                  <span>名称</span>
                  <span>类型 / 大小</span>
                  <span>修改时间 / 说明</span>
                </div>
                <div id="local-body" class="file-grid-body"></div>
              </section>

              <section class="file-column">
                <div class="file-column-head">
                  <div>
                    <p class="eyebrow">Remote</p>
                    <h4>远程</h4>
                  </div>
                  <div class="file-toolbar">
                    <button id="remote-up" class="mini-button" type="button">上级</button>
                    <button id="remote-refresh" class="mini-button" type="button">刷新</button>
                  </div>
                </div>
                <div class="file-path-strip">
                  <span id="remote-path" class="path-pill">未连接</span>
                  <span id="remote-status" class="column-status">等待会话</span>
                </div>
                <div class="file-grid-head">
                  <span>名称</span>
                  <span>类型 / 大小</span>
                  <span>修改时间 / 说明</span>
                </div>
                <div id="file-body" class="file-grid-body"></div>
              </section>
            </div>
            <input id="file-input" type="file" hidden />
          </section>
        </main>

        <aside id="editor-panel" class="editor-pane">
          <div class="pane-head">
            <div>
              <p class="eyebrow">Session Editor</p>
              <h2>连接配置</h2>
            </div>
            <button id="close-editor" class="icon-button" type="button">×</button>
          </div>
          <div class="editor-mode">
            <span id="form-mode">新增</span>
            <small id="password-help">密码优先在设置中维护；不保存到系统凭据库时，仅缓存当前应用会话。</small>
            <div class="credential-strip">
              <span id="password-state" class="mini-meta">未配置密码</span>
              <button id="clear-password" class="mini-button ghost" type="button">清除已保存密码</button>
            </div>
          </div>
          <form id="host-form" class="host-form">
            <label><span>名称</span><input name="name" required /></label>
            <label><span>地址</span><input name="address" required /></label>
            <div class="field-row">
              <label><span>端口</span><input name="port" type="number" value="22" required /></label>
              <label><span>用户</span><input name="username" required /></label>
            </div>
            <div class="field-row">
              <label>
                <span>平台</span>
                <select name="platform">
                  <option value="linux">Linux</option>
                  <option value="windows">Windows</option>
                </select>
              </label>
              <label>
                <span>认证</span>
                <select name="authType">
                  <option value="password">密码</option>
                  <option value="key">密钥</option>
                </select>
              </label>
            </div>
            <label><span>密码</span><input name="password" type="password" placeholder="保存后写入系统凭据库或缓存到当前应用" /></label>
            <label class="check-row"><input name="savePassword" type="checkbox" /><span>保存密码到系统凭据库</span></label>
            <label><span>密钥路径</span><input name="keyPath" placeholder="C:\\Users\\me\\.ssh\\id_rsa" /></label>
            <label><span>默认 Shell</span><input name="defaultShell" placeholder="bash -l / powershell.exe -NoLogo" /></label>
            <div class="actions">
              <button type="submit" class="toolbar-button accent">保存配置</button>
              <button type="button" id="delete-host" class="toolbar-button danger">删除</button>
            </div>
          </form>
        </aside>
      </div>
      <footer class="status-strip">
        <span id="footer-status">就绪</span>
        <span>远程模式</span>
        <span>终端标签 <strong id="footer-tabs">0</strong></span>
      </footer>
    </div>
  `;

  const elements = queryElements();
  const state: State = {
    hosts: [],
    selectedHostId: "",
    editingId: "",
    activeTabId: "",
    search: "",
    tabSearch: "",
    editorOpen: false,
    terminals: new Map(),
    passwordCache: new Map(),
    fileListings: new Map(),
    fileSelection: new Map(),
    fileLoadingHostId: "",
    fileErrorHostId: "",
    fileError: "",
    localListing: null,
    localSelection: "",
    localLoading: false,
    localError: "",
    filePaneHeight: 270,
    draggingFilePane: false,
    passwordClearArmed: false,
    transferStatus: "",
    syncBroadcastEnabled: false,
  };

  bindUI(elements, state);
  applyPaneHeight(state.filePaneHeight);
  window.addEventListener("resize", () => resizeActiveTerminal(state));

  void refreshHosts(elements, state);
  void loadLocalListing(elements, state, "");
  renderEditor(elements, state);
  renderFilePanel(elements, state);
}

function queryElements(): Elements {
  return {
    hostTree: document.querySelector<HTMLDivElement>("#host-tree")!,
    openSessions: document.querySelector<HTMLDivElement>("#open-sessions")!,
    hostCount: document.querySelector<HTMLSpanElement>("#host-count")!,
    hostSearch: document.querySelector<HTMLInputElement>("#host-search")!,
    tabSearch: document.querySelector<HTMLInputElement>("#tab-search")!,
    newHostButton: document.querySelector<HTMLButtonElement>("#new-host")!,
    connectSelectedButton: document.querySelector<HTMLButtonElement>("#connect-selected")!,
    editSelectedButton: document.querySelector<HTMLButtonElement>("#edit-selected")!,
    syncToggleButton: document.querySelector<HTMLButtonElement>("#sync-toggle")!,
    syncOffButton: document.querySelector<HTMLButtonElement>("#sync-off")!,
    syncAButton: document.querySelector<HTMLButtonElement>("#sync-a")!,
    syncBButton: document.querySelector<HTMLButtonElement>("#sync-b")!,
    editorPanel: document.querySelector<HTMLAsideElement>("#editor-panel")!,
    closeEditorButton: document.querySelector<HTMLButtonElement>("#close-editor")!,
    hostForm: document.querySelector<HTMLFormElement>("#host-form")!,
    formMode: document.querySelector<HTMLSpanElement>("#form-mode")!,
    passwordHelp: document.querySelector<HTMLElement>("#password-help")!,
    passwordState: document.querySelector<HTMLSpanElement>("#password-state")!,
    clearPasswordButton: document.querySelector<HTMLButtonElement>("#clear-password")!,
    deleteHostButton: document.querySelector<HTMLButtonElement>("#delete-host")!,
    tabBar: document.querySelector<HTMLDivElement>("#tab-bar")!,
    terminalStage: document.querySelector<HTMLDivElement>("#terminal-stage")!,
    fileSplitter: document.querySelector<HTMLDivElement>("#file-splitter")!,
    statusBanner: document.querySelector<HTMLDivElement>("#status-banner")!,
    workspaceTitle: document.querySelector<HTMLHeadingElement>("#workspace-title")!,
    transferStatus: document.querySelector<HTMLDivElement>("#transfer-status")!,
    localPath: document.querySelector<HTMLSpanElement>("#local-path")!,
    localStatus: document.querySelector<HTMLSpanElement>("#local-status")!,
    localBody: document.querySelector<HTMLDivElement>("#local-body")!,
    localRefreshButton: document.querySelector<HTMLButtonElement>("#local-refresh")!,
    localUpButton: document.querySelector<HTMLButtonElement>("#local-up")!,
    remotePath: document.querySelector<HTMLSpanElement>("#remote-path")!,
    remoteStatus: document.querySelector<HTMLSpanElement>("#remote-status")!,
    remoteBody: document.querySelector<HTMLDivElement>("#file-body")!,
    remoteRefreshButton: document.querySelector<HTMLButtonElement>("#remote-refresh")!,
    remoteUpButton: document.querySelector<HTMLButtonElement>("#remote-up")!,
    uploadSelectionButton: document.querySelector<HTMLButtonElement>("#upload-selection")!,
    downloadSelectionButton: document.querySelector<HTMLButtonElement>("#download-selection")!,
    fileUploadButton: document.querySelector<HTMLButtonElement>("#file-upload")!,
    fileDownloadButton: document.querySelector<HTMLButtonElement>("#file-download")!,
    fileInput: document.querySelector<HTMLInputElement>("#file-input")!,
    footerStatus: document.querySelector<HTMLSpanElement>("#footer-status")!,
  };
}

function bindUI(elements: Elements, state: State) {
  elements.newHostButton.addEventListener("click", () => openNewEditor(elements, state));
  elements.editSelectedButton.addEventListener("click", () => {
    const host = currentHost(state);
    if (host) {
      fillForm(elements, state, host);
    }
  });
  elements.connectSelectedButton.addEventListener("click", () => {
    const host = currentHost(state);
    if (host) {
      void connectHost(elements, state, host);
    }
  });
  elements.closeEditorButton.addEventListener("click", () => {
    state.editorOpen = false;
    renderEditor(elements, state);
  });
  elements.hostSearch.addEventListener("input", () => {
    state.search = elements.hostSearch.value.trim().toLowerCase();
    renderHosts(elements, state);
  });
  elements.tabSearch.addEventListener("input", () => {
    state.tabSearch = elements.tabSearch.value.trim().toLowerCase();
    renderOpenSessions(elements, state);
  });
  elements.tabSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const match = matchingOpenTabs(state)[0];
      if (match) {
        activateTab(elements, state, match.id);
      }
    }
    if (event.key === "Escape") {
      state.tabSearch = "";
      elements.tabSearch.value = "";
      renderOpenSessions(elements, state);
    }
  });
  elements.syncToggleButton.addEventListener("click", () => {
    state.syncBroadcastEnabled = !state.syncBroadcastEnabled;
    updateSyncControls(elements, state);
    syncActiveWorkspace(elements, state);
  });
  elements.syncOffButton.addEventListener("click", () => setActiveTabSyncGroup(elements, state, "off"));
  elements.syncAButton.addEventListener("click", () => setActiveTabSyncGroup(elements, state, "a"));
  elements.syncBButton.addEventListener("click", () => setActiveTabSyncGroup(elements, state, "b"));
  window.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      elements.tabSearch.focus();
      elements.tabSearch.select();
    }
  });

  elements.fileSplitter.addEventListener("mousedown", (event) => {
    state.draggingFilePane = true;
    document.body.classList.add("resizing");
    event.preventDefault();
  });
  window.addEventListener("mousemove", (event) => {
    if (!state.draggingFilePane) {
      return;
    }
    const nextHeight = Math.max(180, Math.min(window.innerHeight * 0.55, window.innerHeight - event.clientY - 28));
    state.filePaneHeight = Math.round(nextHeight);
    applyPaneHeight(state.filePaneHeight);
    resizeActiveTerminal(state);
  });
  window.addEventListener("mouseup", () => {
    if (!state.draggingFilePane) {
      return;
    }
    state.draggingFilePane = false;
    document.body.classList.remove("resizing");
  });

  elements.localRefreshButton.addEventListener("click", () => {
    void loadLocalListing(elements, state, currentLocalPath(state));
  });
  elements.localUpButton.addEventListener("click", () => {
    void loadLocalListing(elements, state, localParentPath(currentLocalPath(state)));
  });
  elements.remoteRefreshButton.addEventListener("click", () => {
    const host = activeOrSelectedHost(state);
    if (host) {
      void loadFileListing(elements, state, host, currentRemotePath(state, host));
    }
  });
  elements.remoteUpButton.addEventListener("click", () => {
    const host = activeOrSelectedHost(state);
    if (host) {
      void loadFileListing(elements, state, host, remoteParentPath(currentRemotePath(state, host)));
    }
  });
  elements.uploadSelectionButton.addEventListener("click", () => {
    const host = activeOrSelectedHost(state);
    if (host) {
      void uploadSelectedLocalPath(elements, state, host);
    }
  });
  elements.downloadSelectionButton.addEventListener("click", () => {
    const host = activeOrSelectedHost(state);
    if (host) {
      void downloadSelectedRemotePath(elements, state, host);
    }
  });
  elements.fileUploadButton.addEventListener("click", () => {
    const host = activeOrSelectedHost(state);
    if (!host) {
      return;
    }
    elements.fileInput.click();
  });
  elements.fileDownloadButton.addEventListener("click", () => {
    const host = activeOrSelectedHost(state);
    const selectedPath = host ? state.fileSelection.get(host.id) || "" : "";
    if (host && selectedPath) {
      void downloadSelectedFile(state, host, selectedPath);
    }
  });
  elements.fileInput.addEventListener("change", () => {
    const host = activeOrSelectedHost(state);
    const file = elements.fileInput.files?.[0];
    if (host && file) {
      void uploadSelectedFile(elements, state, host, currentRemotePath(state, host), file);
    }
    elements.fileInput.value = "";
  });

  elements.clearPasswordButton.addEventListener("click", () => {
    state.passwordClearArmed = true;
    if (state.editingId) {
      state.passwordCache.delete(state.editingId);
    }
    setInput(elements.hostForm, "password", "");
    setCheckbox(elements.hostForm, "savePassword", false);
    renderEditor(elements, state);
  });

  const passwordInput = elements.hostForm.elements.namedItem("password");
  const savePasswordInput = elements.hostForm.elements.namedItem("savePassword");
  const authTypeInput = elements.hostForm.elements.namedItem("authType");
  if (passwordInput instanceof HTMLInputElement) {
    passwordInput.addEventListener("input", () => {
      if (passwordInput.value.trim() !== "") {
        state.passwordClearArmed = false;
      }
      renderEditor(elements, state);
    });
  }
  if (savePasswordInput instanceof HTMLInputElement) {
    savePasswordInput.addEventListener("change", () => renderEditor(elements, state));
  }
  if (authTypeInput instanceof HTMLSelectElement) {
    authTypeInput.addEventListener("change", () => renderEditor(elements, state));
  }

  elements.deleteHostButton.addEventListener("click", async () => {
    const hostID = state.editingId;
    if (!hostID) {
      return;
    }
    try {
      await deleteHost(hostID);
      if (state.selectedHostId === hostID) {
        state.selectedHostId = "";
      }
      state.editingId = "";
      state.editorOpen = false;
      state.passwordClearArmed = false;
      state.passwordCache.delete(hostID);
      state.fileListings.delete(hostID);
      state.fileSelection.delete(hostID);
      await refreshHosts(elements, state);
    } catch (error) {
      window.alert(toMessage(error));
    }
  });

  elements.hostForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(elements.hostForm);
    const payload: Omit<Host, "id"> = {
      name: String(formData.get("name") || ""),
      address: String(formData.get("address") || ""),
      port: Number(formData.get("port") || 22),
      username: String(formData.get("username") || ""),
      platform: String(formData.get("platform") || "linux") as Platform,
      authType: String(formData.get("authType") || "password") as AuthType,
      password: String(formData.get("password") || "").trim(),
      savePassword: Boolean(formData.get("savePassword")),
      keyPath: String(formData.get("keyPath") || "").trim(),
      defaultShell: String(formData.get("defaultShell") || "").trim(),
    };
    const cachePassword = payload.authType === "password" && payload.password !== "" && !payload.savePassword;
    const clearPassword = state.passwordClearArmed;

    try {
      const saved = await saveHost(payload, state.editingId);
      if (cachePassword) {
        state.passwordCache.set(saved.id, payload.password || "");
      } else if (clearPassword || payload.authType === "key") {
        state.passwordCache.delete(saved.id);
      }
      state.passwordClearArmed = false;
      state.editingId = saved.id;
      state.selectedHostId = saved.id;
      state.editorOpen = false;
      await refreshHosts(elements, state);
    } catch (error) {
      window.alert(toMessage(error));
    }
  });
}

async function refreshHosts(elements: Elements, state: State) {
  state.hosts = await loadHosts();
  if (!state.selectedHostId && state.hosts.length > 0) {
    state.selectedHostId = state.hosts[0].id;
  }
  if (state.selectedHostId && !state.hosts.some((host) => host.id === state.selectedHostId)) {
    state.selectedHostId = state.hosts[0]?.id || "";
  }
  renderHosts(elements, state);
  renderOpenSessions(elements, state);
  renderTabs(elements, state);
  renderFilePanel(elements, state);
  renderEditor(elements, state);
  updateSyncControls(elements, state);
}

function renderHosts(elements: Elements, state: State) {
  const hosts = filteredHosts(state);
  elements.hostCount.textContent = `${state.hosts.length} 台`;
  elements.hostTree.innerHTML = "";

  if (hosts.length === 0) {
    elements.hostTree.innerHTML = `<div class="empty-hosts">没有匹配的会话</div>`;
    return;
  }

  renderHostGroup(elements.hostTree, "Linux", hosts.filter((host) => host.platform === "linux"), state, elements);
  renderHostGroup(elements.hostTree, "Windows", hosts.filter((host) => host.platform === "windows"), state, elements);
}

function renderOpenSessions(elements: Elements, state: State) {
  const sessions = matchingOpenTabs(state);
  elements.openSessions.innerHTML = "";

  if (state.terminals.size === 0) {
    elements.openSessions.innerHTML = `<div class="empty-hosts">没有已打开会话</div>`;
    return;
  }

  if (sessions.length === 0) {
    elements.openSessions.innerHTML = `<div class="empty-hosts">没有匹配的标签</div>`;
    return;
  }

  for (const tab of sessions) {
    const item = document.createElement("article");
    item.className = `tree-item ${state.activeTabId === tab.id ? "selected" : ""}`;
    item.innerHTML = `
      <button class="tree-main" type="button">
        <span class="tree-icon ${tab.host.platform}"></span>
        <div class="tree-copy">
          <strong>${escapeHTML(tab.host.name)}</strong>
          <small>${escapeHTML(syncGroupText(tab.syncGroup))} · ${escapeHTML(tab.status)}</small>
        </div>
      </button>
      <div class="tree-actions">
        <span class="tree-state ${tab.status}"></span>
        <span class="mini-meta ${tab.syncGroup === "off" ? "neutral" : "accent"}">${escapeHTML(syncGroupBadge(tab.syncGroup))}</span>
        <button class="mini-button close-session-button" type="button">关</button>
      </div>
    `;
    item.querySelector<HTMLButtonElement>(".tree-main")!.addEventListener("click", () => {
      activateTab(elements, state, tab.id);
    });
    item.querySelector<HTMLButtonElement>(".close-session-button")!.addEventListener("click", () => {
      closeTab(elements, state, tab.id);
    });
    elements.openSessions.append(item);
  }
}

function renderHostGroup(root: HTMLDivElement, title: string, hosts: Host[], state: State, elements: Elements) {
  if (hosts.length === 0) {
    return;
  }

  const section = document.createElement("section");
  section.className = "tree-section";
  section.innerHTML = `<div class="tree-section-title">${title}</div>`;

  for (const host of hosts) {
    const activeSession = findTabByHost(state, host.id);
    const item = document.createElement("article");
    item.className = `tree-item ${state.selectedHostId === host.id ? "selected" : ""}`;
    item.innerHTML = `
      <button class="tree-main" type="button">
        <span class="tree-icon ${host.platform}"></span>
        <div class="tree-copy">
          <strong>${escapeHTML(host.name)}</strong>
          <small>${escapeHTML(host.username)}@${escapeHTML(host.address)}:${host.port}</small>
        </div>
      </button>
      <div class="tree-actions">
        <span class="tree-state ${activeSession?.status || "idle"}"></span>
        ${host.hasPassword ? `<span class="mini-meta">钥</span>` : ""}
        <button class="mini-button connect-button" type="button">连接</button>
      </div>
    `;
    item.querySelector<HTMLButtonElement>(".tree-main")!.addEventListener("click", () => {
      state.selectedHostId = host.id;
      renderHosts(elements, state);
      renderFilePanel(elements, state);
    });
    item.querySelector<HTMLButtonElement>(".tree-main")!.addEventListener("dblclick", () => {
      void connectHost(elements, state, host);
    });
    item.querySelector<HTMLButtonElement>(".connect-button")!.addEventListener("click", () => {
      state.selectedHostId = host.id;
      renderHosts(elements, state);
      void connectHost(elements, state, host);
    });
    section.append(item);
  }

  root.append(section);
}

function filteredHosts(state: State) {
  if (!state.search) {
    return state.hosts;
  }
  return state.hosts.filter((host) => {
    const haystack = `${host.name} ${host.address} ${host.username}`.toLowerCase();
    return haystack.includes(state.search);
  });
}

function openNewEditor(elements: Elements, state: State) {
  state.editingId = "";
  state.editorOpen = true;
  state.passwordClearArmed = false;
  elements.formMode.textContent = "新增";
  setInput(elements.hostForm, "name", "");
  setInput(elements.hostForm, "address", "");
  setInput(elements.hostForm, "port", "22");
  setInput(elements.hostForm, "username", "");
  setInput(elements.hostForm, "platform", "linux");
  setInput(elements.hostForm, "authType", "password");
  setInput(elements.hostForm, "password", "");
  setCheckbox(elements.hostForm, "savePassword", false);
  setInput(elements.hostForm, "keyPath", "");
  setInput(elements.hostForm, "defaultShell", "");
  renderEditor(elements, state);
}

function fillForm(elements: Elements, state: State, host: Host) {
  state.selectedHostId = host.id;
  state.editingId = host.id;
  state.editorOpen = true;
  state.passwordClearArmed = false;
  elements.formMode.textContent = "编辑";
  setInput(elements.hostForm, "name", host.name);
  setInput(elements.hostForm, "address", host.address);
  setInput(elements.hostForm, "port", String(host.port));
  setInput(elements.hostForm, "username", host.username);
  setInput(elements.hostForm, "platform", host.platform);
  setInput(elements.hostForm, "authType", host.authType);
  setInput(elements.hostForm, "password", "");
  setCheckbox(elements.hostForm, "savePassword", !!host.hasPassword);
  setInput(elements.hostForm, "keyPath", host.keyPath || "");
  setInput(elements.hostForm, "defaultShell", host.defaultShell || "");
  renderEditor(elements, state);
  renderHosts(elements, state);
  renderFilePanel(elements, state);
}

function renderEditor(elements: Elements, state: State) {
  elements.editorPanel.classList.toggle("open", state.editorOpen);
  renderCredentialState(elements, state);
}

function renderCredentialState(elements: Elements, state: State) {
  const editingHost = state.hosts.find((host) => host.id === state.editingId);
  const authType = getSelectValue(elements.hostForm, "authType");
  const password = getInputValue(elements.hostForm, "password").trim();
  const savePassword = getCheckboxValue(elements.hostForm, "savePassword");
  const hasSavedPassword = Boolean(editingHost?.hasPassword) && !state.passwordClearArmed;
  const passwordField = elements.hostForm.elements.namedItem("password");

  if (passwordField instanceof HTMLInputElement) {
    passwordField.placeholder = hasSavedPassword
      ? "留空则保持当前已保存密码，填写则覆盖"
      : "保存后写入系统凭据库或缓存到当前应用";
  }

  if (authType !== "password") {
    elements.passwordState.textContent = "密钥认证";
    elements.passwordState.className = "mini-meta neutral";
    elements.passwordHelp.textContent = "使用密钥文件进行认证，密码凭据不会参与连接。";
    elements.clearPasswordButton.disabled = true;
    return;
  }

  elements.clearPasswordButton.disabled = !editingHost?.hasPassword && password === "";

  if (password !== "" && savePassword) {
    elements.passwordState.textContent = "保存后写入系统凭据库";
    elements.passwordState.className = "mini-meta accent";
    elements.passwordHelp.textContent = "当前输入的密码会在保存后写入系统凭据库，下次连接不再弹窗。";
    return;
  }

  if (password !== "") {
    elements.passwordState.textContent = "保存后缓存到当前应用";
    elements.passwordState.className = "mini-meta warn";
    elements.passwordHelp.textContent = "当前输入的密码不会写入系统凭据库，但本次应用运行期间可直接连接。";
    return;
  }

  if (hasSavedPassword && savePassword) {
    elements.passwordState.textContent = "系统凭据已保存";
    elements.passwordState.className = "mini-meta accent";
    elements.passwordHelp.textContent = "保持当前配置即可继续使用系统凭据库中的密码。";
    return;
  }

  if (editingHost?.hasPassword && !savePassword) {
    elements.passwordState.textContent = "保存后清除系统凭据";
    elements.passwordState.className = "mini-meta danger";
    elements.passwordHelp.textContent = "当前未勾选“保存密码”，保存配置后会清除系统凭据库中的现有密码。";
    return;
  }

  elements.passwordState.textContent = "未配置密码";
  elements.passwordState.className = "mini-meta neutral";
  elements.passwordHelp.textContent = "未保存密码时，连接会回退到一次性弹窗输入。";
}

function setInput(form: HTMLFormElement, name: string, value: string) {
  const element = form.elements.namedItem(name);
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) {
    element.value = value;
  }
}

function setCheckbox(form: HTMLFormElement, name: string, checked: boolean) {
  const element = form.elements.namedItem(name);
  if (element instanceof HTMLInputElement && element.type === "checkbox") {
    element.checked = checked;
  }
}

function getInputValue(form: HTMLFormElement, name: string) {
  const element = form.elements.namedItem(name);
  return element instanceof HTMLInputElement ? element.value : "";
}

function getSelectValue(form: HTMLFormElement, name: string) {
  const element = form.elements.namedItem(name);
  return element instanceof HTMLSelectElement ? element.value : "";
}

function getCheckboxValue(form: HTMLFormElement, name: string) {
  const element = form.elements.namedItem(name);
  return element instanceof HTMLInputElement && element.type === "checkbox" ? element.checked : false;
}
async function connectHost(elements: Elements, state: State, host: Host) {
  const existingTab = findTabByHost(state, host.id);
  if (existingTab) {
    activateTab(elements, state, existingTab.id);
    return;
  }

  const password = await ensurePassword(host, state);
  if (host.authType === "password" && password === "") {
    return;
  }

  const socket = new WebSocket(socketURL("/ws/sessions"));
  const node = document.createElement("div");
  node.className = "terminal-shell";
  elements.terminalStage.querySelector(".empty-state")?.remove();
  elements.terminalStage.append(node);

  const term = new Terminal({
    cursorBlink: true,
    fontFamily: '"JetBrains Mono", "Cascadia Mono", monospace',
    fontSize: 13,
    theme: {
      background: "#101113",
      foreground: "#dfe7f5",
      cursor: "#f4b860",
      selectionBackground: "rgba(244,184,96,0.28)",
    },
    convertEol: true,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(node);

  const tabId = crypto.randomUUID();
  const tab: TerminalTab = {
    id: tabId,
    host,
    term,
    fit,
    socket,
    node,
    status: "connecting",
    syncGroup: "off",
  };
  state.terminals.set(tabId, tab);
  state.activeTabId = tabId;
  state.selectedHostId = host.id;
  updateSyncControls(elements, state);
  renderOpenSessions(elements, state);
  renderTabs(elements, state);
  activateTab(elements, state, tabId);

  term.writeln(`\x1b[1;33m[${host.name}]\x1b[0m 正在连接 ${host.username}@${host.address}:${host.port}`);
  socket.addEventListener("open", () => {
    fit.fit();
    sendMessage(socket, {
      type: "connect",
      hostId: host.id,
      password,
      cols: term.cols,
      rows: term.rows,
    });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data) as SocketMessage;
    void handleSocketMessage(elements, state, tabId, message);
  });
  socket.addEventListener("close", () => {
    tab.term.writeln("\r\n\x1b[31m[session closed]\x1b[0m");
    tab.status = "closed";
    renderTabs(elements, state);
    renderOpenSessions(elements, state);
    renderHosts(elements, state);
    renderFilePanel(elements, state);
  });
  socket.addEventListener("error", () => {
    tab.term.writeln("\r\n\x1b[31m[connection error]\x1b[0m");
    tab.status = "error";
    renderTabs(elements, state);
    renderOpenSessions(elements, state);
    renderHosts(elements, state);
    renderFilePanel(elements, state);
  });
  term.onData((data) => routeTerminalInput(elements, state, tabId, data));
}

async function handleSocketMessage(elements: Elements, state: State, tabID: string, message: SocketMessage) {
  const tab = state.terminals.get(tabID);
  if (!tab) {
    return;
  }

  switch (message.type) {
    case "status":
      tab.status = message.message || "connecting";
      break;
    case "connected":
      tab.status = "connected";
      tab.fit.fit();
      sendMessage(tab.socket, { type: "resize", cols: tab.term.cols, rows: tab.term.rows });
      await loadFileListing(elements, state, tab.host, currentRemotePath(state, tab.host));
      break;
    case "output":
      tab.term.write(message.data || "");
      break;
    case "error":
      tab.status = "error";
      tab.term.writeln(`\r\n\x1b[31m[${message.message || "error"}]\x1b[0m`);
      break;
    case "closed":
      tab.status = "closed";
      break;
  }

  syncWorkspace(elements, state, tab);
  renderOpenSessions(elements, state);
}

function renderTabs(elements: Elements, state: State) {
  elements.tabBar.innerHTML = "";
  for (const tab of state.terminals.values()) {
    const button = document.createElement("button");
    button.className = `tab ${tab.id === state.activeTabId ? "active" : ""}`;
    button.innerHTML = `
      <span class="tab-mark ${tab.status}"></span>
      <span>${escapeHTML(tab.host.name)}</span>
      <em class="tab-sync ${tab.syncGroup === "off" ? "off" : tab.syncGroup}">${escapeHTML(syncGroupBadge(tab.syncGroup))}</em>
      <small>${escapeHTML(tab.status)}</small>
      <strong class="tab-close">×</strong>
    `;
    button.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target.classList.contains("tab-close")) {
        event.stopPropagation();
        closeTab(elements, state, tab.id);
        return;
      }
      activateTab(elements, state, tab.id);
    });
    elements.tabBar.append(button);
  }
  const footerTabs = document.querySelector<HTMLElement>("#footer-tabs");
  if (footerTabs) {
    footerTabs.textContent = String(state.terminals.size);
  }
  updateSyncControls(elements, state);
}

function activateTab(elements: Elements, state: State, id: string) {
  state.activeTabId = id;
  for (const tab of state.terminals.values()) {
    tab.node.style.display = tab.id === id ? "block" : "none";
  }
  const tab = state.terminals.get(id);
  if (tab) {
    state.selectedHostId = tab.host.id;
    tab.fit.fit();
    syncWorkspace(elements, state, tab);
  } else {
    elements.statusBanner.textContent = "等待连接";
    elements.workspaceTitle.textContent = "远程终端工作台";
    elements.footerStatus.textContent = "就绪";
  }
  updateSyncControls(elements, state);
  renderTabs(elements, state);
  renderOpenSessions(elements, state);
  renderHosts(elements, state);
  renderFilePanel(elements, state);
}

function closeTab(elements: Elements, state: State, id: string) {
  const tab = state.terminals.get(id);
  if (!tab) {
    return;
  }

  sendMessage(tab.socket, { type: "close" });
  tab.socket.close();
  tab.term.dispose();
  tab.node.remove();
  state.terminals.delete(id);

  const next = state.terminals.keys().next();
  state.activeTabId = next.done ? "" : next.value;
  if (state.activeTabId) {
    activateTab(elements, state, state.activeTabId);
    return;
  }

  elements.terminalStage.innerHTML = `
    <div class="empty-state">
      <h3>选择一台主机并连接</h3>
      <p>左侧管理会话树，中间保留多标签终端，底部保留本地 / 远程双栏文件面板。</p>
    </div>
  `;
  elements.statusBanner.textContent = "等待连接";
  elements.workspaceTitle.textContent = "远程终端工作台";
  elements.footerStatus.textContent = "就绪";
  updateSyncControls(elements, state);
  renderTabs(elements, state);
  renderOpenSessions(elements, state);
  renderHosts(elements, state);
  renderFilePanel(elements, state);
}

function renderFilePanel(elements: Elements, state: State) {
  renderLocalPanel(elements, state);
  renderRemotePanel(elements, state);
  renderTransferActions(elements, state);
}

function renderLocalPanel(elements: Elements, state: State) {
  elements.localPath.textContent = currentLocalPath(state) || "加载中";
  elements.localUpButton.disabled = state.localLoading || currentLocalPath(state) === "";
  elements.localRefreshButton.disabled = state.localLoading;

  if (state.localLoading) {
    elements.localStatus.textContent = "读取中";
    elements.localBody.innerHTML = `<div class="file-empty">正在读取本地目录...</div>`;
    return;
  }

  if (state.localError) {
    elements.localStatus.textContent = "错误";
    elements.localBody.innerHTML = `<div class="file-error">${escapeHTML(state.localError)}</div>`;
    return;
  }

  if (!state.localListing) {
    elements.localStatus.textContent = "等待初始化";
    elements.localBody.innerHTML = `<div class="file-empty">正在准备本地文件面板...</div>`;
    return;
  }

  elements.localStatus.textContent = state.localSelection ? "已选中" : "就绪";
  if (state.localListing.entries.length === 0) {
    elements.localBody.innerHTML = `<div class="file-empty">当前目录为空。</div>`;
    return;
  }

  elements.localBody.innerHTML = renderFileRows(state.localListing.entries, state.localSelection);
  bindFileRows(elements.localBody, state.localListing, (path) => {
    state.localSelection = path;
    renderFilePanel(elements, state);
  }, async (entry) => {
    if (entry.isDir) {
      await loadLocalListing(elements, state, entry.path);
    }
  });
}

function renderRemotePanel(elements: Elements, state: State) {
  const host = activeOrSelectedHost(state);
  if (!host) {
    elements.remotePath.textContent = "未连接";
    elements.remoteStatus.textContent = "等待会话";
    elements.remoteBody.innerHTML = `<div class="file-empty">选择主机后可浏览远程目录。</div>`;
    elements.remoteUpButton.disabled = true;
    elements.remoteRefreshButton.disabled = true;
    return;
  }

  const listing = state.fileListings.get(host.id);
  const selectedPath = state.fileSelection.get(host.id) || "";
  const currentPath = currentRemotePath(state, host);
  const isLoading = state.fileLoadingHostId === host.id;
  const hasError = state.fileErrorHostId === host.id && state.fileError !== "";

  elements.remotePath.textContent = `${host.username}@${host.address}  ${currentPath}`;
  elements.remoteUpButton.disabled = isLoading || currentPath === ".";
  elements.remoteRefreshButton.disabled = isLoading;

  if (isLoading) {
    elements.remoteStatus.textContent = "读取中";
    elements.remoteBody.innerHTML = `<div class="file-empty">正在读取 ${escapeHTML(currentPath)} ...</div>`;
    return;
  }
  if (hasError) {
    elements.remoteStatus.textContent = "错误";
    elements.remoteBody.innerHTML = `<div class="file-error">${escapeHTML(state.fileError)}</div>`;
    return;
  }
  if (!listing) {
    elements.remoteStatus.textContent = "待加载";
    elements.remoteBody.innerHTML = `<div class="file-empty">点击“刷新”或连接终端后自动加载目录。</div>`;
    return;
  }
  if (listing.entries.length === 0) {
    elements.remoteStatus.textContent = "空目录";
    elements.remoteBody.innerHTML = `<div class="file-empty">当前目录为空。</div>`;
    return;
  }

  elements.remoteStatus.textContent = selectedPath ? "已选中" : "就绪";
  elements.remoteBody.innerHTML = renderFileRows(listing.entries, selectedPath);
  bindFileRows(elements.remoteBody, listing, (path) => {
    state.fileSelection.set(host.id, path);
    renderFilePanel(elements, state);
  }, async (entry) => {
    if (entry.isDir) {
      await loadFileListing(elements, state, host, entry.path);
      return;
    }
    state.fileSelection.set(host.id, entry.path);
    await downloadSelectedRemotePath(elements, state, host);
  });
}

function renderTransferActions(elements: Elements, state: State) {
  const host = activeOrSelectedHost(state);
  const localEntry = state.localListing ? findEntryByPath(state.localListing, state.localSelection) : undefined;
  const remoteSelection = host ? state.fileSelection.get(host.id) || "" : "";
  const remoteEntry = host ? findEntryByPath(state.fileListings.get(host.id), remoteSelection) : undefined;
  const remoteLoading = host ? state.fileLoadingHostId === host.id : false;
  const defaultStatus = host
    ? `当前会话 ${host.name}，可在本地与远程之间直接传输文件`
    : "先选择会话，再使用双栏文件管理";

  elements.uploadSelectionButton.disabled = !host || !localEntry || localEntry.isDir || state.localLoading || remoteLoading;
  elements.downloadSelectionButton.disabled =
    !host || !remoteEntry || remoteEntry.isDir || !state.localListing || state.localLoading || remoteLoading;
  elements.fileUploadButton.disabled = !host || remoteLoading;
  elements.fileDownloadButton.disabled = !host || !remoteEntry || remoteEntry.isDir;
  elements.transferStatus.textContent = state.transferStatus || defaultStatus;
}

function renderFileRows(entries: RemoteEntry[], selectedPath: string) {
  return entries
    .map((entry) => {
      const selectedClass = selectedPath === entry.path ? " selected" : "";
      return `
        <button class="file-row file-row-item${selectedClass}" type="button" data-path="${escapeHTML(entry.path)}" data-dir="${String(entry.isDir)}">
          <span>${entry.isDir ? "DIR  " : "FILE "}${escapeHTML(entry.name)}</span>
          <span>${entry.isDir ? "目录" : formatSize(entry.size)}</span>
          <span>${escapeHTML(formatTime(entry.modTime))}</span>
        </button>
      `;
    })
    .join("");
}

function bindFileRows(
  root: HTMLDivElement,
  listing: RemoteListing,
  onSelect: (path: string) => void,
  onOpen: (entry: RemoteEntry) => Promise<void>,
) {
  for (const node of root.querySelectorAll<HTMLButtonElement>(".file-row-item")) {
    node.addEventListener("click", () => {
      onSelect(node.dataset.path || "");
    });
    node.addEventListener("dblclick", () => {
      const path = node.dataset.path || "";
      const entry = findEntryByPath(listing, path);
      if (entry) {
        void onOpen(entry);
      }
    });
  }
}

function routeTerminalInput(elements: Elements, state: State, sourceTabID: string, data: string) {
  const source = state.terminals.get(sourceTabID);
  if (!source) {
    return;
  }

  sendMessage(source.socket, { type: "input", data });
  if (!state.syncBroadcastEnabled || source.syncGroup === "off") {
    return;
  }

  let broadcastCount = 1;
  for (const tab of state.terminals.values()) {
    if (tab.id === source.id || tab.syncGroup !== source.syncGroup || tab.status !== "connected") {
      continue;
    }
    sendMessage(tab.socket, { type: "input", data });
    broadcastCount += 1;
  }

  elements.footerStatus.textContent = `Sync ${syncGroupText(source.syncGroup)} / ${broadcastCount} tabs`;
}

function setActiveTabSyncGroup(elements: Elements, state: State, group: SyncGroup) {
  const active = state.terminals.get(state.activeTabId);
  if (!active) {
    return;
  }
  active.syncGroup = group;
  updateSyncControls(elements, state);
  renderTabs(elements, state);
  renderOpenSessions(elements, state);
  syncActiveWorkspace(elements, state);
}

function updateSyncControls(elements: Elements, state: State) {
  const active = state.terminals.get(state.activeTabId);
  const disabled = !active;
  const activeGroup = active?.syncGroup || "off";

  elements.syncToggleButton.disabled = disabled;
  elements.syncOffButton.disabled = disabled;
  elements.syncAButton.disabled = disabled;
  elements.syncBButton.disabled = disabled;

  elements.syncToggleButton.textContent = state.syncBroadcastEnabled ? "群发开" : "群发关";
  elements.syncToggleButton.classList.toggle("active", state.syncBroadcastEnabled);
  elements.syncOffButton.classList.toggle("active", activeGroup === "off");
  elements.syncAButton.classList.toggle("active", activeGroup === "a");
  elements.syncBButton.classList.toggle("active", activeGroup === "b");
}

function matchingOpenTabs(state: State) {
  const tabs = Array.from(state.terminals.values());
  if (!state.tabSearch) {
    return tabs;
  }
  return tabs.filter((tab) => {
    const haystack = `${tab.host.name} ${tab.host.address} ${tab.host.username} ${tab.status}`.toLowerCase();
    return haystack.includes(state.tabSearch);
  });
}

function syncActiveWorkspace(elements: Elements, state: State) {
  const active = state.terminals.get(state.activeTabId);
  if (!active) {
    elements.statusBanner.textContent = "等待连接";
    return;
  }
  syncWorkspace(elements, state, active);
}

function syncGroupText(group: SyncGroup) {
  switch (group) {
    case "a":
      return "Sync A";
    case "b":
      return "Sync B";
    default:
      return "独立";
  }
}

function syncGroupBadge(group: SyncGroup) {
  switch (group) {
    case "a":
      return "A";
    case "b":
      return "B";
    default:
      return "-";
  }
}

function syncWorkspace(elements: Elements, state: State, tab: TerminalTab) {
  const syncSuffix =
    tab.syncGroup === "off" ? "独立输入" : `${syncGroupText(tab.syncGroup)} / ${state.syncBroadcastEnabled ? "群发开" : "群发关"}`;
  elements.statusBanner.textContent = `${tab.host.name}: ${tab.status} · ${syncSuffix}`;
  elements.workspaceTitle.textContent = `${tab.host.name} · ${tab.host.username}@${tab.host.address}`;
  elements.footerStatus.textContent = `${tab.host.platform} / ${tab.status}`;
  renderHosts(elements, state);
  renderFilePanel(elements, state);
}

function resizeActiveTerminal(state: State) {
  const tab = state.terminals.get(state.activeTabId);
  if (!tab) {
    return;
  }
  tab.fit.fit();
  sendMessage(tab.socket, { type: "resize", cols: tab.term.cols, rows: tab.term.rows });
}

function currentHost(state: State) {
  return state.hosts.find((host) => host.id === state.selectedHostId);
}

function activeOrSelectedHost(state: State) {
  const activeTab = state.terminals.get(state.activeTabId);
  if (activeTab) {
    return activeTab.host;
  }
  return currentHost(state);
}

function findTabByHost(state: State, hostID: string) {
  for (const tab of state.terminals.values()) {
    if (tab.host.id === hostID) {
      return tab;
    }
  }
  return undefined;
}

async function loadLocalListing(elements: Elements, state: State, localPath: string) {
  state.localLoading = true;
  state.localError = "";
  renderFilePanel(elements, state);

  try {
    const listing = await listLocalFiles(localPath);
    state.localListing = listing;
    if (state.localSelection && !listing.entries.some((entry) => entry.path === state.localSelection)) {
      state.localSelection = "";
    }
  } catch (error) {
    state.localError = toMessage(error);
  } finally {
    state.localLoading = false;
    renderFilePanel(elements, state);
  }
}

async function loadFileListing(
  elements: Elements,
  state: State,
  host: Host,
  remotePath: string,
  forcePasswordPrompt = false,
) {
  const password = await ensurePassword(host, state, forcePasswordPrompt);
  if (host.authType === "password" && password === "") {
    return;
  }

  state.fileLoadingHostId = host.id;
  state.fileErrorHostId = "";
  state.fileError = "";
  renderFilePanel(elements, state);

  try {
    const listing = await listFiles(host.id, remotePath, password);
    state.fileListings.set(host.id, listing);
    state.fileSelection.delete(host.id);
  } catch (error) {
    if (!forcePasswordPrompt && host.authType === "password" && state.passwordCache.has(host.id)) {
      state.passwordCache.delete(host.id);
      await loadFileListing(elements, state, host, remotePath, true);
      return;
    }
    state.fileErrorHostId = host.id;
    state.fileError = toMessage(error);
  } finally {
    state.fileLoadingHostId = "";
    renderFilePanel(elements, state);
  }
}

async function uploadSelectedLocalPath(elements: Elements, state: State, host: Host) {
  const localEntry = state.localListing ? findEntryByPath(state.localListing, state.localSelection) : undefined;
  if (!localEntry || localEntry.isDir) {
    return;
  }

  const password = await ensurePassword(host, state);
  if (host.authType === "password" && password === "") {
    return;
  }

  state.transferStatus = `正在上传 ${localEntry.name} 到 ${host.name}`;
  renderFilePanel(elements, state);

  try {
    await uploadLocalFilePath(host.id, currentRemotePath(state, host), password, localEntry.path);
    state.transferStatus = `已上传 ${localEntry.name}`;
    await loadFileListing(elements, state, host, currentRemotePath(state, host));
  } catch (error) {
    state.transferStatus = `上传失败：${toMessage(error)}`;
    window.alert(toMessage(error));
    renderFilePanel(elements, state);
  }
}

async function downloadSelectedRemotePath(elements: Elements, state: State, host: Host) {
  const selectedPath = state.fileSelection.get(host.id) || "";
  const remoteEntry = findEntryByPath(state.fileListings.get(host.id), selectedPath);
  if (!remoteEntry || remoteEntry.isDir || !state.localListing) {
    return;
  }

  const password = await ensurePassword(host, state);
  if (host.authType === "password" && password === "") {
    return;
  }

  state.transferStatus = `正在下载 ${remoteEntry.name} 到本地`;
  renderFilePanel(elements, state);

  try {
    const result = await downloadFileToLocal(host.id, remoteEntry.path, password, currentLocalPath(state));
    state.transferStatus = `已下载到 ${result.path}`;
    await loadLocalListing(elements, state, currentLocalPath(state));
  } catch (error) {
    state.transferStatus = `下载失败：${toMessage(error)}`;
    window.alert(toMessage(error));
    renderFilePanel(elements, state);
  }
}

async function uploadSelectedFile(elements: Elements, state: State, host: Host, remotePath: string, file: File) {
  const password = await ensurePassword(host, state);
  if (host.authType === "password" && password === "") {
    return;
  }

  state.transferStatus = `正在上传 ${file.name} 到 ${host.name}`;
  renderFilePanel(elements, state);

  try {
    await uploadFile(host.id, remotePath, password, file);
    state.transferStatus = `已上传 ${file.name}`;
    await loadFileListing(elements, state, host, remotePath);
  } catch (error) {
    state.transferStatus = `上传失败：${toMessage(error)}`;
    window.alert(toMessage(error));
    renderFilePanel(elements, state);
  }
}

async function downloadSelectedFile(state: State, host: Host, remotePath: string) {
  const password = await ensurePassword(host, state);
  if (host.authType === "password" && password === "") {
    return;
  }

  try {
    const blob = await downloadFile(host.id, remotePath, password);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = remotePath.split("/").pop() || "download";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    window.alert(toMessage(error));
  }
}

async function ensurePassword(host: Host, state: State, forcePrompt = false) {
  if (host.authType === "key") {
    return "";
  }
  if (!forcePrompt) {
    if (host.hasPassword) {
      return "";
    }
    const cached = state.passwordCache.get(host.id);
    if (cached) {
      return cached;
    }
  }
  const password = window.prompt(`输入 ${host.name} 的密码`) || "";
  if (password) {
    state.passwordCache.set(host.id, password);
  }
  return password;
}

function applyPaneHeight(height: number) {
  document.documentElement.style.setProperty("--file-pane-height", `${height}px`);
}

function currentLocalPath(state: State) {
  return state.localListing?.path || "";
}

function currentRemotePath(state: State, host: Host) {
  return state.fileListings.get(host.id)?.path || ".";
}

function findEntryByPath(listing: RemoteListing | undefined | null, targetPath: string) {
  return listing?.entries.find((entry) => entry.path === targetPath);
}

function sendMessage(socket: WebSocket, payload: SocketMessage) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function socketURL(path: string) {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.host}${path}`;
}

function localParentPath(currentPath: string) {
  if (!currentPath) {
    return "";
  }
  const trimmed = currentPath.replace(/[\\/]+$/, "");
  if (trimmed === "" || trimmed === "/") {
    return currentPath;
  }
  if (/^[A-Za-z]:$/.test(trimmed)) {
    return `${trimmed}\\`;
  }

  const slashIndex = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (slashIndex < 0) {
    return currentPath;
  }

  const parent = trimmed.slice(0, slashIndex) || trimmed.slice(0, 1);
  if (/^[A-Za-z]:$/.test(parent)) {
    return `${parent}\\`;
  }
  return parent || currentPath;
}

function remoteParentPath(currentPath: string) {
  if (currentPath === "." || currentPath === "/") {
    return ".";
  }
  const normalized = currentPath.replace(/\/+$/, "");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash < 0) {
    return ".";
  }
  const parent = normalized.slice(0, lastSlash) || "/";
  return /^[A-Za-z]:$/.test(parent) ? `${parent}/` : parent;
}

function formatSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatTime(value: string) {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) {
    return value;
  }
  return time.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHTML(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
}
