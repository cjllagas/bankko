import { BeforeInsert, Column, Entity, PrimaryColumn } from 'typeorm';

// One row per pending login: the password was accepted, the emailed code has not been confirmed yet.
// Only a hash of the code is stored. A row is single-use (consumedAt) and short-lived (expiresAt).
@Entity('login_challenge')
export class LoginChallenge {
  @PrimaryColumn({ name: 'Challenge_ID', length: 32 }) challengeId: string;
  @Column({ type: 'enum', enum: ['Customer', 'Admin'] }) role: 'Customer' | 'Admin';
  @Column({ name: 'Actor_ID', type: 'int' }) actorId: number;
  @Column({ name: 'Code_Hash', length: 64 }) codeHash: string;
  @Column({ type: 'int', default: 0 }) attempts: number;
  @Column({ type: 'int', default: 0 }) resendCount: number;
  @Column({ type: 'datetime' }) expiresAt: Date;
  @Column({ type: 'datetime' }) lastSentAt: Date;
  @Column({ type: 'datetime', nullable: true }) consumedAt: Date | null;
  @Column({ type: 'datetime' }) createdAt: Date;

  @BeforeInsert() stamp() { this.createdAt = new Date(); }
}
