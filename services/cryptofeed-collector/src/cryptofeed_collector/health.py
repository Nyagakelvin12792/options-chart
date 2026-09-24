from __future__ import annotations

from typing import Any

from .events import HealthSeverity, HealthType, MarketChannel, MarketHealthEventV1, build_health_record


def build_gap_event(
    *,
    venue: str,
    symbol: str,
    channel: MarketChannel,
    detected_at_ms: int,
    connection_id: str,
    previous_sequence: int | str | None,
    expected_sequence: int | str | None,
    actual_sequence: int | str | None,
    missing_count: int | None,
    severity: HealthSeverity = "warning",
) -> MarketHealthEventV1:
    return _build_health_event(
        type="gap",
        venue=venue,
        symbol=symbol,
        channel=channel,
        detected_at_ms=detected_at_ms,
        connection_id=connection_id,
        severity=severity,
        details={
            "previousSequence": previous_sequence,
            "expectedSequence": expected_sequence,
            "actualSequence": actual_sequence,
            "missingCount": missing_count,
        },
    )


def build_stale_event(
    *,
    venue: str,
    symbol: str,
    channel: MarketChannel,
    detected_at_ms: int,
    connection_id: str,
    last_event_timestamp_ms: int | None,
    stale_threshold_ms: int,
    elapsed_ms: int,
) -> MarketHealthEventV1:
    return _build_health_event(
        type="stale",
        venue=venue,
        symbol=symbol,
        channel=channel,
        detected_at_ms=detected_at_ms,
        connection_id=connection_id,
        severity="warning",
        details={
            "lastEventTimestampMs": last_event_timestamp_ms,
            "staleThresholdMs": stale_threshold_ms,
            "elapsedMs": elapsed_ms,
        },
    )


def build_reconnect_event(
    *,
    venue: str,
    symbol: str,
    channel: MarketChannel | None,
    detected_at_ms: int,
    connection_id: str,
    reason: str | None,
    attempt: int = 0,
    backoff_ms: int | None = None,
    severity: HealthSeverity = "info",
) -> MarketHealthEventV1:
    return _build_health_event(
        type="reconnect",
        venue=venue,
        symbol=symbol,
        channel=channel,
        detected_at_ms=detected_at_ms,
        connection_id=connection_id,
        severity=severity,
        details={"reason": reason, "attempt": attempt, "backoffMs": backoff_ms},
    )


def build_duplicate_event(
    *,
    venue: str,
    symbol: str,
    channel: MarketChannel,
    detected_at_ms: int,
    connection_id: str,
    duplicate_event_id: str,
    first_seen_at_ms: int | None,
) -> MarketHealthEventV1:
    return _build_health_event(
        type="duplicate",
        venue=venue,
        symbol=symbol,
        channel=channel,
        detected_at_ms=detected_at_ms,
        connection_id=connection_id,
        severity="info",
        related_event_id=duplicate_event_id,
        details={
            "duplicateEventId": duplicate_event_id,
            "firstSeenAtMs": first_seen_at_ms,
        },
    )


def build_unsupported_channel_event(
    *,
    venue: str,
    symbol: str,
    channel: str,
    detected_at_ms: int,
    connection_id: str,
    raw_channel: str | None = None,
) -> MarketHealthEventV1:
    return _build_health_event(
        type="unsupported-channel",
        venue=venue,
        symbol=symbol,
        channel=channel,
        detected_at_ms=detected_at_ms,
        connection_id=connection_id,
        severity="warning",
        details={"unsupportedChannel": channel, "rawChannel": raw_channel},
    )


def build_collector_error_event(
    *,
    venue: str,
    symbol: str,
    channel: str | None,
    detected_at_ms: int,
    connection_id: str,
    source: str,
    error_code: str,
    message: str,
) -> MarketHealthEventV1:
    return _build_health_event(
        type="collector-error",
        venue=venue,
        symbol=symbol,
        channel=channel,
        detected_at_ms=detected_at_ms,
        connection_id=connection_id,
        severity="error",
        details={
            "source": source,
            "errorCode": error_code,
            "message": message,
            "terminal": True,
            "retryable": False,
        },
    )


def build_observability_event(
    *,
    venue: str,
    symbol: str,
    channel: str | None,
    detected_at_ms: int,
    connection_id: str,
    delegated_signals: list[str],
    note: str,
) -> MarketHealthEventV1:
    return _build_health_event(
        type="observability",
        venue=venue,
        symbol=symbol,
        channel=channel,
        detected_at_ms=detected_at_ms,
        connection_id=connection_id,
        severity="info",
        details={
            "status": "delegated-unobservable",
            "owner": "cryptofeed",
            "delegatedSignals": delegated_signals,
            "fabricatedEvents": False,
            "note": note,
        },
    )


def _build_health_event(
    *,
    type: HealthType,
    venue: str,
    symbol: str,
    channel: str | None,
    detected_at_ms: int,
    connection_id: str,
    severity: HealthSeverity,
    details: dict[str, Any],
    related_event_id: str | None = None,
) -> MarketHealthEventV1:
    return build_health_record(
        type=type,
        venue=venue,
        symbol=symbol,
        channel=channel,
        detected_at_ms=detected_at_ms,
        collector_version="cryptofeed",
        connection_id=connection_id,
        severity=severity,
        related_event_id=related_event_id,
        details=details,
    )


def is_sequence_regression(previous: int | str | None, current: int | str | None) -> bool:
    if not isinstance(previous, int) or not isinstance(current, int):
        return False
    return current < previous


def is_stale(*, last_receipt_ms: int | None, now_ms: int, stale_after_ms: int) -> bool:
    if last_receipt_ms is None:
        return False
    return now_ms - last_receipt_ms > stale_after_ms
