/**
 * MermaidFlow Studio - True SVG Vector Flowchart & Bidirectional Mermaid Editor
 * High-Performance Vanilla JS + SVG Architecture
 */

(function () {
  'use strict';

  // --- NODE SHAPE DEFINITIONS WITH PURE VECTOR SVG GENERATORS ---
  const SHAPES = {
    terminal: {
      name: 'Inicio / Fin',
      prefix: '([',
      suffix: '])',
      defaultText: 'Inicio',
      defaultWidth: 140,
      defaultHeight: 52,
      generateSvg: (w, h) => `
        <rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="${(h - 4) / 2}" ry="${(h - 4) / 2}" class="shape-svg-fill" />
      `
    },
    process: {
      name: 'Proceso',
      prefix: '[',
      suffix: ']',
      defaultText: 'Proceso',
      defaultWidth: 140,
      defaultHeight: 52,
      generateSvg: (w, h) => `
        <rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="6" ry="6" class="shape-svg-fill" />
      `
    },
    decision: {
      name: 'Decisión',
      prefix: '{',
      suffix: '}',
      defaultText: '¿Es válido?',
      defaultWidth: 160,
      defaultHeight: 76,
      generateSvg: (w, h) => `
        <polygon points="${w / 2},2 ${w - 2},${h / 2} ${w / 2},${h - 2} 2,${h / 2}" class="shape-svg-fill" />
      `
    },
    database: {
      name: 'Base de Datos',
      prefix: '[(',
      suffix: ')]',
      defaultText: 'Base de Datos',
      defaultWidth: 140,
      defaultHeight: 64,
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
      defaultWidth: 150,
      defaultHeight: 52,
      generateSvg: (w, h) => `
        <polygon points="18,2 ${w - 2},2 ${w - 18},${h - 2} 2,${h - 2}" class="shape-svg-fill" />
      `
    },
    subroutine: {
      name: 'Subproceso',
      prefix: '[[',
      suffix: ']]',
      defaultText: 'Subproceso()',
      defaultWidth: 150,
      defaultHeight: 52,
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
    selectedNodeId: null,
    selectedEdgeId: null,
    editingNodeId: null,
    activeColor: 'emerald',
    direction: 'TD',
    pan: { x: 100, y: 90 },
    zoom: 1,
    isPanning: false,
    panStart: { x: 0, y: 0 },
    dragNodeId: null,
    dragStart: { x: 0, y: 0 },
    nodeStartPos: { x: 0, y: 0 },
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
    svgCanvas: $('svg-canvas'),
    edgesLayer: $('edges-layer'),
    tempLine: $('temp-connecting-line'),
    nodesLayer: $('nodes-layer'),
    nodeToolbar: $('node-floating-toolbar'),
    nodeBranchActions: $('node-branch-actions'),
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
    btnDownloadMmd: $('btn-download-mmd'),
    selectTemplate: $('select-template'),
    selectDirection: $('select-direction'),
    btnAutoLayout: $('btn-auto-layout'),
    zoomIn: $('btn-zoom-in'),
    zoomOut: $('btn-zoom-out'),
    zoomReset: $('btn-zoom-reset'),
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
      loadTemplate('auth');
    }

    updateWorldTransform();
    render();
    saveState();

    setTimeout(() => autoLayout(false), 80);
  }

  // --- STATE PERSISTENCE & HISTORY ---
  function saveState(updateTextarea = true) {
    const snapshot = JSON.stringify({
      nodes: state.nodes,
      edges: state.edges,
      direction: state.direction
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
      state.direction = data.direction || 'TD';
      if (dom.selectDirection) dom.selectDirection.value = state.direction;
      state.selectedNodeId = null;
      state.selectedEdgeId = null;
      hideNodeToolbar();
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
          state.direction = data.direction || 'TD';
          if (dom.selectDirection) dom.selectDirection.value = state.direction;
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
    const nodeColor = color || (shape === 'terminal' ? 'emerald' : (shape === 'decision' ? 'amber' : (shape === 'database' ? 'purple' : state.activeColor)));

    const node = {
      id: getNextNodeId(),
      shape: shape,
      color: nodeColor,
      label: label || shapeDef.defaultText,
      x: Math.round(x),
      y: Math.round(y),
      width: shapeDef.defaultWidth,
      height: shapeDef.defaultHeight
    };

    state.nodes.push(node);
    state.selectedNodeId = node.id;
    state.selectedEdgeId = null;
    hideEdgePopover();

    render();
    saveState();
    positionNodeToolbar(node);
    return node;
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
    state.selectedNodeId = null;
    hideNodeToolbar();

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
      newX = isHorizontal ? fromNode.x + 230 : fromNode.x - 120;
      newY = isHorizontal ? fromNode.y - 80 : fromNode.y + 140;
    } else if (conditionLabel === 'No') {
      newX = isHorizontal ? fromNode.x + 230 : fromNode.x + 120;
      newY = isHorizontal ? fromNode.y + 80 : fromNode.y + 140;
    } else {
      newX = isHorizontal ? fromNode.x + 230 : fromNode.x;
      newY = isHorizontal ? fromNode.y : fromNode.y + 140;
    }

    const nextText = conditionLabel === 'Sí' ? 'Acción Sí' : (conditionLabel === 'No' ? 'Acción No' : 'Siguiente Paso');
    const newNode = createNode('process', newX, newY, nextText, fromNode.color);
    createEdge(fromNode.id, newNode.id, 'bottom', 'top', conditionLabel, 'normal');

    autoLayout(true);
  }

  function deleteSelected() {
    let modified = false;
    if (state.selectedNodeId) {
      const id = state.selectedNodeId;
      state.nodes = state.nodes.filter(n => n.id !== id);
      state.edges = state.edges.filter(e => e.from !== id && e.to !== id);
      state.selectedNodeId = null;
      hideNodeToolbar();
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
      showToast('🗑️ Eliminado');
    }
  }

  // --- ROBUST BIDIRECTIONAL PARSER ---
  function parseAndApplyMermaidCode(code, triggerToast = true) {
    if (!code || !code.trim()) return false;

    try {
      const lines = code.split('\n');
      let detectedDir = state.direction;
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

      for (let rawLine of lines) {
        let line = rawLine.trim();
        if (!line || line.startsWith('%%') || line.startsWith('subgraph') || line === 'end' || line.startsWith('classDef') || line.startsWith('class ') || line.startsWith('style ')) {
          continue;
        }
        if (/^(?:flowchart|graph)\s+/i.test(line)) continue;

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
          const shapeDef = SHAPES[shape] || SHAPES.process;

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
              x: existing ? existing.x : 0,
              y: existing ? existing.y : 0,
              width: shapeDef.defaultWidth,
              height: shapeDef.defaultHeight
            });
          } else {
            const n = nodesMap.get(nid);
            if (lbl) n.label = lbl;
            if (shape !== 'process') {
              n.shape = shape;
              n.width = shapeDef.defaultWidth;
              n.height = shapeDef.defaultHeight;
            }
          }
        }

        const normalized = line.replace(nodeShapeRegex, '$1');
        const connFinder = /([a-zA-Z0-9_]+)\s*(?:(-->|==>|-\.->|---|--\s*["']?(.*?)["']?\s*-->|==\s*["']?(.*?)["']?\s*==>|-\.\s*["']?(.*?)["']?\s*\.->|-->\|(.*?)\||\=\=>\|(.*?)\||\-\.->\|(.*?)\|))\s*([a-zA-Z0-9_]+)/g;

        let cm;
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
            nodesMap.set(src, { id: src, shape: 'process', color: 'sky', label: src, x: 0, y: 0, width: 140, height: 52 });
          }
          if (!nodesMap.has(tgt)) {
            nodesMap.set(tgt, { id: tgt, shape: 'process', color: 'sky', label: tgt, x: 0, y: 0, width: 140, height: 52 });
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

  // --- SMART AUTO-LAYOUT & COLLISION RESOLUTION ---
  function autoLayout(animate = true) {
    if (state.nodes.length === 0) return;

    const isHorizontal = state.direction === 'LR' || state.direction === 'RL';
    const isReversed = state.direction === 'BT' || state.direction === 'RL';

    const inDegree = {};
    const adj = {};
    state.nodes.forEach(n => {
      inDegree[n.id] = 0;
      adj[n.id] = [];
    });

    state.edges.forEach(e => {
      if (adj[e.from] && inDegree[e.to] !== undefined) {
        adj[e.from].push(e.to);
        inDegree[e.to] = (inDegree[e.to] || 0) + 1;
      }
    });

    const ranks = {};
    const queue = [];

    state.nodes.forEach(n => {
      if (inDegree[n.id] === 0) {
        ranks[n.id] = 0;
        queue.push(n.id);
      }
    });

    if (queue.length === 0 && state.nodes.length > 0) {
      ranks[state.nodes[0].id] = 0;
      queue.push(state.nodes[0].id);
    }

    let maxRank = 0;
    const visited = new Set();
    while (queue.length > 0) {
      const u = queue.shift();
      visited.add(u);
      const currentRank = ranks[u] || 0;

      (adj[u] || []).forEach(v => {
        const nextRank = currentRank + 1;
        if (ranks[v] === undefined || nextRank > ranks[v]) {
          ranks[v] = nextRank;
          if (nextRank > maxRank) maxRank = nextRank;
        }
        if (!visited.has(v)) queue.push(v);
      });
    }

    state.nodes.forEach(n => {
      if (ranks[n.id] === undefined) ranks[n.id] = 0;
    });

    const layers = [];
    for (let r = 0; r <= maxRank; r++) layers[r] = [];
    state.nodes.forEach(n => {
      const r = ranks[n.id] || 0;
      layers[r].push(n);
    });

    const layerSpacing = isHorizontal ? 270 : 150;
    const nodeSpacing = isHorizontal ? 120 : 230;
    const startX = 140;
    const startY = 110;

    const targetPositions = {};

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

    // Collision Resolution Pass (AABB Separation)
    const minGap = 24;
    const nodeList = state.nodes.map(n => ({
      id: n.id,
      x: targetPositions[n.id] ? targetPositions[n.id].x : n.x,
      y: targetPositions[n.id] ? targetPositions[n.id].y : n.y,
      width: n.width || 140,
      height: n.height || 52
    }));

    for (let i = 0; i < nodeList.length; i++) {
      for (let j = i + 1; j < nodeList.length; j++) {
        const n1 = nodeList[i];
        const n2 = nodeList[j];
        const overlapX = (n1.x < n2.x + n2.width + minGap) && (n1.x + n1.width + minGap > n2.x);
        const overlapY = (n1.y < n2.y + n2.height + minGap) && (n1.y + n1.height + minGap > n2.y);
        if (overlapX && overlapY) {
          if (isHorizontal) {
            n2.y = n1.y + n1.height + minGap;
            if (targetPositions[n2.id]) targetPositions[n2.id].y = n2.y;
          } else {
            n2.x = n1.x + n1.width + minGap;
            if (targetPositions[n2.id]) targetPositions[n2.id].x = n2.x;
          }
        }
      }
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
      if (state.selectedNodeId) {
        const sel = state.nodes.find(n => n.id === state.selectedNodeId);
        if (sel) positionNodeToolbar(sel);
      }

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
    code += `    %% Nodos\n`;
    state.nodes.forEach(node => {
      const shapeDef = SHAPES[node.shape] || SHAPES.process;
      const cleanLabel = (node.label || 'Nodo')
        .replace(/"/g, "'")
        .replace(/\n/g, '<br/>');
      code += `    ${node.id}${shapeDef.prefix}"${cleanLabel}"${shapeDef.suffix}\n`;
    });

    if (state.edges.length > 0) {
      code += `\n    %% Conexiones\n`;
      state.edges.forEach(edge => {
        let connector = '-->';
        if (edge.style === 'dotted') connector = '-.->';
        else if (edge.style === 'thick') connector = '==>';
        else if (edge.style === 'open') connector = '---';

        const label = (edge.label || '').trim();
        if (label) {
          const clean = label.replace(/"/g, "'");
          if (edge.style === 'normal' || !edge.style) {
            code += `    ${edge.from} -- "${clean}" --> ${edge.to}\n`;
          } else {
            code += `    ${edge.from} ${connector}|"${clean}"| ${edge.to}\n`;
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

  // --- RENDERING CANVAS (AUTHENTIC SVG VECTOR NODES) ---
  function render() {
    renderNodes();
    renderEdges();
  }

  function renderNodes() {
    if (!dom.nodesLayer) return;
    dom.nodesLayer.innerHTML = '';

    state.nodes.forEach(node => {
      const shapeDef = SHAPES[node.shape] || SHAPES.process;
      const w = node.width || shapeDef.defaultWidth;
      const h = node.height || shapeDef.defaultHeight;
      const isSelected = state.selectedNodeId === node.id;
      const isEditing = state.editingNodeId === node.id;

      const nodeEl = document.createElement('div');
      nodeEl.className = `canvas-node color-${node.color || 'emerald'} ${isSelected ? 'selected' : ''}`;
      nodeEl.style.left = `${node.x}px`;
      nodeEl.style.top = `${node.y}px`;
      nodeEl.style.width = `${w}px`;
      nodeEl.style.height = `${h}px`;
      nodeEl.dataset.id = node.id;

      // 1. Pure SVG Vector Graphic Backdrop
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
          node.label = input.value.trim() || shapeDef.defaultText;
          state.editingNodeId = null;
          render();
          saveState();
          positionNodeToolbar(node);
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') input.blur();
          if (e.key === 'Escape') {
            state.editingNodeId = null;
            render();
            positionNodeToolbar(node);
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

      const pathStr = calculateSmoothPath(p1, p2, edge.fromPort, edge.toPort);

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
    const shapeDef = SHAPES[node.shape] || SHAPES.process;
    const w = node.width || shapeDef.defaultWidth;
    const h = node.height || shapeDef.defaultHeight;
    switch (port) {
      case 'top': return { x: node.x + w / 2, y: node.y };
      case 'bottom': return { x: node.x + w / 2, y: node.y + h };
      case 'left': return { x: node.x, y: node.y + h / 2 };
      case 'right': return { x: node.x + w, y: node.y + h / 2 };
      default: return { x: node.x + w / 2, y: node.y + h };
    }
  }

  function calculateSmoothPath(p1, p2, fromPort, toPort) {
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

    const shapeDef = SHAPES[node.shape] || SHAPES.process;
    const nodeWidth = node.width || shapeDef.defaultWidth;
    const screenX = (node.x + nodeWidth / 2) * state.zoom + state.pan.x;
    const screenY = node.y * state.zoom + state.pan.y - 44;

    dom.nodeToolbar.style.left = `${screenX}px`;
    dom.nodeToolbar.style.top = `${screenY}px`;
    dom.nodeToolbar.style.transform = 'translateX(-50%)';
    dom.nodeToolbar.classList.add('visible');
  }

  function hideNodeToolbar() {
    if (dom.nodeToolbar) dom.nodeToolbar.classList.remove('visible');
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

  // --- EVENT LISTENERS ---
  function setupEventListeners() {
    window.addEventListener('resize', updateWorldTransform);
    window.addEventListener('keydown', handleKeyboard);

    // Canvas Mouse & Touch
    dom.viewport.addEventListener('wheel', handleWheel, { passive: false });
    dom.viewport.addEventListener('mousedown', handleCanvasMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    // Double Click on Canvas Background -> Create node instantly right there
    dom.viewport.addEventListener('dblclick', (e) => {
      if (e.target === dom.viewport || e.target.id === 'svg-canvas' || e.target.id === 'canvas-world') {
        const pt = screenToWorld(e.clientX, e.clientY);
        createNode('process', pt.x - 70, pt.y - 26);
      }
    });

    // Top Header Buttons
    dom.btnUndo.addEventListener('click', undo);
    dom.btnRedo.addEventListener('click', redo);
    dom.btnClear.addEventListener('click', () => {
      if (confirm('¿Limpiar todo el lienzo?')) {
        state.nodes = [];
        state.edges = [];
        state.selectedNodeId = null;
        state.selectedEdgeId = null;
        hideNodeToolbar();
        hideEdgePopover();
        render();
        saveState();
        showToast('Lienzo limpio');
      }
    });
    dom.btnTheme.addEventListener('click', toggleTheme);
    dom.btnCopy.addEventListener('click', copyMermaidCode);
    dom.btnDownloadMmd.addEventListener('click', downloadMmd);

    // Collapsible Code Panel
    dom.btnToggleCode.addEventListener('click', toggleCodePanel);
    dom.btnCloseCode.addEventListener('click', () => setCodePanel(false));

    // EDITABLE CODE EVENTS (Bidirectional Live Parsing)
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

      dom.mermaidCode.addEventListener('paste', () => {
        setTimeout(() => {
          parseAndApplyMermaidCode(dom.mermaidCode.value, true);
        }, 50);
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
    dom.zoomReset.addEventListener('click', () => {
      state.zoom = 1;
      state.pan = { x: 100, y: 90 };
      updateWorldTransform();
    });

    // Node Toolbar Events
    dom.btnNodeEdit.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.selectedNodeId) {
        state.editingNodeId = state.selectedNodeId;
        hideNodeToolbar();
        render();
      }
    });

    dom.btnNodeConnect.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.selectedNodeId) startConnectMode(state.selectedNodeId);
    });

    dom.btnNodeDelete.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSelected();
    });

    if (dom.nodeBranchActions) {
      dom.nodeBranchActions.addEventListener('click', (e) => {
        const btn = e.target.closest('.tool-btn');
        if (!btn || !state.selectedNodeId) return;
        e.stopPropagation();
        const act = btn.dataset.act;
        if (act === 'yes') quickAddBranch(state.selectedNodeId, 'Sí');
        else if (act === 'no') quickAddBranch(state.selectedNodeId, 'No');
        else if (act === 'next') quickAddBranch(state.selectedNodeId, '');
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
        const shapeDef = SHAPES[shape] || SHAPES.process;
        createNode(shape, center.x - shapeDef.defaultWidth / 2, center.y - shapeDef.defaultHeight / 2, null, state.activeColor);
      });
    });

    document.querySelectorAll('.color-swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        state.activeColor = swatch.dataset.color;

        if (state.selectedNodeId) {
          const node = state.nodes.find(n => n.id === state.selectedNodeId);
          if (node) {
            node.color = state.activeColor;
            render();
            saveState();
            positionNodeToolbar(node);
          }
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

      if (state.selectedNodeId === nodeId && e.detail === 2) {
        state.editingNodeId = nodeId;
        hideNodeToolbar();
        render();
        return;
      }

      state.selectedNodeId = nodeId;
      state.selectedEdgeId = null;
      hideEdgePopover();
      state.dragNodeId = nodeId;
      state.dragStart = { x: e.clientX, y: e.clientY };
      const n = state.nodes.find(nod => nod.id === nodeId);
      state.nodeStartPos = { x: n.x, y: n.y };
      render();
      positionNodeToolbar(n);
      return;
    }

    const edgeHit = e.target.closest('.edge-hit-path') || e.target.closest('.edge-badge-group');
    if (edgeHit) {
      e.stopPropagation();
      const edgeId = edgeHit.dataset.edgeId;
      selectEdge(edgeId, e.clientX, e.clientY);
      return;
    }

    if (e.target.closest('#node-floating-toolbar') || e.target.closest('#edge-floating-popover') || e.target.closest('#floating-dock') || e.target.closest('#sidebar-code')) {
      return;
    }

    state.selectedNodeId = null;
    state.selectedEdgeId = null;
    state.editingNodeId = null;
    hideNodeToolbar();
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
        dom.tempLine.setAttribute('d', calculateSmoothPath(p1, pt, state.connectingFrom.port, 'top'));
      }
      return;
    }

    if (state.dragNodeId) {
      const dx = (e.clientX - state.dragStart.x) / state.zoom;
      const dy = (e.clientY - state.dragStart.y) / state.zoom;
      const node = state.nodes.find(n => n.id === state.dragNodeId);
      if (node) {
        node.x = Math.round(state.nodeStartPos.x + dx);
        node.y = Math.round(state.nodeStartPos.y + dy);
        render();
        positionNodeToolbar(node);
      }
      return;
    }

    if (state.isPanning) {
      state.pan.x = e.clientX - state.panStart.x;
      state.pan.y = e.clientY - state.panStart.y;
      updateWorldTransform();
      if (state.selectedNodeId) {
        const sel = state.nodes.find(n => n.id === state.selectedNodeId);
        if (sel) positionNodeToolbar(sel);
      }
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

    if (state.dragNodeId) {
      state.dragNodeId = null;
      saveState();
    }

    if (state.isPanning) {
      state.isPanning = false;
    }
  }

  function handleWheel(e) {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
    const rect = dom.viewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const newZoom = Math.min(Math.max(state.zoom * zoomFactor, 0.3), 2.5);
    state.pan.x = mouseX - (mouseX - state.pan.x) * (newZoom / state.zoom);
    state.pan.y = mouseY - (mouseY - state.pan.y) * (newZoom / state.zoom);
    state.zoom = newZoom;

    updateWorldTransform();
    if (state.selectedNodeId) {
      const sel = state.nodes.find(n => n.id === state.selectedNodeId);
      if (sel) positionNodeToolbar(sel);
    }
  }

  function setZoom(val) {
    state.zoom = Math.min(Math.max(val, 0.3), 2.5);
    updateWorldTransform();
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
    hideNodeToolbar();
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
    state.selectedNodeId = null;
    hideNodeToolbar();
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
    }
  }

  // --- COPY & EXPORT ---
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

  function downloadMmd() {
    const code = generateMermaidCode();
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diagrama_mermaid_${Date.now().toString(36)}.mmd`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('💾 Archivo .mmd descargado');
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
      auth: {
        direction: 'TD',
        nodes: [
          { id: 'A', shape: 'terminal', color: 'emerald', label: 'Inicio', x: 200, y: 50, width: 140, height: 52 },
          { id: 'B', shape: 'io', color: 'cyan', label: 'Ingresar Credenciales', x: 200, y: 150, width: 150, height: 52 },
          { id: 'C', shape: 'decision', color: 'amber', label: '¿Credenciales Válidas?', x: 200, y: 260, width: 160, height: 76 },
          { id: 'D', shape: 'process', color: 'sky', label: 'Generar Token JWT', x: 80, y: 390, width: 140, height: 52 },
          { id: 'E', shape: 'process', color: 'rose', label: 'Mostrar Error 401', x: 330, y: 390, width: 140, height: 52 },
          { id: 'F', shape: 'terminal', color: 'emerald', label: 'Fin', x: 200, y: 510, width: 140, height: 52 }
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
        nodes: [
          { id: 'A', shape: 'terminal', color: 'emerald', label: 'Checkout Carrito', x: 200, y: 50, width: 140, height: 52 },
          { id: 'B', shape: 'decision', color: 'amber', label: '¿Tarjeta Válida?', x: 200, y: 160, width: 160, height: 76 },
          { id: 'C', shape: 'subroutine', color: 'purple', label: 'Pasarela Stripe', x: 80, y: 290, width: 150, height: 52 },
          { id: 'D', shape: 'process', color: 'rose', label: 'Rechazar Pago', x: 340, y: 290, width: 140, height: 52 },
          { id: 'E', shape: 'database', color: 'purple', label: 'Guardar Orden en DB', x: 80, y: 410, width: 140, height: 64 },
          { id: 'F', shape: 'terminal', color: 'emerald', label: 'Fin', x: 200, y: 530, width: 140, height: 52 }
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
        nodes: [
          { id: 'A', shape: 'database', color: 'purple', label: 'Fuente CSV / API', x: 50, y: 150, width: 140, height: 64 },
          { id: 'B', shape: 'process', color: 'sky', label: 'Extracción Datos', x: 250, y: 150, width: 140, height: 52 },
          { id: 'C', shape: 'decision', color: 'amber', label: '¿Schema Válido?', x: 450, y: 150, width: 160, height: 76 },
          { id: 'D', shape: 'process', color: 'emerald', label: 'Transformar', x: 680, y: 100, width: 140, height: 52 },
          { id: 'E', shape: 'database', color: 'rose', label: 'Dead Letter Queue', x: 680, y: 230, width: 140, height: 64 },
          { id: 'F', shape: 'database', color: 'purple', label: 'Data Warehouse', x: 920, y: 100, width: 140, height: 64 }
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
        nodes: [],
        edges: []
      }
    };

    const tpl = templates[key];
    if (tpl) {
      state.nodes = JSON.parse(JSON.stringify(tpl.nodes));
      state.edges = JSON.parse(JSON.stringify(tpl.edges));
      state.direction = tpl.direction;
      if (dom.selectDirection) dom.selectDirection.value = tpl.direction;
      state.selectedNodeId = null;
      state.selectedEdgeId = null;
      hideNodeToolbar();
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
