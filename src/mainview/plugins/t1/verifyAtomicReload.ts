import type { PluginRuntimeSnapshot } from '../../../shared/plugins/runtime';
import { pluginRuntime } from '../runtime';

export async function waitForAssetStatus(
  url: string,
  status: number
): Promise<boolean> {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if ((await fetch(url)).status === status) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

export async function verifyAtomicReload(
  request: <T>(route: string, input?: unknown) => Promise<T>,
  waitFor: (check: () => boolean, label: string) => Promise<void>
): Promise<Record<string, boolean>> {
  const evidence = globalThis.__trustedPluginTest;
  const old = evidence?.reactContexts?.[0];
  const panel = document.querySelector<HTMLButtonElement>('[data-t1-react]');
  if (!(evidence && old && panel && evidence.sharedRuntimeIdentity)) {
    throw new Error(
      'Shared runtime identity or original React activation missing'
    );
  }
  const before = await request<PluginRuntimeSnapshot>('/plugins/runtime');
  const oldEntry = before.plugins.find(
    (item) => item.pluginId === 't1.react'
  )?.entryUrl;
  if (!oldEntry) {
    throw new Error('Original React module URL missing');
  }
  panel.click();
  await waitFor(() => panel.textContent === 'react:1', 'preserved React state');
  const unmounts = evidence.events.filter(
    (event) => event === 'react:unmount'
  ).length;
  const intact = () => {
    if (
      old.signal.aborted ||
      evidence.reactContexts?.length !== 1 ||
      document.querySelector('[data-t1-react]') !== panel ||
      panel.textContent !== 'react:1' ||
      evidence.events.filter((event) => event === 'react:unmount').length !==
        unmounts
    ) {
      throw new Error(
        'Failed candidate altered the original signal, instance or React state'
      );
    }
  };
  await request('/plugin-t1/edit-react', { mode: 'import-failure' });
  await waitFor(
    () =>
      pluginRuntime
        .getSnapshot()
        .diagnostics.some(
          (item) => item.pluginId === 't1.react' && item.phase === 'import'
        ),
    'failed candidate import'
  );
  intact();
  if ((await fetch(oldEntry)).status !== 200) {
    throw new Error('Import failure revoked the old graph');
  }
  await request('/plugin-t1/edit-react', { mode: 'setup-failure' });
  await waitFor(
    () => evidence.events.includes('react:candidate:setup'),
    'candidate setup pending'
  );
  intact();
  if (
    pluginRuntime
      .getSnapshot()
      .commands.some((item) => item.title === 'Must not publish') ||
    evidence.events.includes('react:candidate:mount')
  ) {
    throw new Error('Candidate registration escaped staging');
  }
  await pluginRuntime.runCommand('t1.react', 'open');
  intact();
  evidence.rejectReactCandidate?.();
  await waitFor(
    () => evidence.events.includes('react:candidate:cleanup'),
    'failed candidate cleanup'
  );
  intact();
  if (
    !evidence.reactCandidate?.signal.aborted ||
    evidence.reactCandidate.generation !== 3
  ) {
    throw new Error('Failed candidate signal/generation incorrect');
  }
  await pluginRuntime.runCommand('t1.react', 'lazy');
  if (
    !evidence.events.includes('react:lazy:original') ||
    (await fetch(oldEntry)).status !== 200
  ) {
    throw new Error('Failed setup broke the original lazy relative import');
  }
  await waitFor(
    () =>
      pluginRuntime
        .getSnapshot()
        .diagnostics.some((item) =>
          item.message.includes('t1-reload-setup-error')
        ),
    'failed setup diagnostic'
  );
  await request('/plugin-t1/edit-react', { mode: 'restore' });
  await waitFor(
    () =>
      evidence.reactContexts?.length === 2 &&
      pluginRuntime
        .getSnapshot()
        .commands.some(
          (item) => item.pluginId === 't1.react' && item.id === 'lazy'
        ) &&
      old.signal.aborted,
    'successful candidate handoff'
  );
  const next = evidence.reactContexts?.[1];
  if (
    !next ||
    next.generation !== 4 ||
    next.signal.aborted ||
    document.querySelector('[data-t1-react]')
  ) {
    throw new Error(
      'Successful handoff retained old view or lost new activation'
    );
  }
  const order = evidence.events.filter(
    (event) => event === 'react:abort:1' || event.startsWith('react:cleanup:')
  );
  if (
    JSON.stringify(order) !==
    JSON.stringify([
      'react:abort:1',
      'react:cleanup:second-start:1',
      'react:cleanup:second-end:1',
      'react:cleanup:first:1',
    ])
  ) {
    throw new Error(
      `Cleanup was not sequential/reverse/exactly once: ${JSON.stringify(order)}`
    );
  }
  if (!(await waitForAssetStatus(oldEntry, 404))) {
    throw new Error('Successful handoff did not release the original graph');
  }
  await pluginRuntime.runCommand('t1.react', 'open');
  await waitFor(
    () => document.querySelector('[data-t1-react]')?.textContent === 'react:0',
    'new generation fresh root'
  );
  return {
    frozenSharedRuntimeIdentity: true,
    failedImportPreservesOriginal: true,
    failedSetupPreservesReactStateAndSignal: true,
    candidateRegistrationsArePrivate: true,
    oldLazyImportsSurviveFailure: true,
    numericGenerationAndCandidateAbort: true,
    sequentialReverseExactlyOnceCleanup: true,
    successfulHandoffReleasesOldGraph: true,
  };
}
