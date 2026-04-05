import type { Node } from '@xyflow/react';

export const initialNodes: Node[] = [
  {
    id: '1',
    type: 'card',
    position: { x: 100, y: 100 },
    style: { width: 350, height: 450 },
    data: {
      type: 'image',
      title: 'Alpha feedback\nTarget audience',
      color: 'bg-[#1A1A1A] text-white',
      pieData: [
        { label: 'Designers', color: '#555' },
        { label: 'Thinkers', color: '#888' },
        { label: 'Academics', color: '#BBB' },
        { label: 'Creatives', color: '#EEE' },
      ]
    }
  },
  {
    id: '2',
    type: 'card',
    position: { x: 500, y: 100 },
    style: { width: 350, height: 450 },
    data: {
      type: 'text',
      title: 'Who Spatial is for',
      content: '1. The Designer\nProduct designers, graphic designers, UX designers, brand designers, creative directors. They need to collect visual references, build moodboards, and organize project materials. They\'re currently cobbling together Figma, Pinterest, Milanote, and mymind — and none of it feels right. They\'re also the most opinionated about aesthetics and interaction quality, which is partly why they\'re drawn to Spatial in the first place.\n\n2. The Thinker\nProduct managers, researchers, writers, strategists, consultants. They\'re dealing with complex problems and oceans of information. They often feel overwhelmed by the sheer volume of data they need to process. Spatial helps them map out relationships and see the big picture.\n\n3. The Academics\nUniversity students, PhD researchers, MBA students, architecture students. They\'re reading dense academic journals, writing papers, and studying for exams. They use Spatial to visually organize their research and connect concepts.',
      color: 'bg-white'
    }
  },
  {
    id: '3',
    type: 'card',
    position: { x: 900, y: 100 },
    style: { width: 350, height: 450 },
    data: {
      type: 'checklist',
      title: 'Prio before launch',
      tag: 'Inbox',
      tagColor: 'bg-[#D4E08B]',
      color: 'bg-[#EAF2B8]',
      items: [
        { text: 'Lingering bugs', checked: false, isHeader: true },
        { text: 'Dragging should not let stickies become too small', checked: true },
        { text: 'when pasting images/webclips', checked: true },
        { text: 'Drop area on desktop reported by some', checked: false },
        { text: 'Sometimes, the highlight border around webclips isn\'t being removed after undoing a resize', checked: false },
      ]
    }
  },
  {
    id: '4',
    type: 'folder',
    position: { x: 900, y: 600 },
    style: { width: 350, height: 350 },
    data: {
      title: '3 items',
      subtitle: 'The really great ideas to implement',
      children: [
        { id: '4-1', type: 'card', data: { type: 'text', content: 'Notes should have a "floating-on-top" option so people can write while still flying around in space.', color: 'bg-[#A3E635]' } },
        { id: '4-2', type: 'card', data: { type: 'text', content: 'Being able to drop in almost anything. From pdf to audio.', color: 'bg-[#ECFCCB]' } },
        { id: '4-3', type: 'card', data: { type: 'text', content: 'Connecting things and concepts visually through arrows and lines.', color: 'bg-white' } },
      ]
    }
  },
  {
    id: 'g1',
    type: 'group',
    position: { x: 100, y: 600 },
    style: { width: 800, height: 400 },
    data: {
      label: 'Design Research',
      color: 'blue',
    }
  },
  {
    id: '5',
    type: 'card',
    position: { x: 1300, y: 100 },
    style: { width: 350, height: 450 },
    data: {
      type: 'checklist',
      title: 'Bugs',
      tag: 'Bugs',
      tagColor: 'bg-[#FBCFE8]',
      color: 'bg-[#FDF2F8]',
      items: [
        { text: 'Alpha feedback', checked: false, isHeader: true },
        { text: 'Reply to all emails from Feb 14, to get their feedback', checked: true },
        { text: 'Click picture to dismiss context', checked: true },
        { text: 'Resize handles overlaps tags, and dismisses context', checked: true },
        { text: 'Back button padding is funky', checked: true },
      ]
    }
  },
  {
    id: '6',
    type: 'folder',
    position: { x: 1300, y: 600 },
    style: { width: 350, height: 350 },
    data: {
      title: '5 items',
      subtitle: 'The critical bug reports to fix asap',
      children: [
        { id: '6-1', type: 'card', data: { type: 'text', content: 'Crash on load for some users', color: 'bg-red-100' } },
        { id: '6-2', type: 'card', data: { type: 'text', content: 'Sync conflicts when offline', color: 'bg-orange-100' } },
        { id: '6-3', type: 'card', data: { type: 'text', content: 'Images not loading in specific regions', color: 'bg-white' } },
        { id: '6-4', type: 'card', data: { type: 'text', content: 'Memory leak after 1 hour of usage', color: 'bg-white' } },
        { id: '6-5', type: 'card', data: { type: 'text', content: 'Missing translations in settings', color: 'bg-white' } },
      ]
    }
  }
];
