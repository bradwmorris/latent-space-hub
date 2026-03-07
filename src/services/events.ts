/**
 * Event Broadcasting Service for Real-time UI Updates
 * Manages SSE connections and broadcasts database change events
 */

export interface DatabaseEvent {
  type:
    | 'NODE_CREATED'
    | 'NODE_UPDATED'
    | 'NODE_DELETED'
    | 'EDGE_CREATED'
    | 'EDGE_DELETED'
    | 'DIMENSION_UPDATED'
    | 'HELPER_UPDATED'
    | 'AGENT_UPDATED'
    | 'AGENT_DELEGATION_CREATED'
    | 'AGENT_DELEGATION_UPDATED'
    | 'SKILL_UPDATED'
    | 'CONNECTION_ESTABLISHED';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  timestamp: number;
}

class EventBroadcaster {
  private connections = new Set<ReadableStreamDefaultController>();

  /**
   * Add a new SSE connection
   */
  addConnection(controller: ReadableStreamDefaultController) {
    this.connections.add(controller);
  }

  /**
   * Remove an SSE connection
   */
  removeConnection(controller: ReadableStreamDefaultController) {
    this.connections.delete(controller);
  }

  /**
   * Broadcast an event to all connected clients
   */
  broadcast(event: Omit<DatabaseEvent, 'timestamp'>) {
    console.log(`📡 Broadcasting ${event.type} to ${this.connections.size} connections`);
    
    const eventWithTimestamp: DatabaseEvent = {
      ...event,
      timestamp: Date.now()
    };

    const message = `data: ${JSON.stringify(eventWithTimestamp)}\n\n`;
    const encoder = new TextEncoder();
    const data = encoder.encode(message);

    // Send to all connected clients
    let successCount = 0;
    for (const controller of this.connections) {
      try {
        controller.enqueue(data);
        successCount++;
      } catch (error) {
        // Connection is closed, remove it
        console.log('🔌 Removing dead SSE connection');
        this.connections.delete(controller);
      }
    }
    
    console.log(`✅ Broadcasted to ${successCount} active connections`);
  }

  /**
   * Send keep-alive ping to maintain connections
   */
  sendKeepAlive() {
    const ping = `: keep-alive\n\n`;
    const encoder = new TextEncoder();
    const data = encoder.encode(ping);

    for (const controller of this.connections) {
      try {
        controller.enqueue(data);
      } catch (error) {
        this.connections.delete(controller);
      }
    }
  }

  /**
   * Get connection count for debugging
   */
  getConnectionCount(): number {
    return this.connections.size;
  }
}

// Global singleton instance with proper Next.js dev mode handling
declare global {
  // eslint-disable-next-line no-var
  var eventBroadcaster: EventBroadcaster | undefined;
  // eslint-disable-next-line no-var
  var keepAliveInterval: NodeJS.Timeout | undefined;
}

export const eventBroadcaster = globalThis.eventBroadcaster ?? new EventBroadcaster();

if (typeof window === 'undefined') {
  globalThis.eventBroadcaster = eventBroadcaster;
  
  // Keep-alive interval (every 30 seconds) - only create once
  if (!globalThis.keepAliveInterval) {
    globalThis.keepAliveInterval = setInterval(() => {
      eventBroadcaster.sendKeepAlive();
    }, 30000);
  }
}
