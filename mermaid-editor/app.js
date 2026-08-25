/**
 * MermaidFlow Studio - Native Visual Flowchart & Mermaid Code Generator
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
    exportMmdBtn: document.getElementById('btn-export-mmd'),
    toastContainer: document.getElementById('toast-container'),
    edgePopover: document.getElementById('edge-popover'),
    edgeLabelInput: document.getElementById('edge-label-input'),
    edgeStyleSelect: document.getElementById('edge-style-select'),
    btnDeleteEdge: document.getElementById('btn-delete-edge')
  };

  // --- INITIALIZATION ---
  function init() {
    loadTheme();
    setupEventListeners();
    setupPaletteClicks();

    if (!loadFromLocalStorage()) {
      loadTemplate('auth');
    }

    updateTransform();
    render();
    saveState();

    setTimeout(() => {
      autoLayout(false);
    }, 100);
  }

  // --- LOCAL STORAGE & HISTORY ---
  function saveState() {
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

    try {
      localStorage.setItem('mermaidflow_data', snapshot);
    } catch (e) {
      console.warn('LocalStorage error', e);
    }

    updateMermaidCode();
    updateStats();
  }

  function undo() {
    if (state.historyIndex > 0) {
      state.historyIndex--;
      restoreSnapshot(state.history[state.historyIndex]);
      showToast('↩️ Deshacer');
    }
  }

  function redo() {
    if (state.historyIndex < state.history.length - 1) {
      state.historyIndex++;
      restoreSnapshot(state.history[state.historyIndex]);
      showToast('↪️ Rehacer');
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
      console.error(e);
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
    showToast(state.theme === 'dark' ? 'Modo Oscuro' : 'Modo Claro');
  }

  // --- NODE & EDGE OPERATIONS ---
  function createNode(type, x, y, label = null) {
    const typeDef = NODE_TYPES[type] || NODE_TYPES.process;
    
    let idCandidate = `N${state.nodes.length + 1}`;
    let counter = 1;
    while (state.nodes.some(n => n.id === idCandidate)) {
      counter++;
      idCandidate = `N${counter}`;
    }

    const node = {
      id: idCandidate,
      type: type,
      label: label || typeDef.defaultText,
      x: Math.round(x),
      y: Math.round(y),
      width: type === 'decision' ? 160 : 150,
      height: type === 'decision' ? 66 : 56
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
    if (fromNodeId === toNodeId) return null;

    const exists = state.edges.some(e => e.from === fromNodeId && e.to === toNodeId);
    if (exists) return null;

    const edge = {
      id: `e_${fromNodeId}_${toNodeId}_${Date.now().toString(36)}`,
      from: fromNodeId,
      to: toNodeId,
      fromPort: fromPort,
      toPort: toPort,
      label: label,
      style: style
    };

    state.edges.push(edge);
    state.selectedEdgeId = edge.id;
    state.selectedNodeId = null;

    render();
    saveState();

    // If connecting from a decision node and no label set yet, show condition popover automatically
    const fromNode = state.nodes.find(n => n.id === fromNodeId);
    if (fromNode && fromNode.type === 'decision' && !label) {
      setTimeout(() => {
        showEdgePopoverForEdge(edge);
      }, 50);
    }

    return edge;
  }

  // Quick Smart Append (adds connected child node in 1 click)
  function quickAddBranch(fromNodeId, conditionLabel = '') {
    const fromNode = state.nodes.find(n => n.id === fromNodeId);
    if (!fromNode) return;

    const isHorizontal = state.direction === 'LR' || state.direction === 'RL';
    let newX = fromNode.x;
    let newY = fromNode.y;

    if (conditionLabel === 'Sí') {
      newX = isHorizontal ? fromNode.x + 220 : fromNode.x - 120;
      newY = isHorizontal ? fromNode.y - 80 : fromNode.y + 130;
    } else if (conditionLabel === 'No') {
      newX = isHorizontal ? fromNode.x + 220 : fromNode.x + 120;
      newY = isHorizontal ? fromNode.y + 80 : fromNode.y + 130;
    } else {
      newX = isHorizontal ? fromNode.x + 220 : fromNode.x;
      newY = isHorizontal ? fromNode.y : fromNode.y + 130;
    }

    const nextType = fromNode.type === 'terminal' && fromNode.label.toLowerCase().includes('fin') ? 'process' : 'process';
    const nextText = conditionLabel === 'Sí' ? 'Acción Sí' : (conditionLabel === 'No' ? 'Acción No' : 'Siguiente Paso');

    const newNode = createNode(nextType, newX, newY, nextText);
    createEdge(fromNode.id, newNode.id, 'bottom', 'top', conditionLabel, 'normal');
    
    // Smooth Auto-Layout to keep the whole tree neat
    autoLayout(true);
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
      showToast('Elemento eliminado');
    }
  }

  // --- SMART AUTO-LAYOUT ENGINE ---
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

    // Root nodes
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
        if (!visited.has(v)) {
          queue.push(v);
        }
      });
    }

    state.nodes.forEach(n => {
      if (ranks[n.id] === undefined) ranks[n.id] = 0;
    });

    const layers = [];
    for (let r = 0; r <= maxRank; r++) {
      layers[r] = [];
    }
    state.nodes.forEach(n => {
      const r = ranks[n.id] || 0;
      layers[r].push(n);
    });

    const layerSpacing = isHorizontal ? 260 : 130;
    const nodeSpacing = isHorizontal ? 100 : 210;
    const startX = 140;
    const startY = 90;

    const targetPositions = {};

    layers.forEach((layerNodes, r) => {
      const layerIndex = isReversed ? (layers.length - 1 - r) : r;
      const totalSpan = (layerNodes.length - 1) * nodeSpacing;
      
      layerNodes.forEach((node, i) => {
        const offset = (i * nodeSpacing) - (totalSpan / 2);

        if (isHorizontal) {
          targetPositions[node.id] = {
            x: startX + (layerIndex * layerSpacing),
            y: startY + 240 + offset
          };
        } else {
          targetPositions[node.id] = {
            x: startX + 360 + offset,
            y: startY + (layerIndex * layerSpacing)
          };
        }
      });
    });

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
    const duration = 280;
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

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        saveState();
      }
    }

    requestAnimationFrame(step);
  }

  // --- MERMAID GENERATOR (SERIALIZER) ---
  function generateMermaidCode() {
    if (state.nodes.length === 0) {
      return `flowchart ${state.direction}\n    %% Lienzo vacío`;
    }

    let code = `flowchart ${state.direction}\n`;

    // 1. Declare Nodes
    code += `    %% Nodos\n`;
    state.nodes.forEach(node => {
      const typeDef = NODE_TYPES[node.type] || NODE_TYPES.process;
      const cleanLabel = (node.label || 'Nodo')
        .replace(/"/g, "'")
        .replace(/\n/g, '<br/>');
      
      code += `    ${node.id}${typeDef.prefix}"${cleanLabel}"${typeDef.suffix}\n`;
    });

    // 2. Declare Edges
    if (state.edges.length > 0) {
      code += `\n    %% Conexiones\n`;
      state.edges.forEach(edge => {
        let connector = '-->';
        if (edge.style === 'dotted') connector = '-.->';
        else if (edge.style === 'thick') connector = '==>';
        else if (edge.style === 'open') connector = '---';

        const label = (edge.label || '').trim();
        if (label) {
          const cleanLabel = label.replace(/"/g, "'");
          if (edge.style === 'normal' || !edge.style) {
            code += `    ${edge.from} -- "${cleanLabel}" --> ${edge.to}\n`;
          } else {
            code += `    ${edge.from} ${connector}|"${cleanLabel}"| ${edge.to}\n`;
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

      // Smart Action Buttons when Node is Selected
      const actions = document.createElement('div');
      actions.className = 'node-actions';

      if (node.type === 'decision') {
        // Quick + Sí / + No branches for decisions
        actions.innerHTML = `
          <button class="action-btn btn-quick-yes" data-action="quick-yes">🟢 + Sí</button>
          <button class="action-btn btn-quick-no" data-action="quick-no">🔴 + No</button>
          <button class="action-btn btn-del" data-action="delete" title="Borrar">🗑️</button>
        `;
      } else {
        // Quick + Next step for regular nodes
        actions.innerHTML = `
          <button class="action-btn btn-quick-next" data-action="quick-next">➕ + Siguiente</button>
          <button class="action-btn btn-del" data-action="delete" title="Borrar">🗑️</button>
        `;
      }
      nodeEl.appendChild(actions);

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

      // 4 Magnetic Connection Ports
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

      // Invisible fat hit area for easy clicking
      const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hitPath.setAttribute('d', pathData);
      hitPath.setAttribute('class', 'edge-hit-area');
      hitPath.dataset.edgeId = edge.id;
      dom.edgesGroup.appendChild(hitPath);

      // Visible stroke
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData);
      path.setAttribute('class', `edge-path ${edge.style || 'normal'} ${isSelected ? 'selected' : ''}`);
      path.setAttribute('marker-end', isSelected ? 'url(#arrowhead-selected)' : 'url(#arrowhead)');
      path.dataset.edgeId = edge.id;
      dom.edgesGroup.appendChild(path);

      // Render Edge Label if present
      const labelText = (edge.label || '').trim();
      const midPoint = getPathMidpoint(p1, p2);

      const labelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      labelGroup.setAttribute('class', 'edge-label-group');
      labelGroup.dataset.edgeId = edge.id;

      let labelClass = 'edge-label-bg';
      if (labelText.toLowerCase() === 'sí' || labelText.toLowerCase() === 'si') labelClass += ' label-yes';
      if (labelText.toLowerCase() === 'no') labelClass += ' label-no';

      const displayStr = labelText || (isSelected ? '+ Condición' : '');
      if (displayStr) {
        const textLen = Math.max(displayStr.length * 8 + 18, 38);
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', midPoint.x - textLen / 2);
        rect.setAttribute('y', midPoint.y - 12);
        rect.setAttribute('width', textLen);
        rect.setAttribute('height', 24);
        rect.setAttribute('class', labelClass);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', midPoint.x);
        text.setAttribute('y', midPoint.y);
        text.setAttribute('class', 'edge-label-text');
        text.textContent = displayStr;

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
    window.addEventListener('resize', updateTransform);
    window.addEventListener('keydown', handleKeyboardShortcuts);

    // Canvas Events
    dom.canvasWrapper.addEventListener('wheel', handleWheel, { passive: false });
    dom.canvasWrapper.addEventListener('mousedown', handleCanvasMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    // Double click on canvas background -> Quick Process Node
    dom.canvasWrapper.addEventListener('dblclick', (e) => {
      if (e.target === dom.canvasWrapper || e.target.id === 'svg-layer' || e.target.id === 'graph-canvas') {
        const pt = screenToCanvas(e.clientX, e.clientY);
        createNode('process', pt.x - 75, pt.y - 28);
      }
    });

    // Top Bar Actions
    if (dom.copyBtn) dom.copyBtn.addEventListener('click', copyMermaidCode);
    if (dom.autoLayoutBtn) dom.autoLayoutBtn.addEventListener('click', () => autoLayout(true));
    if (dom.directionSelect) {
      dom.directionSelect.addEventListener('change', (e) => {
        state.direction = e.target.value;
        autoLayout(true);
        saveState();
      });
    }

    if (dom.zoomInBtn) dom.zoomInBtn.addEventListener('click', () => setZoom(state.zoom + 0.15));
    if (dom.zoomOutBtn) dom.zoomOutBtn.addEventListener('click', () => setZoom(state.zoom - 0.15));
    if (dom.zoomResetBtn) dom.zoomResetBtn.addEventListener('click', () => {
      state.zoom = 1;
      state.pan = { x: 80, y: 80 };
      updateTransform();
    });

    if (dom.themeToggleBtn) dom.themeToggleBtn.addEventListener('click', toggleTheme);

    if (dom.templateSelect) {
      dom.templateSelect.addEventListener('change', (e) => {
        if (e.target.value) {
          loadTemplate(e.target.value);
          e.target.value = '';
        }
      });
    }

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

    if (dom.exportMmdBtn) dom.exportMmdBtn.addEventListener('click', exportMmd);

    // Edge Popover Controls (DIRECT EVENT BINDINGS)
    setupEdgePopoverEvents();
  }

  function setupPaletteClicks() {
    const paletteCards = document.querySelectorAll('.palette-card');
    paletteCards.forEach(card => {
      card.addEventListener('click', () => {
        const rect = dom.canvasWrapper.getBoundingClientRect();
        const center = screenToCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);
        createNode(card.dataset.type, center.x - 75, center.y - 28);
      });
    });
  }

  function setupEdgePopoverEvents() {
    // Condition Pills (Sí, No, OK, Sin Etiqueta)
    const pills = document.querySelectorAll('.condition-pill');
    pills.forEach(pill => {
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = pill.dataset.val;
        const edge = state.edges.find(ed => ed.id === state.selectedEdgeId);
        if (edge) {
          edge.label = val;
          if (dom.edgeLabelInput) dom.edgeLabelInput.value = val;
          render();
          saveState();
          showToast(`Condición: "${val || 'Ninguna'}"`);
        }
      });
    });

    // Custom Label Input
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

    // Arrow Style Select
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

    // Delete Edge Button
    if (dom.btnDeleteEdge) {
      dom.btnDeleteEdge.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSelected();
      });
    }
  }

  // --- MOUSE & TOUCH HANDLERS ---
  function handleCanvasMouseDown(e) {
    // 1. Click on connection port (start edge)
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

    // 2. Click on Node Action Buttons (+ Sí, + No, + Siguiente, Borrar)
    const actionBtn = e.target.closest('.action-btn');
    if (actionBtn) {
      e.stopPropagation();
      const action = actionBtn.dataset.action;
      const node = state.nodes.find(n => n.id === state.selectedNodeId);
      if (!node) return;

      if (action === 'quick-yes') {
        quickAddBranch(node.id, 'Sí');
      } else if (action === 'quick-no') {
        quickAddBranch(node.id, 'No');
      } else if (action === 'quick-next') {
        quickAddBranch(node.id, '');
      } else if (action === 'delete') {
        deleteSelected();
      }
      return;
    }

    // 3. Click on Node
    const nodeEl = e.target.closest('.canvas-node');
    if (nodeEl) {
      e.stopPropagation();
      const nodeId = nodeEl.dataset.id;

      // Double click -> Inline edit
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

    // 4. Click on Edge or Edge Label
    const edgeEl = e.target.closest('.edge-path') || e.target.closest('.edge-hit-area') || e.target.closest('.edge-label-group');
    if (edgeEl) {
      e.stopPropagation();
      const edgeId = edgeEl.dataset.edgeId;
      selectEdge(edgeId, e.clientX, e.clientY);
      return;
    }

    // 5. Click on Edge Popover itself -> Do not deselect
    if (e.target.closest('#edge-popover')) {
      return;
    }

    // 6. Click on Canvas Background -> Pan
    state.selectedNodeId = null;
    state.selectedEdgeId = null;
    state.editingNodeId = null;
    hideEdgePopover();
    render();

    state.isPanning = true;
    state.panStart = { x: e.clientX - state.pan.x, y: e.clientY - state.pan.y };
  }

  function handleMouseMove(e) {
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

    if (state.isPanning) {
      state.pan.x = e.clientX - state.panStart.x;
      state.pan.y = e.clientY - state.panStart.y;
      updateTransform();
    }
  }

  function handleMouseUp(e) {
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
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const rect = dom.canvasWrapper.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const newZoom = Math.min(Math.max(state.zoom * zoomFactor, 0.3), 2.5);
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
    if (edge) {
      showEdgePopoverForEdge(edge, screenX, screenY);
    }
  }

  function showEdgePopoverForEdge(edge, screenX, screenY) {
    if (!dom.edgePopover) return;

    if (dom.edgeLabelInput) dom.edgeLabelInput.value = edge.label || '';
    if (dom.edgeStyleSelect) dom.edgeStyleSelect.value = edge.style || 'normal';

    const rect = dom.canvasWrapper.getBoundingClientRect();
    let popX = 0;
    let popY = 0;

    if (screenX !== undefined && screenY !== undefined) {
      popX = screenX - rect.left + 15;
      popY = screenY - rect.top - 20;
    } else {
      // Calculate from node positions
      const fromNode = state.nodes.find(n => n.id === edge.from);
      const toNode = state.nodes.find(n => n.id === edge.to);
      if (fromNode && toNode) {
        const mid = getPathMidpoint(
          getPortPosition(fromNode, edge.fromPort || 'bottom'),
          getPortPosition(toNode, edge.toPort || 'top')
        );
        popX = mid.x * state.zoom + state.pan.x + 20;
        popY = mid.y * state.zoom + state.pan.y - 40;
      }
    }

    if (popX + 270 > rect.width) popX = rect.width - 280;
    if (popY + 220 > rect.height) popY = rect.height - 230;
    if (popX < 10) popX = 10;
    if (popY < 10) popY = 10;

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
      if (dom.copyBtn) {
        const orig = dom.copyBtn.innerHTML;
        dom.copyBtn.innerHTML = '<span>✅ ¡Copiado!</span>';
        setTimeout(() => dom.copyBtn.innerHTML = orig, 1800);
      }
    }).catch(err => {
      showToast('Selecciona el código manualmente.');
    });
  }

  function exportMmd() {
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
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 2200);
  }

  function updateStats() {
    if (dom.nodeCount) dom.nodeCount.textContent = `${state.nodes.length} nodos`;
    if (dom.edgeCount) dom.edgeCount.textContent = `${state.edges.length} conexiones`;
  }

  // --- TEMPLATES ---
  function loadTemplate(templateKey) {
    const templates = {
      auth: {
        direction: 'TD',
        nodes: [
          { id: 'Start', type: 'terminal', label: 'Inicio', x: 200, y: 50 },
          { id: 'Input', type: 'io', label: 'Ingresar Credenciales', x: 200, y: 150 },
          { id: 'CheckAuth', type: 'decision', label: '¿Credenciales Válidas?', x: 200, y: 260 },
          { id: 'GenToken', type: 'process', label: 'Generar Token JWT', x: 80, y: 390 },
          { id: 'ShowError', type: 'process', label: 'Mostrar Error 401', x: 330, y: 390 },
          { id: 'End', type: 'terminal', label: 'Fin', x: 200, y: 510 }
        ],
        edges: [
          { id: 'e1', from: 'Start', to: 'Input', style: 'normal' },
          { id: 'e2', from: 'Input', to: 'CheckAuth', style: 'normal' },
          { id: 'e3', from: 'CheckAuth', to: 'GenToken', label: 'Sí', style: 'thick' },
          { id: 'e4', from: 'CheckAuth', to: 'ShowError', label: 'No', style: 'normal' },
          { id: 'e5', from: 'GenToken', to: 'End', style: 'normal' },
          { id: 'e6', from: 'ShowError', to: 'End', style: 'normal' }
        ]
      },
      payment: {
        direction: 'TD',
        nodes: [
          { id: 'Checkout', type: 'terminal', label: 'Inicio Compra', x: 200, y: 50 },
          { id: 'ValCard', type: 'decision', label: '¿Tarjeta Válida?', x: 200, y: 160 },
          { id: 'Stripe', type: 'subroutine', label: 'Procesar con Stripe', x: 80, y: 290 },
          { id: 'FailMsg', type: 'process', label: 'Rechazar Transacción', x: 340, y: 290 },
          { id: 'SaveDB', type: 'database', label: 'Registrar Orden Pagada', x: 80, y: 410 },
          { id: 'Done', type: 'terminal', label: 'Fin', x: 200, y: 530 }
        ],
        edges: [
          { id: 'ep1', from: 'Checkout', to: 'ValCard', style: 'normal' },
          { id: 'ep2', from: 'ValCard', to: 'Stripe', label: 'Sí', style: 'thick' },
          { id: 'ep3', from: 'ValCard', to: 'FailMsg', label: 'No', style: 'normal' },
          { id: 'ep4', from: 'Stripe', to: 'SaveDB', label: 'Aprobado', style: 'normal' },
          { id: 'ep5', from: 'SaveDB', to: 'Done', style: 'normal' },
          { id: 'ep6', from: 'FailMsg', to: 'Done', style: 'normal' }
        ]
      },
      etl: {
        direction: 'LR',
        nodes: [
          { id: 'Src', type: 'database', label: 'Fuente CSV / API', x: 50, y: 150 },
          { id: 'Extract', type: 'process', label: 'Extracción de Datos', x: 250, y: 150 },
          { id: 'Validate', type: 'decision', label: '¿Schema Válido?', x: 450, y: 150 },
          { id: 'Transform', type: 'process', label: 'Transformar & Normalizar', x: 680, y: 100 },
          { id: 'DLQ', type: 'database', label: 'Dead Letter Queue', x: 680, y: 230 },
          { id: 'Load', type: 'database', label: 'Data Warehouse (SQL)', x: 920, y: 100 }
        ],
        edges: [
          { id: 'ee1', from: 'Src', to: 'Extract', style: 'normal' },
          { id: 'ee2', from: 'Extract', to: 'Validate', style: 'normal' },
          { id: 'ee3', from: 'Validate', to: 'Transform', label: 'Sí', style: 'thick' },
          { id: 'ee4', from: 'Validate', to: 'DLQ', label: 'No', style: 'dotted' },
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
