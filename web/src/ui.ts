import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

import { deleteHost, downloadFile, listFiles, loadHosts, saveHost, uploadFile } from "./api";
import type { AuthType, Host, Platform, RemoteEntry, RemoteListing, SocketMessage } from "./types";

type TerminalTab = {
  id: string;
  host: Host;
  term: Terminal;
  fit: FitAddon;
  socket: WebSocket;
  node: HTMLDivElement;
  status: string;
};

type Elements = {
  hostTree: HTMLDivElement;
  hostCount: HTMLSpanElement;
  hostSearch: HTMLInputElement;
  newHostButton: HTMLButtonElement;
  connectSelectedButton: HTMLButtonElement;
  editSelectedButton: HTMLButtonElement;
  editorPanel: HTMLAsideElement;
  closeEditorButton: HTMLButtonElement;
  hostForm: HTMLFormElement;
  formMode: HTMLSpanElement;
  deleteHostButton: HTMLButtonElement;
  tabBar: HTMLDivElement;
  terminalStage: HTMLDivElement;
  fileSplitter: HTMLDivElement;
  statusBanner: HTMLDivElement;
  workspaceTitle: HTMLHeadingElement;
  filePath: HTMLSpanElement;
  fileBody: HTMLDivElement;
  fileRefreshButton: HTMLButtonElement;
  fileUpButton: HTMLButtonElement;
  fileDownloadButton: HTMLButtonElement;
  fileUploadButton: HTMLButtonElement;
  fileInput: HTMLInputElement;
  footerStatus: HTMLSpanElement;
};

type State = {
  hosts: Host[];
  selectedHostId: string;
  editingId: string;
  activeTabId: string;
  search: string;
  editorOpen: boolean;
  terminals: Map<string, TerminalTab>;
  passwordCache: Map<string, string>;
  fileListings: Map<string, RemoteListing>;
  fileSelection: Map<string, string>;
  fileLoadingHostId: string;
  fileErrorHostId: string;
  fileError: string;
  filePaneHeight: number;
  draggingFilePane: boolean;
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
          <span>搜索</span>
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
            <div class="workspace-meta">SSH / Windows / Linux</div>
          </div>
          <div id="tab-bar" class="tab-bar"></div>
          <section id="terminal-stage" class="terminal-stage">
            <div class="empty-state">
              <h3>选择一台主机并连接</h3>
              <p>左侧像 WindTerm 一样管理会话树，中间保留多标签终端，底部为真实 SFTP 文件面板。</p>
            </div>
          </section>
          <div id="file-splitter" class="file-splitter" role="separator" aria-orientation="horizontal"></div>
          <section class="file-pane">
            <div class="file-pane-head">
              <div>
                <p class="eyebrow">File Panel</p>
                <h3>文件面板</h3>
              </div>
              <div class="file-toolbar">
                <button id="file-up" class="mini-button" type="button">上级</button>
                <button id="file-refresh" class="mini-button" type="button">刷新</button>
                <button id="file-upload" class="mini-button" type="button">上传</button>
                <button id="file-download" class="mini-button" type="button">下载</button>
              </div>
            </div>
            <div class="file-path-strip">
              <span id="file-path" class="path-pill">未连接</span>
            </div>
            <div class="file-grid-head">
              <span>名称</span>
              <span>类型 / 大小</span>
              <span>修改时间 / 说明</span>
            </div>
            <div id="file-body" class="file-grid-body"></div>
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
            <small>主机配置只存结构信息，密码不会持久化</small>
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
            <label><span>密码</span><input name="password" type="password" placeholder="可选：保存在本地配置" /></label>
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
    editorOpen: false,
    terminals: new Map(),
    passwordCache: new Map(),
    fileListings: new Map(),
    fileSelection: new Map(),
    fileLoadingHostId: "",
    fileErrorHostId: "",
    fileError: "",
    filePaneHeight: 250,
    draggingFilePane: false,
  };

  bindUI(elements, state);
  applyPaneHeight(state.filePaneHeight);
  window.addEventListener("resize", () => resizeActiveTerminal(state));

  void refreshHosts(elements, state);
  renderEditor(elements, state);
  renderFilePanel(elements, state);
}

