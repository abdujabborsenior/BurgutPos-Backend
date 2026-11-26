import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository } from '../../../database/base.repository';
import { CashOperation } from '../entities/cash-operation.entity';

@Injectable()
export class CashOperationsRepository extends BaseRepository<CashOperation> {
  constructor(dataSource: DataSource) {
    super(dataSource, CashOperation);
  }

  create(data: Partial<CashOperation>): Promise<CashOperation> {
    return this.repo.save(this.repo.create(data));
  }

  listByShift(shiftId: number): Promise<CashOperation[]> {
    return this.repo.find({
      where: { shiftId },
      relations: { createdBy: true },
      order: { createdAt: 'DESC' },
    });
  }
}
