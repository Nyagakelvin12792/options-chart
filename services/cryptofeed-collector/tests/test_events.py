from __future__ import annotations

import json
from pathlib import Path

from cryptofeed_collector.events import (
    build_health_record,
    build_market_event,
    deterministic_event_id,
    deterministic_health_id,
    record_from_dict,
    serialize_event,
)


SHARED_IDENTITY_FIXTURE = json.loads(
    (
        Path(__file__).parents[3]
        / "tests"
        / "fixtures"
        / "market-events"
        / "identity-v1.json"
    ).read_text(encoding="utf-8")
)
SHARED_HEALTH_FIXTURE = json.loads(
    (
        Path(__file__).parents[3]
        / "tests"
        / "fixtures"
        / "market-events"
        / "health-duplicate-v1.json"
    ).read_text(encoding="utf-8")
)


def test_shared_cross_language_identity_fixture() -> None:
    identity = SHARED_IDENTITY_FIXTURE["identity"]
    event = build_market_event(
        venue=identity["venue"],
        symbol=identity["symbol"],
        instrument_type=identity["instrumentType"],
        channel=identity["channel"],
        exchange_timestamp_ms=identity["exchangeTimestampMs"],
        receipt_timestamp_ms=1_700_000_000_111,
        sequence=identity["sequence"],
        payload=identity["payload"],
        collector_version="parity-test",
        connection_id="parity-connection",
    )

    assert event.eventId == SHARED_IDENTITY_FIXTURE["expectedEventId"]


def test_shared_cross_language_health_fixture() -> None:
    record = record_from_dict(SHARED_HEALTH_FIXTURE)

    assert record.type == "duplicate"
    assert record.healthEventId == SHARED_HEALTH_FIXTURE["healthEventId"]


def test_json_schemas_include_typescript_health_detail_shapes() -> None:
    schema_root = Path(__file__).parents[1] / "schemas"
    event_schema = json.loads((schema_root / "market-event-v1.schema.json").read_text(encoding="utf-8"))
    health_schema = json.loads((schema_root / "market-health-event-v1.schema.json").read_text(encoding="utf-8"))

    assert event_schema["$id"] == "https://options-chart.local/schemas/market-event-v1.json"
    assert event_schema["properties"]["venue"]["pattern"] == "^[a-z][a-z0-9-]*$"
    assert health_schema["properties"]["venue"]["minLength"] == 1
    assert "allOf" in health_schema
    assert "collector-error" in health_schema["properties"]["type"]["enum"]
    assert "observability" in health_schema["properties"]["type"]["enum"]
    assert health_schema["$defs"]["collectorErrorDetails"]["required"] == [
        "source",
        "errorCode",
        "message",
        "terminal",
        "retryable",
    ]
    assert health_schema["$defs"]["observabilityDetails"]["required"] == [
        "status",
        "owner",
        "delegatedSignals",
        "fabricatedEvents",
    ]
    assert health_schema["$defs"]["duplicateDetails"]["required"] == [
        "duplicateEventId",
        "firstSeenAtMs",
    ]
    assert health_schema["$defs"]["staleDetails"]["required"] == [
        "lastEventTimestampMs",
        "staleThresholdMs",
        "elapsedMs",
    ]


def test_market_event_serialization_is_canonical_and_deterministic() -> None:
    payload = {
        "schemaVersion": "binance-spot-trade-payload-v1",
        "tradeId": 123456789,
        "price": "64000.10",
        "quantity": "0.25000000",
        "tradeTimestampMs": 1_700_000_000_001,
        "takerSide": "buy",
        "isBuyerMaker": False,
    }
    kwargs = {
        "venue": "binance",
        "symbol": "BTC-USDT",
        "instrument_type": "spot",
        "channel": "trade",
        "exchange_timestamp_ms": 1_700_000_000_001,
        "receipt_timestamp_ms": 1_700_000_000_111,
        "sequence": 123456789,
        "payload": payload,
        "collector_version": "test",
        "connection_id": "conn-1",
    }
    first = build_market_event(**kwargs)
    second = build_market_event(
        **{
            **kwargs,
            "receipt_timestamp_ms": 1_700_000_999_999,
            "collector_version": "other-version",
            "connection_id": "other-connection",
        }
    )

    assert first.eventId == "market-event-v1:772a5596dc127ecb"
    assert first.eventId == second.eventId
    serialized = serialize_event(first)
    decoded = json.loads(serialized)
    assert decoded["schemaVersion"] == "market-event-v1"
    assert decoded["venue"] == "binance"
    assert decoded["provenance"]["collector"] == "cryptofeed"


