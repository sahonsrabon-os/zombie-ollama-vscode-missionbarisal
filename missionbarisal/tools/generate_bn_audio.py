#!/usr/bin/env python3
"""
generate_bn_audio.py -- Document -> Bengali MP3 audio generator (Edge TTS).

Default voice: bn-BD-NabanitaNeural (Bangladeshi Bengali, female).
Supports .html / .md / .txt input. Long text is split into sentence-boundary
chunks (<= CHUNK_LIMIT chars), each chunk is synthesized separately, then all
MP3 parts are concatenated with ffmpeg (fallback: raw byte concat).

Usage:
  python3 tools/generate_bn_audio.py                          # default doc
  python3 tools/generate_bn_audio.py -i doc/sahon.md          # custom input
  python3 tools/generate_bn_audio.py --max-chunks 1           # quick test
  python3 tools/generate_bn_audio.py --voice bn-BD-PradeepNeural

Output: tools/audio/<input-stem>.mp3
Requires: pip install edge-tts   (and the ffmpeg binary for safe concat)
NOTE: edge-tts needs internet access to Microsoft speech endpoints.
"""
import argparse
import asyncio
import re
import subprocess
import sys
import time
from html.parser import HTMLParser
from pathlib import Path

try:
    import edge_tts
except ImportError:
    sys.exit("[FATAL] edge-tts not installed:  pip install edge-tts")

REPO = Path(__file__).resolve().parent.parent
DEFAULT_INPUT = REPO / "doc" / "pas-opencode-bughunter-analysis.html"
DEFAULT_OUTDIR = REPO / "tools" / "audio"
CHUNK_LIMIT = 1800          # chars per TTS request (safe for edge-tts)
RETRIES_PER_CHUNK = 3

BLOCK_TAGS = {
    "p", "div", "br", "li", "tr", "table", "ul", "ol",
    "h1", "h2", "h3", "h4", "h5", "h6", "section", "article",
    "header", "footer", "blockquote", "pre", "hr",
}
SKIP_TAGS = {"script", "style", "head", "noscript"}


