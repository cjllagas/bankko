import { BeforeInsert, Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { decimal } from '../common/transformers';
import { Account } from './account.entity';
import { Admin } from './admin.entity';
import { Payee } from './payee.entity';
import { Notification } from './notification.entity';

@Entity('Transaction')
@Index(['accountId', 'idempotencyKey'], { unique: true }) // the same payment request can never be recorded twice
export class Transaction {
  @PrimaryGeneratedColumn({ name: 'Transaction_ID' }) transactionId: number;
  @Column({ name: 'Account_ID' }) accountId: number;
  @Column({ name: 'Destination_Account_ID', type: 'int', nullable: true }) destinationAccountId: number | null;
  @Column({ name: 'Payee_ID', type: 'int', nullable: true }) payeeId: number | null;
  @Column({ name: 'Reviewed_By_Admin_ID', type: 'int', nullable: true }) reviewedByAdminId: number | null;
  @Column({ type: 'enum', enum: ['Transfer', 'BillPayment'] }) transactionType: 'Transfer' | 'BillPayment';
  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: decimal }) amount: number;
  @Column({ type: 'datetime' }) transactionDate: Date;
  @Index({ unique: true }) @Column({ length: 30 }) referenceNumber: string;
  @Column({ type: 'enum', enum: ['Pending', 'Completed', 'Failed'], default: 'Completed' }) status: 'Pending' | 'Completed' | 'Failed';
  @Column({ type: 'enum', enum: ['None', 'Flagged', 'Cleared'], default: 'None' }) reviewStatus: 'None' | 'Flagged' | 'Cleared';
  @Column({ type: 'varchar', length: 255, nullable: true }) reviewNote: string | null;
  @Column({ type: 'datetime', nullable: true }) reviewedAt: Date | null;
  @Column({ type: 'varchar', length: 64, nullable: true }) idempotencyKey: string | null;

  @ManyToOne(() => Account, (a) => a.transactions, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'Account_ID' }) account: Account;
  @ManyToOne(() => Account, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'Destination_Account_ID' }) destinationAccount: Account | null;
  @ManyToOne(() => Payee, (p) => p.transactions, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'Payee_ID' }) payee: Payee | null;
  @ManyToOne(() => Admin, (a) => a.reviewedTransactions, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'Reviewed_By_Admin_ID' }) reviewedBy: Admin | null;
  @OneToMany(() => Notification, (n) => n.transaction) notifications: Notification[];

  @BeforeInsert() stamp() { this.transactionDate = new Date(); }
}
