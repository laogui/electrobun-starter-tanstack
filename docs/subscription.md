# 订阅与许可证

一次性买断订阅。未激活用户最多 100 张卡片，激活用户无限制。

## 架构

- **后端 API**（独立服务，非本仓库目录）: Node.js/Express，负责签发与校验许可证。客户端只通过环境变量 `LICENSE_API_URL` 与 `USE_ONLINE_LICENSE` 连接，不假设后端在本仓库内。
- **主进程** (`src/bun/license.ts`): 设备指纹、本地加密存储、调用后端 API。
- **渲染进程** (`src/mainview/lib/rpc-license.ts`): 通过 Electrobun RPC 调用主进程。
- **UI**: `LicenseStatusCard` + `LicenseActivationDialog`，集成在设置页 General 面板。
- **限制点**: `canvasStore.createNode` 在创建节点前异步校验许可证状态。

## 防破解策略

1. **硬件绑定**: 设备指纹 = CPU 型号 + 主机名 + 平台 + 架构。
2. **本地加密**: 许可证文件用指纹派生密钥做 XOR 编码，跨机复制失效。
3. **在线校验**: 激活时由后端绑定指纹；后续启动可联网复核。
4. **离线兜底**: 网络失败时不阻塞用户操作（避免误伤）。

许可证密钥格式：`GHOST-XXXX-XXXX-XXXX-XXXX`（十六进制段）。

## 后端 API

后端为独立部署的服务（仓库外），需自行实现并托管。客户端通过以下两个环境变量连接：

- `LICENSE_API_URL` — 后端基地址（如 `https://api.ghostboard.app/api/v1`）。默认回退到 `http://localhost:3001/api/v1`。
- `USE_ONLINE_LICENSE` — 设为 `true` 才启用在线校验；默认关闭（关闭时仅做本地 XOR 混淆，可被离线绕过）。

启动（以独立的后端仓库为例）：

```bash
cd <你的后端仓库>
bun install
bun run server.js   # 默认端口 3001
```

主要端点（需在后端实现）：

- `POST /api/v1/licenses` — 管理端签发新密钥（需 `ADMIN_API_KEY`）。
- `POST /api/v1/licenses/activate` — 激活：绑定密钥到指纹。
- `POST /api/v1/licenses/verify` — 复核：校验密钥+指纹是否匹配。
- `GET  /api/v1/health` — 健康检查。

## 客户端配置

主进程 `src/bun/license.ts` 中的 `API_BASE_URL` 由 `LICENSE_API_URL` 决定，指向后端地址。许可证文件存于工作区 `.ghostboard/license.dat`。

## 卡片限制实现

`src/mainview/store/canvasStore.ts` 的 `createNode`：

1. 统计当前 `card`、`sticky` 和 `topic` 类型节点数量（`COUNTED_NODE_TYPES`）。
2. 调用 `rpcCheckLicense()` 获取激活状态。
3. 未激活且数量 ≥ 100 时通过 `toast.error` 提示并 `return`。
4. 校验失败时容错放行，避免离线阻塞。

注意：当前仅在 `createNode` 一处拦截。如需更强防护，可在以下入口同步添加校验：

- 粘贴 (`pasteClipboard`)
- 复制选中 (`duplicateSelected`)
- 模板应用
- Markdown 导入

## 用户流程

1. 用户在设置 → General → License 看到「Free Version (Limited to 100 cards)」。
2. 点「Activate Pro License」打开对话框，输入密钥。
3. 后端校验成功后写入本地加密文件，UI 切换为「Pro License Active」。
4. 创建第 101 张卡片时不再被拦截。

## 已知边界

- 后端目前使用 JSON 文件持久化，生产环境需替换为正式数据库。
- 离线兜底意味着断网时未激活用户仍可越过 100 上限（首次启动后），需要更严格的策略请关闭 `catch` 中的放行分支。
- XOR + 指纹是混淆级别防护，并非密码学强度；高价值场景建议改用 AES-256-GCM 并加入签名校验。
