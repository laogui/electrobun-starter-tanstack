import {
  Handle,
  NodeResizeControl,
  Position,
  useReactFlow,
  useViewport,
} from '@xyflow/react';
import { Check } from 'lucide-react';
import { memo, useCallback, useRef, useState } from 'react';

import { colorToStyle, isColorDark } from '@/lib/colorUtils';
import { cn } from '@/lib/utils';

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
        <div className='p-6'>
          <h2
            className={cn(
              'font-bold whitespace-pre-wrap',
              isFocused ? 'text-4xl' : 'text-xl'
            )}
          >
            {data.title}
          </h2>
        </div>
        <div className='flex flex-1 items-center justify-center p-6'>
          <div className='relative aspect-square w-full max-w-[300px] overflow-hidden rounded-full'>
            {/* Mock Pie Chart */}
            <div
              className='absolute inset-0 bg-[#555]'
              style={{
                clipPath:
                  'polygon(50% 50%, 100% 0, 100% 100%, 0 100%, 0 0, 50% 0)',
              }}
            />
            <div
              className='absolute inset-0 bg-[#888]'
              style={{ clipPath: 'polygon(50% 50%, 0 0, 0 50%)' }}
            />
            <div
              className='absolute inset-0 bg-[#BBB]'
              style={{ clipPath: 'polygon(50% 50%, 0 50%, 0 100%)' }}
            />
            <div
              className='absolute inset-0 bg-[#EEE]'
              style={{ clipPath: 'polygon(50% 50%, 50% 0, 100% 0)' }}
            />
          </div>
        </div>
        <div className='flex flex-col items-end gap-2 p-6'>
          {data.pieData?.map((item: any, i: number) => (
            <div key={i} className='flex items-center gap-2'>
              <span className='text-sm font-medium'>{item.label}</span>
              <div
                className='size-3 rounded-full'
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
        <div className='mb-4 flex items-center gap-2'>
          {data.tag ? (
            <span
              className='rounded-md px-2 py-1 text-xs font-semibold'
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
        <div className='custom-scrollbar flex-1 space-y-1 overflow-y-auto'>
          {data.items?.map((item: any, i: number) =>
            item.isHeader ? (
              <div key={i} className='mt-4 mb-2 font-semibold text-gray-800'>
                {item.text}
              </div>
            ) : (
              <div
                key={i}
                className='group flex cursor-pointer items-start gap-3 py-1'
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
                    <Check size={12} className='text-white' />
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
          <div className='mt-2 flex items-center gap-3 opacity-50 transition-opacity focus-within:opacity-100'>
            <div className='size-4 shrink-0 rounded-sm border border-gray-400' />
            <input
              type='text'
              value={newItem}
              placeholder='Add item...'
              className='w-full border-none bg-transparent text-sm placeholder-gray-500 outline-none'
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
          className={cn('mb-4 text-xl font-bold', !data.title && 'opacity-40')}
        >
          {data.title || 'Untitled'}
        </h2>
        <div
          className={cn(
            'custom-scrollbar flex-1 overflow-y-auto text-sm/relaxed whitespace-pre-wrap',
            !data.content && 'opacity-40'
          )}
        >
          {data.content || 'Empty note'}
        </div>
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
    const text = contentRef.current?.textContent ?? '';
    if (text !== data.content && onChange) {
      onChange({ content: text });
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
        ref={titleRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder='Untitled'
        className='mb-4 cursor-text text-4xl font-bold outline-none empty:before:opacity-40 empty:before:content-[attr(data-placeholder)]'
        onBlur={handleTitleBlur}
      >
        {data.title}
      </div>
      <div
        ref={contentRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder='Write something...'
        className='custom-scrollbar flex-1 cursor-text overflow-y-auto text-lg/relaxed whitespace-pre-wrap outline-none empty:before:opacity-40 empty:before:content-[attr(data-placeholder)]'
        onBlur={handleContentBlur}
      >
        {data.content}
      </div>
    </div>
  );
};

const CardNode = ({ id, data }: any) => {
  const { zoom } = useViewport();
  const { updateNodeData } = useReactFlow();
  const isZoomedOut = zoom < 0.4;

  return (
    <div
      className={cn(
        'group/card size-full',
        data.isHidden ? 'pointer-events-none opacity-0' : 'opacity-100'
      )}
    >
      <NodeResizeControl
        minWidth={250}
        minHeight={300}
        maxWidth={800}
        maxHeight={900}
        position='bottom-right'
        className='border-none! bg-transparent!'
        style={{ padding: 0 }}
        onResizeStart={() => {
          document.body.classList.add('resizing-nwse');
        }}
        onResizeEnd={() => {
          document.body.classList.remove('resizing-nwse');
        }}
      >
        <div className='absolute right-2 bottom-2 cursor-nwse-resize opacity-0 transition-opacity group-hover/card:opacity-100'>
          <svg
            xmlns='http://www.w3.org/2000/svg'
            width='16'
            height='16'
            viewBox='0 0 16 16'
          >
            <g fill='none' fillRule='evenodd'>
              <path
                fill='#1B2536'
                fillOpacity='0.5'
                d='M13.146 12.146a.5.5 0 0 1 .708.708l-1 1a.5.5 0 0 1-.708-.708zm0-4a.5.5 0 0 1 .708.708l-5 5a.5.5 0 0 1-.708-.708zm0-4a.5.5 0 0 1 .708.708l-9 9a.5.5 0 0 1-.708-.708z'
              />
              <path
                fill='#FFF'
                fillOpacity='0.7'
                d='M13.146 6.146a.5.5 0 0 1 .708.708l-7 7a.5.5 0 0 1-.708-.708zm0-4a.5.5 0 0 1 .708.708l-11 11a.5.5 0 0 1-.708-.708zm0 8a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708-.708z'
              />
            </g>
          </svg>
        </div>
      </NodeResizeControl>

      <Handle
        type='target'
        position={Position.Top}
        id='top'
        className={handleClassName}
      />
      <Handle
        type='source'
        position={Position.Right}
        id='right'
        className={handleClassName}
      />
      <Handle
        type='source'
        position={Position.Bottom}
        id='bottom'
        className={handleClassName}
      />
      <Handle
        type='target'
        position={Position.Left}
        id='left'
        className={handleClassName}
      />

      {/* Visual wrapper with hover lift — keeps Handle positions stable */}
      <div
        className={cn(
          'size-full cursor-pointer overflow-hidden rounded-3xl border border-black/5 shadow-sm',
          'transition-shadow duration-200 ease-out hover:shadow-lg'
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
                className='mb-4 h-4 w-12 rounded-md'
                style={colorToStyle(data.tagColor)}
              />
            ) : null}
            <h2 className='text-2xl/tight font-bold'>
              {data.title || 'Untitled'}
            </h2>
            <div className='mt-6 space-y-3 opacity-30'>
              <div className='h-3 w-full rounded-full bg-current' />
              <div className='h-3 w-5/6 rounded-full bg-current' />
              <div className='h-3 w-4/6 rounded-full bg-current' />
              <div className='h-3 w-full rounded-full bg-current' />
              <div className='h-3 w-3/4 rounded-full bg-current' />
            </div>
          </div>
        ) : (
          <CardContent
            data={data}
            onChange={(newData: any) => {
              updateNodeData(id, newData);
            }}
          />
        )}
      </div>
    </div>
  );
};

export default memo(CardNode);
