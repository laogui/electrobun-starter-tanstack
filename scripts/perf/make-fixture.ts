/**
 * Generate performance-test workspaces (docs/remediation-plan.md, phase 0).
 *
 *   bun scripts/perf/make-fixture.ts                  # 200 and 500 nodes
 *   bun scripts/perf/make-fixture.ts --nodes 1000     # one size
 *   bun scripts/perf/make-fixture.ts --out ~/gb-perf  # output root
 *
 * Writes `<out>/ws-<n>/`, a complete workspace. Open it from Settings →
 * switch workspace, restart, and measure (docs/quality/perf-baseline.md).
 * Existing fixture folders are refused rather than overwritten.
 *
 * The content is deterministic (seeded), so runs on different days measure
 * the same canvas. It goes through `populateViewFromTemplate`, the same path
 * templates use, so notes, extension instances, assets and tags are written
 * exactly as the app writes them.
 *
 * Mix per canvas (rounded): 50% notes (short / medium / long bodies), 12%
 * stickies, 8% images, 8% links, plus groups and folders with four members
 * each, and roughly 0.6 edges per note. Every member of a group or folder
 * counts toward `--nodes`.
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { plugin } from 'bun';

// `workspace.ts` imports `electrobun/bun`, which boots an app server on
// import. The calls used here never touch it, so stub it out.
plugin({
  name: 'stub-electrobun',
  setup(build) {
    build.module('electrobun/bun', () => ({
      loader: 'object',
      exports: {
        ApplicationMenu: {},
        BrowserView: class {},
        BrowserWindow: class {},
        default: {},
        Updater: {},
        Utils: { paths: { home: homedir() } },
      },
    }));
  },
});

type Json = Record<string, unknown>;

interface FixtureNode {
  data: Json;
  extent?: string;
  id: string;
  parentId?: string;
  position: { x: number; y: number };
  style?: Json;
  type: string;
}

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const HOME_PREFIX = /^~(?=$|\/)/;

function parseArgs(argv: string[]): { out: string; sizes: number[] } {
  let out = join(homedir(), 'GhostBoard-perf');
  const sizes: number[] = [];
  const rest = [...argv];
  while (rest.length > 0) {
    const arg = rest.shift();
    if (arg === '--out') {
      out = rest.shift() ?? out;
    } else if (arg === '--nodes') {
      const n = Number(rest.shift());
      if (!Number.isInteger(n) || n < 20) {
        throw new Error('--nodes needs an integer of at least 20');
      }
      sizes.push(n);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return {
    out: resolve(out.replace(HOME_PREFIX, homedir())),
    sizes: sizes.length > 0 ? sizes : [200, 500],
  };
}

// ---------------------------------------------------------------------------
// Deterministic content
// ---------------------------------------------------------------------------

/** Park–Miller LCG: tiny, deterministic, good enough for layout noise. */
function rng(seed: number): () => number {
  let state = (seed % 2_147_483_646) + 1;
  return () => {
    state = (state * 16_807) % 2_147_483_647;
    return (state - 1) / 2_147_483_646;
  };
}

const SENTENCES = [
  '老街上的第三家咖啡馆开业不到半年，店主说周末的客流比工作日多一倍。',
  '这个数字需要再核实，暂时只有店主的口述，没有找到公开资料。',
  '受访者提到，县城年轻人回流后，最先改变的是晚上的消费习惯。',
  '可以把这一段放在开头，用一个具体的人引出整篇稿子的问题。',
  '对比两份统计口径不同，一份按常住人口，一份按户籍人口。',
  '采访时她停顿了很久，说“我们不是来创业的，是回来生活的”。',
  '结构上可以先写现象，再写原因，最后回到人物的选择。',
  '这条线索还缺第二个信源，下周去区里的市场监管所问一下。',
  '书里有一段写小镇的公共空间消失，正好可以拿来对照。',
  '要避免写成成功学，重点是普通人的成本和取舍。',
  '编辑建议把数据部分压缩到三百字以内，放在第二节。',
  '这里的引语要和录音再对一遍，确认原话。',
];

const TITLES = [
  '选题缘起',
  '老周（化名）采访要点',
  '开店成本拆解',
  '数据待查',
  '结构草稿',
  '可用引语',
  '背景资料',
  '对照阅读',
  '第二信源',
  '开头的三种写法',
  '编辑意见',
  '事实核查清单',
];

const STICKY_COLORS = ['#FEF08A', '#FED7AA', '#BFDBFE', '#BBF7D0', '#FBCFE8'];
const NOTE_COLORS = ['#FFFFFF', '#FFFBEB', '#F0F9FF', '#F0FDF4'];
const TAGS = ['采访', '数据', '背景', '引语', '结构', '待查', '已核实'];
const GROUP_COLORS = ['yellow', 'blue', 'green', 'pink', 'purple'];

