import { create } from "zustand";
import { AttendanceStatus } from "../types";

export interface MonthlyStaffAttendance {
  memberId: string;
  month: string;
  statuses: Record<string, AttendanceStatus>;
  payableSalary?: number;
}

interface AttendanceState {
  records: Record<string, MonthlyStaffAttendance>;
  saveRecord: (record: MonthlyStaffAttendance) => void;
  getRecord: (
    memberId: string,
    month: string,
  ) => MonthlyStaffAttendance | undefined;
}

const getRecordKey = (memberId: string, month: string) =>
  `${memberId}:${month}`;

export const useAttendanceStore = create<AttendanceState>((set, get) => ({
  records: {},
  saveRecord: (record) =>
    set((state) => ({
      records: {
        ...state.records,
        [getRecordKey(record.memberId, record.month)]: record,
      },
    })),
  getRecord: (memberId, month) => get().records[getRecordKey(memberId, month)],
}));
