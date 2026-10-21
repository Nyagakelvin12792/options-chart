from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

SupportedChannel = Literal["trade", "l2-book"]

SUPPORTED_VENUE = "binance"
SUPPORTED_SYMBOL = "BTC-USDT"
SUPPORTED_CHANNELS: set[str] = {"trade", "l2-book"}


@dataclass(frozen=True)
class StorageConfig:
    directory: Path
    prefix: str = "binance-btc-usdt"
    max_bytes: int = 10 * 1024 * 1024


@dataclass(frozen=True)
class HealthConfig:
    stale_after_ms: int = 15_000


@dataclass(frozen=True)
class CollectorConfig:
    venue: str
    symbol: str
    instrument_type: str
    channels: tuple[str, ...]
    collector_version: str
    storage: StorageConfig
    health: HealthConfig
    live_enabled: bool = False


def load_config(path: str | Path) -> CollectorConfig:
    config_path = Path(path)
    data = json.loads(config_path.read_text(encoding="utf-8"))
    return parse_config(data, base_dir=config_path.parent)


def parse_config(data: dict[str, Any], *, base_dir: Path | None = None) -> CollectorConfig:
    base = base_dir or Path.cwd()
    storage = data.get("storage") or {}
    health = data.get("health") or {}
    live = data.get("liveCollection") or {}
    live_enabled = live.get("enabled", False)
    if not isinstance(live_enabled, bool):
        raise ValueError("liveCollection.enabled must be a boolean")

    directory = Path(storage.get("directory", "data/events"))
    if not directory.is_absolute():
        directory = base / directory

    config = CollectorConfig(
        venue=str(data.get("venue", SUPPORTED_VENUE)).lower(),
        symbol=str(data.get("symbol", SUPPORTED_SYMBOL)).upper(),
        instrument_type=str(data.get("instrumentType", "spot")),
        channels=tuple(str(channel) for channel in data.get("channels", [])),
        collector_version=str(data.get("collectorVersion", "cryptofeed-shadow-0.1.0")),
        storage=StorageConfig(
            directory=directory,
            prefix=str(storage.get("prefix", "binance-btc-usdt")),
            max_bytes=int(storage.get("maxBytes", 10 * 1024 * 1024)),
        ),
        health=HealthConfig(stale_after_ms=int(health.get("staleAfterMs", 15_000))),
        live_enabled=live_enabled,
    )
    validate_config(config)
    return config


def validate_config(config: CollectorConfig) -> None:
    if config.venue != SUPPORTED_VENUE:
        raise ValueError(f"unsupported venue: {config.venue}")
    if config.symbol != SUPPORTED_SYMBOL:
        raise ValueError(f"unsupported symbol: {config.symbol}")
    if config.instrument_type != "spot":
        raise ValueError(f"unsupported instrumentType: {config.instrument_type}")
    if not config.channels:
        raise ValueError("at least one channel is required")
    if config.storage.max_bytes <= 0:
        raise ValueError("storage.maxBytes must be positive")
