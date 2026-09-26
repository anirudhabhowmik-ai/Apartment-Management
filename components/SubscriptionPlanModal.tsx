// components/SubscriptionPlanModal.tsx
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export type BillingPeriod = "monthly" | "yearly";

export interface SubscriptionPlan {
  id: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
  popular?: boolean;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  yearlyDiscountPercent: number;
}

export const DEFAULT_PLANS: SubscriptionPlan[] = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    yearlyPrice: 0,
    features: [
      "Up to 10 properties",
      "1 Admin",
      "1 Staff role",
      "Basic support",
    ],
    color: "#64748B",
    icon: "people-outline",
    yearlyDiscountPercent: 0,
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 199,
    yearlyPrice: 1990,
    features: [
      "Up to 30 properties",
      "2 Admins",
      "2 Staff roles",
      "History access",
      "Priority support",
    ],
    popular: true,
    color: "#2563EB",
    icon: "star-outline",
    yearlyDiscountPercent: 17,
  },
  {
    id: "business",
    name: "Business",
    monthlyPrice: 999,
    yearlyPrice: 8990,
    features: [
      "Unlimited properties",
      "Unlimited Admins",
      "Unlimited Staff roles",
      "Full feature access",
      "Advanced bill generation",
      "History access",
      "Advanced analytics",
      "Priority support",
    ],
    color: "#7C3AED",
    icon: "business-outline",
    yearlyDiscountPercent: 25,
  },
];

interface SubscriptionPlanModalProps {
  visible: boolean;
  onClose: () => void;
  activePlanId: string;
  activePlanPeriod?: BillingPeriod;

  onPlanChanged: (payload: {
    plan: SubscriptionPlan;
    period: BillingPeriod;
    isUpgrade: boolean;
    isDowngrade: boolean;
    amount: number;
    paymentId?: string;
    signature?: string;
    orderId?: string;
  }) => void;

  onCancelSubscription?: () => void;
  canManage?: boolean;
  plans?: SubscriptionPlan[];

  user?: {
    name?: string;
    phone?: string;
  };

  startPayment: (
    amount: number,
    label: string,
    user?: {
      name?: string;
      phone?: string;
    },
    planId?: string,
    billingPeriod?: BillingPeriod,
  ) => Promise<{
    success: boolean;
    paymentId?: string;
    error?: string;
    signature?: string;
    orderId?: string;
  }>;
}

