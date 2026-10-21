from __future__ import annotations

import shutil
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from cryptofeed_collector.events import build_market_event, serialize_record
from cryptofeed_collector.replay import replay_events, replay_hash
from cryptofeed_collector.storage import RotatingNDJSONWriter

REPO_ROOT = Path(__file__).resolve().parents[3]


def _event(sequence: int, receipt: int = 1000):
    return build_market_event(
        venue="BINANCE",
        symbol="BTC-USDT",
        instrument_type="spot",
        channel="trade",
        exchange_timestamp_ms=receipt - 10,
        receipt_timestamp_ms=receipt,
        sequence=sequence,
        payload={
            "schemaVersion": "binance-spot-trade-payload-v1",
            "tradeId": sequence,
            "price": str(64000 + sequence),
            "quantity": "0.1",
            "tradeTimestampMs": receipt - 10,
            "takerSide": "buy",
        },
        collector_version="test",
        connection_id="conn-1",
    )


def test_duplicate_suppression_restart_seed_and_append_only_files(tmp_path: Path) -> None:
    writer = RotatingNDJSONWriter(tmp_path, prefix="events", max_bytes=10_000)
    first = _event(1)

    assert writer.write(first) is True
    assert writer.write(first) is False
    assert writer.write(_event(2, receipt=2000)) is True
    writer.close()

    original_file = tmp_path / "events-000000.ndjson"
    original_contents = original_file.read_text(encoding="utf-8")
    replayed = list(replay_events(tmp_path))
    assert [record["schemaVersion"] for record in replayed] == [
        "market-event-v1",
        "market-health-event-v1",
        "market-event-v1",
    ]
    assert replayed[1]["type"] == "duplicate"

    second_writer = RotatingNDJSONWriter(tmp_path, prefix="events", max_bytes=10_000)
    assert second_writer.write(first) is False
    assert second_writer.write(_event(3, receipt=3000)) is True
    second_writer.close()

    assert original_file.read_text(encoding="utf-8") == original_contents
    assert [path.name for path in sorted(tmp_path.glob("*.ndjson"))] == [
        "events-000000.ndjson",
        "events-000001.ndjson",
    ]


def test_rotation_uses_new_file_names(tmp_path: Path) -> None:
    writer = RotatingNDJSONWriter(tmp_path, prefix="events", max_bytes=240)
    assert writer.write(_event(1, receipt=1000)) is True
    assert writer.write(_event(2, receipt=2000)) is True
    writer.close()

    assert [path.name for path in sorted(tmp_path.glob("*.ndjson"))] == [
        "events-000000.ndjson",
        "events-000001.ndjson",
    ]


def test_replay_preserves_file_and_line_order_with_deterministic_hash(tmp_path: Path) -> None:
    with RotatingNDJSONWriter(tmp_path, prefix="events", max_bytes=10_000) as writer:
        writer.write(_event(1, receipt=1000))
        writer.write(_event(2, receipt=2000))

    replayed = list(replay_events(tmp_path))

    assert [event["sequence"] for event in replayed] == [1, 2]
    assert replay_hash(tmp_path) == replay_hash(tmp_path)


def test_replay_prefix_filter_and_effective_time_cutoff(tmp_path: Path) -> None:
    (tmp_path / "events-a.ndjson").write_text(
        serialize_record(_event(1, receipt=1000)) + "\n"
        + serialize_record(_event(2, receipt=3000)) + "\n",
        encoding="utf-8",
    )
    (tmp_path / "eventsbad-a.ndjson").write_text(
        serialize_record(_event(4, receipt=1000)) + "\n",
        encoding="utf-8",
    )
    (tmp_path / "other-a.ndjson").write_text(
        serialize_record(_event(3, receipt=1500)) + "\n",
        encoding="utf-8",
    )

    replayed = list(replay_events(tmp_path, prefix="events", effective_at_ms=2000))

    assert [event["sequence"] for event in replayed] == [1]


