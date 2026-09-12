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
      `Importing ${session.notes.length} notes…`,
      `正在导入 ${session.notes.length} 条笔记…`
    ),
    failed: hasPreview
      ? pluginText(
          'Import failed. The preview is retained for retry.',
          '导入失败，预览已保留，可安全重试。'
        )
      : pluginText('Could not prepare the preview.', '无法生成导入预览。'),
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
          {session.notes.map((note, index) => (
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
              ? pluginText('Retry import', '重试导入')
              : pluginText('Confirm import', '确认导入')}
          </button>
        )}
        {session.canCancel && (
          <button
            onClick={() => runtime.cancelImporterSession(session.operationId)}
            type="button"
          >
            {pluginText('Cancel', '取消')}
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
