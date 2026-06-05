# Phase 6 开发方案 · 右键 / 多选 / 拖入

> 配套 roadmap：`docs/product-detail-roadmap.md` 的 **Phase 6**。
> 本文是「可直接照着写」的实现方案，按任务拆到文件 / 函数 / 数据结构级别。
> 实现完成后请回填 roadmap 的状态列。

## 0. 总览

| ID | 名称 | 主要改动文件 | 依赖 |
|---|---|---|---|
| G1 | Image 右键：替换图片 / 复制图片地址 / 在 Finder 显示 | ContextMenu, useContextMenu, index.tsx, bun RPC | bun RPC |
| G2 | Link 右键：打开链接 / 复制 URL / 重新抓取 | ContextMenu, useContextMenu, bun RPC | bun RPC |
| G3 | Asset 右键：在 Finder 显示 / 替换文件 / 重命名 | ContextMenu, useContextMenu, index.tsx, AssetNode, store, bun RPC | bun RPC |
| G5 | 多选右键分支：批量改色 / 批量加 tag / 删除 | ContextMenu, useContextMenu, store | - |
| H1 | LinkCreateForm 粘贴板预填 URL | LinkCreateForm | - |
| H2 | 全屏「Drop to add」蒙层 | index.tsx | - |
| H3 | CreateMenu「导入 Markdown…」 | ViewSwitcher, bun RPC, rpc.ts | bun RPC |

**建议实现顺序**：先做 §1（bun RPC 基建），其余任务都依赖它；然后 G2 → G1 → G3（context menu 三连，逐步加 handler）→ G5 → H1 → H2 → H3。每完成一组跑一次 `bun run test` + `bun run type-check`（源码 0 错，node_modules/electrobun 既有报错忽略）+ `bunx ultracite fix`。

### 作用域决策（务必先读）

- **G3「重命名」语义**：只改卡片 displayName（`data.title` / `data.fileName` 的展示名），**不动** workspace 真实文件名，避免破坏导出 / 同步。决策已在 roadmap 决策点确认。
- **G5「批量移到 view」**：当前 store 没有跨画布迁移 manifest 的能力（`detachNoteFromCanvas` / `pinNoteToCanvas` 仅针对 library，不是跨 view）。该子项实现成本高且**不在验收标准内**（验收只要求「批量改色生效」）。**本方案先不做 move-to-view**，G5 落地：批量改色 + 批量加 tag + 批量删除（删除已天然多选）。如后续要做 move-to-view，需新增 `moveNodesToView(ids, targetViewId)` store op + bun 端把节点写入目标 view manifest 并从当前 manifest 移除，单独开 Phase 6.1。

---

## 1. Bun RPC 基建（先做）

三个新 RPC，都加到 `src/bun/index.ts` 的 `CanvasRPC` schema（`requests:` 块）+ `handlers.requests` 实现，并在 `src/mainview/lib/rpc.ts` 加 wrapper（不在 Electrobun 时返回 `null` / `{success:false}`）。

### 1.1 `revealAttachment` — 在 Finder 显示（G1/G3 共用）

Image 用 `data.imageFile`、Asset 用 `data.attachmentFile`，都是 `attachments/...` 相对路径，复用同一个 RPC。

**Schema**（`src/bun/index.ts` requests 块）：
```ts
revealAttachment: {
  params: { filePath: string };
  response: { success: boolean };
};
```

**Handler**（`handlers.requests`，紧挨 `openAttachment`）：
```ts
revealAttachment: async ({ filePath }) =>
  revealWorkspaceAttachment(wsPath, filePath),
```

