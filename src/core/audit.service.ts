import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditLog } from '../entities';

type Actor = 'User' | 'Admin' | 'System';

// Append-only Audit_Log writer (Lab 06 measure 9).
@Injectable()
export class AuditService {
  private readonly log = new Logger('Audit');
  constructor(@InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>) {}

  async record(actorType: Actor, actorId: number | null, action: string, entityType: string | null, entityId: number | null, ip?: string, manager?: EntityManager) {
    const repo = manager ? manager.getRepository(AuditLog) : this.repo;
    const row = repo.create({ actorType, actorId: actorId ?? null, action, entityType: entityType ?? null, entityId: entityId ?? null, ipAddress: ip ? String(ip).slice(0, 45) : null });
    try {
      await repo.save(row);
    } catch (e: any) {
      // Inside a transaction a lost audit row must fail the whole action; outside, never break the request.
      if (manager) throw e;
      this.log.error(`write failed: ${e.message}`);
    }
  }
}
