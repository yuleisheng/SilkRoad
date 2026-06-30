import { BookOpen, Library, Settings } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AppSettings, BookRecord } from "../shared/types";
import { LibraryView } from "./components/LibraryView";
import { ReaderView } from "./components/ReaderView";
import { SettingsView } from "./components/SettingsView";

type View = "library" | "settings";

export function App() {
  const [books, setBooks] = useState<BookRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [view, setView] = useState<View>("library");
  const [error, setError] = useState<string | null>(null);

  const selectedBook = useMemo(
    () => books.find((book) => book.id === selectedBookId) ?? null,
    [books, selectedBookId]
  );

  async function refreshBooks() {
    setBooks(await window.silkroad.books.list());
  }

  async function refreshSettings() {
    setSettings(await window.silkroad.settings.get());
  }

  useEffect(() => {
    void Promise.all([window.silkroad.books.list(), window.silkroad.settings.get()])
      .then(([loadedBooks, loadedSettings]) => {
        const demoScreen = new URLSearchParams(window.location.search).get("demoScreen");
        setBooks(loadedBooks);
        setSettings(loadedSettings);

        if (demoScreen === "settings") {
          setView("settings");
        }

        if (demoScreen === "reader" && loadedBooks[0]) {
          setSelectedBookId(loadedBooks[0].id);
        }
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : String(caught));
      });
  }, []);

  return (
    <main className="app-shell">
      <aside className="rail">
        <div className="brand" aria-label="SilkRoad">
          <BookOpen size={22} />
        </div>
        <button
          className={view === "library" ? "rail-button active" : "rail-button"}
          title="书库"
          onClick={() => setView("library")}
        >
          <Library size={20} />
        </button>
        <button
          className={view === "settings" ? "rail-button active" : "rail-button"}
          title="设置"
          onClick={() => setView("settings")}
        >
          <Settings size={20} />
        </button>
      </aside>

      {error ? <div className="app-error">{error}</div> : null}

      {view === "settings" && settings ? (
        <SettingsView
          settings={settings}
          onSettingsChange={setSettings}
          onClose={() => setView("library")}
        />
      ) : selectedBook && settings ? (
        <ReaderView
          book={selectedBook}
          settings={settings}
          onBack={() => setSelectedBookId(null)}
          onBookUpdated={(book) =>
            setBooks((current) =>
              current.map((item) => (item.id === book.id ? book : item))
            )
          }
        />
      ) : (
        <LibraryView
          books={books}
          onImport={async () => {
            const book = await window.silkroad.books.import();
            if (book) {
              await refreshBooks();
              setSelectedBookId(book.id);
            }
          }}
          onOpenBook={(book) => setSelectedBookId(book.id)}
        />
      )}
    </main>
  );
}
