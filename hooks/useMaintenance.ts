import { useCallback, useEffect } from "react";
import { useMaintenanceStore } from "../store/maintenanceStore";
import {
    AddMaintenanceInput,
    MaintenanceStats,
    MaintenanceStatus,
    MaintenanceTask,
    UpdateMaintenanceInput,
} from "../types/maintenance";

// API functions - TODO: Replace with actual API calls
async function fetchMaintenanceTasks(
  accountId: string,
): Promise<MaintenanceTask[]> {
  // TODO: Replace with actual API call
  // const { data } = await supabase
  //   .from('maintenance')
  //   .select('*')
  //   .eq('accountId', accountId)
  //   .order('date', { ascending: true });
  // return data ?? [];

  // Mock data for testing
  return [
    {
      id: "m1",
      accountId: accountId,
      flatId: "flat_101",
      title: "Plumbing Repair",
      description: "Leaking pipe in kitchen sink",
      date: new Date(2026, 8, 15).toISOString(),
      status: "pending",
      priority: "high",
      assignedTo: "Plumber Rajesh",
      createdAt: new Date(2026, 8, 10).toISOString(),
      updatedAt: new Date(2026, 8, 10).toISOString(),
    },
    {
      id: "m2",
      accountId: accountId,
      flatId: "flat_202",
      title: "Electrical Wiring",
      description: "Faulty wiring in living room",
      date: new Date(2026, 8, 18).toISOString(),
      status: "in_progress",
      priority: "high",
      assignedTo: "Electrician Suresh",
      createdAt: new Date(2026, 8, 12).toISOString(),
      updatedAt: new Date(2026, 8, 13).toISOString(),
    },
    {
      id: "m3",
      accountId: accountId,
      flatId: "common_area",
      title: "Elevator Maintenance",
      description: "Scheduled monthly maintenance",
      date: new Date(2026, 8, 20).toISOString(),
      status: "pending",
      priority: "medium",
      assignedTo: "Elevator Service",
      createdAt: new Date(2026, 8, 14).toISOString(),
      updatedAt: new Date(2026, 8, 14).toISOString(),
    },
    {
      id: "m4",
      accountId: accountId,
      flatId: "flat_303",
      title: "AC Service",
      description: "Annual AC maintenance and cleaning",
      date: new Date(2026, 8, 25).toISOString(),
      status: "pending",
      priority: "low",
      assignedTo: "AC Service Tech",
      createdAt: new Date(2026, 8, 15).toISOString(),
      updatedAt: new Date(2026, 8, 15).toISOString(),
    },
    {
      id: "m5",
      accountId: accountId,
      flatId: "flat_101",
      title: "Paint Work",
      description: "Wall painting for living room",
      date: new Date(2026, 8, 5).toISOString(),
      status: "completed",
      priority: "medium",
      assignedTo: "Painter Amit",
      createdAt: new Date(2026, 8, 1).toISOString(),
      updatedAt: new Date(2026, 8, 5).toISOString(),
    },
  ];
}

async function createMaintenanceApi(
  task: Omit<MaintenanceTask, "id" | "createdAt" | "updatedAt">,
): Promise<MaintenanceTask> {
  // TODO: Replace with actual API call
  // const { data } = await supabase
  //   .from('maintenance')
  //   .insert(task)
  //   .select()
  //   .single();
  // return data;

  const now = new Date().toISOString();
  return {
    ...task,
    id: `maint_${Date.now()}`,
    createdAt: now,
    updatedAt: now,
  } as MaintenanceTask;
}

async function updateMaintenanceApi(
  id: string,
  updates: Partial<MaintenanceTask>,
): Promise<MaintenanceTask> {
  // TODO: Replace with actual API call
  // const { data } = await supabase
  //   .from('maintenance')
  //   .update(updates)
  //   .eq('id', id)
  //   .select()
  //   .single();
  // return data;

  return {
    id,
    ...updates,
    updatedAt: new Date().toISOString(),
  } as MaintenanceTask;
}

