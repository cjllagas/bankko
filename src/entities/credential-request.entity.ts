import { BeforeInsert, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Admin } from './admin.entity';
import { User } from './user.entity';

// One row per pending credential change that must be confirmed by the customer:
//   EmailChange   - a 6-digit code sent to the NEW address (the customer asked for the change)
//   PasswordReset - a long one-time token sent to the customer's CURRENT address (an admin asked for the reset)
// Only a hash of the code/token is stored. A row is single-use (consumedAt) and short-lived (expiresAt).
@Entity('credential_request')
export class CredentialRequest {
  @PrimaryColumn({ name: 'Request_ID', length: 32 }) requestId: string;
  @Column({ name: 'User_ID', type: 'int' }) userId: number;
  @Column({ name: 'Purpose', type: 'enum', enum: ['EmailChange', 'PasswordReset'] }) purpose: 'EmailChange' | 'PasswordReset';
  @Column({ name: 'New_Email', type: 'varchar', length: 100, nullable: true }) newEmail: string | null;
  @Column({ name: 'Requested_By_Admin_ID', type: 'int', nullable: true }) requestedByAdminId: number | null;
  @Column({ name: 'Code_Hash', length: 64 }) codeHash: string;
  @Column({ type: 'int', default: 0 }) attempts: number;
  @Column({ type: 'datetime' }) expiresAt: Date;
  @Column({ type: 'datetime' }) lastSentAt: Date;
  @Column({ type: 'datetime', nullable: true }) consumedAt: Date | null;
  @Column({ type: 'datetime' }) createdAt: Date;

  @ManyToOne(() => User, (u) => u.credentialRequests, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'User_ID' }) user: User;
  @ManyToOne(() => Admin, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'Requested_By_Admin_ID' }) requestedBy: Admin | null;

  @BeforeInsert() stamp() { this.createdAt = new Date(); }
}
