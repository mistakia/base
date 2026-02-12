#!/usr/bin/env python3
"""
Transcription Service

Persistent HTTP microservice using faster-whisper for audio transcription.
Model loads once at startup and stays warm for fast subsequent requests.

Managed via PM2 alongside other Base services.

Usage:
    python3 transcription-service.py [--port 8089] [--model base.en] [--compute-type int8]

API:
    POST /transcribe
        - Accepts audio file as raw body with Content-Type header
        - Returns JSON: {"text": "transcribed text", "duration": 1.23, "audio_duration": 5.67}

    GET /health
        - Returns {"status": "ok", "model": "base.en"}
"""

import argparse
import json
import os
import socketserver
import sys
import tempfile
import time
from http.server import HTTPServer, BaseHTTPRequestHandler


try:
    from faster_whisper import WhisperModel
except ImportError:
    print("ERROR: faster-whisper not installed. Run: pip3 install faster-whisper", file=sys.stderr)
    sys.exit(1)


class TranscriptionHandler(BaseHTTPRequestHandler):
    """HTTP request handler for transcription requests."""

    timeout = 120  # Per-connection timeout in seconds

    def log_message(self, format, *args):
        """Override to use structured logging."""
        print(f"[transcription-service] {args[0]}", flush=True)

    def send_json(self, status, data):
        """Send a JSON response."""
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        """Handle GET requests (health check)."""
        if self.path == "/health":
            self.send_json(200, {
                "status": "ok",
                "model": self.server.model_name,
                "compute_type": self.server.compute_type
            })
        else:
            self.send_json(404, {"error": "Not found"})

    def do_POST(self):
        """Handle POST /transcribe requests."""
        if self.path != "/transcribe":
            self.send_json(404, {"error": "Not found"})
            return

        content_length = int(self.headers.get("Content-Length", 0))
        if content_length == 0:
            self.send_json(400, {"error": "No audio data provided"})
            return

        if content_length > 25 * 1024 * 1024:  # 25MB limit
            self.send_json(413, {"error": "File too large (max 25MB)"})
            return

        audio_data = self.rfile.read(content_length)

        content_type = self.headers.get("Content-Type", "")

        # Determine file suffix from content type
        suffix = ".wav"
        if "audio/mp4" in content_type or "audio/m4a" in content_type:
            suffix = ".m4a"
        elif "audio/webm" in content_type:
            suffix = ".webm"
        elif "audio/ogg" in content_type:
            suffix = ".ogg"

        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                tmp.write(audio_data)
                tmp_path = tmp.name

            start_time = time.time()
            segments, info = self.server.model.transcribe(tmp_path, beam_size=5)
            text = " ".join(seg.text.strip() for seg in segments)
            elapsed = time.time() - start_time

            print(
                f"[transcription-service] Transcribed {info.duration:.1f}s audio in {elapsed:.1f}s "
                f"(ratio: {elapsed/max(info.duration, 0.1):.2f}x, {len(text)} chars)",
                flush=True
            )

            self.send_json(200, {
                "text": text,
                "duration": round(elapsed, 2),
                "audio_duration": round(info.duration, 2)
            })
        except Exception as e:
            print(f"[transcription-service] Error: {e}", file=sys.stderr, flush=True)
            self.send_json(500, {"error": f"Transcription failed: {str(e)}"})
        finally:
            if tmp_path:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass


class TranscriptionServer(socketserver.ThreadingMixIn, HTTPServer):
    """Threaded HTTP server with whisper model attached."""

    daemon_threads = True

    def __init__(self, address, handler, model, model_name, compute_type):
        super().__init__(address, handler)
        self.model = model
        self.model_name = model_name
        self.compute_type = compute_type


def main():
    parser = argparse.ArgumentParser(description="Faster-whisper transcription service")
    parser.add_argument("--port", type=int, default=8089, help="Port to listen on (default: 8089)")
    parser.add_argument("--model", default="base.en", help="Whisper model name (default: base.en)")
    parser.add_argument("--compute-type", default="int8", help="Compute type (default: int8)")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind to (default: 127.0.0.1)")
    args = parser.parse_args()

    print(f"[transcription-service] Loading model '{args.model}' (compute_type={args.compute_type})...", flush=True)
    load_start = time.time()
    model = WhisperModel(args.model, device="cpu", compute_type=args.compute_type)
    load_elapsed = time.time() - load_start
    print(f"[transcription-service] Model loaded in {load_elapsed:.1f}s", flush=True)

    server = TranscriptionServer(
        (args.host, args.port),
        TranscriptionHandler,
        model,
        args.model,
        args.compute_type
    )

    print(f"[transcription-service] Listening on {args.host}:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[transcription-service] Shutting down", flush=True)
        server.shutdown()


if __name__ == "__main__":
    main()
