"""File-based codebook storage — stored in project git repo under coding/."""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .project_fs import read_project_file, project_worktree

CB_DIR = "coding/Project"


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _read_json(project_id: str, path: str, default: Any = None) -> Any:
    try:
        return json.loads(read_project_file(project_id, path))
    except Exception:
        return default if default is not None else {}


def _write_json(wt_path: Path, data: Any) -> None:
    wt_path.parent.mkdir(parents=True, exist_ok=True)
    wt_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _meta_path(cb_id: str) -> str:
    return f"{CB_DIR}/{cb_id}/meta.json"


def _codes_path(cb_id: str) -> str:
    return f"{CB_DIR}/{cb_id}/codes.json"


def _data_path(cb_id: str) -> str:
    return f"{CB_DIR}/{cb_id}/data.json"


# ── List / Get ────────────────────────────────────────────────────────────────

def list_codebooks(project_id: str) -> list[dict]:
    from .project_fs import list_project_dir
    try:
        paths = list_project_dir(project_id, CB_DIR)
    except Exception:
        return []
    seen: set[str] = set()
    result: list[dict] = []
    for p in paths:
        parts = p.replace("\\", "/").split("/")
        if len(parts) >= 4 and parts[3] == "meta.json":
            cb_id = parts[2]
            if cb_id in seen:
                continue
            seen.add(cb_id)
            meta = _read_json(project_id, _meta_path(cb_id))
            if meta:
                result.append({**meta, "id": cb_id})
    return sorted(result, key=lambda x: x.get("created_at", ""))


def get_codebook(project_id: str, cb_id: str) -> dict | None:
    meta = _read_json(project_id, _meta_path(cb_id))
    if not meta:
        return None
    codes = _read_json(project_id, _codes_path(cb_id), {"codes": []})
    data = _read_json(project_id, _data_path(cb_id), {"excerpts": []})
    return {
        **meta,
        "id": cb_id,
        "codes": codes.get("codes", []),
        "excerpts": data.get("excerpts", []),
    }


# ── CRUD ──────────────────────────────────────────────────────────────────────

def create_codebook(project_id: str, title: str, description: str = "") -> dict:
    slug = re.sub(r"[^\w-]", "", title.lower().replace(" ", "-"))[:30]
    cb_id = slug or str(uuid.uuid4())[:8]
    meta: dict = {
        "title": title,
        "description": description,
        "papers": [],
        "criteria": [],
        "assignments": {},
        "screening": {},
        "created_at": _utcnow(),
    }
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Create codebook: {title}"
        _write_json(wt / _meta_path(cb_id), meta)
        _write_json(wt / _codes_path(cb_id), {"codes": []})
        _write_json(wt / _data_path(cb_id), {"excerpts": []})
    return {**meta, "id": cb_id}


def update_codebook_meta(project_id: str, cb_id: str, updates: dict) -> dict:
    meta = _read_json(project_id, _meta_path(cb_id))
    if not meta:
        raise FileNotFoundError(cb_id)
    allowed = {"title", "description"}
    for k, v in updates.items():
        if k in allowed and v is not None:
            meta[k] = v
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Update codebook: {cb_id}"
        _write_json(wt / _meta_path(cb_id), meta)
    return {**meta, "id": cb_id}


def delete_codebook(project_id: str, cb_id: str) -> None:
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Delete codebook: {cb_id}"
        cb_dir = wt / CB_DIR / cb_id
        if cb_dir.exists():
            import shutil
            shutil.rmtree(str(cb_dir))


# ── Papers ────────────────────────────────────────────────────────────────────

def add_papers(project_id: str, cb_id: str, paper_ids: list[str]) -> dict:
    meta = _read_json(project_id, _meta_path(cb_id))
    if not meta:
        raise FileNotFoundError(cb_id)
    existing = set(meta.get("papers", []))
    for pid in paper_ids:
        existing.add(pid)
    meta["papers"] = sorted(existing)
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Add papers to codebook: {cb_id}"
        _write_json(wt / _meta_path(cb_id), meta)
    return meta