**`src/bun/attachments.ts` 新增**（仿 `openAttachment`，用 `Utils.showItemInFolder`）：
```ts
export async function revealAttachment(
  wsPath: string,
  filePath: string
): Promise<{ success: boolean }> {
  const { fullPath } = assertWorkspaceAttachmentPath(wsPath, filePath); // 已做路径穿越校验
  const file = Bun.file(fullPath);
  if (!(await file.exists())) {
    return { success: false };
  }
  Utils.showItemInFolder(fullPath);
  return { success: true };
}
```
在 `index.ts` 顶部 import 处加 `revealAttachment as revealWorkspaceAttachment`。

**安全**：路径穿越已由 `assertWorkspaceAttachmentPath` 兜住（仅允许 `attachments/` 内、禁 `..`），无需额外处理。

### 1.2 `openExternalUrl` — 打开链接（G2）

**Schema**：
```ts
openExternalUrl: {
  params: { url: string };
  response: { success: boolean };
};
```

**Handler**：
```ts
openExternalUrl: async ({ url }) => {
  // 只允许 http/https/mailto，挡掉 file:// / javascript: 等危险 scheme
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { success: false };
  }
  const ALLOWED = new Set(['http:', 'https:', 'mailto:']);
  if (!ALLOWED.has(parsed.protocol)) {
    return { success: false };
  }
  return { success: Utils.openExternal(url) };
},
```
`Utils` 已在 `index.ts` import。

### 1.3 `importMarkdownFiles` — 导入 Markdown（H3）

打开文件选择器（多选 .md），逐个读内容、生成 noteId、写入笔记文件，返回给 renderer 用来建卡片。

**Schema**：
```ts
importMarkdownFiles: {
  params: Record<string, unknown>;
  response: {
    canceled?: boolean;
    notes: Array<{ noteId: string; title: string }>;
  };
};
```

**Handler**（参考已有 `pickExportFolder` / `createNote` / `saveNote` 用法）：
```ts
importMarkdownFiles: async () => {
  const selected = await Utils.openFileDialog({
    allowedFileTypes: 'md',
    allowsMultipleSelection: true,
    canChooseDirectory: false,
    canChooseFiles: true,
    startingFolder: '~/Desktop',
  });
  const paths = selected.filter(Boolean);
  if (paths.length === 0) {
    return { canceled: true, notes: [] };
  }
  const notes: Array<{ noteId: string; title: string }> = [];
  for (const path of paths) {
    const file = Bun.file(path);
    if (!(await file.exists())) {
      continue;
    }
    const raw = await file.text();
    // 复用 notes.ts 的 parseFrontmatter 拆 frontmatter / body
    const { frontmatter, body } = parseFrontmatter(raw);
    const baseName = path.split('/').pop()?.replace(/\.md$/i, '') ?? 'Untitled';
    // 标题优先级：frontmatter.title > 首个 # 标题 > 文件名
    const headingMatch = body.match(/^#\s+(.+)$/m);
    const title =
      (typeof frontmatter.title === 'string' && frontmatter.title) ||
      headingMatch?.[1]?.trim() ||
      baseName;
    const noteId = crypto.randomUUID();
    const filePath = await createNote(wsPath, noteId, title, 'text'); // 写空 body 的 .md
    // 覆盖写入真实 markdown body（createNote 只写了空 body）
    await saveNote(
      wsPath,
      filePath,
      { id: noteId, title, displayHint: 'text', ...frontmatter },
      body
    );
    notes.push({ noteId, title });
  }
  return { notes };
},
```
> 注意 `createNote(wsPath, noteId, title, displayHint)` 返回 `filePath`，内部已 `saveNote(..., '')`；这里再 `saveNote` 一次覆盖 body。也可以直接复刻 createNote 的 filePath 规则后只 saveNote 一次，二选一，保持简单即可。
> `parseFrontmatter` / `saveNote` / `createNote` 都从 `src/bun/notes.ts` 导出，确认 import。

### 1.4 `src/mainview/lib/rpc.ts` wrappers

