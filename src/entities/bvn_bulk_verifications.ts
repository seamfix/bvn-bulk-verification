/* eslint-disable prettier/prettier */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { BvnRecords } from './bvn_records';


@Entity('bvn_bulk_verifications')
export class BvnBulkVerifications {
  @PrimaryGeneratedColumn()
  pk: number;

  @Column({ type: 'varchar' })
  bulk_id: string;

  @Column({ type: 'int' })
  number_of_records: number;

  @Column({ type: 'int' })
  user_fk: number;

  @Column({ type: 'varchar' })
  user_id: string;

  @CreateDateColumn({ type: 'timestamp' })
  created_date: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  modified_date: Date;

  @Column({
    type: 'enum',
    enum: ['INITIATED', 'PENDING', 'COMPLETED', 'IN_PROGRESS'],
    default: 'INITIATED',
  })
  status: string;

  @Column({ type: 'varchar' })
  file_name: string;

  @Column({ type: 'timestamp', nullable: true })
  expiry_date: Date;

  @Column({ type: 'timestamp', nullable: true })
  completion_date: Date;

  @Column({ type: 'boolean', default: false })
  is_report_uploaded: boolean;

  @Column({ type: 'varchar' })
  transaction_ref: string;

  @Column({ type: 'varchar' })
  api_key: string;

  @Column({ type: 'varchar' })
  service_mode: string;

  @Column('bigint', { name: 'wrapper_fk' })
  wrapperFk: string;

  @OneToMany(() => BvnRecords, (record) => record.bulkFk)
  records: BvnRecords[];
}
