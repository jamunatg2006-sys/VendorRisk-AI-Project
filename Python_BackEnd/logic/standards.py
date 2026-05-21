"""
standards.py — Backward-compatibility shim.

RiskBenchmarks has been merged into scoring_engine.py.
This module re-exports it so existing imports continue to work.
"""

from logic.scoring_engine import RiskBenchmarks  # noqa: F401

__all__ = ["RiskBenchmarks"]
