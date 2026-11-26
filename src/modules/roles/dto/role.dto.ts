import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ALL_PERMISSIONS } from '../../../common/constants/permissions';
import { Trim } from '../../../common/decorators/transform.decorators';

export class CreateRoleDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Укажите название роли' })
  @MaxLength(64, { message: 'Название роли — не более 64 символов' })
  name: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(255, { message: 'Описание — не более 255 символов' })
  description?: string;

  @IsArray()
  @ArrayUnique()
  @IsIn(ALL_PERMISSIONS, { each: true, message: 'Неизвестное право доступа' })
  permissions: string[];
}

export class UpdateRoleDto {
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Укажите название роли' })
  @MaxLength(64, { message: 'Название роли — не более 64 символов' })
  name?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(255, { message: 'Описание — не более 255 символов' })
  description?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(ALL_PERMISSIONS, { each: true, message: 'Неизвестное право доступа' })
  permissions?: string[];
}
