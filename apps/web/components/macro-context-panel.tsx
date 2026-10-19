"use client";

import { useEffect, useState } from "react";
import { validateHandoff } from "@/lib/macro-context";
import styles from "./macro-context-panel.module.css";

export function MacroContextPanel() {
  const [input, setInput] = useState<unknown>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const result = input === null ? null : validateHandoff(input, now);
  const snapshot = result?.payload;
  return (
    <section className={styles.panel} aria-labelledby="macro-context-heading">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>BTC MACROS</p>
          <h2 id="macro-context-heading">Macro context</h2>
        </div>
        <span
          role="status"
          className={result?.accepted ? styles.ready : styles.blocked}
        >
          {result?.accepted
            ? "Context available"
            : input === null
              ? "No snapshot"
              : "Context blocked"}
        </span>
      </div>
      <p>
        Import your dated BTC macros export. Context stays in this browser tab
        and never changes option levels or position sizing.
      </p>
      <label className={styles.upload}>
        Import macro snapshot
        <input
          type="file"
          accept="application/json,.json"
          aria-label="Import macro snapshot"
          onChange={async (event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            setError("");
            setInput(null);
            try {
              if (file.size > 1_000_000)
                throw new Error("Snapshot exceeds the 1 MB limit");
              const value: unknown = JSON.parse(await file.text());
              if (!validateHandoff(value).payload)
                throw new Error("Invalid schema");
              setNow(Date.now());
              setInput(value);
            } catch {
              setError("Select a valid JSON snapshot smaller than 1 MB.");
            }
          }}
        />
      </label>
      {error ? <p role="alert">{error}</p> : null}
      {result && !result.accepted ? (
        <div role="alert">
          <p>Macro context is unavailable for the current review.</p>
          <ul>
            {result.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {snapshot ? (
        <>
          <dl className={styles.grid}>
            <div>
              <dt>Macro</dt>
              <dd>{snapshot.macro}</dd>
            </div>
            <div>
              <dt>Fundamentals</dt>
              <dd>{snapshot.fundamentals}</dd>
            </div>
            <div>
              <dt>Positioning</dt>
              <dd>{snapshot.positioning}</dd>
            </div>
            <div>
              <dt>Overall</dt>
              <dd>{result?.accepted ? snapshot.regime : "WITHHELD"}</dd>
            </div>
          </dl>
          <p>
            Snapshot{" "}
            {new Date(snapshot.createdAt).toLocaleString("en-GB", {
              timeZone: "Africa/Nairobi",
            })}{" "}
            EAT. Revalidated every 15 seconds. Expires one hour after creation.
          </p>
          <details>
            <summary>Evidence and limitations</summary>
            <p>{snapshot.methodologyVersion}. Candidate descriptive rules.</p>
            <ul>
              {snapshot.limitations.map((limitation, index) => (
                <li key={index}>{limitation}</li>
              ))}
            </ul>
            <div className={styles.table}>
              <table>
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Value</th>
                    <th>Observation</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.evidence.map((row) => (
                    <tr key={row.metric}>
                      <td>{row.metric}</td>
                      <td>
                        {row.value === null
                          ? "Unavailable"
                          : `${row.value.toLocaleString("en-US", { maximumFractionDigits: 3 })} ${row.unit}`}
                      </td>
                      <td>{row.asOf || "Missing"}</td>
                      <td>{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Snapshot ID: {snapshot.snapshotId}. No automatic refresh or
              persistence.
            </p>
          </details>
        </>
      ) : null}
      {input !== null ? (
        <button
          type="button"
          onClick={() => {
            setInput(null);
            setError("");
          }}
        >
          Clear macro context
        </button>
      ) : null}
    </section>
  );
}
