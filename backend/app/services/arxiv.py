"""Fetch paper metadata from the ArXiv API."""
import re
import httpx
import xml.etree.ElementTree as ET

ARXIV_API = "https://export.arxiv.org/api/query"
NS = {"atom": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}


def _clean_arxiv_id(raw: str) -> str:
    """Extract bare ArXiv ID from any URL/string format."""
    import urllib.parse
    raw = urllib.parse.unquote(raw or "").strip()
    raw = re.sub(r"^arxiv:\s*", "", raw, flags=re.IGNORECASE)
    raw = re.sub(r"^https?://(?:www\.)?arxiv\.org/(?:abs|pdf|html)/", "", raw, flags=re.IGNORECASE)
    raw = raw.split("?", 1)[0].split("#", 1)[0].strip()
    raw = re.sub(r"\.pdf$", "", raw, flags=re.IGNORECASE)
    raw = re.split(r"\s|\[", raw, maxsplit=1)[0]
    m = re.search(r"(\d{4}\.\d{4,5}(?:v\d+)?)", raw)
    if m:
        return re.sub(r"v\d+$", "", m.group(1))   # strip version
    return re.sub(r"v\d+$", "", raw)


async def fetch_metadata(arxiv_id: str) -> dict:
    """Return a dict suitable for paper frontmatter."""
    clean_id = _clean_arxiv_id(arxiv_id)
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(ARXIV_API, params={"id_list": clean_id})
        resp.raise_for_status()

    root = ET.fromstring(resp.text)
    entry = root.find("atom:entry", NS)
    if entry is None:
        raise ValueError(f"ArXiv ID not found: {arxiv_id}")

    title = entry.findtext("atom:title", "", NS).strip().replace("\n", " ")
    authors = [
        a.findtext("atom:name", "", NS)
        for a in entry.findall("atom:author", NS)
    ]
    abstract = entry.findtext("atom:summary", "", NS).strip().replace("\n", " ")
    published = entry.findtext("atom:published", "", NS)[:4]  # year

    categories = [
        c.get("term", "")
        for c in entry.findall("atom:category", NS)
    ]

    return {
        "title": title,
        "authors": authors,
        "year": int(published) if published else None,
        "abstract": abstract,
        "arxiv_id": clean_id,
        "links": {
            "arxiv": f"https://arxiv.org/abs/{clean_id}",
            "zotero": "",
            "google_drive_pdf": "",
        },
        "tags": [],
        "venue": "",
        "preview_image": "",
        "source": "arxiv",
    }
