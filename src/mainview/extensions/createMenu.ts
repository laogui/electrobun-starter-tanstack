import type { CreatableMenuItem } from '@/lib/creatableNodes';

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
    .filter((type) => isCanvasTypeId(type.id))
    .map((type) => ({
      enabled: true,
      icon: type.icon,
      id: canvasTypeMenuActionId(type.id),
      label: labelForKey(type.titleKey),
    }));
}
