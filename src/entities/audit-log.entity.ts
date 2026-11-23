import { BeforeInsert, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

// Append-only: the API only ever inserts and reads this table.
@Entity('Audit_Log')
export class AuditLog {
  @PrimaryGeneratedColumn({ name: 'Log_ID', type: 'bigint' }) logId: string;
  @Column({ type: 'enum', enum: ['User', 'Admin', 'System'] }) actorType: 'User' | 'Admin' | 'System';
  @Column({ name: 'Actor_ID', type: 'int', nullable: true }) actorId: number | null;
  @Column({ name: 'Action', length: 40 }) action: string;
  @Column({ type: 'varchar', length: 30, nullable: true }) entityType: string | null;
  @Column({ name: 'Entity_ID', type: 'int', nullable: true }) entityId: number | null;
  @Column({ name: 'IP_Address', type: 'varchar', length: 45, nullable: true }) ipAddress: string | null;
  @Column({ type: 'datetime' }) createdAt: Date;

  @BeforeInsert() stamp() { this.createdAt = new Date(); }
}
