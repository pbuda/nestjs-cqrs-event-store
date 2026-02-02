import { AggregateRoot } from '@nestjs/cqrs';
import { IAggregateIdentifiable } from '@pbuda/nestjs-event-store';
import { TodoArchivedEvent, TodoCreatedEvent, TodoEditedEvent } from './events';

export class TodoAggregate
  extends AggregateRoot
  implements IAggregateIdentifiable
{
  readonly aggregateType = 'Todo';

  private title = '';
  private description = '';
  private archived = false;
  private _version = -1n;

  constructor(public readonly aggregateId: string) {
    super();
  }

  // Factory method for creating new todos
  static create(id: string, title: string, description: string): TodoAggregate {
    const todo = new TodoAggregate(id);
    todo.apply(new TodoCreatedEvent(id, title, description));
    return todo;
  }

  edit(title: string, description: string): void {
    if (this.archived) {
      throw new Error('Cannot edit an archived todo');
    }
    this.apply(new TodoEditedEvent(this.aggregateId, title, description));
  }

  archive(): void {
    if (this.archived) {
      throw new Error('Todo is already archived');
    }
    this.apply(new TodoArchivedEvent(this.aggregateId));
  }

  // Event handlers (called by apply)
  onTodoCreatedEvent(event: TodoCreatedEvent): void {
    this.title = event.title;
    this.description = event.description;
    this._version++;
  }

  onTodoEditedEvent(event: TodoEditedEvent): void {
    this.title = event.title;
    this.description = event.description;
    this._version++;
  }

  onTodoArchivedEvent(_event: TodoArchivedEvent): void {
    this.archived = true;
    this._version++;
  }

  // Getters for read access
  getTitle(): string {
    return this.title;
  }

  getDescription(): string {
    return this.description;
  }

  isArchived(): boolean {
    return this.archived;
  }

  getVersion(): bigint {
    return this._version;
  }

  toSnapshot(): {
    id: string;
    title: string;
    description: string;
    archived: boolean;
  } {
    return {
      id: this.aggregateId,
      title: this.title,
      description: this.description,
      archived: this.archived,
    };
  }
}
