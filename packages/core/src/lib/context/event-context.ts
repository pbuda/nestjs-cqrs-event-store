import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { EventMetadata } from '../types/event-metadata';

/**
 * Service for managing event metadata context using AsyncLocalStorage.
 * Metadata set in this context is automatically attached to events
 * persisted through the PersistentEventBus.
 *
 * @example
 * // In middleware or guard:
 * eventContext.run({ correlationId: req.id, actor: 'user:123' }, () => next());
 *
 * // Later in command handler, events will automatically get this metadata
 */
@Injectable()
export class EventContext {
  private readonly storage = new AsyncLocalStorage<EventMetadata>();

  /**
   * Execute a function within a metadata context.
   * All events published within this context will have the metadata attached.
   *
   * @param metadata - Metadata to attach to events
   * @param fn - Function to execute within the context
   * @returns The return value of the function
   */
  run<T>(metadata: EventMetadata, fn: () => T): T {
    return this.storage.run(metadata, fn);
  }

  /**
   * Get the current metadata from the context.
   * Returns undefined if called outside of a run() context.
   */
  getMetadata(): EventMetadata | undefined {
    return this.storage.getStore();
  }

  /**
   * Check if we're currently within a metadata context.
   */
  hasContext(): boolean {
    return this.storage.getStore() !== undefined;
  }
}
