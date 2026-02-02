import { Module } from '@nestjs/common';
import {
  ArchiveTodoHandler,
  CreateTodoHandler,
  EditTodoHandler,
  SendNotificationHandler,
} from './handlers';
import { TodoSaga } from './sagas';
import { TodoController } from './todo.controller';
import { TodoRepository } from './todo.repository';

const CommandHandlers = [
  CreateTodoHandler,
  EditTodoHandler,
  ArchiveTodoHandler,
  SendNotificationHandler,
];

const Sagas = [TodoSaga];

@Module({
  controllers: [TodoController],
  providers: [TodoRepository, ...CommandHandlers, ...Sagas],
})
export class TodoModule {}