```ts
export async function rpcRevealAttachment(filePath: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) return { success: false };
  return eb.rpc.request.revealAttachment({ filePath });
}

export async function rpcOpenExternalUrl(url: string) {
  const eb = await getElectrobun();
  if (!eb?.rpc) return { success: false };
  return eb.rpc.request.openExternalUrl({ url });
}

export async function rpcImportMarkdownFiles() {
  const eb = await getElectrobun();
  if (!eb?.rpc) return { canceled: true, notes: [] as Array<{ noteId: string; title: string }> };
  return eb.rpc.request.importMarkdownFiles({});
}
```

### 1.5 测试（bun 侧，可单测的纯逻辑）

- `src/bun/attachments.test.ts`：`revealAttachment` 对越界路径抛错 / 不存在文件返回 `{success:false}`（`Utils.showItemInFolder` 用 mock）。
- importMarkdown 的标题推导逻辑建议抽成纯函数 `deriveMarkdownTitle(frontmatter, body, fileName)` 放在 `notes.ts` 并单测（frontmatter > heading > filename 三条分支）。

---

## 2. G1 / G2 / G3 — Context Menu 三连

### 2.1 i18n（先加 message key）

`messages/en.json` + `messages/zh.json` 同步新增，然后 `bunx paraglide-js compile --project ./project.inlang --outdir ./src/paraglide`：

| key | en | zh |
|---|---|---|
| `menu_open_link` | Open Link | 打开链接 |
| `menu_copy_url` | Copy URL | 复制 URL |
| `menu_refetch_link` | Refetch Preview | 重新抓取 |
| `menu_copy_image_address` | Copy Image Address | 复制图片地址 |
| `menu_replace_image` | Replace Image… | 替换图片… |
| `menu_replace_file` | Replace File… | 替换文件… |
| `menu_reveal_in_finder` | Reveal in Finder | 在访达中显示 |
| `menu_rename_asset` | Rename | 重命名 |
| `toast_copied` | Copied | 已复制 |
| `toast_open_link_failed` | Could not open link | 无法打开链接 |
| `toast_reveal_failed` | File not found | 找不到文件 |
| `toast_replace_failed` | Replace failed | 替换失败 |

> macOS 文案用「访达」，跨平台可考虑「在文件夹中显示」。本仓库目标 macOS，沿用「访达」。

### 2.2 `ContextMenu.tsx` — 菜单项

在对应 `getXItems(locked)` builder 里插入新项（图标用 lucide）：

- **`getLinkItems`**：在 `focus` 之后、`edit-url` 附近加：
  ```ts
  { id: 'open-link', label: m.menu_open_link(), icon: ExternalLink },
  { id: 'copy-url', label: m.menu_copy_url(), icon: LinkIcon },
  { id: 'refetch-link', label: m.menu_refetch_link(), icon: RefreshCw },
  ```
  新 import：`ExternalLink, RefreshCw`（`lucide-react`）。
- **`getImageItems`**：在 `focus` 之后加：
  ```ts
  { id: 'replace-image', label: m.menu_replace_image(), icon: ImageIcon },
  { id: 'copy-image-address', label: m.menu_copy_image_address(), icon: Copy },
  { id: 'reveal-in-finder', label: m.menu_reveal_in_finder(), icon: FolderOpen },
  ```
- **`getAssetItems`**：在 `focus` 之后加：
  ```ts
  { id: 'reveal-in-finder', label: m.menu_reveal_in_finder(), icon: FolderOpen },
  { id: 'replace-file', label: m.menu_replace_file(), icon: FilePlus },
  { id: 'rename-asset', label: m.menu_rename_asset(), icon: PenLine },
  ```
  新 import 按需：`ImageIcon, FolderOpen, FilePlus, PenLine` 部分已 import，补齐缺的。

> 菜单高度变化会影响 `CanvasContextMenu` 里 `y = Math.min(menu.y, window.innerHeight - items.length*40 - 16)` 的定位，已是动态计算，无需改。

### 2.3 `useContextMenu.ts` — handler 分支

