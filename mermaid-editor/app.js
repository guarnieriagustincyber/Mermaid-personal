/**
 * MermaidFlow Studio v2 — Mermaid-Native Interactive Editor
 * Work directly on the rendered Mermaid diagram.
 */
(function () {
  'use strict';

  // ── Shape Config ──
  const SHAPES = {
    terminal:   { prefix: '([', suffix: '])', text: 'Inicio' },
    process:    { prefix: '[',  suffix: ']',  text: 'Proceso' },
    decision:   { prefix: '{',  suffix: '}',  text: '¿Condición?' },
    database:   { prefix: '[(', suffix: ')]', text: 'Base de Datos' },
    io:         { prefix: '[/', suffix: '/]', text: 'Leer Datos' },
    subroutine: { prefix: '[[', suffix: ']]', text: 'Subproceso()' }
  };

  // ── State ──
  const state = {
    nodes: [],      // { id, type, label }
    edges: [],      // { from, to, label, style }
    direction: 'TD',
    selectedNodeId: null,
    selectedEdgeIdx: null,
    connectFromId: null,
    zoom: 1,
    theme: 'dark',
    history: [],
    historyIdx: -1
  };

  // ── DOM Cache ──
  const $ = id => document.getElementById(id);
  const dom = {
    workspace:    $('diagram-workspace'),
    scroll:       $('diagram-scroll'),
    container:    $('diagram-container'),
    actionBar:    $('node-action-bar'),
    edgePopover:  $('edge-popover'),
    edgeLabelIn:  $('edge-label-input'),
    edgeStyleSel: $('edge-style-select'),
    btnDelEdge:   $('btn-delete-edge'),
    inlineEditor: $('inline-editor'),
    connectBanner:$('connect-banner'),
    cancelConnect:$('btn-cancel-connect'),
    codeArea:     $('mermaid-code'),
    btnCopy:      $('btn-copy'),
    btnClear:     $('btn-clear'),
    btnTheme:     $('btn-theme'),
    btnDownload:  $('btn-download'),
    dirSelect:    $('select-direction'),
    tplSelect:    $('select-template'),
    zoomIn:       $('btn-zoom-in'),
    zoomOut:      $('btn-zoom-out'),
    zoomFit:      $('btn-zoom-fit'),
    zoomLabel:    $('zoom-level'),
    statNodes:    $('stat-nodes'),
    statEdges:    $('stat-edges'),
    toasts:       $('toast-container')
  };

  let renderCounter = 0;

  // ── Init ──
  function init() {
    loadTheme();
    initMermaid();
    wireEvents();

    if (!loadFromStorage()) loadTemplate('auth');
    else renderDiagram();
  }

  function initMermaid() {
    if (typeof mermaid === 'undefined') {
      dom.container.innerHTML = '<div class="empty-state"><h2>Cargando Mermaid.js...</h2><p>Asegúrate de tener conexión a internet.</p></div>';
      return;
    }
    mermaid.initialize({
      startOnLoad: false,
      theme: state.theme === 'dark' ? 'dark' : 'default',
      securityLevel: 'loose',
      flowchart: { curve: 'basis', htmlLabels: true, useMaxWidth: false }
    });
  }

  // ── Persistence ──
  function snapshot() {
    return JSON.stringify({ nodes: state.nodes, edges: state.edges, direction: state.direction });
  }

  function pushHistory() {
    const snap = snapshot();
    if (state.historyIdx < state.history.length - 1) {
      state.history = state.history.slice(0, state.historyIdx + 1);
    }
    state.history.push(snap);
    state.historyIdx++;
    try { localStorage.setItem('mermaidflow_v2', snap); } catch (e) {}
    updateCode();
    updateStats();
  }

  function undo() {
    if (state.historyIdx > 0) {
      state.historyIdx--;
      restore(state.history[state.historyIdx]);
      toast('↩ Deshacer');
    }
  }

  function redo() {
    if (state.historyIdx < state.history.length - 1) {
      state.historyIdx++;
      restore(state.history[state.historyIdx]);
      toast('↪ Rehacer');
    }
  }

  function restore(snap) {
    try {
      const d = JSON.parse(snap);
      state.nodes = d.nodes || [];
      state.edges = d.edges || [];
      state.direction = d.direction || 'TD';
      dom.dirSelect.value = state.direction;
      deselect();
      renderDiagram();
    } catch (e) { console.error(e); }
  }

  function loadFromStorage() {
    try {
      const s = localStorage.getItem('mermaidflow_v2');
      if (s) {
        const d = JSON.parse(s);
        if (d.nodes && d.nodes.length > 0) {
          state.nodes = d.nodes;
          state.edges = d.edges || [];
          state.direction = d.direction || 'TD';
          dom.dirSelect.value = state.direction;
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  // ── Theme ──
  function loadTheme() {
    state.theme = localStorage.getItem('mermaidflow_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
  }

  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    localStorage.setItem('mermaidflow_theme', state.theme);
    initMermaid();
    renderDiagram();
    toast(state.theme === 'dark' ? '🌙 Modo Oscuro' : '☀️ Modo Claro');
  }

  // ── ID Generator ──
  function nextId() {
    const used = new Set(state.nodes.map(n => n.id));
    for (let i = 0; i < 702; i++) {
      let id;
      if (i < 26) id = String.fromCharCode(65 + i);
      else id = String.fromCharCode(65 + Math.floor((i - 26) / 26)) + String.fromCharCode(65 + (i - 26) % 26);
      if (!used.has(id)) return id;
    }
    return 'N' + Date.now().toString(36).slice(-4);
  }

  // ── Data Operations ──
  function addNode(type, label) {
    const shape = SHAPES[type] || SHAPES.process;
    const node = { id: nextId(), type, label: label || shape.text };
    state.nodes.push(node);
    deselect();
    pushHistory();
    renderDiagram().then(() => {
      selectNode(node.id);
    });
    return node;
  }

  function addEdge(from, to, label, style) {
    if (from === to) return null;
    if (state.edges.some(e => e.from === from && e.to === to)) return null;
    const edge = { from, to, label: label || '', style: style || 'normal' };
    state.edges.push(edge);
    pushHistory();
    renderDiagram();
    return edge;
  }

  function deleteNode(id) {
    state.nodes = state.nodes.filter(n => n.id !== id);
    state.edges = state.edges.filter(e => e.from !== id && e.to !== id);
    deselect();
    pushHistory();
    renderDiagram();
  }

  function deleteEdge(idx) {
    if (idx >= 0 && idx < state.edges.length) {
      state.edges.splice(idx, 1);
      deselect();
      pushHistory();
      renderDiagram();
    }
  }

  function updateNodeLabel(id, newLabel) {
    const node = state.nodes.find(n => n.id === id);
    if (node) {
      node.label = newLabel || SHAPES[node.type].text;
      pushHistory();
      renderDiagram().then(() => selectNode(id));
    }
  }

  function updateEdgeLabel(idx, label) {
    if (idx >= 0 && idx < state.edges.length) {
      state.edges[idx].label = label;
      pushHistory();
      renderDiagram();
    }
  }

  function updateEdgeStyle(idx, style) {
    if (idx >= 0 && idx < state.edges.length) {
      state.edges[idx].style = style;
      pushHistory();
      renderDiagram();
    }
  }

  // ── Quick Add Branches ──
  function quickAddBranch(fromId, condition) {
    const from = state.nodes.find(n => n.id === fromId);
    if (!from) return;
    const newNode = { id: nextId(), type: 'process', label: condition ? `Acción ${condition}` : 'Siguiente Paso' };
    state.nodes.push(newNode);
    state.edges.push({ from: fromId, to: newNode.id, label: condition || '', style: 'normal' });
    deselect();
    pushHistory();
    renderDiagram().then(() => selectNode(newNode.id));
  }

  // ── Mermaid Code Generator ──
  function generateCode() {
    if (state.nodes.length === 0) return `flowchart ${state.direction}\n    %% Diagrama vacío`;
    let code = `flowchart ${state.direction}\n`;
    state.nodes.forEach(n => {
      const s = SHAPES[n.type] || SHAPES.process;
      const lbl = (n.label || 'Nodo').replace(/"/g, "'").replace(/\n/g, '<br/>');
      code += `    ${n.id}${s.prefix}"${lbl}"${s.suffix}\n`;
    });
    if (state.edges.length > 0) {
      code += '\n';
      state.edges.forEach(e => {
        let arr = '-->';
        if (e.style === 'thick') arr = '==>';
        else if (e.style === 'dotted') arr = '-.->';
        const lbl = (e.label || '').trim();
        if (lbl) {
          const clean = lbl.replace(/"/g, "'");
          code += `    ${e.from} ${arr}|"${clean}"| ${e.to}\n`;
        } else {
          code += `    ${e.from} ${arr} ${e.to}\n`;
        }
      });
    }
    return code;
  }

  function updateCode() {
    if (dom.codeArea) dom.codeArea.value = generateCode();
  }

  function updateStats() {
    if (dom.statNodes) dom.statNodes.textContent = `${state.nodes.length} nodos`;
    if (dom.statEdges) dom.statEdges.textContent = `${state.edges.length} conexiones`;
  }

  // ── Mermaid SVG Rendering ──
  let renderPromise = null;

  async function renderDiagram() {
    if (typeof mermaid === 'undefined') return;
    const code = generateCode();
    updateCode();
    updateStats();

    renderCounter++;
    const id = `mf_${renderCounter}`;

    try {
      const { svg } = await mermaid.render(id, code);
      dom.container.innerHTML = svg;
      attachSvgHandlers();
      applySelection();
    } catch (err) {
      console.warn('Mermaid render error:', err);
      dom.container.innerHTML = `<div class="empty-state"><h2>Diagrama actualizándose...</h2><p>Agrega nodos para continuar.</p></div>`;
    }
  }

  // ── SVG Interaction Handlers ──
  function attachSvgHandlers() {
    const svg = dom.container.querySelector('svg');
    if (!svg) return;

    // Nodes
    const nodeEls = svg.querySelectorAll('.node');
    nodeEls.forEach(nodeEl => {
      const nodeId = extractNodeId(nodeEl);
      if (!nodeId) return;

      nodeEl.style.cursor = 'pointer';

      nodeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.connectFromId) {
          finishConnect(nodeId);
        } else {
          selectNode(nodeId);
        }
      });

      nodeEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        startInlineEdit(nodeId, nodeEl);
      });
    });

    // Edges (paths) — use index mapping
    const edgePaths = svg.querySelectorAll('.edgePath');
    edgePaths.forEach((epEl, idx) => {
      if (idx >= state.edges.length) return;
      const pathEl = epEl.querySelector('path');
      if (pathEl) {
        pathEl.style.cursor = 'pointer';
        // Add invisible fat hit area
        const hit = pathEl.cloneNode();
        hit.setAttribute('stroke', 'transparent');
        hit.setAttribute('stroke-width', '20');
        hit.style.pointerEvents = 'stroke';
        hit.style.cursor = 'pointer';
        hit.style.fill = 'none';
        epEl.insertBefore(hit, pathEl);

        const handler = (e) => {
          e.stopPropagation();
          selectEdge(idx, e);
        };
        hit.addEventListener('click', handler);
        pathEl.addEventListener('click', handler);
      }
    });

    // Edge Labels
    const edgeLabels = svg.querySelectorAll('.edgeLabel');
    edgeLabels.forEach((elEl, idx) => {
      if (idx >= state.edges.length) return;
      elEl.style.cursor = 'pointer';
      elEl.addEventListener('click', (e) => {
        e.stopPropagation();
        selectEdge(idx, e);
      });
    });

    // Click on background → deselect
    svg.addEventListener('click', (e) => {
      if (e.target === svg || e.target.closest('.node') === null && e.target.closest('.edgePath') === null && e.target.closest('.edgeLabel') === null) {
        deselect();
        cancelConnect();
      }
    });
  }

  function extractNodeId(svgNode) {
    const id = svgNode.id || '';
    const m = id.match(/^flowchart-(.+)-\d+$/);
    return m ? m[1] : null;
  }

  function findSvgNode(nodeId) {
    const svg = dom.container.querySelector('svg');
    if (!svg) return null;
    const nodes = svg.querySelectorAll('.node');
    for (const n of nodes) {
      if (extractNodeId(n) === nodeId) return n;
    }
    return null;
  }

  // ── Selection ──
  function selectNode(nodeId) {
    const node = state.nodes.find(n => n.id === nodeId);
    if (!node) return;

    state.selectedNodeId = nodeId;
    state.selectedEdgeIdx = null;
    hideEdgePopover();
    applySelection();
    showActionBar(node);
  }

  function selectEdge(idx, evt) {
    if (idx < 0 || idx >= state.edges.length) return;
    state.selectedEdgeIdx = idx;
    state.selectedNodeId = null;
    hideActionBar();
    applySelection();
    showEdgePopover(idx, evt);
  }

  function deselect() {
    state.selectedNodeId = null;
    state.selectedEdgeIdx = null;
    hideActionBar();
    hideEdgePopover();
    hideInlineEditor();
    applySelection();
  }

  function applySelection() {
    const svg = dom.container.querySelector('svg');
    if (!svg) return;

    // Clear all selections
    svg.querySelectorAll('.mf-selected').forEach(el => el.classList.remove('mf-selected'));

    // Highlight selected node
    if (state.selectedNodeId) {
      const nodeEl = findSvgNode(state.selectedNodeId);
      if (nodeEl) nodeEl.classList.add('mf-selected');
    }

    // Highlight selected edge
    if (state.selectedEdgeIdx !== null) {
      const edgePaths = svg.querySelectorAll('.edgePath');
      if (edgePaths[state.selectedEdgeIdx]) {
        edgePaths[state.selectedEdgeIdx].classList.add('mf-selected');
      }
    }
  }

  // ── Node Action Bar ──
  function showActionBar(node) {
    const svgNode = findSvgNode(node.id);
    if (!svgNode) return;

    // Build contextual buttons
    let html = '';
    html += `<button class="nab-btn nab-edit" data-act="edit">✏️ Editar</button>`;
    html += `<button class="nab-btn nab-connect" data-act="connect">🔗 Conectar</button>`;

    if (node.type === 'decision') {
      html += `<button class="nab-btn nab-yes" data-act="yes">✔ +Sí</button>`;
      html += `<button class="nab-btn nab-no" data-act="no">✖ +No</button>`;
    } else {
      html += `<button class="nab-btn nab-next" data-act="next">➕ +Siguiente</button>`;
    }

    html += `<button class="nab-btn nab-del" data-act="delete">🗑️</button>`;

    dom.actionBar.innerHTML = html;
    dom.actionBar.classList.add('visible');

    // Position above the node
    const nodeRect = svgNode.getBoundingClientRect();
    const wsRect = dom.workspace.getBoundingClientRect();
    let x = nodeRect.left + nodeRect.width / 2 - wsRect.left;
    let y = nodeRect.top - wsRect.top - 8;

    // Get action bar width after rendering
    const barW = dom.actionBar.offsetWidth;
    x -= barW / 2;
    if (x < 4) x = 4;
    if (x + barW > wsRect.width - 4) x = wsRect.width - barW - 4;
    if (y < 4) y = nodeRect.bottom - wsRect.top + 8;

    dom.actionBar.style.left = x + 'px';
    dom.actionBar.style.top = y + 'px';

    // Wire action buttons
    dom.actionBar.querySelectorAll('.nab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleNodeAction(node.id, btn.dataset.act);
      });
    });
  }

  function hideActionBar() {
    dom.actionBar.classList.remove('visible');
  }

  function handleNodeAction(nodeId, action) {
    switch (action) {
      case 'edit':
        const svgNode = findSvgNode(nodeId);
        if (svgNode) startInlineEdit(nodeId, svgNode);
        break;
      case 'connect':
        startConnect(nodeId);
        break;
      case 'yes':
        quickAddBranch(nodeId, 'Sí');
        break;
      case 'no':
        quickAddBranch(nodeId, 'No');
        break;
      case 'next':
        quickAddBranch(nodeId, '');
        break;
      case 'delete':
        deleteNode(nodeId);
        break;
    }
  }

  // ── Connect Mode ──
  function startConnect(fromId) {
    state.connectFromId = fromId;
    dom.workspace.classList.add('connect-mode');
    dom.connectBanner.classList.add('visible');
    hideActionBar();
    toast('🔗 Clic en el nodo destino para conectar');
  }

  function finishConnect(toId) {
    if (state.connectFromId && state.connectFromId !== toId) {
      const fromNode = state.nodes.find(n => n.id === state.connectFromId);
      addEdge(state.connectFromId, toId);

      // If from a decision, auto-show edge popover
      if (fromNode && fromNode.type === 'decision') {
        const edgeIdx = state.edges.length - 1;
        setTimeout(() => selectEdge(edgeIdx, null), 100);
      }
    }
    cancelConnect();
  }

  function cancelConnect() {
    state.connectFromId = null;
    dom.workspace.classList.remove('connect-mode');
    dom.connectBanner.classList.remove('visible');
  }

  // ── Inline Text Editing ──
  function startInlineEdit(nodeId, svgNode) {
    const node = state.nodes.find(n => n.id === nodeId);
    if (!node) return;

    hideActionBar();

    const nodeRect = svgNode.getBoundingClientRect();
    const wsRect = dom.workspace.getBoundingClientRect();

    const editor = dom.inlineEditor;
    editor.value = node.label;
    editor.style.display = 'block';
    editor.style.left = (nodeRect.left - wsRect.left) + 'px';
    editor.style.top = (nodeRect.top - wsRect.top) + 'px';
    editor.style.width = Math.max(nodeRect.width + 20, 120) + 'px';
    editor.style.height = nodeRect.height + 'px';
    editor.focus();
    editor.select();

    const finish = () => {
      const newLabel = editor.value.trim();
      hideInlineEditor();
      if (newLabel && newLabel !== node.label) {
        updateNodeLabel(nodeId, newLabel);
      } else {
        selectNode(nodeId);
      }
    };

    // Remove old listeners to avoid duplicates
    const newEditor = editor.cloneNode(true);
    editor.parentNode.replaceChild(newEditor, editor);
    dom.inlineEditor = newEditor;

    newEditor.value = node.label;
    newEditor.style.display = 'block';
    newEditor.style.left = (nodeRect.left - wsRect.left) + 'px';
    newEditor.style.top = (nodeRect.top - wsRect.top) + 'px';
    newEditor.style.width = Math.max(nodeRect.width + 20, 120) + 'px';
    newEditor.style.height = nodeRect.height + 'px';
    newEditor.focus();
    newEditor.select();

    newEditor.addEventListener('blur', finish);
    newEditor.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); newEditor.blur(); }
      if (e.key === 'Escape') { newEditor.value = node.label; newEditor.blur(); }
    });
  }

  function hideInlineEditor() {
    dom.inlineEditor.style.display = 'none';
  }

  // ── Edge Popover ──
  function showEdgePopover(idx, evt) {
    const edge = state.edges[idx];
    if (!edge) return;

    dom.edgeLabelIn.value = edge.label || '';
    dom.edgeStyleSel.value = edge.style || 'normal';

    const wsRect = dom.workspace.getBoundingClientRect();
    let x, y;

    if (evt) {
      x = evt.clientX - wsRect.left + 12;
      y = evt.clientY - wsRect.top - 10;
    } else {
      // Fallback: center of workspace
      x = wsRect.width / 2 - 125;
      y = wsRect.height / 2 - 80;
    }

    if (x + 260 > wsRect.width) x = wsRect.width - 270;
    if (y + 200 > wsRect.height) y = wsRect.height - 210;
    if (x < 8) x = 8;
    if (y < 8) y = 8;

    dom.edgePopover.style.left = x + 'px';
    dom.edgePopover.style.top = y + 'px';
    dom.edgePopover.classList.add('visible');
  }

  function hideEdgePopover() {
    dom.edgePopover.classList.remove('visible');
  }

  // ── Event Wiring ──
  function wireEvents() {
    // Palette
    document.querySelectorAll('.palette-card').forEach(card => {
      card.addEventListener('click', () => addNode(card.dataset.type));
    });

    // Header buttons
    dom.btnCopy.addEventListener('click', copyCode);
    dom.btnClear.addEventListener('click', () => {
      if (confirm('¿Limpiar todo el diagrama?')) {
        state.nodes = []; state.edges = [];
        deselect(); pushHistory(); renderDiagram();
        toast('Lienzo limpio');
      }
    });
    dom.btnTheme.addEventListener('click', toggleTheme);
    dom.btnDownload.addEventListener('click', downloadMmd);

    dom.dirSelect.addEventListener('change', (e) => {
      state.direction = e.target.value;
      pushHistory();
      renderDiagram();
    });

    dom.tplSelect.addEventListener('change', (e) => {
      if (e.target.value) {
        loadTemplate(e.target.value);
        e.target.value = '';
      }
    });

    // Zoom
    dom.zoomIn.addEventListener('click', () => setZoom(state.zoom + 0.15));
    dom.zoomOut.addEventListener('click', () => setZoom(state.zoom - 0.15));
    dom.zoomFit.addEventListener('click', () => setZoom(1));

    dom.scroll.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom(state.zoom + (e.deltaY < 0 ? 0.1 : -0.1));
      }
    }, { passive: false });

    // Edge Popover controls
    dom.edgePopover.querySelectorAll('.cpill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.selectedEdgeIdx !== null) {
          const val = pill.dataset.val;
          updateEdgeLabel(state.selectedEdgeIdx, val);
          dom.edgeLabelIn.value = val;
          toast(val ? `Condición: ${val}` : 'Condición eliminada');
        }
      });
    });

    dom.edgeLabelIn.addEventListener('input', () => {
      if (state.selectedEdgeIdx !== null) {
        state.edges[state.selectedEdgeIdx].label = dom.edgeLabelIn.value;
        pushHistory();
        renderDiagram();
      }
    });
    // Prevent clicks inside input from bubbling
    dom.edgeLabelIn.addEventListener('click', e => e.stopPropagation());

    dom.edgeStyleSel.addEventListener('change', () => {
      if (state.selectedEdgeIdx !== null) {
        updateEdgeStyle(state.selectedEdgeIdx, dom.edgeStyleSel.value);
      }
    });
    dom.edgeStyleSel.addEventListener('click', e => e.stopPropagation());

    dom.btnDelEdge.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.selectedEdgeIdx !== null) {
        deleteEdge(state.selectedEdgeIdx);
        toast('Flecha eliminada');
      }
    });

    // Cancel connect
    dom.cancelConnect.addEventListener('click', (e) => {
      e.stopPropagation();
      cancelConnect();
    });

    // Click on workspace background → deselect
    dom.workspace.addEventListener('click', (e) => {
      if (e.target === dom.workspace || e.target === dom.scroll || e.target === dom.container) {
        deselect();
        cancelConnect();
      }
    });

    // Prevent popover clicks from deselecting
    dom.edgePopover.addEventListener('click', e => e.stopPropagation());
    dom.actionBar.addEventListener('click', e => e.stopPropagation());

    // Keyboard
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.selectedNodeId) { deleteNode(state.selectedNodeId); toast('Nodo eliminado'); }
        else if (state.selectedEdgeIdx !== null) { deleteEdge(state.selectedEdgeIdx); toast('Flecha eliminada'); }
      }
      if (e.key === 'Escape') { deselect(); cancelConnect(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !window.getSelection().toString()) { e.preventDefault(); copyCode(); }
    });
  }

  // ── Zoom ──
  function setZoom(val) {
    state.zoom = Math.min(Math.max(val, 0.3), 2.5);
    dom.container.style.transform = `scale(${state.zoom})`;
    dom.zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
  }

  // ── Copy & Export ──
  function copyCode() {
    const code = generateCode();
    navigator.clipboard.writeText(code).then(() => {
      toast('📋 ¡Código copiado al portapapeles!');
      const orig = dom.btnCopy.innerHTML;
      dom.btnCopy.innerHTML = '✅ ¡Copiado!';
      setTimeout(() => dom.btnCopy.innerHTML = orig, 1600);
    }).catch(() => toast('Selecciona el código manualmente'));
  }

  function downloadMmd() {
    const blob = new Blob([generateCode()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diagrama_${Date.now().toString(36)}.mmd`;
    a.click();
    URL.revokeObjectURL(url);
    toast('💾 Archivo .mmd descargado');
  }

  // ── Toast ──
  function toast(msg) {
    if (!dom.toasts) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    dom.toasts.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 2000);
  }

  // ── Templates ──
  function loadTemplate(key) {
    const T = {
      auth: {
        direction: 'TD',
        nodes: [
          { id: 'A', type: 'terminal', label: 'Inicio' },
          { id: 'B', type: 'io', label: 'Ingresar Credenciales' },
          { id: 'C', type: 'decision', label: '¿Credenciales Válidas?' },
          { id: 'D', type: 'process', label: 'Generar Token JWT' },
          { id: 'E', type: 'process', label: 'Mostrar Error 401' },
          { id: 'F', type: 'terminal', label: 'Fin' }
        ],
        edges: [
          { from: 'A', to: 'B', label: '', style: 'normal' },
          { from: 'B', to: 'C', label: '', style: 'normal' },
          { from: 'C', to: 'D', label: 'Sí', style: 'normal' },
          { from: 'C', to: 'E', label: 'No', style: 'normal' },
          { from: 'D', to: 'F', label: '', style: 'normal' },
          { from: 'E', to: 'F', label: '', style: 'normal' }
        ]
      },
      payment: {
        direction: 'TD',
        nodes: [
          { id: 'A', type: 'terminal', label: 'Checkout' },
          { id: 'B', type: 'decision', label: '¿Tarjeta Válida?' },
          { id: 'C', type: 'subroutine', label: 'Procesar con Stripe' },
          { id: 'D', type: 'process', label: 'Rechazar Transacción' },
          { id: 'E', type: 'database', label: 'Guardar Orden en DB' },
          { id: 'F', type: 'terminal', label: 'Fin' }
        ],
        edges: [
          { from: 'A', to: 'B', label: '', style: 'normal' },
          { from: 'B', to: 'C', label: 'Sí', style: 'normal' },
          { from: 'B', to: 'D', label: 'No', style: 'normal' },
          { from: 'C', to: 'E', label: '', style: 'normal' },
          { from: 'E', to: 'F', label: '', style: 'normal' },
          { from: 'D', to: 'F', label: '', style: 'normal' }
        ]
      },
      etl: {
        direction: 'LR',
        nodes: [
          { id: 'A', type: 'database', label: 'Fuente CSV / API' },
          { id: 'B', type: 'process', label: 'Extracción' },
          { id: 'C', type: 'decision', label: '¿Schema OK?' },
          { id: 'D', type: 'process', label: 'Transformar' },
          { id: 'E', type: 'database', label: 'Dead Letter Queue' },
          { id: 'F', type: 'database', label: 'Data Warehouse' }
        ],
        edges: [
          { from: 'A', to: 'B', label: '', style: 'normal' },
          { from: 'B', to: 'C', label: '', style: 'normal' },
          { from: 'C', to: 'D', label: 'Sí', style: 'normal' },
          { from: 'C', to: 'E', label: 'No', style: 'dotted' },
          { from: 'D', to: 'F', label: '', style: 'normal' }
        ]
      },
      empty: {
        direction: 'TD',
        nodes: [],
        edges: []
      }
    };

    const tpl = T[key];
    if (tpl) {
      state.nodes = JSON.parse(JSON.stringify(tpl.nodes));
      state.edges = JSON.parse(JSON.stringify(tpl.edges));
      state.direction = tpl.direction;
      dom.dirSelect.value = state.direction;
      deselect();
      pushHistory();
      renderDiagram();
      if (key !== 'empty') toast(`Plantilla: ${key.toUpperCase()}`);
    }
  }

  // ── Boot ──
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
