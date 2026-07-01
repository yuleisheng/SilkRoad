import { BookOpen, Upload } from "lucide-react";
import type { TranslateFunction } from "../../shared/i18n";
import type { BookRecord } from "../../shared/types";

interface LibraryViewProps {
  books: BookRecord[];
  t: TranslateFunction;
  onImport(): Promise<void>;
  onOpenBook(book: BookRecord): void;
}

export function LibraryView({ books, t, onImport, onOpenBook }: LibraryViewProps) {
  return (
    <section className="library-view">
      <header className="topbar">
        <div>
          <h1>SilkRoad</h1>
          <p>{t("library.epubCount", { count: books.length })}</p>
        </div>
        <button className="primary-button" onClick={() => void onImport()}>
          <Upload size={17} />
          {t("library.importEpub")}
        </button>
      </header>

      <div className="book-grid">
        {books.map((book) => (
          <button
            key={book.id}
            className="book-tile"
            onClick={() => onOpenBook(book)}
          >
            <span className={book.coverImageUrl ? "book-cover has-image" : "book-cover"}>
              {book.coverImageUrl ? (
                <img src={book.coverImageUrl} alt="" />
              ) : (
                <BookOpen size={34} />
              )}
            </span>
            <span className="book-title">{book.title}</span>
            <span className="book-author">{book.author || book.fileName}</span>
          </button>
        ))}
      </div>

      {books.length === 0 ? (
        <div className="empty-state">
          <BookOpen size={46} />
          <h2>SilkRoad</h2>
          <button className="primary-button" onClick={() => void onImport()}>
            <Upload size={17} />
            {t("library.importEpub")}
          </button>
        </div>
      ) : null}
    </section>
  );
}
