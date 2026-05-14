import {
  ChevronDown,
  ChevronRight,
  Folder,
  Image as ImageIcon,
  Layers,
  Link2,
  Paperclip,
  Plus,
  StickyNote,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { cn } from '@/lib/utils';
import type { DocumentSection } from '@/store/canvasStore';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../paraglide/messages.js';

interface RailEntry {
  count?: number;
  icon: typeof StickyNote;
  label: string;
  section: DocumentSection;
}

function getCardTitle(data: Record<string, unknown>, fallback: string) {
  const t = (data as { title?: unknown }).title;
  return typeof t === 'string' && t.trim().length > 0 ? t : fallback;
}

function SectionHeader({
  collapsed,
  hasAdd,
  label,
  onAdd,
  onToggle,
}: {
  collapsed: boolean;
  hasAdd: boolean;
  label: string;
  onAdd?: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="group flex items-center justify-between px-2 py-1.5 font-semibold text-[10px] text-gray-400 uppercase tracking-wider dark:text-gray-500">
      <button
        className="flex items-center gap-1 hover:text-gray-600 dark:hover:text-gray-300"
        onClick={onToggle}
        type="button"
      >
        {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
        <span>{label}</span>
      </button>
      {hasAdd ? (
        <button
          aria-label={`Add ${label}`}
          className="rounded p-0.5 opacity-0 hover:bg-black/5 hover:text-gray-600 group-hover:opacity-100 dark:hover:bg-white/10 dark:hover:text-gray-300"
          onClick={onAdd}
          type="button"
        >
          <Plus size={11} />
        </button>
      ) : null}
    </div>
  );
}

function RailItem({
  active,
  count,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  count?: number;
  icon: typeof StickyNote;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors',
        active
          ? 'bg-blue-500/10 font-medium text-blue-700 dark:bg-blue-400/15 dark:text-blue-300'
          : 'text-gray-700 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/5'
      )}
      onClick={onClick}
      type="button"
    >
      <Icon
        className={active ? '' : 'opacity-60'}
        size={14}
        strokeWidth={active ? 2 : 1.7}
      />
      <span className="flex-1 truncate text-left">{label}</span>
      {typeof count === 'number' && count > 0 ? (
        <span
          className={cn(
            'min-w-4 rounded-full px-1.5 text-center text-[10px] tabular-nums',
            active
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-600 dark:bg-neutral-700 dark:text-gray-300'
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

export function LeftRail() {
  const nodes = useCanvasStore((s) => s.nodes);
  const documentSection = useCanvasStore((s) => s.documentSection);
  const setDocumentSection = useCanvasStore((s) => s.setDocumentSection);

  const [foldersOpen, setFoldersOpen] = useState(true);
  const [typesOpen, setTypesOpen] = useState(false);

  const folders = useMemo(
    () => nodes.filter((n) => n.type === 'folder'),
    [nodes]
  );

  const typeCounts = useMemo(() => {
    const counts = { image: 0, asset: 0, link: 0 };
    for (const n of nodes) {
      if (n.type === 'image') {
        counts.image += 1;
      } else if (n.type === 'asset') {
        counts.asset += 1;
      } else if (n.type === 'link') {
        counts.link += 1;
      } else if (n.type === 'folder') {
        const children = ((n.data as { children?: unknown }).children ??
          []) as Array<{ type?: string }>;
        for (const c of children) {
          if (c.type === 'image') {
            counts.image += 1;
          } else if (c.type === 'asset') {
            counts.asset += 1;
          } else if (c.type === 'link') {
            counts.link += 1;
          }
        }
      }
    }
    return counts;
  }, [nodes]);

  const top: RailEntry[] = [
    { section: 'all', label: m.document_all_notes(), icon: StickyNote },
    { section: 'archive', label: m.document_archive(), icon: Layers },
  ];

  return (
    <aside className="flex h-full flex-col gap-0.5 border-black/5 border-r bg-[#F7F7F5] px-2 py-3 dark:border-white/5 dark:bg-[#1a1a1a]">
      <div className="flex flex-col gap-0.5">
        {top.map((item) => (
          <RailItem
            active={documentSection === item.section}
            count={item.count}
            icon={item.icon}
            key={item.section}
            label={item.label}
            onClick={() => {
              setDocumentSection(item.section);
            }}
          />
        ))}
      </div>

      <div>
        <SectionHeader
          collapsed={!typesOpen}
          hasAdd={false}
          label={m.document_types()}
          onToggle={() => {
            setTypesOpen((v) => !v);
          }}
        />
        {typesOpen ? (
          <div className="flex flex-col gap-0.5">
            <RailItem
              active={documentSection === 'type:image'}
              count={typeCounts.image}
              icon={ImageIcon}
              label={m.document_type_images()}
              onClick={() => {
                setDocumentSection('type:image');
              }}
            />
            <RailItem
              active={documentSection === 'type:asset'}
              count={typeCounts.asset}
              icon={Paperclip}
              label={m.document_type_files()}
              onClick={() => {
                setDocumentSection('type:asset');
              }}
            />
            <RailItem
              active={documentSection === 'type:link'}
              count={typeCounts.link}
              icon={Link2}
              label={m.document_type_links()}
              onClick={() => {
                setDocumentSection('type:link');
              }}
            />
          </div>
        ) : null}
      </div>

      <div>
        <SectionHeader
          collapsed={!foldersOpen}
          hasAdd={false}
          label={m.document_folders()}
          onToggle={() => {
            setFoldersOpen((v) => !v);
          }}
        />
        {foldersOpen ? (
          <div className="flex flex-col gap-0.5">
            {folders.length === 0 ? (
              <p className="px-2 py-1 text-[11px] text-gray-400 dark:text-gray-500">
                {m.document_no_folders()}
              </p>
            ) : (
              folders.map((f) => {
                const section: DocumentSection = `folder:${f.id}`;
                const childCount = ((f.data as any)?.children ?? []).length;
                return (
                  <RailItem
                    active={documentSection === section}
                    count={childCount}
                    icon={Folder}
                    key={f.id}
                    label={getCardTitle(
                      f.data as Record<string, unknown>,
                      m.document_untitled_folder()
                    )}
                    onClick={() => {
                      setDocumentSection(section);
                    }}
                  />
                );
              })
            )}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

export default LeftRail;
