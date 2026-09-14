// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { ReactFlow } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { previewTopicDraft, type TopicDraft } from '@/store/canvasStore';

// Keep React Flow real: a mocked canvas does not apply its visibility gate
// when a controlled node loses its runtime dimensions.
const nodeTypes = {
  topic: () => <textarea aria-label="Draft title" />,
};

describe('Topic draft rendering', () => {
  it('keeps the editor visible before measurement and after rebuilding the preview', () => {
    const draft: TopicDraft = {
      anchor: { x: 100, y: 100 },
      id: 'topic-draft-visibility',
      text: '',
      viewId: 'default',
    };
    const preview = previewTopicDraft([], [], draft, 'default');
    const { rerender } = render(
      <ReactFlow {...preview} nodeTypes={nodeTypes} />
    );
    expect(screen.getByRole('textbox', { name: 'Draft title' })).toBeVisible();

    const updated = previewTopicDraft(
      [],
      [],
      { ...draft, text: 'Child' },
      'default'
    );
    rerender(<ReactFlow {...updated} nodeTypes={nodeTypes} />);
    expect(screen.getByRole('textbox', { name: 'Draft title' })).toBeVisible();
  });
});
