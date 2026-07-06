import { Dialog } from '@base-ui/react/dialog';
import { ImagePlus } from 'lucide-react';
import { useRef } from 'react';

import * as m from '../../../paraglide/messages.js';

export function ReplaceImageConfirmDialog({
  onCancel,
  onConfirm,
  open,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
}) {
  // Non-destructive confirm: focus the primary action so Enter confirms.
  const confirmRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog.Root
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel();
        }
      }}
      open={open}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[60] bg-black/35 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          className="fixed top-1/2 left-1/2 z-[60] w-[min(380px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-2xl outline-hidden transition-[transform,opacity] duration-150 data-ending-style:scale-95 data-starting-style:scale-95 data-ending-style:opacity-0 data-starting-style:opacity-0 dark:bg-neutral-900"
          initialFocus={confirmRef}
        >
          <div className="mb-4 flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-softer text-accent-strong">
              <ImagePlus size={17} />
            </div>
            <div className="min-w-0">
              <Dialog.Title className="font-semibold text-gray-900 text-sm dark:text-gray-100">
                {m.replace_image_confirm_title()}
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-[13px] text-gray-600 leading-5 dark:text-gray-300">
                {m.replace_image_confirm_body()}
              </Dialog.Description>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              className="h-8 rounded-md px-3 font-medium text-[13px] text-gray-600 transition-colors hover:bg-black/5 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
              onClick={onCancel}
              type="button"
            >
              {m.replace_image_confirm_cancel()}
            </button>
            <button
              className="focus-visible:offset-2 h-8 rounded-md bg-accent px-3 font-medium text-[13px] text-accent-foreground transition-colors hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-accent dark:hover:bg-accent"
              onClick={onConfirm}
              ref={confirmRef}
              type="button"
            >
              {m.replace_image_confirm_action()}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
