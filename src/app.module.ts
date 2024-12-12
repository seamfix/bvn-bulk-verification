/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from './datasource';
import { ProcessBvnModule } from './process-bvn/process-bvn.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule,
    ProcessBvnModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
