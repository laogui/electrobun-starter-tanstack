import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicWrite } from './atomicWrite';
import {
  loadManifestsStrict,
  parseCanvasManifest,
  resolveWorkspaceManifestPath,
} from './manifest';
import { readOptionalText, withNoteWorkspace } from './noteTransactions';
import { loadWorkspaceConfig } from './workspace';
import { withWorkspaceFileTransaction } from './workspaceFileJournal';

const LEDGER = '.ghostboard/pending-clones.json';
const issuedTokens = new Set<string>();
interface Receipt {
  hash: string;
  id: string;
  kind: 'widget' | 'extension';
  token: string;
}
const safeId = /^[A-Za-z0-9_-]+$/;
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
function recordPath(workspace: string, receipt: Pick<Receipt, 'kind' | 'id'>) {
  if (!safeId.test(receipt.id)) {
    throw new Error('Invalid clone id');
  }
  return join(
    workspace,
    '.ghostboard',
    receipt.kind === 'widget' ? 'widgets' : 'extension-instances',
    `${receipt.id}.json`
  );
}
async function readLedger(workspace: string): Promise<Receipt[]> {
  const raw = await readOptionalText(join(workspace, LEDGER));
  if (raw === null) {
    return [];
  }
  const receipts = JSON.parse(raw) as Receipt[];
  if (
    !Array.isArray(receipts) ||
    receipts.some(
      (receipt) =>
        !(
          receipt &&
          safeId.test(receipt.id) &&
          ['widget', 'extension'].includes(receipt.kind) &&
          safeId.test(receipt.token)
        ) || typeof receipt.hash !== 'string'
    )
  ) {
    throw new Error('Invalid clone receipts');
  }
  return receipts;
}
export async function trackedClone<T extends { id: string }>(
  workspace: string,
  kind: Receipt['kind'],
  clone: () => Promise<T | null>
) {
  return withNoteWorkspace(workspace, () =>
    withWorkspaceFileTransaction(workspace, async () => {
      const record = await clone();
      if (!record) {
        return null;
      }
      const receipt: Receipt = {
        id: record.id,
        kind,
        token: randomUUID(),
        hash: hash(
          await readFile(recordPath(workspace, { kind, id: record.id }), 'utf8')
        ),
      };
      await atomicWrite(
        join(workspace, LEDGER),
        JSON.stringify([...(await readLedger(workspace)), receipt])
      );
      issuedTokens.add(`${workspace}:${receipt.token}`);
      return { record, token: receipt.token };
    })
  );
}
export function collectCloneReferences(
  value: unknown,
  out = new Set<string>()
): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectCloneReferences(item, out);
    }
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (
        (key === 'widgetId' || key === 'instanceId') &&
        typeof item === 'string'
      ) {
        out.add(item);
      } else if (item && typeof item === 'object') {
        collectCloneReferences(item, out);
      }
    }
  }
  return out;
}
export async function finishClones(
  workspace: string,
  tokens: string[],
  liveReferences: string[]
) {
  return withNoteWorkspace(workspace, async () => {
    const ledger = await readLedger(workspace);
    const candidates = ledger.filter(
      (receipt) =>
        tokens.includes(receipt.token) &&
        issuedTokens.has(`${workspace}:${receipt.token}`)
    );
    if (!candidates.length) {
      return { removed: [] as string[], retained: [] as string[] };
    }
    const config = await loadWorkspaceConfig(workspace);
    const files = [
      ...config.views.map((view) => view.file),
      ...(config.trash ?? []).map((entry) => entry.trashFile),
    ];
    const manifests = await loadManifestsStrict(workspace, files);
    const referenced = collectCloneReferences(
      manifests,
      new Set(liveReferences)
    );
    for (const file of files) {
      for (const suffix of ['.bak', '.pre-topic']) {
        const raw = await readOptionalText(
          resolveWorkspaceManifestPath(workspace, `${file}${suffix}`)
        );
        if (raw !== null) {
          collectCloneReferences(
            parseCanvasManifest(JSON.parse(raw)),
            referenced
          );
        }
      }
    }
    const removed: string[] = [];
    const retained: string[] = [];
    for (const receipt of candidates) {
      const path = recordPath(workspace, receipt);
      const raw = await readOptionalText(path);
      if (
        referenced.has(receipt.id) ||
        (raw !== null && hash(raw) !== receipt.hash)
      ) {
        retained.push(receipt.id);
        continue;
      }
      if (raw !== null) {
        const directory = join(
          workspace,
          '.ghostboard/recovery/discarded-clones',
          receipt.token
        );
        await mkdir(directory, { recursive: true });
        await rename(path, join(directory, `${receipt.id}.json`));
      }
      removed.push(receipt.id);
    }
    await atomicWrite(
      join(workspace, LEDGER),
      JSON.stringify(
        ledger.filter(
          (receipt) =>
            !candidates.some((candidate) => candidate.token === receipt.token)
        )
      )
    );
    for (const receipt of candidates) {
      issuedTokens.delete(`${workspace}:${receipt.token}`);
    }
    return { removed, retained };
  });
}
