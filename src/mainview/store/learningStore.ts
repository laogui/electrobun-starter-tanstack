import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const ONBOARDING_VERSION = 1;

interface LearningPreferences {
  dailyTipsEnabled: boolean;
  lastTipDate: string | null;
  lastTipIndex: number;
  onboardingVersion: number;
}

interface LearningState extends LearningPreferences {
  claimDailyTip: (date: string, tipCount: number) => number | null;
  completeOnboarding: (date: string) => void;
  setDailyTipsEnabled: (enabled: boolean) => void;
  tipForDate: (date: string, tipCount: number) => number;
}

const DEFAULT_PREFERENCES: LearningPreferences = {
  dailyTipsEnabled: true,
  lastTipDate: null,
  lastTipIndex: -1,
  onboardingVersion: 0,
};

/** Calendar dates follow the user's device timezone, including DST changes. */
export function localDateKey(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function normalizePreferences(value: unknown): LearningPreferences {
  const stored =
    value && typeof value === 'object'
      ? (value as Partial<LearningPreferences>)
      : {};
  return {
    dailyTipsEnabled:
      typeof stored.dailyTipsEnabled === 'boolean'
        ? stored.dailyTipsEnabled
        : DEFAULT_PREFERENCES.dailyTipsEnabled,
    lastTipDate:
      typeof stored.lastTipDate === 'string' ? stored.lastTipDate : null,
    lastTipIndex:
      Number.isInteger(stored.lastTipIndex) &&
      typeof stored.lastTipIndex === 'number' &&
      stored.lastTipIndex >= -1
        ? stored.lastTipIndex
        : -1,
    onboardingVersion:
      Number.isInteger(stored.onboardingVersion) &&
      typeof stored.onboardingVersion === 'number' &&
      stored.onboardingVersion >= 0
        ? stored.onboardingVersion
        : 0,
  };
}

/** Learning preferences belong to this app installation, across workspaces. */
export const useLearningStore = create<LearningState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_PREFERENCES,
      completeOnboarding: (date) => {
        // The guide is enough for today; begin daily tips on the next day.
        set({ onboardingVersion: ONBOARDING_VERSION, lastTipDate: date });
      },
      setDailyTipsEnabled: (dailyTipsEnabled) => set({ dailyTipsEnabled }),
      tipForDate: (date, tipCount) => {
        const { lastTipDate, lastTipIndex } = get();
        const index =
          lastTipDate === date && lastTipIndex >= 0
            ? lastTipIndex % tipCount
            : (lastTipIndex + 1) % tipCount;
        set({ lastTipDate: date, lastTipIndex: index });
        return index;
      },
      claimDailyTip: (date, tipCount) => {
        const state = get();
        if (
          !state.dailyTipsEnabled ||
          state.onboardingVersion < ONBOARDING_VERSION ||
          state.lastTipDate === date
        ) {
          return null;
        }
        return state.tipForDate(date, tipCount);
      },
    }),
    {
      name: 'ghostboard-learning',
      version: 1,
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          try {
            return localStorage.getItem(name);
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, value);
          } catch {
            // Keep in-session learning usable when storage is unavailable.
          }
        },
        removeItem: (name) => {
          try {
            localStorage.removeItem(name);
          } catch {
            // Match the same in-session fallback as reads and writes.
          }
        },
      })),
      partialize: ({
        dailyTipsEnabled,
        lastTipDate,
        lastTipIndex,
        onboardingVersion,
      }) => ({
        dailyTipsEnabled,
        lastTipDate,
        lastTipIndex,
        onboardingVersion,
      }),
      merge: (stored, current) => ({
        ...current,
        ...normalizePreferences(stored),
      }),
    }
  )
);
