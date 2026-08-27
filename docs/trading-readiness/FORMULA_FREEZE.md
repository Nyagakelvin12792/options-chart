# V1 Formula Freeze

Status: NOT FROZEN

Current candidates:

```text
ENGINE_VERSION = 0.1.0
CALCULATION_ENGINE_VERSION = 1.0.0
GEX_MODEL_VERSION = gex-heuristic-v1
GAMMA_PROFILE_VERSION = sticky-iv-v1
MAX_PAIN_VERSION = max-pain-expiry-v1
CALCULATION_AUDIT_SCHEMA_VERSION = 1.0.0
```

The formulas must not be declared frozen until M9.6 through M9.10 have real
observation evidence and no unresolved critical data-integrity defect remains.
Any later semantic change requires a version change, updated golden fixtures,
independent parity evidence, and release notes.