class HTMLTextExtractor(HTMLParser):
    """Minimal stdlib HTML -> plain text converter (no bs4 dependency)."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self._pieces = []
        self._skip_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in SKIP_TAGS:
            self._skip_depth += 1
        elif tag in BLOCK_TAGS:
            self._pieces.append("\n\n")

    def handle_endtag(self, tag):
        if tag in SKIP_TAGS and self._skip_depth > 0:
            self._skip_depth -= 1
        elif tag in BLOCK_TAGS:
            self._pieces.append("\n\n")

    def handle_data(self, data):
        if self._skip_depth == 0:
            self._pieces.append(data)

    def text(self):
        raw = "".join(self._pieces)
        raw = re.sub(r"[ \t]+", " ", raw)
        raw = re.sub(r"\n{3,}", "\n\n", raw)
        return raw.strip()


def load_text(path: Path) -> str:
    src = path.read_text(encoding="utf-8", errors="replace")
    if path.suffix.lower() == ".html":
        extractor = HTMLTextExtractor()
        try:
            extractor.feed(src)
            return extractor.text()
        except Exception as exc:  # malformed HTML -> fallback strip
            print(f"[WARN] HTML parse failed ({exc}); using regex strip fallback")
            txt = re.sub(r"<[^>]+>", "\n", src)
            return re.sub(r"\n{3,}", "\n\n", txt).strip()
    return src.strip()


def split_chunks(text: str, limit: int = CHUNK_LIMIT):
    """Split on Bengali/English sentence enders; hard-cut as last resort."""
    sentences = re.split(r"(?<=[\u0964!?\.\n])\s+", text)
    chunks, buf = [], ""
    for s in sentences:
        s = s.strip()
        if not s:
            continue
        while len(s) > limit:                      # single monster-sentence
            if buf:
                chunks.append(buf)
                buf = ""
            chunks.append(s[:limit])
            s = s[limit:]
        if len(buf) + len(s) + 1 <= limit:
            buf = f"{buf} {s}".strip()
        else:
            if buf:
                chunks.append(buf)
            buf = s
    if buf:
        chunks.append(buf)
    return chunks


async def synth_chunk(text: str, voice: str, rate: str) -> bytes | None:
    """Synthesize one chunk with retry/backoff. Returns MP3 bytes or None."""
    for attempt in range(1, RETRIES_PER_CHUNK + 1):
        try:
            com = edge_tts.Communicate(text, voice=voice, rate=rate)
            buf = bytearray()
            async for part in com.stream():
                if part["type"] == "audio":
                    buf.extend(part["data"])
            if buf:
                return bytes(buf)
            print(f"    [WARN] empty audio (attempt {attempt})")
        except Exception as exc:
            print(f"    [WARN] attempt {attempt}/{RETRIES_PER_CHUNK} failed: {exc}")
        await asyncio.sleep(2 * attempt)
    return None


def concat_parts(parts_dir: Path, out_mp3: Path, n_parts: int) -> bool:
    list_file = out_mp3.with_suffix(".concat.tmp")
    with open(list_file, "w", encoding="utf-8") as fh:
        for i in range(n_parts):
            fh.write(f"file '{parts_dir / f'part_{i:04d}.mp3'}'\n")
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
             "-i", str(list_file), "-c", "copy", str(out_mp3)],
            check=True,
        )
        list_file.unlink(missing_ok=True)
        return True
    except Exception as exc:
        print(f"[WARN] ffmpeg concat failed ({exc}); raw byte fallback")
        with open(out_mp3, "wb") as out:
            for i in range(n_parts):
                p = parts_dir / f"part_{i:04d}.mp3"
                if p.exists():
                    out.write(p.read_bytes())
        list_file.unlink(missing_ok=True)
        return True


async def main() -> None:
    ap = argparse.ArgumentParser(description="Bengali document to MP3 (Edge TTS)")
    ap.add_argument("-i", "--input", type=Path, default=DEFAULT_INPUT)
    ap.add_argument("-o", "--output", type=Path, default=None,
                    help="final mp3 path (default tools/audio/<stem>.mp3)")
    ap.add_argument("--voice", default="bn-BD-NabanitaNeural")
    ap.add_argument("--rate", default="+0%", help='e.g. "+10%%" or "-5%%"')
    ap.add_argument("--max-chunks", type=int, default=0,
                    help="0=all; N>0 => only first N chunks (testing)")
    args = ap.parse_args()

    inp: Path = args.input if args.input.is_absolute() else REPO / args.input
    if not inp.exists():
        sys.exit(f"[FATAL] input not found: {inp}")

    text = load_text(inp)
    print(f"[INFO] input      : {inp}")
    print(f"[INFO] extracted  : {len(text)} chars")
    if not text:
        sys.exit("[FATAL] no extractable text")

    chunks = split_chunks(text)
    if args.max_chunks > 0:
        chunks = chunks[: args.max_chunks]
    total = len(chunks)
    print(f"[INFO] chunks     : {total} (limit {CHUNK_LIMIT} chars)")

    outdir = DEFAULT_OUTDIR
    outdir.mkdir(parents=True, exist_ok=True)
    final: Path = (
        args.output if args.output
        else outdir / f"{inp.stem}.mp3"
    )
    final = final if final.is_absolute() else REPO / final
    parts_dir = outdir / f".parts-{inp.stem}"
    parts_dir.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    ok_parts = []
    for idx, chunk in enumerate(chunks):
        audio = await synth_chunk(chunk, args.voice, args.rate)
        part_path = parts_dir / f"part_{idx:04d}.mp3"
        if audio is None:
            print(f"[ERROR] chunk {idx + 1}/{total} FAILED after "
                  f"{RETRIES_PER_CHUNK} retries -- skipping")
            continue
        part_path.write_bytes(audio)
        ok_parts.append(part_path)
        done = len(ok_parts)
        pct = 100 * (idx + 1) // total
        print(f"[{pct:3d}%] chunk {idx + 1}/{total} "
              f"({len(chunk)} chars -> {len(audio)} bytes)", flush=True)

    failed = total - len(ok_parts)
    if not ok_parts:
        sys.exit("[FATAL] every chunk failed -- check internet connectivity")
    concat_ok = concat_parts(parts_dir, final, total)
    elapsed = time.time() - t0
    size_kb = final.stat().st_size // 1024 if final.exists() else 0

    print("=" * 60)
    print(f"[DONE] {final}")
    print(f"       {size_kb} KB | {len(ok_parts)}/{total} chunks | "
          f"{elapsed:.1f}s | ffmpeg={'yes' if concat_ok else 'raw-fallback'}")
    if failed:
        print(f"[WARN] {failed} chunk(s) missing from audio!")
    if args.max_chunks == 0 and failed == 0:
        import shutil
        shutil.rmtree(parts_dir, ignore_errors=True)
        print(f"[CLEAN] removed temp dir {parts_dir}")


if __name__ == "__main__":
    asyncio.run(main())
