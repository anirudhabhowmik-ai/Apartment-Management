import { create } from "zustand";
import { Member } from "../types";

interface MemberState {
  members: Member[];
  isLoading: boolean;
  setMembers: (members: Member[]) => void;
  addMember: (member: Member) => void;
  updateMember: (id: string, updates: Partial<Member>) => void;
  removeMember: (id: string) => void;
  setIsLoading: (loading: boolean) => void;
  getMembersByGroup: (groupId: string) => Member[];
}

export const useMemberStore = create<MemberState>((set, get) => ({
  members: [],
  isLoading: false,

  setMembers: (members) => set({ members }),

  addMember: (member) =>
    set((state) => ({ members: [...state.members, member] })),

  updateMember: (id, updates) =>
    set((state) => ({
      members: state.members.map((m) =>
        m.id === id ? ({ ...m, ...updates } as Member) : m,
      ),
    })),

  removeMember: (id) =>
    set((state) => ({ members: state.members.filter((m) => m.id !== id) })),

  setIsLoading: (isLoading) => set({ isLoading }),

  getMembersByGroup: (groupId) => {
    return get().members.filter((m) => m.groupId === groupId);
  },
}));
