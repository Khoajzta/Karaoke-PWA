import React from "react";
import { 
  DndContext, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors 
} from "@dnd-kit/core";
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy, 
  useSortable 
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { 
  GripVertical, 
  Trash2, 
  Play, 
  Music, 
  User, 
  ListMusic 
} from "lucide-react";

// Individual Sortable Item Component
const SortableQueueItem = ({
  item,
  index,
  isHost,
  onPlayNow,
  onRemove
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.id, disabled: !isHost });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 1
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 md:gap-2 p-1.5 md:p-2.5 rounded-xl border transition ${
        isDragging
          ? "bg-slate-800 border-red-500 shadow-2xl scale-[1.02]"
          : "bg-slate-950/70 border-slate-800/80 hover:border-slate-700"
      }`}
    >
      {/* Drag handle for Host */}
      {isHost && (
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-slate-500 hover:text-red-400 p-1 md:p-1 touch-none"
          title="Kéo thả để sắp xếp"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      )}

      {/* Item Order Index */}
      <span className="font-mono text-xs md:text-xs font-bold text-red-400 w-5 text-center flex-shrink-0">
        #{index + 1}
      </span>

      {/* Thumbnail */}
      <img
        src={item.thumbnail}
        alt={item.title}
        className="w-16 h-11 md:w-14 md:h-9 object-cover rounded-lg flex-shrink-0 bg-slate-900"
      />

      {/* Song Info */}
      <div className="min-w-0 flex-1">
        <h4 className="text-[13px] leading-5 md:text-xs md:leading-normal font-semibold text-white line-clamp-2 md:truncate break-words" title={item.title}>
          {item.title}
        </h4>
        <div className="flex items-center gap-1.5 text-xs md:text-[10px] text-slate-400 mt-1 md:mt-0.5">
          <User className="w-3.5 h-3.5 md:w-3 md:h-3 text-slate-500" />
          <span className="truncate">{item.addedBy || "Thành viên"}</span>
        </div>
      </div>

      {/* Host Actions */}
      {isHost && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onPlayNow(item)}
            aria-label={`Phát ngay: ${item.title}`}
            title="Phát ngay bài này"
            className="w-9 h-9 md:w-auto md:h-auto p-0 md:p-1.5 flex items-center justify-center bg-amber-500/20 hover:bg-amber-500 text-amber-400 hover:text-slate-950 rounded-xl active:scale-95 transition"
          >
            <Play className="w-4 h-4 md:w-3.5 md:h-3.5 fill-current" />
          </button>
          <button
            onClick={() => onRemove(item.id)}
            aria-label={`Xóa khỏi danh sách chờ: ${item.title}`}
            title="Xóa bài khỏi danh sách"
            className="w-9 h-9 md:w-auto md:h-auto p-0 md:p-1.5 flex items-center justify-center hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 rounded-xl active:scale-95 transition"
          >
            <Trash2 className="w-4 h-4 md:w-3.5 md:h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

export const QueueList = ({
  queueItems = [],
  isHost,
  onReorder,
  onPlayNow,
  onRemove
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = queueItems.findIndex((item) => item.id === active.id);
    const newIndex = queueItems.findIndex((item) => item.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newArray = arrayMove(queueItems, oldIndex, newIndex);
      onReorder(newArray);
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl md:rounded-3xl p-2.5 md:p-5 flex flex-col h-full shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ListMusic className="w-5 h-5 text-red-400" />
          <h3 className="font-bold text-base md:text-sm text-white">Danh Sách Chờ</h3>
          <span className="text-sm md:text-xs bg-red-500/20 text-red-300 font-bold px-2 py-0.5 rounded-full border border-red-500/30">
            {queueItems.length}
          </span>
        </div>
        {isHost && queueItems.length > 1 && (
          <span className="text-[10px] text-slate-400 italic">Kéo giữ để đổi thứ tự</span>
        )}
      </div>

      {queueItems.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-10 text-center text-slate-500 text-xs">
          <Music className="w-10 h-10 mb-2 opacity-30 text-red-400" />
          <p className="font-medium text-slate-400">Danh sách chờ đang trống</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Hãy tìm bài hát và bấm "Thêm vào danh sách"!
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-1 md:space-y-2 pr-0.5 md:pr-1 min-h-[220px]">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={queueItems.map((item) => item.id)}
              strategy={verticalListSortingStrategy}
            >
              {queueItems.map((item, index) => (
                <SortableQueueItem
                  key={item.id}
                  item={item}
                  index={index}
                  isHost={isHost}
                  onPlayNow={onPlayNow}
                  onRemove={onRemove}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );
};
