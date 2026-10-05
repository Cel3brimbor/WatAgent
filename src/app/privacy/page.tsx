import type { Metadata } from "next";
import { PrivacyPolicy } from "@/privacy/privacy-policy";

export const metadata: Metadata = { title: "Privacy Policy · WatAgent" };

export default function PrivacyPage() {
  return <PrivacyPolicy />;
}
