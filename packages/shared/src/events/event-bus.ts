import type { DevTeamEvent, EventBus, EventHandler } from './types.js';

/**
 * In-memory EventBus implementation for testing and single-process use.
 *
 * Pattern matching rules:
 * - Exact: 'work_item.created' matches only 'work_item.created'
 * - Wildcard: 'work_item.*' matches 'work_item.created', 'work_item.updated', etc.
 */
export class InMemoryEventBus implements EventBus {
  private handlers = new Map<string, Set<EventHandler>>();

  async publish(event: DevTeamEvent): Promise<void> {
    // Auto-set timestamp if not provided
    if (!event.timestamp) {
      event.timestamp = new Date();
    }

    for (const [pattern, handlerSet] of this.handlers) {
      if (this.matches(pattern, event.type)) {
        for (const handler of handlerSet) {
          await handler(event);
        }
      }
    }
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

  async close(): Promise<void> {
    this.handlers.clear();
  }

  private matches(pattern: string, eventType: string): boolean {
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
