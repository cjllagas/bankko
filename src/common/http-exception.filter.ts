import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { ApiError } from './api-error';

const TITLES: Record<number, string> = {
  400: 'Bad request.', 401: 'Unauthorized.', 403: 'Access denied.', 404: 'Resource not found.', 405: 'Method not allowed.',
  413: 'Request body too large.', 415: 'Unsupported media type.', 429: 'Too many attempts.',
};

// Every error leaves the API in the same shape (Lab 05 Part D conventions).
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Error');

  catch(exception: any, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();
    let status = 500, message = 'Internal server error.', errors: string[] = [], headers: Record<string, string> = {};

    if (exception instanceof ApiError) {
      status = exception.getStatus(); message = exception.message; errors = exception.errors; headers = exception.headers;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r: any = exception.getResponse();
      message = TITLES[status] || exception.message;
      const detail = typeof r === 'string' ? r : r?.message;
      errors = detail ? [].concat(detail) : [];
      if (status === 404) errors = [`No endpoint at ${req.path}.`];
    } else if (exception && typeof exception.status === 'number' && typeof exception.type === 'string') {
      // errors raised by the JSON body parser
      status = exception.status;
      message = exception.type === 'entity.too.large' ? TITLES[413] : exception.type === 'entity.parse.failed' ? 'Malformed JSON.' : TITLES[status] || 'Bad request.';
      errors = exception.type === 'entity.parse.failed' ? ['The request body must be a JSON object.'] : [];
    } else {
      const dbDown = ['ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT'].includes(exception?.code || exception?.driverError?.code);
      status = dbDown ? 503 : 500;
      message = dbDown ? 'Service unavailable.' : 'Internal server error.';
      this.log.error(`${req.method} ${req.url} -> ${exception?.stack || exception}`);
    }
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    res.status(status).json({ success: false, statusCode: status, message, errors, timestamp: new Date().toISOString() });
  }
}
