import ePub from "epubjs";
import {
  ChevronLeft,
  ChevronRight,
  Highlighter,
  Languages,
  MessageSquare,
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
}

type SideTab = "annotations" | "translate" | "ai";

export function ReaderView({ book, settings, onBack, onBookUpdated }: ReaderViewProps) {
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const renditionRef = useRef<any>(null);
  const epubRef = useRef<any>(null);
  const isMockReader = book.readerUrl.startsWith("mock-book://");
  const [annotations, setAnnotations] = useState<AnnotationRecord[]>([]);
  const [selection, setSelection] = useState<ActiveSelection | null>(null);
  const [currentChapterText, setCurrentChapterText] = useState("");
  const [sideTab, setSideTab] = useState<SideTab>(getInitialSideTab);
  const [noteDraft, setNoteDraft] = useState("");
  const [translation, setTranslation] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [useWebSearch, setUseWebSearch] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    async function bootReader() {
      if (isMockReader) {
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
          chapterText: DEMO_CHAPTER_TEXT
        });
        setSideTab(initialTab);
        if (initialTab === "translate") {
          setTranslation("【简体中文】一条道路也是一种注意力的习惯。");
        }
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
        return;
      }

      if (!viewerRef.current) {
        return;
      }

      setError(null);
      setSelection(null);
      setTranslation("");
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
      const epubBook = ePub(book.readerUrl);
      epubRef.current = epubBook;

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
        const selectedText =
          contents?.window?.getSelection?.()?.toString?.().trim() ?? "";
        const chapterText = contents?.document?.body?.innerText ?? "";

        if (selectedText) {
          setSelection({ cfiRange, text: selectedText, chapterText });
          setCurrentChapterText(chapterText);
        }

        contents?.window?.getSelection?.()?.removeAllRanges?.();
      });

      await rendition.display(location?.cfi);

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
      setError(caught instanceof Error ? caught.message : String(caught));
    });

    return () => {
      disposed = true;
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
    setSelection(null);
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

    setBusy(true);
    setError(null);
    setSideTab("translate");
    try {
      const response = await window.silkroad.ai.translate({
        text: selection.text,
        targetLanguage: settings.targetLanguage,
        context: getReaderContext()
      });
      setTranslation(response.text);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
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
        <div className="reader-controls">
          <button
            className="icon-button"
            title="上一页"
            onClick={() => renditionRef.current?.prev?.()}
          >
            <ChevronLeft size={19} />
          </button>
          <button
            className="icon-button"
            title="下一页"
            onClick={() => renditionRef.current?.next?.()}
          >
            <ChevronRight size={19} />
          </button>
          <button
            className="icon-button"
            title="侧栏"
            onClick={() => setSideTab("annotations")}
          >
            <PanelRightOpen size={19} />
          </button>
        </div>
      </header>

      <div className="reader-body">
        <div className="book-pane">
          {selection ? (
            <div className="selection-toolbar">
              <button onClick={() => void createHighlight("highlight")}>
                <Highlighter size={16} />
                高亮
              </button>
              <button onClick={() => setSideTab("annotations")}>
                <StickyNote size={16} />
                Note
              </button>
              <button onClick={() => void translateSelection()}>
                <Languages size={16} />
                翻译
              </button>
              <button onClick={() => setSideTab("ai")}>
                <MessageSquare size={16} />
                AI
              </button>
              <button className="icon-only" title="关闭" onClick={() => setSelection(null)}>
                <X size={16} />
              </button>
            </div>
          ) : null}
          {isMockReader ? <DemoReaderPage /> : <div ref={viewerRef} className="epub-viewer" />}
        </div>

        <aside className="reader-side">
          <div className="tabs">
            <button
              className={sideTab === "annotations" ? "active" : ""}
              onClick={() => setSideTab("annotations")}
            >
              Notes
            </button>
            <button
              className={sideTab === "translate" ? "active" : ""}
              onClick={() => setSideTab("translate")}
            >
              翻译
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

          {sideTab === "translate" ? (
            <div className="side-section">
              <div className="translation-box">
                {busy ? "翻译中..." : translation || " "}
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
                <button className="primary-button" onClick={() => void sendChat()} disabled={busy}>
                  <MessageSquare size={16} />
                  发送
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

function getInitialSideTab(): SideTab {
  const tab = new URLSearchParams(window.location.search).get("demoTab");
  if (tab === "translate" || tab === "ai") {
    return tab;
  }
  return "annotations";
}
