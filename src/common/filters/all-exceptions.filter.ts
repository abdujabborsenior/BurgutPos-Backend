import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  PG_CHECK_VIOLATION,
  PG_DEADLOCK,
  PG_FOREIGN_KEY_VIOLATION,
  PG_INVALID_TEXT,
  PG_LOCK_NOT_AVAILABLE,
  PG_NOT_NULL_VIOLATION,
  PG_NUMERIC_OVERFLOW,
  PG_SERIALIZATION_FAILURE,
  PG_UNIQUE_VIOLATION,
  pgError,
} from '../utils/pg-errors';
import { CONSTRAINT_MESSAGES } from './constraint-messages';

export interface ErrorBody {
  statusCode: number;
  message: string;
  errors?: string[];
  code?: string;
  details?: unknown;
}

/**
 * Normalises every error into one JSON shape: { statusCode, message, errors? }.
 * Database errors are translated; unexpected errors never leak internals.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') return;
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const body = this.toBody(exception);
    if (body.statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.originalUrl} → ${body.statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    if (!response.headersSent) response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ErrorBody {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'string') return { statusCode, message: payload };
      const data = payload as Record<string, unknown>;
      const rawMessage = data.message;
      const errors = Array.isArray(rawMessage)
        ? rawMessage.map(String)
        : Array.isArray(data.errors)
          ? (data.errors as unknown[]).map(String)
          : undefined;
      const message = Array.isArray(rawMessage)
        ? String(rawMessage[0] ?? exception.message)
        : typeof rawMessage === 'string'
          ? rawMessage
          : exception.message;
      return {
        statusCode,
        message: this.translateHttpMessage(statusCode, message),
        ...(errors && errors.length > 1 ? { errors } : {}),
        ...(typeof data.code === 'string' ? { code: data.code } : {}),
        ...(data.details !== undefined ? { details: data.details } : {}),
      };
    }

    const pg = pgError(exception);
    if (pg) {
      const constraintMessage = pg.constraint
        ? CONSTRAINT_MESSAGES[pg.constraint]
        : undefined;
      switch (pg.code) {
        case PG_UNIQUE_VIOLATION:
          return {
            statusCode: HttpStatus.CONFLICT,
            message: constraintMessage ?? 'Такая запись уже существует',
          };
        case PG_FOREIGN_KEY_VIOLATION:
          return {
            statusCode: HttpStatus.CONFLICT,
            message:
              constraintMessage ??
              'Запись связана с другими данными и не может быть изменена',
          };
        case PG_CHECK_VIOLATION:
        case PG_NOT_NULL_VIOLATION:
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            message: constraintMessage ?? 'Некорректные данные',
          };
        case PG_INVALID_TEXT:
        case PG_NUMERIC_OVERFLOW:
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Некорректное значение в запросе',
          };
        case PG_SERIALIZATION_FAILURE:
        case PG_DEADLOCK:
        case PG_LOCK_NOT_AVAILABLE:
          return {
            statusCode: HttpStatus.CONFLICT,
            message:
              'Данные изменились одновременно с вашим действием. Повторите попытку',
          };
        default:
          break;
      }
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Внутренняя ошибка сервера',
    };
  }

  /** Framework-generated messages are English; the UI is Russian. */
  private translateHttpMessage(statusCode: number, message: string): string {
    if (message.startsWith('Cannot ') && statusCode === 404) {
      return 'Ресурс не найден';
    }
    const map: Record<string, string> = {
      Unauthorized: 'Требуется авторизация',
      Forbidden: 'Недостаточно прав',
      'Forbidden resource': 'Недостаточно прав',
      'Not Found': 'Не найдено',
      'Too Many Requests': 'Слишком много попыток. Повторите позже',
      'ThrottlerException: Too Many Requests':
        'Слишком много попыток. Повторите позже',
      'File too large': 'Файл слишком большой',
      'Unexpected field': 'Неожиданное поле файла',
      'Validation failed (numeric string is expected)':
        'Некорректный идентификатор',
    };
    return map[message] ?? message;
  }
}
