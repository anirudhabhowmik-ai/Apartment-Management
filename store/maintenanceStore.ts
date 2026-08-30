import { create } from "zustand";
import {
    MaintenancePriority,
    MaintenanceStatus,
    MaintenanceTask,
} from "../types/maintenance";

interface MaintenanceStore {
  // State
  tasks: MaintenanceTask[];
  isLoading: boolean;
  error: string | null;

  // Setter Actions
  setTasks: (tasks: MaintenanceTask[]) => void;
  addTask: (task: MaintenanceTask) => void;
  updateTask: (id: string, updates: Partial<MaintenanceTask>) => void;
  deleteTask: (id: string) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearTasks: () => void;

  // Selectors / Getters
  getTasksByAccount: (accountId: string) => MaintenanceTask[];
  getTasksByFlat: (flatId: string) => MaintenanceTask[];
  getTasksByStatus: (status: MaintenanceStatus) => MaintenanceTask[];
  getTasksByPriority: (priority: MaintenancePriority) => MaintenanceTask[];
  getTasksByDateRange: (
    startDate: string,
    endDate: string,
  ) => MaintenanceTask[];
  getUpcomingTasks: () => MaintenanceTask[];
  getOverdueTasks: () => MaintenanceTask[];
  getTasksByMonth: (month: string) => MaintenanceTask[];
  getTaskById: (id: string) => MaintenanceTask | undefined;
  getTaskStats: () => {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    highPriority: number;
    completionRate: number;
  };
  getTasksByPriorityWithCount: () => {
    high: MaintenanceTask[];
    medium: MaintenanceTask[];
    low: MaintenanceTask[];
    highCount: number;
    mediumCount: number;
    lowCount: number;
  };
  getTasksByStatusWithCount: () => {
    pending: MaintenanceTask[];
    inProgress: MaintenanceTask[];
    completed: MaintenanceTask[];
    pendingCount: number;
    inProgressCount: number;
    completedCount: number;
  };
  getUrgentTasks: () => MaintenanceTask[];
  getWeeklyTasks: () => MaintenanceTask[];
  getTodayTasks: () => MaintenanceTask[];
}

export const useMaintenanceStore = create<MaintenanceStore>((set, get) => ({
  // Initial State
  tasks: [],
  isLoading: false,
  error: null,

  // Setter Actions
  setTasks: (tasks: MaintenanceTask[]) => set({ tasks }),

  addTask: (task: MaintenanceTask) =>
    set((state) => ({
      tasks: [task, ...state.tasks],
    })),

  updateTask: (id: string, updates: Partial<MaintenanceTask>) =>
    set((state) => ({
      tasks: state.tasks.map((task: MaintenanceTask) =>
        task.id === id
          ? { ...task, ...updates, updatedAt: new Date().toISOString() }
          : task,
      ),
    })),

  deleteTask: (id: string) =>
    set((state) => ({
      tasks: state.tasks.filter((task: MaintenanceTask) => task.id !== id),
    })),

  setIsLoading: (isLoading: boolean) => set({ isLoading }),

  setError: (error: string | null) => set({ error }),

  clearTasks: () => set({ tasks: [], error: null }),

  // Selectors / Getters
  getTasksByAccount: (accountId: string) => {
    const state = get();
    return state.tasks.filter(
      (task: MaintenanceTask) => task.accountId === accountId,
    );
  },

  getTasksByFlat: (flatId: string) => {
    const state = get();
    return state.tasks.filter(
      (task: MaintenanceTask) => task.flatId === flatId,
    );
  },

  getTasksByStatus: (status: MaintenanceStatus) => {
    const state = get();
    return state.tasks.filter(
      (task: MaintenanceTask) => task.status === status,
    );
  },

  getTasksByPriority: (priority: MaintenancePriority) => {
    const state = get();
    return state.tasks.filter(
      (task: MaintenanceTask) => task.priority === priority,
    );
  },

  getTasksByDateRange: (startDate: string, endDate: string) => {
    const state = get();
    return state.tasks.filter(
      (task: MaintenanceTask) => task.date >= startDate && task.date <= endDate,
    );
  },

  getUpcomingTasks: () => {
    const state = get();
    const today = new Date().toISOString();
    return state.tasks
      .filter(
        (task: MaintenanceTask) =>
          task.date >= today && task.status !== "completed",
      )
      .sort((a: MaintenanceTask, b: MaintenanceTask) =>
        a.date.localeCompare(b.date),
      );
  },

  getOverdueTasks: () => {
    const state = get();
    const today = new Date().toISOString();
    return state.tasks.filter(
      (task: MaintenanceTask) =>
        task.date < today && task.status !== "completed",
    );
  },

  getTasksByMonth: (month: string) => {
    const state = get();
    return state.tasks.filter((task: MaintenanceTask) => {
      const taskMonth = new Date(task.date).toISOString().slice(0, 7);
      return taskMonth === month;
    });
  },

  getTaskById: (id: string) => {
    const state = get();
    return state.tasks.find((task: MaintenanceTask) => task.id === id);
  },

  getTaskStats: () => {
    const state = get();
    const tasks = state.tasks;
    const total = tasks.length;
    const pending = tasks.filter(
      (task: MaintenanceTask) => task.status === "pending",
    ).length;
    const inProgress = tasks.filter(
      (task: MaintenanceTask) => task.status === "in_progress",
    ).length;
    const completed = tasks.filter(
      (task: MaintenanceTask) => task.status === "completed",
    ).length;
    const highPriority = tasks.filter(
      (task: MaintenanceTask) => task.priority === "high",
    ).length;

    return {
      total,
      pending,
      inProgress,
      completed,
      highPriority,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  },

  getTasksByPriorityWithCount: () => {
    const state = get();
    const tasks = state.tasks;
    const high = tasks.filter(
      (task: MaintenanceTask) => task.priority === "high",
    );
    const medium = tasks.filter(
      (task: MaintenanceTask) => task.priority === "medium",
    );
    const low = tasks.filter(
      (task: MaintenanceTask) => task.priority === "low",
    );

    return {
      high,
      medium,
      low,
      highCount: high.length,
      mediumCount: medium.length,
      lowCount: low.length,
    };
  },

  getTasksByStatusWithCount: () => {
    const state = get();
    const tasks = state.tasks;
    const pending = tasks.filter(
      (task: MaintenanceTask) => task.status === "pending",
    );
    const inProgress = tasks.filter(
      (task: MaintenanceTask) => task.status === "in_progress",
    );
    const completed = tasks.filter(
      (task: MaintenanceTask) => task.status === "completed",
    );

    return {
      pending,
      inProgress,
      completed,
      pendingCount: pending.length,
      inProgressCount: inProgress.length,
      completedCount: completed.length,
    };
  },

  getUrgentTasks: () => {
    const state = get();
    return state.tasks.filter(
      (task: MaintenanceTask) =>
        task.priority === "high" && task.status !== "completed",
    );
  },

  getWeeklyTasks: () => {
    const state = get();
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const startDate = weekStart.toISOString().split("T")[0];
    const endDate = weekEnd.toISOString().split("T")[0];

    return state.tasks.filter(
      (task: MaintenanceTask) => task.date >= startDate && task.date <= endDate,
    );
  },

  getTodayTasks: () => {
    const state = get();
    const today = new Date().toISOString().split("T")[0];
    return state.tasks.filter((task: MaintenanceTask) =>
      task.date.startsWith(today),
    );
  },
}));
