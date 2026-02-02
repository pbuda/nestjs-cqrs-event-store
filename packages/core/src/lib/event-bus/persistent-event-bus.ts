import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventBus, IEvent } from '@nestjs/cqrs';
import type { IEventBus } from '@nestjs/cqrs';
import { EVENT_STORE_ADAPTER } from '../adapters/event-store-adapter.interface';
import type { IEventStoreAdapter } from '../adapters/event-store-adapter.interface';
import { EventContext } from '../context/event-context';
import { EventEnvelopeFactory } from '../services/event-envelope-factory';
import type { IAggregateIdentifiable } from '../types/aggregate.interface';
import type { IDomainEvent } from '../types/domain-event.interface';

function isAggregateIdentifiable(obj: unknown): obj is IAggregateIdentifiable {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'aggregateId' in obj &&
    'aggregateType' in obj &&
    typeof (obj as IAggregateIdentifiable).aggregateId === 'string' &&
    typeof (obj as IAggregateIdentifiable).aggregateType === 'string'
  );
}

function isDomainEvent(event: IEvent): event is IDomainEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    'eventType' in event &&
    typeof (event as IDomainEvent).eventType === 'string'
  );
}

/**
 * EventBus decorator that persists events before dispatching.
 *
 * Uses composition: wraps the standard EventBus and delegates to it
 * after persisting. This ensures events flow through the same subject$
 * that sagas and handlers subscribe to.
 */
@Injectable()
export class PersistentEventBus implements IEventBus {
  private readonly logger = new Logger(PersistentEventBus.name);

  constructor(
    private readonly eventBus: EventBus,
    @Inject(EVENT_STORE_ADAPTER)
    private readonly adapter: IEventStoreAdapter,
    private readonly eventContext: EventContext,
    private readonly envelopeFactory: EventEnvelopeFactory
  ) {}

  async publish<TEvent extends IEvent>(
    event: TEvent,
    context?: unknown
  ): Promise<void> {
    return this.publishAll([event], context);
  }

  async publishAll<TEvent extends IEvent>(
    events: TEvent[],
    context?: unknown
  ): Promise<void> {
    if (!events || events.length === 0) {
      return;
    }

    // CRITICAL: Copy events array because caller (aggregate.commit) clears
    // the internal array immediately after calling publishAll, but this
    // async function may still be awaiting persistence.
    const eventsCopy = [...events];

    this.logger.debug(`Publishing ${eventsCopy.length} events`);

    // Persist if we have aggregate context
    if (isAggregateIdentifiable(context)) {
      const domainEvents = eventsCopy.filter(
        isDomainEvent
      ) as unknown as IDomainEvent[];

      if (domainEvents.length > 0) {
        const streamId = `${context.aggregateType}-${context.aggregateId}`;
        const metadata = this.eventContext.getMetadata();
        const envelopes = this.envelopeFactory.createMany(domainEvents, metadata);

        try {
          await this.adapter.appendToStream(streamId, envelopes);
          this.logger.debug(
            `Persisted ${domainEvents.length} events to stream: ${streamId}`
          );
        } catch (error) {
          this.logger.error(
            `Failed to persist events to stream "${streamId}"`,
            error
          );
          throw error;
        }
      }

      if (domainEvents.length !== eventsCopy.length) {
        this.logger.warn(
          `Some events don't implement IDomainEvent. ` +
            `Only ${domainEvents.length}/${eventsCopy.length} events were persisted.`
        );
      }
    }

    // Delegate to standard EventBus - this reaches sagas via subject$
    this.eventBus.publishAll(eventsCopy, context);
  }
}
