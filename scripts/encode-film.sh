#!/usr/bin/env bash
# Builds the homepage film's web assets from the untouched master.
#   scripts/encode-film.sh [path/to/master.mov]
# Output: public/media/film/{film-1080,film-720,film-540}.mp4 and poster JPEGs.
#
# Scroll scrubbing seeks constantly, in both directions, so every rendition uses
# short keyframe intervals (-g), no B-frames and +faststart. Audio is dropped.
set -euo pipefail

SRC="${1:-media/source/runway-commercial-original.mov}"
OUT="public/media/film"
mkdir -p "$OUT"

encode() { # name width crf gop
  ffmpeg -v error -y -i "$SRC" -an \
    -vf "fps=30,scale=$2:-2:flags=lanczos" \
    -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -crf "$3" \
    -g "$4" -keyint_min "$4" -sc_threshold 0 -bf 0 \
    -movflags +faststart "$OUT/$1.mp4"
}

encode film-1080 1920 25 8
encode film-720 1280 24 6
encode film-540 960 27 10

poster() { # name seconds width
  ffmpeg -v error -y -ss "$2" -i "$SRC" -frames:v 1 -vf "scale=$3:-2:flags=lanczos" -q:v 4 "$OUT/$1.jpg"
}
poster poster-start-1600 0 1600
poster poster-start-960 0 960
poster poster-reveal-1600 8.6 1600
poster poster-reveal-960 8.6 960

ls -l "$OUT"
