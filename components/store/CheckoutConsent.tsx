"use client";

import { useState } from "react";

// The required tickbox before paying for a programme (0127): the buyer
// wants immediate access (so the 14-day cancellation right ends once
// it's delivered) and agrees to the seller's refund policy, which they
// can read inline. Used on the public store and the in-app Buy flow.
// The server builds the stored wording itself (checkoutConsentText) -
// keep the two in step.

export default function CheckoutConsent({
  storeName,
  refundPolicy,
  checked,
  onChange,
}: {
  storeName: string;
  refundPolicy: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const [showPolicy, setShowPolicy] = useState(false);
  return (
    <div style={s.box}>
      <label style={s.row}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} required style={s.check} />
        <span>
          I want access to my programme straight away. I understand that once it&apos;s delivered to my training app I lose my 14-day right
          to cancel, and I agree to {storeName}&apos;s{" "}
          <button type="button" style={s.link} onClick={() => setShowPolicy((v) => !v)}>
            refund policy
          </button>
          .
        </span>
      </label>
      {showPolicy && <div style={s.policy}>{refundPolicy || "No refund policy has been provided."}</div>}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  box: { display: "flex", flexDirection: "column", gap: 8 },
  row: { display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, lineHeight: 1.45, color: "var(--text)", cursor: "pointer" },
  check: { width: 18, height: 18, marginTop: 1, flexShrink: 0, accentColor: "var(--accent)" },
  link: { background: "none", border: "none", padding: 0, color: "var(--accent)", textDecoration: "underline", font: "inherit", cursor: "pointer" },
  policy: { fontSize: 12, color: "var(--mute)", lineHeight: 1.5, whiteSpace: "pre-wrap", background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", maxHeight: 220, overflowY: "auto" },
};
