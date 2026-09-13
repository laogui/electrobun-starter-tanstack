const controlStyle = {
  border: '1px solid var(--gb-border)',
  borderRadius: 'var(--gb-radius)',
  padding: '6px 10px',
  font: 'inherit',
  outlineColor: 'var(--gb-focus-ring)',
};

export function createButton(text) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  Object.assign(button.style, controlStyle, {
    background: 'var(--gb-accent)',
    color: 'var(--gb-accent-foreground)',
    cursor: 'pointer',
  });
  return button;
}

export function createInput(label) {
  const input = document.createElement('input');
  input.type = 'text';
  input.setAttribute('aria-label', label);
  Object.assign(input.style, controlStyle, {
    background: 'var(--gb-background)',
    color: 'var(--gb-foreground)',
  });
  return input;
}

export function createSurface() {
  const surface = document.createElement('div');
  Object.assign(surface.style, {
    display: 'grid',
    gap: '12px',
    padding: '12px',
    background: 'var(--gb-surface)',
    color: 'var(--gb-foreground)',
    fontFamily: 'var(--gb-font-sans)',
    borderRadius: 'var(--gb-radius)',
  });
  return surface;
}
