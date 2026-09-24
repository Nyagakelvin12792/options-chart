from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any, Literal, TypeAlias

InstrumentType = Literal["spot", "perpetual", "future", "option"]
MarketChannel = Literal[
    "trade",
    "l1-book",
    "l2-book",
    "open-interest",
    "funding",
    "liquidation",
    "index",
]
HealthType = Literal[
    "gap",
    "stale",
    "reconnect",
    "duplicate",
    "unsupported-channel",
    "collector-error",
    "observability",
]
HealthSeverity = Literal["info", "warning", "error"]

FNV_64_OFFSET = 0xCBF29CE484222325
FNV_64_PRIME = 0x100000001B3
DECIMAL_STRING_RE = re.compile(r"^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$")
LOWERCASE_VENUE_RE = re.compile(r"^[a-z][a-z0-9-]*$")
MARKET_EVENT_ID_RE = re.compile(r"^market-event-v1:[0-9a-f]{16}$")
MARKET_HEALTH_EVENT_ID_RE = re.compile(r"^market-health-event-v1:[0-9a-f]{16}$")
EVENT_KEYS = {
    "schemaVersion",
    "eventId",
    "venue",
    "symbol",
    "instrumentType",
    "channel",
    "exchangeTimestampMs",
    "receiptTimestampMs",
    "sequence",
    "payload",
    "provenance",
}
PROVENANCE_KEYS = {"collector", "collectorVersion", "connectionId", "recordedAtMs"}
HEALTH_REQUIRED_KEYS = {
    "schemaVersion",
    "healthEventId",
    "venue",
    "symbol",
    "channel",
    "detectedAtMs",
    "connectionId",
    "severity",
    "type",
    "details",
}
HEALTH_OPTIONAL_KEYS = {"relatedEventId"}
TRADE_PAYLOAD_REQUIRED_KEYS = {
    "schemaVersion",
    "tradeId",
    "price",
    "quantity",
    "tradeTimestampMs",
    "takerSide",
}
TRADE_PAYLOAD_OPTIONAL_KEYS = {"isBuyerMaker"}
L2_PAYLOAD_REQUIRED_KEYS = {"schemaVersion", "updateType", "sequence", "bids", "asks"}
L2_PAYLOAD_OPTIONAL_KEYS = {"previousSequence"}
INSTRUMENT_TYPES = {"spot", "perpetual", "future", "option"}
MARKET_CHANNELS = {
    "trade",
    "l1-book",
    "l2-book",
    "open-interest",
    "funding",
    "liquidation",
    "index",
}


@dataclass(frozen=True)
class Provenance:
    collector: Literal["cryptofeed"]
    collectorVersion: str
    connectionId: str
    recordedAtMs: int


@dataclass(frozen=True)
class MarketEventV1:
    schemaVersion: Literal["market-event-v1"]
    eventId: str
    venue: str
    symbol: str
    instrumentType: InstrumentType
    channel: MarketChannel
    exchangeTimestampMs: int | None
    receiptTimestampMs: int
    sequence: int | str | None
    payload: Any
    provenance: Provenance


@dataclass(frozen=True)
class MarketHealthEventV1:
    schemaVersion: Literal["market-health-event-v1"]
    healthEventId: str
    type: HealthType
    venue: str
    symbol: str
    channel: str | None
    detectedAtMs: int
    connectionId: str
    severity: HealthSeverity
    relatedEventId: str | None
    details: dict[str, Any]


CollectorRecord: TypeAlias = MarketEventV1 | MarketHealthEventV1


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def fnv1a_64_hex(value: str) -> str:
    hash_value = FNV_64_OFFSET
    for byte in value.encode("utf-8"):
        hash_value ^= byte
        hash_value = (hash_value * FNV_64_PRIME) & 0xFFFFFFFFFFFFFFFF
    return f"{hash_value:016x}"


def deterministic_event_id(
    *,
    venue: str,
    symbol: str,
    instrument_type: InstrumentType,
    channel: str,
    exchange_timestamp_ms: int | None,
    sequence: int | str | None,
    payload: Any,
) -> str:
    identity = {
        "venue": venue,
        "symbol": symbol,
        "instrumentType": instrument_type,
        "channel": channel,
        "exchangeTimestampMs": exchange_timestamp_ms,
        "sequence": sequence,
        "payload": payload,
    }
    return "market-event-v1:" + fnv1a_64_hex(canonical_json(identity))


