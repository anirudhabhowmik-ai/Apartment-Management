import { create } from "zustand";
import { Group } from "../types/group";

interface GroupStore {
  groups: Group[];
  isLoading: boolean;
  setGroups: (groups: Group[]) => void;
  addGroup: (group: Group) => void;
  updateGroup: (id: string, updates: Partial<Group>) => void;
  deleteGroup: (id: string) => void;
  setIsLoading: (loading: boolean) => void;
  getGroupsByAccount: (accountId: string) => Group[];
  getGroupById: (id: string) => Group | undefined;
}

export const useGroupStore = create<GroupStore>((set, get) => ({
  groups: [],
  isLoading: false,

  setGroups: (groups) => set({ groups }),

  addGroup: (group) => set((state) => ({ groups: [...state.groups, group] })),

  updateGroup: (id, updates) =>
    set((state: any) => ({
      groups: state.groups.map((g: any) =>
        g.id === id ? { ...g, ...updates } : g,
      ),
    })),

  deleteGroup: (id) =>
    set((state: any) => ({
      groups: state.groups.filter((g: any) => g.id !== id),
    })),

  setIsLoading: (isLoading) => set({ isLoading }),

  getGroupsByAccount: (accountId) => {
    return get().groups.filter((g) => g.accountId === accountId);
  },

  getGroupById: (id) => {
    return get().groups.find((g) => g.id === id);
  },
}));
