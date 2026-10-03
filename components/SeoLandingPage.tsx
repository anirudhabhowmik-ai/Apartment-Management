import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import Head from "expo-router/head";
import { useEffect, useState } from "react";
import {
    Image,
    Pressable,
  Platform,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from "react-native";
import { ANDROID_APK_URL } from "../utils/appDownloads";
const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL?.replace(/\/+$/, "");
const PAGE_TITLE =
  "Apartment Management App for Societies | Apartment Management";
const PAGE_DESCRIPTION =
  "Manage apartment residents, maintenance bills, payments, expenses, and staff attendance in one place with the Apartment Management app.";

const features = [
  {
    icon: "people-outline" as const,
    title: "Resident records",
    description:
      "Keep apartment members and staff details organized by property.",
    color: "#126B58",
    background: "#E5F3ED",
  },
  {
    icon: "receipt-outline" as const,
    title: "Bills and payments",
    description:
      "Create maintenance bills and keep payment history easy to review.",
    color: "#B45432",
    background: "#F8EAE2",
  },
  {
    icon: "wallet-outline" as const,
    title: "Expenses and balances",
    description:
      "Track property expenses and see the account picture in one place.",
    color: "#4B5F9A",
    background: "#E9EDF8",
  },
  {
    icon: "calendar-outline" as const,
    title: "Staff attendance",
    description: "Record attendance and review staff payment details by month.",
    color: "#8A6417",
    background: "#F6F0DD",
  },
];

export default function SeoLandingPage() {
  const { width } = useWindowDimensions();
  const [webViewportWidth, setWebViewportWidth] = useState<number | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const updateWidth = () => setWebViewportWidth(window.innerWidth);
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  const responsiveWidth = webViewportWidth ?? width;
  const isWide = responsiveWidth >= 900;
  const isCompactDesktop = responsiveWidth >= 600 && responsiveWidth < 900;
  const isMobile = responsiveWidth < 600;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Apartment Management",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Android",
    description: PAGE_DESCRIPTION,
    downloadUrl: ANDROID_APK_URL,
    ...(SITE_URL ? { url: SITE_URL } : {}),
  };

  return (
    <>
      <Head>
        <title>{PAGE_TITLE}</title>
        <meta name="description" content={PAGE_DESCRIPTION} />
        <meta name="robots" content="index, follow" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={PAGE_TITLE} />
        <meta property="og:description" content={PAGE_DESCRIPTION} />
        <meta property="og:site_name" content="Apartment Management" />
        <meta name="twitter:card" content="summary" />
        {SITE_URL ? <link rel="canonical" href={SITE_URL} /> : null}
        {SITE_URL ? <meta property="og:url" content={SITE_URL} /> : null}
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      </Head>
      <ScrollView
        style={styles.page}
        contentContainerStyle={styles.pageContent}
      >
        <View style={[styles.header, isMobile && styles.headerMobile]}>
          <View style={styles.brand}>
            <Image
              source={require("../assets/images/logo-mark.png")}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.brandName}>Apartment Management</Text>
          </View>
          <View
            style={[
              styles.headerActions,
              isMobile && styles.headerActionsMobile,
            ]}
          >
            <Link href="/(auth)/login" style={styles.signInLink}>
              Sign in
            </Link>
            <DownloadButton compact light />
          </View>
        </View>

        <View
          style={[
            styles.hero,
            isWide && styles.heroWide,
              isCompactDesktop && styles.heroCompact,
            isMobile && styles.heroMobile,
          ]}
        >
            <View
              style={[styles.heroCopy, isCompactDesktop && styles.heroCopyCompact]}
            >
            <View style={[styles.eyebrow, isMobile && styles.eyebrowMobile]}>
              <View style={styles.eyebrowDot} />
              <Text style={styles.eyebrowText}>
                MADE FOR EVERYDAY PROPERTY WORK
              </Text>
            </View>
            <Text
              accessibilityRole="header"
              style={[
                styles.heroTitle,
                isCompactDesktop && styles.heroTitleCompact,
                isMobile && styles.heroTitleMobile,
              ]}
            >
               Apartment management, all in one place.
            </Text>
            <Text
              style={[
                styles.heroDescription,
                isMobile && styles.heroDescriptionMobile,
                  isCompactDesktop && styles.heroDescriptionCompact,
              ]}
            >
              Manage residents, maintenance bills, payments, expenses, and staff
              attendance with one straightforward apartment management app.
            </Text>
            <View
              style={[styles.heroActions, isMobile && styles.heroActionsMobile]}
            >
              <DownloadButton />
              <Link href="#features" style={styles.secondaryLink}>
                Explore features{" "}
                <Ionicons name="arrow-down" size={16} color="#193E35" />
              </Link>
            </View>
            <View
              style={[styles.trustNote, isMobile && styles.trustNoteMobile]}
            >
              <Ionicons name="logo-android" size={17} color="#126B58" />
              <Text style={styles.trustText}>
                Android APK available now. iOS app coming soon.
              </Text>
            </View>
          </View>

          <View
            style={[styles.preview, isCompactDesktop && styles.previewCompact]}
          >
            <View style={styles.previewTopline}>
              <View>
                <Text style={styles.previewLabel}>PROPERTY OVERVIEW</Text>
                <Text style={styles.previewTitle}>
                  A clearer view of the month
                </Text>
              </View>
              <View style={styles.previewIcon}>
                <Ionicons name="business-outline" size={21} color="#126B58" />
              </View>
            </View>
            <View style={styles.balancePanel}>
              <Text style={styles.balanceLabel}>MAINTENANCE TRACKING</Text>
              <View style={styles.balanceRow}>
                <Text style={styles.balanceValue}>Bills & payments</Text>
                <Ionicons name="arrow-forward" size={18} color="#126B58" />
              </View>
              <View style={styles.progressTrack}>
                <View style={styles.progressValue} />
              </View>
              <Text style={styles.balanceFootnote}>
                Keep collections and payment history together
              </Text>
            </View>
            <View style={styles.previewRows}>
              <PreviewRow
                icon="people-outline"
                label="Residents & staff"
                detail="Member records"
                color="#126B58"
              />
              <PreviewRow
                icon="wallet-outline"
                label="Property expenses"
                detail="Account activity"
                color="#B45432"
              />
              <PreviewRow
                icon="calendar-outline"
                label="Staff attendance"
                detail="Monthly records"
                color="#4B5F9A"
              />
            </View>
            <Text style={styles.previewFootnote}>
              Apartment Management for day-to-day operations
            </Text>
          </View>
        </View>

        <View
          nativeID="features"
          style={[
            styles.featuresSection,
            isMobile && styles.featuresSectionMobile,
          ]}
        >
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionKicker}>ONE PRACTICAL TOOLKIT</Text>
            <Text
              style={[
                styles.sectionTitle,
                isMobile && styles.sectionTitleMobile,
              ]}
            >
              The work behind a well-run apartment
            </Text>
            <Text style={styles.sectionDescription}>
              Bring routine property tasks into a single app, from resident
              records to monthly collections and staff attendance.
            </Text>
          </View>
          <View
            style={[styles.featureGrid, isMobile && styles.featureGridMobile]}
          >
            {features.map((feature) => (
              <View
                key={feature.title}
                style={[
                  styles.featureItem,
                  isMobile && styles.featureItemMobile,
                ]}
              >
                <View
                  style={[
                    styles.featureIcon,
                    { backgroundColor: feature.background },
                  ]}
                >
                  <Ionicons
                    name={feature.icon}
                    size={21}
                    color={feature.color}
                  />
                </View>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDescription}>
                  {feature.description}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.bottomCta, isMobile && styles.bottomCtaMobile]}>
          <View
            style={[
              styles.bottomCtaCopy,
              isMobile && styles.bottomCtaCopyMobile,
            ]}
          >
            <Text
              style={[
                styles.bottomCtaTitle,
                isMobile && styles.bottomCtaTitleMobile,
              ]}
            >
              Bring your property records together.
            </Text>
            <Text style={styles.bottomCtaText}>
              Android APK available now. iOS is coming soon.
            </Text>
          </View>
          <View
            style={[
              styles.bottomCtaActions,
              isMobile && styles.bottomCtaActionsMobile,
            ]}
          >
            <DownloadButton fullWidth={isMobile} />
            <Link href="/(auth)/login" style={styles.bottomSignIn}>
              Sign in on the web
            </Link>
          </View>
        </View>

        <View style={[styles.footer, isMobile && styles.footerMobile]}>
          <Text style={styles.footerText}>Apartment Management</Text>
          <Text style={styles.footerNote}>
            Property, resident, and payment management.
          </Text>
        </View>
      </ScrollView>
    </>
  );
}

