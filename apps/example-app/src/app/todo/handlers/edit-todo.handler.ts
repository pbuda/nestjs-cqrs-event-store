import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EditTodoCommand } from '../commands';
import { TodoRepository } from '../todo.repository';

@CommandHandler(EditTodoCommand)
export class EditTodoHandler implements ICommandHandler<EditTodoCommand> {
  constructor(private readonly repository: TodoRepository) {}

  async execute(command: EditTodoCommand): Promise<void> {
    const todo = await this.repository.findById(command.todoId);
    todo.edit(command.title, command.description);
    await this.repository.save(todo);
  }
}
