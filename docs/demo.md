# Professor demonstration script

1. Start `python .\run_polyglot.py serve` and open `http://127.0.0.1:8765`. Explain that this runs offline and implements a new restricted language, not three external compilers.
2. Choose `mixed_demo.poly`. Point out a shared variable, typed `add`, annotated `twice`, range loop, Java output and C++ output. Run it; verify `0`, `1`, `3`, `6`, `12`, `done` on separate lines.
3. Inspect Recognition. Show distinctive `def`/output forms and shared C-family declarations. Explain that identical C++/Java syntax cannot reliably be attributed to just one language.
4. Inspect Tokens and AST. Show source spans and shared expression/function/output nodes. Inspect Symbols to show resolved bindings, types, scopes and slots.
5. Inspect IR. Show explicit temporary values, calls and branches. Inspect Bytecode to show actual generated stack instructions and function tables.
6. Click Build .pbc. Change the editor source, then Execute bytecode with the downloaded artifact. Show that its original output and mappings do not depend on the editor/source file.
7. Choose `mixed_nesting.poly` and run it; verify `22`. Point out the Python conditional inside a C-family loop. Choose `while_mixed.poly` to show braces inside a Python function.
8. Choose `error_type.poly` and run/check it. Explain the diagnostic and fixed shared type model; click the error to navigate to its location. No output or executable artifact is produced.
9. Optionally show `recursion.poly`, `negative_range.poly` or `short_circuit.poly`. Explain that full source-language compatibility and optimization are deferred.
10. Select `arrays_mixed.poly`. Show an inferred array, a C-style typed initializer, indexing inside a Python-style function and shared mutation. Run it; verify `15`, `7`, and `[1, 7, 3, 4] 4`. Inspect `int[]` symbols and array IR/bytecode. Try an index beyond the array length to demonstrate a mapped bounds diagnostic.
11. Select `array_iteration.poly`. The Java-style array declaration and Python-style `for num in arr:` loop form one program. Verify `1` through `5` on separate lines and inspect its `ForEach` AST and ordinary array/control-flow IR.
12. Select `p1_mixed.poly`. Demonstrate JavaScript const/let and an annotated function, Python array iteration, BASIC LET/PRINT, C printf, and Java/C++ output. Verify `total 8`, `formatted: 8, 2.500000, ready`, `BASIC output`, `8`, `done`. Inspect recognition and FORMAT/OUTPUT IR. Try reassigning the const binding using BASIC LET to show shared semantics. Clarify that BASIC labels/GOTO and unannotated functions remain deferred.

Before presenting, rehearse on the actual laptop without internet, verify Python availability and the full test suite, and retain a tested repository backup. No performance measurements have been claimed.


## Guided browser presentation

1. Open Programs → Project walkthrough → Six syntax families → Load & run demo. Explain that Polyglot implements a restricted shared language with several syntax families; it does not invoke six external compilers.
2. Use the pipeline ribbon to distinguish representation sizes from executed VM steps. The demo produces 110 tokens, 13 recognized constructs, 40 AST nodes, 7 bindings, 57 IR operations and 129 static bytecode instructions. Its successful run executes 194 instructions. These figures describe this exact bundled example, not performance benchmarks.
3. In Syntax map, compare the syntax, grammar rule and normalized AST node columns. Expand the phase disclosure to explain ambiguous C-style attribution and the shared parser pass.
4. Open AST and focus on a top-level construct. Expand its branches or the whole canvas. Explain why punctuation and grammar-only productions are absent from an abstract syntax tree. Use a node to select its source range.
5. Open Types & scopes, then Typed IR. Explain temporary names, typed operations and control-flow labels. Open `sum_values` to show array iteration lowered into ordinary operations. Select a source position to connect an instruction to the program.
6. Open Bytecode. Compare three-address operations to multiple stack instructions and their displayed effects. Open VM execution to show the actual run summary and output. Choose Check to demonstrate that compilation can succeed while the VM stays Not run.
7. Load Semantic error. Show that Lexer, Syntax map and AST remain available, Types & scopes stops with S004, and IR/bytecode/execution are blocked. Select the diagnostic in the failed-stage view to highlight the offending assignment.
8. Load Braces + indentation or Arrays + shared functions to answer follow-up questions with real examples. For independent artifact execution, use Build .pbc and Open bytecode; earlier source stages correctly become unavailable for an uploaded artifact.

Phase disclosures, Previous/Next and Raw JSON support explanation during a viva. The VM panel summarizes a completed or stopped run; it does not display a live execution trace. Optimization and multi-error recovery remain deferred.

## Presenting the course topics

Open **Coursework** and follow [the syllabus guide](syllabus.md). Module 5 demonstrates real basic blocks, control-flow edges, liveness equations and next-use facts; use its example or analyze your current valid program. Module 6 loads `activation_records.poly` and records a complete factorial(3) run. Jump to its first RETURN_VALUE, then advance once to show the activation record being removed and the value returning to its caller. The coverage rows and actual-source disclosures explain which syllabus algorithms exist and which are future extensions.
