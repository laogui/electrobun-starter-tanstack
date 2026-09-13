# T4 作者签名与 TOFU 手动更新证据

日期：2026-09-13（Asia/Singapore）  
状态：**代码、自动化回归和 macOS arm64 canary 构建通过；真实桌面更新操作尚未作为 T4 退出验收执行。**

## 本批范围

本批完成作者侧 Ed25519 密钥生成与确定性签名包、宿主侧签名验证、首次安装 TOFU 身份固定、同 ID 手动 ZIP/URL 更新门禁、密钥或更新源变化拒绝，以及设置页 verified/unsigned 状态。它不把签名描述成代码安全审核，也不包含自动检查、显式代码回退或数据迁移恢复。

## 冻结协议

- manifest `publicKey` 使用 `ed25519-spki:<base64 SPKI DER>`；其他算法、松散文本或非规范 base64 在 manifest 解析阶段拒绝。
- 包根签名文件固定为 `ghostboard-signature.json`，schema 为 `ghostboard-plugin-signature/v1`，只允许 `schema`、`algorithm`、`treeSha256`、`signature` 四个字段。
- canonical payload schema 为 `ghostboard-plugin-signature-payload/v1`，按固定 JSON 字段顺序绑定 plugin ID、semver、签名树 SHA-256 与规范化 `update.url`（缺失时为 `null`），并以一个换行结束。
- 签名树摘要按排序路径写入 `[path, byteLength]` 后写入文件字节，只排除 envelope 本身；安装 tree digest 继续覆盖 envelope 在内的全部落盘文件。

## 作者工具链

`packages/plugin-sdk/package-plugin.js` 新增：

```sh
bun sdk/package-plugin.js --generate-key ../plugin-keys/example.pem
bun sdk/package-plugin.js dist \
  --sign ../plugin-keys/example.pem \
  --output release/example-1.0.0.ghostboard-plugin
```

密钥生成使用独占写入并创建 owner-only 私钥；实际 Bun CLI 探针得到 mode 0600。packer 拒绝覆盖已有 key、拒绝 runtime 目录内的私钥、拒绝 manifest/key 不匹配、拒绝作者预置 envelope，也拒绝声明 `publicKey` 却未传 `--sign`。相同 runtime 和 key 连续生成的两个归档字节完全一致，并由生产安装 store 验证后 commit。

## 宿主与事务行为

- prepare 解压并解析 manifest 后验证 envelope、签名树摘要与 Ed25519；key/envelope 只出现一方、内容或签名改变均按无效包拒绝。
- 首次签名安装把规范化 public key、update URL 和签名树摘要同时写入 install journal 与 registry，崩溃恢复不依赖 renderer 内存。
- 同 ID 更新只有在旧版本已验证、新版本 semver 前进、新包签名有效、public key 相同且 update URL 相同时才允许。
- 未签名首装继续允许并显示 unsigned，但不能原地转换为签名身份；作者需使用新 plugin ID。
- 更新 commit 原子替换每 ID 的活动 registry 条目，但保留旧版本目录；当前工作区清除旧 digest enablement，新代码必须再次经过高信任启用确认。
- prepare 与 commit 之间 staging 内容、manifest 或 envelope 变化会记录 failed/replaced journal 并清理 staging。
- registry 损坏重建会验证保留目录，只选择每 ID 最新可信版本，不会把旧回退目录重新暴露成第二个活动版本。

## 自动化结果

- 签名/TOFU 定向：7 files / 84 tests 通过。
- 全量串行：223 files / 2037 tests 通过。
- `bun run type-check`：通过；只忽略仓库既有的 29 项 Electrobun `node_modules` 诊断。
- `bun run check`：727 files 通过。
- `git diff --check`：通过。
- `bun run build:canary`：通过，生成 macOS arm64 app/DMG；本轮未请求 codesign 或 notarization，未配置 Electrobun patch `baseUrl`。

## 明确保留边界

- 尚未在真实桌面 UI 执行签名首装、同 key 更新、换 key 拒绝和重新启用序列。
- 固定 `update.url` 的 release descriptor 下载、包摘要联合校验与自动检查尚未接入。
- 旧目录当前只是保留材料；用户可见的 previous 状态、显式代码回退和回退数据兼容门禁尚未实现。
- 数据迁移备份、失败恢复和真实多次启动安全模式序列仍属于后续 T4 验收。
