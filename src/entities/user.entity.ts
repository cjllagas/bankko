import { BeforeInsert, Column, Entity, Index, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Account } from './account.entity';
import { Notification } from './notification.entity';

@Entity('User')
export class User {
  @PrimaryGeneratedColumn({ name: 'User_ID' }) userId: number;
  @Column({ length: 50 }) firstName: string;
  @Column({ length: 50 }) lastName: string;
  @Index({ unique: true }) @Column({ length: 100 }) email: string;
  @Index({ unique: true }) @Column({ length: 15 }) phoneNumber: string;
  @Column({ name: 'Password', length: 255, select: false }) password: string; // bcrypt hash, never returned
  @Column({ type: 'int', default: 0 }) failedAttempts: number;
  @Column({ type: 'datetime', nullable: true }) lockedUntil: Date | null;
  @Column({ type: 'datetime' }) dateRegistered: Date;

  @OneToMany(() => Account, (a) => a.user) accounts: Account[];
  @OneToMany(() => Notification, (n) => n.user) notifications: Notification[];

  @BeforeInsert() stamp() { this.dateRegistered = new Date(); }
}
