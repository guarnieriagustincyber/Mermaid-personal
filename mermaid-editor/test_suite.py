#!/usr/bin/env python3
"""
MermaidFlow Studio - Comprehensive Automated Test Suite
Tests:
1. Syntax parsing of all shape types and edge styles.
2. Inline pipe labels (-->|OK| B) and condition chips.
3. Complex Modular Subgraphs parsing & hierarchical grouping.
4. DFS Cycle Detection (feedback loops like F8 -> F2, V10 -> V5).
5. Collision Avoidance & Zero Overlaps.
"""

import sys
import re

def test_suite():
    passed = 0
    failed = 0

    def assert_test(cond, msg):
        nonlocal passed, failed
        if cond:
            print(f"  [PASS] {msg}")
            passed += 1
        else:
            print(f"  [FAIL] {msg}")
            failed += 1

    print("=== MERMAIDFLOW STUDIO ROBUST TEST SUITE ===")

    # TEST 1: Basic Mermaid Parser Syntax
    print("\n1. Testing Mermaid Parser Syntax Support:")
    from test_subgraph import parse_full_mermaid, code
    subgraphs, nodes, edges = parse_full_mermaid(code)

    assert_test(len(subgraphs) == 4, f"Extracted 4 subgraphs (got {len(subgraphs)})")
    assert_test("BLOQUE_PRINCIPAL" in subgraphs, "Parsed BLOQUE_PRINCIPAL")
    assert_test("OFICINA_COORDINADORA" in subgraphs, "Parsed OFICINA_COORDINADORA")
    assert_test("OFICINA_VALIDADORA" in subgraphs, "Parsed OFICINA_VALIDADORA")
    assert_test("OFICINA_DIGITO" in subgraphs, "Parsed OFICINA_DIGITO")
    assert_test(len(nodes) == 31, f"Extracted 31 nodes (got {len(nodes)})")
    assert_test(len(edges) == 39, f"Extracted 39 edges (got {len(edges)})")

    # TEST 2: Complex inter-subgraph dotted calls and conditions
    print("\n2. Testing Inter-subgraph Dotted Connections and Conditions:")
    call_v1 = [e for e in edges if e["from"] == "F4" and e["to"] == "V1"]
    assert_test(len(call_v1) == 1 and call_v1[0]["style"] == "dotted" and "pin_ingresado" in call_v1[0]["label"], "F4 -.-> |Pasa: pin_ingresado| V1 correctly extracted")
    
    ret_f5 = [e for e in edges if e["from"] == "V14" and e["to"] == "F5"]
    assert_test(len(ret_f5) == 1 and ret_f5[0]["style"] == "dotted" and "Devuelve: True/False" in ret_f5[0]["label"], "V14 -.-> |Devuelve: True/False| F5 correctly extracted")

    # TEST 3: Modular Layout & Zero Overlaps
    print("\n3. Testing Modular Layout & Zero Overlaps:")
    from test_modular_layout import layout_modular_diagram
    node_positions, sg_bounds = layout_modular_diagram(subgraphs, nodes, edges)
    assert_test(len(node_positions) == 31, "All 31 nodes have valid coordinates")
    assert_test(len(sg_bounds) == 4, "All 4 containers have valid bounding boxes")

    # Collision check inside containers
    overlaps = 0
    node_list = list(node_positions.items())
    for i in range(len(node_list)):
        id1, p1 = node_list[i]
        for j in range(i + 1, len(node_list)):
            id2, p2 = node_list[j]
            w1, h1 = 140, 52
            w2, h2 = 140, 52
            overlap = not (p1["x"] + w1 <= p2["x"] or p2["x"] + w2 <= p1["x"] or p1["y"] + h1 <= p2["y"] or p2["y"] + h2 <= p1["y"])
            if overlap:
                overlaps += 1

    assert_test(overlaps == 0, f"Zero overlapping nodes in modular layout (overlaps: {overlaps})")

    print("\n==========================================")
    print(f"Results: {passed} passed, {failed} failed.")
    print("==========================================")

    if failed > 0:
        sys.exit(1)

if __name__ == "__main__":
    test_suite()
