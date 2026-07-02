import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  AiDiscussionInput,
  AiDiscussionRecord,
  AnnotationInput,
  AnnotationRecord,
  AppSettings,
  BookRecord,
  ChatMessage,
  ExportedAnnotations,
  ProviderSettings,
  ReadingLocation
} from "../../shared/types";
import { DEFAULT_SETTINGS } from "../../shared/default-settings";
import { isAppLanguage } from "../../shared/i18n";
import { decryptSecret, encryptSecret } from "../security/secure-store";

type BookRow = Omit<BookRecord, "readerUrl" | "coverImageUrl"> & {
  readerUrl?: string;
  coverPath?: string | null;
};
type SettingsRow = { key: string; value: string };
type MessageRow = Pick<ChatMessage, "id" | "role" | "content" | "createdAt">;

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
                , coverPath
         from books
         order by coalesce(lastOpenedAt, addedAt) desc`
      )
      .all() as BookRow[];

    return rows.map(this.toPublicBook);
  }

  listBooksMissingCovers(): Array<{ id: string; filePath: string }> {
    return this.db
      .prepare("select id, filePath from books where coverPath is null")
      .all() as Array<{ id: string; filePath: string }>;
  }

  getBook(bookId: string): BookRecord | null {
    const row = this.db
      .prepare(
        `select id, title, author, fileName, filePath, addedAt, lastOpenedAt
                , coverPath
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

  getBookCoverFilePath(bookId: string): string | null {
    const row = this.db
      .prepare("select coverPath from books where id = ?")
      .get(bookId) as { coverPath: string | null } | undefined;
    return row?.coverPath ?? null;
  }

  updateBookCoverPath(bookId: string, coverPath: string): void {
    this.db
      .prepare("update books set coverPath = @coverPath where id = @bookId")
      .run({ bookId, coverPath });
  }

  createBook(input: {
    id?: string;
    title: string;
    author?: string;
    fileName: string;
    filePath: string;
    coverPath?: string;
  }): BookRecord {
    const now = new Date().toISOString();
    const id = input.id ?? randomUUID();

    this.db
      .prepare(
        `insert into books (id, title, author, fileName, filePath, coverPath, addedAt, lastOpenedAt)
         values (@id, @title, @author, @fileName, @filePath, @coverPath, @addedAt, @lastOpenedAt)`
      )
      .run({
        id,
        title: input.title,
        author: input.author ?? null,
        fileName: input.fileName,
        filePath: input.filePath,
        coverPath: input.coverPath ?? "",
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

  listAiDiscussions(bookId: string): AiDiscussionRecord[] {
    return this.db
      .prepare(
        `select id, bookId, cfiRange, selectedText, title, createdAt, updatedAt
         from conversations
         where bookId = ?
           and cfiRange is not null
           and selectedText is not null
         order by updatedAt desc`
      )
      .all(bookId) as AiDiscussionRecord[];
  }

  createAiDiscussion(input: AiDiscussionInput): AiDiscussionRecord {
    const now = new Date().toISOString();
    const discussion: AiDiscussionRecord = {
      id: randomUUID(),
      bookId: input.bookId,
      cfiRange: input.cfiRange,
      selectedText: input.selectedText,
      title: input.title || createDiscussionTitle(input.selectedText),
      createdAt: now,
      updatedAt: now
    };

    this.db
      .prepare(
        `insert into conversations
         (id, bookId, title, cfiRange, selectedText, createdAt, updatedAt)
         values (@id, @bookId, @title, @cfiRange, @selectedText, @createdAt, @updatedAt)`
      )
      .run(discussion);

    return discussion;
  }

  listAiDiscussionMessages(discussionId: string): ChatMessage[] {
    const rows = this.db
      .prepare(
        `select id, role, content, createdAt
         from messages
         where conversationId = ?
         order by createdAt asc`
      )
      .all(discussionId) as MessageRow[];

    return rows.map((row) => ({
      ...row,
      status: "complete" as const
    }));
  }

  addAiDiscussionMessage(discussionId: string, message: ChatMessage): void {
    this.db
      .prepare(
        `insert into messages (id, conversationId, role, content, createdAt)
         values (@id, @conversationId, @role, @content, @createdAt)`
      )
      .run({
        id: message.id,
        conversationId: discussionId,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt
      });

    this.db
      .prepare("update conversations set updatedAt = ? where id = ?")
      .run(new Date().toISOString(), discussionId);
  }

  getSettings(): AppSettings {
    return sanitizeSettings(resolveSettingsSecrets(this.getPersistedSettings()));
  }

  getSettingsWithSecrets(): AppSettings {
    return resolveSettingsSecrets(this.getPersistedSettings());
  }

  private getPersistedSettings(): AppSettings {
    const row = this.db
      .prepare("select key, value from settings where key = 'app'")
      .get() as SettingsRow | undefined;

    const parsed = row ? (JSON.parse(row.value) as AppSettings) : DEFAULT_SETTINGS;
    return mergeSettings(parsed);
  }

  saveSettings(settings: AppSettings): AppSettings {
    const current = this.getPersistedSettings();
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
      } else if (incoming.apiKeyStored && previous.apiKey) {
        incoming.apiKey = previous.apiKey;
        incoming.apiKeyStored = true;
      } else {
        delete incoming.apiKey;
        incoming.apiKeyStored = false;
      }

      delete incoming.clearApiKey;
      delete incoming.apiKeyError;
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
        coverPath text,
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
        cfiRange text,
        selectedText text,
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

    this.addColumnIfMissing("books", "coverPath", "text");
    this.addColumnIfMissing("conversations", "cfiRange", "text");
    this.addColumnIfMissing("conversations", "selectedText", "text");
  }

  private addColumnIfMissing(tableName: string, columnName: string, columnType: string): void {
    const columns = this.db.prepare(`pragma table_info(${tableName})`).all() as Array<{
      name: string;
    }>;
    if (!columns.some((column) => column.name === columnName)) {
      this.db.prepare(`alter table ${tableName} add column ${columnName} ${columnType}`).run();
    }
  }

  private toPublicBook(row: BookRow): BookRecord {
    return {
      id: row.id,
      title: row.title,
      author: row.author,
      fileName: row.fileName,
      readerUrl: `silkroad-book://book/${encodeURIComponent(row.id)}.epub`,
      coverImageUrl: row.coverPath
        ? `silkroad-book://cover/${encodeURIComponent(row.id)}`
        : undefined,
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
    appLanguage: isAppLanguage(settings.appLanguage)
      ? settings.appLanguage
      : DEFAULT_SETTINGS.appLanguage,
    defaultChatProvider: isProviderKind(settings.defaultChatProvider)
      ? settings.defaultChatProvider
      : DEFAULT_SETTINGS.defaultChatProvider,
    providers
  };
}

function isProviderKind(providerId: unknown): providerId is keyof AppSettings["providers"] {
  return (
    typeof providerId === "string" &&
    Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS.providers, providerId)
  );
}

function sanitizeProviderSettings(provider: ProviderSettings): ProviderSettings {
  return {
    id: provider.id,
    label: provider.label,
    model: provider.model,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    apiKeyStored: provider.apiKeyStored,
    apiKeyError: provider.apiKeyError,
    clearApiKey: provider.clearApiKey
  };
}

function createDiscussionTitle(selectedText: string): string {
  return selectedText.trim().replace(/\s+/gu, " ").slice(0, 80);
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
      try {
        provider.apiKey = decryptSecret(provider.apiKey);
        provider.apiKeyStored = Boolean(provider.apiKey);
        delete provider.apiKeyError;
      } catch {
        delete provider.apiKey;
        provider.apiKeyStored = false;
        provider.apiKeyError = `${provider.label} API key could not be decrypted. Re-enter it in Settings.`;
      }
    }
    resolved.providers[providerId] = provider;
  }

  return resolved;
}
