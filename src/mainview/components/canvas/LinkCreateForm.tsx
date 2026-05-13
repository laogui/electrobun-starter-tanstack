import { ArrowRight, Link as LinkIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { createLinkNodeData, type LinkNodeData } from '@/lib/contentTypes';

export function LinkCreateForm({
  onCreate,
}: {
  onCreate: (data: LinkNodeData) => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <form
      className="border-gray-100 border-t p-3 dark:border-neutral-700"
      onSubmit={(event) => {
        event.preventDefault();
        const data = createLinkNodeData(value);
        if (!data) {
          setError('Enter a valid http or https URL.');
          return;
        }
        setError('');
        setValue('');
        onCreate(data);
      }}
    >
      <label className="sr-only" htmlFor="create-link-url">
        Link URL
      </label>
      <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm dark:border-neutral-600 dark:bg-neutral-900">
        <LinkIcon className="shrink-0 text-gray-400" size={16} />
        <input
          className="min-w-0 flex-1 bg-transparent text-gray-900 text-sm outline-none placeholder:text-gray-400 dark:text-gray-100"
          id="create-link-url"
          onChange={(event) => {
            setValue(event.target.value);
            if (error) {
              setError('');
            }
          }}
          placeholder="https://example.com"
          ref={inputRef}
          type="text"
          value={value}
        />
        <button
          aria-label="Create link"
          className="grid size-7 shrink-0 place-items-center rounded-lg bg-gray-950 text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300 dark:bg-gray-100 dark:text-gray-950 dark:disabled:bg-neutral-700 dark:disabled:text-neutral-400 dark:hover:bg-gray-300"
          disabled={!value.trim()}
          type="submit"
        >
          <ArrowRight size={14} />
        </button>
      </div>
      {error ? <p className="mt-2 text-red-500 text-xs">{error}</p> : null}
    </form>
  );
}
