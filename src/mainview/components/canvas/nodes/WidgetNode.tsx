import { Check, ListChecks, Plus } from 'lucide-react';
import { memo, useState } from 'react';
import { cn } from '@/lib/utils';
import type {
  ChecklistWidgetData,
  PomodoroWidgetData,
  ReminderWidgetData,
  WidgetKind,
} from '@/lib/widgetTypes';
import { isWidgetLoadError } from '@/lib/widgetTypes';
import { useWidgetStore } from '@/store/widgetStore';
import { NodeHandles } from './_shared/NodeHandles';
import { ResizeHandle } from './_shared/ResizeHandle';
import { PomodoroWidgetBody } from './PomodoroWidget';
import { ReminderWidgetBody } from './ReminderWidget';

export interface WidgetNodeData {
  kind: WidgetKind;
  widgetId: string;
}

function generateItemId(): string {
  return `item_${crypto.randomUUID().slice(0, 8)}`;
}

function WidgetFallback({
  message,
  title,
}: {
  message: string;
  title: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 rounded-3xl border border-black/5 border-dashed p-6 text-center text-neutral-500 text-sm">
      <ListChecks className="opacity-50" size={20} />
      <div className="font-medium">{title}</div>
      <div className="text-xs opacity-70">{message}</div>
    </div>
  );
}