def deterministic_health_id(
    *,
    type: HealthType,
    venue: str,
    symbol: str,
    channel: str | None,
    detected_at_ms: int,
    connection_id: str,
    details: dict[str, Any],
) -> str:
    identity = {
        "type": type,
        "venue": venue,
        "symbol": symbol,
        "channel": channel,
        "detectedAtMs": detected_at_ms,
        "connectionId": connection_id,
        "details": details,
    }
    return "market-health-event-v1:" + fnv1a_64_hex(canonical_json(identity))


def build_market_event(
    *,
    venue: str,
    symbol: str,
    instrument_type: InstrumentType,
    channel: MarketChannel,
    exchange_timestamp_ms: int | None,
    receipt_timestamp_ms: int,
    sequence: int | str | None,
    payload: Any,
    collector_version: str,
    connection_id: str,
) -> MarketEventV1:
    canonical_venue = venue.lower()
    validate_payload(channel, payload)
    event_id = deterministic_event_id(
        venue=canonical_venue,
        symbol=symbol,
        instrument_type=instrument_type,
        channel=channel,
        exchange_timestamp_ms=exchange_timestamp_ms,
        sequence=sequence,
        payload=payload,
    )
    return MarketEventV1(
        schemaVersion="market-event-v1",
        eventId=event_id,
        venue=canonical_venue,
        symbol=symbol,
        instrumentType=instrument_type,
        channel=channel,
        exchangeTimestampMs=exchange_timestamp_ms,
        receiptTimestampMs=receipt_timestamp_ms,
        sequence=sequence,
        payload=payload,
        provenance=Provenance(
            collector="cryptofeed",
            collectorVersion=collector_version,
            connectionId=connection_id,
            recordedAtMs=receipt_timestamp_ms,
        ),
    )


def build_health_record(
    *,
    type: HealthType,
    venue: str,
    symbol: str,
    channel: str | None,
    detected_at_ms: int,
    collector_version: str,
    connection_id: str,
    severity: HealthSeverity,
    related_event_id: str | None = None,
    details: dict[str, Any] | None = None,
) -> MarketHealthEventV1:
    canonical_venue = venue.lower()
    normalized_details = details or {}
    return MarketHealthEventV1(
        schemaVersion="market-health-event-v1",
        healthEventId=deterministic_health_id(
            type=type,
            venue=canonical_venue,
            symbol=symbol,
            channel=channel,
            detected_at_ms=detected_at_ms,
            connection_id=connection_id,
            details=normalized_details,
        ),
        type=type,
        venue=canonical_venue,
        symbol=symbol,
        channel=channel,
        detectedAtMs=detected_at_ms,
        connectionId=connection_id,
        severity=severity,
        relatedEventId=related_event_id,
        details=normalized_details,
    )


def serialize_record(record: CollectorRecord) -> str:
    if isinstance(record, MarketEventV1):
        validate_event(record)
        return canonical_json(to_dict(record))
    validate_health_record(record)
    return canonical_json(health_to_dict(record))


def serialize_event(event: MarketEventV1) -> str:
    return serialize_record(event)


def to_dict(event: MarketEventV1) -> dict[str, Any]:
    return {
        "schemaVersion": event.schemaVersion,
        "eventId": event.eventId,
        "venue": event.venue,
        "symbol": event.symbol,
        "instrumentType": event.instrumentType,
        "channel": event.channel,
        "exchangeTimestampMs": event.exchangeTimestampMs,
        "receiptTimestampMs": event.receiptTimestampMs,
        "sequence": event.sequence,
        "payload": event.payload,
        "provenance": {
            "collector": event.provenance.collector,
            "collectorVersion": event.provenance.collectorVersion,
            "connectionId": event.provenance.connectionId,
            "recordedAtMs": event.provenance.recordedAtMs,
        },
    }


