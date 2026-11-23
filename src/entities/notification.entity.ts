import { BeforeInsert, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity';
import { Transaction } from './transaction.entity';

@Entity('notification')
export class Notification {
  @PrimaryGeneratedColumn({ name: 'Notification_ID' }) notificationId: number;
  @Column({ name: 'User_ID' }) userId: number;
  @Column({ name: 'Transaction_ID', type: 'int', nullable: true }) transactionId: number | null;
  @Column({ name: 'Type', type: 'enum', enum: ['Email', 'SMS'] }) type: 'Email' | 'SMS';
  @Column({ length: 255 }) message: string;
  @Column({ type: 'datetime' }) dateSent: Date;
  @Column({ type: 'enum', enum: ['Sent', 'Failed'], default: 'Sent' }) status: 'Sent' | 'Failed';

  @ManyToOne(() => User, (u) => u.notifications, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'User_ID' }) user: User;
  @ManyToOne(() => Transaction, (t) => t.notifications, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'Transaction_ID' }) transaction: Transaction | null;

  @BeforeInsert() stamp() { this.dateSent = new Date(); }
}
