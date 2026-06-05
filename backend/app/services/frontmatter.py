"""Read and write YAML frontmatter in Markdown files."""
from pathlib import Path
from typing import Any

import frontmatter as fm


def read(path: Path) -> tuple[dict, str]:
    """Returns (metadata_dict, body_str)."""
    post = fm.load(str(path))
    return dict(post.metadata), post.content


def write(path: Path, metadata: dict, body: str) -> None:
    post = fm.Post(body, **metadata)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(fm.dumps(post), encoding="utf-8")


def update_metadata(path: Path, updates: dict[str, Any]) -> None:
    """Merge updates into existing frontmatter without touching the body."""
    meta, body = read(path)
    meta.update(updates)
    write(path, meta, body)
