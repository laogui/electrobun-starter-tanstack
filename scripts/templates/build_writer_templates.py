#!/usr/bin/env python3
"""Generate the writer-facing built-in templates (docs/PRD-slim.md §2).

Source of truth for: feature-story, topic-pool, interview-notes,
reading-notes, novel-bible, brainstorm-mindmap (now "文章结构图").

    python3 scripts/templates/build_writer_templates.py

Writes src/bun/templates/<id>/{meta.json,manifest.canvas.json,assets.json}.
Images live in scripts/templates/images/ and are embedded as base64 JPEG
(referenced as `tpl-asset:<file>` from extension state). Thumbnails are not
generated here: open the template preview in a dev build and use
"Export thumbnail".
"""

from __future__ import annotations

import base64
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src" / "bun" / "templates"
IMAGES = Path(__file__).resolve().parent / "images"

IMAGE_TYPE = "ghostboard.media/image"
LINK_TYPE = "ghostboard.web/link"

# Palette (matches STICKY_COLORS / GROUP_COLORS in colorUtils.ts)
YELLOW, GREEN, PINK, BLUE, ORANGE, PURPLE = (
    "#FEF08A",
    "#BBF7D0",
    "#FBCFE8",
    "#BFDBFE",
    "#FED7AA",
    "#E9D5FF",
)
PAPER = "#FFFFFF"
CREAM = "#FFFBEB"
MIST = "#F8FAFC"


