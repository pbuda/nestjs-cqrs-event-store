import { IDomainEvent } from '@pbuda/nestjs-event-store';

export class TodoCreatedEvent implements IDomainEvent {
  readonly eventType = 'TodoCreatedV1';

  constructor(
    public readonly todoId: string,
    public readonly title: string,
    public readonly description: string
  ) {}
}
