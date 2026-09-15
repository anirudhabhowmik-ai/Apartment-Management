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
    features: ["Up to 10 members", "Basic bill generation", "Basic support"],
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
      "Up to 30 members",
      "Advanced bill generation",
      "Priority support",
      "History access",
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
      "Unlimited members",
      "Multiple accounts",
      "Advanced bill generation",
      "Priority support",
      "History access",
      "Advanced analytics",
      "White-label branding",
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
  onPlanChanged: (payload: {
    plan: SubscriptionPlan;
    period: BillingPeriod;
    isUpgrade: boolean;
    isDowngrade: boolean;
    amount: number;
    paymentId?: string;
  }) => void;
  onCancelSubscription?: () => void;
  canManage?: boolean;
  plans?: SubscriptionPlan[];
  user?: { name?: string; phone?: string };
  startPayment: (
    amount: number,
    label: string,
    user?: { name?: string; phone?: string },
  ) => Promise<{ success: boolean; paymentId?: string; error?: string }>;
}

export default function SubscriptionPlanModal({
  visible,
  onClose,
  activePlanId,
  onPlanChanged,
  onCancelSubscription,
  canManage = true,
  plans = DEFAULT_PLANS,
  user,
  startPayment,
}: SubscriptionPlanModalProps) {
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [isPaymentProcessing, setIsPaymentProcessing] = useState(false);

  useEffect(() => {
    if (visible) setBillingPeriod("monthly");
  }, [visible]);

  const getPlanPrice = (plan: SubscriptionPlan, period: BillingPeriod) =>
    period === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;

  const getPlanPeriodLabel = (
    plan: SubscriptionPlan,
    period: BillingPeriod,
  ) => {
    if (plan.monthlyPrice === 0) return "";
    return period === "yearly" ? "/year" : "/month";
  };

  const handleSelectPlan = async (planId: string) => {
    if (!canManage) return;

    const selectedPlan = plans.find((p) => p.id === planId);
    if (!selectedPlan) return;

    if (activePlanId === planId) {
      onClose();
      return;
    }

    const price = getPlanPrice(selectedPlan, billingPeriod);

    if (price === 0) {
      const currentIndex = plans.findIndex((p) => p.id === activePlanId);
      const newIndex = plans.findIndex((p) => p.id === selectedPlan.id);
      onPlanChanged({
        plan: selectedPlan,
        period: billingPeriod,
        isUpgrade: newIndex > currentIndex,
        isDowngrade: newIndex < currentIndex,
        amount: 0,
      });
      return;
    }

    onClose();
    setIsPaymentProcessing(true);

    try {
      const planLabel = `${selectedPlan.name} (${billingPeriod})`;
      const result = await startPayment(price, planLabel, {
        name: user?.name,
        phone: user?.phone,
      });

      if (result.success) {
        const currentIndex = plans.findIndex((p) => p.id === activePlanId);
        const newIndex = plans.findIndex((p) => p.id === selectedPlan.id);
        onPlanChanged({
          plan: selectedPlan,
          period: billingPeriod,
          isUpgrade: newIndex > currentIndex,
          isDowngrade: newIndex < currentIndex,
          amount: price,
          paymentId: result.paymentId,
        });
      } else {
        Alert.alert(
          "Payment Failed",
          result.error || "Payment was not completed. Please try again.",
          [{ text: "OK" }],
        );
      }
    } catch (error) {
      console.error("Payment error:", error);
      Alert.alert(
        "Payment Error",
        "Something went wrong while processing the payment.",
        [{ text: "OK" }],
      );
    } finally {
      setIsPaymentProcessing(false);
    }
  };

  const currentPlan = plans.find((p) => p.id === activePlanId);
  const currentPlanName = currentPlan?.name ?? "Free";

  return (
    <>
      <Modal
        transparent
        animationType="slide"
        visible={visible}
        onRequestClose={onClose}
      >
        <View style={styles.plansModalOverlay}>
          <View style={styles.plansModalContainer}>
            <View style={styles.plansModalHeader}>
              <View>
                <Text style={styles.plansModalTitle}>Choose Your Plan</Text>
                <Text style={styles.modalSubtitle}>
                  {activePlanId !== "free"
                    ? `Current: ${currentPlanName}`
                    : "Select a plan that fits your needs"}
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

            <View style={styles.billingToggleContainer}>
              <TouchableOpacity
                style={[
                  styles.billingToggleButton,
                  billingPeriod === "monthly" &&
                    styles.billingToggleButtonActive,
                ]}
                onPress={() => setBillingPeriod("monthly")}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.billingToggleText,
                    billingPeriod === "monthly" &&
                      styles.billingToggleTextActive,
                  ]}
                >
                  Monthly
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.billingToggleButton,
                  billingPeriod === "yearly" &&
                    styles.billingToggleButtonActive,
                ]}
                onPress={() => setBillingPeriod("yearly")}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.billingToggleText,
                    billingPeriod === "yearly" &&
                      styles.billingToggleTextActive,
                  ]}
                >
                  Yearly
                </Text>
                <View style={styles.billingSavingsBadge}>
                  <Text style={styles.billingSavingsText}>SAVE 25%</Text>
                </View>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.plansScroll}
              showsVerticalScrollIndicator
              contentContainerStyle={styles.plansList}
              nestedScrollEnabled
              overScrollMode="always"
              bounces
              keyboardShouldPersistTaps="handled"
            >
              {plans.map((plan) => {
                const isActive = activePlanId === plan.id;
                const isPopular = plan.popular;
                const price = getPlanPrice(plan, billingPeriod);
                const periodLabel = getPlanPeriodLabel(plan, billingPeriod);
                const monthlyPrice = plan.monthlyPrice;
                const yearlySavings =
                  billingPeriod === "yearly" && plan.monthlyPrice > 0
                    ? plan.monthlyPrice * 12 - plan.yearlyPrice
                    : 0;

                return (
                  <View
                    key={plan.id}
                    style={[
                      styles.planCard,
                      isPopular && styles.planCardPopular,
                      isActive && styles.planCardActive,
                    ]}
                  >
                    <View style={styles.planCardHeader}>
                      <View style={styles.planCardLeft}>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <Text style={styles.planCardName}>{plan.name}</Text>
                          {isPopular && (
                            <View style={styles.planCardPopularBadge}>
                              <Text style={styles.planCardPopularText}>
                                POPULAR
                              </Text>
                            </View>
                          )}
                          {isActive && (
                            <View style={styles.planCardActiveBadge}>
                              <Text style={styles.planCardActiveText}>
                                ACTIVE
                              </Text>
                            </View>
                          )}
                        </View>

                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "baseline",
                            flexWrap: "wrap",
                          }}
                        >
                          <Text style={styles.planCardPrice}>
                            {price === 0 ? "Free" : `₹${price}`}
                          </Text>
                          {price > 0 && (
                            <Text style={styles.planCardPeriod}>
                              {periodLabel}
                            </Text>
                          )}
                        </View>

                        {billingPeriod === "yearly" && monthlyPrice > 0 && (
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              flexWrap: "wrap",
                            }}
                          >
                            <Text style={styles.planCardStrikethrough}>
                              ₹{monthlyPrice * 12}
                            </Text>
                            <Text style={styles.planCardBillingNote}>
                              billed annually
                            </Text>
                          </View>
                        )}

                        {billingPeriod === "yearly" && yearlySavings > 0 && (
                          <View style={styles.planCardYearlySavings}>
                            <Ionicons
                              name="trending-down-outline"
                              size={12}
                              color="#16A34A"
                            />
                            <Text style={styles.planCardYearlySavingsText}>
                              Save ₹{yearlySavings.toLocaleString("en-IN")} /
                              year
                            </Text>
                          </View>
                        )}
                      </View>

                      <View
                        style={[
                          styles.planCardIcon,
                          { backgroundColor: plan.color + "15" },
                        ]}
                      >
                        <Ionicons
                          name={plan.icon}
                          size={22}
                          color={plan.color}
                        />
                      </View>
                    </View>

                    <View style={styles.planCardFeatures}>
                      {plan.features.map((feature, index) => (
                        <View key={index} style={styles.planCardFeature}>
                          <Ionicons
                            name="checkmark-circle"
                            size={14}
                            color="#16A34A"
                          />
                          <Text style={styles.planCardFeatureText}>
                            {feature}
                          </Text>
                        </View>
                      ))}
                    </View>

                    {canManage ? (
                      <TouchableOpacity
                        style={[
                          styles.planCardAction,
                          isActive && styles.planCardActionActive,
                          !isActive && styles.planCardActionButton,
                        ]}
                        onPress={() => handleSelectPlan(plan.id)}
                        activeOpacity={0.8}
                        disabled={isActive || isPaymentProcessing}
                      >
                        <Text
                          style={[
                            styles.planCardActionText,
                            isActive && styles.planCardActionActiveText,
                            !isActive && { color: "#FFFFFF" },
                          ]}
                        >
                          {isActive
                            ? "Current Plan"
                            : price === 0
                              ? `Switch to ${plan.name}`
                              : `Switch to ${plan.name} - ₹${price}${periodLabel}`}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      isActive && (
                        <View
                          style={[
                            styles.planCardAction,
                            styles.planCardActionActive,
                          ]}
                        >
                          <Text style={styles.planCardActionActiveText}>
                            Current Plan
                          </Text>
                        </View>
                      )
                    )}
                  </View>
                );
              })}

              {activePlanId !== "free" && canManage && onCancelSubscription && (
                <TouchableOpacity
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 12,
                    gap: 6,
                    marginTop: 4,
                    marginBottom: 8,
                  }}
                  onPress={onCancelSubscription}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="close-circle-outline"
                    size={18}
                    color="#DC2626"
                  />
                  <Text
                    style={{
                      color: "#DC2626",
                      fontSize: 13,
                      fontWeight: "600",
                    }}
                  >
                    Cancel Subscription
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {isPaymentProcessing && (
        <View style={styles.processingOverlay}>
          <View style={styles.processingCard}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.processingText}>Opening payment…</Text>
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  plansModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.58)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  plansModalContainer: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    maxHeight: "85%",
    minHeight: 500,
    display: "flex",
    flexDirection: "column",
  },
  plansModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    flexShrink: 0,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  plansModalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
  },
  modalSubtitle: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 3,
  },
  plansModalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  plansScroll: {
    flex: 1,
    minHeight: 200,
  },
  plansList: {
    paddingBottom: 20,
    paddingTop: 4,
  },
  planCard: {
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#E2E8F0",
    padding: 16,
    marginBottom: 12,
    backgroundColor: "#FFFFFF",
  },
  planCardPopular: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  planCardActive: {
    borderColor: "#16A34A",
    backgroundColor: "#F0FDF4",
  },
  planCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  planCardLeft: {
    flex: 1,
  },
  planCardName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  planCardPrice: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 2,
  },
  planCardPeriod: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  planCardPopularBadge: {
    backgroundColor: "#2563EB",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginLeft: 8,
  },
  planCardPopularText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "700",
  },
  planCardActiveBadge: {
    backgroundColor: "#16A34A",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  planCardActiveText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "700",
  },
  planCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  planCardFeatures: {
    marginTop: 10,
    gap: 4,
  },
  planCardFeature: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  planCardFeatureText: {
    fontSize: 12,
    color: "#475569",
  },
  planCardAction: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  planCardActionActive: {
    backgroundColor: "#F1F5F9",
  },
  planCardActionButton: {
    backgroundColor: "#2563EB",
  },
  planCardActionText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  planCardActionActiveText: {
    color: "#475569",
  },
  billingToggleContainer: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
    flexShrink: 0,
  },
  billingToggleButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 11,
    gap: 6,
  },
  billingToggleButtonActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
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
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginLeft: 4,
  },
  billingSavingsText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "700",
  },
  planCardYearlySavings: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DCFCE7",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
    marginTop: 6,
    gap: 4,
  },
  planCardYearlySavingsText: {
    color: "#16A34A",
    fontSize: 10,
    fontWeight: "700",
  },
  planCardStrikethrough: {
    fontSize: 13,
    fontWeight: "600",
    color: "#94A3B8",
    textDecorationLine: "line-through",
    marginLeft: 6,
  },
  planCardBillingNote: {
    fontSize: 10,
    color: "#64748B",
    marginTop: 2,
  },
  processingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  processingCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    gap: 12,
  },
  processingText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
});
