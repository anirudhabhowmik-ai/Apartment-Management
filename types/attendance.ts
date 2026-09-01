export type AttendanceStatus = "present" | "absent" | "holiday" | "weekend";

export interface AttendanceEntry {
  id: string;
  memberId: string; // staff's id
  accountId: string; // which apartment/home
  date: string; // ISO date, e.g. "2026-08-29"
  status: AttendanceStatus;
  markedBy: string; // userId who marked it (secretary/owner)
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MonthlyAttendanceSummary {
  memberId: string;
  month: string; // "2026-08"
  presentDays: number;
  absentDays: number;
  halfDays: number;
  leaveDays: number;
  totalWorkingDays: number;
  payableSalary?: number;
}
