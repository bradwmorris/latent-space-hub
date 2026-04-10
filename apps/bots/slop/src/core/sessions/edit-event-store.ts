import type { EditSession } from "../commands/edit-event-service";

const EDIT_TIMEOUT_MS = 10 * 60 * 1000;

export class EditEventSessionStore {
  private sessions = new Map<string, EditSession>();
  private timeouts = new Map<string, NodeJS.Timeout>();

  get(key: string): EditSession | undefined {
    return this.sessions.get(key);
  }

  has(key: string): boolean {
    return this.sessions.has(key);
  }

  set(key: string, session: EditSession): void {
    this.clear(key);
    this.sessions.set(key, session);
    const timeout = setTimeout(() => this.clear(key), EDIT_TIMEOUT_MS);
    this.timeouts.set(key, timeout);
  }

  clear(key: string): void {
    this.sessions.delete(key);
    const timeout = this.timeouts.get(key);
    if (timeout) clearTimeout(timeout);
    this.timeouts.delete(key);
  }
}

export const editEventSessionStore = new EditEventSessionStore();