def health_to_dict(record: MarketHealthEventV1) -> dict[str, Any]:
    return {
        "schemaVersion": record.schemaVersion,
        "healthEventId": record.healthEventId,
        "venue": record.venue,
        "symbol": record.symbol,
        "channel": record.channel,
        "detectedAtMs": record.detectedAtMs,
        "connectionId": record.connectionId,
        "severity": record.severity,
        "type": record.type,
        "details": record.details,
        **({"relatedEventId": record.relatedEventId} if record.relatedEventId is not None else {}),
    }


def record_from_dict(data: dict[str, Any]) -> CollectorRecord:
    schema_version = data.get("schemaVersion")
    if schema_version == "market-event-v1":
        return event_from_dict(data)
    if schema_version == "market-health-event-v1":
        return health_from_dict(data)
    raise ValueError(f"unsupported schemaVersion: {schema_version}")


def event_from_dict(data: dict[str, Any]) -> MarketEventV1:
    _reject_unexpected_keys(data, EVENT_KEYS, "market event")
    _reject_unexpected_keys(data["provenance"], PROVENANCE_KEYS, "market provenance")
    event = MarketEventV1(
        schemaVersion=data["schemaVersion"],
        eventId=data["eventId"],
        venue=data["venue"],
        symbol=data["symbol"],
        instrumentType=data["instrumentType"],
        channel=data["channel"],
        exchangeTimestampMs=data["exchangeTimestampMs"],
        receiptTimestampMs=data["receiptTimestampMs"],
        sequence=data["sequence"],
        payload=data["payload"],
        provenance=Provenance(**data["provenance"]),
    )
    validate_event(event)
    return event


def health_from_dict(data: dict[str, Any]) -> MarketHealthEventV1:
    _reject_unexpected_keys(data, HEALTH_REQUIRED_KEYS | HEALTH_OPTIONAL_KEYS, "health event")
    record = MarketHealthEventV1(
        schemaVersion=data["schemaVersion"],
        healthEventId=data["healthEventId"],
        type=data["type"],
        venue=data["venue"],
        symbol=data["symbol"],
        channel=data["channel"],
        detectedAtMs=data["detectedAtMs"],
        connectionId=data["connectionId"],
        severity=data["severity"],
        relatedEventId=data.get("relatedEventId"),
        details=data["details"],
    )
    validate_health_record(record)
    return record


def validate_event(event: MarketEventV1) -> None:
    if event.schemaVersion != "market-event-v1":
        raise ValueError("schemaVersion must be market-event-v1")
    if MARKET_EVENT_ID_RE.fullmatch(event.eventId) is None:
        raise ValueError("eventId must match market-event-v1 pattern")
    if LOWERCASE_VENUE_RE.fullmatch(event.venue) is None:
        raise ValueError("venue must be lowercase canonical id")
    _validate_nonempty_string(event.symbol, "symbol")
    if event.instrumentType not in INSTRUMENT_TYPES:
        raise ValueError("invalid instrumentType")
    if event.channel not in MARKET_CHANNELS:
        raise ValueError("invalid channel")
    if event.provenance.collector != "cryptofeed":
        raise ValueError("provenance.collector must be cryptofeed")
    _validate_nonempty_string(event.provenance.collectorVersion, "provenance.collectorVersion")
    _validate_nonempty_string(event.provenance.connectionId, "provenance.connectionId")
    if event.provenance.recordedAtMs != event.receiptTimestampMs:
        raise ValueError("provenance.recordedAtMs must equal receiptTimestampMs")
    _validate_timestamp_ms(event.receiptTimestampMs, "receiptTimestampMs", nullable=False)
    _validate_timestamp_ms(event.exchangeTimestampMs, "exchangeTimestampMs", nullable=True)
    _validate_timestamp_ms(event.provenance.recordedAtMs, "provenance.recordedAtMs", nullable=False)
    if not _valid_sequence(event.sequence):
        raise ValueError("sequence must be a nonnegative integer, decimal string, or null")
    validate_payload(event.channel, event.payload)
    if event.channel == "trade" and event.payload.get("tradeTimestampMs") != event.exchangeTimestampMs:
        raise ValueError("tradeTimestampMs must equal exchangeTimestampMs")
    if event.channel == "l2-book" and event.payload.get("sequence") != event.sequence:
        raise ValueError("l2 payload sequence must equal event sequence")
    expected_id = deterministic_event_id(
        venue=event.venue,
        symbol=event.symbol,
        instrument_type=event.instrumentType,
        channel=event.channel,
        exchange_timestamp_ms=event.exchangeTimestampMs,
        sequence=event.sequence,
        payload=event.payload,
    )
    if event.eventId != expected_id:
        raise ValueError("eventId does not match canonical identity")


