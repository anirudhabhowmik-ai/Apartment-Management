import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function LegalPageScreen() {
  const router = useRouter();
  const { title, type } = useLocalSearchParams<{
    title: string;
    type: string;
  }>();

  // Privacy Policy Content
  const privacyContent = [
    {
      heading: "1. Data Collection and Usage",
      description:
        "This section outlines the types of data collected, how it is used, and who may access it.",
      points: [
        "This policy applies to all users of our website.",
        "We collect personal information such as your name, email address, and other details when you use our services.",
      ],
    },
    {
      heading: "2. Cookies",
      description:
        "This section explains what cookies are, why they are used, and how you can control them.",
      points: [
        "Cookies are small files that a website saves on your device.",
        "You can choose to disable cookies in your browser settings.",
      ],
    },
    {
      heading: "3. Third-Party Links",
      description:
        "This section lists third-party links that may be accessed through this website.",
      points: [
        "Our website may contain links to external websites. Please review their privacy policies before providing any personal information.",
      ],
    },
    {
      heading: "4. Security",
      description:
        "This section emphasizes the importance of maintaining the security of your personal information.",
      points: [
        "We take reasonable steps to protect your personal information from unauthorized access.",
      ],
    },
    {
      heading: "5. Changes to Privacy Policy",
      description:
        "This section informs users about changes to the privacy policy.",
      points: [
        "We reserve the right to update this privacy policy at any time. Any changes will be posted on this page.",
      ],
    },
  ];

  // Terms & Conditions Content
  const termsContent = [
    {
      heading: "1. Acceptance of Terms",
      description: "By using this application, you agree to these terms.",
      points: [
        "These terms apply to all users of the application.",
        "If you do not agree with any part of these terms, you must not use the application.",
      ],
    },
    {
      heading: "2. User Accounts",
      description: "This section explains the requirements for user accounts.",
      points: [
        "You must provide accurate and complete information when creating an account.",
        "You are responsible for maintaining the security of your account.",
      ],
    },
    {
      heading: "3. Intellectual Property",
      description: "This section outlines the intellectual property rights.",
      points: [
        "All content on this application is the property of the developer.",
        "You may not reproduce, distribute, or modify any content without permission.",
      ],
    },
    {
      heading: "4. Limitation of Liability",
      description:
        "This section limits the liability of the application provider.",
      points: [
        "The application is provided 'as is' without any warranties.",
        "We are not liable for any damages arising from the use of this application.",
      ],
    },
    {
      heading: "5. Changes to Terms",
      description: "This section informs users about changes to the terms.",
      points: [
        "We reserve the right to update these terms at any time.",
        "Continued use of the application constitutes acceptance of the updated terms.",
      ],
    },
  ];

  // About Us Content
  const aboutContent = [
    {
      heading: "About Us",
      description: "Learn more about our company and mission.",
      points: [
        "We are a property management solution designed to simplify apartment and society management.",
        "Our mission is to help property owners, tenants, and staff manage their properties effortlessly.",
      ],
    },
    {
      heading: "Our Vision",
      description: "What we aim to achieve.",
      points: [
        "To create a seamless property management experience for everyone.",
        "To provide innovative tools that make property management easy and efficient.",
      ],
    },
    {
      heading: "Contact Us",
      description: "How to reach us.",
      points: [
        "Email: support@aikhata.com",
        "Phone: +91 9876543210",
        "Address: Your Office Address Here",
      ],
    },
  ];

  // Help & Support Content
  const supportContent = [
    {
      heading: "How can we help?",
      description: "Find answers to common questions and get support.",
      points: [
        "Check our FAQ section for quick answers.",
        "Contact our support team for personalized assistance.",
        "We are available 24/7 to help you.",
      ],
    },
    {
      heading: "Frequently Asked Questions",
      description: "Answers to common questions.",
      points: [
        "Q: How do I create an account?",
        "A: Sign up using your phone number and verify with OTP.",
        "Q: How do I add a property?",
        "A: Go to the 'Add Account' section and select your property type.",
      ],
    },
    {
      heading: "Contact Support",
      description: "Reach out to us directly.",
      points: [
        "Email: support@aikhata.com",
        "Phone: +91 9876543210",
        "Response time: Within 24 hours.",
      ],
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

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          title: displayTitle,
          headerBackTitle: "Back",
          headerStyle: {
            backgroundColor: "#fff",
          },
          headerShadowVisible: false,
          headerTitleStyle: {
            fontSize: 17,
            fontWeight: "600",
          },
        }}
      />
      {/* Bottom border for header */}
      <View style={styles.headerBorder} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.lastUpdated}>
          Last updated: {new Date().toLocaleDateString()}
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  headerBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  content: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    paddingBottom: 40,
  },
  lastUpdated: {
    fontSize: 13,
    color: "#999",
    marginBottom: 24,
    fontStyle: "italic",
  },
  section: {
    marginBottom: 28,
  },
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
});
