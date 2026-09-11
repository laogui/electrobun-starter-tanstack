# T2 第九批：统一原生 / 画布 / 插件笔记历史

日期：2026-09-11（Asia/Singapore；机器结果为 UTC）。

状态：**session 级统一历史已通过 macOS arm64 发行包验证；现行 T2 退出条件完成，下一阶段为 T3 导入器与分发。**

## 行为变化

- renderer 宿主维护最多 50 条的线性混合历史，entry 只包含 `canvas` 与 `plugin-note`。画布离散操作在成功压入 pre-mutation snapshot 时登记；有实际变化的插件笔记批次在宿主完成事务并向 renderer 发出 post-commit 通知后登记。请求开始、失败批次与 no-op 不进入时间线。
- 原生 Edit 菜单与画布级 Cmd/Ctrl+Z 经过同一 router。undo 取 `past` 顶部，redo 取 `future` 头部；新画布或插件 entry 清空放弃的 redo 分支。聚焦 BlockNote / 普通 editable、legacy widget 与 extension card 保留已有本地历史所有权，不会撤销无关的画布或插件事务。
- 插件 undo / redo 使用原 plugin、workspace、batch identity 和新的 retry-safe operation ID，继续走 revision 校验和原子 note transaction。异步期间不移动 cursor，并消费重复原生请求；成功只移动一次，通知与 HTTP response 的先后顺序不影响结果。
- revision conflict、引用中的 creation、传输错误或 abort 均不移动混合 cursor，并由原生 router 显示失败 toast。显式 `app.content.undo/redo(batchId)` 仍可按 batch 定位；若它跳到非混合时间线顶部，宿主清空混合 cursor，而不伪造剩余顺序。
- 混合 cursor 精确绑定 active `(workspaceId, viewId)`，只存在于 renderer session。切换 view / workspace、断开 runtime、full canvas reset 或重启会清空它，因为现有 canvas snapshot 不持久化。持久插件 batch 历史不受影响，仍可通过显式 SDK 跨这些边界使用。
- Bun→renderer 的 `hostHistory` 只用于宿主协调，向公开 `content.changed` listener 交付前移除；本批没有扩张公开事件 payload。

## 发行包验证

命令：`bun run test:plugin-t2-history`。驱动在隔离目录构建并解包 canary，设置独立 `GHOSTBOARD_DATA_DIR`，安装仓库外形态的 development-directory 插件，并分别运行归档 launcher 的 `initial` 与 `restart` 进程。这是打包应用内自动化验证，不冒充人工键鼠验收。

- `initial`：创建 canvas A、提交 plugin note batch B、再创建 canvas C；原生 router 按 C→B→A undo，再按 A→B→C redo。undo C 后新增 D 会放弃 C 的 redo 分支。
- 冲突场景：插件 batch 提交后由普通 BlockNote RPC 产生更新 revision，再执行原生 undo。发行包确认 canonical note 保持外部编辑、混合 cursor 不移动、pending 结束且 Sonner error toast 可见。revision 单调增加，因此这一类 stale batch 冲突本身不能通过“改回相同值”恢复成可重试前置状态。
- 视图场景：登记 plugin + canvas 后切到第二 view 并返回，混合时间线为空，原生 undo 不跨 view；显式 SDK undo 仍能按 batch 恢复笔记。
- `restart`：新进程的混合时间线为空，原生 undo 不声称拥有上个 session 的 durable batch；显式 SDK undo 仍成功。

机器结果：[trusted-plugin-t2-history-result.json](trusted-plugin-t2-history-result.json)。归档 SHA-256：`10be069a29f1b892a50726cb29a924197f21757757f35f5a8176748356cba220`。

平台：darwin arm64、Bun 1.3.13、WKWebView、`views://mainview/index.html`。未请求 Developer ID 签名 / notarization，未验证 Windows / Linux。

## 自动化覆盖

- Coordinator：entry identity、50 条上限、线性 past/future、分支废弃、notification/response 去重、pending/failure 原子性、显式 SDK 顶部同步与非顶部失效。
- Router：原生/键盘共同入口，编辑器与 focused widget/extension 所有权，插件失败 toast。
- Store / events / Bun：snapshot 登记与 view/reset 清理、私有 host-history metadata 校验与剥离、commit/recovery 通知身份、revision-checked plugin undo/redo。
- 定向回归：5 个测试文件、160 个测试通过。
- 完整串行回归：212 个测试文件、1940 个测试通过；`bun run type-check` 与 `bun run check` 通过。
- 发行包：`initial` 12 项与 `restart` 4 项检查全部通过。

## 保留边界与 T3 下一步

1. “统一”指 active canvas session 的原生画布层时间线，不包含 BlockNote 内部编辑步骤或 focused widget/extension record history；这些局部 owner 的优先级是有意保留的交互语义。
2. 混合 cursor 不持久化。要跨重启统一 canvas 与插件历史，需要新的 durable canvas transaction payload、迁移与恢复协议，不在现行 T2 范围。
3. 高信任插件绕过 SDK 的直接 DOM / 文件副作用无法由宿主事务自动撤销；文档继续要求插件对这类副作用提供自己的恢复路径。
4. T3 从导入器与可安装分发的最小边界开始：完整 `files` 流程、导入预览 / 取消 / 分段提交，以及独立 ZIP / HTTPS 包的最终用户安装；不把持久混合历史或编辑器内部扩展重新塞回 T3。
