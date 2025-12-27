import { IDomainEvent } from '@pbuda/nestjs-event-store';

export class TodoArchivedEvent implements IDomainEvent {
  readonly eventType = 'TodoArchivedV1';

  constructor(public readonly todoId: string) {}
}
