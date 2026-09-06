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
  memberType,
  onSaved,
}: GenerateBillModalProps) {
  const { templates, getBillConfig, setBillConfig } = useBillStore();
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
      setContactNumber(cfg?.contactNumber ?? "");
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
    };
    setBillConfig(memberType, config);
    onSaved?.(config);
    onClose();
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

  // Shared preview renderer, used by both the Design-step "Preview This
  // Design" overlay (dummy common details, since none typed yet) and the
  // final Sign step (real common details the admin has typed).
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

    return (
      <View style={styles.previewCard}>
        <View style={[styles.previewHeader, { backgroundColor: swatch }]}>
          <Text style={styles.previewHeaderTitle}>{dummy.docTitle}</Text>
          <Text style={styles.previewHeaderTemplate}>
            {selectedTemplate.name} Template
          </Text>
        </View>
        <View style={styles.previewBody}>
          <Text style={styles.previewSociety}>{displaySociety}</Text>
          {displayAddress ? (
            <Text style={styles.previewSub}>{displayAddress}</Text>
          ) : null}
          {(displayContact || displayEmail) && (
            <Text style={styles.previewSub}>
              {displayContact}
              {displayContact && displayEmail ? "  •  " : ""}
              {displayEmail}
            </Text>
          )}

          <View style={styles.previewDivider} />
          {!useRealCommonDetails && (
            <Text style={styles.dummyTag}>
              Sample preview — your details will appear here
            </Text>
          )}

          {dummy.rows.map(([label, value]) => (
            <View key={label} style={styles.previewRow}>
              <Text style={styles.previewLabel}>{label}</Text>
              <Text style={styles.previewValue}>{value}</Text>
            </View>
          ))}

          <View style={styles.previewDivider} />
          <View style={styles.previewTotalRow}>
            <Text style={styles.previewTotalLabel}>{dummy.totalLabel}</Text>
            <Text style={[styles.previewTotalValue, { color: swatch }]}>
              {dummy.totalValue}
            </Text>
          </View>

          <View style={styles.signatureArea}>
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

          {renderStepIndicator()}

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {step === "design" && (
              <View>
                <Text style={styles.sectionTitle}>Choose a Design</Text>
                <Text style={styles.sectionSubtitle}>
                  This applies to every {labels.docTitle.toLowerCase()}
                </Text>

                {templates.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={[
                      styles.templateCard,
                      templateId === t.id && {
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
                    <View
                      style={[
                        styles.templateColorPreview,
                        { backgroundColor: t.colors.primary },
                      ]}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.templateName}>{t.name}</Text>
                      <Text style={styles.templateDescription}>
                        {t.description}
                      </Text>
                    </View>
                    {templateId === t.id && (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color={accentColor}
                      />
                    )}
                  </TouchableOpacity>
                ))}

                <Text style={styles.label}>Accent Color</Text>
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
                    onChangeText={(v) => {
                      setSocietyName(v);
                      setFormError("");
                    }}
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
                    onChangeText={setAddress}
                    multiline
                  />
                </View>
                <View style={styles.rowGroup}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.label}>Contact Number</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Phone"
                      placeholderTextColor="#999"
                      keyboardType="phone-pad"
                      value={contactNumber}
                      onChangeText={setContactNumber}
                    />
                  </View>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.label}>Email</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Email"
                      placeholderTextColor="#999"
                      keyboardType="email-address"
                      value={email}
                      onChangeText={setEmail}
                    />
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

        {/*
          Design-step "Preview This Design" - rendered as an inline overlay
          instead of a nested <Modal>. Two <Modal>s stacked on top of each
          other is the root cause of Android touch/state glitches (see the
          signature canvas note below for the full explanation) - so this,
          like the signature canvas, is now a plain absolutely-positioned
          View living inside this same outer Modal.
        */}
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
                <ScrollView showsVerticalScrollIndicator={false}>
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

        {/*
          Signature canvas - fixed to no longer be its own <Modal>.
          ROOT CAUSE of "drawing disappears on finger release": this was
          previously rendered as its own <Modal>, opened while this
          GenerateBillModal's <Modal> was already open underneath it.
          Nested Modals on Android are each backed by a SEPARATE native
          window, and touch/focus handoff between two stacked native
          windows is a known source of exactly this symptom - drawing works
          fine while the finger is down (one window has focus), then on
          release a stray touch-up event or a forced re-render reaches the
          modal underneath and the drawing state appears to reset.

          Fix: SignatureCanvas is now a plain full-screen absolutely
          positioned overlay View (see its "visible ? ... : null" render),
          rendered here as a normal sibling INSIDE this Modal's content.
          Only one native modal window exists at any time, so there's no
          window to steal focus/touches away mid-gesture.
        */}
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
    marginBottom: 14,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    flex: 1,
  },
  backNavButton: { padding: 4, marginTop: 2 },
  title: { fontSize: 17, fontWeight: "800", color: "#0f172a" },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  badgeText: { fontSize: 10.5, fontWeight: "700" },
  closeButton: { padding: 4 },

  stepIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  stepItem: { flexDirection: "row", alignItems: "center" },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#e2e8f0",
    justifyContent: "center",
    alignItems: "center",
  },
  stepDotText: { fontSize: 12, fontWeight: "700", color: "#94a3b8" },
  stepLine: { width: 44, height: 2, backgroundColor: "#e2e8f0" },

  scrollContent: { paddingBottom: 20 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 4,
  },
  sectionSubtitle: { fontSize: 12.5, color: "#64748b", marginBottom: 14 },

  templateCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    marginBottom: 10,
    backgroundColor: "#fff",
  },
  templateColorPreview: { width: 38, height: 38, borderRadius: 10 },
  templateName: { fontSize: 14.5, fontWeight: "700", color: "#0f172a" },
  templateDescription: { fontSize: 11.5, color: "#64748b", marginTop: 2 },

  label: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#475569",
    marginTop: 10,
    marginBottom: 8,
  },
  swatchRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "transparent",
  },
  swatchActive: { borderColor: "#0f172a" },

  previewLinkButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    marginBottom: 6,
  },
  previewLinkText: { fontSize: 13, fontWeight: "700" },

  inputGroup: { marginBottom: 14 },
  rowGroup: { flexDirection: "row", gap: 10 },
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

  formErrorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
    gap: 6,
  },
  formErrorText: { color: "#dc2626", fontSize: 13, fontWeight: "500" },

  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 8,
  },
  nextButtonText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  previewCard: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 14,
  },
  previewHeader: { padding: 14, alignItems: "center" },
  previewHeaderTitle: { fontSize: 15, fontWeight: "800", color: "#fff" },
  previewHeaderTemplate: {
    fontSize: 10.5,
    color: "rgba(255,255,255,0.85)",
    marginTop: 2,
  },
  previewBody: { padding: 16, backgroundColor: "#fff" },
  previewSociety: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
  },
  previewSub: {
    fontSize: 11.5,
    color: "#64748b",
    textAlign: "center",
    marginTop: 2,
  },
  previewDivider: { height: 1, backgroundColor: "#f1f5f9", marginVertical: 10 },
  dummyTag: {
    fontSize: 10.5,
    color: "#94a3b8",
    fontStyle: "italic",
    marginBottom: 6,
    textAlign: "center",
  },
  previewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  previewLabel: { fontSize: 12.5, color: "#64748b" },
  previewValue: { fontSize: 12.5, fontWeight: "700", color: "#0f172a" },
  previewTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  previewTotalLabel: { fontSize: 14, fontWeight: "800", color: "#0f172a" },
  previewTotalValue: { fontSize: 20, fontWeight: "800" },

  signatureArea: { marginTop: 20, alignItems: "center" },
  signatureAreaLabel: { fontSize: 10.5, color: "#94a3b8", marginBottom: 6 },
  signatureLine: {
    width: 150,
    height: 1,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    marginTop: 28,
  },

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
  addSignatureText: { fontSize: 14, fontWeight: "700" },
  changeSignatureButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 12,
    marginBottom: 16,
  },
  changeSignatureText: { fontSize: 13, fontWeight: "700" },

  saveTemplateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 12,
  },
  saveTemplateButtonText: { fontSize: 15, fontWeight: "700", color: "#fff" },

  // Overlay wrapper for the design-preview panel, replacing the old
  // separate <Modal>. zIndex/elevation keep it above the main card content
  // within this same Modal's native window.
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
  previewModalTitle: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
});
