# Compiler-design syllabus: implementation and evidence

This guide maps the 35 distinct topics in the supplied course screenshot to the actual Polyglot implementation. The repeated “Structure and Phases of a Compiler” entry is combined. Coverage labels describe the implemented mechanism and its stated limits; they are not a claim of full course completion.

Open **Coursework** in the IDE header. Select a module, then choose **Analyze current program**, **Record current VM run**, or the supplied example. Expand **Syllabus coverage** for the exact scope and **See the actual implementation** for source excerpts with repository paths and line numbers. Edited source remains protected by the existing replacement controls.

## Six demonstrations

| Module | Live evidence | Code to explain |
| --- | --- | --- |
| Lexical analysis | Token kind, exact lexeme, decoded value and source span | `compiler.compile_source`, `lexer.lex` |
| Syntax analysis | Actual Pratt binding powers and connected AST | `Parser.statement`, `Parser.suite`, `shared.expression` |
| Semantic analysis | Checked AST type/binding attributes, symbols and scopes | `Analyzer.compatible`, `Analyzer.attach`, `Analyzer.expr` |
| Intermediate code | Typed three-address expressions, labels, branches and bytecode target fixups | `Lowerer.expr`, `Lowerer.statement`, `codegen.generate` |
| Code analysis | Basic blocks, CFG edges, temporary liveness, natural-loop back edges and next use | `analysis.analyze_function`, `analysis.temp_access` |
| Code generation/runtime | Captured real VM frames, local bindings, temporaries and operand stacks | `codegen.generate`, `artifact.validate`, `vm.Frame`, `vm.run` |

## Module 1: Compilation & lexical analysis

Inspect the actual token stream: lexeme, token kind, decoded value and source position. Keywords are NAME tokens interpreted by the parser.

| Topic | Status | Implementation scope |
| --- | --- | --- |
| Introduction to LLVM | Not implemented | Polyglot uses its own typed IR and VM. It does not emit LLVM IR or call LLVM. |
| Structure and phases of a compiler | Implemented | The shared compile_source pipeline supplies the IDE and CLI with real stage results. |
| Patterns, lexemes, tokens and attributes | Implemented | Handwritten scanning emits kind, exact text, decoded value and source span. The operator list checks multi-character spellings before single characters. |
| Token specification and extended regular expressions | Partial | Token patterns can be described using regular expressions, but this implementation scans with explicit Python conditions rather than a regex specification engine. |
| Regular expression → DFA (direct method) | Not implemented | No syntax-tree nullable/firstpos/lastpos/followpos construction or generated DFA transition table is implemented. |
| Lex: lexical analyzer generator | Not implemented | The lexer is handwritten. No Lex/Flex specification or generated scanner is used. |

## Module 2: Syntax analysis

Statement parsing uses recursive descent and deterministic syntax-family dispatch. Expressions use Pratt binding powers; the AST represents semantic structure.

| Topic | Status | Implementation scope |
| --- | --- | --- |
| Role of parser and parse tree | Partial | The parser checks syntax and constructs an AST directly. The AST omits grammar-only nodes; a full derivation/parse tree is not built. |
| Elimination of ambiguity | Partial | Binding powers, left associativity and explicit block delimiters resolve supported constructs. General grammar rewriting or ambiguity elimination is not implemented. |
| Top-down / recursive descent parsing | Implemented | Parser.statement dispatches constructs; suites and expressions recursively build normalized nodes. |
| LL(1) grammars and shift-reduce parsers | Not implemented | No FIRST/FOLLOW sets, predictive LL(1) table or shift/reduce stack is generated. Recursive descent alone is not proof of an LL(1) grammar. |
| Operator precedence parsing | Partial | Pratt parsing implements precedence and associativity. It is not the classical operator-precedence relation-table parser. |
| LR and SLR parse tables | Not implemented | No LR(0) item automaton, FOLLOW-based SLR ACTION/GOTO tables or LR runtime is implemented. |
| CLR parsing | Not implemented | No canonical LR(1) item sets with lookahead are constructed. |
| LALR parsing | Not implemented | No LR(1) core merging or LALR ACTION/GOTO tables are implemented. |

