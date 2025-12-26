import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CreateTodoCommand } from '../commands';
import { TodoAggregate } from '../todo.aggregate';
import { TodoRepository } from '../todo.repository';

@CommandHandler(CreateTodoCommand)
export class CreateTodoHandler implements ICommandHandler<CreateTodoCommand> {
  constructor(private readonly repository: TodoRepository) {}

  async execute(command: CreateTodoCommand): Promise<void> {
    const todo = TodoAggregate.create(
      command.todoId,
      command.title,
      command.description,
    );
    await this.repository.save(todo);
  }
}
