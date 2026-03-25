# 架构设计

## 设计目标

- 安装包尽量控制在 15 到 30 MB 级别
- 运行时尽量不额外安装大型依赖
- 同时支持远程 Linux 和远程 Windows
- 首版优先做稳定的终端连接，不先做复杂运维编排

## 技术路线对比

### 方案 A：Electron + xterm.js

优点：

- 生态成熟
- 终端体验好
- 前端开发效率高

缺点：

- 安装包通常偏大
- 内存占用高
- 不符合本项目的“小安装包、小依赖”

结论：不选。

### 方案 B：Tauri / Wails + Web 前端

优点：

- 比 Electron 小很多
- 能保留桌面应用体验
- 适合做系统托盘、文件关联、原生菜单

缺点：

- 仍依赖系统 WebView
- Linux 发行版差异会放大分发复杂度
- 首版工程成本高于单二进制本地 Web GUI

结论：可以作为第二阶段桌面化方向，但不作为首版。

### 方案 C：Go 单二进制 + 本地 Web GUI

优点：

- 最小依赖模型，用户只拿一个可执行文件
- 跨平台分发简单
- Go 对 SSH、并发、嵌入静态资源都很合适
- 远程连接核心逻辑可完全放在后端

缺点：

- UI 依赖默认浏览器打开
- 原生桌面能力较弱

结论：首版最合适，选用此方案。

## 最终推荐

### 技术栈

- 后端：Go
- 前端：Vanilla TypeScript 或 Svelte + xterm.js
- 进程通信：WebSocket
- 配置存储：`yaml` 或 `json`
- 密码存储：
  - 优先使用系统凭据库
  - 无法接入时，退化为本地加密存储

### 核心模块

1. `app`
   - 程序入口
   - 启动本地 HTTP 服务
   - 自动打开浏览器

2. `session`
   - 会话生命周期管理
   - 标签页与重连状态

3. `connector/ssh`
   - Linux 远程执行
   - Windows over SSH
   - PTY、窗口 resize、stdin/stdout 转发

4. `connector/winrm`
   - 仅第二阶段引入
   - 用于兼容未启用 SSH 的 Windows 环境

5. `storage`
   - 主机配置
   - 收藏命令
   - 历史记录

6. `webui`
   - 连接列表
   - 终端标签页
   - 命令面板
   - 文件传输入口

## 远程协议策略

### Linux

- 使用 SSH
- 默认启动交互式 shell：`bash`、`zsh`、`sh` 依次探测

### Windows

优先级：

1. SSH + PowerShell
2. SSH + `cmd.exe`
3. WinRM + PowerShell

说明：

- 现代 Windows 对 OpenSSH 支持已经足够覆盖大量场景
- 如果首版直接做 SSH，可以显著降低协议差异带来的维护成本

## 数据流

1. 用户打开本地 GUI
2. GUI 通过 HTTP 读取主机列表
3. 用户点击连接
4. 前端通过 WebSocket 创建会话
5. 后端建立 SSH 连接并申请远程 PTY
6. 远程输出经 WebSocket 推送到 xterm.js
7. 用户输入经 WebSocket 回写到远程 shell

## 安全设计

- 不默认明文存储密码
- 支持密钥登录
- 支持已知主机指纹校验
- 会话日志默认关闭，开启时明确提示
- 所有本地监听地址默认仅绑定 `127.0.0.1`

## 包体控制策略

- 后端单静态二进制
- 前端静态资源压缩后嵌入
- 不引入重量级 UI 框架
- 首版不做内嵌浏览器，不打包 Chromium

## 建议目录结构

```text
zshell/
  cmd/zshell/
  internal/app/
  internal/session/
  internal/connector/ssh/
  internal/connector/winrm/
  internal/storage/
  web/
  docs/
```

## 里程碑

### Milestone 1

- SSH 连接
- 多标签终端
- 主机配置增删改查
- 基础日志

### Milestone 2

- 收藏命令
- 上传下载
- 会话重连
- SSH 密钥管理

### Milestone 3

- WinRM
- 批量执行
- 系统托盘
- 桌面壳层封装