在 `handleContextMenuAction` 的 `switch` 里加 case。需要在 hook 顶部多取一个 store action：`const updateNodeData = useCanvasStore((s) => s.updateNodeData);`，并 import 新 rpc wrapper + `toast`（已 import）。

```ts
case 'open-link': {
  if (nodeId) {
    const node = useCanvasStore.getState().nodes.find((n) => n.id === nodeId);
    const url = (node?.data as { url?: unknown })?.url;
    if (typeof url === 'string' && url) {
      const res = await rpcOpenExternalUrl(normalizeLinkUrl(url) ?? url);
      if (!res?.success) toast(m.toast_open_link_failed());
    }
  }
  break;
}
case 'copy-url': {
  if (nodeId) {
    const node = useCanvasStore.getState().nodes.find((n) => n.id === nodeId);
    const url = (node?.data as { url?: unknown })?.url;
    if (typeof url === 'string' && url) {
      navigator.clipboard.writeText(url).then(() => toast(m.toast_copied()));
    }
  }
  break;
}
case 'refetch-link': {
  if (nodeId) {
    // 复用 LinkNode 的 retry 逻辑：置 idle 触发 unfurl effect 重新抓取
    updateNodeData(nodeId, { unfurlStatus: 'idle', unfurlError: undefined });
  }
  break;
}
case 'copy-image-address': {
  if (nodeId) {
    const node = useCanvasStore.getState().nodes.find((n) => n.id === nodeId);
    const data = (node?.data ?? {}) as { imageUrl?: unknown };
    const addr = typeof data.imageUrl === 'string' ? data.imageUrl : '';
    if (addr) navigator.clipboard.writeText(addr).then(() => toast(m.toast_copied()));
  }
  break;
}
case 'reveal-in-finder': {
  if (nodeId) {
    const node = useCanvasStore.getState().nodes.find((n) => n.id === nodeId);
    const data = (node?.data ?? {}) as { imageFile?: unknown; attachmentFile?: unknown };
    const rel = (typeof data.attachmentFile === 'string' && data.attachmentFile) ||
                (typeof data.imageFile === 'string' && data.imageFile) || '';
    if (rel) {
      const res = await rpcRevealAttachment(rel);
      if (!res?.success) toast(m.toast_reveal_failed());
    }
  }
  break;
}
case 'replace-image':
case 'replace-file': {
  if (nodeId && onReplaceNodeFile) {
    onReplaceNodeFile(nodeId, action === 'replace-image' ? 'image' : 'asset');
  }
  break;
}
case 'rename-asset': {
  if (nodeId) setRenamingNodeId(nodeId); // 见 §2.5
  break;
}
```

> `handleContextMenuAction` 现在是同步函数但内部已有 `.then()` 异步用法；新增 `await` 需要把回调改成 `async`（`async (action, nodeId?) => {...}`），`ContextMenu.tsx` 调用处不关心返回值，安全。`normalizeLinkUrl` 从 `@/lib/contentTypes` import。
> 别忘了把新依赖加进 `useCallback` deps：`updateNodeData, onReplaceNodeFile, setRenamingNodeId`。

新增 hook option：
```ts
interface UseContextMenuOptions {
  // ...existing
  onReplaceNodeFile?: (nodeId: string, kind: 'image' | 'asset') => void;
}
```

### 2.4 `index.tsx` — 替换文件流程（G1 替换图片 / G3 替换文件共用）

复用现有隐藏 `<input type="file">` 模式，但**新增一个独立的替换 input**（避免和 asset 创建的 input 串味），加一个 ref 记录替换目标。

