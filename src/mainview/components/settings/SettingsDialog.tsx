import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { useCallback, useMemo } from 'react';

import { type AppSettings, createSettingsClient } from '@/settingsClient';
import * as m from '../../../paraglide/messages.js';
import { SettingsApp } from './SettingsApp';

interface SettingsDialogProps {
  onOpenChange: (open: boolean) => void;
  onSettingsChange: (settings: AppSettings) => void;
  open: boolean;
}

export function SettingsDialog({
  onOpenChange,
  onSettingsChange,
  open,
}: SettingsDialogProps) {
  const client = useMemo(() => createSettingsClient(), []);
  const handleSettingsChange = useCallback(
    (settings: AppSettings) => {
      onSettingsChange(settings);
      globalThis.dispatchEvent(
        new CustomEvent('settings-updated', { detail: settings })
      );
    },
    [onSettingsChange]
  );

  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[55] bg-black/35 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          aria-label={m.a11y_settings()}
          className="fixed top-1/2 left-1/2 z-[55] h-[min(680px,calc(100vh-64px))] w-[min(860px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl bg-neutral-50 shadow-2xl outline-hidden transition-[transform,opacity] duration-150 data-ending-style:scale-95 data-starting-style:scale-95 data-ending-style:opacity-0 data-starting-style:opacity-0 dark:bg-neutral-950"
        >
          <Dialog.Title className="sr-only">{m.a11y_settings()}</Dialog.Title>
          <Dialog.Close
            aria-label={m.a11y_close_settings()}
            className="absolute top-3 right-3 z-10 inline-flex size-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-black/5 hover:text-neutral-800 focus-visible:outline-2 focus-visible:outline-accent/60 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-neutral-100"
            type="button"
          >
            <X size={15} />
          </Dialog.Close>
          <SettingsApp
            client={client}
            manageDocument={false}
            onSettingsChange={handleSettingsChange}
            variant="dialog"
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
