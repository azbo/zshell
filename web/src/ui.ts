import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

import { deleteHost, loadHosts, saveHost } from "./api";
import type { AuthType, Host, Platform, SocketMessage } from "./types";

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
  statusBanner: HTMLDivElement;
  workspaceTitle: HTMLHeadingElement;
  filePath: HTMLSpanElement;
  fileBody: HTMLDivElement;
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
              <p>左侧像 WindTerm 一样管理会话树，中间保留多标签终端，底部为文件面板预留区。</p>
            </div>
          </section>
          <section class="file-pane">
            <div class="file-pane-head">
              <div>
                <p class="eyebrow">File Panel</p>
                <h3>文件面板</h3>
              </div>
              <span id="file-path" class="path-pill">未连接</span>
            </div>
            <div class="file-grid-head">
              <span>名称</span>
              <span>类型</span>
              <span>说明</span>
            </div>
            <div id="file-body" class="file-grid-body"></div>
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
  };

  bindUI(elements, state);
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
    statusBanner: document.querySelector<HTMLDivElement>("#status-banner")!,
    workspaceTitle: document.querySelector<HTMLHeadingElement>("#workspace-title")!,
    filePath: document.querySelector<HTMLSpanElement>("#file-path")!,
    fileBody: document.querySelector<HTMLDivElement>("#file-body")!,
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

  elements.deleteHostButton.addEventListener("click", async () => {
    if (!state.editingId) {
      return;
    }
    try {
      await deleteHost(state.editingId);
      if (state.selectedHostId === state.editingId) {
        state.selectedHostId = "";
      }
      state.editingId = "";
      state.editorOpen = false;
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

  const password = host.authType === "password" ? window.prompt(`输入 ${host.name} 的密码`) || "" : "";
  if (host.authType === "password" && password === "") {
    term.dispose();
    node.remove();
    return;
  }

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

function handleSocketMessage(elements: Elements, state: State, tabID: string, message: SocketMessage) {
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
    elements.fileBody.innerHTML = `<div class="file-empty">SFTP 文件面板将在下一步接入。</div>`;
    return;
  }

  const activeTab = findTabByHost(state, host.id);
  elements.filePath.textContent = `${host.username}@${host.address}`;
  elements.fileBody.innerHTML = [
    row("平台", host.platform, host.platform === "windows" ? "PowerShell / cmd over SSH" : "Bash / Zsh over SSH"),
    row("认证", host.authType === "key" ? "密钥" : "密码", host.authType === "key" ? host.keyPath || "未设置" : "连接时输入"),
    row("默认 Shell", host.defaultShell || "远端默认 shell", "可在主机配置中覆盖"),
    row("会话状态", activeTab?.status || "idle", activeTab ? "已在上方标签管理" : "双击左侧会话树快速连接"),
    row("文件区", "SFTP 待接入", "当前先预留 WindTerm 风格布局，下一步接入上传下载"),
  ].join("");
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

function sendMessage(socket: WebSocket, payload: SocketMessage) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function socketURL(path: string) {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.host}${path}`;
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
