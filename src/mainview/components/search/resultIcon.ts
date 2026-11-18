import {
  FileText,
  Folder,
  Group,
  ImageIcon,
  Layers,
  Link2,
  Paperclip,
  StickyNote,
  Workflow,
} from 'lucide-react';

import type { SearchResultKind } from '@/lib/searchTypes';

/** Map a search result kind to its lucide icon component. */
export function iconFor(kind: SearchResultKind) {
  switch (kind) {
    case 'sticky':
      return StickyNote;
    case 'topic':
      return Workflow;
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
    case 'extension':
      return FileText;
    default:
      return FileText;
  }
}
