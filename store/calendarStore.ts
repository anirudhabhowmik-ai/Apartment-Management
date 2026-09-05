import { create } from "zustand";

export type CalendarEventType = "notice" | "event";
export type CalendarEventStatus = "approved" | "pending" | "rejected";

export const RESOURCE_OPTIONS = [
  "Clubhouse",
  "Community Hall",
  "Garden / Lawn",
  "Parking Area",
  "Gym",
  "Terrace",
  "Other",
] as const;

export type ResourceOption = (typeof RESOURCE_OPTIONS)[number];

export interface CalendarEvent {
  id: string;
  accountId: string;
  title: string;
  description?: string;
  type: CalendarEventType;
  resource?: ResourceOption;
  date: string; // "YYYY-MM-DD"
  startTime?: string;
  endTime?: string;
  status: CalendarEventStatus;
  createdById: string;
  createdByName: string;
  createdByPhone?: string;
  createdByRole: "admin" | "owner";
  rejectionReason?: string;
  createdAt: string;
  respondedAt?: string;
}

type NewCalendarEvent = Omit<
  CalendarEvent,
  "id" | "createdAt" | "status" | "respondedAt" | "rejectionReason"
>;

type CalendarEventUpdates = Partial<
  Omit<
    CalendarEvent,
    | "id"
    | "accountId"
    | "createdById"
    | "createdByName"
    | "createdByPhone"
    | "createdByRole"
    | "createdAt"
    | "status"
    | "rejectionReason"
    | "respondedAt"
  >
>;

interface CalendarState {
  events: CalendarEvent[];
  addEvent: (event: NewCalendarEvent) => CalendarEvent;
  editEvent: (id: string, updates: CalendarEventUpdates) => void;
  approveEvent: (id: string) => void;
  rejectEvent: (id: string, reason?: string) => void;
  deleteEvent: (id: string) => void;
  getEventsForAccount: (accountId: string) => CalendarEvent[];
}

// Seed data for demo
const today = new Date();
const seedDate = (offsetDays: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
};

const DUMMY_EVENTS: CalendarEvent[] = [
  {
    id: "seed_notice_1",
    accountId: "dummy_account_1",
    title: "Water tank cleaning",
    description: "Water supply will be interrupted from 10 AM to 1 PM.",
    type: "notice",
    date: seedDate(2),
    status: "approved",
    createdById: "admin_seed",
    createdByName: "Secretary",
    createdByRole: "admin",
    createdAt: new Date().toISOString(),
  },
  {
    id: "seed_event_1",
    accountId: "dummy_account_1",
    title: "Diwali Get-together",
    description: "Community celebration with snacks and games.",
    type: "event",
    resource: "Clubhouse",
    date: seedDate(5),
    startTime: "6:00 PM",
    endTime: "9:00 PM",
    status: "approved",
    createdById: "admin_seed",
    createdByName: "Secretary",
    createdByRole: "admin",
    createdAt: new Date().toISOString(),
  },
  {
    id: "seed_event_2",
    accountId: "dummy_account_1",
    title: "Birthday Party",
    description: "Requesting the community hall for a small birthday party.",
    type: "event",
    resource: "Community Hall",
    date: seedDate(7),
    startTime: "5:00 PM",
    endTime: "8:00 PM",
    status: "pending",
    createdById: "owner_seed",
    createdByName: "Rohan Mehta",
    createdByPhone: "+91 9876500000",
    createdByRole: "owner",
    createdAt: new Date().toISOString(),
  },
];

export const useCalendarStore = create<CalendarState>((set, get) => ({
  events: DUMMY_EVENTS,

  addEvent: (event) => {
    const status: CalendarEventStatus =
      event.type === "notice" || event.createdByRole === "admin"
        ? "approved"
        : "pending";

    const newEvent: CalendarEvent = {
      ...event,
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      status,
      createdAt: new Date().toISOString(),
    };

    set((s) => ({ events: [...s.events, newEvent] }));
    return newEvent;
  },

  editEvent: (id, updates) => {
    set((s) => ({
      events: s.events.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    }));
  },

  approveEvent: (id) =>
    set((s) => ({
      events: s.events.map((e) =>
        e.id === id
          ? { ...e, status: "approved", respondedAt: new Date().toISOString() }
          : e,
      ),
    })),

  rejectEvent: (id, reason) =>
    set((s) => ({
      events: s.events.map((e) =>
        e.id === id
          ? {
              ...e,
              status: "rejected",
              rejectionReason: reason?.trim() || undefined,
              respondedAt: new Date().toISOString(),
            }
          : e,
      ),
    })),

  deleteEvent: (id) =>
    set((s) => ({ events: s.events.filter((e) => e.id !== id) })),

  getEventsForAccount: (accountId) =>
    get().events.filter((e) => e.accountId === accountId),
}));
