// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useSelection } from '../../../../packages/plugin-sdk/react.js';
import { renderPanel } from '../../../../packages/plugin-sdk/testing/react.js';
import { createFakeHost } from '../../../../packages/plugin-sdk/testing.js';

const hosts: ReturnType<typeof createFakeHost>[] = [];

afterEach(async () => {
  await Promise.all(
    hosts.splice(0).map((fake) => fake.harness.lifecycle.dispose())
  );
});

it('renders a React panel with the fake host selection provider', () => {
  const fake = createFakeHost({
    pluginId: 'example.react-test',
    workspaceId: 'workspace-a',
  });
  hosts.push(fake);
  fake.harness.behavior.setSelection({
    error: null,
    items: [
      {
        color: '',
        id: 'note-1',
        kind: 'note',
        revision: 1,
        source: 'sidecar',
        text: 'Body',
        title: 'Selected note',
      },
    ],
    placements: { items: [], viewId: 'view-a' },
    status: 'ready',
  });

  function Panel() {
    const items = useSelection();
    return <p>{items[0]?.title}</p>;
  }
  renderPanel(
    { component: Panel, id: 'selection', title: 'Selection' },
    { context: fake.app }
  );

  expect(screen.getByText('Selected note')).toBeInTheDocument();
});
