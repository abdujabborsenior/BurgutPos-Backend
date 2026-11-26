/**
 * What the printed documents show and how. Two documents are configurable:
 * the guest bill ("Чек стола") and the kitchen ticket ("Чек блюда").
 *
 * The catalog below is the single source of truth: it names every line, says
 * whether it can be switched off, and carries the factory look. Stored
 * settings are always normalised against it, so a renamed or removed line can
 * never leave a receipt half-configured.
 */

export enum ReceiptFont {
  /** Proportional — headings and labels. */
  Sans = 'SANS',
  /** Monospaced — columns of figures stay under each other. */
  Mono = 'MONO',
}

export enum ReceiptWeight {
  Normal = 'NORMAL',
  Bold = 'BOLD',
}

/** Sizes offered in the editor; the printer renders `size / 2` pixels. */
export const RECEIPT_SIZES = [20, 24, 28, 30, 32, 36, 40, 44, 50] as const;
export const RECEIPT_BASE_SIZE = 24;

export interface ReceiptLineStyle {
  enabled: boolean;
  font: ReceiptFont;
  weight: ReceiptWeight;
  size: number;
}

export interface ReceiptLineSpec {
  key: string;
  label: string;
  /** false → the line is always printed; only its look can be changed. */
  toggleable: boolean;
  /** Short note shown under the label in the editor. */
  hint?: string;
  default: ReceiptLineStyle;
}

const style = (
  size: number,
  weight: ReceiptWeight = ReceiptWeight.Bold,
  font: ReceiptFont = ReceiptFont.Sans,
  enabled = true,
): ReceiptLineStyle => ({ enabled, font, weight, size });

/** Guest bill, in the order the editor lists the lines. */
export const ORDER_CHECK_LINES: ReceiptLineSpec[] = [
  {
    key: 'restaurantName',
    label: 'Название ресторана',
    toggleable: true,
    hint: 'Берётся из настроек заведения',
    default: style(40),
  },
  { key: 'table', label: 'Номер стола', toggleable: true, default: style(24) },
  { key: 'waiter', label: 'Официант', toggleable: true, default: style(24) },
  {
    key: 'printedBy',
    label: 'Напечатал',
    toggleable: true,
    hint: 'Сотрудник, который печатает чек',
    default: style(24),
  },
  {
    key: 'orderNumber',
    label: 'Номер заказа',
    toggleable: true,
    default: style(24, ReceiptWeight.Normal, ReceiptFont.Sans, false),
  },
  {
    key: 'dateTime',
    label: 'Дата / время',
    toggleable: true,
    default: style(24),
  },
  {
    key: 'subtotal',
    label: 'Промежуточный итог',
    toggleable: true,
    hint: 'Сумма позиций, скидка, обслуживание и доставка',
    default: style(24, ReceiptWeight.Normal, ReceiptFont.Mono),
  },
  {
    key: 'total',
    label: 'Итого к оплате',
    toggleable: true,
    default: style(36),
  },
  {
    key: 'items',
    label: 'Позиции',
    toggleable: false,
    hint: 'Печатаются всегда',
    default: style(24, ReceiptWeight.Normal, ReceiptFont.Sans),
  },
];

/** Kitchen ticket, in the order the editor lists the lines. */
export const DISH_CHECK_LINES: ReceiptLineSpec[] = [
  {
    key: 'title',
    label: 'Заголовок (тип / стол)',
    toggleable: true,
    hint: '«СТОЛ 5», «С СОБОЙ», «ДОСТАВКА»',
    default: style(50),
  },
  {
    key: 'orderNumber',
    label: 'Номер заказа',
    toggleable: true,
    default: style(24, ReceiptWeight.Normal, ReceiptFont.Sans, false),
  },
  {
    key: 'completedBy',
    label: 'Выполнен (кто сделал)',
    toggleable: true,
    hint: 'Сотрудник, который отправил позиции на кухню',
    default: style(30),
  },
  {
    key: 'waiter',
    label: 'Официант (хозяин стола)',
    toggleable: true,
    default: style(30),
  },
  {
    key: 'dateTime',
    label: 'Дата / время',
    toggleable: true,
    default: style(30, ReceiptWeight.Normal),
  },
  {
    key: 'cancelled',
    label: 'ОТМЕНЕНО (при отмене)',
    toggleable: false,
    hint: 'Печатается на талоне отмены',
    default: style(40),
  },
  {
    key: 'takeaway',
    label: 'С СОБОЙ (заголовок)',
    toggleable: false,
    hint: 'Печатается для заказов с собой и доставки',
    default: style(30),
  },
  {
    key: 'items',
    label: 'Позиции',
    toggleable: false,
    hint: 'Печатаются всегда',
    default: style(32),
  },
];

export type ReceiptKind = 'orderCheck' | 'dishCheck';

export const RECEIPT_LINES: Record<ReceiptKind, ReceiptLineSpec[]> = {
  orderCheck: ORDER_CHECK_LINES,
  dishCheck: DISH_CHECK_LINES,
};

/** Style of every line of one document, by line key. */
export type ReceiptLayout = Record<string, ReceiptLineStyle>;

export function defaultReceiptLayout(kind: ReceiptKind): ReceiptLayout {
  return Object.fromEntries(
    RECEIPT_LINES[kind].map((line) => [line.key, { ...line.default }]),
  );
}

const asEnum = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T => (allowed.includes(value as T) ? (value as T) : fallback);

/**
 * Brings a stored (or submitted) layout back to the catalog: unknown lines are
 * dropped, missing ones get their factory look, sizes are snapped to the
 * offered scale, and a line that cannot be switched off stays on.
 */
export function normalizeReceiptLayout(
  kind: ReceiptKind,
  input: unknown,
): ReceiptLayout {
  const stored = (input ?? {}) as Record<string, unknown>;
  const result: ReceiptLayout = {};
  for (const line of RECEIPT_LINES[kind]) {
    const raw = (stored[line.key] ?? {}) as Partial<ReceiptLineStyle>;
    const size = Number(raw.size);
    result[line.key] = {
      enabled: !line.toggleable
        ? true
        : typeof raw.enabled === 'boolean'
          ? raw.enabled
          : line.default.enabled,
      font: asEnum(raw.font, Object.values(ReceiptFont), line.default.font),
      weight: asEnum(
        raw.weight,
        Object.values(ReceiptWeight),
        line.default.weight,
      ),
      size: (RECEIPT_SIZES as readonly number[]).includes(size)
        ? size
        : line.default.size,
    };
  }
  return result;
}
