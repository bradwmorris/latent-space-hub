import { ModelPricing } from '@/types/analytics';

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-4-5-20250929': {
    provider: 'anthropic',
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    cacheWritePer1M: 3.75,
    cacheReadPer1M: 0.30,
  },
  'claude-3-5-sonnet-20241022': {
    provider: 'anthropic',
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    cacheWritePer1M: 3.75,
    cacheReadPer1M: 0.30,
  },
  'gpt-4o-mini': {
    provider: 'openai',
    inputPer1M: 0.15,
    outputPer1M: 0.60,
  },
  'gpt-4o-mini-2024-07-18': {
    provider: 'openai',
    inputPer1M: 0.15,
    outputPer1M: 0.60,
  },
};

export interface CostCalculationInput {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
  modelId: string;
}

export interface CostCalculationResult {
  totalCostUsd: number;
  inputCostUsd: number;
  outputCostUsd: number;
  cacheWriteCostUsd: number;
  cacheReadCostUsd: number;
  cacheSavingsUsd: number;
  totalTokens: number;
}

export function calculateCost(input: CostCalculationInput): CostCalculationResult {
  const pricing = MODEL_PRICING[input.modelId];
  
  if (!pricing) {
    console.warn(`[Pricing] Unknown model: ${input.modelId}, using default pricing`);
    return {
      totalCostUsd: 0,
      inputCostUsd: 0,
      outputCostUsd: 0,
      cacheWriteCostUsd: 0,
      cacheReadCostUsd: 0,
      cacheSavingsUsd: 0,
      totalTokens: input.inputTokens + input.outputTokens + (input.cacheWriteTokens || 0) + (input.cacheReadTokens || 0),
    };
  }

  const inputCostUsd = (input.inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCostUsd = (input.outputTokens / 1_000_000) * pricing.outputPer1M;
  
  let cacheWriteCostUsd = 0;
  let cacheReadCostUsd = 0;
  let cacheSavingsUsd = 0;

  if (pricing.cacheWritePer1M && input.cacheWriteTokens) {
    cacheWriteCostUsd = (input.cacheWriteTokens / 1_000_000) * pricing.cacheWritePer1M;
  }

  if (pricing.cacheReadPer1M && input.cacheReadTokens) {
    cacheReadCostUsd = (input.cacheReadTokens / 1_000_000) * pricing.cacheReadPer1M;
    const regularCostForCachedTokens = (input.cacheReadTokens / 1_000_000) * pricing.inputPer1M;
    cacheSavingsUsd = regularCostForCachedTokens - cacheReadCostUsd;
  }

  const totalCostUsd = inputCostUsd + outputCostUsd + cacheWriteCostUsd + cacheReadCostUsd;
  const totalTokens = input.inputTokens + input.outputTokens + (input.cacheWriteTokens || 0) + (input.cacheReadTokens || 0);

  return {
    totalCostUsd: parseFloat(totalCostUsd.toFixed(6)),
    inputCostUsd: parseFloat(inputCostUsd.toFixed(6)),
    outputCostUsd: parseFloat(outputCostUsd.toFixed(6)),
    cacheWriteCostUsd: parseFloat(cacheWriteCostUsd.toFixed(6)),
    cacheReadCostUsd: parseFloat(cacheReadCostUsd.toFixed(6)),
    cacheSavingsUsd: parseFloat(cacheSavingsUsd.toFixed(6)),
    totalTokens,
  };
}

export function getModelPricing(modelId: string): ModelPricing | null {
  return MODEL_PRICING[modelId] || null;
}

export function getSupportedModels(): string[] {
  return Object.keys(MODEL_PRICING);
}
