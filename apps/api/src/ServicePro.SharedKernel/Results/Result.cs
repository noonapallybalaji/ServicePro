namespace ServicePro.SharedKernel.Results;

public enum ErrorType
{
    Failure,
    Validation,
    NotFound,
    Conflict,
    Unauthorized,
    Forbidden,
}

/// <summary>An expected business failure. Exceptions are reserved for the unexpected.</summary>
public sealed record Error(string Code, string Message, ErrorType Type = ErrorType.Failure)
{
    public static Error Validation(string code, string message) => new(code, message, ErrorType.Validation);

    public static Error NotFound(string code, string message) => new(code, message, ErrorType.NotFound);

    public static Error Conflict(string code, string message) => new(code, message, ErrorType.Conflict);

    public static Error Forbidden(string code, string message) => new(code, message, ErrorType.Forbidden);

    public static Error Unauthorized(string code, string message) => new(code, message, ErrorType.Unauthorized);
}

public class Result
{
    protected Result(Error? error) => Error = error;

    public Error? Error { get; }

    public bool IsSuccess => Error is null;

    public bool IsFailure => !IsSuccess;

    public static Result Success() => new(null);

    public static Result Failure(Error error) => new(error);

    public static Result<T> Success<T>(T value) => Result<T>.Success(value);

    public static implicit operator Result(Error error) => Failure(error);
}

public sealed class Result<T> : Result
{
    private readonly T? _value;

    private Result(T? value, Error? error)
        : base(error) => _value = value;

    /// <summary>The value of a successful result. Reading it from a failure is a programming error.</summary>
    public T Value => IsSuccess
        ? _value!
        : throw new InvalidOperationException($"Cannot read the value of a failed result ({Error!.Code}).");

    public static Result<T> Success(T value) => new(value, null);

    public static new Result<T> Failure(Error error) => new(default, error);

    public static implicit operator Result<T>(T value) => Success(value);

    public static implicit operator Result<T>(Error error) => Failure(error);
}
