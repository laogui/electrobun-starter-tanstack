import { Bell, Clock3, FileText, ListChecks } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { iconFor } from './resultIcon';

describe('iconFor', () => {
  it('uses widget-specific icons when widgetKind is present', () => {
    expect(iconFor('widget', 'checklist')).toBe(ListChecks);
    expect(iconFor('widget', 'pomodoro')).toBe(Clock3);
    expect(iconFor('widget', 'reminder')).toBe(Bell);
  });

  it('falls back for unknown widget subtype data', () => {
    expect(iconFor('widget')).toBe(FileText);
  });
});
