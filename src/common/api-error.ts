import { HttpException } from '@nestjs/common';

// One error type for the whole API; the exception filter turns it into the standard error body.
export class ApiError extends HttpException {
  constructor(status: number, message: string, public readonly errors: string[] = [], public readonly headers: Record<string, string> = {}) {
    super({ message, errors }, status);
  }
}

export const E = {
  badRequest: (m: string, errs: string[] = []) => new ApiError(400, m, errs),
  unauthorized: (m = 'Unauthorized.', errs = ['Missing, invalid or expired access token.']) => new ApiError(401, m, errs),
  forbidden: (m = 'Access denied.', errs: string[] = []) => new ApiError(403, m, errs),
  notFound: (m: string, errs: string[] = []) => new ApiError(404, m, errs),
  conflict: (m: string, errs: string[] = []) => new ApiError(409, m, errs),
  unprocessable: (m: string, errs: string[] = []) => new ApiError(422, m, errs),
  tooMany: (retryAfterSeconds: number) =>
    new ApiError(429, 'Too many attempts.', [`Try again in ${Math.max(1, Math.ceil(retryAfterSeconds / 60))} minute(s).`],
      { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterSeconds))) }),
};
