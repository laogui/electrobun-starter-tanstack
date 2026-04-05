import { memo } from 'react';
import { Folder } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useViewport } from '@xyflow/react';

const FolderNode = ({ id, data }: any) => {
  const { zoom } = useViewport();
  const isZoomedOut = zoom < 0.4;

  return (
    <div 
      className={cn(
        "relative w-[350px] h-[350px] cursor-pointer group transition-all duration-200 ease-out",
        data.isHidden ? "opacity-0 pointer-events-none" : "opacity-100",
        data.isDropTarget ? "scale-105" : "hover:-translate-y-1"
      )} 
      onClick={(e) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        data.setFocusedFolder({ id, data, rect });
      }}
    >
      {/* Stack backgrounds */}
      <div className={cn(
        "absolute inset-0 bg-white/40 rounded-3xl shadow-sm transition-transform duration-200 ease-out",
        data.isDropTarget ? "translate-y-2.5 scale-[0.88]" : "translate-y-1.5 scale-90 group-hover:translate-y-2"
      )} />
      <div className={cn(
        "absolute inset-0 bg-white/70 rounded-3xl shadow-sm transition-transform duration-200 ease-out",
        data.isDropTarget ? "translate-y-1.5 scale-[0.93]" : "translate-y-0.5 scale-95 group-hover:translate-y-1"
      )} />
      
      {/* Main folder cover */}
      <div className={cn(
        "absolute inset-0 bg-white rounded-3xl shadow-md p-8 flex flex-col justify-center items-center text-center border transition-all duration-200 ease-out",
        data.isDropTarget
          ? "border-blue-400 border-2 shadow-lg shadow-blue-100 -translate-y-1"
          : "border-gray-100 group-hover:-translate-y-0.5"
      )}>
         <div className={cn(
           "bg-gray-100 p-4 rounded-2xl mb-6 transition-transform duration-200 ease-out",
           data.isDropTarget && "scale-110 rotate-[5deg]"
         )}>
            <Folder size={40} className="text-gray-400" />
         </div>
         <h3 className={cn("font-bold text-gray-800", isZoomedOut ? "text-3xl" : "text-xl")}>{data.title}</h3>
         {!isZoomedOut && <p className="text-sm text-gray-500 mt-3">{data.subtitle}</p>}
      </div>
    </div>
  );
};

export default memo(FolderNode);
