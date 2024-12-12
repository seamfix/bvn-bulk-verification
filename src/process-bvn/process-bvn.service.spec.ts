import { Test, TestingModule } from '@nestjs/testing';
import { ProcessBvnService } from './process-bvn.service';

describe('ProcessBvnService', () => {
  let service: ProcessBvnService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProcessBvnService],
    }).compile();

    service = module.get<ProcessBvnService>(ProcessBvnService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
