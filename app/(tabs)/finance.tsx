import { downloadFinanceReportPdf } from "@/services/financeReportPdf";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as Sharing from "expo-sharing";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as XLSX from "xlsx";

import { useAccounts } from "../../hooks/useAccounts";
import { useExpenses, useMembers, useStaff } from "../../hooks/useManagement";
import { useUserRole } from "../../hooks/useUserRole";
import { useAccountStore } from "../../store/accountStore";
import type { Member } from "../../types";

import {
  getPaymentCategoryColor,
  getPaymentStatusColor,
  PaymentCategory,
  PaymentStatus,
} from "../../types/payment";

import {
  getPeopleSummary,
  PeopleTransaction,
} from "../../utils/peopleTransactions";

// ============================================================
// TYPES
// ============================================================

type FilterType = "all" | "income" | "expense" | "pending";
type TransactionType = "income" | "expense";
type BillAttachment = { name?: string; url?: string };

type OpeningBalanceResponse = {
  account_id: string;
  opening_balance: number;
  updated_by: string | null;
  updated_by_phone?: string | null;
  updated_by_name?: string | null;
  updated_at: string | null;
  can_edit?: boolean;
};

type CarriedForwardResponse = {
  account_id: string;
  month: string;
  opening_balance: number;
  maintenance_income: number;
  salary_expense: number;
  transaction_income: number;
  transaction_expense: number;
  previous_net: number;
  carried_forward: number;
};

// ============================================================
// OPENING BALANCE API
// ============================================================

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const AUTH_TOKEN_KEY = "auth_token";
const OPENING_BALANCE_PREFIX = "/opening-balance";

async function getAuthToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

async function openingBalanceRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (!API_BASE_URL) throw new Error("EXPO_PUBLIC_API_URL is not configured.");

  const token = await getAuthToken();
  const url = `${API_BASE_URL}${OPENING_BALANCE_PREFIX}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err: any = new Error(
      data?.message || `Request failed with status ${res.status}`,
    );
    err.status = res.status;
    err.body = data;
    throw err;
  }

  return data as T;
}

async function carriedForwardRequest(
  accountId: string,
  month: string,
): Promise<CarriedForwardResponse> {
  return openingBalanceRequest<CarriedForwardResponse>(
    `/${accountId}/carried-forward?month=${encodeURIComponent(month)}`,
  );
}

// ============================================================
// HELPERS
// ============================================================

const CATEGORY_LABELS: Record<string, string> = {
  salary: "Salary",
  maintenance: "Maintenance",
  electricity: "Electricity",
  water: "Water",
  hall_rent: "Hall Rent",
  parking_rent: "Parking Rent",
  advertisement: "Advertisement",
  interest: "Interest / Deposit",
  other_income: "Other Income",
  other: "Other",
};

const getCategoryLabel = (raw?: string | null): string => {
  if (!raw) return "—";
  const s = String(raw).trim();
  if (!s) return "—";
  if (CATEGORY_LABELS[s]) return CATEGORY_LABELS[s];
  const lower = s.toLowerCase();
  if (CATEGORY_LABELS[lower]) return CATEGORY_LABELS[lower];
  return lower
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
};

const toMonthKey = (raw?: string | null): string => {
  if (!raw) return "";
  const datePart = String(raw).trim().split(/[T ]/)[0];
  return datePart.slice(0, 7);
};

const toDateOnly = (raw?: string | null): string => {
  if (!raw) return "";
  return String(raw).trim().split(/[T ]/)[0];
};

const formatFullDate = (dateStr?: string | null): string => {
  if (!dateStr) return "";
  const datePart = String(dateStr).trim().split(/[T ]/)[0];
  const parts = datePart.split("-");
  if (parts.length < 3) return dateStr;
  return `${parts[2].padStart(2, "0")}/${parts[1].padStart(
    2,
    "0",
  )}/${parts[0]}`;
};

const formatEditedAt = (iso?: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${day}/${month}/${year} · ${hours}:${minutes} ${ampm}`;
};

const formatPhoneForDisplay = (raw?: string | null): string => {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  if (ten.length !== 10) return String(raw);
  return `+91 ${ten.slice(0, 5)} ${ten.slice(5)}`;
};

const truncate = (value: string, max = 22): string => {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

const callNumber = async (raw?: string | null) => {
  if (!raw) return;
  const digits = String(raw).replace(/\D/g, "");
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  if (ten.length !== 10) {
    Alert.alert("Invalid number", "This phone number looks incomplete.");
    return;
  }
  try {
    await Linking.openURL(`tel:+91${ten}`);
  } catch (e) {
    console.warn("dialer failed:", e);
    Alert.alert("Cannot call", "Unable to open the phone dialer.");
  }
};

// ------------------------------------------------------------
// Soft-delete helpers
// ------------------------------------------------------------

/**
 * Returns the month key (YYYY-MM) in which a member/staff row was
 * soft-deleted, or null if the row is still active.
 *
 * The backend sets `status = 'inactive'` and bumps `updated_at` when a
 * member/staff is deleted. We use `updated_at` as the deletion month.
 */
const getInactiveMonth = (row: any): string | null => {
  const status = String(row?.status ?? "").toLowerCase();
  if (status !== "inactive") return null;
  const raw =
    row?.deleted_at ??
    row?.deletedAt ??
    row?.updated_at ??
    row?.updatedAt ??
    null;
  const month = toMonthKey(raw);
  return month || null;
};

/**
 * Whether the row is inactive for the given month (i.e. was deleted
 * before or during that month).
 *
 * Examples:
 *   deletedMonth = "2025-03"
 *   monthKey     = "2025-02"  → false (still active in Feb)
 *   monthKey     = "2025-03"  → true  (deleted in March)
 *   monthKey     = "2025-04"  → true  (deleted in March, still inactive)
 */
const isRowInactiveForMonth = (row: any, monthKey: string): boolean => {
  const deletedMonth = getInactiveMonth(row);
  if (!deletedMonth) return false;
  return monthKey >= deletedMonth;
};

// ------------------------------------------------------------
// File save helpers
// ------------------------------------------------------------

const pickExtension = (mimeOrUri?: string | null): string => {
  const s = String(mimeOrUri || "").toLowerCase();
  if (s.includes("image/png") || s.endsWith(".png")) return "png";
  if (s.includes("image/webp") || s.endsWith(".webp")) return "webp";
  if (s.includes("application/pdf") || s.endsWith(".pdf")) return "pdf";
  if (s.includes("image/gif") || s.endsWith(".gif")) return "gif";
  if (s.includes("image/heic") || s.endsWith(".heic")) return "heic";
  if (s.includes("image/jpeg") || s.endsWith(".jpg")) return "jpg";
  if (s.includes("image/jpg") || s.endsWith(".jpeg")) return "jpg";
  return "jpg";
};

const pickMimeType = (mimeOrUri?: string | null): string => {
  const ext = pickExtension(mimeOrUri);
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "pdf":
      return "application/pdf";
    case "gif":
      return "image/gif";
    case "heic":
      return "image/heic";
    default:
      return "image/jpeg";
  }
};