function queryElements(): Elements {
  return {
    hostTree: document.querySelector<HTMLDivElement>("#host-tree")!,
    hostCount: document.querySelector<HTMLSpanElement>("#host-count")!,
    hostSearch: document.querySelector<HTMLInputElement>("#host-search")!,
    newHostButton: document.querySelector<HTMLButtonElement>("#new-host")!,
    connectSelectedButton: document.querySelector<HTMLButtonElement>("#connect-selected")!,
    editSelectedButton: document.querySelector<HTMLButtonElement>("#edit-selected")!,
    editorPanel: document.querySelector<HTMLAsideElement>("#editor-panel")!,
    closeEditorButton: document.querySelector<HTMLButtonElement>("#close-editor")!,
    hostForm: document.querySelector<HTMLFormElement>("#host-form")!,
    formMode: document.querySelector<HTMLSpanElement>("#form-mode")!,
    deleteHostButton: document.querySelector<HTMLButtonElement>("#delete-host")!,
    tabBar: document.querySelector<HTMLDivElement>("#tab-bar")!,
    terminalStage: document.querySelector<HTMLDivElement>("#terminal-stage")!,
    fileSplitter: document.querySelector<HTMLDivElement>("#file-splitter")!,
    statusBanner: document.querySelector<HTMLDivElement>("#status-banner")!,
    workspaceTitle: document.querySelector<HTMLHeadingElement>("#workspace-title")!,
    filePath: document.querySelector<HTMLSpanElement>("#file-path")!,
    fileBody: document.querySelector<HTMLDivElement>("#file-body")!,
    fileRefreshButton: document.querySelector<HTMLButtonElement>("#file-refresh")!,
    fileUpButton: document.querySelector<HTMLButtonElement>("#file-up")!,
    fileDownloadButton: document.querySelector<HTMLButtonElement>("#file-download")!,
    fileUploadButton: document.querySelector<HTMLButtonElement>("#file-upload")!,
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
  elements.fileSplitter.addEventListener("mousedown", (event) => {
    state.draggingFilePane = true;
    document.body.classList.add("resizing");
    event.preventDefault();
  });
  window.addEventListener("mousemove", (event) => {
    if (!state.draggingFilePane) {
      return;
    }
    const nextHeight = Math.max(140, Math.min(window.innerHeight * 0.5, window.innerHeight - event.clientY - 28));
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

  elements.fileRefreshButton.addEventListener("click", () => {
    const host = activeOrSelectedHost(state);
    if (host) {
      void loadFileListing(elements, state, host, currentRemotePath(state, host));
    }
  });
  elements.fileUpButton.addEventListener("click", () => {
    const host = activeOrSelectedHost(state);
    if (host) {
      void loadFileListing(elements, state, host, remoteParentPath(currentRemotePath(state, host)));
    }
  });
  elements.fileUploadButton.addEventListener("click", () => {
    if (activeOrSelectedHost(state)) {
      elements.fileInput.click();
    }
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
      keyPath: String(formData.get("keyPath") || "").trim(),
      defaultShell: String(formData.get("defaultShell") || "").trim(),
    };

    try {
    const saved = await saveHost(payload, state.editingId);
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
  renderTabs(elements, state);
  renderFilePanel(elements, state);
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
  elements.formMode.textContent = "新增";
  setInput(elements.hostForm, "name", "");
  setInput(elements.hostForm, "address", "");
  setInput(elements.hostForm, "port", "22");
  setInput(elements.hostForm, "username", "");
  setInput(elements.hostForm, "platform", "linux");
  setInput(elements.hostForm, "authType", "password");
  setInput(elements.hostForm, "password", "");
  setInput(elements.hostForm, "keyPath", "");
  setInput(elements.hostForm, "defaultShell", "");
  renderEditor(elements, state);
}

function fillForm(elements: Elements, state: State, host: Host) {
  state.selectedHostId = host.id;
  state.editingId = host.id;
  state.editorOpen = true;
  elements.formMode.textContent = "编辑";
  setInput(elements.hostForm, "name", host.name);
  setInput(elements.hostForm, "address", host.address);
  setInput(elements.hostForm, "port", String(host.port));
  setInput(elements.hostForm, "username", host.username);
  setInput(elements.hostForm, "platform", host.platform);
  setInput(elements.hostForm, "authType", host.authType);
  setInput(elements.hostForm, "password", host.password || "");
  setInput(elements.hostForm, "keyPath", host.keyPath || "");
  setInput(elements.hostForm, "defaultShell", host.defaultShell || "");
  renderEditor(elements, state);
  renderHosts(elements, state);
  renderFilePanel(elements, state);
}

function renderEditor(elements: Elements, state: State) {
  elements.editorPanel.classList.toggle("open", state.editorOpen);
}

function setInput(form: HTMLFormElement, name: string, value: string) {
  const element = form.elements.namedItem(name);
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) {
    element.value = value;
  }
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
  };
  state.terminals.set(tabId, tab);
  state.activeTabId = tabId;
  state.selectedHostId = host.id;
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
    handleSocketMessage(elements, state, tabId, message);
  });
  socket.addEventListener("close", () => {
    tab.term.writeln("\r\n\x1b[31m[session closed]\x1b[0m");
    tab.status = "closed";
    renderTabs(elements, state);
    renderHosts(elements, state);
    renderFilePanel(elements, state);
  });
  socket.addEventListener("error", () => {
    tab.term.writeln("\r\n\x1b[31m[connection error]\x1b[0m");
    tab.status = "error";
    renderTabs(elements, state);
    renderHosts(elements, state);
    renderFilePanel(elements, state);
  });
  term.onData((data) => sendMessage(socket, { type: "input", data }));
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
}

function renderTabs(elements: Elements, state: State) {
  elements.tabBar.innerHTML = "";
  for (const tab of state.terminals.values()) {
    const button = document.createElement("button");
    button.className = `tab ${tab.id === state.activeTabId ? "active" : ""}`;
    button.innerHTML = `
      <span class="tab-mark ${tab.status}"></span>
      <span>${escapeHTML(tab.host.name)}</span>
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
  renderTabs(elements, state);
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
      <p>左侧像 WindTerm 一样管理会话树，中间保留多标签终端，底部为文件面板预留区。</p>
    </div>
  `;
  elements.statusBanner.textContent = "等待连接";
  elements.workspaceTitle.textContent = "远程终端工作台";
  elements.footerStatus.textContent = "就绪";
  renderTabs(elements, state);
  renderHosts(elements, state);
  renderFilePanel(elements, state);
}

function renderFilePanel(elements: Elements, state: State) {
  const host = activeOrSelectedHost(state);
  if (!host) {
    elements.filePath.textContent = "未连接";
    elements.fileBody.innerHTML = `<div class="file-empty">选择主机后可浏览远程目录。</div>`;
    elements.fileUpButton.disabled = true;
    elements.fileRefreshButton.disabled = true;
    elements.fileUploadButton.disabled = true;
    elements.fileDownloadButton.disabled = true;
    return;
  }

  const listing = state.fileListings.get(host.id);
  const selectedPath = state.fileSelection.get(host.id) || "";
  const currentPath = currentRemotePath(state, host);
  const isLoading = state.fileLoadingHostId === host.id;
  const hasError = state.fileErrorHostId === host.id && state.fileError !== "";

  elements.filePath.textContent = `${host.username}@${host.address}  ${currentPath}`;
  elements.fileUpButton.disabled = currentPath === ".";
  elements.fileRefreshButton.disabled = isLoading;
  elements.fileUploadButton.disabled = isLoading;
  elements.fileDownloadButton.disabled = !selectedPath || !!findEntryByPath(listing, selectedPath)?.isDir;

  if (isLoading) {
    elements.fileBody.innerHTML = `<div class="file-empty">正在读取 ${escapeHTML(currentPath)} ...</div>`;
    return;
  }
  if (hasError) {
    elements.fileBody.innerHTML = `<div class="file-error">${escapeHTML(state.fileError)}</div>`;
    return;
  }
  if (!listing) {
    elements.fileBody.innerHTML = `<div class="file-empty">点击“刷新”或先建立终端连接后自动加载目录。</div>`;
    return;
  }
  if (listing.entries.length === 0) {
    elements.fileBody.innerHTML = `<div class="file-empty">当前目录为空。</div>`;
    return;
  }

  elements.fileBody.innerHTML = listing.entries
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

  for (const node of elements.fileBody.querySelectorAll<HTMLButtonElement>(".file-row-item")) {
    node.addEventListener("click", () => {
      const path = node.dataset.path || "";
      state.fileSelection.set(host.id, path);
      renderFilePanel(elements, state);
    });
    node.addEventListener("dblclick", () => {
      const path = node.dataset.path || "";
      if (node.dataset.dir === "true") {
        void loadFileListing(elements, state, host, path);
        return;
      }
      state.fileSelection.set(host.id, path);
      void downloadSelectedFile(state, host, path);
    });
  }
}

function row(name: string, type: string, note: string) {
  return `
    <div class="file-row">
      <span>${escapeHTML(name)}</span>
      <span>${escapeHTML(type)}</span>
      <span>${escapeHTML(note)}</span>
    </div>
  `;
}

function syncWorkspace(elements: Elements, state: State, tab: TerminalTab) {
  elements.statusBanner.textContent = `${tab.host.name}: ${tab.status}`;
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

async function uploadSelectedFile(elements: Elements, state: State, host: Host, remotePath: string, file: File) {
  const password = await ensurePassword(host, state);
  if (host.authType === "password" && password === "") {
    return;
  }

  try {
    await uploadFile(host.id, remotePath, password, file);
    await loadFileListing(elements, state, host, remotePath);
  } catch (error) {
    window.alert(toMessage(error));
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
    if (host.password) {
      state.passwordCache.set(host.id, host.password);
      return host.password;
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

function currentRemotePath(state: State, host: Host) {
  return state.fileListings.get(host.id)?.path || ".";
}

function findEntryByPath(listing: RemoteListing | undefined, targetPath: string) {
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
