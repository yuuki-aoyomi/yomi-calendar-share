export type ApiErrorBody = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
};

export const json = <T>(data: T, status = 200): Response =>
  Response.json(data, {
    status,
    headers: {
      'cache-control': 'no-store',
    },
  });

export const jsonError = (code: string, message: string, status: number): Response =>
  json<ApiErrorBody>({ ok: false, error: { code, message } }, status);
