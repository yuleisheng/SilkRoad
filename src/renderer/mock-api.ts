import { DEFAULT_SETTINGS } from "../shared/default-settings";
import { shouldUseWebSearch } from "../shared/search-intent";
import type {
  AiDiscussionRecord,
  AnnotationInput,
  AnnotationRecord,
  AppSettings,
  BookRecord,
  ChatMessage,
  ExportedAnnotations,
  ImportAnnotationsPayload,
  ProviderHealth,
  ProviderKind,
  ReadingLocation,
  SilkRoadAPI
} from "../shared/types";

const now = new Date().toISOString();

const demoBooks: BookRecord[] = [
  {
    id: "demo-silk-road",
    title: "The Silk Roads",
    author: "Demo Library",
    fileName: "the-silk-roads.epub",
    readerUrl: "mock-book://demo-silk-road",
    addedAt: now,
    lastOpenedAt: now
  },
  {
    id: "demo-essays",
    title: "Notes on Reading",
    author: "SilkRoad Samples",
    fileName: "notes-on-reading.epub",
    readerUrl: "mock-book://demo-essays",
    addedAt: now
  }
];

let settings: AppSettings = {
  ...DEFAULT_SETTINGS,
  providers: {
    ...DEFAULT_SETTINGS.providers,
    openrouter: {
      ...DEFAULT_SETTINGS.providers.openrouter,
      model: "openai/gpt-4o-mini",
      apiKeyStored: true
    },
    "ollama-cloud": {
      ...DEFAULT_SETTINGS.providers["ollama-cloud"],
      model: "glm-5.2",
      apiKeyStored: true
    }
  }
};

let annotations: AnnotationRecord[] = [
  {
    id: "demo-highlight",
    bookId: "demo-silk-road",
    type: "highlight",
    cfiRange: "mock-cfi-highlight",
    selectedText: "Empires were connected by fragile threads of trade, language, and memory.",
    color: "#f6c85f",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "demo-note",
    bookId: "demo-silk-road",
    type: "note",
    cfiRange: "mock-cfi-note",
    selectedText: "A route is also a habit of attention.",
    color: "#c9c5ff",
    noteText: "Nice framing for the app: reading as attention, not collection.",
    createdAt: now,
    updatedAt: now
  }
];

let aiDiscussions: AiDiscussionRecord[] = [];
let aiDiscussionMessages: Record<string, ChatMessage[]> = {};

export function installMockApiIfNeeded(): void {
  if (window.silkroad) {
    return;
  }

  if (!new URLSearchParams(window.location.search).has("demo")) {
    return;
  }

  window.silkroad = createMockApi();
}

