import type { ComponentProps, CSSProperties } from 'react';

const controlStyle: CSSProperties = {
  border: '1px solid var(--gb-border)',
  borderRadius: 'var(--gb-radius)',
  padding: '6px 10px',
  font: 'inherit',
  outlineColor: 'var(--gb-focus-ring)',
};

export function Button({
  style,
  type = 'button',
  ...props
}: ComponentProps<'button'>) {
  return (
    <button
      {...props}
      style={{
        ...controlStyle,
        background: 'var(--gb-accent)',
        color: 'var(--gb-accent-foreground)',
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        opacity: props.disabled ? 0.5 : 1,
        ...style,
      }}
      type={type}
    />
  );
}

export function Input({ style, ...props }: ComponentProps<'input'>) {
  return (
    <input
      {...props}
      style={{
        ...controlStyle,
        background: 'var(--gb-background)',
        color: 'var(--gb-foreground)',
        ...style,
      }}
    />
  );
}

export function Surface({ style, ...props }: ComponentProps<'div'>) {
  return (
    <div
      {...props}
      style={{
        display: 'grid',
        gap: 12,
        padding: 12,
        background: 'var(--gb-surface)',
        color: 'var(--gb-foreground)',
        fontFamily: 'var(--gb-font-sans)',
        borderRadius: 'var(--gb-radius)',
        ...style,
      }}
    />
  );
}
