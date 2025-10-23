# Local-Area-Network-HtmlShare

# 局域网原型分享工具

在本地快速托管 Axure HTML 导出的轻量服务，自动生成局域网链接，让产品经理拖拽文件即可分享给同一网络下的同事。

---

## 给产品经理：如何使用

1. **获取安装包**  
   - 打开团队提供的 GitHub 仓库，进入 Releases 页面。  
   - 根据电脑芯片选择并下载 `AxureShare-macOS-arm64.zip`（Apple Silicon）或 `AxureShare-macOS-x64.zip`（Intel）。  
   - 解压后得到 `AxureShare-...` 文件夹，可放到「应用程序」或桌面等易记位置。
2. **启动服务**  
   - 双击文件夹中的 `AxureShare.command`。首次运行会在后台启动服务并自动打开浏览器，即使关闭弹出的终端窗口也不影响使用。  
   - 页面右上角会提示“上传成功”的链接列表，点击“复制链接”即可将地址放到剪贴板。
3. **上传与分享**  
   - 直接拖入 Axure 导出的 HTML、ZIP 或完整文件夹。  
   - 上传完成后，页面会展示可访问的链接（包含本机地址与可用的局域网地址）。选一个点击“复制链接”，再把链接发给同一网络的同事即可。  
   - 如果同事打不开，先确认双方在同一个 Wi-Fi/有线网络，并检查系统防火墙是否放行 3000 端口。
4. **停止服务**  
   - 双击同一文件夹里的 `StopAxureShare.command`，看到“服务已停止”提示后即可安全退出。

> 小提示：后台日志保存在 `logs/axure-share.log`，若网页异常可以先查看日志文件。页面图标存放在 `public/icon.svg`，如需替换可直接覆盖。

---

## 给研发同学：如何构建安装包

1. 安装依赖：`npm install`  
2. 构建发布物：`npm run build:all`（或按需分别运行 `npm run build:mac` / `npm run build:windows`）  
3. 产物位置：`dist/release/` 下会生成 macOS 双架构与 Windows x64 的文件夹及 ZIP。将对应 ZIP 发给产品经理即可。  
   - 每个包内含：  
     - 独立可执行文件 `axure-share`（无需额外安装 Node.js）  
     - 双击启动/停止脚本  
     - `public/` 前端资源（包含 `icon.svg`）与 `data/` 目录（默认保存上传文件）

**数据目录**：独立包运行时会自动将数据保存到系统用户目录中：macOS 位于 `~/Library/Application Support/AxureShare/`，Windows 位于 `%LOCALAPPDATA%\AxureShare\`。该目录下包含 `sites/`（对外分享的静态文件）与 `uploads/`（上传缓存），更新安装包后历史记录仍会保留。开发模式下仍默认写入仓库根目录的 `data/`，也可以通过环境变量 `AXURE_SHARE_DATA_DIR` 覆盖。

---

## 发布到 GitHub

1. 将整个项目推送到 GitHub 仓库（建议保持主分支包含 `public/`, `server.js`, `.command` 脚本、`scripts/` 等文件）。  
2. 在本地运行 `npm run build:all`，确认 `dist/release/` 下生成 `AxureShare-macOS-arm64.zip`、`AxureShare-macOS-x64.zip` 与 `AxureShare-windows-x64.zip`。  
3. 在 GitHub 创建新的 Release：  
   - 填写版本号及更新说明。  
   - 上传两个 ZIP 包作为二进制附件。  
   - 发布后，将 Release 页面链接分享给需要安装的同事。  
4. 如需更新图标或前端文案，修改 `public/` 目录后重新执行构建并发布新的 Release。

---

## 开发模式（可选）

仍可使用源码模式调试或二次开发：

1. 确认本机 Node.js ≥ 16：`node -v`  
2. `npm install` 安装依赖  
3. `npm run dev` 启动后访问 `http://localhost:3000/`

源码模式下日志、上传内容仍保存在项目目录的 `data/` 中；如需切换到其它位置，可设置环境变量 `AXURE_SHARE_DATA_DIR=/your/path`.

---

## 常见问题

- **复制的链接是 `localhost` 怎么办？** 先点击“复制链接”按钮，页面会优先提供检测到的局域网地址；若仍为 `localhost`，请手动将链接中的主机名替换成本机 IP。  
- **局域网列表为空？** 说明当前未检测到可用 IPv4 地址，常见于关闭 Wi-Fi 或连接受限网络。请确认已联网后刷新页面后再试。  
- **端口冲突？** 在启动脚本前设置环境变量，例如 `PORT=3100 ./AxureShare.command`。  
- **可以上传 `.rp` 文件吗？** 暂不支持，需要先在 Axure 导出 HTML（包含资源文件夹或 ZIP）。  
- **同事使用 Windows？** 可先在 Mac 上运行服务对外分享，其他系统只需通过浏览器访问生成的链接即可。

欢迎继续扩展前端页面或自动同步流程，提交代码时请保持 2 空格缩进与单引号风格。
