import "./style.css";

const root = document.querySelector("#app");

root.innerHTML = `
  <main class="shell">
    <section class="panel">
      <p class="eyebrow">Desktop Shell</p>
      <h1>zshell</h1>
      <p class="copy">正在启动本地终端服务并载入桌面工作区。</p>
      <div id="status" class="status">初始化中...</div>
    </section>
  </main>
`;

const statusNode = document.querySelector("#status");

async function boot() {
  try {
    const api = window?.go?.main?.DesktopApp;
    if (!api?.BackendHealth || !api?.BackendURL) {
      throw new Error("wails bridge unavailable");
    }

    const [health, url] = await Promise.all([api.BackendHealth(), api.BackendURL()]);
    statusNode.textContent = health;
    if (!url) {
      throw new Error("backend url unavailable");
    }
    window.location.replace(url);
  } catch (error) {
    statusNode.textContent = error instanceof Error ? error.message : "desktop bootstrap failed";
    statusNode.classList.add("error");
  }
}

void boot();
