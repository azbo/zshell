(function(){const o=document.createElement("link").relList;if(o&&o.supports&&o.supports("modulepreload"))return;for(const e of document.querySelectorAll('link[rel="modulepreload"]'))s(e);new MutationObserver(e=>{for(const r of e)if(r.type==="childList")for(const c of r.addedNodes)c.tagName==="LINK"&&c.rel==="modulepreload"&&s(c)}).observe(document,{childList:!0,subtree:!0});function t(e){const r={};return e.integrity&&(r.integrity=e.integrity),e.referrerPolicy&&(r.referrerPolicy=e.referrerPolicy),e.crossOrigin==="use-credentials"?r.credentials="include":e.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function s(e){if(e.ep)return;e.ep=!0;const r=t(e);fetch(e.href,r)}})();const a=document.querySelector("#app");a.innerHTML=`
  <main class="shell">
    <section class="panel">
      <p class="eyebrow">Desktop Shell</p>
      <h1>zshell</h1>
      <p class="copy">正在启动本地终端服务并载入桌面工作区。</p>
      <div id="status" class="status">初始化中...</div>
    </section>
  </main>
`;const i=document.querySelector("#status");async function l(){var n,o;try{const t=(o=(n=window==null?void 0:window.go)==null?void 0:n.main)==null?void 0:o.DesktopApp;if(!(t!=null&&t.BackendHealth)||!(t!=null&&t.BackendURL))throw new Error("wails bridge unavailable");const[s,e]=await Promise.all([t.BackendHealth(),t.BackendURL()]);if(i.textContent=s,!e)throw new Error("backend url unavailable");window.location.replace(e)}catch(t){i.textContent=t instanceof Error?t.message:"desktop bootstrap failed",i.classList.add("error")}}l();
