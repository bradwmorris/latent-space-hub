---
name: Schema
description: Core table model for nodes, dimensions, edges, and chunks
immutable: true
---

# Schema

Core tables:
- `nodes`: canonical entity records
- `node_dimensions`: many-to-many between nodes and dimensions
- `dimensions`: taxonomy definitions
- `edges`: directed relationships
- `chunks`: retrieval chunks

Use `ls_sqlite_query` for read-only inspection.
