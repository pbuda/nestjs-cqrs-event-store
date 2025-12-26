import { IDomainEvent } from '@pbuda/event-store-core';

export class TodoArchivedEvent implements IDomainEvent {
  readonly eventType = 'TodoArchivedV1';

  constructor(public readonly todoId: string) {}
}
