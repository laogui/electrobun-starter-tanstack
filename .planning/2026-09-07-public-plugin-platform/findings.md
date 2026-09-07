# Findings

- registerBuiltins.ts 静态导入并注册内置内容类型，没有外部包发现和安装闭环。
- types.ts 混合 React Surface、数据迁移与菜单行为；createFlow 为固定联合。
- Host API 的同步 getState、网络 unfurl 包装及空 remove 需要重新定义外部契约。
- 前端实例保存未使用 expectedRevision；回包直接覆盖内存；migrateState 未找到调用点。
- 后台调度未形成独立于 Surface 的完整分发链。
- 旧 RFC-2 为 Deferred，需明确新的用户目标取代原有延期前提。
- 本轮是设计文档工作；接口和 CLI 示例为拟议契约，不表示现有 SDK 或命令已发布。
- electrobun.config.ts 三个平台均 bundleCEF: false；方案将跨平台隔离能力列为 P0 实测门槛。
- 现有 development-plan.md 维护 D0–D3；新增方案采用独立 P0–P5，不覆盖原任务状态。
- v2 将通用命令/面板/导入器升级为首版；纯命令无 HTML/instanceId，操作范围令牌与 ContentRef 区分实体和放置位置。
- 对齐批次事务、插件级存储与任务、视图/插件事件清理、导入分批恢复及四类独立验收；本轮只改新方案和工作记录。
