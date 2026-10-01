import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { release } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import {
  type DesktopReport,
  type DiagnosticsStatus,
  desktopReportSchema,
  diagnosticValue,
  type FeedbackInput,
  feedbackInputSchema,
  MAX_DIAGNOSTICS_BYTES,
  type ReportAppInfo,
  type ReportError,
  redactDiagnostics,
  reportAppInfoSchema,
  reportErrorSchema,
  type SubmitReportResult,
} from '../shared/support/reports';

declare const __GHOSTBOARD_SUPPORT_API_URL__: string;

const MAX_LOG_BYTES = 512 * 1024;
const MAX_PENDING_REPORTS = 20;
const REPORT_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const UUID_FILE = /^[0-9a-f-]{36}\.json$/;
const TRAILING_SLASH = /\/$/;
const SESSION_FILE = /^session-\d+\.json$/;
const sessionSchema = z.object({
  processId: z.number().int().positive(),
  sessionId: z.uuid(),
  lastActiveAt: z.iso.datetime(),
  autoUpload: z.boolean(),
  app: reportAppInfoSchema,
});
const logEntrySchema = z.object({
  time: z.iso.datetime(),
  level: z.enum(['info', 'warn', 'error']),
  source: z.enum(['main', 'renderer']),
  message: z.string().max(4096),
});

function privateWrite(path: string, value: unknown) {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
  renameSync(temporary, path);
}

function readJson(path: string): unknown {
  if (!existsSync(path) || statSync(path).size > 512 * 1024) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function endpointUrl(channel: string): string {
  const configured =
    process.env.GHOSTBOARD_SUPPORT_API_URL ??
    (typeof __GHOSTBOARD_SUPPORT_API_URL__ === 'string'
      ? __GHOSTBOARD_SUPPORT_API_URL__
      : '');
  const raw =
    configured || (channel === 'dev' ? 'http://localhost:8787/api/v1' : '');
  if (!raw) {
    return '';
  }
  const url = new URL(raw);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      'Support API must use HTTPS (HTTP is allowed on localhost)'
    );
  }
  url.search = '';
  url.hash = '';
  return url.toString().replace(TRAILING_SLASH, '');
}

export class DiagnosticsService {
  private readonly directory: string;
  private readonly queueDirectory: string;
  private readonly logPath: string;
  private readonly sessionPath: string;
  private readonly preferencesPath: string;
  private readonly endpoint: string;
  private readonly sessionId = crypto.randomUUID();
  private readonly recentCrashes = new Map<string, number>();
  private autoUpload = true;
  private uploading = false;
  private uploadController: AbortController | null = null;
  private fatal = false;
  private closed = false;
  private readonly startedAt = new Date().toISOString();
  private rendererLogCount = 0;
  private rendererLogWindow = Date.now();
  private reportsThisSession = 0;
  private nextUploadAt = 0;
  private retryDelay = 60_000;
  private app: ReportAppInfo;

  constructor(dataRoot: string, app: ReportAppInfo) {
    this.app = app;
    this.endpoint = endpointUrl(app.channel);
    this.directory = join(dataRoot, 'diagnostics');
    this.queueDirectory = join(this.directory, 'pending');
    this.logPath = join(this.directory, 'app.log');
    this.sessionPath = join(this.directory, `session-${process.pid}.json`);
    this.preferencesPath = join(this.directory, 'preferences.json');
    mkdirSync(this.queueDirectory, { recursive: true, mode: 0o700 });
    chmodSync(this.directory, 0o700);
    const preferences = readJson(this.preferencesPath);
    if (existsSync(this.preferencesPath)) {
      this.autoUpload = Boolean(
        preferences &&
          typeof preferences === 'object' &&
          'autoUpload' in preferences &&
          preferences.autoUpload === true
      );
    }
    this.pruneQueue();
    this.recoverSession();
    this.writeSession();
    this.record('info', 'main', 'Application started');
  }

  updateAppInfo(info: { version: string; hash: string; channel: string }) {
    this.app = {
      ...this.app,
      version: info.version,
      buildHash: info.hash,
      channel: info.channel,
    };
    this.writeSession();
  }

  private pendingFiles(): string[] {
    return readdirSync(this.queueDirectory)
      .filter((name) => UUID_FILE.test(name))
      .map((name) => join(this.queueDirectory, name))
      .sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
  }

  private pruneQueue() {
    for (const name of readdirSync(this.queueDirectory)) {
      if (name.endsWith('.json.tmp')) {
        unlinkSync(join(this.queueDirectory, name));
      }
    }
    const files = this.pendingFiles();
    for (const [index, file] of files.entries()) {
      if (
        Date.now() - statSync(file).mtimeMs > REPORT_RETENTION_MS ||
        index < files.length - MAX_PENDING_REPORTS
      ) {
        unlinkSync(file);
      }
    }
  }

