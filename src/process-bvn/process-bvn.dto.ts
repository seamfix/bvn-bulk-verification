/* eslint-disable prettier/prettier */
import { IsString, IsNotEmpty } from 'class-validator';

export class BodyDto {
  @IsNotEmpty({ message: 'Please provide bulkFk' })
  @IsString()
  bulkFk: string;
}