function DownloadButton({
  compact = false,
  fullWidth = false,
  light = false,
}: {
  compact?: boolean;
  fullWidth?: boolean;
  light?: boolean;
}) {
  return (
    <Link href={ANDROID_APK_URL} asChild>
      <Pressable
        accessibilityLabel="Download the Apartment Management Android app"
        style={StyleSheet.flatten([
          styles.downloadButton,
          compact && styles.downloadButtonCompact,
          fullWidth && styles.downloadButtonFullWidth,
          light && styles.downloadButtonLight,
        ])}
      >
        <Ionicons
          name="logo-android"
          size={19}
          color={light ? "#126B58" : "#FFFFFF"}
        />
        <Text
          style={[
            styles.downloadButtonText,
            light && styles.downloadButtonTextLight,
          ]}
        >
          {compact ? "Get the app" : "Download Android app"}
        </Text>
        {!compact ? (
          <Ionicons name="arrow-forward" size={17} color="#FFFFFF" />
        ) : null}
      </Pressable>
    </Link>
  );
}

function PreviewRow({
  icon,
  label,
  detail,
  color,
}: {
  icon: "people-outline" | "wallet-outline" | "calendar-outline";
  label: string;
  detail: string;
  color: string;
}) {
  return (
    <View style={styles.previewRow}>
      <View style={[styles.previewRowIcon, { backgroundColor: `${color}14` }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={styles.previewRowCopy}>
        <Text style={styles.previewRowTitle}>{label}</Text>
        <Text style={styles.previewRowDetail}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#86918C" />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F6F7F2" },
  pageContent: {
    paddingHorizontal: 24,
    paddingBottom: 36,
    alignItems: "center",
  },
  header: {
    width: "100%",
    maxWidth: 1160,
    height: 82,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    backgroundColor: "#17372E",
    borderRadius: 8,
  },
  headerMobile: {
    height: "auto",
    minHeight: 88,
    flexWrap: "wrap",
    justifyContent: "flex-start",
    rowGap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
  logo: { width: 34, height: 34 },
  brandName: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 22 },
  headerActionsMobile: {
    width: "100%",
    justifyContent: "space-between",
    gap: 12,
  },
  signInLink: {
    color: "#E9F1EC",
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "none",
  },
  hero: {
    width: "100%",
    maxWidth: 1160,
    paddingTop: 66,
    paddingBottom: 70,
    gap: 52,
  },
  heroWide: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroCompact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 42,
    paddingBottom: 50,
    gap: 24,
  },
  heroMobile: { paddingTop: 38, paddingBottom: 46, gap: 30 },
  heroCopy: { flex: 1, maxWidth: 570, alignItems: "flex-start" },
  heroCopyCompact: { minWidth: 0, maxWidth: 300 },
  eyebrow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 20,
  },
  eyebrowMobile: { marginBottom: 14 },
  eyebrowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#D8744B",
  },
  eyebrowText: {
    color: "#52645C",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0,
  },
  heroTitle: {
    color: "#17372E",
    fontSize: 51,
    lineHeight: 57,
    fontWeight: "700",
    fontFamily: "serif",
    maxWidth: 550,
  },
  heroTitleMobile: { fontSize: 38, lineHeight: 44 },
  heroTitleCompact: { fontSize: 34, lineHeight: 40 },
  heroDescription: {
    color: "#52645C",
    fontSize: 17,
    lineHeight: 27,
    marginTop: 20,
    maxWidth: 510,
  },
  heroDescriptionMobile: { fontSize: 16, lineHeight: 25, marginTop: 16 },
  heroDescriptionCompact: { fontSize: 15, lineHeight: 23, marginTop: 14 },
  heroActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 20,
    marginTop: 27,
  },
  heroActionsMobile: { gap: 14, marginTop: 22 },
  downloadButton: {
    minHeight: 50,
    paddingHorizontal: 18,
    borderRadius: 7,
    backgroundColor: "#126B58",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  downloadButtonCompact: { minHeight: 40, paddingHorizontal: 13, gap: 8 },
  downloadButtonLight: { backgroundColor: "#FFFFFF" },
  downloadButtonFullWidth: { width: "100%" },
  downloadButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  downloadButtonTextLight: { color: "#126B58" },
  secondaryLink: {
    color: "#193E35",
    fontSize: 14,
    fontWeight: "700",
    textDecorationLine: "none",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  trustNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 23,
  },
  trustNoteMobile: { alignItems: "flex-start", marginTop: 18 },
  trustText: { color: "#66766E", fontSize: 12 },
  preview: {
    width: "100%",
    maxWidth: 430,
    padding: 22,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DEE4DA",
    backgroundColor: "#FFFFFF",
  },
  previewCompact: { width: "auto", flex: 1, minWidth: 0, maxWidth: 340, padding: 18 },
  previewTopline: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  previewLabel: {
    color: "#75847C",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0,
  },
  previewTitle: {
    color: "#17372E",
    fontSize: 17,
    fontWeight: "700",
    marginTop: 6,
  },
  previewIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: "#E5F3ED",
    alignItems: "center",
    justifyContent: "center",
  },
  balancePanel: { padding: 17, borderRadius: 6, backgroundColor: "#F4F7F2" },
  balanceLabel: { color: "#738078", fontSize: 10, fontWeight: "700" },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  balanceValue: { color: "#17372E", fontSize: 19, fontWeight: "700" },
  progressTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: "#DCE5DD",
    marginTop: 15,
    overflow: "hidden",
  },
  progressValue: {
    width: "68%",
    height: "100%",
    borderRadius: 4,
    backgroundColor: "#3D9678",
  },
  balanceFootnote: { color: "#75847C", fontSize: 11, marginTop: 9 },
  previewRows: { marginTop: 10 },
  previewRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#EEF0EB",
    gap: 11,
  },
  previewRowIcon: {
    width: 34,
    height: 34,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  previewRowCopy: { flex: 1 },
  previewRowTitle: { color: "#2D433A", fontSize: 13, fontWeight: "600" },
  previewRowDetail: { color: "#839087", fontSize: 11, marginTop: 3 },
  previewFootnote: {
    color: "#7E8B83",
    fontSize: 10,
    marginTop: 14,
    textAlign: "center",
  },
  featuresSection: {
    width: "100%",
    maxWidth: 1160,
    borderTopWidth: 1,
    borderTopColor: "#E1E5DC",
    paddingTop: 54,
    paddingBottom: 60,
  },
  featuresSectionMobile: { paddingTop: 38, paddingBottom: 40 },
  sectionHeading: { maxWidth: 640 },
  sectionKicker: { color: "#B45432", fontSize: 11, fontWeight: "700" },
  sectionTitle: {
    color: "#17372E",
    fontSize: 32,
    lineHeight: 39,
    fontWeight: "700",
    marginTop: 10,
    fontFamily: "serif",
  },
  sectionTitleMobile: { fontSize: 27, lineHeight: 34 },
  sectionDescription: {
    color: "#64746C",
    fontSize: 15,
    lineHeight: 24,
    marginTop: 11,
  },
  featureGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 28,
    marginTop: 34,
  },
  featureGridMobile: {
    flexDirection: "column",
    gap: 22,
    marginTop: 26,
  },
  featureItem: {
    flexGrow: 1,
    flexBasis: 210,
    maxWidth: 265,
    alignItems: "flex-start",
  },
  featureItemMobile: { width: "100%", maxWidth: "100%" },
  featureIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  featureTitle: { color: "#213D33", fontSize: 15, fontWeight: "700" },
  featureDescription: {
    color: "#66766E",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 7,
  },
  bottomCta: {
    width: "100%",
    maxWidth: 1160,
    padding: 25,
    backgroundColor: "#E8EEE6",
    borderRadius: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 20,
  },
  bottomCtaMobile: { padding: 18, gap: 16 },
  bottomCtaCopy: { flex: 1, minWidth: 240 },
  bottomCtaCopyMobile: { minWidth: 0, width: "100%" },
  bottomCtaTitle: { color: "#17372E", fontSize: 20, fontWeight: "700" },
  bottomCtaTitleMobile: { fontSize: 18, lineHeight: 25 },
  bottomCtaText: { color: "#64746C", fontSize: 13, marginTop: 6 },
  bottomCtaActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 18,
  },
  bottomCtaActionsMobile: {
    width: "100%",
    flexDirection: "column",
    alignItems: "stretch",
    gap: 14,
  },
  bottomSignIn: {
    color: "#193E35",
    fontSize: 13,
    fontWeight: "700",
    textDecorationLine: "none",
  },
  footer: {
    width: "100%",
    maxWidth: 1160,
    paddingTop: 24,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
  },
  footerMobile: { flexDirection: "column", alignItems: "flex-start" },
  footerText: { color: "#53645B", fontSize: 12, fontWeight: "700" },
  footerNote: { color: "#829087", fontSize: 12 },
});
