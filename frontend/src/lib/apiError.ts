/**
 * Helpers for reading backend error responses from Axios errors without `any`.
 */
import { isAxiosError } from 'axios';

interface ApiErrorBody {
  detail?: unknown;
  message?: unknown;
  error?: { message?: unknown };
  meta?: { message?: unknown };
}

/** HTTP status of a failed Axios request, if there was a response. */
export function getHttpStatus(err: unknown): number | undefined {
  return isAxiosError(err) ? err.response?.status : undefined;
}

/**
 * Human-readable message from a backend error body, if the server sent one.
 * Handles the app envelope (`meta.message` / `error.message`), FastAPI's `detail`
 * (including validation-error arrays) and a bare `message`.
 */
export function getServerErrorMessage(err: unknown): string | undefined {
  if (!isAxiosError<ApiErrorBody>(err)) return undefined;
  const body = err.response?.data;
  if (!body) return undefined;

  if (Array.isArray(body.detail)) {
    return body.detail
      .map((d: { msg?: string }) => d?.msg || JSON.stringify(d))
      .join(', ');
  }
  const candidates = [body.meta?.message, body.error?.message, body.detail, body.message];
  return candidates.find((c): c is string => typeof c === 'string' && c.length > 0);
}
