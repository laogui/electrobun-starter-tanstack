import type { RenderResult } from '@testing-library/react';
import type { PanelDefinition, PluginContext } from '../index.js';

export declare function renderPanel(
  definition: Extract<PanelDefinition, { component: unknown }>,
  options: { context: PluginContext }
): RenderResult;
