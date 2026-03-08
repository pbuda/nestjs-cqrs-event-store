import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  EVENT_STORE_ADAPTER,
  PersistentEventPublisher,
  RecordedEventEnvelope,
} from '@pbuda/nestjs-event-store';
import type { IEventStoreAdapter } from '@pbuda/nestjs-event-store';
import { TodoAggregate } from './todo.aggregate';
import {
  TodoCreatedEvent,
  TodoEditedEvent,
  TodoArchivedEvent,
} from './events';

@Injectable()
export class TodoRepository {
  constructor(
    @Inject(EVENT_STORE_ADAPTER)
    private readonly eventStore: IEventStoreAdapter,
    private readonly publisher: PersistentEventPublisher
  ) {}

  async findById(todoId: string): Promise<TodoAggregate> {
    const aggregate = new TodoAggregate(todoId);
    const streamId = `${aggregate.aggregateType}-${todoId}`;

    let eventCount = 0;
    for await (const envelope of this.eventStore.readStream(streamId)) {
      const event = this.deserializeEvent(envelope);
      aggregate.apply(event, { fromHistory: true });
      eventCount++;
    }

    if (eventCount === 0) {
      throw new NotFoundException(`Todo with id "${todoId}" not found`);
    }

    return this.publisher.mergeObjectContext(aggregate);
  }

  async save(aggregate: TodoAggregate): Promise<void> {
    const mergedAggregate = this.publisher.mergeObjectContext(aggregate);
    // commit() is fire-and-forget — bypass it to await persistence before returning
    const events = mergedAggregate.getUncommittedEvents().slice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (mergedAggregate.publishAll as unknown as (e: typeof events) => Promise<void>)(events);
    mergedAggregate.uncommit();
  }

  private deserializeEvent(
    envelope: RecordedEventEnvelope
  ): TodoCreatedEvent | TodoEditedEvent | TodoArchivedEvent {
    const data = envelope.data as Record<string, unknown>;

    switch (envelope.type) {
      case 'TodoCreatedV1':
        return new TodoCreatedEvent(
          data['todoId'] as string,
          data['title'] as string,
          data['description'] as string
        );
      case 'TodoEditedV1':
        return new TodoEditedEvent(
          data['todoId'] as string,
          data['title'] as string,
          data['description'] as string
        );
      case 'TodoArchivedV1':
        return new TodoArchivedEvent(data['todoId'] as string);
      default:
        throw new Error(`Unknown event type: ${envelope.type}`);
    }
  }
}
