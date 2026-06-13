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
  const [prefilled, setPrefilled] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    let cancelled = false;
    // Prefill from the system clipboard when it holds a parseable URL.
    // Browser/Electrobun may reject readText outside a user gesture or in
    // insecure contexts; failures are swallowed so the form stays usable.
    navigator.clipboard
      ?.readText?.()
      .then((text) => {
        if (cancelled) {
          return;
        }
        const trimmed = text.trim();
        if (trimmed && createLinkNodeData(trimmed)) {
          setValue((prev) => {
            if (!prev) {
              setPrefilled(true);
              setTimeout(() => setPrefilled(false), 2000);
              return trimmed;
            }
            return prev;
          });
        }
      })
      .catch(() => {
        /* clipboard permission denied — ignore */
      });
    return () => {
      cancelled = true;
    };
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
      <div
        className={`flex items-center gap-2 rounded-xl border px-3 py-2 shadow-sm transition-colors duration-200 ${
          prefilled
            ? 'border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20'
            : 'border-gray-200 bg-white dark:border-neutral-600 dark:bg-neutral-900'
        }`}
      >
        <LinkIcon
          className={`shrink-0 transition-colors duration-200 ${prefilled ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400'}`}
          size={16}
        />
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
            setPrefilled(false);
            if (error) {
              setError('');
            }
          }}
          placeholder={
            prefilled ? 'URL from clipboard' : 'https://example.com'
          }
          ref={inputRef}
          spellCheck="false"
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
