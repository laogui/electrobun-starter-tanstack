# 打包与发布流程

GhostBoard 使用 Electrobun 内置的更新机制，配合 Cloudflare R2 托管发布产物。
本文档说明整体流程、一次性配置，以及发布时要执行的操作。

## 工作原理

1. `electrobun build --env=<channel>` 编译应用，并在项目根目录生成扁平的
   `artifacts/` 文件夹，文件名格式为 `{channel}-{os}-{arch}-*`，例如：
   - `stable-macos-arm64-update.json`（版本元数据，客户端拉取这个）
   - `stable-macos-arm64-GhostBoard.dmg`（安装包）
   - `stable-macos-arm64-GhostBoard.app.tar.zst`（更新用压缩包）
   - `stable-macos-arm64-<hash>.patch`（增量补丁）
2. `scripts/upload-r2.ts` 把 `artifacts/` 里所有文件上传到 R2 bucket。
3. 已安装的客户端调用 `Updater.checkForUpdate()`（已在 `src/bun/index.ts` 接好），
   自动从 `release.baseUrl` 拉取对应 `update.json`，比对 hash 后下载补丁或完整包。

> `update.json` 由 Electrobun 自动生成，无需手写。`artifacts/` 每次构建会清空重建，
> 且只包含当前主机平台的文件，所以上传脚本直接全量上传即可。

## 渠道（channel）

- `dev`：本地开发，永不签名、不参与更新。
- `canary`：预发布/灰度，用于验证发布链路。
- `stable`：正式版。

## 跨平台说明（重要）

`electrobun build` 只能为「当前运行的操作系统/架构」打包，单机无法同时产出
Windows 和 macOS。因此：

- **正式发布**走 GitHub Actions 矩阵（macOS arm64 + macOS x64 + Windows x64），
  每个 runner 构建并上传自己平台的产物到同一个 R2 bucket，互不覆盖。
- **本地** `release:*` 命令只产出当前主机平台，适合快速验证。
- Windows 当前**不签名**（用户首次安装可能看到 SmartScreen 提示）。

---

## 一次性配置

### 1. Cloudflare R2

1. 开通 R2，创建 bucket（如 `ghostboard-releases`）。
2. R2 → Manage API Tokens 创建 S3 兼容凭证，拿到 Access Key ID / Secret。
3. 记下 Account ID。
4. 给 bucket 绑定**自定义域名**（如 `https://dl.ghostboard.app`），作为公开访问地址。
5. 新增一条 **Cache Rule**：当路径匹配 `*-update.json` 时设为 **Bypass cache**
   （或很短的 TTL）。R2 不会自动设置 `Cache-Control`，不做这一步客户端可能拿到
   被 CDN 缓存的旧版本信息。

### 2. Apple 签名与公证（仅 macOS）

1. 加入 Apple Developer Program（$99/年）。
2. 创建并安装 **Developer ID Application** 证书。
3. 在 appleid.apple.com 生成 **App-Specific Password**（用于公证）。
4. 记下 **Team ID** 与完整身份串
   `Developer ID Application: Your Name (TEAMID)`。

### 3. 本地 `.env`

复制 `.env.example` 为 `.env` 并填写。`.env` 已被 git 忽略，**切勿提交**。

```bash
cp .env.example .env
```

需要填写的变量见 `.env.example` 的注释（R2 凭证 + Apple 签名）。
没有 Apple 变量时，本地非 dev 构建会自动跳过签名，仍可正常打包。

### 4. GitHub Actions Secrets

在 GitHub 仓库 Settings → Secrets and variables → Actions 添加：

R2：
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_PUBLIC_BASE_URL`（结尾必须带 `/`）
- `R2_KEY_PREFIX`（可选，留空即上传到 bucket 根目录）

Apple：
- `ELECTROBUN_DEVELOPER_ID`
- `ELECTROBUN_TEAMID`
- `ELECTROBUN_APPLEID`
- `ELECTROBUN_APPLEIDPASS`

Mac 证书导入（CI 专用）：
- `APPLE_CERT_P12_BASE64`：把 Developer ID 证书导出为 `.p12`，再执行
  `base64 -i cert.p12 | pbcopy` 得到的字符串。
- `APPLE_CERT_PASSWORD`：导出 `.p12` 时设置的密码。
- `KEYCHAIN_PASSWORD`：任意临时密码（CI 创建临时钥匙串用）。

---

## 发布操作

### 方式 A：正式发布（推荐，跨平台全自动）

1. 在 `electrobun.config.ts` 的 `app.version` 升版本号（如 `1.0.1`），
   同步更新 `package.json` 的 `version`。
2. 提交并打 tag 推送：

   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```

3. GitHub Actions 自动构建 3 个平台、签名公证 mac、上传 R2。推 tag 默认走
   `stable` 渠道。
4. 也可在 Actions 页面用 **Run workflow** 手动触发，并选择 `canary` 或 `stable`。

### 方式 B：本地单平台（快速验证）

在对应操作系统的机器上：

```bash
# 编译 + 上传，一条命令
bun run release:canary     # 或 release:stable
```

拆开执行也可以：

```bash
bun run build:canary       # 仅编译，产物在 artifacts/
bun run upload:r2 --env=canary   # 仅上传 artifacts/ 到 R2
```

---

## 验证更新链路

1. 安装一个旧版本（较低 `app.version` 或不同 hash）。
2. 发布一个新版本到同一渠道。
3. 打开旧版本 App，确认 `checkForUpdate` 能检测到更新。
4. 直接访问 `https://<你的域名>/<channel>-<os>-<arch>-update.json` 应能看到
   最新的 hash/version，且响应未被长时间缓存。

## 常见问题

- **mac 构建报 “Env var ELECTROBUN_DEVELOPER_ID is required to codesign”**：
  本地缺少 Apple 变量。要么补全 `.env`，要么用 dev 渠道构建（不签名）。
- **客户端检测不到更新**：检查 `R2_PUBLIC_BASE_URL` 是否结尾带 `/`、自定义域名是否
  生效、`*-update.json` 的 Cache Rule 是否已配置。
- **Windows 安装出现 SmartScreen 提示**：当前 Windows 未签名，属预期行为。

## 相关文件

- `electrobun.config.ts` — 签名开关与 `release.baseUrl`。
- `scripts/upload-r2.ts` — 上传脚本。
- `.github/workflows/release.yml` — CI 发布流程。
- `.env.example` — 环境变量模板。
