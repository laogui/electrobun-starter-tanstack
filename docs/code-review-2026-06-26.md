# GhostBoard 全项目深度代码审查报告

**日期**: 2026-06-26
**范围**: 全部源文件 (`src/bun/`, `src/mainview/`, `src/shared/`) + 配置 + 测试覆盖
**总计**: ~120 个源文件, ~100 个测试文件

---

## 目录

- [CRITICAL (必须立即修复)](#critical-必须立即修复)
- [HIGH (高优先级)](#high-高优先级)
- [MEDIUM (应尽快修复)](#medium-应尽快修复)
- [LOW (可计划修复)](#low-可计划修复)
- [优势 (做得好的地方)](#优势-做得好的地方)
- [总结](#总结)

---

## CRITICAL (必须立即修复)

### C1. 幽灵依赖 `"2": "^3.0.0"` — `package.json`

```json
"dependencies": {
    "2": "^3.0.0",
    ...
}
```

npm 上不存在合法的 `"2"` 包。这极可能是合并冲突残留、lockfile 损坏或复制粘贴错误。Bun/npm 可能会安装一个完全无关的包，或在某些环境下报错。**必须确认这到底对应什么包并修正**。

### C2. `loadManifest` 缺少 try-catch — `src/bun/manifest.ts`

```typescript
export async function loadManifest(wsPath, viewFile): Promise<CanvasManifest | null> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) return null;
  return await file.json(); // <-- 损坏的 JSON 直接抛异常
}
```

如果 manifest 文件损坏（磁盘错误、断电写入一半），`file.json()` 抛出未捕获异常，整个 canvas 加载路径崩溃。调用链 `loadCanvas` -> `hydrateCardNoteData` -> 多处未包裹 try-catch。一个损坏的 view 文件会让整个应用无法启动。

### C3. `index.ts` 非空断言 `nodeLocMap.get(idx)!` — `src/bun/index.ts`

Phase 1 中建立 `nodeLocMap`，Phase 2 中用 `!` 强制断言取值。若 Phase 1 因任何原因（竞态、逻辑错误）未填充某 card 节点的映射，直接 `TypeError: Cannot read properties of undefined`，整个保存流程中断。

---

## HIGH (高优先级)

### H1. XOR "加密" 虚假安全 — `src/bun/license.ts`

- `encode`/`decode` 使用 XOR 算法，密钥就是设备指纹，算法完全暴露在源码中
- `validateKey` 用 `Bun.hash`（非加密哈希），校验和公式可逆
- `generateLicenseKey` 用 `Math.random()`（可预测）
- 整套方案是 security-by-obscurity，任何人都能伪造 license 文件

### H2. `getDeviceFingerprint` 使用 `require('node:os')` — `src/bun/license.ts`

全项目统一使用 ESM `import`，唯独此处用 CJS `require()`。在 ESM-only bundling 环境下会崩溃，且缓存行为不同于静态 import。

### H3. `listNoteRecords` 全量加载所有笔记 — `src/bun/noteStore.ts`

每次搜索查询都会调用 `buildNoteIndex`（读取所有 `.md` 文件提取 frontmatter）+ `loadNoteRecord`（解析所有 sidecar JSON）。1000+ 笔记的工作区意味着每次击键（debounce 后）1000+ 次文件读取。**这是搜索性能的定时炸弹**。

### H4. 同步文件系统调用阻塞事件循环 — `src/bun/notes.ts`, `src/bun/cleanup.ts`

- `listFilesRecursive` 使用 `readdirSync`
- `deleteNoteFile` 使用 `unlinkSync`
- `scanUnlinkedNotes` 使用 `statSync` 在循环中

大型工作区下会导致明显的 UI 卡顿。应全部替换为异步版本。

### H5. `document.body.style.overflow` 冲突 — `src/mainview/components/canvas/FocusedView.tsx` + `FolderView.tsx`

两个组件都在 mount 时设 `overflow = 'hidden'`，unmount 时设 `'auto'`。如果同时挂载（从 FolderView 内打开 FocusedView），卸载其中一个会重置另一个的滚动锁定。应使用引用计数器。

### H6. `useCanvasKeyboard` 大 useEffect 依赖 20+ 状态 — `src/mainview/hooks/useCanvasKeyboard.ts`

useEffect 闭包引用 `focusedNode`, `focusedFolder`, `searchOpen` 等 20+ 个 store selector。每次任何状态变化都会重新注册整个 keydown handler。应将读取时机的值改为 ref。

### H7. CanvasComponent 订阅 ~20 个独立 store selector — `src/mainview/routes/index.tsx`

每个 `useCanvasStore((s) => s.X)` 创建独立订阅。拖拽等高频操作修改 store 时，所有 20+ selector 的比较同时触发重渲染。应使用 `useShallow` 或合并 selector。

### H8. `useCanvasPersistence` 视图切换竞态 — `src/mainview/hooks/useCanvasPersistence.ts`

`activeViewId` 变化时的 effect 清理和 Zustand subscription callback 之间存在时间窗口。在切换瞬间，旧视图的 subscription callback 可能对已清空的 store 触发 flush。

### H9. `switchView` 部分失败导致不一致 — `src/mainview/store/canvasStore.ts`

`rpcSaveManifest` 成功后 `setActiveView` 已清除本地 store，但 `rpcSetActiveView` 失败被 `.catch(() => {})` 吞掉。本地已切换但持久化的 activeView 未更新。下次启动加载旧视图。

### H10. blur/visibility change 时 flush 失败静默丢弃 — `src/mainview/hooks/useCanvasPersistence.ts`

```typescript
handleFlush -> flushNow(...).catch(() => {})
```

窗口失焦或标签页切换时的持久化失败被完全吞掉，`dirty` ref 无条件重置为 `false`。用户编辑可能丢失且无任何通知。

---

## MEDIUM (应尽快修复)

### M1. API Key 明文存储 — `src/bun/aicredentials.ts`

LLM API Key 写入 `<userData>/ai-credentials.json` 纯文本。没有设置文件权限，任何能读 userData 目录的进程都能获取。

### M2. 上传端点未验证 `kind` 参数 — `src/bun/localHttpServer.ts`

```typescript
kind: kind as 'audio' | 'file' | 'image' | 'video'
```

直接将 URL query 参数强转为联合类型，任意字符串都会被接受。应使用 zod 或手动验证。

### M3. AI Chat 请求体无运行时验证 — `src/bun/ai.ts`

```typescript
(await req.json()) as { messages, toolDefinitions }
```

直接类型断言，缺少字段时 `streamText` 会报晦涩错误。

### M4. `saveManifest` 隐式修改 RPC 参数对象 — `src/bun/index.ts`

`node.data.noteId = noteId` 直接修改了从 renderer 传来的参数对象。违反 RPC handler 不应修改入参的原则。

### M5. `initWorkspace` 具有隐式副作用 — `src/bun/workspace.ts`

名字像 getter 但实际上创建 6 个目录。部分失败时工作区处于半创建状态。

### M6. `main()` 无优雅关闭处理 — `src/bun/index.ts`

没有 `process.on('beforeExit')` 来 flush debounced 的 nodeMetadata 写入、停止 HTTP server、清理临时文件。

### M7. `nodeMetadata` debounce 写入可能丢失 — `src/bun/nodeMetadata.ts`

`scheduleFlush` 通过 `setTimeout` 延迟写入。进程退出时如果 flush 还未执行，元数据变更丢失。`flushNodeMetadata` 存在但仅在模板 seeding 时调用，不在 shutdown 时。

### M8. `atomicWrite` 崩溃时留下孤儿 `.tmp` 文件 — `src/bun/workspace.ts`

写入临时文件后 rename。如果进程在两步之间崩溃，`.tmp` 文件永不清理。无启动时清理逻辑。

### M9. YAML 导出不完整转义 — `src/bun/markdownExport.ts`

`yamlValue` 只转义 `:`, `#`, `"`, `\n`，但不转义 `{`, `}`, `[`, `]`, `&`, `*`, `?`, `|`, `>`, `%`, `@`, `` ` ``。标题含这些字符时会产生无效 YAML frontmatter。

### M10. `buildPreview()` 无 sanitizeHtml 时默认不消毒 — `src/shared/markdown/preview.ts`

当调用方未传 `sanitizeHtml` 回调时，原始 HTML 直接输出。如果某处调用遗漏回调，存在 XSS 风险。

### M11. Checklist 使用 `key={i}` — `src/mainview/components/canvas/nodes/CardNode.tsx`

数组索引做 key，项目重排序后 React 会错误复用 DOM 节点，checkbox 状态脱序。

### M12. `buildPastedClipboard` 不验证 node type — `src/mainview/store/canvasStore.ts`

粘贴时未检查 node type 是否在 `nodeTypes` 中注册。App 更新移除某 node type 后粘贴旧剪贴板，canvas 会渲染失败。

### M13. `FolderView` 只处理 `move-out` — `src/mainview/components/canvas/FolderView.tsx`

文件夹子项的右键菜单仅处理 `'move-out'`，其他操作（删除、编辑等）静默忽略。

### M14. `biome.jsonc` 关闭多个重要 lint 规则

`noExplicitAny` off, `noNonNullAssertion` off, 多项 accessibility 检查 off。降低了整个项目的安全网。

### M15. `loadAttachment` 大文件全量 base64 编码 — `src/bun/attachments.ts`

25MB 文件被加载到 ArrayBuffer，再 base64 编码（膨胀 4/3），内存占用 ~33MB。

### M16. `LinkNode` effect 自触发循环 — `src/mainview/components/canvas/nodes/LinkNode.tsx`

unfurl effect 调用 `updateNodeData({ unfurlStatus: 'loading' })`，而 `unfurlStatus` 在依赖数组中，导致 effect 立即重新运行。`unfurlAttemptRef` guard 防止重复 fetch，但额外的重跑是浪费。

### M17. `ImageContent` 闪烁 — `src/mainview/components/canvas/nodes/ImageNode.tsx`

`attachmentToLoad` 变化时先设 `resolvedImageUrl = null` 再异步加载，切换 focused/preview 模式时出现可见的 空白 -> 加载 -> 图片 闪烁。

### M18. `rpc.ts` 重试逻辑无限循环 — `src/mainview/lib/rpc.ts`

3 次重试失败后，`__ghostboardNotElectrobun` 未被设置，`__ghostboardInitPromise` 被重置为 `null`。后续调用又会触发新的 3 次重试周期，无限循环。

### M19. `require('node:os')` vs ESM import — `src/bun/license.ts`

全项目统一 ESM，此处独用 CJS `require()`。

### M20. 测试覆盖缺失 — 33+ 源文件无测试

**无测试的模块**: `userprefs.ts`, `license.ts`, `localHttpServer.ts`, `blocknoteMarkdown.ts`(部分), `main.tsx`, `router.tsx`, `settings.tsx`, `settingsClient.ts`, `ZoomLevelContext.tsx`, `initialNodes.ts`, `flags.ts`, `formatRelative.ts`, `searchTypes.ts`, `canvasConstants.ts`, `license-api-mock.ts`, `workspaceAttachmentPaths.ts`, 以及 10+ 组件 (LibraryCard, TagSidebarButton, DeleteTagConfirmDialog, FolderEditDialog, ImageZoomPan, ReplaceImageConfirmDialog, EmptyCanvasOverlay, LibraryButton, SaveIndicator, AboutPanel, AIPanel, GeneralPanel, ShortcutsPanel, WorkspacePanel, SearchEmptyState, resultIcon)。

---

## LOW (可计划修复)

| # | 问题 | 位置 |
|---|------|------|
| L1 | `decodeHtmlEntities` 遗漏 `&nbsp;`, `&mdash;` 等常见实体 | `src/bun/linkPreview.ts` |
| L2 | Bearer token 通过 URL query string 传递（浏览器历史/Referer 泄露） | `src/bun/localHttpServer.ts` + `src/mainview/lib/rpc.ts` |
| L3 | `seedFirstRunIfNeeded` 部分失败时工作区不一致 | `src/bun/workspace.ts` |
| L4 | `NOTE_ID_RE` 拒绝含空格的 legacy note ID | `src/bun/noteStore.ts` |
| L5 | tsconfig.json `"src/**/*.tx"` 是无效 glob（多了个 `*.tx`） | `tsconfig.json` |
| L6 | `cleanup.ts` 的 `collectReferencedIds` 加载含 trash 在内的所有 manifest | `src/bun/cleanup.ts` |
| L7 | `setActiveView` vs `switchView` 命名误导（前者实际是 clearAndSet） | `src/mainview/store/canvasStore.ts` |
| L8 | `saveNow` 是 async 但名字暗示同步 | `src/mainview/hooks/useNoteSaver.ts` |
| L9 | `isContentNode` 实际检查"可否放入 Group"而非内容类型 | `src/mainview/hooks/useNodeDrag.ts` |
| L10 | `getMainViewUrl` 名为 getter 但可阻塞 5 秒（20 次 HEAD 重试） | `src/bun/index.ts` |
| L11 | `ChecklistFocusedView` 无 deps 的 `useEffect` 每次渲染后执行 | `src/mainview/components/canvas/ChecklistFocusedView.tsx` |
| L12 | `document.execCommand('insertText')` 已废弃 | `src/mainview/components/canvas/nodes/StickyNode.tsx` |
| L13 | `useImageZoomPan` 空 deps effect 读取 `containerRef.current` | `src/mainview/hooks/useImageZoomPan.ts` |
| L14 | `SearchDialog` 渲染期间可变 `visibleCursor` 计数器 | `src/mainview/components/search/SearchDialog.tsx` |
| L15 | `restoreView` trash 文件被外部删除时静默成功 | `src/bun/workspace.ts` |
| L16 | `migrateLegacyTagsFromNotes` 启动时读取所有 .md 文件增加启动延迟 | `src/bun/nodeMetadata.ts` |
| L17 | `GroupNode` 的 `requestAnimationFrame` 无完整清理 | `src/mainview/components/canvas/nodes/GroupNode.tsx` |

---

## 优势 (做得好的地方)

- **路径遍历防护** 严格一致：`assertWorkspaceAttachmentPath`, `assertWorkspaceNotePath`, `assertWorkspaceSidecarPath` 全部使用 `relative()` 边界检查
- **SSRF 防护** 全面：`linkPreview.ts` 检查 localhost, 10.x, 172.16-31.x, 192.168.x, link-local, IPv6 loopback, ULA, 并在每次重定向时重新验证
- **原子写入** 一致使用 `atomicWrite` 模式
- **HTML 消毒** 多层防御：preview + markdown export 都使用 DOMPurify
- **Bearer token** 每次启动随机生成
- **URL 协议验证** `normalizeLinkUrl` 正确拒绝 `javascript:`, `data:`, `file:` 等危险协议

---

## 总结

| 严重度 | 数量 | 最关键领域 |
|--------|------|-----------|
| CRITICAL | 3 | 幽灵依赖、manifest 未防护、非空断言 |
| HIGH | 10 | License 安全、搜索性能 O(n)、同步 I/O、overflow 冲突、状态竞态、flush 丢失 |
| MEDIUM | 20 | API Key 明文、输入验证缺失、YAML 转义、XSS 边界、测试缺失 33+ 模块 |
| LOW | 17 | 命名误导、废弃 API、边缘实体、启动延迟 |

### 建议修复优先级

1. **C1** - 幽灵依赖 `"2": "^3.0.0"` (package.json)
2. **C2** - `loadManifest` 未防护 JSON 解析 (manifest.ts)
3. **H3** - 搜索全量加载 O(n) 性能 (noteStore.ts)
4. **H4** - 同步文件系统调用 (notes.ts, cleanup.ts)
5. **H5** - overflow 冲突 (FocusedView + FolderView)
6. **H9/H10** - 状态一致性 (canvasStore + useCanvasPersistence)
7. **H1** - License 安全方案重设计
8. **M20** - 补充 33+ 无测试模块的测试覆盖
