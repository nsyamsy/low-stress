export class AppError extends Error {
  constructor(
    public code: string,
    public statusCode = 400,
    public params: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = "AppError";
  }
}
