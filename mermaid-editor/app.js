/**
 * MermaidFlow Studio - Core Application Logic
 * Interactive Visual Flowchart to Mermaid Generator with Auto-Layout
 */

(function () {
  'use strict';

  // --- STATE MANAGEMENT ---
  const state = {
    nodes: [],
    edges: [],
    selectedNodeId: null,
    selectedEdgeId: null,
    editingNodeId: null,
    direction: 'TD', // TD, LR, BT, RL
    pan: { x: 80, y: 80 },
    zoom: 1,
    isPanning: false,
    panStart: { x: 0, y: 0 },
    dragNodeId: null,
    dragStart: { x: 0, y: 0 },
    nodeStartPos: { x: 0, y: 0 },
    connectingFrom: null, // { nodeId, port }
    tempEdgeEnd: { x: 0, y: 0 },
    history: [],
    historyIndex: -1,
    theme: 'dark'
  };

  // Node Shape Configurations
  const NODE_TYPES = {
    terminal: { name: 'Inicio / Fin', prefix: '([', suffix: '])', shapeClass: 'shape-terminal', defaultText: 'Inicio' },
    process: { name: 'Proceso', prefix: '[', suffix: ']', shapeClass: 'shape-process', defaultText: 'Proceso' },
    decision: { name: 'Decisión', prefix: '{', suffix: '}', shapeClass: 'shape-decision', defaultText: '¿Es válido?' },
    database: { name: 'Base de Datos', prefix: '[(', suffix: ')]', shapeClass: 'shape-database', defaultText: 'Base de Datos' },
    io: { name: 'Entrada / Salida', prefix: '[/', suffix: '/]', shapeClass: 'shape-io', defaultText: 'Leer Datos' },
    subroutine: { name: 'Subrutina', prefix: '[[', suffix: ']]', shapeClass: 'shape-subroutine', defaultText: 'Subproceso()' }
  };

  // DOM Elements Cache
  const dom = {
    canvasWrapper: document.getElementById('canvas-wrapper'),
    graphCanvas: document.getElementById('graph-canvas'),
    nodesLayer: document.getElementById('nodes-layer'),
    svgLayer: document.getElementById('svg-layer'),
    edgesGroup: document.getElementById('edges-group'),
    tempEdge: document.getElementById('temp-edge'),
    mermaidCode: document.getElementById('mermaid-code'),
    mermaidPreview: document.getElementById('mermaid-preview'),
    copyBtn: document.getElementById('btn-copy'),
    autoLayoutBtn: document.getElementById('btn-auto-layout'),
    directionSelect: document.getElementById('select-direction'),
    zoomInBtn: document.getElementById('btn-zoom-in'),
    zoomOutBtn: document.getElementById('btn-zoom-out'),
    zoomResetBtn: document.getElementById('btn-zoom-reset'),
    zoomLevel: document.getElementById('zoom-level'),
    nodeCount: document.getElementById('node-count'),
    edgeCount: document.getElementById('edge-count'),
    themeToggleBtn: document.getElementById('btn-theme-toggle'),
    templateSelect: document.getElementById('select-template'),
    clearBtn: document.getElementById('btn-clear'),
    exportSvgBtn: document.getElementById('btn-export-svg'),
    exportMmdBtn: document.getElementById('btn-export-mmd'),
    toastContainer: document.getElementById('toast-container'),
    edgePopover: document.getElementById('edge-popover'),
    edgeLabelInput: document.getElementById('edge-label-input'),
    edgeStyleSelect: document.getElementById('edge-style-select'),
    tabCode: document.getElementById('tab-code'),
    tabPreview: document.getElementById('tab-preview')
  };

  // --- INITIALIZATION ---
  function init() {
    loadTheme();
    setupEventListeners();
    setupPaletteDrag();
    
    // Load from local storage or load default template
    if (!loadFromLocalStorage()) {
      loadTemplate('auth');
    }

    updateTransform();
    render();
    saveState();
    
    // Auto-organize on initial load for a pristine first impression
    setTimeout(() => {
      autoLayout(false);
    }, 100);
  }

  // --- LOCAL STORAGE & HISTORY ---
  function saveState() {
    // Record in history stack
    const snapshot = JSON.stringify({
      nodes: state.nodes,
      edges: state.edges,
      direction: state.direction
    });

    if (state.historyIndex < state.history.length - 1) {
      state.history = state.history.slice(0, state.historyIndex + 1);
    }
    state.history.push(snapshot);
    state.historyIndex++;

    // Persist in localStorage
    try {
      localStorage.setItem('mermaidflow_data', snapshot);
    } catch (e) {
      console.warn('LocalStorage full or disabled', e);
    }

    updateMermaidCode();
    updateStats();
  }

  function undo() {
    if (state.historyIndex > 0) {
      state.historyIndex--;
      restoreSnapshot(state.history[state.historyIndex]);
      showToast('Deshacer (Undo)');
    }
  }

  function redo() {
    if (state.historyIndex < state.history.length - 1) {
      state.historyIndex++;
      restoreSnapshot(state.history[state.historyIndex]);
      showToast('Rehacer (Redo)');
    }
  }

  function restoreSnapshot(snapshotStr) {
    try {
      const data = JSON.parse(snapshotStr);
      state.nodes = data.nodes || [];
      state.edges = data.edges || [];
      state.direction = data.direction || 'TD';
      if (dom.directionSelect) dom.directionSelect.value = state.direction;
      state.selectedNodeId = null;
      state.selectedEdgeId = null;
      hideEdgePopover();
      render();
      updateMermaidCode();
      updateStats();
    } catch (e) {
      console.error('Failed to restore snapshot', e);
    }
  }

  function loadFromLocalStorage() {
    try {
      const saved = localStorage.getItem('mermaidflow_data');
      if (saved) {
        const data = JSON.parse(saved);
        if (data.nodes && data.nodes.length > 0) {
          state.nodes = data.nodes;
          state.edges = data.edges || [];
          state.direction = data.direction || 'TD';
          if (dom.directionSelect) dom.directionSelect.value = state.direction;
          return true;
        }
      }
    } catch (e) {
      console.error(e);
    }
    return false;
  }

  // --- THEME ---
  function loadTheme() {
    const savedTheme = localStorage.getItem('mermaidflow_theme') || 'dark';
    state.theme = savedTheme;
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    localStorage.setItem('mermaidflow_theme', state.theme);
    showToast(state.theme === 'dark' ? 'Modo Oscuro Activado' : 'Modo Claro Activado');
  }

  // --- NODE & EDGE CREATION ---
  let nextNodeCounter = 1;

  function createNode(type, x, y, label = null) {
    const typeDef = NODE_TYPES[type] || NODE_TYPES.process;
    
    // Generate clean ID: A, B, C... or N1, N2
    let nodeLetter = String.fromCharCode(65 + ((state.nodes.length) % 26));
    if (state.nodes.some(n => n.id === nodeLetter)) {
      nodeLetter = `Node_${Date.now().toString(36).slice(-4).toUpperCase()}`;
    }

    const node = {
      id: nodeLetter,
      type: type,
      label: label || typeDef.defaultText,
      x: Math.round(x),
      y: Math.round(y),
      width: type === 'decision' ? 160 : 150,
      height: type === 'decision' ? 64 : 56
    };

    state.nodes.push(node);
    state.selectedNodeId = node.id;
    state.selectedEdgeId = null;
    hideEdgePopover();
    
    render();
    saveState();
    return node;
  }

  function createEdge(fromNodeId, toNodeId, fromPort = 'bottom', toPort = 'top', label = '', style = 'normal') {
    if (fromNodeId === toNodeId) return null; // Avoid trivial self loops for clean UI

    // Check if edge already exists
    const exists = state.edges.some(e => e.from === fromNodeId && e.to === toNodeId);
    if (exists) return null;

    const edge = {
      id: `e_${fromNodeId}_${toNodeId}_${Date.now().toString(36)}`,
      from: fromNodeId,
      to: toNodeId,
      fromPort: fromPort,
      toPort: toPort,
      label: label,
      style: style // normal (-->), dotted (-.->), thick (==>), open (---)
    };

    state.edges.push(edge);
    state.selectedEdgeId = edge.id;
    state.selectedNodeId = null;

    render();
    saveState();
    return edge;
  }

  function deleteSelected() {
    let changed = false;
    if (state.selectedNodeId) {
      const id = state.selectedNodeId;
      state.nodes = state.nodes.filter(n => n.id !== id);
      state.edges = state.edges.filter(e => e.from !== id && e.to !== id);
      state.selectedNodeId = null;
      changed = true;
    } else if (state.selectedEdgeId) {
      const id = state.selectedEdgeId;
      state.edges = state.edges.filter(e => e.id !== id);
      state.selectedEdgeId = null;
      hideEdgePopover();
      changed = true;
    }

    if (changed) {
      render();
      saveState();
    }
  }

  // --- AUTO-LAYOUT ENGINE (Sugiyama / Dagre-style Hierarchical Algorithm) ---
  function autoLayout(animate = true) {
    if (state.nodes.length === 0) return;

    showToast('⚡ Auto-organizando diagrama...');

    const isHorizontal = state.direction === 'LR' || state.direction === 'RL';
    const isReversed = state.direction === 'BT' || state.direction === 'RL';

    // 1. Build adjacency list and in-degrees
    const inDegree = {};
    const adj = {};
    const revAdj = {};
    
    state.nodes.forEach(n => {
      inDegree[n.id] = 0;
      adj[n.id] = [];
      revAdj[n.id] = [];
    });

    state.edges.forEach(e => {
      if (adj[e.from] && inDegree[e.to] !== undefined) {
        adj[e.from].push(e.to);
        revAdj[e.to].push(e.from);
        inDegree[e.to] = (inDegree[e.to] || 0) + 1;
      }
    });

    // 2. Assign Ranks (Layers) using Topological Sort / Longest Path
    const ranks = {};
    const visited = new Set();
    const queue = [];

    // Find root nodes
    state.nodes.forEach(n => {
      if (inDegree[n.id] === 0) {
        ranks[n.id] = 0;
        queue.push(n.id);
      }
    });

    // If graph has cycles and no in-degree 0 nodes, pick the first node
    if (queue.length === 0 && state.nodes.length > 0) {
      ranks[state.nodes[0].id] = 0;
      queue.push(state.nodes[0].id);
    }

    // Assign layers with BFS / relaxation
    let maxRank = 0;
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
        if (!visited.has(v)) {
          queue.push(v);
        }
      });
    }

    // Handle any unvisited disconnected nodes
    state.nodes.forEach(n => {
      if (ranks[n.id] === undefined) {
        ranks[n.id] = 0;
      }
    });

    // 3. Group nodes by rank
    const layers = [];
    for (let r = 0; r <= maxRank; r++) {
      layers[r] = [];
    }
    state.nodes.forEach(n => {
      const r = ranks[n.id] || 0;
      if (!layers[r]) layers[r] = [];
      layers[r].push(n);
    });

    // 4. Calculate Coordinates
    const layerSpacing = isHorizontal ? 260 : 130;
    const nodeSpacing = isHorizontal ? 100 : 200;
    const startX = 120;
    const startY = 100;

    const targetPositions = {};

    layers.forEach((layerNodes, r) => {
      const layerIndex = isReversed ? (layers.length - 1 - r) : r;
      const totalWidth = (layerNodes.length - 1) * nodeSpacing;
      
      layerNodes.forEach((node, i) => {
        const offset = (i * nodeSpacing) - (totalWidth / 2);

        if (isHorizontal) {
          targetPositions[node.id] = {
            x: startX + (layerIndex * layerSpacing),
            y: startY + 220 + offset
          };
        } else {
          targetPositions[node.id] = {
            x: startX + 350 + offset,
            y: startY + (layerIndex * layerSpacing)
          };
        }
      });
    });

    // 5. Apply positions (with smooth animation or instant)
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
    const duration = 300; // ms
    const initialPositions = {};

    state.nodes.forEach(node => {
      initialPositions[node.id] = { x: node.x, y: node.y };
    });

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = easeOutCubic(progress);

      state.nodes.forEach(node => {
        const initial = initialPositions[node.id];
        const target = targetPositions[node.id];
        if (initial && target) {
          node.x = initial.x + (target.x - initial.x) * ease;
          node.y = initial.y + (target.y - initial.y) * ease;
        }
      });

      render();

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        saveState();
      }
    }

    requestAnimationFrame(step);
  }

  function easeOutCubic(x) {
    return 1 - Math.pow(1 - x, 3);
  }

  // --- MERMAID GENERATOR (SERIALIZER) ---
  function generateMermaidCode() {
    if (state.nodes.length === 0) {
      return `flowchart ${state.direction}\n    %% Lienzo vacío - Agrega nodos desde la izquierda`;
    }

    let code = `flowchart ${state.direction}\n`;

    // 1. Declare Nodes
    code += `    %% Nodos y Formas\n`;
    state.nodes.forEach(node => {
      const typeDef = NODE_TYPES[node.type] || NODE_TYPES.process;
      const cleanLabel = (node.label || 'Nodo')
        .replace(/"/g, "'")
        .replace(/\n/g, '<br/>');
      
      code += `    ${node.id}${typeDef.prefix}"${cleanLabel}"${typeDef.suffix}\n`;
    });

    // 2. Declare Connections & Edges
    if (state.edges.length > 0) {
      code += `\n    %% Conexiones\n`;
      state.edges.forEach(edge => {
        let connector = '-->';
        if (edge.style === 'dotted') connector = '-.->';
        else if (edge.style === 'thick') connector = '==>';
        else if (edge.style === 'open') connector = '---';

        if (edge.label && edge.label.trim()) {
          const cleanEdgeLabel = edge.label.trim().replace(/"/g, "'");
          if (edge.style === 'normal') {
            code += `    ${edge.from} -- "${cleanEdgeLabel}" --> ${edge.to}\n`;
          } else {
            code += `    ${edge.from} ${connector}|"${cleanEdgeLabel}"| ${edge.to}\n`;
          }
        } else {
          code += `    ${edge.from} ${connector} ${edge.to}\n`;
        }
      });
    }

    return code;
  }

  function updateMermaidCode() {
    const code = generateMermaidCode();
    if (dom.mermaidCode) {
      dom.mermaidCode.value = code;
    }
    renderMermaidPreview(code);
  }

  function renderMermaidPreview(code) {
    if (!dom.mermaidPreview) return;
    
    // Check if mermaid global is loaded
    if (window.mermaid) {
      try {
        window.mermaid.initialize({
          startOnLoad: false,
          theme: state.theme === 'dark' ? 'dark' : 'default',
          securityLevel: 'loose',
          flowchart: { curve: 'basis' }
        });
        
        window.mermaid.render('mermaid-svg-render-' + Date.now(), code)
          .then(result => {
            dom.mermaidPreview.innerHTML = result.svg;
          })
          .catch(err => {
            dom.mermaidPreview.innerHTML = `<div style="color:#ef4444;font-size:12px;padding:20px;">Sintaxis en proceso...</div>`;
          });
      } catch (e) {
        dom.mermaidPreview.innerHTML = `<div style="color:var(--text-muted);font-size:12px;padding:20px;">Vista previa lista al conectar.</div>`;
      }
    } else {
      dom.mermaidPreview.innerHTML = `<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:20px;">
        <p style="font-weight:600;margin-bottom:6px;">Código Mermaid Listo</p>
        <p style="font-size:11px;">Copia el código directamente a Obsidian, GitHub o Notion.</p>
      </div>`;
    }
  }

  // --- RENDERING CANVAS ---
  function render() {
    renderNodes();
    renderEdges();
  }

  function renderNodes() {
    if (!dom.nodesLayer) return;
    dom.nodesLayer.innerHTML = '';

    state.nodes.forEach(node => {
      const typeDef = NODE_TYPES[node.type] || NODE_TYPES.process;
      const isSelected = state.selectedNodeId === node.id;
      const isEditing = state.editingNodeId === node.id;

      const nodeEl = document.createElement('div');
      nodeEl.className = `canvas-node ${typeDef.shapeClass} ${isSelected ? 'selected' : ''}`;
      nodeEl.style.left = `${node.x}px`;
      nodeEl.style.top = `${node.y}px`;
      nodeEl.dataset.id = node.id;

      // Quick Toolbar for selected node
      const toolbar = document.createElement('div');
      toolbar.className = 'node-toolbar';
      toolbar.innerHTML = `
        <button class="node-toolbar-btn btn-duplicate" title="Duplicar">📑</button>
        <button class="node-toolbar-btn btn-change-type" title="Cambiar Forma">🔄</button>
        <button class="node-toolbar-btn btn-delete" title="Eliminar (Supr)">🗑️</button>
      `;
      nodeEl.appendChild(toolbar);

      // Node Content (Text or Input)
      if (isEditing) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'node-input';
        input.value = node.label;
        input.addEventListener('blur', () => {
          node.label = input.value.trim() || typeDef.defaultText;
          state.editingNodeId = null;
          render();
          saveState();
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') input.blur();
          if (e.key === 'Escape') {
            state.editingNodeId = null;
            render();
          }
        });
        nodeEl.appendChild(input);
        setTimeout(() => input.focus(), 10);
      } else {
        const content = document.createElement('div');
        content.className = 'node-content';
        content.innerHTML = (node.label || typeDef.defaultText).replace(/\n/g, '<br/>');
        nodeEl.appendChild(content);
      }

      // Magnetic Ports (Top, Right, Bottom, Left)
      ['top', 'right', 'bottom', 'left'].forEach(portPos => {
        const port = document.createElement('div');
        port.className = `port port-${portPos}`;
        port.dataset.port = portPos;
        port.dataset.nodeId = node.id;
        nodeEl.appendChild(port);
      });

      dom.nodesLayer.appendChild(nodeEl);
    });
  }

  function renderEdges() {
    if (!dom.edgesGroup) return;
    dom.edgesGroup.innerHTML = '';

    state.edges.forEach(edge => {
      const fromNode = state.nodes.find(n => n.id === edge.from);
      const toNode = state.nodes.find(n => n.id === edge.to);
      if (!fromNode || !toNode) return;

      const p1 = getPortPosition(fromNode, edge.fromPort || 'bottom');
      const p2 = getPortPosition(toNode, edge.toPort || 'top');
      const isSelected = state.selectedEdgeId === edge.id;

      const pathData = calculateSmoothPath(p1, p2, edge.fromPort, edge.toPort);

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData);
      path.setAttribute('class', `edge-path ${edge.style || 'normal'} ${isSelected ? 'selected' : ''}`);
      path.setAttribute('marker-end', isSelected ? 'url(#arrowhead-selected)' : 'url(#arrowhead)');
      path.dataset.edgeId = edge.id;

      dom.edgesGroup.appendChild(path);

      // Render Edge Label if present
      if (edge.label && edge.label.trim()) {
        const midPoint = getPathMidpoint(p1, p2);
        const labelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        labelGroup.setAttribute('class', 'edge-label-group');
        labelGroup.dataset.edgeId = edge.id;

        const textLen = edge.label.length * 7 + 16;
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', midPoint.x - textLen / 2);
        rect.setAttribute('y', midPoint.y - 11);
        rect.setAttribute('width', textLen);
        rect.setAttribute('height', 22);
        rect.setAttribute('class', 'edge-label-bg');

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', midPoint.x);
        text.setAttribute('y', midPoint.y);
        text.setAttribute('class', 'edge-label-text');
        text.textContent = edge.label;

        labelGroup.appendChild(rect);
        labelGroup.appendChild(text);
        dom.edgesGroup.appendChild(labelGroup);
      }
    });
  }

  function getPortPosition(node, port) {
    const w = node.width || 150;
    const h = node.height || 56;
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
    return {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2
    };
  }

  // --- EVENT LISTENERS ---
  function setupEventListeners() {
    // Window Resize
    window.addEventListener('resize', updateTransform);

    // Keyboard Shortcuts
    window.addEventListener('keydown', handleKeyboardShortcuts);

    // Canvas Pan & Zoom
    dom.canvasWrapper.addEventListener('wheel', handleWheel, { passive: false });
    dom.canvasWrapper.addEventListener('mousedown', handleCanvasMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    // Double click canvas to create a node
    dom.canvasWrapper.addEventListener('dblclick', (e) => {
      if (e.target === dom.canvasWrapper || e.target.id === 'svg-layer' || e.target.id === 'graph-canvas') {
        const pt = screenToCanvas(e.clientX, e.clientY);
        createNode('process', pt.x - 75, pt.y - 28);
      }
    });

    // Copy Mermaid Button
    if (dom.copyBtn) {
      dom.copyBtn.addEventListener('click', copyMermaidCode);
    }

    // Auto-Layout Button
    if (dom.autoLayoutBtn) {
      dom.autoLayoutBtn.addEventListener('click', () => autoLayout(true));
    }

    // Direction Select
    if (dom.directionSelect) {
      dom.directionSelect.addEventListener('change', (e) => {
        state.direction = e.target.value;
        autoLayout(true);
        saveState();
      });
    }

    // Zoom Controls
    if (dom.zoomInBtn) dom.zoomInBtn.addEventListener('click', () => setZoom(state.zoom + 0.15));
    if (dom.zoomOutBtn) dom.zoomOutBtn.addEventListener('click', () => setZoom(state.zoom - 0.15));
    if (dom.zoomResetBtn) dom.zoomResetBtn.addEventListener('click', () => {
      state.zoom = 1;
      state.pan = { x: 80, y: 80 };
      updateTransform();
    });

    // Theme Toggle
    if (dom.themeToggleBtn) dom.themeToggleBtn.addEventListener('click', toggleTheme);

    // Templates
    if (dom.templateSelect) {
      dom.templateSelect.addEventListener('change', (e) => {
        if (e.target.value) {
          loadTemplate(e.target.value);
          e.target.value = '';
        }
      });
    }

    // Clear Canvas
    if (dom.clearBtn) {
      dom.clearBtn.addEventListener('click', () => {
        if (confirm('¿Limpiar todo el lienzo?')) {
          state.nodes = [];
          state.edges = [];
          state.selectedNodeId = null;
          state.selectedEdgeId = null;
          hideEdgePopover();
          render();
          saveState();
          showToast('Lienzo limpio');
        }
      });
    }

    // Export Buttons
    if (dom.exportSvgBtn) dom.exportSvgBtn.addEventListener('click', exportSvg);
    if (dom.exportMmdBtn) dom.exportMmdBtn.addEventListener('click', exportMmd);

    // Tabs in code panel
    if (dom.tabCode && dom.tabPreview) {
      dom.tabCode.addEventListener('click', () => {
        dom.tabCode.classList.add('active');
        dom.tabPreview.classList.remove('active');
        dom.mermaidCode.style.display = 'block';
        dom.mermaidPreview.classList.remove('active');
      });
      dom.tabPreview.addEventListener('click', () => {
        dom.tabPreview.classList.add('active');
        dom.tabCode.classList.remove('active');
        dom.mermaidCode.style.display = 'none';
        dom.mermaidPreview.classList.add('active');
        renderMermaidPreview(generateMermaidCode());
      });
    }

    // Edge Popover Inputs
    if (dom.edgeLabelInput) {
      dom.edgeLabelInput.addEventListener('input', (e) => {
        const edge = state.edges.find(ed => ed.id === state.selectedEdgeId);
        if (edge) {
          edge.label = e.target.value;
          render();
          saveState();
        }
      });
    }

    if (dom.edgeStyleSelect) {
      dom.edgeStyleSelect.addEventListener('change', (e) => {
        const edge = state.edges.find(ed => ed.id === state.selectedEdgeId);
        if (edge) {
          edge.style = e.target.value;
          render();
          saveState();
        }
      });
    }

    // Condition Chips
    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const edge = state.edges.find(ed => ed.id === state.selectedEdgeId);
        if (edge) {
          edge.label = chip.dataset.val;
          if (dom.edgeLabelInput) dom.edgeLabelInput.value = edge.label;
          render();
          saveState();
        }
      });
    });
  }

  // --- DRAG & DROP PALETTE ---
  function setupPaletteDrag() {
    const paletteCards = document.querySelectorAll('.palette-card');
    paletteCards.forEach(card => {
      card.addEventListener('click', () => {
        // Add node at center of current view
        const rect = dom.canvasWrapper.getBoundingClientRect();
        const center = screenToCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);
        createNode(card.dataset.type, center.x - 75, center.y - 28);
      });
    });
  }

  // --- MOUSE & TOUCH INTERACTION ---
  function handleCanvasMouseDown(e) {
    // 1. Check if clicking on node port (start edge connection)
    if (e.target.classList.contains('port')) {
      e.stopPropagation();
      const nodeId = e.target.dataset.nodeId;
      const port = e.target.dataset.port;
      const node = state.nodes.find(n => n.id === nodeId);
      if (node) {
        state.connectingFrom = { nodeId, port };
        const p = getPortPosition(node, port);
        state.tempEdgeEnd = p;
        dom.tempEdge.style.display = 'block';
        dom.tempEdge.setAttribute('d', `M ${p.x} ${p.y} L ${p.x} ${p.y}`);
      }
      return;
    }

    // 2. Check if clicking on node toolbar button
    if (e.target.closest('.node-toolbar-btn')) {
      e.stopPropagation();
      const btn = e.target.closest('.node-toolbar-btn');
      const node = state.nodes.find(n => n.id === state.selectedNodeId);
      if (!node) return;

      if (btn.classList.contains('btn-delete')) {
        deleteSelected();
      } else if (btn.classList.contains('btn-duplicate')) {
        createNode(node.type, node.x + 30, node.y + 30, node.label);
      } else if (btn.classList.contains('btn-change-type')) {
        const types = Object.keys(NODE_TYPES);
        const nextIdx = (types.indexOf(node.type) + 1) % types.length;
        node.type = types[nextIdx];
        render();
        saveState();
      }
      return;
    }

    // 3. Check if clicking on a node
    const nodeEl = e.target.closest('.canvas-node');
    if (nodeEl) {
      e.stopPropagation();
      const nodeId = nodeEl.dataset.id;

      // Double click or click when already selected -> edit text
      if (state.selectedNodeId === nodeId && e.detail === 2) {
        state.editingNodeId = nodeId;
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
      return;
    }

    // 4. Check if clicking on an edge or edge label
    const edgePath = e.target.closest('.edge-path') || e.target.closest('.edge-label-group');
    if (edgePath) {
      e.stopPropagation();
      const edgeId = edgePath.dataset.edgeId;
      selectEdge(edgeId, e.clientX, e.clientY);
      return;
    }

    // 5. Clicking on canvas background -> Pan
    state.selectedNodeId = null;
    state.selectedEdgeId = null;
    state.editingNodeId = null;
    hideEdgePopover();
    render();

    state.isPanning = true;
    state.panStart = { x: e.clientX - state.pan.x, y: e.clientY - state.pan.y };
  }

  function handleMouseMove(e) {
    // 1. Edge dragging preview
    if (state.connectingFrom) {
      const fromNode = state.nodes.find(n => n.id === state.connectingFrom.nodeId);
      if (fromNode) {
        const p1 = getPortPosition(fromNode, state.connectingFrom.port);
        const pt = screenToCanvas(e.clientX, e.clientY);
        const pathData = calculateSmoothPath(p1, pt, state.connectingFrom.port, 'top');
        dom.tempEdge.setAttribute('d', pathData);
      }
      return;
    }

    // 2. Node dragging
    if (state.dragNodeId) {
      const dx = (e.clientX - state.dragStart.x) / state.zoom;
      const dy = (e.clientY - state.dragStart.y) / state.zoom;
      const node = state.nodes.find(n => n.id === state.dragNodeId);
      if (node) {
        node.x = Math.round(state.nodeStartPos.x + dx);
        node.y = Math.round(state.nodeStartPos.y + dy);
        render();
      }
      return;
    }

    // 3. Canvas Panning
    if (state.isPanning) {
      state.pan.x = e.clientX - state.panStart.x;
      state.pan.y = e.clientY - state.panStart.y;
      updateTransform();
    }
  }

  function handleMouseUp(e) {
    // Finish edge connection
    if (state.connectingFrom) {
      dom.tempEdge.style.display = 'none';
      const targetPort = e.target.closest('.port');
      const targetNodeEl = e.target.closest('.canvas-node');

      if (targetPort) {
        const toNodeId = targetPort.dataset.nodeId;
        const toPort = targetPort.dataset.port;
        createEdge(state.connectingFrom.nodeId, toNodeId, state.connectingFrom.port, toPort);
      } else if (targetNodeEl) {
        const toNodeId = targetNodeEl.dataset.id;
        createEdge(state.connectingFrom.nodeId, toNodeId, state.connectingFrom.port, 'top');
      }

      state.connectingFrom = null;
    }

    // Finish node dragging
    if (state.dragNodeId) {
      state.dragNodeId = null;
      saveState();
    }

    // Finish canvas panning
    if (state.isPanning) {
      state.isPanning = false;
    }
  }

  function handleWheel(e) {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const rect = dom.canvasWrapper.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const newZoom = Math.min(Math.max(state.zoom * zoomFactor, 0.3), 2.5);
    
    // Zoom centered at mouse position
    state.pan.x = mouseX - (mouseX - state.pan.x) * (newZoom / state.zoom);
    state.pan.y = mouseY - (mouseY - state.pan.y) * (newZoom / state.zoom);
    state.zoom = newZoom;

    updateTransform();
  }

  function setZoom(val) {
    state.zoom = Math.min(Math.max(val, 0.3), 2.5);
    updateTransform();
  }

  function updateTransform() {
    if (dom.graphCanvas) {
      dom.graphCanvas.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
    }
    if (dom.zoomLevel) {
      dom.zoomLevel.textContent = `${Math.round(state.zoom * 100)}%`;
    }
  }

  function screenToCanvas(screenX, screenY) {
    const rect = dom.canvasWrapper.getBoundingClientRect();
    return {
      x: (screenX - rect.left - state.pan.x) / state.zoom,
      y: (screenY - rect.top - state.pan.y) / state.zoom
    };
  }

  // --- EDGE SELECTION & POPOVER ---
  function selectEdge(edgeId, screenX, screenY) {
    state.selectedEdgeId = edgeId;
    state.selectedNodeId = null;
    render();

    const edge = state.edges.find(e => e.id === edgeId);
    if (!edge || !dom.edgePopover) return;

    if (dom.edgeLabelInput) dom.edgeLabelInput.value = edge.label || '';
    if (dom.edgeStyleSelect) dom.edgeStyleSelect.value = edge.style || 'normal';

    const rect = dom.canvasWrapper.getBoundingClientRect();
    let popX = screenX - rect.left + 15;
    let popY = screenY - rect.top - 20;

    if (popX + 240 > rect.width) popX = rect.width - 250;
    if (popY + 160 > rect.height) popY = rect.height - 170;

    dom.edgePopover.style.left = `${popX}px`;
    dom.edgePopover.style.top = `${popY}px`;
    dom.edgePopover.classList.add('active');
  }

  function hideEdgePopover() {
    if (dom.edgePopover) {
      dom.edgePopover.classList.remove('active');
    }
  }

  // --- KEYBOARD SHORTCUTS ---
  function handleKeyboardShortcuts(e) {
    // If typing in input or textarea, don't trigger canvas shortcuts
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
      showToast('📋 ¡Código Mermaid copiado al portapapeles!');
      if (dom.copyBtn) {
        const originalText = dom.copyBtn.innerHTML;
        dom.copyBtn.innerHTML = '<span>✅ ¡Copiado!</span>';
        setTimeout(() => dom.copyBtn.innerHTML = originalText, 1800);
      }
    }).catch(err => {
      showToast('Error al copiar. Selecciona el texto manualmente.');
    });
  }

  function exportMmd() {
    const code = generateMermaidCode();
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diagrama_flujo_${Date.now().toString(36)}.mmd`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('💾 Archivo .mmd descargado');
  }

  function exportSvg() {
    // Find preview SVG or canvas SVG
    const svgEl = dom.mermaidPreview.querySelector('svg');
    if (svgEl) {
      const svgData = new XMLSerializer().serializeToString(svgEl);
      const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `diagrama_${Date.now().toString(36)}.svg`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('🖼️ SVG Vectorial descargado');
    } else {
      showToast('Copia el código Mermaid o abre la pestaña Vista Previa para SVG');
    }
  }

  function showToast(msg) {
    if (!dom.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    dom.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 2400);
  }

  function updateStats() {
    if (dom.nodeCount) dom.nodeCount.textContent = `${state.nodes.length} nodos`;
    if (dom.edgeCount) dom.edgeCount.textContent = `${state.edges.length} conexiones`;
  }

  // --- PRESET TEMPLATES ---
  function loadTemplate(templateKey) {
    const templates = {
      auth: {
        direction: 'TD',
        nodes: [
          { id: 'Start', type: 'terminal', label: 'Inicio', x: 200, y: 50 },
          { id: 'Input', type: 'io', label: 'Ingresar Usuario & Pass', x: 200, y: 150 },
          { id: 'CheckAuth', type: 'decision', label: '¿Credenciales Válidas?', x: 200, y: 260 },
          { id: 'QueryDB', type: 'database', label: 'Consultar Usuarios DB', x: 450, y: 260 },
          { id: 'GenToken', type: 'process', label: 'Generar Token JWT', x: 200, y: 380 },
          { id: 'ShowError', type: 'process', label: 'Mostrar Error 401', x: -50, y: 380 },
          { id: 'End', type: 'terminal', label: 'Fin', x: 200, y: 490 }
        ],
        edges: [
          { id: 'e1', from: 'Start', to: 'Input', style: 'normal' },
          { id: 'e2', from: 'Input', to: 'CheckAuth', style: 'normal' },
          { id: 'e3', from: 'CheckAuth', to: 'QueryDB', label: 'Verificar', style: 'dotted' },
          { id: 'e4', from: 'CheckAuth', to: 'GenToken', label: 'Sí', style: 'thick' },
          { id: 'e5', from: 'CheckAuth', to: 'ShowError', label: 'No', style: 'normal' },
          { id: 'e6', from: 'GenToken', to: 'End', style: 'normal' },
          { id: 'e7', from: 'ShowError', to: 'End', style: 'normal' }
        ]
      },
      payment: {
        direction: 'TD',
        nodes: [
          { id: 'Init', type: 'terminal', label: 'Checkout Carrito', x: 200, y: 50 },
          { id: 'ValCard', type: 'decision', label: '¿Tarjeta Válida?', x: 200, y: 160 },
          { id: 'Gateway', type: 'subroutine', label: 'Llamar Pasarela Stripe', x: 200, y: 280 },
          { id: 'CheckFund', type: 'decision', label: '¿Fondos Aprobados?', x: 200, y: 400 },
          { id: 'SaveOrder', type: 'database', label: 'Registrar Orden Pagada', x: 200, y: 520 },
          { id: 'SendReceipt', type: 'process', label: 'Enviar Factura por Email', x: 200, y: 640 },
          { id: 'FailMsg', type: 'process', label: 'Notificar Rechazo', x: 450, y: 400 },
          { id: 'Done', type: 'terminal', label: 'Fin', x: 200, y: 760 }
        ],
        edges: [
          { id: 'ep1', from: 'Init', to: 'ValCard', style: 'normal' },
          { id: 'ep2', from: 'ValCard', to: 'Gateway', label: 'Sí', style: 'normal' },
          { id: 'ep3', from: 'ValCard', to: 'FailMsg', label: 'No', style: 'normal' },
          { id: 'ep4', from: 'Gateway', to: 'CheckFund', style: 'normal' },
          { id: 'ep5', from: 'CheckFund', to: 'SaveOrder', label: 'Aprobado', style: 'thick' },
          { id: 'ep6', from: 'CheckFund', to: 'FailMsg', label: 'Rechazado', style: 'normal' },
          { id: 'ep7', from: 'SaveOrder', to: 'SendReceipt', style: 'normal' },
          { id: 'ep8', from: 'SendReceipt', to: 'Done', style: 'normal' },
          { id: 'ep9', from: 'FailMsg', to: 'Done', style: 'normal' }
        ]
      },
      etl: {
        direction: 'LR',
        nodes: [
          { id: 'Src', type: 'database', label: 'Fuente CSV / API', x: 50, y: 150 },
          { id: 'Extract', type: 'process', label: 'Extracción de Datos', x: 250, y: 150 },
          { id: 'Validate', type: 'decision', label: '¿Schema Válido?', x: 450, y: 150 },
          { id: 'Transform', type: 'process', label: 'Transformar & Normalizar', x: 680, y: 150 },
          { id: 'Load', type: 'database', label: 'Data Warehouse (SQL)', x: 920, y: 150 },
          { id: 'DLQ', type: 'database', label: 'Dead Letter Queue', x: 680, y: 300 }
        ],
        edges: [
          { id: 'ee1', from: 'Src', to: 'Extract', style: 'normal' },
          { id: 'ee2', from: 'Extract', to: 'Validate', style: 'normal' },
          { id: 'ee3', from: 'Validate', to: 'Transform', label: 'Válido', style: 'thick' },
          { id: 'ee4', from: 'Validate', to: 'DLQ', label: 'Inválido', style: 'dotted' },
          { id: 'ee5', from: 'Transform', to: 'Load', style: 'normal' }
        ]
      }
    };

    const tpl = templates[templateKey];
    if (tpl) {
      state.direction = tpl.direction;
      if (dom.directionSelect) dom.directionSelect.value = tpl.direction;
      state.nodes = JSON.parse(JSON.stringify(tpl.nodes));
      state.edges = JSON.parse(JSON.stringify(tpl.edges));
      state.selectedNodeId = null;
      state.selectedEdgeId = null;
      hideEdgePopover();
      render();
      saveState();
      autoLayout(false);
      showToast(`Plantilla cargada: ${templateKey.toUpperCase()}`);
    }
  }

  // Initialize once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