function createMockApi(): SilkRoadAPI {
  return {
    books: {
      list: async () => demoBooks,
      import: async () => demoBooks[0],
      updateMetadata: async (bookId, metadata) => {
        const book = demoBooks.find((item) => item.id === bookId);
        if (!book) {
          throw new Error("Demo book not found.");
        }
        Object.assign(book, metadata);
        return book;
      },
      markOpened: async () => undefined
    },
    reading: {
      getLocation: async (bookId): Promise<ReadingLocation> => ({
        bookId,
        cfi: "mock-cfi-start",
        updatedAt: now
      }),
      saveLocation: async () => undefined
    },
    annotations: {
      list: async (bookId) => annotations.filter((item) => item.bookId === bookId),
      create: async (input: AnnotationInput) => {
        const annotation: AnnotationRecord = {
          id: crypto.randomUUID(),
          color: input.color ?? "#f6c85f",
          noteText: input.noteText,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...input
        };
        annotations = [...annotations, annotation];
        return annotation;
      },
      remove: async (annotationId) => {
        annotations = annotations.filter((item) => item.id !== annotationId);
      },
      export: async (bookId): Promise<ExportedAnnotations> => ({
        schemaVersion: 1,
        bookId,
        exportedAt: new Date().toISOString(),
        annotations: annotations.filter((item) => item.bookId === bookId)
      }),
      import: async (payload: ImportAnnotationsPayload) => {
        const imported = payload.annotations.map((item) => ({
          id: crypto.randomUUID(),
          color: item.color ?? "#f6c85f",
          noteText: item.noteText,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...item,
          bookId: payload.bookId
        }));
        annotations = [...annotations, ...imported];
        return imported;
      }
    },
    aiDiscussions: {
      list: async (bookId) => aiDiscussions.filter((item) => item.bookId === bookId),
      create: async (input) => {
        const discussion: AiDiscussionRecord = {
          id: crypto.randomUUID(),
          title: input.title ?? input.selectedText.slice(0, 80),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...input
        };
        aiDiscussions = [discussion, ...aiDiscussions];
        aiDiscussionMessages[discussion.id] = [];
        return discussion;
      },
      messages: async (discussionId) => aiDiscussionMessages[discussionId] ?? [],
      addMessage: async (discussionId, message) => {
        aiDiscussionMessages = {
          ...aiDiscussionMessages,
          [discussionId]: [...(aiDiscussionMessages[discussionId] ?? []), message]
        };
      }
    },
    settings: {
      get: async () => settings,
      update: async (nextSettings: AppSettings) => {
        settings = nextSettings;
        return settings;
      },
      validate: async (providerId: ProviderKind): Promise<ProviderHealth> => ({
        ok: Boolean(settings.providers[providerId]),
        message: "Demo provider settings look ready."
      })
    },
    ai: {
      chat: async (request) => {
        const userMessage = request.messages
          .filter((message: ChatMessage) => message.role === "user")
          .at(-1);
        const providerId = request.providerId ?? settings.defaultChatProvider;
        const usesSearch =
          ["openrouter", "ollama-cloud"].includes(providerId) &&
          shouldUseWebSearch(userMessage?.content ?? "");

        const content = formatDemoAssistantMessage(
          userMessage?.content || "the selected text"
        );

        return {
          searchResults: usesSearch
            ? [
                {
                  title: "Demo search result",
                  url: "https://example.com/silk-road",
                  snippet: "A compact source summary appears here.",
                  source: "injected"
                }
              ]
            : [],
          message: {
            id: crypto.randomUUID(),
            role: "assistant",
            content,
            createdAt: new Date().toISOString()
          }
        };
      },
      streamChat: (request, handlers) => {
        let cancelled = false;
        const userMessage = request.messages
          .filter((message: ChatMessage) => message.role === "user")
          .at(-1);
        const providerId = request.providerId ?? settings.defaultChatProvider;
        const usesSearch =
          ["openrouter", "ollama-cloud"].includes(providerId) &&
          shouldUseWebSearch(userMessage?.content ?? "");
        const searchResults = usesSearch
          ? [
              {
                title: "Demo search result",
                url: "https://example.com/silk-road",
                snippet: "A compact source summary appears here.",
                source: "injected" as const
              }
            ]
          : [];
        const content = formatDemoAssistantMessage(
          userMessage?.content || "the selected text"
        );
        const chunks = content.match(/[\s\S]{1,12}/g) ?? [content];

        if (searchResults.length) {
          handlers.onSearchResults?.(searchResults);
        }

        chunks.forEach((chunk, index) => {
          window.setTimeout(() => {
            if (cancelled) {
              return;
            }
            handlers.onDelta?.(chunk);
            if (index === chunks.length - 1) {
              handlers.onDone?.({
                searchResults,
                message: {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content,
                  createdAt: new Date().toISOString(),
                  status: "complete"
                }
              });
            }
          }, 80 * (index + 1));
        });

        return () => {
          cancelled = true;
        };
      },
      translate: async (request) => ({
        providerId: request.providerId ?? settings.defaultChatProvider,
        text: "这段文字会在这里显示成翻译结果。"
      })
    },
    translation: {
      translate: async () => ({
        providerId: "apple-system",
        text: "这段文字会在这里显示成系统翻译结果。"
      }),
      dismiss: async () => {},
      onDismissed: () => () => {}
    }
  };
}

function formatDemoAssistantMessage(prompt: string): string {
  return [
    `This is a **reading note** for: ${prompt}`,
    "",
    "> A route is also a habit of attention.",
    "",
    "- It connects the passage to the chapter's larger theme.",
    "- It keeps the answer compact enough for the side panel.",
    "- Inline `code-style` text and links like https://example.com render safely."
  ].join("\n");
}