def remove_paper(project_id: str, cb_id: str, paper_id: str) -> dict:
    meta = _read_json(project_id, _meta_path(cb_id))
    if not meta:
        raise FileNotFoundError(cb_id)
    meta["papers"] = [p for p in meta.get("papers", []) if p != paper_id]
    # Clean up screening entry
    meta.setdefault("screening", {}).pop(paper_id, None)
    meta.setdefault("assignments", {}).pop(paper_id, None)
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Remove paper {paper_id} from codebook: {cb_id}"
        _write_json(wt / _meta_path(cb_id), meta)
    return meta


# ── Criteria ──────────────────────────────────────────────────────────────────

def set_criteria(project_id: str, cb_id: str, criteria: list[dict]) -> dict:
    """Replace the whole criteria list."""
    meta = _read_json(project_id, _meta_path(cb_id))
    if not meta:
        raise FileNotFoundError(cb_id)
    normalized = []
    for i, c in enumerate(criteria):
        normalized.append({
            "id": c.get("id") or str(uuid.uuid4())[:8],
            "text": c.get("text", ""),
            "order": i,
        })
    meta["criteria"] = normalized
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Update criteria for codebook: {cb_id}"
        _write_json(wt / _meta_path(cb_id), meta)
    return meta


def update_screening(project_id: str, cb_id: str, paper_id: str, decisions: dict) -> dict:
    """
    decisions: { criterion_id: "pass" | "fail" | "pending" }
    Also computes overall: "included" if all pass, "excluded" if any fail, else "pending"
    """
    meta = _read_json(project_id, _meta_path(cb_id))
    if not meta:
        raise FileNotFoundError(cb_id)
    screening = meta.setdefault("screening", {})
    entry = screening.setdefault(paper_id, {})
    entry.update(decisions)
    # Compute overall
    criteria_ids = [c["id"] for c in meta.get("criteria", [])]
    if not criteria_ids:
        entry["overall"] = "included"
    elif any(entry.get(cid) == "fail" for cid in criteria_ids):
        entry["overall"] = "excluded"
    elif all(entry.get(cid) == "pass" for cid in criteria_ids):
        entry["overall"] = "included"
    else:
        entry["overall"] = "pending"
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Update screening for {paper_id} in {cb_id}"
        _write_json(wt / _meta_path(cb_id), meta)
    return entry


def update_assignment(project_id: str, cb_id: str, paper_id: str, assignee: str) -> dict:
    meta = _read_json(project_id, _meta_path(cb_id))
    if not meta:
        raise FileNotFoundError(cb_id)
    meta.setdefault("assignments", {})[paper_id] = assignee
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Assign {paper_id} to {assignee} in {cb_id}"
        _write_json(wt / _meta_path(cb_id), meta)
    return meta


# ── Codes ─────────────────────────────────────────────────────────────────────

def list_codes(project_id: str, cb_id: str) -> list[dict]:
    return _read_json(project_id, _codes_path(cb_id), {"codes": []}).get("codes", [])


def create_code(project_id: str, cb_id: str, label: str, **kwargs) -> dict:
    codes_data = _read_json(project_id, _codes_path(cb_id), {"codes": []})
    codes = codes_data.get("codes", [])
    code: dict = {
        "id": str(uuid.uuid4())[:8],
        "label": label,
        "parent_id": kwargs.get("parent_id"),
        "description": kwargs.get("description", ""),
        "color": kwargs.get("color", "#6366f1"),
        "fields": kwargs.get("fields", {}),
        "order": len(codes),
        "created_at": _utcnow(),
    }
    codes.append(code)
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Create code '{label}' in {cb_id}"
        _write_json(wt / _codes_path(cb_id), {"codes": codes})
    return code


def update_code(project_id: str, cb_id: str, code_id: str, updates: dict) -> dict:
    codes_data = _read_json(project_id, _codes_path(cb_id), {"codes": []})
    codes = codes_data.get("codes", [])
    for code in codes:
        if code["id"] == code_id:
            for k in ("label", "parent_id", "description", "color", "fields", "order"):
                if k in updates:
                    code[k] = updates[k]
            break
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Update code {code_id} in {cb_id}"
        _write_json(wt / _codes_path(cb_id), {"codes": codes})
    return next((c for c in codes if c["id"] == code_id), {})


