import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { SendNotificationCommand } from '../commands';

@CommandHandler(SendNotificationCommand)
export class SendNotificationHandler
  implements ICommandHandler<SendNotificationCommand>
{
  private readonly logger = new Logger(SendNotificationHandler.name);

  async execute(command: SendNotificationCommand): Promise<void> {
    this.logger.log(
      `[Notification] Todo ${command.todoId}: ${command.message}`
    );
  }
}
