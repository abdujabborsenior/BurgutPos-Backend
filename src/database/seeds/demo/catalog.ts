import { DishUnit, IngredientUnit } from '../../../common/constants/enums';

/** Demo catalogue of an Uzbek restaurant (names as they appear on the menu). */

export const PRINTERS = [
  'ОШХОНА',
  'ШАШЛИК',
  'САЛАТ',
  'ҚАНОТ',
  'БАР',
  'KASSA',
] as const;
export type PrinterName = (typeof PRINTERS)[number];

export const HALLS: {
  name: string;
  tables: { name: string; seats: number }[];
}[] = [
  {
    name: '1 - БЛОК - ТАШҚАРИ НАВЕС',
    tables: [
      ...[
        'СЎРИ 1',
        'СЎРИ 2',
        'СЎРИ 3',
        'СЎРИ 4',
        'СЎРИ 5',
        'СЎРИ 6 (ЗАХИРА)',
      ].map((name) => ({ name, seats: 6 })),
      ...['СТОЛ 1', 'СТОЛ 2', 'СТОЛ 3', 'СТОЛ 4 (ЗАХИРА)'].map((name) => ({
        name,
        seats: 4,
      })),
    ],
  },
  {
    name: '2 - БЛОК - АСОСИЙ ЗАЛ',
    tables: [
      ...[
        'ДИВАН 1',
        'ДИВАН 2',
        'ДИВАН 3',
        'ДИВАН 4',
        'ДИВАН 5',
        'ДИВАН 6',
        'ДИВАН 7',
        'ДИВАН 8',
        'ДИВАН 9',
        'ДИВАН 10 (ЗАХИРА)',
      ].map((name) => ({ name, seats: 6 })),
      ...['VIP 1', 'VIP 2', 'VIP 3', 'VIP 4'].map((name) => ({
        name,
        seats: 10,
      })),
    ],
  },
  {
    name: '3 - БЛОК - ИЧКАРИ ХОВЛИ',
    tables: ['СЎРИ 7', 'СЎРИ 8', 'СЎРИ 9', 'СЎРИ 10'].map((name) => ({
      name,
      seats: 8,
    })),
  },
];

export interface IngredientSeed {
  name: string;
  unit: IngredientUnit;
  cost: number;
  min: number;
  weekly: number;
}

export const INGREDIENTS: IngredientSeed[] = [
  {
    name: 'Мол гўшти',
    unit: IngredientUnit.Kilogram,
    cost: 95000,
    min: 20,
    weekly: 140,
  },
  {
    name: 'Қўй гўшти',
    unit: IngredientUnit.Kilogram,
    cost: 115000,
    min: 15,
    weekly: 110,
  },
  {
    name: 'Товуқ гўшти',
    unit: IngredientUnit.Kilogram,
    cost: 38000,
    min: 15,
    weekly: 90,
  },
  {
    name: 'Гуруч (лазер)',
    unit: IngredientUnit.Kilogram,
    cost: 24000,
    min: 30,
    weekly: 160,
  },
  {
    name: 'Сабзи',
    unit: IngredientUnit.Kilogram,
    cost: 6000,
    min: 30,
    weekly: 150,
  },
  {
    name: 'Пиёз',
    unit: IngredientUnit.Kilogram,
    cost: 5000,
    min: 20,
    weekly: 90,
  },
  {
    name: 'Картошка',
    unit: IngredientUnit.Kilogram,
    cost: 6500,
    min: 20,
    weekly: 70,
  },
  {
    name: 'Ун',
    unit: IngredientUnit.Kilogram,
    cost: 7500,
    min: 40,
    weekly: 220,
  },
  {
    name: 'Пахта ёғи',
    unit: IngredientUnit.Liter,
    cost: 23000,
    min: 10,
    weekly: 40,
  },
  {
    name: 'Помидор',
    unit: IngredientUnit.Kilogram,
    cost: 14000,
    min: 10,
    weekly: 70,
  },
  {
    name: 'Бодринг',
    unit: IngredientUnit.Kilogram,
    cost: 12000,
    min: 8,
    weekly: 40,
  },
  {
    name: 'Тухум',
    unit: IngredientUnit.Piece,
    cost: 1500,
    min: 60,
    weekly: 360,
  },
  { name: 'Сут', unit: IngredientUnit.Liter, cost: 12000, min: 5, weekly: 25 },
  {
    name: 'Қаймоқ',
    unit: IngredientUnit.Kilogram,
    cost: 45000,
    min: 3,
    weekly: 12,
  },
  {
    name: 'Шакар',
    unit: IngredientUnit.Kilogram,
    cost: 13000,
    min: 5,
    weekly: 20,
  },
  {
    name: 'Кўк чой барги',
    unit: IngredientUnit.Gram,
    cost: 110,
    min: 500,
    weekly: 3500,
  },
  {
    name: 'Қора чой барги',
    unit: IngredientUnit.Gram,
    cost: 95,
    min: 500,
    weekly: 2500,
  },
  {
    name: 'Лимон',
    unit: IngredientUnit.Kilogram,
    cost: 28000,
    min: 2,
    weekly: 8,
  },
  {
    name: 'Қаҳва доналари',
    unit: IngredientUnit.Gram,
    cost: 320,
    min: 300,
    weekly: 2000,
  },
  {
    name: 'Сарёғ',
    unit: IngredientUnit.Kilogram,
    cost: 90000,
    min: 2,
    weekly: 10,
  },
];

