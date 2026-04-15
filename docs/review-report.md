# 📋 智能审查报告

| 🟠 P1 建议修复 | 🟢 P2 可选优化 | ⚪ P3 仅供参考 | 💬 讨论 |
| :------------: | :------------: | :------------: | :-----: |
|       6        |       2        |       0        |    1    |

## 摘要

本次静态审查发现的问题主要集中在三类：持久化写入的并发安全、画布多视图状态切换的数据隔离，以及设置/RPC 初始化链路的失败恢复。前两类问题会直接导致数据覆盖、串视图污染或首次编辑丢失，建议优先处理。

此外，部分错误处理链路本身不够健壮：一旦 RPC 初始化或 Query 报错值不符合预期，界面会表现为“没有生效”或错误提示本身再次失败，增加排查成本。

---

## 🟠 P1 问题

> 建议修复

---

### 原子写入复用固定 `.tmp` 文件名，存在并发覆盖与 ENOENT 竞态

<sub>`EDGE` · `EDGE-Issue-001/4ibr54tcwcbh49r7s8c4`</sub>

📍 `src/bun/workspace.ts:L63-L69` · 🟠 待解决

`<ksymbol name="atomicWrite" filename="workspace.ts" path="src/bun/workspace.ts" startline="63" type="function">atomicWrite</ksymbol>`` 使用固定的 `${filePath}.tmp`作为临时文件名。只要同一路径在短时间内被并发写入，后一个写入会覆盖前一个临时文件，随后某个`rename` 调用会因为临时文件已不存在而失败，或者最终文件内容与调用方预期不一致。

**证据**:

```typescript
export async function atomicWrite(
  filePath: string,
  data: string
): Promise<void> {
  const tmp = `${filePath}.tmp`;
  await Bun.write(tmp, data);
  await rename(tmp, filePath);
}
```

这个工具函数又被 `<ksymbol name="saveNote" filename="notes.ts" path="src/bun/notes.ts" startline="153" type="function">saveNote</ksymbol>`、设置持久化和 workspace 配置保存共用，影响面不仅限于某一个入口。

**建议**: 为临时文件名引入随机后缀，或对同一路径的写操作做串行化。若后续存在多窗口/多进程同时写文件的场景，建议进一步补充锁或队列机制。

---

### 新建笔记按标题 slug 决定文件名，标题冲突时会直接覆盖旧笔记

<sub>`LOGIC` · `LOGIC-Issue-002/4ibr54tcwcbh49r7s8c4`</sub>

📍 `src/bun/notes.ts:L165-L189` · 🟠 待解决

`<ksymbol name="createNote" filename="notes.ts" path="src/bun/notes.ts" startline="165" type="function">createNote</ksymbol>` 直接把标题 slug 作为 markdown 文件名，没有做重名检查。两个不同 `noteId` 只要标题相同或 slug 后结果相同，就会落到同一个 `content/*.md` 文件，后写入的笔记会覆盖前一个。

**证据**:

```typescript
const slug = title
  ? title
      .toLowerCase()
      .replaceAll(/[^a-z\d]+/g, '-')
      .replaceAll(/^-|-$/g, '')
      .slice(0, 50) || noteId
  : noteId;
const fileName = `${slug}.md`;
const filePath = `content/${fileName}`;
await saveNote(wsPath, filePath, frontmatter, '');
```

这还会连带破坏 `<ksymbol name="buildNoteIndex" filename="notes.ts" path="src/bun/notes.ts" startline="116" type="function">buildNoteIndex</ksymbol>` 的 `noteId -> file` 映射，使某个 noteId 在重建索引后“消失”。

**建议**: 文件路径不要只依赖标题。更稳妥的做法是把 `noteId` 纳入文件名，或在碰撞时自动追加序号，确保持久化路径具备稳定唯一性。

---

### `saveManifest` 并行创建新笔记文件，和标题文件名策略叠加后会随机丢数据

<sub>`EDGE` · `EDGE-Issue-003/4ibr54tcwcbh49r7s8c4`</sub>

📍 `src/bun/index.ts:L322-L400` · 🟠 待解决

`<ksymbol name="main" filename="index.ts" path="src/bun/index.ts" startline="237" type="function">main</ksymbol>` 里的 `saveManifest` handler 用 `Promise.all` 并行处理所有节点。若同一次保存中包含多个“新建 card 且标题相同”的节点，它们会在同一个旧索引快照上同时判断“文件不存在”，随后并发创建同名 note 文件，最终结果取决于时序。

**证据**:

```typescript
const noteIndex = await buildNoteIndex(wsPath);

const manifestNodes = await Promise.all(
  nodes.map(async (node) => {
    const existingFile = noteIndex.get(noteId);
    ...
    if (existingFile) {
      filePath = existingFile;
      await writeNote(wsPath, filePath, frontmatter, body);
    } else {
      filePath = await createNote(
        wsPath,
        noteId,
        String(node.data.title || ''),
        String(frontmatter.displayHint)
      );
      await writeNote(wsPath, filePath, frontmatter, body);
      noteIndex.set(noteId, filePath);
    }
  })
);
```

因为 `noteIndex.set(...)` 发生在每个异步分支内部，它无法阻止其它已启动分支重复创建同一路径。

**建议**: “为新 note 分配唯一 filePath”这一步建议串行执行，或先统一预分配路径再并行写入。这个问题最好与上一个文件名冲突问题一起修。

---

### 视图切换时未清空旧画布状态，空白视图会被前一个视图内容污染

<sub>`LOGIC` · `LOGIC-Issue-004/4ibr54tcwcbh49r7s8c4`</sub>

📍 `src/mainview/store/canvasStore.ts:L237-L249` · `src/mainview/routes/index.tsx:L74-L91` · 🟠 待解决

`<ksymbol name="setActiveView" filename="canvasStore.ts" path="src/mainview/store/canvasStore.ts" startline="237" type="function">setActiveView</ksymbol>` 只切换了 `activeViewId` 和 `_hydrated`，但没有清空 `nodes/edges`。随后首页的加载 effect 在“新视图为空”的情况下，会把 store 中残留的旧视图节点作为 seed 保存到新视图，造成串视图污染。

**证据**:

```typescript
setActiveView: async (viewId) => {
  const current = get().activeViewId;
  if (viewId === current) return;

  set({
    activeViewId: viewId,
    focusedNode: null,
    focusedFolder: null,
    _undoRedo: createUndoRedoState(),
    _hydrated: false,
  });
},
```

```typescript
if (data && data.nodes.length > 0) {
  hydrate(data.nodes, data.edges);
} else if (await isRpcAvailable()) {
  const { nodes, edges } = useCanvasStore.getState();
  const sanitized = sanitizeForPersistence(nodes, edges);
  await rpcSaveManifest(activeViewId, sanitized.nodes, sanitized.edges);
}
```

如果用户从视图 A 切换到一个全新空白视图 B，上面的保存分支实际拿到的仍然是 A 的 `nodes/edges`。

**建议**: 切换视图时先清空画布数据，或者把“加载/seed 新视图”统一收敛到一个流程中，避免一个地方切换状态、另一个地方用残留 store 自动落盘。

---

### 首次无持久化数据时没有完成 hydrate，第一次真实编辑可能被持久化层跳过

<sub>`LOGIC` · `LOGIC-Issue-005/4ibr54tcwcbh49r7s8c4`</sub>

📍 `src/mainview/routes/index.tsx:L74-L91` · `src/mainview/hooks/useCanvasPersistence.ts:L65-L87` · 🟠 待解决

当前首屏在“没有已有持久化数据”的情况下只执行了 `rpcSaveManifest(...)`，并没有调用 `<ksymbol name="hydrate" filename="canvasStore.ts" path="src/mainview/store/canvasStore.ts" startline="143" type="function">hydrate</ksymbol>`。而 `<ksymbol name="useCanvasPersistence" filename="useCanvasPersistence.ts" path="src/mainview/hooks/useCanvasPersistence.ts" startline="28" type="function">useCanvasPersistence</ksymbol>` 默认会把第一次 `nodes/edges` 变化当作 hydration 变化跳过，导致首次真实用户编辑可能不被标记为 dirty。

**证据**:

```typescript
if (data && data.nodes.length > 0) {
  hydrate(data.nodes, data.edges);
} else if (await isRpcAvailable()) {
  const { nodes, edges } = useCanvasStore.getState();
  const sanitized = sanitizeForPersistence(nodes, edges);
  await rpcSaveManifest(activeViewId, sanitized.nodes, sanitized.edges);
}
```

```typescript
if (skipHydrate.current) {
  skipHydrate.current = false;
  return;
}

dirty.current = true;
```

这意味着第一次节点增删改若恰好发生在“真正 hydrate 之前”，会被误判成初始化变更并忽略。

**建议**: 在“首屏无数据但初始化已完成”的路径上也显式调用 `hydrate(...)`，或者把 `skipHydrate` 的判断从“第一次变化”改为“仅跳过明确由 hydrate 触发的变化”。

---

### RPC 初始化失败会被永久缓存，本次会话后续所有 RPC 都无法恢复

<sub>`EDGE` · `EDGE-Issue-006/4ibr54tcwcbh49r7s8c4`</sub>

📍 `src/mainview/lib/rpc.ts:L8-L57` · 🟠 待解决

`<ksymbol name="initElectrobun" filename="rpc.ts" path="src/mainview/lib/rpc.ts" startline="11" type="function">initElectrobun</ksymbol>` 一旦因为桥接未就绪或动态导入失败返回 `null`，其结果会被 `initPromise` 永久缓存。之后所有 RPC 调用都会继续拿到这个失败结果，不会重试，直到整个页面刷新。

**证据**:

```typescript
let initPromise: Promise<any> | null = null;

async function initElectrobun() {
  if ((globalThis as any).__electrobunWebviewId === undefined) {
    return null;
  }
  try {
    ...
    return new Electrobun.Electroview({ rpc });
  } catch (error) {
    return null;
  }
}

async function getElectrobun() {
  if (!initPromise) {
    initPromise = initElectrobun();
  }
  return await initPromise;
}
```

这会表现为：设置窗口打不开、持久化一直失败、`isRpcAvailable()` 始终是 false，但用户没有明显恢复路径。

**建议**: 只缓存成功初始化的实例；若本次初始化失败，应清空缓存允许后续重试，并区分“当前不是 Electrobun 环境”与“暂时初始化失败”两类状态。

---

## 🟢 P2 问题

> 可选优化

---

### 跨视图复制粘贴保留旧 `parentId/extent`，可能生成不可见或坐标异常的节点

<sub>`EDGE` · `EDGE-Issue-007/4ibr54tcwcbh49r7s8c4`</sub>

📍 `src/mainview/store/canvasStore.ts:L252-L278` · `src/mainview/hooks/useContextMenu.ts:L225-L234` · 🟢 待解决

当前复制逻辑是“整节点浅拷贝”，只清理了 `data.isHidden/isDropTarget`，没有清理 `parentId`、`extent` 以及与父节点坐标体系绑定的相对位置。代码注释还明确提到 clipboard 会跨视图保留，因此这个缺口在实际使用中很容易触发。

**证据**:

```typescript
return {
  clipboard: selected.map((n) => {
    const { isHidden, isDropTarget, ...cleanData } = n.data as any;
    return { ...n, data: cleanData };
  }),
};
```

```typescript
const newNodes = clipboard.map((n) => ({
  ...n,
  id: `paste-${nanoid(8)}`,
  position: { x: n.position.x + offset, y: n.position.y + offset },
  selected: true,
}));
```

如果被复制节点原本挂在 group 下，切到另一个不包含该 group 的视图再粘贴，渲染层会得到一个指向不存在父节点的子节点。

**建议**: 在 paste 时检查目标视图是否存在原 `parentId`；若不存在，去掉 `parentId/extent` 并把位置归一化为顶层绝对坐标。更进一步，也可以在 copy 时就生成“跨视图安全”的 clipboard 结构。

---

### Query 全局错误处理假定错误一定有 `message` 字段，可能让提示链路再次报错

<sub>`MAINT` · `MAINT-Issue-008/4ibr54tcwcbh49r7s8c4`</sub>

📍 `src/mainview/lib/queryClient.ts:L12-L22` · 🟢 待解决

当前 `<kfile name="queryClient.ts" path="src/mainview/lib/queryClient.ts">queryClient.ts</kfile>` 中的 `onError` 直接访问 `error.message`。如果某个 query 抛出的是字符串、普通对象，甚至 `null`，错误提示本身会变成 `Error: undefined`，更糟时会再次抛异常，掩盖真正问题。

**证据**:

```typescript
onError: (error, query) => {
  toast.error(`Error: ${error.message}`, {
    action: {
      label: m.action_retry(),
      onClick: () => {
        query.invalidate();
      },
    },
  });
};
```

**建议**: 先对 `error` 做一次标准化，区分 `Error`、字符串和未知对象，再拼接 toast 文案，避免在错误处理器中再次出错。

---

## ⚪ P3 问题

> 仅供参考

未发现 P3 问题。

---

## 💬 待讨论

> 一些观察和思考，供参考

### Q-001: 视图切换的加载职责是否需要收口到单一入口？

当前新视图加载逻辑同时分散在 `<kfile name="index.tsx" path="src/mainview/routes/index.tsx">index.tsx</kfile>` 的初始 `useEffect` 和 `<kfile name="ViewSwitcher.tsx" path="src/mainview/components/canvas/ViewSwitcher.tsx">ViewSwitcher.tsx</kfile>` 的 `handleSwitchView` 中。前者负责“未 hydrated 时自动加载/seed”，后者负责“切换后主动 load + hydrate”，两边都在直接操作同一份 store 状态。

**Agent 分析**: 这类双入口流程虽然短期可用，但很容易在后续继续叠加逻辑时产生竞态，例如重复 hydrate、错误 seed、切换前后 flush 时机不一致。目前已经出现了空白视图被旧数据污染和 hydrate 语义不一致的问题，说明职责边界已经开始变得模糊。

是否考虑把“切换视图 -> 加载数据 -> seed 空视图 -> 标记 hydrated -> 触发持久化订阅恢复”收敛为单个 action，由 store 或单独的控制器统一调度？

---

_📝 本报告由 Code Review Skill 生成_

---

## 附录：状态指示器

| 状态      | 指示器 | 展示方式                    |
| :-------- | :----: | --------------------------- |
| P1 待解决 |   🟠   | 完整描述和建议              |
| P2 待解决 |   🟢   | 完整描述和建议              |
| P3        |   ⚪   | 仅描述                      |
| 已解决    |   ✅   | 仅标题 + 引用块说明修复内容 |
| 已忽略    |   ⏭️   | 仅标题 + 引用块说明原因     |
| 已推迟    |   🕐   | 仅标题 + 引用块说明原因     |

## 附录：Issue 分类

| 分类   | 全称                    | 说明                           |
| ------ | ----------------------- | ------------------------------ |
| DESIGN | Design & Architecture   | 模块划分、抽象层次、扩展性     |
| LOGIC  | Business Logic          | 流程完整性、状态流转、业务规则 |
| COMPAT | Compatibility & Impact  | 向后兼容、跨模块影响、迁移风险 |
| EDGE   | Edge Cases & Robustness | 异常路径、并发竞态、降级策略   |
| SEC    | Security Boundary       | 权限模型、信任边界、数据隔离   |
| API    | Contract & Interface    | 协议设计、版本策略、调用链路   |
| MAINT  | Maintainability         | 可测试性、可观测性、认知复杂度 |

---

## 注意事项

- 严格遵循模板结构
- 所有内容必须使用中文（由 `reportLanguage: zh-cn` 指定）
- 使用保守的语气（如"建议"而非"必须"）
- P1 问题应包含证据和建议
- 待讨论问题应以开放式问题结尾，引发思考
- Issue ID 必须包含 sessionId 以确保唯一性（格式: `{CATEGORY}-Issue-{序号}/{sessionId}`）
