"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

const ERROR_MESSAGES: Record<string, string> = {
  auth: "That link has expired or already been used. Request a new one below.",
  provisioning:
    "Signed in, but couldn't set up your account. Please try again, or contact support if this keeps happening.",
  no_coach_profile:
    "Signed in, but your account isn't fully set up yet. Try signing in again - if this keeps happening, contact support.",
  archived:
    "Your access to this organisation has been paused. Contact your organisation owner if you think this is a mistake.",
  demo_unavailable:
    "The demo isn't available right now - please contact us and we'll sort you out.",
};

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  // Lets /start's "Start free trial" button deep-link straight into
  // signup mode instead of landing on sign-in and making them find
  // the "First time?" toggle themselves.
  const [showSignupFields, setShowSignupFields] = useState(() => searchParams.get("signup") === "1");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const errorCode = searchParams.get("error");
    if (errorCode && ERROR_MESSAGES[errorCode]) {
      setStatus("error");
      setErrorMsg(ERROR_MESSAGES[errorCode]);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("sending");
    setErrorMsg("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        // Only relevant the first time someone signs in - the callback
        // route uses this to provision an organisation + coach row if
        // one doesn't already exist for this email. Returning users
        // signing in again just get ignored since their coach row is
        // already there.
        data: {
          name: name.trim(),
          org_name: orgName.trim(),
        },
      },
    });

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
      return;
    }
    setStatus("sent");
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logoChip}>
          <img src="/logo/vis-build-square.png" alt="VIS BUILD" style={styles.logo} />
        </div>
        <div style={styles.subtitle}>Coach sign in</div>

        {status === "sent" ? (
          <div style={styles.sentBox}>
            <p style={styles.sentText}>
              Check your email - we&apos;ve sent a sign-in link to <b>{email}</b>.
              Tap it on this device to sign in.
            </p>
            <button style={styles.ghostBtn} onClick={() => setStatus("idle")}>
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={styles.form}>
            <label style={styles.label} htmlFor="email">
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={styles.input}
            />

            {showSignupFields ? (
              <>
                <label style={styles.label} htmlFor="name">
                  Your name
                </label>
                <input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ash"
                  style={styles.input}
                />
                <label style={styles.label} htmlFor="orgName">
                  Business name
                </label>
                <input
                  id="orgName"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="e.g. VIS BUILD Health & Performance"
                  style={styles.input}
                />
                <button
                  type="button"
                  style={styles.linkBtn}
                  onClick={() => setShowSignupFields(false)}
                >
                  I already have an account
                </button>
              </>
            ) : (
              <button
                type="button"
                style={styles.linkBtn}
                onClick={() => setShowSignupFields(true)}
              >
                First time? Set up your account
              </button>
            )}

            {status === "error" && <div style={styles.error}>{errorMsg}</div>}
            <button type="submit" disabled={status === "sending"} style={styles.primaryBtn}>
              {status === "sending" ? "Sending link…" : "Send sign-in link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0F1418",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    background: "#171D23",
    border: "1px solid #2A343D",
    borderRadius: 16,
    padding: 28,
  },
  logoChip: {
    background: "#FEFAF6",
    borderRadius: 14,
    padding: "16px 22px",
    display: "inline-flex",
    marginBottom: 14,
  },
  logo: {
    height: 68,
    width: "auto",
    display: "block",
  },
  subtitle: { fontSize: 14, color: "#8593A0", marginBottom: 22 },
  form: { display: "flex", flexDirection: "column", gap: 10 },
  label: { fontSize: 12, color: "#8593A0", fontWeight: 600 },
  input: {
    background: "#0F1418",
    border: "1px solid #2A343D",
    color: "#E8EDF1",
    borderRadius: 8,
    padding: "11px 12px",
    fontSize: 15,
  },
  primaryBtn: {
    marginTop: 6,
    background: "#3B8BEB",
    color: "#0a1420",
    border: "none",
    borderRadius: 10,
    padding: "12px 0",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
  },
  ghostBtn: {
    marginTop: 14,
    background: "transparent",
    border: "1px solid #2A343D",
    color: "#8593A0",
    borderRadius: 8,
    padding: "9px 0",
    fontSize: 13,
    cursor: "pointer",
    width: "100%",
  },
  error: { fontSize: 13, color: "#FF6B6B" },
  linkBtn: {
    background: "transparent",
    border: "none",
    color: "var(--accent)",
    fontSize: 12,
    cursor: "pointer",
    padding: "2px 0",
    textAlign: "left",
    textDecoration: "underline",
  },
  sentBox: { display: "flex", flexDirection: "column" },
  sentText: { fontSize: 14, color: "#E8EDF1", lineHeight: 1.5, margin: 0 },
};

// useSearchParams requires a Suspense boundary in Next.js's app router
// - without this wrapper, the production build fails.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
