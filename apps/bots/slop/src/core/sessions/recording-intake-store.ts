import type { RecordingIntakeSession } from "../chat/recording-intake";

const sessions = new Map<string, RecordingIntakeSession>();

export const recordingIntakeSessionStore = {
  get(conversationId: string): RecordingIntakeSession | undefined {
    return sessions.get(conversationId);
  },

  set(conversationId: string, session: RecordingIntakeSession): void {
    sessions.set(conversationId, session);
  },

  clear(conversationId: string): void {
    sessions.delete(conversationId);
  },
};