async function deleteMaintenanceApi(id: string): Promise<void> {
  // TODO: Replace with actual API call
  // await supabase.from('maintenance').delete().eq('id', id);
  console.log("Deleting maintenance task:", id);
}

export function useMaintenance(accountId?: string, flatId?: string) {
  const {
    tasks,
    isLoading,
    error,
    setTasks,
    addTask,
    updateTask,
    deleteTask,
    setIsLoading,
    setError,
    getTasksByAccount,
    getTasksByFlat,
    getTasksByStatus,
    getTasksByPriority,
    getUpcomingTasks,
    getOverdueTasks,
  } = useMaintenanceStore();

  // Load maintenance tasks
  useEffect(() => {
    if (!accountId) {
      setTasks([]);
      return;
    }

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchMaintenanceTasks(accountId);
        setTasks(data);
      } catch (error: any) {
        setError(error.message || "Failed to load maintenance tasks");
        console.error("Error fetching maintenance tasks:", error);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [accountId, setTasks, setIsLoading, setError]);

  // Add new maintenance task
  const addNewTask = useCallback(
    async (input: AddMaintenanceInput): Promise<MaintenanceTask> => {
      try {
        setIsLoading(true);
        setError(null);
        const newTask = await createMaintenanceApi(input as any);
        addTask(newTask);
        return newTask;
      } catch (error: any) {
        setError(error.message || "Failed to add maintenance task");
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [addTask, setIsLoading, setError],
  );

  // Edit/Update maintenance task
  const editTask = useCallback(
    async (
      id: string,
      input: UpdateMaintenanceInput,
    ): Promise<MaintenanceTask> => {
      try {
        setIsLoading(true);
        setError(null);
        const updatedTask = await updateMaintenanceApi(id, input);
        updateTask(id, updatedTask);
        return updatedTask;
      } catch (error: any) {
        setError(error.message || "Failed to update maintenance task");
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [updateTask, setIsLoading, setError],
  );

  // Delete maintenance task
  const removeTask = useCallback(
    async (id: string): Promise<void> => {
      try {
        setIsLoading(true);
        setError(null);
        await deleteMaintenanceApi(id);
        deleteTask(id);
      } catch (error: any) {
        setError(error.message || "Failed to delete maintenance task");
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [deleteTask, setIsLoading, setError],
  );

  // Mark task as in_progress
  const startTask = useCallback(
    async (id: string): Promise<MaintenanceTask> => {
      try {
        setIsLoading(true);
        setError(null);
        const updatedTask = await updateMaintenanceApi(id, {
          status: "in_progress" as MaintenanceStatus,
        });
        updateTask(id, updatedTask);
        return updatedTask;
      } catch (error: any) {
        setError(error.message || "Failed to start task");
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [updateTask, setIsLoading, setError],
  );

  // Complete task
  const completeTask = useCallback(
    async (id: string): Promise<MaintenanceTask> => {
      try {
        setIsLoading(true);
        setError(null);
        const updatedTask = await updateMaintenanceApi(id, {
          status: "completed" as MaintenanceStatus,
        });
        updateTask(id, updatedTask);
        return updatedTask;
      } catch (error: any) {
        setError(error.message || "Failed to complete task");
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [updateTask, setIsLoading, setError],
  );

  // Get task by ID
  const getTaskById = useCallback(
    (id: string): MaintenanceTask | undefined => {
      return tasks.find((task: MaintenanceTask) => task.id === id);
    },
    [tasks],
  );

  // Get tasks by date range
  const getTasksByDateRange = useCallback(
    (startDate: string, endDate: string): MaintenanceTask[] => {
      return tasks.filter(
        (task: MaintenanceTask) =>
          task.date >= startDate && task.date <= endDate,
      );
    },
    [tasks],
  );

  // Get today's tasks
  const getTodayTasks = useCallback((): MaintenanceTask[] => {
    const today = new Date().toISOString().split("T")[0];
    return tasks.filter((task: MaintenanceTask) => task.date.startsWith(today));
  }, [tasks]);

  // Get task statistics
  const getTaskStats = useCallback((): MaintenanceStats => {
    const total: number = tasks.length;
    const pending: number = tasks.filter(
      (task: MaintenanceTask) => task.status === "pending",
    ).length;
    const inProgress: number = tasks.filter(
      (task: MaintenanceTask) => task.status === "in_progress",
    ).length;
    const completed: number = tasks.filter(
      (task: MaintenanceTask) => task.status === "completed",
    ).length;
    const highPriority: number = tasks.filter(
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
  }, [tasks]);

  // Get tasks by priority with count
  const getTasksByPriorityWithCount = useCallback((): {
    high: MaintenanceTask[];
    medium: MaintenanceTask[];
    low: MaintenanceTask[];
    highCount: number;
    mediumCount: number;
    lowCount: number;
  } => {
    const high: MaintenanceTask[] = tasks.filter(
      (task: MaintenanceTask) => task.priority === "high",
    );
    const medium: MaintenanceTask[] = tasks.filter(
      (task: MaintenanceTask) => task.priority === "medium",
    );
    const low: MaintenanceTask[] = tasks.filter(
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
  }, [tasks]);

  // Get tasks by status with count
  const getTasksByStatusWithCount = useCallback((): {
    pending: MaintenanceTask[];
    inProgress: MaintenanceTask[];
    completed: MaintenanceTask[];
    pendingCount: number;
    inProgressCount: number;
    completedCount: number;
  } => {
    const pending: MaintenanceTask[] = tasks.filter(
      (task: MaintenanceTask) => task.status === "pending",
    );
    const inProgress: MaintenanceTask[] = tasks.filter(
      (task: MaintenanceTask) => task.status === "in_progress",
    );
    const completed: MaintenanceTask[] = tasks.filter(
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
  }, [tasks]);

  // Get urgent tasks (high priority + pending/in_progress)
  const getUrgentTasks = useCallback((): MaintenanceTask[] => {
    return tasks.filter(
      (task: MaintenanceTask) =>
        task.priority === "high" && task.status !== "completed",
    );
  }, [tasks]);

  // Get tasks by month
  const getTasksByMonth = useCallback(
    (month: string): MaintenanceTask[] => {
      return tasks.filter((task: MaintenanceTask) => {
        const taskMonth: string = new Date(task.date).toISOString().slice(0, 7);
        return taskMonth === month;
      });
    },
    [tasks],
  );

  // Get weekly tasks
  const getWeeklyTasks = useCallback((): MaintenanceTask[] => {
    const now: Date = new Date();
    const weekStart: Date = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const weekEnd: Date = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const startDate: string = weekStart.toISOString().split("T")[0];
    const endDate: string = weekEnd.toISOString().split("T")[0];
    return tasks.filter(
      (task: MaintenanceTask) => task.date >= startDate && task.date <= endDate,
    );
  }, [tasks]);

  // Get filtered tasks (by flat if provided)
  const filteredTasks: MaintenanceTask[] = flatId
    ? getTasksByFlat(flatId)
    : accountId
      ? getTasksByAccount(accountId)
      : [];

  return {
    // Data
    tasks: filteredTasks,
    isLoading,
    error,

    // CRUD Operations
    addNewTask,
    editTask,
    removeTask,
    startTask,
    completeTask,

    // Getters
    getTaskById,
    getTasksByStatus,
    getTasksByPriority,
    getUpcomingTasks,
    getOverdueTasks,
    getTasksByDateRange,
    getTodayTasks,
    getTasksByMonth,
    getWeeklyTasks,
    getUrgentTasks,

    // Statistics
    getTaskStats,
    getTasksByPriorityWithCount,
    getTasksByStatusWithCount,
  };
}