class Board:
    def __init__(self, tid: str) -> None:
        self.tid = tid
        self.nodes: list[dict] = []
        self.edges: list[dict] = []
        self.notes: dict[str, dict] = {}
        self.meta: dict[str, dict] = {}
        self.ext: dict[str, dict] = {}
        self.assets: dict[str, str] = {}

    # -- helpers ---------------------------------------------------------
    def _place(self, node: dict, parent: str | None) -> dict:
        if parent:
            node["parentId"] = parent
            node["extent"] = "parent"
        self.nodes.append(node)
        return node

    def group(self, nid, x, y, w, h, label, color):
        return self._place(
            {
                "id": nid,
                "type": "group",
                "position": {"x": x, "y": y},
                "style": {"width": w, "height": h},
                "data": {"label": label, "color": color},
            },
            None,
        )

    def card(self, nid, x, y, w, h, title, body, color=PAPER, tags=None, parent=None):
        key = f"tpl-{self.tid}-{nid}"
        self.notes[key] = {
            "title": title,
            "displayHint": "note",
            "color": color,
            "body": body.strip("\n"),
        }
        if tags:
            self.meta[key] = {"tags": [t for t, _ in tags], "tagColors": dict(tags)}
        return self._place(
            {
                "id": nid,
                "type": "card",
                "position": {"x": x, "y": y},
                "style": {"width": w, "height": h},
                "data": {
                    "color": color,
                    "editor": "blocknote",
                    "noteId": key,
                    "title": title,
                },
            },
            parent,
        )

    def sticky(self, nid, x, y, w, h, content, color=YELLOW, parent=None):
        return self._place(
            {
                "id": nid,
                "type": "sticky",
                "position": {"x": x, "y": y},
                "style": {"width": w, "height": h},
                "data": {"color": color, "content": content},
            },
            parent,
        )

    def _asset(self, filename: str) -> str:
        if filename not in self.assets:
            raw = (IMAGES / filename).read_bytes()
            self.assets[filename] = base64.b64encode(raw).decode()
        return f"tpl-asset:{filename}"

    def image(self, nid, x, y, w, h, title, filename, parent=None):
        inst = f"extinst_{self.tid}_{nid}".replace("-", "_")
        self.ext[inst] = {
            "canvasTypeId": IMAGE_TYPE,
            "dataVersion": 1,
            "presentation": {"title": title},
            "state": {"color": PAPER, "title": title, "imageFile": self._asset(filename)},
        }
        return self._place(
            {
                "id": nid,
                "type": "extension",
                "position": {"x": x, "y": y},
                "style": {"width": w, "height": h},
                "data": {"canvasTypeId": IMAGE_TYPE, "instanceId": inst},
            },
            parent,
        )

    def link(self, nid, x, y, w, h, url, title, site, desc, filename=None, parent=None):
        inst = f"extinst_{self.tid}_{nid}".replace("-", "_")
        state = {
            "color": PAPER,
            "title": title,
            "siteName": site,
            "unfurlStatus": "ready",
            "url": url,
            "description": desc,
        }
        if filename:
            state["imageUrl"] = self._asset(filename)
        self.ext[inst] = {
            "canvasTypeId": LINK_TYPE,
            "dataVersion": 1,
            "presentation": {"title": title, "subtitle": site, "plainText": f"{title} {site}"},
            "state": state,
        }
        return self._place(
            {
                "id": nid,
                "type": "extension",
                "position": {"x": x, "y": y},
                "style": {"width": w, "height": h},
                "data": {"canvasTypeId": LINK_TYPE, "instanceId": inst},
            },
            parent,
        )

    def folder(self, nid, x, y, title, subtitle, children, color="#F6F0E4", parent=None):
        kids = []
        for i, (kind, ctitle, content, ccolor) in enumerate(children):
            child = {
                "id": f"{nid}-c{i + 1}",
                "type": kind,
                "size": {"width": 280, "height": 180}
                if kind == "card"
                else {"width": 200, "height": 140},
                "data": {"color": ccolor, "content": content},
            }
            if ctitle:
                child["data"]["title"] = ctitle
            kids.append(child)
        return self._place(
            {
                "id": nid,
                "type": "folder",
                "position": {"x": x, "y": y},
                "style": {"width": 280, "height": 220},
                "data": {
                    "color": color,
                    "title": title,
                    "subtitle": subtitle,
                    "children": kids,
                },
            },
            parent,
        )

    def topic(self, nid, x, y, title, color, root=False):
        n = len(title)
        w = 76 + (20 if root else 16) * n
        return self._place(
            {
                "id": nid,
                "type": "topic",
                "position": {"x": x, "y": y},
                "style": {"width": w, "height": 44},
                "data": {"color": color, "title": title, "topicVersion": 1},
            },
            None,
        )

    def edge(self, src, tgt, label=None):
        e = {
            "id": f"e-{src}-{tgt}",
            "type": "labeledEdge",
            "source": src,
            "target": tgt,
            "markerEnd": "compact-arrow",
        }
        if label:
            e["data"] = {"label": label}
        self.edges.append(e)

    def tree(self, parent, child, order):
        self.edges.append(
            {
                "id": f"e-{parent}-{child}",
                "type": "labeledEdge",
                "source": parent,
                "target": child,
                "markerEnd": "compact-arrow",
                "data": {"kind": "topic-child", "order": order, "relationVersion": 1},
            }
        )

    # -- output ----------------------------------------------------------
    def write(self, meta: dict, viewport=None) -> None:
        d = OUT / self.tid
        d.mkdir(parents=True, exist_ok=True)
        manifest: dict = {}
        if viewport:
            manifest["viewport"] = viewport
        if self.meta:
            manifest["nodeMetadata"] = self.meta
        manifest["nodes"] = self.nodes
        manifest["edges"] = self.edges
        manifest["noteContents"] = self.notes
        if self.ext:
            manifest["extensionInstances"] = self.ext
        (d / "manifest.canvas.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
        )
        (d / "meta.json").write_text(
            json.dumps({"id": self.tid, "thumbnail": "", **meta}, ensure_ascii=False, indent=2)
            + "\n"
        )
        assets_path = d / "assets.json"
        if self.assets:
            assets_path.write_text(json.dumps(self.assets) + "\n")
        elif assets_path.exists():
            assets_path.unlink()


