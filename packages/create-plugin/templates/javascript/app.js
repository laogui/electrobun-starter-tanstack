import { definePlugin } from '@ghostboard/sdk';
import { createButton, createInput, createSurface } from './ui.js';

export default definePlugin({
  setup(app) {
    app.panels.register({
      id: 'hello',
      title: 'Hello',
      mount(element) {
        const surface = createSurface();
        const input = createInput('Panel note');
        input.placeholder = 'Your note';
        const button = createButton('Count: 0');
        let count = 0;
        button.addEventListener('click', () => {
          count += 1;
          button.textContent = `Count: ${count}`;
        });
        surface.append(input, button);
        element.append(surface);
        return () => surface.remove();
      },
    });
    app.commands.register({
      id: 'open-hello',
      title: 'Open Hello panel',
      run: () => app.panels.open('hello'),
    });
  },
});
