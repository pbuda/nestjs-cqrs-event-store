import { Injectable } from '@nestjs/common';
import { AggregateRoot, IEvent } from '@nestjs/cqrs';
import { PersistentEventBus } from './persistent-event-bus';

/**
 * EventPublisher that uses PersistentEventBus for event publishing.
 *
 * This replaces the standard @nestjs/cqrs EventPublisher to ensure events
 * are persisted to the event store before being dispatched to handlers.
 */
@Injectable()
export class PersistentEventPublisher<EventBase extends IEvent = IEvent> {
  constructor(private readonly eventBus: PersistentEventBus) {}

  /**
   * Merge the event publisher into the provided class.
   * This is required to make `publish` and `publishAll` available on the `AggregateRoot` class.
   * @param metatype The class to merge into.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mergeClassContext<T extends new (...args: any[]) => AggregateRoot<EventBase>>(
    metatype: T
  ): T {
    const eventBus = this.eventBus;

    return class extends metatype {
      override publish(event: EventBase): void {
        eventBus.publish(event, this);
      }
      override publishAll(events: EventBase[]): void {
        eventBus.publishAll(events, this);
      }
    } as T;
  }

  /**
   * Merge the event publisher into the provided object.
   * This is required to make `publish` and `publishAll` available on the `AggregateRoot` class instance.
   * @param object The object to merge into.
   */
  mergeObjectContext<T extends AggregateRoot<EventBase>>(object: T): T {
    const eventBus = this.eventBus;

    object.publish = (event: EventBase) => {
      eventBus.publish(event, object);
    };

    object.publishAll = (events: EventBase[]) => {
      eventBus.publishAll(events, object);
    };

    return object;
  }
}
