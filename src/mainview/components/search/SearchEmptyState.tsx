import { Clock, CornerDownLeft, Layers, Plus, X } from 'lucide-react';
import { useMemo } from 'react';

import type { SearchResultKind } from '@/lib/searchTypes';

import * as m from '../../../paraglide/messages.js';
import { iconFor } from './resultIcon';

export interface RecentCard {
  id: string;
  kind: SearchResultKind;
  title: string;
}

export interface CanvasEntry {
  id: string;
  name: string;
}

interface SearchEmptyStateProps {
  activeViewId: string;
  canvases: CanvasEntry[];
  history: string[];
  onClearHistory: () => void;
  onPickCanvas: (viewId: string) => void;
  onPickCard: (card: RecentCard) => void;
  onPickHistory: (entry: string) => void;
  onRemoveHistory: (entry: string) => void;
  recentCards: RecentCard[];
}

/**
 * Zero-query landing surface for the search dialog (roadmap E3). Surfaces
 * recent searches, the most recently edited cards, and quick canvas jumps so
 * the dialog is useful before the user types anything.
 */
export function SearchEmptyState({
  history,
  recentCards,
  canvases,
  activeViewId,
  onPickHistory,
  onRemoveHistory,
  onClearHistory,
  onPickCard,
  onPickCanvas,
}: SearchEmptyStateProps) {
  const otherCanvases = useMemo(
    () => canvases.filter((c) => c.id !== activeViewId),
    [canvases, activeViewId]
  );

  return (
    <div className="flex flex-col">
      {history.length > 0 ? (
        <section>
          <SectionHeader
            action={
              <button
                className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                onClick={onClearHistory}
                type="button"
              >
                {m.search_recent_clear()}
              </button>
            }
            icon={<Clock aria-hidden size={12} />}
            label={m.search_recent_title()}
          />
          {history.map((entry) => (
            <button
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-gray-700 text-sm hover:bg-black/5 dark:text-gray-200 dark:hover:bg-white/5"
              key={entry}
              onClick={() => {
                onPickHistory(entry);
              }}
              type="button"
            >
              <Clock
                aria-hidden
                className="shrink-0 text-gray-400 dark:text-gray-500"
                size={14}
              />
              <span className="flex-1 truncate">{entry}</span>
              <X
                aria-label="Remove from history"
                className="text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveHistory(entry);
                }}
                size={14}
              />
            </button>
          ))}
        </section>
      ) : null}

      {recentCards.length > 0 ? (
        <section>
          <SectionHeader
            icon={<Clock aria-hidden size={12} />}
            label={m.search_recent_cards()}
          />
          {recentCards.map((card) => {
            const Icon = iconFor(card.kind);
            return (
              <button
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-gray-700 text-sm hover:bg-black/5 dark:text-gray-200 dark:hover:bg-white/5"
                key={card.id}
                onClick={() => {
                  onPickCard(card);
                }}
                type="button"
              >
                <Icon
                  aria-hidden
                  className="shrink-0 text-gray-400 dark:text-gray-500"
                  size={16}
                />
                <span className="flex-1 truncate">
                  {card.title || 'Untitled'}
                </span>
              </button>
            );
          })}
        </section>
      ) : null}

      {otherCanvases.length > 0 ? (
        <section>
          <SectionHeader
            icon={<Layers aria-hidden size={12} />}
            label={m.search_jump_to_canvas()}
          />
          {otherCanvases.map((canvas) => (
            <button
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-gray-700 text-sm hover:bg-black/5 dark:text-gray-200 dark:hover:bg-white/5"
              key={canvas.id}
              onClick={() => {
                onPickCanvas(canvas.id);
              }}
              type="button"
            >
              <Layers
                aria-hidden
                className="shrink-0 text-gray-400 dark:text-gray-500"
                size={16}
              />
              <span className="flex-1 truncate">{canvas.name}</span>
            </button>
          ))}
        </section>
      ) : null}

      <div className="flex items-center gap-4 border-gray-100 border-t px-4 py-2.5 text-[11px] text-gray-400 dark:border-neutral-800 dark:text-gray-500">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          {m.search_tip_navigate()}
        </span>
        <span className="flex items-center gap-1">
          <Kbd>
            <CornerDownLeft aria-hidden size={11} />
          </Kbd>
          {m.search_tip_select()}
        </span>
        <span className="flex items-center gap-1">
          <Kbd>
            <Plus aria-hidden size={11} />N
          </Kbd>
          {m.search_tip_create()}
        </span>
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  label,
  action,
}: {
  icon: React.ReactNode;
  label: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-gray-100 border-b px-4 py-2 text-gray-500 text-xs dark:border-neutral-800 dark:text-gray-400">
      <span className="flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      {action}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[18px] items-center justify-center gap-0.5 rounded border border-gray-200 bg-gray-50 px-1 py-0.5 font-sans text-[10px] text-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-gray-400">
      {children}
    </kbd>
  );
}
