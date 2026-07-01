import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  AnnotationInput,
  AnnotationRecord,
  AppSettings,
  BookRecord,
  ExportedAnnotations,
  ProviderSettings,
  ReadingLocation
} from "../../shared/types";
import { DEFAULT_SETTINGS } from "../../shared/default-settings";
import { decryptSecret, encryptSecret } from "../security/secure-store";

type BookRow = Omit<BookRecord, "readerUrl"> & { readerUrl?: string };
type SettingsRow = { key: string; value: string };

export interface ResolvedProviderSettings extends ProviderSettings {
  apiKey?: string;
}

export class LibraryDatabase {
  private readonly db: Database.Database;

  constructor(databasePath: string) {
    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  listBooks(): BookRecord[] {
    const rows = this.db
      .prepare(
        `select id, title, author, fileName, filePath, addedAt, lastOpenedAt
         from books
         order by coalesce(lastOpenedAt, addedAt) desc`
      )
      .all() as BookRow[];

    return rows.map(this.toPublicBook);
  }

  getBook(bookId: string): BookRecord | null {
    const row = this.db
      .prepare(
        `select id, title, author, fileName, filePath, addedAt, lastOpenedAt
         from books
         where id = ?`
      )
      .get(bookId) as BookRow | undefined;

    return row ? this.toPublicBook(row) : null;
  }

  getBookFilePath(bookId: string): string | null {
    const row = this.db
      .prepare("select filePath from books where id = ?")
      .get(bookId) as { filePath: string } | undefined;
    return row?.filePath ?? null;
  }

  createBook(input: {
    id?: string;
    title: string;
    author?: string;
    fileName: string;
    filePath: string;
  }): BookRecord {
    const now = new Date().toISOString();
    const id = input.id ?? randomUUID();

    this.db
      .prepare(
        `insert into books (id, title, author, fileName, filePath, addedAt, lastOpenedAt)
         values (@id, @title, @author, @fileName, @filePath, @addedAt, @lastOpenedAt)`
      )
      .run({
        id,
        title: input.title,
        author: input.author ?? null,
        fileName: input.fileName,
        filePath: input.filePath,
        addedAt: now,
        lastOpenedAt: now
      });

    const book = this.getBook(id);
    if (!book) {
      throw new Error("Book import failed.");
    }
    return book;
  }

  updateBookMetadata(
    bookId: string,
    metadata: Pick<BookRecord, "title" | "author">
  ): BookRecord {
    this.db
      .prepare(
        `update books
         set title = coalesce(nullif(@title, ''), title),
             author = nullif(@author, '')
         where id = @bookId`
      )
      .run({
        bookId,
        title: metadata.title,
        author: metadata.author ?? null
      });

    const book = this.getBook(bookId);
    if (!book) {
      throw new Error("Book not found.");
    }
    return book;
  }

  markBookOpened(bookId: string): void {
    this.db
      .prepare("update books set lastOpenedAt = ? where id = ?")
      .run(new Date().toISOString(), bookId);
  }

  getReadingLocation(bookId: string): ReadingLocation | null {
    const row = this.db
      .prepare("select bookId, cfi, updatedAt from reading_locations where bookId = ?")
      .get(bookId) as ReadingLocation | undefined;
    return row ?? null;
  }

  saveReadingLocation(bookId: string, cfi: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `insert into reading_locations (bookId, cfi, updatedAt)
         values (?, ?, ?)
         on conflict(bookId) do update set cfi = excluded.cfi, updatedAt = excluded.updatedAt`
      )
      .run(bookId, cfi, now);
  }

  listAnnotations(bookId: string): AnnotationRecord[] {
    return this.db
      .prepare(
        `select id, bookId, type, cfiRange, selectedText, color, noteText, createdAt, updatedAt
         from annotations
         where bookId = ?
         order by createdAt asc`
      )
      .all(bookId) as AnnotationRecord[];
  }

  createAnnotation(input: AnnotationInput): AnnotationRecord {
    const now = new Date().toISOString();
    const annotation: AnnotationRecord = {
      id: randomUUID(),
      bookId: input.bookId,
      type: input.type,
      cfiRange: input.cfiRange,
      selectedText: input.selectedText,
      color: input.color ?? "#ffd966",
      noteText: input.noteText,
      createdAt: now,
      updatedAt: now
    };

    this.db
      .prepare(
        `insert into annotations
         (id, bookId, type, cfiRange, selectedText, color, noteText, createdAt, updatedAt)
         values (@id, @bookId, @type, @cfiRange, @selectedText, @color, @noteText, @createdAt, @updatedAt)`
      )
      .run({
        ...annotation,
        noteText: annotation.noteText ?? null
      });

    return annotation;
  }

  removeAnnotation(annotationId: string): void {
    this.db.prepare("delete from annotations where id = ?").run(annotationId);
  }

  exportAnnotations(bookId: string): ExportedAnnotations {
    return {
      schemaVersion: 1,
      bookId,
      exportedAt: new Date().toISOString(),
      annotations: this.listAnnotations(bookId)
    };
  }

  importAnnotations(bookId: string, annotations: AnnotationInput[]): AnnotationRecord[] {
    const create = this.db.transaction((items: AnnotationInput[]) =>
      items.map((annotation) =>
        this.createAnnotation({
          ...annotation,
          bookId
        })
      )
    );
    return create(annotations);
  }

