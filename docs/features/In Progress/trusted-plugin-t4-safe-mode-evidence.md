# Trusted Plugin T4：启动安全模式第一批证据

日期：2026-09-12（Asia/Singapore）

状态：**实现、自动化门禁与 canary 构建已通过；真实 macOS arm64 两次启动恢复尚未运行，因此不是 T4 整阶段退出证据。** 本批只收口启动故障恢复，不把作者签名、TOFU 更新、代码/数据回退或迁移恢复标记为完成。

## 交付范围

1. 应用级 `plugins/startup-state.json` 在第三方代码发布前写入 `starting`；首次 renderer runtime sync 完整 settled 后，经 bearer 鉴权的 `/plugins/startup-ready` 写为 `ready`。
2. 上次启动仍为 `starting` 时，下一次启动自动进入 sticky recovery safe mode；`--safe-mode` 与 `GHOSTBOARD_SAFE_MODE=1` 可在启动前显式进入。
3. 安全模式由 Bun host 在调用插件列表、读取包、创建不可变 generation 或发布入口 URL 之前返回空 descriptor，不依赖 renderer 隐藏。
4. 工作区 enablement 和插件持久数据不被安全模式修改；设置中的插件管理仍可列出、停用故障插件，并可显式准备下一次正常启动。当前会话保持安全模式，避免恢复界面意外执行第三方代码。
5. 损坏的 startup marker 失败关闭；只有成功移出 `.corrupt-*` 副本后才写新状态，无法保留时不覆盖原文件。
6. 普通 plugin panel 继续由独立 React root/error boundary 隔离；本批不宣称能够拦截同 realm 插件的死循环、任意 DOM 修改或进程外副作用。

## 自动化证据

| 命令 | 结果 |
| --- | --- |
| `bunx vitest run --fileParallelism=false --maxWorkers=1 src/bun/plugins/safeMode.test.ts src/bun/plugins/hostController.test.ts src/mainview/plugins/runtime/startPluginRuntime.test.ts src/mainview/components/settings/panels/PluginsPanel.test.tsx src/mainview/lib/rpc.test.ts src/bun/index.test.ts` | PASS；6 files / 105 tests。 |
| `bun run test -- --fileParallelism=false --maxWorkers=1` | PASS；221 files / 2020 tests。jsdom navigation/media 未实现信息为既有测试环境噪声，无失败。 |
| `bun run check` | PASS；723 files。 |
| `bun run type-check` | PASS；仅忽略 29 个 `node_modules/electrobun` 依赖诊断。 |
| `bun run build:canary` | PASS；Vite production renderer 与 macOS arm64 canary app/DMG 生成成功；未请求 codesign/notarization，chunk size 为既有 warning。 |

## 尚未验收

- 尚未在真实 canary 中完成“故障插件导致首次 ready 不达成 → 强退 → 自动安全模式 → 管理页停用 → 下次正常启动”的两次/三次启动序列。
- 尚未验证作者 Ed25519 签名、首次公钥与 update URL 固定、同 ID 更新、密钥变化拒绝、更新失败保留旧版本、代码回退与数据迁移恢复。
- 未运行 Windows / Linux；不改变 T3 对公共外网 HTTPS和人工原生 picker 的既有边界。
