/**
 * Open a native file picker and resolve with the chosen file, or `null` when
 * the user dismisses it.
 *
 * Browsers fire `cancel` on the input when the dialog is dismissed (Chromium
 * 113+, Safari 16.4+, Firefox 91+). Older WebViews never fire it, so a focus
 * fallback also settles the promise: when the window regains focus and no
 * `change` arrives within a grace period, the pick is treated as cancelled.
 * Without these the promise would hang forever on cancel.
 */

export const FILE_PICKER_FOCUS_GRACE_MS = 1000;

/** The parts of `<input type="file">` the picker drives. */
export interface PickFileInput
  extends Pick<EventTarget, 'addEventListener' | 'removeEventListener'> {
  accept: string;
  click(): void;
  readonly files: ArrayLike<File> | null;
  type: string;
}

export interface PickFileEnvironment {
  /** Creates the hidden input; defaults to `document.createElement`. */
  createInput?: () => PickFileInput;
  focusGraceMs?: number;
  /** Target that receives `focus` when the dialog closes; defaults to window. */
  focusTarget?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
}

export function pickFile(
  accept?: string,
  env: PickFileEnvironment = {}
): Promise<File | null> {
  const createInput =
    env.createInput ?? (() => document.createElement('input'));
  const focusTarget = env.focusTarget ?? globalThis;
  const graceMs = env.focusGraceMs ?? FILE_PICKER_FOCUS_GRACE_MS;

  return new Promise((resolve) => {
    const input = createInput();
    input.type = 'file';
    if (accept) {
      input.accept = accept;
    }
    let settled = false;
    let focusTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (file: File | null) => {
      if (settled) {
        return;
      }
      settled = true;
      if (focusTimer !== undefined) {
        clearTimeout(focusTimer);
      }
      input.removeEventListener('change', onChange);
      input.removeEventListener('cancel', onCancel);
      focusTarget.removeEventListener('focus', onFocus);
      resolve(file);
    };
    const onChange = () => {
      finish(input.files?.[0] ?? null);
    };
    const onCancel = () => {
      finish(null);
    };
    const onFocus = () => {
      if (focusTimer !== undefined) {
        clearTimeout(focusTimer);
      }
      // `change` can land slightly after focus returns; give it a moment.
      focusTimer = setTimeout(() => {
        finish(input.files?.[0] ?? null);
      }, graceMs);
    };

    input.addEventListener('change', onChange);
    input.addEventListener('cancel', onCancel);
    focusTarget.addEventListener('focus', onFocus);
    input.click();
  });
}