  getSettings(): AppSettings {
    const row = this.db
      .prepare("select key, value from settings where key = 'app'")
      .get() as SettingsRow | undefined;

    const parsed = row ? (JSON.parse(row.value) as AppSettings) : DEFAULT_SETTINGS;
    return sanitizeSettings(mergeSettings(parsed));
  }

  getSettingsWithSecrets(): AppSettings {
    const row = this.db
      .prepare("select key, value from settings where key = 'app'")
      .get() as SettingsRow | undefined;

    const parsed = row ? (JSON.parse(row.value) as AppSettings) : DEFAULT_SETTINGS;
    return resolveSettingsSecrets(mergeSettings(parsed));
  }

  saveSettings(settings: AppSettings): AppSettings {
    const current = this.getSettingsWithSecrets();
    const merged = mergeSettings(settings);
    const persisted: AppSettings = {
      ...merged,
      providers: { ...merged.providers }
    };

    for (const providerId of Object.keys(persisted.providers) as Array<
      keyof AppSettings["providers"]
    >) {
      const incoming = persisted.providers[providerId];
      const previous = current.providers[providerId];

      if (incoming.clearApiKey) {
        delete incoming.apiKey;
        incoming.apiKeyStored = false;
      } else if (incoming.apiKey?.trim()) {
        incoming.apiKey = encryptSecret(incoming.apiKey.trim());
        incoming.apiKeyStored = true;
      } else if (previous.apiKey) {
        incoming.apiKey = encryptSecret(previous.apiKey);
        incoming.apiKeyStored = true;
      } else {
        delete incoming.apiKey;
        incoming.apiKeyStored = false;
      }

      delete incoming.clearApiKey;
    }

    this.db
      .prepare(
        `insert into settings (key, value)
         values ('app', @value)
         on conflict(key) do update set value = excluded.value`
      )
      .run({ value: JSON.stringify(persisted) });

    return this.getSettings();
  }

  private migrate(): void {
    this.db.exec(`
      create table if not exists books (
        id text primary key,
        title text not null,
        author text,
        fileName text not null,
        filePath text not null,
        addedAt text not null,
        lastOpenedAt text
      );

      create table if not exists reading_locations (
        bookId text primary key,
        cfi text not null,
        updatedAt text not null,
        foreign key(bookId) references books(id) on delete cascade
      );

      create table if not exists annotations (
        id text primary key,
        bookId text not null,
        type text not null,
        cfiRange text not null,
        selectedText text not null,
        color text not null,
        noteText text,
        createdAt text not null,
        updatedAt text not null,
        foreign key(bookId) references books(id) on delete cascade
      );

      create table if not exists settings (
        key text primary key,
        value text not null
      );

      create table if not exists conversations (
        id text primary key,
        bookId text,
        title text,
        createdAt text not null,
        updatedAt text not null
      );

      create table if not exists messages (
        id text primary key,
        conversationId text not null,
        role text not null,
        content text not null,
        createdAt text not null,
        foreign key(conversationId) references conversations(id) on delete cascade
      );
    `);
  }

  private toPublicBook(row: BookRow): BookRecord {
    return {
      id: row.id,
      title: row.title,
      author: row.author,
      fileName: row.fileName,
      readerUrl: `silkroad-book://book/${encodeURIComponent(row.id)}.epub`,
      addedAt: row.addedAt,
      lastOpenedAt: row.lastOpenedAt
    };
  }
}

function mergeSettings(settings: Partial<AppSettings>): AppSettings {
  const providers: AppSettings["providers"] = { ...DEFAULT_SETTINGS.providers };
  const incomingProviders = (settings.providers ?? {}) as Partial<
    AppSettings["providers"]
  >;

  for (const providerId of Object.keys(DEFAULT_SETTINGS.providers) as Array<
    keyof AppSettings["providers"]
  >) {
    providers[providerId] = sanitizeProviderSettings({
      ...DEFAULT_SETTINGS.providers[providerId],
      ...incomingProviders[providerId]
    });
  }

  return {
    defaultChatProvider:
      settings.defaultChatProvider ?? DEFAULT_SETTINGS.defaultChatProvider,
    providers
  };
}

function sanitizeProviderSettings(provider: ProviderSettings): ProviderSettings {
  return {
    id: provider.id,
    label: provider.label,
    enabled: provider.enabled,
    model: provider.model,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    apiKeyStored: provider.apiKeyStored,
    clearApiKey: provider.clearApiKey,
    experimental: provider.experimental
  };
}

function sanitizeSettings(settings: AppSettings): AppSettings {
  const sanitized: AppSettings = {
    ...settings,
    providers: { ...settings.providers }
  };

  for (const providerId of Object.keys(sanitized.providers) as Array<
    keyof AppSettings["providers"]
  >) {
    const provider = { ...sanitized.providers[providerId] };
    provider.apiKeyStored = Boolean(provider.apiKey);
    delete provider.apiKey;
    sanitized.providers[providerId] = provider;
  }

  return sanitized;
}

function resolveSettingsSecrets(settings: AppSettings): AppSettings {
  const resolved: AppSettings = {
    ...settings,
    providers: { ...settings.providers }
  };

  for (const providerId of Object.keys(resolved.providers) as Array<
    keyof AppSettings["providers"]
  >) {
    const provider = { ...resolved.providers[providerId] };
    if (provider.apiKey) {
      provider.apiKey = decryptSecret(provider.apiKey);
      provider.apiKeyStored = Boolean(provider.apiKey);
    }
    resolved.providers[providerId] = provider;
  }

  return resolved;
}
