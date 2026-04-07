import { memo, useState } from 'react';
import { useReactFlow, useViewport, NodeResizeControl, Handle, Position } from '@xyflow/react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { colorToStyle, isColorDark } from '@/lib/colorUtils';

const handleClassName = "conn-handle nodrag";

export const CardContent = ({ data, isFocused, onChange }: any) => {
  const [newItem, setNewItem] = useState('');

  if (data.type === 'image') {
    return (
      <div className={cn("h-full flex flex-col", isColorDark(data.color) && 'text-white')} style={colorToStyle(data.color)}>
        <div className="p-6">
          <h2 className={cn("font-bold whitespace-pre-wrap", isFocused ? "text-4xl" : "text-xl")}>{data.title}</h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="relative w-full aspect-square max-w-[300px] rounded-full overflow-hidden">
            {/* Mock Pie Chart */}
            <div className="absolute inset-0 bg-[#555]" style={{ clipPath: 'polygon(50% 50%, 100% 0, 100% 100%, 0 100%, 0 0, 50% 0)' }}></div>
            <div className="absolute inset-0 bg-[#888]" style={{ clipPath: 'polygon(50% 50%, 0 0, 0 50%)' }}></div>
            <div className="absolute inset-0 bg-[#BBB]" style={{ clipPath: 'polygon(50% 50%, 0 50%, 0 100%)' }}></div>
            <div className="absolute inset-0 bg-[#EEE]" style={{ clipPath: 'polygon(50% 50%, 50% 0, 100% 0)' }}></div>
          </div>
        </div>
        <div className="p-6 flex flex-col items-end gap-2">
           {data.pieData?.map((item: any, i: number) => (
             <div key={i} className="flex items-center gap-2">
               <span className="text-sm font-medium">{item.label}</span>
               <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
             </div>
           ))}
        </div>
      </div>
    );
  }

  if (data.type === 'checklist') {
    return (
      <div className={cn("p-6 h-full flex flex-col", isColorDark(data.color) && 'text-white')} style={colorToStyle(data.color)}>
        <div className="flex items-center gap-2 mb-4">
          {data.tag && <span className="px-2 py-1 text-xs font-semibold rounded-md" style={colorToStyle(data.tagColor)}>{data.tag}</span>}
        </div>
        {data.title && <h2 className={cn("font-bold mb-4", isFocused ? "text-3xl" : "text-xl")}>{data.title}</h2>}
        <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar">
          {data.items?.map((item: any, i: number) => (
            item.isHeader ? (
              <div key={i} className="font-semibold text-gray-800 mt-4 mb-2">{item.text}</div>
            ) : (
              <div key={i} className="flex items-start gap-3 py-1 group cursor-pointer" onClick={() => {
                if (onChange) {
                  const newItems = [...data.items];
                  newItems[i].checked = !newItems[i].checked;
                  onChange({ ...data, items: newItems });
                }
              }}>
                <div className={cn("mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors", item.checked ? 'bg-black border-black' : 'border-gray-400 group-hover:border-black')}>
                   {item.checked && <Check size={12} className="text-white" />}
                </div>
                <span className={cn("text-sm leading-tight transition-colors", item.checked ? 'line-through text-gray-400' : 'text-gray-800')}>{item.text}</span>
              </div>
            )
          ))}
          {/* Add new item input */}
          <div className="flex items-center gap-3 mt-2 opacity-50 focus-within:opacity-100 transition-opacity">
            <div className="w-4 h-4 rounded border border-gray-400 flex-shrink-0"></div>
            <input 
              type="text" 
              value={newItem}
              onChange={e => setNewItem(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && newItem.trim() && onChange) {
                  onChange({ ...data, items: [...(data.items || []), { text: newItem.trim(), checked: false }] });
                  setNewItem('');
                }
              }}
              placeholder="Add item..." 
              className="bg-transparent border-none outline-none text-sm w-full placeholder-gray-500" 
            />
          </div>
        </div>
      </div>
    );
  }

  // Default text card
  return (
    <div className={cn("p-6 h-full flex flex-col", isColorDark(data.color) && 'text-white')} style={colorToStyle(data.color)}>
      {data.title && <h2 className={cn("font-bold mb-4", isFocused ? "text-4xl" : "text-xl")}>{data.title}</h2>}
      <div className={cn("whitespace-pre-wrap leading-relaxed flex-1 overflow-y-auto custom-scrollbar", isFocused ? "text-lg" : "text-sm")}>
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
        "w-full h-full rounded-3xl shadow-sm border border-black/5 overflow-hidden cursor-pointer group/card",
        "transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-lg",
        data.isHidden ? "opacity-0 pointer-events-none" : "opacity-100"
      )}
      
    >
      <NodeResizeControl
        minWidth={250}
        minHeight={300}
        maxWidth={800}
        maxHeight={900}
        position="bottom-right"
        className="!bg-transparent !border-none"
        style={{ padding: 0 }}
        onResizeStart={() => document.body.classList.add('resizing-nwse')}
        onResizeEnd={() => document.body.classList.remove('resizing-nwse')}
      >
        <div className="absolute bottom-2 right-2 opacity-0 group-hover/card:opacity-100 transition-opacity cursor-nwse-resize">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><g fill="none" fillRule="evenodd"><path fill="#1B2536" fillOpacity="0.5" d="M13.146 12.146a.5.5 0 0 1 .708.708l-1 1a.5.5 0 0 1-.708-.708zm0-4a.5.5 0 0 1 .708.708l-5 5a.5.5 0 0 1-.708-.708zm0-4a.5.5 0 0 1 .708.708l-9 9a.5.5 0 0 1-.708-.708z"/><path fill="#FFF" fillOpacity="0.7" d="M13.146 6.146a.5.5 0 0 1 .708.708l-7 7a.5.5 0 0 1-.708-.708zm0-4a.5.5 0 0 1 .708.708l-11 11a.5.5 0 0 1-.708-.708zm0 8a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708-.708z"/></g></svg>
        </div>
      </NodeResizeControl>
      <Handle type="target" position={Position.Top} id="top" className={handleClassName} />
      <Handle type="source" position={Position.Right} id="right" className={handleClassName} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={handleClassName} />
      <Handle type="target" position={Position.Left} id="left" className={handleClassName} />

      {isZoomedOut ? (
        <div className={cn("w-full h-full p-6 flex flex-col", isColorDark(data.color) && 'text-white')} style={colorToStyle(data.color)}>
           {data.tag && <div className="w-12 h-4 rounded-md mb-4" style={colorToStyle(data.tagColor)}></div>}
           <h2 className="text-2xl font-bold leading-tight">{data.title || 'Untitled'}</h2>
           <div className="mt-6 space-y-3 opacity-30">
             <div className="h-3 bg-current rounded-full w-full"></div>
             <div className="h-3 bg-current rounded-full w-5/6"></div>
             <div className="h-3 bg-current rounded-full w-4/6"></div>
             <div className="h-3 bg-current rounded-full w-full"></div>
             <div className="h-3 bg-current rounded-full w-3/4"></div>
           </div>
        </div>
      ) : (
        <CardContent data={data} onChange={(newData: any) => updateNodeData(id, newData)} />
      )}
    </div>
  );
};

export default memo(CardNode);
