from __future__ import annotations

import time
import threading
import uuid
from typing import Any

from .config import CollectorConfig, SUPPORTED_CHANNELS
from .events import CollectorRecord, MarketEventV1, MarketHealthEventV1, build_market_event
from .health import (
    build_collector_error_event,
    build_observability_event,
    build_stale_event,
    build_unsupported_channel_event,
    is_stale,
)


def now_ms() -> int:
    return time.time_ns() // 1_000_000


class BinanceSpotNormalizer:
    def __init__(self, config: CollectorConfig, *, connection_id: str | None = None) -> None:
        self.config = config
        self.connection_id = connection_id or f"cryptofeed-{uuid.uuid4()}"
        self._last_sequence: dict[str, int | str | None] = {}
        self._started_at_ms = now_ms()
        self._last_receipt_ms: dict[str, int | None] = {
            channel: None for channel in config.channels if channel in SUPPORTED_CHANNELS
        }

    def unsupported_channel_events(self, receipt_timestamp_ms: int | None = None) -> list[CollectorRecord]:
        receipt = receipt_timestamp_ms or now_ms()
        events: list[CollectorRecord] = []
        for channel in self.config.channels:
            if channel not in SUPPORTED_CHANNELS:
                events.append(
                    build_unsupported_channel_event(
                        venue=self.config.venue,
                        symbol=self.config.symbol,
                        channel=channel,
                        detected_at_ms=receipt,
                        connection_id=self.connection_id,
                        raw_channel=channel,
                    )
                )
        return events

    def startup_observability_events(self, receipt_timestamp_ms: int | None = None) -> list[MarketHealthEventV1]:
        detected_at_ms = receipt_timestamp_ms or now_ms()
        return [
            build_observability_event(
                venue=self.config.venue,
                symbol=self.config.symbol,
                channel="l2-book",
                detected_at_ms=detected_at_ms,
                connection_id=self.connection_id,
                delegated_signals=["sequence-gap"],
                note="Cryptofeed owns Binance raw U..u depth range validation before normalized callbacks.",
            ),
            build_observability_event(
                venue=self.config.venue,
                symbol=self.config.symbol,
                channel=None,
                detected_at_ms=detected_at_ms,
                connection_id=self.connection_id,
                delegated_signals=["reconnect-lifecycle"],
                note="Cryptofeed internal reconnect attempts are not exposed by normalized callbacks.",
            ),
        ]

    def stale_events(self, *, now_timestamp_ms: int | None = None) -> list[CollectorRecord]:
        current = now_timestamp_ms or now_ms()
        events: list[CollectorRecord] = []
        for channel, last in self._last_receipt_ms.items():
            baseline = last if last is not None else self._started_at_ms
            if is_stale(
                last_receipt_ms=baseline,
                now_ms=current,
                stale_after_ms=self.config.health.stale_after_ms,
            ):
                events.append(
                    build_stale_event(
                        venue=self.config.venue,
                        symbol=self.config.symbol,
                        channel=channel,  # type: ignore[arg-type]
                        detected_at_ms=current,
                        connection_id=self.connection_id,
                        last_event_timestamp_ms=last,
                        stale_threshold_ms=self.config.health.stale_after_ms,
                        elapsed_ms=current - baseline,
                    )
                )
        return events

    def normalize_trade(self, trade: Any, *, receipt_timestamp_ms: int | None = None) -> list[MarketEventV1]:
        receipt = receipt_timestamp_ms or now_ms()
        sequence = getattr(trade, "id", None)
        trade_timestamp_ms = _timestamp_ms(getattr(trade, "timestamp", None))
        payload = {
            "schemaVersion": "binance-spot-trade-payload-v1",
            "tradeId": sequence,
            "price": _decimal_string(getattr(trade, "price", None)),
            "quantity": _decimal_string(getattr(trade, "amount", None)),
            "tradeTimestampMs": trade_timestamp_ms,
            "takerSide": _normalize_side(getattr(trade, "side", None)),
        }
        is_buyer_maker = getattr(trade, "is_buyer_maker", None)
        if is_buyer_maker is None:
            is_buyer_maker = getattr(trade, "isBuyerMaker", None)
        if is_buyer_maker is not None:
            payload["isBuyerMaker"] = bool(is_buyer_maker)
        event = build_market_event(
            venue=self.config.venue,
            symbol=self.config.symbol,
            instrument_type="spot",
            channel="trade",
            exchange_timestamp_ms=trade_timestamp_ms,
            receipt_timestamp_ms=receipt,
            sequence=sequence,
            payload=payload,
            collector_version=self.config.collector_version,
            connection_id=self.connection_id,
        )
        self._last_receipt_ms["trade"] = receipt
        return [event]

    def normalize_l2_book(self, book: Any, *, receipt_timestamp_ms: int | None = None) -> list[CollectorRecord]:
        receipt = receipt_timestamp_ms or now_ms()
        sequence = getattr(book, "sequence_number", None)
        events: list[CollectorRecord] = []
        previous = self._last_sequence.get("l2-book")
        book_payload = _book_payload(book)
        payload = {
            "schemaVersion": "binance-spot-l2-book-payload-v1",
            "updateType": book_payload["updateType"],
            "sequence": sequence,
            "bids": book_payload["bids"],
            "asks": book_payload["asks"],
        }
        if previous is not None and not (
            isinstance(previous, int)
            and not isinstance(previous, bool)
            and isinstance(sequence, int)
            and not isinstance(sequence, bool)
            and sequence < previous
        ):
            payload["previousSequence"] = previous
        events.append(
            build_market_event(
                venue=self.config.venue,
                symbol=self.config.symbol,
                instrument_type="spot",
                channel="l2-book",
                exchange_timestamp_ms=_timestamp_ms(getattr(book, "timestamp", None)),
                receipt_timestamp_ms=receipt,
                sequence=sequence,
                payload=payload,
                collector_version=self.config.collector_version,
                connection_id=self.connection_id,
            )
        )
        self._last_sequence["l2-book"] = sequence
        self._last_receipt_ms["l2-book"] = receipt
        return events


