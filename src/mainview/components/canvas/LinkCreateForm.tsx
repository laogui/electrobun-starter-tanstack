import { ArrowRight, Link as LinkIcon, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { createLinkNodeData, type LinkNodeData } from '@/lib/contentTypes';

export function LinkCreateForm({
  onCreate,
}: {
  onCreate: (data: LinkNodeData) => Promise<void> | void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    inputRef.current?.focus();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return (
    <form
      className="border-gray-100 border-t p-3 dark:border-neutral-700"
      onSubmit={async (event) => {
        event.preventDefault();
        if (isSubmitting) {
          return;
        }
        const data = createLinkNodeData(value);
        if (!data) {
          setError('Enter a valid http or https URL.');
          return;
        }
        setError('');
        setIsSubmitting(true);
        try {
          await onCreate(data);
          if (mountedRef.current) {
            setValue('');
          }
        } catch {
          if (mountedRef.current) {
            setError('Could not create link.');
          }
        } finally {
          if (mountedRef.current) {
            setIsSubmitting(false);
          }
        }
      }}
    >
      <label className="sr-only" htmlFor="create-link-url">
        Link URL
      </label>
      <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm dark:border-neutral-600 dark:bg-neutral-900">
        <LinkIcon className="shrink-0 text-gray-400" size={16} />
        <input
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          className="min-w-0 flex-1 bg-transparent text-gray-900 text-sm outline-none placeholder:text-gray-400 dark:text-gray-100"
          data-1p-ignore
          data-form-type="other"
          data-lpignore="true"
          id="create-link-url"
          onChange={(event) => {
            setValue(event.target.value);
            if (error) {
              setError('');
            }
          }}
          placeholder="https://example.com"
          ref={inputRef}
          spellCheck="false"
          type="text"
          value={value}
        />
        <button
          aria-busy={isSubmitting}
          aria-label={isSubmitting ? 'Creating link' : 'Create link'}
          className="grid size-7 shrink-0 place-items-center rounded-lg bg-gray-950 text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300 dark:bg-gray-100 dark:text-gray-950 dark:disabled:bg-neutral-700 dark:disabled:text-neutral-400 dark:hover:bg-gray-300"
          disabled={isSubmitting || !value.trim()}
          type="submit"
        >
          {isSubmitting ? (
            <Loader2 className="animate-spin" size={14} />
          ) : (
            <ArrowRight size={14} />
          )}
        </button>
      </div>
      {error ? <p className="mt-2 text-red-500 text-xs">{error}</p> : null}
    </form>
  );
}
