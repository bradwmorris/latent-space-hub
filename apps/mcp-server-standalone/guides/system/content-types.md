---
name: Content Types
description: Node type semantics, key fields, and query patterns for Latent Space content
immutable: true
---

# Content Types

Use node types to frame answers in native Latent Space language ("podcast episode", "AINews issue", "article"), not generic "node" language.

## `podcast`

What it is:
- Latent Space Podcast long-form interviews.

Key fields:
- `title`, `event_date`, `link`, `metadata.guests`, transcript chunks

Good questions:
- "Episodes with [person]?"
- "Recent podcast coverage of [topic]?"
- "How did podcast discussion of [topic] evolve since January?"

## `article`

What it is:
- Latent Space Substack/newsletter blog essays and written analysis.

Key fields:
- `title`, `event_date`, `link`, `metadata.author`, article text chunks

Good questions:
- "What has Latent Space written about [topic]?"
- "Articles in the last month about [topic]?"

## `ainews`

What it is:
- Daily AI News curation issues.

Key fields:
- `title`, `event_date`, `link`, issue text chunks, named companies/models/people

Good questions:
- "What did AINews say about [company/model] recently?"
- "How has AINews coverage of [topic] changed over time?"

## `builders-club`

What it is:
- Community meetup sessions, demos, and practical build discussions.

Key fields:
- `title`, `event_date`, `link`, session transcript chunks

Good questions:
- "Builders Club sessions on [topic]?"
- "Recent meetup demos involving [tool/workflow]?"

## `paper-club`

What it is:
- Academic paper deep-dives.

Key fields:
- `title`, `event_date`, `link`, `metadata.paper_title`, presenter/speaker context in chunks

Good questions:
- "Paper Club episodes covering [paper/topic]?"
- "When was [paper] discussed and what were the takeaways?"

## `workshop`

What it is:
- Workshop-format sessions where present in data.

Key fields:
- `title`, `event_date`, `link`, transcript chunks

Good questions:
- "Workshops related to [topic]?"
- "What practical guidance came from recent workshops?"

## `guest`

What it is:
- People who appear in Latent Space content.

Key fields:
- `title`, `description`, affiliations/role in metadata, edges to appearances

Good questions:
- "Where has [person] appeared?"
- "What positions did [person] take across multiple episodes?"

## `entity`

What it is:
- Organizations, tools, topics, and concepts linked across content.

Key fields:
- `title`, `description`, metadata aliases/type hints, edges to content nodes

Good questions:
- "How has [organization/topic] been covered across podcast + AINews + articles?"
- "Timeline of mentions for [entity]?"

## Response Framing Rule

Always name the source type naturally:
- "In a podcast episode..."
- "In last week's AINews..."
- "In a Latent Space article..."

Do not flatten all sources into generic references.
