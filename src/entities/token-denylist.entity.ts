import { Column, Entity, PrimaryColumn } from 'typeorm';

// Logged-out JWTs (by jti) stay here until they would have expired anyway.
@Entity('Token_Denylist')
export class TokenDenylist {
  @PrimaryColumn({ name: 'Jti', length: 32 }) jti: string;
  @Column({ type: 'datetime' }) expiresAt: Date;
}
