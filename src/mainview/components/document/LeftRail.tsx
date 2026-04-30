import {
  ChevronDown,
  ChevronRight,
  Folder,
  Inbox,
  Layers,
  Plus,
  StickyNote,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { cn } from '@/lib/utils';
import type { DocumentSection } from '@/store/canvasStore';
import { useCanvasStore } from '@/store/canvasStore';

interface RailEntry {
  count?: number;
  icon: typeof Inbox;
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
  icon: typeof Inbox;
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
  const createNode = useCanvasStore((s) => s.createNode);

  const [foldersOpen, setFoldersOpen] = useState(true);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [typesOpen, setTypesOpen] = useState(false);

  const inboxCount = useMemo(
    () => nodes.filter((n) => n.type === 'card' || n.type === 'image').length,
    [nodes]
  );

  const folders = useMemo(
    () => nodes.filter((n) => n.type === 'folder'),
    [nodes]
  );

  const top: RailEntry[] = [
    {
      section: 'inbox',
      label: 'Inbox',
      icon: Inbox,
      count: inboxCount,
    },
    { section: 'all', label: 'All Notes', icon: StickyNote },
    { section: 'archive', label: 'Archive', icon: Layers },
  ];

  const handleNewFolder = useCallback(() => {
    createNode('folder', null);
  }, [createNode]);

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

      <div className="mt-3">
        <SectionHeader
          collapsed={!viewsOpen}
          hasAdd={false}
          label="Views"
          onToggle={() => {
            setViewsOpen((v) => !v);
          }}
        />
      </div>

      <div>
        <SectionHeader
          collapsed={!typesOpen}
          hasAdd={false}
          label="Types"
          onToggle={() => {
            setTypesOpen((v) => !v);
          }}
        />
      </div>

      <div>
        <SectionHeader
          collapsed={!foldersOpen}
          hasAdd
          label="Folders"
          onAdd={handleNewFolder}
          onToggle={() => {
            setFoldersOpen((v) => !v);
          }}
        />
        {foldersOpen ? (
          <div className="flex flex-col gap-0.5">
            {folders.length === 0 ? (
              <p className="px-2 py-1 text-[11px] text-gray-400 dark:text-gray-500">
                No folders yet
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
                      'Untitled folder'
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
