import { definePlugin } from '@ghostboard/sdk';
import { useState } from 'react';
import { Button, Input, Surface } from './components/ui';

function HelloPanel() {
  const [count, setCount] = useState(0);
  return (
    <Surface>
      <Input aria-label="Panel note" placeholder="Your note" />
      <Button onClick={() => setCount((value) => value + 1)}>
        Count: {count}
      </Button>
    </Surface>
  );
}

export default definePlugin({
  setup(app) {
    app.panels.register({
      id: 'hello',
      title: 'React Hello',
      component: HelloPanel,
    });
    app.commands.register({
      id: 'open-hello',
      title: 'Open React Hello',
      run: () => app.panels.open('hello'),
    });
  },
});
