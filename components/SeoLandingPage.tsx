import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import Head from "expo-router/head";
import { useEffect, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { ANDROID_APK_URL } from "../utils/appDownloads";

const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL?.replace(/\/+$/, "");

// ── EDIT THESE ────────────────────────────────────────────────────
// There is no separate register screen: OTP login creates the account.
const SIGNUP_HREF = "/(auth)/login";
// Your WhatsApp number with country code, digits only (e.g. "919876543210").
// Leave empty ("") to hide the WhatsApp buttons.
const WHATSAPP_NUMBER = "";
// Short pricing line shown near the buttons. Make sure it is TRUE.
const PRICING_NOTE = "Free to get started. No credit card needed.";
// ──────────────────────────────────────────────────────────────────

const PAGE_TITLE =
  "Society Maintenance Software | Bills, Income & Expenses, Salary Slips";
const PAGE_DESCRIPTION =
  "Apartment society app for secretaries: collect maintenance, track income and expenses, and manage staff. Residents download their own bills, staff download salary slips.";

const VIDEO_ID = "_yDyKPzM4M0";
const VIDEO_START_SECONDS = 0;

const WHATSAPP_URL = WHATSAPP_NUMBER
  ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
      "Hi, I want to know more about the Apartment Management app for my society.",
    )}`
  : "";

const features = [
  {
    icon: "people-outline" as const,
    title: "Resident records",
    description:
      "Keep flat owners, tenants and staff details organized by property.",
    color: "#126B58",
    background: "#E5F3ED",
  },
  {
    icon: "receipt-outline" as const,
    title: "Maintenance bills",
    description:
      "Create monthly maintenance bills and see who has paid and who is pending.",
    color: "#B45432",
    background: "#F8EAE2",
  },
  {
    icon: "wallet-outline" as const,
    title: "Income & expenses",
    description:
      "Record society income and every expense, and see the full account picture in one place.",
    color: "#4B5F9A",
    background: "#E9EDF8",
  },
  {
    icon: "download-outline" as const,
    title: "Resident bill download",
    description:
      "Residents log in, track their maintenance dues and download their own bills. No more bill requests to the secretary.",
    color: "#126B58",
    background: "#E5F3ED",
  },
  {
    icon: "calendar-outline" as const,
    title: "Staff attendance",
    description:
      "Record daily attendance for guards, cleaners and other staff, month by month.",
    color: "#8A6417",
    background: "#F6F0DD",
  },
  {
    icon: "document-text-outline" as const,
    title: "Salary slips",
    description:
      "Staff can download their salary slips, so payment records are clear for everyone.",
    color: "#B45432",
    background: "#F8EAE2",
  },
];

const steps = [
  {
    title: "Sign in with OTP",
    text: "Verify with an OTP and your account is ready. There is nothing to register.",
  },
  {
    title: "Create your property",
    text: "Add your apartment society or building details.",
  },
  {
    title: "Add residents & staff",
    text: "Then create maintenance bills and record income, expenses and attendance.",
  },
];

const roles = [
  {
    icon: "shield-checkmark-outline" as const,
    who: "Secretary",
    points: [
      "Create and track maintenance bills",
      "Record income and expenses",
      "Manage residents, staff and attendance",
    ],
  },
  {
    icon: "home-outline" as const,
    who: "Resident",
    points: [
      "Track maintenance dues and payments",
      "Download maintenance bills anytime",
      "Less follow-up with the secretary",
    ],
  },
  {
    icon: "briefcase-outline" as const,
    who: "Staff",
    points: [
      "View attendance records",
      "Download salary slips",
      "Clear monthly payment details",
    ],
  },
];

export default function SeoLandingPage() {
  const { width } = useWindowDimensions();

  // Hydration-safe + layout-safe: start desktop-friendly, then switch to the
  // real viewport width after mount on web.
  const [webViewportWidth, setWebViewportWidth] = useState<number>(1024);

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const updateWidth = () => {
      const w =
        typeof window !== "undefined"
          ? window.innerWidth || document.documentElement?.clientWidth || 1024
          : 1024;
      setWebViewportWidth(w);
    };

    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  const responsiveWidth =
    webViewportWidth && webViewportWidth > 0
      ? webViewportWidth
      : width && width > 0
        ? width
        : 1024;

  // "Watch demo" scrolls to the video section and starts playing it.
  const [videoPlaying, setVideoPlaying] = useState(false);
  const watchDemo = () => {
    setVideoPlaying(true);
    if (Platform.OS === "web" && typeof document !== "undefined") {
      setTimeout(() => {
        document
          .getElementById("video")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    }
  };

  const isWide = responsiveWidth >= 900;
  const isCompactDesktop = responsiveWidth >= 600 && responsiveWidth < 900;
  const isMobile = responsiveWidth < 600;

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Apartment Management",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Android, Web",
    description: PAGE_DESCRIPTION,
    downloadUrl: ANDROID_APK_URL,
    ...(SITE_URL ? { url: SITE_URL } : {}),
    video: {
      "@type": "VideoObject",
      name: "How to use Apartment Management",
      description:
        "A short walkthrough showing how to set up and use the Apartment Management app.",
      thumbnailUrl: `https://img.youtube.com/vi/${VIDEO_ID}/maxresdefault.jpg`,
      uploadDate: "2026-10-04",
      contentUrl: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
      embedUrl: `https://www.youtube.com/embed/${VIDEO_ID}`,
    },
  };

  return (
    <>
      <Head>
        <title>{PAGE_TITLE}</title>
        <meta
          name="google-site-verification"
          content="9T0gUIERl2OwMTf_zqwbokswq203y_NKljCJyOBny6Y"
        />
        <meta name="theme-color" content="#F6F7F2" />
        <meta name="description" content={PAGE_DESCRIPTION} />
        <meta name="robots" content="index, follow" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={PAGE_TITLE} />
        <meta property="og:description" content={PAGE_DESCRIPTION} />
        <meta property="og:site_name" content="Apartment Management" />
        <meta
          property="og:image"
          content={`https://img.youtube.com/vi/${VIDEO_ID}/maxresdefault.jpg`}
        />
        <meta name="twitter:card" content="summary_large_image" />
        {SITE_URL ? <link rel="canonical" href={SITE_URL} /> : null}
        {SITE_URL ? <meta property="og:url" content={SITE_URL} /> : null}
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      </Head>

      <ScrollView
        style={styles.page}
        contentContainerStyle={styles.pageContent}
        // @ts-ignore — RNW accepts this DOM attribute
        suppressHydrationWarning
      >
        {/* ── HEADER ────────────────────────────────────────────── */}
        <View
          style={[styles.header, isMobile && styles.headerMobile]}
          // @ts-ignore
          suppressHydrationWarning
        >
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

        {/* ── HERO ──────────────────────────────────────────────── */}
        <View
          style={[
            styles.hero,
            isWide && styles.heroWide,
            isCompactDesktop && styles.heroCompact,
            isMobile && styles.heroMobile,
          ]}
          // @ts-ignore
          suppressHydrationWarning
        >
          <View
            style={[
              styles.heroCopy,
              isCompactDesktop && styles.heroCopyCompact,
            ]}
            // @ts-ignore
            suppressHydrationWarning
          >
            <View style={[styles.eyebrow, isMobile && styles.eyebrowMobile]}>
              <View style={styles.eyebrowDot} />
              <Text style={styles.eyebrowText}>
                FOR SOCIETY SECRETARIES, RESIDENTS & STAFF
              </Text>
            </View>
            <Text
              accessibilityRole="header"
              style={[
                styles.heroTitle,
                isCompactDesktop && styles.heroTitleCompact,
                isMobile && styles.heroTitleMobile,
              ]}
              // @ts-ignore
              suppressHydrationWarning
            >
              Run your society's maintenance and accounts in minutes.
            </Text>
            <Text
              style={[
                styles.heroDescription,
                isMobile && styles.heroDescriptionMobile,
                isCompactDesktop && styles.heroDescriptionCompact,
              ]}
              // @ts-ignore
              suppressHydrationWarning
            >
              Create maintenance bills, record income and expenses, and manage
              staff attendance. Residents download their own bills and staff
              download their own salary slips, so you stop handling requests one
              by one.
            </Text>
            <View
              style={[styles.heroActions, isMobile && styles.heroActionsMobile]}
              // @ts-ignore
              suppressHydrationWarning
            >
              <DownloadButton fullWidth={isMobile} />
              <SignupButton
                outline
                fullWidth={isMobile}
                label="Use on web (OTP login)"
              />
              <Pressable
                onPress={watchDemo}
                accessibilityRole="button"
                accessibilityLabel="Watch the demo video"
                style={styles.secondaryLink}
              >
                <Text style={styles.secondaryLinkText}>Watch demo</Text>
                <Ionicons
                  name="play-circle-outline"
                  size={18}
                  color="#193E35"
                />
              </Pressable>
            </View>
            {PRICING_NOTE ? (
              <View
                style={[styles.trustNote, isMobile && styles.trustNoteMobile]}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={17}
                  color="#126B58"
                />
                <Text style={styles.trustText}>{PRICING_NOTE}</Text>
              </View>
            ) : null}
            <View style={styles.platformRow}>
              <Ionicons name="lock-closed-outline" size={16} color="#66766E" />
              <Text style={styles.trustText}>
                Sign in with OTP. No password to remember. Android app (APK) and
                web. iOS coming soon.
              </Text>
            </View>
          </View>

          <View
            style={[styles.preview, isCompactDesktop && styles.previewCompact]}
            // @ts-ignore
            suppressHydrationWarning
          >
            <View style={styles.previewTopline}>
              <View>
                <Text style={styles.previewLabel}>SOCIETY OVERVIEW</Text>
                <Text style={styles.previewTitle}>Everything in one place</Text>
              </View>
              <View style={styles.previewIcon}>
                <Ionicons name="business-outline" size={21} color="#126B58" />
              </View>
            </View>
            <View style={styles.balancePanel}>
              <Text style={styles.balanceLabel}>MONTHLY MAINTENANCE</Text>
              <View style={styles.balanceRow}>
                <Text style={styles.balanceValue}>Paid vs pending</Text>
                <Ionicons name="arrow-forward" size={18} color="#126B58" />
              </View>
              <View style={styles.progressTrack}>
                <View style={styles.progressValue} />
              </View>
              <Text style={styles.balanceFootnote}>
                See collections and dues at a glance
              </Text>
            </View>
            <View style={styles.previewRows}>
              <PreviewRow
                icon="wallet-outline"
                label="Income & expenses"
                detail="Society accounts"
                color="#4B5F9A"
              />
              <PreviewRow
                icon="download-outline"
                label="Resident bills"
                detail="Download anytime"
                color="#126B58"
              />
              <PreviewRow
                icon="document-text-outline"
                label="Staff salary slips"
                detail="Download anytime"
                color="#B45432"
              />
            </View>
            <Text style={styles.previewFootnote}>
              Built for day-to-day society work
            </Text>
          </View>
        </View>

        {/* ── HOW IT WORKS ──────────────────────────────────────── */}
        <View
          style={[styles.rolesSection, isMobile && styles.rolesSectionMobile]}
        >
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionKicker}>GET STARTED IN 3 STEPS</Text>
            <Text
              style={[
                styles.sectionTitle,
                isMobile && styles.sectionTitleMobile,
              ]}
            >
              No forms, no password. Just verify and begin.
            </Text>
          </View>
          <View style={[styles.roleGrid, isMobile && styles.roleGridMobile]}>
            {steps.map((step, i) => (
              <View
                key={step.title}
                style={[styles.roleCard, isMobile && styles.roleCardMobile]}
              >
                <View style={styles.roleHeader}>
                  <View style={styles.roleIcon}>
                    <Text style={styles.stepNumber}>{i + 1}</Text>
                  </View>
                  <Text style={styles.roleTitle}>{step.title}</Text>
                </View>
                <Text style={styles.rolePointText}>{step.text}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── WHO IS IT FOR ─────────────────────────────────────── */}
        <View
          style={[styles.rolesSection, isMobile && styles.rolesSectionMobile]}
        >
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionKicker}>ONE APP, THREE LOGINS</Text>
            <Text
              style={[
                styles.sectionTitle,
                isMobile && styles.sectionTitleMobile,
              ]}
            >
              Less work for the secretary, more clarity for everyone
            </Text>
          </View>
          <View style={[styles.roleGrid, isMobile && styles.roleGridMobile]}>
            {roles.map((role) => (
              <View
                key={role.who}
                style={[styles.roleCard, isMobile && styles.roleCardMobile]}
              >
                <View style={styles.roleHeader}>
                  <View style={styles.roleIcon}>
                    <Ionicons name={role.icon} size={20} color="#126B58" />
                  </View>
                  <Text style={styles.roleTitle}>{role.who}</Text>
                </View>
                {role.points.map((point) => (
                  <View key={point} style={styles.rolePoint}>
                    <Ionicons name="checkmark" size={16} color="#126B58" />
                    <Text style={styles.rolePointText}>{point}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </View>

        {/* ── VIDEO SECTION ─────────────────────────────────────── */}
        <View
          nativeID="video"
          style={[styles.videoSection, isMobile && styles.videoSectionMobile]}
        >
          <View style={styles.videoHeading}>
            <Text style={styles.sectionKicker}>QUICK WALKTHROUGH</Text>
            <Text
              style={[
                styles.sectionTitle,
                isMobile && styles.sectionTitleMobile,
              ]}
            >
              See how it works
            </Text>
            <Text style={styles.sectionDescription}>
              A short walkthrough showing how to manage residents, create bills,
              and track expenses with the Apartment Management app.
            </Text>
          </View>
          <DemoVideo playing={videoPlaying} setPlaying={setVideoPlaying} />
          <View style={styles.videoCta}>
            <DownloadButton fullWidth={isMobile} />
          </View>
        </View>

        {/* ── FEATURES ──────────────────────────────────────────── */}
        <View
          nativeID="features"
          style={[
            styles.featuresSection,
            isMobile && styles.featuresSectionMobile,
          ]}
          // @ts-ignore
          suppressHydrationWarning
        >
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionKicker}>WHAT YOU GET</Text>
            <Text
              style={[
                styles.sectionTitle,
                isMobile && styles.sectionTitleMobile,
              ]}
            >
              The work behind a well-run apartment society
            </Text>
            <Text style={styles.sectionDescription}>
              From resident records to monthly collections, expenses, staff
              attendance and salary slips, all in a single app.
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

        {/* ── BOTTOM CTA ────────────────────────────────────────── */}
        <View
          style={[styles.bottomCta, isMobile && styles.bottomCtaMobile]}
          // @ts-ignore
          suppressHydrationWarning
        >
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
              Ready to simplify your society's accounts?
            </Text>
            <Text style={styles.bottomCtaText}>
              {PRICING_NOTE || "Set up your society in a few minutes."}
            </Text>
          </View>
          <View
            style={[
              styles.bottomCtaActions,
              isMobile && styles.bottomCtaActionsMobile,
            ]}
          >
            <DownloadButton fullWidth={isMobile} />
            <Link href={SIGNUP_HREF} style={styles.bottomSignIn}>
              Or sign in on the web with OTP
            </Link>
            {WHATSAPP_URL ? (
              <Link href={WHATSAPP_URL} style={styles.bottomSignIn}>
                Questions? Chat on WhatsApp
              </Link>
            ) : null}
          </View>
        </View>

        {/* ── FOOTER ────────────────────────────────────────────── */}
        <View
          style={[styles.footer, isMobile && styles.footerMobile]}
          // @ts-ignore
          suppressHydrationWarning
        >
          <Text style={styles.footerText}>Apartment Management</Text>
          <Text style={styles.footerNote}>
            Maintenance, accounts and staff management for apartment societies.
          </Text>
        </View>
      </ScrollView>

      {/* Floating WhatsApp button (web) */}
      {WHATSAPP_URL ? (
        <Link href={WHATSAPP_URL} asChild>
          <Pressable
            accessibilityLabel="Chat on WhatsApp"
            style={styles.whatsappFab}
          >
            <Ionicons name="logo-whatsapp" size={28} color="#FFFFFF" />
          </Pressable>
        </Link>
      ) : null}
    </>
  );
}

function DemoVideo({
  playing,
  setPlaying,
}: {
  playing: boolean;
  setPlaying: (value: boolean) => void;
}) {
  if (playing) {
    return (
      <View style={styles.videoWrapper}>
        <iframe
          src={`https://www.youtube.com/embed/${VIDEO_ID}?autoplay=1&start=${VIDEO_START_SECONDS}&rel=0`}
          title="How to use Apartment Management"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          style={{
            width: "100%",
            height: "100%",
            border: "none",
          }}
        />
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => setPlaying(true)}
      style={styles.videoWrapper}
      accessibilityRole="button"
      accessibilityLabel="Play demo video"
    >
      <img
        src={`https://img.youtube.com/vi/${VIDEO_ID}/maxresdefault.jpg`}
        alt="Apartment Management demo video"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          // The YouTube thumbnail has black bars baked in; zoom in to hide them.
          transform: "scale(1.15)",
        }}
      />
      <View style={styles.playButton}>
        <Ionicons name="play" size={32} color="#FFFFFF" />
      </View>
    </Pressable>
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
        accessibilityRole="button"
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
      </Pressable>
    </Link>
  );
}

function SignupButton({
  fullWidth = false,
  outline = false,
  label,
}: {
  fullWidth?: boolean;
  outline?: boolean;
  label: string;
}) {
  return (
    <Link href={SIGNUP_HREF} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        style={StyleSheet.flatten([
          styles.downloadButton,
          fullWidth && styles.downloadButtonFullWidth,
          outline && styles.downloadButtonOutline,
        ])}
      >
        <Text
          style={[
            styles.downloadButtonText,
            outline && styles.downloadButtonTextOutline,
          ]}
        >
          {label}
        </Text>
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
  icon:
    | "people-outline"
    | "wallet-outline"
    | "calendar-outline"
    | "download-outline"
    | "document-text-outline";
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
    paddingBottom: 54,
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
    paddingBottom: 40,
    gap: 24,
  },
  heroMobile: { paddingTop: 38, paddingBottom: 34, gap: 30 },
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
    fontSize: 46,
    lineHeight: 53,
    fontWeight: "700",
    fontFamily: "serif",
    maxWidth: 550,
  },
  heroTitleMobile: { fontSize: 34, lineHeight: 41 },
  heroTitleCompact: { fontSize: 30, lineHeight: 37 },
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
  heroActionsMobile: {
    gap: 14,
    marginTop: 22,
    width: "100%",
    flexDirection: "column",
    alignItems: "stretch",
  },
  downloadButton: {
    minHeight: 52,
    paddingHorizontal: 22,
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
  downloadButtonOutline: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: "#126B58",
  },
  downloadButtonTextOutline: { color: "#126B58" },
  stepNumber: { color: "#126B58", fontSize: 17, fontWeight: "700" },
  downloadButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  downloadButtonTextLight: { color: "#126B58", fontSize: 14 },
  secondaryLink: {
    color: "#193E35",
    fontSize: 14,
    fontWeight: "700",
    textDecorationLine: "none",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  secondaryLinkText: { color: "#193E35", fontSize: 14, fontWeight: "700" },
  trustNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 20,
  },
  trustNoteMobile: { alignItems: "flex-start", marginTop: 16 },
  trustText: { color: "#66766E", fontSize: 12 },
  platformRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 12,
  },
  inlineLink: {
    color: "#126B58",
    fontSize: 12,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  preview: {
    width: "100%",
    maxWidth: 430,
    padding: 22,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DEE4DA",
    backgroundColor: "#FFFFFF",
  },
  previewCompact: {
    width: "auto",
    flex: 1,
    minWidth: 0,
    maxWidth: 340,
    padding: 18,
  },
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

  // ── Roles section ────────────────────────────────────────────
  rolesSection: {
    width: "100%",
    maxWidth: 1160,
    borderTopWidth: 1,
    borderTopColor: "#E1E5DC",
    paddingTop: 54,
    paddingBottom: 54,
  },
  rolesSectionMobile: { paddingTop: 38, paddingBottom: 38 },
  roleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 20,
    marginTop: 30,
  },
  roleGridMobile: { flexDirection: "column", gap: 16, marginTop: 24 },
  roleCard: {
    flexGrow: 1,
    flexBasis: 250,
    padding: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DEE4DA",
    backgroundColor: "#FFFFFF",
    gap: 10,
  },
  roleCardMobile: { width: "100%", flexBasis: "auto" },
  roleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  roleIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: "#E5F3ED",
    alignItems: "center",
    justifyContent: "center",
  },
  roleTitle: { color: "#17372E", fontSize: 17, fontWeight: "700" },
  rolePoint: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  rolePointText: { flex: 1, color: "#52645C", fontSize: 14, lineHeight: 21 },

  // ── Video section ────────────────────────────────────────────
  videoSection: {
    width: "100%",
    maxWidth: 1160,
    paddingTop: 54,
    paddingBottom: 64,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#E1E5DC",
  },
  videoSectionMobile: { paddingTop: 38, paddingBottom: 44 },
  videoHeading: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
  videoWrapper: {
    width: "100%",
    maxWidth: 800,
    aspectRatio: 16 / 9,
    backgroundColor: "#000000",
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
    marginTop: 30,
    alignSelf: "center",
  },
  videoCta: {
    marginTop: 28,
    alignSelf: "center",
    width: "100%",
    maxWidth: 800,
    alignItems: "center",
  },
  playButton: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginLeft: -32,
    marginTop: -32,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    alignItems: "center",
    justifyContent: "center",
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
  whatsappFab: {
    position: "absolute",
    right: 18,
    bottom: 18,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#25D366",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});
