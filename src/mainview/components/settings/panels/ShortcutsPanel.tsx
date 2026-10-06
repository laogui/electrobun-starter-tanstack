import { MOD_KEY as MOD, SHIFT_KEY as SHIFT } from '@/lib/learningContent';
import type { SettingsLocaleStrings } from '../i18n/getLocaleStrings';

/**
 * Subset of SettingsLocaleStrings whose values are plain strings (no function
 * placeholders like `(count: number) => string`). Lets the cheatsheet table
 * read keys safely without a runtime cast.
 */
type StringValuedKey = {
  [K in keyof SettingsLocaleStrings]: SettingsLocaleStrings[K] extends string
    ? K
    : never;
}[keyof SettingsLocaleStrings];

interface ShortcutEntry {
  gesture?: StringValuedKey;
  /** Either a single key string or a list of alt-key combinations. */
  keys: string[];
  label: StringValuedKey;
}

interface ShortcutGroup {
  entries: ShortcutEntry[];
  heading: StringValuedKey;
}

const groups: ShortcutGroup[] = [
  {
    heading: 'shortcutSectionCanvas',
    entries: [
      { keys: ['Space'], gesture: 'shortcutDrag', label: 'shortcutPan' },
      { keys: [], gesture: 'shortcutDragEmpty', label: 'shortcutBoxSelect' },
      { keys: [], gesture: 'shortcutScroll', label: 'shortcutScrollPan' },
      { keys: [], gesture: 'shortcutPinch', label: 'shortcutPinchZoom' },
    ],
  },
  {
    heading: 'shortcutSectionView',
    entries: [
      { keys: [`${MOD}+K`], label: 'shortcutSearch' },
      { keys: [`${MOD}+N`], label: 'shortcutNewMenu' },
      { keys: [`${MOD}+=`, `${MOD}+-`], label: 'shortcutZoom' },
      { keys: [`${MOD}+0`], label: 'shortcutZoomReset' },
      { keys: ['Esc'], label: 'shortcutFocusedClose' },
      { keys: ['A–Z'], label: 'shortcutTypeToSearch' },
    ],
  },
  {
    heading: 'shortcutSectionEdit',
    entries: [
      { keys: [`${MOD}+Z`], label: 'shortcutUndo' },
      { keys: [`${MOD}+${SHIFT}+Z`], label: 'shortcutRedo' },
      { keys: [`${MOD}+C`], label: 'shortcutCopy' },
      { keys: [`${MOD}+X`], label: 'shortcutCut' },
      { keys: [`${MOD}+V`], label: 'shortcutPaste' },
      { keys: [`${MOD}+D`], label: 'shortcutDuplicate' },
      { keys: [`${MOD}+G`], label: 'shortcutGroup' },
      { keys: [`${MOD}+${SHIFT}+G`], label: 'shortcutUngroup' },
      { keys: ['Delete', 'Backspace'], label: 'shortcutDelete' },
    ],
  },
  {
    heading: 'shortcutSectionNav',
    entries: [
      { keys: [`${MOD}+A`], label: 'shortcutSelectAll' },
      { keys: [`${MOD}+${SHIFT}+A`], label: 'shortcutDeselectAll' },
      { keys: ['↑', '↓', '←', '→'], label: 'shortcutNavigate' },
      { keys: ['Enter'], label: 'shortcutOpenFocused' },
    ],
  },
];

interface ShortcutsPanelProps {
  strings: SettingsLocaleStrings;
}

export function ShortcutsPanel({ strings }: ShortcutsPanelProps) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h2 className="font-semibold text-[15px] text-neutral-900 dark:text-neutral-50">
          {strings.shortcutsTitle}
        </h2>
        <p className="text-[12px] text-neutral-500 dark:text-neutral-400">
          {strings.shortcutDescription}
        </p>
      </div>

      <div className="space-y-6">
        {groups.map((group) => (
          <ShortcutGroupSection
            entries={group.entries}
            heading={strings[group.heading]}
            key={group.heading}
            strings={strings}
          />
        ))}
      </div>
    </div>
  );
}

interface ShortcutGroupSectionProps {
  entries: ShortcutEntry[];
  heading: string;
  strings: SettingsLocaleStrings;
}

function ShortcutGroupSection({
  entries,
  heading,
  strings,
}: ShortcutGroupSectionProps) {
  return (
    <section aria-labelledby={`shortcuts-${heading}`} className="space-y-2">
      <h3
        className="font-medium text-2xs text-neutral-500 uppercase tracking-wide dark:text-neutral-400"
        id={`shortcuts-${heading}`}
      >
        {heading}
      </h3>
      <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
        <table className="w-full table-auto">
          <tbody>
            {entries.map((entry, index) => (
              <tr
                className={
                  index === entries.length - 1
                    ? 'bg-white dark:bg-neutral-900'
                    : 'border-neutral-200 border-b bg-white dark:border-neutral-800 dark:bg-neutral-900'
                }
                key={entry.label}
              >
                <td className="w-1/2 px-3 py-2 align-top text-[13px] text-neutral-800 dark:text-neutral-100">
                  {strings[entry.label]}
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {entry.keys.map((key, keyIndex) => (
                      <span className="inline-flex items-center" key={key}>
                        <kbd className="inline-flex h-6 items-center rounded border border-neutral-300 bg-neutral-50 px-1.5 font-mono text-2xs text-neutral-700 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                          {key}
                        </kbd>
                        {keyIndex < entry.keys.length - 1 ? (
                          <span className="mx-1 text-2xs text-neutral-400 dark:text-neutral-500">
                            /
                          </span>
                        ) : null}
                      </span>
                    ))}
                    {entry.gesture ? (
                      <span className="text-neutral-500 text-xs dark:text-neutral-400">
                        {entry.keys.length > 0 ? '+ ' : ''}
                        {strings[entry.gesture]}
                      </span>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
