/**
 * Evals Logger for Latent Space Hub (Turso fork)
 *
 * Note: Local evals logging is disabled in this fork.
 * Turso/Vercel serverless deployments don't have persistent local filesystem.
 * Use Turso database or external logging service for evals in production.
 */

type EvalToolCallLog = {
  toolName: string;
  args?: unknown;
  result?: unknown;
  error?: unknown;
  latencyMs?: number;
};

type EvalChatLog = {
  traceId?: string;
  spanId?: string;
  helperName?: string;
  model?: string;
  promptVersion?: string;
  systemMessage?: string | null;
  userMessage?: string | null;
  assistantMessage?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
  cacheHit?: boolean;
  cacheSavingsPct?: number;
  estimatedCostUsd?: number;
  provider?: string | null;
  mode?: string | null;
  workflowKey?: string | null;
  workflowNodeId?: number | null;
  latencyMs?: number;
  success?: boolean;
  error?: string | null;
};

/**
 * Log tool call for evals - DISABLED in Turso fork
 * Requires local filesystem which isn't available on Vercel
 */
export function logEvalToolCall(entry: EvalToolCallLog): void {
  // Disabled - no local filesystem on Vercel/serverless
  if (process.env.LS_EVALS_LOG === '1' || process.env.LS_EVALS_LOG === 'true') {
    console.log('[EVALS] Tool call (logging disabled in Turso fork):', entry.toolName);
  }
}

/**
 * Log LLM chat for evals - DISABLED in Turso fork
 * Requires local filesystem which isn't available on Vercel
 */
export function logEvalChat(entry: EvalChatLog): void {
  // Disabled - no local filesystem on Vercel/serverless
  if (process.env.LS_EVALS_LOG === '1' || process.env.LS_EVALS_LOG === 'true') {
    console.log('[EVALS] Chat (logging disabled in Turso fork):', entry.helperName);
  }
}
