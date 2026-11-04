import {
  POMODORO_CANVAS_TYPE_ID,
  RECORDING_CANVAS_TYPE_ID,
  REMINDER_CANVAS_TYPE_ID,
} from '../../shared/extensions/builtinIds';

/**
 * Product scope switches for the slim release (docs/PRD-slim.md).
 *
 * These only hide entry points. Every canvas type stays registered, so
 * existing workspaces keep rendering, searching, opening and exporting
 * Checklist / Pomodoro / Reminder / Recording content. Flip a switch back to
 * restore the entry point; no data migration is involved.
 */

/**
 * Canvas types that can no longer be created from the + menu or right-click.
 * Checklist stays for now: Quick Start and Reading Notes seed it. Folding it
 * into BlockNote task lists is a later step (PRD-slim §4).
 */
export const HIDDEN_CREATE_CANVAS_TYPE_IDS: ReadonlySet<string> = new Set([
  POMODORO_CANVAS_TYPE_ID,
  REMINDER_CANVAS_TYPE_ID,
  RECORDING_CANVAS_TYPE_ID,
]);

/** Settings → Plugins (install, develop, manage). Runtime code is frozen, not removed. */
export const SHOW_PLUGINS_SETTINGS = false;

/** Settings → Canvas types (per-type enable toggles). */
export const SHOW_CANVAS_TYPES_SETTINGS = false;

/** Free-tier node cap and license UI. Off: everything is free. */
export const LICENSE_QUOTA_ENABLED = false;
