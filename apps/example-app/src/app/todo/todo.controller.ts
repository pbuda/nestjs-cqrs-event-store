import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { randomUUID } from 'crypto';
import {
  ArchiveTodoCommand,
  CreateTodoCommand,
  EditTodoCommand,
} from './commands';
import { TodoRepository } from './todo.repository';

interface CreateTodoDto {
  title: string;
  description: string;
}

interface EditTodoDto {
  title: string;
  description: string;
}

interface TodoResponseDto {
  id: string;
  title: string;
  description: string;
  archived: boolean;
}

@Controller('todos')
export class TodoController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly repository: TodoRepository,
  ) {}

  @Post()
  async create(@Body() dto: CreateTodoDto): Promise<TodoResponseDto> {
    const todoId = randomUUID();
    await this.commandBus.execute(
      new CreateTodoCommand(todoId, dto.title, dto.description),
    );
    const todo = await this.repository.findById(todoId);
    return todo.toSnapshot();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<TodoResponseDto> {
    const todo = await this.repository.findById(id);
    return todo.toSnapshot();
  }

  @Put(':id')
  async edit(
    @Param('id') id: string,
    @Body() dto: EditTodoDto,
  ): Promise<TodoResponseDto> {
    await this.commandBus.execute(
      new EditTodoCommand(id, dto.title, dto.description),
    );
    const todo = await this.repository.findById(id);
    return todo.toSnapshot();
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  async archive(@Param('id') id: string): Promise<TodoResponseDto> {
    await this.commandBus.execute(new ArchiveTodoCommand(id));
    const todo = await this.repository.findById(id);
    return todo.toSnapshot();
  }
}
