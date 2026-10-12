from copy import deepcopy
import json
import pytest
from polyglot.compiler import compile_source
from polyglot.artifact import loads, dumps, validate, ArtifactError


@pytest.fixture
def artifact():
    return compile_source('x = 3\nprint(x)\n')["artifact"]


@pytest.mark.parametrize("mutate", [
    lambda a: a.update(version=99),
    lambda a: a.update(entry=-1),
    lambda a: a.update(global_count=True),
    lambda a: a["constants"][0].update(type="bool"),
    lambda a: a["functions"][0]["code"][0].update(op="HOST_EXEC"),
    lambda a: a["functions"][0]["code"][0].update(args=[999999]),
    lambda a: a["functions"][0]["code"][0].update(source={}),
    lambda a: a["functions"][0]["code"].insert(0, {"op": "POP", "args": [], "source": a["functions"][0]["code"][0]["source"]}),
    lambda a: a["functions"][0]["code"][0].update(op="JUMP", args=[9999]),
])
def test_invalid_artifacts_rejected(artifact, mutate):
    mutate(artifact)
    with pytest.raises(ArtifactError):
        loads(json.dumps(artifact))


def test_duplicate_keys_and_nonfinite_constants_rejected(artifact):
    with pytest.raises(ArtifactError):
        loads('{"version":1,"version":2}')
    artifact["constants"][0] = {"type": "float", "value": float("inf")}
    with pytest.raises(ArtifactError):
        validate(artifact)


def test_roundtrip_is_independent_of_ast_and_source(artifact):
    from polyglot.vm import run
    assert run(loads(dumps(deepcopy(artifact))))["output"] == "3\n"
