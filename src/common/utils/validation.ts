import { BadRequestException, type ValidationError } from '@nestjs/common';

const MESSAGES: Record<string, (field: string, constraint: string) => string> =
  {
    isNotEmpty: (f) => `Поле «${f}» обязательно`,
    isDefined: (f) => `Поле «${f}» обязательно`,
    isString: (f) => `Поле «${f}» должно быть строкой`,
    isInt: (f) => `Поле «${f}» должно быть целым числом`,
    isNumber: (f) => `Поле «${f}» должно быть числом`,
    isPositive: (f) => `Поле «${f}» должно быть больше нуля`,
    isBoolean: (f) => `Поле «${f}» должно быть логическим значением`,
    isArray: (f) => `Поле «${f}» должно быть списком`,
    isEnum: (f) => `Недопустимое значение поля «${f}»`,
    isIn: (f) => `Недопустимое значение поля «${f}»`,
    isDateString: (f) => `Поле «${f}» должно быть датой`,
    isISO8601: (f) => `Поле «${f}» должно быть датой`,
    matches: (f) => `Неверный формат поля «${f}»`,
    whitelistValidation: (f) => `Поле «${f}» не поддерживается`,
    arrayMinSize: (f) => `Список «${f}» не может быть пустым`,
    arrayMaxSize: (f) => `Список «${f}» слишком длинный`,
    arrayUnique: (f) => `Список «${f}» содержит повторы`,
    min: (f, c) =>
      `Поле «${f}»: ${c.replace(/^.*must not be less than/, 'минимум')}`,
    max: (f, c) =>
      `Поле «${f}»: ${c.replace(/^.*must not be greater than/, 'максимум')}`,
    minLength: (f, c) =>
      `Поле «${f}»: ${c.replace(/^.*must be longer than or equal to (\d+) characters/, 'минимум $1 символов')}`,
    maxLength: (f, c) =>
      `Поле «${f}»: ${c.replace(/^.*must be shorter than or equal to (\d+) characters/, 'максимум $1 символов')}`,
  };

function flatten(errors: ValidationError[], parent = ''): string[] {
  const messages: string[] = [];
  for (const error of errors) {
    const path = parent ? `${parent}.${error.property}` : error.property;
    for (const [key, raw] of Object.entries(error.constraints ?? {})) {
      // Custom messages written in DTOs (Cyrillic) are used as is.
      if (/[А-Яа-яЁё]/.test(raw)) messages.push(raw);
      else messages.push(MESSAGES[key]?.(path, raw) ?? raw);
    }
    if (error.children?.length) messages.push(...flatten(error.children, path));
  }
  return messages;
}

export function validationExceptionFactory(
  errors: ValidationError[],
): BadRequestException {
  const messages = flatten(errors);
  return new BadRequestException({
    message: messages[0] ?? 'Некорректные данные',
    errors: messages,
  });
}
