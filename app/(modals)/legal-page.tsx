// app/(modals)/legal-page.tsx
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DarkModeBoundary } from "../../components/DarkModeBoundary";
import { useThemeStore } from "../../store/themeStore";

// ---------------------------------------------------------------------------
// Configuration — change these two when your domain is ready.
// Until then, the app name string is used as the public-facing name.
// ---------------------------------------------------------------------------
const APP_NAME = "Apartment Management"; // 👈 replace once finalized
const SUPPORT_EMAIL = "support@aikhata.com"; // 👈 replace when domain ready
const SUPPORT_PHONE = "+91 98765 43210"; // 👈 replace with real number
const SUPPORT_ADDRESS = "India"; // 👈 replace with registered city/state

// ---------------------------------------------------------------------------
// Public GitHub Pages URLs — opened in the system browser.
// Replace YOUR-USERNAME with your GitHub handle.
// ---------------------------------------------------------------------------
const PUBLIC_URLS: Record<string, string> = {
  privacy:
    "https://YOUR-USERNAME.github.io/apartment-management-legal/privacy.html",
  terms:
    "https://YOUR-USERNAME.github.io/apartment-management-legal/terms.html",
};

export default function LegalPageScreen() {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const router = useRouter();
  const { title, type } = useLocalSearchParams<{
    title: string;
    type: string;
  }>();

  // -------------------------------------------------------------------------
  // PRIVACY POLICY — reflects what the app actually collects and does
  // -------------------------------------------------------------------------
  const privacyContent = [
    {
      heading: "1. About this policy",
      description: `This privacy policy explains how ${APP_NAME} ("we", "us") collects, uses, and protects your information when you use the ${APP_NAME} mobile application and related services.`,
      points: [
        `App name: ${APP_NAME}`,
        "Applies to all users: owners, admins, members, and staff of an account.",
        "By using the app you agree to this policy.",
      ],
    },
    {
      heading: "2. Information we collect",
      description:
        "We collect only what is needed to run the app. All fields are collected directly from you or provided by an account admin when your profile is created.",
      points: [
        "Account details: your name and mobile phone number. We use phone-based OTP login — no passwords are stored.",
        "Profile photo (optional): if you or an admin uploads one.",
        "Property and membership data: wing, flat number, area, parking, maintenance amount, and similar details of apartments or shops you are associated with.",
        "Staff records: role, monthly salary, and attendance, when applicable.",
        "Payment records: the plan you subscribed to, billing period, payment status, and the Razorpay payment/order ID. We do not store your card, UPI, or netbanking credentials — those are handled entirely by Razorpay.",
        "Expenses and bills you record, including any image or PDF attachments you choose to upload.",
        "Push notification token issued by Expo / Firebase Cloud Messaging for the device on which you enable notifications.",
        "Basic technical data: app version, platform (Android/iOS), and IP address in server logs, used for security and debugging.",
        "Activity log: actions performed inside an account (adds, edits, payments, invitations) are recorded so other members can see a shared audit trail.",
      ],
    },
    {
      heading: "3. How we use your information",
      description:
        "We use the data strictly to operate the app. We do not sell your personal data and we do not use it for advertising.",
      points: [
        "To create your account and let you log in via OTP.",
        "To associate you with the correct apartment, society, or staff role.",
        "To compute maintenance dues, salaries, expenses, and bill totals.",
        "To process subscription payments through Razorpay.",
        "To send you push notifications you opted into (for example, payment reminders or invitations).",
        "To display an activity history inside each account so members can see what changed and by whom.",
        "To detect misuse, prevent fraud, and meet legal obligations.",
      ],
    },
    {
      heading: "4. Sharing with third parties",
      description:
        "We share data only with the service providers that make the app work. Each receives only the minimum required.",
      points: [
        "Razorpay (payment gateway) — receives your name and phone number to process subscription payments. Razorpay's privacy policy is available at razorpay.com/privacy.",
        "Expo (push notification service) — receives your device push token to deliver notifications.",
        "MSG91 (SMS OTP service) — receives your phone number to send login OTPs.",
        "Hosting and database infrastructure — runs on secure cloud servers (PostgreSQL on Neon) with encryption in transit.",
        "We do not share personal data with advertisers, data brokers, or any party not listed above.",
      ],
    },
    {
      heading: "5. Data retention",
      description:
        "We keep your data only as long as needed to operate the app.",
      points: [
        "Active accounts: data is retained for as long as you use the app.",
        "Deleted accounts: personal identifiers (name, phone, photo, push token) are removed within 30 days.",
        "Financial records: payment records and audit logs are kept for up to 7 years to meet tax and legal requirements, but personal identifiers are anonymized.",
      ],
    },
    {
      heading: "6. How to delete your account and data",
      description: "You can request deletion at any time. There are two ways:",
      points: [
        `In-app: open the Profile tab → scroll to the bottom → Log Out, then email ${SUPPORT_EMAIL} from the same phone number with the subject "Delete my account".`,
        `By email: send a request to ${SUPPORT_EMAIL} from any address you control, stating the phone number you signed up with.`,
        "We process deletion requests within 30 days.",
        "Deleting your account removes your personal identifiers. Records you created for an account you own (properties, staff, bills) may be retained if the account itself remains active with other members — but they will no longer be linked to your name.",
      ],
    },
    {
      heading: "7. Security",
      description: "We take reasonable measures to protect your data.",
      points: [
        "All traffic between the app and our servers is encrypted with HTTPS/TLS.",
        "Passwords are not used — login is via OTP.",
        "Database access is restricted to the backend application.",
        "Card, UPI, and netbanking details are never transmitted to or stored on our servers.",
        "No system is 100% secure. If you suspect unauthorized access, contact us immediately at " +
          SUPPORT_EMAIL +
          ".",
      ],
    },
    {
      heading: "8. Your rights",
      description: "You have control over the information we hold about you.",
      points: [
        "Access: request a copy of the personal data we hold about you.",
        "Correction: update your name, phone, and photo from within the app.",
        "Deletion: request removal as described in Section 6.",
        "Withdraw consent: turn off push notifications from the Profile screen, or uninstall the app.",
        `To exercise any of these rights, email ${SUPPORT_EMAIL}.`,
      ],
    },
    {
      heading: "9. Children's privacy",
      description: "The app is not intended for children.",
      points: [
        "You must be at least 18 years old to create an account.",
        "We do not knowingly collect data from anyone under 18.",
        `If you believe a minor has provided us with information, contact ${SUPPORT_EMAIL} and we will delete it.`,
      ],
    },
    {
      heading: "10. Changes to this policy",
      description: "We may update this policy from time to time.",
      points: [
        "Material changes will be announced inside the app.",
        "The 'Last updated' date at the top reflects the current version.",
        `Continued use of the app after a change means you accept the updated policy.`,
      ],
    },
    {
      heading: "11. Contact us",
      description: "For any privacy-related question, reach us at:",
      points: [
        `Email: ${SUPPORT_EMAIL}`,
        `Phone: ${SUPPORT_PHONE}`,
        `Address: ${SUPPORT_ADDRESS}`,
      ],
    },
  ];

  // -------------------------------------------------------------------------
  // TERMS & CONDITIONS
  // -------------------------------------------------------------------------
  const termsContent = [
    {
      heading: "1. Acceptance of terms",
      description: `By creating an account or using ${APP_NAME}, you agree to these Terms & Conditions. If you do not agree, do not use the app.`,
      points: [
        "These terms apply to every user of the app, regardless of role (owner, admin, member, or staff).",
      ],
    },
    {
      heading: "2. Your account",
      description: "You are responsible for what happens under your account.",
      points: [
        "You must provide accurate information and keep it up to date.",
        "You are responsible for keeping your phone number and device secure — the phone number is your login.",
        "One person, one account. Do not share your account.",
        "Notify us immediately if your phone is lost or compromised.",
      ],
    },
    {
      heading: "3. Acceptable use",
      description:
        "The app is for managing apartment, society, and property operations. You agree not to:",
      points: [
        "Use it for anything illegal or harmful.",
        "Upload content that infringes someone else's rights.",
        "Attempt to break, reverse-engineer, or overload the service.",
        "Impersonate another person or misrepresent your role in an account.",
        "Use automated tools to scrape or copy data.",
      ],
    },
    {
      heading: "4. Subscriptions and payments",
      description: "Paid plans unlock higher limits and additional features.",
      points: [
        "Plan prices, limits, and features are shown on the subscription screen inside the app and may change with notice.",
        "Payments are processed by Razorpay. By subscribing, you also accept Razorpay's terms.",
        "Subscriptions are monthly or yearly. They do not auto-renew unless explicitly stated at the time of purchase.",
        "Refunds: since access is granted immediately, payments are generally non-refundable except where required by law or in case of a duplicate charge. To request a refund, contact " +
          SUPPORT_EMAIL +
          " within 7 days of the charge.",
        "If you cancel or downgrade, your plan will revert to Free at the end of the current period. Data beyond the Free limits becomes read-only, not deleted.",
      ],
    },
    {
      heading: "5. Content you provide",
      description:
        "You keep ownership of the data you enter. You grant us a limited licence to store and process it so the app can work.",
      points: [
        "You are responsible for the accuracy of the data you or your admins enter (property details, staff records, expenses).",
        "You must have the right to upload any photo, bill, or document you attach.",
      ],
    },
    {
      heading: "6. Our intellectual property",
      description:
        "The app itself — its code, design, logo, and name — belongs to us.",
      points: [
        "You may not copy, modify, or redistribute the app or its assets without written permission.",
        "You may not use our name or logo to endorse a product without written permission.",
      ],
    },
    {
      heading: "7. Availability",
      description:
        "We aim to keep the app running but cannot promise uninterrupted service.",
      points: [
        "Planned maintenance, network issues, or third-party outages may cause downtime.",
        "We may modify or discontinue features with reasonable notice.",
      ],
    },
    {
      heading: "8. Limitation of liability",
      description:
        "The app is provided 'as is'. To the maximum extent permitted by law:",
      points: [
        "We are not liable for indirect, incidental, or consequential damages.",
        "We are not liable for the accuracy of data entered by users or for decisions made based on it.",
        "Our total liability for any claim is limited to the amount you paid us in the previous 12 months.",
      ],
    },
    {
      heading: "9. Termination",
      description:
        "We may suspend or terminate accounts that violate these terms or applicable law.",
      points: [
        "You may stop using the app and request deletion at any time (see Privacy Policy Section 6).",
        "Serious or repeated violations may result in immediate termination.",
      ],
    },
    {
      heading: "10. Governing law",
      description: "These terms are governed by the laws of India.",
      points: [
        "Any dispute will be subject to the exclusive jurisdiction of the courts of India.",
      ],
    },
    {
      heading: "11. Changes to these terms",
      description:
        "We may update these terms. Material changes will be announced inside the app.",
      points: [
        "Continued use after a change means you accept the updated terms.",
      ],
    },
    {
      heading: "12. Contact",
      description: "Questions about these terms?",
      points: [`Email: ${SUPPORT_EMAIL}`, `Phone: ${SUPPORT_PHONE}`],
    },
  ];

  // -------------------------------------------------------------------------
  // ABOUT US
  // -------------------------------------------------------------------------
  const aboutContent = [
    {
      heading: `About ${APP_NAME}`,
      description: `${APP_NAME} is a simple property management app built for apartments, housing societies, and small communities.`,
      points: [
        "Track flats, shops, and other properties in one place.",
        "Manage owners, admins, members, and staff roles.",
        "Record maintenance payments, salaries, expenses, and bills.",
        "Keep an automatic audit history of every action.",
        "Send reminders and notifications to the right people.",
      ],
    },
    {
      heading: "Our mission",
      description:
        "Make day-to-day property and society management simple, transparent, and stress-free — for both managers and residents.",
      points: [
        "No spreadsheets, no missed payments, no confusion about who paid what.",
        "Everything in one app, on every phone in the building.",
      ],
    },
    {
      heading: "Contact us",
      description: "We're happy to hear from you.",
      points: [
        `Email: ${SUPPORT_EMAIL}`,
        `Phone: ${SUPPORT_PHONE}`,
        `Address: ${SUPPORT_ADDRESS}`,
      ],
    },
  ];

  // -------------------------------------------------------------------------
  // HELP & SUPPORT
  // -------------------------------------------------------------------------
  const supportContent = [
    {
      heading: "How can we help?",
      description:
        "Most questions are answered below. If you still need help, email or call us — we usually reply within 24 hours.",
      points: [
        `Email: ${SUPPORT_EMAIL}`,
        `Phone: ${SUPPORT_PHONE}`,
        "Response time: within 24 hours (Monday–Saturday).",
      ],
    },
    {
      heading: "Getting started",
      description: "New to the app? Start here.",
      points: [
        "Q: How do I create an account?",
        "A: Sign in with your mobile number. You'll receive a one-time password (OTP) by SMS. Enter it to log in. No password is needed.",
        "Q: How do I add a property?",
        "A: Go to the Members tab, tap Add, choose the flat or shop type, and fill in the details.",
        "Q: How do I invite an admin or a member?",
        "A: Open the account menu and choose Invite. You can invite by phone number and choose their role.",
      ],
    },
    {
      heading: "Payments and subscriptions",
      description: "About plans and billing.",
      points: [
        "Q: What does the Free plan include?",
        "A: Free includes 1 property, 1 admin, and 1 staff role.",
        "Q: How do I upgrade?",
        "A: Open Profile → Subscription card → Upgrade Now. Payment is handled securely by Razorpay.",
        "Q: I paid but my plan didn't activate.",
        "A: Wait a minute and refresh. If it still hasn't activated, email us with your payment ID (a long code starting with 'pay_').",
        "Q: How do I cancel?",
        "A: On the subscription card, tap Manage Plan → Cancel Subscription. Your plan will revert to Free at the end of the current billing period.",
      ],
    },
    {
      heading: "Managing members and staff",
      description: "Tips for owners and admins.",
      points: [
        "Q: How do I record a maintenance payment?",
        "A: Open the member's profile, tap Mark Paid, and choose the month.",
        "Q: How do I generate a bill?",
        "A: Open the Billing section from the menu and choose the month and members.",
        "Q: What happens if I go over my plan limit?",
        "A: Existing properties stay visible but become read-only until you upgrade or reduce below the limit.",
      ],
    },
    {
      heading: "Privacy and data",
      description: "Your data, your control.",
      points: [
        "Q: How do I delete my account?",
        `A: Email ${SUPPORT_EMAIL} from the phone number you registered with, and ask us to delete your account. We process requests within 30 days.`,
        "Q: Who can see my phone number?",
        "A: Only the account owner and admins, unless a member explicitly grants visibility.",
        "Q: Do you sell my data?",
        "A: No. We never sell personal data.",
      ],
    },
    {
      heading: "Still need help?",
      description: "Reach us directly and we'll sort it out.",
      points: [`Email: ${SUPPORT_EMAIL}`, `Phone: ${SUPPORT_PHONE}`],
    },
  ];

  let content = privacyContent;
  let displayTitle = title || "Privacy Policy";

  if (type === "terms") {
    content = termsContent;
    displayTitle = title || "Terms & Conditions";
  } else if (type === "about") {
    content = aboutContent;
    displayTitle = title || "About Us";
  } else if (type === "support") {
    content = supportContent;
    displayTitle = title || "Help & Support";
  }

  const openOnWeb = async () => {
    const url = PUBLIC_URLS[type] ?? PUBLIC_URLS.privacy;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      }
    } catch (err) {
      console.warn("[legal-page] Linking failed:", err);
    }
  };

  return (
    <DarkModeBoundary>
      <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          title: displayTitle,
          headerBackTitle: "Back",
          headerStyle: {
            backgroundColor: isDarkMode ? "#151C27" : "#fff",
          },
          headerTintColor: isDarkMode ? "#E7EDF5" : "#0F172A",
          headerShadowVisible: false,
          headerTitleStyle: { fontSize: 17, fontWeight: "600" },
        }}
      />
      <View style={styles.headerBorder} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {(type === "privacy" || type === "terms") && (
          <Pressable
            onPress={openOnWeb}
            style={({ pressed }) => [
              styles.webLink,
              pressed && { opacity: 0.75 },
            ]}
          >
            <Ionicons name="open-outline" size={16} color="#1a73e8" />
            <Text style={styles.webLinkText}>Open official page on web</Text>
          </Pressable>
        )}

        <Text style={styles.lastUpdated}>
          Last updated:{" "}
          {new Date().toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </Text>

        {content.map((section, index) => (
          <View key={index} style={styles.section}>
            <Text style={styles.heading}>{section.heading}</Text>
            <Text style={styles.description}>{section.description}</Text>
            {section.points.map((point, pointIndex) => (
              <View key={pointIndex} style={styles.pointRow}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.pointText}>{point}</Text>
              </View>
            ))}
          </View>
        ))}

        <Text style={styles.footer}>
          © {new Date().getFullYear()} {APP_NAME}. All rights reserved.
        </Text>
      </ScrollView>
      </SafeAreaView>
    </DarkModeBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  headerBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  content: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    paddingBottom: 40,
  },
  webLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "#e8f0fe",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 16,
  },
  webLinkText: {
    color: "#1a73e8",
    fontSize: 13,
    fontWeight: "600",
  },
  lastUpdated: {
    fontSize: 13,
    color: "#999",
    marginBottom: 24,
    fontStyle: "italic",
  },
  section: { marginBottom: 28 },
  heading: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
    marginBottom: 12,
  },
  pointRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 6,
    paddingLeft: 4,
  },
  bullet: {
    fontSize: 14,
    color: "#1a73e8",
    marginRight: 8,
    fontWeight: "600",
    lineHeight: 20,
  },
  pointText: {
    fontSize: 14,
    color: "#444",
    lineHeight: 20,
    flex: 1,
  },
  footer: {
    fontSize: 12,
    color: "#999",
    textAlign: "center",
    marginTop: 12,
  },
});
