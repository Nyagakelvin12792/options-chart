from __future__ import annotations

import json
from pathlib import Path

from cryptofeed_collector.cli import main
from cryptofeed_collector.config import parse_config


def test_live_collection_defaults_to_disabled() -> None:
    config = parse_config(
        {
            "venue": "BINANCE",
            "symbol": "BTC-USDT",
            "instrumentType": "spot",
            "channels": ["trade"],
            "storage": {"directory": "events"},
        }
    )

    assert config.live_enabled is False


def test_live_collection_rejects_non_boolean_enabled() -> None:
    try:
        parse_config(
            {
                "venue": "BINANCE",
                "symbol": "BTC-USDT",
                "instrumentType": "spot",
                "channels": ["trade"],
                "storage": {"directory": "events"},
                "liveCollection": {"enabled": "false"},
            }
        )
    except ValueError as exc:
        assert "liveCollection.enabled must be a boolean" in str(exc)
    else:
        raise AssertionError("expected non-boolean liveCollection.enabled to be rejected")


def test_cli_validates_config_without_starting_live_loop(tmp_path: Path, monkeypatch, capsys) -> None:
    config_path = tmp_path / "config.json"
    config_path.write_text(
        json.dumps(
            {
                "venue": "BINANCE",
                "symbol": "BTC-USDT",
                "instrumentType": "spot",
                "channels": ["trade"],
                "storage": {"directory": "events"},
                "liveCollection": {"enabled": False},
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr("sys.argv", ["collector", "--config", str(config_path)])

    assert main() == 0
    assert "Live collection is disabled" in capsys.readouterr().out
