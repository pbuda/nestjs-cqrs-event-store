import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ArchiveTodoCommand } from '../commands';
import { TodoRepository } from '../todo.repository';

@CommandHandler(ArchiveTodoCommand)
export class ArchiveTodoHandler implements ICommandHandler<ArchiveTodoCommand> {
  constructor(private readonly repository: TodoRepository) {}

  async execute(command: ArchiveTodoCommand): Promise<void> {
    const todo = await this.repository.findById(command.todoId);
    todo.archive();
    await this.repository.save(todo);
  }
}
