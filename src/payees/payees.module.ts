import { Module } from '@nestjs/common';
import { AccountPayeesController, PayeesController } from './payees.controller';
import { PayeesService } from './payees.service';

@Module({ controllers: [PayeesController, AccountPayeesController], providers: [PayeesService] })
export class PayeesModule {}