export interface DishSeed {
  name: string;
  price: number;
  unit?: DishUnit;
  /** Relative sales frequency. */
  pop: number;
  /** Typical quantity range per order line. */
  qty?: [number, number];
  /** Resale goods: stock is tracked and received through receipts. */
  tracked?: boolean;
  recipe?: [ingredient: string, quantity: number][];
}

export interface CategorySeed {
  name: string;
  printer: PrinterName;
  dishes: DishSeed[];
  archived?: boolean;
}

export const MENU: CategorySeed[] = [
  {
    name: 'ШАШЛИК',
    printer: 'ШАШЛИК',
    dishes: [
      {
        name: 'Ўрама қийма',
        price: 18000,
        pop: 10,
        qty: [2, 6],
        recipe: [
          ['Мол гўшти', 0.12],
          ['Пиёз', 0.02],
        ],
      },
      {
        name: 'Ғиждувон қийма',
        price: 17000,
        pop: 7,
        qty: [2, 5],
        recipe: [
          ['Мол гўшти', 0.11],
          ['Пиёз', 0.02],
        ],
      },
      {
        name: 'Катта қийма',
        price: 22000,
        pop: 5,
        qty: [1, 4],
        recipe: [
          ['Мол гўшти', 0.15],
          ['Пиёз', 0.02],
        ],
      },
      {
        name: 'Товуқ филе',
        price: 18000,
        pop: 6,
        qty: [2, 4],
        recipe: [['Товуқ гўшти', 0.15]],
      },
      {
        name: 'Жиз (қўй гўшти)',
        price: 25000,
        pop: 5,
        qty: [1, 4],
        recipe: [['Қўй гўшти', 0.15]],
      },
      {
        name: 'Қовурға',
        price: 24000,
        pop: 4,
        qty: [1, 3],
        recipe: [['Қўй гўшти', 0.16]],
      },
      { name: 'Жигар', price: 15000, pop: 3, qty: [1, 3] },
      {
        name: 'Заказ қийма бўйин гўштига',
        price: 120000,
        unit: DishUnit.Kilogram,
        pop: 1,
        qty: [0.5, 1.5],
        recipe: [['Мол гўшти', 1]],
      },
    ],
  },
  {
    name: '1-ОВҚАТЛАР',
    printer: 'ОШХОНА',
    dishes: [
      {
        name: 'Шўрва',
        price: 30000,
        pop: 6,
        qty: [1, 3],
        recipe: [
          ['Қўй гўшти', 0.15],
          ['Картошка', 0.15],
          ['Сабзи', 0.05],
          ['Пиёз', 0.03],
        ],
      },
      {
        name: 'Мастава',
        price: 28000,
        pop: 5,
        qty: [1, 3],
        recipe: [
          ['Гуруч (лазер)', 0.06],
          ['Мол гўшти', 0.08],
          ['Картошка', 0.1],
          ['Сабзи', 0.05],
        ],
      },
      {
        name: 'Лағмон',
        price: 32000,
        pop: 6,
        qty: [1, 3],
        recipe: [
          ['Ун', 0.15],
          ['Мол гўшти', 0.1],
          ['Помидор', 0.05],
          ['Пиёз', 0.03],
        ],
      },
      {
        name: 'Чучвара шўрва',
        price: 28000,
        pop: 4,
        qty: [1, 2],
        recipe: [
          ['Ун', 0.08],
          ['Мол гўшти', 0.06],
        ],
      },
      { name: 'Мошхўрда', price: 26000, pop: 3, qty: [1, 2] },
      { name: 'Бульон', price: 10000, pop: 4, qty: [1, 3] },
    ],
  },
  {
    name: '2-ОВҚАТЛАР',
    printer: 'ОШХОНА',
    dishes: [
      {
        name: 'Қозон кабоб',
        price: 65000,
        pop: 4,
        qty: [1, 2],
        recipe: [
          ['Қўй гўшти', 0.3],
          ['Картошка', 0.25],
          ['Пахта ёғи', 0.05],
        ],
      },
      {
        name: 'Испанский',
        price: 65000,
        pop: 3,
        qty: [1, 2],
        recipe: [
          ['Мол гўшти', 0.25],
          ['Помидор', 0.1],
        ],
      },
      {
        name: 'Қовурдоқ',
        price: 55000,
        pop: 4,
        qty: [1, 2],
        recipe: [
          ['Мол гўшти', 0.25],
          ['Картошка', 0.2],
          ['Пиёз', 0.05],
        ],
      },
      {
        name: 'Димлама',
        price: 48000,
        pop: 3,
        qty: [1, 2],
        recipe: [
          ['Мол гўшти', 0.2],
          ['Картошка', 0.2],
          ['Сабзи', 0.1],
        ],
      },
      {
        name: 'Жаркоп',
        price: 42000,
        pop: 3,
        qty: [1, 2],
        recipe: [
          ['Мол гўшти', 0.18],
          ['Картошка', 0.2],
        ],
      },
      {
        name: 'Котлета пюре билан',
        price: 38000,
        pop: 3,
        qty: [1, 2],
        recipe: [
          ['Мол гўшти', 0.15],
          ['Картошка', 0.2],
          ['Сут', 0.05],
        ],
      },
      {
        name: 'Бефстроганов',
        price: 45000,
        pop: 2,
        qty: [1, 2],
        recipe: [
          ['Мол гўшти', 0.2],
          ['Қаймоқ', 0.05],
        ],
      },
    ],
  },
  {
    name: 'ОШ',
    printer: 'ОШХОНА',
    dishes: [
      {
        name: 'Тўй оши',
        price: 45000,
        unit: DishUnit.Portion,
        pop: 9,
        qty: [1, 4],
        recipe: [
          ['Гуруч (лазер)', 0.15],
          ['Сабзи', 0.12],
          ['Қўй гўшти', 0.1],
          ['Пахта ёғи', 0.04],
          ['Пиёз', 0.03],
        ],
      },
      {
        name: 'Чойхона оши',
        price: 40000,
        unit: DishUnit.Portion,
        pop: 5,
        qty: [1, 3],
        recipe: [
          ['Гуруч (лазер)', 0.15],
          ['Сабзи', 0.12],
          ['Мол гўшти', 0.08],
          ['Пахта ёғи', 0.04],
        ],
      },
      {
        name: 'Ош (кг)',
        price: 140000,
        unit: DishUnit.Kilogram,
        pop: 1,
        qty: [1, 2.5],
        recipe: [
          ['Гуруч (лазер)', 0.45],
          ['Сабзи', 0.35],
          ['Қўй гўшти', 0.25],
          ['Пахта ёғи', 0.1],
        ],
      },
    ],
  },
  {
    name: 'ХАМИР ОВҚАТЛАР',
    printer: 'ОШХОНА',
    dishes: [
      {
        name: 'Манти',
        price: 8000,
        pop: 8,
        qty: [3, 10],
        recipe: [
          ['Ун', 0.03],
          ['Қўй гўшти', 0.03],
          ['Пиёз', 0.02],
        ],
      },
      {
        name: 'Чучвара',
        price: 30000,
        pop: 4,
        qty: [1, 2],
        recipe: [
          ['Ун', 0.1],
          ['Мол гўшти', 0.08],
        ],
      },
      {
        name: 'Хонім',
        price: 28000,
        pop: 3,
        qty: [1, 2],
        recipe: [
          ['Ун', 0.12],
          ['Мол гўшти', 0.07],
        ],
      },
      {
        name: 'Самса тандир',
        price: 9000,
        pop: 7,
        qty: [2, 8],
        recipe: [
          ['Ун', 0.06],
          ['Мол гўшти', 0.04],
          ['Пиёз', 0.02],
        ],
      },
      {
        name: 'Анжир сомса',
        price: 9000,
        pop: 6,
        qty: [2, 10],
        recipe: [
          ['Ун', 0.05],
          ['Мол гўшти', 0.04],
        ],
      },
      {
        name: 'Гўштли сомса',
        price: 10000,
        pop: 5,
        qty: [2, 6],
        recipe: [
          ['Ун', 0.06],
          ['Қўй гўшти', 0.04],
        ],
      },
    ],
  },
  {
    name: 'САЛАТЛАР',
    printer: 'САЛАТ',
    dishes: [
      {
        name: 'Аччиқ-чучук',
        price: 15000,
        pop: 8,
        qty: [1, 3],
        recipe: [
          ['Помидор', 0.15],
          ['Пиёз', 0.03],
        ],
      },
      {
        name: 'Свежий салат',
        price: 18000,
        pop: 5,
        qty: [1, 2],
        recipe: [
          ['Помидор', 0.1],
          ['Бодринг', 0.1],
        ],
      },
      {
        name: 'Цезарь салати 0,5',
        price: 12000,
        pop: 4,
        qty: [1, 2],
        recipe: [
          ['Товуқ гўшти', 0.06],
          ['Тухум', 1],
        ],
      },
      {
        name: 'Оливье',
        price: 22000,
        pop: 3,
        qty: [1, 2],
        recipe: [
          ['Картошка', 0.1],
          ['Тухум', 2],
        ],
      },
      {
        name: 'Грек салати',
        price: 28000,
        pop: 2,
        qty: [1, 2],
        recipe: [
          ['Помидор', 0.1],
          ['Бодринг', 0.1],
        ],
      },
      { name: 'Баклажон салати', price: 20000, pop: 2, qty: [1, 2] },
      { name: 'Қатиқ', price: 7000, pop: 6, qty: [1, 4] },
    ],
  },
  {
    name: 'ҚАНОТЧА (ТАБА)',
    printer: 'ҚАНОТ',
    dishes: [
      {
        name: 'Қанотча 1.000 сўмлик',
        price: 1000,
        pop: 9,
        qty: [6, 30],
        recipe: [['Товуқ гўшти', 0.04]],
      },
      {
        name: 'Сарёғли оёқча 1000 сўмлик',
        price: 1000,
        pop: 6,
        qty: [5, 20],
        recipe: [['Товуқ гўшти', 0.04]],
      },
      {
        name: 'Сарёғли товуқ',
        price: 50000,
        pop: 3,
        qty: [1, 2],
        recipe: [
          ['Товуқ гўшти', 0.9],
          ['Сарёғ', 0.05],
        ],
      },
      {
        name: 'Қанот фри билан',
        price: 35000,
        pop: 3,
        qty: [1, 2],
        recipe: [
          ['Товуқ гўшти', 0.35],
          ['Картошка', 0.2],
        ],
      },
    ],
  },
  {
    name: 'НОН',
    printer: 'KASSA',
    dishes: [
      {
        name: 'Нон',
        price: 5000,
        pop: 10,
        qty: [1, 4],
        recipe: [['Ун', 0.25]],
      },
      {
        name: 'Кулча',
        price: 4000,
        pop: 6,
        qty: [1, 4],
        recipe: [['Ун', 0.15]],
      },
      {
        name: 'Патир',
        price: 8000,
        pop: 4,
        qty: [1, 3],
        recipe: [
          ['Ун', 0.3],
          ['Сарёғ', 0.02],
        ],
      },
    ],
  },
  {
    name: 'ИЧИМЛИКЛАР',
    printer: 'БАР',
    dishes: [
      {
        name: 'Кўк чой',
        price: 5000,
        pop: 10,
        qty: [1, 3],
        recipe: [['Кўк чой барги', 6]],
      },
      {
        name: 'Қора чой',
        price: 5000,
        pop: 6,
        qty: [1, 3],
        recipe: [['Қора чой барги', 6]],
      },
      {
        name: 'Лимонли чой',
        price: 12000,
        pop: 4,
        qty: [1, 2],
        recipe: [
          ['Қора чой барги', 6],
          ['Лимон', 0.03],
          ['Шакар', 0.02],
        ],
      },
      {
        name: 'Американо',
        price: 18000,
        pop: 3,
        qty: [1, 2],
        recipe: [['Қаҳва доналари', 18]],
      },
      {
        name: 'Капучино',
        price: 22000,
        pop: 3,
        qty: [1, 2],
        recipe: [
          ['Қаҳва доналари', 18],
          ['Сут', 0.15],
        ],
      },
    ],
  },
  {
    name: 'COLA-FANTA-PEPSI',
    printer: 'KASSA',
    dishes: [
      {
        name: 'Coca-Cola 1.5л',
        price: 16000,
        pop: 6,
        qty: [1, 2],
        tracked: true,
      },
      {
        name: 'Coca-Cola 0.5л',
        price: 8000,
        pop: 5,
        qty: [1, 3],
        tracked: true,
      },
      { name: 'Fanta 1.5л', price: 16000, pop: 4, qty: [1, 2], tracked: true },
      {
        name: 'Pepsi 1,75 л',
        price: 18000,
        pop: 4,
        qty: [1, 2],
        tracked: true,
      },
      { name: 'Sprite 1.5л', price: 16000, pop: 3, qty: [1, 2], tracked: true },
      {
        name: 'Coca-Cola SHISHALI',
        price: 5000,
        pop: 4,
        qty: [1, 4],
        tracked: true,
      },
      {
        name: 'Fanta SHISHALI',
        price: 5000,
        pop: 3,
        qty: [1, 4],
        tracked: true,
      },
    ],
  },
  {
    name: 'СУВЛАР',
    printer: 'KASSA',
    dishes: [
      {
        name: 'Hydrolife 0.5л',
        price: 5000,
        pop: 6,
        qty: [1, 4],
        tracked: true,
      },
      { name: 'Nestle 1.5л', price: 6000, pop: 3, qty: [1, 2], tracked: true },
      {
        name: 'Chortoq SHISHALI 0.5L',
        price: 12000,
        pop: 3,
        qty: [1, 3],
        tracked: true,
      },
      {
        name: 'Borjomi SHISHALI 0.5L',
        price: 20000,
        pop: 2,
        qty: [1, 2],
        tracked: true,
      },
    ],
  },
  {
    name: 'ШАРБАТЛАР',
    printer: 'KASSA',
    dishes: [
      { name: 'Flavis 1.2L', price: 13000, pop: 3, qty: [1, 2], tracked: true },
      { name: 'Garden 1.2L', price: 18000, pop: 2, qty: [1, 2], tracked: true },
      { name: 'Bliss 1л', price: 15000, pop: 2, qty: [1, 2], tracked: true },
    ],
  },
  {
    name: 'ДЕСЕРТЛАР',
    printer: 'САЛАТ',
    dishes: [
      {
        name: 'Медовик',
        price: 22000,
        pop: 2,
        qty: [1, 3],
        recipe: [
          ['Ун', 0.05],
          ['Шакар', 0.04],
          ['Тухум', 1],
        ],
      },
      {
        name: 'Наполеон',
        price: 22000,
        pop: 2,
        qty: [1, 3],
        recipe: [
          ['Ун', 0.05],
          ['Сарёғ', 0.03],
          ['Сут', 0.05],
        ],
      },
      { name: 'Чизкейк', price: 28000, pop: 1, qty: [1, 2] },
      { name: 'Музқаймоқ', price: 15000, pop: 2, qty: [1, 3] },
    ],
  },
  {
    name: 'МЕВА-КОНФЕТ-ЧАҚ-ЧУҚ',
    printer: 'KASSA',
    dishes: [
      { name: 'Мева ассорти', price: 45000, pop: 2, qty: [1, 2] },
      { name: 'Конфет ассорти', price: 15000, pop: 2, qty: [1, 2] },
      { name: 'Писта', price: 25000, pop: 1, qty: [1, 2] },
    ],
  },
  {
    name: 'ХОНА ва ХИЗМАТ',
    printer: 'KASSA',
    dishes: [
      {
        name: 'Влажные салфетки',
        price: 2500,
        pop: 3,
        qty: [1, 3],
        tracked: true,
      },
      { name: 'VIP хона хизмати', price: 50000, pop: 0 },
    ],
  },
  {
    name: 'СЕЗОН ТАОМЛАРИ',
    printer: 'ОШХОНА',
    archived: true,
    dishes: [
      { name: 'Нишолда', price: 15000, pop: 0 },
      { name: 'Сумалак', price: 18000, pop: 0 },
    ],
  },
];