const saveFileWithFolderPicker = async (
  base64OrLocalUri: string,
  suggestedName: string,
  sourceHint?: string | null,
): Promise<{ savedUri: string } | null> => {
  const safeBase = (suggestedName || "file").replace(/[^\w\-]+/g, "_");
  const ext = pickExtension(sourceHint);
  const mimeType = pickMimeType(sourceHint);
  const fileName = `${safeBase}.${ext}`;

  if (Platform.OS === "web") {
    try {
      let href = base64OrLocalUri;
      let isBlob = false;
      if (base64OrLocalUri.startsWith("data:")) {
        const match = base64OrLocalUri.match(/^data:([^;]+);base64,(.*)$/);
        if (!match) throw new Error("Invalid data URI");
        const mime = match[1] || mimeType;
        const b64 = match[2];
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: mime });
        href = URL.createObjectURL(blob);
        isBlob = true;
      }
      const a = document.createElement("a");
      a.href = href;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (isBlob) setTimeout(() => URL.revokeObjectURL(href), 1000);
      return { savedUri: fileName };
    } catch (e: any) {
      throw new Error(e?.message || "Browser download failed.");
    }
  }

  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) throw new Error("Cache directory not available.");
  const tempUri = `${cacheDir}${fileName}`;

  try {
    if (base64OrLocalUri.startsWith("data:")) {
      const match = base64OrLocalUri.match(/^data:([^;]+);base64,(.*)$/);
      if (!match) throw new Error("Invalid data URI");
      const b64 = match[2];
      await FileSystem.writeAsStringAsync(tempUri, b64, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } else if (base64OrLocalUri.startsWith("file://")) {
      await FileSystem.copyAsync({ from: base64OrLocalUri, to: tempUri });
    } else {
      await FileSystem.downloadAsync(base64OrLocalUri, tempUri);
    }
  } catch (e: any) {
    throw new Error(e?.message || "Failed to prepare file for saving.");
  }

  if (Platform.OS === "android") {
    const SAF = (FileSystem as any).StorageAccessFramework;
    if (SAF?.requestDirectoryPermissionsAsync) {
      const perm = await SAF.requestDirectoryPermissionsAsync();
      if (!perm.granted) {
        return null;
      }
      const base64Data = await FileSystem.readAsStringAsync(tempUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const fileUri = await SAF.createFileAsync(
        perm.directoryUri,
        fileName,
        mimeType,
      );

      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      return { savedUri: fileUri };
    }
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(tempUri, {
      mimeType,
      dialogTitle: `Save ${fileName}`,
      UTI: undefined,
    });
    return { savedUri: tempUri };
  }

  throw new Error("Saving is not available on this device.");
};

const downloadBillAttachment = async (
  uri?: string | null,
  name?: string | null,
): Promise<void> => {
  if (!uri) {
    Alert.alert("No bill", "This transaction has no attachment.");
    return;
  }

  const baseName = (name || "bill").replace(/\.[^.]+$/, "");

  try {
    let hint: string | null = null;
    if (uri.startsWith("data:")) {
      const m = uri.match(/^data:([^;]+);/);
      hint = m?.[1] || null;
    } else {
      hint = uri;
    }

    const result = await saveFileWithFolderPicker(uri, baseName, hint);

    if (!result) {
      return;
    }

    Alert.alert("Downloaded", "Bill saved successfully.");
  } catch (e: any) {
    console.warn("downloadBillAttachment failed:", e);
    Alert.alert(
      "Download failed",
      e?.message || "Unable to save the bill attachment.",
    );
  }
};

const currentMonthKey = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const previousMonthKey = (): string => {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
};

const isDueRelevant = (dueMonth: string): boolean => {
  const current = currentMonthKey();
  const previous = previousMonthKey();
  return dueMonth === current || dueMonth === previous;
};

const getTransactionType = (txn: any): TransactionType => {
  if (!txn) return "expense";
  const raw = String(txn.transactionType ?? txn.transaction_type ?? "")
    .trim()
    .toLowerCase();
  if (raw === "income") return "income";
  if (raw === "expense") return "expense";
  if (txn?.category === "maintenance") return "income";
  return "expense";
};

function normalizeAttachments(raw: any): BillAttachment[] {
  if (raw == null) return [];
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (Array.isArray(value.bill_attachments)) value = value.bill_attachments;
    else if (Array.isArray(value.billAttachments))
      value = value.billAttachments;
  }
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item) return null;
      if (typeof item === "string") return { url: item };
      const url =
        item.url ||
        item.uri ||
        item.href ||
        item.link ||
        item.file_url ||
        item.fileUrl;
      if (!url) return null;
      return {
        url: String(url),
        name: item.name || item.filename || item.file_name || undefined,
      };
    })
    .filter(Boolean) as BillAttachment[];
}

function findPaidPaymentInMonth(
  member: any,
  month: string,
): { billingMonth: string; paidDate: string } | null {
  const mp = member?.monthlyPayments;
  if (!mp || typeof mp !== "object") {
    const pd = member?.paidDate ? toDateOnly(member.paidDate) : "";
    if (pd && toMonthKey(pd) === month) {
      return { billingMonth: month, paidDate: pd };
    }
    return null;
  }

  const keys = Object.keys(mp);
  for (const billingMonth of keys) {
    const entry = mp[billingMonth];
    if (!entry || entry.status !== "paid" || !entry.paidDate) continue;
    const pd = toDateOnly(entry.paidDate);
    if (toMonthKey(pd) === month) {
      return { billingMonth, paidDate: pd };
    }
  }

  const pd = member?.paidDate ? toDateOnly(member.paidDate) : "";
  if (pd && toMonthKey(pd) === month) {
    return { billingMonth: month, paidDate: pd };
  }
  return null;
}

function hasDueInMonth(member: any, month: string): boolean {
  const mp = member?.monthlyPayments;
  if (mp && typeof mp === "object") {
    const entry = mp[month];
    if (entry && entry.status !== "paid") return true;
  }
  if (!mp || !mp[month]) {
    return isDueRelevant(month);
  }
  return false;
}

// ============================================================
// TRANSACTION DETAIL MODAL
// ============================================================

