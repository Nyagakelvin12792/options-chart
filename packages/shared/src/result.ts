export type Result<T, E extends Error = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const success = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const failure = <E extends Error>(error: E): Result<never, E> => ({
  ok: false,
  error,
});
