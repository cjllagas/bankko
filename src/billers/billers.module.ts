import { Module } from '@nestjs/common';
import { BillersController } from './billers.controller';
import { BillersService } from './billers.service';

@Module({ controllers: [BillersController], providers: [BillersService] })
export class BillersModule {}
