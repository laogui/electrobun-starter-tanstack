**结论**

现在 PRD 里的定位是“一款面向思考者、设计师和研究人员的视觉化个人知识库”：[docs/PRD.md](/Users/laogui/Project/myProject/electrobun-starter-tanstack/docs/PRD.md:9)。这个方向没错，但太宽，容易直接撞上 Obsidian Canvas、Heptabase、Scrintal、Muse、Milanote 这些已有产品。要有市场竞争力，建议把定位收窄成：

> **面向深度个人研究者的 local-first 空间化 Markdown 知识工作台。**  
> 把散落的 Markdown、图片、待办和研究材料变成可缩放、可收纳、可复用的思考地图，所有数据都留在用户自己的本地文件夹里。

更短的产品口号可以是：

> **A local-first spatial workspace for serious thinking.**  
> **一个本地优先的空间化思考工作台。**

**为什么这样定位**

市场里“无限画布 + 知识库”已经不是稀缺概念。Obsidian Canvas 已经提供无限空间、笔记/媒体嵌入、本地 `.canvas` 文件和 JSON Canvas 开放格式；官方也明确说它用于 research、brainstorm、diagram 和 lay out ideas，并且 Canvas files 本地存储、可被插件和脚本增强（[Obsidian Canvas](https://obsidian.md/canvas), [Obsidian Help](https://obsidian.md/help/plugins/canvas)）。Heptabase 已经把“学生、研究者、终身学习者的智能视觉知识库”占住了，并且有白板、卡片、双链、PDF 标注、Readwise/Zotero、AI Tutor（[Heptabase](https://heptabase.com/)）。Scrintal 也在讲 learners/researchers、infinite canvas、PDF/notes/videos/images、双向链接和 AI Assistant（[Scrintal](https://scrintal.com/)）。Milanote 占的是创意项目、moodboard、storyboard、设计/摄影/营销等视觉项目管理（[Milanote](https://milanote.com/)）。Muse 占的是创意收集、手写、图片、PDF、视频、链接、文件都放到一个 canvas 上，强调低 UI 负担（[Muse](https://museapp.com/)）。

所以这个产品不能再用“视觉化个人知识库”这种大词打市场。它真正能打的点在 PRD 里已经有了：**文件即数据源**、**内容和布局解耦**、**noteId/nodeId 分离**、**同一笔记多画布复用**、**Group + Folder 两种空间组织方式**、**语义缩放**、**本地优先、无账号、数据不上传**：[docs/PRD.md](/Users/laogui/Project/myProject/electrobun-starter-tanstack/docs/PRD.md:20)、[docs/PRD.md](/Users/laogui/Project/myProject/electrobun-starter-tanstack/docs/PRD.md:59)、[docs/PRD.md](/Users/laogui/Project/myProject/electrobun-starter-tanstack/docs/PRD.md:100)、[docs/PRD.md](/Users/laogui/Project/myProject/electrobun-starter-tanstack/docs/PRD.md:212)、[docs/PRD.md](/Users/laogui/Project/myProject/electrobun-starter-tanstack/docs/PRD.md:486)。这些组合起来，才是差异化。

**建议的核心定位**

不要说：

> 面向思考者、设计师和研究人员的视觉化个人知识库。

改成：

> **为独立研究者、写作者、产品/策略人员打造的本地优先空间笔记工具。它不是另一个云端白板，也不是另一个 Notion，而是一个把本地 Markdown 知识库变成多张可缩放思考地图的桌面工作台。**

这句话里有几个关键选择：

1. **独立研究者 / 写作者 / 产品策略人员**  
   比“思考者”具体，比“设计师和研究人员”更贴近早期付费人群。他们有持续输入、长期资料、结构化输出、隐私和资料所有权诉求。

2. **本地优先**  
   这是和 Heptabase、Scrintal、Milanote、Muse 云端协作/订阅体验拉开的关键。你的 PRD 已经写了“所有用户数据仅存储在用户设备本地，不上传服务器、MVP 无账号”：[docs/PRD.md](/Users/laogui/Project/myProject/electrobun-starter-tanstack/docs/PRD.md:486)。这不是技术细节，是市场定位。

3. **空间笔记，而不是普通白板**  
   白板市场太卷，Miro、FigJam、tldraw、Excalidraw、Freeform 都在。你的产品应该强调“知识材料的空间化组织”，不是“大家一起画图”。

4. **Markdown 知识库，而不是封闭数据库**  
   每张 Card 对应 `.md` 文件、布局单独进 manifest、内容和布局解耦：[docs/PRD.md](/Users/laogui/Project/myProject/electrobun-starter-tanstack/docs/PRD.md:212)。这能吸引 Obsidian/Logseq/Typora/Markdown 用户，但你不能正面挑战 Obsidian 的插件生态，而要说“比 Obsidian Canvas 更专注于空间工作流”。

**竞争位点**

可以把市场分成四类：

| 类型 | 代表产品 | 它们强在哪里 | 你应该避开什么 | 你应该占什么 |
|---|---|---|---|---|
| Markdown PKM | Obsidian Canvas | 本地文件、插件生态、开放格式 | 不要拼生态和插件数量 | 更好的 canvas-first 体验、语义缩放、空间收纳、多画布复用 |
| 研究学习知识库 | Heptabase、Scrintal | 学习研究、AI、双链、PDF/引用集成 | 不要一开始拼 AI 和资料管理全家桶 | 本地优先、桌面原生、文件可控、低锁定 |
| 创意视觉板 | Milanote、Muse | 多媒体、moodboard、设计灵感、手写/创意流 | 不要定位成泛创意灵感板 | 结构化知识、Markdown、研究输出、可长期维护 |
| 协作白板 | Miro、FigJam、tldraw 类工具 | 团队协作、模板、图形工具、实时多人 | MVP 不要碰团队协作 | 单人深度思考和知识沉淀 |

最适合你的竞争位点是：

> **Obsidian Canvas 的本地文件理念 + Heptabase 的空间研究体验，但更轻、更桌面、更私有、更专注于个人思考流。**

**目标用户要收窄**

早期不要同时打“思考者、设计师、研究人员”。这三个群体的购买理由不同，功能期待也不同。

我建议第一阶段只抓这类人：

> **已经有大量 Markdown/本地资料，但觉得文件夹、线性文档和普通画布都无法表达复杂关系的个人知识工作者。**

具体画像：

- 写作者：写书、长文、课程、Newsletter，需要把素材、论点、案例、结构放在同一张地图上。
- 产品经理 / 独立开发者：做 PRD、竞品分析、路线图、需求拆解、用户反馈归纳。
- 研究型学生 / 独立研究者：读论文、读书、做主题研究，希望资料本地保存，不想被云端知识库锁住。
- 咨询 / 策略 / 投资分析人员：需要把公司、市场、证据、假设、结论摆在一个可推演空间里。

暂时不要主打：

- 纯设计师 moodboard。Milanote/Muse 更强。
- 团队白板协作。Miro/FigJam 更强。
- 全能第二大脑。Obsidian/Notion/Heptabase 更成熟。
- AI 学习导师。Heptabase 已经在 2026 年把这个讲得很明确。

**真正的差异化卖点**

建议把功能卖点重排成 4 个市场能听懂的价值，而不是罗列功能模块。

1. **本地文件，不被平台锁住**  
   用户的知识以 Markdown 和附件保存在自己的 workspace 中，画布只是组织层。这个点要放到官网首屏，而不是藏在技术文档里。

2. **一份笔记，多张思考地图**  
   PRD 的 `noteId ≠ nodeId` 和多画布视图很关键：[docs/PRD.md](/Users/laogui/Project/myProject/electrobun-starter-tanstack/docs/PRD.md:100)、[docs/PRD.md](/Users/laogui/Project/myProject/electrobun-starter-tanstack/docs/PRD.md:214)。同一张笔记可以出现在“研究总览”“文章结构”“竞品分析”“行动计划”多张画布里。这比单纯无限画布更有长期知识库价值。

3. **开放分组 + 堆叠收纳，解决大画布失控**  
   很多 canvas 产品的问题是越用越乱。你的 Group 和 Folder Stack 可以被包装成核心能力：  
   Group 负责“展开思考”，Folder 负责“收纳降噪”。PRD 里这两种组织方式已经写得很完整：[docs/PRD.md](/Users/laogui/Project/myProject/electrobun-starter-tanstack/docs/PRD.md:59)。这比“有文件夹”更有差异化。

4. **语义缩放，让画布从地图变成知识仪表盘**  
   PRD 里提到 zoom 不同层级显示色块、标题、摘要、完整内容：[docs/PRD.md](/Users/laogui/Project/myProject/electrobun-starter-tanstack/docs/PRD.md:20)。这个应该提升为主卖点。很多白板只是“把东西缩小”，你的方向可以是“缩小时看结构，放大时看内容”。

**一句话定位备选**

我会优先选第 1 个：

1. **Spatial Canvas 是一个本地优先的空间笔记工具，帮助研究者和写作者把 Markdown 知识库组织成可缩放、可复用的思考地图。**

2. **给 Obsidian 用户的视觉工作台：保留本地 Markdown，用无限画布组织复杂想法。**

3. **不是云端白板，而是你的本地知识地图。**

4. **把文件夹里的笔记，变成脑子里的结构。**

5. **一个为长期思考设计的本地空间知识库。**

**产品应该怎么取舍**

为了竞争力，MVP 到早期商业化阶段建议优先做这些：

1. **全局搜索和 Unplaced Notes 必须补齐**  
   搜索当前还是待实现：[docs/PRD.md](/Users/laogui/Project/myProject/electrobun-starter-tanstack/docs/PRD.md:531)。对知识库产品来说，搜索不是增强功能，是信任基础。用户必须相信“东西不会丢”。

2. **导入 Markdown / 文件夹是关键获客入口**  
   如果定位 local-first Markdown workspace，就必须能把已有 `.md` 文件拖进来、选一个文件夹作为 workspace、从 Obsidian/Typora 用户那里低摩擦迁移。

3. **语义缩放要尽快产品化**  
   这是视觉差异化，不只是动效 polish。它决定用户能不能在 200 张卡片时仍然理解结构。

4. **Folder Stack 要打磨成标志性交互**  
   “展开一组资料，处理完再收回去”很适合演示，也能解决画布混乱问题。这个比再加一种卡片类型更有市场价值。

5. **AI 暂时不要做通用聊天**  
   远期 AI 辅助可以做，但早期应围绕画布：从选中卡片生成结构、提取主题、推荐连接、把一堆卡片整理成 Group/Folder。否则会掉进“又一个 AI 笔记”的红海。

**商业化定位**

早期可以走：

> Free 本地基础版 + Pro 高级空间能力。

Free：

- 本地 workspace
- 基础卡片、连线、Group
- 单 workspace / 有限画布数量
- Markdown 文件保存

Pro：

- 无限 workspace / 多画布高级管理
- 语义缩放
- 高级搜索
- 导出 PNG/SVG/JSON
- Backlinks
- AI 结构化整理
- 高级主题 / 演示模式

但是要注意：如果你主打 local-first 和无账号，订阅会有心理阻力。可以考虑 **一次性买断 + 可选 Pro 更新订阅**，会更贴合隐私、本地、独立工具的用户预期。

**建议改 PRD 的产品概述**

可以把 [docs/PRD.md](/Users/laogui/Project/myProject/electrobun-starter-tanstack/docs/PRD.md:7) 里的概述改成这种方向：

```md
## 1. 产品概述

- **产品定位**：Spatial Canvas 是一款面向独立研究者、写作者和知识工作者的 local-first 空间笔记工具。它把本地 Markdown、图片、待办和研究材料组织成可缩放、可收纳、可复用的思考地图。
- **核心痛点**：传统文件夹和线性文档难以表达复杂知识关系；普通白板容易越用越乱；云端知识库又带来数据锁定和隐私顾虑。
- **核心价值**：
  1. 用户拥有自己的数据：内容保存在本地 Markdown 和附件目录中，画布只负责组织关系。
  2. 一份内容可出现在多张画布：同一笔记可以服务于不同项目、文章、研究主题和决策视角。
  3. 大画布不失控：通过语义缩放、开放式 Group 和堆叠式 Folder，在展开思考和收纳降噪之间快速切换。
  4. 空间连续的沉浸体验：通过平滑缩放、聚焦和 Folder 展开动画，让用户始终知道信息从哪里来、回到哪里去。
```

最重要的判断是：**不要把它做成“功能更多的 Obsidian Canvas”或“本地版 Heptabase”。要把它做成“本地文件知识库的最佳空间思考层”。** 这个定位足够窄，但有真实需求，也和你现在的架构选择高度一致。

下一步建议直接做两件事：

1. 我可以帮你把 [docs/PRD.md](/Users/laogui/Project/myProject/electrobun-starter-tanstack/docs/PRD.md:7) 的“产品概述、目标用户、竞品定位、商业化策略”补成正式 PRD 章节。  
2. 也可以先给你产出一版官网首屏文案和产品卖点结构，用来验证这个定位是否能对用户讲清楚。
