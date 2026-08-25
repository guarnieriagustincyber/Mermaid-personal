#!/usr/bin/env python3
"""
MermaidFlow Studio - Rigorous Performance, Layout & Parser Test Suite v2
"""

import re
import math

class TestResult:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []

    def assert_true(self, condition, msg):
        if condition:
            self.passed += 1
            print(f"  [PASS] {msg}")
        else:
            self.failed += 1
            self.errors.append(msg)
            print(f"  [FAIL] {msg}")

def parse_mermaid_robust(code):
    lines = code.split('\n')
    direction = 'TD'
    nodes = {}
    edges = []

    def clean_str(s):
        if not s: return ''
        return s.strip().strip('"\'').replace('<br/>', '\n').replace('<br>', '\n').strip()

    # Step 1: Detect Direction
    for line in lines:
        l = line.strip()
        dir_m = re.match(r'^(?:flowchart|graph)\s+(TD|TB|LR|BT|RL)', l, re.IGNORECASE)
        if dir_m:
            d = dir_m.group(1).upper()
            direction = 'TD' if d == 'TB' else d
            break

    # Helper to parse any node with shape: returns (id, shape, label, remaining_line)
    # Order matters: check [[ ]], ([ ]), [( )], [/ /], [\ \], { }, [ ]
    node_shape_regex = re.compile(
        r'([a-zA-Z0-9_]+)\s*(?:(\[\[(.*?)\]\])|(\(\[(.*?)\]\))|(\[\((.*?)\)\])|(\[\/(.*?)\/\])|(\[\\(.*?)\\\])|(\{(.*?)\})|(\[(.*?)\]))'
    )

    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith('%%') or line.startswith('subgraph') or line == 'end':
            continue
        if re.match(r'^(?:flowchart|graph)\s+', line, re.IGNORECASE):
            continue

        # Extract all node shapes on this line
        for m in node_shape_regex.finditer(line):
            nid = m.group(1)
            shape = 'process'
            lbl = nid

            if m.group(2) is not None: shape = 'subroutine'; lbl = m.group(3)
            elif m.group(4) is not None: shape = 'terminal'; lbl = m.group(5)
            elif m.group(6) is not None: shape = 'database'; lbl = m.group(7)
            elif m.group(8) is not None: shape = 'io'; lbl = m.group(9)
            elif m.group(10) is not None: shape = 'io'; lbl = m.group(11)
            elif m.group(12) is not None: shape = 'decision'; lbl = m.group(13)
            elif m.group(14) is not None: shape = 'process'; lbl = m.group(15)

            lbl = clean_str(lbl)
            if nid not in nodes:
                nodes[nid] = {'id': nid, 'shape': shape, 'label': lbl}
            else:
                if shape != 'process': nodes[nid]['shape'] = shape
                if lbl: nodes[nid]['label'] = lbl

        # Normalize line to find connections: replace shapes with just the node ID
        # E.g. "A[Start] -->|Yes| B([End])" becomes "A -->|Yes| B"
        normalized = node_shape_regex.sub(r'\1', line)

        # Connector pattern:
        # --> | ==> | -.-> | --- | -- label --> | == label ==> | -. label .-> | -->|label| | ==>|label| | -.->|label|
        conn_finder = re.compile(
            r'([a-zA-Z0-9_]+)\s*(?:(-->|==>|-\.->|---|--\s*["\']?(.*?)["\']?\s*-->|==\s*["\']?(.*?)["\']?\s*==>|-\.\s*["\']?(.*?)["\']?\s*\.->|-->\|(.*?)\||\=\=>\|(.*?)\||\-\.->\|(.*?)\|))\s*([a-zA-Z0-9_]+)'
        )

        for cm in conn_finder.finditer(normalized):
            src = cm.group(1)
            tgt = cm.group(9)
            style = 'normal'
            lbl = ''
            full_conn = cm.group(0)

            if '==>' in full_conn: style = 'thick'
            elif '-.->' in full_conn or '.-' in full_conn: style = 'dotted'
            elif '---' in full_conn: style = 'open'

            for idx in [3, 4, 5, 6, 7, 8]:
                val = cm.group(idx)
                if val:
                    lbl = clean_str(val)
                    break

            if src not in nodes: nodes[src] = {'id': src, 'shape': 'process', 'label': src}
            if tgt not in nodes: nodes[tgt] = {'id': tgt, 'shape': 'process', 'label': tgt}

            edges.append({
                'from': src,
                'to': tgt,
                'label': lbl,
                'style': style
            })

    return direction, list(nodes.values()), edges

