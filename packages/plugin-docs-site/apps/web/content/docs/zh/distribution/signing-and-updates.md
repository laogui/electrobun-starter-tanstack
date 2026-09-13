---
title: "签名与更新"
description: "创建作者密钥、签名安装包、通过 HTTPS 发布 release 文档，并理解首次信任固定承诺什么、不承诺什么。"
section: distribution
order: 20
---

GhostBoard 的更新采用**首次使用即信任**（TOFU）：已签名插件首次安装时固定作者公钥与更新 URL。之后该插件 ID 的每次更新都必须用同一密钥签名、来自同一 URL、版本更高。不需要其他东西——没有账号、域名购买、证书机构或审核。

## 1. 创建作者密钥

```sh
ghostboard-plugin --generate-key ../plugin-keys/yourname.notes.pem
```

把密钥放在运行目录之外并排除在版本控制外。命令打印一个 `ed25519-spki:...` 值；把它写进 `manifest.json`：

```json
"publicKey": "ed25519-spki:MCowBQYDK2VwAyEA...",
"update": { "url": "https://example.com/plugins/yourname.notes/releases.json" }
```

在首次签名发布之前就声明 `update.url`。两个值在安装时一起固定；之后改任何一个都意味着用户必须卸载并安装一个新的插件 ID。

## 2. 打包时签名

```sh
ghostboard-plugin dist \
  --sign ../plugin-keys/yourname.notes.pem \
  --output release/yourname.notes-0.1.0.ghostboard-plugin
```

归档多出 `ghostboard-signature.json`（schema v1）。它的 Ed25519 载荷绑定插件 ID、版本、规范化更新 URL 以及其余所有文件的排序 SHA-256 树。GhostBoard 在显示审阅步骤前校验它。篡改任何文件、更换密钥、或从曾经签名的 ID 上移除签名都会失败关闭。

## 3. 发布 release 文档

把归档与一份 JSON release 文档托管在固定的 `update.url`，都在公共 HTTPS 上：

```json
{
  "schema": "ghostboard-plugin-release/v2",
  "pluginId": "yourname.notes",
  "channel": "stable",
  "releases": [
    {
      "version": "0.1.1",
      "ghostboard": ">=1.0.0 <2.0.0",
      "url": "https://example.com/plugins/yourname.notes/yourname.notes-0.1.1.ghostboard-plugin",
      "sha256": "9abca983b696e39fc0977f8dcfccaa7b1df093e81f400280fb7842b49d8bc8bf",
      "notes": "Fix CSV quoting."
    },
    {
      "version": "0.1.0",
      "ghostboard": ">=1.0.0 <2.0.0",
      "url": "https://example.com/plugins/yourname.notes/yourname.notes-0.1.0.ghostboard-plugin",
      "sha256": "605aa4482daa0c68ef094132936a5efe665addb7c054aab60ebb25b44b73b34f"
    }
  ]
}
```

规则：`schema` 与上文完全一致；`channel` 为小写标识符；1–50 条 release，`version` 为唯一 semver；每条 `ghostboard` 是 `>=a.b.c <x.y.z` 范围；每个 `url` 是不含 userinfo 的 HTTPS；`sha256` 是归档的小写十六进制摘要（用 `shasum -a 256` 打印）；可选 `notes` 最多 8 KiB；文档最多 1 MiB 且必须是 JSON 而非 HTML 页面。用无缓存或短缓存提供该文档，让用户尽快看到新版本。

## 4. 用户看到什么

**检查更新** 下载文档，选出 `ghostboard` 范围包含用户版本的最新 release，用与 URL 安装相同的检查下载该归档，校验 `sha256`、manifest 与签名，然后显示 **已验证更新 x.y.z，等待你确认安装**。安装会保留上一版本的文件：**将代码回退到 …** 在重新校验后恢复它们，任何 `dataVersion` 迁移都会先写备份。回退后的插件保持停用直到重新启用。

如果文档用不同密钥签名、指向不同 URL、列出的版本不更高，或摘要不匹配，GhostBoard 会以“作者密钥已变更”或具体校验错误拒绝，并保留已安装版本。

## 签名不意味着什么

- 它不证明你是谁；它证明更新来自持有首个密钥的人。
- 它不让代码变安全。无论是否签名，插件都以高信任运行。
- 没有密钥轮换。密钥丢失或泄露意味着新的插件 ID。
