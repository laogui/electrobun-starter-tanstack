// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import docs from '../../../packages/plugin-sdk/README.md?raw';
import {
  createButton,
  createInput,
  createSurface,
} from '../../../packages/create-plugin/templates/javascript/ui.js';

const css = readFileSync('src/mainview/plugins/theme.css', 'utf8');

const tokens = [
  '--gb-accent',
  '--gb-accent-foreground',
  '--gb-accent-soft',
  '--gb-background',
  '--gb-border',
  '--gb-danger',
  '--gb-focus-ring',
  '--gb-font-mono',
  '--gb-font-sans',
  '--gb-foreground',
  '--gb-muted',
  '--gb-muted-foreground',
  '--gb-radius',
  '--gb-shadow',
  '--gb-surface',
];

afterEach(() => {
  document.documentElement.classList.remove('dark');
  document.head.querySelector('[data-plugin-theme-test]')?.remove();
  document.body.replaceChildren();
});

it('keeps the frozen public token list documented and complete', () => {
  const declared = [...new Set(css.match(/--gb-[a-z-]+(?=:)/g))].sort();
  expect(declared).toEqual(tokens);
  for (const token of tokens) {
    expect(docs).toContain(`| \`${token}\` |`);
  }
});

it('defines all tokens at the root and switches surface/text in dark mode', () => {
  const style = document.createElement('style');
  style.dataset.pluginThemeTest = '';
  style.textContent = css;
  document.head.append(style);
  const light = getComputedStyle(document.documentElement);
  for (const token of tokens) {
    expect(light.getPropertyValue(token)).not.toBe('');
  }
  const lightSurface = light.getPropertyValue('--gb-surface');
  const lightText = light.getPropertyValue('--gb-foreground');
  document.documentElement.classList.add('dark');
  const dark = getComputedStyle(document.documentElement);
  expect(dark.getPropertyValue('--gb-surface')).not.toBe(lightSurface);
  expect(dark.getPropertyValue('--gb-foreground')).not.toBe(lightText);
});

it('vendors editable DOM controls using only public theme tokens', () => {
  const surface = createSurface();
  const button = createButton('Hello');
  const input = createInput('Note');
  surface.append(button, input);
  document.body.append(surface);
  expect(button.type).toBe('button');
  expect(button.textContent).toBe('Hello');
  expect(input.getAttribute('aria-label')).toBe('Note');
  expect(button.style.background).toBe('var(--gb-accent)');
  expect(input.style.background).toBe('var(--gb-background)');
  expect(surface.style.color).toBe('var(--gb-foreground)');
  expect(button.style.outlineColor).toBe('var(--gb-focus-ring)');
});
