export type ProviderKind =
  | "openrouter"
  | "openai-compatible"
  | "ollama-cloud"
  | "codex-subscription";

export type TranslationProviderKind = ProviderKind | "apple-system";

export type AnnotationType = "highlight" | "note";

export interface BookRecord {
  id: string;
  title: string;
  author?: string;
  fileName: string;
  filePath?: string;
  readerUrl: string;
  addedAt: string;
  lastOpenedAt?: string;
}

export interface ReadingLocation {
  bookId: string;
  cfi: string;
  updatedAt: string;
}

export interface AnnotationRecord {
  id: string;
  bookId: string;
  type: AnnotationType;
  cfiRange: string;
  selectedText: string;
  color: string;
  noteText?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnnotationInput {
  bookId: string;
  type: AnnotationType;
  cfiRange: string;
  selectedText: string;
  color?: string;
  noteText?: string;
}

export interface ProviderSettings {
  id: ProviderKind;
  label: string;
  enabled: boolean;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  apiKeyStored?: boolean;
  clearApiKey?: boolean;
  experimental?: boolean;
}

export interface AppSettings {
  defaultChatProvider: ProviderKind;
  providers: Record<ProviderKind, ProviderSettings>;
}

export interface ProviderHealth {
  ok: boolean;
  message: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export interface SearchResult {
  title: string;
  url?: string;
  snippet: string;
  source: ProviderKind | "injected";
}

export interface ReaderContext {
  bookTitle?: string;
  selectedText: string;
  currentChapterText?: string;
}

export interface ChatRequest {
  providerId?: ProviderKind;
  messages: ChatMessage[];
  context: ReaderContext;
}

export interface ChatResponse {
  message: ChatMessage;
  searchResults: SearchResult[];
}

export interface TranslateRequest {
  providerId?: ProviderKind;
  text: string;
  context?: ReaderContext;
  anchorRect?: ScreenRect;
}

export interface TranslateResponse {
  text: string;
  providerId: TranslationProviderKind;
  ok?: boolean;
  error?: string;
  presentation?: "system-ui" | "text";
  replacement?: string;
}

export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImportAnnotationsPayload {
  bookId: string;
  annotations: AnnotationInput[];
}

export interface ExportedAnnotations {
  schemaVersion: 1;
  bookId: string;
  exportedAt: string;
  annotations: AnnotationRecord[];
}

export interface SilkRoadAPI {
  books: {
    list(): Promise<BookRecord[]>;
    import(): Promise<BookRecord | null>;
    updateMetadata(
      bookId: string,
      metadata: Pick<BookRecord, "title" | "author">
    ): Promise<BookRecord>;
    markOpened(bookId: string): Promise<void>;
  };
  reading: {
    getLocation(bookId: string): Promise<ReadingLocation | null>;
    saveLocation(bookId: string, cfi: string): Promise<void>;
  };
  annotations: {
    list(bookId: string): Promise<AnnotationRecord[]>;
    create(input: AnnotationInput): Promise<AnnotationRecord>;
    remove(annotationId: string): Promise<void>;
    export(bookId: string): Promise<ExportedAnnotations>;
    import(payload: ImportAnnotationsPayload): Promise<AnnotationRecord[]>;
  };
  settings: {
    get(): Promise<AppSettings>;
    update(settings: AppSettings): Promise<AppSettings>;
    validate(providerId: ProviderKind): Promise<ProviderHealth>;
  };
  ai: {
    chat(request: ChatRequest): Promise<ChatResponse>;
    translate(request: TranslateRequest): Promise<TranslateResponse>;
  };
  translation?: {
    translate(request: TranslateRequest): Promise<TranslateResponse>;
    dismiss(): Promise<void>;
  };
}
