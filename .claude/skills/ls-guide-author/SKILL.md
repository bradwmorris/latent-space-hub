---
name: ls-guide-author
description: Create and maintain LS Hub guides via MCP guide tools with immutable system-guide protection.
---

# LS Guide Author

## Use When

- User asks to add or update guide documentation inside LS Hub.

## Workflow

1. Check existing docs with `ls_list_guides`.
2. Read target guide with `ls_read_guide`.
3. For custom guides, write with `ls_write_guide`.
4. If cleanup is needed, use `ls_delete_guide` on custom guides only.

## Guide Format

Use markdown with frontmatter:

```markdown
---
name: Guide Name
description: One-line purpose
immutable: false
---

# Title
...
```

## Rules

- Never overwrite system guides.
- Keep guides procedural and tool-specific.
