import { z } from 'zod';

export const MAX_DIAGNOSTICS_BYTES = 128 * 1024;

export const reportErrorSchema = z.object({
  source: z.enum(['main', 'renderer', 'session']),
  name: z.string().max(128),
  message: z.string().max(4096),
  stack: z.string().max(16_384).optional(),
});

export const feedbackInputSchema = z.object({
  reportId: z.uuid(),
  category: z.enum(['bug', 'idea', 'other']),
  message: z.string().trim().min(1).max(8000),
  email: z.union([z.email().max(254), z.literal('')]).optional(),
  includeLogs: z.boolean(),
});

export const reportAppInfoSchema = z.object({
  version: z.string().min(1).max(64),
  buildHash: z.string().max(128),
  channel: z.string().min(1).max(32),
  platform: z.string().min(1).max(32),
  arch: z.string().min(1).max(32),
  osVersion: z.string().max(128),
  runtimeVersion: z.string().max(64),
});

export type ReportAppInfo = z.infer<typeof reportAppInfoSchema>;

const reportFields = {
  reportId: z.uuid(),
  occurredAt: z.iso.datetime(),
  app: reportAppInfoSchema,
  diagnostics: z
    .string()
    .max(MAX_DIAGNOSTICS_BYTES)
    .refine(
      (value) =>
        new TextEncoder().encode(value).byteLength <= MAX_DIAGNOSTICS_BYTES
    )
    .optional(),
};

export const desktopReportSchema = z.discriminatedUnion('kind', [
  z.object({
    ...reportFields,
    kind: z.literal('feedback'),
    category: z.enum(['bug', 'idea', 'other']),
    message: z.string().trim().min(1).max(8000),
    email: z.email().max(254).optional(),
  }),
  z.object({
    ...reportFields,
    kind: z.literal('crash'),
    message: z.string().max(4096),
    error: reportErrorSchema,
  }),
]);

export type DesktopReport = z.infer<typeof desktopReportSchema>;

export type ReportError = z.infer<typeof reportErrorSchema>;
export type FeedbackInput = z.infer<typeof feedbackInputSchema>;
export type SubmitReportResult =
  | { success: true; id: string }
  | {
      success: false;
      error:
        | 'unavailable'
        | 'not-configured'
        | 'network'
        | 'rate-limited'
        | 'invalid'
        | 'server';
    };

export interface DiagnosticsStatus {
  autoUpload: boolean;
  configured: boolean;
  pendingReports: number;
}

// Keep logs useful without serializing arbitrary note, provider or request objects.
export function diagnosticValue(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}\n${value.stack ?? ''}`;
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  return '[object omitted]';
}

export function redactDiagnostics(value: string): string {
  return value
    .replace(/\b(Bearer|Basic)\s+[^\s"',;]+/gi, '$1 [redacted]')
    .replace(/\b(?:sk|pk|rk)[-_][a-zA-Z0-9_-]{12,}/g, '[redacted-key]')
    .replace(/GHOST(?:-[A-Z0-9]{4}){4}/g, '[redacted-license]')
    .replace(
      /((?:api[_-]?key|authorization|password|secret|access[_-]?token|refresh[_-]?token|token)["']?\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s"',;}]+)/gi,
      (_match, prefix: string, secret: string) => {
        const quote =
          secret.startsWith('"') || secret.startsWith("'") ? secret[0] : '';
        return `${prefix}${quote}[redacted]${quote}`;
      }
    )
    .replace(/https?:\/\/[^\s"<>]+/gi, (url) => {
      try {
        const parsed = new URL(url);
        return `${parsed.protocol}//${parsed.host}/[path omitted]`;
      } catch {
        return '[url omitted]';
      }
    })
    .replace(
      /(?:\/(?:Users|home|tmp|private|var|Volumes)\/|[a-zA-Z]:\\)[^\s"'<>:)]+/g,
      '[local path]'
    )
    .replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      '[email omitted]'
    );
}