# ---------------------------------------------------------------------------
# 1. 深度稿素材板 — first-run showcase
# ---------------------------------------------------------------------------
def feature_story() -> None:
    b = Board("feature-story")

    b.card(
        "welcome", 40, 0, 400, 180, "从这里开始",
        """
这张画布是一篇深度稿从**选题到成稿**的样子：左边收集，右边落笔。

随便点、随便拖，弄乱了也没关系。看完就新建一张空白画布，写你自己的。
""",
        color=CREAM,
    )
    b.sticky("hint-focus", 480, 20, 260, 140, "✍️ 双击任意卡片进入聚焦编辑，写长文不被打扰。", PURPLE)
    b.sticky("hint-link", 1120, 20, 260, 140, "🔗 把鼠标移到卡片边缘，拖出连线，标明哪条资料支撑哪段话。", PURPLE)
    b.sticky("hint-export", 1620, 20, 260, 140, "📤 写完了？在画布空白处右键 →「导出画布为 Markdown」。", PURPLE)

    # ① 选题
    b.group("g-topic", 40, 220, 400, 660, "① 选题", "yellow")
    b.card(
        "pitch", 20, 52, 360, 340, "选题卡",
        """
## 县城咖啡馆为什么越开越多？

**一句话角度**：不是消费升级，是返乡青年给自己造了一个“像城市的角落”。

**写给谁**：在大城市工作、过年才回县城的 25–35 岁

**为什么是现在**：春节返乡季，社交平台上“县城咖啡”成了话题

**体量**：公众号长文，约 4000 字
""",
        tags=[("选题", "#F59E0B")],
        parent="g-topic",
    )
    b.sticky("titles", 20, 412, 170, 220, "备选标题\n\n· 县城的第一杯手冲\n· 返乡青年开的咖啡馆，能活多久？", PINK, parent="g-topic")
    b.sticky("twist", 210, 412, 170, 220, "⚡ 反直觉\n\n很多店不靠卖咖啡赚钱，靠卖“一个能拍照的地方”。", GREEN, parent="g-topic")

    # ② 资料
    b.group("g-source", 480, 220, 600, 660, "② 资料", "blue")
    b.image("photo-street", 20, 52, 560, 320, "现场 · 老街上的第三家店", "county-cafe.jpg", parent="g-source")
    b.link(
        "wiki", 20, 392, 270, 240,
        "https://zh.wikipedia.org/wiki/%E5%92%96%E5%95%A1",
        "咖啡", "维基百科",
        "背景资料：咖啡的历史、产地与饮用文化。写行业背景段时回来查。",
        parent="g-source",
    )
    b.folder(
        "facts", 310, 400, "事实卡", "每条都写清来源和日期",
        [
            ("card", "门店数量", "📊 近三年县域咖啡门店增速\n\n来源：待查（平台年报 / 行业报告）\n可信度：—", PAPER),
            ("card", "租金", "🏠 老街一层铺面月租\n\n来源：店主口述 + 中介报价\n可信度：需第二信源", PAPER),
            ("sticky", None, "⚠️ 没有来源的数字，不进正文。", YELLOW),
        ],
        parent="g-source",
    )

    # ③ 采访
    b.group("g-talk", 1120, 220, 460, 660, "③ 采访", "pink")
    b.image("photo-talk", 20, 52, 420, 220, "老周的店 · 第二次采访", "interview.jpg", parent="g-talk")
    b.sticky("quote-owner", 20, 292, 200, 160, "“开业头三个月，来的一半是拍照的。”\n—— 店主 老周（化名）", YELLOW, parent="g-talk")
    b.sticky("quote-guest", 240, 292, 200, 160, "“在上海天天喝，回来总得有个地方坐。”\n—— 顾客 小林", BLUE, parent="g-talk")
    b.card(
        "todo", 20, 472, 420, 168, "采访与核实",
        """
- [x] 店主：为什么回来、启动成本
- [x] 两位常客
- [ ] 核实租金数字（找第二个信源）
- [ ] 问当地市场监管部门要新开门店登记数
""",
        tags=[("核实", "#DB2777")],
        parent="g-talk",
    )

    # ④ 成稿
    b.card(
        "draft", 1620, 220, 480, 660, "县城的第一杯手冲",
        """
> 开头用现场：老街，晚上七点，店里坐满了人。

晚上七点，老街上大多数铺子已经拉下卷帘门，只有转角那家咖啡馆还亮着。玻璃窗里坐满了人，一半在聊天，一半举着手机找角度。

老周是三年前从杭州回来的。他说开业头三个月，来的人里有一半是来拍照的。

## 一、现象：一条街三家店

## 二、谁在开店：回来的人

## 三、谁在买单：拍照的人和坐下来的人

## 四、能活多久
""",
        tags=[("草稿", "#2563EB")],
    )

    b.edge("pitch", "photo-street", "去现场")
    b.edge("quote-owner", "draft", "引用")
    b.edge("facts", "draft", "论据")
    b.edge("twist", "draft", "核心角度")

    b.write(
        {
            "name": "深度稿素材板",
            "description": "一篇稿子从选题、资料、采访到成稿的完整样子：左边收集，右边落笔，最后导出 Markdown。",
            "category": "knowledge",
            "tags": ["writing", "feature", "research", "showcase"],
        },
        viewport={"x": 40, "y": 40, "zoom": 0.6},
    )


