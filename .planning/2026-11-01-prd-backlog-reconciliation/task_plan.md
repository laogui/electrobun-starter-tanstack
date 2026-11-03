# PRD 遗留项梳理
## Goal
对照当前代码清点 PRD 所有 OD、TODO、R 条目，合并重复项，区分实际缺陷、待验证、产品决策和可移出排期内容，更新 PRD。
## Phases
- 清点文档：complete
- 核对代码证据：complete
- 重组 PRD 与逐项处置：complete
- 检查文档覆盖与链接：complete
## Next Step
工作已完成；等待用户选择 §8.4 的产品范围，工程修复可独立按 §8.3 推进。
## Errors Encountered
- 宽输出截断：改按文件和函数缩小读取范围。
- 个别猜测路径/glob 不存在：以仓库路径与 rg 结果更正；不影响结论。
- 初次 diff 检查发现 EOF 多空行：已移除。

## Implementation follow-up (2026-11-01)
用户授权实施“真正值得继续做”的工程工作，先处理第一批数据完整性问题。
- 构建 legacy 保存、批量冲突、预取竞态和写队列失败回归：complete
- 实施保存保护与共享队列：complete
- 检查保存失败提示、补队列交错回归：complete
- 完整测试、type-check/check 与 PRD 状态回写：complete

## Next Step
第一批已交付；后续按 PRD 继续 A3 标签落盘、A4 异步操作与混合撤销。R-1 跨文件事务、撤销隔离和 R-36 专门恢复入口保持开放。

## Second implementation batch (2026-11-01)
- Reproduce legacy tag resurrection and async clipboard races: complete
- Fix explicit metadata deletion, migration marker, serialized flush and quit durability: complete
- Guard clipboard by canvas generation and move snapshot to commit: complete
- Reproduce and fix native mixed-history branching, startup binding and stale focus: complete
- Full verification and PRD status update: complete
- Remaining: orphan clone recovery, desktop acceptance, A5 recovery/attachments; R-1 cross-file atomicity and content-history separation remain open.

## Third implementation batch (2026-11-01)
- Reproduce attachment collision overwrite and silent pending-backup replacement: complete
- Unify durable streamed attachment publication and collision handling: complete
- Require recovery choice; archive evidence and compare source/base; reject stale choices: complete
- Verify affected suites, full tests, type-check/check/build; update PRD: complete
- Remaining: unified recovery management UI, backup diff/merge and host recovery authorization; C3 source path authorization and cross-process races remain separate.

## A5 completion (2026-11-01)
- Disk recovery must require explicit version-bound host approval: complete
- Recovery management in Workspace settings (disk/local evidence, preview, compare, export/delete): complete
- Recover as a separate canvas without writing shared content: complete
- Validate source changes, archive collisions, stale deletion and source preservation: complete
- Browser QA, full suite, type-check/check/build and PRD update: complete
- A5 minimum delivery complete. Automatic historical body merging/version history and transaction diagnostics remain separate R-1/R-36 work.

## B1 container and navigation follow-up
- Mark delivered/partial PRD work packages: complete
- Connected-node absorption regression: reproduced
- Shared atomic folder absorption and absolute coordinates: implementing
- Verify undo/multi-selection, renderer navigation and checks: pending

## B1 delivery
- Completed status annotations and B1 implementation/verification.
- Remaining A1/A2/A4 work stays explicitly partial. No commit or publication.
