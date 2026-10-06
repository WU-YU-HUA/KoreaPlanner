export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface Place extends Coordinates {
  provider: 'kakao' | 'manual';
  placeId?: string;
  name: string;
  address?: string;
  roadAddress?: string;
  category?: string;
}

export interface Trip {
  id: string;
  name: string;
  ownerId: string;
  coWorkerIds: string[];
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface Schedule {
  id: string;
  tripId: string;
  name: string;
  comment?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  place: Place;
  createdAt: string;
  updatedAt: string;
}

export type CreateTripInput = Pick<Trip, 'name' | 'startDate' | 'endDate' | 'coWorkerIds'>;
export type UpdateTripInput = CreateTripInput;
export type CreateScheduleInput = Omit<Schedule, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateScheduleInput = Omit<CreateScheduleInput, 'tripId'>;

export interface CoWorkerCandidate {
  id: string;
  email: string;
}

export interface ExpenseSplit {
  userId: string;
  userDisplayName: string;
  amount: string;
}

export interface Expense {
  id: string;
  tripId: string;
  description: string;
  paidBy: string;
  payerDisplayName: string;
  totalAmount: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  splits: ExpenseSplit[];
}

export interface SaveExpenseInput {
  tripId: string;
  expenseId?: string;
  description: string;
  paidBy: string;
  totalAmount: string;
  splits: Array<Pick<ExpenseSplit, 'userId' | 'amount'>>;
}

export interface TripRepository {
  getTrips(): Promise<Trip[]>;
  getTrip(id: string): Promise<Trip | null>;
  createTrip(input: CreateTripInput): Promise<Trip>;
  updateTrip(id: string, input: UpdateTripInput): Promise<Trip>;
  deleteTrip(id: string): Promise<void>;
}

export interface ScheduleRepository {
  getSchedulesByTrip(tripId: string): Promise<Schedule[]>;
  getSchedulesByDate(tripId: string, date: string): Promise<Schedule[]>;
  createSchedule(input: CreateScheduleInput): Promise<Schedule>;
  updateSchedule(id: string, input: UpdateScheduleInput): Promise<Schedule>;
  deleteSchedule(id: string): Promise<void>;
}

export interface ExpenseRepository {
  getExpensesByTrip(tripId: string): Promise<Expense[]>;
  getTripMemberDisplayNames(tripId: string): Promise<Array<{ userId: string; displayName: string }>>;
  saveExpense(input: SaveExpenseInput): Promise<string>;
  deleteExpense(id: string): Promise<void>;
}

export interface UserDirectoryService {
  lookupGoogleUser(email: string, tripId?: string): Promise<CoWorkerCandidate | null>;
}
