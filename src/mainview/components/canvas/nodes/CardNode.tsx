import {
  Handle,
  NodeResizeControl,
  Position,
  useViewport,
} from '@xyflow/react';
import { Check } from 'lucide-react';
import { memo, useCallback, useRef, useState } from 'react';

import { NotePreview } from '@/components/preview/NotePreview';
import { colorToStyle, isColorDark } from '@/lib/colorUtils';
import { editableElementToText } from '@/lib/editableText';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

const handleClassName = 'conn-handle nodrag';

export const CardContent = ({ data, isFocused, onChange }: any) => {
  const [newItem, setNewItem] = useState('');

  if (data.type === 'image') {
    return (
      <div
        className={cn(
          'flex h-full flex-col',
          isColorDark(data.color) && 'text-white'
        )}
        style={colorToStyle(data.color)}
      >
        <div className="p-6">
          <h2
            className={cn(
              'whitespace-pre-wrap font-bold',
              isFocused ? 'text-4xl' : 'text-xl'
            )}
          >
            {data.title}
          </h2>
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="relative aspect-square w-full max-w-[300px] overflow-hidden rounded-full">
            {/* Mock Pie Chart */}
            <div
              className="absolute inset-0 bg-[#555]"
              style={{
                clipPath:
                  'polygon(50% 50%, 100% 0, 100% 100%, 0 100%, 0 0, 50% 0)',
              }}
            />
            <div
              className="absolute inset-0 bg-[#888]"
              style={{ clipPath: 'polygon(50% 50%, 0 0, 0 50%)' }}
            />
            <div
              className="absolute inset-0 bg-[#BBB]"
              style={{ clipPath: 'polygon(50% 50%, 0 50%, 0 100%)' }}
            />
            <div
              className="absolute inset-0 bg-[#EEE]"
              style={{ clipPath: 'polygon(50% 50%, 50% 0, 100% 0)' }}
            />
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 p-6">
          {data.pieData?.map((item: any, i: number) => (
            <div className="flex items-center gap-2" key={i}>
              <span className="font-medium text-sm">{item.label}</span>
              <div
                className="size-3 rounded-full"
                style={{ backgroundColor: item.color }}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (data.type === 'checklist') {
    return (
      <div
        className={cn(
          'flex h-full flex-col p-6',
          isColorDark(data.color) && 'text-white'
        )}
        style={colorToStyle(data.color)}
      >
        <div className="mb-4 flex items-center gap-2">
          {data.tag ? (
            <span
              className="rounded-md px-2 py-1 font-semibold text-xs"
              style={colorToStyle(data.tagColor)}
            >
              {data.tag}
            </span>
          ) : null}
        </div>
        {data.title ? (
          <h2
            className={cn('mb-4 font-bold', isFocused ? 'text-3xl' : 'text-xl')}
          >
            {data.title}
          </h2>
        ) : null}
        <div className="flex-1 space-y-1 overflow-hidden">
          {data.items?.map((item: any, i: number) =>
            item.isHeader ? (
              <div className="mt-4 mb-2 font-semibold text-gray-800" key={i}>
                {item.text}
              </div>
            ) : (
              <div
                className="group flex cursor-pointer items-start gap-3 py-1"
                key={i}
                onClick={() => {
                  if (onChange) {
                    const newItems = data.items.map(
                      (item: any, index: number) =>
                        index === i ? { ...item, checked: !item.checked } : item
                    );
                    onChange({ ...data, items: newItems });
                  }
                }}
              >
                <div
                  className={cn(
                    'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border transition-colors',
                    item.checked
                      ? 'border-black bg-black'
                      : 'border-gray-400 group-hover:border-black'
                  )}
                >
                  {item.checked ? (
                    <Check className="text-white" size={12} />
                  ) : null}
                </div>
                <span
                  className={cn(
                    'text-sm/tight transition-colors',
                    item.checked
                      ? 'text-gray-400 line-through'
                      : 'text-gray-800'
                  )}
                >
                  {item.text}
                </span>
              </div>
            )
          )}
          {/* Add new item input */}
          <div className="mt-2 flex items-center gap-3 opacity-50 transition-opacity focus-within:opacity-100">
            <div className="size-4 shrink-0 rounded-sm border border-gray-400" />
            <input
              className="w-full border-none bg-transparent text-sm placeholder-gray-500 outline-none"
              onChange={(e) => {
                setNewItem(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newItem.trim() && onChange) {
                  onChange({
                    ...data,
                    items: [
                      ...(data.items || []),
                      { text: newItem.trim(), checked: false },
                    ],
                  });
                  setNewItem('');
                }
              }}
              placeholder="Add item..."
              type="text"
              value={newItem}
            />
          </div>
        </div>
      </div>
    );
  }

  // Default text card — editable only in focused (expanded) view
  if (!isFocused) {
    return (
      <div
        className={cn(
          'flex h-full flex-col p-6',
          isColorDark(data.color) && 'text-white'
        )}
        style={colorToStyle(data.color)}
      >
        <h2
          className={cn('mb-4 font-bold text-xl', !data.title && 'opacity-40')}
        >
          {data.title || 'Untitled'}
        </h2>
        <NotePreview
          className={cn(isColorDark(data.color) && 'prose-invert text-white')}
          excerpt={data.previewExcerpt}
          fallback={data.content}
          html={data.previewHtml}
        />
      </div>
    );
  }

  return <EditableCardContent data={data} onChange={onChange} />;
};

const EditableCardContent = ({ data, onChange }: any) => {
  const titleRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleTitleBlur = useCallback(() => {
    const text = titleRef.current?.textContent ?? '';
    if (text !== data.title && onChange) {
      onChange({ title: text });
    }
  }, [data.title, onChange]);

  const handleContentBlur = useCallback(() => {
    const text = contentRef.current
      ? editableElementToText(contentRef.current)
      : '';
    if (text !== data.content && onChange) {
      onChange({
        content: text,
        previewBlocks: undefined,
        previewExcerpt: undefined,
        previewHtml: undefined,
        previewVersion: undefined,
      });
    }
  }, [data.content, onChange]);

  return (
    <div
      className={cn(
        'flex h-full flex-col p-6',
        isColorDark(data.color) && 'text-white'
      )}
      style={colorToStyle(data.color)}
    >
      <div
        className="mb-4 cursor-text font-bold text-4xl outline-none empty:before:opacity-40 empty:before:content-[attr(data-placeholder)]"
        contentEditable
        data-placeholder="Untitled"
        onBlur={handleTitleBlur}
        ref={titleRef}
        suppressContentEditableWarning
      >
        {data.title}
      </div>
      <div
        className="custom-scrollbar flex-1 cursor-text overflow-y-auto whitespace-pre-wrap text-lg/relaxed outline-none empty:before:opacity-40 empty:before:content-[attr(data-placeholder)]"
        contentEditable
        data-placeholder="Write something..."
        onBlur={handleContentBlur}
        ref={contentRef}
        suppressContentEditableWarning
      >
        {data.content}
      </div>
    </div>
  );
};

const CardNode = ({ id, data }: any) => {
  const { zoom } = useViewport();
  const commitNodeData = useCanvasStore((s) => s.commitNodeData);
  const saveSnapshot = useCanvasStore((s) => s.saveSnapshot);
  const isZoomedOut = zoom < 0.4;

  return (
    <div
      className={cn(
        'group/card size-full',
        data.isHidden ? 'pointer-events-none opacity-0' : 'opacity-100'
      )}
    >
      <NodeResizeControl
        className="border-none! bg-transparent!"
        maxHeight={900}
        maxWidth={800}
        minHeight={300}
        minWidth={250}
        onResizeEnd={() => {
          document.body.classList.remove('resizing-nwse');
        }}
        onResizeStart={() => {
          document.body.classList.add('resizing-nwse');
          saveSnapshot();
        }}
        position="bottom-right"
        style={{ padding: 0 }}
      >
        <div className="absolute right-2 bottom-2 cursor-nwse-resize opacity-0 transition-opacity group-hover/card:opacity-100">
          <svg
            height="16"
            viewBox="0 0 16 16"
            width="16"
            xmlns="http://www.w3.org/2000/svg"
          >
            <title>Resize</title>
            <g fill="none" fillRule="evenodd">
              <path
                d="M13.146 12.146a.5.5 0 0 1 .708.708l-1 1a.5.5 0 0 1-.708-.708zm0-4a.5.5 0 0 1 .708.708l-5 5a.5.5 0 0 1-.708-.708zm0-4a.5.5 0 0 1 .708.708l-9 9a.5.5 0 0 1-.708-.708z"
                fill="#1B2536"
                fillOpacity="0.5"
              />
              <path
                d="M13.146 6.146a.5.5 0 0 1 .708.708l-7 7a.5.5 0 0 1-.708-.708zm0-4a.5.5 0 0 1 .708.708l-11 11a.5.5 0 0 1-.708-.708zm0 8a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708-.708z"
                fill="#FFF"
                fillOpacity="0.7"
              />
            </g>
          </svg>
        </div>
      </NodeResizeControl>

      <Handle
        className={handleClassName}
        id="top"
        position={Position.Top}
        type="source"
      />
      <Handle
        className={handleClassName}
        id="right"
        position={Position.Right}
        type="source"
      />
      <Handle
        className={handleClassName}
        id="bottom"
        position={Position.Bottom}
        type="source"
      />
      <Handle
        className={handleClassName}
        id="left"
        position={Position.Left}
        type="source"
      />

      {/* Visual wrapper with hover lift — keeps Handle positions stable */}
      <div
        className={cn(
          'size-full cursor-pointer overflow-hidden rounded-3xl border border-black/5 shadow-card',
          'transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.015] hover:shadow-card-hover'
        )}
      >
        {isZoomedOut ? (
          <div
            className={cn(
              'flex size-full flex-col p-6',
              isColorDark(data.color) && 'text-white'
            )}
            style={colorToStyle(data.color)}
          >
            {data.tag ? (
              <div
                className="mb-4 h-4 w-12 rounded-md"
                style={colorToStyle(data.tagColor)}
              />
            ) : null}
            <h2 className="font-bold text-2xl/tight">
              {data.title || 'Untitled'}
            </h2>
            <div className="mt-6 space-y-3 opacity-30">
              <div className="h-3 w-full rounded-full bg-current" />
              <div className="h-3 w-5/6 rounded-full bg-current" />
              <div className="h-3 w-4/6 rounded-full bg-current" />
              <div className="h-3 w-full rounded-full bg-current" />
              <div className="h-3 w-3/4 rounded-full bg-current" />
            </div>
          </div>
        ) : (
          <CardContent
            data={data}
            onChange={(newData: any) => {
              commitNodeData(id, newData);
            }}
          />
        )}
      </div>
    </div>
  );
};

export default memo(CardNode);
