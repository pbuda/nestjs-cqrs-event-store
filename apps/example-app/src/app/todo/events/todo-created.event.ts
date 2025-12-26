import { IDomainEvent } from '@pbuda/event-store-core';

export class TodoCreatedEvent implements IDomainEvent {
  readonly eventType = 'TodoCreatedV1';

  constructor(
    public readonly todoId: string,
    public readonly title: string,
    public readonly description: string
  ) {}
}
