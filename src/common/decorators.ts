import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';
export type Role = 'Customer' | 'Admin';
export interface AuthUser { sub: number; role: Role; jti: string; exp: number }

/** No token needed (login, registration). Every other route requires a valid JWT. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Only these roles may call the route; anything else gets 403. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

/** The verified token claims placed on the request by JwtAuthGuard. */
export const CurrentUser = createParamDecorator((_d: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().auth);

export const ClientIp = createParamDecorator((_d: unknown, ctx: ExecutionContext): string => {
  const ip: string = ctx.switchToHttp().getRequest().ip || '';
  return ip.replace(/^::ffff:/, '').slice(0, 45);
});