def validate_health_record(record: MarketHealthEventV1) -> None:
    if record.schemaVersion != "market-health-event-v1":
        raise ValueError("schemaVersion must be market-health-event-v1")
    if MARKET_HEALTH_EVENT_ID_RE.fullmatch(record.healthEventId) is None:
        raise ValueError("healthEventId must match market-health-event-v1 pattern")
    if LOWERCASE_VENUE_RE.fullmatch(record.venue) is None:
        raise ValueError("venue must be lowercase canonical id")
    _validate_nonempty_string(record.symbol, "symbol")
    if record.channel is not None:
        _validate_nonempty_string(record.channel, "channel")
    if record.type not in {
        "gap",
        "stale",
        "reconnect",
        "duplicate",
        "unsupported-channel",
        "collector-error",
        "observability",
    }:
        raise ValueError("invalid health type")
    _validate_timestamp_ms(record.detectedAtMs, "detectedAtMs", nullable=False)
    if record.severity not in {"info", "warning", "error"}:
        raise ValueError("invalid health severity")
    _validate_nonempty_string(record.connectionId, "connectionId")
    _validate_health_details(record)
    expected_id = deterministic_health_id(
        type=record.type,
        venue=record.venue,
        symbol=record.symbol,
        channel=record.channel,
        detected_at_ms=record.detectedAtMs,
        connection_id=record.connectionId,
        details=record.details,
    )
    if record.healthEventId != expected_id:
        raise ValueError("healthEventId does not match canonical identity")


