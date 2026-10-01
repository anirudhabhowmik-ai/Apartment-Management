import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface ThemeState {
  isDarkMode: boolean;
  setDarkMode: (enabled: boolean) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      isDarkMode: false,
      setDarkMode: (isDarkMode) => set({ isDarkMode }),
    }),
    {
      name: "theme-preference",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
