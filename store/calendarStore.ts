// src/store/calendarStore.ts
//
// No zustand state. Exports types + constants + `calendarStore` API wrapper.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CalendarEventType = "notice" | "event";
export type CalendarEventStatus = "approved" | "pending" | "rejected";
export type CalendarRole = "admin" | "owner" | "member";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface CalendarAttachment {
  uri: string;
  name: string;
  mimeType?: string;
}

export interface CalendarResponse {
  userId: string;
  name: string;
  phone?: string;
  role?: CalendarRole;
  response: "accept" | "reject";
  reason?: string;
  note?: string;
  at: string;
}

export interface CalendarEvent {
  id: string;
  accountId: string;
  title: string;
  description?: string;
  type: CalendarEventType;
  resource?: ResourceOption | string;
  date: string;
  startTime?: string;
  endTime?: string;
  status: CalendarEventStatus;
  isImportant: boolean;
  rsvpEnabled: boolean;

  attachments: CalendarAttachment[];

  createdById: string;
  createdByName?: string;
  createdByPhone?: string;
  createdByRole?: CalendarRole;

  approvedById?: string;
  approvedByName?: string;
  approvedByPhone?: string;
  approvedByRole?: "admin" | "owner";
  rejectionReason?: string;

  createdAt: string;
  updatedAt?: string;

  responses: CalendarResponse[];
}

export interface NewCalendarEvent {
  title: string;
  description?: string;
  type: CalendarEventType;
  resource?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  isImportant?: boolean;
  rsvpEnabled?: boolean;
  attachments?: CalendarAttachment[];
}

export type CalendarEventUpdates = Partial<NewCalendarEvent>;

export interface RsvpPayload {
  response: "accept" | "reject";
  reason?: string;
  note?: string;
}

// ---------------------------------------------------------------------------
// API base URL
// ---------------------------------------------------------------------------

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

if (!API_BASE_URL) {
  console.error(
    "[calendarStore] EXPO_PUBLIC_API_URL is not set. " +
      "Add it to your .env and restart Expo.",
  );
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string | null;
};

async function request<T = any>(
  path: string,
  { method = "GET", body, token }: RequestOptions = {},
): Promise<T> {
  if (!API_BASE_URL) {
    const err: any = new Error("Backend API URL is not configured.");
    err.code = "missing_api_url";
    throw err;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = `${API_BASE_URL}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (netErr: any) {
    console.error(`[calendarStore] Network error on ${method} ${url}`, netErr);
    const err: any = new Error(netErr?.message || "Network request failed");
    err.code = "network_error";
    throw err;
  }

  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const message =
      (data && typeof data === "object" && (data as any).message) ||
      `Request failed (${res.status})`;
    console.warn(`[calendarStore] ${method} ${url} -> ${res.status}`, data);
    const err: any = new Error(message);
    err.code = (data as any)?.code ?? "request_failed";
    err.status = res.status;
    err.payload = data;
    throw err;
  }

  return data as T;
}

// ---------------------------------------------------------------------------
// URL builder
// ---------------------------------------------------------------------------

const eventsUrl = (accountId: string) =>
  `/accounts/${accountId}/calendar/events`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const calendarStore = {
  loadEvents: (
    accountId: string,
    { month }: { month?: string } = {},
    token?: string | null,
  ): Promise<CalendarEvent[]> => {
    const qs = month ? `?month=${encodeURIComponent(month)}` : "";
    return request<CalendarEvent[]>(`${eventsUrl(accountId)}${qs}`, { token });
  },

  getEvent: (
    accountId: string,
    id: string,
    token?: string | null,
  ): Promise<CalendarEvent> =>
    request<CalendarEvent>(`${eventsUrl(accountId)}/${id}`, { token }),

  addEvent: (
    accountId: string,
    payload: NewCalendarEvent,
    token?: string | null,
  ): Promise<CalendarEvent> =>
    request<CalendarEvent>(eventsUrl(accountId), {
      method: "POST",
      body: payload,
      token,
    }),

  editEvent: (
    accountId: string,
    id: string,
    payload: CalendarEventUpdates,
    token?: string | null,
  ): Promise<CalendarEvent> =>
    request<CalendarEvent>(`${eventsUrl(accountId)}/${id}`, {
      method: "PATCH",
      body: payload,
      token,
    }),

  approveEvent: (
    accountId: string,
    id: string,
    token?: string | null,
  ): Promise<CalendarEvent> =>
    request<CalendarEvent>(`${eventsUrl(accountId)}/${id}/approve`, {
      method: "POST",
      token,
    }),

  rejectEvent: (
    accountId: string,
    id: string,
    reason?: string,
    token?: string | null,
  ): Promise<CalendarEvent> =>
    request<CalendarEvent>(`${eventsUrl(accountId)}/${id}/reject`, {
      method: "POST",
      body: { reason },
      token,
    }),

  resendEvent: (
    accountId: string,
    id: string,
    token?: string | null,
  ): Promise<CalendarEvent> =>
    request<CalendarEvent>(`${eventsUrl(accountId)}/${id}/resend`, {
      method: "POST",
      token,
    }),

  deleteEvent: (
    accountId: string,
    id: string,
    token?: string | null,
  ): Promise<{ success: boolean }> =>
    request<{ success: boolean }>(`${eventsUrl(accountId)}/${id}`, {
      method: "DELETE",
      token,
    }),

  respondToEvent: (
    accountId: string,
    id: string,
    payload: RsvpPayload,
    token?: string | null,
  ): Promise<CalendarEvent> =>
    request<CalendarEvent>(`${eventsUrl(accountId)}/${id}/respond`, {
      method: "POST",
      body: payload,
      token,
    }),
};
