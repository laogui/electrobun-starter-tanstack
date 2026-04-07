import { join } from "path";
import { readdirSync, existsSync } from "fs";
import { atomicWrite } from "./workspace";

export interface NoteFrontmatter {
  id: string;
  title?: string;
  displayHint?: string;
  color?: string;
  tags?: string[];
  tag?: string;
  tagColor?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface NoteDocument {
  frontmatter: NoteFrontmatter;
  body: string;
  file: string; // workspace-relative path
}

// Simple YAML frontmatter parser
function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }
  const yamlStr = match[1] ?? "";
  const body = match[2] ?? "";
  const frontmatter: Record<string, unknown> = {};

  for (const line of yamlStr.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    let value: unknown = trimmed.slice(colonIdx + 1).trim();

    // Remove surrounding quotes
    if (typeof value === "string") {
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = (value as string).slice(1, -1);
      }
      // Parse arrays like ["Inbox", "Work"]
      if ((value as string).startsWith("[") && (value as string).endsWith("]")) {
        try {
          value = JSON.parse(value as string);
        } catch {
          // keep as string
        }
      }
    }
    frontmatter[key] = value;
  }

  return { frontmatter, body };
}

// Simple frontmatter serializer
function serializeFrontmatter(frontmatter: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else if (typeof value === "string" && value.includes(":")) {
      lines.push(`${key}: "${value}"`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  return lines.join("\n");
}

/** Recursively list all files under a directory (returns relative paths). */
function listFilesRecursive(dir: string, prefix = ""): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(join(dir, entry.name), rel));
    } else {
      results.push(rel);
    }
  }
  return results;
}

/** Build a noteId → file path index from the content directory. */
export async function buildNoteIndex(wsPath: string): Promise<Map<string, string>> {
  const contentDir = join(wsPath, "content");
  const index = new Map<string, string>();

  for (const relPath of listFilesRecursive(contentDir)) {
    if (!relPath.endsWith(".md")) continue;
    const fullPath = join(contentDir, relPath);
    const file = Bun.file(fullPath);
    const text = await file.text();
    const { frontmatter } = parseFrontmatter(text);
    if (frontmatter.id && typeof frontmatter.id === "string") {
      index.set(frontmatter.id, `content/${relPath}`);
    }
  }
  return index;
}

/** Load a note by its file path (workspace-relative). */
export async function loadNote(wsPath: string, filePath: string): Promise<NoteDocument | null> {
  const fullPath = join(wsPath, filePath);
  const file = Bun.file(fullPath);
  if (!(await file.exists())) return null;
  const text = await file.text();
  const { frontmatter, body } = parseFrontmatter(text);
  return {
    frontmatter: frontmatter as NoteFrontmatter,
    body,
    file: filePath,
  };
}

/** Save a note to disk (atomic write). */
export async function saveNote(
  wsPath: string,
  filePath: string,
  frontmatter: Record<string, unknown>,
  body: string,
): Promise<void> {
  const fullPath = join(wsPath, filePath);
  const content = `---\n${serializeFrontmatter(frontmatter)}\n---\n${body}`;
  await atomicWrite(fullPath, content);
}

/** Create a new note file. Returns the workspace-relative file path. */
export async function createNote(
  wsPath: string,
  noteId: string,
  title: string,
  displayHint: string,
): Promise<string> {
  const slug = title
    ? title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || noteId
    : noteId;
  const fileName = `${slug}.md`;
  const filePath = `content/${fileName}`;
  const now = new Date().toISOString();
  const frontmatter: NoteFrontmatter = {
    id: noteId,
    title,
    displayHint,
    createdAt: now,
    updatedAt: now,
  };
  await saveNote(wsPath, filePath, frontmatter, "");
  return filePath;
}

/** Delete a note file. Uses Bun.file to check existence. */
export async function deleteNoteFile(wsPath: string, filePath: string): Promise<boolean> {
  const fullPath = join(wsPath, filePath);
  const file = Bun.file(fullPath);
  if (!(await file.exists())) return false;
  const { unlinkSync } = await import("fs");
  unlinkSync(fullPath);
  return true;
}
