import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  CommandBus,
  EventBus,
  IEvent,
  UnhandledExceptionBus,
} from '@nestjs/cqrs';
import type { AsyncContext } from '@nestjs/cqrs';
import { CQRS_MODULE_OPTIONS } from '@nestjs/cqrs/dist/constants';
import type { CqrsModuleOptions } from '@nestjs/cqrs/dist/interfaces';
import { EVENT_STORE_ADAPTER } from '../adapters/event-store-adapter.interface';
import type { IEventStoreAdapter } from '../adapters/event-store-adapter.interface';
import { EventContext } from '../context/event-context';
import { EventEnvelopeFactory } from '../services/event-envelope-factory';
import { IAggregateIdentifiable } from '../types/aggregate.interface';
import { IDomainEvent } from '../types/domain-event.interface';

/**
 * Checks if an object implements IAggregateIdentifiable.
 */
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

/**
 * Checks if a domain event implements IDomainEvent.
 */
function isDomainEvent(event: IEvent): event is IDomainEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    'eventType' in event &&
    typeof (event as IDomainEvent).eventType === 'string'
  );
}

/**
 * Custom EventBus that persists events to an event store before dispatching to handlers.
 *
 * Events are persisted to per-aggregate streams when:
 * 1. The dispatcherContext implements IAggregateIdentifiable
 * 2. Events implement IDomainEvent
 *
 * When these conditions aren't met, events are dispatched without persistence
 * (fallback to standard EventBus behavior).
 */
@Injectable()
export class PersistentEventBus<
  EventBase extends IEvent = IEvent,
> extends EventBus<EventBase> {
  private readonly logger = new Logger(PersistentEventBus.name);

  constructor(
    commandBus: CommandBus,
    moduleRef: ModuleRef,
    unhandledExceptionBus: UnhandledExceptionBus,
    @Optional()
    @Inject(CQRS_MODULE_OPTIONS)
    options: CqrsModuleOptions | undefined,
    @Inject(EVENT_STORE_ADAPTER)
    private readonly adapter: IEventStoreAdapter,
    private readonly eventContext: EventContext,
    private readonly envelopeFactory: EventEnvelopeFactory
  ) {
    super(commandBus, moduleRef, unhandledExceptionBus, options);
  }

  /**
   * Publishes multiple events, persisting them to the event store first
   * when an aggregate context is provided.
   */
  override publishAll<TEvent extends EventBase>(
    events: TEvent[],
    dispatcherOrAsyncContext?: unknown,
    asyncContext?: AsyncContext
  ): Promise<void> {
    return this.publishAllInternal(events, dispatcherOrAsyncContext, asyncContext);
  }

  private async publishAllInternal<TEvent extends EventBase>(
    events: TEvent[],
    dispatcherOrAsyncContext?: unknown,
    asyncContext?: AsyncContext
  ): Promise<void> {
    if (!events || events.length === 0) {
      return;
    }

    // Resolve dispatcher context (handle overloaded signature)
    const dispatcherContext: unknown = dispatcherOrAsyncContext;

    // If no aggregate context, dispatch only
    if (!isAggregateIdentifiable(dispatcherContext)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      super.publishAll(events, dispatcherContext as any, asyncContext as any);
      return;
    }

    // Check if all events are domain events
    const domainEvents = events.filter(isDomainEvent) as unknown as IDomainEvent[];

    if (domainEvents.length !== events.length) {
      this.logger.warn(
        `Some events don't implement IDomainEvent. ` +
          `Only ${domainEvents.length}/${events.length} events will be persisted.`
      );
    }

    if (domainEvents.length === 0) {
      // No domain events to persist, just dispatch
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      super.publishAll(events, dispatcherContext as any, asyncContext as any);
      return;
    }

    // Build stream ID from aggregate context
    const streamId = `${dispatcherContext.aggregateType}-${dispatcherContext.aggregateId}`;

    // Get metadata from async context
    const metadata = this.eventContext.getMetadata();

    // Create envelopes for persistence
    const envelopes = this.envelopeFactory.createMany(domainEvents, metadata);

    // Persist to event store
    try {
      await this.adapter.appendToStream(streamId, envelopes);
    } catch (error) {
      this.logger.error(`Failed to persist events to stream "${streamId}"`, error);
      throw error;
    }

    // Dispatch to handlers after successful persistence
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    super.publishAll(events, dispatcherContext as any, asyncContext as any);
  }

  /**
   * Publishes a single event, persisting it first when an aggregate context is provided.
   */
  override publish<TEvent extends EventBase>(
    event: TEvent,
    dispatcherOrAsyncContext?: unknown,
    asyncContext?: AsyncContext
  ): Promise<void> {
    return this.publishAll([event], dispatcherOrAsyncContext, asyncContext);
  }
}