def delete_code(project_id: str, cb_id: str, code_id: str) -> None:
    codes_data = _read_json(project_id, _codes_path(cb_id), {"codes": []})
    codes = [c for c in codes_data.get("codes", []) if c["id"] != code_id]
    # Re-parent children to None
    for c in codes:
        if c.get("parent_id") == code_id:
            c["parent_id"] = None
    data = _read_json(project_id, _data_path(cb_id), {"excerpts": []})
    excerpts = [e for e in data.get("excerpts", []) if e.get("code_id") != code_id]
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Delete code {code_id} from {cb_id}"
        _write_json(wt / _codes_path(cb_id), {"codes": codes})
        _write_json(wt / _data_path(cb_id), {"excerpts": excerpts})


# ── Excerpts ──────────────────────────────────────────────────────────────────

def list_excerpts(project_id: str, cb_id: str) -> list[dict]:
    return _read_json(project_id, _data_path(cb_id), {"excerpts": []}).get("excerpts", [])


def add_excerpt(project_id: str, cb_id: str, paper_id: str, code_id: str, text: str,
                note: str = "", coder: str = "", image: str = "") -> dict:
    data = _read_json(project_id, _data_path(cb_id), {"excerpts": []})
    excerpts = data.get("excerpts", [])
    exc: dict = {
        "id": str(uuid.uuid4())[:8],
        "paper_id": paper_id,
        "code_id": code_id,
        "text": text,
        "note": note,
        "coder": coder,
        "image": image,       # legacy single
        "images": [],         # multi-image, populated separately
        "created_at": _utcnow(),
    }
    excerpts.append(exc)
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Add excerpt to {cb_id}"
        _write_json(wt / _data_path(cb_id), {"excerpts": excerpts})
    return exc


def update_excerpt(project_id: str, cb_id: str, exc_id: str, updates: dict) -> dict:
    data = _read_json(project_id, _data_path(cb_id), {"excerpts": []})
    excerpts = data.get("excerpts", [])
    target = None
    for exc in excerpts:
        if exc["id"] == exc_id:
            for k in ("text", "note", "coder", "image", "images", "code_id"):
                if k in updates:
                    exc[k] = updates[k]
            target = exc
            break
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Update excerpt {exc_id} in {cb_id}"
        _write_json(wt / _data_path(cb_id), {"excerpts": excerpts})
    return target or {}


def delete_excerpt(project_id: str, cb_id: str, exc_id: str) -> None:
    data = _read_json(project_id, _data_path(cb_id), {"excerpts": []})
    excerpts = [e for e in data.get("excerpts", []) if e["id"] != exc_id]
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Delete excerpt {exc_id} from {cb_id}"
        _write_json(wt / _data_path(cb_id), {"excerpts": excerpts})


# ── Export ────────────────────────────────────────────────────────────────────

def export_csv(project_id: str, cb_id: str) -> str:
    """Return CSV string of the coding matrix."""
    import csv, io
    cb = get_codebook(project_id, cb_id)
    if not cb:
        return ""
    codes = cb.get("codes", [])
    excerpts = cb.get("excerpts", [])
    screening = cb.get("screening", {})
    assignments = cb.get("assignments", {})
    included = [p for p in cb.get("papers", [])
                if screening.get(p, {}).get("overall") in ("included", "")]

    # Build index: paper_id → code_id → list of excerpts
    index: dict[str, dict[str, list[str]]] = {}
    for exc in excerpts:
        pid, cid = exc.get("paper_id", ""), exc.get("code_id", "")
        index.setdefault(pid, {}).setdefault(cid, []).append(exc.get("text", ""))

    buf = io.StringIO()
    w = csv.writer(buf)
    code_ids = [c["id"] for c in codes]
    code_labels = [c["label"] for c in codes]
    w.writerow(["paper_id", "assigned_to", "status"] + code_labels)
    for pid in included or cb.get("papers", []):
        status = screening.get(pid, {}).get("overall", "pending")
        assignee = assignments.get(pid, "")
        row = [pid, assignee, status]
        for cid in code_ids:
            texts = index.get(pid, {}).get(cid, [])
            row.append(" | ".join(texts))
        w.writerow(row)
    return buf.getvalue()


