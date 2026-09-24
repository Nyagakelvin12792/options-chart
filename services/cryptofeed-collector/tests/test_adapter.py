from __future__ import annotations

from dataclasses import dataclass
import sys
from types import ModuleType
from types import SimpleNamespace

from cryptofeed_collector.adapter import BinanceSpotNormalizer, run_live
from cryptofeed_collector.config import parse_config


@dataclass
class TradeFixture:
    price: str = "64000.1"
    amount: str = "0.10"
    side: str = "buy"
    timestamp: float = 1700000000.001
    id: str = "1001"
    is_buyer_maker: bool = False


@dataclass
class BookFixture:
    sequence_number: int
    timestamp: float = 1700000000.002
    delta: bool = True

    @property
    def book(self) -> dict:
        return {
            "bid": {"63999.9": "1.2", "63999.8": "0.8"},
            "ask": {"64000.2": "1.0"},
        }


@dataclass
class RealShapedBookFixture:
    sequence_number: int
    timestamp: float = 1700000000.002
    delta: object | None = None

    @property
    def book(self) -> object:
        return SimpleNamespace(
            bids={"63999.9": "1.2", "63999.8": "0.8"},
            asks={"64000.2": "1.0"},
        )


def _config() -> object:
    return parse_config(
        {
            "venue": "BINANCE",
            "symbol": "BTC-USDT",
            "instrumentType": "spot",
            "channels": ["trade", "l2-book", "funding"],
            "collectorVersion": "test",
            "storage": {"directory": "events", "maxBytes": 1024},
            "health": {"staleAfterMs": 1000},
            "liveCollection": {"enabled": False},
        }
    )


def test_normalizes_trade_fixture_without_credentials() -> None:
    normalizer = BinanceSpotNormalizer(_config(), connection_id="conn-1")
    [event] = normalizer.normalize_trade(TradeFixture(), receipt_timestamp_ms=1700000000111)

    assert event.channel == "trade"
    assert event.exchangeTimestampMs == 1700000000001
    assert event.payload == {
        "schemaVersion": "binance-spot-trade-payload-v1",
        "tradeId": "1001",
        "price": "64000.1",
        "quantity": "0.10",
        "tradeTimestampMs": 1700000000001,
        "takerSide": "buy",
        "isBuyerMaker": False,
    }


def test_l2_sequence_jump_does_not_fabricate_gap_health_event() -> None:
    normalizer = BinanceSpotNormalizer(_config(), connection_id="conn-1")
    normalizer.normalize_l2_book(BookFixture(sequence_number=10), receipt_timestamp_ms=1000)
    events = normalizer.normalize_l2_book(BookFixture(sequence_number=12), receipt_timestamp_ms=2000)

    assert [event.schemaVersion for event in events] == ["market-event-v1"]
    assert events[0].channel == "l2-book"
    assert events[0].payload["schemaVersion"] == "binance-spot-l2-book-payload-v1"
    assert events[0].payload["updateType"] == "delta"
    assert events[0].payload["sequence"] == 12
    assert events[0].payload["previousSequence"] == 10


def test_l2_sequence_regression_does_not_fabricate_gap_health_event() -> None:
    normalizer = BinanceSpotNormalizer(_config(), connection_id="conn-1")
    normalizer.normalize_l2_book(BookFixture(sequence_number=12), receipt_timestamp_ms=1000)
    events = normalizer.normalize_l2_book(BookFixture(sequence_number=10), receipt_timestamp_ms=2000)

    assert [event.schemaVersion for event in events] == ["market-event-v1"]
    assert events[0].channel == "l2-book"


def test_l2_uses_real_shaped_orderbook_and_preserves_zero_quantity_delta() -> None:
    normalizer = BinanceSpotNormalizer(_config(), connection_id="conn-1")
    book = RealShapedBookFixture(
        sequence_number=20,
        delta=SimpleNamespace(
            bids={"63999.9": "0"},
            asks={"64000.2": "0.5"},
        ),
    )

    [event] = normalizer.normalize_l2_book(book, receipt_timestamp_ms=2000)

    assert event.payload["updateType"] == "delta"
    assert event.payload["bids"] == [["63999.9", "0"]]
    assert event.payload["asks"] == [["64000.2", "0.5"]]


