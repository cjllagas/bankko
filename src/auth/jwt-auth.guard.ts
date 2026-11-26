import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { E } from '../common/api-error';
import { IS_PUBLIC, ROLES, Role } from '../common/decorators';
import { config } from '../config';
import { Admin, TokenDenylist, User } from '../entities';

/**
 * Registered globally: every route needs a valid Bearer token unless it is marked @Public().
 * Authentication = verify the token (401). Authorization = check the role (403). Lab 06 Part C.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @InjectRepository(TokenDenylist) private readonly denylist: Repository<TokenDenylist>,
    @InjectRepository(Admin) private readonly admins: Repository<Admin>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const m = /^Bearer ([A-Za-z0-9._-]+)$/.exec(req.headers.authorization || '');
    if (!m) throw E.unauthorized();

    let p: any;
    try {
      // verifies signature, expiry and issuer; only HS256 is accepted (blocks alg=none)
      p = await this.jwt.verifyAsync(m[1], { secret: config.jwt.secret, issuer: config.jwt.issuer, algorithms: ['HS256'] });
    } catch { throw E.unauthorized(); }
    if (!['Customer', 'Admin'].includes(p.role) || typeof p.jti !== 'string' || !/^\d+$/.test(String(p.sub))) throw E.unauthorized();

    if (await this.denylist.existsBy({ jti: p.jti })) throw E.unauthorized(); // logged-out token

    // The account must still exist and be active (a deactivated admin loses access at once).
    const sub = Number(p.sub);
    if (p.role === 'Admin') {
      if (!(await this.admins.existsBy({ adminId: sub, status: 'Active' }))) throw E.unauthorized();
    } else {
      // A customer's tokens stop working once the email or password changed after they were issued (token version moved on).
      const u = await this.users.findOne({ where: { userId: sub }, select: { userId: true, tokenVersion: true } });
      if (!u || (p.tv ?? 0) !== u.tokenVersion) throw E.unauthorized();
    }

    req.auth = { sub, role: p.role, jti: p.jti, exp: p.exp };

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES, targets);
    if (roles?.length && !roles.includes(p.role)) {
      throw E.forbidden('Access denied.', [`Only ${roles.map((r) => (r === 'Admin' ? 'administrators' : 'customers')).join(' or ')} can use this endpoint.`]);
    }
    return true;
  }
}
