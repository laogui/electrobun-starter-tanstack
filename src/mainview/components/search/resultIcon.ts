import {
  Bell,
  Clock3,
  FileText,
  Folder,
  Group,
  ImageIcon,
  Layers,
  Link2,
  ListChecks,
  Paperclip,
  StickyNote,
} from 'lucide-react';

import type { SearchResultKind } from '@/lib/searchTypes';
import type { WidgetKind } from '@/lib/widgetTypes';

/** Map a search result kind to its lucide icon component. */
export function iconFor(kind: SearchResultKind, widgetKind?: WidgetKind) {
  switch (kind) {
    case 'sticky':
      return StickyNote;
    case 'folder':
      return Folder;
    case 'group':
      return Group;
    case 'image':
      return ImageIcon;
    case 'asset':
      return Paperclip;
    case 'link':
      return Link2;
    case 'view':
      return Layers;
    case 'widget':
      if (widgetKind === 'checklist') {
        return ListChecks;
      }
      if (widgetKind === 'pomodoro') {
        return Clock3;
      }
      if (widgetKind === 'reminder') {
        return Bell;
      }
      return FileText;
    default:
      return FileText;
  }
}