function pick<T>(r: () => number, list: readonly T[]): T {
  return list[Math.floor(r() * list.length)] as T;
}

function paragraph(r: () => number, sentences: number): string {
  return Array.from({ length: sentences }, () => pick(r, SENTENCES)).join('');
}

/** Short, medium and long note bodies, so previews of every size render. */
function noteBody(r: () => number, i: number): string {
  const kind = i % 10;
  if (kind < 5) {
    return paragraph(r, 2);
  }
  if (kind < 8) {
    return [
      paragraph(r, 2),
      '## 要点',
      ...Array.from({ length: 4 }, () => `- ${pick(r, SENTENCES)}`),
      '[] 再核实一次数字',
    ].join('\n\n');
  }
  return [
    paragraph(r, 3),
    '## 一、现象',
    paragraph(r, 6),
    '## 二、原因',
    paragraph(r, 6),
    `> ${pick(r, SENTENCES)}`,
    '## 三、人物',
    paragraph(r, 6),
    ...Array.from({ length: 5 }, (_, n) => `${n + 1}. ${pick(r, SENTENCES)}`),
  ].join('\n\n');
}

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

const CELL_W = 420;
const CELL_H = 460;

async function buildManifest(total: number) {
  const r = rng(total);
  const featureAssets = (await import(
    '../../src/bun/templates/feature-story/assets.json'
  )) as { default: Record<string, string> };
  const assetNames = Object.keys(featureAssets.default);

  const nodes: FixtureNode[] = [];
  const noteContents: Record<string, Json> = {};
  const nodeMetadata: Record<string, Json> = {};
  const extensionInstances: Record<string, Json> = {};
  const noteNodeIds: string[] = [];

  const groups = Math.max(1, Math.round(total * 0.03));
  const folders = Math.max(1, Math.round(total * 0.03));
  const members = 4;
  const images = Math.round(total * 0.08);
  const links = Math.round(total * 0.08);
  const stickies = Math.round(total * 0.12);
  const notes = Math.max(
    1,
    total - (groups + folders) * (members + 1) - images - links - stickies
  );

  const columns = Math.ceil(Math.sqrt(total * 0.9));
  let cell = 0;
  const nextPosition = () => {
    const col = cell % columns;
    const row = Math.floor(cell / columns);
    cell += 1;
    return {
      x: col * CELL_W + Math.round(r() * 40),
      y: row * CELL_H + Math.round(r() * 40),
    };
  };

  for (let i = 0; i < notes; i += 1) {
    const id = `note-${i}`;
    const noteId = `tpl-perf-note-${i}`;
    const long = i % 10 >= 8;
    noteContents[noteId] = {
      title: `${pick(r, TITLES)} ${i + 1}`,
      displayHint: 'note',
      color: pick(r, NOTE_COLORS),
      body: noteBody(r, i),
    };
    if (i % 3 === 0) {
      nodeMetadata[noteId] = {
        tags: [pick(r, TAGS), pick(r, TAGS)].filter(
          (tag, n, all) => all.indexOf(tag) === n
        ),
      };
    }
    nodes.push({
      id,
      type: 'card',
      position: nextPosition(),
      style: { width: 340, height: long ? 420 : 260 },
      data: { editor: 'blocknote', noteId },
    });
    noteNodeIds.push(id);
  }

  for (let i = 0; i < stickies; i += 1) {
    nodes.push({
      id: `sticky-${i}`,
      type: 'sticky',
      position: nextPosition(),
      style: { width: 220, height: 150 },
      data: { color: pick(r, STICKY_COLORS), content: pick(r, SENTENCES) },
    });
  }

  for (let i = 0; i < images; i += 1) {
    const instanceId = `extinst_perf_image_${i}`;
    extensionInstances[instanceId] = {
      canvasTypeId: 'ghostboard.media/image',
      dataVersion: 1,
      presentation: { title: `现场照片 ${i + 1}` },
      state: {
        color: '#FFFFFF',
        title: `现场照片 ${i + 1}`,
        imageFile: `tpl-asset:${assetNames[i % assetNames.length]}`,
      },
    };
    nodes.push({
      id: `image-${i}`,
      type: 'extension',
      position: nextPosition(),
      style: { width: 320, height: 240 },
      data: { canvasTypeId: 'ghostboard.media/image', instanceId },
    });
  }

  for (let i = 0; i < links; i += 1) {
    const instanceId = `extinst_perf_link_${i}`;
    extensionInstances[instanceId] = {
      canvasTypeId: 'ghostboard.web/link',
      dataVersion: 1,
      presentation: { title: `参考链接 ${i + 1}` },
      // `ready` keeps the fixture offline: no unfurl request on load.
      state: {
        color: '#FFFFFF',
        title: `参考链接 ${i + 1}`,
        siteName: '维基百科',
        unfurlStatus: 'ready',
        url: 'https://zh.wikipedia.org/wiki/%E5%92%96%E5%95%A1',
        description: pick(r, SENTENCES),
      },
    };
    nodes.push({
      id: `link-${i}`,
      type: 'extension',
      position: nextPosition(),
      style: { width: 320, height: 200 },
      data: { canvasTypeId: 'ghostboard.web/link', instanceId },
    });
  }

  for (let g = 0; g < groups; g += 1) {
    const groupId = `group-${g}`;
    const origin = nextPosition();
    cell += 1; // a group spans two cells
    nodes.push({
      id: groupId,
      type: 'group',
      position: origin,
      style: { width: CELL_W * 2 - 40, height: CELL_H - 40 },
      data: { color: pick(r, GROUP_COLORS), label: `分组 ${g + 1}` },
    });
    for (let m = 0; m < members; m += 1) {
      nodes.push({
        id: `${groupId}-m${m}`,
        type: 'sticky',
        parentId: groupId,
        extent: 'parent',
        position: { x: 24 + (m % 2) * 380, y: 48 + Math.floor(m / 2) * 190 },
        style: { width: 220, height: 150 },
        data: { color: pick(r, STICKY_COLORS), content: pick(r, SENTENCES) },
      });
    }
  }

  for (let f = 0; f < folders; f += 1) {
    nodes.push({
      id: `folder-${f}`,
      type: 'folder',
      position: nextPosition(),
      style: { width: 280, height: 200 },
      data: {
        color: '#F6F0E4',
        title: `资料夹 ${f + 1}`,
        subtitle: '折叠的素材',
        children: Array.from({ length: members }, (_, m) =>
          m % 2 === 0
            ? {
                id: `folder-${f}-c${m}`,
                type: 'card',
                size: { width: 280, height: 180 },
                data: {
                  color: '#FFFFFF',
                  title: pick(r, TITLES),
                  content: paragraph(r, 2),
                },
              }
            : {
                id: `folder-${f}-c${m}`,
                type: 'sticky',
                size: { width: 200, height: 140 },
                data: {
                  color: pick(r, STICKY_COLORS),
                  content: pick(r, SENTENCES),
                },
              }
        ),
      },
    });
  }

  const edges: Json[] = [];
  const edgeCount = Math.round(noteNodeIds.length * 0.6);
  const seen = new Set<string>();
  for (let e = 0; edges.length < edgeCount && e < edgeCount * 4; e += 1) {
    const source = pick(r, noteNodeIds);
    const target = pick(r, noteNodeIds);
    const key = `${source}->${target}`;
    if (source === target || seen.has(key)) {
      continue;
    }
    seen.add(key);
    edges.push({
      id: `e-${edges.length}`,
      type: 'labeledEdge',
      source,
      target,
      markerEnd: 'compact-arrow',
      data: edges.length % 4 === 0 ? { label: '支撑' } : {},
    });
  }

  const counted = nodes.length + folders * members; // folder children are canvas items too
  return {
    counted,
    edges: edges.length,
    manifest: {
      meta: {
        id: `perf-${total}`,
        name: `性能样本 ${total}`,
        description: 'Generated by scripts/perf/make-fixture.ts',
        category: 'blank' as const,
        tags: [],
        thumbnail: '',
      },
      assets: featureAssets.default,
      edges,
      extensionInstances,
      nodeMetadata,
      nodes,
      noteContents,
    },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function makeWorkspace(root: string, total: number): Promise<void> {
  const wsPath = join(root, `ws-${total}`);
  if (existsSync(wsPath)) {
    console.log(`skip ${wsPath} (already exists; delete it to regenerate)`);
    return;
  }

  const workspace = await import('../../src/bun/workspace');
  const { flushNodeMetadata } = await import('../../src/bun/nodeMetadata');
  const { counted, edges, manifest } = await buildManifest(total);

  workspace.initWorkspace(wsPath);
  const view = {
    id: 'default',
    name: `性能样本 ${total}`,
    file: 'views/default.canvas.json',
  };
  await workspace.saveWorkspaceConfig(wsPath, {
    schema: 'ghostboard-workspace/v1',
    activeViewId: view.id,
    views: [view],
  });
  await workspace.populateViewFromTemplate(
    wsPath,
    view,
    manifest as unknown as Parameters<
      typeof workspace.populateViewFromTemplate
    >[2]
  );
  await flushNodeMetadata(wsPath);
  console.log(`wrote ${wsPath}: ${counted} nodes, ${edges} edges`);
}

const { out, sizes } = parseArgs(process.argv.slice(2));
for (const size of sizes) {
  await makeWorkspace(out, size);
}
process.exit(0);