# ---------------------------------------------------------------------------
# 2. 选题库
# ---------------------------------------------------------------------------
def topic_pool() -> None:
    b = Board("topic-pool")
    b.card(
        "rules", 40, 40, 340, 380, "选题怎么挑",
        """
## 三个问题

1. **有没有新东西**：新事实、新人物，或新角度
2. **我能不能拿到**：采访对象、数据、现场
3. **读者为什么现在要看**

三个都答得上来，再往“正在做”里拖。

## 每周

- [ ] 周一清一遍灵感区
- [ ] 每个“正在做”写清下一步
""",
        color=CREAM,
        tags=[("方法", "#F59E0B")],
    )
    cols = [
        ("g-ideas", "💡 灵感", "yellow", [
            ("s-i1", "外卖骑手的冬天：电动车电池在零下掉得多快？", YELLOW),
            ("s-i2", "为什么年轻人开始去县城过周末", YELLOW),
            ("s-i3", "一家旧书店的最后一个月", ORANGE),
        ]),
        ("g-doing", "✍️ 正在做", "blue", [
            ("s-d1", "县城咖啡馆\n下一步：约第二位店主", BLUE),
            ("s-d2", "社区食堂的账本\n下一步：拿到三个月流水", BLUE),
        ]),
        ("g-done", "✅ 已发 / 放弃", "green", [
            ("s-o1", "已发：菜市场里的年轻摊主", GREEN),
            ("s-o2", "放弃：拿不到核心采访", PINK),
        ]),
    ]
    x = 420
    for gid, label, color, items in cols:
        b.group(gid, x, 40, 300, 560, label, color)
        for i, (sid, text, scolor) in enumerate(items):
            b.sticky(sid, 20, 52 + i * 166, 260, 150, text, scolor, parent=gid)
        x += 330
    b.image("inspo", 40, 460, 340, 220, "随手拍：路过时想到的题", "county-cafe.jpg")
    b.link(
        "index", 1410, 40, 300, 240,
        "https://index.baidu.com/",
        "百度指数", "百度",
        "看一个话题最近有没有人在搜，判断“为什么是现在”。",
    )
    b.edge("s-i2", "s-d1", "做成了")
    b.write(
        {
            "name": "选题库",
            "description": "灵感、正在做、已发三栏，配一套挑选题的标准。想法不再散落在备忘录里。",
            "category": "thinking",
            "tags": ["writing", "ideas", "pitch"],
        },
        viewport={"x": 40, "y": 40, "zoom": 0.7},
    )


