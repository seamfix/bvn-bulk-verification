import { Test, TestingModule } from '@nestjs/testing';
import { ProcessBvnController } from './process-bvn.controller';

describe('ProcessBvnController', () => {
  let controller: ProcessBvnController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProcessBvnController],
    }).compile();

    controller = module.get<ProcessBvnController>(ProcessBvnController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
