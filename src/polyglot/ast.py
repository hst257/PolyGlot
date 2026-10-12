"""Normalized semantic nodes. Syntax provenance does not control semantics."""

from dataclasses import dataclass, field
from .source import Span


@dataclass
class Node:
    kind: str
    span: Span
    data: dict = field(default_factory=dict)
    meta: dict = field(default_factory=dict)
