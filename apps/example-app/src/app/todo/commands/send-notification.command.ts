export class SendNotificationCommand {
  constructor(
    public readonly todoId: string,
    public readonly message: string
  ) {}
}
