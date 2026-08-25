/**
 * MermaidFlow Studio - Ultra-Modern Frameless Canvas & Modular Subgraph Engine
 * High-Performance Vanilla JS + SVG Architecture
 */

(function () {
  'use strict';

  // Canvas 2D context for precise text measurement
  const offscreenCanvas = document.createElement('canvas');
  const measureCtx = offscreenCanvas.getContext('2d');
  measureCtx.font = '700 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  function measureTextSize(text) {
    if (!text) return { width: 40, height: 20, lines: 1 };
    const lines = text.split(/\n|<br\s*[\/]?>/i);
    let maxWidth = 0;
    lines.forEach(line => {
      const w = measureCtx.measureText(line.trim() || 'A').width;
      if (w > maxWidth) maxWidth = w;
    });
    return {
      width: Math.ceil(maxWidth),
      height: lines.length * 18,
      lines: lines.length
    };
  }

  function computeNodeDimensions(shape, label) {
    const metrics = measureTextSize(label || 'Nodo');
    const minW = 120;
    const minH = 48;

    switch (shape) {
      case 'decision': {
        const w = Math.max(150, Math.round(metrics.width * 1.45 + 36));
        const h = Math.max(72, Math.round(metrics.lines * 22 + 42));
        return { width: w, height: h };
      }
      case 'database': {
        const w = Math.max(130, Math.round(metrics.width + 36));
        const h = Math.max(62, Math.round(metrics.lines * 20 + 38));
        return { width: w, height: h };
      }
      case 'io': {
        const w = Math.max(140, Math.round(metrics.width + 46));
        const h = Math.max(50, Math.round(metrics.lines * 19 + 26));
        return { width: w, height: h };
      }
      case 'terminal': {
        const w = Math.max(130, Math.round(metrics.width + 40));
        const h = Math.max(50, Math.round(metrics.lines * 19 + 26));
        return { width: w, height: h };
      }
      case 'subroutine': {
        const w = Math.max(140, Math.round(metrics.width + 44));
        const h = Math.max(50, Math.round(metrics.lines * 19 + 26));
        return { width: w, height: h };
      }
      case 'process':
      default: {
        const w = Math.max(minW, Math.round(metrics.width + 36));
        const h = Math.max(minH, Math.round(metrics.lines * 19 + 26));
        return { width: w, height: h };
      }
    }
  }

  // --- NODE SHAPE DEFINITIONS WITH PURE VECTOR SVG GENERATORS ---
  const SHAPES = {
    terminal: {
      name: 'Inicio / Fin',
      prefix: '([',
      suffix: '])',
      defaultText: 'Inicio',
      generateSvg: (w, h) => `
        <rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="${(h - 4) / 2}" ry="${(h - 4) / 2}" class="shape-svg-fill" />
      `
    },
    process: {
      name: 'Proceso',
      prefix: '[',
      suffix: ']',
      defaultText: 'Proceso',
      generateSvg: (w, h) => `
        <rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="6" ry="6" class="shape-svg-fill" />
      `
    },
    decision: {
      name: 'Decisión',
      prefix: '{',
      suffix: '}',
      defaultText: '¿Es válido?',
      generateSvg: (w, h) => `
        <polygon points="${w / 2},2 ${w - 2},${h / 2} ${w / 2},${h - 2} 2,${h / 2}" class="shape-svg-fill" />
      `
    },
    database: {
      name: 'Base de Datos',
      prefix: '[(',
      suffix: ')]',
      defaultText: 'Base de Datos',
      generateSvg: (w, h) => {
        const ry = 9;
        const cyTop = 12;
        const cyBot = h - 12;
        const rx = (w - 4) / 2;
        return `
          <path d="M 2 ${cyTop} L 2 ${cyBot} A ${rx} ${ry} 0 0 0 ${w - 2} ${cyBot} L ${w - 2} ${cyTop} Z" class="shape-svg-fill" />
          <ellipse cx="${w / 2}" cy="${cyTop}" rx="${rx}" ry="${ry}" class="shape-svg-fill" />
          <path d="M 2 ${cyTop} A ${rx} ${ry} 0 0 0 ${w - 2} ${cyTop}" class="shape-svg-stroke" fill="none" />
        `;
      }
    },
    io: {
      name: 'Entrada / Salida',
      prefix: '[/',
      suffix: '/]',
      defaultText: 'Leer Datos',
      generateSvg: (w, h) => `
        <polygon points="18,2 ${w - 2},2 ${w - 18},${h - 2} 2,${h - 2}" class="shape-svg-fill" />
      `
    },
    subroutine: {
      name: 'Subproceso',
      prefix: '[[',
      suffix: ']]',
      defaultText: 'Subproceso()',
      generateSvg: (w, h) => `
        <rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="4" ry="4" class="shape-svg-fill" />
        <line x1="14" y1="2" x2="14" y2="${h - 2}" class="shape-svg-stroke" />
        <line x1="${w - 14}" y1="2" x2="${w - 14}" y2="${h - 2}" class="shape-svg-stroke" />
      `
    }
  };

  // --- STATE ---
  const state = {
    nodes: [],
    edges: [],
    subgraphs: [], // Array of { id, title }
    selectedNodeIds: new Set(),
    selectedEdgeId: null,
    editingNodeId: null,
    activeColor: 'emerald',
    direction: 'TD',
    connStyle: 'curved',
    pan: { x: 80, y: 90 },
    zoom: 0.85,
    isPanning: false,
    panStart: { x: 0, y: 0 },
    isDraggingNodes: false,
    dragStartMouse: { x: 0, y: 0 },
    dragInitialNodePos: new Map(),
    connectingFrom: null,
    connectModeFromId: null,
    history: [],
    historyIdx: -1,
    theme: 'dark',
    codePanelOpen: true,
    isTypingCode: false
  };

  // --- DOM REFERENCES ---
  const $ = id => document.getElementById(id);
  const dom = {
    viewport: $('canvas-viewport'),
    world: $('canvas-world'),
    subgraphsLayer: $('subgraphs-layer'),
    svgCanvas: $('svg-canvas'),
    edgesLayer: $('edges-layer'),
    tempLine: $('temp-connecting-line'),
    nodesLayer: $('nodes-layer'),
    nodeToolbar: $('node-floating-toolbar'),
    nodeBranchActions: $('node-branch-actions'),
    multiSelectToolbar: $('multi-select-toolbar'),
    multiSelectCount: $('multi-select-count'),
    btnMultiDelete: $('btn-multi-delete'),
    btnNodeEdit: $('btn-node-edit'),
    btnNodeConnect: $('btn-node-connect'),
    btnNodeDelete: $('btn-node-delete'),
    edgePopover: $('edge-floating-popover'),
    edgeTextInput: $('edge-text-input'),
    edgeStylePicker: $('edge-style-picker'),
    btnDeleteEdge: $('btn-delete-edge-popover'),
    connectBanner: $('connect-guide-banner'),
    btnCancelConnect: $('btn-cancel-connection'),
    mermaidCode: $('mermaid-code-output'),
    sidebarCode: $('sidebar-code'),
    btnToggleCode: $('btn-toggle-code'),
    btnCloseCode: $('btn-close-code-panel'),
    btnApplyCode: $('btn-apply-code'),
    btnCopy: $('btn-copy-mermaid'),
    btnUndo: $('btn-undo'),
    btnRedo: $('btn-redo'),
    btnClear: $('btn-clear'),
    btnTheme: $('btn-theme-toggle'),
    btnExportMenu: $('btn-export-menu'),
    exportDropdown: $('export-dropdown'),
    btnExportSvg: $('btn-export-svg'),
    btnExportPng: $('btn-export-png'),
    btnCopySvg: $('btn-copy-svg'),
    btnDownloadMmd: $('btn-download-mmd'),
    selectTemplate: $('select-template'),
    selectDirection: $('select-direction'),
    selectConnStyle: $('select-conn-style'),
    btnAutoLayout: $('btn-auto-layout'),
    zoomIn: $('btn-zoom-in'),
    zoomOut: $('btn-zoom-out'),
    zoomFit: $('btn-zoom-fit'),
    zoomValue: $('zoom-value'),
    statNodes: $('stat-nodes'),
    statEdges: $('stat-edges'),
    syncStatus: $('sync-status'),
    toastContainer: $('toast-container')
  };

  let codeDebounceTimer = null;

  // --- INITIALIZATION ---
  function init() {
    loadTheme();
    setupEventListeners();
    setupDockButtons();

    if (window.innerWidth <= 800) {
      setCodePanel(false);
    }

    if (!loadFromStorage()) {
      loadTemplate('pin_system');
    }

    updateWorldTransform();
    render();
    saveState();

    setTimeout(() => autoLayout(false), 100);
  }

  // --- STATE PERSISTENCE & HISTORY ---
  function saveState(updateTextarea = true) {
    const snapshot = JSON.stringify({
      nodes: state.nodes,
      edges: state.edges,
      subgraphs: state.subgraphs,
      direction: state.direction,
      connStyle: state.connStyle
    });

    if (state.historyIdx < state.history.length - 1) {
      state.history = state.history.slice(0, state.historyIdx + 1);
    }
    state.history.push(snapshot);
    state.historyIdx++;

    try {
      localStorage.setItem('mermaidflow_v3', snapshot);
    } catch (e) {}

    if (updateTextarea && !state.isTypingCode) {
      updateMermaidCode();
    }
    updateStats();
  }

  function undo() {
    if (state.historyIdx > 0) {
      state.historyIdx--;
      restoreSnapshot(state.history[state.historyIdx]);
      showToast('↩️ Deshacer');
    }
  }

  function redo() {
    if (state.historyIdx < state.history.length - 1) {
      state.historyIdx++;
      restoreSnapshot(state.history[state.historyIdx]);
      showToast('↪️ Rehacer');
    }
  }

  function restoreSnapshot(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      state.nodes = data.nodes || [];
      state.edges = data.edges || [];
      state.subgraphs = data.subgraphs || [];
      state.direction = data.direction || 'TD';
      state.connStyle = data.connStyle || 'curved';
      if (dom.selectDirection) dom.selectDirection.value = state.direction;
      if (dom.selectConnStyle) dom.selectConnStyle.value = state.connStyle;
      state.selectedNodeIds.clear();
      state.selectedEdgeId = null;
      hideToolbars();
      hideEdgePopover();
      render();
      updateMermaidCode();
      updateStats();
    } catch (e) {
      console.error(e);
    }
  }

  function loadFromStorage() {
    try {
      const saved = localStorage.getItem('mermaidflow_v3');
      if (saved) {
        const data = JSON.parse(saved);
        if (data.nodes && data.nodes.length > 0) {
          state.nodes = data.nodes;
          state.edges = data.edges || [];
          state.subgraphs = data.subgraphs || [];
          state.direction = data.direction || 'TD';
          state.connStyle = data.connStyle || 'curved';
          if (dom.selectDirection) dom.selectDirection.value = state.direction;
          if (dom.selectConnStyle) dom.selectConnStyle.value = state.connStyle;
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  // --- THEME ---
  function loadTheme() {
    state.theme = localStorage.getItem('mermaidflow_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
  }

  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    localStorage.setItem('mermaidflow_theme', state.theme);
    showToast(state.theme === 'dark' ? '🌙 Modo Oscuro' : '☀️ Modo Claro');
  }

  // --- ID GENERATOR ---
  function getNextNodeId() {
    const existing = new Set(state.nodes.map(n => n.id));
    for (let i = 0; i < 26; i++) {
      const letter = String.fromCharCode(65 + i);
      if (!existing.has(letter)) return letter;
    }
    for (let i = 0; i < 26; i++) {
      for (let j = 0; j < 26; j++) {
        const pair = String.fromCharCode(65 + i) + String.fromCharCode(65 + j);
        if (!existing.has(pair)) return pair;
      }
    }
    return `N${state.nodes.length + 1}`;
  }

  // --- NODE & EDGE OPERATIONS ---
  function createNode(shape, x, y, label = null, color = null) {
    const shapeDef = SHAPES[shape] || SHAPES.process;
    const nodeText = label || shapeDef.defaultText;
    const nodeColor = color || (shape === 'terminal' ? 'emerald' : (shape === 'decision' ? 'amber' : (shape === 'database' ? 'purple' : state.activeColor)));
    const dims = computeNodeDimensions(shape, nodeText);

    const node = {
      id: getNextNodeId(),
      shape: shape,
      color: nodeColor,
      label: nodeText,
      x: Math.round(x),
      y: Math.round(y),
      width: dims.width,
      height: dims.height
    };

    state.nodes.push(node);
    state.selectedNodeIds.clear();
    state.selectedNodeIds.add(node.id);
    state.selectedEdgeId = null;
    hideEdgePopover();

    render();
    saveState();
    updateToolbars();
    return node;
  }

  function updateNodeText(nodeId, newText) {
    const node = state.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const shapeDef = SHAPES[node.shape] || SHAPES.process;
    node.label = newText.trim() || shapeDef.defaultText;
    const dims = computeNodeDimensions(node.shape, node.label);
    node.width = dims.width;
    node.height = dims.height;
    render();
    saveState();
    updateToolbars();
  }

  function createEdge(fromId, toId, fromPort = 'bottom', toPort = 'top', label = '', style = 'normal') {
    if (fromId === toId) return null;
    const exists = state.edges.some(e => e.from === fromId && e.to === toId);
    if (exists) return null;

    const edge = {
      id: `edge_${fromId}_${toId}_${Date.now().toString(36)}`,
      from: fromId,
      to: toId,
      fromPort: fromPort,
      toPort: toPort,
      label: label || '',
      style: style || 'normal'
    };

    state.edges.push(edge);
    state.selectedEdgeId = edge.id;
    state.selectedNodeIds.clear();
    hideToolbars();

    render();
    saveState();

    const fromNode = state.nodes.find(n => n.id === fromId);
    if (fromNode && fromNode.shape === 'decision' && !label) {
      setTimeout(() => showEdgePopoverForEdge(edge), 40);
    }

    return edge;
  }

  function quickAddBranch(fromNodeId, conditionLabel = '') {
    const fromNode = state.nodes.find(n => n.id === fromNodeId);
    if (!fromNode) return;

    const isHorizontal = state.direction === 'LR' || state.direction === 'RL';
    let newX = fromNode.x;
    let newY = fromNode.y;

    if (conditionLabel === 'Sí') {
      newX = isHorizontal ? fromNode.x + fromNode.width + 90 : fromNode.x - 130;
      newY = isHorizontal ? fromNode.y - 80 : fromNode.y + fromNode.height + 80;
    } else if (conditionLabel === 'No') {
      newX = isHorizontal ? fromNode.x + fromNode.width + 90 : fromNode.x + 130;
      newY = isHorizontal ? fromNode.y + 80 : fromNode.y + fromNode.height + 80;
    } else {
      newX = isHorizontal ? fromNode.x + fromNode.width + 90 : fromNode.x;
      newY = isHorizontal ? fromNode.y : fromNode.y + fromNode.height + 80;
    }

    const nextText = conditionLabel === 'Sí' ? 'Acción Sí' : (conditionLabel === 'No' ? 'Acción No' : 'Siguiente Paso');
    const newNode = createNode('process', newX, newY, nextText, fromNode.color);
    if (fromNode.subgraph) newNode.subgraph = fromNode.subgraph;
    createEdge(fromNode.id, newNode.id, 'bottom', 'top', conditionLabel, 'normal');

    autoLayout(true);
  }

  function deleteSelected() {
    let modified = false;
    if (state.selectedNodeIds.size > 0) {
      const idsToDelete = new Set(state.selectedNodeIds);
      state.nodes = state.nodes.filter(n => !idsToDelete.has(n.id));
      state.edges = state.edges.filter(e => !idsToDelete.has(e.from) && !idsToDelete.has(e.to));
      state.selectedNodeIds.clear();
      hideToolbars();
      modified = true;
    } else if (state.selectedEdgeId) {
      const id = state.selectedEdgeId;
      state.edges = state.edges.filter(e => e.id !== id);
      state.selectedEdgeId = null;
      hideEdgePopover();
      modified = true;
    }

    if (modified) {
      render();
      saveState();
      showToast('🗑️ Elementos eliminados');
    }
  }

  // --- ROBUST BIDIRECTIONAL PARSER WITH SUBGRAPH SUPPORT ---
  function parseAndApplyMermaidCode(code, triggerToast = true) {
    if (!code || !code.trim()) return false;

    try {
      const lines = code.split('\n');
      let detectedDir = state.direction;
      const subgraphsMap = new Map();
      let currentSg = null;
      const nodesMap = new Map();
      const newEdges = [];

      function cleanStr(s) {
        if (!s) return '';
        return s.trim().replace(/^["']|["']$/g, '').replace(/<br\s*[\/]?>/gi, '\n').trim();
      }

      for (let rawLine of lines) {
        let line = rawLine.trim();
        const dirMatch = line.match(/^(?:flowchart|graph)\s+(TD|TB|LR|BT|RL)/i);
        if (dirMatch) {
          const d = dirMatch[1].toUpperCase();
          detectedDir = (d === 'TB') ? 'TD' : d;
          break;
        }
      }

      const nodeShapeRegex = /([a-zA-Z0-9_]+)\s*(?:(\[\[(.*?)\]\])|(\(\[(.*?)\]\))|(\[\((.*?)\)\])|(\[\/(.*?)\/\])|(\[\\(.*?)\\\])|(\{(.*?)\})|(\[(.*?)\]))/g;
      const connFinder = /([a-zA-Z0-9_]+)\s*(?:(-->|==>|-\.->|---|--\s*["']?(.*?)["']?\s*-->|==\s*["']?(.*?)["']?\s*==>|-\.\s*["']?(.*?)["']?\s*\.->|-->\s*\|(.*?)\||\=\=>\s*\|(.*?)\||\-\.->\s*\|(.*?)\|))\s*([a-zA-Z0-9_]+)/g;

      for (let rawLine of lines) {
        let line = rawLine.trim();
        if (!line || line.startsWith('%%') || line.startsWith('style ') || line.startsWith('classDef') || line.startsWith('class ')) {
          continue;
        }
        if (/^(?:flowchart|graph)\s+/i.test(line)) continue;

        // Subgraph begin
        const sgMatch = line.match(/^subgraph\s+([a-zA-Z0-9_]+)(?:\s*\["?(.*?)"?\])?/i);
        if (sgMatch) {
          currentSg = sgMatch[1];
          const sgTitle = cleanStr(sgMatch[2]) || currentSg;
          subgraphsMap.set(currentSg, { id: currentSg, title: sgTitle });
          continue;
        }

        // Subgraph end
        if (line.toLowerCase() === 'end') {
          currentSg = null;
          continue;
        }

        // Parse node shapes
        let match;
        nodeShapeRegex.lastIndex = 0;
        while ((match = nodeShapeRegex.exec(line)) !== null) {
          const nid = match[1];
          let shape = 'process';
          let lbl = nid;

          if (match[2] !== undefined) { shape = 'subroutine'; lbl = match[3]; }
          else if (match[4] !== undefined) { shape = 'terminal'; lbl = match[5]; }
          else if (match[6] !== undefined) { shape = 'database'; lbl = match[7]; }
          else if (match[8] !== undefined) { shape = 'io'; lbl = match[9]; }
          else if (match[10] !== undefined) { shape = 'io'; lbl = match[11]; }
          else if (match[12] !== undefined) { shape = 'decision'; lbl = match[13]; }
          else if (match[14] !== undefined) { shape = 'process'; lbl = match[15]; }

          lbl = cleanStr(lbl);
          const dims = computeNodeDimensions(shape, lbl);

          if (!nodesMap.has(nid)) {
            let nodeColor = 'sky';
            if (shape === 'terminal') nodeColor = 'emerald';
            else if (shape === 'decision') nodeColor = 'amber';
            else if (shape === 'database') nodeColor = 'purple';
            else if (shape === 'io') nodeColor = 'cyan';
            else if (shape === 'subroutine') nodeColor = 'purple';

            const existing = state.nodes.find(n => n.id === nid);
            nodesMap.set(nid, {
              id: nid,
              shape: shape,
              color: existing ? existing.color : nodeColor,
              label: lbl,
              subgraph: currentSg,
              x: existing ? existing.x : 0,
              y: existing ? existing.y : 0,
              width: dims.width,
              height: dims.height
            });
          } else {
            const n = nodesMap.get(nid);
            if (lbl) n.label = lbl;
            if (shape !== 'process') {
              n.shape = shape;
              n.width = dims.width;
              n.height = dims.height;
            }
            if (currentSg) n.subgraph = currentSg;
          }
        }

        // Parse connections
        const normalized = line.replace(nodeShapeRegex, '$1');
        let cm;
        connFinder.lastIndex = 0;
        while ((cm = connFinder.exec(normalized)) !== null) {
          const src = cm[1];
          const tgt = cm[9];
          let style = 'normal';
          let lbl = '';
          const fullConn = cm[0];

          if (fullConn.includes('==>')) style = 'thick';
          else if (fullConn.includes('-.->') || fullConn.includes('.-')) style = 'dotted';
          else if (fullConn.includes('---')) style = 'open';

          for (let idx of [3, 4, 5, 6, 7, 8]) {
            if (cm[idx]) {
              lbl = cleanStr(cm[idx]);
              break;
            }
          }

          if (!nodesMap.has(src)) {
            const sDims = computeNodeDimensions('process', src);
            nodesMap.set(src, { id: src, shape: 'process', color: 'sky', label: src, subgraph: currentSg, x: 0, y: 0, width: sDims.width, height: sDims.height });
          }
          if (!nodesMap.has(tgt)) {
            const tDims = computeNodeDimensions('process', tgt);
            nodesMap.set(tgt, { id: tgt, shape: 'process', color: 'sky', label: tgt, subgraph: currentSg, x: 0, y: 0, width: tDims.width, height: tDims.height });
          }

          newEdges.push({
            id: `edge_${src}_${tgt}_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 4)}`,
            from: src,
            to: tgt,
            fromPort: 'bottom',
            toPort: 'top',
            label: lbl,
            style: style
          });
        }
      }

      if (nodesMap.size === 0) return false;

      state.direction = detectedDir;
      if (dom.selectDirection) dom.selectDirection.value = detectedDir;

      state.subgraphs = Array.from(subgraphsMap.values());
      state.nodes = Array.from(nodesMap.values());
      state.edges = newEdges;

      render();
      autoLayout(true);
      saveState(false);

      if (dom.syncStatus) {
        dom.syncStatus.textContent = '⚡ Sincronizado';
        dom.syncStatus.style.color = '#10b981';
      }

      if (triggerToast) {
        showToast(`✨ ${state.nodes.length} nodos y ${newEdges.length} conexiones importados`);
      }
      return true;

    } catch (err) {
      console.warn('Error parsing Mermaid code:', err);
      if (dom.syncStatus) {
        dom.syncStatus.textContent = '✍️ Escribiendo...';
        dom.syncStatus.style.color = '#f59e0b';
      }
      return false;
    }
  }

  // --- SMART AUTO-LAYOUT WITH SUBGRAPH & CYCLE RESOLUTION ---
  function autoLayout(animate = true) {
    if (state.nodes.length === 0) return;

    const targetPositions = {};

    if (state.subgraphs.length > 0) {
      // 1. Modular Subgraph Layout
      const sgMap = new Map(state.subgraphs.map(s => [s.id, s]));
      const sgNodes = new Map();
      const standaloneNodes = [];

      state.nodes.forEach(n => {
        if (n.subgraph && sgMap.has(n.subgraph)) {
          if (!sgNodes.has(n.subgraph)) sgNodes.set(n.subgraph, []);
          sgNodes.get(n.subgraph).push(n);
        } else {
          standaloneNodes.append ? standaloneNodes.append(n) : standaloneNodes.push(n);
        }
      });

      const sgLayouts = [];

      state.subgraphs.forEach(sg => {
        const nList = sgNodes.get(sg.id) || [];
        if (nList.length === 0) return;

        // DFS Cycle Detection for this subgraph
        const nodeIds = new Set(nList.map(n => n.id));
        const adj = new Map(nList.map(n => [n.id, []]));
        state.edges.forEach(e => {
          if (nodeIds.has(e.from) && nodeIds.has(e.to)) {
            adj.get(e.from).push(e.to);
          }
        });

        const visited = new Map(nList.map(n => [n.id, 0]));
        const backEdges = new Set();

        function dfs(u) {
          visited.set(u, 1);
          (adj.get(u) || []).forEach(v => {
            if (visited.get(v) === 1) backEdges.add(`${u}->${v}`);
            else if (visited.get(v) === 0) dfs(v);
          });
          visited.set(u, 2);
        }

        nList.forEach(n => {
          if (visited.get(n.id) === 0) dfs(n.id);
        });

        // Topological Ranking on forward edges
        const forwardAdj = new Map(nList.map(n => [n.id, []]));
        const inDegree = new Map(nList.map(n => [n.id, 0]));

        state.edges.forEach(e => {
          if (nodeIds.has(e.from) && nodeIds.has(e.to)) {
            if (!backEdges.has(`${e.from}->${e.to}`)) {
              forwardAdj.get(e.from).push(e.to);
              inDegree.set(e.to, inDegree.get(e.to) + 1);
            }
          }
        });

        const ranks = new Map();
        const queue = nList.filter(n => inDegree.get(n.id) === 0).map(n => n.id);
        if (queue.length === 0 && nList.length > 0) queue.push(nList[0].id);
        queue.forEach(id => ranks.set(id, 0));

        let maxRank = 0;
        while (queue.length > 0) {
          const u = queue.shift();
          const currR = ranks.get(u) || 0;
          (forwardAdj.get(u) || []).forEach(v => {
            const nextR = currR + 1;
            if (!ranks.has(v) || nextR > ranks.get(v)) {
              ranks.set(v, nextR);
              if (nextR > maxRank) maxRank = nextR;
            }
            inDegree.set(v, inDegree.get(v) - 1);
            if (inDegree.get(v) === 0) queue.push(v);
          });
        }

        nList.forEach(n => {
          if (!ranks.has(n.id)) ranks.set(n.id, 0);
        });

        const layers = [];
        for (let r = 0; r <= maxRank; r++) layers[r] = [];
        nList.forEach(n => layers[ranks.get(n.id)].push(n));

        // Place nodes locally within subgraph
        const layerSpacing = 100;
        const nodeSpacing = 240;
        const localPos = new Map();
        let maxW = 0, maxH = 0;

        layers.forEach((layerNodes, r) => {
          const totalW = (layerNodes.length - 1) * nodeSpacing;
          layerNodes.forEach((n, i) => {
            const lx = 32 + (i * nodeSpacing);
            const ly = 56 + (r * layerSpacing);
            localPos.set(n.id, { x: lx, y: ly, width: n.width || 140, height: n.height || 52 });
            if (lx + (n.width || 140) > maxW) maxW = lx + (n.width || 140);
            if (ly + (n.height || 52) > maxH) maxH = ly + (n.height || 52);
          });
        });

        sgLayouts.push({
          id: sg.id,
          title: sg.title,
          width: Math.max(maxW + 36, 320),
          height: Math.max(maxH + 36, 160),
          localPos: localPos,
          nodes: nList
        });
      });

      // Arrange Subgraphs into clean columns (Balanced Grid)
      const numCols = sgLayouts.length >= 3 ? 3 : (sgLayouts.length === 2 ? 2 : 1);
      const cols = Array.from({ length: numCols }, () => []);
      
      if (sgLayouts.length === 4) {
        cols[0].push(sgLayouts[0], sgLayouts[1]); // Main & Coordinator
        cols[1].push(sgLayouts[2]);               // Validator
        cols[2].push(sgLayouts[3]);               // Digit
      } else {
        sgLayouts.forEach((sgl, idx) => {
          cols[idx % numCols].push(sgl);
        });
      }

      let currX = 80;
      const startY = 90;
      const colGap = 70;
      const rowGap = 50;

      cols.forEach(colSgs => {
        if (colSgs.length === 0) return;
        const colWidth = Math.max(...colSgs.map(s => s.width));
        let currY = startY;

        colSgs.forEach(sgl => {
          sgl.localPos.forEach((lpos, nid) => {
            targetPositions[nid] = {
              x: currX + lpos.x,
              y: currY + lpos.y
            };
          });
          currY += sgl.height + rowGap;
        });

        currX += colWidth + colGap;
      });

    } else {
      // 2. Global DAG Layout with Cycle Detection
      const isHorizontal = state.direction === 'LR' || state.direction === 'RL';
      const isReversed = state.direction === 'BT' || state.direction === 'RL';

      const nodeIds = new Set(state.nodes.map(n => n.id));
      const adj = new Map(state.nodes.map(n => [n.id, []]));
      state.edges.forEach(e => {
        if (adj.has(e.from) && nodeIds.has(e.to)) {
          adj.get(e.from).push(e.to);
        }
      });

      const visited = new Map(state.nodes.map(n => [n.id, 0]));
      const backEdges = new Set();

      function dfs(u) {
        visited.set(u, 1);
        (adj.get(u) || []).forEach(v => {
          if (visited.get(v) === 1) backEdges.add(`${u}->${v}`);
          else if (visited.get(v) === 0) dfs(v);
        });
        visited.set(u, 2);
      }

      state.nodes.forEach(n => {
        if (visited.get(n.id) === 0) dfs(n.id);
      });

      const forwardAdj = new Map(state.nodes.map(n => [n.id, []]));
      const inDegree = new Map(state.nodes.map(n => [n.id, 0]));

      state.edges.forEach(e => {
        if (nodeIds.has(e.from) && nodeIds.has(e.to)) {
          if (!backEdges.has(`${e.from}->${e.to}`)) {
            forwardAdj.get(e.from).push(e.to);
            inDegree.set(e.to, inDegree.get(e.to) + 1);
          }
        }
      });

      const ranks = new Map();
      const queue = state.nodes.filter(n => inDegree.get(n.id) === 0).map(n => n.id);
      if (queue.length === 0 && state.nodes.length > 0) queue.push(state.nodes[0].id);
      queue.forEach(id => ranks.set(id, 0));

      let maxRank = 0;
      while (queue.length > 0) {
        const u = queue.shift();
        const currR = ranks.get(u) || 0;
        (forwardAdj.get(u) || []).forEach(v => {
          const nextR = currR + 1;
          if (!ranks.has(v) || nextR > ranks.get(v)) {
            ranks.set(v, nextR);
            if (nextR > maxRank) maxRank = nextR;
          }
          inDegree.set(v, inDegree.get(v) - 1);
          if (inDegree.get(v) === 0) queue.push(v);
        });
      }

      state.nodes.forEach(n => {
        if (!ranks.has(n.id)) ranks.set(n.id, 0);
      });

      const layers = [];
      for (let r = 0; r <= maxRank; r++) layers[r] = [];
      state.nodes.forEach(n => layers[ranks.get(n.id)].push(n));

      const layerSpacing = isHorizontal ? 280 : 160;
      const nodeSpacing = isHorizontal ? 130 : 250;
      const startX = 140;
      const startY = 110;

      layers.forEach((layerNodes, r) => {
        const layerIndex = isReversed ? (layers.length - 1 - r) : r;
        const totalSpan = (layerNodes.length - 1) * nodeSpacing;

        layerNodes.forEach((node, i) => {
          const offset = (i * nodeSpacing) - (totalSpan / 2);
          if (isHorizontal) {
            targetPositions[node.id] = {
              x: startX + (layerIndex * layerSpacing),
              y: startY + 220 + offset
            };
          } else {
            targetPositions[node.id] = {
              x: startX + 380 + offset,
              y: startY + (layerIndex * layerSpacing)
            };
          }
        });
      });
    }

    if (animate) {
      animateLayout(targetPositions);
    } else {
      state.nodes.forEach(node => {
        if (targetPositions[node.id]) {
          node.x = targetPositions[node.id].x;
          node.y = targetPositions[node.id].y;
        }
      });
      render();
      saveState();
    }
  }

  function animateLayout(targetPositions) {
    const startTime = performance.now();
    const duration = 260;
    const initialPositions = {};

    state.nodes.forEach(node => {
      initialPositions[node.id] = { x: node.x, y: node.y };
    });

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);

      state.nodes.forEach(node => {
        const initial = initialPositions[node.id];
        const target = targetPositions[node.id];
        if (initial && target) {
          node.x = initial.x + (target.x - initial.x) * ease;
          node.y = initial.y + (target.y - initial.y) * ease;
        }
      });

      render();
      updateToolbars();

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        saveState();
      }
    }

    requestAnimationFrame(step);
  }

  // --- MERMAID CODE GENERATOR ---
  function generateMermaidCode() {
    if (state.nodes.length === 0) {
      return `flowchart ${state.direction}\n    %% Diagrama vacío - Agrega formas desde la barra superior`;
    }

    let code = `flowchart ${state.direction}\n`;

    if (state.subgraphs && state.subgraphs.length > 0) {
      const sgNodeMap = new Map();
      const standalone = [];

      state.nodes.forEach(n => {
        if (n.subgraph) {
          if (!sgNodeMap.has(n.subgraph)) sgNodeMap.set(n.subgraph, []);
          sgNodeMap.get(n.subgraph).push(n);
        } else {
          standalone.push(n);
        }
      });

      state.subgraphs.forEach(sg => {
        const sNodes = sgNodeMap.get(sg.id) || [];
        if (sNodes.length > 0) {
          code += `    subgraph ${sg.id} ["${sg.title}"]\n`;
          sNodes.forEach(node => {
            const shapeDef = SHAPES[node.shape] || SHAPES.process;
            const cleanLabel = (node.label || 'Nodo').replace(/"/g, "'").replace(/\n/g, '<br/>');
            code += `        ${node.id}${shapeDef.prefix}"${cleanLabel}"${shapeDef.suffix}\n`;
          });
          code += `    end\n\n`;
        }
      });

      if (standalone.length > 0) {
        code += `    %% Nodos independientes\n`;
        standalone.forEach(node => {
          const shapeDef = SHAPES[node.shape] || SHAPES.process;
          const cleanLabel = (node.label || 'Nodo').replace(/"/g, "'").replace(/\n/g, '<br/>');
          code += `    ${node.id}${shapeDef.prefix}"${cleanLabel}"${shapeDef.suffix}\n`;
        });
        code += `\n`;
      }
    } else {
      code += `    %% Nodos\n`;
      state.nodes.forEach(node => {
        const shapeDef = SHAPES[node.shape] || SHAPES.process;
        const cleanLabel = (node.label || 'Nodo').replace(/"/g, "'").replace(/\n/g, '<br/>');
        code += `    ${node.id}${shapeDef.prefix}"${cleanLabel}"${shapeDef.suffix}\n`;
      });
    }

    if (state.edges.length > 0) {
      code += `    %% Conexiones\n`;
      state.edges.forEach(edge => {
        let connector = '-->';
        if (edge.style === 'dotted') connector = '-.->';
        else if (edge.style === 'thick') connector = '==>';
        else if (edge.style === 'open') connector = '---';

        const label = (edge.label || '').trim();
        if (label) {
          const clean = label.replace(/"/g, "'");
          if (edge.style === 'dotted') {
            code += `    ${edge.from} -.-> |"${clean}"| ${edge.to}\n`;
          } else if (edge.style === 'thick') {
            code += `    ${edge.from} ==> |"${clean}"| ${edge.to}\n`;
          } else {
            code += `    ${edge.from} -- "${clean}" --> ${edge.to}\n`;
          }
        } else {
          code += `    ${edge.from} ${connector} ${edge.to}\n`;
        }
      });
    }

    return code;
  }

  function updateMermaidCode() {
    if (dom.mermaidCode && !state.isTypingCode) {
      dom.mermaidCode.value = generateMermaidCode();
      if (dom.syncStatus) {
        dom.syncStatus.textContent = '⚡ Sincronizado';
        dom.syncStatus.style.color = '#10b981';
      }
    }
  }

  function updateStats() {
    if (dom.statNodes) dom.statNodes.textContent = `${state.nodes.length} nodos`;
    if (dom.statEdges) dom.statEdges.textContent = `${state.edges.length} conexiones`;
  }

  // --- RENDERING CANVAS ---
  function render() {
    renderSubgraphs();
    renderNodes();
    renderEdges();
  }

  function renderSubgraphs() {
    if (!dom.subgraphsLayer) return;
    dom.subgraphsLayer.innerHTML = '';

    if (!state.subgraphs || state.subgraphs.length === 0) return;

    state.subgraphs.forEach(sg => {
      const memberNodes = state.nodes.filter(n => n.subgraph === sg.id);
      if (memberNodes.length === 0) return;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      memberNodes.forEach(n => {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + (n.width || 140));
        maxY = Math.max(maxY, n.y + (n.height || 52));
      });

      const padX = 22;
      const padTop = 44;
      const padBottom = 22;

      const sgEl = document.createElement('div');
      sgEl.className = 'canvas-subgraph';
      sgEl.style.left = `${minX - padX}px`;
      sgEl.style.top = `${minY - padTop}px`;
      sgEl.style.width = `${maxX - minX + padX * 2}px`;
      sgEl.style.height = `${maxY - minY + padTop + padBottom}px`;

      const header = document.createElement('div');
      header.className = 'subgraph-header';
      header.innerHTML = `<span>📦 ${sg.title}</span>`;
      sgEl.appendChild(header);

      dom.subgraphsLayer.appendChild(sgEl);
    });
  }

  function renderNodes() {
    if (!dom.nodesLayer) return;
    dom.nodesLayer.innerHTML = '';

    state.nodes.forEach(node => {
      const shapeDef = SHAPES[node.shape] || SHAPES.process;
      const dims = computeNodeDimensions(node.shape, node.label);
      node.width = dims.width;
      node.height = dims.height;

      const w = node.width;
      const h = node.height;
      const isSelected = state.selectedNodeIds.has(node.id);
      const isEditing = state.editingNodeId === node.id;

      const nodeEl = document.createElement('div');
      nodeEl.className = `canvas-node color-${node.color || 'emerald'} ${isSelected ? 'selected' : ''}`;
      nodeEl.style.left = `${node.x}px`;
      nodeEl.style.top = `${node.y}px`;
      nodeEl.style.width = `${w}px`;
      nodeEl.style.height = `${h}px`;
      nodeEl.dataset.id = node.id;

      // 1. Dynamic SVG Vector Shape
      const svgBg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svgBg.setAttribute('class', 'node-vector-svg');
      svgBg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      svgBg.innerHTML = shapeDef.generateSvg(w, h);
      nodeEl.appendChild(svgBg);

      // 2. Overlaid Text Label or Input
      if (isEditing) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'node-inline-input';
        input.value = node.label;
        input.addEventListener('blur', () => {
          updateNodeText(node.id, input.value);
          state.editingNodeId = null;
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') input.blur();
          if (e.key === 'Escape') {
            state.editingNodeId = null;
            render();
            updateToolbars();
          }
        });
        nodeEl.appendChild(input);
        setTimeout(() => { input.focus(); input.select(); }, 10);
      } else {
        const labelDiv = document.createElement('div');
        labelDiv.className = 'node-label-view';
        labelDiv.innerHTML = (node.label || shapeDef.defaultText).replace(/\n/g, '<br/>');
        nodeEl.appendChild(labelDiv);
      }

      // 3. 4 Connection Ports at precise shape edges
      ['top', 'right', 'bottom', 'left'].forEach(portPos => {
        const port = document.createElement('div');
        port.className = `node-port port-${portPos}`;
        port.dataset.port = portPos;
        port.dataset.nodeId = node.id;
        nodeEl.appendChild(port);
      });

      dom.nodesLayer.appendChild(nodeEl);
    });
  }

  function renderEdges() {
    if (!dom.edgesLayer) return;
    dom.edgesLayer.innerHTML = '';

    state.edges.forEach(edge => {
      const fromNode = state.nodes.find(n => n.id === edge.from);
      const toNode = state.nodes.find(n => n.id === edge.to);
      if (!fromNode || !toNode) return;

      const p1 = getPortCoordinates(fromNode, edge.fromPort || 'bottom');
      const p2 = getPortCoordinates(toNode, edge.toPort || 'top');
      const isSelected = state.selectedEdgeId === edge.id;

      const pathStr = calculateConnectorPath(p1, p2, edge.fromPort, edge.toPort, state.connStyle);

      // Hit path for smooth clicks
      const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hitPath.setAttribute('d', pathStr);
      hitPath.setAttribute('class', 'edge-hit-path');
      hitPath.dataset.edgeId = edge.id;
      dom.edgesLayer.appendChild(hitPath);

      // Visible line
      const linePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      linePath.setAttribute('d', pathStr);
      linePath.setAttribute('class', `edge-line-path ${edge.style || 'normal'} ${isSelected ? 'selected' : ''}`);
      linePath.setAttribute('marker-end', isSelected ? 'url(#arrow-selected)' : 'url(#arrow-default)');
      linePath.dataset.edgeId = edge.id;
      dom.edgesLayer.appendChild(linePath);

      // Label Badge
      const labelText = (edge.label || '').trim();
      const mid = getPathMidpoint(p1, p2);

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'edge-badge-group');
      g.dataset.edgeId = edge.id;

      let badgeClass = 'edge-badge-bg';
      if (labelText.toLowerCase() === 'sí' || labelText.toLowerCase() === 'si') badgeClass += ' label-yes';
      if (labelText.toLowerCase() === 'no') badgeClass += ' label-no';
      if (labelText.toLowerCase() === 'ok') badgeClass += ' label-ok';

      const displayStr = labelText || (isSelected ? '+ Condición' : '');
      if (displayStr) {
        const textLen = Math.max(displayStr.length * 7.5 + 16, 36);
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', mid.x - textLen / 2);
        rect.setAttribute('y', mid.y - 11);
        rect.setAttribute('width', textLen);
        rect.setAttribute('height', 22);
        rect.setAttribute('class', badgeClass);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', mid.x);
        text.setAttribute('y', mid.y);
        text.setAttribute('class', 'edge-badge-text');
        text.textContent = displayStr;

        g.appendChild(rect);
        g.appendChild(text);
        dom.edgesLayer.appendChild(g);
      }
    });
  }

  function getPortCoordinates(node, port) {
    const w = node.width || 140;
    const h = node.height || 52;
    switch (port) {
      case 'top': return { x: node.x + w / 2, y: node.y };
      case 'bottom': return { x: node.x + w / 2, y: node.y + h };
      case 'left': return { x: node.x, y: node.y + h / 2 };
      case 'right': return { x: node.x + w, y: node.y + h / 2 };
      default: return { x: node.x + w / 2, y: node.y + h };
    }
  }

  function calculateConnectorPath(p1, p2, fromPort, toPort, style = 'curved') {
    if (style === 'straight') {
      return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
    }

    if (style === 'orthogonal') {
      const midY = (p1.y + p2.y) / 2;
      const midX = (p1.x + p2.x) / 2;
      if (fromPort === 'bottom' || fromPort === 'top') {
        return `M ${p1.x} ${p1.y} L ${p1.x} ${midY} L ${p2.x} ${midY} L ${p2.x} ${p2.y}`;
      } else {
        return `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`;
      }
    }

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const curvature = Math.min(dist * 0.45, 80);

    let cx1 = p1.x;
    let cy1 = p1.y;
    let cx2 = p2.x;
    let cy2 = p2.y;

    if (fromPort === 'bottom') cy1 += curvature;
    else if (fromPort === 'top') cy1 -= curvature;
    else if (fromPort === 'left') cx1 -= curvature;
    else if (fromPort === 'right') cx1 += curvature;

    if (toPort === 'bottom') cy2 += curvature;
    else if (toPort === 'top') cy2 -= curvature;
    else if (toPort === 'left') cx2 -= curvature;
    else if (toPort === 'right') cx2 += curvature;

    return `M ${p1.x} ${p1.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${p2.x} ${p2.y}`;
  }

  function getPathMidpoint(p1, p2) {
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  }

  // --- FLOATING TOOLBARS ---
  function updateToolbars() {
    if (state.selectedNodeIds.size === 1) {
      const singleId = Array.from(state.selectedNodeIds)[0];
      const node = state.nodes.find(n => n.id === singleId);
      if (node) {
        positionNodeToolbar(node);
        if (dom.multiSelectToolbar) dom.multiSelectToolbar.classList.remove('visible');
      }
    } else if (state.selectedNodeIds.size > 1) {
      hideSingleNodeToolbar();
      if (dom.multiSelectToolbar) {
        dom.multiSelectCount.textContent = `${state.selectedNodeIds.size} cajas seleccionadas`;
        dom.multiSelectToolbar.classList.add('visible');
      }
    } else {
      hideToolbars();
    }
  }

  function positionNodeToolbar(node) {
    if (!dom.nodeToolbar || !node) return;

    if (dom.nodeBranchActions) {
      if (node.shape === 'decision') {
        dom.nodeBranchActions.innerHTML = `
          <button class="tool-btn tool-btn-yes" data-act="yes">🟢 + Sí</button>
          <button class="tool-btn tool-btn-no" data-act="no">🔴 + No</button>
        `;
      } else {
        dom.nodeBranchActions.innerHTML = `
          <button class="tool-btn tool-btn-next" data-act="next">➕ + Siguiente</button>
        `;
      }
    }

    const nodeWidth = node.width || 140;
    const screenX = (node.x + nodeWidth / 2) * state.zoom + state.pan.x;
    const screenY = node.y * state.zoom + state.pan.y - 44;

    dom.nodeToolbar.style.left = `${screenX}px`;
    dom.nodeToolbar.style.top = `${screenY}px`;
    dom.nodeToolbar.style.transform = 'translateX(-50%)';
    dom.nodeToolbar.classList.add('visible');
  }

  function hideSingleNodeToolbar() {
    if (dom.nodeToolbar) dom.nodeToolbar.classList.remove('visible');
  }

  function hideToolbars() {
    if (dom.nodeToolbar) dom.nodeToolbar.classList.remove('visible');
    if (dom.multiSelectToolbar) dom.multiSelectToolbar.classList.remove('visible');
  }

  function showEdgePopoverForEdge(edge, clientX, clientY) {
    if (!dom.edgePopover || !edge) return;

    if (dom.edgeTextInput) dom.edgeTextInput.value = edge.label || '';
    if (dom.edgeStylePicker) dom.edgeStylePicker.value = edge.style || 'normal';

    const rect = dom.viewport.getBoundingClientRect();
    let popX = 0;
    let popY = 0;

    if (clientX !== undefined && clientY !== undefined) {
      popX = clientX - rect.left + 15;
      popY = clientY - rect.top - 15;
    } else {
      const fromNode = state.nodes.find(n => n.id === edge.from);
      const toNode = state.nodes.find(n => n.id === edge.to);
      if (fromNode && toNode) {
        const mid = getPathMidpoint(
          getPortCoordinates(fromNode, edge.fromPort || 'bottom'),
          getPortCoordinates(toNode, edge.toPort || 'top')
        );
        popX = mid.x * state.zoom + state.pan.x + 15;
        popY = mid.y * state.zoom + state.pan.y - 30;
      }
    }

    if (popX + 270 > rect.width) popX = rect.width - 280;
    if (popY + 200 > rect.height) popY = rect.height - 210;
    if (popX < 10) popX = 10;
    if (popY < 10) popY = 10;

    dom.edgePopover.style.left = `${popX}px`;
    dom.edgePopover.style.top = `${popY}px`;
    dom.edgePopover.classList.add('visible');
  }

  function hideEdgePopover() {
    if (dom.edgePopover) dom.edgePopover.classList.remove('visible');
  }

  // --- EXPORT TOOLS (SVG / PNG / CLIPBOARD) ---
  function generateStandaloneSvg() {
    if (state.nodes.length === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    state.nodes.forEach(n => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + (n.width || 140));
      maxY = Math.max(maxY, n.y + (n.height || 52));
    });

    const pad = 60;
    const w = maxX - minX + pad * 2;
    const h = maxY - minY + pad * 2;
    const ox = minX - pad;
    const oy = minY - pad;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">\n`;
    svg += `  <style>\n`;
    svg += `    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }\n`;
    svg += `    .edge { stroke: #64748b; stroke-width: 2.5px; fill: none; }\n`;
    svg += `    .label-bg { fill: #1e293b; stroke: #475569; rx: 4px; }\n`;
    svg += `    .sg-bg { fill: rgba(30, 41, 59, 0.4); stroke: rgba(56, 189, 248, 0.5); stroke-dasharray: 6 6; rx: 12px; }\n`;
    svg += `  </style>\n`;
    svg += `  <defs>\n`;
    svg += `    <marker id="m-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">\n`;
    svg += `      <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b"/>\n`;
    svg += `    </marker>\n`;
    svg += `  </defs>\n`;
    svg += `  <rect width="100%" height="100%" fill="${state.theme === 'dark' ? '#090d16' : '#ffffff'}"/>\n`;

    // Subgraphs
    if (state.subgraphs) {
      state.subgraphs.forEach(sg => {
        const mNodes = state.nodes.filter(n => n.subgraph === sg.id);
        if (mNodes.length > 0) {
          let sMinX = Infinity, sMinY = Infinity, sMaxX = -Infinity, sMaxY = -Infinity;
          mNodes.forEach(n => {
            sMinX = Math.min(sMinX, n.x);
            sMinY = Math.min(sMinY, n.y);
            sMaxX = Math.max(sMaxX, n.x + (n.width || 140));
            sMaxY = Math.max(sMaxY, n.y + (n.height || 52));
          });
          const sx = sMinX - ox - 20;
          const sy = sMinY - oy - 40;
          const sw = sMaxX - sMinX + 40;
          const sh = sMaxY - sMinY + 60;
          svg += `  <rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" class="sg-bg"/>\n`;
          svg += `  <text x="${sx + 14}" y="${sy + 22}" font-size="12" font-weight="800" fill="#38bdf8">${sg.title}</text>\n`;
        }
      });
    }

    // Edges
    state.edges.forEach(edge => {
      const fn = state.nodes.find(n => n.id === edge.from);
      const tn = state.nodes.find(n => n.id === edge.to);
      if (!fn || !tn) return;

      const p1 = getPortCoordinates(fn, edge.fromPort || 'bottom');
      const p2 = getPortCoordinates(tn, edge.toPort || 'top');
      const d = calculateConnectorPath(
        { x: p1.x - ox, y: p1.y - oy },
        { x: p2.x - ox, y: p2.y - oy },
        edge.fromPort, edge.toPort, state.connStyle
      );
      svg += `  <path d="${d}" class="edge" marker-end="url(#m-arr)"/>\n`;

      if (edge.label) {
        const mid = getPathMidpoint({ x: p1.x - ox, y: p1.y - oy }, { x: p2.x - ox, y: p2.y - oy });
        const tw = Math.max(edge.label.length * 7.5 + 14, 30);
        svg += `  <rect x="${mid.x - tw / 2}" y="${mid.y - 10}" width="${tw}" height="20" class="label-bg"/>\n`;
        svg += `  <text x="${mid.x}" y="${mid.y + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#f8fafc">${edge.label}</text>\n`;
      }
    });

    // Nodes
    state.nodes.forEach(n => {
      const shapeDef = SHAPES[n.shape] || SHAPES.process;
      const nx = n.x - ox;
      const ny = n.y - oy;
      const nw = n.width || 140;
      const nh = n.height || 52;
      const strokeColor = n.color === 'emerald' ? '#10b981' : (n.color === 'amber' ? '#f59e0b' : (n.color === 'purple' ? '#a855f7' : (n.color === 'rose' ? '#ef4444' : '#0284c7')));
      const fillColor = n.color === 'emerald' ? '#064e3b' : (n.color === 'amber' ? '#78350f' : (n.color === 'purple' ? '#581c87' : (n.color === 'rose' ? '#881337' : '#0c4a6e')));

      svg += `  <g transform="translate(${nx}, ${ny})">\n`;
      svg += `    <g fill="${fillColor}" stroke="${strokeColor}" stroke-width="2">\n`;
      svg += `      ${shapeDef.generateSvg(nw, nh)}\n`;
      svg += `    </g>\n`;
      const lines = (n.label || shapeDef.defaultText).split(/\n|<br\s*[\/]?>/i);
      const startTextY = nh / 2 - ((lines.length - 1) * 16) / 2 + 4;
      lines.forEach((line, i) => {
        svg += `    <text x="${nw / 2}" y="${startTextY + i * 16}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#f8fafc">${line.trim()}</text>\n`;
      });
      svg += `  </g>\n`;
    });

    svg += `</svg>`;
    return svg;
  }

  function exportSvg() {
    const svgStr = generateStandaloneSvg();
    if (!svgStr) { showToast('Diagrama vacío'); return; }
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diagrama_${Date.now().toString(36)}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('📐 Vector SVG descargado');
  }

  function copySvg() {
    const svgStr = generateStandaloneSvg();
    if (!svgStr) { showToast('Diagrama vacío'); return; }
    navigator.clipboard.writeText(svgStr).then(() => {
      showToast('📋 SVG copiado al portapapeles');
    }).catch(() => showToast('Error al copiar SVG'));
  }

  function exportPng() {
    const svgStr = generateStandaloneSvg();
    if (!svgStr) { showToast('Diagrama vacío'); return; }

    const img = new Image();
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(blob => {
        const pngUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `diagrama_hd_${Date.now().toString(36)}.png`;
        a.click();
        URL.revokeObjectURL(pngUrl);
        URL.revokeObjectURL(url);
        showToast('🖼️ Imagen PNG (HD 2x) descargada');
      }, 'image/png');
    };
    img.src = url;
  }

  function downloadMmd() {
    const code = generateMermaidCode();
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diagrama_mermaid_${Date.now().toString(36)}.mmd`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('📝 Archivo .mmd descargado');
  }

  function zoomToFit() {
    if (state.nodes.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    state.nodes.forEach(n => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + (n.width || 140));
      maxY = Math.max(maxY, n.y + (n.height || 52));
    });

    const rect = dom.viewport.getBoundingClientRect();
    const graphW = maxX - minX + 160;
    const graphH = maxY - minY + 160;

    const scaleX = rect.width / graphW;
    const scaleY = rect.height / graphH;
    const newZoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.35), 1.5);

    state.zoom = newZoom;
    state.pan.x = (rect.width - (maxX + minX) * newZoom) / 2;
    state.pan.y = (rect.height - (maxY + minY) * newZoom) / 2;

    updateWorldTransform();
    updateToolbars();
    showToast('⊞ Diagrama centrado');
  }

  // --- EVENT LISTENERS ---
  function setupEventListeners() {
    window.addEventListener('resize', updateWorldTransform);
    window.addEventListener('keydown', handleKeyboard);

    // Canvas Mouse & Touch
    dom.viewport.addEventListener('wheel', handleWheel, { passive: false });
    dom.viewport.addEventListener('mousedown', handleCanvasMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    // Double Click on Canvas Background -> Create node
    dom.viewport.addEventListener('dblclick', (e) => {
      if (e.target === dom.viewport || e.target.id === 'svg-canvas' || e.target.id === 'canvas-world' || e.target.id === 'subgraphs-layer') {
        const pt = screenToWorld(e.clientX, e.clientY);
        createNode('process', pt.x - 70, pt.y - 26);
      }
    });

    // Top Floating Dock Buttons
    dom.btnUndo.addEventListener('click', undo);
    dom.btnRedo.addEventListener('click', redo);
    dom.btnClear.addEventListener('click', () => {
      if (confirm('¿Limpiar todo el lienzo?')) {
        state.nodes = [];
        state.edges = [];
        state.subgraphs = [];
        state.selectedNodeIds.clear();
        state.selectedEdgeId = null;
        hideToolbars();
        hideEdgePopover();
        render();
        saveState();
        showToast('Lienzo limpio');
      }
    });
    dom.btnTheme.addEventListener('click', toggleTheme);
    dom.btnCopy.addEventListener('click', copyMermaidCode);

    // Export Dropdown
    dom.btnExportMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      dom.exportDropdown.classList.toggle('visible');
    });
    document.addEventListener('click', () => dom.exportDropdown.classList.remove('visible'));

    dom.btnExportSvg.addEventListener('click', exportSvg);
    dom.btnExportPng.addEventListener('click', exportPng);
    dom.btnCopySvg.addEventListener('click', copySvg);
    dom.btnDownloadMmd.addEventListener('click', downloadMmd);

    // Collapsible Code Panel
    dom.btnToggleCode.addEventListener('click', toggleCodePanel);
    dom.btnCloseCode.addEventListener('click', () => setCodePanel(false));

    // Connector style change
    if (dom.selectConnStyle) {
      dom.selectConnStyle.addEventListener('change', (e) => {
        state.connStyle = e.target.value;
        render();
        saveState();
        showToast(`Flechas: ${e.target.options[e.target.selectedIndex].text}`);
      });
    }

    // Direction & Auto Layout
    dom.selectDirection.addEventListener('change', (e) => {
      state.direction = e.target.value;
      autoLayout(true);
      saveState();
    });
    dom.btnAutoLayout.addEventListener('click', () => autoLayout(true));

    // Zoom Controls
    dom.zoomIn.addEventListener('click', () => setZoom(state.zoom + 0.15));
    dom.zoomOut.addEventListener('click', () => setZoom(state.zoom - 0.15));
    dom.zoomFit.addEventListener('click', zoomToFit);

    // EDITABLE CODE EVENTS
    if (dom.mermaidCode) {
      dom.mermaidCode.addEventListener('focus', () => {
        state.isTypingCode = true;
      });

      dom.mermaidCode.addEventListener('blur', () => {
        state.isTypingCode = false;
        parseAndApplyMermaidCode(dom.mermaidCode.value, false);
      });

      dom.mermaidCode.addEventListener('input', () => {
        state.isTypingCode = true;
        if (dom.syncStatus) {
          dom.syncStatus.textContent = '✍️ Escribiendo...';
          dom.syncStatus.style.color = '#f59e0b';
        }
        clearTimeout(codeDebounceTimer);
        codeDebounceTimer = setTimeout(() => {
          parseAndApplyMermaidCode(dom.mermaidCode.value, false);
          state.isTypingCode = false;
        }, 450);
      });
    }

    if (dom.btnApplyCode) {
      dom.btnApplyCode.addEventListener('click', () => {
        parseAndApplyMermaidCode(dom.mermaidCode.value, true);
      });
    }

    // Templates
    dom.selectTemplate.addEventListener('change', (e) => {
      if (e.target.value) {
        loadTemplate(e.target.value);
        e.target.value = '';
      }
    });

    // Single Node Toolbar Events
    dom.btnNodeEdit.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.selectedNodeIds.size === 1) {
        const singleId = Array.from(state.selectedNodeIds)[0];
        state.editingNodeId = singleId;
        hideToolbars();
        render();
      }
    });

    dom.btnNodeConnect.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.selectedNodeIds.size === 1) {
        const singleId = Array.from(state.selectedNodeIds)[0];
        startConnectMode(singleId);
      }
    });

    dom.btnNodeDelete.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSelected();
    });

    if (dom.btnMultiDelete) {
      dom.btnMultiDelete.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSelected();
      });
    }

    if (dom.nodeBranchActions) {
      dom.nodeBranchActions.addEventListener('click', (e) => {
        const btn = e.target.closest('.tool-btn');
        if (!btn || state.selectedNodeIds.size !== 1) return;
        const singleId = Array.from(state.selectedNodeIds)[0];
        e.stopPropagation();
        const act = btn.dataset.act;
        if (act === 'yes') quickAddBranch(singleId, 'Sí');
        else if (act === 'no') quickAddBranch(singleId, 'No');
        else if (act === 'next') quickAddBranch(singleId, '');
      });
    }

    // Edge Popover Controls
    document.querySelectorAll('.chip-btn').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const edge = state.edges.find(ed => ed.id === state.selectedEdgeId);
        if (edge) {
          edge.label = chip.dataset.val;
          if (dom.edgeTextInput) dom.edgeTextInput.value = edge.label;
          render();
          saveState();
          showToast(edge.label ? `Condición: "${edge.label}"` : 'Sin condición');
        }
      });
    });

    dom.edgeTextInput.addEventListener('input', (e) => {
      const edge = state.edges.find(ed => ed.id === state.selectedEdgeId);
      if (edge) {
        edge.label = e.target.value;
        render();
        saveState();
      }
    });

    dom.edgeStylePicker.addEventListener('change', (e) => {
      const edge = state.edges.find(ed => ed.id === state.selectedEdgeId);
      if (edge) {
        edge.style = e.target.value;
        render();
        saveState();
      }
    });

    dom.btnDeleteEdge.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSelected();
    });

    // Cancel Connect Mode
    dom.btnCancelConnect.addEventListener('click', (e) => {
      e.stopPropagation();
      cancelConnectMode();
    });
  }

  function setupDockButtons() {
    document.querySelectorAll('.dock-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const shape = btn.dataset.shape;
        const rect = dom.viewport.getBoundingClientRect();
        const center = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
        createNode(shape, center.x - 70, center.y - 26, null, state.activeColor);
      });
    });

    document.querySelectorAll('.color-swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        state.activeColor = swatch.dataset.color;

        if (state.selectedNodeIds.size > 0) {
          state.nodes.forEach(node => {
            if (state.selectedNodeIds.has(node.id)) {
              node.color = state.activeColor;
            }
          });
          render();
          saveState();
          updateToolbars();
        }
      });
    });
  }

  // --- MOUSE & TOUCH HANDLERS ---
  function handleCanvasMouseDown(e) {
    if (e.target.classList.contains('node-port')) {
      e.stopPropagation();
      const nodeId = e.target.dataset.nodeId;
      const port = e.target.dataset.port;
      const node = state.nodes.find(n => n.id === nodeId);
      if (node) {
        state.connectingFrom = { nodeId, port };
        const p = getPortCoordinates(node, port);
        dom.tempLine.style.display = 'block';
        dom.tempLine.setAttribute('d', `M ${p.x} ${p.y} L ${p.x} ${p.y}`);
      }
      return;
    }

    const nodeEl = e.target.closest('.canvas-node');
    if (nodeEl) {
      e.stopPropagation();
      const nodeId = nodeEl.dataset.id;

      if (state.connectModeFromId) {
        finishConnectMode(nodeId);
        return;
      }

      if (state.selectedNodeIds.has(nodeId) && e.detail === 2) {
        state.editingNodeId = nodeId;
        hideToolbars();
        render();
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        if (state.selectedNodeIds.has(nodeId)) {
          state.selectedNodeIds.delete(nodeId);
        } else {
          state.selectedNodeIds.add(nodeId);
        }
      } else {
        if (!state.selectedNodeIds.has(nodeId)) {
          state.selectedNodeIds.clear();
          state.selectedNodeIds.add(nodeId);
        }
      }

      state.selectedEdgeId = null;
      hideEdgePopover();

      state.isDraggingNodes = true;
      state.dragStartMouse = { x: e.clientX, y: e.clientY };
      state.dragInitialNodePos.clear();
      state.nodes.forEach(n => {
        if (state.selectedNodeIds.has(n.id)) {
          state.dragInitialNodePos.set(n.id, { x: n.x, y: n.y });
        }
      });

      render();
      updateToolbars();
      return;
    }

    const edgeHit = e.target.closest('.edge-hit-path') || e.target.closest('.edge-badge-group');
    if (edgeHit) {
      e.stopPropagation();
      const edgeId = edgeHit.dataset.edgeId;
      selectEdge(edgeId, e.clientX, e.clientY);
      return;
    }

    if (e.target.closest('#node-floating-toolbar') || e.target.closest('#multi-select-toolbar') || e.target.closest('#edge-floating-popover') || e.target.closest('#floating-dock') || e.target.closest('#sidebar-code') || e.target.closest('#export-dropdown')) {
      return;
    }

    state.selectedNodeIds.clear();
    state.selectedEdgeId = null;
    state.editingNodeId = null;
    hideToolbars();
    hideEdgePopover();
    cancelConnectMode();
    render();

    state.isPanning = true;
    state.panStart = { x: e.clientX - state.pan.x, y: e.clientY - state.pan.y };
  }

  function handleMouseMove(e) {
    if (state.connectingFrom) {
      const fromNode = state.nodes.find(n => n.id === state.connectingFrom.nodeId);
      if (fromNode) {
        const p1 = getPortCoordinates(fromNode, state.connectingFrom.port);
        const pt = screenToWorld(e.clientX, e.clientY);
        dom.tempLine.setAttribute('d', calculateConnectorPath(p1, pt, state.connectingFrom.port, 'top', state.connStyle));
      }
      return;
    }

    if (state.isDraggingNodes) {
      const dx = (e.clientX - state.dragStartMouse.x) / state.zoom;
      const dy = (e.clientY - state.dragStartMouse.y) / state.zoom;

      state.nodes.forEach(node => {
        if (state.dragInitialNodePos.has(node.id)) {
          const initial = state.dragInitialNodePos.get(node.id);
          node.x = Math.round(initial.x + dx);
          node.y = Math.round(initial.y + dy);
        }
      });

      render();
      updateToolbars();
      return;
    }

    if (state.isPanning) {
      state.pan.x = e.clientX - state.panStart.x;
      state.pan.y = e.clientY - state.panStart.y;
      updateWorldTransform();
      updateToolbars();
    }
  }

  function handleMouseUp(e) {
    if (state.connectingFrom) {
      dom.tempLine.style.display = 'none';
      const targetPort = e.target.closest('.node-port');
      const targetNode = e.target.closest('.canvas-node');

      if (targetPort) {
        createEdge(state.connectingFrom.nodeId, targetPort.dataset.nodeId, state.connectingFrom.port, targetPort.dataset.port);
      } else if (targetNode) {
        createEdge(state.connectingFrom.nodeId, targetNode.dataset.id, state.connectingFrom.port, 'top');
      }

      state.connectingFrom = null;
    }

    if (state.isDraggingNodes) {
      state.isDraggingNodes = false;
      saveState();
    }

    if (state.isPanning) {
      state.isPanning = false;
    }
  }

  // --- SHIFT + WHEEL HORIZONTAL PANNING & ZOOM ---
  function handleWheel(e) {
    e.preventDefault();

    if (e.ctrlKey || e.metaKey) {
      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
      const rect = dom.viewport.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const newZoom = Math.min(Math.max(state.zoom * zoomFactor, 0.25), 2.5);
      state.pan.x = mouseX - (mouseX - state.pan.x) * (newZoom / state.zoom);
      state.pan.y = mouseY - (mouseY - state.pan.y) * (newZoom / state.zoom);
      state.zoom = newZoom;

      updateWorldTransform();
      updateToolbars();
      return;
    }

    if (e.shiftKey) {
      const delta = (e.deltaY !== 0 ? e.deltaY : e.deltaX) * 1.1;
      state.pan.x -= delta;
      updateWorldTransform();
      updateToolbars();
      return;
    }

    state.pan.x -= (e.deltaX || 0) * 1.1;
    state.pan.y -= (e.deltaY || 0) * 1.1;
    updateWorldTransform();
    updateToolbars();
  }

  function setZoom(val) {
    state.zoom = Math.min(Math.max(val, 0.25), 2.5);
    updateWorldTransform();
    updateToolbars();
  }

  function updateWorldTransform() {
    if (dom.world) {
      dom.world.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
    }
    if (dom.zoomValue) {
      dom.zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;
    }
  }

  function screenToWorld(clientX, clientY) {
    const rect = dom.viewport.getBoundingClientRect();
    return {
      x: (clientX - rect.left - state.pan.x) / state.zoom,
      y: (clientY - rect.top - state.pan.y) / state.zoom
    };
  }

  // --- CONNECT MODE ---
  function startConnectMode(fromNodeId) {
    state.connectModeFromId = fromNodeId;
    dom.connectBanner.classList.add('visible');
    hideToolbars();
    showToast('🔗 Haz clic en el nodo destino');
  }

  function finishConnectMode(toNodeId) {
    if (state.connectModeFromId && state.connectModeFromId !== toNodeId) {
      createEdge(state.connectModeFromId, toNodeId);
    }
    cancelConnectMode();
  }

  function cancelConnectMode() {
    state.connectModeFromId = null;
    dom.connectBanner.classList.remove('visible');
  }

  // --- EDGE SELECTION ---
  function selectEdge(edgeId, clientX, clientY) {
    state.selectedEdgeId = edgeId;
    state.selectedNodeIds.clear();
    hideToolbars();
    render();

    const edge = state.edges.find(e => e.id === edgeId);
    if (edge) showEdgePopoverForEdge(edge, clientX, clientY);
  }

  // --- CODE PANEL TOGGLE ---
  function toggleCodePanel() {
    setCodePanel(!state.codePanelOpen);
  }

  function setCodePanel(open) {
    state.codePanelOpen = open;
    if (open) {
      dom.sidebarCode.classList.remove('collapsed');
      dom.btnToggleCode.classList.add('active');
    } else {
      dom.sidebarCode.classList.add('collapsed');
      dom.btnToggleCode.classList.remove('active');
    }
  }

  // --- KEYBOARD SHORTCUTS ---
  function handleKeyboard(e) {
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

    if (e.key === 'Delete' || e.key === 'Backspace') {
      deleteSelected();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      redo();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !window.getSelection().toString()) {
      e.preventDefault();
      copyMermaidCode();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      state.nodes.forEach(n => state.selectedNodeIds.add(n.id));
      render();
      updateToolbars();
      showToast(`Seleccionados ${state.nodes.length} nodos`);
    }
  }

  // --- COPY & TOAST ---
  function copyMermaidCode() {
    const code = generateMermaidCode();
    navigator.clipboard.writeText(code).then(() => {
      showToast('📋 ¡Código Mermaid copiado!');
      if (dom.btnCopy) {
        const originalHtml = dom.btnCopy.innerHTML;
        dom.btnCopy.innerHTML = '<span>✅ ¡Copiado!</span>';
        setTimeout(() => dom.btnCopy.innerHTML = originalHtml, 1600);
      }
    }).catch(() => showToast('Selecciona el código manualmente'));
  }

  function showToast(msg) {
    if (!dom.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    dom.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.25s';
      setTimeout(() => toast.remove(), 250);
    }, 2000);
  }

  // --- PRESET TEMPLATES ---
  function loadTemplate(key) {
    const templates = {
      pin_system: {
        direction: 'TD',
        connStyle: 'curved',
        subgraphs: [
          { id: 'BLOQUE_PRINCIPAL', title: 'Programa Principal (__main__)' },
          { id: 'OFICINA_COORDINADORA', title: 'Función: solicitar_pin()' },
          { id: 'OFICINA_VALIDADORA', title: 'Función: es_pin_valido(pin_texto)' },
          { id: 'OFICINA_DIGITO', title: 'Función pura: es_digito(c)' }
        ],
        nodes: [
          // Bloque Principal
          { id: 'A', shape: 'terminal', color: 'emerald', label: 'Inicio', subgraph: 'BLOQUE_PRINCIPAL' },
          { id: 'B', shape: 'process', color: 'sky', label: 'Llamar a solicitar_pin', subgraph: 'BLOQUE_PRINCIPAL' },
          { id: 'C', shape: 'terminal', color: 'emerald', label: 'Fin del Programa', subgraph: 'BLOQUE_PRINCIPAL' },

          // Oficina Coordinadora
          { id: 'F1', shape: 'terminal', color: 'emerald', label: 'Inicio solicitar_pin', subgraph: 'OFICINA_COORDINADORA' },
          { id: 'F2', shape: 'process', color: 'sky', label: 'Iniciar Bucle: while True', subgraph: 'OFICINA_COORDINADORA' },
          { id: 'F3', shape: 'io', color: 'cyan', label: 'Leer entrada del usuario: pin_ingresado', subgraph: 'OFICINA_COORDINADORA' },
          { id: 'F4', shape: 'process', color: 'sky', label: 'Llamar a es_pin_valido(pin_ingresado)', subgraph: 'OFICINA_COORDINADORA' },
          { id: 'F5', shape: 'decision', color: 'amber', label: '¿El resultado devuelto es True?', subgraph: 'OFICINA_COORDINADORA' },
          { id: 'F6', shape: 'process', color: 'emerald', label: "Imprimir: 'Acceso Permitido'", subgraph: 'OFICINA_COORDINADORA' },
          { id: 'F7', shape: 'process', color: 'sky', label: 'Romper bucle: break', subgraph: 'OFICINA_COORDINADORA' },
          { id: 'F8', shape: 'process', color: 'rose', label: "Imprimir: 'PIN Inválido, intente de nuevo'", subgraph: 'OFICINA_COORDINADORA' },
          { id: 'F9', shape: 'terminal', color: 'emerald', label: 'Fin solicitar_pin', subgraph: 'OFICINA_COORDINADORA' },

          // Oficina Validadora
          { id: 'V1', shape: 'terminal', color: 'emerald', label: 'Inicio es_pin_valido', subgraph: 'OFICINA_VALIDADORA' },
          { id: 'V2', shape: 'decision', color: 'amber', label: '¿La longitud de pin_texto es diferente de 4?', subgraph: 'OFICINA_VALIDADORA' },
          { id: 'V3', shape: 'process', color: 'rose', label: 'return False', subgraph: 'OFICINA_VALIDADORA' },
          { id: 'V4', shape: 'process', color: 'sky', label: 'Inicializar: suma_digitos = 0', subgraph: 'OFICINA_VALIDADORA' },
          { id: 'V5', shape: 'process', color: 'sky', label: "Bucle: Para cada 'caracter' en pin_texto", subgraph: 'OFICINA_VALIDADORA' },
          { id: 'V6', shape: 'process', color: 'sky', label: 'Llamar a es_digito(caracter)', subgraph: 'OFICINA_VALIDADORA' },
          { id: 'V7', shape: 'decision', color: 'amber', label: '¿El resultado devuelto es True?', subgraph: 'OFICINA_VALIDADORA' },
          { id: 'V8', shape: 'process', color: 'rose', label: 'return False', subgraph: 'OFICINA_VALIDADORA' },
          { id: 'V9', shape: 'process', color: 'sky', label: "Convertir 'caracter' a entero y sumarlo a suma_digitos", subgraph: 'OFICINA_VALIDADORA' },
          { id: 'V10', shape: 'decision', color: 'amber', label: '¿Quedan más caracteres?', subgraph: 'OFICINA_VALIDADORA' },
          { id: 'V11', shape: 'decision', color: 'amber', label: '¿suma_digitos es par? (suma % 2 == 0)', subgraph: 'OFICINA_VALIDADORA' },
          { id: 'V12', shape: 'process', color: 'emerald', label: 'return True', subgraph: 'OFICINA_VALIDADORA' },
          { id: 'V13', shape: 'process', color: 'rose', label: 'return False', subgraph: 'OFICINA_VALIDADORA' },
          { id: 'V14', shape: 'terminal', color: 'emerald', label: 'Fin de es_pin_valido', subgraph: 'OFICINA_VALIDADORA' },

          // Oficina Digito
          { id: 'D1', shape: 'terminal', color: 'emerald', label: 'Inicio es_digito', subgraph: 'OFICINA_DIGITO' },
          { id: 'D2', shape: 'decision', color: 'amber', label: "¿El carácter 'c' está entre '0' y '9'?", subgraph: 'OFICINA_DIGITO' },
          { id: 'D3', shape: 'process', color: 'emerald', label: 'return True', subgraph: 'OFICINA_DIGITO' },
          { id: 'D4', shape: 'process', color: 'rose', label: 'return False', subgraph: 'OFICINA_DIGITO' },
          { id: 'D5', shape: 'terminal', color: 'emerald', label: 'Fin de es_digito', subgraph: 'OFICINA_DIGITO' }
        ],
        edges: [
          { id: 'e1', from: 'A', to: 'B', style: 'normal' },
          { id: 'e2', from: 'B', to: 'C', style: 'normal' },
          { id: 'e3', from: 'F1', to: 'F2', style: 'normal' },
          { id: 'e4', from: 'F2', to: 'F3', style: 'normal' },
          { id: 'e5', from: 'F3', to: 'F4', style: 'normal' },
          { id: 'e6', from: 'F4', to: 'F5', style: 'normal' },
          { id: 'e7', from: 'F5', to: 'F6', label: 'SÍ', style: 'normal' },
          { id: 'e8', from: 'F6', to: 'F7', style: 'normal' },
          { id: 'e9', from: 'F5', to: 'F8', label: 'NO', style: 'normal' },
          { id: 'e10', from: 'F8', to: 'F2', style: 'normal' },
          { id: 'e11', from: 'F7', to: 'F9', style: 'normal' },
          { id: 'e12', from: 'V1', to: 'V2', style: 'normal' },
          { id: 'e13', from: 'V2', to: 'V3', label: 'SÍ', style: 'normal' },
          { id: 'e14', from: 'V2', to: 'V4', label: 'NO', style: 'normal' },
          { id: 'e15', from: 'V4', to: 'V5', style: 'normal' },
          { id: 'e16', from: 'V5', to: 'V6', style: 'normal' },
          { id: 'e17', from: 'V6', to: 'V7', style: 'normal' },
          { id: 'e18', from: 'V7', to: 'V8', label: 'NO', style: 'normal' },
          { id: 'e19', from: 'V7', to: 'V9', label: 'SÍ', style: 'normal' },
          { id: 'e20', from: 'V9', to: 'V10', style: 'normal' },
          { id: 'e21', from: 'V10', to: 'V5', label: 'SÍ', style: 'normal' },
          { id: 'e22', from: 'V10', to: 'V11', label: 'NO', style: 'normal' },
          { id: 'e23', from: 'V11', to: 'V12', label: 'SÍ', style: 'normal' },
          { id: 'e24', from: 'V11', to: 'V13', label: 'NO', style: 'normal' },
          { id: 'e25', from: 'V3', to: 'V14', style: 'normal' },
          { id: 'e26', from: 'V8', to: 'V14', style: 'normal' },
          { id: 'e27', from: 'V12', to: 'V14', style: 'normal' },
          { id: 'e28', from: 'V13', to: 'V14', style: 'normal' },
          { id: 'e29', from: 'D1', to: 'D2', style: 'normal' },
          { id: 'e30', from: 'D2', to: 'D3', label: 'SÍ', style: 'normal' },
          { id: 'e31', from: 'D2', to: 'D4', label: 'NO', style: 'normal' },
          { id: 'e32', from: 'D3', to: 'D5', style: 'normal' },
          { id: 'e33', from: 'D4', to: 'D5', style: 'normal' },
          // Inter-subgraph links
          { id: 'e34', from: 'B', to: 'F1', style: 'dotted' },
          { id: 'e35', from: 'F9', to: 'C', style: 'dotted' },
          { id: 'e36', from: 'F4', to: 'V1', label: 'Pasa: pin_ingresado', style: 'dotted' },
          { id: 'e37', from: 'V14', to: 'F5', label: 'Devuelve: True/False', style: 'dotted' },
          { id: 'e38', from: 'V6', to: 'D1', label: 'Pasa: caracter', style: 'dotted' },
          { id: 'e39', from: 'D5', to: 'V7', label: 'Devuelve: True/False', style: 'dotted' }
        ]
      },
      auth: {
        direction: 'TD',
        connStyle: 'curved',
        subgraphs: [],
        nodes: [
          { id: 'A', shape: 'terminal', color: 'emerald', label: 'Inicio', x: 200, y: 50 },
          { id: 'B', shape: 'io', color: 'cyan', label: 'Ingresar Credenciales', x: 200, y: 150 },
          { id: 'C', shape: 'decision', color: 'amber', label: '¿Credenciales Válidas?', x: 200, y: 260 },
          { id: 'D', shape: 'process', color: 'sky', label: 'Generar Token JWT', x: 80, y: 390 },
          { id: 'E', shape: 'process', color: 'rose', label: 'Mostrar Error 401', x: 330, y: 390 },
          { id: 'F', shape: 'terminal', color: 'emerald', label: 'Fin', x: 200, y: 510 }
        ],
        edges: [
          { id: 'e1', from: 'A', to: 'B', style: 'normal' },
          { id: 'e2', from: 'B', to: 'C', style: 'normal' },
          { id: 'e3', from: 'C', to: 'D', label: 'Sí', style: 'thick' },
          { id: 'e4', from: 'C', to: 'E', label: 'No', style: 'normal' },
          { id: 'e5', from: 'D', to: 'F', style: 'normal' },
          { id: 'e6', from: 'E', to: 'F', style: 'normal' }
        ]
      },
      payment: {
        direction: 'TD',
        connStyle: 'curved',
        subgraphs: [],
        nodes: [
          { id: 'A', shape: 'terminal', color: 'emerald', label: 'Checkout Carrito', x: 200, y: 50 },
          { id: 'B', shape: 'decision', color: 'amber', label: '¿Tarjeta Válida?', x: 200, y: 160 },
          { id: 'C', shape: 'subroutine', color: 'purple', label: 'Pasarela Stripe', x: 80, y: 290 },
          { id: 'D', shape: 'process', color: 'rose', label: 'Rechazar Pago', x: 340, y: 290 },
          { id: 'E', shape: 'database', color: 'purple', label: 'Guardar Orden en DB', x: 80, y: 410 },
          { id: 'F', shape: 'terminal', color: 'emerald', label: 'Fin', x: 200, y: 530 }
        ],
        edges: [
          { id: 'ep1', from: 'A', to: 'B', style: 'normal' },
          { id: 'ep2', from: 'B', to: 'C', label: 'Sí', style: 'thick' },
          { id: 'ep3', from: 'B', to: 'D', label: 'No', style: 'normal' },
          { id: 'ep4', from: 'C', to: 'E', label: 'Aprobado', style: 'normal' },
          { id: 'ep5', from: 'E', to: 'F', style: 'normal' },
          { id: 'ep6', from: 'D', to: 'F', style: 'normal' }
        ]
      },
      etl: {
        direction: 'LR',
        connStyle: 'curved',
        subgraphs: [],
        nodes: [
          { id: 'A', shape: 'database', color: 'purple', label: 'Fuente CSV / API', x: 50, y: 150 },
          { id: 'B', shape: 'process', color: 'sky', label: 'Extracción Datos', x: 250, y: 150 },
          { id: 'C', shape: 'decision', color: 'amber', label: '¿Schema Válido?', x: 450, y: 150 },
          { id: 'D', shape: 'process', color: 'emerald', label: 'Transformar', x: 680, y: 100 },
          { id: 'E', shape: 'database', color: 'rose', label: 'Dead Letter Queue', x: 680, y: 230 },
          { id: 'F', shape: 'database', color: 'purple', label: 'Data Warehouse', x: 920, y: 100 }
        ],
        edges: [
          { id: 'ee1', from: 'A', to: 'B', style: 'normal' },
          { id: 'ee2', from: 'B', to: 'C', style: 'normal' },
          { id: 'ee3', from: 'C', to: 'D', label: 'Sí', style: 'thick' },
          { id: 'ee4', from: 'C', to: 'E', label: 'No', style: 'dotted' },
          { id: 'ee5', from: 'D', to: 'F', style: 'normal' }
        ]
      },
      blank: {
        direction: 'TD',
        connStyle: 'curved',
        subgraphs: [],
        nodes: [],
        edges: []
      }
    };

    const tpl = templates[key];
    if (tpl) {
      state.nodes = JSON.parse(JSON.stringify(tpl.nodes));
      state.edges = JSON.parse(JSON.stringify(tpl.edges));
      state.subgraphs = JSON.parse(JSON.stringify(tpl.subgraphs || []));
      state.direction = tpl.direction;
      state.connStyle = tpl.connStyle || 'curved';
      if (dom.selectDirection) dom.selectDirection.value = tpl.direction;
      if (dom.selectConnStyle) dom.selectConnStyle.value = state.connStyle;
      state.selectedNodeIds.clear();
      state.selectedEdgeId = null;
      hideToolbars();
      hideEdgePopover();
      render();
      saveState();
      autoLayout(false);
      if (key !== 'blank') showToast(`Plantilla cargada: ${key.toUpperCase()}`);
    }
  }

  // --- BOOTSTRAP ---
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
