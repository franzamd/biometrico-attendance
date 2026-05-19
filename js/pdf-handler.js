// ===== pdf-handler.js — PDF Loading, Rendering & Selection =====
import { state, showToast, saveState } from './app.js';
import { DataProcessor } from './data-processor.js';

export class PDFHandler {
  constructor(appState) {
    this.state = appState;
    this.pdfDoc = null;
    this.currentPage = 1;
    this.scale = 1.5;
    this.selections = [];
    this.isDrawing = false;
    this.startX = 0;
    this.startY = 0;
    this.pdfCanvas = document.getElementById('pdfCanvas');
    this.selCanvas = document.getElementById('selectionCanvas');
    this.pdfCtx = this.pdfCanvas.getContext('2d');
    this.selCtx = this.selCanvas.getContext('2d');
    this.initControls();
    this.initSelection();

    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  initControls() {
    document.getElementById('btnPrevPage').addEventListener('click', () => this.changePage(-1));
    document.getElementById('btnNextPage').addEventListener('click', () => this.changePage(1));
    document.getElementById('btnZoomIn').addEventListener('click', () => this.zoom(0.25));
    document.getElementById('btnZoomOut').addEventListener('click', () => this.zoom(-0.25));
    document.getElementById('btnClearSelections').addEventListener('click', () => this.clearSelections());
    document.getElementById('btnExtractData').addEventListener('click', () => this.extractData());

    const pageWrapper = document.getElementById('pageDisplayWrapper');
    const startEdit = () => {
      if (!this.pdfDoc) return;
      const current = this.currentPage;
      const total = this.pdfDoc.numPages;
      pageWrapper.innerHTML = `
        <input type="number" id="inputPage" min="1" max="${total}" value="${current}" 
          style="width: 50px; text-align: center; border: 1px solid var(--border-accent); border-radius: 4px; background: var(--bg-secondary); color: var(--text-primary); font-size: 0.85rem; padding: 2px 4px; font-weight: bold; outline: none;" />
      `;
      const input = document.getElementById('inputPage');
      input.focus();
      input.select();

      let isFinished = false;
      const finishEdit = () => {
        if (isFinished) return;
        isFinished = true;
        const val = parseInt(input.value);
        if (!isNaN(val) && val >= 1 && val <= total) {
          this.goToPage(val);
        } else {
          this.renderPageInfoOnly();
        }
      };

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          finishEdit();
        } else if (e.key === 'Escape') {
          isFinished = true;
          this.renderPageInfoOnly();
        }
      });