```tsx
const replaceFileInputRef = useRef<HTMLInputElement>(null);
const replaceTargetRef = useRef<{ nodeId: string; kind: 'image' | 'asset' } | null>(null);

const onReplaceNodeFile = useCallback((nodeId: string, kind: 'image' | 'asset') => {
  replaceTargetRef.current = { nodeId, kind };
  // image 限定图片类型，asset 任意
  replaceFileInputRef.current!.accept = kind === 'image' ? 'image/*' : '';
  replaceFileInputRef.current?.click();
}, []);

const onReplaceFileInputChange = useCallback(
  async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const target = replaceTargetRef.current;
    replaceTargetRef.current = null;
    if (!(file && target)) return;
    try {
      const saved = await saveAssetFileWithProgressToast(file); // 返回 {filePath, fileName, mimeType, kind, size, previewExcerpt?, thumbnailFile?...}
      if (target.kind === 'image') {
        updateNodeData(target.nodeId, {
          imageFile: saved.filePath,
          imageUrl: '',          // 清掉旧远程地址
          thumbnailUrl: undefined,
        });
      } else {
        updateNodeData(target.nodeId, {
          attachmentFile: saved.filePath,
          fileName: saved.fileName,
          mimeType: saved.mimeType,
          kind: saved.kind,
          size: saved.size,
          // 重新生成的预览字段按 saveAssetFile 返回值透传
          previewExcerpt: saved.previewExcerpt,
          thumbnailFile: saved.thumbnailFile,
          archiveSummary: saved.archiveSummary,
        });
      }
    } catch (e) {
      console.error('[canvas] replace file failed:', e);
      toast.error(m.toast_replace_failed());
    }
  },
  [updateNodeData]
);
```

> 先确认 `saveAssetFileWithProgressToast`（`@/lib/assetImportProgress`）的实际返回字段，按真实结构透传，别凭空塞字段。`updateNodeData` 从 store 取。

把 input 挂到 JSX（紧挨现有 asset input）：
```tsx
<input className="hidden" onChange={onReplaceFileInputChange} ref={replaceFileInputRef} type="file" />
```

把 `onReplaceNodeFile` 传给 `useContextMenu({ ..., onReplaceNodeFile })`。

### 2.5 G3 重命名 — store + AssetNode 内联编辑

只改 displayName（`data.title`，AssetNode 标题展示用它，回退 `fileName`）。

**store**（`canvasStore.ts`）：仿 `renamingFolderId` 新增通用 `renamingNodeId`：
```ts
// state
renamingNodeId: string | null;          // 接口 + 初始值 null
setRenamingNodeId: (id: string | null) => void;  // set({ renamingNodeId: id })
```
> 也可直接复用 `renamingFolderId` 改名为更通用，但新增独立字段不影响 folder 逻辑，更安全。

**AssetNode.tsx**：读 `renamingNodeId === id` 时把标题渲染成受控 `<input>`：
- 进入：autofocus + select 全选。
- 提交（Enter / blur）：`updateNodeData(id, { title: draft.trim() })` 然后 `setRenamingNodeId(null)`。
- 取消（Esc）：`setRenamingNodeId(null)` 不保存。
- 参考 FolderNode 的内联重命名实现（`setRenamingFolderId` 那套）保持交互一致。

### 2.6 测试（G1/G2/G3）

`useContextMenu` 已有测试文件？若有就扩展，否则在 `src/mainview/hooks/useContextMenu.test.tsx` 加：
- `copy-url` 调 `navigator.clipboard.writeText`（mock）+ 弹 toast。
- `refetch-link` 调 `updateNodeData(id, {unfurlStatus:'idle'})`。
- `reveal-in-finder` 对 asset 用 `attachmentFile`、对 image 用 `imageFile` 调 `rpcRevealAttachment`（mock rpc）。
- `open-link` 调 `rpcOpenExternalUrl`，失败弹 toast。
- `replace-image` / `replace-file` 调 `onReplaceNodeFile(nodeId, kind)`。
ContextMenu 渲染测试：image/link/asset 菜单包含新项 label。

---

## 3. G5 — 多选右键分支

### 3.1 触发：`useContextMenu.onNodeContextMenu`

