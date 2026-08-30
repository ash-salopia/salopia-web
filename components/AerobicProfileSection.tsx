"use client";

// "🫀 Aerobic profile" section on the athlete Profile page.
// Max HR / resting HR / MAS inputs + a live 5-zone HR & pace table
// (lib/training-zones.ts). Saves via updateAthleteAerobicProfile.

import { useEffect, useMemo, useState } from "react";
import { updateAthleteAerobicProfile } from "@/lib/data/athletes";
import {
  computeZones, estimateMaxHr, masFromTest,
  type ZoneModel, type AerobicProfile,
} from "@/lib/training-zones";

interface Props {
  athleteId: string;
  dob: string | null;
  initial: AerobicProfile;
  zoneModel: ZoneModel;
}

export default function AerobicProfileSection({ athleteId, dob, initial, zoneModel }: Props) {
  const [maxHr, setMaxHr] = useState(initial.max_hr != null ? String(initial.max_hr) : "");
  const [restingHr, setRestingHr] = useState(initial.resting_hr != null ? String(initial.resting_hr) : "");
  const [mas, setMas] = useState(initial.mas_kmh != null ? String(initial.mas_kmh) : "");
  const [saved, setSaved] = useState<"" | "saving" | "ok" | "err">("");

  const [testOpen, setTestOpen] = useState(false);
  const [testDist, setTestDist] = useState("");
  const [testMin, setTestMin] = useState("");
  const [testSec, setTestSec] = useState("");

  useEffect(() => {
    setMaxHr(initial.max_hr != null ? String(initial.max_hr) : "");
    setRestingHr(initial.resting_hr != null ? String(initial.resting_hr) : "");
    setMas(initial.mas_kmh != null ? String(initial.mas_kmh) : "");
  }, [initial.max_hr, initial.resting_hr, initial.mas_kmh]);

  const profile: AerobicProfile = {
    max_hr: maxHr ? parseInt(maxHr, 10) : null,
    resting_hr: restingHr ? parseInt(restingHr, 10) : null,
    mas_kmh: mas ? parseFloat(mas) : null,
  };
  const zones = useMemo(() => computeZones(profile, zoneModel), [maxHr, restingHr, mas, zoneModel]);

  const save = async () => {
    setSaved("saving");
    try {
      await updateAthleteAerobicProfile(athleteId, {
        maxHr: profile.max_hr, restingHr: profile.resting_hr, masKmh: profile.mas_kmh,
      });
      setSaved("ok");
      setTimeout(() => setSaved(""), 1500);
    } catch {
      setSaved("err");
    }
  };

  const applyTest = () => {
    const d = parseFloat(testDist);
    const secs = (parseInt(testMin || "0", 10) * 60) + parseInt(testSec || "0", 10);
    if (!d || !secs) return;
    const v = masFromTest(d, secs);
    setMas(String(v));
    setTestOpen(false);
    setTimeout(save, 0);
  };

  const ageEstimate = estimateMaxHr(dob);

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={s.title}>🫀 Aerobic profile</div>
      <p style={s.hint}>
        Sets each athlete&apos;s heart-rate and pace targets for conditioning. Prescribe a
        zone (Z1–Z5) on a Cardio or Hybrid session and the athlete sees the numbers below.
      </p>

      <div style={s.card}>
        <div style={s.inputRow}>
          <Field label="Max HR (bpm)">
            <div style={{ display: "flex", gap: 6 }}>
              <input style={s.input} inputMode="numeric" value={maxHr} placeholder="e.g. 195"
                onChange={(e) => setMaxHr(e.target.value)} onBlur={save} />
              {ageEstimate != null && (
                <button style={s.estBtn} title="Estimate from date of birth (208 − 0.7 × age)"
                  onClick={() => { setMaxHr(String(ageEstimate)); setTimeout(save, 0); }}>
                  ~{ageEstimate}
                </button>
              )}
            </div>
          </Field>
          <Field label="Resting HR (bpm)">
            <input style={s.input} inputMode="numeric" value={restingHr} placeholder="optional"
              onChange={(e) => setRestingHr(e.target.value)} onBlur={save} />
          </Field>
          <Field label="MAS (km/h)">
            <input style={s.input} inputMode="decimal" value={mas} placeholder="e.g. 16.5"
              onChange={(e) => setMas(e.target.value)} onBlur={save} />
          </Field>
        </div>

        <div style={s.metaRow}>
          <button style={s.linkBtn} onClick={() => setTestOpen((v) => !v)}>
            {testOpen ? "Hide field-test calculator" : "Set MAS from a field test"}
          </button>
          {restingHr
            ? <span style={s.note}>HR zones use the Karvonen (HR-reserve) method.</span>
            : <span style={s.note}>Add a resting HR for more accurate HR zones.</span>}
          {saved === "saving" && <span style={s.note}>Saving…</span>}
          {saved === "ok" && <span style={{ ...s.note, color: "var(--good, #2E9E5B)" }}>✓ Saved</span>}
          {saved === "err" && <span style={{ ...s.note, color: "#E53935" }}>Could not save</span>}
        </div>

        {testOpen && (
          <div style={s.testBox}>
            <span style={s.note}>Maximal effort — distance covered in the test time.</span>
            <div style={{ display: "flex", gap: 6, alignItems: "flex-end", flexWrap: "wrap", marginTop: 6 }}>
              <Field label="Distance (m)"><input style={s.inputSm} inputMode="numeric" value={testDist} onChange={(e) => setTestDist(e.target.value)} placeholder="1500" /></Field>
              <Field label="Time — min"><input style={s.inputSm} inputMode="numeric" value={testMin} onChange={(e) => setTestMin(e.target.value)} placeholder="5" /></Field>
              <Field label="sec"><input style={s.inputSm} inputMode="numeric" value={testSec} onChange={(e) => setTestSec(e.target.value)} placeholder="00" /></Field>
              <button style={s.applyBtn} onClick={applyTest}>Set MAS</button>
            </div>
          </div>
        )}

        {(profile.max_hr || profile.mas_kmh) ? (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={{ ...s.th, textAlign: "left" }}>Zone</th>
                <th style={s.th}>Heart rate</th>
                <th style={s.th}>Pace /km</th>
                <th style={s.th}>Speed</th>
              </tr>
            </thead>
            <tbody>
              {zones.map((z) => (
                <tr key={z.n}>
                  <td style={{ ...s.td, textAlign: "left" }}><strong style={{ color: "var(--text)" }}>Z{z.n}</strong> {z.name}</td>
                  <td style={s.td}>{z.hr ? `${z.hr.low}–${z.hr.high} bpm` : "—"}</td>
                  <td style={s.td}>{z.pace ? `${z.pace.low}–${z.pace.high}` : "—"}</td>
                  <td style={s.td}>{z.speed ? `${z.speed.low}–${z.speed.high} km/h` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ ...s.note, marginTop: 10 }}>Enter a Max HR or MAS to see the zone table.</p>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 110 }}>
      <label style={s.label}>{label}</label>
      {children}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  title: { fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 4 },
  hint: { fontSize: 12, color: "var(--mute)", margin: "0 0 12px", maxWidth: 520 },
  card: { background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: "14px" },
  inputRow: { display: "flex", gap: 12, flexWrap: "wrap" },
  label: { fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.04em" },
  input: { flex: 1, minWidth: 0, background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "7px 10px", fontSize: 13 },
  inputSm: { width: 72, background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "6px 8px", fontSize: 13 },
  estBtn: { background: "var(--panel2)", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "0 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 },
  metaRow: { display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginTop: 10 },
  linkBtn: { background: "transparent", border: "none", color: "var(--accent)", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 },
  note: { fontSize: 11.5, color: "var(--mute)" },
  testBox: { marginTop: 10, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px" },
  applyBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  table: { width: "100%", borderCollapse: "collapse", marginTop: 14, fontSize: 12 },
  th: { textAlign: "center", fontSize: 10, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.03em", padding: "0 6px 6px", borderBottom: "1px solid var(--line)" },
  td: { textAlign: "center", padding: "7px 6px", color: "var(--mute)", borderBottom: "1px solid var(--line)" },
};