def test_payload_validation_rejects_incomplete_trade() -> None:
    try:
        build_market_event(
            venue="BINANCE",
            symbol="BTC-USDT",
            instrument_type="spot",
            channel="trade",
            exchange_timestamp_ms=None,
            receipt_timestamp_ms=1,
            sequence=None,
            payload={
                "schemaVersion": "binance-spot-trade-payload-v1",
                "tradeId": None,
                "price": "1",
                "tradeTimestampMs": None,
                "takerSide": None,
            },
            collector_version="test",
            connection_id="conn-1",
        )
    except ValueError as exc:
        assert "trade payload missing" in str(exc)
    else:
        raise AssertionError("expected incomplete trade to be rejected")


def test_payload_validation_accepts_typescript_decimal_grammar() -> None:
    event = build_market_event(
        venue="BINANCE",
        symbol="BTC-USDT",
        instrument_type="spot",
        channel="trade",
        exchange_timestamp_ms=None,
        receipt_timestamp_ms=1,
        sequence=None,
        payload={
            "schemaVersion": "binance-spot-trade-payload-v1",
            "tradeId": None,
            "price": "1E-8",
            "quantity": ".25",
            "tradeTimestampMs": None,
            "takerSide": None,
        },
        collector_version="test",
        connection_id="conn-1",
    )

    assert event.payload["price"] == "1E-8"


def test_payload_validation_rejects_infinite_javascript_number_decimal() -> None:
    try:
        build_market_event(
            venue="BINANCE",
            symbol="BTC-USDT",
            instrument_type="spot",
            channel="trade",
            exchange_timestamp_ms=None,
            receipt_timestamp_ms=1,
            sequence=None,
            payload={
                "schemaVersion": "binance-spot-trade-payload-v1",
                "tradeId": None,
                "price": "1e999999",
                "quantity": "0.1",
                "tradeTimestampMs": None,
                "takerSide": None,
            },
            collector_version="test",
            connection_id="conn-1",
        )
    except ValueError as exc:
        assert "finite decimal string" in str(exc)
    else:
        raise AssertionError("expected JavaScript-infinite decimal string to be rejected")


def test_strict_market_event_deserialization_rejects_contract_drift() -> None:
    base = json.loads(serialize_event(build_market_event(
        venue="binance",
        symbol="BTC-USDT",
        instrument_type="spot",
        channel="trade",
        exchange_timestamp_ms=1000,
        receipt_timestamp_ms=1100,
        sequence=1,
        payload={
            "schemaVersion": "binance-spot-trade-payload-v1",
            "tradeId": 1,
            "price": "1",
            "quantity": "0.1",
            "tradeTimestampMs": 1000,
            "takerSide": "buy",
        },
        collector_version="test",
        connection_id="conn-1",
    )))

    cases = []
    unexpected_top = {**base, "extra": True}
    cases.append((unexpected_top, "unexpected keys"))

    uppercase_venue = {**base, "venue": "BINANCE"}
    cases.append((uppercase_venue, "lowercase"))

    bad_event_id = {**base, "eventId": "market-event-v1:XYZ"}
    cases.append((bad_event_id, "eventId must match"))

    bad_recorded = {
        **base,
        "provenance": {**base["provenance"], "recordedAtMs": base["receiptTimestampMs"] + 1},
    }
    cases.append((bad_recorded, "recordedAtMs"))

    unexpected_payload = {
        **base,
        "payload": {**base["payload"], "extra": True},
    }
    cases.append((unexpected_payload, "unexpected keys"))

    mismatched_trade_time = {
        **base,
        "payload": {**base["payload"], "tradeTimestampMs": base["exchangeTimestampMs"] + 1},
    }
    cases.append((mismatched_trade_time, "tradeTimestampMs"))

    for candidate, message in cases:
        try:
            record_from_dict(candidate)
        except ValueError as exc:
            assert message in str(exc)
        else:
            raise AssertionError(f"expected strict deserialization failure containing {message}")


