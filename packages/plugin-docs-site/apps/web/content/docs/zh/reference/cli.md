---
title: "CLI：create-ghostboard-plugin 与 ghostboard-plugin"
description: "随 npm 发布的脚手架命令与确定性打包 / 签名器。"
section: reference
order: 30
---

## `create-ghostboard-plugin`

```sh
bunx create-ghostboard-plugin <new-directory> [--react|--importer|--combined] [--sdk <spec>]
```

| 选项 | 模板 |
| --- | --- |
| *（无）* | 无构建 JavaScript 命令 + DOM 面板（`manifest.json`、`app.js`、`ui.js`） |
| `--react` | Vite + React 面板；外置 React 与 SDK，附带可选的全局运行时 shim 配置 |
| `--importer` | 无构建的字段映射 + 分段 CSV 导入器 |
| `--combined` | 命令、React 面板、自定义画布类型与 CSV 导入器合为一个无构建包 |

命令拒绝覆盖已存在目录，复制模板并打印下一步。`--sdk <spec>` 改写写入 `package.json` 的 `@ghostboard/sdk` 依赖（例如 `--sdk file:../ghostboard-sdk-0.1.0.tgz`）；它用于对未发布 SDK 验证模板，作者不需要。

每个生成的项目都有 `bun test`（fake host 作者测试）与 `bun run package`。React 模板另有 `bun run build`、`bun run dev`（watch 构建）与 `bun run type-check`。

## `ghostboard-plugin`

随 `@ghostboard/sdk` 安装；生成的 `package` 脚本会调用它，也可以直接运行 `bunx ghostboard-plugin`。

```text
ghostboard-plugin <runtime-directory> [options]

  --output <file>   归档路径。默认 <id>-<version>.ghostboard-plugin。
  --include <path>  包含运行目录下的一个文件或目录（相对路径）。
                    重复使用以打包选定的运行时文件集合。
  --sign <file>     用 Ed25519 PKCS#8 PEM 私钥签名。

ghostboard-plugin --generate-key <private-key.pem>
```

- 不带 `--include` 时，运行目录下的所有常规文件都会打包（React 模板打包 `dist/`）。带 `--include` 时只打包列出的文件（无构建模板列出 `manifest.json`、`app.js` 等，把测试与 `node_modules` 排除在外）。
- 输出必须在运行目录之外，扩展名为 `.ghostboard-plugin` 或 `.zip`。
- 归档是按路径排序写入的 stored ZIP，因此相同输入产生相同 SHA-256。符号链接、不安全路径、超过 256 个文件或 8 MiB 未压缩会被拒绝。
- 打包器校验 manifest v2 并检查入口在归档内。它从不执行插件代码或 lifecycle 脚本。
- `--generate-key` 以仅所有者可读的权限创建私钥、拒绝覆盖，并打印用于 `publicKey` 的 `ed25519-spki:...` 值。把密钥放在运行目录之外并排除在版本控制外；`--sign` 拒绝位于运行目录内的密钥。
- `--sign` 要求 manifest 的 `publicKey` 与密钥匹配；有 `publicKey` 却没有 `--sign` 会被拒绝，所以已签名的 manifest 不会意外以未签名形式发布。

release 文档如何让已签名包可更新，见[签名与更新](/zh/docs/distribution/signing-and-updates/)。
