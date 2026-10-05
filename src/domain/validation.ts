import type { Coordinates, Schedule, Trip } from './models';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

export function getTripDates(startDate: string, endDate: string): string[] {
  if (!isValidDate(startDate) || !isValidDate(endDate) || endDate < startDate) return [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const dates: string[] = [];
  while (cursor.toISOString().slice(0, 10) <= endDate) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function localToday(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDate(value: string, options: Intl.DateTimeFormatOptions = {}) {
  if (!isValidDate(value)) return value;
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'short', ...options,
  }).format(new Date(`${value}T00:00:00Z`));
}

export function validateTripFields(name: string, startDate: string, endDate: string): string | null {
  if (!name.trim()) return '請輸入旅程名稱。';
  if (!isValidDate(startDate) || !isValidDate(endDate)) return '請輸入有效的開始與結束日期。';
  if (endDate < startDate) return '結束日期不可早於開始日期。';
  return null;
}

export function isValidCoordinates(value: Coordinates): boolean {
  return Number.isFinite(value.latitude) && value.latitude >= -90 && value.latitude <= 90
    && Number.isFinite(value.longitude) && value.longitude >= -180 && value.longitude <= 180;
}

export function validateScheduleFields(input: {
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  place: Coordinates & { name: string };
}, trip: Pick<Trip, 'startDate' | 'endDate'>): string | null {
  if (!input.name.trim()) return '請輸入行程名稱。';
  if (!isValidDate(input.date)) return '請選擇有效日期。';
  if (input.date < trip.startDate || input.date > trip.endDate) return '行程日期必須位於旅程起訖範圍內。';
  if (input.startTime && !TIME_PATTERN.test(input.startTime)) return '開始時間格式必須為 HH:mm。';
  if (input.endTime && !TIME_PATTERN.test(input.endTime)) return '結束時間格式必須為 HH:mm。';
  if (input.startTime && input.endTime && input.endTime <= input.startTime) {
    return '結束時間必須晚於開始時間，不支援跨午夜時段。';
  }
  if (!input.place.name.trim()) return '請先確認一個有名稱的地點。';
  if (!isValidCoordinates(input.place)) return '地點座標超出有效範圍。';
  return null;
}

export function sortSchedules(schedules: Schedule[]): Schedule[] {
  return [...schedules].sort((left, right) => {
    if (left.startTime && right.startTime && left.startTime !== right.startTime) {
      return left.startTime.localeCompare(right.startTime);
    }
    if (left.startTime && !right.startTime) return -1;
    if (!left.startTime && right.startTime) return 1;
    return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
  });
}

export function findScheduleConflicts(candidate: Schedule, schedules: Schedule[]): Schedule[] {
  if (!candidate.startTime || !candidate.endTime) return [];
  return schedules.filter((existing) => existing.id !== candidate.id
    && existing.date === candidate.date
    && Boolean(existing.startTime && existing.endTime)
    && candidate.startTime! < existing.endTime!
    && existing.startTime! < candidate.endTime!);
}