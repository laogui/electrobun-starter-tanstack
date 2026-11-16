import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, LayoutGrid, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { TemplateMeta } from '@/hooks/useTemplates';
import { useTemplates } from '@/hooks/useTemplates';

import * as m from '../../../paraglide/messages.js';

// ---------------------------------------------------------------------------
// Route definition
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/templates/')({
  component: TemplatesRoute,
});

// ---------------------------------------------------------------------------
// Category tabs
// ---------------------------------------------------------------------------

type Category = 'all' | 'planning' | 'thinking' | 'knowledge' | 'blank';

const CATEGORIES: { id: Category; label: () => string }[] = [
  { id: 'all', label: () => m.templates_category_all() },
  { id: 'planning', label: () => m.templates_category_planning() },
  { id: 'thinking', label: () => m.templates_category_thinking() },
  { id: 'knowledge', label: () => m.templates_category_knowledge() },
  { id: 'blank', label: () => m.templates_category_blank() },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function TemplatesRoute() {
  const { data: templates = [], isLoading } = useTemplates();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category>('all');

  const visibleCategories = CATEGORIES.filter(
    (cat) => cat.id === 'all' || templates.some((t) => t.category === cat.id)
  );

  const filtered = useMemo(() => {
    let result: TemplateMeta[] = templates;
    if (category !== 'all') {
      result = result.filter((t) => t.category === category);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    }
    return result;
  }, [templates, category, search]);

  return (
    <div
      className="fixed inset-x-0 bottom-0 flex flex-col bg-white dark:bg-neutral-900"
      style={{ top: 'var(--app-titlebar-height, 40px)' }}
    >
      {/* Header */}
      <header className="flex items-center gap-4 border-gray-100 border-b px-8 pt-6 pb-4 dark:border-neutral-800">
        <Link
          className="flex items-center gap-1.5 text-gray-500 text-sm transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          to="/"
        >
          <ArrowLeft size={16} />
          {m.templates_back()}
        </Link>
        <h1 className="font-semibold text-gray-900 text-xl dark:text-gray-100">
          {m.templates_title()}
        </h1>
      </header>

      {/* Toolbar: search + category tabs */}
      <div className="flex flex-wrap items-center gap-4 px-8 py-4">
        {/* Search */}
        <div className="relative min-w-50 max-w-sm flex-1">
          <Search
            className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
            size={16}
          />
          <input
            aria-label={m.templates_search_placeholder()}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pr-3 pl-9 text-sm outline-hidden transition-colors placeholder:text-gray-400 focus:border-gray-400 focus:bg-white dark:border-neutral-700 dark:bg-neutral-800 dark:focus:border-neutral-500 dark:focus:bg-neutral-800 dark:placeholder:text-gray-500"
            onChange={(e) => setSearch(e.target.value)}
            placeholder={m.templates_search_placeholder()}
            type="text"
            value={search}
          />
        </div>

        {/* Category tabs */}
        <div
          className="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-neutral-800"
          role="tablist"
        >
          {visibleCategories.map((cat) => (
            <button
              aria-selected={category === cat.id}
              className={`rounded-md px-3 py-1.5 font-medium text-xs transition-colors ${
                category === cat.id
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-neutral-700 dark:text-gray-100'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              role="tab"
              type="button"
            >
              {cat.label()}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <LayoutGrid className="animate-pulse" size={32} />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-20 text-center text-gray-400 text-sm">
            {search.trim()
              ? m.templates_empty_search({ query: search.trim() })
              : m.templates_empty()}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map((tpl) => (
              <TemplateCard key={tpl.id} template={tpl} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Template Card
// ---------------------------------------------------------------------------

function TemplateCard({ template }: { template: TemplateMeta }) {
  return (
    <Link
      className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-lg dark:border-neutral-700 dark:bg-neutral-800 dark:hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]"
      params={{ templateId: template.id }}
      to="/templates/$templateId"
    >
      {/* Thumbnail */}
      <div className="aspect-video w-full overflow-hidden bg-gray-100 dark:bg-neutral-700">
        {template.thumbnail ? (
          <img
            alt={template.name}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            src={template.thumbnail}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-300 dark:text-gray-600">
            <LayoutGrid size={32} />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="font-semibold text-gray-900 text-sm dark:text-gray-100">
          {template.name}
        </h3>
        <p className="line-clamp-2 text-gray-500 text-xs dark:text-gray-400">
          {template.description}
        </p>
        {template.tags.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {template.tags.map((tag) => (
              <span
                className="rounded-full bg-gray-100 px-2 py-0.5 text-3xs text-gray-500 dark:bg-neutral-700 dark:text-gray-400"
                key={tag}
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </Link>
  );
}
