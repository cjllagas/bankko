import { BeforeInsert, Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Account } from './account.entity';
import { Biller } from './biller.entity';
import { Transaction } from './transaction.entity';

@Entity('Payee')
// a payee (biller + reference number) can be saved only once per account
@Index(['accountId', 'billerId', 'billerAccountNumber'], { unique: true })
export class Payee {
  @PrimaryGeneratedColumn({ name: 'Payee_ID' }) payeeId: number;
  @Column({ name: 'Account_ID' }) accountId: number;
  @Column({ name: 'Biller_ID' }) billerId: number;
  @Column({ length: 50 }) billerAccountNumber: string;
  @Column({ type: 'varchar', length: 50, nullable: true }) nickname: string | null;
  @Column({ type: 'datetime' }) dateAdded: Date;
  @Column({ type: 'enum', enum: ['Active', 'Removed'], default: 'Active' }) status: 'Active' | 'Removed';

  @ManyToOne(() => Account, (a) => a.payees, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'Account_ID' }) account: Account;
  @ManyToOne(() => Biller, (b) => b.payees, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'Biller_ID' }) biller: Biller;
  @OneToMany(() => Transaction, (t) => t.payee) transactions: Transaction[];

  @BeforeInsert() stamp() { this.dateAdded = new Date(); }
}