function ChecklistWidgetBody({
  nodeId,
  readOnly = false,
  title,
  data,
  onChange,
}: {
  data: ChecklistWidgetData;
  nodeId: string;
  onChange?: (
    updater: (data: ChecklistWidgetData) => ChecklistWidgetData
  ) => void;
  readOnly?: boolean;
  title: string;
}) {
  const [newItem, setNewItem] = useState('');

  return (
    <div className="flex h-full flex-col p-6">
      {title ? <h2 className="mb-4 font-bold text-xl">{title}</h2> : null}
      <div className="flex-1 space-y-1 overflow-hidden">
        {data.items.map((item) => (
          <button
            className={cn(
              'nodrag nopan group flex w-full items-start gap-3 py-1 text-left',
              readOnly ? '' : 'cursor-pointer'
            )}
            disabled={readOnly}
            key={item.id}
            onClick={
              readOnly
                ? undefined
                : (e) => {
                    e.stopPropagation();
                    onChange?.((record) => ({
                      items: record.items.map((entry) =>
                        entry.id === item.id
                          ? {
                              ...entry,
                              checked: !entry.checked,
                              completedAt: entry.checked
                                ? undefined
                                : new Date().toISOString(),
                            }
                          : entry
                      ),
                    }));
                  }
            }
            type="button"
          >
            <div
              className={cn(
                'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border transition-colors',
                item.checked
                  ? 'border-neutral-950 bg-neutral-950'
                  : 'border-gray-400 group-hover:border-black'
              )}
            >
              {item.checked ? <Check className="text-white" size={12} /> : null}
            </div>
            <span
              className={cn(
                'text-sm/tight transition-colors',
                item.checked ? 'text-gray-400 line-through' : 'text-gray-800'
              )}
            >
              {item.text}
            </span>
          </button>
        ))}
        {readOnly ? null : (
          <div
            className="mt-2 flex items-center gap-3 opacity-50 transition-opacity focus-within:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <Plus className="size-4 shrink-0 text-gray-400" />
            <input
              aria-label="New checklist item"
              className="nodrag nopan w-full border-none bg-transparent text-sm placeholder-gray-500 outline-hidden"
              data-testid={`widget-new-item-${nodeId}`}
              onChange={(e) => {
                setNewItem(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newItem.trim() && onChange) {
                  onChange((record) => ({
                    items: [
                      ...record.items,
                      {
                        id: generateItemId(),
                        text: newItem.trim(),
                        checked: false,
                        createdAt: new Date().toISOString(),
                      },
                    ],
                  }));
                  setNewItem('');
                }
              }}
              placeholder="Add item..."
              type="text"
              value={newItem}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function WidgetNode({ id, data }: { data: WidgetNodeData; id: string }) {
  const record = useWidgetStore((s) => s.records[data.widgetId]);
  const updateWidget = useWidgetStore((s) => s.updateWidget);

  if (!record) {
    return (
      <div className="size-full">
        <NodeHandles />
        <WidgetFallback
          message="This widget could not be found."
          title="Missing widget"
        />
      </div>
    );
  }

  if (isWidgetLoadError(record)) {
    return (
      <div className="size-full">
        <NodeHandles />
        <WidgetFallback
          message={
            record.error === 'corrupted'
              ? 'The widget file is corrupted.'
              : 'The widget file is missing.'
          }
          title="Broken widget"
        />
      </div>
    );
  }

  return (
    <div className="group/widget size-full">
      <ResizeHandle
        hoverClassName="group-hover/widget:opacity-100"
        maxHeight={900}
        maxWidth={800}
        minHeight={record.kind === 'pomodoro' ? 300 : 220}
        minWidth={record.kind === 'pomodoro' ? 260 : 220}
        nodeId={id}
      />
      <NodeHandles />
      <div className="node-visual size-full overflow-hidden rounded-3xl bg-white shadow-card transition-shadow duration-200 ease-out hover:shadow-card-hover">
        {record.kind === 'checklist' ? (
          <ChecklistWidgetBody
            data={record.data as ChecklistWidgetData}
            nodeId={id}
            onChange={(updater) => {
              updateWidget(data.widgetId, (current) => ({
                ...current,
                data: updater(current.data as ChecklistWidgetData),
                updatedAt: new Date().toISOString(),
              }));
            }}
            title={record.title}
          />
        ) : null}
        {record.kind === 'pomodoro' ? (
          <PomodoroWidgetBody
            data={record.data as PomodoroWidgetData}
            onChange={(updater) => {
              updateWidget(
                data.widgetId,
                (current) => ({
                  ...current,
                  data: updater(current.data as PomodoroWidgetData),
                  updatedAt: new Date().toISOString(),
                }),
                { recordHistory: false }
              );
            }}
            widgetId={data.widgetId}
          />
        ) : null}
        {record.kind === 'reminder' ? (
          <ReminderWidgetBody
            data={record.data as ReminderWidgetData}
            onChange={(updater) => {
              updateWidget(data.widgetId, (current) => ({
                ...current,
                data: updater(current.data as ReminderWidgetData),
                updatedAt: new Date().toISOString(),
              }));
            }}
            onTitleChange={(nextTitle) => {
              updateWidget(data.widgetId, (current) => ({
                ...current,
                title: nextTitle,
                updatedAt: new Date().toISOString(),
              }));
            }}
            title={record.title}
          />
        ) : null}
      </div>
    </div>
  );
}

export default memo(WidgetNode);

export function WidgetNodeReadOnly({ data }: { data: WidgetNodeData }) {
  const record = useWidgetStore((s) => s.records[data.widgetId]);

  if (!record || isWidgetLoadError(record)) {
    return (
      <div className="size-full">
        <NodeHandles />
        <div className="node-visual size-full overflow-hidden rounded-3xl shadow-card">
          <WidgetFallback
            message="Widget preview is not available."
            title={data.kind === 'checklist' ? 'Checklist' : data.kind}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="size-full">
      <NodeHandles />
      <div className="node-visual size-full overflow-hidden rounded-3xl shadow-card">
        {record.kind === 'checklist' ? (
          <ChecklistWidgetBody
            data={record.data as ChecklistWidgetData}
            nodeId={data.widgetId}
            readOnly
            title={record.title}
          />
        ) : null}
        {record.kind === 'pomodoro' ? (
          <PomodoroWidgetBody
            data={record.data as PomodoroWidgetData}
            readOnly
            widgetId={data.widgetId}
          />
        ) : null}
        {record.kind === 'reminder' ? (
          <ReminderWidgetBody
            data={record.data as ReminderWidgetData}
            readOnly
            title={record.title}
          />
        ) : null}
      </div>
    </div>
  );
}
