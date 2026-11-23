import { BeforeInsert, Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { decimal } from '../common/transformers';
import { User } from './user.entity';
import { Payee } from './payee.entity';
import { Transaction } from './transaction.entity';

@Entity('account')
export class Account {
  @PrimaryGeneratedColumn({ name: 'Account_ID' }) accountId: number;
  @Column({ name: 'User_ID' }) userId: number;
  @Index({ unique: true }) @Column({ length: 20 }) accountNumber: string;
  @Column({ type: 'enum', enum: ['Savings', 'Checking'] }) accountType: 'Savings' | 'Checking';
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0, transformer: decimal }) balance: number;
  @Column({ type: 'datetime' }) dateOpened: Date;
  @Column({ type: 'enum', enum: ['Active', 'Inactive', 'Frozen'], default: 'Active' }) status: 'Active' | 'Inactive' | 'Frozen';

  @ManyToOne(() => User, (u) => u.accounts, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'User_ID' }) user: User;
  @OneToMany(() => Payee, (p) => p.account) payees: Payee[];
  @OneToMany(() => Transaction, (t) => t.account) transactions: Transaction[];

  @BeforeInsert() stamp() { this.dateOpened = new Date(); }
}