## Module 3: Semantic analysis

Walk checked AST records to see synthesized types and inherited scope context. Bindings, storage slots and function signatures come from the shared analyzer.

| Topic | Status | Implementation scope |
| --- | --- | --- |
| Syntax-directed definitions | Partial | Node kinds drive procedural semantic rules and metadata attributes. There is no separate declarative attribute-grammar engine. |
| Evaluation order | Implemented | Recursive traversal checks children before computing expression types. Scope and expected return context are carried by Analyzer state; IR preserves language evaluation order. |
| Applications of syntax-directed translation | Implemented | AST kinds drive type checks, name binding and lowering to typed IR. |
| Syntax-directed translation schemes | Partial | The same idea is expressed through analyzer/lowerer methods, not semantic actions embedded in a formal grammar specification. |
| L-attributed syntax-directed definition | Partial | Inherited scope/expected-type context and synthesized node types can be demonstrated. A formally specified and validated L-attributed grammar evaluator is not implemented. |

## Module 4: Intermediate code generation

Follow normalized nodes into typed three-address operations and symbolic control flow. Compare labels with the numeric targets patched during bytecode generation.

| Topic | Status | Implementation scope |
| --- | --- | --- |
| Syntax-tree variants and three-address code | Partial | A shared AST and typed three-address IR are implemented. A common-subexpression DAG is not built. |
| Types and declarations | Implemented | Declarations receive checked types, scope bindings and global/local storage slots. |
| Procedures and assignment statements | Implemented | IR functions carry parameters, return types and temporaries; assignments lower to loads, moves and stores. |
| Translation of expressions and control flow | Implemented | Arithmetic becomes typed temporary operations; conditions and loops become BRANCH, LABEL and JUMP instructions. |
| Backpatching and switch-case statements | Partial | Code generation collects unresolved jump positions and patches them after labels are known. Switch-case syntax is not implemented; this is label fixup, not a full truelist/falselist SDT scheme. |

## Module 5: Code analysis & optimization

The coursework analysis computes actual basic blocks, a control-flow graph, temporary liveness and block-local next use. It does not rewrite or optimize the program.

| Topic | Status | Implementation scope |
| --- | --- | --- |
| Loop optimizations and sources of optimization | Not implemented | No loop-invariant code motion, strength reduction, unrolling or induction-variable elimination is performed. |
| Introduction to data-flow analysis | Implemented | A backward worklist solves temporary liveness: OUT is the union of successor IN sets; IN = USE ∪ (OUT − DEF). The domain is IR temporaries within one function. |
| Basic blocks and optimization of basic blocks | Partial | Leaders and terminators partition real IR into blocks. CFG predecessors/successors are computed; block optimization is not applied. |
| Peephole optimization and DAG representation | Not implemented | Neither peephole rewriting nor a basic-block common-subexpression DAG is implemented. |
| Loops in flow graphs and machine-independent optimization | Partial | Reachability and dominators identify natural-loop back edges. Optimization transformations are not applied; irreducible cycles need not have a natural-loop back edge. |
| Naive VM code generator and security checking | Implemented | The backend emits independent stack bytecode. Artifact validation checks operands, control-flow stack consistency and function signatures before execution. |

## Module 6: Code generation & runtime

Record a bounded prefix of an actual VM run. Step through captured states to inspect parameters, local slots, operand stacks and caller frames before each instruction.

| Topic | Status | Implementation scope |
| --- | --- | --- |
| Code-generator design and target machine | Implemented | The target is Polyglot's stack VM: typed IR temporaries become local slots and operations become stack instructions. |
| Next-use information | Implemented | A reverse scan computes the next textual use after an instruction inside its basic block. A value needed in a successor is marked live-out; no exact cross-branch next instruction is invented. |
| Register allocation and assignment | Not implemented | The target is a stack machine with local slots. No physical-register allocator or register assignment pass is implemented. |
| Runtime organization | Implemented | Each call has its own locals, instruction pointer and operand stack; globals are shared. Limits bound instructions, recursion, output and time. |
| Activation records | Implemented | CALL pushes a Frame with argument values in parameter slots; RETURN restores the caller and transfers a return value. Captured states expose this real behavior. |

