export class EditTodoCommand {
  constructor(
    public readonly todoId: string,
    public readonly title: string,
    public readonly description: string
  ) {}
}
