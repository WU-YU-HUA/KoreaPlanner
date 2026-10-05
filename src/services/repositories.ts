import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CreateScheduleInput,
  CreateTripInput,
  Expense,
  ExpenseRepository,
  Place,
  Schedule,
  ScheduleRepository,
  SaveExpenseInput,
  Trip,
  TripRepository,
  UpdateScheduleInput,
  UpdateTripInput,
} from '../domain/models';
import { requireSupabase } from './supabaseClient';

export class RecordNotFoundError extends Error {
  constructor(entity: string) {
    super(`${entity} 已不存在或目前帳號沒有修改權限。請重新載入資料。`);
    this.name = 'RecordNotFoundError';
  }
}

function throwIfError(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.code === '42501' || error.code === 'PGRST301') {
    throw new Error('目前帳號沒有此操作的權限，請確認登入狀態與旅程協作權限。');
  }
  throw new Error(error.message);
}

function mapTrip(row: Record<string, unknown>): Trip {
  return {
    id: String(row.id),
    name: String(row.name),
    ownerId: String(row.owner_id),
    coWorkerIds: Array.isArray(row.co_worker_ids) ? row.co_worker_ids.map(String) : [],
    startDate: String(row.start_date),
    endDate: String(row.end_date),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function optionalString(value: unknown, field: string) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error(`資料庫欄位 ${field} 格式錯誤。`);
  return value || undefined;
}

export function parsePlace(value: unknown): Place {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('資料庫 Place 格式錯誤。');
  }
  const row = value as Record<string, unknown>;
  const latitude = row.latitude;
  const longitude = row.longitude;
  if ((row.provider !== 'kakao' && row.provider !== 'manual') || typeof row.name !== 'string'
      || !row.name.trim() || typeof latitude !== 'number' || !Number.isFinite(latitude)
      || latitude < -90 || latitude > 90 || typeof longitude !== 'number'
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('資料庫 Place 欄位或座標格式錯誤。');
  }
  return {
    provider: row.provider,
    name: row.name,
    latitude,
    longitude,
    placeId: optionalString(row.placeId, 'placeId'),
    address: optionalString(row.address, 'address'),
    roadAddress: optionalString(row.roadAddress, 'roadAddress'),
    category: optionalString(row.category, 'category'),
  };
}

function mapSchedule(row: Record<string, unknown>): Schedule {
  const startTime = optionalString(row.start_time, 'start_time');
  const endTime = optionalString(row.end_time, 'end_time');
  return {
    id: String(row.id),
    tripId: String(row.trip_id),
    name: String(row.name),
    comment: optionalString(row.comment, 'comment'),
    date: String(row.date),
    startTime: startTime?.slice(0, 5),
    endTime: endTime?.slice(0, 5),
    place: parsePlace(row.place),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function amountString(value: unknown, field: string) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(`資料庫欄位 ${field} 格式錯誤。`);
  }
  return String(value);
}

function mapExpense(row: Record<string, unknown>): Expense {
  const rawSplits = Array.isArray(row.expense_splits) ? row.expense_splits : [];
  return {
    id: String(row.id),
    tripId: String(row.trip_id),
    description: String(row.description),
    paidBy: String(row.paid_by),
    payerDisplayName: String(row.payer_display_name),
    totalAmount: amountString(row.total_amount, 'total_amount'),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    splits: rawSplits.map((value) => {
      const split = value as Record<string, unknown>;
      return { userId: String(split.user_id), userDisplayName: String(split.user_display_name),
        amount: amountString(split.amount, 'amount') };
    }),
  };
}

function placeToJson(place: Place) {
  return {
    provider: place.provider,
    name: place.name.trim(),
    latitude: place.latitude,
    longitude: place.longitude,
    ...(place.placeId ? { placeId: place.placeId } : {}),
    ...(place.address ? { address: place.address } : {}),
    ...(place.roadAddress ? { roadAddress: place.roadAddress } : {}),
    ...(place.category ? { category: place.category } : {}),
  };
}

function scheduleValues(input: CreateScheduleInput | UpdateScheduleInput) {
  return {
    name: input.name.trim(),
    comment: input.comment?.trim() || null,
    date: input.date,
    start_time: input.startTime || null,
    end_time: input.endTime || null,
    place: placeToJson(input.place),
  };
}

