import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  BillMemberType,
  SavedBillConfig,
  SignatureData,
  useBillStore,
} from "../store/billStore";
import SignatureCanvas from "./SignatureCanvas";
import SignaturePreview from "./SignaturePreview";

interface GenerateBillModalProps {
  visible: boolean;
  onClose: () => void;
  memberType: BillMemberType;
  onMemberTypeChange?: (memberType: BillMemberType) => void;
  onSaved?: (config: SavedBillConfig) => void;
}

const ACCENT_SWATCHES = [
  "#1a73e8",
  "#7c3aed",
  "#059669",
  "#d97706",
  "#dc2626",
  "#0891b2",
];

function validateEmail(email: string): boolean {
  if (!email.trim()) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function sanitizeContactNumber(value: string): string {
  return value.replace(/\D/g, "").slice(0, 10);
}

function getLabels(memberType: BillMemberType) {
  return memberType === "owner"
    ? {
        docTitle: "Maintenance Bill",
        monthLabel: "Maintenance Month",
        totalLabel: "Maintenance Amount",
      }
    : {
        docTitle: "Salary Slip",
        monthLabel: "Salary Month",
        totalLabel: "Salary Amount",
      };
}

function makeDummyPreviewData(memberType: BillMemberType) {
  const labels = getLabels(memberType);

  return memberType === "owner"
    ? {
        ...labels,
        rows: [
          ["Owner Name", "Rahul Sharma"],
          ["Flat Number", "A-204"],
          ["Flat Area", "1,200 sq. ft."],
          [labels.monthLabel, "December 2024"],
          ["Maintenance Charges", "₹2,500"],
        ] as [string, string][],
        totalValue: "₹2,500",
      }
    : {
        ...labels,
        rows: [
          ["Staff Name", "Suresh Kumar"],
          ["Role", "Security Guard"],
          [labels.monthLabel, "December 2024"],
          ["Present Days", "28 / 30"],
        ] as [string, string][],
        totalValue: "₹9,000",
      };
}

export default function GenerateBillModal({
  visible,
  onClose,
  memberType: initialMemberType,
  onMemberTypeChange,
  onSaved,
}: GenerateBillModalProps) {
  const { templates, getBillConfig, setBillConfig } = useBillStore();

  const [memberType, setMemberType] =
    useState<BillMemberType>(initialMemberType);

  useEffect(() => {
    setMemberType(initialMemberType);
  }, [initialMemberType]);

  const existingConfig = getBillConfig(memberType);
  const labels = getLabels(memberType);

  const accentColor = memberType === "owner" ? "#1a73e8" : "#7c3aed";
  const accentBg = memberType === "owner" ? "#eff6ff" : "#f3e8ff";

  const [step, setStep] = useState<"design" | "details" | "sign">("design");

  const [templateId, setTemplateId] = useState(
    existingConfig?.templateId ?? templates[0].id,
  );

  const [swatch, setSwatch] = useState(
    existingConfig?.accentColor ?? templates[0].colors.primary,
  );

  const [showDesignPreview, setShowDesignPreview] = useState(false);

  const [societyName, setSocietyName] = useState(
    existingConfig?.societyName ?? "",
  );

  const [address, setAddress] = useState(existingConfig?.address ?? "");

  const [contactNumber, setContactNumber] = useState(
    existingConfig?.contactNumber ?? "",
  );

  const [email, setEmail] = useState(existingConfig?.email ?? "");

  const [signature, setSignature] = useState<SignatureData | undefined>(
    existingConfig?.signature,
  );

  const [showSignatureModal, setShowSignatureModal] = useState(false);

  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (visible) {
      const cfg = getBillConfig(memberType);

      setStep("design");
      setTemplateId(cfg?.templateId ?? templates[0].id);
      setSwatch(cfg?.accentColor ?? templates[0].colors.primary);

      setSocietyName(cfg?.societyName ?? "");
      setAddress(cfg?.address ?? "");
      setContactNumber(sanitizeContactNumber(cfg?.contactNumber ?? ""));
      setEmail(cfg?.email ?? "");
      setSignature(cfg?.signature);

      setFormError("");
      setShowDesignPreview(false);
      setShowSignatureModal(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, memberType]);

  const selectedTemplate =
    templates.find((t) => t.id === templateId) ?? templates[0];

  const dummy = makeDummyPreviewData(memberType);

  const goBack = () => {
    if (step === "details") setStep("design");
    else if (step === "sign") setStep("details");
  };

  const handleDetailsNext = () => {
    if (!societyName.trim()) {
      setFormError("Please enter the society name");
      return;
    }
    if (contactNumber.length > 0 && contactNumber.length !== 10) {
      setFormError(
        "Contact number must be exactly 10 digits, or leave it empty",
      );
      return;
    }
    if (!validateEmail(email)) {
      setFormError("Please enter a valid email address");
      return;
    }
    setFormError("");
    setStep("sign");
  };

  const handleSaveTemplate = () => {
    const config: SavedBillConfig = {
      templateId: selectedTemplate.id,
      accentColor: swatch,
      societyName: societyName.trim(),
      address: address.trim(),
      contactNumber: contactNumber.trim(),
      email: email.trim(),
      signature,
      updatedAt: new Date().toISOString(),

      // ✅ Snapshot the full layout at save time. This makes the owner
      // and staff configs truly independent — the PDF generator uses
      // this snapshot directly instead of looking up the shared
      // templates array by id.
      layoutSnapshot: {
        colors: {
          ...selectedTemplate.colors,
          primary: swatch, // honor the accent override
        },
        fontFamily: selectedTemplate.fontFamily,
        logoPosition: selectedTemplate.logoPosition,
        showBorder: selectedTemplate.showBorder,
        borderColor: selectedTemplate.borderColor,
        borderWidth: selectedTemplate.borderWidth,
        borderRadius: selectedTemplate.borderRadius,
        showWatermark: selectedTemplate.showWatermark,
        watermarkText: selectedTemplate.watermarkText,
        layoutVariant: selectedTemplate.layoutVariant,
      },
    };

    setBillConfig(memberType, config);
    onSaved?.(config);
    onClose();
  };

  const handleSwitchMemberType = (next: BillMemberType) => {
    if (next === memberType) return;
    setMemberType(next);
    onMemberTypeChange?.(next);
  };

  const stepOrder: ("design" | "details" | "sign")[] = [
    "design",
    "details",
    "sign",
  ];

  const renderStepIndicator = () => {
    const currentIndex = stepOrder.indexOf(step);

    return (
      <View style={styles.stepIndicator}>
        {stepOrder.map((s, index) => (
          <View key={s} style={styles.stepItem}>
            <TouchableOpacity
              style={[
                styles.stepDot,
                index <= currentIndex && { backgroundColor: accentColor },
              ]}
              onPress={() => index <= currentIndex && setStep(s)}
              disabled={index > currentIndex}
              activeOpacity={0.7}
            >
              {index < currentIndex ? (
                <Ionicons name="checkmark" size={13} color="#fff" />
              ) : (
                <Text
                  style={[
                    styles.stepDotText,
                    index <= currentIndex && { color: "#fff" },
                  ]}
                >
                  {index + 1}
                </Text>
              )}
            </TouchableOpacity>

            {index < stepOrder.length - 1 && (
              <View
                style={[
                  styles.stepLine,
                  index < currentIndex && { backgroundColor: accentColor },
                ]}
              />
            )}
          </View>
        ))}
      </View>
    );
  };

  /* ----------------------------------------------------------------
     Template thumbnail (mini preview) — shows real layout difference
  ---------------------------------------------------------------- */
  const renderTemplateThumb = (t: (typeof templates)[number]) => {
    if (t.layoutVariant === "bold") {
      return (
        <View
          style={[
            styles.templateThumb,
            { backgroundColor: t.colors.background },
          ]}
        >
          <View
            style={{
              height: 22,
              backgroundColor: t.colors.headerBg,
              paddingHorizontal: 5,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}
          >
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                backgroundColor: "#ffffff",
              }}
            />
            <View
              style={{
                flex: 1,
                height: 4,
                borderRadius: 1,
                backgroundColor: "rgba(255,255,255,0.85)",
              }}
            />
          </View>
          <View style={{ paddingHorizontal: 5, paddingTop: 5 }}>
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginBottom: 3,
                }}
              >
                <View
                  style={{
                    height: 3,
                    width: "40%",
                    borderRadius: 1,
                    backgroundColor: "#e2e8f0",
                  }}
                />
                <View
                  style={{
                    height: 3,
                    width: "25%",
                    borderRadius: 1,
                    backgroundColor: "#cbd5e1",
                  }}
                />
              </View>
            ))}
          </View>
        </View>
      );
    }

    if (t.layoutVariant === "classic") {
      return (
        <View
          style={[
            styles.templateThumb,
            {
              backgroundColor: t.colors.background,
              borderWidth: 1,
              borderColor: t.borderColor,
            },
          ]}
        >
          <View style={{ padding: 5 }}>
            <View
              style={{
                height: 5,
                width: "70%",
                borderRadius: 1,
                backgroundColor: t.colors.primary,
                alignSelf: "center",
                marginBottom: 3,
              }}
            />
            <View
              style={{
                height: 3,
                width: "50%",
                borderRadius: 1,
                backgroundColor: "#cbd5e1",
                alignSelf: "center",
                marginBottom: 4,
              }}
            />
            <View
              style={{
                height: 1,
                width: "100%",
                backgroundColor: t.colors.primary,
                marginBottom: 5,
              }}
            />
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginBottom: 3,
                }}
              >
                <View
                  style={{
                    height: 3,
                    width: "40%",
                    borderRadius: 1,
                    backgroundColor: "#e2e8f0",
                  }}
                />
                <View
                  style={{
                    height: 3,
                    width: "25%",
                    borderRadius: 1,
                    backgroundColor: "#cbd5e1",
                  }}
                />
              </View>
            ))}
          </View>
        </View>
      );
    }

    // minimal
    return (
      <View
        style={[styles.templateThumb, { backgroundColor: t.colors.background }]}
      >
        <View style={{ padding: 5 }}>
          <View
            style={{
              height: 5,
              width: "55%",
              borderRadius: 1,
              backgroundColor: t.colors.text,
              marginBottom: 3,
            }}
          />
          <View
            style={{
              height: 3,
              width: "40%",
              borderRadius: 1,
              backgroundColor: "#cbd5e1",
              marginBottom: 5,
            }}
          />
          <View
            style={{
              height: 1,
              width: "100%",
              backgroundColor: "#e5e7eb",
              marginBottom: 5,
            }}
          />
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 3,
              }}
            >
              <View
                style={{
                  height: 3,
                  width: "40%",
                  borderRadius: 1,
                  backgroundColor: "#e2e8f0",
                }}
              />
              <View
                style={{
                  height: 3,
                  width: "25%",
                  borderRadius: 1,
                  backgroundColor: "#cbd5e1",
                }}
              />
            </View>
          ))}
        </View>
      </View>
    );
  };

  /* ----------------------------------------------------------------
     Full preview card (used in sign step + design preview modal)
     Each layout variant renders a genuinely different bill.
  ---------------------------------------------------------------- */
  const renderPreviewCard = (useRealCommonDetails: boolean) => {
    const displaySociety = useRealCommonDetails
      ? societyName || "Your Society Name"
      : "Green Valley Apartments";

    const displayAddress = useRealCommonDetails
      ? address
      : "123, Main Road, City";

    const displayContact = useRealCommonDetails
      ? contactNumber
      : "+91 98765 43210";

    const displayEmail = useRealCommonDetails ? email : "society@email.com";

    const displaySignature = useRealCommonDetails ? signature : undefined;

    const hasContactOrEmail =
      Boolean(displayContact && displayContact.trim()) ||
      Boolean(displayEmail && displayEmail.trim());

    const variant = selectedTemplate.layoutVariant ?? "bold";

    const initials = displaySociety
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 3);

    /* ---------- shared body pieces, styled per variant ---------- */

    const bodyBg =
      variant === "bold"
        ? "#f8fafc"
        : variant === "classic"
          ? "#ffffff"
          : "#ffffff";

    const panelStyle =
      variant === "bold"
        ? {
            backgroundColor: selectedTemplate.colors.secondary,
            borderRadius: 10,
            padding: 12,
            marginTop: 12,
          }
        : variant === "classic"
          ? {
              backgroundColor: "#ffffff",
              borderRadius: 0,
              borderWidth: 1,
              borderColor: "#cbd5e1",
              padding: 12,
              marginTop: 12,
            }
          : {
              backgroundColor: "transparent",
              borderRadius: 0,
              paddingVertical: 8,
              paddingHorizontal: 0,
              marginTop: 12,
            };

    const titleStyle =
      variant === "bold"
        ? {
            fontSize: 18,
            fontWeight: "800" as const,
            color: "#ffffff",
            textAlign: "center" as const,
            paddingVertical: 12,
            backgroundColor: swatch,
            borderRadius: 8,
            marginTop: 12,
            letterSpacing: 0.8,
          }
        : variant === "classic"
          ? {
              fontSize: 16,
              fontWeight: "800" as const,
              color: swatch,
              textAlign: "center" as const,
              letterSpacing: 3,
              paddingVertical: 12,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: "#cbd5e1",
              marginTop: 16,
            }
          : {
              fontSize: 15,
              fontWeight: "700" as const,
              color: "#0f172a",
              textAlign: "left" as const,
              paddingVertical: 8,
              marginTop: 12,
              letterSpacing: 0,
            };

    const rowLabelStyle =
      variant === "minimal"
        ? { fontSize: 12, color: "#64748b" }
        : { fontSize: 12.5, color: "#475569" };

    const rowDividerStyle =
      variant === "bold"
        ? { borderBottomWidth: 0, paddingVertical: 5 }
        : variant === "classic"
          ? {
              borderBottomWidth: 1,
              borderBottomColor: "#e2e8f0",
              paddingVertical: 6,
            }
          : {
              borderBottomWidth: 1,
              borderBottomColor: "#f1f5f9",
              paddingVertical: 5,
            };

    const totalBg =
      variant === "bold"
        ? swatch
        : variant === "classic"
          ? "#ffffff"
          : "transparent";

    const totalColor =
      variant === "bold"
        ? "#ffffff"
        : variant === "classic"
          ? swatch
          : "#0f172a";

    const totalLabelColor =
      variant === "bold"
        ? "rgba(255,255,255,0.85)"
        : variant === "classic"
          ? "#475569"
          : "#64748b";

    const totalStyle =
      variant === "bold"
        ? {
            flexDirection: "row" as const,
            justifyContent: "space-between" as const,
            alignItems: "center" as const,
            backgroundColor: totalBg,
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 12,
            marginTop: 14,
          }
        : variant === "classic"
          ? {
              flexDirection: "row" as const,
              justifyContent: "space-between" as const,
              alignItems: "center" as const,
              borderTopWidth: 2,
              borderBottomWidth: 2,
              borderColor: swatch,
              paddingVertical: 10,
              marginTop: 14,
            }
          : {
              flexDirection: "row" as const,
              justifyContent: "space-between" as const,
              alignItems: "center" as const,
              borderTopWidth: 1,
              borderTopColor: "#0f172a",
              paddingVertical: 8,
              marginTop: 12,
            };

    /* ---------- body rows (info) ---------- */
    const infoRows = [
      { label: "Owner/Staff Name", value: dummy.rows[0][1] },
      ...dummy.rows.slice(1),
    ];

    const renderInfoPanel = () => (
      <View style={panelStyle}>
        {infoRows.map((row: any, idx) => {
          const label = Array.isArray(row) ? row[0] : row.label;
          const value = Array.isArray(row) ? row[1] : row.value;

          return (
            <View
              key={`${label}-${idx}`}
              style={[
                {
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                },
                rowDividerStyle,
                idx === infoRows.length - 1 && { borderBottomWidth: 0 },
              ]}
            >
              <Text style={rowLabelStyle}>{label}</Text>
              <Text
                style={{
                  fontSize: 12.5,
                  fontWeight: "700",
                  color:
                    variant === "classic"
                      ? selectedTemplate.colors.text
                      : "#0f172a",
                }}
              >
                {value}
              </Text>
            </View>
          );
        })}
      </View>
    );

    return (
      <View
        style={[
          styles.previewCard,
          variant === "classic" && {
            borderWidth: 1,
            borderColor: "#cbd5e1",
            borderRadius: 0,
          },
          variant === "bold" && {
            borderWidth: 0,
            borderRadius: 14,
          },
          variant === "minimal" && {
            borderWidth: 0,
            borderRadius: 0,
          },
        ]}
      >
        {/* ---------- Header — varies strongly per variant ---------- */}
        {variant === "bold" ? (
          <View style={[styles.previewHeaderBold, { backgroundColor: swatch }]}>
            <View style={styles.previewHeaderLogo}>
              <Text style={[styles.previewHeaderLogoText, { color: swatch }]}>
                {initials}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.previewHeaderTitleOnBg}>
                {displaySociety}
              </Text>
              <Text style={styles.previewHeaderTemplateOnBg}>
                {displayAddress}
              </Text>
            </View>
          </View>
        ) : variant === "classic" ? (
          <View style={styles.previewHeaderClassic}>
            <Text
              style={[styles.previewHeaderClassicSociety, { color: swatch }]}
            >
              {displaySociety}
            </Text>
            <Text style={styles.previewHeaderClassicSub}>{displayAddress}</Text>
            {hasContactOrEmail && (
              <Text style={styles.previewHeaderClassicSub}>
                {displayContact}
                {displayContact && displayEmail ? "  •  " : ""}
                {displayEmail}
              </Text>
            )}
            <View
              style={[
                styles.previewHeaderClassicRule,
                { backgroundColor: swatch },
              ]}
            />
          </View>
        ) : (
          <View style={styles.previewHeaderMinimal}>
            <Text style={styles.previewHeaderMinimalSociety}>
              {displaySociety}
            </Text>
            <Text style={styles.previewHeaderMinimalSub}>{displayAddress}</Text>
            {hasContactOrEmail && (
              <Text style={styles.previewHeaderMinimalSub}>
                {displayContact}
                {displayContact && displayEmail ? " • " : ""}
                {displayEmail}
              </Text>
            )}
          </View>
        )}

        {/* ---------- Body ---------- */}
        <View style={[styles.previewBody, { backgroundColor: bodyBg }]}>
          {/* Bill title — strongly different per variant */}
          <Text style={titleStyle}>{dummy.docTitle}</Text>

          {/* Info panel */}
          {renderInfoPanel()}

          {/* Amount breakdown */}
          <View style={panelStyle}>
            <View style={rowDividerStyle}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Text style={rowLabelStyle}>
                  Base{" "}
                  {dummy.docTitle === "Salary Slip" ? "Salary" : "Maintenance"}
                </Text>
                <Text
                  style={{
                    fontSize: 12.5,
                    fontWeight: "700",
                    color: "#0f172a",
                  }}
                >
                  {dummy.totalValue}
                </Text>
              </View>
            </View>
          </View>

          {/* Total row */}
          <View style={totalStyle}>
            <Text
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: totalLabelColor,
                letterSpacing: variant === "classic" ? 1 : 0,
              }}
            >
              {variant === "classic"
                ? dummy.totalLabel.toUpperCase()
                : dummy.totalLabel}
            </Text>
            <Text
              style={{
                fontSize: variant === "bold" ? 20 : 18,
                fontWeight: "800",
                color: totalColor,
              }}
            >
              {dummy.totalValue}
            </Text>
          </View>

          {/* Signature */}
          <View
            style={[
              styles.signatureArea,
              variant === "classic" && { marginTop: 26 },
              variant === "minimal" && {
                marginTop: 16,
                alignItems: "flex-start",
              },
            ]}
          >
            <Text style={styles.signatureAreaLabel}>Authorized Signatory</Text>
            {displaySignature ? (
              <SignaturePreview
                signature={displaySignature}
                width={150}
                height={55}
              />
            ) : (
              <View style={styles.signatureLine} />
            )}
          </View>

          {!useRealCommonDetails && (
            <Text style={styles.dummyTag}>
              Sample preview — your details will appear here
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              {step !== "design" && (
                <TouchableOpacity onPress={goBack} style={styles.backNavButton}>
                  <Ionicons name="arrow-back" size={22} color={accentColor} />
                </TouchableOpacity>
              )}

              <View>
                <Text style={styles.title}>
                  {memberType === "owner"
                    ? "Owner Bill Template"
                    : "Staff Slip Template"}
                </Text>

                <View style={[styles.badge, { backgroundColor: accentBg }]}>
                  <Text style={[styles.badgeText, { color: accentColor }]}>
                    {existingConfig
                      ? "Editing saved template"
                      : "First-time setup"}
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Owner / Staff toggle */}
          <View style={styles.memberTypeToggle}>
            <TouchableOpacity
              style={[
                styles.memberTypeButton,
                memberType === "owner" && styles.memberTypeButtonOwnerActive,
              ]}
              onPress={() => handleSwitchMemberType("owner")}
              activeOpacity={0.8}
            >
              <Ionicons
                name="home-outline"
                size={15}
                color={memberType === "owner" ? "#1a73e8" : "#64748b"}
              />
              <Text
                style={[
                  styles.memberTypeText,
                  memberType === "owner" && styles.memberTypeTextOwnerActive,
                ]}
              >
                Owner Bill
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.memberTypeButton,
                memberType === "staff" && styles.memberTypeButtonStaffActive,
              ]}
              onPress={() => handleSwitchMemberType("staff")}
              activeOpacity={0.8}
            >
              <Ionicons
                name="briefcase-outline"
                size={15}
                color={memberType === "staff" ? "#7c3aed" : "#64748b"}
              />
              <Text
                style={[
                  styles.memberTypeText,
                  memberType === "staff" && styles.memberTypeTextStaffActive,
                ]}
              >
                Staff Slip
              </Text>
            </TouchableOpacity>
          </View>

          {renderStepIndicator()}

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* ================= DESIGN ================= */}

            {step === "design" && (
              <View>
                <Text style={styles.sectionTitle}>Choose a Design</Text>

                <Text style={styles.sectionSubtitle}>
                  Pick a layout. You can still override the accent color below.
                </Text>

                {templates.map((t) => {
                  const isSelected = templateId === t.id;

                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[
                        styles.templateCard,
                        isSelected && {
                          borderColor: accentColor,
                          backgroundColor: accentBg,
                        },
                      ]}
                      onPress={() => {
                        setTemplateId(t.id);
                        setSwatch(t.colors.primary);
                      }}
                      activeOpacity={0.8}
                    >
                      {renderTemplateThumb(t)}

                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.templateName}>{t.name}</Text>
                        <Text style={styles.templateDescription}>
                          {t.description}
                        </Text>
                      </View>

                      {isSelected && (
                        <Ionicons
                          name="checkmark-circle"
                          size={22}
                          color={accentColor}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}

                <Text style={styles.label}>Accent Color Override</Text>

                <View style={styles.swatchRow}>
                  {ACCENT_SWATCHES.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[
                        styles.swatch,
                        { backgroundColor: c },
                        swatch === c && styles.swatchActive,
                      ]}
                      onPress={() => setSwatch(c)}
                    />
                  ))}
                </View>

                <TouchableOpacity
                  style={styles.previewLinkButton}
                  onPress={() => setShowDesignPreview(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="eye-outline" size={16} color={accentColor} />
                  <Text
                    style={[styles.previewLinkText, { color: accentColor }]}
                  >
                    Preview This Design
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.nextButton, { backgroundColor: accentColor }]}
                  onPress={() => setStep("details")}
                  activeOpacity={0.85}
                >
                  <Text style={styles.nextButtonText}>Continue</Text>
                  <Ionicons name="arrow-forward" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            )}

            {/* ================= DETAILS ================= */}

            {step === "details" && (
              <View>
                <Text style={styles.sectionTitle}>Common Details</Text>

                <Text style={styles.sectionSubtitle}>
                  Shown on every {labels.docTitle.toLowerCase()} of this type
                </Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Society Name *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Green Valley Apartments"
                    placeholderTextColor="#999"
                    value={societyName}
                    onChangeText={(value) => {
                      setSocietyName(value);
                      setFormError("");
                    }}
                    returnKeyType="next"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Address</Text>
                  <TextInput
                    style={[
                      styles.input,
                      { height: 60, textAlignVertical: "top" },
                    ]}
                    placeholder="e.g. 123, Main Road, City"
                    placeholderTextColor="#999"
                    value={address}
                    onChangeText={(value) => {
                      setAddress(value);
                      setFormError("");
                    }}
                    multiline
                  />
                </View>

                <View style={styles.rowGroup}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.label}>Society Number</Text>
                    <TextInput
                      style={[
                        styles.input,
                        contactNumber.length > 0 &&
                          contactNumber.length < 10 &&
                          styles.inputError,
                      ]}
                      placeholder="10-digit phone"
                      placeholderTextColor="#999"
                      keyboardType="number-pad"
                      inputMode="numeric"
                      maxLength={10}
                      value={contactNumber}
                      onChangeText={(value) => {
                        setContactNumber(sanitizeContactNumber(value));
                        setFormError("");
                      }}
                      returnKeyType="next"
                    />

                    {contactNumber.length > 0 && contactNumber.length < 10 ? (
                      <Text style={styles.fieldHint}>
                        {10 - contactNumber.length} digit
                        {10 - contactNumber.length === 1 ? "" : "s"} remaining
                      </Text>
                    ) : null}

                    {contactNumber.length === 10 && (
                      <View style={styles.validFieldRow}>
                        <Ionicons
                          name="checkmark-circle"
                          size={12}
                          color="#16a34a"
                        />
                        <Text style={styles.validFieldText}>
                          Valid 10-digit number
                        </Text>
                      </View>
                    )}

                    {contactNumber.length === 0 && (
                      <Text style={styles.optionalHint}>Optional</Text>
                    )}
                  </View>

                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.label}>Society Email</Text>
                    <TextInput
                      style={[
                        styles.input,
                        email.length > 0 &&
                          !validateEmail(email) &&
                          styles.inputError,
                      ]}
                      placeholder="Email"
                      placeholderTextColor="#999"
                      keyboardType="email-address"
                      inputMode="email"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      value={email}
                      onChangeText={(value) => {
                        setEmail(value.trimStart());
                        setFormError("");
                      }}
                      returnKeyType="done"
                    />

                    {email.length > 0 && !validateEmail(email) ? (
                      <Text style={styles.fieldHint}>
                        Enter a valid email address
                      </Text>
                    ) : null}

                    {email.length > 0 && validateEmail(email) ? (
                      <View style={styles.validFieldRow}>
                        <Ionicons
                          name="checkmark-circle"
                          size={12}
                          color="#16a34a"
                        />
                        <Text style={styles.validFieldText}>Valid email</Text>
                      </View>
                    ) : null}

                    {email.length === 0 && (
                      <Text style={styles.optionalHint}>Optional</Text>
                    )}
                  </View>
                </View>

                {formError ? (
                  <View style={styles.formErrorContainer}>
                    <Ionicons name="alert-circle" size={16} color="#dc2626" />
                    <Text style={styles.formErrorText}>{formError}</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={[styles.nextButton, { backgroundColor: accentColor }]}
                  onPress={handleDetailsNext}
                  activeOpacity={0.85}
                >
                  <Text style={styles.nextButtonText}>Continue to Preview</Text>
                  <Ionicons name="arrow-forward" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            )}

            {/* ================= SIGN ================= */}

            {step === "sign" && (
              <View>
                <Text style={styles.sectionTitle}>Signature & Preview</Text>
                <Text style={styles.sectionSubtitle}>
                  This is how {labels.docTitle.toLowerCase()}s will look
                </Text>

                {renderPreviewCard(true)}

                {signature ? (
                  <TouchableOpacity
                    style={styles.changeSignatureButton}
                    onPress={() => setShowSignatureModal(true)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="create-outline"
                      size={15}
                      color={accentColor}
                    />
                    <Text
                      style={[
                        styles.changeSignatureText,
                        { color: accentColor },
                      ]}
                    >
                      Change Signature
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.addSignatureButton,
                      { borderColor: accentColor },
                    ]}
                    onPress={() => setShowSignatureModal(true)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="create-outline"
                      size={22}
                      color={accentColor}
                    />
                    <Text
                      style={[styles.addSignatureText, { color: accentColor }]}
                    >
                      Add Signature (optional)
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[
                    styles.saveTemplateButton,
                    { backgroundColor: accentColor },
                  ]}
                  onPress={handleSaveTemplate}
                  activeOpacity={0.85}
                >
                  <Ionicons name="save-outline" size={20} color="#fff" />
                  <Text style={styles.saveTemplateButtonText}>
                    Save Template
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>

        {/* ================= DESIGN PREVIEW ================= */}

        {showDesignPreview && (
          <View style={styles.previewOverlay}>
            <View style={styles.previewModalBackdrop}>
              <View style={styles.previewModalCard}>
                <View style={styles.previewModalHeader}>
                  <Text style={styles.previewModalTitle}>Design Preview</Text>
                  <TouchableOpacity
                    onPress={() => setShowDesignPreview(false)}
                    style={styles.closeButton}
                  >
                    <Ionicons name="close" size={22} color="#666" />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {renderPreviewCard(false)}
                </ScrollView>

                <TouchableOpacity
                  style={[
                    styles.nextButton,
                    { backgroundColor: accentColor, marginTop: 14 },
                  ]}
                  onPress={() => setShowDesignPreview(false)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.nextButtonText}>Looks Good</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* ================= SIGNATURE ================= */}

        <SignatureCanvas
          visible={showSignatureModal}
          onSave={(sig) => {
            setSignature(sig);
            setShowSignatureModal(false);
          }}
          onCancel={() => setShowSignatureModal(false)}
          existingSign={signature}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 16,
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 22,
    padding: 20,
    maxHeight: "92%",
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },

  headerLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    flex: 1,
  },

  backNavButton: {
    padding: 4,
    marginTop: 2,
  },

  title: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
  },

  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },

  badgeText: {
    fontSize: 10.5,
    fontWeight: "700",
  },

  closeButton: {
    padding: 4,
  },

  memberTypeToggle: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
    gap: 4,
  },

  memberTypeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    borderRadius: 9,
    gap: 6,
  },

  memberTypeButtonOwnerActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#1a73e8",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  memberTypeButtonStaffActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#7c3aed",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  memberTypeText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#64748b",
  },

  memberTypeTextOwnerActive: {
    color: "#1a73e8",
  },

  memberTypeTextStaffActive: {
    color: "#7c3aed",
  },

  stepIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },

  stepItem: {
    flexDirection: "row",
    alignItems: "center",
  },

  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#e2e8f0",
    justifyContent: "center",
    alignItems: "center",
  },

  stepDotText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#94a3b8",
  },

  stepLine: {
    width: 44,
    height: 2,
    backgroundColor: "#e2e8f0",
  },

  scrollContent: {
    paddingBottom: 20,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 4,
  },

  sectionSubtitle: {
    fontSize: 12.5,
    color: "#64748b",
    marginBottom: 14,
  },

  templateCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    marginBottom: 10,
    backgroundColor: "#fff",
  },

  templateThumb: {
    width: 58,
    height: 74,
    borderRadius: 8,
    overflow: "hidden",
  },

  templateName: {
    fontSize: 14.5,
    fontWeight: "700",
    color: "#0f172a",
  },

  templateDescription: {
    fontSize: 11.5,
    color: "#64748b",
    marginTop: 2,
  },

  label: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#475569",
    marginTop: 10,
    marginBottom: 8,
  },

  swatchRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },

  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "transparent",
  },

  swatchActive: {
    borderColor: "#0f172a",
  },

  previewLinkButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    marginBottom: 6,
  },

  previewLinkText: {
    fontSize: 13,
    fontWeight: "700",
  },

  inputGroup: {
    marginBottom: 14,
  },

  rowGroup: {
    flexDirection: "row",
    gap: 10,
  },

  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0f172a",
    backgroundColor: "#fff",
    minHeight: 44,
  },

  inputError: {
    borderColor: "#fca5a5",
  },

  fieldHint: {
    fontSize: 10.5,
    color: "#dc2626",
    marginTop: 4,
    marginLeft: 2,
  },

  optionalHint: {
    fontSize: 10.5,
    color: "#94a3b8",
    marginTop: 4,
    marginLeft: 2,
    fontStyle: "italic",
  },

  validFieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    marginLeft: 2,
  },

  validFieldText: {
    fontSize: 10.5,
    color: "#16a34a",
    fontWeight: "500",
  },

  formErrorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
    gap: 6,
  },

  formErrorText: {
    color: "#dc2626",
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },

  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 8,
  },

  nextButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },

  /* ---------- Preview card wrapper ---------- */
  previewCard: {
    overflow: "hidden",
    marginBottom: 14,
  },

  /* ---------- Bold preview header ---------- */
  previewHeaderBold: {
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  previewHeaderLogo: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  previewHeaderLogoText: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  previewHeaderTitleOnBg: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.3,
  },
  previewHeaderTemplateOnBg: {
    fontSize: 11,
    color: "rgba(255,255,255,0.88)",
    marginTop: 2,
  },

  /* ---------- Classic preview header ---------- */
  previewHeaderClassic: {
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 12,
    alignItems: "center",
  },
  previewHeaderClassicSociety: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 1.2,
    textAlign: "center",
  },
  previewHeaderClassicSub: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 3,
    textAlign: "center",
  },
  previewHeaderClassicRule: {
    width: "100%",
    height: 2,
    marginTop: 12,
  },

  /* ---------- Minimal preview header ---------- */
  previewHeaderMinimal: {
    paddingTop: 12,
    paddingHorizontal: 4,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  previewHeaderMinimalSociety: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
  },
  previewHeaderMinimalSub: {
    fontSize: 10.5,
    color: "#94a3b8",
    marginTop: 2,
  },

  /* ---------- Body ---------- */
  previewBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 0,
  },

  /* ---------- Signature ---------- */
  signatureArea: {
    marginTop: 20,
    alignItems: "center",
  },
  signatureAreaLabel: {
    fontSize: 10.5,
    color: "#94a3b8",
    marginBottom: 6,
  },
  signatureLine: {
    width: 150,
    height: 1,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    marginTop: 28,
  },

  /* ---------- Misc ---------- */
  dummyTag: {
    fontSize: 10,
    color: "#94a3b8",
    fontStyle: "italic",
    marginTop: 12,
    textAlign: "center",
  },

  /* ---------- Signature buttons ---------- */
  addSignatureButton: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 14,
    paddingVertical: 20,
    alignItems: "center",
    backgroundColor: "#f8fafc",
    gap: 6,
    marginBottom: 16,
  },

  addSignatureText: {
    fontSize: 14,
    fontWeight: "700",
  },

  changeSignatureButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 12,
    marginBottom: 16,
  },

  changeSignatureText: {
    fontSize: 13,
    fontWeight: "700",
  },

  saveTemplateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 12,
  },

  saveTemplateButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },

  /* ---------- Design preview modal ---------- */
  previewOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 900,
    elevation: 15,
  },

  previewModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 20,
  },

  previewModalCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 18,
    maxHeight: "85%",
  },

  previewModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },

  previewModalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
  },
});
