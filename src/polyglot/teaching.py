"""Syllabus coverage and whitelisted source evidence for the offline coursework UI."""

import inspect
from pathlib import Path
from .compiler import compile_source
from .lexer import lex
from .parser.dispatch import Parser
from .parser.shared import expression, PRECEDENCE
from .semantics import Analyzer
from .ir import Lowerer
from .codegen import generate
from .artifact import validate
from .vm import Frame, run
from .analysis import analyze_function, temp_access


def topic(title: str, status: str, detail: str) -> dict:
    return {"title": title, "status": status, "detail": detail}


MODULES = [
    {"id": "lexical", "title": "Compilation & lexical analysis", "stage": "tokens", "example": "p1_mixed.poly",
     "summary": "Inspect the actual token stream: lexeme, token kind, decoded value and source position. Keywords are NAME tokens interpreted by the parser.",
     "evidence": ["pipeline", "lexer"], "topics": [
         topic("Introduction to LLVM", "missing", "Polyglot uses its own typed IR and VM. It does not emit LLVM IR or call LLVM."),
         topic("Structure and phases of a compiler", "implemented", "The shared compile_source pipeline supplies the IDE and CLI with real stage results."),
         topic("Patterns, lexemes, tokens and attributes", "implemented", "Handwritten scanning emits kind, exact text, decoded value and source span. The operator list checks multi-character spellings before single characters."),
         topic("Token specification and extended regular expressions", "partial", "Token patterns can be described using regular expressions, but this implementation scans with explicit Python conditions rather than a regex specification engine."),
         topic("Regular expression → DFA (direct method)", "missing", "No syntax-tree nullable/firstpos/lastpos/followpos construction or generated DFA transition table is implemented."),
         topic("Lex: lexical analyzer generator", "missing", "The lexer is handwritten. No Lex/Flex specification or generated scanner is used.")
     ]},
    {"id": "syntax", "title": "Syntax analysis", "stage": "ast", "example": "mixed_nesting.poly",
     "summary": "Statement parsing uses recursive descent and deterministic syntax-family dispatch. Expressions use Pratt binding powers; the AST represents semantic structure.",
     "evidence": ["dispatch", "expression", "suite"], "topics": [
         topic("Role of parser and parse tree", "partial", "The parser checks syntax and constructs an AST directly. The AST omits grammar-only nodes; a full derivation/parse tree is not built."),
         topic("Elimination of ambiguity", "partial", "Binding powers, left associativity and explicit block delimiters resolve supported constructs. General grammar rewriting or ambiguity elimination is not implemented."),
         topic("Top-down / recursive descent parsing", "implemented", "Parser.statement dispatches constructs; suites and expressions recursively build normalized nodes."),
         topic("LL(1) grammars and shift-reduce parsers", "missing", "No FIRST/FOLLOW sets, predictive LL(1) table or shift/reduce stack is generated. Recursive descent alone is not proof of an LL(1) grammar."),
         topic("Operator precedence parsing", "partial", "Pratt parsing implements precedence and associativity. It is not the classical operator-precedence relation-table parser."),
         topic("LR and SLR parse tables", "missing", "No LR(0) item automaton, FOLLOW-based SLR ACTION/GOTO tables or LR runtime is implemented."),
         topic("CLR parsing", "missing", "No canonical LR(1) item sets with lookahead are constructed."),
         topic("LALR parsing", "missing", "No LR(1) core merging or LALR ACTION/GOTO tables are implemented.")
     ]},
    {"id": "semantics", "title": "Semantic analysis", "stage": "symbols", "example": "arrays_mixed.poly",
     "summary": "Walk checked AST records to see synthesized types and inherited scope context. Bindings, storage slots and function signatures come from the shared analyzer.",
     "evidence": ["types", "attributes", "expression-types"], "topics": [
         topic("Syntax-directed definitions", "partial", "Node kinds drive procedural semantic rules and metadata attributes. There is no separate declarative attribute-grammar engine."),
         topic("Evaluation order", "implemented", "Recursive traversal checks children before computing expression types. Scope and expected return context are carried by Analyzer state; IR preserves language evaluation order."),
         topic("Applications of syntax-directed translation", "implemented", "AST kinds drive type checks, name binding and lowering to typed IR."),
         topic("Syntax-directed translation schemes", "partial", "The same idea is expressed through analyzer/lowerer methods, not semantic actions embedded in a formal grammar specification."),
         topic("L-attributed syntax-directed definition", "partial", "Inherited scope/expected-type context and synthesized node types can be demonstrated. A formally specified and validated L-attributed grammar evaluator is not implemented.")
     ]},
    {"id": "intermediate", "title": "Intermediate code generation", "stage": "ir", "example": "mixed_nesting.poly",
     "summary": "Follow normalized nodes into typed three-address operations and symbolic control flow. Compare labels with the numeric targets patched during bytecode generation.",
     "evidence": ["lowering", "statements", "codegen"], "topics": [
         topic("Syntax-tree variants and three-address code", "partial", "A shared AST and typed three-address IR are implemented. A common-subexpression DAG is not built."),
         topic("Types and declarations", "implemented", "Declarations receive checked types, scope bindings and global/local storage slots."),
         topic("Procedures and assignment statements", "implemented", "IR functions carry parameters, return types and temporaries; assignments lower to loads, moves and stores."),
         topic("Translation of expressions and control flow", "implemented", "Arithmetic becomes typed temporary operations; conditions and loops become BRANCH, LABEL and JUMP instructions."),
         topic("Backpatching and switch-case statements", "partial", "Code generation collects unresolved jump positions and patches them after labels are known. Switch-case syntax is not implemented; this is label fixup, not a full truelist/falselist SDT scheme.")
     ]},
    {"id": "optimization", "title": "Code analysis & optimization", "stage": "ir", "example": "mixed_nesting.poly",
     "summary": "The coursework analysis computes actual basic blocks, a control-flow graph, temporary liveness and block-local next use. It does not rewrite or optimize the program.",
     "evidence": ["analysis", "temp-access"], "topics": [
         topic("Loop optimizations and sources of optimization", "missing", "No loop-invariant code motion, strength reduction, unrolling or induction-variable elimination is performed."),
         topic("Introduction to data-flow analysis", "implemented", "A backward worklist solves temporary liveness: OUT is the union of successor IN sets; IN = USE ∪ (OUT − DEF). The domain is IR temporaries within one function."),
         topic("Basic blocks and optimization of basic blocks", "partial", "Leaders and terminators partition real IR into blocks. CFG predecessors/successors are computed; block optimization is not applied."),
         topic("Peephole optimization and DAG representation", "missing", "Neither peephole rewriting nor a basic-block common-subexpression DAG is implemented."),
         topic("Loops in flow graphs and machine-independent optimization", "partial", "Reachability and dominators identify natural-loop back edges. Optimization transformations are not applied; irreducible cycles need not have a natural-loop back edge."),
         topic("Naive VM code generator and security checking", "implemented", "The backend emits independent stack bytecode. Artifact validation checks operands, control-flow stack consistency and function signatures before execution.")
     ]},
    {"id": "generation", "title": "Code generation & runtime", "stage": "execution", "example": "activation_records.poly",
     "summary": "Record a bounded prefix of an actual VM run. Step through captured states to inspect parameters, local slots, operand stacks and caller frames before each instruction.",
     "evidence": ["codegen", "validation", "frame", "runtime"], "topics": [
         topic("Code-generator design and target machine", "implemented", "The target is Polyglot's stack VM: typed IR temporaries become local slots and operations become stack instructions."),
         topic("Next-use information", "implemented", "A reverse scan computes the next textual use after an instruction inside its basic block. A value needed in a successor is marked live-out; no exact cross-branch next instruction is invented."),
         topic("Register allocation and assignment", "missing", "The target is a stack machine with local slots. No physical-register allocator or register assignment pass is implemented."),
         topic("Runtime organization", "implemented", "Each call has its own locals, instruction pointer and operand stack; globals are shared. Limits bound instructions, recursion, output and time."),
         topic("Activation records", "implemented", "CALL pushes a Frame with argument values in parameter slots; RETURN restores the caller and transfers a return value. Captured states expose this real behavior.")
     ]}
]

SOURCES = {
    "pipeline": compile_source, "lexer": lex, "dispatch": Parser.statement, "expression": expression, "suite": Parser.suite,
    "types": Analyzer.compatible, "attributes": Analyzer.attach, "expression-types": Analyzer.expr,
    "lowering": Lowerer.expr, "statements": Lowerer.statement, "codegen": generate,
    "analysis": analyze_function, "temp-access": temp_access, "validation": validate, "frame": Frame, "runtime": run,
}


def syllabus() -> dict:
    root = Path(__file__).parent
    sources = {}
    for key, obj in SOURCES.items():
        lines, start = inspect.getsourcelines(obj)
        relative = Path(inspect.getsourcefile(obj)).relative_to(root)
        sources[key] = {"file": "src/polyglot/" + str(relative), "line": start,
                        "code": "".join(lines), "name": obj.__qualname__}
    return {"modules": MODULES, "sources": sources, "precedence": PRECEDENCE,
            "note": "Coverage describes this implementation, not the complete course. Analysis is optional; execution semantics are unchanged."}