# ---------------------------------------------------------------------------
# 3. 采访整理
# ---------------------------------------------------------------------------
def interview_notes() -> None:
    b = Board("interview-notes")
    b.image("photo", 40, 40, 420, 260, "采访现场", "interview.jpg")
    b.card(
        "profile", 40, 320, 420, 300, "受访者",
        """
## 老周（化名），41 岁

- 县城咖啡馆店主，2021 年从杭州回乡
- 采访：两次，共 2 小时 10 分钟
- 是否同意具名：**否**，用化名

**一句话印象**：说话慢，算账很快。
""",
        tags=[("受访者", "#7C3AED")],
    )
    b.group("g-quotes", 500, 40, 520, 400, "原话（可直接引用）", "yellow")
    quotes = [
        ("q1", "“开业头三个月，来的一半是拍照的。”\n—— 00:12:40", YELLOW),
        ("q2", "“房租不贵，贵的是没人懂你在做什么。”\n—— 00:31:05", PINK),
        ("q3", "“我不想回杭州了，这里能看见自己做的事。”\n—— 01:02:18", GREEN),
        ("q4", "“豆子从云南直接拿，比杭州还便宜。”\n—— 00:47:52", BLUE),
    ]
    for i, (qid, text, color) in enumerate(quotes):
        b.sticky(qid, 20 + (i % 2) * 250, 52 + (i // 2) * 170, 230, 150, text, color, parent="g-quotes")
    b.group("g-time", 500, 480, 760, 200, "时间线", "blue")
    events = [("t1", "2021 春\n辞职回乡"), ("t2", "2021 秋\n开出第一家店"), ("t3", "2023\n街上多了两家"), ("t4", "2025\n开始卖豆子")]
    for i, (tid, text) in enumerate(events):
        b.sticky(tid, 20 + i * 185, 52, 165, 128, text, MIST, parent="g-time")
    for a, c in zip(["t1", "t2", "t3"], ["t2", "t3", "t4"]):
        b.edge(a, c)
    b.card(
        "verify", 1060, 40, 360, 400, "待核实",
        """
- [ ] 开店成本 30 万，找第二个信源
- [ ] “街上三家店”实地数一遍
- [ ] 云南豆子进价，问供货商
- [x] 回乡时间与社保记录一致

**原则**：只有一个信源的数字，写成“他说”。
""",
        color=CREAM,
        tags=[("核实", "#DB2777")],
    )
    b.folder(
        "transcript", 40, 660, "文字稿", "按段落拆开，方便拖出来引用",
        [
            ("card", "第一段 · 为什么回来", "00:00–00:18\n\n辞职的原因、家里的情况……", PAPER),
            ("card", "第二段 · 开店", "00:18–00:52\n\n选址、装修、第一个月……", PAPER),
            ("card", "第三段 · 现在", "00:52–01:10\n\n生意、竞争、以后的打算……", PAPER),
        ],
    )
    b.edge("q1", "verify", "需核实")
    b.write(
        {
            "name": "采访整理",
            "description": "受访者、可引用的原话、时间线、待核实清单和拆段文字稿。写稿时随手拖出来用。",
            "category": "knowledge",
            "tags": ["writing", "interview", "journalism"],
        },
        viewport={"x": 40, "y": 40, "zoom": 0.7},
    )


# ---------------------------------------------------------------------------
# 4. 拆书笔记 (reading-notes, rewritten)
# ---------------------------------------------------------------------------
def reading_notes() -> None:
    b = Board("reading-notes")
    b.image("cover", 40, 40, 320, 400, "这本书", "book-desk.jpg")
    b.card(
        "core", 400, 40, 460, 400, "这本书在说什么",
        """
## 一句话

_用自己的话写，不抄简介。_

## 三个论点

1. **论点一**：
2. **论点二**：
3. **论点三**：

## 我同意吗

同意第一点，第三点证据不够。
""",
        color=CREAM,
        tags=[("要点", "#F59E0B")],
    )
    b.group("g-quotes", 900, 40, 520, 400, "划线", "pink")
    for i, (qid, text, color) in enumerate(
        [
            ("q1", "“打动我的一句话。”\n—— p.42", PINK),
            ("q2", "“一段能直接引用的论述。”\n—— p.103", YELLOW),
            ("q3", "“我不同意的一句话：为什么？”\n—— p.158", ORANGE),
            ("q4", "“可以做标题的一句。”\n—— p.211", PURPLE),
        ]
    ):
        b.sticky(qid, 20 + (i % 2) * 250, 52 + (i // 2) * 170, 230, 150, text, color, parent="g-quotes")
    b.folder(
        "chapters", 40, 480, "章节笔记", "一章一张卡",
        [
            ("card", "第一章", "核心论点：……\n关键例子：……", PAPER),
            ("card", "第二章", "作者定义了三个概念：……", PAPER),
            ("card", "第三章", "三个案例，最有说服力的是……", PAPER),
        ],
    )
    b.card(
        "review", 400, 480, 460, 360, "书评草稿",
        """
## 标题先空着

**开头**：用划线里那句我不同意的话开场。

**中段**：三个论点逐个说，第三个拿自己的经历反驳。

**结尾**：这本书适合谁，不适合谁。

- [ ] 补一个同主题的对照书
- [ ] 查作者的其他访谈
""",
        tags=[("草稿", "#2563EB")],
    )
    b.link(
        "douban", 900, 480, 320, 240,
        "https://book.douban.com/",
        "豆瓣读书", "豆瓣",
        "看看别人怎么评，找出和你不一样的观点。",
    )
    b.edge("q3", "review", "开头")
    b.edge("core", "review")
    b.write(
        {
            "name": "拆书笔记",
            "description": "论点、划线、章节和一篇书评草稿放在一起，读完就能写。",
            "category": "knowledge",
            "tags": ["reading", "book", "review", "writing"],
        },
        viewport={"x": 40, "y": 40, "zoom": 0.7},
    )


# ---------------------------------------------------------------------------
# 5. 小说设定板
# ---------------------------------------------------------------------------
def novel_bible() -> None:
    b = Board("novel-bible")
    b.image("mood", 40, 40, 480, 300, "气氛：雾里的河镇", "river-town.jpg")
    b.card(
        "premise", 40, 380, 480, 300, "故事核",
        """
## 一句话

一个回乡奔丧的女人，发现镇上每个人都记得一场她不记得的大火。

**基调**：慢、潮湿、克制

**篇幅**：中篇，约 6 万字
""",
        color=CREAM,
        tags=[("设定", "#7C3AED")],
    )
    b.group("g-people", 560, 40, 560, 420, "人物", "pink")
    people = [
        ("p-lin", "林晚，34 岁\n想要：弄清母亲的死\n害怕：自己也忘了什么", PINK),
        ("p-mother", "母亲（已故）\n镇上唯一的裁缝\n留下一只上锁的木箱", YELLOW),
        ("p-chen", "陈伯，70 岁\n摆渡人\n知道真相，但不说", BLUE),
        ("p-xu", "许安，36 岁\n林晚的旧同学\n现在是镇长", GREEN),
    ]
    for i, (pid, text, color) in enumerate(people):
        b.sticky(pid, 20 + (i % 2) * 270, 52 + (i // 2) * 180, 250, 160, text, color, parent="g-people")
    b.edge("p-chen", "p-mother", "欠她一个人情")
    b.edge("p-xu", "p-lin", "旧情")
    b.group("g-time", 560, 500, 760, 200, "时间线", "blue")
    for i, (tid, text) in enumerate(
        [("t1", "1998\n大火"), ("t2", "2010\n林晚离镇"), ("t3", "2024 冬\n母亲去世"), ("t4", "第 7 天\n木箱打开")]
    ):
        b.sticky(tid, 20 + i * 185, 52, 165, 128, text, MIST, parent="g-time")
    for a, c in zip(["t1", "t2", "t3"], ["t2", "t3", "t4"]):
        b.edge(a, c)
    b.card(
        "foreshadow", 1160, 40, 340, 420, "伏笔",
        """
- [x] 第 1 章：渡船上陈伯不收她的钱
- [ ] 第 3 章：木箱钥匙在裁缝剪刀柄里
- [ ] 第 5 章：许安办公室墙上的旧照片
- [ ] 第 9 章：回收所有伏笔

**规则**：埋下的每一条，都要在正文里写回来。
""",
        tags=[("伏笔", "#DB2777")],
    )
    b.folder(
        "places", 40, 720, "地点", "每个地点一张卡",
        [
            ("card", "渡口", "雾大时听不见对岸。陈伯的船灯是绿色的。", PAPER),
            ("card", "裁缝铺", "门槛被踩出一道凹痕。母亲的缝纫机还在。", PAPER),
            ("card", "旧粮站", "大火的地方，现在是停车场。", PAPER),
        ],
    )
    b.write(
        {
            "name": "小说设定板",
            "description": "故事核、人物关系、时间线、伏笔和地点放在一张图上，写到第十章也不乱。",
            "category": "thinking",
            "tags": ["fiction", "novel", "worldbuilding", "writing"],
        },
        viewport={"x": 40, "y": 40, "zoom": 0.65},
    )


# ---------------------------------------------------------------------------
# 6. 文章结构图 (brainstorm-mindmap, rewritten with topic nodes)
# ---------------------------------------------------------------------------
def article_outline() -> None:
    b = Board("brainstorm-mindmap")
    b.topic("root", 40, 300, "县城咖啡馆", "orange", root=True)
    branches = [
        ("b1", "现象：一条街三家店", "blue", ["数据：门店增速", "现场：晚上七点"]),
        ("b2", "谁在开店", "green", ["返乡青年", "启动成本"]),
        ("b3", "谁在买单", "yellow", ["拍照的人", "坐下来的人"]),
        ("b4", "能活多久", "pink", ["房租与客流", "老周的打算"]),
    ]
    y = 60
    for i, (bid, title, color, leaves) in enumerate(branches):
        b.topic(bid, 320, y + 40, title, color)
        b.tree("root", bid, i)
        for j, leaf in enumerate(leaves):
            lid = f"{bid}-{j + 1}"
            b.topic(lid, 640, y + j * 64 + 8, leaf, color)
            b.tree(bid, lid, j)
        y += 150
    b.card(
        "note", 920, 40, 380, 420, "怎么用这张图",
        """
## 先搭骨架，再填肉

1. 中间写主题，右边每一支是一节
2. 每一节下面挂上要用的论据
3. 顺序不对就拖，结构对了再写

编辑主题时按 **Tab** 加下一级，按 **Enter** 加同级。

- [ ] 每一节至少一个事实、一句原话
""",
        color=CREAM,
        tags=[("方法", "#F59E0B")],
    )
    b.sticky("gap", 920, 500, 260, 150, "🕳️ 缺口：第四节还没有数据支撑", ORANGE)
    b.write(
        {
            "name": "文章结构图",
            "description": "主题在中间，每一支是一节，下面挂论据。动笔前先把骨架理顺。",
            "category": "thinking",
            "tags": ["outline", "structure", "mindmap", "writing"],
        },
        viewport={"x": 40, "y": 40, "zoom": 0.8},
    )


if __name__ == "__main__":
    feature_story()
    topic_pool()
    interview_notes()
    reading_notes()
    novel_bible()
    article_outline()
    print("ok")
