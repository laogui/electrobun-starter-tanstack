#!/usr/bin/env python3
"""Render a rough wireframe PNG of a template manifest (for docs / review).

    python3 scripts/templates/render_wireframe.py <template-id> <out.png> [git-ref]

Not the real app rendering: boxes, text and embedded images only, so a
template's layout and content can be compared without running the app.
"""

from __future__ import annotations

import base64
import io
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
FONT = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
FONT_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
GROUP_TINT = {
    "blue": "#EFF6FF", "green": "#F0FDF4", "yellow": "#FEFCE8",
    "pink": "#FDF2F8", "orange": "#FFF7ED", "purple": "#FAF5FF",
}
GROUP_LINE = {
    "blue": "#93C5FD", "green": "#86EFAC", "yellow": "#FDE047",
    "pink": "#F9A8D4", "orange": "#FDBA74", "purple": "#D8B4FE",
}


def read(tid: str, name: str, ref: str | None):
    rel = f"src/bun/templates/{tid}/{name}"
    try:
        if ref:
            raw = subprocess.check_output(["git", "-C", str(ROOT), "show", f"{ref}:{rel}"], stderr=subprocess.DEVNULL)
        else:
            raw = (ROOT / rel).read_bytes()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None
    return json.loads(raw)


def font(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT, size)


import re

EMOJI = re.compile("[\U0001F000-\U0001FFFF\u2600-\u27BF\uFE0F\u200D]")


def wrap(draw, text, f, width):
    text = EMOJI.sub("", text).lstrip()
    lines = []
    for para in text.split("\n"):
        line = ""
        for ch in para:
            if draw.textlength(line + ch, font=f) > width:
                lines.append(line)
                line = ch
            else:
                line += ch
        lines.append(line)
    return lines


def clean_md(body: str) -> str:
    out = []
    for ln in body.split("\n"):
        s = ln.replace("**", "").replace("_", "")
        s = s.lstrip("#> ").replace("- [x] ", "■ ").replace("- [ ] ", "□ ")
        if s.startswith("- "):
            s = "• " + s[2:]
        out.append(s)
    return "\n".join(out)


def text_block(draw, box, text, size=13, color="#1F2937", title=None):
    x, y, w, h = box
    cy = y + 12
    if title:
        tf = font(size + 3, True)
        for ln in wrap(draw, title, tf, w - 24)[:2]:
            draw.text((x + 12, cy), ln, font=tf, fill=color)
            cy += size + 8
        cy += 4
    f = font(size)
    for ln in wrap(draw, text, f, w - 24):
        if cy + size > y + h - 8:
            break
        draw.text((x + 12, cy), ln, font=f, fill=color)
        cy += size + 6


