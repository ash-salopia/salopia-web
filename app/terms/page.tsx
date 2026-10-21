import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of use · VIS BUILD" };

const who = `${LEGAL.operator}${LEGAL.companyNumber ? ` (${LEGAL.companyNumber})` : ""}, ${LEGAL.address}`;

const SECTIONS: LegalSection[] = [
  {
    heading: "About these terms",
    body: [
      `These terms are an agreement between you (the coach, or the club or business you sign up for) and ${who} ("we", "us"). By creating an account or using VIS BUILD you agree to them. If you sign up on behalf of an organisation, you confirm you're allowed to accept them for it.`,
    ],
  },
  {
    heading: "The free preview",
    body: [
      "VIS BUILD is currently in a free preview (beta). During the preview:",
      [
        "There's no charge and no card is needed. We'll give at least 30 days' notice before any paid plan applies to your account, and you'll be able to export your data or leave before then.",
        "Features may change, be added or be removed, and there may be bugs or downtime. Please keep your own copy of anything critical, and tell us about problems at " + LEGAL.email + ".",
        "We may end the preview, or your access to it, with reasonable notice - or immediately if these terms are broken.",
      ],
    ],
  },
  {
    heading: "Your account",
    body: [
      "Keep your log-in secure and tell us straight away if you think someone else has accessed your account. The organisation owner controls which coaches have access and what they can see. You're responsible for activity in your organisation's account.",
    ],
  },
  {
    heading: "Acceptable use",
    body: [
      "Don't use VIS BUILD to break the law, to upload anything you don't have the right to share, to harass anyone, or to try to access other organisations' data, overload the service or get round its limits (including the daily limits on AI features). Athlete share links are private: share each one only with the athlete it belongs to.",
    ],
  },
  {
    heading: "Your data",
    body: [
      "You own the data you and your athletes put into VIS BUILD. You give us permission to store and process it only to provide the service to you. You can export it at any time, and you can ask us to delete your organisation's account.",
    ],
  },
  {
    heading: "Data processing terms (athletes' data)",
    body: [
      "For athletes' personal data, you are the controller and we are your processor. These terms are the contract required by UK GDPR Article 28. We will:",
      [
        "process athletes' data only on your documented instructions - which are to provide VIS BUILD as you use and configure it - unless the law requires otherwise;",
        "make sure anyone who processes it for us is bound by confidentiality;",
        "keep it secure with appropriate technical and organisational measures;",
        "only use the sub-processors listed in our Privacy policy, tell you before adding or replacing one so you can object, and hold them to equivalent data-protection obligations;",
        "help you respond to requests from athletes exercising their rights, and with security, breach notification and data protection impact assessments where relevant;",
        "tell you without undue delay after becoming aware of a personal data breach affecting your data;",
        "delete or return your data when you close your account, as set out in the Privacy policy; and",
        "make available the information you reasonably need to show compliance with these obligations.",
      ],
      "You are responsible for having a lawful basis to collect and use your athletes' data (including health data and data about under-18s, where you need appropriate parental knowledge or consent), for telling your athletes how you use VIS BUILD, and for following your club's or governing body's safeguarding policies.",
    ],
  },
  {
    heading: "Selling programmes (Online Store)",
    body: [
      "If you use the Online Store to sell programmes:",
      [
        "You are the seller. The contract for each sale is between you and your buyer - we provide the software and are not a party to it.",
        "Payments are taken by Stripe straight into your own Stripe account, under Stripe's own terms, which you accept when you connect. We don't currently take a fee; we'll give at least 30 days' notice before that changes.",
        "You must give accurate seller details and a refund policy, and you're responsible for meeting consumer law (including the UK Consumer Contracts Regulations), handling refunds and complaints, and for the tax due on your sales.",
        "Buyers become athletes on your account and use a seat. You're responsible for the programmes you sell being accurate, safe and suitable for the people buying them.",
        "We may suspend a store that breaks these terms or the law, or that Stripe tells us to stop.",
      ],
    ],
  },
  {
    heading: "Coaching responsibility and AI features",
    body: [
      "VIS BUILD is a tool to support your coaching - it isn't medical, physiotherapy or safeguarding advice. You remain responsible for the programmes you set and the decisions you make about your athletes. Calculated values (such as 1RM estimates, training loads and norm-based test ratings) and anything produced by AI features may be wrong: check them before relying on them.",
    ],
  },
  {
    heading: "Our liability",
    body: [
      "Nothing in these terms limits liability for death or personal injury caused by negligence, for fraud, or for anything else that can't be limited by law. Otherwise, while VIS BUILD is free, it's provided \"as is\": we aren't liable for indirect or consequential loss, or for loss of profit, business or data, and our total liability to you is limited to £100.",
    ],
  },
  {
    heading: "Ending",
    body: [
      `You can stop using VIS BUILD at any time and ask us to close your account by emailing ${LEGAL.email} from the owner's address.`,
    ],
  },
  {
    heading: "Changes and law",
    body: [
      "We may update these terms as the service develops, and will tell you about significant changes before they take effect. These terms are governed by the law of England and Wales, and the courts of England and Wales have jurisdiction.",
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      updated={LEGAL.updated}
      intro="The rules for using VIS BUILD during the free preview, including the data processing terms that cover your athletes' data."
      sections={SECTIONS}
    />
  );
}
