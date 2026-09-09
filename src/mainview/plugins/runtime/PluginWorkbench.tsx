import { useSyncExternalStore } from 'react';
import { type PluginRuntime, pluginRuntime } from './PluginRuntime';
import { pluginText } from './panels';
import { requestPluginReload } from './requestPluginReload';

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
              </ul>
            </section>
          ))}
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
