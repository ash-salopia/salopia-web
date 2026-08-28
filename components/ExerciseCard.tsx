"use client";

import { useState } from "react";
import VideoModal from "@/components/VideoModal";
import ExerciseHistoryModal from "@/components/ExerciseHistoryModal";
import LibraryEntryForm from "@/components/LibraryEntryForm";
import RepsTimeField from "@/components/RepsTimeField";
import { saveLibraryEntry } from "@/lib/data/library";
import type { SessionExercise, SetLog, LibraryEntry } from "@/types";

interface Props {
  exercise: SessionExercise;
  library?: LibraryEntry[];
  athleteId?: string;
  currentSessionId?: string;
  // Calculated %1RM target per set (kg), when the exercise prescribes
  // one - shown as a preview in the load box, purely for the coach to
  // see what the athlete should lift. Never written to the log; only
  // an explicit ✓ tap (or the coach typing a real override) saves
  // anything here.
  percentTargets?: (number | null)[];
  onEdit: (patch: Partial<SessionExercise>) => void;
  onRemove: () => void;
  onLogChange: (log: SetLog[]) => void;
  onApplyFuture?: (patch: Partial<SessionExercise>) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  // Other strength sessions for this athlete this exercise could be
  // relocated to (e.g. Tuesday's session onto Monday's) - an in-place
  // move, not a copy, so any logged sets/weights on it carry over.
  otherStrengthSessions?: { id: string; name: string; date: string }[];
  onMoveToSession?: (targetSessionId: string) => void;
  // Collapsed ("zoomed out") vs expanded card state, owned by the
  // parent (session page) rather than local - lets the page decide a
  // sensible default (collapsed for existing exercises, expanded for
  // one just added) and keep multiple cards open independently.
  expanded?: boolean;
  onToggleExpand?: () => void;
  // Native HTML5 drag-and-drop (same pattern already used elsewhere in
  // this app, e.g. settings/page.tsx's reflection-metrics reorder) -
  // the parent owns the exercises array and the actual reorder logic
  // (handleReorderExercise), this card only needs to forward the drag
  // events for whichever index it represents.
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

export default function ExerciseCard({
  exercise,
  library = [],
  athleteId,
  currentSessionId,
  percentTargets,
  onEdit,
  onRemove,
  onLogChange,
  onApplyFuture,
  onMoveUp,
  onMoveDown,
  otherStrengthSessions = [],
  onMoveToSession,
  expanded = true,
  onToggleExpand,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
}: Props) {
  const [applyFutureOn, setApplyFutureOn] = useState(false);
  const [eachSideInfoOpen, setEachSideInfoOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [nameDropdownOpen, setNameDropdownOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [addToLibraryOpen, setAddToLibraryOpen] = useState(false);
  const [addToLibraryError, setAddToLibraryError] = useState("");
  const [altPickerOpen, setAltPickerOpen] = useState(false);
  const [altSearch, setAltSearch] = useState("");
  const [movePickerOpen, setMovePickerOpen] = useState(false);
  const [moveSearch, setMoveSearch] = useState("");

  // Wraps onEdit: always updates this exercise, and if the "apply to
  // future" toggle is on, also pushes the same patch to every future
  // session with a matching exercise name (handled by the parent via
  // onApplyFuture, which calls lib/data/sessions.ts's
  // applyToFutureSessions - see that file for why this is simpler
  // here than it was in the original prototype).
  const onEditPresc = (patch: Partial<SessionExercise>) => {
    onEdit(patch);
    if (applyFutureOn && onApplyFuture) onApplyFuture(patch);
  };

  // Letters-in-order match anywhere in the name (not just a prefix),
  // matching the same autocomplete behaviour used elsewhere in the
  // app (see the athlete search dropdown built in the original
  // prototype) - "back sq" matches "Barbell Back Squat".
  const nameQuery = exercise.name.trim().toLowerCase();
  const nameMatches = nameQuery
    ? library.filter((l) => l.name.toLowerCase().includes(nameQuery)).slice(0, 8)
    : [];
  const hasExactMatch = nameQuery && library.some((l) => l.name.toLowerCase() === nameQuery);

  // Picking a library entry copies its preset fields onto this
  // exercise - video, sets, reps, time, rest, load, tempo, notes -   // but ONLY fields that are genuinely non-empty on the library
  // entry, so picking a sparse preset never blanks out something the
  // coach already filled in. Matches the prototype's presetPatch
  // exactly. Always goes through onEdit (not onEditPresc) since
  // picking a name isn't really "changing a prescribed field" in the
  // apply-to-future sense - it's establishing what the exercise IS.
  const applyLibraryPreset = (entry: LibraryEntry) => {
    const patch: Partial<SessionExercise> = { name: entry.name };
    if (entry.video_url) patch.video_url = entry.video_url;
    if (entry.sets) patch.sets = parseInt(entry.sets, 10) || exercise.sets;
    if (entry.reps) patch.reps = entry.reps;
    if (entry.time) patch.time = entry.time;
    if (entry.rest) patch.rest = entry.rest;
    if (entry.target_load) patch.target_load = entry.target_load;
    if (entry.tempo) patch.tempo = entry.tempo;
    if (entry.notes) patch.notes = entry.notes;
    // Unlike the text fields above, these three are unconditional -     // picking a name is establishing what the exercise IS (e.g. Chin
    // Up is always bodyweight), so `false` on the library entry is a
    // meaningful configured default, not "not set".
    patch.is_bodyweight = entry.is_bodyweight;
    patch.each_side = entry.each_side;
    patch.use_percent_1rm = entry.use_percent_1rm;
    onEdit(patch);
    setNameDropdownOpen(false);
  };

  const handleAddToLibrary = async (entry: Partial<LibraryEntry> & { name: string }) => {
    setAddToLibraryError("");
    try {
      const saved = await saveLibraryEntry(entry);
      setAddToLibraryOpen(false);
      applyLibraryPreset(saved);
    } catch (e) {
      setAddToLibraryError(e instanceof Error ? e.message : "Could not save to library");
    }
  };

  const log = exercise.log || [];

  const updateSet = (index: number, patch: Partial<SetLog>) => {
    const newLog = log.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onLogChange(newLog);
  };

  // Per-set %1RM prescriptions live in exercise.set_percents (a
  // prescription, alongside reps/rest/tempo), not in the log - that
  // stays purely the athlete's actual results. Padded out to match
  // the current set count so an index is always safe to write.
  const updateSetPercent = (index: number, value: string) => {
    const next = [...(exercise.set_percents ?? [])];
    while (next.length < log.length) next.push("");
    next[index] = value;
    onEditPresc({ set_percents: next });
  };

  // Reps vs time is decided purely by whether the exercise is prescribed
  // in time mode (exercise.time set) - same rule as the athlete app's own
  // session view. Tempo (a rep-cadence concept, e.g. 3-1-1-0) doesn't
  // apply to a timed hold like a side plank, so it hides in time mode.
  const timeMode = (exercise.time ?? "").trim().length > 0;

  // Same computed summary Live Group's collapsed exercise row already
  // builds (e.g. "3× 8 60kg") - reused for consistency rather than a
  // different format invented just for this card.
  const prescSummary = [exercise.sets ? `${exercise.sets}×` : "", exercise.time || exercise.reps, exercise.target_load]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      style={styles.card}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {!expanded && (
        <div style={styles.collapsedRow} onClick={onToggleExpand}>
          <span
            draggable
            onDragStart={onDragStart}
            onClick={(e) => e.stopPropagation()}
            style={styles.dragHandle}
            title="Drag to reorder"
          >
            ⠿
          </span>
          <span style={styles.orderBadge}>{exercise.order || "—"}</span>
          <span style={styles.collapsedName}>{exercise.name || "Untitled exercise"}</span>
          {prescSummary && <span style={styles.collapsedPresc}>{prescSummary}</span>}
          <button
            style={styles.removeBtn}
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            title="Remove exercise"
          >
            ×
          </button>
          <span style={styles.expandChevron}>▾</span>
        </div>
      )}

      {expanded && (
      <>
      <div style={styles.cardHead} onClick={onToggleExpand}>
        <span
          draggable
          onDragStart={onDragStart}
          style={styles.dragHandle}
          title="Drag to reorder"
        >
          ⠿
        </span>
        <button style={styles.expandChevronBtn} onClick={(e) => { e.stopPropagation(); onToggleExpand?.(); }} title="Collapse">
          ▴
        </button>
        <div style={styles.moveBtnCol} onClick={(e) => e.stopPropagation()}>
          <button
            style={{ ...styles.moveBtn, opacity: onMoveUp ? 1 : 0.25 }}
            onClick={onMoveUp}
            disabled={!onMoveUp}
            title="Move up"
          >
            ▴
          </button>
          <button
            style={{ ...styles.moveBtn, opacity: onMoveDown ? 1 : 0.25 }}
            onClick={onMoveDown}
            disabled={!onMoveDown}
            title="Move down"
          >
            ▾
          </button>
        </div>
        <input
          value={exercise.order}
          onChange={(e) => onEdit({ order: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          placeholder="#"
          title="e.g. 1, or 1A/1B for a superset - a plain number moves this exercise to that position"
          style={styles.orderInput}
        />
        <div style={styles.nameFieldWrap} onClick={(e) => e.stopPropagation()}>
          <input
            value={exercise.name}
            onChange={(e) => {
              onEdit({ name: e.target.value });
              setNameDropdownOpen(true);
            }}
            onFocus={() => setNameDropdownOpen(true)}
            onBlur={() => setTimeout(() => setNameDropdownOpen(false), 150)}
            placeholder="Exercise name"
            style={styles.nameInput}
          />
          {nameDropdownOpen && nameQuery && (nameMatches.length > 0 || !hasExactMatch) && (
            <div style={styles.nameDropdown}>
              {nameMatches.map((entry) => (
                <button
                  key={entry.id}
                  style={styles.nameDropdownItem}
                  onMouseDown={(e) => {
                    e.preventDefault(); // keep focus so onBlur doesn't fire before the click registers
                    applyLibraryPreset(entry);
                  }}
                >
                  <span>{entry.name}</span>
                  {entry.video_url && <span style={styles.nameDropdownVideoTag}>▶</span>}
                </button>
              ))}
              {!hasExactMatch && (
                <button
                  style={styles.nameDropdownAddBtn}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setAddToLibraryOpen(true);
                  }}
                >
                  + Add &quot;{exercise.name.trim()}&quot; to library
                </button>
              )}
            </div>
          )}
        </div>
        {exercise.video_url && (
          <button style={styles.videoBtn} onClick={(e) => { e.stopPropagation(); setVideoOpen(true); }} title="Watch demo video">
            ▶
          </button>
        )}
        {athleteId && exercise.name.trim() && (
          <button
            style={styles.historyBtn}
            onClick={(e) => { e.stopPropagation(); setHistoryOpen(true); }}
            title="View history & PB"
          >
            📈
          </button>
        )}
        {athleteId && exercise.name.trim() && (
          <button
            style={styles.historyBtn}
            onClick={(e) => { e.stopPropagation(); setAltPickerOpen(true); }}
            title="Set approved alternative exercises the athlete can swap to"
          >
            🔀{exercise.alternative_names?.length ? ` ${exercise.alternative_names.length}` : ""}
          </button>
        )}
        {exercise.progress === "yes" && (
          <span style={styles.progressBadgeYes} title="Athlete said they could progress this next time">
            👍 progress
          </span>
        )}
        {exercise.progress === "no" && (
          <span style={styles.progressBadgeNo} title="Athlete said they couldn't progress this yet">
            👎 hold
          </span>
        )}
        {exercise.swapped_from && (
          <span style={styles.swappedBadge} title={`Athlete swapped this from "${exercise.swapped_from}"`}>
            🔀 was &quot;{exercise.swapped_from}&quot;
          </span>
        )}
        {exercise.opted_out && (
          <span style={styles.optedOutBadge} title="Athlete opted out of this exercise for this session">
            ⏭ skipped
          </span>
        )}
        {onMoveToSession && otherStrengthSessions.length > 0 && (
          <button
            style={styles.historyBtn}
            onClick={(e) => { e.stopPropagation(); setMovePickerOpen(true); }}
            title="Move this exercise to another session"
          >
            ↪
          </button>
        )}
        <button style={styles.removeBtn} onClick={(e) => { e.stopPropagation(); onRemove(); }}>
          ×
        </button>
      </div>

      {videoOpen && exercise.video_url && (
        <VideoModal
          videoUrl={exercise.video_url}
          title={exercise.name}
          onClose={() => setVideoOpen(false)}
        />
      )}

      {historyOpen && athleteId && exercise.name.trim() && (
        <ExerciseHistoryModal
          athleteId={athleteId}
          exerciseName={exercise.name}
          currentSessionId={currentSessionId ?? ""}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      {altPickerOpen && (
        <div style={styles.addToLibraryOverlay} onClick={() => { setAltPickerOpen(false); setAltSearch(""); }}>
          <div style={styles.altPanel} onClick={(e) => e.stopPropagation()}>
            <div style={styles.altTitle}>Alternatives for &quot;{exercise.name}&quot;</div>
            <div style={styles.altHint}>
              The athlete can swap to any of these, or freely search their whole library, when logging this session.
            </div>

            {(exercise.alternative_names ?? []).length > 0 && (
              <div style={styles.altChips}>
                {(exercise.alternative_names ?? []).map((name) => (
                  <span key={name} style={styles.altChip}>
                    {name}
                    <button
                      style={styles.altChipRemove}
                      onClick={() => onEdit({
                        alternative_names: (exercise.alternative_names ?? []).filter((n) => n !== name),
                      })}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <input
              value={altSearch}
              onChange={(e) => setAltSearch(e.target.value)}
              placeholder="Search library to add…"
              style={styles.altSearchInput}
              autoFocus
            />
            <div style={styles.altResults}>
              {library
                .filter((l) => l.name.toLowerCase() !== exercise.name.trim().toLowerCase())
                .filter((l) => !(exercise.alternative_names ?? []).includes(l.name))
                .filter((l) => !altSearch.trim() || l.name.toLowerCase().includes(altSearch.trim().toLowerCase()))
                .slice(0, 20)
                .map((entry) => (
                  <button
                    key={entry.id}
                    style={styles.altResultItem}
                    onClick={() => {
                      onEdit({ alternative_names: [...(exercise.alternative_names ?? []), entry.name] });
                      setAltSearch("");
                    }}
                  >
                    + {entry.name}
                  </button>
                ))}
            </div>

            <button style={styles.altDoneBtn} onClick={() => { setAltPickerOpen(false); setAltSearch(""); }}>
              Done
            </button>
          </div>
        </div>
      )}

      {movePickerOpen && (
        <div style={styles.addToLibraryOverlay} onClick={() => { setMovePickerOpen(false); setMoveSearch(""); }}>
          <div style={styles.altPanel} onClick={(e) => e.stopPropagation()}>
            <div style={styles.altTitle}>Move &quot;{exercise.name}&quot; to…</div>
            <div style={styles.altHint}>
              Relocates this exercise to another session - any logged sets on it move too.
            </div>

            <input
              value={moveSearch}
              onChange={(e) => setMoveSearch(e.target.value)}
              placeholder="Search sessions…"
              style={styles.altSearchInput}
              autoFocus
            />
            <div style={styles.altResults}>
              {otherStrengthSessions
                .filter((s) =>
                  !moveSearch.trim() ||
                  s.name.toLowerCase().includes(moveSearch.trim().toLowerCase()) ||
                  s.date.includes(moveSearch.trim())
                )
                .map((s) => (
                  <button
                    key={s.id}
                    style={styles.altResultItem}
                    onClick={() => {
                      onMoveToSession?.(s.id);
                      setMovePickerOpen(false);
                      setMoveSearch("");
                    }}
                  >
                    {s.name} · {s.date}
                  </button>
                ))}
            </div>

            <button style={styles.altDoneBtn} onClick={() => { setMovePickerOpen(false); setMoveSearch(""); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {addToLibraryOpen && (
        <div style={styles.addToLibraryOverlay} onClick={() => setAddToLibraryOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            {addToLibraryError && <div style={styles.addToLibraryError}>{addToLibraryError}</div>}
            <LibraryEntryForm
              entry={null}
              initialName={exercise.name.trim()}
              title={`Add "${exercise.name.trim()}" to library`}
              onSave={handleAddToLibrary}
              onClose={() => setAddToLibraryOpen(false)}
            />
          </div>
        </div>
      )}

      {exercise.athlete_exercise_notes && (
        <div style={styles.athleteExerciseNote} title="Athlete's own note on this exercise">
          📝 {exercise.athlete_exercise_notes}
        </div>
      )}

      {onApplyFuture && (
        <label style={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={applyFutureOn}
            onChange={(e) => setApplyFutureOn(e.target.checked)}
            style={{ accentColor: "var(--accent)" }}
          />
          <span style={{ color: applyFutureOn ? "var(--accent)" : "var(--mute)" }}>
            ↻ Apply changes below to all future sessions
          </span>
        </label>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative", marginTop: 8 }}>
        <label style={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={!!exercise.each_side}
            onChange={(e) => onEditPresc({ each_side: e.target.checked })}
            style={{ accentColor: "var(--accent)" }}
          />
          <span style={{ color: exercise.each_side ? "var(--accent)" : "var(--mute)" }}>Each side</span>
        </label>
        <button
          type="button"
          onClick={() => setEachSideInfoOpen((v) => !v)}
          style={styles.infoBtn}
        >
          i
        </button>
        {eachSideInfoOpen && (
          <div style={styles.infoPopover}>
            Tick this if the logged weight is per hand or per side (e.g. dumbbells,
            single-arm work). It doubles the tonnage calculation used in reports.
            Leave unticked for single-side-only moves.
          </div>
        )}
        {!exercise.completion_only && (
          <label style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={!!exercise.is_bodyweight}
              onChange={(e) => onEditPresc({ is_bodyweight: e.target.checked })}
              style={{ accentColor: "var(--accent)" }}
            />
            <span style={{ color: exercise.is_bodyweight ? "var(--accent)" : "var(--mute)" }}>Bodyweight only</span>
          </label>
        )}
        {!exercise.is_bodyweight && !exercise.completion_only && (
          <label style={styles.checkboxRow} title="Prescribe each set's own %1RM (e.g. a 70/80/90% ramp) instead of a fixed load">
            <input
              type="checkbox"
              checked={!!exercise.use_percent_1rm}
              onChange={(e) => onEditPresc({ use_percent_1rm: e.target.checked })}
              style={{ accentColor: "var(--accent)" }}
            />
            <span style={{ color: exercise.use_percent_1rm ? "var(--accent)" : "var(--mute)" }}>Use %1RM</span>
          </label>
        )}
        <label style={styles.checkboxRow} title="A deliberately lighter primer/activation effort (e.g. pre-match). Excluded from reports and the rolling %1RM estimate, so it won't look like a strength drop.">
          <input
            type="checkbox"
            checked={!!exercise.is_primer}
            onChange={(e) => onEditPresc({ is_primer: e.target.checked })}
            style={{ accentColor: "var(--accent)" }}
          />
          <span style={{ color: exercise.is_primer ? "var(--accent)" : "var(--mute)" }}>Primer / activation</span>
        </label>
        <label style={styles.checkboxRow} title="Nothing to track for this exercise (e.g. a mobility drill or warm-up) — logging is just a done tick per set, no weight/reps/time boxes">
          <input
            type="checkbox"
            checked={!!exercise.completion_only}
            onChange={(e) => onEditPresc({ completion_only: e.target.checked })}
            style={{ accentColor: "var(--accent)" }}
          />
          <span style={{ color: exercise.completion_only ? "var(--accent)" : "var(--mute)" }}>Completion only</span>
        </label>
        {!exercise.completion_only && (
          <label style={styles.checkboxRow} title="Show a bar speed (m/s) box per set, for velocity-based training">
            <input
              type="checkbox"
              checked={!!exercise.track_velocity}
              onChange={(e) => onEditPresc({ track_velocity: e.target.checked })}
              style={{ accentColor: "var(--accent)" }}
            />
            <span style={{ color: exercise.track_velocity ? "var(--accent)" : "var(--mute)" }}>Bar speed (m/s)</span>
          </label>
        )}
      </div>

      <div style={styles.prescRow}>
        <Field label="Sets" flex={0.6}>
          <input
            value={exercise.sets}
            onChange={(e) => onEditPresc({ sets: parseInt(e.target.value) || 0 })}
            inputMode="numeric"
            style={styles.miniInput}
          />
        </Field>
        <div style={{ flex: 1.6, minWidth: 0 }}>
          <RepsTimeField
            reps={exercise.reps}
            time={exercise.time}
            onChange={(patch) => onEditPresc(patch)}
            inputStyle={styles.miniInput}
            labelStyle={styles.fieldLabel}
          />
        </div>
        <Field label="Rest">
          <input
            value={exercise.rest}
            onChange={(e) => onEditPresc({ rest: e.target.value })}
            placeholder="90s"
            style={styles.miniInput}
          />
        </Field>
        {!exercise.is_bodyweight && !exercise.use_percent_1rm && !exercise.completion_only && (
          <Field label="Load" grow>
            <input
              value={exercise.target_load}
              onChange={(e) => onEditPresc({ target_load: e.target.value })}
              placeholder="e.g. 60kg"
              style={styles.miniInput}
            />
          </Field>
        )}
        {exercise.track_velocity && !exercise.completion_only && (
          <Field label="Target speed">
            <input
              value={exercise.target_velocity ?? ""}
              onChange={(e) => onEditPresc({ target_velocity: e.target.value })}
              placeholder="e.g. 0.8"
              inputMode="decimal"
              style={styles.miniInput}
            />
          </Field>
        )}
        {!timeMode && (
          <Field label="Tempo">
            <input
              value={exercise.tempo ?? "2-0-2"}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9-]/g, "");
                onEditPresc({ tempo: v });
              }}
              placeholder="2-0-2"
              inputMode="numeric"
              style={styles.miniInput}
            />
          </Field>
        )}
      </div>

      {/* Exercise notes - coaching cues, technique reminders */}
      <div style={styles.notesWrap}>
        <input
          value={exercise.notes ?? ""}
          onChange={(e) => onEditPresc({ notes: e.target.value })}
          placeholder="Notes / coaching cues…"
          style={styles.notesInput}
        />
      </div>

      <div style={styles.setGrid}>
        {log.map((set, i) => {
          const target = percentTargets?.[i] ?? null;
          if (exercise.completion_only) {
            return (
              <div key={i} style={{ ...styles.setChip, ...(set.done ? styles.setChipDone : {}) }}>
                <div style={styles.setIdx}>{i + 1}</div>
                <button
                  style={{ ...styles.doneBtn, ...(set.done ? styles.doneBtnOn : {}) }}
                  onClick={() => updateSet(i, { done: !set.done })}
                >
                  ✓
                </button>
              </div>
            );
          }
          return (
            <div key={i} style={{ ...styles.setChip, ...(set.done ? styles.setChipDone : {}) }}>
              <div style={styles.setIdx}>{i + 1}</div>
              <input
                value={set.weight}
                onChange={(e) => updateSet(i, { weight: e.target.value })}
                // The session builder is for prescribing, not logging
                // live - typing here (or seeing a calculated %1RM
                // target) never marks a set done on its own. Only an
                // explicit ✓ tap does, so a coach can freely draft or
                // adjust numbers without it reading as "the athlete
                // did this."
                placeholder={target != null ? String(target) : "kg"}
                inputMode="decimal"
                style={styles.setInput}
              />
              {exercise.use_percent_1rm && (
                <input
                  value={exercise.set_percents?.[i] ?? ""}
                  onChange={(e) => updateSetPercent(i, e.target.value)}
                  placeholder="%1RM"
                  inputMode="decimal"
                  style={styles.setInput}
                />
              )}
              {timeMode ? (
                <input
                  value={set.time ?? ""}
                  onChange={(e) => updateSet(i, { time: e.target.value })}
                  placeholder={exercise.time || "sec"}
                  inputMode="numeric"
                  style={styles.setInput}
                />
              ) : (
                <input
                  value={set.reps}
                  onChange={(e) => updateSet(i, { reps: e.target.value })}
                  placeholder={exercise.reps || "reps"}
                  inputMode="numeric"
                  style={styles.setInput}
                />
              )}
              {exercise.track_velocity && (
                <input
                  value={set.velocity ?? ""}
                  onChange={(e) => updateSet(i, { velocity: e.target.value })}
                  placeholder={exercise.target_velocity ? `${exercise.target_velocity} m/s` : "m/s"}
                  inputMode="decimal"
                  style={styles.setInput}
                />
              )}
              <button
                style={{
                  ...styles.doneBtn,
                  ...(set.done ? styles.doneBtnOn : {}),
                }}
                onClick={() => {
                  // Tapping done on a still-empty box captures the
                  // greyed %1RM suggestion as the real value - the box
                  // only ever shows it as a placeholder (so it never
                  // reads as "already entered"), but confirming
                  // without typing over it should still record it.
                  if (!set.done && !set.weight.trim() && target != null) {
                    updateSet(i, { weight: String(target), done: true });
                  } else {
                    updateSet(i, { done: !set.done });
                  }
                }}
              >
                ✓
              </button>
            </div>
          );
        })}
      </div>
      </>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  grow,
  flex,
}: {
  label: string;
  children: React.ReactNode;
  grow?: boolean;
  flex?: number;
}) {
  return (
    <div style={{ flex: flex ?? (grow ? 1.5 : 1), minWidth: 0 }}>
      <div style={styles.fieldLabel}>{label}</div>
      {children}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 12,
    padding: 14,
  },
  cardHead: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const, cursor: "pointer" },
  collapsedRow: { display: "flex", alignItems: "center", gap: 10, cursor: "pointer" },
  dragHandle: {
    cursor: "grab",
    color: "var(--mute)",
    fontSize: 16,
    lineHeight: 1,
    flexShrink: 0,
    padding: "4px 2px",
    userSelect: "none" as const,
  },
  orderBadge: {
    minWidth: 24,
    textAlign: "center" as const,
    flexShrink: 0,
    fontSize: 12,
    fontWeight: 800,
    color: "var(--accent)",
    background: "var(--accent-dim)",
    borderRadius: 6,
    padding: "3px 6px",
  },
  collapsedName: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  collapsedPresc: {
    fontSize: 12,
    color: "var(--mute)",
    flexShrink: 0,
    whiteSpace: "nowrap" as const,
  },
  expandChevron: { color: "var(--accent)", fontSize: 12, flexShrink: 0 },
  expandChevronBtn: {
    background: "transparent",
    border: "1px solid var(--accent)",
    color: "var(--accent)",
    borderRadius: 6,
    width: 26,
    height: 26,
    fontSize: 13,
    cursor: "pointer",
    flexShrink: 0,
  },
  orderInput: {
    width: 36,
    flexShrink: 0,
    textAlign: "center",
    background: "var(--ink)",
    border: "1px solid var(--line)",
    color: "var(--mute)",
    borderRadius: 8,
    padding: "8px 4px",
    fontSize: 13,
    fontWeight: 700,
  },
  moveBtnCol: {
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    gap: 2,
  },
  moveBtn: {
    background: "transparent",
    border: "none",
    color: "var(--mute)",
    cursor: "pointer",
    fontSize: 22,
    lineHeight: 1,
    padding: "4px 8px",
  },
  nameFieldWrap: { flex: 1, position: "relative", minWidth: 140 },
  nameInput: {
    width: "100%",
    background: "var(--ink)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 14,
    fontWeight: 700,
  },
  nameDropdown: {
    position: "absolute",
    top: "calc(100% + 4px)",
    left: 0,
    right: 0,
    zIndex: 30,
    background: "var(--panel2)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    padding: 4,
    maxHeight: 220,
    overflowY: "auto",
    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  },
  nameDropdownItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    padding: "8px 10px",
    borderRadius: 7,
    border: "none",
    background: "transparent",
    color: "var(--text)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "left",
  },
  nameDropdownVideoTag: { color: "var(--accent)", fontSize: 11 },
  nameDropdownAddBtn: {
    display: "block",
    width: "100%",
    padding: "8px 10px",
    borderRadius: 7,
    border: "1px dashed var(--accent)",
    background: "var(--accent-dim)",
    color: "var(--accent)",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    textAlign: "left",
    marginTop: 4,
  },
  addToLibraryOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(6,9,12,.82)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 80,
    padding: 16,
  },
  addToLibraryError: {
    background: "#2a0c0c",
    border: "1px solid #FF6B6B44",
    color: "#FF6B6B",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
    marginBottom: 8,
  },
  removeBtn: {
    background: "transparent",
    border: "none",
    color: "var(--mute)",
    fontSize: 18,
    cursor: "pointer",
    padding: 4,
  },
  videoBtn: {
    background: "var(--accent-dim)",
    border: "none",
    color: "var(--accent)",
    fontSize: 14,
    cursor: "pointer",
    borderRadius: 8,
    width: 34,
    height: 34,
    flexShrink: 0,
  },
  historyBtn: {
    background: "transparent",
    border: "1px solid var(--line)",
    color: "var(--mute)",
    fontSize: 14,
    cursor: "pointer",
    borderRadius: 8,
    width: 34,
    height: 34,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  progressBadgeYes: {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--good)",
    background: "var(--good-dim)",
    borderRadius: 6,
    padding: "4px 8px",
    flexShrink: 0,
    whiteSpace: "nowrap" as const,
  },
  progressBadgeNo: {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--mute)",
    background: "var(--panel2)",
    borderRadius: 6,
    padding: "4px 8px",
    flexShrink: 0,
    whiteSpace: "nowrap" as const,
  },
  swappedBadge: {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--accent)",
    background: "var(--accent-dim)",
    borderRadius: 6,
    padding: "4px 8px",
    flexShrink: 0,
    whiteSpace: "nowrap" as const,
  },
  athleteExerciseNote: {
    fontSize: 12,
    color: "var(--text)",
    background: "var(--ink)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    padding: "8px 10px",
    lineHeight: 1.4,
    fontStyle: "italic" as const,
  },
  optedOutBadge: {
    fontSize: 11,
    fontWeight: 700,
    color: "#FF6B6B",
    background: "#2a0c0c",
    borderRadius: 6,
    padding: "4px 8px",
    flexShrink: 0,
    whiteSpace: "nowrap" as const,
  },
  altPanel: {
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 16,
    padding: 18,
    width: "100%",
    maxWidth: 420,
    maxHeight: "80vh",
    overflowY: "auto" as const,
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  },
  altTitle: { fontSize: 16, fontWeight: 700, color: "var(--text)" },
  altHint: { fontSize: 12, color: "var(--mute)", lineHeight: 1.5 },
  altChips: { display: "flex", flexWrap: "wrap" as const, gap: 6 },
  altChip: {
    display: "flex", alignItems: "center", gap: 4,
    fontSize: 12, fontWeight: 600, color: "var(--accent)",
    background: "var(--accent-dim)", border: "1px solid var(--accent)44",
    borderRadius: 6, padding: "4px 4px 4px 8px",
  },
  altChipRemove: {
    background: "transparent", border: "none", color: "var(--accent)",
    fontSize: 14, cursor: "pointer", padding: "0 2px", lineHeight: 1,
  },
  altSearchInput: {
    background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)",
    borderRadius: 8, padding: "9px 12px", fontSize: 14, width: "100%",
  },
  altResults: { display: "flex", flexDirection: "column" as const, gap: 2, maxHeight: 200, overflowY: "auto" as const },
  altResultItem: {
    background: "transparent", border: "none", color: "var(--text)",
    fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" as const,
    padding: "7px 8px", borderRadius: 6,
  },
  altDoneBtn: {
    background: "var(--accent)", color: "#0a1420", border: "none",
    borderRadius: 8, padding: "10px 0", fontSize: 13, fontWeight: 700, cursor: "pointer",
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    cursor: "pointer",
    userSelect: "none",
    marginTop: 8,
  },
  infoBtn: {
    width: 16,
    height: 16,
    borderRadius: "50%",
    border: "1px solid var(--mute)",
    background: "transparent",
    color: "var(--mute)",
    fontSize: 10,
    lineHeight: 1,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  },
  infoPopover: {
    position: "absolute",
    top: "calc(100% + 6px)",
    left: 0,
    zIndex: 20,
    background: "var(--panel2)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    padding: "10px 12px",
    width: 240,
    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
    fontSize: 12,
    color: "var(--text)",
    lineHeight: 1.4,
  },
  prescRow: { display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" },
  fieldLabel: { fontSize: 10, color: "var(--mute)", marginBottom: 3, textTransform: "uppercase" },
  miniInput: {
    width: "100%",
    background: "var(--ink)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    borderRadius: 6,
    padding: "6px 8px",
    fontSize: 13,
  },
  setGrid: { display: "flex", flexDirection: "column", gap: 6, marginTop: 12 },
  setChip: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "var(--ink)",
    borderRadius: 8,
    padding: 6,
  },
  setChipDone: { boxShadow: "inset 0 0 0 1px var(--good)" },
  setIdx: {
    width: 22,
    height: 22,
    borderRadius: 6,
    background: "var(--panel2)",
    color: "var(--mute)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 700,
    flexShrink: 0,
  },
  setInput: {
    flex: 1,
    background: "var(--panel2)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    borderRadius: 6,
    padding: "6px 8px",
    fontSize: 13,
  },
  doneBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    border: "1px solid var(--line)",
    background: "transparent",
    color: "var(--line)",
    cursor: "pointer",
    flexShrink: 0,
  },
  doneBtnOn: { background: "var(--good-dim)", color: "var(--good)", borderColor: "var(--good)" },
  notesWrap: { marginTop: 8 },
  notesInput: {
    width: "100%",
    background: "var(--ink)",
    border: "1px solid var(--line)",
    color: "var(--mute)",
    borderRadius: 6,
    padding: "6px 8px",
    fontSize: 12,
    fontStyle: "italic",
  },
};
