import json
import threading
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer
from pathlib import Path
import pytest
from polyglot.web.server import Handler, EXAMPLES

pytestmark = pytest.mark.network


@pytest.fixture
def server():
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield httpd
    httpd.shutdown()
    httpd.server_close()
    thread.join(timeout=2)


def request(server, path, data=None, headers=None):
    payload = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(f"http://127.0.0.1:{server.server_port}{path}", payload,
                                 {"Content-Type": "application/json", **(headers or {})})
    with urllib.request.urlopen(req, timeout=15) as response:
        return response.read()


@pytest.mark.parametrize("operation", ["run", "check", "build", "inspect"])
def test_real_http_pipeline(server, operation):
    result = json.loads(request(server, "/api/" + operation, {"source": EXAMPLES["mixed_demo.poly"]}))
    assert result["ok"], result.get("diagnostics")
    assert set(result["stages"]) >= {"tokens", "recognition", "ast", "symbols", "ir", "bytecode"}
    if operation == "run":
        assert result["output"] == "0\n1\n3\n6\n12\ndone\n"
    if operation == "build":
        artifact_result = json.loads(request(server, "/api/exec", {"artifact": result["artifact_text"]}))
        assert artifact_result["output"] == "0\n1\n3\n6\n12\ndone\n"


def test_static_assets_and_local_only_requests(server):
    assert b"Polyglot" in request(server, "/")
    assert b"action" in request(server, "/app.js")
    with pytest.raises(urllib.error.HTTPError) as error:
        request(server, "/api/run", {"source": "print(1)"}, {"Origin": "https://example.com"})
    assert error.value.code == 403
    with pytest.raises(urllib.error.HTTPError) as error:
        request(server, "/../AGENTS.md")
    assert error.value.code == 404


def test_bounded_execution_diagnostics_and_recovery(server):
    result = json.loads(request(server, "/api/run", {"source": "while True:\n    print(1)\n", "limits": {"steps": 30}}))
    assert not result["ok"]
    assert result["diagnostics"][0]["code"] == "R001"
    result = json.loads(request(server, "/api/run", {"source": "print(2)\n"}))
    assert result["output"] == "2\n"
    result = json.loads(request(server, "/api/run", {"source": "x = 1\nx = \"bad\"\n"}))
    assert not result["ok"] and result["artifact"] is None


def test_worker_wall_timeout_keeps_server_usable(server):
    server.worker_timeout = 0.00001
    result = json.loads(request(server, "/api/run", {"source": "print(1)\n"}))
    assert result["diagnostics"][0]["code"] == "R002"
    server.worker_timeout = 8
    assert json.loads(request(server, "/api/run", {"source": "print(2)\n"}))["output"] == "2\n"


def test_array_build_execute_and_bounds_over_real_http(server):
    built = json.loads(request(server, "/api/build", {"source": EXAMPLES["arrays_mixed.poly"]}))
    assert built["ok"], built.get("diagnostics")
    assert built["artifact"]["version"] == 3
    result = json.loads(request(server, "/api/exec", {"artifact": built["artifact_text"]}))
    assert result["output"] == '15\n7\n[1, 7, 3, 4] 4\n'
    result = json.loads(request(server, "/api/run", {"source": 'values = [1]\nprint(values[1])\n'}))
    assert not result["ok"]
    assert result["diagnostics"][0]["code"] == 'R012'


def test_cross_syntax_array_iteration_through_http(server):
    built = json.loads(request(server, "/api/build", {"source": EXAMPLES["array_iteration.poly"]}))
    assert built["ok"], built.get("diagnostics")
    result = json.loads(request(server, "/api/exec", {"artifact": built["artifact_text"]}))
    assert result["output"] == '1\n2\n3\n4\n5\n'
    ast_nodes = built["stages"]["ast"]["data"]["body"]
    assert any(node["kind"] == 'ForEach' for node in ast_nodes)


def test_p1_mixed_syntax_and_const_failure_through_http(server):
    built = json.loads(request(server, "/api/build", {"source": EXAMPLES["p1_mixed.poly"]}))
    assert built["ok"], built.get("diagnostics")
    assert built["artifact"]["version"] == 3
    result = json.loads(request(server, "/api/exec", {"artifact": built["artifact_text"]}))
    assert result["output"] == 'total 8\nformatted: 8, 2.500000, ready\nBASIC output\n8\ndone\n'
    invalid = json.loads(request(server, "/api/run", {"source": 'const x = 1;\nLET x = 2\n'}))
    assert not invalid["ok"] and invalid["artifact"] is None
    assert invalid["diagnostics"][0]["code"] == 'S028'


def test_real_optimizer_and_removed_coursework_routes(server):
    source = 'print((2 + 3) * 4)\n'
    optimized = json.loads(request(server, '/api/run', {'source': source}))
    plain = json.loads(request(server, '/api/run', {'source': source, 'optimize': False}))
    assert optimized['output'] == plain['output'] == '20\n'
    assert optimized['steps'] == 5 and plain['steps'] == 17
    assert optimized['stages']['optimization']['enabled']
    assert not plain['stages']['optimization']['enabled']
    assert b'coursework-open' not in request(server, '/')
    for path in ('/api/syllabus', '/coursework.js'):
        with pytest.raises(urllib.error.HTTPError) as error:
            request(server, path)
        assert error.value.code == 404