def test_replay_effective_cutoff_uses_receipt_not_exchange_time(tmp_path: Path) -> None:
    delayed = build_market_event(
        venue="BINANCE",
        symbol="BTC-USDT",
        instrument_type="spot",
        channel="trade",
        exchange_timestamp_ms=1000,
        receipt_timestamp_ms=5000,
        sequence=9,
        payload={
            "schemaVersion": "binance-spot-trade-payload-v1",
            "tradeId": 9,
            "price": "64009",
            "quantity": "0.1",
            "tradeTimestampMs": 1000,
            "takerSide": "buy",
        },
        collector_version="test",
        connection_id="conn-1",
    )
    (tmp_path / "events-a.ndjson").write_text(serialize_record(delayed) + "\n", encoding="utf-8")

    assert list(replay_events(tmp_path, prefix="events", effective_at_ms=4000)) == []
    assert [event["sequence"] for event in replay_events(tmp_path, prefix="events", effective_at_ms=5000)] == [9]


def test_replay_ignores_corrupt_tail_but_rejects_corrupt_middle(tmp_path: Path) -> None:
    valid_line = serialize_record(_event(1, receipt=1000)) + "\n"
    tail_path = tmp_path / "events-tail.ndjson"
    tail_path.write_text(valid_line + '{"schemaVersion":', encoding="utf-8")

    assert [event["sequence"] for event in replay_events(tail_path)] == [1]

    middle_path = tmp_path / "events-middle.ndjson"
    middle_path.write_text(valid_line + '{"schemaVersion":}\n' + valid_line, encoding="utf-8")
    try:
        list(replay_events(middle_path))
    except ValueError as exc:
        assert "invalid event" in str(exc)
    else:
        raise AssertionError("expected corrupt middle line to fail")


def test_writer_restart_rebuild_tolerates_only_unterminated_corrupt_tail(tmp_path: Path) -> None:
    first = _event(1, receipt=1000)
    (tmp_path / "events-000000.ndjson").write_text(
        serialize_record(first) + "\n" + '{"schemaVersion":',
        encoding="utf-8",
    )

    writer = RotatingNDJSONWriter(tmp_path, prefix="events", max_bytes=10_000)
    assert writer.write(first) is False
    writer.close()

    bad_dir = tmp_path / "bad"
    bad_dir.mkdir()
    (bad_dir / "events-000000.ndjson").write_text(
        serialize_record(first) + "\n" + '{"schemaVersion":}\n',
        encoding="utf-8",
    )
    try:
        RotatingNDJSONWriter(bad_dir, prefix="events", max_bytes=10_000)
    except Exception as exc:
        assert "Expecting value" in str(exc) or "invalid" in str(exc)
    else:
        raise AssertionError("expected corrupt middle/tail-with-newline rebuild to fail")


def test_golden_replay_hash_fixture(tmp_path: Path) -> None:
    fixture = REPO_ROOT / "tests/fixtures/market-events/replay-golden-v1.ndjson"
    target = tmp_path / "golden.ndjson"
    shutil.copyfile(fixture, target)

    assert replay_hash(target) == "b59d399c02a8999f0764cb11e0fb319f2c9233841a218bfd2c11e530e2e22190"


def test_thread_safe_rotation_stress(tmp_path: Path) -> None:
    writer = RotatingNDJSONWriter(tmp_path, prefix="events", max_bytes=420)

    def write_one(sequence: int) -> None:
        writer.write(_event(sequence, receipt=10_000 + sequence))

    with ThreadPoolExecutor(max_workers=8) as executor:
        list(executor.map(write_one, range(40)))
    writer.close()

    replayed = list(replay_events(tmp_path, prefix="events"))
    market_events = [record for record in replayed if record["schemaVersion"] == "market-event-v1"]
    assert len(market_events) == 40
    assert sorted(record["sequence"] for record in market_events) == list(range(40))
    assert len(list(tmp_path.glob("events-*.ndjson"))) > 1


def test_writer_close_is_final_and_never_reopens_archive(tmp_path: Path) -> None:
    writer = RotatingNDJSONWriter(tmp_path, prefix="events", max_bytes=10_000)
    assert writer.write(_event(1, receipt=1000)) is True
    writer.close()

    paths_before = sorted(path.name for path in tmp_path.glob("events-*.ndjson"))
    contents_before = {
        path.name: path.read_text(encoding="utf-8")
        for path in tmp_path.glob("events-*.ndjson")
    }

    try:
        writer.write(_event(2, receipt=2000))
    except RuntimeError as exc:
        assert "closed" in str(exc)
    else:
        raise AssertionError("expected write after close to fail")

    writer.close()
    assert sorted(path.name for path in tmp_path.glob("events-*.ndjson")) == paths_before
    assert {
        path.name: path.read_text(encoding="utf-8")
        for path in tmp_path.glob("events-*.ndjson")
    } == contents_before
