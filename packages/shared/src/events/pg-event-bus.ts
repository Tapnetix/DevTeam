import pg from 'pg';
import type { DevTeamEvent, EventHandler, EventBus } from './types.js';

const CHANNEL = 'devteam_events';

/**
 * PostgreSQL-backed EventBus using LISTEN/NOTIFY.
 *
 * Uses a dedicated pg.Client for LISTEN (persistent connection required)
 * and a pg.Pool for NOTIFY/publish operations.
 *
 * Pattern matching rules (same as InMemoryEventBus):
 * - Exact: 'work_item.created' matches only 'work_item.created'
 * - Wildcard: 'work_item.*' matches 'work_item.created', 'work_item.updated', etc.
 */
export class PgEventBus implements EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private listenClient: pg.Client | null = null;
  private publishPool: pg.Pool;
  private connectionString: string;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
    this.publishPool = new pg.Pool({ connectionString, max: 5 });
  }

  /**
   * Connect the dedicated LISTEN client and start listening for notifications.
   * Must be called before subscribing or receiving events.
   */
  async connect(): Promise<void> {
    this.listenClient = new pg.Client({ connectionString: this.connectionString });
    await this.listenClient.connect();
    await this.listenClient.query(`LISTEN ${CHANNEL}`);

    this.listenClient.on('notification', (msg) => {
      if (msg.channel === CHANNEL && msg.payload) {
        try {
          const raw = JSON.parse(msg.payload);
          // Restore timestamp from ISO string back to Date
          const event: DevTeamEvent = {
            ...raw,
            timestamp: raw.timestamp ? new Date(raw.timestamp) : undefined,
          };
          this.dispatch(event);
        } catch {
          // Ignore malformed payloads
        }
      }
    });
  }

  subscribe(pattern: string, handler: EventHandler): () => void {
    if (!this.handlers.has(pattern)) {
      this.handlers.set(pattern, new Set());
    }
    this.handlers.get(pattern)!.add(handler);

    // Return unsubscribe function
    return () => {
      const set = this.handlers.get(pattern);
      if (set) {
        set.delete(handler);
        if (set.size === 0) {
          this.handlers.delete(pattern);
        }
      }
    };
  }

  async publish(event: DevTeamEvent): Promise<void> {
    // Auto-set timestamp if not provided
    if (!event.timestamp) {
      event.timestamp = new Date();
    }

    const payload = JSON.stringify(event);
    await this.publishPool.query('SELECT pg_notify($1, $2)', [CHANNEL, payload]);
  }

  async close(): Promise<void> {
    this.handlers.clear();

    if (this.listenClient) {
      await this.listenClient.end();
      this.listenClient = null;
    }

    await this.publishPool.end();
  }

  private dispatch(event: DevTeamEvent): void {
    for (const [pattern, handlerSet] of this.handlers) {
      if (this.matches(event.type, pattern)) {
        for (const handler of handlerSet) {
          // Fire and forget -- don't block notification processing
          Promise.resolve(handler(event)).catch(() => {
            // Swallow handler errors to avoid breaking the notification loop
          });
        }
      }
    }
  }

  private matches(eventType: string, pattern: string): boolean {
    if (pattern === eventType) {
      return true;
    }

    // Wildcard: 'work_item.*' matches 'work_item.created'
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2); // Remove '.*'
      return eventType.startsWith(prefix + '.');
    }

    return false;
  }
}
