import { Injectable, Logger } from '@nestjs/common';
import { ICommand, ofType, Saga } from '@nestjs/cqrs';
import { Observable, map } from 'rxjs';
import { SendNotificationCommand } from '../commands';
import { TodoCreatedEvent } from '../events';

@Injectable()
export class TodoSaga {
  private readonly logger = new Logger(TodoSaga.name);

  @Saga()
  todoCreated = (events$: Observable<any>): Observable<ICommand> => {
    return events$.pipe(
      ofType(TodoCreatedEvent),
      map((event) => {
        this.logger.log(`Saga received TodoCreatedEvent for ${event.todoId}`);
        return new SendNotificationCommand(
          event.todoId,
          `Todo "${event.title}" was created`
        );
      })
    );
  };
}