def _validate_health_details(record: MarketHealthEventV1) -> None:
    if not isinstance(record.details, dict):
        raise ValueError("health details must be an object")
    if record.relatedEventId is not None and MARKET_EVENT_ID_RE.fullmatch(record.relatedEventId) is None:
        raise ValueError("relatedEventId must match market event id pattern")
    if record.type == "gap":
        required = {"expectedSequence", "actualSequence", "missingCount"}
        _reject_unexpected_keys(
            record.details,
            required | {"previousSequence"},
            "gap details",
        )
        missing = required - record.details.keys()
        if missing:
            raise ValueError(f"gap details missing: {sorted(missing)}")
        for key in ("previousSequence", "expectedSequence", "actualSequence"):
            if key in record.details and not _valid_sequence(record.details[key]):
                raise ValueError(f"{key} must be number, string, or null")
        missing_count = record.details["missingCount"]
        if missing_count is not None and (
            not _is_int(missing_count) or missing_count <= 0
        ):
            raise ValueError("missingCount must be a positive integer or null")
        return
    if record.type == "stale":
        required = {"lastEventTimestampMs", "staleThresholdMs", "elapsedMs"}
        _reject_unexpected_keys(record.details, required, "stale details")
        missing = required - record.details.keys()
        if missing:
            raise ValueError(f"stale details missing: {sorted(missing)}")
        _validate_timestamp_ms(record.details["lastEventTimestampMs"], "lastEventTimestampMs", nullable=True)
        if not _is_int(record.details["staleThresholdMs"]) or record.details["staleThresholdMs"] <= 0:
            raise ValueError("staleThresholdMs must be positive integer")
        if not _is_int(record.details["elapsedMs"]) or record.details["elapsedMs"] < 0:
            raise ValueError("elapsedMs must be nonnegative integer")
        return
    if record.type == "reconnect":
        required = {"reason", "attempt", "backoffMs"}
        _reject_unexpected_keys(record.details, required, "reconnect details")
        missing = required - record.details.keys()
        if missing:
            raise ValueError(f"reconnect details missing: {sorted(missing)}")
        if record.details["reason"] is not None:
            _validate_nonempty_string(record.details["reason"], "reason")
        if not _is_int(record.details["attempt"]) or record.details["attempt"] < 0:
            raise ValueError("attempt must be nonnegative integer")
        if record.details["backoffMs"] is not None and (
            not _is_int(record.details["backoffMs"]) or record.details["backoffMs"] < 0
        ):
            raise ValueError("backoffMs must be nonnegative integer or null")
        return
    if record.type == "duplicate":
        required = {"duplicateEventId", "firstSeenAtMs"}
        _reject_unexpected_keys(record.details, required, "duplicate details")
        missing = required - record.details.keys()
        if missing:
            raise ValueError(f"duplicate details missing: {sorted(missing)}")
        if (
            not isinstance(record.details["duplicateEventId"], str)
            or MARKET_EVENT_ID_RE.fullmatch(record.details["duplicateEventId"]) is None
        ):
            raise ValueError("duplicateEventId must match market event id pattern")
        _validate_timestamp_ms(record.details["firstSeenAtMs"], "firstSeenAtMs", nullable=True)
        return
    if record.type == "unsupported-channel":
        required = {"unsupportedChannel"}
        _reject_unexpected_keys(record.details, required | {"rawChannel"}, "unsupported-channel details")
        missing = required - record.details.keys()
        if missing:
            raise ValueError(f"unsupported-channel details missing: {sorted(missing)}")
        if (
            not isinstance(record.details["unsupportedChannel"], str)
            or not record.details["unsupportedChannel"]
        ):
            raise ValueError("unsupportedChannel must be nonempty string")
        raw_channel = record.details.get("rawChannel")
        if raw_channel is not None:
            _validate_nonempty_string(raw_channel, "rawChannel")
        return
    if record.type == "collector-error":
        required = {"source", "errorCode", "message", "terminal", "retryable"}
        _reject_unexpected_keys(record.details, required, "collector-error details")
        missing = required - record.details.keys()
        if missing:
            raise ValueError(f"collector-error details missing: {sorted(missing)}")
        if record.details["source"] not in {"collector", "adapter", "storage", "replay", "configuration"}:
            raise ValueError("collector-error source is invalid")
        if not isinstance(record.details["errorCode"], str) or not record.details["errorCode"]:
            raise ValueError("collector-error errorCode must be nonempty string")
        if not isinstance(record.details["message"], str) or not record.details["message"]:
            raise ValueError("collector-error message must be nonempty string")
        if record.details["terminal"] is not True:
            raise ValueError("collector-error terminal must be true")
        if record.details["retryable"] is not False:
            raise ValueError("collector-error retryable must be false")
        return
    if record.type == "observability":
        required = {"status", "owner", "delegatedSignals", "fabricatedEvents"}
        _reject_unexpected_keys(record.details, required | {"note"}, "observability details")
        missing = required - record.details.keys()
        if missing:
            raise ValueError(f"observability details missing: {sorted(missing)}")
        if record.details["status"] != "delegated-unobservable":
            raise ValueError("observability status is invalid")
        if record.details["owner"] != "cryptofeed":
            raise ValueError("observability owner is invalid")
        delegated = record.details["delegatedSignals"]
        if not isinstance(delegated, list) or not delegated:
            raise ValueError("observability delegatedSignals must be nonempty array")
        if any(signal not in {"sequence-gap", "reconnect-lifecycle"} for signal in delegated):
            raise ValueError("observability delegatedSignals contains invalid signal")
        if record.details["fabricatedEvents"] is not False:
            raise ValueError("observability fabricatedEvents must be false")
        note = record.details.get("note")
        if note is not None and (not isinstance(note, str) or not note):
            raise ValueError("observability note must be nonempty string when present")


def validate_payload(channel: str, payload: Any) -> None:
    if not isinstance(payload, dict):
        raise ValueError("payload must be an object")
    if channel == "trade":
        _validate_trade_payload(payload)
        return
    if channel == "l2-book":
        _validate_l2_payload(payload)
        return
    raise ValueError(f"unsupported channel for local collector: {channel}")