右键时判断当前选中数量，>1 且右键节点在选区内 → target 用新的 `'multi'`：
```ts
const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
  e.preventDefault();
  const selected = useCanvasStore.getState().nodes.filter((n) => n.selected);
  const isMulti = selected.length > 1 && selected.some((n) => n.id === node.id);
  setContextMenu({
    x: e.clientX,
    y: e.clientY,
    target: isMulti ? 'multi' : nodeContextMenuTarget(node.type),
    nodeId: node.id,
  });
}, []);
```

### 3.2 `ContextMenu.tsx`：新 target `'multi'`

- `ContextMenuState['target']` 联合类型加 `'multi'`。
- 新 builder：
  ```ts
  const getMultiItems = (): MenuItem[] => [
    { id: 'change-color', label: m.menu_change_color(), icon: Palette },
    { id: 'edit-tag', label: m.menu_edit_tag(), icon: Tag },
    { id: 'copy', label: m.menu_copy(), icon: Copy, shortcut: '⌘C' },
    { id: 'delete', label: m.menu_delete(), icon: Trash2, shortcut: '⌫', danger: true },
  ];
  ```
- `itemGetters` 注册 `multi: getMultiItems`。

### 3.3 `useContextMenu.ts`：批量 handler

`copy` / `delete` 已天然多选（检测 `selected.length>1`），无需改。新增/调整：
- **`change-color`**：改成多选感知——若右键节点在多选中，对每个选中节点调 `changeNodeColor(id)`（各自循环色卡）；否则单个。
  ```ts
  case 'change-color': {
    if (nodeId) {
      const selected = useCanvasStore.getState().nodes.filter((n) => n.selected);
      const ids = selected.length > 1 && selected.some((n) => n.id === nodeId)
        ? selected.map((n) => n.id) : [nodeId];
      for (const id of ids) changeNodeColor(id);
    }
    break;
  }
  ```
  > `changeNodeColor` 每次内部都 `saveSnapshot()`，批量会产生多次快照。可接受（undo 多步）；若要单步 undo，需新增 `changeNodesColor(ids)` 一次性 set + 单次 snapshot。**建议先用循环版，保持最小改动**，体验问题再优化。
- **`edit-tag`（批量加 tag）**：tag 编辑器是单节点 UI（`setEditingTagNodeId` 只接一个 id）。最小可用做法：对多选只打开「右键那个节点」的 tag 编辑器（`setEditingTagNodeId(nodeId)`），即沿用现有行为，不真正批量。
  > 若要真正批量加 tag，需要新增 store op `applyTagToNodes(ids, tag, color?)` + 一个轻量批量输入 UI。这超出验收范围，**建议先沿用单节点 tag 编辑器**，并在 roadmap 注明「批量 tag = 对右键节点编辑」。如坚持批量，再开子任务。

### 3.4 测试

- `onNodeContextMenu` 在多选时产出 `target:'multi'`。
- `change-color` 多选时对每个 id 调一次 `changeNodeColor`。
- ContextMenu 渲染 `multi` target 含「批量改色 / 删除」。

---

## 4. H1 — LinkCreateForm 粘贴板预填

`src/mainview/components/canvas/LinkCreateForm.tsx`：挂载时读剪贴板，若是合法 URL 则预填 `value`。

```ts
useEffect(() => {
  inputRef.current?.focus();
  let cancelled = false;
  navigator.clipboard
    ?.readText?.()
    .then((text) => {
      if (cancelled) return;
      const trimmed = text.trim();
      // 复用 createLinkNodeData 校验：能解析成 link 才预填
      if (trimmed && createLinkNodeData(trimmed)) {
        setValue((prev) => (prev ? prev : trimmed)); // 不覆盖用户已输入
      }
    })
    .catch(() => {
      // 剪贴板权限被拒，忽略
    });
  return () => { cancelled = true; };
}, []);
```
> `createLinkNodeData` 已 import。`navigator.clipboard.readText` 在 Electrobun webview 里需 https/安全上下文；失败静默。两个入口（右键 popover + 底部 create menu）都走这个 form，一处改动两处生效。

