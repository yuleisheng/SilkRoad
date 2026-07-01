import { contextBridge, ipcRenderer } from "electron";
import type {
  AnnotationInput,
  AppSettings,
  ChatRequest,
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
    translate: (request: TranslateRequest) => ipcRenderer.invoke("ai:translate", request)
  },
  translation: {
    translate: (request: TranslateRequest) =>
      ipcRenderer.invoke("translation:translate", request)
  }
};

contextBridge.exposeInMainWorld("silkroad", api);
