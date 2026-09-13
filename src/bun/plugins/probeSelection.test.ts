import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scriptedProbeSelection } from './probeSelection';

const directories: string[] = [];

function probeDirectory(withFile: boolean): string {
  const directory = mkdtempSync(join(tmpdir(), 'ghostboard-probe-'));
  directories.push(directory);
  if (withFile) {
    writeFileSync(join(directory, 'selected.csv'), 'title\nA\n');
  }
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('scriptedProbeSelection', () => {
  it('keeps the native dialog when no probe is active', () => {
    expect(scriptedProbeSelection({}, 'file')).toBeNull();
  });

  it('never scripts directory selection', () => {
    const directory = probeDirectory(true);
    expect(
      scriptedProbeSelection(
        { GHOSTBOARD_PLUGIN_T3_DIR: directory },
        'directory'
      )
    ).toBeNull();
  });

  it('selects the T3 probe file and models cancellation when it is missing', () => {
    const withFile = probeDirectory(true);
    expect(
      scriptedProbeSelection({ GHOSTBOARD_PLUGIN_T3_DIR: withFile }, 'file')
    ).toEqual([join(withFile, 'selected.csv')]);
    const withoutFile = probeDirectory(false);
    expect(
      scriptedProbeSelection({ GHOSTBOARD_PLUGIN_T3_DIR: withoutFile }, 'file')
    ).toEqual([]);
  });

  it('scripts the T5 probe unless the manual picker is requested', () => {
    const directory = probeDirectory(true);
    expect(
      scriptedProbeSelection({ GHOSTBOARD_PLUGIN_T5_DIR: directory }, 'file')
    ).toEqual([join(directory, 'selected.csv')]);
    expect(
      scriptedProbeSelection(
        {
          GHOSTBOARD_PLUGIN_T5_DIR: directory,
          GHOSTBOARD_PLUGIN_T5_PICKER: 'manual',
        },
        'file'
      )
    ).toBeNull();
  });
});
