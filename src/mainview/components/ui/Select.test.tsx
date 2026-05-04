// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from './Select';

describe('Select', () => {
  it('renders an accessible label and selected value', () => {
    render(
      <Select
        items={[
          { label: 'System', value: 'system' },
          { label: 'Light', value: 'light' },
        ]}
        onValueChange={vi.fn()}
        value="system"
      >
        <SelectLabel>Theme</SelectLabel>
        <SelectTrigger id="theme">
          <SelectValue>System</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem label="System" value="system">
            System
          </SelectItem>
          <SelectItem label="Light" value="light">
            Light
          </SelectItem>
        </SelectContent>
      </Select>
    );

    expect(screen.getByText('Theme')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Theme' })).toHaveTextContent(
      'System'
    );
  });
});
