// store/attendanceStore.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { AttendanceStatus } from "../types";

export interface MonthlyStaffAttendance {
  memberId: string;
  month: string;
  statuses: Record<string, AttendanceStatus>;
}

interface AttendanceState {
  records: Record<string, MonthlyStaffAttendance>;
  saveRecord: (record: MonthlyStaffAttendance) => void;
  getRecord: (
    memberId: string,
    month: string,
  ) => MonthlyStaffAttendance | undefined;
  clearRecord: (memberId: string, month: string) => void;
  clear: () => void;
}

const getRecordKey = (memberId: string, month: string) =>
  `${memberId}:${month}`;

export const useAttendanceStore = create<AttendanceState>()(
  persist(
    (set, get) => ({
      records: {},

      saveRecord: (record) =>
        set((state) => ({
          records: {
            ...state.records,
            [getRecordKey(record.memberId, record.month)]: record,
          },
        })),

      getRecord: (memberId, month) =>
        get().records[getRecordKey(memberId, month)],

      clearRecord: (memberId, month) =>
        set((state) => {
          const next = { ...state.records };
          delete next[getRecordKey(memberId, month)];
          return { records: next };
        }),

      clear: () => set({ records: {} }),
    }),
    {
      name: "attendance-store",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
