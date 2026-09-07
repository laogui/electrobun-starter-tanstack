# 公开插件整改方案编写

## Goal

交付可实施的中文方案，包含 URL 下载、本地 ZIP 导入、独立开发、灵活扩展和低门槛 SDK。

## Phases

### Phase 1: 核对现状和范围
**Status:** complete

### Phase 2: 编写完整方案并衔接旧 RFC
**Status:** complete

### Phase 3: 检查一致性、示例和链接
**Status:** complete

## Decisions

### Phase 4: 改为通用插件模型并复核
**Status:** complete

- 按用户最新指示只修订新方案，不修改 PRD。
- 命令、面板、导入器、画布类型同为首版；补齐作用域、内容事务和无界面示例。

- 新建 In Progress 方案，保留旧 RFC 历史并添加取代说明。
- 包格式统一，URL 与本地导入共用安装事务。
- 普通 HTML/JS 无构建路径与可选框架工具链共存。
- 运行容器与隔离能力必须实验验证，不假称已支持。

## Errors

### Phase 5: PRD 产品范围同步
**Status:** complete

- 按用户新授权更新 PRD 定位、通用插件流程/验收、数据安全及交付线关系，保留现有实现状态。

- 上轮提供的 /Users/laogui/.codex/RTK.md 不存在；本轮检索未发现替代文件，按可用仓库指令工作。

## Next Step

PRD 已同步 v2 产品要求，交付用户；功能实施仍为待开始。
