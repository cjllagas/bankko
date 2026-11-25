import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ENTITIES } from '../entities';
import { AccessService } from './access.service';
import { AuditService } from './audit.service';
import { MailService } from './mail.service';

// Shared by every feature module: the repositories plus the audit and access helpers.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature(ENTITIES)],
  providers: [AuditService, AccessService, MailService],
  exports: [TypeOrmModule, AuditService, AccessService, MailService],
})
export class CoreModule {}
