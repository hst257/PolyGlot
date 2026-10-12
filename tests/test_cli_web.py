from pathlib import Path
from polyglot.cli import main
from polyglot.web.worker import execute_job


def test_cli_build_exec_after_source_removed(tmp_path, capsys):
    source, artifact = tmp_path / "example.poly", tmp_path / "example.pbc"
    source.write_text('print("independent")\n')
    assert main(["build", str(source), "-o", str(artifact)]) == 0
    capsys.readouterr()
    source.unlink()
    assert main(["exec", str(artifact)]) == 0
    assert capsys.readouterr().out == "independent\n"


def test_cli_diagnostic_exit_code_and_streams(tmp_path, capsys):
    source = tmp_path / "bad.poly"
    source.write_text('print(undefined)\n')
    assert main(["run", str(source)]) == 3
    streams = capsys.readouterr()
    assert streams.out == ""
    assert "S003" in streams.err


def test_cli_stage_inspection(tmp_path, capsys):
    source = tmp_path / "good.poly"
    source.write_text('print(1)\n')
    assert main(["inspect", str(source), "--ir"]) == 0
    assert '"CONST"' in capsys.readouterr().out


def test_web_worker_uses_same_compiler_and_artifact():
    source = (Path(__file__).parents[1] / "examples" / "mixed_demo.poly").read_text()
    built = execute_job("build", {"source": source})
    assert built["ok"], built["diagnostics"]
    executed = execute_job("exec", {"artifact": built["artifact_text"]})
    assert executed["output"] == "0\n1\n3\n6\n12\ndone\n"
    assert set(built["stages"]) >= {"tokens", "recognition", "ast", "symbols", "ir", "bytecode"}
