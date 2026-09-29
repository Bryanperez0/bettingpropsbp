import { useCallback, useEffect, useState } from "react";
import type { BookOption } from "../../shared/types";

/**
 * The sportsbooks this viewer can bet at, kept in this browser only.
 * Empty list = every book counts.
 */
const KEY = "myBooks";
const EVENT = "mybooks-change";

function read(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function useMyBooks() {
  const [books, setBooks] = useState<string[]>(read);
  useEffect(() => {
    const sync = () => setBooks(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const save = useCallback((next: string[]) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage blocked: keep the choice for this page view only */
    }
    setBooks(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);
  const toggle = useCallback((book: string) => save(books.includes(book) ? books.filter((b) => b !== book) : [...books, book]), [books, save]);
  return { books, toggle, clear: () => save([]) };
}

/** Best option among the viewer's books (all books when none are chosen). */
export function bestFor(shop: BookOption[] | undefined, mine: string[]): BookOption | null {
  const list = (shop ?? []).filter((o) => !mine.length || mine.includes(o.book));
  return list[0] ?? null;
}
