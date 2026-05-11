from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from faster_whisper import WhisperModel
    from faster_whisper import WhisperModel

VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".mp3", ".m4a", ".wav"}
SUPPORT_EXTENSIONS = {".pdf", ".ppt", ".pptx", ".doc", ".docx", ".txt", ".md"}


def slugify(value: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return value or "lesson"


def discover_lessons(input_dir: Path) -> list[Path]:
    return sorted(
        [path for path in input_dir.rglob("*") if path.suffix.lower() in VIDEO_EXTENSIONS],
        key=lambda path: path.name.lower(),
    )


def support_assets_for(video_path: Path) -> dict[str, list[str]]:
    stem = video_path.stem.lower()
    parent = video_path.parent
    matching = [
        path
        for path in parent.iterdir()
        if path.suffix.lower() in SUPPORT_EXTENSIONS and stem in path.stem.lower()
    ]
    return {
        "slides": [str(path.name) for path in matching if path.suffix.lower() in {".pdf", ".ppt", ".pptx"}],
        "articles": [str(path.name) for path in matching if path.suffix.lower() in {".doc", ".docx", ".txt", ".md"}],
        "notes": [],
    }


def transcribe_file(model: "WhisperModel", media_path: Path) -> str:
    segments, _info = model.transcribe(str(media_path), language="en", vad_filter=True)
    return "\n".join(segment.text.strip() for segment in segments if segment.text.strip())


def build_manifest(input_dir: Path, output_dir: Path, model_name: str, limit: int | None) -> dict:
    from faster_whisper import WhisperModel

    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    lessons = []
    transcript_dir = output_dir / "transcripts"
    transcript_dir.mkdir(parents=True, exist_ok=True)

    for index, video_path in enumerate(discover_lessons(input_dir)[: limit or None], start=1):
        title = video_path.stem.replace("_", " ").strip()
        transcript_text = transcribe_file(model, video_path)
        transcript_name = f"{index:02d}-{slugify(title)}.txt"
        (transcript_dir / transcript_name).write_text(transcript_text, encoding="utf-8")

        support_assets = support_assets_for(video_path)
        lessons.append(
            {
                "id": f"lesson-{index:02d}-{slugify(title)}",
                "title": title,
                "sequenceNumber": index,
                "summary": "",
                "transcriptText": transcript_text,
                "principles": [],
                "drills": [],
                "applicationNotes": [],
                "topicTags": [],
                "assetPaths": {
                    "video": str(video_path.relative_to(input_dir)),
                    "slides": support_assets["slides"],
                    "articles": support_assets["articles"],
                    "notes": [],
                },
                "sourceRelativePath": str(video_path.relative_to(input_dir)),
                "durationSeconds": None,
            }
        )

    return {
        "courseId": "rande-howell-course",
        "courseTitle": "Rande Howell Course",
        "model": model_name,
        "inputDir": str(input_dir),
        "lessons": lessons,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Transcribe a local Rande course folder into a manifest.json file."
    )
    parser.add_argument("--input-dir", required=True, help="Path to the original course folder")
    parser.add_argument("--output-dir", required=True, help="Path to the ignored output folder")
    parser.add_argument("--model", default="small.en", help="faster-whisper model name")
    parser.add_argument("--limit", type=int, default=None, help="Optional lesson limit for pilot imports")
    args = parser.parse_args()

    input_dir = Path(args.input_dir).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest = build_manifest(input_dir, output_dir, args.model, args.limit)
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Wrote {len(manifest['lessons'])} lessons to {output_dir / 'manifest.json'}")


if __name__ == "__main__":
    main()
