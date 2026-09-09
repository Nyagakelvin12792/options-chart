import type { Page } from "@playwright/test";

const DAY_MS = 86_400_000;
const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

const contractDate = (expiry: number): string => {
  const date = new Date(expiry);
  return `${date.getUTCDate()}${MONTHS[date.getUTCMonth()]}${String(date.getUTCFullYear()).slice(-2)}`;
};

export const installDeribitFixtureMock = async (page: Page): Promise<void> => {
  const now = Date.now();
  const spot = 78_000;
  const expiries = [now + 2 * DAY_MS, now + 9 * DAY_MS];
  const strikes = [72_000, 74_000, 76_000, 78_000, 80_000, 82_000, 84_000];
  const instruments = expiries.flatMap((expiry) =>
    strikes.flatMap((strike) =>
      (["call", "put"] as const).map((optionType) => ({
        instrument_name: `BTC-${contractDate(expiry)}-${strike}-${optionType === "call" ? "C" : "P"}`,
        kind: "option",
        base_currency: "BTC",
        quote_currency: "BTC",
        counter_currency: "USD",
        settlement_currency: "BTC",
        price_index: "btc_usd",
        instrument_type: "reversed",
        creation_timestamp: now - 30 * DAY_MS,
        expiration_timestamp: expiry,
        strike,
        option_type: optionType,
        contract_size: 1,
        is_active: true,
        state: "open",
      })),
    ),
  );
  const summaries = instruments.map((instrument, index) => {
    const strikeIndex = strikes.indexOf(instrument.strike);
    const expiryIndex = expiries.indexOf(instrument.expiration_timestamp);
    const distance = Math.abs(instrument.strike / spot - 1);
    const concentration =
      instrument.option_type === "call" && strikeIndex >= 4
        ? 38
        : instrument.option_type === "put" && strikeIndex <= 2
          ? 42
          : 0;
    const openInterest =
      12 +
      expiryIndex * 3 +
      (6 - Math.abs(3 - strikeIndex)) * 4 +
      concentration;
    const volume = 2 + (index % 8) + concentration * 0.18;
    return {
      instrument_name: instrument.instrument_name,
      base_currency: "BTC",
      quote_currency: "BTC",
      creation_timestamp: Date.now(),
      open_interest: openInterest,
      mark_price: Math.max(0.002, 0.045 - distance * 0.18),
      mark_iv: (0.48 + distance * 0.55 + expiryIndex * 0.015) * 100,
      interest_rate: 0.01,
      underlying_price: spot,
      underlying_index: "index_price",
      volume,
      volume_usd: volume * spot,
    };
  });

  await page.route("https://www.deribit.com/api/v2/**", async (route) => {
    const method = new URL(route.request().url()).pathname.split("/").at(-1);
    const result =
      method === "get_time"
        ? Date.now()
        : method === "get_instruments"
          ? instruments
          : method === "get_book_summary_by_currency"
            ? summaries.map((summary) => ({
                ...summary,
                creation_timestamp: Date.now(),
              }))
            : method === "get_index_price"
              ? { index_price: spot, estimated_delivery_price: spot }
              : null;
    await route.fulfill({ json: { jsonrpc: "2.0", id: 1, result } });
  });
};

export const installDeribitUnavailableMock = async (
  page: Page,
): Promise<void> => {
  await page.route("https://www.deribit.com/api/v2/**", (route) =>
    route.abort(),
  );
};
