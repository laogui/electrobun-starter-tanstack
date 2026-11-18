import { counterCanvasType } from './builtin/counter';
import { fileCanvasType } from './builtin/media/file';
import { imageCanvasType } from './builtin/media/image';
import { linkCanvasType } from './builtin/web/link';
import { canvasTypeRegistry } from './registry';

let registered = false;

/** Production types always register. Counter stays DEV-only. */
export function registerBuiltinCanvasTypes(): void {
  if (registered) {
    return;
  }
  registered = true;
  canvasTypeRegistry.register(linkCanvasType);
  canvasTypeRegistry.register(imageCanvasType);
  canvasTypeRegistry.register(fileCanvasType);
  if (import.meta.env.DEV) {
    canvasTypeRegistry.register(counterCanvasType);
  }
}
