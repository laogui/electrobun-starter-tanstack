import { counterCanvasType } from './builtin/counter';
import { fileCanvasType } from './builtin/media/file';
import { imageCanvasType } from './builtin/media/image';
import { recordingCanvasType } from './builtin/media/recording';
import { checklistCanvasType } from './builtin/productivity/checklist';
import { pomodoroCanvasType } from './builtin/productivity/pomodoro';
import { reminderCanvasType } from './builtin/productivity/reminder';
import { linkCanvasType } from './builtin/web/link';
import { canvasTypeRegistry } from './registry';

let registered = false;

/** Production types always register. Counter stays DEV-only. */
export function registerBuiltinCanvasTypes(): void {
  if (registered) {
    return;
  }
  registered = true;
  canvasTypeRegistry.register(checklistCanvasType);
  canvasTypeRegistry.register(pomodoroCanvasType);
  canvasTypeRegistry.register(reminderCanvasType);
  canvasTypeRegistry.register(linkCanvasType);
  canvasTypeRegistry.register(imageCanvasType);
  canvasTypeRegistry.register(fileCanvasType);
  canvasTypeRegistry.register(recordingCanvasType);
  if (import.meta.env.DEV) {
    canvasTypeRegistry.register(counterCanvasType);
  }
}
