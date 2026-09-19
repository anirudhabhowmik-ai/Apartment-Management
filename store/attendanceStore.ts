// store/attendanceStore.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { AttendanceStatus } from "../types";

export interface MonthlyStaffAttendance {
  memberId: string;
  month: string;
  statuses: Record<string, AttendanceStatus>;
  /**
   * Optional manual override for the calculated salary.
   * When omitted/null, consumers should compute from `statuses` + base salary.
   */
  calculatedSalary?: number | null;
}

interface AttendanceState {
  records: Record<string, MonthlyStaffAttendance>;
  /** Bumped on every mutation so subscribers can react. */
  version: number;
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
      version: 0,

      saveRecord: (record) =>
        set((state) => {
          const key = getRecordKey(record.memberId, record.month);
          const existing = state.records[key];

          const nextCalculatedSalary =
            record.calculatedSalary === undefined
              ? (existing?.calculatedSalary ?? null)
              : record.calculatedSalary;

          return {
            records: {
              ...state.records,
              [key]: {
                memberId: record.memberId,
                month: record.month,
                statuses: record.statuses ?? {},
                calculatedSalary: nextCalculatedSalary,
              },
            },
            version: state.version + 1,
          };
        }),

      getRecord: (memberId, month) =>
        get().records[getRecordKey(memberId, month)],

      clearRecord: (memberId, month) =>
        set((state) => {
          const key = getRecordKey(memberId, month);
          if (!(key in state.records)) return state;
          const next = { ...state.records };
          delete next[key];
          return { records: next, version: state.version + 1 };
        }),

      clear: () =>
        set((state) => ({ records: {}, version: state.version + 1 })),
    }),
    {
      name: "attendance-store",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      migrate: (persisted: any) => {
        if (!persisted || typeof persisted !== "object") return persisted;
        const records = persisted.records ?? {};
        const upgraded: Record<string, MonthlyStaffAttendance> = {};
        for (const [key, value] of Object.entries<any>(records)) {
          upgraded[key] = {
            memberId: value?.memberId ?? key.split(":")[0] ?? "",
            month: value?.month ?? key.split(":")[1] ?? "",
            statuses: value?.statuses ?? {},
            calculatedSalary:
              value?.calculatedSalary === undefined
                ? null
                : value.calculatedSalary,
          };
        }
        return { records: upgraded, version: 0 };
      },
    },
  ),
);
