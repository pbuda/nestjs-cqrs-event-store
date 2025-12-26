import { Module } from '@nestjs/common';
import {
  ArchiveTodoHandler,
  CreateTodoHandler,
  EditTodoHandler,
} from './handlers';
import { TodoController } from './todo.controller';
import { TodoRepository } from './todo.repository';

const CommandHandlers = [
  CreateTodoHandler,
  EditTodoHandler,
  ArchiveTodoHandler,
];

@Module({
  controllers: [TodoController],
  providers: [TodoRepository, ...CommandHandlers],
})
export class TodoModule {}
