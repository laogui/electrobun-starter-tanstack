# Topic 实施方案编制

## Goal

依据当前桌面端扩展系统和官网开发文档，编写可执行的 Topic 实施方案；本轮仅修改规划文档，不实现功能、不发布网站。

## Phases

### Phase 1: 两仓库与现行契约核查
**Status:** complete

### Phase 2: 冻结交互、数据与 SDK 边界并编写方案
**Status:** complete

### Phase 3: 同步文档实施清单、检查链接和改动范围
**Status:** complete

## Next Step

方案编制已完成；后续功能实施从主方案 P0 开始，本轮不执行实现。

## Errors Encountered

- 首次聚合读取包含旧根目录 T4 规划和完整 package.json，输出被截断；后续按文件和段落限制读取，不再聚合大文件。
- 探索时猜测 canvas.ts/placements.ts 不存在；改以 rg 文件清单与实际 SDK 入口定位，公开 API 没有 canvas mutation service。

- AI/sanitize 初次路径猜测未命中；rg 定位到 lib/ai/buildAIContext.ts 与 shared/markdown/sanitize.ts，方案采用实际路径。
