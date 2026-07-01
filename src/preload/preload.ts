import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type {
  AnnotationInput,
  AppSettings,
  ChatRequest,
  ChatStreamEvent,
  ChatStreamHandlers,
  ImportAnnotationsPayload,
  ProviderKind,
  SilkRoadAPI,
  TranslateRequest
} from "../shared/types";

const api: SilkRoadAPI = {
  books: {
    list: () => ipcRenderer.invoke("books:list"),
    import: () => ipcRenderer.invoke("books:import"),
    updateMetadata: (bookId, metadata) =>
      ipcRenderer.invoke("books:updateMetadata", bookId, metadata),
    markOpened: (bookId) => ipcRenderer.invoke("books:markOpened", bookId)
  },
  reading: {
    getLocation: (bookId) => ipcRenderer.invoke("reading:getLocation", bookId),
    saveLocation: (bookId, cfi) =>
      ipcRenderer.invoke("reading:saveLocation", bookId, cfi)
  },
  annotations: {
    list: (bookId) => ipcRenderer.invoke("annotations:list", bookId),
    create: (input: AnnotationInput) => ipcRenderer.invoke("annotations:create", input),
    remove: (annotationId) => ipcRenderer.invoke("annotations:remove", annotationId),
    export: (bookId) => ipcRenderer.invoke("annotations:export", bookId),
    import: (payload: ImportAnnotationsPayload) =>
      ipcRenderer.invoke("annotations:import", payload)
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    update: (settings: AppSettings) => ipcRenderer.invoke("settings:update", settings),
    validate: (providerId: ProviderKind) =>
      ipcRenderer.invoke("settings:validate", providerId)
  },
  ai: {
    chat: (request: ChatRequest) => ipcRenderer.invoke("ai:chat", request),
    streamChat: (request: ChatRequest, handlers: ChatStreamHandlers) => {
      const streamId = createStreamId();
      const channel = `ai:chat:stream:${streamId}`;
      let completed = false;
      let listener: (event: IpcRendererEvent, payload: ChatStreamEvent) => void;

      const removeListener = () => {
        ipcRenderer.removeListener(channel, listener);
      };

      listener = (_event: IpcRendererEvent, payload: ChatStreamEvent) => {
        if (payload.type === "search-results") {
          handlers.onSearchResults?.(payload.searchResults);
          return;
        }

        if (payload.type === "delta") {
          handlers.onDelta?.(payload.delta);
          return;
        }

        completed = true;
        removeListener();

        if (payload.type === "done") {
          handlers.onDone?.(payload.response);
          return;
        }

        handlers.onError?.(payload.message);
      };

      ipcRenderer.on(channel, listener);
      void ipcRenderer
        .invoke("ai:chat:stream", streamId, request)
        .then(() => {
          if (!completed) {
            completed = true;
            removeListener();
            handlers.onError?.("Chat stream ended before a response was returned.");
          }
        })
        .catch((error) => {
          if (completed) {
            return;
          }
          completed = true;
          removeListener();
          handlers.onError?.(error instanceof Error ? error.message : String(error));
        });

      return () => {
        removeListener();
        if (!completed) {
          completed = true;
          ipcRenderer.send("ai:chat:stream:cancel", streamId);
        }
      };
    },
    translate: (request: TranslateRequest) => ipcRenderer.invoke("ai:translate", request)
  },
  translation: {
    translate: (request: TranslateRequest) =>
      ipcRenderer.invoke("translation:translate", request),
    dismiss: () => ipcRenderer.invoke("translation:dismiss")
  }
};

contextBridge.exposeInMainWorld("silkroad", api);

function createStreamId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}
