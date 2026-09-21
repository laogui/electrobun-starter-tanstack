import type { ReactFlowInstance } from '@xyflow/react';
import { memo, type RefObject } from 'react';
import { LibraryPopup } from '@/components/library/LibraryPopup';
import { SearchDialog } from '@/components/search/SearchDialog';
import { TagSidebar } from '@/components/tags/TagSidebar';
import { AISummaryPanel } from './AISummaryPanel';
import { CanvasToolbar } from './CanvasToolbar';
import { FolderEditDialog } from './FolderEditDialog';

/** These panels subscribe to their own state; canvas positions are not props. */
export const CanvasPanels = memo(function CanvasPanels({
  rfInstance,
}: {
  rfInstance: RefObject<ReactFlowInstance<any, any> | null>;
}) {
  return (
    <>
      <FolderEditDialog />
      <CanvasToolbar />
      <LibraryPopup rfInstance={rfInstance} />
      <AISummaryPanel rfInstance={rfInstance} />
      <TagSidebar />
      <SearchDialog rfInstance={rfInstance} />
    </>
  );
});
