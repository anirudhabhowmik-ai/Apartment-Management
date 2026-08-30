import { useCallback, useEffect } from "react";
import { useAccountStore } from "../store/accountStore";
import { useAuthStore } from "../store/useAuthStore";
import { Account, AccountType } from "../types";

// TODO: replace with real backend calls (Supabase/Firebase table: accounts)
async function fetchAccountsForUser(userId: string): Promise<Account[]> {
  return [];
}

async function createAccountApi(
  userId: string,
  type: AccountType,
  name: string,
  photoUri?: string,
): Promise<Account> {
  const now = new Date().toISOString();
  const base = {
    id: `acc_${Date.now()}`,
    ownerId: userId,
    name,
    photoUri,
    createdAt: now,
    updatedAt: now,
  };

  if (type === "apartment") {
    return {
      ...base,
      type: "apartment",
      secretaryId: userId,
    } as Account;
  }

  return {
    ...base,
    type: "home",
    isRented: false,
  } as Account;
}

export function useAccounts() {
  const user = useAuthStore((s: any) => s.user);
  const {
    accounts,
    selectedAccountId,
    isLoading,
    setAccounts,
    addAccount,
    updateAccount,
    selectAccount,
    setIsLoading,
    getSelectedAccount,
  } = useAccountStore();

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      setIsLoading(true);
      try {
        const data = await fetchAccountsForUser(user.id);
        if (data && data.length > 0) {
          setAccounts(data);
        }
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [user, setAccounts]);

  const createAccount = useCallback(
    async (type: AccountType, name: string, photoUri?: string) => {
      if (!user) {
        console.error("No user logged in");
        return null;
      }
      const newAccount = await createAccountApi(user.id, type, name, photoUri);
      addAccount(newAccount);
      return newAccount;
    },
    [user, addAccount],
  );

  const editAccount = useCallback(
    async (id: string, updates: { name?: string; photoUri?: string }) => {
      updateAccount(id, { ...updates, updatedAt: new Date().toISOString() });
    },
    [updateAccount],
  );

  return {
    accounts,
    selectedAccount: getSelectedAccount(),
    selectedAccountId,
    isLoading,
    selectAccount,
    createAccount,
    editAccount,
  };
}
