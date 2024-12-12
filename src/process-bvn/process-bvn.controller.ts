/* eslint-disable prettier/prettier */
import { Body, Controller, Post, Response } from '@nestjs/common';
import { Response as ExpressResponse } from 'express';
import { BodyDto } from './process-bvn.dto';
import { ProcessBvnService } from './process-bvn.service';

@Controller('process')
export class ProcessBvnController {
  constructor(private readonly processBvnService: ProcessBvnService) {}
  @Post()
  async processNin(@Body() body: BodyDto, @Response() res: ExpressResponse) {
    const response =
      await this.processBvnService.initiateBulkRecordProcessing(body);
    if (response?.code === 0) {
      res.status(200).json({ ...response });
    } else {
      res.status(500).json({ ...response });
    }
  }
}