# Collision Resolution
def layout_graph_robust(nodes, edges, direction='TD'):
    if not nodes: return []

    in_degree = {n['id']: 0 for n in nodes}
    adj = {n['id']: [] for n in nodes}
    for e in edges:
        if e['from'] in adj and e['to'] in in_degree:
            adj[e['from']].append(e['to'])
            in_degree[e['to']] += 1

    ranks = {}
    queue = [n['id'] for n in nodes if in_degree[n['id']] == 0]
    if not queue and nodes: queue = [nodes[0]['id']]

    visited = set()
    max_rank = 0
    while queue:
        u = queue.pop(0)
        visited.add(u)
        cr = ranks.get(u, 0)
        for v in adj.get(u, []):
            nr = cr + 1
            if nr > ranks.get(v, -1):
                ranks[v] = nr
                if nr > max_rank: max_rank = nr
            if v not in visited and v not in queue:
                queue.append(v)

    for n in nodes:
        if n['id'] not in ranks: ranks[n['id']] = 0

    layers = [[] for _ in range(max_rank + 1)]
    for n in nodes:
        layers[ranks[n['id']]].append(n)

    is_horiz = direction in ['LR', 'RL']
    layer_spacing = 260 if is_horiz else 140
    node_spacing = 110 if is_horiz else 220
    start_x = 140
    start_y = 100

    positioned_nodes = []
    for r, layer_nodes in enumerate(layers):
        total_span = (len(layer_nodes) - 1) * node_spacing
        for i, n in enumerate(layer_nodes):
            offset = (i * node_spacing) - (total_span / 2)
            w = 160 if n.get('shape') == 'decision' else 140
            h = 60 if n.get('shape') == 'decision' else 52
            if is_horiz:
                x = start_x + (r * layer_spacing)
                y = start_y + 240 + offset
            else:
                x = start_x + 380 + offset
                y = start_y + (r * layer_spacing)
            positioned_nodes.append({**n, 'x': x, 'y': y, 'width': w, 'height': h})

    # Collision Resolution Pass (AABB Separation)
    min_gap = 24
    for i in range(len(positioned_nodes)):
        for j in range(i + 1, len(positioned_nodes)):
            n1 = positioned_nodes[i]
            n2 = positioned_nodes[j]
            overlap_x = (n1['x'] < n2['x'] + n2['width'] + min_gap) and (n1['x'] + n1['width'] + min_gap > n2['x'])
            overlap_y = (n1['y'] < n2['y'] + n2['height'] + min_gap) and (n1['y'] + n1['height'] + min_gap > n2['y'])
            if overlap_x and overlap_y:
                if is_horiz:
                    n2['y'] = n1['y'] + n1['height'] + min_gap
                else:
                    n2['x'] = n1['x'] + n1['width'] + min_gap

    return positioned_nodes

def check_overlaps(nodes):
    overlaps = []
    min_gap = 10
    for i in range(len(nodes)):
        for j in range(i + 1, len(nodes)):
            n1 = nodes[i]
            n2 = nodes[j]
            if (n1['x'] < n2['x'] + n2['width'] + min_gap and
                n1['x'] + n1['width'] + min_gap > n2['x'] and
                n1['y'] < n2['y'] + n2['height'] + min_gap and
                n1['y'] + n1['height'] + min_gap > n2['y']):
                overlaps.append((n1['id'], n2['id']))
    return overlaps