## How the new data-flow analysis works

1. Identify leaders: the first IR instruction, every label, and instructions after a branch, jump, return or trap. Consecutive leader ranges form basic blocks.
2. Resolve symbolic labels to blocks. A conditional has true/false successors; a jump has its target; an ordinary block falls through. Returns and traps do not have a fallthrough edge.
3. Scan each block to compute USE (temporary reads before local definition) and DEF (temporary definitions).
4. Use a backward worklist to solve `OUT[B] = union(IN[S])` over successors and `IN[B] = USE[B] union (OUT[B] - DEF[B])` until no IN set changes. Re-enqueue affected predecessors.
5. Compute entry reachability and dominators. An edge from a reachable block to a block that dominates it is a natural-loop back edge. This does not claim to identify every irreducible cycle.
6. Scan each block backward for the next textual use after each instruction. A needed value whose next use lies outside the block is labeled `live-out`; a specific next instruction across branches is not invented.

The analysis domain is **IR temporaries within one function**. Reads/writes of global/local storage slots and interprocedural memory effects are not treated as liveness variables. The result is a teaching analysis and does not remove instructions, perform common-subexpression elimination or allocate physical registers. The executable artifact is unchanged.

Optional analysis is bounded to 12 functions, 1,500 instructions per function, 3,000 instructions in total, and 120 blocks per analyzed function. Oversized functions are explicitly omitted. The graph draws the first 24 blocks and reports the drawn/total count; block facts and the edge table remain available within the analysis limits.

CLI inspection uses the same analysis library:

```sh
python3 run_polyglot.py inspect examples/mixed_nesting.poly --analysis
```

## Activation-record demonstration

Load `activation_records.poly` from Module 6. It calculates `factorial(3)`, prints `6`, and records the entire 81-instruction execution. Select `#63 factorial · RETURN_VALUE`: the current frame has parameter `n = 1` and return value `1` on its operand stack. Advance once: that frame is gone, its caller becomes current, and the caller’s stack contains the returned value before STORE_LOCAL executes. This is captured from the real VM, not reconstructed from source.

Each snapshot describes the state **before** the selected instruction. Suspended callers show the instruction pointer at which they will resume. Local binding names/types are resolved only from the matching current compiler result; source-independent artifacts retain slot previews without invented source bindings.

A recording contains at most the first 120 instructions, at most eight recent frames, eight locals per frame, eight stack values per frame, eight global slots and eight items per array preview. Long strings and large integers have bounded previews. Omission counts and prefix truncation are explicit. Recording observes execution, never changes source or generated bytecode, and existing VM limits still apply (including time spent recording). Regular Run remains untraced unless recording is explicitly requested. A stopped run retains its available trace and actual partial output.

## Important project boundaries

- An AST is not a full grammar derivation tree.
- Recursive descent with Pratt expressions is not an LR/SLR/CLR/LALR implementation or a generated LL(1) table.
- Handwritten scanning is not a Lex/Flex-generated scanner or the direct regex-to-DFA construction.
- Scope context and synthesized type attributes demonstrate syntax-directed analysis, but do not constitute a formally specified L-attributed evaluator.
- Symbolic label patching exists; switch-case and a full truelist/falselist translation scheme do not.
- CFG/liveness/next-use analysis exists; optimization, DAG construction and physical register allocation remain unimplemented.
- Polyglot emits its own stack bytecode. [LLVM IR has its own documented representation](https://llvm.org/docs/LangRef.html); an LLVM backend is a separate extension.
- [Flex documents generated scanner matching rules](https://westes.github.io/flex/manual/Matching.html); the supplied lexer uses explicit scanning conditions and does not invoke Flex.
