import { toast } from 'sonner';
import * as m from '../../paraglide/messages.js';

/** Recovery always waits for an explicit choice; dismissing keeps disk data. */
export function confirmCanvasRecovery(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    toast.warning(message, {
      duration: Number.POSITIVE_INFINITY,
      action: {
        label: m.canvas_recovery_restore(),
        onClick: () => resolve(true),
      },
      cancel: {
        label: m.canvas_recovery_keep_disk(),
        onClick: () => resolve(false),
      },
      onDismiss: () => resolve(false),
    });
  });
}