def run_test_suite():
    res = TestResult()
    print("=== MERMAIDFLOW STUDIO ROBUST TEST SUITE ===")

    print("\n1. Testing Mermaid Parser Syntax Support:")
    test_code_1 = """flowchart TD
    Start([Inicio del Proceso]) --> Input[/Ingresar Credenciales/]
    Input --> Check{¿Credenciales Válidas?}
    Check -- Sí --> GenToken[Generar Token JWT]
    Check -- No --> Error[Mostrar Error 401]
    GenToken --> DB[(Guardar Sesión en DB)]
    DB --> Sub[[Enviar Email Notificación]]
    Error --> End([Fin])
    Sub --> End
    """
    d, nodes, edges = parse_mermaid_robust(test_code_1)
    res.assert_true(d == 'TD', "Detected direction 'TD'")
    res.assert_true(len(nodes) == 8, f"Extracted 8 nodes (got {len(nodes)})")
    res.assert_true(len(edges) == 8, f"Extracted 8 edges (got {len(edges)})")

    node_shapes = {n['id']: n['shape'] for n in nodes}
    res.assert_true(node_shapes.get('Start') == 'terminal', "Start is terminal ([ ])")
    res.assert_true(node_shapes.get('Input') == 'io', "Input is I/O [/ /]")
    res.assert_true(node_shapes.get('Check') == 'decision', "Check is decision { }")
    res.assert_true(node_shapes.get('DB') == 'database', "DB is database [( )]")
    res.assert_true(node_shapes.get('Sub') == 'subroutine', "Sub is subroutine [[ ]]")

    edge_labels = {(e['from'], e['to']): e['label'] for e in edges}
    res.assert_true(edge_labels.get(('Check', 'GenToken')) == 'Sí', "Check -> GenToken condition is 'Sí'")
    res.assert_true(edge_labels.get(('Check', 'Error')) == 'No', "Check -> Error condition is 'No'")

    print("\n2. Testing Inline Pipe & Style Syntax: A[Nodo A] -->|OK| B[Nodo B]:")
    test_code_2 = """flowchart LR
    A[Nodo A] -->|Condición 1| B[Nodo B]
    A ==>|Gruesa| C[Nodo C]
    A -.->|Punteada| D[Nodo D]
    """
    d2, nodes2, edges2 = parse_mermaid_robust(test_code_2)
    res.assert_true(d2 == 'LR', "Detected direction 'LR'")
    res.assert_true(len(nodes2) == 4, f"Extracted 4 nodes (got {len(nodes2)})")
    res.assert_true(len(edges2) == 3, f"Extracted 3 edges (got {len(edges2)})")
    res.assert_true(edges2[0]['label'] == 'Condición 1', f"Pipe label: {edges2[0]['label']}")
    res.assert_true(edges2[1]['style'] == 'thick', f"Thick style: {edges2[1]['style']}")
    res.assert_true(edges2[2]['style'] == 'dotted', f"Dotted style: {edges2[2]['style']}")

    print("\n3. Testing Collision Avoidance (Zero Overlaps):")
    pos_nodes = layout_graph_robust(nodes, edges, 'TD')
    overlaps = check_overlaps(pos_nodes)
    res.assert_true(len(overlaps) == 0, f"Zero overlapping nodes in TD layout (overlaps: {overlaps})")

    pos_nodes_lr = layout_graph_robust(nodes, edges, 'LR')
    overlaps_lr = check_overlaps(pos_nodes_lr)
    res.assert_true(len(overlaps_lr) == 0, f"Zero overlapping nodes in LR layout (overlaps: {overlaps_lr})")

    print("\n4. Testing Stress Layout with 30 Nodes & Multiple Branches:")
    stress_nodes = [{'id': f'N{i}', 'shape': 'process' if i%3 != 0 else 'decision', 'label': f'Paso {i}'} for i in range(30)]
    stress_edges = []
    for i in range(29):
        stress_edges.append({'from': f'N{i}', 'to': f'N{i+1}', 'label': 'Sí' if i%3==0 else '', 'style': 'normal'})
        if i % 4 == 0 and i + 3 < 30:
            stress_edges.append({'from': f'N{i}', 'to': f'N{i+3}', 'label': 'No', 'style': 'thick'})

    stress_pos = layout_graph_robust(stress_nodes, stress_edges, 'TD')
    stress_overlaps = check_overlaps(stress_pos)
    res.assert_true(len(stress_overlaps) == 0, f"Stress test with 30 nodes has zero overlaps (overlaps: {len(stress_overlaps)})")

    print(f"\n==========================================")
    print(f"Results: {res.passed} passed, {res.failed} failed.")
    print(f"==========================================")
    return res.failed == 0

if __name__ == '__main__':
    success = run_test_suite()
    exit(0 if success else 1)
