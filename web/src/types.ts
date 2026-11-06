export type Role = 'VOLUNTEER' | 'ADMIN';
export type ShiftType = 'MORNING' | 'EVENING' | 'NIGHT';
export type Badge = 'DRIVER_NEEDED' | 'OPEN_FOR_ALL' | 'FULL';

export interface Me {
  id: string;
  fullName: string;
  role: Role;
  hasDrivingChip: boolean;
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
  seatsLeft: number;
  driversMissing: number;
  driverOnly: boolean;
}

export interface BoardShift extends ShiftBase {
  myRegistration: { id: string; status: 'APPROVED' | 'PENDING'; startTime: string; endTime: string } | null;
  iHaveShiftThatDay: boolean;
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
  smsSent: number;
  smsError: string | null;
  createdAt: string;
}

export interface Volunteer {
  id: string;
  fullName: string;
  hasDrivingChip: boolean;
  isActive: boolean;
  createdAt: string;
  upcomingShifts: number;
}
