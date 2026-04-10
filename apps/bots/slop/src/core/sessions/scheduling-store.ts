import type { SchedulingSession } from "../../types";

const SESSION_TIMEOUT_MS = 10 * 60 * 1000;
const WARNING_TIMEOUT_MS = 8 * 60 * 1000;
const WARNING_TEXT =
  "Heads up: this scheduling session expires in 2 minutes. Reply now to continue.";

type SessionTimers = {
  warning?: NodeJS.Timeout;
  timeout?: NodeJS.Timeout;
};

export class SchedulingSessionStore {
  private sessions = new Map<string, SchedulingSession>();
  private timers = new Map<string, SessionTimers>();

  get(key: string): SchedulingSession | undefined {
    return this.sessions.get(key);
  }

  has(key: string): boolean {
    return this.sessions.has(key);
  }

  set(
    key: string,
    session: SchedulingSession,
    options?: { onWarn?: () => void | Promise<void> }
  ): void {
    this.clear(key);
    this.sessions.set(key, session);

    const warning = setTimeout(() => {
      const active = this.sessions.get(key);
      if (!active) return;
      void options?.onWarn?.();
    }, WARNING_TIMEOUT_MS);

    const timeout = setTimeout(() => {
      this.clear(key);
    }, SESSION_TIMEOUT_MS);

    this.timers.set(key, { warning, timeout });
  }

  clear(key: string): void {
    this.sessions.delete(key);
    const timers = this.timers.get(key);
    if (timers?.warning) clearTimeout(timers.warning);
    if (timers?.timeout) clearTimeout(timers.timeout);
    this.timers.delete(key);
  }

  warningText(): string {
    return WARNING_TEXT;
  }
}

export const schedulingSessionStore = new SchedulingSessionStore();
