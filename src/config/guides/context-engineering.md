---
name: Context Engineering
description: Master the art of managing information flow to AI systems — the real skill behind effective agents and applications.
---

# Context Engineering Learning Path

"The real job is not RAG or prompt engineering — it's context engineering." — Jeff Huber, Chroma

Context engineering has emerged as THE critical discipline for building effective AI systems in 2025. This guide walks you through the essential content.

## The Big Picture

### Why Context Engineering Matters

Start with the foundational argument:

**RAG is Dead, Context Engineering is King** — Jeff Huber (Chroma)
Jeff coined the term and explains why "RAG has lost all meaning." He introduces "context rot" — the dirty secret that multi-turn agent interactions degrade context quality, causing models to lose their minds.

### The Comprehensive Framework

**Understanding Context Engineering: A Comprehensive Framework**
A synthesized guide covering:
- The distinction between prompt engineering and context engineering
- Design patterns for context management
- The missing paradigm: system prompt learning
- Practical implementation frameworks

## Core Concepts

### From Prompt to Context

**Context Engineering for Agents** — Lance Martin (LangChain)
Lance explains the shift from optimizing individual prompts to managing complex information flows — tool calls, user inputs, state management, and multi-turn interactions.

### The State of the Field

**[State of Context Engineering] Agentic RAG, Context Rot, MCP, Subagents** — Nina Lopatina (Contextual)
Nina covers:
- The transition from traditional RAG to agentic RAG
- Context compression to mitigate rot
- The necessity for full-system approaches

## Key Concepts Explained

### Context Rot

The dirty secret: long contexts and multi-turn conversations cause performance degradation BEFORE hitting token limits.

**Manifestations:**
- Weird, idiosyncratic failure modes as context grows
- Loss of focus on critical details
- Accumulation of irrelevant information

### Context vs Quality Trade-off

It's not just about fitting within limits — it's about maintaining quality throughout the interaction lifecycle.

### The Scale Problem

- Typical Manus task: ~50 tool calls
- Typical Claude Code session: hundreds of tool calls
- Naive implementations: 500K+ tokens per run ($1-2 cost)

## Design Patterns

From the comprehensive framework:

1. **Context Offloading** — Use file systems and external storage
2. **Context Isolation** — Multi-agent systems for parallelizable tasks
3. **Context Compression** — Start generous, optimize as patterns emerge
4. **MCP Integration** — The connectivity layer for context management

## Key Voices

The experts shaping this field:

- **Lance Martin** — LangChain context engineering patterns
- **Jeff Huber** — Chroma, context rot research
- **Nina Lopatina** — Contextual, RAG 2.0

## Insights to Remember

> "Context engineering is the real job, not RAG or prompt engineering"

> "Context rot is the real enemy, not bad retrieval"

> "Agent context comes from tool calls, not just prompts — offload to external storage"

## Related Tracks

- **Agent Engineering** — Apply context engineering to build better agents
- **MCP Deep Dive** — The protocol powering context connectivity

---

*This guide covers the essential context engineering content. Estimated learning time: 4-6 hours.*
