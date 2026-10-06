import { Dialog } from '@base-ui/react/dialog';
import { Popover } from '@base-ui/react/popover';
import {
  ArrowRight,
  BookOpen,
  CircleHelp,
  FilePlus,
  Keyboard,
  Lightbulb,
  Move,
  Search,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { getLocaleStrings } from '@/components/settings/i18n/getLocaleStrings';
import { ShortcutsPanel } from '@/components/settings/panels/ShortcutsPanel';
import { useLocalDate } from '@/hooks/useLocalDate';
import {
  getDailyTips,
  getOnboardingSteps,
  type LearningStep,
  MOD_KEY,
} from '@/lib/learningContent';
import { cn } from '@/lib/utils';
import type { LocaleSetting } from '@/settingsClient';
import { useAppSettingsStore } from '@/store/appSettingsStore';
import { useCanvasStore } from '@/store/canvasStore';
import {
  localDateKey,
  ONBOARDING_VERSION,
  useLearningStore,
} from '@/store/learningStore';

import * as m from '../../../paraglide/messages.js';

const FOCUS_RING =
  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900';
const SECONDARY_BUTTON = `inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-neutral-600 text-sm transition-colors hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10 ${FOCUS_RING}`;
const PRIMARY_BUTTON = `inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-accent px-4 font-medium text-accent-foreground text-sm transition-colors hover:bg-accent/90 ${FOCUS_RING}`;

function canShowLearningNudge(): boolean {
  return !(
    document.hidden ||
    !document.hasFocus() ||
    document.querySelector(
      '[role="dialog"], [role="alertdialog"], [role="menu"]'
    ) ||
    document.activeElement?.closest(
      'input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"], [data-canvas-learning]'
    )
  );
}

function restoreCanvasFocus(): false {
  // Base UI otherwise chooses the canvas's first tabbable child (a node
  // button). Focus the application itself once the modal has unmounted.
  queueMicrotask(() => {
    document
      .querySelector<HTMLElement>('[role="application"][tabindex="-1"]')
      ?.focus({ preventScroll: true });
  });
  return false;
}

/** Lives outside the canvas node subscription, so dragging doesn't rerender it. */
export function CanvasHelp() {
  const locale = useAppSettingsStore((s) => s.locale);
  const settingsLoaded = useAppSettingsStore((s) => s.settingsLoaded);
  const canvasIdle = useCanvasStore(
    (s) =>
      s._hydrated &&
      !(
        s.searchOpen ||
        s.settingsOpen ||
        s.createMenuOpen ||
        s.libraryOpen ||
        s.focusedNode ||
        s.focusedFolder ||
        s.editingStickyId ||
        s.editingTopicId ||
        s.editingFolderId ||
        s.topicDraft
      )
  );
  const onboardingVersion = useLearningStore((s) => s.onboardingVersion);
  const dailyTipsEnabled = useLearningStore((s) => s.dailyTipsEnabled);
  const lastTipDate = useLearningStore((s) => s.lastTipDate);
  const lastTipIndex = useLearningStore((s) => s.lastTipIndex);
  const [panel, setPanel] = useState<'help' | 'tip' | null>(null);
  const [guideStep, setGuideStep] = useState<number | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const automaticTipRef = useRef(false);
  const date = useLocalDate();
  const tips = getDailyTips(locale);
  const options = { locale };

  useEffect(() => {
    if (
      !(settingsLoaded && canvasIdle) ||
      panel ||
      guideStep !== null ||
      shortcutsOpen ||
      (onboardingVersion >= ONBOARDING_VERSION &&
        (!dailyTipsEnabled || lastTipDate === date))
    ) {
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    let pointerActive = false;
    const offer = () => {
      clearTimeout(timer);
      if (pointerActive) {
        return;
      }
      timer = setTimeout(() => {
        if (pointerActive || !canShowLearningNudge()) {
          return;
        }
        const learning = useLearningStore.getState();
        if (learning.onboardingVersion < ONBOARDING_VERSION) {
          setGuideStep(0);
        } else if (
          learning.claimDailyTip(localDateKey(), tips.length) !== null
        ) {
          automaticTipRef.current = true;
          setPanel('tip');
        }
      }, 800);
    };
    const cancelOffer = () => {
      pointerActive = true;
      clearTimeout(timer);
    };
    const endPointer = () => {
      pointerActive = false;
      offer();
    };
    const handleBlur = () => {
      pointerActive = false;
      clearTimeout(timer);
    };
    offer();
    globalThis.addEventListener('focus', offer);
    globalThis.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', offer);
    document.addEventListener('focusin', offer);
    document.addEventListener('pointerdown', cancelOffer);
    document.addEventListener('pointerup', endPointer);
    document.addEventListener('pointercancel', endPointer);
    return () => {
      clearTimeout(timer);
      globalThis.removeEventListener('focus', offer);
      globalThis.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', offer);
      document.removeEventListener('focusin', offer);
      document.removeEventListener('pointerdown', cancelOffer);
      document.removeEventListener('pointerup', endPointer);
      document.removeEventListener('pointercancel', endPointer);
    };
  }, [
    settingsLoaded,
    canvasIdle,
    panel,
    guideStep,
    shortcutsOpen,
    onboardingVersion,
    dailyTipsEnabled,
    lastTipDate,
    date,
    tips.length,
  ]);

  // A search/settings opened by an app menu should clear the non-modal nudge.
  useEffect(() => {
    if (!canvasIdle) {
      setPanel(null);
    }
  }, [canvasIdle]);

  const tip = tips[Math.max(0, lastTipIndex) % tips.length]!;
  const finishGuide = () => {
    useLearningStore.getState().completeOnboarding(localDateKey());
    setGuideStep(null);
  };

  return (
    <>
      <Popover.Root
        onOpenChange={(open) => {
          if (open) {
            automaticTipRef.current = false;
            useLearningStore.getState().tipForDate(localDateKey(), tips.length);
            setPanel('help');
          } else {
            setPanel(null);
          }
        }}
        open={panel !== null}
      >
        <Popover.Trigger
          aria-label={m.learning_help({}, options)}
          className={`relative flex size-8 items-center justify-center rounded-full text-neutral-600 transition-colors hover:bg-black/5 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white ${FOCUS_RING}`}
          data-canvas-learning
          onPaste={(event) => event.stopPropagation()}
          ref={triggerRef}
          title={m.learning_help({}, options)}
        >
          <CircleHelp aria-hidden size={15} strokeWidth={1.8} />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner
            align="end"
            className="z-50"
            side="right"
            sideOffset={10}
          >
            <Popover.Popup
              className="max-h-[calc(100vh-80px)] w-[min(340px,calc(100vw-80px))] overflow-y-auto rounded-2xl border border-black/8 bg-white/95 p-4 text-neutral-900 shadow-xl outline-hidden backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/95 dark:text-neutral-100"
              data-canvas-learning
              finalFocus={() =>
                automaticTipRef.current || guideStep !== null || shortcutsOpen
                  ? false
                  : triggerRef.current
              }
              initialFocus={panel === 'tip' ? false : undefined}
              onKeyDown={(event) => event.stopPropagation()}
              onPaste={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-center gap-2">
                <Lightbulb
                  aria-hidden
                  className="text-accent-strong"
                  size={17}
                />
                <Popover.Title className="flex-1 font-semibold text-sm">
                  {panel === 'tip'
                    ? m.learning_daily_tip({}, options)
                    : m.learning_help({}, options)}
                </Popover.Title>
                <Popover.Close
                  aria-label={m.learning_close({}, options)}
                  className={`flex size-7 items-center justify-center rounded-full text-neutral-400 hover:bg-black/5 dark:hover:bg-white/10 ${FOCUS_RING}`}
                >
                  <X aria-hidden size={14} />
                </Popover.Close>
              </div>
              {panel === 'help' ? (
                <p className="mb-1 text-neutral-500 text-xs dark:text-neutral-400">
                  {m.learning_daily_tip({}, options)}
                </p>
              ) : null}
              <h3 className="font-medium text-[15px]">{tip.title}</h3>
              <Popover.Description className="mt-2 text-neutral-500 text-sm leading-6 dark:text-neutral-400">
                {tip.description}
              </Popover.Description>
              {tip.keys.length > 0 ? (
                <div className="mt-3">
                  <ShortcutKeys keys={tip.keys} />
                </div>
              ) : null}
              <div className="mt-4 space-y-1 border-black/5 border-t pt-3 dark:border-white/10">
                <button
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10 ${FOCUS_RING}`}
                  onClick={() => {
                    setPanel(null);
                    setGuideStep(0);
                  }}
                  type="button"
                >
                  <BookOpen aria-hidden size={16} />
                  <span className="flex-1">
                    {m.learning_restart_guide({}, options)}
                  </span>
                  <ArrowRight
                    aria-hidden
                    className="text-neutral-400"
                    size={14}
                  />
                </button>
                <button
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10 ${FOCUS_RING}`}
                  onClick={() => {
                    setPanel(null);
                    setShortcutsOpen(true);
                  }}
                  type="button"
                >
                  <Keyboard aria-hidden size={16} />
                  <span className="flex-1">
                    {m.learning_all_shortcuts({}, options)}
                  </span>
                  <ArrowRight
                    aria-hidden
                    className="text-neutral-400"
                    size={14}
                  />
                </button>
              </div>
              <div className="mt-3 border-black/5 border-t pt-3 dark:border-white/10">
                <DailyTipsToggle locale={locale} />
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>

      <OnboardingDialog
        locale={locale}
        onFinish={finishGuide}
        onStepChange={setGuideStep}
        stepIndex={guideStep}
      />

      <Dialog.Root onOpenChange={setShortcutsOpen} open={shortcutsOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-[60] bg-black/35 backdrop-blur-[2px]" />
          <Dialog.Popup
            className="fixed top-1/2 left-1/2 z-[60] max-h-[calc(100vh-64px)] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-neutral-50 p-6 shadow-2xl outline-hidden dark:bg-neutral-950"
            data-canvas-learning
            finalFocus={restoreCanvasFocus}
            onKeyDown={(event) => event.stopPropagation()}
            onPaste={(event) => event.stopPropagation()}
          >
            <Dialog.Title className="sr-only">
              {m.learning_all_shortcuts({}, options)}
            </Dialog.Title>
            <Dialog.Description className="sr-only">
              {m.settings_shortcut_description({}, options)}
            </Dialog.Description>
            <Dialog.Close
              aria-label={m.learning_close({}, options)}
              className={`absolute top-4 right-4 flex size-8 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10 ${FOCUS_RING}`}
            >
              <X aria-hidden size={16} />
            </Dialog.Close>
            <ShortcutsPanel strings={getLocaleStrings(locale)} />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function DailyTipsToggle({ locale }: { locale: LocaleSetting }) {
  const enabled = useLearningStore((s) => s.dailyTipsEnabled);
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-neutral-500 text-xs leading-5 dark:text-neutral-400">
      <input
        checked={enabled}
        className={`mt-0.5 size-3.5 shrink-0 accent-accent ${FOCUS_RING}`}
        onChange={(event) =>
          useLearningStore.getState().setDailyTipsEnabled(event.target.checked)
        }
        type="checkbox"
      />
      <span>{m.learning_daily_enabled({}, { locale })}</span>
    </label>
  );
}

function ShortcutKeys({ keys }: { keys: string[] }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {keys.map((key, index) => (
        <span className="inline-flex items-center gap-1.5" key={key}>
          {index > 0 ? (
            <span aria-hidden className="text-neutral-400 text-xs">
              +
            </span>
          ) : null}
          <kbd className="inline-flex min-h-7 min-w-7 items-center justify-center rounded-md border border-neutral-200 border-b-2 bg-neutral-50 px-2 font-medium text-neutral-700 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
            {key}
          </kbd>
        </span>
      ))}
    </span>
  );
}

function OnboardingDialog({
  locale,
  onFinish,
  onStepChange,
  stepIndex,
}: {
  locale: LocaleSetting;
  onFinish: () => void;
  onStepChange: (step: number) => void;
  stepIndex: number | null;
}) {
  const nextRef = useRef<HTMLButtonElement>(null);
  const steps = getOnboardingSteps(locale);
  const index = stepIndex ?? 0;
  const step = steps[index]!;
  const lastStep = index === steps.length - 1;
  const options = { locale };

  return (
    <Dialog.Root
      onOpenChange={(open) => {
        if (!open) {
          onFinish();
        }
      }}
      open={stepIndex !== null}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[60] bg-black/35 backdrop-blur-[2px]" />
        <Dialog.Popup
          className="fixed top-1/2 left-1/2 z-[60] max-h-[calc(100vh-64px)] w-[min(540px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 text-neutral-900 shadow-2xl outline-hidden dark:bg-neutral-900 dark:text-neutral-100"
          data-canvas-learning
          finalFocus={restoreCanvasFocus}
          initialFocus={nextRef}
          onKeyDown={(event) => event.stopPropagation()}
          onPaste={(event) => event.stopPropagation()}
        >
          <div className="mb-5 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 font-medium text-accent-strong text-xs">
              <BookOpen aria-hidden size={15} />
              {m.learning_guide({}, options)}
            </span>
            <Dialog.Close
              aria-label={m.learning_skip({}, options)}
              className={`flex size-7 items-center justify-center rounded-full text-neutral-400 hover:bg-black/5 dark:hover:bg-white/10 ${FOCUS_RING}`}
            >
              <X aria-hidden size={16} />
            </Dialog.Close>
          </div>

          <LearningIllustration locale={locale} step={step.id} />

          <div aria-live="polite" className="mt-5">
            <p className="mb-2 text-neutral-400 text-xs tabular-nums">
              {m.learning_step(
                { current: index + 1, total: steps.length },
                options
              )}
            </p>
            <Dialog.Title className="font-semibold text-2xl tracking-tight">
              {step.title}
            </Dialog.Title>
            <Dialog.Description className="mt-2 min-h-12 text-neutral-500 text-sm leading-6 dark:text-neutral-400">
              {step.description}
            </Dialog.Description>
          </div>

          <div className="mt-4 divide-y divide-black/5 rounded-xl border border-black/8 px-4 dark:divide-white/10 dark:border-white/10">
            {step.shortcuts.map((shortcut) => (
              <div
                className="flex min-h-12 flex-wrap items-center justify-between gap-2 py-2"
                key={shortcut.label}
              >
                <span className="text-neutral-600 text-sm dark:text-neutral-300">
                  {shortcut.label}
                </span>
                <ShortcutKeys keys={shortcut.keys} />
              </div>
            ))}
          </div>

          <div className="mt-4 min-h-10">
            {lastStep ? (
              <DailyTipsToggle locale={locale} />
            ) : (
              <p className="text-neutral-400 text-xs leading-5">
                {m.learning_shortcuts_hint({}, options)}
              </p>
            )}
            {lastStep ? (
              <p className="mt-2 text-neutral-400 text-xs leading-5">
                {m.learning_return_hint({}, options)}
              </p>
            ) : null}
          </div>

          <div className="mt-5 flex items-center gap-2">
            <button
              className={`${SECONDARY_BUTTON} mr-auto`}
              onClick={onFinish}
              type="button"
            >
              {m.learning_skip({}, options)}
            </button>
            {index > 0 ? (
              <button
                className={SECONDARY_BUTTON}
                onClick={() => onStepChange(index - 1)}
                type="button"
              >
                {m.learning_back({}, options)}
              </button>
            ) : null}
            <button
              className={PRIMARY_BUTTON}
              onClick={() => {
                if (lastStep) {
                  onFinish();
                } else {
                  onStepChange(index + 1);
                }
              }}
              ref={nextRef}
              type="button"
            >
              {lastStep
                ? m.learning_finish({}, options)
                : m.learning_next({}, options)}
              <ArrowRight aria-hidden size={15} />
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function LearningIllustration({
  locale,
  step,
}: {
  locale: LocaleSetting;
  step: LearningStep['id'];
}) {
  const options = { locale };
  return (
    <div
      aria-hidden
      className="relative flex h-32 items-center justify-center overflow-hidden rounded-xl border border-black/5 bg-neutral-50 dark:border-white/5 dark:bg-neutral-950"
      style={{
        backgroundImage:
          'radial-gradient(circle, #a3a3a32e 1px, transparent 1px)',
        backgroundSize: '16px 16px',
      }}
    >
      {step === 'find' ? (
        <div className="mx-6 flex w-full items-center gap-3 rounded-lg border border-black/8 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-neutral-800">
          <Search className="text-neutral-400" size={18} />
          <span className="flex-1 text-neutral-400 text-sm">
            {m.titlebar_search_placeholder({}, options)}
          </span>
          <ShortcutKeys keys={[MOD_KEY, 'K']} />
        </div>
      ) : (
        <>
          <div
            className={cn(
              'absolute top-5 left-8 w-28 rounded-lg border border-black/8 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-neutral-800',
              step === 'organize' && 'left-12'
            )}
          >
            <p className="text-neutral-600 text-xs dark:text-neutral-300">
              {m.learning_sample_note({}, options)}
            </p>
            <div className="mt-2 h-1.5 w-16 rounded bg-neutral-100 dark:bg-neutral-700" />
            <div className="mt-1.5 h-1.5 w-12 rounded bg-neutral-100 dark:bg-neutral-700" />
          </div>
          <div className="absolute right-8 bottom-5 w-28 rounded-lg border border-black/8 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-neutral-800">
            <p className="text-neutral-600 text-xs dark:text-neutral-300">
              {m.learning_sample_reference({}, options)}
            </p>
            <div className="mt-2 h-1.5 w-16 rounded bg-neutral-100 dark:bg-neutral-700" />
          </div>
          {step === 'organize' ? (
            <div className="absolute inset-x-6 inset-y-3 rounded-xl border-2 border-accent/60 border-dashed" />
          ) : null}
          <div className="relative flex items-center gap-2 rounded-lg border border-accent-soft bg-accent-softer px-3 py-2 text-accent-strong shadow-sm">
            {step === 'move' ? <Move size={22} /> : null}
            {step === 'create' ? <FilePlus size={22} /> : null}
            <span className="font-medium text-sm">
              {step === 'move'
                ? 'Space'
                : `${MOD_KEY} + ${step === 'create' ? 'N' : 'G'}`}
            </span>
            {step === 'move' ? (
              <span className="text-xs">+ {m.learning_drag({}, options)}</span>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
