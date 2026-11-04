import type { CreatableMenuItem } from '@/lib/creatableNodes';
import { HIDDEN_CREATE_CANVAS_TYPE_IDS } from '@/lib/productScope';

import {
  canvasTypeMenuActionId,
  isCanvasTypeId,
} from '../../shared/extensions/ids';

import type { AnyBuiltinCanvasType } from './types';

export function getCanvasTypeMenuItems(
  types: readonly Pick<AnyBuiltinCanvasType, 'icon' | 'id' | 'titleKey'>[],
  labelForKey: (key: string) => string
): CreatableMenuItem[] {
  return types
    .filter(
      (type) =>
        isCanvasTypeId(type.id) && !HIDDEN_CREATE_CANVAS_TYPE_IDS.has(type.id)
    )
    .map((type) => ({
      enabled: true,
      icon: type.icon,
      id: canvasTypeMenuActionId(type.id),
      label: labelForKey(type.titleKey),
    }));
}
