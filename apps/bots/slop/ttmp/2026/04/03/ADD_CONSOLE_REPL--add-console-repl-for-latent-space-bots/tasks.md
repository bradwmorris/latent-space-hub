# Tasks

## TODO

### Phase 0: Characterization Tests

- [x] Add routing characterization tests for mentions, replies, thread ownership, and allowed-channel behavior
- [x] Add destination-thread tests for thread naming, fallback behavior, and existing-thread handling
- [x] Add edit-event flow tests for menu transitions, rescheduling, and update/cancel paths
- [x] Add scheduling flow tests for date selection, title capture, and session progression without Discord transport

### Phase 1: Extract Core Services

- [x] Extract /join into a transport-neutral command service using plain actor and reply inputs
- [x] Extract mention-driven response generation into a transport-neutral core chat service
- [x] Extract transport-neutral scheduling and edit-event session stores keyed by conversation ID

### Phase 2: Introduce Runtime Types

- [x] Define normalized conversation event and effect types for message and command flows
- [x] Implement a core runtime dispatcher that routes normalized events to chat and command services

### Phase 3: Migrate Discord Adapter

- [x] Refactor the Discord message adapter to translate events into the core runtime and apply effects back to Discord
- [x] Refactor Discord slash-command handling to use the core runtime for /join, /paper-club, and /edit-event

### Phase 4: Console REPL

- [x] Build a Slop-only console adapter with in-memory users, channels, threads, and effect application
- [x] Document local REPL usage and validation steps in repo docs after the first working version lands
- [x] Add a readline REPL entrypoint with literal local commands and operator controls like /as, /threads, and /switch
