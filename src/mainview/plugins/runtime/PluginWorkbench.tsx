import { useSyncExternalStore } from 'react';
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
        {session.canConfirm && (
          <button
            onClick={() => {
              runtime
                .confirmImporterSession(session.operationId)
                .catch((error) =>
                  runtime.report(session.pluginId, 'importer-confirm', error)
                );
            }}
            type="button"
          >
            {session.status === 'failed'
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
  return (
    <aside
      aria-label={pluginText('Plugin workbench', '插件工作台')}
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 999,
        maxWidth: 'min(360px, calc(100vw - 32px))',
      }}
    >
      <details
        style={{
          border: '1px solid #888',
          borderRadius: 8,
          padding: 8,
          background: 'var(--background, white)',
          color: 'var(--foreground, #222)',
          boxShadow: '0 4px 20px #0002',
        }}
      >
        <summary style={{ cursor: 'pointer' }}>
          {pluginText('Plugins', '插件')} ({snapshot.plugins.length})
        </summary>
        <div
          style={{
            maxHeight: '60vh',
            overflow: 'auto',
            paddingTop: 8,
            display: 'grid',
            gap: 8,
          }}
        >
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
                {snapshot.importers
                  .filter((importer) => importer.pluginId === plugin.pluginId)
                  .map((importer) => (
                    <li key={`importer:${importer.id}`}>
                      <button
                        disabled={
                          snapshot.importSession?.status === 'committing'
                        }
                        onClick={() => {
                          runtime
                            .startImporterSession(
                              importer.pluginId,
                              importer.id
                            )
                            .catch((error) =>
                              runtime.report(
                                importer.pluginId,
                                'importer-start',
                                error
                              )
                            );
                        }}
                        type="button"
                      >
                        {importer.title} · {pluginText('Import', '导入')}
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
