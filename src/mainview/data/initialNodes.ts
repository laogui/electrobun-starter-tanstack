import type { Edge, Node } from '@xyflow/react';

export const initialNodes: Node[] = [
  {
    id: 'node-init0001',
    position: { x: 100, y: 100 },
    data: {
      type: 'image',
      title: 'Alpha feedback\nTarget audience',
      color: '#1A1A1A',
      pieData: [
        { label: 'Designers', color: '#555' },
        { label: 'Thinkers', color: '#888' },
        { label: 'Academics', color: '#BBB' },
        { label: 'Creatives', color: '#EEE' },
      ],
    },
    type: 'card',
    style: { height: 450, width: 350 },
  },
  {
    id: 'node-init0002',
    position: { x: 500, y: 100 },
    data: {
      type: 'text',
      title: 'Who GhostBoard is for',
      content:
        "1. The Designer\nProduct designers, graphic designers, UX designers, brand designers, creative directors. They need to collect visual references, build moodboards, and organize project materials. They're currently cobbling together Figma, Pinterest, Milanote, and mymind — and none of it feels right. They're also the most opinionated about aesthetics and interaction quality, which is partly why they're drawn to GhostBoard in the first place.\n\n2. The Thinker\nProduct managers, researchers, writers, strategists, consultants. They're dealing with complex problems and oceans of information. They often feel overwhelmed by the sheer volume of data they need to process. GhostBoard helps them map out relationships and see the big picture.\n\n3. The Academics\nUniversity students, PhD researchers, MBA students, architecture students. They're reading dense academic journals, writing papers, and studying for exams. They use GhostBoard to visually organize their research and connect concepts.",
      color: '#FFFFFF',
    },
    type: 'card',
    style: { height: 450, width: 350 },
  },
  {
    id: 'node-init0003',
    position: { x: 900, y: 100 },
    data: {
      type: 'checklist',
      title: 'Prio before launch',
      tag: 'Inbox',
      tagColor: '#D4E08B',
      color: '#EAF2B8',
      items: [
        { text: 'Lingering bugs', checked: false, isHeader: true },
        {
          text: 'Dragging should not let stickies become too small',
          checked: true,
        },
        { text: 'when pasting images/webclips', checked: true },
        { text: 'Drop area on desktop reported by some', checked: false },
        {
          text: "Sometimes, the highlight border around webclips isn't being removed after undoing a resize",
          checked: false,
        },
      ],
    },
    type: 'card',
    style: { height: 450, width: 350 },
  },
  {
    id: 'node-init0004',
    position: { x: 900, y: 600 },
    data: {
      title: '3 items',
      subtitle: 'The really great ideas to implement',
      children: [
        {
          id: 'child-init0001',
          type: 'card',
          data: {
            type: 'text',
            content:
              'Notes should have a "floating-on-top" option so people can write while still flying around in space.',
            color: '#A3E635',
          },
        },
        {
          id: 'child-init0002',
          type: 'card',
          data: {
            type: 'text',
            content:
              'Being able to drop in almost anything. From pdf to audio.',
            color: '#ECFCCB',
          },
        },
        {
          id: 'child-init0003',
          type: 'card',
          data: {
            type: 'text',
            content:
              'Connecting things and concepts visually through arrows and lines.',
            color: '#FFFFFF',
          },
        },
      ],
    },
    type: 'folder',
    style: { height: 280, width: 280 },
  },
  {
    id: 'node-init0007',
    position: { x: 100, y: 600 },
    data: {
      label: 'Design Research',
      color: 'blue',
    },
    type: 'group',
    style: { height: 400, width: 800 },
  },
  {
    id: 'node-init0005',
    position: { x: 380, y: 20 },
    parentId: 'node-init0007',
    extent: 'parent',
    data: {
      content: 'Remember to review the onboarding flow before next sprint!',
      color: '#FEF08A',
    },
    type: 'sticky',
    style: { height: 200, width: 200 },
  },
  {
    id: 'node-init0006',
    position: { x: 600, y: 20 },
    parentId: 'node-init0007',
    extent: 'parent',
    data: {
      content: 'Ask design team about new color palette 🎨',
      color: '#BBF7D0',
    },
    type: 'sticky',
    style: { height: 200, width: 200 },
  },
  {
    id: 'node-init0008',
    position: { x: 1300, y: 100 },
    data: {
      type: 'checklist',
      title: 'Bugs',
      tag: 'Bugs',
      tagColor: '#FBCFE8',
      color: '#FDF2F8',
      items: [
        { text: 'Alpha feedback', checked: false, isHeader: true },
        {
          text: 'Reply to all emails from Feb 14, to get their feedback',
          checked: true,
        },
        { text: 'Click picture to dismiss context', checked: true },
        {
          text: 'Resize handles overlaps tags, and dismisses context',
          checked: true,
        },
        { text: 'Back button padding is funky', checked: true },
      ],
    },
    type: 'card',
    style: { height: 450, width: 350 },
  },
  {
    id: 'node-init0009',
    position: { x: 1300, y: 600 },
    data: {
      title: '5 items',
      subtitle: 'The critical bug reports to fix asap',
      children: [
        {
          id: 'child-init0004',
          type: 'card',
          data: {
            type: 'text',
            content: 'Crash on load for some users',
            color: '#FEE2E2',
          },
        },
        {
          id: 'child-init0005',
          type: 'card',
          data: {
            type: 'text',
            content: 'Sync conflicts when offline',
            color: '#FFEDD5',
          },
        },
        {
          id: 'child-init0006',
          type: 'card',
          data: {
            type: 'text',
            content: 'Images not loading in specific regions',
            color: '#FFFFFF',
          },
        },
        {
          id: 'child-init0007',
          type: 'card',
          data: {
            type: 'text',
            content: 'Memory leak after 1 hour of usage',
            color: '#FFFFFF',
          },
        },
        {
          id: 'child-init0008',
          type: 'card',
          data: {
            type: 'text',
            content: 'Missing translations in settings',
            color: '#FFFFFF',
          },
        },
      ],
    },
    type: 'folder',
    style: { height: 280, width: 280 },
  },
  {
    id: 'node-init0010',
    position: { x: 100, y: 1100 },
    data: {
      imageUrl: '',
      title: 'Drop an image here',
      color: '#FFFFFF',
    },
    type: 'image',
    style: { height: 350, width: 350 },
  },
];

export const initialEdges: Edge[] = [];
