# GhostBoard 上线就绪度评估

> 评估日期：2026-04-27
> 评估范围：基于当前 `package.json`、`electrobun.config.ts`、`docs/PRD.md`、`README.md` 与 `src/` 源码状态

## 总体判断

技术核心已基本可用，大约处于 **MVP 工程完成度 ~80%，但发布工程接近 0%** 的阶段。距离"对公众发布的桌面应用"仍有明显距离 —— **核心能力已经成型，但发布配套基本是空白**。

---

## ✅ 已经具备

- **核心交互完整**：P0/P1 全部完成（画布、连线、Group/Folder、Sticky、图片、Tiptap、撤销重做、右键菜单、键盘快捷键）
- **持久化链路打通**：RPC + manifest + `.md` 拆分 + hydrate
- **多画布视图、Group 嵌套、Markdown 安全预览**已上线
- **测试覆盖扎实**：约 85 个源文件配约 50 个 test 文件，主进程和渲染端都有，且配置了 `vitest --coverage`
- **工程基建到位**：Ultracite/Biome、tsgo strict、Lefthook 预提交、i18n（en/zh）、ErrorBoundary、Sonner 错误处理

---

## 🔴 阻挡上线的硬缺口

按从高到低优先级：

### 1. 缺少 production 构建与发布通道

- `package.json` 只有 `build:canary`，**没有正式 release 通道**
- `README.md` 提到的 `bun run build` / `bun run build:prod` 实际不存在
- 没看到 CI/CD、自动更新、代码签名 / 公证（macOS notarization、Windows authenticode）

### 2. `electrobun.config.ts` 配置未完成

- `mac` 段缺少 `icon`（只有 `linux` / `win` 有），应用图标在 macOS 上不会正确显示
- `version: '0.0.1'`，标识符已就位但版本号需要规划

### 3. PRD 标注的 P2 关键缺失

- ❌ **全局搜索（Cmd+F）** —— 知识库类产品没有搜索几乎不可发布
- ❌ **导出 PNG / JSON**

### 4. README 还是模板原文

`README.md` 仍写着 `React + Tailwind + Vite Electrobun Template`，没有产品介绍、截图、下载链接、license。

### 5. 未处理的 lingering bugs

PRD 末尾列了 2 个未关闭项：

- [ ] Drop area on desktop reported by some
- [ ] Highlight border around webclips isn't removed after undoing resize

### 6. 缺少首次运行体验

workspace 选择 / 创建引导、空状态、错误恢复路径。从代码看 workspace 模块已有，但 onboarding 未见。

---

## ⚪ 锦上添花但不阻挡

- 框选、多 workspace 管理、节点锁定、JSON 导入、移动端适配、Edge 样式定制（P3）
- 崩溃上报 / 匿名遥测、自动更新（Sparkle / Squirrel）
- 官网 / 落地页、隐私政策、许可证文件
- AI 辅助、双向链接（远期）

---

## 估算

如果定义"上线 = 公开 v0.1 可下载安装包，有基础搜索和正式 README"：

| 阶段                       | 主要工作                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| **冲刺到可发布**（必做）   | 全局搜索、导出、修复 2 个 lingering bugs、补 mac 图标、写正式 build 脚本 + 签名公证、重写 README、加 LICENSE |
| **发布质量**（强烈建议）   | 首次运行 onboarding、自动更新、崩溃上报、官网 / 下载页                                          |
| **0.2 增强**               | 框选、JSON 导入导出、多 workspace、Edge 样式                                                   |

---

## 一句话总结

**功能侧再做"搜索 + 导出 + 修 bug"，发布侧从零搭"打包 + 签名 + 自动更新 + 文档 / 官网"**，就能把它从"自用 alpha"推到"公开可下载的 v0.1"。技术底盘已经相当扎实，真正卡住的是发布工程（release engineering）那一段还没开始。
