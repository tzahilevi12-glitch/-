export type Role = 'VOLUNTEER' | 'ADMIN';
export type ShiftType = 'MORNING' | 'EVENING' | 'NIGHT';
export type Badge = 'DRIVER_NEEDED' | 'OPEN_FOR_ALL' | 'FULL';
/** Level B / Level C volunteers can open an additional patrol car: they may join full shifts. */
export type Certification = 'NONE' | 'LEVEL_A' | 'LEVEL_B' | 'LEVEL_C';

export interface Me {
  id: string;
  fullName: string;
  role: Role;
  hasDrivingChip: boolean;
  certification: Certification;
  isActive: boolean;
}

interface ShiftBase {
  id: string;
  date: string;
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
  status: 'OPEN' | 'FILLED' | 'COMPLETED';
  requiredDrivers: number;
  maxVolunteers: number;
  published: boolean;
  seriesId: string | null;
  notes: string | null;
  badge: Badge;
  driverAlert: 'GREEN' | 'RED';
  seatsTaken: number;
  extraVolunteers: number;
  seatsLeft: number;
  driversMissing: number;
  driverOnly: boolean;
}

/** What a guest sees: shifts, staffing, counts and names — nothing personal, no actions. */
export interface GuestShift extends ShiftBase {
  registeredCount: number;
  registeredNames: string[];
}

export interface BoardShift extends ShiftBase {
  myRegistration: { id: string; status: 'APPROVED' | 'PENDING'; startTime: string; endTime: string } | null;
  iHaveShiftThatDay: boolean;
  /** Everyone on the shift (Level B/C included), in sign-up order. */
  registeredCount: number;
  registeredNames: string[];
}

export interface MyShift {
  registrationId: string;
  shiftId: string;
  status: 'APPROVED' | 'PENDING';
  date: string;
  shiftType: ShiftType;
  shiftStartTime: string;
  shiftEndTime: string;
  startTime: string;
  endTime: string;
  isPartial: boolean;
}

export interface RosterPerson {
  registrationId: string;
  userId: string;
  fullName: string;
  hasDrivingChip: boolean;
  certification: Certification;
  startTime: string;
  endTime: string;
  isPartial: boolean;
}

export interface RosterShift extends ShiftBase {
  approved: RosterPerson[];
  waitlist: RosterPerson[];
}

export interface Week {
  weekStart: string;
  weekEnd: string;
  draftCount: number;
  publishedCount: number;
  lastPublishedAt: string | null;
  shifts: RosterShift[];
}

export interface Notification {
  id: string;
  kind: 'WEEK_PUBLISHED' | 'WEEK_UPDATED';
  message: string;
  shiftCount: number;
  weekStart: string;
  createdAt: string;
}

export interface StaffAlert {
  id: string;
  kind: 'VOLUNTEER_CANCELLED' | 'WAITLIST_LEFT';
  message: string;
  urgent: boolean;
  createdAt: string;
}

export interface Volunteer {
  id: string;
  fullName: string;
  hasDrivingChip: boolean;
  certification: Certification;
  isActive: boolean;
  createdAt: string;
  upcomingShifts: number;
}
