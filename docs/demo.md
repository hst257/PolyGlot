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

Before October 19: rehearse on the actual laptop without internet; verify Python availability and the full test suite; retain a tested repository backup. No performance measurements have been claimed.