export const STAFF: {
  fullName: string;
  login: string;
  role: 'Администратор' | 'Кассир' | 'Официант';
  phone: string;
}[] = [
  {
    fullName: 'Файзулло',
    login: 'fayzullo',
    role: 'Администратор',
    phone: '+998 90 111 22 33',
  },
  {
    fullName: 'Бобур Кассир',
    login: 'bobur',
    role: 'Кассир',
    phone: '+998 93 444 55 66',
  },
  {
    fullName: 'Сардор кассир',
    login: 'sardor',
    role: 'Кассир',
    phone: '+998 97 777 88 99',
  },
  {
    fullName: 'Мохидил',
    login: 'mohidil',
    role: 'Официант',
    phone: '+998 91 120 30 40',
  },
  {
    fullName: 'Карима',
    login: 'karima',
    role: 'Официант',
    phone: '+998 94 210 31 41',
  },
  {
    fullName: 'Ойдиной',
    login: 'oydinoy',
    role: 'Официант',
    phone: '+998 99 310 32 42',
  },
  {
    fullName: 'Озодбек',
    login: 'ozodbek',
    role: 'Официант',
    phone: '+998 90 410 33 43',
  },
  {
    fullName: 'Мансур Рахимов',
    login: 'mansur',
    role: 'Официант',
    phone: '+998 95 510 34 44',
  },
  {
    fullName: 'Шухрат Мирзаев',
    login: 'shuhrat',
    role: 'Официант',
    phone: '+998 88 610 35 45',
  },
];

