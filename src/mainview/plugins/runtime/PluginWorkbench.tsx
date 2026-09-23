import { Blocks, ChevronDown } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useCanvasStore } from '@/store/canvasStore';
import type { ImporterSessionSnapshot } from './importers';
import { type PluginRuntime, pluginRuntime } from './PluginRuntime';
import { pluginText } from './panels';
import { requestPluginReload } from './requestPluginReload';

function ImportSessionView({
  runtime,
  session,
}: {
  runtime: PluginRuntime;
  session: ImporterSessionSnapshot;
}) {
  const activeViewId = useCanvasStore((state) => state.activeViewId);
  const canvasHydrated = useCanvasStore((state) => state._hydrated);
  const switchView = useCanvasStore((state) => state.switchView);
  const hasPreview = session.notes.length > 0;
  const segmented = session.segments.length > 1;
  const visibleNotes = session.notes.slice(0, 100);
  const segmentStatus = {
    pending: pluginText('pending', '等待'),
    committing: pluginText('importing', '导入中'),
    completed: pluginText('completed', '已完成'),
    failed: pluginText('failed', '失败'),
    'rolling-back': pluginText('rolling back', '回滚中'),
    'rolled-back': pluginText('rolled back', '已回滚'),
    'rollback-conflict': pluginText('rollback conflict', '回滚冲突'),
    'rollback-failed': pluginText('rollback failed', '回滚失败'),
  };
  const fileName =
    session.file?.name ?? pluginText('Selected file', '已选文件');
  const status = {
    selecting: pluginText('Choose a file…', '请选择文件…'),
    configuring: pluginText(
      `Map fields from ${fileName}`,
      `映射 ${fileName} 的字段`
    ),
    parsing: pluginText(`Reading ${fileName}…`, `正在读取 ${fileName}…`),
    preview: pluginText(
      `${session.notes.length} notes ready to import`,
      `${session.notes.length} 条笔记等待导入`
    ),
    committing: pluginText(
      segmented
        ? `Imported ${session.completedNotes} of ${session.totalNotes} notes…`
        : `Importing ${session.notes.length} notes…`,
      segmented
        ? `已导入 ${session.completedNotes}/${session.totalNotes} 条笔记…`
        : `正在导入 ${session.notes.length} 条笔记…`
    ),
    placing: pluginText(
      'Saving imported notes to the target canvas…',
      '正在将导入笔记保存到目标画布…'
    ),
    'placement-failed': pluginText(
      'The notes were imported as detached content, but canvas placement failed. Open the target canvas and retry placement.',
      '笔记已作为未放置内容导入，但画布放置失败。请打开目标画布后重试放置。'
    ),
    failed: hasPreview
      ? pluginText(
          session.completedNotes > 0
            ? `Import paused after ${session.completedNotes} notes. Retry continues from the failed range.`
            : 'Import failed. The preview is retained for retry.',
          session.completedNotes > 0
            ? `导入在完成 ${session.completedNotes} 条后暂停；重试将从失败区间继续。`
            : '导入失败，预览已保留，可安全重试。'
        )
      : pluginText('Could not prepare the preview.', '无法生成导入预览。'),
    completed: pluginText(
      `Imported all ${session.totalNotes} notes.`,
      `已导入全部 ${session.totalNotes} 条笔记。`
    ),
    'rolling-back': pluginText(
      `Rolling back imported ranges; ${session.completedNotes} notes remain…`,
      `正在回滚已导入区间，剩余 ${session.completedNotes} 条…`
    ),
    'rollback-failed': pluginText(
      'Rollback paused. Retry uses the same operation identity.',
      '回滚已暂停；重试将复用同一操作标识。'
    ),
    'rollback-conflict': pluginText(
      `${session.completedNotes} imported notes were preserved because their ranges conflict.`,
      `${session.completedNotes} 条导入笔记因区间冲突而保留。`
    ),
    'rolled-back': pluginText(
      'All imported ranges were rolled back.',
      '所有已导入区间均已回滚。'
    ),
  }[session.status];
  return (
    <section
      aria-label={pluginText('Import preview', '导入预览')}
      style={{
        borderTop:
          '1px solid color-mix(in srgb, currentColor 24%, transparent)',
        display: 'grid',
        gap: 8,
        paddingTop: 8,
      }}
    >
      <strong>{session.importerTitle}</strong>
      <span aria-live="polite">{status}</span>
      {session.file && (
        <small>
          {session.file.name} · {session.file.size.toLocaleString()} bytes
        </small>
      )}
      {session.error && (
        <p role="alert" style={{ color: 'var(--destructive, #b42318)' }}>
          {session.error}
        </p>
      )}
      {session.mapping && session.sourceFields.length > 0 && (
        <fieldset
          disabled={!['configuring', 'failed'].includes(session.status)}
          style={{ display: 'grid', gap: 6 }}
        >
          <legend>{pluginText('Field mapping', '字段映射')}</legend>
          {(
            [
              ['title', pluginText('Title (required)', '标题（必填）')],
              ['text', pluginText('Body', '正文')],
              ['color', pluginText('Color', '颜色')],
            ] as const
          ).map(([target, label]) => (
            <label key={target}>
              {label}{' '}
              <select
                aria-label={label}
                onChange={(event) =>
                  runtime.updateImporterMapping(
                    session.operationId,
                    target,
                    event.currentTarget.value || null
                  )
                }
                value={session.mapping?.[target] ?? ''}
              >
                <option value="">
                  {target === 'title'
                    ? pluginText('Select a field', '选择字段')
                    : pluginText('Do not import', '不导入')}
                </option>
                {session.sourceFields.map((field) => (
                  <option key={field} value={field}>
                    {field}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </fieldset>
      )}
      {session.warnings.length > 0 && (
        <div>
          <strong>{pluginText('Warnings', '警告')}</strong>
          <ul>
            {session.warnings.map((warning, index) => (
              <li key={`${index}:${warning}`}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
      {segmented && (
        <ol
          aria-label={pluginText('Import ranges', '导入区间')}
          style={{ display: 'grid', gap: 4, margin: 0, paddingLeft: 24 }}
        >
          {session.segments.map((segment) => (
            <li key={segment.operationId}>
              {pluginText('Notes', '笔记')} {segment.start}–{segment.end} ·{' '}
              {segmentStatus[segment.status]}
              {segment.error && <small> · {segment.error}</small>}
            </li>
          ))}
        </ol>
      )}
      {hasPreview &&
        (session.completedNotes === 0 ||
          session.status === 'placement-failed') && (
          <fieldset style={{ display: 'grid', gap: 6 }}>
            <legend>{pluginText('Import destination', '导入目标')}</legend>
            <label>
              {pluginText('Target', '目标')}{' '}
              <select
                aria-label={pluginText('Import target', '导入目标')}
                disabled={session.completedNotes > 0}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  runtime.updateImporterPlacement(
                    session.operationId,
                    value === 'detached'
                      ? { mode: 'detached' }
                      : {
                          mode: 'canvas',
                          strategy: session.placement.strategy,
                          viewId: value,
                        }
                  );
                }}
                value={
                  session.placement.mode === 'detached'
                    ? 'detached'
                    : (session.placement.viewId ?? 'detached')
                }
              >
                <option value="detached">
                  {pluginText('Library only (detached)', '仅资料库（不放置）')}
                </option>
                {session.placementTargets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name}
                  </option>
                ))}
              </select>
            </label>
            {session.placement.mode === 'canvas' && (
              <>
                <label>
                  {pluginText('Placement', '放置方式')}{' '}
                  <select
                    aria-label={pluginText('Placement strategy', '放置策略')}
                    disabled={session.completedNotes > 0}
                    onChange={(event) =>
                      runtime.updateImporterPlacement(session.operationId, {
                        mode: 'canvas',
                        strategy: event.currentTarget.value as
                          | 'grid'
                          | 'vertical',
                        viewId: session.placement.viewId,
                      })
                    }
                    value={session.placement.strategy}
                  >
                    <option value="grid">{pluginText('Grid', '网格')}</option>
                    <option value="vertical">
                      {pluginText('Vertical list', '纵向列表')}
                    </option>
                  </select>
                </label>
                {(activeViewId !== session.placement.viewId ||
                  !canvasHydrated) && (
                  <button
                    disabled={
                      !session.placement.viewId ||
                      activeViewId === session.placement.viewId
                    }
                    onClick={() => {
                      if (session.placement.viewId) {
                        switchView(session.placement.viewId).catch((error) =>
                          runtime.report(
                            session.pluginId,
                            'importer-target',
                            error
                          )
                        );
                      }
                    }}
                    type="button"
                  >
                    {activeViewId === session.placement.viewId
                      ? pluginText(
                          'Loading target canvas…',
                          '正在加载目标画布…'
                        )
                      : pluginText('Open target canvas', '打开目标画布')}
                  </button>
                )}
              </>
            )}
          </fieldset>
        )}
      {hasPreview && (
        <ol
          aria-label={pluginText('Notes to import', '待导入笔记')}
          style={{
            display: 'grid',
            gap: 6,
            margin: 0,
            maxHeight: 240,
            overflow: 'auto',
            paddingLeft: 24,
          }}
        >
          {visibleNotes.map((note, index) => (
            <li key={`${index}:${note.title}`}>
              <strong>{note.title}</strong>
              {note.color && <small> · {note.color}</small>}
              {note.text && (
                <div
                  style={{
                    opacity: 0.72,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={note.text}
                >
                  {note.text.replaceAll('\n', ' ')}
                </div>
              )}
            </li>
          ))}
          {session.notes.length > visibleNotes.length && (
            <li>
              {pluginText(
                `${session.notes.length - visibleNotes.length} more notes…`,
                `另有 ${session.notes.length - visibleNotes.length} 条笔记…`
              )}
            </li>
          )}
        </ol>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {session.canPrepare && (
          <button
            onClick={() => {
              runtime
                .prepareImporterSession(session.operationId)
                .catch((error) =>
                  runtime.report(session.pluginId, 'importer-prepare', error)
                );
            }}
            type="button"
          >
            {pluginText('Prepare preview', '生成预览')}
          </button>
        )}
        {session.canConfirm && (
          <button
            disabled={
              session.placement.mode === 'canvas' &&
              (activeViewId !== session.placement.viewId || !canvasHydrated)
            }
            onClick={() => {
              runtime
                .confirmImporterSession(session.operationId)
                .catch((error) =>
                  runtime.report(session.pluginId, 'importer-confirm', error)
                );
            }}
            type="button"
          >
            {session.status === 'placement-failed'
              ? pluginText('Retry placement', '重试放置')
              : session.status === 'failed'
                ? pluginText(
                    session.completedNotes > 0
                      ? 'Retry and continue'
                      : 'Retry import',
                    session.completedNotes > 0 ? '重试并继续' : '重试导入'
                  )
                : pluginText('Confirm import', '确认导入')}
          </button>
        )}
        {session.canRollback && (
          <button
            onClick={() => {
              runtime
                .rollbackImporterSession(session.operationId)
                .catch((error) =>
                  runtime.report(session.pluginId, 'importer-rollback', error)
                );
            }}
            type="button"
          >
            {session.status === 'rollback-conflict' ||
            session.status === 'rollback-failed'
              ? pluginText('Retry rollback', '重试回滚')
              : pluginText('Roll back imported notes', '回滚已导入笔记')}
          </button>
        )}
        {session.canCancel && (
          <button
            onClick={() => runtime.cancelImporterSession(session.operationId)}
            type="button"
          >
            {session.completedNotes > 0 ||
            ['rolled-back', 'rollback-conflict'].includes(session.status)
              ? pluginText('Close', '关闭')
              : pluginText('Cancel', '取消')}
          </button>
        )}
      </div>
    </section>
  );
}

export function PluginWorkbench({
  runtime = pluginRuntime,
}: {
  runtime?: PluginRuntime;
}) {
  const snapshot = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot
  );
  const [selectedImporter, setSelectedImporter] = useState('');
  useEffect(() => {
    const available = new Set(
      snapshot.importers.map((item) => `${item.pluginId}:${item.id}`)
    );
    if (selectedImporter && !available.has(selectedImporter)) {
      setSelectedImporter('');
    }
  }, [selectedImporter, snapshot.importers]);
  const selected = snapshot.importers.find(
    (item) => `${item.pluginId}:${item.id}` === selectedImporter
  );
  return (
    <aside
      aria-label={pluginText('Plugin workbench', '插件工作台')}
      className="fixed top-3 right-3 z-30 max-w-[min(22rem,calc(100vw-1.5rem))]"
    >
      <details className="canvas-floating-surface group/plugins overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2 py-1 font-medium text-[13px] text-neutral-700 outline-none transition-colors hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-accent/60 dark:text-neutral-200 dark:hover:bg-white/10 [&::-webkit-details-marker]:hidden">
          <Blocks
            aria-hidden
            className="shrink-0 text-neutral-500 dark:text-neutral-400"
            size={14}
          />
          <span>{pluginText('Plugins', '插件')}</span>
          <span
            aria-hidden
            className="rounded-full bg-black/5 px-1.5 py-px font-normal text-2xs text-neutral-600 tabular-nums dark:bg-white/10 dark:text-neutral-300"
          >
            {snapshot.plugins.length}
          </span>
          <ChevronDown
            aria-hidden
            className="ml-0.5 shrink-0 text-neutral-400 transition-transform group-open/plugins:rotate-180"
            size={12}
          />
        </summary>
        <div className="grid max-h-[60vh] gap-2 overflow-auto border-black/5 border-t p-3 text-[13px] dark:border-white/10">
          {snapshot.importers.length > 0 && (
            <section
              aria-label={pluginText('Import file', '导入文件')}
              style={{ display: 'grid', gap: 6 }}
            >
              <strong>{pluginText('Import file', '导入文件')}</strong>
              <label>
                {pluginText('Importer', '导入器')}{' '}
                <select
                  aria-label={pluginText('Importer', '导入器')}
                  onChange={(event) =>
                    setSelectedImporter(event.currentTarget.value)
                  }
                  value={selectedImporter}
                >
                  <option value="">
                    {pluginText('Choose an importer', '选择导入器')}
                  </option>
                  {snapshot.importers.map((importer) => {
                    const plugin = snapshot.plugins.find(
                      (item) => item.pluginId === importer.pluginId
                    );
                    return (
                      <option
                        key={`${importer.pluginId}:${importer.id}`}
                        value={`${importer.pluginId}:${importer.id}`}
                      >
                        {importer.title} · {plugin?.name ?? importer.pluginId}
                      </option>
                    );
                  })}
                </select>
              </label>
              <button
                disabled={
                  !selected ||
                  Boolean(
                    snapshot.importSession &&
                      ['committing', 'placing', 'rolling-back'].includes(
                        snapshot.importSession.status
                      )
                  )
                }
                onClick={() => {
                  if (!selected) {
                    return;
                  }
                  runtime
                    .startImporterSession(selected.pluginId, selected.id)
                    .catch((error) =>
                      runtime.report(selected.pluginId, 'importer-start', error)
                    );
                }}
                type="button"
              >
                {pluginText('Choose file…', '选择文件…')}
              </button>
            </section>
          )}
          {snapshot.plugins.length === 0 && (
            <p>
              {pluginText(
                'No plugins enabled in this workspace.',
                '此工作区未启用插件。'
              )}
            </p>
          )}
          {snapshot.plugins.map((plugin) => (
            <section aria-label={plugin.name} key={plugin.pluginId}>
              <strong>{plugin.name}</strong>{' '}
              <small>
                {plugin.version} ·{' '}
                {plugin.status === 'running'
                  ? pluginText('Running', '运行中')
                  : plugin.status === 'loading'
                    ? pluginText('Loading', '加载中')
                    : pluginText('Failed', '失败')}
              </small>
              <button
                onClick={() => {
                  requestPluginReload(plugin.pluginId).catch((error) =>
                    runtime.report(plugin.pluginId, 'reload', error)
                  );
                }}
                type="button"
              >
                {pluginText('Reload', '重新加载')}
              </button>
              <ul>
                {snapshot.commands
                  .filter((command) => command.pluginId === plugin.pluginId)
                  .map((command) => (
                    <li key={`command:${command.id}`}>
                      <button
                        onClick={() => {
                          runtime.runCommand(command.pluginId, command.id);
                        }}
                        type="button"
                      >
                        {command.title}
                        {command.shortcut ? ` (${command.shortcut})` : ''}
                      </button>
                    </li>
                  ))}
                {snapshot.panels
                  .filter((panel) => panel.pluginId === plugin.pluginId)
                  .map((panel) => (
                    <li key={`panel:${panel.id}`}>
                      <button
                        onClick={() =>
                          panel.open
                            ? runtime.closePanel(panel.pluginId, panel.id)
                            : runtime.openPanel(panel.pluginId, panel.id)
                        }
                        type="button"
                      >
                        {panel.title} ·{' '}
                        {panel.open
                          ? pluginText('Close', '关闭')
                          : pluginText('Open', '打开')}
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
          {snapshot.importSession && (
            <ImportSessionView
              runtime={runtime}
              session={snapshot.importSession}
            />
          )}
          {snapshot.diagnostics.length > 0 && (
            <section aria-label={pluginText('Diagnostics', '诊断')}>
              <strong>{pluginText('Diagnostics', '诊断')}</strong>
              {snapshot.diagnostics.map((diagnostic, index) => (
                <pre
                  key={`${index}:${diagnostic.pluginId}:${diagnostic.phase}`}
                  style={{
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                    fontSize: 11,
                  }}
                >
                  {diagnostic.pluginId} [{diagnostic.phase}]{' '}
                  {diagnostic.message}
                </pre>
              ))}
            </section>
          )}
        </div>
      </details>
    </aside>
  );
}
