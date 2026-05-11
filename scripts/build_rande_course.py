from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from faster_whisper import WhisperModel

VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".mp3", ".m4a", ".wav"}
SUPPORT_EXTENSIONS = {".pdf", ".ppt", ".pptx", ".doc", ".docx", ".txt", ".md"}


def slugify(value: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return value or "lesson"


def derive_lesson_title(video_path: Path) -> str:
    return video_path.stem.replace("_", " ").strip()


def stem_tokens(value: str) -> list[str]:
    return [token for token in re.split(r"[^a-z0-9]+", value.lower()) if token]


def support_asset_matches(video_stem: str, asset_stem: str) -> bool:
    video_tokens = stem_tokens(video_stem)
    asset_tokens = stem_tokens(asset_stem)
    return bool(video_tokens) and asset_tokens[: len(video_tokens)] == video_tokens


def build_lesson_id(video_path: Path, input_dir: Path) -> str:
    source_identity = video_path.relative_to(input_dir).with_suffix("").as_posix()
    return f"lesson-{slugify(source_identity)}"


def discover_lessons(input_dir: Path) -> list[Path]:
    return sorted(
        [path for path in input_dir.rglob("*") if path.suffix.lower() in VIDEO_EXTENSIONS],
        key=lambda path: path.relative_to(input_dir).as_posix().lower(),
    )


def normalize_selected_lessons(
    input_dir: Path,
    selected_lessons: list[str] | None,
) -> set[str] | None:
    if not selected_lessons:
        return None

    normalized: set[str] = set()
    for lesson in selected_lessons:
        relative_path = str(lesson or "").strip().replace("\\", "/")
        if not relative_path:
            continue

        if relative_path.startswith("/"):
            relative_path = str(Path(relative_path).resolve().relative_to(input_dir)).replace("\\", "/")

        normalized.add(relative_path)

    return normalized or None


def select_lessons(
    input_dir: Path,
    limit: int | None,
    selected_lessons: list[str] | None,
) -> list[Path]:
    discovered_lessons = discover_lessons(input_dir)
    normalized_selected_lessons = normalize_selected_lessons(input_dir, selected_lessons)

    if normalized_selected_lessons is not None:
        discovered_lessons = [
            lesson
            for lesson in discovered_lessons
            if lesson.relative_to(input_dir).as_posix() in normalized_selected_lessons
        ]

    return discovered_lessons[: limit or None]


def support_assets_for(video_path: Path, input_dir: Path) -> dict[str, list[str]]:
    stem = video_path.stem
    parent = video_path.parent
    matching = [
        path
        for path in parent.iterdir()
        if path.suffix.lower() in SUPPORT_EXTENSIONS and support_asset_matches(stem, path.stem)
    ]
    return {
        "slides": [
            str(path.relative_to(input_dir))
            for path in matching
            if path.suffix.lower() in {".pdf", ".ppt", ".pptx"}
        ],
        "articles": [
            str(path.relative_to(input_dir))
            for path in matching
            if path.suffix.lower() in {".doc", ".docx", ".txt", ".md"}
        ],
        "notes": [],
    }


def transcribe_file(model: "WhisperModel", media_path: Path) -> str:
    segments, _info = model.transcribe(str(media_path), language="en", vad_filter=True)
    return "\n".join(segment.text.strip() for segment in segments if segment.text.strip())


def build_manifest(
    input_dir: Path,
    output_dir: Path,
    model_name: str,
    limit: int | None,
    selected_lessons: list[str] | None = None,
) -> dict:
    from faster_whisper import WhisperModel

    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    lessons = []
    transcript_dir = output_dir / "transcripts"
    transcript_dir.mkdir(parents=True, exist_ok=True)

    for index, video_path in enumerate(
        select_lessons(input_dir, limit, selected_lessons),
        start=1,
    ):
        title = derive_lesson_title(video_path)
        transcript_text = transcribe_file(model, video_path)
        transcript_name = f"{index:02d}-{slugify(title)}.txt"
        lesson_id = build_lesson_id(video_path, input_dir)
        (transcript_dir / transcript_name).write_text(transcript_text, encoding="utf-8")

        support_assets = support_assets_for(video_path, input_dir)
        lessons.append(
            {
                "id": lesson_id,
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
    parser.add_argument(
        "--selected-lessons-file",
        default=None,
        help="Optional JSON file containing source-relative lesson paths to import.",
    )
    args = parser.parse_args()

    input_dir = Path(args.input_dir).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    selected_lessons = None

    if args.selected_lessons_file:
        selected_lessons_payload = json.loads(
            Path(args.selected_lessons_file).expanduser().resolve().read_text(encoding="utf-8")
        )
        if not isinstance(selected_lessons_payload, list):
            raise ValueError("--selected-lessons-file must contain a JSON array of source-relative paths")
        selected_lessons = [str(item) for item in selected_lessons_payload]

    manifest = build_manifest(input_dir, output_dir, args.model, args.limit, selected_lessons)
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Wrote {len(manifest['lessons'])} lessons to {output_dir / 'manifest.json'}")


if __name__ == "__main__":
    main()
