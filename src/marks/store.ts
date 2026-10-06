// Where marks live. Locally (for now) they are kept in this browser's storage so
// the whole mode can be tried on localhost. A shared online store (Firebase)
// will implement the same interface later so everyone sees each other's marks.

export type Mark = { id: string; text: string; ts: number; mine?: boolean };

export interface MarksStore {
  /** Most recent marks, newest last. */
  list(limit: number): Promise<Mark[]>;
  add(text: string): Promise<Mark>;
  remove(id: string): Promise<void>;
  subscribe(fn: (m: Mark) => void): () => void;
}

const KEY = "seeface-marks-local";

function read(): Mark[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function write(all: Mark[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all.slice(-300)));
  } catch {
    // storage blocked: marks last this visit only
  }
}

class LocalStore implements MarksStore {
  private listeners = new Set<(m: Mark) => void>();

  async list(limit: number) {
    return read().slice(-limit);
  }

  async add(text: string) {
    const m: Mark = { id: Math.random().toString(36).slice(2, 10), text, ts: Date.now(), mine: true };
    write([...read(), m]);
    this.listeners.forEach((l) => l(m));
    return m;
  }

  async remove(id: string) {
    write(read().filter((m) => m.id !== id));
  }

  subscribe(fn: (m: Mark) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
}

export const marksStore: MarksStore = new LocalStore();
export const isLocalStore = true;
