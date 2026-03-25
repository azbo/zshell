# zshell

一个面向远程 Windows / Linux 的轻量级 Shell GUI 工具。

## 目标

- 安装包小：首选单文件分发，Windows 用 `.exe`，Linux 用单个可执行文件或 `.tar.gz`
- 依赖小：尽量不依赖 Electron、.NET Runtime、JRE 这类大运行时
- 远程统一：优先通过 SSH 同时连接 Linux 和 Windows；对旧版 Windows 预留 WinRM 扩展位
- 易实现：先做能用的 MVP，再逐步加会话管理、命令面板、文件传输

## 结论

当前实现采用：

- 桌面壳：Wails
- 后端：Go
- 终端 UI：本地 HTTP + WebSocket
- 远程协议：
  - Linux：SSH
  - Windows：SSH 优先，WinRM 作为后续兼容选项

最终交付是桌面应用，不再依赖外部浏览器窗口。

## 为什么不是 Electron / Tauri / Wails

- Electron：开发快，但安装包和内存占用都偏大，不符合“小安装包、小依赖”
- Tauri / Wails：比 Electron 小，但仍然依赖系统 WebView 环境，Linux 侧分发复杂度更高
- 本地 Web GUI：最终用户只拿到一个二进制，运行时主要依赖系统浏览器，整体最稳

## MVP 范围

1. 连接管理
2. 多标签远程终端
3. 命令历史与收藏
4. Windows / Linux 主机配置模板
5. 会话日志
6. 基础文件上传下载

详细设计见：

- [架构设计](C:\work\zshell\docs\architecture.md)
- [MVP 规格](C:\work\zshell\docs\mvp.md)

## 建议的首个版本

先只支持 SSH：

- Linux：直接可用
- Windows Server / Windows 10+：启用 OpenSSH Server 后直接可用

这样能最快打通 80% 的远程 Shell 场景，并显著压缩首版复杂度。

## 当前状态

仓库里已经有一版可运行的桌面原型：

- Wails 桌面窗口
- Go 后端，本地 HTTP 服务
- 主机配置增删改查
- 多标签 SSH 终端
- Linux / Windows 主机统一通过 SSH 连接

桌面壳启动后会在应用窗口内加载本机后端页面，不会再打开系统浏览器。

## 开发启动

浏览器模式内核：

1. `cd web && npm install`
2. `npm run build`
3. `go run ./cmd/zshell`

桌面应用模式：

1. `cd frontend && npm install`
2. `cd ..`
3. `wails dev`

## 构建桌面应用

1. `cd frontend && npm install`
2. `cd ..`
3. `wails build -clean`

产物默认在 `build/bin/zshell.exe`

可选环境变量：

- `ZSHELL_ADDR=127.0.0.1:8080`：固定监听地址
- `ZSHELL_NO_BROWSER=1`：启动时不自动打开浏览器

## 当前限制

- Wails 前端当前是桌面壳，实际业务界面由本地后端页面提供
- 只支持 SSH，不含 WinRM
- 密码认证支持在主机设置中保存到系统凭据库
- 主机指纹校验当前为 MVP 级别实现，后续需要补严格校验
- 文件传输、命令收藏、审计日志还未实现
