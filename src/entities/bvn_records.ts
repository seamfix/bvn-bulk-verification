/* eslint-disable prettier/prettier */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BvnBulkVerifications } from './bvn_bulk_verifications';

@Entity('bvn_records')
export class BvnRecords {
  @PrimaryGeneratedColumn()
  pk: number;

  @CreateDateColumn({ type: 'timestamp' })
  created_date: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  modified_date: Date;

  @Column({
    type: 'enum',
    enum: ['VERIFIED', 'NOT_VERIFIED', 'FAILED'],
    nullable: true,
  })
  status: string;

  @Column({ type: 'varchar', nullable: true })
  failure_reason: string;

  @Column({
    type: 'enum',
    enum: ['SUCCESSFUL', 'FAILED'],
    nullable: true,
  })
  transaction_status: string;

  @ManyToOne(() => BvnBulkVerifications, (bulk) => bulk.records)
  @JoinColumn([{ name: 'bulk_fk', referencedColumnName: 'pk' }])
  bulkFk: BvnBulkVerifications;

  @Column({ type: 'varchar' })
  search_parameter: string;

  @Column({ type: 'varchar' })
  retrieval_mode: string;

  @Column({
    type: 'enum',
    enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED'],
  })
  job_status: string;
}
