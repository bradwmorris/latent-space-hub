// ─── Node Types ──────────────────────────────────────────────────────────────

export type NodeType =
  | 'episode'
  | 'person'
  | 'organization'
  | 'topic'
  | 'source'
  | 'event'
  | 'concept'
  | 'subscriber';

export interface Node {
  id: number;
  title: string;
  description?: string;
  notes?: string;              // Was "content" — user notes / analysis
  link?: string;
  node_type?: NodeType;        // Typed entity classification
  event_date?: string;         // ISO 8601 date for temporal queries
  dimensions: string[];        // Flexible dimension tags
  embedding?: Buffer;          // Node-level embedding (BLOB)
  chunk?: string;
  metadata?: any;              // Type-specific metadata (see schemas below)
  created_at: string;
  updated_at: string;
  edge_count?: number;         // Derived count from queries

  // Embedding pipeline fields
  embedding_updated_at?: string;
  embedding_text?: string;
  chunk_status?: 'not_chunked' | 'chunking' | 'chunked' | 'error' | null;
}

// ─── Node Metadata Schemas (application-layer validation) ────────────────────

export interface EpisodeMetadata {
  publish_date: string;
  duration?: string;
  series: string;
  audio_url?: string;
  video_url?: string;
  episode_number?: number;
  season?: number;
}

export interface PersonMetadata {
  role: string;
  affiliations?: string[];
  expertise?: string[];
  twitter?: string;
  website?: string;
  contact?: string;
}

export interface OrganizationMetadata {
  org_type: 'startup' | 'lab' | 'bigco' | 'institution';
  website?: string;
  founded?: string;
  hq?: string;
}

export interface TopicMetadata {
  parent_topic?: string;
  aliases?: string[];
}

export interface SourceMetadata {
  source_type: 'paper' | 'article' | 'blog' | 'doc';
  authors?: string[];
  publish_date?: string;
  doi?: string;
}

export interface EventMetadata {
  event_date: string;
  event_type: 'conference' | 'launch' | 'release';
  location?: string;
  url?: string;
}

export interface ConceptMetadata {
  definition?: string;
  related_terms?: string[];
}

export interface SubscriberMetadata {
  platform: 'discord' | 'web';
  platform_id: string;
  display_name?: string;
  joined_date?: string;
  tier?: string;
}

export type NodeMetadataMap = {
  episode: EpisodeMetadata;
  person: PersonMetadata;
  organization: OrganizationMetadata;
  topic: TopicMetadata;
  source: SourceMetadata;
  event: EventMetadata;
  concept: ConceptMetadata;
  subscriber: SubscriberMetadata;
};

// ─── Chunks ──────────────────────────────────────────────────────────────────

export interface Chunk {
  id: number;
  node_id: number;
  chunk_idx?: number;
  text: string;
  embedding?: number[];
  embedding_type: string;
  metadata?: any;
  created_at: string;
}

// ─── Edges ───────────────────────────────────────────────────────────────────

export interface Edge {
  id: number;
  from_node_id: number;
  to_node_id: number;
  context?: any;
  source: EdgeSource;
  created_at: string;
}

export type EdgeSource = 'user' | 'ai_similarity' | 'helper_name';

export type EdgeContextType =
  | 'created_by'       // Content → Creator
  | 'part_of'          // Part → Whole
  | 'source_of'        // Derivative → Source
  | 'related_to'       // Default / general
  // Media-org relationship types
  | 'appeared_on'      // Person → Episode
  | 'covers_topic'     // Episode/Source → Topic
  | 'affiliated_with'  // Person → Organization
  | 'interested_in'    // Subscriber → Topic/Person/Episode
  | 'cites'            // Episode/Source → Source
  | 'expert_in'        // Person → Topic
  | 'features'         // Whole → Part (reverse of part_of)
  | 'extends'          // Builds on prior work
  | 'supports'         // Evidence for a claim
  | 'contradicts';     // Counter-evidence

export type EdgeCreatedVia = 'ui' | 'agent' | 'mcp' | 'workflow' | 'quicklink' | 'quick_capture_auto';

export interface EdgeContext {
  // SYSTEM-INFERRED
  type: EdgeContextType;
  confidence: number;   // 0-1
  inferred_at: string;  // ISO timestamp

  // PROVIDED AT CREATION / EDIT
  explanation: string;

  // SYSTEM-MANAGED
  created_via: EdgeCreatedVia;

  // Optional typed-edge metadata
  role?: string;           // e.g. host/guest/co-host for appeared_on
  depth?: string;          // e.g. mention/discussion/deep-dive for covers_topic
  valid_from?: string;     // ISO date for temporal relationships
  valid_until?: string;    // ISO date for temporal relationships
}

// ─── Filters & Data Shapes ──────────────────────────────────────────────────

export interface NodeFilters {
  dimensions?: string[];
  node_type?: NodeType;     // Filter by entity type
  search?: string;          // Text search in title/notes
  limit?: number;
  offset?: number;
  sortBy?: 'updated' | 'edges';
}

export interface ChunkData {
  node_id: number;
  chunk_idx?: number;
  text: string;
  embedding?: number[];
  embedding_type: string;
  metadata?: any;
}

export interface EdgeData {
  from_node_id: number;
  to_node_id: number;
  explanation: string;
  created_via: EdgeCreatedVia;
  source: EdgeSource;
  skip_inference?: boolean;
}

export interface ChatData {
  user_message?: string;
  assistant_message?: string;
  thread_id: string;
  focused_node_id?: number;
  metadata?: any;
  embedding?: number[];
}

// ─── Connections & Errors ────────────────────────────────────────────────────

export interface NodeConnection {
  id: number;
  connected_node: Node;
  edge: Edge;
}

export interface DatabaseError {
  message: string;
  code?: string;
  details?: any;
}

// ─── Dimensions ──────────────────────────────────────────────────────────────

export interface Dimension {
  name: string;
  description?: string | null;
  icon?: string | null;       // Visual icon for dimension browsing
  is_priority: boolean;
  updated_at: string;
}
