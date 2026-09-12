import { render } from '@testing-library/react';
import { createElement } from 'react';
import { SelectionProvider } from '../react.js';

export function renderPanel(definition, { context }) {
  if (!definition || typeof definition.component !== 'function') {
    throw new Error(
      'renderPanel requires a React panel definition with component'
    );
  }
  return render(
    createElement(
      SelectionProvider,
      { selection: context.selection },
      createElement(definition.component)
    )
  );
}