# ── Stages (multi-round screening) ───────────────────────────────────────────

def set_stages(project_id: str, cb_id: str, stages: list[dict]) -> dict:
    """Replace the stages array in meta. Each stage has: id, name, order, criteria[], pass_logic."""
    meta = _read_json(project_id, _meta_path(cb_id))
    if not meta:
        raise FileNotFoundError(cb_id)
    normalized = []
    for i, s in enumerate(stages):
        criteria = []
        for j, c in enumerate(s.get("criteria", [])):
            criteria.append({
                "id": c.get("id") or str(uuid.uuid4())[:8],
                "text": c.get("text", ""),
                "type": c.get("type", "boolean"),   # boolean | select | multiselect
                "options": c.get("options", []),
                "order": j,
            })
        normalized.append({
            "id": s.get("id") or str(uuid.uuid4())[:8],
            "name": s.get("name", f"Stage {i+1}"),
            "order": i,
            "criteria": criteria,
            "pass_logic": s.get("pass_logic", "all_pass"),  # all_pass | any_pass
        })
    meta["stages"] = normalized
    # Keep old flat criteria for backwards compat
    meta.setdefault("criteria", [])
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Update stages for codebook: {cb_id}"
        _write_json(wt / _meta_path(cb_id), meta)
    return meta


def update_stage_screening(project_id: str, cb_id: str, paper_id: str, stage_id: str, decisions: dict) -> dict:
    """
    decisions: {criterion_id: value}  — value is "pass"/"fail" for boolean, string for select, list for multiselect
    Computes stage overall and updates paper's current_stage if stage passes.
    """
    meta = _read_json(project_id, _meta_path(cb_id))
    if not meta:
        raise FileNotFoundError(cb_id)
    stages = meta.get("stages", [])
    stage = next((s for s in stages if s["id"] == stage_id), None)
    if not stage:
        raise ValueError(f"Stage {stage_id} not found")

    # Build screening entry
    screening = meta.setdefault("screening", {})
    paper_entry = screening.setdefault(paper_id, {"current_stage": stages[0]["id"] if stages else "coding", "manual": False, "stages": {}})
    stage_entry = paper_entry.setdefault("stages", {}).setdefault(stage_id, {})
    stage_entry.update(decisions)

    # Compute stage overall
    criteria = stage.get("criteria", [])
    pass_logic = stage.get("pass_logic", "all_pass")
    if not criteria:
        overall = "pass"
    else:
        passed = []
        for c in criteria:
            val = stage_entry.get(c["id"])
            if c["type"] == "boolean":
                passed.append(val == "pass")
            elif c["type"] in ("select", "multiselect"):
                passed.append(bool(val))
            else:
                passed.append(val == "pass")
        if pass_logic == "all_pass":
            overall = "pass" if all(passed) else ("fail" if any(v is False for v in passed) else "pending")
        else:
            overall = "pass" if any(passed) else ("fail" if all(v is False for v in passed) else "pending")
    stage_entry["overall"] = overall

    # If stage passes and not manual, advance to next stage (or coding)
    if overall == "pass" and not paper_entry.get("manual"):
        stage_order = [s["id"] for s in sorted(stages, key=lambda x: x["order"])]
        current_idx = stage_order.index(stage_id) if stage_id in stage_order else -1
        if current_idx >= 0 and current_idx + 1 < len(stage_order):
            paper_entry["current_stage"] = stage_order[current_idx + 1]
        else:
            paper_entry["current_stage"] = "coding"
    elif overall == "fail" and not paper_entry.get("manual"):
        paper_entry["current_stage"] = "excluded"

    with project_worktree(project_id) as wt:
        wt.commit_message = f"Update stage screening {stage_id} for {paper_id}"
        _write_json(wt / _meta_path(cb_id), meta)
    return paper_entry


def set_paper_stage_override(project_id: str, cb_id: str, paper_id: str, stage: str) -> dict:
    """Manually override a paper's current stage."""
    meta = _read_json(project_id, _meta_path(cb_id))
    if not meta:
        raise FileNotFoundError(cb_id)
    screening = meta.setdefault("screening", {})
    entry = screening.setdefault(paper_id, {"current_stage": stage, "manual": True, "stages": {}})
    entry["current_stage"] = stage
    entry["manual"] = True
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Manual stage override {paper_id} → {stage}"
        _write_json(wt / _meta_path(cb_id), meta)
    return entry


