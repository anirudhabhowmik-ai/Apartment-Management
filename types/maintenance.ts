export type MaintenanceStatus = "pending" | "in_progress" | "completed";
export type MaintenancePriority = "low" | "medium" | "high";

export interface MaintenanceTask {
  id: string;
  accountId: string;
  flatId: string;
  title: string;
  description?: string;
  date: string;
  status: MaintenanceStatus;
  priority: MaintenancePriority;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AddMaintenanceInput {
  accountId: string;
  flatId: string;
  title: string;
  description?: string;
  date: string;
  priority: MaintenancePriority;
  assignedTo?: string;
}

export interface UpdateMaintenanceInput {
  title?: string;
  description?: string;
  date?: string;
  status?: MaintenanceStatus;
  priority?: MaintenancePriority;
  assignedTo?: string;
}

export interface MaintenanceStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  highPriority: number;
  completionRate: number;
}

// Metadata for UI
export const MAINTENANCE_PRIORITY_META: Record<
  MaintenancePriority,
  { label: string; color: string; icon: string }
> = {
  high: {
    label: "High",
    color: "#F44336",
    icon: "alert-circle",
  },
  medium: {
    label: "Medium",
    color: "#FF9800",
    icon: "time-outline",
  },
  low: {
    label: "Low",
    color: "#4CAF50",
    icon: "checkmark-circle",
  },
};

export const MAINTENANCE_STATUS_META: Record<
  MaintenanceStatus,
  { label: string; color: string; icon: string }
> = {
  pending: {
    label: "Pending",
    color: "#FF9800",
    icon: "time-outline",
  },
  in_progress: {
    label: "In Progress",
    color: "#2196F3",
    icon: "construct-outline",
  },
  completed: {
    label: "Completed",
    color: "#4CAF50",
    icon: "checkmark-circle",
  },
};

// Helper functions
export function getPriorityLabel(priority: MaintenancePriority): string {
  return MAINTENANCE_PRIORITY_META[priority].label;
}

export function getPriorityColor(priority: MaintenancePriority): string {
  return MAINTENANCE_PRIORITY_META[priority].color;
}

export function getPriorityIcon(priority: MaintenancePriority): string {
  return MAINTENANCE_PRIORITY_META[priority].icon;
}

export function getStatusLabel(status: MaintenanceStatus): string {
  return MAINTENANCE_STATUS_META[status].label;
}

export function getStatusColor(status: MaintenanceStatus): string {
  return MAINTENANCE_STATUS_META[status].color;
}

export function getStatusIcon(status: MaintenanceStatus): string {
  return MAINTENANCE_STATUS_META[status].icon;
}
