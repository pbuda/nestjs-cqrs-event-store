import { IDomainEvent } from '@pbuda/event-store-core';

export class TodoEditedEvent implements IDomainEvent {
  readonly eventType = 'TodoEditedV1';

  constructor(
    public readonly todoId: string,
    public readonly title: string,
    public readonly description: string
  ) {}
}