**测试**：mock `navigator.clipboard.readText` 返回 URL → input value 预填；返回非 URL → 保持空；已有输入不被覆盖。

---

## 5. H2 — 全屏「Drop to add」蒙层

`src/mainview/routes/index.tsx`：drop 逻辑（`onDropCanvas`）已存在，只补一个拖入态蒙层。

- 用计数器避免子元素 dragenter/dragleave 抖动：
  ```ts
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragDepthRef = useRef(0);

  const onDragEnterWindow = useCallback((e: React.DragEvent) => {
    const types = Array.from(e.dataTransfer?.types ?? []);
    if (!types.includes('Files')) return; // 只对文件拖入显示
    dragDepthRef.current += 1;
    setIsDraggingFile(true);
  }, []);
  const onDragLeaveWindow = useCallback(() => {
    dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0;
      setIsDraggingFile(false);
    }
  }, []);
  ```
- 在 `onDropCanvas` 末尾（无论是否命中）重置：`dragDepthRef.current = 0; setIsDraggingFile(false);`。
- 把 `onDragEnter={onDragEnterWindow} onDragLeave={onDragLeaveWindow}` 挂到最外层容器 `<div className="relative h-screen ...">`（不是 ReactFlow，确保覆盖整窗）。
- 蒙层 JSX（最外层 div 内、ReactFlow 之上）：
  ```tsx
  <AnimatePresence>
    {isDraggingFile ? (
      <motion.div
        animate={{ opacity: 1 }} initial={{ opacity: 0 }} exit={{ opacity: 0 }}
        className="pointer-events-none fixed inset-0 z-[200] flex items-center justify-center bg-blue-500/10 backdrop-blur-[2px]"
      >
        <div className="rounded-2xl border-2 border-blue-400 border-dashed bg-white/90 px-8 py-6 text-blue-600 text-lg font-medium shadow-xl dark:bg-neutral-900/90 dark:text-blue-300">
          {m.drop_to_add()}
        </div>
      </motion.div>
    ) : null}
  </AnimatePresence>
  ```
- i18n：`drop_to_add` = "Drop to add" / "拖入以添加"。
- `pointer-events-none` 让 drop 事件继续落到底层 ReactFlow 的 `onDrop`。

**测试**：fireEvent dragEnter（dataTransfer.types 含 'Files'）→ 出现「Drop to add」；drop / dragLeave → 消失。

---

## 6. H3 — CreateMenu「导入 Markdown…」

### 6.1 ViewSwitcher 底部 create menu 加项

`src/mainview/components/canvas/ViewSwitcher.tsx`：在 `createMenuItems.map(...)` 之后、`onOpenNoteLibrary` 项之前，加一个固定 `<Menu.Item>`：
```tsx
<Menu.Item
  aria-label={m.menu_import_markdown()}
  className="flex cursor-default items-center gap-3 px-4 py-3 ... border-t ..."
  closeOnClick
  onClick={onImportMarkdown}
>
  <FileDown size={18} />  {/* 或 Upload 图标 */}
  {m.menu_import_markdown()}
</Menu.Item>
```
- `m.menu_import_markdown`：en "Import Markdown…" / zh "导入 Markdown…"。
- `onImportMarkdown` 作为新 prop 由 `index.tsx` 传入（和 `onCreateNode` 同级）。

### 6.2 index.tsx 导入处理

