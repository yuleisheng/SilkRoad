import ePub from "epubjs";
import {
  ChevronLeft,
  ChevronRight,
  Highlighter,
  Languages,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  Save,
  Search,
  StickyNote,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  AnnotationRecord,
  AppSettings,
  BookRecord,
  ChatMessage,
  ReaderContext
} from "../../shared/types";

interface ReaderViewProps {
  book: BookRecord;
  settings: AppSettings;
  onBack(): void;
  onBookUpdated(book: BookRecord): void;
}

interface ActiveSelection {
  cfiRange: string;
  text: string;
  chapterText: string;
  toolbarPosition?: {
    left: number;
    top: number;
  };
}

type SideTab = "annotations" | "ai";

interface TranslationPopover {
  status: "loading" | "ready" | "error";
  text?: string;
  error?: string;
  position?: ActiveSelection["toolbarPosition"];
}

export function ReaderView({ book, settings, onBack, onBookUpdated }: ReaderViewProps) {
  const bookPaneRef = useRef<HTMLDivElement | null>(null);
  const selectionToolbarRef = useRef<HTMLDivElement | null>(null);
  const translationPopoverRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const renditionRef = useRef<any>(null);
  const epubRef = useRef<any>(null);
  const activeContentsRef = useRef<any>(null);
  const contentsPointerCleanupRef = useRef<(() => void) | null>(null);
  const translationRequestIdRef = useRef(0);
  const isMockReader = book.readerUrl.startsWith("mock-book://");
  const [annotations, setAnnotations] = useState<AnnotationRecord[]>([]);
  const [selection, setSelection] = useState<ActiveSelection | null>(null);
  const [selectionUiVisible, setSelectionUiVisible] = useState(false);
  const [currentChapterText, setCurrentChapterText] = useState("");
  const [sideTab, setSideTab] = useState<SideTab>(getInitialSideTab);
  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [noteDraft, setNoteDraft] = useState("");
  const [translationPopover, setTranslationPopover] =
    useState<TranslationPopover | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [useWebSearch, setUseWebSearch] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readerStatus, setReaderStatus] = useState<"idle" | "loading" | "ready">(
    "idle"
  );

  useEffect(() => {
    function handleDocumentPointerDown(event: PointerEvent) {
      if (!selection) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (selectionToolbarRef.current?.contains(target)) {
        return;
      }

      if (translationPopoverRef.current?.contains(target)) {
        return;
      }

      dismissSelectionUi({
        clearContext: !target.closest(".reader-side")
      });
    }

    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
    };
  }, [selection]);

  useEffect(() => {
    let disposed = false;

    async function bootReader() {
      if (isMockReader) {
        dismissSelectionUi({ clearContext: true });
        setReaderStatus("loading");
        const storedAnnotations = await window.silkroad.annotations.list(book.id);
        const initialTab = getInitialSideTab();
        if (disposed) {
          return;
        }

        setAnnotations(storedAnnotations);
        setCurrentChapterText(DEMO_CHAPTER_TEXT);
        setSelection({
          cfiRange: "mock-cfi-selection",
          text: "A route is also a habit of attention.",
          chapterText: DEMO_CHAPTER_TEXT,
          toolbarPosition: { left: 430, top: 438 }
        });
        setSelectionUiVisible(true);
        setSideTab(initialTab);
        if (initialTab === "ai") {
          setMessages([
            {
              id: "demo-user-message",
              role: "user",
              content: "Explain this passage in plain language.",
              createdAt: new Date().toISOString()
            },
            {
              id: "demo-assistant-message",
              role: "assistant",
              content:
                "It means a route is more than geography: it trains what people notice, remember, translate, and connect.",
              createdAt: new Date().toISOString()
            }
          ]);
        }
        setReaderStatus("ready");
        return;
      }

      if (!viewerRef.current) {
        return;
      }

      setError(null);
      setReaderStatus("loading");
      dismissSelectionUi({ clearContext: true });
      setTranslationPopover(null);
      setCurrentChapterText("");
      viewerRef.current.innerHTML = "";

      const [location, storedAnnotations] = await Promise.all([
        window.silkroad.reading.getLocation(book.id),
        window.silkroad.annotations.list(book.id),
        window.silkroad.books.markOpened(book.id)
      ]);
      if (disposed) {
        return;
      }

      setAnnotations(storedAnnotations);
      const epubBook = ePub(book.readerUrl, {
        openAs: "epub"
      });
      epubRef.current = epubBook;

      epubBook.on?.("openFailed", (reason: unknown) => {
        setReaderStatus("idle");
        setError(formatReaderError("Failed to open EPUB", reason));
      });
      epubBook.on?.("loadFailed", (reason: unknown) => {
        setReaderStatus("idle");
        setError(formatReaderError("Failed to load EPUB resource", reason));
      });

      const rendition = epubBook.renderTo(viewerRef.current, {
        width: "100%",
        height: "100%",
        flow: "paginated",
        spread: "auto"
      });
      renditionRef.current = rendition;

      rendition.themes.default({
        body: {
          color: "#252337",
          "font-family": "Georgia, 'Times New Roman', serif",
          "line-height": "1.62"
        },
        "::selection": {
          background: "#c9c5ff"
        }
      });

      rendition.on("relocated", (relocation: any) => {
        const cfi = relocation?.start?.cfi;
        if (cfi) {
          void window.silkroad.reading.saveLocation(book.id, cfi);
        }
      });

      rendition.on("selected", (cfiRange: string, contents: any) => {
        const contentsSelection = contents?.window?.getSelection?.();
        const selectedText = contentsSelection?.toString?.().trim() ?? "";
        const chapterText = contents?.document?.body?.innerText ?? "";
        const toolbarPosition = getToolbarPosition(contents, bookPaneRef.current);

        if (selectedText) {
          activeContentsRef.current = contents;
          trackContentsPointerDismiss(contents);
          setSelection({ cfiRange, text: selectedText, chapterText, toolbarPosition });
          setSelectionUiVisible(true);
          setCurrentChapterText(chapterText);
        }
      });

      await rendition.display(location?.cfi);
      setReaderStatus("ready");

      for (const annotation of storedAnnotations) {
        paintAnnotation(annotation);
      }

      const metadata = await epubBook.loaded.metadata;
      const title = metadata?.title?.trim?.() || book.title;
      const author = parseCreator(metadata?.creator);
      if ((title && title !== book.title) || (author && author !== book.author)) {
        const updated = await window.silkroad.books.updateMetadata(book.id, {
          title,
          author
        });
        onBookUpdated(updated);
      }
    }

    void bootReader().catch((caught) => {
      setReaderStatus("idle");
      setError(caught instanceof Error ? caught.message : String(caught));
    });

    return () => {
      disposed = true;
      clearSelectionTracking();
      renditionRef.current?.destroy?.();
      epubRef.current?.destroy?.();
      renditionRef.current = null;
      epubRef.current = null;
    };
  }, [book.id, book.readerUrl, isMockReader]);

  async function createHighlight(type: "highlight" | "note", noteText?: string) {
    if (!selection) {
      return;
    }

    const annotation = await window.silkroad.annotations.create({
      bookId: book.id,
      type,
      cfiRange: selection.cfiRange,
      selectedText: selection.text,
      color: type === "note" ? "#c9c5ff" : "#f6c85f",
      noteText
    });
    setAnnotations((current) => [...current, annotation]);
    paintAnnotation(annotation);
    dismissSelectionUi({ clearContext: true });
    setNoteDraft("");
  }

  async function removeAnnotation(annotation: AnnotationRecord) {
    await window.silkroad.annotations.remove(annotation.id);
    renditionRef.current?.annotations?.remove?.(annotation.cfiRange, "highlight");
    setAnnotations((current) => current.filter((item) => item.id !== annotation.id));
  }

  async function translateSelection() {
    if (!selection) {
      return;
    }

    const popoverPosition = getPopoverPosition(selection);
    const translationRequestId = translationRequestIdRef.current + 1;
    translationRequestIdRef.current = translationRequestId;
    setBusy(true);
    setError(null);
    dismissSelectionUi({ cancelTranslation: false });
    setTranslationPopover({
      status: "loading",
      position: popoverPosition
    });
    try {
      const response = await window.silkroad.translation.translate({
        text: selection.text,
        targetLanguage: settings.targetLanguage,
        context: getReaderContext()
      });
      if (translationRequestIdRef.current !== translationRequestId) {
        return;
      }
      setTranslationPopover({
        status: "ready",
        text: response.text,
        position: popoverPosition
      });
    } catch (caught) {
      if (translationRequestIdRef.current !== translationRequestId) {
        return;
      }
      setTranslationPopover({
        status: "error",
        error: formatTranslationError(caught),
        position: popoverPosition
      });
    } finally {
      setBusy(false);
    }
  }

  async function sendChat() {
    const content = aiInput.trim();
    if (!content) {
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      createdAt: new Date().toISOString()
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setAiInput("");
    setBusy(true);
    setError(null);
    setSideTab("ai");
    setSidePanelOpen(true);

    try {
      const response = await window.silkroad.ai.chat({
        messages: nextMessages,
        context: getReaderContext(),
        useWebSearch,
        providerId: settings.defaultChatProvider,
        searchProviderId: settings.defaultSearchProvider
      });
      setMessages((current) => [...current, response.message]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  function getReaderContext(): ReaderContext {
    return {
      bookTitle: book.title,
      selectedText: selection?.text ?? "",
      currentChapterText: selection?.chapterText || currentChapterText
    };
  }

  function paintAnnotation(annotation: AnnotationRecord) {
    const rendition = renditionRef.current;
    if (!rendition?.annotations?.highlight) {
      return;
    }

    try {
      rendition.annotations.highlight(
        annotation.cfiRange,
        { id: annotation.id, type: annotation.type },
        undefined,
        "highlight",
        {
          fill: annotation.color,
          "fill-opacity": "0.34",
          "mix-blend-mode": "multiply"
        }
      );
    } catch {
      // epub.js can reject highlights before an iframe is fully ready.
    }
  }

  function openSideTab(tab: SideTab) {
    setSideTab(tab);
    setSidePanelOpen(true);
    dismissSelectionUi();
  }

  function dismissSelectionUi({
    clearContext = false,
    cancelTranslation = true
  } = {}) {
    clearNativeSelection();
    setSelectionUiVisible(false);
    if (cancelTranslation) {
      translationRequestIdRef.current += 1;
      setTranslationPopover(null);
    }

    if (clearContext) {
      setSelection(null);
      setNoteDraft("");
      clearSelectionTracking();
    }
  }

  function clearNativeSelection() {
    activeContentsRef.current?.window?.getSelection?.()?.removeAllRanges?.();
    window.getSelection()?.removeAllRanges?.();
  }

  function clearSelectionTracking() {
    contentsPointerCleanupRef.current?.();
    contentsPointerCleanupRef.current = null;
    activeContentsRef.current = null;
  }

  function trackContentsPointerDismiss(contents: any) {
    contentsPointerCleanupRef.current?.();

    const documentElement = contents?.document;
    if (!documentElement?.addEventListener) {
      contentsPointerCleanupRef.current = null;
      return;
    }

    const handleContentsPointerDown = () => {
      dismissSelectionUi({ clearContext: true });
    };

    documentElement.addEventListener("pointerdown", handleContentsPointerDown, true);
    contentsPointerCleanupRef.current = () => {
      documentElement.removeEventListener("pointerdown", handleContentsPointerDown, true);
    };
  }

  function getPopoverPosition(activeSelection: ActiveSelection) {
    const position = activeSelection.toolbarPosition;
    if (!position) {
      return undefined;
    }

    return {
      left: position.left,
      top: Math.max(132, position.top)
    };
  }

  return (
    <section className="reader-view">
      <header className="reader-bar">
        <div className="reader-title">
          <button className="icon-button" title="返回书库" onClick={onBack}>
            <ChevronLeft size={19} />
          </button>
          <div>
            <h1>{book.title}</h1>
            <p>{book.author || book.fileName}</p>
          </div>
        </div>
      </header>

      <div className={sidePanelOpen ? "reader-body" : "reader-body side-collapsed"}>
        <div ref={bookPaneRef} className="book-pane">
          {readerStatus === "loading" ? (
            <div className="reader-loading">Loading EPUB...</div>
          ) : null}
          {error ? <div className="reader-error">{error}</div> : null}
          {selection && selectionUiVisible ? (
            <div
              ref={selectionToolbarRef}
              className={`selection-toolbar${
                selection.toolbarPosition ? " positioned" : ""
              }`}
              style={
                selection.toolbarPosition
                  ? {
                      left: selection.toolbarPosition.left,
                      top: selection.toolbarPosition.top
                    }
                  : undefined
              }
            >
              <button onClick={() => void createHighlight("highlight")}>
                <Highlighter size={16} />
                高亮
              </button>
              <button onClick={() => openSideTab("annotations")}>
                <StickyNote size={16} />
                Note
              </button>
              <button onClick={() => void translateSelection()}>
                <Languages size={16} />
                翻译
              </button>
              <button onClick={() => openSideTab("ai")}>
                <MessageSquare size={16} />
                AI
              </button>
            </div>
          ) : null}
          {translationPopover ? (
            <div
              ref={translationPopoverRef}
              className={`translation-popover${
                translationPopover.position ? " positioned" : ""
              }`}
              style={
                translationPopover.position
                  ? {
                      left: translationPopover.position.left,
                      top: translationPopover.position.top
                    }
                  : undefined
              }
            >
              <div className="translation-popover-label">
                {settings.targetLanguage}
              </div>
              <div className="translation-popover-body">
                {translationPopover.status === "loading"
                  ? "翻译中..."
                  : translationPopover.status === "error"
                    ? translationPopover.error
                    : translationPopover.text}
              </div>
            </div>
          ) : null}
          {isMockReader ? <DemoReaderPage /> : <div ref={viewerRef} className="epub-viewer" />}
          <div className="page-controls" aria-label="阅读导航">
            <button
              className="icon-button page-button"
              title="上一页"
              onClick={() => renditionRef.current?.prev?.()}
              disabled={isMockReader || readerStatus !== "ready"}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="icon-button page-button"
              title="下一页"
              onClick={() => renditionRef.current?.next?.()}
              disabled={isMockReader || readerStatus !== "ready"}
            >
              <ChevronRight size={18} />
            </button>
            <button
              className="icon-button page-button"
              title={sidePanelOpen ? "隐藏侧栏" : "显示侧栏"}
              onClick={() => setSidePanelOpen((current) => !current)}
            >
              {sidePanelOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
            </button>
          </div>
        </div>

        {sidePanelOpen ? (
          <aside className="reader-side">
            <div className="tabs">
              <button
                className={sideTab === "annotations" ? "active" : ""}
                onClick={() => setSideTab("annotations")}
              >
                Notes
              </button>
              <button
                className={sideTab === "ai" ? "active" : ""}
                onClick={() => setSideTab("ai")}
              >
                AI
              </button>
            </div>

            {error ? <div className="inline-error">{error}</div> : null}

            {sideTab === "annotations" ? (
              <div className="side-section">
                {selection ? (
                  <div className="note-composer">
                    <p>{selection.text}</p>
                    <textarea
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                    />
                    <button
                      className="primary-button"
                      onClick={() => void createHighlight("note", noteDraft)}
                      disabled={!noteDraft.trim()}
                    >
                      <Save size={16} />
                      保存 Note
                    </button>
                  </div>
                ) : null}

                <div className="annotation-list">
                  {annotations.map((annotation) => (
                    <article key={annotation.id} className="annotation-item">
                      <button
                        className="annotation-jump"
                        onClick={() => renditionRef.current?.display?.(annotation.cfiRange)}
                      >
                        <span className="annotation-type">
                          {annotation.type === "note" ? "Note" : "Highlight"}
                        </span>
                        <span>{annotation.selectedText}</span>
                        {annotation.noteText ? <strong>{annotation.noteText}</strong> : null}
                      </button>
                      <button
                        className="icon-button small"
                        title="删除"
                        onClick={() => void removeAnnotation(annotation)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {sideTab === "ai" ? (
              <div className="side-section ai-panel">
                <div className="message-list">
                  {messages.map((message) => (
                    <div key={message.id} className={`message ${message.role}`}>
                      {message.content}
                    </div>
                  ))}
                </div>

                {selection ? (
                  <div className="ai-context">
                    <div className="ai-context-quote">“{selection.text}”</div>
                    <div className="ai-context-chip">
                      <MessageSquare size={15} />
                      <span>1 selection</span>
                      <button
                        className="ai-context-clear"
                        title="移除选区上下文"
                        aria-label="移除选区上下文"
                        onClick={() => dismissSelectionUi({ clearContext: true })}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                ) : null}

                <label className="checkbox-row compact">
                  <input
                    type="checkbox"
                    checked={useWebSearch}
                    onChange={(event) => setUseWebSearch(event.target.checked)}
                  />
                  <Search size={15} />
                  Web search
                </label>

                <div className="chat-input">
                  <textarea
                    value={aiInput}
                    onChange={(event) => setAiInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                        void sendChat();
                      }
                    }}
                  />
                  <button
                    className="primary-button"
                    onClick={() => void sendChat()}
                    disabled={busy}
                  >
                    <MessageSquare size={16} />
                    发送
                  </button>
                </div>
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>
    </section>
  );
}

const DEMO_CHAPTER_TEXT = [
  "The road was never one road. It was a sequence of pauses, negotiations, translations, and borrowed shelter.",
  "Empires were connected by fragile threads of trade, language, and memory.",
  "A route is also a habit of attention."
].join("\n\n");

function DemoReaderPage() {
  return (
    <div className="epub-viewer mock-reader-page">
      <article>
        <h2>The Road As A Reading Machine</h2>
        <p>
          The road was never one road. It was a sequence of pauses,
          negotiations, translations, and borrowed shelter.
        </p>
        <p>
          <mark>Empires were connected by fragile threads of trade, language, and memory.</mark>
        </p>
        <p>
          <span className="mock-selection">A route is also a habit of attention.</span> The
          reader follows it by lingering, comparing, and asking better questions.
        </p>
      </article>
    </div>
  );
}

function parseCreator(creator: unknown): string | undefined {
  if (!creator) {
    return undefined;
  }
  if (typeof creator === "string") {
    return creator;
  }
  if (Array.isArray(creator)) {
    return creator.join(", ");
  }
  return String(creator);
}

function formatReaderError(label: string, reason: unknown): string {
  if (reason instanceof Error) {
    return `${label}: ${reason.message}`;
  }
  return `${label}: ${String(reason)}`;
}

function formatTranslationError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  return message
    .replace(/^Error invoking remote method 'translation:translate':\s*/u, "")
    .replace(/^Error:\s*/u, "");
}

function getToolbarPosition(
  contents: any,
  bookPane: HTMLDivElement | null
): ActiveSelection["toolbarPosition"] {
  const range = getSelectedRange(contents);
  const frame = contents?.document?.defaultView?.frameElement as HTMLElement | null;

  if (!range || !frame || !bookPane) {
    return undefined;
  }

  const selectionRect = getReadableRangeRect(range);
  if (!selectionRect) {
    return undefined;
  }

  const frameRect = frame.getBoundingClientRect();
  const paneRect = bookPane.getBoundingClientRect();
  const rawLeft = frameRect.left + selectionRect.left - paneRect.left + selectionRect.width / 2;
  const rawTop = frameRect.top + selectionRect.top - paneRect.top;
  const horizontalInset = Math.min(290, Math.max(24, paneRect.width / 2 - 12));

  return {
    left: clamp(rawLeft, horizontalInset, paneRect.width - horizontalInset),
    top: Math.max(58, rawTop)
  };
}

function getSelectedRange(contents: any): Range | null {
  const selection = contents?.window?.getSelection?.();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }
  return selection.getRangeAt(0);
}

function getReadableRangeRect(range: Range): DOMRect | null {
  const rects = Array.from(range.getClientRects());
  return (
    rects.find((rect) => rect.width > 0 && rect.height > 0) ??
    (range.getBoundingClientRect().width > 0 ? range.getBoundingClientRect() : null)
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getInitialSideTab(): SideTab {
  const tab = new URLSearchParams(window.location.search).get("demoTab");
  if (tab === "ai") {
    return "ai";
  }
  return "annotations";
}
