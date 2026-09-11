import { definePlugin } from '@ghostboard/sdk';
import { createElement } from 'react';
import { DATA_VERSION, migrateState } from './version.js';

function isScoreState(state) {
  return Boolean(
    state &&
      typeof state === 'object' &&
      !Array.isArray(state) &&
      typeof state.count === 'number' &&
      typeof state.label === 'string' &&
      (DATA_VERSION === 1 || state.unit === 'points')
  );
}

function summarize(state) {
  return {
    title: `${state.label}: ${state.count}`,
    subtitle: DATA_VERSION === 1 ? 'Interactive score' : 'Migrated score',
    plainText: `${state.label} count ${state.count}${state.unit ? ` ${state.unit}` : ''}`,
    accessibilityLabel: `${state.label}, ${state.count}`,
    accentColor: '#7c3aed',
  };
}

function ScoreCard({ context, state, updateState }) {
  return createElement(
    'section',
    {
      'data-t2-canvas-card': DATA_VERSION,
      style: {
        alignItems: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        height: '100%',
        justifyContent: 'center',
        padding: '20px',
      },
    },
    createElement('strong', null, state.label),
    createElement('output', { 'data-t2-canvas-count': true }, state.count),
    state.unit
      ? createElement('small', { 'data-t2-canvas-unit': true }, state.unit)
      : null,
    createElement(
      'button',
      {
        'data-t2-canvas-increment': true,
        disabled: context.readOnly,
        onClick: () => {
          updateState({ ...state, count: state.count + 1 }).catch(() => {});
        },
        type: 'button',
      },
      'Add point'
    )
  );
}

export default definePlugin({
  setup(app) {
    globalThis.__trustedPluginCanvas = { app };
    app.canvas.registerType({
      id: 'score-card',
      title: 'Score card',
      description: 'Interactive custom canvas acceptance card',
      dataVersion: DATA_VERSION,
      createInitialState: () => ({
        label: 'Release score',
        count: 0,
        ...(DATA_VERSION === 2 ? { unit: 'points' } : {}),
      }),
      validateState: isScoreState,
      summarize,
      migrateState: (state, fromVersion) => {
        if (fromVersion !== 1 || DATA_VERSION !== 2) {
          throw new Error(
            `Unsupported score migration ${fromVersion} -> ${DATA_VERSION}`
          );
        }
        return migrateState(state);
      },
      component: ScoreCard,
      surface: {
        defaultSize: { width: 280, height: 220 },
        minSize: { width: 200, height: 160 },
        openBehavior: 'detail',
        resizable: true,
      },
    });
  },
});
