import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy policy · VIS BUILD" };

const who = `${LEGAL.operator}${LEGAL.companyNumber ? ` (${LEGAL.companyNumber})` : ""}, ${LEGAL.address}`;

const SECTIONS: LegalSection[] = [
  {
    heading: "Who we are and our role",
    body: [
      `VIS BUILD is run by ${who} ("we", "us"). Contact: ${LEGAL.email}.`,
      "VIS BUILD is software that coaches use to programme, track and report on their athletes' training. That gives us two different roles under UK GDPR and the Data Protection Act 2018:",
      [
        "For coaches' own account details (name, email, organisation, billing), we are the controller.",
        "For athletes' data that a coach puts into VIS BUILD or that an athlete logs through their coach's link, the coach (or their club or business) is the controller and we are their processor. We only use that data to run the service for that coach, under the data processing terms in our Terms of use.",
      ],
      "If you're an athlete with a question about your data, please speak to your coach first - they decide what is collected and how long it's kept. You can also contact us and we'll pass your request on and help them deal with it.",
    ],
  },
  {
    heading: "What we collect",
    body: [
      [
        "Coach accounts: name, email address, organisation name, role, profile picture, settings and preferences.",
        "Athlete records added by a coach: name, group, date of birth or age group where entered, and any notes the coach adds.",
        "Training data: sessions, exercises, sets, weights, times, RPE, personal bests, physical testing results, goals, competitions and reports.",
        "Wellbeing and health-related data where a coach uses these features: daily check-ins (e.g. sleep, soreness, mood), injury/return-to-play status and recovery sessions. This can be special category (health) data.",
        "Messages, comments, reactions and voice notes sent between coaches and athletes in the app.",
        "Files a coach uploads (documents, images, CSV/PDF/spreadsheet programmes) and text or voice recordings used with the AI features.",
        "Technical data: log-in records, device push-notification tokens if notifications are switched on, and error reports when something breaks.",
        "Billing: handled by Stripe. We see your plan and payment status but never your full card number.",
        "Online Store purchases: the buyer's name and email, what they bought, the amount, and when they agreed to the checkout terms. Card details are entered on Stripe and never reach us. The coach selling the programme is the controller of this data; we process it for them.",
      ],
    ],
  },
  {
    heading: "Children's data",
    body: [
      "Many athletes coached on VIS BUILD are under 18. Coaches are responsible for having a lawful basis to record a young athlete's data and, where needed, the consent or knowledge of a parent or guardian, in line with their club's or governing body's safeguarding policy.",
      "Athletes access VIS BUILD through a private link from their coach - they don't create an account with us, and we don't market to athletes or use their data for advertising.",
    ],
  },
  {
    heading: "How we use data",
    body: [
      [
        "To provide the service: storing training data, showing it to the right coach and athlete, sending notifications they've switched on, and producing reports.",
        "AI features: when a coach uses a feature such as building a session from notes or voice, an AI report summary or the help assistant, the relevant text, recording or data is sent to our AI providers to produce the result. These providers don't use it to train their models.",
        "Support: to answer questions and fix problems you report.",
        "Security and reliability: preventing misuse, keeping the service running and diagnosing errors.",
        "Billing and legal obligations, such as keeping invoices.",
      ],
      "Our lawful bases are performance of our contract with coaches, our legitimate interest in running and improving a secure service, and legal obligation. For athlete data, we act on the coach's instructions and the coach chooses the lawful basis (including, for health data, the relevant condition under UK GDPR Article 9).",
    ],
  },
  {
    heading: "Who we share data with",
    body: [
      "We don't sell personal data. We use these providers (sub-processors) to run VIS BUILD:",
      [
        "Supabase - database, file storage, log-in and log-in emails.",
        "Vercel - hosting and running the app.",
        "Anthropic - AI features (session building, report summaries, help assistant).",
        "OpenAI - voice transcription for voice-built sessions.",
        "Stripe - payments, subscriptions and Online Store sales (payments go to the selling coach's own Stripe account).",
        "Resend - sending emails (support, training reports, store receipts and reminders).",
        "Sentry - error monitoring, when enabled.",
        "Browser push services (Apple, Google, Mozilla) - delivering notifications you've switched on.",
      ],
      "Some of these providers process data outside the UK (for example in the EU or USA). Where they do, transfers are covered by appropriate safeguards such as the UK International Data Transfer Addendum or an adequacy decision.",
      "Within VIS BUILD, an athlete's data is visible to coaches in their coach's organisation (subject to that organisation's access settings). Community features such as PB feeds, competitions and group chat are shared with other athletes in the same organisation only, and athletes can limit what others see in their app settings.",
    ],
  },
  {
    heading: "How long we keep data",
    body: [
      "We keep data for as long as the coach's organisation has an account. Coaches can delete athletes and their data at any time. When an organisation closes its account, we delete its data within 90 days, except where we must keep limited records (such as invoices) for legal or accounting reasons. Backups roll off within a further 30 days.",
    ],
  },
  {
    heading: "Security",
    body: [
      "Data is encrypted in transit and at rest with our hosting providers. Each organisation's data is kept separate by access rules enforced in the database, athlete links are long random tokens, and deleting athletes is restricted and password-protected. No system is perfectly secure; if a breach affects your data we'll tell the affected coaches without undue delay so they can meet their own obligations.",
    ],
  },
  {
    heading: "Your rights",
    body: [
      "You have the right to access, correct, delete or export your personal data, to object to or restrict some uses of it, and to withdraw consent where we rely on it. Coaches can export their athletes' data from the app. For athlete data, requests are handled by the athlete's coach, and we help them do so.",
      `To make a request, email ${LEGAL.email}. You can also complain to the Information Commissioner's Office (ico.org.uk), though we'd appreciate the chance to sort things out first.`,
    ],
  },
  {
    heading: "Cookies",
    body: [
      "VIS BUILD only uses cookies and browser storage that are needed for the app to work - keeping you logged in, remembering your settings and storing unsent changes. We don't use advertising or tracking cookies.",
    ],
  },
  {
    heading: "Changes",
    body: [
      "VIS BUILD is in a free preview and will change. If we make a significant change to how we use personal data, we'll tell coaches by email or in the app before it takes effect.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated={LEGAL.updated}
      intro="This explains what personal data VIS BUILD holds, why, who we share it with and the rights you have. We've tried to keep it in plain English."
      sections={SECTIONS}
    />
  );
}