export class SupabaseTripRepository implements TripRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getTrips() {
    const { data, error } = await this.client.from('trips')
      .select('*').order('start_date', { ascending: false })
      .order('created_at', { ascending: true }).order('id', { ascending: true });
    throwIfError(error);
    return (data ?? []).map((row) => mapTrip(row as Record<string, unknown>));
  }

  async getTrip(id: string) {
    const { data, error } = await this.client.from('trips').select('*').eq('id', id).maybeSingle();
    throwIfError(error);
    return data ? mapTrip(data as Record<string, unknown>) : null;
  }

  async createTrip(input: CreateTripInput) {
    const { data, error } = await this.client.from('trips').insert({
      name: input.name.trim(),
      start_date: input.startDate,
      end_date: input.endDate,
      co_worker_ids: input.coWorkerIds,
    }).select('*').single();
    throwIfError(error);
    return mapTrip(data as Record<string, unknown>);
  }

  async updateTrip(id: string, input: UpdateTripInput) {
    const { data, error } = await this.client.from('trips').update({
      name: input.name.trim(),
      start_date: input.startDate,
      end_date: input.endDate,
      co_worker_ids: input.coWorkerIds,
    }).eq('id', id).select('*').maybeSingle();
    throwIfError(error);
    if (!data) throw new RecordNotFoundError('旅程');
    return mapTrip(data as Record<string, unknown>);
  }

  async deleteTrip(id: string) {
    const { data, error } = await this.client.from('trips').delete().eq('id', id).select('id').maybeSingle();
    throwIfError(error);
    if (!data) throw new RecordNotFoundError('旅程');
  }
}

export class SupabaseScheduleRepository implements ScheduleRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getSchedulesByTrip(tripId: string) {
    const { data, error } = await this.client.from('schedules').select('*').eq('trip_id', tripId)
      .order('date', { ascending: true }).order('start_time', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }).order('id', { ascending: true });
    throwIfError(error);
    return (data ?? []).map((row) => mapSchedule(row as Record<string, unknown>));
  }

  async getSchedulesByDate(tripId: string, date: string) {
    const { data, error } = await this.client.from('schedules').select('*')
      .eq('trip_id', tripId).eq('date', date)
      .order('start_time', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }).order('id', { ascending: true });
    throwIfError(error);
    return (data ?? []).map((row) => mapSchedule(row as Record<string, unknown>));
  }

  async createSchedule(input: CreateScheduleInput) {
    const { data, error } = await this.client.from('schedules')
      .insert({ trip_id: input.tripId, ...scheduleValues(input) }).select('*').single();
    throwIfError(error);
    return mapSchedule(data as Record<string, unknown>);
  }

  async updateSchedule(id: string, input: UpdateScheduleInput) {
    const { data, error } = await this.client.from('schedules').update(scheduleValues(input))
      .eq('id', id).select('*').maybeSingle();
    throwIfError(error);
    if (!data) throw new RecordNotFoundError('行程');
    return mapSchedule(data as Record<string, unknown>);
  }

  async deleteSchedule(id: string) {
    const { data, error } = await this.client.from('schedules').delete()
      .eq('id', id).select('id').maybeSingle();
    throwIfError(error);
    if (!data) throw new RecordNotFoundError('行程');
  }
}

export class SupabaseExpenseRepository implements ExpenseRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getExpensesByTrip(tripId: string) {
    const { data, error } = await this.client.from('expenses')
      .select('*, expense_splits(user_id, user_display_name, amount)')
      .eq('trip_id', tripId).order('created_at', { ascending: false });
    throwIfError(error);
    return (data ?? []).map((row) => mapExpense(row as Record<string, unknown>));
  }

  async getTripMemberDisplayNames(tripId: string): Promise<Array<{ userId: string; displayName: string }>> {
    const { data, error } = await this.client.rpc('get_trip_member_display_names', { p_trip_id: tripId });
    throwIfError(error);
    return (data ?? []).map((row: Record<string, unknown>) => ({
      userId: String(row.user_id),
      displayName: String(row.display_name),
    }));
  }

  async saveExpense(input: SaveExpenseInput) {
    const { data, error } = await this.client.rpc('save_trip_expense', {
      p_trip_id: input.tripId,
      p_expense_id: input.expenseId ?? null,
      p_description: input.description.trim(),
      p_paid_by: input.paidBy,
      p_total_amount: input.totalAmount,
      p_splits: input.splits.map((split) => ({ userId: split.userId, amount: Number(split.amount) })),
    });
    throwIfError(error);
    if (typeof data !== 'string') throw new Error('儲存支出後未取得支出 ID。');
    return data;
  }

  async deleteExpense(id: string) {
    const { error } = await this.client.rpc('delete_trip_expense', { p_expense_id: id });
    throwIfError(error);
  }
}

export const repositories = {
  get trip() {
    return new SupabaseTripRepository(requireSupabase());
  },
  get schedule() {
    return new SupabaseScheduleRepository(requireSupabase());
  },
  get expense() {
    return new SupabaseExpenseRepository(requireSupabase());
  },
};
