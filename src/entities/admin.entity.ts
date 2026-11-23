import { BeforeInsert, Column, Entity, Index, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Transaction } from './transaction.entity';

@Entity('admin')
export class Admin {
  @PrimaryGeneratedColumn({ name: 'Admin_ID' }) adminId: number;
  @Column({ length: 50 }) firstName: string;
  @Column({ length: 50 }) lastName: string;
  @Index({ unique: true }) @Column({ length: 100 }) email: string;
  @Index({ unique: true }) @Column({ length: 15 }) phoneNumber: string;
  @Column({ name: 'Password', length: 255, select: false }) password: string;
  @Column({ type: 'enum', enum: ['Active', 'Inactive'], default: 'Active' }) status: 'Active' | 'Inactive';
  @Column({ type: 'int', default: 0 }) failedAttempts: number;
  @Column({ type: 'datetime', nullable: true }) lockedUntil: Date | null;
  @Column({ type: 'datetime' }) dateCreated: Date;

  @OneToMany(() => Transaction, (t) => t.reviewedBy) reviewedTransactions: Transaction[];

  @BeforeInsert() stamp() { this.dateCreated = new Date(); }
}