      input.addEventListener('blur', () => {
        setTimeout(() => finishEdit(), 150);
      });
    };

    pageWrapper?.addEventListener('click', (e) => {
      const isTarget = e.target.id === 'currentPage' || 
                       e.target.id === 'btnEditPage' || 
                       e.target.closest('#btnEditPage') || 
                       e.target.closest('#currentPage');
      if (isTarget && !document.getElementById('inputPage')) {
        startEdit();
      }
    });
  }

  initSelection() {
    const canvas = this.selCanvas;
    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    canvas.addEventListener('mouseleave', () => { if (this.isDrawing) this.isDrawing = false; });
  }

  async loadPDF(file) {
    state.records = {};
    state.processedData = {};
    state.activeEmployeeTab = null;

    const arrayBuffer = await file.arrayBuffer();
    this.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    document.getElementById('totalPages').textContent = this.pdfDoc.numPages;
    this.currentPage = 1;
    this.selections = [];
    this.renderPage();
  }

  async renderPage() {
    if (!this.pdfDoc) return;
    const page = await this.pdfDoc.getPage(this.currentPage);
    const viewport = page.getViewport({ scale: this.scale });

    this.pdfCanvas.width = viewport.width;
    this.pdfCanvas.height = viewport.height;
    this.selCanvas.width = viewport.width;
    this.selCanvas.height = viewport.height;

    // Position selection canvas over pdf canvas
    this.selCanvas.style.width = viewport.width + 'px';
    this.selCanvas.style.height = viewport.height + 'px';

    const container = document.getElementById('pdfContainer');
    if (container) {
        container.style.width = viewport.width + 'px';
        container.style.height = viewport.height + 'px';
    }

    const overlay = document.getElementById('selectionsOverlay');
    overlay.style.width = viewport.width + 'px';
    overlay.style.height = viewport.height + 'px';

    await page.render({ canvasContext: this.pdfCtx, viewport }).promise;
    this.renderPageInfoOnly();
    document.getElementById('zoomLevel').textContent = Math.round(this.scale * 100) + '%';

    this.viewport = viewport;
    this.renderSelectionOverlays();
  }

  changePage(delta) {
    if (!this.pdfDoc) return;
    const newPage = this.currentPage + delta;
    if (newPage < 1 || newPage > this.pdfDoc.numPages) return;
    this.currentPage = newPage;
    this.renderPage();
  }

  zoom(delta) {
    this.scale = Math.max(0.5, Math.min(3, this.scale + delta));
    this.renderPage();
  }

  goToPage(pageNum) {
    if (!this.pdfDoc) return;
    if (pageNum < 1 || pageNum > this.pdfDoc.numPages) return;
    this.currentPage = pageNum;
    this.renderPage();
  }

  renderPageInfoOnly() {
    const pageWrapper = document.getElementById('pageDisplayWrapper');
    if (pageWrapper) {
      pageWrapper.innerHTML = `
        <span id="currentPage" style="cursor: pointer; font-weight: bold; background: var(--bg-tertiary); border: 1px solid var(--border); padding: 2px 6px; border-radius: 4px; display: inline-block; line-height: 1.2;" title="Haga clic para editar">${this.currentPage}</span>
        <button id="btnEditPage" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 2px; display: inline-flex; align-items: center; vertical-align: middle;" title="Escribir página">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
      `;
    }
  }

  // ===== SELECTION DRAWING =====
  getCanvasCoords(e) {
    const rect = this.selCanvas.getBoundingClientRect();
    const scaleX = this.selCanvas.width / rect.width;
    const scaleY = this.selCanvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  onMouseDown(e) {
    const coords = this.getCanvasCoords(e);
    this.isDrawing = true;
    this.startX = coords.x;
    this.startY = coords.y;
  }

  onMouseMove(e) {
    if (!this.isDrawing) return;
    const coords = this.getCanvasCoords(e);
    this.selCtx.clearRect(0, 0, this.selCanvas.width, this.selCanvas.height);
    this.selCtx.strokeStyle = '#6366f1';
    this.selCtx.lineWidth = 2;
    this.selCtx.setLineDash([5, 3]);
    this.selCtx.fillStyle = 'rgba(99,102,241,0.12)';
    const x = Math.min(this.startX, coords.x);
    const y = Math.min(this.startY, coords.y);
    const w = Math.abs(coords.x - this.startX);
    const h = Math.abs(coords.y - this.startY);
    this.selCtx.fillRect(x, y, w, h);
    this.selCtx.strokeRect(x, y, w, h);
  }

  onMouseUp(e) {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    this.selCtx.clearRect(0, 0, this.selCanvas.width, this.selCanvas.height);
    const coords = this.getCanvasCoords(e);
    const x = Math.min(this.startX, coords.x);
    const y = Math.min(this.startY, coords.y);
    const w = Math.abs(coords.x - this.startX);
    const h = Math.abs(coords.y - this.startY);

    if (w < 20 || h < 20) return; // Too small, ignore

    this.selections.push({ x, y, w, h, page: this.currentPage });
    this.renderSelectionOverlays();
    this.updateSelectionsList();
    document.getElementById('btnExtractData').disabled = false;
  }

  renderSelectionOverlays() {
    const overlay = document.getElementById('selectionsOverlay');
    const pageSelections = this.selections.filter(s => s.page === this.currentPage);
    overlay.innerHTML = pageSelections.map((s, i) => {
      const globalIdx = this.selections.indexOf(s);
      return `<div class="selection-rect" style="left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px;">
        <span class="sel-label">${globalIdx + 1}</span>
      </div>`;
    }).join('');
  }

  updateSelectionsList() {
    const list = document.getElementById('selectionsList');
    list.innerHTML = this.selections.map((s, i) => `
      <div class="sel-item">
        <span>Selección ${i + 1} (Pág. ${s.page})</span>
        <button onclick="window.pdfHandler.removeSelection(${i})">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `).join('');
  }

  removeSelection(idx) {
    this.selections.splice(idx, 1);
    this.renderSelectionOverlays();
    this.updateSelectionsList();
    if (this.selections.length === 0) document.getElementById('btnExtractData').disabled = true;
  }

  clearSelections() {
    this.selections = [];
    this.renderSelectionOverlays();
    this.updateSelectionsList();
    document.getElementById('btnExtractData').disabled = true;
    document.getElementById('extractionPreview').style.display = 'none';
  }

  // ===== DATA EXTRACTION =====
  async extractData() {
    const empId = parseInt(document.getElementById('employeeSelect').value);
    if (!empId) {
      showToast('Seleccione un empleado antes de extraer', 'error');
      return;
    }

    let allText = [];

    // Group selections by page
    const byPage = {};
    this.selections.forEach(s => {
      if (!byPage[s.page]) byPage[s.page] = [];
      byPage[s.page].push(s);
    });

    for (const [pageNum, sels] of Object.entries(byPage)) {
      const page = await this.pdfDoc.getPage(parseInt(pageNum));
      const viewport = page.getViewport({ scale: this.scale });
      const textContent = await page.getTextContent();

      for (const sel of sels) {
        const items = this.getTextInRect(textContent, viewport, sel);
        allText.push(...items);
      }
    }

    // Show preview
    const previewDiv = document.getElementById('extractionPreview');
    const previewText = document.getElementById('previewText');
    const textStr = allText.map(t => t.str).join('\n');
    previewText.textContent = textStr || '(No se encontró texto en la selección)';
    previewDiv.style.display = 'block';

    if (allText.length > 0) {
      // Limpiar registros previos de otros empleados para evitar duplicidad o mezcla de reportes
      state.records = {};
      state.processedData = {};

      // Parse the extracted text
      const processor = new DataProcessor(this.state);
      const records = processor.parseRawText(allText, textStr);

      // Store raw records
      state.records[empId] = records;

      // Process into table data
      const emp = state.employees.find(e => e.id === empId);
      state.processedData[empId] = processor.processRecords(state.records[empId], emp, state.tolerance);

      // Pre-seleccionar la pestaña del empleado recién extraído
      state.activeEmployeeTab = empId;

      saveState();
      showToast(`${records.length} registros extraídos para ${emp.name}`, 'success');

      // Clear selections after successful extraction
      this.clearSelections();
    } else {
      showToast('No se encontró texto en las selecciones', 'error');
    }
  }

  getTextInRect(textContent, viewport, sel) {
    const items = [];

    for (const item of textContent.items) {
      if (!item.str || item.str.trim() === '') continue;

      // Transform the text item position to canvas coordinates
      const tx = item.transform[4];
      const ty = item.transform[5];

      // Convert PDF coordinates to canvas coordinates using viewport
      const [cx, cy] = viewport.convertToViewportPoint(tx, ty);

      // Check if the point is within the selection rectangle
      // Note: cy is the baseline of the text, so we check with some margin
      if (cx >= sel.x && cx <= sel.x + sel.w && cy >= sel.y && cy <= sel.y + sel.h) {
        items.push({
          str: item.str.trim(),
          x: cx,
          y: cy,
          width: item.width * viewport.scale
        });
      }
    }

    // Sort by Y (top to bottom) then by X (left to right)
    items.sort((a, b) => {
      const yDiff = a.y - b.y;
      if (Math.abs(yDiff) < 5) return a.x - b.x; // Same line
      return yDiff;
    });

    return items;
  }
}
