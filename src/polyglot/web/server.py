"""Loopback-only server with isolated, time-bounded compiler workers."""

import argparse
import json
import multiprocessing
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from .worker import worker

STATIC = Path(__file__).parent / "static"
EXAMPLES = json.loads((STATIC / "examples.json").read_text(encoding="utf-8"))


class Handler(BaseHTTPRequestHandler):
    def send_bytes(self, status, content, mime):
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(content)

    def json(self, status, value):
        self.send_bytes(status, json.dumps(value, ensure_ascii=False).encode(), "application/json; charset=utf-8")

    def allowed_host(self):
        return self.headers.get("Host") == f"127.0.0.1:{self.server.server_port}" or self.headers.get("Host") == f"localhost:{self.server.server_port}"

    def do_GET(self):
        if not self.allowed_host():
            return self.json(403, {"error": "Use the local IDE address."})
        if self.path == "/api/examples":
            return self.json(200, EXAMPLES)
        files = {"/": ("index.html", "text/html"), "/app.js": ("app.js", "text/javascript"), "/style.css": ("style.css", "text/css")}
        if self.path not in files:
            return self.json(404, {"error": "Not found"})
        name, mime = files[self.path]
        self.send_bytes(200, (STATIC / name).read_bytes(), mime + "; charset=utf-8")

    def do_POST(self):
        if not self.allowed_host():
            return self.json(403, {"error": "Invalid local host."})
        origin = self.headers.get("Origin")
        if origin and origin not in (f"http://127.0.0.1:{self.server.server_port}", f"http://localhost:{self.server.server_port}"):
            return self.json(403, {"error": "Cross-origin execution is disabled."})
        operation = self.path.removeprefix("/api/")
        if self.path != "/api/" + operation or operation not in ("check", "run", "build", "exec", "inspect"):
            return self.json(404, {"error": "Unknown operation."})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 6_000_000:
                return self.json(413, {"error": "Request exceeds the size limit."})
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("Request must be an object.")
        except (ValueError, UnicodeError):
            return self.json(400, {"error": "Invalid JSON request."})
        context = multiprocessing.get_context("spawn")
        parent, child = context.Pipe(duplex=False)
        process = context.Process(target=worker, args=(child, operation, payload), daemon=True)
        process.start()
        child.close()
        try:
            if parent.poll(getattr(self.server, "worker_timeout", 8.0)):
                try:
                    result = parent.recv()
                except EOFError:
                    result = {"ok": False, "diagnostics": [{"code": "C999", "message": "Compiler worker stopped unexpectedly.",
                              "location": {"filename": "program.poly", "line": 1, "column": 1}}]}
                self.json(200, result)
            else:
                self.json(200, {"ok": False, "output": "", "stages": {}, "diagnostics": [{"code": "R002", "message": "Worker timeout exceeded.",
                          "location": {"filename": payload.get("filename", "program.poly"), "line": 1, "column": 1}}]})
        finally:
            if process.is_alive():
                process.terminate()
            process.join(timeout=1)
            parent.close()


def serve(port=8765, worker_timeout=8.0):
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.worker_timeout = worker_timeout
    print(f"Polyglot IDE: http://127.0.0.1:{server.server_port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--worker-timeout", type=float, default=8.0)
    args = parser.parse_args()
    if not 0 < args.worker_timeout <= 60:
        parser.error("Worker timeout must be between 0 and 60 seconds.")
    serve(args.port, args.worker_timeout)
