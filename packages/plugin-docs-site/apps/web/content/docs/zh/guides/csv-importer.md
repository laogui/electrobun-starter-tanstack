---
title: "CSV 导入器"
description: "通过宿主拥有的选择、映射、预览、确认与重试流程，把用户选定的文件变成 Notes。"
section: guides
order: 40
---

导入器把文件解析成 Note 预览。GhostBoard 拥有它周围的一切：原生文件选择器、字段映射、不可变预览、确认、目标位置、重试、回滚以及文件句柄的清理。你的代码从不直接写工作区内容。

用 `bunx create-ghostboard-plugin my-importer --importer` 生成。

## 注册

```js
app.importers.register({
  id: 'notes-csv',
  title: 'Import Notes from CSV',
  accept: [{ description: 'CSV files', extensions: ['.csv'] }],

  async inspectFields(file, { signal }) {
    const text = await app.files.readText(file, { signal });
    const fields = parseHeader(text);
    const find = (name) => fields.find((f) => f.toLowerCase() === name) ?? null;
    return {
      fields,
      suggestedMapping: { title: find('title'), text: find('text'), color: find('color') },
    };
  },

  async parse(file, { mapping, signal }) {
    const text = await app.files.readText(file, { signal });
    return parseCsvToNotes(text, mapping); // { notes, warnings } 或 { segments, warnings }
  },
});
```

## 用户的流程

1. 用户在 Plugin Workbench 中选择 **Import Notes from CSV**。如果多个导入器接受同一扩展名，宿主会要求明确选择。
2. 宿主打开原生文件选择器，把一个不透明、只读、绑定到本插件 / 工作区 / 激活 / 进程的文件句柄交给导入器。你得到 `name`、`size`、`mimeType` 与 `lastModified`，永远没有路径。
3. 若实现了 `inspectFields`，宿主展示针对固定 Note 表面的映射 UI：必填 `title`，可选 `text` 与 `color`。一个源字段不能映射到两个目标；最多提供 100 个唯一字段。
4. `parse` 返回 Notes 与 warnings。宿主展示不可变预览：数量、标题、正文摘要、颜色与警告。此时尚未写入任何内容；在此取消零写入。
5. 确认后，宿主在一个原子的 1–100 条事务中以稳定 operation ID 创建 **detached** Notes（进入文库，不在画布上）。单批时用户还可选择把新 Notes 以网格或纵向放到已打开的画布；创建与放置是两个操作，放置失败时 Notes 已创建并可重试放置。
6. 结果以批次 ID 记录。用户可从插件批次历史撤销；停用或卸载导入器不影响这些 Notes。

## 超过 100 行

返回显式分段而不是单个列表：

```js
return {
  segments: chunk(notes, 100).map((notes) => ({ notes })),
  warnings,
};
```

允许 2–50 段，每段 1–100 条（总计 101–5,000 条）。宿主按序提交、显示已完成范围、按段 operation ID 去重重试，并在丢失响应后从失败段继续。回滚逆序处理已完成范围；用户此后编辑或引用过的范围整段保留，其他范围移除。分段导入始终保持 detached。

## 限制与规则

- `readText` 为严格 UTF-8，默认 1 MiB（`maxBytes` 最多 16 MiB）；二进制或大文件用 `readBytes` 或 `stream`。
- 返回的 `text` 是按段落切分的纯文本，不是 Markdown。
- 不要在 `inspectFields` / `parse` 中写工作区内容、保存句柄或启动后台工作。`signal` 中止时及时取消。
- 句柄在会话结束、插件重载或停用、工作区切换时释放。

## 测试

```js
const fake = createFakeHost({ pluginId: 'yourname.csv', workspaceId: 'w1' });
await plugin.setup(fake.app);
const file = fake.harness.files.addText('notes.csv', 'title,text\nOne,Body', { mimeType: 'text/csv' });
const fields = await fake.harness.behavior.inspectImporterFields('notes-csv', file);
const preview = await fake.harness.behavior.parseImporter('notes-csv', file, {
  mapping: fields.suggestedMapping,
});
```