def test_malformed_market_records_reject_typescript_runtime_probes() -> None:
    base = json.loads(serialize_event(build_market_event(
        venue="binance",
        symbol="BTC-USDT",
        instrument_type="spot",
        channel="trade",
        exchange_timestamp_ms=1000,
        receipt_timestamp_ms=1100,
        sequence=1,
        payload={
            "schemaVersion": "binance-spot-trade-payload-v1",
            "tradeId": 1,
            "price": "1",
            "quantity": "0.1",
            "tradeTimestampMs": 1000,
            "takerSide": "buy",
        },
        collector_version="test",
        connection_id="conn-1",
    )))

    def with_event_id(candidate: dict) -> dict:
        return {
            **candidate,
            "eventId": deterministic_event_id(
                venue=candidate["venue"],
                symbol=candidate["symbol"],
                instrument_type=candidate["instrumentType"],
                channel=candidate["channel"],
                exchange_timestamp_ms=candidate["exchangeTimestampMs"],
                sequence=candidate["sequence"],
                payload=candidate["payload"],
            ),
        }

    probes = [
        (with_event_id({**base, "symbol": ""}), "symbol"),
        (with_event_id({**base, "instrumentType": "swap"}), "instrumentType"),
        (
            {
                **base,
                "provenance": {**base["provenance"], "collectorVersion": ""},
            },
            "collectorVersion",
        ),
        (
            {
                **base,
                "provenance": {**base["provenance"], "connectionId": ""},
            },
            "connectionId",
        ),
        (
            {
                **base,
                "receiptTimestampMs": True,
                "provenance": {**base["provenance"], "recordedAtMs": True},
            },
            "receiptTimestampMs",
        ),
        (
            with_event_id({
                **base,
                "exchangeTimestampMs": True,
                "payload": {**base["payload"], "tradeTimestampMs": True},
            }),
            "exchangeTimestampMs",
        ),
        (
            with_event_id({
                **base,
                "sequence": True,
                "payload": {**base["payload"], "tradeId": True},
            }),
            "sequence",
        ),
        (
            with_event_id({
                **base,
                "sequence": "",
                "payload": {**base["payload"], "tradeId": ""},
            }),
            "sequence",
        ),
    ]

    for candidate, message in probes:
        try:
            record_from_dict(candidate)
        except ValueError as exc:
            assert message in str(exc)
        else:
            raise AssertionError(f"expected malformed market record failure containing {message}")


def test_strict_health_deserialization_rejects_contract_drift() -> None:
    base = dict(SHARED_HEALTH_FIXTURE)

    cases = []
    cases.append(({**base, "extra": True}, "unexpected keys"))
    cases.append(({**base, "venue": "BINANCE"}, "lowercase"))
    cases.append(({**base, "healthEventId": "market-health-event-v1:XYZ"}, "healthEventId must match"))
    cases.append(({**base, "relatedEventId": "bad-id"}, "relatedEventId"))
    cases.append((
        {
            **base,
            "details": {**base["details"], "extra": True},
        },
        "unexpected keys",
    ))
    cases.append((
        {
            **base,
            "details": {**base["details"], "duplicateEventId": "market-event-v1:XYZ"},
        },
        "duplicateEventId",
    ))

    for candidate, message in cases:
        try:
            record_from_dict(candidate)
        except ValueError as exc:
            assert message in str(exc)
        else:
            raise AssertionError(f"expected strict health failure containing {message}")


def test_malformed_health_records_reject_typescript_runtime_probes() -> None:
    base = json.loads(json.dumps(build_health_record(
        type="stale",
        venue="binance",
        symbol="BTC-USDT",
        channel="trade",
        detected_at_ms=1200,
        collector_version="test",
        connection_id="conn-1",
        severity="warning",
        details={
            "lastEventTimestampMs": 1000,
            "staleThresholdMs": 100,
            "elapsedMs": 200,
        },
    ), default=lambda value: value.__dict__))
    base = {
        "schemaVersion": base["schemaVersion"],
        "healthEventId": base["healthEventId"],
        "venue": base["venue"],
        "symbol": base["symbol"],
        "channel": base["channel"],
        "detectedAtMs": base["detectedAtMs"],
        "connectionId": base["connectionId"],
        "severity": base["severity"],
        "type": base["type"],
        "details": base["details"],
    }

    def with_health_id(candidate: dict) -> dict:
        return {
            **candidate,
            "healthEventId": deterministic_health_id(
                type=candidate["type"],
                venue=candidate["venue"],
                symbol=candidate["symbol"],
                channel=candidate["channel"],
                detected_at_ms=candidate["detectedAtMs"],
                connection_id=candidate["connectionId"],
                details=candidate["details"],
            ),
        }

    probes = [
        (with_health_id({**base, "symbol": ""}), "symbol"),
        (with_health_id({**base, "channel": ""}), "channel"),
        (with_health_id({**base, "connectionId": ""}), "connectionId"),
        (with_health_id({**base, "detectedAtMs": True}), "detectedAtMs"),
        (
            with_health_id({
                **base,
                "details": {**base["details"], "lastEventTimestampMs": True},
            }),
            "lastEventTimestampMs",
        ),
        (
            with_health_id({
                **base,
                "details": {**base["details"], "staleThresholdMs": True},
            }),
            "staleThresholdMs",
        ),
    ]

    for candidate, message in probes:
        try:
            record_from_dict(candidate)
        except ValueError as exc:
            assert message in str(exc)
        else:
            raise AssertionError(f"expected malformed health record failure containing {message}")