  private writeSession() {
    privateWrite(this.sessionPath, {
      processId: process.pid,
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      lastActiveAt: new Date().toISOString(),
      autoUpload: this.autoUpload,
      app: this.app,
    });
  }

  private recoverSession() {
    for (const name of readdirSync(this.directory).filter((entry) =>
      SESSION_FILE.test(entry)
    )) {
      const path = join(this.directory, name);
      const parsed = sessionSchema.safeParse(readJson(path));
      if (parsed.success) {
        const previous = parsed.data;
        try {
          // A second running instance must not be mistaken for a native crash.
          process.kill(previous.processId, 0);
          continue;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
            continue;
          }
        }
        if (
          this.autoUpload &&
          previous.autoUpload &&
          Date.now() - Date.parse(previous.lastActiveAt) <= REPORT_RETENTION_MS
        ) {
          const error: ReportError = {
            source: 'session',
            name: 'UncleanExit',
            message:
              'The previous session ended without a normal shutdown. This may indicate a native crash, forced quit or power loss.',
          };
          this.enqueue({
            reportId: previous.sessionId,
            kind: 'crash',
            occurredAt: previous.lastActiveAt,
            app: previous.app,
            message: error.message,
            error,
            diagnostics: this.preview(),
          });
        }
      }
      unlinkSync(path);
    }
  }

  record(
    level: 'info' | 'warn' | 'error',
    source: 'main' | 'renderer',
    message: string
  ) {
    if (source === 'renderer') {
      if (Date.now() - this.rendererLogWindow > 60_000) {
        this.rendererLogWindow = Date.now();
        this.rendererLogCount = 0;
      }
      if (++this.rendererLogCount > 100) {
        return;
      }
    }
    if (
      existsSync(this.logPath) &&
      statSync(this.logPath).size > MAX_LOG_BYTES
    ) {
      const previous = `${this.logPath}.1`;
      if (existsSync(previous)) {
        unlinkSync(previous);
      }
      renameSync(this.logPath, previous);
    }
    const entry = JSON.stringify({
      time: new Date().toISOString(),
      level,
      source,
      message: redactDiagnostics(message).slice(0, 4096),
    });
    appendFileSync(this.logPath, `${entry}\n`, { mode: 0o600 });
  }

  preview(): string {
    const content = [`${this.logPath}.1`, this.logPath]
      .filter((path) => existsSync(path))
      .map((path) => readFileSync(path, 'utf8'))
      .join('');
    const entries = content.split('\n').flatMap((line) => {
      try {
        const entry = logEntrySchema.safeParse(JSON.parse(line));
        return entry.success
          ? [
              JSON.stringify({
                ...entry.data,
                message: redactDiagnostics(entry.data.message),
              }),
            ]
          : [];
      } catch {
        return [];
      }
    });
    const redacted = Buffer.from(
      entries.length ? `${entries.join('\n')}\n` : ''
    );
    if (redacted.byteLength <= MAX_DIAGNOSTICS_BYTES) {
      return redacted.toString('utf8');
    }
    const tail = redacted.subarray(-MAX_DIAGNOSTICS_BYTES).toString('utf8');
    // Drop the partial first JSONL entry, including any split UTF-8 code point.
    return tail.slice(tail.indexOf('\n') + 1);
  }

  status(): DiagnosticsStatus {
    return {
      autoUpload: this.autoUpload,
      configured: Boolean(this.endpoint),
      pendingReports: this.pendingFiles().length,
    };
  }

  setAutoUpload(enabled: boolean): DiagnosticsStatus {
    privateWrite(this.preferencesPath, { autoUpload: enabled });
    this.autoUpload = enabled;
    if (!enabled) {
      this.uploadController?.abort();
      for (const file of this.pendingFiles()) {
        unlinkSync(file);
      }
    }
    this.writeSession();
    if (enabled) {
      this.nextUploadAt = 0;
      this.flush();
    }
    return this.status();
  }

  captureCrash(input: ReportError, fatal = false) {
    const parsed = reportErrorSchema.safeParse(input);
    if (!parsed.success) {
      return;
    }
    this.fatal ||= fatal;
    const error: ReportError = {
      ...parsed.data,
      name: redactDiagnostics(parsed.data.name),
      message: redactDiagnostics(parsed.data.message),
      stack: parsed.data.stack
        ? redactDiagnostics(parsed.data.stack)
        : undefined,
    };
    this.record(
      'error',
      error.source === 'renderer' ? 'renderer' : 'main',
      `${error.name}: ${error.message}\n${error.stack ?? ''}`
    );
    if (
      !this.autoUpload ||
      (!fatal && this.reportsThisSession >= MAX_PENDING_REPORTS)
    ) {
      return;
    }
    const signature = `${error.source}:${error.message}:${error.stack ?? ''}`;
    const now = Date.now();
    if (now - (this.recentCrashes.get(signature) ?? 0) < 60_000) {
      return;
    }
    this.recentCrashes.set(signature, now);
    this.reportsThisSession++;
    this.enqueue({
      reportId: fatal ? this.sessionId : crypto.randomUUID(),
      kind: 'crash',
      occurredAt: new Date().toISOString(),
      app: this.app,
      message: error.message,
      error,
      diagnostics: this.preview(),
    });
    if (!fatal) {
      this.flush();
    }
  }

  private enqueue(report: DesktopReport) {
    if (!UUID_FILE.test(`${report.reportId}.json`)) {
      return;
    }
    const path = join(this.queueDirectory, `${report.reportId}.json`);
    // A fatal error and subsequent unclean startup describe the same incident.
    if (!existsSync(path)) {
      privateWrite(path, report);
    }
    this.pruneQueue();
  }

  async submitFeedback(input: FeedbackInput): Promise<SubmitReportResult> {
    const parsed = feedbackInputSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: 'invalid' };
    }
    return await this.send({
      reportId: parsed.data.reportId,
      kind: 'feedback',
      category: parsed.data.category,
      message: parsed.data.message,
      email: parsed.data.email || undefined,
      occurredAt: new Date().toISOString(),
      app: this.app,
      diagnostics: parsed.data.includeLogs ? this.preview() : undefined,
    });
  }

  private async send(
    report: DesktopReport,
    signal?: AbortSignal
  ): Promise<SubmitReportResult> {
    if (!this.endpoint) {
      return { success: false, error: 'not-configured' };
    }
    try {
      const timeout = AbortSignal.timeout(10_000);
      const response = await fetch(
        `${this.endpoint}/${report.kind === 'feedback' ? 'feedback' : 'crash-reports'}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(report),
          redirect: 'error',
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        }
      );
      if (!response.ok) {
        return {
          success: false,
          error:
            response.status === 429
              ? 'rate-limited'
              : [400, 413, 422].includes(response.status)
                ? 'invalid'
                : 'server',
        };
      }
      const data: unknown = await response.json();
      if (
        data &&
        typeof data === 'object' &&
        'success' in data &&
        data.success === true &&
        'id' in data &&
        typeof data.id === 'string'
      ) {
        return { success: true, id: data.id };
      }
      return { success: false, error: 'server' };
    } catch {
      return { success: false, error: 'network' };
    }
  }

  async flush(): Promise<void> {
    if (
      this.uploading ||
      !this.autoUpload ||
      !this.endpoint ||
      Date.now() < this.nextUploadAt
    ) {
      return;
    }
    this.uploading = true;
    this.uploadController = new AbortController();
    try {
      this.pruneQueue();
      for (const file of this.pendingFiles()) {
        if (!this.autoUpload) {
          break;
        }
        const parsed = desktopReportSchema.safeParse(readJson(file));
        if (!parsed.success) {
          unlinkSync(file);
          continue;
        }
        const result = await this.send(
          parsed.data,
          this.uploadController.signal
        );
        if (!result.success && result.error !== 'invalid') {
          this.nextUploadAt =
            Date.now() +
            (result.error === 'rate-limited' ? 3_600_000 : this.retryDelay);
          this.retryDelay = Math.min(this.retryDelay * 2, 3_600_000);
          break;
        }
        this.retryDelay = 60_000;
        this.nextUploadAt = 0;
        if (existsSync(file)) {
          unlinkSync(file);
        }
      }
    } catch {
      // Leave files intact on disk errors; retry on the next tick/startup.
    } finally {
      this.uploading = false;
      this.uploadController = null;
    }
  }

  heartbeat() {
    if (this.closed) {
      return;
    }
    if (!this.fatal) {
      this.writeSession();
    }
    this.flush();
  }

  shutdown() {
    if (this.fatal || this.closed) {
      return;
    }
    this.closed = true;
    this.uploadController?.abort();
    try {
      this.record('info', 'main', 'Application shut down normally');
    } finally {
      if (existsSync(this.sessionPath)) {
        unlinkSync(this.sessionPath);
      }
    }
  }
}

export function initialReportAppInfo(channel: string): ReportAppInfo {
  return {
    version: '1.0.0',
    buildHash: '',
    channel,
    platform: process.platform,
    arch: process.arch,
    osVersion: release(),
    runtimeVersion: Bun.version,
  };
}

export function installDiagnosticLogging(service: DiagnosticsService) {
  for (const level of ['warn', 'error', 'info'] as const) {
    const original = console[level].bind(console);
    console[level] = (...values: unknown[]) => {
      original(...values);
      try {
        service.record(level, 'main', values.map(diagnosticValue).join(' '));
      } catch {
        // Logging failures must not turn a recoverable error into a crash.
      }
    };
  }
}