export default function SubscriptionPlanModal({
  visible,
  onClose,
  activePlanId,
  activePlanPeriod = "monthly",
  onPlanChanged,
  onCancelSubscription,
  canManage = true,
  plans = DEFAULT_PLANS,
  user,
  startPayment,
}: SubscriptionPlanModalProps) {
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [isPaymentProcessing, setIsPaymentProcessing] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  useEffect(() => {
    if (visible) {
      setBillingPeriod(activePlanPeriod);
      setShowCancelConfirm(false);
    }
  }, [visible, activePlanPeriod]);

  const getPlanPrice = (plan: SubscriptionPlan, period: BillingPeriod) => {
    return period === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
  };

  const getPlanPeriodLabel = (
    plan: SubscriptionPlan,
    period: BillingPeriod,
  ) => {
    if (plan.monthlyPrice === 0) {
      return "";
    }
    return period === "yearly" ? "/year" : "/month";
  };

  const handleSelectPlan = async (planId: string) => {
    if (!canManage || isPaymentProcessing) {
      return;
    }

    const selectedPlan = plans.find((p) => p.id === planId);

    if (!selectedPlan) {
      return;
    }

    // Tapping the active plan card with the same period does nothing.
    if (activePlanId === planId && activePlanPeriod === billingPeriod) {
      onClose();
      return;
    }

    const price = getPlanPrice(selectedPlan, billingPeriod);

    const samePlanDifferentPeriod =
      activePlanId === planId && activePlanPeriod !== billingPeriod;

    const currentIndex = plans.findIndex((p) => p.id === activePlanId);
    const newIndex = plans.findIndex((p) => p.id === selectedPlan.id);

    const isUpgrade = !samePlanDifferentPeriod && newIndex > currentIndex;
    const isDowngrade = !samePlanDifferentPeriod && newIndex < currentIndex;

    if (price === 0) {
      onPlanChanged({
        plan: selectedPlan,
        period: billingPeriod,
        isUpgrade,
        isDowngrade,
        amount: 0,
      });

      onClose();
      return;
    }

    onClose();
    setIsPaymentProcessing(true);

    try {
      const planLabel = `${selectedPlan.name} (${billingPeriod})`;

      const result = await startPayment(
        price,
        planLabel,
        {
          name: user?.name,
          phone: user?.phone,
        },
        selectedPlan.id,
        billingPeriod,
      );

      if (result.success) {
        onPlanChanged({
          plan: selectedPlan,
          period: billingPeriod,
          isUpgrade,
          isDowngrade,
          amount: price,
          paymentId: result.paymentId,
          signature: result.signature,
          orderId: result.orderId,
        });
      } else {
        Alert.alert(
          "Payment Failed",
          result.error || "Payment was not completed. Please try again.",
          [{ text: "OK" }],
        );
      }
    } catch (error) {
      console.error("Subscription payment error:", error);

      Alert.alert(
        "Payment Error",
        "Something went wrong while processing the payment.",
        [{ text: "OK" }],
      );
    } finally {
      setIsPaymentProcessing(false);
    }
  };

  const handleConfirmCancel = () => {
    setShowCancelConfirm(false);
    if (onCancelSubscription) {
      onCancelSubscription();
    }
  };

  const currentPlan = plans.find((p) => p.id === activePlanId);
  const currentPlanName = currentPlan?.name ?? "Free";

  return (
    <>
      {/* ---------------- Main plans modal ---------------- */}
      <Modal
        transparent
        animationType="slide"
        visible={visible}
        onRequestClose={onClose}
      >
        <View style={styles.plansModalOverlay}>
          <View style={styles.plansModalContainer}>
            {/* Header */}
            <View style={styles.plansModalHeader}>
              <View style={styles.headerTextContainer}>
                <Text style={styles.plansModalTitle}>Choose Your Plan</Text>

                <Text style={styles.modalSubtitle}>
                  {activePlanId !== "free"
                    ? `Current plan: ${currentPlanName} (${activePlanPeriod})`
                    : "Choose the plan that fits your community"}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.plansModalCloseButton}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={22} color="#475569" />
              </TouchableOpacity>
            </View>

            {/* Monthly / Yearly toggle */}
            <View style={styles.billingToggleContainer}>
              <TouchableOpacity
                style={[
                  styles.billingToggleButton,
                  billingPeriod === "monthly"
                    ? styles.billingToggleButtonActive
                    : null,
                ]}
                onPress={() => setBillingPeriod("monthly")}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="calendar-outline"
                  size={15}
                  color={billingPeriod === "monthly" ? "#2563EB" : "#64748B"}
                />

                <Text
                  style={[
                    styles.billingToggleText,
                    billingPeriod === "monthly"
                      ? styles.billingToggleTextActive
                      : null,
                  ]}
                >
                  Monthly
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.billingToggleButton,
                  billingPeriod === "yearly"
                    ? styles.billingToggleButtonActive
                    : null,
                ]}
                onPress={() => setBillingPeriod("yearly")}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="calendar"
                  size={15}
                  color={billingPeriod === "yearly" ? "#2563EB" : "#64748B"}
                />

                <Text
                  style={[
                    styles.billingToggleText,
                    billingPeriod === "yearly"
                      ? styles.billingToggleTextActive
                      : null,
                  ]}
                >
                  Yearly
                </Text>

                <View style={styles.billingSavingsBadge}>
                  <Text style={styles.billingSavingsText}>SAVE UP TO 25%</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Plans list */}
            <ScrollView
              style={styles.plansScroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.plansList}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {plans.map((plan) => {
                // ✅ FIX: compare BOTH plan id AND period
                const isActive =
                  plan.id === "free"
                    ? activePlanId === "free"
                    : activePlanId === plan.id &&
                      activePlanPeriod === billingPeriod;

                const isPopular = plan.popular;

                // ✅ FIX: displayPeriod is always the toggle
                const displayPeriod: BillingPeriod = billingPeriod;

                const price = getPlanPrice(plan, displayPeriod);

                const periodLabel = getPlanPeriodLabel(plan, displayPeriod);

                const monthlyPrice = plan.monthlyPrice;

                const yearlySavings =
                  displayPeriod === "yearly" && monthlyPrice > 0
                    ? monthlyPrice * 12 - plan.yearlyPrice
                    : 0;

                const showCancelOnThisCard =
                  isActive &&
                  plan.id !== "free" &&
                  canManage &&
                  !!onCancelSubscription;

                return (
                  <View
                    key={plan.id}
                    style={[
                      styles.planCard,
                      isPopular ? styles.planCardPopular : null,
                      isActive ? styles.planCardActive : null,
                    ]}
                  >
                    {isPopular ? (
                      <View style={styles.popularTopLabel}>
                        <Ionicons name="star" size={11} color="#FFFFFF" />

                        <Text style={styles.popularTopLabelText}>
                          MOST POPULAR
                        </Text>
                      </View>
                    ) : null}

                    {/* Plan header */}
                    <View style={styles.planCardHeader}>
                      <View style={styles.planCardLeft}>
                        <View style={styles.planNameRow}>
                          <Text style={styles.planCardName}>{plan.name}</Text>

                          {isActive ? (
                            <View style={styles.planCardActiveBadge}>
                              <Ionicons
                                name="checkmark"
                                size={10}
                                color="#FFFFFF"
                              />

                              <Text style={styles.planCardActiveText}>
                                {plan.id === "free"
                                  ? "ACTIVE"
                                  : `ACTIVE · ${billingPeriod === "yearly" ? "YEARLY" : "MONTHLY"}`}
                              </Text>
                            </View>
                          ) : null}
                        </View>

                        <View style={styles.priceRow}>
                          <Text style={styles.planCardPrice}>
                            {price === 0
                              ? "Free"
                              : `₹${price.toLocaleString("en-IN")}`}
                          </Text>

                          {price > 0 ? (
                            <Text style={styles.planCardPeriod}>
                              {periodLabel}
                            </Text>
                          ) : null}
                        </View>

                        {displayPeriod === "yearly" && monthlyPrice > 0 ? (
                          <View style={styles.annualPriceRow}>
                            <Text style={styles.planCardStrikethrough}>
                              ₹{(monthlyPrice * 12).toLocaleString("en-IN")}
                            </Text>

                            <Text style={styles.planCardBillingNote}>
                              billed annually
                            </Text>
                          </View>
                        ) : null}

                        {displayPeriod === "yearly" && yearlySavings > 0 ? (
                          <View style={styles.planCardYearlySavings}>
                            <Ionicons
                              name="trending-down-outline"
                              size={13}
                              color="#15803D"
                            />

                            <Text style={styles.planCardYearlySavingsText}>
                              Save ₹{yearlySavings.toLocaleString("en-IN")} per
                              year
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      <View
                        style={[
                          styles.planCardIcon,
                          {
                            backgroundColor: plan.color + "15",
                          },
                        ]}
                      >
                        <Ionicons
                          name={plan.icon}
                          size={23}
                          color={plan.color}
                        />
                      </View>
                    </View>

                    <View style={styles.planDivider} />

                    {/* Features */}
                    <View style={styles.planCardFeatures}>
                      <Text style={styles.includesText}>
                        {plan.id === "free"
                          ? "Everything you need to get started"
                          : plan.id === "pro"
                            ? "More control for growing communities"
                            : "Everything included"}
                      </Text>

                      {plan.features.map((feature, index) => (
                        <View key={index} style={styles.planCardFeature}>
                          <View
                            style={[
                              styles.featureIcon,
                              {
                                backgroundColor: plan.color + "12",
                              },
                            ]}
                          >
                            <Ionicons
                              name="checkmark"
                              size={12}
                              color={plan.color}
                            />
                          </View>

                          <Text style={styles.planCardFeatureText}>
                            {feature}
                          </Text>
                        </View>
                      ))}
                    </View>

                    {/* Action area — Choose OR Current + Cancel */}
                    <View style={styles.planActionArea}>
                      {canManage ? (
                        <>
                          {isActive ? (
                            <View style={styles.currentPlanPill}>
                              <Ionicons
                                name="checkmark-circle"
                                size={16}
                                color="#16A34A"
                              />

                              <Text style={styles.currentPlanPillText}>
                                Current Plan
                              </Text>
                            </View>
                          ) : (
                            <TouchableOpacity
                              style={[
                                styles.choosePlanButton,
                                plan.id === "business"
                                  ? styles.choosePlanButtonBusiness
                                  : null,
                              ]}
                              onPress={() => handleSelectPlan(plan.id)}
                              activeOpacity={0.85}
                              disabled={isPaymentProcessing}
                            >
                              <Text style={styles.choosePlanButtonText}>
                                {price === 0
                                  ? `Switch to ${plan.name}`
                                  : `Choose ${plan.name}`}
                              </Text>

                              <Ionicons
                                name="arrow-forward"
                                size={16}
                                color="#FFFFFF"
                              />
                            </TouchableOpacity>
                          )}

                          {showCancelOnThisCard ? (
                            <TouchableOpacity
                              style={styles.cancelInlineButton}
                              onPress={() => setShowCancelConfirm(true)}
                              activeOpacity={0.75}
                              hitSlop={{
                                top: 8,
                                bottom: 8,
                                left: 8,
                                right: 8,
                              }}
                            >
                              <Ionicons
                                name="close-circle-outline"
                                size={15}
                                color="#DC2626"
                              />

                              <Text style={styles.cancelInlineText}>
                                Cancel Subscription
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                        </>
                      ) : isActive ? (
                        <View style={styles.currentPlanPill}>
                          <Ionicons
                            name="checkmark-circle"
                            size={16}
                            color="#16A34A"
                          />

                          <Text style={styles.currentPlanPillText}>
                            Current Plan
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })}

              <Text style={styles.bottomNote}>
                You can change your plan anytime.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ---------------- Cancel confirmation modal ---------------- */}
      <Modal
        transparent
        animationType="fade"
        visible={showCancelConfirm}
        onRequestClose={() => setShowCancelConfirm(false)}
      >
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIconCircle}>
              <Ionicons name="alert-circle" size={34} color="#DC2626" />
            </View>

            <Text style={styles.confirmTitle}>Cancel Subscription?</Text>

            <Text style={styles.confirmMessage}>
              You&apos;ll be moved to the{" "}
              <Text style={styles.confirmStrongText}>Free plan</Text>{" "}
              immediately and lose access to all premium features on{" "}
              <Text style={styles.confirmStrongText}>{currentPlanName}</Text>.
            </Text>

            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmKeepButton}
                onPress={() => setShowCancelConfirm(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmKeepText}>Keep Plan</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmCancelButton}
                onPress={handleConfirmCancel}
                activeOpacity={0.85}
              >
                <Ionicons name="close-circle" size={16} color="#FFFFFF" />

                <Text style={styles.confirmCancelText}>Yes, Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---------------- Payment processing overlay ---------------- */}
      {isPaymentProcessing ? (
        <View style={styles.processingOverlay}>
          <View style={styles.processingCard}>
            <ActivityIndicator size="large" color="#2563EB" />

            <Text style={styles.processingTitle}>Opening payment</Text>

            <Text style={styles.processingText}>
              Please complete the payment in the Razorpay checkout.
            </Text>
          </View>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  plansModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.62)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 14,
  },

  plansModalContainer: {
    width: "100%",
    maxWidth: 430,
    maxHeight: "90%",
    minHeight: 520,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 18,
    flexDirection: "column",
  },

  plansModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    paddingBottom: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },

  headerTextContainer: {
    flex: 1,
    paddingRight: 10,
  },

  plansModalTitle: {
    fontSize: 21,
    fontWeight: "800",
    color: "#0F172A",
  },

  modalSubtitle: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 4,
  },

  plansModalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },

  billingToggleContainer: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 14,
    padding: 4,
    marginBottom: 14,
  },

  billingToggleButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 11,
    gap: 5,
  },

  billingToggleButtonActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },

  billingToggleText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },

  billingToggleTextActive: {
    color: "#2563EB",
    fontWeight: "700",
  },

  billingSavingsBadge: {
    backgroundColor: "#16A34A",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 3,
  },

  billingSavingsText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "800",
  },

  plansScroll: {
    flex: 1,
  },

  plansList: {
    paddingTop: 2,
    paddingBottom: 18,
  },

  planCard: {
    position: "relative",
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    padding: 16,
    paddingBottom: 14,
    marginBottom: 12,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },

  planCardPopular: {
    borderColor: "#2563EB",
    backgroundColor: "#F8FBFF",
  },

  planCardActive: {
    borderColor: "#16A34A",
    backgroundColor: "#F7FEF9",
  },

  popularTopLabel: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: "#2563EB",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderBottomLeftRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  popularTopLabelText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  planCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },

  planCardLeft: {
    flex: 1,
  },

  planNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    paddingRight: 70,
  },

  planCardName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },

  planCardActiveBadge: {
    backgroundColor: "#16A34A",
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginLeft: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },

  planCardActiveText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "800",
  },

  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 4,
  },

  planCardPrice: {
    fontSize: 27,
    fontWeight: "800",
    color: "#0F172A",
  },

  planCardPeriod: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
    marginLeft: 3,
  },

  annualPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 1,
  },

  planCardStrikethrough: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94A3B8",
    textDecorationLine: "line-through",
  },

  planCardBillingNote: {
    fontSize: 10,
    color: "#64748B",
    marginLeft: 5,
  },

  planCardYearlySavings: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#DCFCE7",
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginTop: 5,
    gap: 4,
  },

  planCardYearlySavingsText: {
    color: "#15803D",
    fontSize: 10,
    fontWeight: "700",
  },

  planCardIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },

  planDivider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginTop: 13,
    marginBottom: 11,
  },

  includesText: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
    marginBottom: 8,
  },

  planCardFeatures: {
    gap: 7,
  },

  planCardFeature: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  featureIcon: {
    width: 21,
    height: 21,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },

  planCardFeatureText: {
    flex: 1,
    fontSize: 12,
    color: "#334155",
    fontWeight: "500",
  },

  planActionArea: {
    marginTop: 14,
    gap: 8,
  },

  choosePlanButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#2563EB",
  },

  choosePlanButtonBusiness: {
    backgroundColor: "#7C3AED",
  },

  choosePlanButtonText: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  currentPlanPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },

  currentPlanPillText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#15803D",
  },

  cancelInlineButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },

  cancelInlineText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#DC2626",
  },

  bottomNote: {
    textAlign: "center",
    color: "#94A3B8",
    fontSize: 10,
    marginTop: 6,
  },

  processingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },

  processingCard: {
    width: 270,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 24,
    alignItems: "center",
  },

  processingTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 14,
  },

  processingText: {
    fontSize: 11,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 17,
    marginTop: 5,
  },

  confirmBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },

  confirmCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 22,
    alignItems: "center",
  },

  confirmIconCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  confirmTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 6,
  },

  confirmMessage: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 20,
  },

  confirmStrongText: {
    fontWeight: "700",
    color: "#0F172A",
  },

  confirmActions: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },

  confirmKeepButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },

  confirmKeepText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },

  confirmCancelButton: {
    flex: 1.2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#DC2626",
    gap: 6,
  },

  confirmCancelText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
