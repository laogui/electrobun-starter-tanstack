import { useBlockNoteEditor, useExtensionState } from '@blocknote/react';
import { AIExtension, AIMenu } from '@blocknote/xl-ai';
import { useAppSettingsStore } from '@/store/appSettingsStore';
import { readAIErrorCode } from '../../../shared/ai/providerConfig';
import { getLocaleStrings } from '../settings/i18n/getLocaleStrings';
import { abortAIEditorRequest } from './aiEditorSession';

export function EditorAIMenu() {
  const editor = useBlockNoteEditor();
  const state = useExtensionState(AIExtension, {
    selector: (value) => value.aiMenuState,
  });
  const locale = useAppSettingsStore((s) => s.locale);
  const strings = getLocaleStrings(locale);
  const busy =
    state !== 'closed' &&
    (state.status === 'thinking' || state.status === 'ai-writing');
  return (
    <div className="rounded-lg bg-white shadow-lg dark:bg-neutral-900">
      <AIMenu />
      {busy ? (
        <button
          className="m-2 rounded-md border px-3 py-1 text-sm"
          onClick={() => {
            abortAIEditorRequest(editor).catch(() => undefined);
          }}
          type="button"
        >
          {strings.aiStop}
        </button>
      ) : null}
      {state !== 'closed' && state.status === 'error' ? (
        <p className="px-3 py-2 text-red-600 text-sm" role="alert">
          {strings.aiError(readAIErrorCode(state.error))}
        </p>
      ) : null}
      <p className="px-3 pb-2 text-neutral-500 text-xs">
        {strings.aiReviewHint}
      </p>
    </div>
  );
}
