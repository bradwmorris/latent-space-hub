# Data Hygiene Retro (2026-02-22)

## Scope

Retro on recurring name-quality issues discovered during ingestion/refinement, with immediate host-priority remediation.

## What Broke

1. ASR/transcript artifacts created repeated host-name variants in text (`swix`, `swixs`, `switz`, `alesio`, `allesio`, `allesop`).
2. Those variants leaked into generated descriptions/entity extraction because no canonical alias pass existed before extraction.
3. Hygiene checks were mostly one-off and not scheduled as a recurring audit.

## Immediate Actions Completed

1. Added host-alias normalization in ingestion entity/description path:
   - `/Users/bradleymorris/Desktop/dev/latent-space-hub/src/services/ingestion/processing.ts`
2. Added one-off cleanup script for existing records:
   - `/Users/bradleymorris/Desktop/dev/latent-space-hub/scripts/output/fix-host-name-typos.ts`
3. Added backlog + PRD tasks under hub-nodes for canonical-name cleanup and ongoing alias audits.

## Why This Happened

1. No canonical entity dictionary for high-value names.
2. No gate that flags likely misspellings before ingest write.
3. No post-ingest quality report covering typo families.

## Preventive Controls (Going Forward)

1. Canonical alias map: maintain a versioned map for high-value entities (hosts, recurring guests, brands).
2. Ingestion guardrail: normalize aliases before description/entity extraction.
3. Scheduled audit: weekly typo scan for near-duplicates and common alias families.
4. Merge workflow: when typo entities are found, merge edges to canonical node in the same pass.
5. PRD closure gate: no data PRD closes without a hygiene report and diff summary.

## Proposed Weekly Audit Query Families

1. Host aliases (`swix/swyx`, `alesio/alessio`) in `nodes.title/description/notes/chunk`.
2. Brand aliases (`latent space/late in space/laid in space`).
3. Organization spellings (`decibel/decible`, etc.).

## Success Criteria

1. No host alias typos in node titles/descriptions/notes.
2. New ingest runs do not introduce known alias variants.
3. Duplicate typo entities trend toward zero and stay there.
