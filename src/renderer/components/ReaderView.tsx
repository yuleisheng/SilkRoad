import ePub from "epubjs";
import {
  ChevronLeft,
  ChevronRight,
  Highlighter,
  Languages,
  MessageSquare,
  Save,
  Send,
  StickyNote,
  Trash2,
  X
} from "lucide-react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { TranslateFunction } from "../../shared/i18n";
import type {
  AnnotationRecord,
  AppSettings,
  BookRecord,
  ChatMessage,
  ReaderContext,
  ScreenRect
} from "../../shared/types";
import { MarkdownMessage } from "./MarkdownMessage";

interface ReaderViewProps {
  book: BookRecord;
  settings: AppSettings;
  t: TranslateFunction;
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
  anchorRect?: ScreenRect;
}

type SideTab = "annotations" | "ai";
type SelectionPopupMode = "actions" | "note";

interface TranslationPopover {
  status: "loading" | "ready" | "error";
  text?: string;
  error?: string;
  position?: ActiveSelection["toolbarPosition"];
}

export function ReaderView({
  book,
  settings,
  t,
  onBack,
  onBookUpdated
}: ReaderViewProps) {
  const bookPaneRef = useRef<HTMLDivElement | null>(null);
  const selectionToolbarRef = useRef<HTMLDivElement | null>(null);
  const translationPopoverRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const isMockReader = book.readerUrl.startsWith("mock-book://");
  const renditionRef = useRef<any>(null);
  const epubRef = useRef<any>(null);
  const activeContentsRef = useRef<any>(null);
  const contentsPointerCleanupRef = useRef<(() => void) | null>(null);
  const contentsKeyboardCleanupsRef = useRef<Map<any, () => void>>(new Map());
  const translationRequestIdRef = useRef(0);
  const systemTranslationVisibleRef = useRef(false);
  const chatStreamCleanupRef = useRef<(() => void) | null>(null);
  const readerStatusRef = useRef<"idle" | "loading" | "ready">("idle");
  const isMockReaderRef = useRef(isMockReader);
  const [annotations, setAnnotations] = useState<AnnotationRecord[]>([]);
  const [selection, setSelection] = useState<ActiveSelection | null>(null);
  const [selectionUiVisible, setSelectionUiVisible] = useState(false);
  const [selectionPopupMode, setSelectionPopupMode] =
    useState<SelectionPopupMode>("actions");
  const [currentChapterText, setCurrentChapterText] = useState("");
  const [sideTab, setSideTab] = useState<SideTab>(getInitialSideTab);
  const [noteDraft, setNoteDraft] = useState("");
  const [translationPopover, setTranslationPopover] =
    useState<TranslationPopover | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readerStatus, setReaderStatus] = useState<"idle" | "loading" | "ready">(
    "idle"
  );

  readerStatusRef.current = readerStatus;
  isMockReaderRef.current = isMockReader;

  useEffect(() => {
    function handleDocumentPointerDown(event: PointerEvent) {
      if (!selection && !translationPopover && !systemTranslationVisibleRef.current) {
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

      const translationVisible =
        Boolean(translationPopover) || systemTranslationVisibleRef.current;
      dismissSelectionUi({
        clearContext: translationVisible || !target.closest(".reader-side")
      });
    }

    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
    };
  }, [selection, translationPopover]);

  useEffect(
    () => () => {
      dismissSystemTranslation();
    },
    []
  );

  useEffect(() => {
    const unsubscribe = window.silkroad.translation?.onDismissed?.(() => {
      systemTranslationVisibleRef.current = false;
      setTranslationPopover(null);
      dismissSelectionUi({ clearContext: true, cancelTranslation: false });
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  useEffect(
    () => () => {
      chatStreamCleanupRef.current?.();
      chatStreamCleanupRef.current = null;
    },
    []
  );

  useEffect(() => {
    document.addEventListener("keydown", handleReaderKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleReaderKeyDown, true);
    };
  }, [readerStatus]);

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
        setSelectionPopupMode("actions");
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
        setError(formatReaderError(t("reader.failedOpenEpub"), reason));
      });
      epubBook.on?.("loadFailed", (reason: unknown) => {
        setReaderStatus("idle");
        setError(formatReaderError(t("reader.failedLoadEpub"), reason));
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

      rendition.on("rendered", (_section: unknown, contents: any) => {
        trackContentsKeyboard(contents);
      });

      rendition.on("selected", (cfiRange: string, contents: any) => {
        const contentsSelection = contents?.window?.getSelection?.();
        const selectedText = contentsSelection?.toString?.().trim() ?? "";
        const chapterText = contents?.document?.body?.innerText ?? "";
        const toolbarPosition = getToolbarPosition(contents, bookPaneRef.current);
        const anchorRect = getSelectionScreenAnchorRect(contents);

        if (selectedText) {
          activeContentsRef.current = contents;
          trackContentsPointerDismiss(contents);
          setSelection({
            cfiRange,
            text: selectedText,
            chapterText,
            toolbarPosition,
            anchorRect
          });
          setSelectionPopupMode("actions");
          setNoteDraft("");
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
      clearContentsKeyboardTracking();
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
    if (type === "note") {
      setSideTab("annotations");
    }
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
    const anchorRect =
      getSelectionScreenAnchorRect(activeContentsRef.current) ??
      selection.anchorRect ??
      getScreenAnchorRect(selection, bookPaneRef.current);
    const translationRequestId = translationRequestIdRef.current + 1;
    translationRequestIdRef.current = translationRequestId;
    dismissSystemTranslation();
    setBusy(true);
    setError(null);
    dismissSelectionUi({
      cancelTranslation: false,
      preserveNativeSelection: true
    });
    setTranslationPopover({
      status: "loading",
      position: popoverPosition
    });
    try {
      const translate = window.silkroad.translation?.translate;
      if (!translate) {
        throw new Error(t("reader.appleBridgeUnavailable"));
      }

      const response = await translate({
        text: selection.text,
        context: getReaderContext(),
        anchorRect
      });
      if (translationRequestIdRef.current !== translationRequestId) {
        return;
      }
      if (response.presentation === "system-ui") {
        systemTranslationVisibleRef.current = true;
        setTranslationPopover(null);
        return;
      }
      if (response.ok === false) {
        setTranslationPopover({
          status: "error",
          error:
            response.error ||
            t("reader.translationUnavailable"),
          position: popoverPosition
        });
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

    chatStreamCleanupRef.current?.();
    chatStreamCleanupRef.current = null;

    const createdAt = new Date().toISOString();
    const readerContext = getReaderContext();
    const selectedText = selection?.text.trim();
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      createdAt,
      selectionContext: selectedText
        ? {
            selectedText,
            bookTitle: book.title
          }
        : undefined
    };
    const assistantId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      status: "streaming"
    };
    const nextMessages = [...messages, userMessage];
    setMessages([...nextMessages, assistantMessage]);
    setAiInput("");
    setBusy(true);
    setError(null);
    setSideTab("ai");
    dismissSelectionUi({ clearContext: true });

    try {
      let streamedContent = "";
      chatStreamCleanupRef.current = window.silkroad.ai.streamChat(
        {
          messages: nextMessages,
          context: readerContext,
          providerId: settings.defaultChatProvider
        },
        {
          onDelta: (delta) => {
            streamedContent += delta;
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? { ...message, content: streamedContent, status: "streaming" }
                  : message
              )
            );
          },
          onDone: (response) => {
            chatStreamCleanupRef.current = null;
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? {
                      ...response.message,
                      id: assistantId,
                      content: response.message.content || streamedContent,
                      status: "complete"
                    }
                  : message
              )
            );
            setBusy(false);
          },
          onError: (message) => {
            chatStreamCleanupRef.current = null;
            setError(message);
            setMessages((current) =>
              current.map((item) =>
                item.id === assistantId
                  ? {
                      ...item,
                      content: message,
                      status: "error"
                    }
                  : item
              )
            );
            setBusy(false);
          }
        }
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
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

  function goToPreviousPage() {
    if (readerStatusRef.current !== "ready" || isMockReaderRef.current) {
      return;
    }

    void renditionRef.current?.prev?.();
  }

  function goToNextPage() {
    if (readerStatusRef.current !== "ready" || isMockReaderRef.current) {
      return;
    }

    void renditionRef.current?.next?.();
  }

  function handleReaderKeyDown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    if (isKeyboardEventFromEditableUi(event)) {
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goToPreviousPage();
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      goToNextPage();
    }
  }

  function openSideTab(tab: SideTab) {
    setSideTab(tab);
    dismissSelectionUi();
  }

  function openInlineNoteComposer() {
    setNoteDraft("");
    setSelectionPopupMode("note");
  }

  function closeInlineNoteComposer() {
    setNoteDraft("");
    setSelectionPopupMode("actions");
  }

  function handleNoteDraftKeyDown(
    event: ReactKeyboardEvent<HTMLTextAreaElement>
  ) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeInlineNoteComposer();
      return;
    }

    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (noteDraft.trim()) {
        void createHighlight("note", noteDraft);
      }
    }
  }

  function dismissSelectionUi({
    clearContext = false,
    cancelTranslation = true,
    preserveNativeSelection = false
  } = {}) {
    if (!preserveNativeSelection) {
      clearNativeSelection();
    }
    setSelectionUiVisible(false);
    setSelectionPopupMode("actions");
    if (cancelTranslation) {
      translationRequestIdRef.current += 1;
      setTranslationPopover(null);
      dismissSystemTranslation();
    }

    if (clearContext) {
      setSelection(null);
      setNoteDraft("");
      clearSelectionTracking();
    }
  }

  function dismissSystemTranslation() {
    if (!systemTranslationVisibleRef.current) {
      return;
    }

    systemTranslationVisibleRef.current = false;
    void window.silkroad.translation?.dismiss?.();
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

  function clearContentsKeyboardTracking() {
    for (const cleanup of contentsKeyboardCleanupsRef.current.values()) {
      cleanup();
    }
    contentsKeyboardCleanupsRef.current.clear();
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

  function trackContentsKeyboard(contents: any) {
    const contentsWindow = contents?.window;
    if (!contentsWindow?.addEventListener) {
      return;
    }

    if (contentsKeyboardCleanupsRef.current.has(contentsWindow)) {
      return;
    }

    contentsWindow.addEventListener("keydown", handleReaderKeyDown, true);
    contentsKeyboardCleanupsRef.current.set(contentsWindow, () => {
      contentsWindow.removeEventListener("keydown", handleReaderKeyDown, true);
    });
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
          <button className="icon-button" title={t("reader.backToLibrary")} onClick={onBack}>
            <ChevronLeft size={19} />
          </button>
          <div>
            <h1>{book.title}</h1>
            <p>{book.author || book.fileName}</p>
          </div>
        </div>
      </header>

      <div className="reader-body">
        <div ref={bookPaneRef} className="book-pane">
          {readerStatus === "loading" ? (
            <div className="reader-loading">{t("reader.loadingEpub")}</div>
          ) : null}
          {error ? <div className="reader-error">{error}</div> : null}
          {selection && selectionUiVisible ? (
            <div
              ref={selectionToolbarRef}
              className={`selection-toolbar${
                selection.toolbarPosition ? " positioned" : ""
              }${selectionPopupMode === "note" ? " note-editor" : ""}`}
              style={
                selection.toolbarPosition
                  ? {
                      left: selection.toolbarPosition.left,
                      top:
                        selectionPopupMode === "note"
                          ? Math.max(selection.toolbarPosition.top, 220)
                          : selection.toolbarPosition.top
                    }
                  : undefined
              }
              onMouseDown={
                selectionPopupMode === "actions"
                  ? (event) => event.preventDefault()
                  : undefined
              }
            >
              {selectionPopupMode === "note" ? (
                <div className="selection-note-editor">
                  <p className="selection-note-quote">“{selection.text}”</p>
                  <textarea
                    autoFocus
                    value={noteDraft}
                    placeholder={t("reader.notePlaceholder")}
                    onChange={(event) => setNoteDraft(event.target.value)}
                    onKeyDown={handleNoteDraftKeyDown}
                  />
                  <div className="selection-note-actions">
                    <button
                      className="selection-note-cancel"
                      title={t("reader.cancelNote")}
                      aria-label={t("reader.cancelNote")}
                      onClick={closeInlineNoteComposer}
                    >
                      <X size={15} />
                    </button>
                    <button
                      className="selection-note-save"
                      onClick={() => void createHighlight("note", noteDraft)}
                      disabled={!noteDraft.trim()}
                    >
                      <Save size={15} />
                      {t("reader.saveNote")}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button onClick={() => void createHighlight("highlight")}>
                    <Highlighter size={16} />
                    {t("reader.highlight")}
                  </button>
                  <button onClick={openInlineNoteComposer}>
                    <StickyNote size={16} />
                    {t("reader.note")}
                  </button>
                  <button onClick={() => void translateSelection()}>
                    <Languages size={16} />
                    {t("reader.translate")}
                  </button>
                  <button onClick={() => openSideTab("ai")}>
                    <MessageSquare size={16} />
                    {t("reader.ai")}
                  </button>
                </>
              )}
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
              <div className="translation-popover-label">{t("reader.translate")}</div>
              <div className="translation-popover-body">
                {translationPopover.status === "loading"
                  ? t("reader.translationLoading")
                  : translationPopover.status === "error"
                    ? translationPopover.error
                    : translationPopover.text}
              </div>
            </div>
          ) : null}
          {isMockReader ? <DemoReaderPage /> : <div ref={viewerRef} className="epub-viewer" />}
          <div className="page-controls" aria-label={t("reader.pageNavigation")}>
            <button
              className="icon-button page-button"
              title={t("reader.previousPage")}
              onClick={goToPreviousPage}
              disabled={isMockReader || readerStatus !== "ready"}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="icon-button page-button"
              title={t("reader.nextPage")}
              onClick={goToNextPage}
              disabled={isMockReader || readerStatus !== "ready"}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <aside className="reader-side">
            <div className="tabs">
              <button
                className={sideTab === "annotations" ? "active" : ""}
                onClick={() => setSideTab("annotations")}
              >
                {t("reader.notesTab")}
              </button>
              <button
                className={sideTab === "ai" ? "active" : ""}
                onClick={() => setSideTab("ai")}
              >
                {t("reader.ai")}
              </button>
            </div>

            {error ? <div className="inline-error">{error}</div> : null}

            {sideTab === "annotations" ? (
              <div className="side-section">
                <div className="annotation-list">
                  {annotations.map((annotation) => (
                    <article key={annotation.id} className="annotation-item">
                      <button
                        className="annotation-jump"
                        onClick={() => renditionRef.current?.display?.(annotation.cfiRange)}
                      >
                        <span className="annotation-type">
                          {annotation.type === "note"
                            ? t("reader.annotationNote")
                            : t("reader.annotationHighlight")}
                        </span>
                        <span>{annotation.selectedText}</span>
                        {annotation.noteText ? <strong>{annotation.noteText}</strong> : null}
                      </button>
                      <button
                        className="icon-button small"
                        title={t("reader.deleteAnnotation")}
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
                    <article key={message.id} className={`message-row ${message.role}`}>
                      {message.selectionContext ? (
                        <div className="message-context-card">
                          <div className="message-context-label">
                            <MessageSquare size={14} />
                            <span>{t("reader.selectionChip")}</span>
                          </div>
                          <div className="message-context-text">
                            “{message.selectionContext.selectedText}”
                          </div>
                        </div>
                      ) : null}
                      <div
                        className={`message ${message.role} ${
                          message.status ?? ""
                        }`.trim()}
                      >
                        {message.status === "streaming" && !message.content ? (
                          <span className="typing-indicator">
                            <span />
                            <span />
                            <span />
                          </span>
                        ) : message.role === "assistant" && message.status !== "error" ? (
                          <MarkdownMessage content={message.content} />
                        ) : (
                          message.content
                        )}
                      </div>
                    </article>
                  ))}
                </div>

                <div className={selection ? "chat-input has-context" : "chat-input"}>
                  {selection ? (
                    <div className="chat-context">
                      <div className="chat-context-preview">“{selection.text}”</div>
                      <div className="chat-context-chip">
                        <MessageSquare size={15} />
                        <span>{t("reader.selectionChip")}</span>
                        <button
                          className="ai-context-clear"
                          title={t("reader.clearSelectionContext")}
                          aria-label={t("reader.clearSelectionContext")}
                          onClick={() => dismissSelectionUi({ clearContext: true })}
                        >
                          <X size={15} />
                        </button>
                      </div>
                    </div>
                  ) : null}
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
                    className="chat-send-button"
                    onClick={() => void sendChat()}
                    disabled={busy || !aiInput.trim()}
                    title={t("reader.send")}
                    aria-label={t("reader.send")}
                  >
                    <Send size={17} />
                  </button>
                </div>
              </div>
            ) : null}
        </aside>
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

function isKeyboardEventFromEditableUi(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!target || typeof (target as Element).closest !== "function") {
    return false;
  }

  const element = target as Element;
  const tagName = element.tagName?.toLowerCase?.();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }

  if ((element as HTMLElement).isContentEditable) {
    return true;
  }

  return Boolean(
    element.closest(
      "button, a, [contenteditable='true'], [contenteditable=''], .reader-side, .selection-toolbar, .translation-popover"
    )
  );
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

function getScreenAnchorRect(
  activeSelection: ActiveSelection,
  bookPane: HTMLDivElement | null
): ScreenRect | undefined {
  const position = activeSelection.toolbarPosition;
  if (!position || !bookPane) {
    return undefined;
  }

  const paneRect = bookPane.getBoundingClientRect();
  return {
    x: window.screenX + paneRect.left + position.left - 4,
    y: window.screenY + paneRect.top + position.top - 4,
    width: 8,
    height: 8
  };
}

function getSelectionScreenAnchorRect(contents: any): ScreenRect | undefined {
  const range = getSelectedRange(contents);
  const frame = contents?.document?.defaultView?.frameElement as HTMLElement | null;
  if (!range || !frame) {
    return undefined;
  }

  const selectionRect = getReadableRangeRect(range);
  if (!selectionRect) {
    return undefined;
  }

  const frameRect = frame.getBoundingClientRect();
  return {
    x: window.screenX + frameRect.left + selectionRect.left,
    y: window.screenY + frameRect.top + selectionRect.top,
    width: Math.max(1, selectionRect.width),
    height: Math.max(1, selectionRect.height)
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
