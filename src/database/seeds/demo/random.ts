/** Deterministic pseudo-random generator: the demo data is identical on every run. */
export class Random {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  weighted<T>(items: readonly T[], weight: (item: T) => number): T {
    const total = items.reduce((sum, item) => sum + weight(item), 0);
    let roll = this.next() * total;
    for (const item of items) {
      roll -= weight(item);
      if (roll <= 0) return item;
    }
    return items[items.length - 1];
  }

  /** Random quantity inside [min, max]; fractional units keep one decimal. */
  quantity([min, max]: [number, number], fractional: boolean): number {
    if (fractional)
      return Math.round((min + this.next() * (max - min)) * 2) / 2 || min;
    return this.int(Math.ceil(min), Math.floor(max));
  }
}

/** UTC instant of a wall-clock time on a calendar day in the given time zone. */
export function zonedInstant(
  dateKey: string,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(guess))
        .map((part) => [part.type, part.value]),
    );
    const local = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
    if (local === target) break;
    guess += target - local;
  }
  return new Date(guess);
}

export const addMinutes = (date: Date, minutes: number) =>
  new Date(date.getTime() + minutes * 60_000);
