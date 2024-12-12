import { Module } from '@nestjs/common';
import { ProcessBvnService } from './process-bvn.service';
import { ProcessBvnController } from './process-bvn.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BvnBulkVerifications } from 'src/entities/bvn_bulk_verifications';
import { BvnLookup } from 'src/entities/bvn_lookup';
import { BvnRecords } from 'src/entities/bvn_records';

@Module({
  imports: [
    TypeOrmModule.forFeature([BvnBulkVerifications, BvnLookup, BvnRecords]),
  ],
  providers: [ProcessBvnService],
  controllers: [ProcessBvnController],
})
export class ProcessBvnModule {}
