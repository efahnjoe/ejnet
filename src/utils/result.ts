export abstract class Result<T> {
  private static DEFAULT_SUCCESS_STATUS = 200;
  private static DEFAULT_ERROR_STATUS = 500;

  public abstract isOk(): this is Ok<T>;
  public abstract isFail(): this is Fail<T>;
  public abstract get value(): T;
  public abstract get error(): ResultError;
  public abstract get status(): number;

  public map<U>(fn: (value: T) => U): Result<U> {
    if (this.isOk()) {
      return Result.ok(fn(this.value), this.status);
    } else {
      return Result.fail(this.error, this.status);
    }
  }

  public flatMap<U>(fn: (value: T) => Result<U>): Result<U> {
    if (this.isOk()) {
      return fn(this.value);
    } else {
      return Result.fail(this.error, this.status);
    }
  }

  public onOk(fn: (value: T) => void): this {
    if (this.isOk()) fn(this.value);

    return this;
  }

  public onFail(fn: (error: ResultError) => void): this {
    if (this.isFail()) fn(this.error);

    return this;
  }

  public match<U>(onOk: (value: T) => U, onFail: (error: ResultError) => U): U {
    return this.isOk() ? onOk(this.value) : onFail(this.error);
  }

  public static ok<T>(
    data: T,
    status = this.DEFAULT_SUCCESS_STATUS
  ): Result<T> {
    return new Ok(data, status);
  }

  public static fail(
    error: unknown,
    status = this.DEFAULT_ERROR_STATUS
  ): Result<never> {
    const standardized = this.toResultError(error);

    return new Fail(standardized, status);
  }

  // Safely convert any value to ResultError
  private static toResultError(error: unknown): ResultError {
    let message: string;
    let details: unknown = error;

    if (error instanceof Error) {
      message = error.message;

      details = {
        stack: error.stack || undefined,
        // Spread all enumerable properties (e.g., code, errno, etc.)
        ...error
      };

      // Extract more detailed context, such as the stack.
      return { message, details: { name: error.name, stack: error.stack } };
    } else if (typeof error === "string") {
      message = error;
    } else if (
      typeof error === "object" &&
      error !== null &&
      "message" in error
    ) {
      // An object similar to Error, but not an instance of Error.
      message =
        (error as { message?: unknown }).message?.toString() ??
        "Unknown error object";
    } else {
      message = "Unknown error";
    }

    return { message, details }; // Keep the original error as details for debugging.
  }
}

export class Ok<T> extends Result<T> {
  private readonly _value: T;
  private readonly _status: number;

  constructor(value: T, status: number) {
    super();
    this._value = value;
    this._status = status;
  }

  isOk(): this is Ok<T> {
    return true;
  }
  isFail(): this is Fail<T> {
    return false;
  }

  get value(): T {
    return this._value;
  }
  get error(): ResultError {
    throw new Error("Cannot access error on success");
  }
  get status(): number {
    return this._status;
  }
}

export interface ResultError {
  message: string;
  details?: unknown;
}

export class Fail<T = never> extends Result<T> {
  private readonly _error: ResultError;
  private readonly _status: number;

  constructor(error: ResultError, status: number) {
    super();
    this._error = error;
    this._status = status;
  }

  isOk(): this is Ok<T> {
    return false;
  }
  isFail(): this is Fail<T> {
    return true;
  }

  get value(): T {
    throw new Error("Cannot access value on failure");
  }
  get error(): ResultError {
    return this._error;
  }
  get status(): number {
    return this._status;
  }
}