def _validate_trade_payload(payload: dict[str, Any]) -> None:
    _reject_unexpected_keys(
        payload,
        TRADE_PAYLOAD_REQUIRED_KEYS | TRADE_PAYLOAD_OPTIONAL_KEYS,
        "trade payload",
    )
    if payload.get("schemaVersion") != "binance-spot-trade-payload-v1":
        raise ValueError("invalid trade payload schemaVersion")
    required = {"tradeId", "price", "quantity", "tradeTimestampMs", "takerSide"}
    missing = required - payload.keys()
    if missing:
        raise ValueError(f"trade payload missing: {sorted(missing)}")
    _validate_decimal_string(payload["price"], "price")
    _validate_decimal_string(payload["quantity"], "quantity")
    if payload["takerSide"] not in {"buy", "sell", None}:
        raise ValueError("takerSide must be buy, sell, or null")
    if not _valid_sequence(payload["tradeId"]):
        raise ValueError("tradeId must be a nonnegative integer, decimal string, or null")
    _validate_timestamp_ms(payload["tradeTimestampMs"], "tradeTimestampMs", nullable=True)
    if "isBuyerMaker" in payload and not isinstance(payload["isBuyerMaker"], bool):
        raise ValueError("isBuyerMaker must be boolean when present")


def _validate_l2_payload(payload: dict[str, Any]) -> None:
    _reject_unexpected_keys(
        payload,
        L2_PAYLOAD_REQUIRED_KEYS | L2_PAYLOAD_OPTIONAL_KEYS,
        "l2 payload",
    )
    if payload.get("schemaVersion") != "binance-spot-l2-book-payload-v1":
        raise ValueError("invalid l2 payload schemaVersion")
    required = {"updateType", "sequence", "bids", "asks"}
    missing = required - payload.keys()
    if missing:
        raise ValueError(f"l2-book payload missing: {sorted(missing)}")
    if payload["updateType"] not in {"snapshot", "delta"}:
        raise ValueError("updateType must be snapshot or delta")
    for optional_sequence in ("sequence", "previousSequence"):
        if optional_sequence in payload and not _valid_sequence(payload[optional_sequence]):
            raise ValueError(f"{optional_sequence} must be number, string, or null")
    if (
        _is_int(payload.get("previousSequence"))
        and _is_int(payload["sequence"])
        and payload["sequence"] < payload["previousSequence"]
    ):
        raise ValueError("l2 payload sequence precedes previousSequence")
    for side in ("bids", "asks"):
        if not isinstance(payload[side], list):
            raise ValueError(f"{side} must be a list")
        for level in payload[side]:
            if not isinstance(level, list) or len(level) != 2:
                raise ValueError(f"{side} levels must be [price, quantity]")
            _validate_decimal_string(level[0], f"{side} price")
            _validate_decimal_string(level[1], f"{side} quantity")


def _valid_sequence(value: Any) -> bool:
    if value is None:
        return True
    if _is_int(value):
        return value >= 0
    if isinstance(value, str):
        return _is_decimal_string(value)
    return False


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _validate_timestamp_ms(value: Any, field: str, *, nullable: bool) -> None:
    if value is None and nullable:
        return
    if not _is_int(value) or value < 0:
        nullable_suffix = " or null" if nullable else ""
        raise ValueError(f"{field} must be a nonnegative integer{nullable_suffix}")


def _validate_nonempty_string(value: Any, field: str) -> None:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{field} must be a nonempty string")


def _is_decimal_string(value: str) -> bool:
    if DECIMAL_STRING_RE.fullmatch(value) is None:
        return False
    try:
        decimal = Decimal(value)
    except InvalidOperation:
        return False
    return decimal.is_finite() and math.isfinite(float(value))


def _validate_decimal_string(value: Any, field: str) -> None:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a decimal string")
    if not _is_decimal_string(value):
        raise ValueError(f"{field} must be a finite decimal string")


def _reject_unexpected_keys(data: dict[str, Any], allowed: set[str], label: str) -> None:
    unexpected = set(data) - allowed
    if unexpected:
        raise ValueError(f"{label} has unexpected keys: {sorted(unexpected)}")