def _timestamp_ms(value: Any) -> int | None:
    if value is None:
        return None
    numeric = float(value)
    if numeric > 10_000_000_000:
        return int(numeric)
    return int(numeric * 1000)


def _decimal_string(value: Any) -> str:
    if value is None:
        raise ValueError("missing decimal value")
    return str(value)


def _normalize_side(value: Any) -> str | None:
    if value is None:
        return None
    normalized = str(value).lower()
    if normalized in {"buy", "bid"}:
        return "buy"
    if normalized in {"sell", "ask"}:
        return "sell"
    return normalized


def _book_side(levels: Any) -> list[list[str]]:
    if hasattr(levels, "items"):
        iterable = levels.items()
    else:
        iterable = levels or []
    return [[str(price), str(amount)] for price, amount in sorted(iterable, key=lambda level: float(level[0]))]


def _book_payload(book: Any) -> dict[str, Any]:
    delta = getattr(book, "delta", None)
    if delta is not None:
        return {
            "updateType": "delta",
            "bids": _book_side(_side_levels(delta, "bids", "bid")),
            "asks": _book_side(_side_levels(delta, "asks", "ask")),
        }
    full_book = getattr(book, "book", {})
    return {
        "updateType": "snapshot",
        "bids": _book_side(_side_levels(full_book, "bids", "bid")),
        "asks": _book_side(_side_levels(full_book, "asks", "ask")),
    }


def _side_levels(container: Any, attr_name: str, legacy_key: str) -> Any:
    if hasattr(container, attr_name):
        return getattr(container, attr_name)
    if hasattr(container, legacy_key):
        return getattr(container, legacy_key)
    if hasattr(container, "get"):
        return container.get(attr_name, container.get(legacy_key, {}))
    return {}


def run_live(config: CollectorConfig, writer: Any) -> None:
    if not config.live_enabled:
        raise RuntimeError("live collection is disabled in config")
    try:
        from cryptofeed import FeedHandler
        from cryptofeed.callback import BookCallback, TradeCallback
        from cryptofeed.defines import L2_BOOK, TRADES
        from cryptofeed.exchanges import Binance
    except ImportError as exc:  # pragma: no cover - depends on optional install.
        raise RuntimeError("cryptofeed is required for live collection") from exc

    normalizer = BinanceSpotNormalizer(config)
    for event in normalizer.unsupported_channel_events():
        writer.write(event)
    for event in normalizer.startup_observability_events():
        writer.write(event)

    stop_stale_monitor = threading.Event()
    stale_monitor = threading.Thread(
        target=_run_stale_monitor,
        args=(normalizer, writer, stop_stale_monitor),
        daemon=True,
    )

    async def trade_callback(trade: Any, _receipt_timestamp: float) -> None:
        receipt_timestamp_ms = _timestamp_ms(_receipt_timestamp) or now_ms()
        for event in normalizer.normalize_trade(trade, receipt_timestamp_ms=receipt_timestamp_ms):
            writer.write(event)

    async def book_callback(book: Any, _receipt_timestamp: float) -> None:
        receipt_timestamp_ms = _timestamp_ms(_receipt_timestamp) or now_ms()
        for event in normalizer.normalize_l2_book(book, receipt_timestamp_ms=receipt_timestamp_ms):
            writer.write(event)

    callbacks = {}
    if "trade" in config.channels:
        callbacks[TRADES] = TradeCallback(trade_callback)
    if "l2-book" in config.channels:
        callbacks[L2_BOOK] = BookCallback(book_callback)

    feed_handler = FeedHandler()
    feed_handler.add_feed(
        Binance(
            symbols=[config.symbol],
            channels=list(callbacks),
            callbacks=callbacks,
            max_depth=100,
            book_interval=0,
        )
    )
    stale_monitor.start()
    terminal_error: Exception | None = None
    try:
        feed_handler.run()
    except Exception as exc:
        terminal_error = exc
    finally:
        stop_stale_monitor.set()
        stale_monitor.join(timeout=5)
    if terminal_error is not None:
        writer.write(
            build_collector_error_event(
                venue=config.venue,
                symbol=config.symbol,
                channel=None,
                detected_at_ms=now_ms(),
                connection_id=normalizer.connection_id,
                source="collector",
                error_code=terminal_error.__class__.__name__,
                message=str(terminal_error) or terminal_error.__class__.__name__,
            )
        )
        raise terminal_error


def _run_stale_monitor(
    normalizer: BinanceSpotNormalizer,
    writer: Any,
    stop_event: threading.Event,
) -> None:
    interval_seconds = max(normalizer.config.health.stale_after_ms / 2000, 1)
    while not stop_event.wait(interval_seconds):
        for event in normalizer.stale_events(now_timestamp_ms=now_ms()):
            writer.write(event)
