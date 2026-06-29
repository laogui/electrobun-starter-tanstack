import { Dialog } from '@base-ui/react/dialog';
import { FolderPen } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../paraglide/messages.js';

/**
 * Dialog for editing a folder's name and description (subtitle).
 *
 * Replaces the previous inline contentEditable flow, which was hard to use at
 * small zoom levels and conflicted with the folder's click-to-open behavior.
 */
export function FolderEditDialog() {
  const editingFolderId = useCanvasStore((s) => s.editingFolderId);
  const setEditingFolderId = useCanvasStore((s) => s.setEditingFolderId);
  const commitNodeData = useCanvasStore((s) => s.commitNodeData);
  const folder = useCanvasStore((s) =>
    editingFolderId
      ? (s.nodes.find((n) => n.id === editingFolderId) ?? null)
      : null
  );

  const nameId = useId();
  const descriptionId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const open = Boolean(editingFolderId && folder);

  // Sync local form state whenever a new folder is opened for editing.
  useEffect(() => {
    if (!(editingFolderId && folder)) {
      return;
    }
    const data = folder.data as { title?: string; subtitle?: string };
    setName(typeof data.title === 'string' ? data.title : '');
    setDescription(typeof data.subtitle === 'string' ? data.subtitle : '');
  }, [editingFolderId, folder]);

  const close = () => {
    setEditingFolderId(null);
  };

  const handleSave = () => {
    if (!editingFolderId) {
      return;
    }
    const data = folder?.data as
      | { title?: string; subtitle?: string }
      | undefined;
    const nextTitle = name.trim() || data?.title || '';
    const nextSubtitle = description.trim();
    if (nextTitle !== data?.title || nextSubtitle !== (data?.subtitle ?? '')) {
      commitNodeData(editingFolderId, {
        title: nextTitle,
        subtitle: nextSubtitle,
      });
    }
    close();
  };

  return (
    <Dialog.Root
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          close();
        }
      }}
      open={open}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[60] bg-black/35 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          className="fixed top-1/2 left-1/2 z-[60] w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-2xl outline-hidden transition-[transform,opacity] duration-150 data-ending-style:scale-95 data-starting-style:scale-95 data-ending-style:opacity-0 data-starting-style:opacity-0 dark:bg-neutral-900"
          initialFocus={nameRef}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSave();
            }
          }}
        >
          <div className="mb-4 flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
              <FolderPen size={17} />
            </div>
            <div className="min-w-0">
              <Dialog.Title className="font-semibold text-gray-900 text-sm dark:text-gray-100">
                {m.folder_edit_title()}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-[13px] text-gray-500 leading-5 dark:text-gray-400">
                {m.folder_edit_description()}
              </Dialog.Description>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label
                className="block font-medium text-[13px] text-gray-700 dark:text-gray-300"
                htmlFor={nameId}
              >
                {m.folder_edit_name_label()}
              </label>
              <input
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px] text-gray-900 outline-hidden placeholder:text-gray-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30 dark:border-neutral-700 dark:bg-neutral-800 dark:text-gray-100"
                id={nameId}
                onChange={(e) => {
                  setName(e.target.value);
                }}
                placeholder={m.folder_edit_name_placeholder()}
                ref={nameRef}
                type="text"
                value={name}
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="block font-medium text-[13px] text-gray-700 dark:text-gray-300"
                htmlFor={descriptionId}
              >
                {m.folder_edit_description_label()}
              </label>
              <textarea
                className="min-h-[80px] w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px] text-gray-900 outline-hidden placeholder:text-gray-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30 dark:border-neutral-700 dark:bg-neutral-800 dark:text-gray-100"
                id={descriptionId}
                onChange={(e) => {
                  setDescription(e.target.value);
                }}
                placeholder={m.folder_edit_description_placeholder()}
                value={description}
              />
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              className="h-8 rounded-md px-3 font-medium text-[13px] text-gray-600 transition-colors hover:bg-black/5 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
              onClick={close}
              type="button"
            >
              {m.folder_edit_cancel()}
            </button>
            <button
              className="h-8 rounded-md bg-emerald-600 px-3 font-medium text-[13px] text-white transition-colors hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-emerald-500 focus-visible:outline-offset-2 dark:bg-emerald-500 dark:hover:bg-emerald-400"
              onClick={handleSave}
              type="button"
            >
              {m.folder_edit_save()}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
