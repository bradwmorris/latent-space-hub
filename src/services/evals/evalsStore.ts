/**
 * Evals Store for Latent Space Hub (Turso fork)
 *
 * Note: Local evals storage is disabled in this fork.
 * Turso/Vercel serverless deployments don't have persistent local filesystem.
 * Use Turso database or external service for evals storage in production.
 */

export type EvalChatRow = {
  id: number;
  ts: string;
  trace_id: string;
  span_id: string | null;
  helper_name: string | null;
  model: string | null;
  prompt_version: string | null;
  system_message: string | null;
  user_message: string | null;
  assistant_message: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  cache_write_tokens: number | null;
  cache_read_tokens: number | null;
  cache_hit: number | null;
  cache_savings_pct: number | null;
  estimated_cost_usd: number | null;
  provider: string | null;
  mode: string | null;
  workflow_key: string | null;
  workflow_node_id: number | null;
  latency_ms: number | null;
  success: number | null;
  error: string | null;
  dataset_id: string | null;
  scenario_id: string | null;
};

export type EvalToolCallRow = {
  id: number;
  ts: string;
  trace_id: string;
  span_id: string | null;
  parent_span_id: string | null;
  helper_name: string | null;
  tool_name: string;
  args_json: string | null;
  result_json: string | null;
  success: number | null;
  latency_ms: number | null;
  error: string | null;
  dataset_id: string | null;
  scenario_id: string | null;
};

export type EvalTrace = {
  chat: EvalChatRow;
  toolCalls: EvalToolCallRow[];
  comment: string | null;
};

/**
 * Upsert eval comment - DISABLED in Turso fork
 */
export function upsertEvalComment(traceId: string, scenarioId: string | null, comment: string): void {
  console.warn('[EVALS] Comment storage disabled in Turso fork');
}

/**
 * Load eval traces - DISABLED in Turso fork
 * Returns empty array since local SQLite evals database isn't available
 */
export function loadEvalTraces(limit = 25): EvalTrace[] {
  console.warn('[EVALS] Trace loading disabled in Turso fork');
  return [];
}
