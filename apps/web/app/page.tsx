import { CALCULATION_ENGINE_VERSION } from "@options-chart/options-engine";

export default function HomePage() {
  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">BTCUSDT</p>
          <h1>BTC Options Metrics Dashboard</h1>
        </div>
        <span className="status">Architecture lock</span>
      </header>
      <section aria-label="Architecture status">
        <p>M0 scaffold</p>
        <strong>Calculation engine {CALCULATION_ENGINE_VERSION}</strong>
      </section>
    </main>
  );
}