```ts
const onImportMarkdown = useCallback(async () => {
  const res = await rpcImportMarkdownFiles();
  if (res.canceled || res.notes.length === 0) return;
  // 在视口中心附近逐个落卡片，错位排布
  const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  res.notes.forEach((note, i) => {
    onCreateNode('note', {
      anchorCenter: { x: center.x + i * 28, y: center.y + i * 28 },
      data: { type: 'text', noteId: note.noteId, title: note.title },
    });
  });
  toast(m.toast_markdown_imported({ count: res.notes.length }));
}, [onCreateNode, screenToFlowPosition]);
```
- 传给 `<ViewSwitcher onImportMarkdown={onImportMarkdown} .../>`。
- 卡片 `data.noteId` 指向 bun 已写好的 .md；卡片首次进入编辑会 `rpcLoadBlockNote(noteId)` → 无 sidecar → 从 markdown 初始化（`recoveredFromMarkdown:true`），正文即导入内容。✅
- `resolveCreatableKind('note')`/`createNode('note')` 走现有 card 创建链路；确认 `'note'` 是合法 `CreatableCanvasNodeKind`（registry 里 card/checklist...，note 对应 card 的 text 类型——核对 `CREATABLE_KIND_BY_ACTION`，若 'note' 不是直接 kind，则用对应的 card kind + `data.type:'text'`）。

> ⚠️ **落地前核对**：`onCreateNode` 第一个参数的合法 kind 集合。从 `creatableNodes.ts` 的 `CREATABLE_KIND_BY_ACTION` 确认 'note' 映射；若 createNode 只认 `'card'`，则传 `'card'` + `data:{type:'text', noteId, title}`。

- i18n：`toast_markdown_imported` = "Imported {count} notes" / "已导入 {count} 篇笔记"。

### 6.3 测试

- bun：`importMarkdownFiles` 标题推导（抽纯函数单测，见 §1.5）。
- renderer：mock `rpcImportMarkdownFiles` 返回 2 notes → `onCreateNode` 被调 2 次且带 noteId。

---

## 7. 收尾校验清单

1. `bunx paraglide-js compile --project ./project.inlang --outdir ./src/paraglide`（新增所有 message key 后）。
2. `bun run type-check` —— 项目源码 0 错（`node_modules/electrobun` 既有 27 个报错忽略）。
3. `bunx ultracite fix src/...`（改动文件）→ `bunx ultracite check` 干净。
4. `bun run test` 全绿（含新增用例）。
5. 手动验收（需真机 Electrobun，`bun run start`）：
   - link 右键打开链接 / 复制 URL / 重新抓取生效。
   - image 右键替换图片后缩图刷新；复制图片地址；在访达中显示定位到文件。
   - asset 右键在访达显示 / 替换文件 / 重命名（只改展示名，文件名不变）。
   - 多选 6 张卡片右键批量改色生效。
   - 底部 create menu 唤起 link 表单时自动预填剪贴板里的 URL。
   - 拖文件进窗口出现全屏「Drop to add」蒙层，松手成功创建。
   - create menu「导入 Markdown…」选多个 .md → 生成对应卡片，正文为导入内容。
6. 回填 `docs/product-detail-roadmap.md` Phase 6 状态 + 注明本方案的作用域决策（move-to-view、批量 tag 的取舍）。

## 8. 风险 / 注意事项

- **`handleContextMenuAction` 改 async**：内部新增 `await`，确保 `ContextMenu.tsx` 调用处不依赖同步返回（现状不依赖）。
- **`saveAssetFileWithProgressToast` 返回结构**：替换流程透传字段前务必读真实实现，避免塞 undefined 把卡片数据写脏。
- **clipboard 权限**：H1 readText 在非安全上下文/被拒时静默失败，已 try/catch。
- **批量改色 undo 粒度**：循环版每节点一次快照；若体验差再加 `changeNodesColor(ids)` 单步版。
- **importMarkdown 大文件**：`Bun.file().text()` 读全文，超大 md 可能占内存；md 通常小，暂不分块。
- **图片替换清远程字段**：替换为本地文件时记得清掉 `imageUrl` / `thumbnailUrl` 旧值，否则 ImageNode 渲染优先级可能用旧远程图。
