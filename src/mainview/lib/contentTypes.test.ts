import { describe, expect, it } from 'vitest';

import { classifyFile, getAssetDisplayTitle } from '@/lib/contentTypes';

describe('classifyFile', () => {
  it('classifies video by MIME type', () => {
    const result = classifyFile({ name: 'clip.unknown', type: 'video/mp4' });
    expect(result).toEqual({
      kind: 'video',
      mimeType: 'video/mp4',
      isPdf: false,
    });
  });

  it('classifies audio by MIME type', () => {
    const result = classifyFile({ name: 'song.bin', type: 'audio/mpeg' });
    expect(result).toEqual({
      kind: 'audio',
      mimeType: 'audio/mpeg',
      isPdf: false,
    });
  });

  it('classifies video by extension when MIME is missing', () => {
    const result = classifyFile({ name: 'movie.mp4' });
    expect(result.kind).toBe('video');
    expect(result.mimeType).toBe('video/mp4');
    expect(result.isPdf).toBe(false);
  });

  it('classifies audio by extension when MIME is missing', () => {
    const result = classifyFile({ name: 'track.flac' });
    expect(result.kind).toBe('audio');
    expect(result.mimeType).toBe('audio/flac');
    expect(result.isPdf).toBe(false);
  });

  it('classifies PDF as file with isPdf flag set', () => {
    const result = classifyFile({ name: 'report.pdf' });
    expect(result.kind).toBe('file');
    expect(result.mimeType).toBe('application/pdf');
    expect(result.isPdf).toBe(true);
  });

  it('classifies PDF by MIME type even without extension hint', () => {
    const result = classifyFile({
      name: 'no-ext',
      type: 'application/pdf',
    });
    expect(result.isPdf).toBe(true);
    expect(result.kind).toBe('file');
  });

  it('classifies unknown file with default MIME', () => {
    const result = classifyFile({ name: 'archive.xyz' });
    expect(result.kind).toBe('file');
    expect(result.mimeType).toBe('application/octet-stream');
    expect(result.isPdf).toBe(false);
  });

  it('preserves unknown MIME string for non-classified files', () => {
    const result = classifyFile({
      name: 'data.bin',
      type: 'application/x-custom',
    });
    expect(result.kind).toBe('file');
    expect(result.mimeType).toBe('application/x-custom');
    expect(result.isPdf).toBe(false);
  });

  it('treats `mov` extension as video/quicktime', () => {
    const result = classifyFile({ name: 'recording.mov' });
    expect(result.kind).toBe('video');
    expect(result.mimeType).toBe('video/quicktime');
  });
});

describe('getAssetDisplayTitle', () => {
  it('uses the user-supplied title when present', () => {
    expect(
      getAssetDisplayTitle({
        title: 'Quarterly Report',
        fileName: 'q3.pdf',
        mimeType: 'application/pdf',
      })
    ).toBe('Quarterly Report');
  });

  it('falls back to the file name when title is empty', () => {
    expect(
      getAssetDisplayTitle({
        title: '',
        fileName: 'reel.mp4',
        mimeType: 'video/mp4',
      })
    ).toBe('reel.mp4');
  });

  it('falls back to a friendly MIME label when title and fileName are empty', () => {
    expect(
      getAssetDisplayTitle({
        title: '',
        fileName: '',
        mimeType: 'application/pdf',
      })
    ).toBe('PDF');
  });

  it('falls back to "Untitled" when nothing useful is available', () => {
    expect(
      getAssetDisplayTitle({
        title: '',
        fileName: '',
        mimeType: '',
      })
    ).toBe('Untitled');
  });

  it('trims surrounding whitespace from titles', () => {
    expect(
      getAssetDisplayTitle({
        title: '   Notes  ',
        fileName: 'irrelevant.txt',
        mimeType: 'text/plain',
      })
    ).toBe('Notes');
  });
});