# ── Transcripts ────────────────────────────────────────────────────────────────

def _transcript_path(cb_id: str, t_id: str) -> str:
    return f"{CB_DIR}/{cb_id}/transcripts/{t_id}.json"


def list_transcripts(project_id: str, cb_id: str) -> list[dict]:
    from .project_fs import list_project_dir
    try:
        paths = list_project_dir(project_id, f"{CB_DIR}/{cb_id}/transcripts")
    except Exception:
        return []
    result = []
    for p in paths:
        if p.endswith(".json"):
            parts = p.replace("\\", "/").split("/")
            t_id = parts[-1].replace(".json", "")
            t = _read_json(project_id, p)
            if t:
                result.append({**t, "id": t_id})
    return sorted(result, key=lambda x: x.get("created_at", ""))


def get_transcript(project_id: str, cb_id: str, t_id: str) -> dict | None:
    t = _read_json(project_id, _transcript_path(cb_id, t_id))
    if not t:
        return None
    return {**t, "id": t_id}


def create_transcript(project_id: str, cb_id: str, title: str, content: str, source: str = "interview") -> dict:
    slug = re.sub(r"[^\w-]", "", title.lower().replace(" ", "-"))[:30]
    t_id = slug or str(uuid.uuid4())[:8]
    t: dict = {
        "title": title,
        "source": source,
        "content": content,
        "segments": [],
        "created_at": _utcnow(),
    }
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Create transcript: {title}"
        _write_json(wt / _transcript_path(cb_id, t_id), t)
    return {**t, "id": t_id}


def update_transcript(project_id: str, cb_id: str, t_id: str, updates: dict) -> dict:
    t = _read_json(project_id, _transcript_path(cb_id, t_id))
    if not t:
        raise FileNotFoundError(t_id)
    for k in ("title", "source", "content"):
        if k in updates:
            t[k] = updates[k]
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Update transcript: {t_id}"
        _write_json(wt / _transcript_path(cb_id, t_id), t)
    return {**t, "id": t_id}


def delete_transcript(project_id: str, cb_id: str, t_id: str) -> None:
    path = f"{CB_DIR}/{cb_id}/transcripts/{t_id}.json"
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Delete transcript: {t_id}"
        p = wt / path
        if p.exists():
            p.unlink()


def add_segment(project_id: str, cb_id: str, t_id: str, code_id: str, start: int, end: int,
                text: str, note: str = "", coder: str = "") -> dict:
    t = _read_json(project_id, _transcript_path(cb_id, t_id))
    if not t:
        raise FileNotFoundError(t_id)
    seg: dict = {
        "id": str(uuid.uuid4())[:8],
        "code_id": code_id,
        "start": start,
        "end": end,
        "text": text,
        "note": note,
        "coder": coder,
        "created_at": _utcnow(),
    }
    t.setdefault("segments", []).append(seg)
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Add segment to transcript {t_id}"
        _write_json(wt / _transcript_path(cb_id, t_id), t)
    return seg


def delete_segment(project_id: str, cb_id: str, t_id: str, seg_id: str) -> None:
    t = _read_json(project_id, _transcript_path(cb_id, t_id))
    if not t:
        raise FileNotFoundError(t_id)
    t["segments"] = [s for s in t.get("segments", []) if s["id"] != seg_id]
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Delete segment {seg_id} from {t_id}"
        _write_json(wt / _transcript_path(cb_id, t_id), t)


def update_segment(project_id: str, cb_id: str, t_id: str, seg_id: str, updates: dict) -> dict:
    t = _read_json(project_id, _transcript_path(cb_id, t_id))
    if not t:
        raise FileNotFoundError(t_id)
    target = None
    for seg in t.get("segments", []):
        if seg["id"] == seg_id:
            for k in ("code_id", "note", "coder"):
                if k in updates:
                    seg[k] = updates[k]
            target = seg
            break
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Update segment {seg_id}"
        _write_json(wt / _transcript_path(cb_id, t_id), t)
    return target or {}
