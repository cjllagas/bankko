import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Payee } from './payee.entity';

@Entity('biller')
export class Biller {
  @PrimaryGeneratedColumn({ name: 'Biller_ID' }) billerId: number;
  @Column({ length: 100 }) billerName: string;
  @Column({ length: 50 }) category: string;
  @Column({ type: 'enum', enum: ['Active', 'Inactive'], default: 'Active' }) status: 'Active' | 'Inactive';

  @OneToMany(() => Payee, (p) => p.biller) payees: Payee[];
}
