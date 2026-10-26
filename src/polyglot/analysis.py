"""Optional teaching analyses over real typed IR; never rewrites executable code."""

from collections import deque

TEMP_FIELDS = {
    "STORE": ("value",), "MOVE": ("value",), "UNARY": ("value",),
    "WIDEN": ("value",), "FORMAT": ("value",), "BINARY": ("left", "right"),
    "ARRAY_NEW": ("size",), "ARRAY_GET": ("array", "index"),
    "ARRAY_SET": ("array", "index", "value"), "ARRAY_CHECK": ("array", "index"),
    "ARRAY_LENGTH": ("array",), "ARRAY_SIZE_CHECK": ("array", "size"),
    "BRANCH": ("condition",), "RETURN_VALUE": ("value",), "ASSERT": ("condition",),
}
TERMINATORS = {"JUMP", "BRANCH", "RETURN_VALUE", "RETURN_VOID", "TRAP"}


def temp_access(instruction: dict) -> tuple[set[int], set[int]]:
    uses = {instruction[key] for key in TEMP_FIELDS.get(instruction["op"], ())}
    if instruction["op"] in ("CALL", "OUTPUT", "ARRAY_BUILD"):
        uses.update(instruction["args"])
    dest = instruction.get("dest")
    return uses, {dest} if dest is not None else set()


def analyze_function(fn: dict) -> dict:
    code = fn["instructions"]
    labels = {i["label"]: n for n, i in enumerate(code) if i["op"] == "LABEL"}
    # 1. Partition the real instruction stream at leaders and terminators.
    leaders = {0, *labels.values()}
    for n, instruction in enumerate(code[:-1]):
        if instruction["op"] in TERMINATORS:
            leaders.add(n + 1)
    starts = sorted(leaders)
    if len(starts) > 120:
        return {"id": fn["id"], "name": fn["name"], "omitted": "More than 120 basic blocks."}
    blocks, owners = [], {}
    for bid, start in enumerate(starts):
        end = starts[bid + 1] if bid + 1 < len(starts) else len(code)
        for n in range(start, end):
            owners[n] = bid
        blocks.append({"id": bid, "start": start, "end": end, "successors": [], "predecessors": []})
    # 2. Resolve symbolic targets and retain the kind of each control-flow edge.
    edges = []
    for block in blocks:
        last = code[block["end"] - 1]
        targets = []
        if last["op"] == "BRANCH":
            targets = [(owners[labels[last[key]]], key) for key in ("true", "false")]
        elif last["op"] == "JUMP":
            targets = [(owners[labels[last["target"]]], "jump")]
        elif last["op"] not in TERMINATORS and block["id"] + 1 < len(blocks):
            targets = [(block["id"] + 1, "fallthrough")]
        for target, kind in targets:
            edges.append({"from": block["id"], "to": target, "kind": kind})
            if target not in block["successors"]:
                block["successors"].append(target)
                blocks[target]["predecessors"].append(block["id"])
    # 3. A block uses a temporary only if it reads it before a local definition.
    uses, defs, live_in, live_out = [], [], [], []
    for block in blocks:
        used, defined = set(), set()
        for instruction in code[block["start"]:block["end"]]:
            read, written = temp_access(instruction)
            used.update(read - defined)
            defined.update(written)
        uses.append(used)
        defs.append(defined)
        live_in.append(set())
        live_out.append(set())
    # 4. Solve backwards to a fixed point; only affected predecessors need revisiting.
    pending = deque(reversed(range(len(blocks))))
    queued = set(range(len(blocks)))
    updates = 0
    while pending:
        bid = pending.popleft()
        queued.remove(bid)
        updates += 1
        outgoing = set().union(*(live_in[s] for s in blocks[bid]["successors"]))
        incoming = uses[bid] | (outgoing - defs[bid])
        live_out[bid] = outgoing
        if incoming != live_in[bid]:
            live_in[bid] = incoming
            for predecessor in blocks[bid]["predecessors"]:
                if predecessor not in queued:
                    pending.append(predecessor)
                    queued.add(predecessor)
    # 5. A natural-loop back edge targets a dominator of its source.
    reachable, pending = set(), [0]
    while pending:
        bid = pending.pop()
        if bid in reachable:
            continue
        reachable.add(bid)
        pending.extend(blocks[bid]["successors"])
    dom = {bid: ({0} if bid == 0 else set(reachable)) for bid in reachable}
    changed = True
    while changed:
        changed = False
        for bid in sorted(reachable - {0}):
            parents = [dom[p] for p in blocks[bid]["predecessors"] if p in reachable]
            value = {bid} | set.intersection(*parents)
            if value != dom[bid]:
                dom[bid] = value
                changed = True
    back_edges = [edge for edge in edges if edge["from"] in reachable and edge["to"] in dom[edge["from"]]]
    # 6. Reverse-scan next use within each block. Cross-block need is live-out only.
    for block in blocks:
        bid = block["id"]
        block.update({"use": sorted(uses[bid]), "def": sorted(defs[bid]), "live_in": sorted(live_in[bid]),
                      "live_out": sorted(live_out[bid]), "reachable": bid in reachable, "rows": []})
        next_use = {}
        for n in reversed(range(block["start"], block["end"])):
            read, written = temp_access(code[n])
            block["rows"].append({"index": n, "uses": sorted(read), "defs": sorted(written),
                                  "next": [{"temp": temp, "at": next_use.get(temp), "live_out": temp in live_out[bid]}
                                           for temp in sorted(read | written)]})
            for temp in written:
                next_use.pop(temp, None)
            for temp in read:
                next_use[temp] = n
        block["rows"].reverse()
    return {"id": fn["id"], "name": fn["name"], "blocks": blocks, "edges": edges,
            "back_edges": back_edges, "worklist_visits": updates}


def analyze_ir(functions: list[dict]) -> dict:
    """Keep optional analysis bounded independently of compiler/execution limits."""
    results, budget = [], 3000
    for index, fn in enumerate(functions):
        size = len(fn["instructions"])
        if index >= 12 or size > 1500 or size > budget:
            results.append({"id": fn["id"], "name": fn["name"], "omitted": "Teaching analysis limit reached; compiled code is unchanged."})
            continue
        results.append(analyze_function(fn))
        budget -= size
    return {"functions": results, "domain": "IR temporaries only; storage slots and interprocedural effects are not liveness variables.",
            "equations": ["OUT[B] = union(IN[S]) for successors S", "IN[B] = USE[B] union (OUT[B] - DEF[B])"],
            "note": "Analysis only. No optimization or register allocation is applied."}
