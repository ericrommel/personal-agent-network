export type Result<T, E> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: E }>;

export const success = <T>(value: T): Result<T, never> => Object.freeze({ ok: true, value });

export const failure = <E>(error: E): Result<never, E> => Object.freeze({ ok: false, error });