def main():
    tid, out = sys.argv[1], sys.argv[2]
    ref = sys.argv[3] if len(sys.argv) > 3 else None
    m = read(tid, "manifest.canvas.json", ref)
    assets = read(tid, "assets.json", ref) or m.get("assets") or {}
    notes = m.get("noteContents", {})
    ext = m.get("extensionInstances", {})
    widgets = m.get("widgets", {})
    nodes = m["nodes"]

    absolute = {}
    for n in nodes:
        x, y = n["position"]["x"], n["position"]["y"]
        if n.get("parentId") in absolute:
            px, py, _, _ = absolute[n["parentId"]]
            x, y = x + px, y + py
        st = n.get("style", {})
        absolute[n["id"]] = (x, y, st.get("width", 240), st.get("height", 160))
    minx = min(v[0] for v in absolute.values()) - 40
    miny = min(v[1] for v in absolute.values()) - 40
    maxx = max(v[0] + v[2] for v in absolute.values()) + 40
    maxy = max(v[1] + v[3] for v in absolute.values()) + 40
    img = Image.new("RGB", (int(maxx - minx), int(maxy - miny)), "#F1F5F9")
    d = ImageDraw.Draw(img)

    def box(nid):
        x, y, w, h = absolute[nid]
        return (x - minx, y - miny, w, h)

    def draw_edges():
        for e in m.get("edges", []):
            if e["source"] not in absolute or e["target"] not in absolute:
                continue
            sx, sy, sw, sh = box(e["source"])
            tx, ty, tw, th = box(e["target"])
            a = (sx + sw / 2, sy + sh / 2)
            b = (tx + tw / 2, ty + th / 2)
            d.line((a, b), fill="#64748B", width=3)
            lbl = (e.get("data") or {}).get("label") or e.get("label")
            if lbl:
                mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
                f = font(13, True)
                tw_ = d.textlength(lbl, font=f)
                d.rounded_rectangle((mx - tw_ / 2 - 8, my - 12, mx + tw_ / 2 + 8, my + 12), 10, fill="#FFFFFF", outline="#64748B")
                d.text((mx - tw_ / 2, my - 10), lbl, font=f, fill="#334155")


    groups = [n for n in nodes if n["type"] == "group"]
    rest = [n for n in nodes if n["type"] != "group"]
    for n in groups + [None] + rest:
        if n is None:
            draw_edges()
            continue
        x, y, w, h = box(n["id"])
        data = n.get("data", {})
        t = n["type"]
        if t == "group":
            c = data.get("color", "blue")
            d.rounded_rectangle((x, y, x + w, y + h), 18, fill=GROUP_TINT.get(c, "#F8FAFC"), outline=GROUP_LINE.get(c, "#CBD5E1"), width=2)
            d.text((x + 16, y + 12), EMOJI.sub("", data.get("label", "")).strip(), font=font(16, True), fill="#334155")
        elif t == "sticky":
            d.rectangle((x, y, x + w, y + h), fill=data.get("color", "#FEF08A"))
            text_block(d, (x, y, w, h), data.get("content", ""), 14)
        elif t == "card":
            note = notes.get(data.get("noteId", ""), {})
            d.rounded_rectangle((x, y, x + w, y + h), 22, fill=data.get("color", "#FFFFFF"), outline="#E2E8F0")
            body = note.get("body", data.get("content", ""))
            title = note.get("title", data.get("title", "Untitled"))
            text_block(d, (x, y, w, h), clean_md(body) or "Empty note", 13, title=title)
        elif t == "folder":
            d.rounded_rectangle((x, y, x + w, y + h), 22, fill="#7C6AF2")
            kids = data.get("children", [])
            text_block(d, (x, y, w, h), f"{len(kids)} 张\n" + (data.get("subtitle") or ""), 14, color="#FFFFFF", title="" + data.get("title", ""))
        elif t == "topic":
            d.rounded_rectangle((x, y, x + w, y + h), 22, fill="#FFFFFF", outline=GROUP_LINE.get(data.get("color"), "#94A3B8"), width=3)
            d.text((x + 16, y + 10), data.get("title", ""), font=font(16, True), fill="#111827")
        elif t in ("extension", "widget", "image", "link"):
            seed = ext.get(data.get("instanceId", ""), {})
            kind = seed.get("canvasTypeId") or data.get("canvasTypeId") or data.get("kind") or t
            st = seed.get("state", {})
            d.rounded_rectangle((x, y, x + w, y + h), 22, fill="#FFFFFF", outline="#E2E8F0")
            src = st.get("imageFile") or st.get("imageUrl") or data.get("imageUrl")
            if isinstance(src, str) and src.startswith("tpl-asset:") and src[10:] in assets:
                pic = Image.open(io.BytesIO(base64.b64decode(assets[src[10:]]))).convert("RGB")
                ph = h if "image" in kind else int(h * 0.5)
                pic = pic.resize((int(w), int(ph))) if "image" in kind else pic.resize((int(w), ph))
                img.paste(pic, (int(x), int(y)))
                if "image" not in kind:
                    text_block(d, (x, y + ph, w, h - ph), st.get("description", ""), 12, title=st.get("title"))
                else:
                    d.rectangle((x, y + h - 30, x + w, y + h), fill="#111827")
                    d.text((x + 10, y + h - 26), st.get("title", ""), font=font(13), fill="#FFFFFF")
            elif "link" in kind:
                text_block(d, (x, y, w, h), f"{st.get('siteName', '')}\n{st.get('description', data.get('description', ''))}", 12, title="" + (st.get("title") or data.get("title", "")))
            elif "checklist" in kind:
                wd = widgets.get(data.get("widgetId", ""), {})
                items = (st.get("items") or wd.get("data", {}).get("items") or [])
                txt = "\n".join(("■ " if i.get("checked") else "□ ") + i.get("text", "") for i in items)
                text_block(d, (x, y, w, h), txt, 13, title="Checklist · " + (st.get("title") or wd.get("title", "")))
            else:
                text_block(d, (x, y, w, h), "", 13, title=f"[{kind}] " + (st.get("title") or data.get("title", "")))

    scale = min(1.0, 1600 / img.width)
    if scale < 1:
        img = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)
    img.save(out)


if __name__ == "__main__":
    main()