export const STAFF_PASSWORD = '123456';

export const CANCEL_REASONS = [
  'Гость отказался',
  'Ошибка официанта',
  'Долгое ожидание',
  'Нет в наличии',
  'Жалоба на качество',
];

export const ORDER_CANCEL_REASONS = [
  'Гость ушёл',
  'Ошибочный заказ',
  'Тестовый заказ',
];

export const CUSTOMERS: { name: string; phone: string; address: string }[] = [
  {
    name: 'Дилноза',
    phone: '+998 90 123 45 67',
    address: 'Чиланзар, 9-квартал, дом 12, кв. 34',
  },
  {
    name: 'Азиз',
    phone: '+998 93 765 43 21',
    address: 'Юнусабад, 4-квартал, дом 7',
  },
  {
    name: 'Шахзод',
    phone: '+998 97 555 12 12',
    address: 'Мирзо-Улугбек, ул. Буюк Ипак Йули, 88',
  },
  {
    name: 'Нилуфар',
    phone: '+998 99 222 33 44',
    address: 'Сергели, 7-квартал, дом 21',
  },
  {
    name: 'Жасур',
    phone: '+998 91 909 80 70',
    address: 'Яккасарай, ул. Шота Руставели, 41',
  },
  {
    name: 'Мадина',
    phone: '+998 94 100 20 30',
    address: 'Яшнабад, ул. Махтумкули, 15',
  },
];