function TransactionDetailModal({
  visible,
  onClose,
  title,
  description,
  attachments,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  description: string;
  attachments: BillAttachment[];
}) {
  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlayCenter}>
        <View style={styles.detailModal}>
          <View style={styles.detailHeader}>
            <View style={styles.detailIconWrap}>
              <Ionicons name="receipt-outline" size={18} color="#2563EB" />
            </View>
            <Text style={styles.detailTitle} numberOfLines={1}>
              {title || "Transaction"}
            </Text>
            <TouchableOpacity
              style={styles.detailClose}
              onPress={onClose}
              hitSlop={8}
            >
              <Ionicons name="close" size={18} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.detailScroll}
            contentContainerStyle={styles.detailScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.detailSectionLabel}>Description</Text>
            <View style={styles.detailDescriptionBox}>
              <Text style={styles.detailDescriptionText}>
                {description?.trim() ? description : "No description provided."}
              </Text>
            </View>

            <Text style={styles.detailSectionLabel}>
              Bill Attachment{attachments.length === 1 ? "" : "s"}
            </Text>

            {attachments.length === 0 ? (
              <View style={styles.detailEmptyAttachment}>
                <Ionicons name="document-outline" size={20} color="#94A3B8" />
                <Text style={styles.detailEmptyAttachmentText}>
                  No bill attached
                </Text>
              </View>
            ) : (
              attachments.map((att, index) => (
                <View key={`${att.url}-${index}`} style={styles.attachmentRow}>
                  <View style={styles.attachmentIcon}>
                    <Ionicons
                      name="document-text-outline"
                      size={18}
                      color="#7C3AED"
                    />
                  </View>
                  <View style={styles.attachmentInfo}>
                    <Text style={styles.attachmentName} numberOfLines={1}>
                      {att.name || `Bill ${index + 1}`}
                    </Text>
                    <Text style={styles.attachmentUrl} numberOfLines={1}>
                      {att.url?.startsWith("data:")
                        ? "Embedded image"
                        : att.url || ""}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.attachmentDownload}
                    onPress={() =>
                      att.url && downloadBillAttachment(att.url, att.name)
                    }
                    activeOpacity={0.7}
                  >
                    <Ionicons name="download-outline" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ============================================================
// TRANSACTION ITEM
// ============================================================

function TransactionItem({
  payment,
  onShowDetails,
}: {
  payment: PeopleTransaction;
  onShowDetails: (payment: PeopleTransaction) => void;
}) {
  const getIcon = (key: string): keyof typeof Ionicons.glyphMap => {
    const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
      salary: "cash-outline",
      maintenance: "construct-outline",
      electricity: "flash-outline",
      water: "water-outline",
      hall_rent: "business-outline",
      parking_rent: "car-outline",
      advertisement: "megaphone-outline",
      interest: "trending-up-outline",
      other_income: "ellipsis-horizontal-circle-outline",
      other: "receipt-outline",
    };
    return icons[key] || "receipt-outline";
  };

  const getStatusIcon = (
    status: PaymentStatus,
  ): keyof typeof Ionicons.glyphMap => {
    switch (status) {
      case "paid":
        return "checkmark-circle";
      case "due":
        return "time-outline";
      case "overdue":
        return "alert-circle";
      default:
        return "time-outline";
    }
  };

  const anyPayment = payment as any;

  const isInactive = anyPayment.__isInactive === true;

  const rawCategory: string =
    typeof anyPayment.rawCategory === "string" && anyPayment.rawCategory
      ? anyPayment.rawCategory
      : typeof anyPayment.role === "string"
        ? anyPayment.role
        : typeof anyPayment.category === "string"
          ? anyPayment.category
          : "";

  const displayCategory = getCategoryLabel(rawCategory);

  const color = getPaymentCategoryColor(payment.category);
  const statusColor = getPaymentStatusColor(payment.status);
  const icon = getIcon(rawCategory.toLowerCase() || payment.category);
  const statusIcon = getStatusIcon(payment.status);

  const txnType = getTransactionType(payment);
  const isIncome = txnType === "income";

  const isMaintenance = payment.category === "maintenance";
  const isSalary = payment.category === "salary";
  const isTransactionRow = !isMaintenance && !isSalary;

  const rawTitle: string =
    typeof anyPayment.title === "string" && anyPayment.title.trim()
      ? anyPayment.title
      : typeof anyPayment.name === "string" && anyPayment.name.trim()
        ? anyPayment.name
        : "";

  let title = "";
  if (isMaintenance) {
    title = anyPayment.memberName || rawTitle || "Maintenance";
  } else if (isSalary) {
    title = anyPayment.memberName || rawTitle || "Staff Salary";
  } else {
    title = rawTitle || displayCategory;
  }

  const attachments: BillAttachment[] = normalizeAttachments(
    anyPayment.bill_attachments ??
      anyPayment.billAttachments ??
      anyPayment.billAttachment,
  );
  const hasAttachments = attachments.length > 0;

  const paidDate: string | null =
    typeof anyPayment.paidDate === "string" && anyPayment.paidDate
      ? toDateOnly(anyPayment.paidDate)
      : null;
  const dueDate: string | null = payment.dueDate
    ? toDateOnly(payment.dueDate)
    : null;
  const displayDate = payment.status === "paid" ? paidDate || dueDate : dueDate;

  const rawPhone: string | undefined = anyPayment.phone;
  const phoneDigits = rawPhone
    ? String(rawPhone).replace(/\D/g, "").slice(-10)
    : "";
  const hasCallablePhone =
    (isMaintenance || isSalary) && phoneDigits.length === 10;

  let metaLine1 = "";
  let metaIcon1: keyof typeof Ionicons.glyphMap = "pricetag-outline";
  if (isMaintenance) {
    const wing = anyPayment.wing ? `${anyPayment.wing} Wing • ` : "";
    const flat = anyPayment.flatNumber
      ? `Flat ${anyPayment.flatNumber}`
      : "Apartment member";
    metaLine1 = `${wing}${flat}`;
    metaIcon1 = "home-outline";
  } else if (isSalary) {
    metaLine1 = anyPayment.memberRole
      ? anyPayment.memberRole.charAt(0).toUpperCase() +
        anyPayment.memberRole.slice(1)
      : "Staff";
    metaIcon1 = "person-outline";
  } else {
    metaLine1 = displayCategory;
    metaIcon1 = "pricetag-outline";
  }

  let dateLine = "";
  if (displayDate) {
    if (isMaintenance || isSalary) {
      dateLine =
        payment.status === "paid"
          ? `Paid: ${formatFullDate(displayDate)}`
          : `Due: ${formatFullDate(displayDate)}`;
    } else {
      dateLine = formatFullDate(displayDate);
    }
  }

  return (
    <View
      style={[
        styles.transactionItem,
        isInactive && styles.transactionItemInactive,
      ]}
    >
      <View style={[styles.transactionIcon, { backgroundColor: `${color}15` }]}>
        <Ionicons name={icon} size={21} color={color} />
      </View>

      <View style={styles.transactionInfo}>
        <View style={styles.titleRow}>
          <Text
            style={[
              styles.transactionTitle,
              isInactive && styles.transactionTitleInactive,
            ]}
            numberOfLines={1}
          >
            {truncate(title, 26)}
          </Text>

          {isInactive ? (
            <View style={[styles.typeBadge, styles.typeBadgeInactive]}>
              <Text
                style={[styles.typeBadgeText, styles.typeBadgeTextInactive]}
              >
                Inactive
              </Text>
            </View>
          ) : null}

          {isMaintenance ? (
            <View style={[styles.typeBadge, styles.typeBadgeMaintenance]}>
              <Text
                style={[styles.typeBadgeText, styles.typeBadgeTextMaintenance]}
              >
                Maintenance
              </Text>
            </View>
          ) : null}

          {isSalary ? (
            <View style={[styles.typeBadge, styles.typeBadgeSalary]}>
              <Text style={[styles.typeBadgeText, styles.typeBadgeTextSalary]}>
                Salary
              </Text>
            </View>
          ) : null}

          {isTransactionRow ? (
            <View
              style={[
                styles.typeBadge,
                isIncome ? styles.typeBadgeIncome : styles.typeBadgeExpense,
              ]}
            >
              <Text
                style={[
                  styles.typeBadgeText,
                  isIncome
                    ? styles.typeBadgeTextIncome
                    : styles.typeBadgeTextExpense,
                ]}
              >
                {isIncome ? "Income" : "Expense"}
              </Text>
            </View>
          ) : null}
        </View>

        {metaLine1 ? (
          <View style={styles.metaRow}>
            <Ionicons name={metaIcon1} size={11} color="#8A94A6" />
            <Text style={styles.transactionMeta} numberOfLines={1}>
              {metaLine1}
            </Text>
          </View>
        ) : null}

        {hasCallablePhone ? (
          <View style={styles.metaRow}>
            <TouchableOpacity
              style={styles.phonePill}
              onPress={(event) => {
                event.stopPropagation();
                callNumber(rawPhone);
              }}
              hitSlop={6}
              activeOpacity={0.7}
            >
              <Ionicons name="call" size={11} color="#2563EB" />
              <Text style={styles.phonePillText}>
                {formatPhoneForDisplay(rawPhone)}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {dateLine ? (
          <View style={styles.metaRow}>
            <Ionicons
              name={
                payment.status === "paid"
                  ? "checkmark-done-outline"
                  : "calendar-outline"
              }
              size={11}
              color="#8A94A6"
            />
            <Text style={styles.transactionMeta} numberOfLines={1}>
              {dateLine}
            </Text>
          </View>
        ) : null}

        {isInactive ? (
          <View style={styles.metaRow}>
            <Ionicons name="alert-circle-outline" size={11} color="#94A3B8" />
            <Text style={styles.transactionMeta} numberOfLines={1}>
              Not counted in totals
            </Text>
          </View>
        ) : null}

        {isTransactionRow ? (
          <TouchableOpacity
            style={styles.viewButton}
            onPress={(event) => {
              event.stopPropagation();
              onShowDetails(payment);
            }}
            activeOpacity={0.75}
            hitSlop={6}
          >
            <Ionicons name="eye-outline" size={12} color="#2563EB" />
            <Text style={styles.viewButtonText}>View</Text>
            {hasAttachments ? (
              <View style={styles.attachmentCountBadge}>
                <Text style={styles.attachmentCountText}>
                  {attachments.length}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.transactionRight}>
        <Text
          style={[
            styles.transactionAmount,
            isInactive && styles.transactionAmountInactive,
            payment.status === "due"
              ? { color: statusColor }
              : isIncome
                ? styles.incomeText
                : styles.expenseText,
          ]}
        >
          {isIncome ? "+" : "-"}₹{payment.amount.toLocaleString("en-IN")}
        </Text>

        <View
          style={[styles.statusBadge, { backgroundColor: `${statusColor}12` }]}
        >
          <Ionicons name={statusIcon} size={11} color={statusColor} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ============================================================
// SUMMARY CARD
// ============================================================

function SummaryCard({
  title,
  amount,
  icon,
  color,
  backgroundColor,
}: {
  title: string;
  amount: number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  backgroundColor: string;
}) {
  return (
    <View style={styles.summaryCard}>
      <View style={[styles.summaryIcon, { backgroundColor }]}>
        <Ionicons name={icon} size={17} color={color} />
      </View>

      <Text style={[styles.summaryAmount, { color }]} numberOfLines={1}>
        ₹{amount.toLocaleString("en-IN")}
      </Text>

      <Text style={styles.summaryTitle}>{title}</Text>
    </View>
  );
}

// ============================================================
// EXPENSE → TRANSACTION MAPPER
// ============================================================

function mapExpenseToTransaction(expense: any): PeopleTransaction {
  const row = expense ?? {};
  const rawCategory: string = String(row.role ?? row.category ?? "").trim();

  const iconCategory: PaymentCategory = (() => {
    const key = rawCategory.toLowerCase();
    if (key === "salary") return "salary";
    if (key === "maintenance") return "maintenance";
    if (key === "electricity") return "electricity";
    if (key === "water") return "water";
    return "other";
  })();

  const expenseDate = toDateOnly(row.dueDate || row.expense_date || "");

  const rawType = String(row.transactionType ?? row.transaction_type ?? "")
    .trim()
    .toLowerCase();
  const transactionType: TransactionType =
    rawType === "income" ? "income" : "expense";

  const attachments = normalizeAttachments(
    row.billAttachments ?? row.bill_attachments,
  );

  const title: string =
    typeof row.name === "string"
      ? row.name
      : typeof row.title === "string"
        ? row.title
        : "";

  const description: string =
    typeof row.description === "string" ? row.description : "";

  return {
    id: `expense-${row.id}`,
    category: iconCategory,
    rawCategory,
    amount: Number(row.amount) || 0,
    status: (row.status === "paid" ? "paid" : "due") as PaymentStatus,
    dueDate: expenseDate,
    description,
    paidDate: null,
    transactionType,
    transaction_type: transactionType,
    title,
    bill_attachments: attachments,
    isTransaction: true,
    __isExpenseRow: true,
    __isInactive: false,
  } as any;
}

// ============================================================
// FINANCE SCREEN
// ============================================================

export default function FinanceScreen() {
  const router = useRouter();

  const {
    selectedAccount,
    accounts,
    isLoading: accountsLoading,
  } = useAccounts();

  const accountId = selectedAccount?.id ?? null;
  const { items: apartmentMembers } = useMembers(accountId);
  const { items: staffMembers } = useStaff(accountId);
  const { items: expenses } = useExpenses(accountId);

  const members: Member[] = useMemo(
    () => [...apartmentMembers, ...staffMembers],
    [apartmentMembers, staffMembers],
  );

  const setAccountSwitcherOpen = useAccountStore(
    (state) => state.setAccountSwitcherOpen,
  );

  const { isAdmin, isMember } = useUserRole();

  const canEditBalance = isAdmin || isMember;
  const canDownloadReport = isAdmin || isMember;

  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");
  const [filteredPayments, setFilteredPayments] = useState<PeopleTransaction[]>(
    [],
  );

  const [summary, setSummary] = useState({
    totalIncome: 0,
    totalExpense: 0,
    net: 0,
  });

  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [showReportOptions, setShowReportOptions] = useState(false);

  // ---- Opening balance (server-persisted) ----
  const [openingBalance, setOpeningBalanceState] = useState(0);
  const [openingBalanceMeta, setOpeningBalanceMeta] = useState<{
    updatedAt: string | null;
    updatedByPhone: string | null;
  }>({
    updatedAt: null,
    updatedByPhone: null,
  });
  const [openingBalanceLoading, setOpeningBalanceLoading] = useState(false);
  const [showOpeningBalanceEditor, setShowOpeningBalanceEditor] =
    useState(false);
  const [openingBalanceInput, setOpeningBalanceInput] = useState("");

  // ---- Carried forward (server-computed) ----
  const [carriedForwardBalance, setCarriedForwardBalance] = useState(0);
  const [carriedForwardLoading, setCarriedForwardLoading] = useState(false);

  const [detailPayment, setDetailPayment] = useState<PeopleTransaction | null>(
    null,
  );

  const openDetails = (payment: PeopleTransaction) => setDetailPayment(payment);
  const closeDetails = () => setDetailPayment(null);

  // ============================================================
  // MONTH HELPERS
  // ============================================================

  const getMonthKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

  const selectedMonthKey = getMonthKey(selectedMonth);

  // ============================================================
  // OPENING BALANCE — FETCH
  // ============================================================

  useEffect(() => {
    if (!selectedAccount?.id) {
      setOpeningBalanceState(0);
      setOpeningBalanceMeta({ updatedAt: null, updatedByPhone: null });
      return;
    }

    let cancelled = false;
    setOpeningBalanceLoading(true);

    (async () => {
      try {
        const data = await openingBalanceRequest<OpeningBalanceResponse>(
          `/${selectedAccount.id}`,
        );
        if (!cancelled) {
          setOpeningBalanceState(Number(data.opening_balance) || 0);
          setOpeningBalanceMeta({
            updatedAt: data.updated_at ?? null,
            updatedByPhone: data.updated_by_phone ?? null,
          });
        }
      } catch (e) {
        if (!cancelled) {
          console.warn("[finance] opening balance fetch failed:", e);
          setOpeningBalanceState(0);
          setOpeningBalanceMeta({ updatedAt: null, updatedByPhone: null });
        }
      } finally {
        if (!cancelled) setOpeningBalanceLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedAccount?.id]);

  // ============================================================
  // CARRIED FORWARD — FETCH
  // ============================================================

  useEffect(() => {
    if (!selectedAccount?.id) {
      setCarriedForwardBalance(0);
      return;
    }

    let cancelled = false;
    setCarriedForwardLoading(true);

    (async () => {
      try {
        const data = await carriedForwardRequest(
          selectedAccount.id,
          selectedMonthKey,
        );
        if (!cancelled) {
          setCarriedForwardBalance(Number(data.carried_forward) || 0);
        }
      } catch (e) {
        if (!cancelled) {
          console.warn("[finance] carried forward fetch failed:", e);
          setCarriedForwardBalance(0);
        }
      } finally {
        if (!cancelled) setCarriedForwardLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    selectedAccount?.id,
    selectedMonthKey,
    openingBalance,
    openingBalanceMeta.updatedAt,
    expenses,
    members,
    summary.net,
    summary.totalIncome,
    summary.totalExpense,
  ]);

  // ============================================================
  // TRANSACTIONS
  // ============================================================

  const getTransactionsForMonth = (monthKey: string): PeopleTransaction[] => {
    const peopleRows: PeopleTransaction[] = [];
    const seenIds = new Set<string>();

    // Every member/staff appears in every month. Whether they count
    // toward the totals is decided by `__isInactive`. The row itself
    // stays visible with an "Inactive" badge from the deletion month
    // onward.
    for (const member of members as any[]) {
      const category: PaymentCategory =
        member?.monthlySalary !== undefined ? "salary" : "maintenance";

      const inactive = isRowInactiveForMonth(member, monthKey);

      const paidHit = findPaidPaymentInMonth(member, monthKey);
      if (paidHit) {
        const isSalary = category === "salary";
        const sourceRow: any = {
          id: `${member.id}:${paidHit.billingMonth}:paid`,
          category,
          memberId: member.id,
          memberName: member.name,
          memberRole: isSalary ? member.role : undefined,
          wing: member.wing,
          flatNumber: member.flatNumber,
          phone: member.phone,
          amount: isSalary
            ? Number(member.monthlySalary) || 0
            : Number(member.maintenanceAmount) || 0,
          status: "paid" as PaymentStatus,
          paidDate: paidHit.paidDate,
          dueDate: paidHit.paidDate,
          transactionType: isSalary ? "expense" : "income",
          transaction_type: isSalary ? "expense" : "income",
          isTransaction: false,
          __isInactive: inactive,
        };

        const entry = member.monthlyPayments?.[paidHit.billingMonth];
        if (entry?.netAmount != null) {
          sourceRow.amount = Number(entry.netAmount);
        } else {
          const base = isSalary
            ? Number(member.monthlySalary) || 0
            : Number(member.maintenanceAmount) || 0;
          const add = Number(entry?.additionalAmount) || 0;
          const ded = Number(entry?.deductionAmount) || 0;
          sourceRow.amount = Math.max(0, base + add - ded);
        }

        if (!seenIds.has(sourceRow.id)) {
          seenIds.add(sourceRow.id);
          peopleRows.push(sourceRow as any);
        }
      }

      if (hasDueInMonth(member, monthKey)) {
        const isSalary = category === "salary";
        const entry = member.monthlyPayments?.[monthKey];
        if (entry?.status === "paid") continue;

        const dueRow: any = {
          id: `${member.id}:${monthKey}:due`,
          category,
          memberId: member.id,
          memberName: member.name,
          memberRole: isSalary ? member.role : undefined,
          wing: member.wing,
          flatNumber: member.flatNumber,
          phone: member.phone,
          amount: isSalary
            ? Number(member.monthlySalary) || 0
            : Number(member.maintenanceAmount) || 0,
          status: "due" as PaymentStatus,
          paidDate: null,
          dueDate: `${monthKey}-01`,
          transactionType: isSalary ? "expense" : "income",
          transaction_type: isSalary ? "expense" : "income",
          isTransaction: false,
          __isInactive: inactive,
        };

        if (entry) {
          const base = isSalary
            ? Number(member.monthlySalary) || 0
            : Number(member.maintenanceAmount) || 0;
          const add = Number(entry.additionalAmount) || 0;
          const ded = Number(entry.deductionAmount) || 0;
          dueRow.amount = Math.max(0, base + add - ded);
        } else if (isSalary && member.attendanceForMonth?.calculatedSalary) {
          dueRow.amount = Number(member.attendanceForMonth.calculatedSalary);
        }

        if (!seenIds.has(dueRow.id)) {
          seenIds.add(dueRow.id);
          peopleRows.push(dueRow as any);
        }
      }
    }

    const expenseRows: PeopleTransaction[] = (expenses || [])
      .filter((expense: any) => {
        const status = expense.status === "paid" ? "paid" : "due";
        const anchorRaw = expense.dueDate || expense.expense_date;
        const anchorMonth = toMonthKey(anchorRaw);
        if (!anchorMonth) return false;
        if (status === "paid") return anchorMonth === monthKey;
        return anchorMonth === monthKey && isDueRelevant(anchorMonth);
      })
      .map((expense: any) => mapExpenseToTransaction(expense));

    return [...peopleRows, ...expenseRows];
  };

  const getSelectedMonthTransactions = () => {
    const monthKey = selectedMonthKey;
    return {
      monthKey,
      transactions: getTransactionsForMonth(monthKey),
    };
  };

  // ============================================================
  // OPENING BALANCE — EDITOR
  // ============================================================

  const openOpeningBalanceEditor = () => {
    if (!canEditBalance) return;
    setOpeningBalanceInput(openingBalance ? openingBalance.toString() : "");
    setShowOpeningBalanceEditor(true);
  };

  const saveOpeningBalance = async () => {
    if (!selectedAccount || !canEditBalance) return;

    try {
      const n = Number(openingBalanceInput) || 0;

      const data = await openingBalanceRequest<OpeningBalanceResponse>(
        `/${selectedAccount.id}`,
        {
          method: "PUT",
          body: JSON.stringify({ openingBalance: n }),
        },
      );

      setOpeningBalanceState(Number(data.opening_balance) || 0);
      setOpeningBalanceMeta({
        updatedAt: data.updated_at ?? new Date().toISOString(),
        updatedByPhone: data.updated_by_phone ?? null,
      });

      setShowOpeningBalanceEditor(false);
    } catch (e: any) {
      console.warn("[finance] opening balance save failed:", e);
      Alert.alert(
        "Save failed",
        e?.message || "Could not save the opening balance.",
      );
    }
  };

  // ============================================================
  // LOAD FINANCE
  // ============================================================

  useEffect(() => {
    if (selectedAccount) {
      loadFinanceData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount, members, expenses, filter, selectedMonth]);

  const loadFinanceData = () => {
    const { transactions: accountPayments } = getSelectedMonthTransactions();

    // Totals: only paid + non-inactive rows count.
    const counted = accountPayments.filter((p) => !(p as any).__isInactive);
    const paidTransactions = counted.filter((p) => p.status === "paid");

    const paidIncome = paidTransactions
      .filter((p) => getTransactionType(p) === "income")
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    const paidExpense = paidTransactions
      .filter((p) => getTransactionType(p) === "expense")
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    const paidNet = paidIncome - paidExpense;

    setSummary((currentSummary) =>
      currentSummary.totalIncome === paidIncome &&
      currentSummary.totalExpense === paidExpense &&
      currentSummary.net === paidNet
        ? currentSummary
        : {
            totalIncome: paidIncome,
            totalExpense: paidExpense,
            net: paidNet,
          },
    );

    // ── List filters ──
    // Inactive rows stay visible in every filter so the user can see
    // why the totals changed. The "Inactive" badge, dimmed style, and
    // strikethrough amount make it clear they aren't counted.
    let filtered: PeopleTransaction[] = [];

    switch (filter) {
      case "all":
        filtered = accountPayments;
        break;
      case "income":
        filtered = accountPayments.filter(
          (p) => p.status === "paid" && getTransactionType(p) === "income",
        );
        break;
      case "expense":
        filtered = accountPayments.filter(
          (p) => p.status === "paid" && getTransactionType(p) === "expense",
        );
        break;
      case "pending":
        filtered = accountPayments.filter(
          (p) => p.status === "due" || p.status === "overdue",
        );
        break;
      default:
        filtered = accountPayments;
    }

    setFilteredPayments((currentPayments) =>
      currentPayments.length === filtered.length &&
      currentPayments.every(
        (payment, index) => payment.id === filtered[index].id,
      )
        ? currentPayments
        : filtered,
    );
  };

  // ============================================================
  // REFRESH
  // ============================================================

  const onRefresh = async () => {
    setRefreshing(true);
    if (selectedAccount?.id) {
      try {
        const [obData, cfData] = await Promise.all([
          openingBalanceRequest<OpeningBalanceResponse>(
            `/${selectedAccount.id}`,
          ),
          carriedForwardRequest(selectedAccount.id, selectedMonthKey),
        ]);
        setOpeningBalanceState(Number(obData.opening_balance) || 0);
        setOpeningBalanceMeta({
          updatedAt: obData.updated_at ?? null,
          updatedByPhone: obData.updated_by_phone ?? null,
        });
        setCarriedForwardBalance(Number(cfData.carried_forward) || 0);
      } catch (e) {
        console.warn("[finance] refresh failed:", e);
      }
    }
    loadFinanceData();
    setRefreshing(false);
  };

  // ============================================================
  // MONTH
  // ============================================================

  const handleMonthChange = (direction: "prev" | "next") => {
    const newDate = new Date(selectedMonth);
    if (direction === "prev") newDate.setMonth(newDate.getMonth() - 1);
    else newDate.setMonth(newDate.getMonth() + 1);
    setSelectedMonth(newDate);
  };

  // ============================================================
  // REPORT DATA
  // ============================================================

  const getReportData = () => {
    const { monthKey, transactions } = getSelectedMonthTransactions();
    // Summary numbers exclude inactive rows (same rule as the on-screen
    // totals). The raw transactions array keeps them so a reader of the
    // PDF/Excel can see the inactive entries with their "Inactive" tag.
    const counted = transactions.filter((t) => !(t as any).__isInactive);
    const reportSummary = getPeopleSummary(counted);
    return { monthKey, reportSummary, transactions };
  };

  // ============================================================
  // EXCEL
  // ============================================================

  const handleDownloadExcel = async () => {
    if (!canDownloadReport) return;

    const { monthKey, reportSummary, transactions } = getReportData();

    const maintenance = transactions.filter(
      (transaction) => transaction.category === "maintenance",
    );

    const staff = transactions.filter(
      (transaction) => transaction.category === "salary",
    );

    const otherExpenses = transactions.filter(
      (transaction) =>
        transaction.category !== "maintenance" &&
        transaction.category !== "salary",
    );

    const workbook = XLSX.utils.book_new();

    const worksheet = XLSX.utils.aoa_to_sheet([
      ["AI Khata Finance Report"],
      ["Property", selectedAccount?.name || ""],
      ["Billing month", monthKey],
      [],
      ["Income", reportSummary.income],
      ["Expenses", reportSummary.expenses],
      ["Net", reportSummary.net],
      [],
      ["Maintenance"],
      [
        "Wing",
        "Flat Number",
        "Owner Name",
        "Phone",
        "Amount",
        "Status",
        "Date",
        "Membership",
      ],
      ...maintenance.map((transaction) => [
        (transaction as any).wing || "",
        (transaction as any).flatNumber || "",
        (transaction as any).memberName || "",
        (transaction as any).phone || "",
        transaction.amount,
        transaction.status.charAt(0).toUpperCase() +
          transaction.status.slice(1),
        transaction.status === "paid"
          ? (transaction as any).paidDate || transaction.dueDate
          : transaction.dueDate,
        (transaction as any).__isInactive ? "Inactive" : "Active",
      ]),
      [],
      ["Staff"],
      [
        "Staff Name",
        "Phone",
        "Role",
        "Paid Amount",
        "Status",
        "Date",
        "Membership",
      ],
      ...staff.map((transaction) => [
        (transaction as any).memberName || transaction.description || "",
        (transaction as any).phone || "",
        (transaction as any).memberRole
          ? (transaction as any).memberRole.charAt(0).toUpperCase() +
            (transaction as any).memberRole.slice(1)
          : "Staff",
        transaction.amount,
        transaction.status.charAt(0).toUpperCase() +
          transaction.status.slice(1),
        transaction.status === "paid"
          ? (transaction as any).paidDate || transaction.dueDate
          : transaction.dueDate,
        (transaction as any).__isInactive ? "Inactive" : "Active",
      ]),
      [],
      ["Transactions"],
      ["Title", "Category", "Type", "Description", "Amount", "Date", "Status"],
      ...otherExpenses.map((transaction) => [
        (transaction as any).title || "",
        getCategoryLabel((transaction as any).rawCategory),
        getTransactionType(transaction) === "income" ? "Income" : "Expense",
        (transaction as any).description || "",
        transaction.amount,
        transaction.dueDate,
        transaction.status.charAt(0).toUpperCase() +
          transaction.status.slice(1),
      ]),
    ]);

    worksheet["!cols"] = [
      { wch: 20 },
      { wch: 16 },
      { wch: 12 },
      { wch: 30 },
      { wch: 14 },
      { wch: 14 },
      { wch: 12 },
      { wch: 12 },
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, "Finance Report");

    const data = XLSX.write(workbook, { bookType: "xlsx", type: "array" });

    const base64 = (() => {
      const bytes = new Uint8Array(data as ArrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    })();

    const dataUri = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`;

    try {
      await saveFileWithFolderPicker(
        dataUri,
        `ai-khata-finance-${monthKey}`,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      Alert.alert("Downloaded", "Excel report saved successfully.");
    } catch (e: any) {
      Alert.alert(
        "Report unavailable",
        e?.message || "Unable to save the Excel report. Please try again.",
      );
    }
  };

  // ============================================================
  // PDF
  // ============================================================

  const handleDownloadPdf = async () => {
    if (!canDownloadReport) return;

    const { monthKey, reportSummary, transactions } = getReportData();

    try {
      await downloadFinanceReportPdf({
        propertyName: selectedAccount?.name || "Property",
        month: monthKey,
        income: reportSummary.income,
        expenses: reportSummary.expenses,
        net: reportSummary.net,
        transactions,
      });
      setShowReportOptions(false);
    } catch {
      Alert.alert(
        "Report unavailable",
        "Unable to generate the PDF report. Please try again.",
      );
    }
  };

  // ============================================================
  // LOADING / NO ACCOUNT
  // ============================================================

  if (accountsLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <View style={styles.loadingIcon}>
            <Ionicons name="wallet-outline" size={28} color="#2563EB" />
          </View>
          <ActivityIndicator size="small" color="#2563EB" />
          <Text style={styles.loadingText}>Loading finances...</Text>
        </View>
      </View>
    );
  }

  if (!selectedAccount) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="wallet-outline" size={38} color="#2563EB" />
          </View>
          <Text style={styles.emptyTitle}>No Property Selected</Text>
          <Text style={styles.emptySubtitle}>
            {accounts.length > 0
              ? "Select a property to view its financial overview."
              : "Create a property to start managing finances."}
          </Text>
          <TouchableOpacity
            style={styles.selectButton}
            onPress={() => {
              if (accounts.length > 0) {
                setAccountSwitcherOpen(true);
              } else {
                router.push({
                  pathname: "/(modals)/add-account",
                  params: { mode: "create" },
                });
              }
            }}
          >
            <Ionicons
              name={accounts.length > 0 ? "business-outline" : "add"}
              size={18}
              color="#fff"
            />
            <Text style={styles.selectButtonText}>
              {accounts.length > 0 ? "Select Property" : "Create Property"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ============================================================
  // MAIN UI
  // ============================================================

  const hasBeenEdited = Boolean(openingBalanceMeta.updatedAt);

  const netBalance = carriedForwardBalance + summary.net;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#2563EB"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerEyebrow}>FINANCE</Text>
            <Text style={styles.headerTitle}>Money Overview</Text>
            <View style={styles.propertyRow}>
              <Ionicons name="business-outline" size={13} color="#64748B" />
              <Text style={styles.propertyName} numberOfLines={1}>
                {selectedAccount.name}
              </Text>
            </View>
          </View>
          <View style={styles.headerIcon}>
            <Ionicons name="wallet" size={21} color="#2563EB" />
          </View>
        </View>

        <View style={styles.balanceHero}>
          <View style={styles.heroCircleOne} />
          <View style={styles.heroCircleTwo} />

          <View style={styles.heroTopRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.heroSmallLabel}>
                Start With Opening Balance
              </Text>

              <Text
                style={[
                  styles.heroAmount,
                  openingBalance < 0 && styles.heroNegative,
                ]}
              >
                ₹{openingBalance.toLocaleString("en-IN")}
              </Text>

              {hasBeenEdited ? (
                <View style={styles.heroMetaBlock}>
                  {openingBalanceMeta.updatedByPhone ? (
                    <TouchableOpacity
                      style={styles.heroPhonePill}
                      onPress={() =>
                        callNumber(openingBalanceMeta.updatedByPhone)
                      }
                      hitSlop={6}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="call" size={11} color="#fff" />
                      <Text style={styles.heroPhonePillText}>
                        {formatPhoneForDisplay(
                          openingBalanceMeta.updatedByPhone,
                        )}
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  {openingBalanceMeta.updatedAt ? (
                    <Text style={styles.heroMetaText} numberOfLines={1}>
                      Edited on {formatEditedAt(openingBalanceMeta.updatedAt)}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>

            {canEditBalance && (
              <TouchableOpacity
                style={styles.heroEditButton}
                onPress={openOpeningBalanceEditor}
                disabled={openingBalanceLoading}
              >
                <Ionicons name="create-outline" size={16} color="#fff" />
                <Text style={styles.heroEditText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.heroDivider} />

          <View style={styles.heroBottomRow}>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>Carried Forward</Text>
              {carriedForwardLoading ? (
                <ActivityIndicator
                  size="small"
                  color="#fff"
                  style={{ alignSelf: "flex-start", marginTop: 4 }}
                />
              ) : (
                <Text style={styles.heroMetricValue}>
                  ₹{carriedForwardBalance.toLocaleString("en-IN")}
                </Text>
              )}
            </View>

            <View style={styles.heroMetricDivider} />

            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>This Month</Text>
              <Text
                style={[
                  styles.heroMetricValue,
                  summary.net < 0 && styles.heroNegativeSmall,
                ]}
              >
                {summary.net >= 0 ? "+" : "-"}₹
                {Math.abs(summary.net).toLocaleString("en-IN")}
              </Text>
            </View>

            <View style={styles.heroMetricDivider} />

            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>Net Balance</Text>
              <Text
                style={[
                  styles.heroMetricValue,
                  netBalance < 0 && styles.heroNegativeSmall,
                ]}
                numberOfLines={1}
              >
                {netBalance < 0 ? "-" : ""}₹
                {Math.abs(netBalance).toLocaleString("en-IN")}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.monthCard}>
          <View style={styles.monthLeft}>
            <View style={styles.calendarIcon}>
              <Ionicons name="calendar-outline" size={18} color="#2563EB" />
            </View>
            <View>
              <Text style={styles.monthCaption}>BILLING MONTH</Text>
              <Text style={styles.monthText}>
                {selectedMonth.toLocaleString("default", {
                  month: "long",
                  year: "numeric",
                })}
              </Text>
            </View>
          </View>

          <View style={styles.monthActions}>
            <TouchableOpacity
              onPress={() => handleMonthChange("prev")}
              style={styles.monthArrow}
            >
              <Ionicons name="chevron-back" size={19} color="#334155" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleMonthChange("next")}
              style={styles.monthArrow}
            >
              <Ionicons name="chevron-forward" size={19} color="#334155" />
            </TouchableOpacity>

            {canDownloadReport && (
              <TouchableOpacity
                style={styles.reportButton}
                onPress={() => setShowReportOptions(true)}
              >
                <Ionicons name="document-text-outline" size={16} color="#fff" />
                <Text style={styles.reportButtonText}>Report</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.sectionLabelRow}>
          <Text style={styles.sectionLabel}>Monthly Summary</Text>
          <Text style={styles.sectionLabelHint}>Paid only</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.summaryScrollContent}
          style={styles.summaryScroll}
        >
          <View style={styles.summaryCardWrapper}>
            <SummaryCard
              title="Income"
              amount={summary.totalIncome}
              icon="arrow-down"
              color="#16A34A"
              backgroundColor="#ECFDF3"
            />
          </View>
          <View style={styles.summaryCardWrapper}>
            <SummaryCard
              title="Expenses"
              amount={summary.totalExpense}
              icon="arrow-up"
              color="#DC2626"
              backgroundColor="#FEF2F2"
            />
          </View>
        </ScrollView>

        <View style={styles.filterHeader}>
          <Text style={styles.sectionLabel}>Transactions</Text>
          <Text style={styles.transactionCountTop}>
            {filteredPayments.length} records
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContainer}
        >
          {(
            [
              { type: "all", label: "All", icon: "apps-outline" },
              {
                type: "income",
                label: "Income",
                icon: "trending-up-outline",
              },
              {
                type: "expense",
                label: "Expense",
                icon: "trending-down-outline",
              },
              { type: "pending", label: "Due", icon: "time-outline" },
            ] as {
              type: FilterType;
              label: string;
              icon: keyof typeof Ionicons.glyphMap;
            }[]
          ).map((item) => {
            const active = filter === item.type;
            return (
              <TouchableOpacity
                key={item.type}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilter(item.type)}
              >
                <Ionicons
                  name={item.icon}
                  size={14}
                  color={active ? "#fff" : "#64748B"}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    active && styles.filterChipTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.transactionsSection}>
          {filteredPayments.length === 0 ? (
            <View style={styles.emptyTransactions}>
              <View style={styles.emptyTransactionIcon}>
                <Ionicons name="receipt-outline" size={28} color="#94A3B8" />
              </View>
              <Text style={styles.emptyTransactionTitle}>No transactions</Text>
              <Text style={styles.emptyText}>
                No transactions match this filter for the selected month.
              </Text>
            </View>
          ) : (
            filteredPayments.map((payment) => (
              <TransactionItem
                key={payment.id}
                payment={payment}
                onShowDetails={openDetails}
              />
            ))
          )}
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>

      {detailPayment ? (
        <TransactionDetailModal
          visible={Boolean(detailPayment)}
          onClose={closeDetails}
          title={
            (detailPayment as any).title ||
            (detailPayment as any).name ||
            getCategoryLabel((detailPayment as any).rawCategory)
          }
          description={(detailPayment as any).description || ""}
          attachments={normalizeAttachments(
            (detailPayment as any).bill_attachments,
          )}
        />
      ) : null}

      {canDownloadReport && (
        <Modal
          transparent
          animationType="slide"
          visible={showReportOptions}
          onRequestClose={() => setShowReportOptions(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.bottomSheet}>
              <View style={styles.sheetHandle} />

              <View style={styles.sheetHeader}>
                <View>
                  <Text style={styles.sheetTitle}>Download Report</Text>
                  <Text style={styles.sheetSubtitle}>
                    Choose a format for{" "}
                    {selectedMonth.toLocaleString("default", {
                      month: "long",
                      year: "numeric",
                    })}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.sheetCloseButton}
                  onPress={() => setShowReportOptions(false)}
                >
                  <Ionicons name="close" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.reportOption}
                onPress={() => {
                  setShowReportOptions(false);
                  handleDownloadExcel();
                }}
              >
                <View
                  style={[
                    styles.reportOptionIcon,
                    { backgroundColor: "#ECFDF3" },
                  ]}
                >
                  <Ionicons name="grid-outline" size={22} color="#16A34A" />
                </View>
                <View style={styles.reportOptionInfo}>
                  <Text style={styles.reportOptionTitle}>Excel Report</Text>
                  <Text style={styles.reportOptionSubtitle}>
                    Detailed spreadsheet with transactions
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={19} color="#94A3B8" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.reportOption}
                onPress={handleDownloadPdf}
              >
                <View
                  style={[
                    styles.reportOptionIcon,
                    { backgroundColor: "#FEF2F2" },
                  ]}
                >
                  <Ionicons
                    name="document-text-outline"
                    size={22}
                    color="#DC2626"
                  />
                </View>
                <View style={styles.reportOptionInfo}>
                  <Text style={styles.reportOptionTitle}>PDF Report</Text>
                  <Text style={styles.reportOptionSubtitle}>
                    Share a clean financial summary
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={19} color="#94A3B8" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowReportOptions(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {canEditBalance && (
        <Modal
          transparent
          animationType="slide"
          visible={showOpeningBalanceEditor}
          onRequestClose={() => setShowOpeningBalanceEditor(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.bottomSheet}>
              <View style={styles.sheetHandle} />

              <View style={styles.sheetHeader}>
                <View>
                  <Text style={styles.sheetTitle}>Opening Balance</Text>
                  <Text style={styles.sheetSubtitle}>
                    Set the starting balance for this property.
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.sheetCloseButton}
                  onPress={() => setShowOpeningBalanceEditor(false)}
                >
                  <Ionicons name="close" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Starting balance</Text>

              <View style={styles.amountInputContainer}>
                <Text style={styles.currencySymbol}>₹</Text>
                <TextInput
                  autoFocus
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#94A3B8"
                  style={styles.openingBalanceInput}
                  value={openingBalanceInput}
                  onChangeText={(value) =>
                    setOpeningBalanceInput(value.replace(/[^0-9]/g, ""))
                  }
                />
              </View>

              {hasBeenEdited ? (
                <View style={styles.editedInfoRow}>
                  <Ionicons name="call-outline" size={14} color="#64748B" />
                  <Text style={styles.editedInfoText}>
                    Last edited
                    {openingBalanceMeta.updatedByPhone
                      ? ` by ${formatPhoneForDisplay(
                          openingBalanceMeta.updatedByPhone,
                        )}`
                      : ""}
                    {openingBalanceMeta.updatedAt
                      ? ` on ${formatEditedAt(openingBalanceMeta.updatedAt)}`
                      : ""}
                  </Text>
                </View>
              ) : (
                <Text style={styles.inputHint}>
                  This balance will be carried forward to future months
                  automatically.
                </Text>
              )}

              <View style={styles.openingBalanceActions}>
                <TouchableOpacity
                  style={styles.cancelOutlineButton}
                  onPress={() => setShowOpeningBalanceEditor(false)}
                >
                  <Text style={styles.cancelOutlineText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.saveOpeningBalanceButton}
                  onPress={saveOpeningBalance}
                >
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={styles.saveOpeningBalanceText}>
                    Save Balance
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FB" },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 30,
  },

  bottomPadding: { height: 30 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },

  headerTextContainer: { flex: 1 },

  headerEyebrow: {
    color: "#2563EB",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 3,
  },

  headerTitle: {
    color: "#111827",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.5,
  },

  propertyRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
  },

  propertyName: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "500",
    marginLeft: 5,
    maxWidth: 230,
  },

  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },

  balanceHero: {
    backgroundColor: "#2563EB",
    borderRadius: 24,
    padding: 20,
    marginBottom: 14,
    overflow: "hidden",
  },

  heroCircleOne: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    right: -85,
    top: -90,
    backgroundColor: "rgba(255,255,255,0.07)",
  },

  heroCircleTwo: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    left: -70,
    bottom: -65,
    backgroundColor: "rgba(255,255,255,0.05)",
  },

  heroTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },

  heroSmallLabel: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },

  heroAmount: {
    color: "#fff",
    fontSize: 31,
    fontWeight: "800",
    marginTop: 5,
    letterSpacing: -0.8,
  },

  heroNegative: { color: "#FECACA" },

  heroMetaBlock: {
    marginTop: 8,
    gap: 5,
  },

  heroPhonePill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },

  heroPhonePillText: {
    color: "#fff",
    fontSize: 10.5,
    fontWeight: "700",
  },

  heroMetaText: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 10.5,
    fontWeight: "600",
  },

  heroEditButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginLeft: 10,
  },

  heroEditText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 5,
  },

  heroDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.16)",
    marginVertical: 17,
  },

  heroBottomRow: { flexDirection: "row", alignItems: "center" },

  heroMetric: { flex: 1 },

  heroMetricDivider: {
    width: 1,
    height: 30,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginHorizontal: 12,
  },

  heroMetricLabel: {
    color: "rgba(255,255,255,0.66)",
    fontSize: 9.5,
    fontWeight: "500",
  },

  heroMetricValue: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3,
  },

  heroNegativeSmall: { color: "#FECACA" },

  monthCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 12,
    marginBottom: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#E8EDF5",
  },

  monthLeft: { flexDirection: "row", alignItems: "center", flex: 1 },

  calendarIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  monthCaption: {
    color: "#94A3B8",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
  },

  monthText: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 2,
  },

  monthActions: { flexDirection: "row", alignItems: "center" },

  monthArrow: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 5,
  },

  reportButton: {
    height: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
    borderRadius: 10,
    paddingHorizontal: 11,
    marginLeft: 7,
  },

  reportButtonText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 5,
  },

  sectionLabelRow: {
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  sectionLabel: { color: "#111827", fontSize: 16, fontWeight: "800" },

  sectionLabelHint: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  summaryScroll: {
    marginBottom: 22,
    marginHorizontal: -16,
  },

  summaryScrollContent: {
    paddingHorizontal: 16,
    gap: 10,
  },

  summaryCardWrapper: {
    width: 150,
  },

  summaryCard: {
    backgroundColor: "#fff",
    borderRadius: 17,
    padding: 13,
    minHeight: 105,
    borderWidth: 1,
    borderColor: "#E8EDF5",
  },

  summaryIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 9,
  },

  summaryAmount: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.3,
  },

  summaryTitle: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "600",
    marginTop: 3,
  },

  filterHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  transactionCountTop: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "600",
  },

  filterContainer: { paddingRight: 8, marginBottom: 14 },

  filterChip: {
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginRight: 8,
  },

  filterChipActive: { backgroundColor: "#2563EB", borderColor: "#2563EB" },

  filterChipText: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 5,
  },

  filterChipTextActive: { color: "#fff" },

  transactionsSection: { marginBottom: 20 },

  transactionItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#fff",
    borderRadius: 17,
    padding: 13,
    marginBottom: 9,
    borderWidth: 1,
    borderColor: "#E8EDF5",
  },

  transactionItemInactive: {
    backgroundColor: "#FAFBFC",
    borderColor: "#EDF0F5",
    opacity: 0.85,
  },

  transactionIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  transactionInfo: { flex: 1, minWidth: 0 },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },

  transactionTitle: {
    flexShrink: 1,
    color: "#111827",
    fontSize: 13,
    fontWeight: "700",
  },

  transactionTitleInactive: {
    color: "#64748B",
  },

  typeBadge: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    flexShrink: 0,
  },

  typeBadgeSalary: { backgroundColor: "#F5F3FF" },
  typeBadgeMaintenance: { backgroundColor: "#EFF6FF" },
  typeBadgeIncome: { backgroundColor: "#F0FDF4" },
  typeBadgeExpense: { backgroundColor: "#FEF2F2" },
  typeBadgeInactive: { backgroundColor: "#F1F5F9" },

  typeBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  typeBadgeTextSalary: { color: "#7C3AED" },
  typeBadgeTextMaintenance: { color: "#2563EB" },
  typeBadgeTextIncome: { color: "#16A34A" },
  typeBadgeTextExpense: { color: "#DC2626" },
  typeBadgeTextInactive: { color: "#64748B" },

  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },

  transactionMeta: { color: "#94A3B8", fontSize: 9, marginLeft: 4 },

  phonePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
    alignSelf: "flex-start",
  },

  phonePillText: {
    color: "#2563EB",
    fontSize: 10,
    fontWeight: "700",
  },

  viewButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
    alignSelf: "flex-start",
    marginTop: 5,
  },

  viewButtonText: {
    color: "#2563EB",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  attachmentCountBadge: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: "#7C3AED",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
  },

  attachmentCountText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
  },

  transactionRight: { alignItems: "flex-end", marginLeft: 8 },

  transactionAmount: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: -0.2,
  },

  transactionAmountInactive: {
    textDecorationLine: "line-through",
  },

  incomeText: { color: "#16A34A" },

  expenseText: { color: "#DC2626" },

  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginTop: 5,
  },

  statusText: { fontSize: 8, fontWeight: "800", marginLeft: 3 },

  emptyTransactions: {
    backgroundColor: "#fff",
    borderRadius: 18,
    paddingHorizontal: 25,
    paddingVertical: 38,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E8EDF5",
  },

  emptyTransactionIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  emptyTransactionTitle: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "800",
  },

  emptyText: {
    color: "#94A3B8",
    fontSize: 11,
    textAlign: "center",
    lineHeight: 17,
    marginTop: 5,
  },

  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },

  loadingIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },

  loadingText: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 9,
  },

  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },

  emptyIcon: {
    width: 82,
    height: 82,
    borderRadius: 28,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },

  emptyTitle: {
    color: "#111827",
    fontSize: 21,
    fontWeight: "800",
    textAlign: "center",
  },

  emptySubtitle: {
    color: "#64748B",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 24,
  },

  selectButton: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
    borderRadius: 14,
    paddingHorizontal: 22,
  },

  selectButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    marginLeft: 7,
  },

  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15,23,42,0.45)",
  },

  modalOverlayCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.45)",
    paddingHorizontal: 20,
  },

  detailModal: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "82%",
    backgroundColor: "#fff",
    borderRadius: 20,
    overflow: "hidden",
  },

  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },

  detailIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  detailTitle: {
    flex: 1,
    color: "#111827",
    fontSize: 14,
    fontWeight: "800",
  },

  detailClose: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },

  detailScroll: { maxHeight: 480 },

  detailScrollContent: { padding: 16 },

  detailSectionLabel: {
    marginBottom: 8,
    color: "#334155",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },

  detailDescriptionBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E8EDF5",
  },

  detailDescriptionText: {
    color: "#334155",
    fontSize: 12.5,
    lineHeight: 19,
  },

  detailEmptyAttachment: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
  },

  detailEmptyAttachmentText: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "600",
  },

  attachmentRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E8EDF5",
  },

  attachmentIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F5F3FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  attachmentInfo: { flex: 1, minWidth: 0 },

  attachmentName: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "700",
  },

  attachmentUrl: {
    color: "#94A3B8",
    fontSize: 10,
    marginTop: 2,
  },

  attachmentDownload: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#7C3AED",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },

  bottomSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
  },

  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 10,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginBottom: 20,
  },

  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },

  sheetTitle: { color: "#111827", fontSize: 20, fontWeight: "800" },

  sheetSubtitle: {
    color: "#64748B",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
    maxWidth: 280,
  },

  sheetCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },

  reportOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    padding: 13,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E8EDF5",
  },

  reportOptionIcon: {
    width: 45,
    height: 45,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },

  reportOptionInfo: { flex: 1, marginLeft: 12 },

  reportOptionTitle: { color: "#111827", fontSize: 13, fontWeight: "800" },

  reportOptionSubtitle: { color: "#64748B", fontSize: 10, marginTop: 3 },

  cancelButton: {
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#F1F5F9",
    marginTop: 6,
  },

  cancelButtonText: { color: "#475569", fontSize: 13, fontWeight: "700" },

  inputLabel: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
  },

  amountInputContainer: {
    height: 55,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 14,
    paddingHorizontal: 14,
  },

  currencySymbol: {
    color: "#2563EB",
    fontSize: 20,
    fontWeight: "800",
    marginRight: 8,
  },

  openingBalanceInput: {
    flex: 1,
    height: 52,
    color: "#111827",
    fontSize: 20,
    fontWeight: "700",
    padding: 0,
  },

  inputHint: {
    color: "#94A3B8",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 8,
    marginBottom: 20,
  },

  editedInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 10,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#E8EDF5",
  },

  editedInfoText: {
    flex: 1,
    color: "#475569",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "500",
  },

  openingBalanceActions: { flexDirection: "row", alignItems: "center" },

  cancelOutlineButton: {
    flex: 1,
    height: 48,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },

  cancelOutlineText: { color: "#475569", fontSize: 13, fontWeight: "700" },

  saveOpeningBalanceButton: {
    flex: 1.35,
    height: 48,
    borderRadius: 13,
    backgroundColor: "#2563EB",
    marginLeft: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },

  saveOpeningBalanceText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
    marginLeft: 6,
  },
});