def test_stale_unsupported_and_startup_observability_health_events() -> None:
    normalizer = BinanceSpotNormalizer(_config(), connection_id="conn-1")
    normalizer.normalize_trade(TradeFixture(), receipt_timestamp_ms=1000)

    stale_events = normalizer.stale_events(now_timestamp_ms=2501)
    unsupported = normalizer.unsupported_channel_events(receipt_timestamp_ms=4000)
    observability = normalizer.startup_observability_events(receipt_timestamp_ms=5000)

    assert stale_events[0].type == "stale"
    assert unsupported[0].type == "unsupported-channel"
    assert unsupported[0].details["unsupportedChannel"] == "funding"
    assert [event.type for event in observability] == ["observability", "observability"]
    assert [event.details["delegatedSignals"] for event in observability] == [
        ["sequence-gap"],
        ["reconnect-lifecycle"],
    ]
    assert all(event.details["fabricatedEvents"] is False for event in observability)


def test_never_received_supported_channels_become_stale() -> None:
    normalizer = BinanceSpotNormalizer(_config(), connection_id="conn-1")

    stale_events = normalizer.stale_events(
        now_timestamp_ms=normalizer._started_at_ms + normalizer.config.health.stale_after_ms + 1
    )

    assert sorted(event.channel for event in stale_events) == ["l2-book", "trade"]
    assert all(event.details["lastEventTimestampMs"] is None for event in stale_events)


def test_live_run_exception_does_not_fabricate_reconnect_and_joins_stale_monitor(monkeypatch) -> None:
    records = []

    class Writer:
        def __init__(self) -> None:
            self.closed = False

        def write(self, record) -> bool:
            if self.closed:
                raise AssertionError("write after close")
            records.append(record)
            return True

    class FakeFeedHandler:
        def add_feed(self, _feed) -> None:
            pass

        def run(self) -> None:
            raise RuntimeError("terminal run failure")

    class FakeCallback:
        def __init__(self, callback) -> None:
            self.callback = callback

    class FakeBinance:
        def __init__(self, **_kwargs) -> None:
            pass

    cryptofeed_module = ModuleType("cryptofeed")
    cryptofeed_module.FeedHandler = FakeFeedHandler
    callback_module = ModuleType("cryptofeed.callback")
    callback_module.BookCallback = FakeCallback
    callback_module.TradeCallback = FakeCallback
    defines_module = ModuleType("cryptofeed.defines")
    defines_module.L2_BOOK = "l2_book"
    defines_module.TRADES = "trades"
    exchanges_module = ModuleType("cryptofeed.exchanges")
    exchanges_module.Binance = FakeBinance

    monkeypatch.setitem(sys.modules, "cryptofeed", cryptofeed_module)
    monkeypatch.setitem(sys.modules, "cryptofeed.callback", callback_module)
    monkeypatch.setitem(sys.modules, "cryptofeed.defines", defines_module)
    monkeypatch.setitem(sys.modules, "cryptofeed.exchanges", exchanges_module)

    config = parse_config(
        {
            "venue": "BINANCE",
            "symbol": "BTC-USDT",
            "instrumentType": "spot",
            "channels": ["trade"],
            "collectorVersion": "test",
            "storage": {"directory": "events", "maxBytes": 1024},
            "health": {"staleAfterMs": 60_000},
            "liveCollection": {"enabled": True},
        }
    )
    writer = Writer()

    try:
        run_live(config, writer)
    except RuntimeError as exc:
        assert "terminal run failure" in str(exc)
    else:
        raise AssertionError("expected terminal run failure to propagate")

    writer.closed = True
    assert [record.type for record in records] == [
        "observability",
        "observability",
        "collector-error",
    ]
    assert records[-1].details["errorCode"] == "RuntimeError"
    assert records[-1].details["terminal"] is True
    assert all(record.type != "reconnect" for record in records)
