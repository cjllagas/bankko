import { BeforeInsert, Column, Entity, Index, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Account } from './account.entity';
import { CredentialRequest } from './credential-request.entity';
import { Notification } from './notification.entity';

@Entity('user')
export class User {
  @PrimaryGeneratedColumn({ name: 'User_ID' }) userId: number;
  @Column({ length: 50 }) firstName: string;
  @Column({ length: 50 }) lastName: string;
  @Index({ unique: true }) @Column({ length: 100 }) email: string;
  @Index({ unique: true }) @Column({ length: 15 }) phoneNumber: string;
  @Column({ name: 'Password', length: 255, select: false }) password: string; // bcrypt hash, never returned
  @Column({ type: 'int', default: 0 }) failedAttempts: number;
  @Column({ type: 'datetime', nullable: true }) lockedUntil: Date | null;
  // Counter stored in every customer JWT. It goes up when the email or password changes, which signs out every device.
  @Column({ name: 'Token_Version', type: 'int', default: 0 }) tokenVersion: number;
  @Column({ type: 'datetime' }) dateRegistered: Date;

  @OneToMany(() => Account, (a) => a.user) accounts: Account[];
  @OneToMany(() => Notification, (n) => n.user) notifications: Notification[];
  @OneToMany(() => CredentialRequest, (c) => c.user) credentialRequests: CredentialRequest[];

  @BeforeInsert() stamp() { this.dateRegistered = new Date(); }
}
