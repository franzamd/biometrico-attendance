// ===== app.js — Main Application Module =====
import { PDFHandler } from './pdf-handler.js';
import { DataProcessor } from './data-processor.js';

// ===== DEFAULT EMPLOYEE DATA =====
const DEFAULT_EMPLOYEES = [
  {
    id: 2, name: 'Claudia', company: 'Andalucia Tours',
    weekday: [
      { shift: 'Mañana', entry: '09:00', exit: '12:30' },
      { shift: 'Tarde', entry: '15:00', exit: '19:00' }
    ],
    saturday: [{ shift: 'Mañana', entry: '09:00', exit: '13:00' }]
  },
  {
    id: 3, name: 'Carla', company: 'Andalucia Tours',
    weekday: [
      { shift: 'Mañana', entry: '09:00', exit: '12:30' },
      { shift: 'Tarde', entry: '15:00', exit: '19:00' }
    ],
    saturday: [{ shift: 'Mañana', entry: '09:00', exit: '13:00' }]
  },
  {
    id: 4, name: 'Rina', company: 'Andalucia Tours',
    weekday: [
      { shift: 'Tarde', entry: '14:30', exit: '18:30' }
    ],
    saturday: [{ shift: 'Mañana', entry: '09:00', exit: '13:00' }]
  },
  {
    id: 3, name: 'Mariela', company: 'Andalucia Tours',
    weekday: [
      { shift: 'Mañana', entry: '09:00', exit: '12:30' },
      { shift: 'Tarde', entry: '15:00', exit: '19:00' }
    ],
    saturday: [{ shift: 'Mañana', entry: '09:00', exit: '13:00' }]
  },
];

// ===== APP STATE =====
const state = {
  employees: [],
  tolerance: 5,
  currentStep: 1,
  records: {},        // { employeeId: [ {date, time, type, raw} ] }
  processedData: {},  // { employeeId: [ {date, day, shift, scheduled, entry, exit, delay, notes, status} ] }
  activeEmployeeTab: null,
  dateFormat: 'YYYY-MM-DD'
};

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  initMonthYear();
  initStepNav();
  renderEmployeeGrid();
  initEmployeeModal();
  initUploadArea();
  window.pdfHandler = new PDFHandler(state);
  window.dataProcessor = new DataProcessor(state);
});

// ===== LOCAL STORAGE =====
function saveState() {
  // Only persist configuration and employee list. 
  // Records and processed data are cleared on refresh as requested.
  const data = { 
    employees: state.employees, 
    tolerance: state.tolerance, 
    dateFormat: state.dateFormat 
  };
  try { localStorage.setItem('biometrico_state', JSON.stringify(data)); } catch(e) { console.warn('Storage full', e); }
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem('biometrico_state'));
    state.records = {};        // Always empty on load
    state.processedData = {};  // Always empty on load
    
    if (saved) {
      state.employees = saved.employees || DEFAULT_EMPLOYEES;
      state.tolerance = saved.tolerance ?? 5;
      state.dateFormat = saved.dateFormat || 'YYYY-MM-DD';
    } else {
      state.employees = JSON.parse(JSON.stringify(DEFAULT_EMPLOYEES));
    }
  } catch {
    state.employees = JSON.parse(JSON.stringify(DEFAULT_EMPLOYEES));
    state.records = {};
    state.processedData = {};
  }
  
  document.getElementById('toleranceInput').value = state.tolerance;
  document.getElementById('toleranceInput').addEventListener('change', e => {
    state.tolerance = parseInt(e.target.value) || 5;
    saveState();
  });

  const formatSelect = document.getElementById('dateFormatSelect');
  if (formatSelect) {
    formatSelect.value = state.dateFormat;
    formatSelect.addEventListener('change', e => {
      state.dateFormat = e.target.value;
      saveState();
      if (state.currentStep === 3) renderRecordsTable(state.activeEmployeeTab);
      if (state.currentStep === 4) renderReport();
    });
  }
  document.querySelectorAll('#printCols, #printSize, #printOrientation').forEach(sel => {
    sel?.addEventListener('change', () => {
      const empSelect = document.getElementById('reportEmployeeSelect');
      if (empSelect && empSelect.value) {
        renderReportForEmployee(parseInt(empSelect.value));
      }
    });
  });
}

// ===== DATE FORMATTER =====
function formatDateDisplay(dateStr) {
  if (!dateStr || dateStr === '—') return dateStr;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  if (state.dateFormat === 'DD-MM-YYYY') return `${d}-${m}-${y}`;
  if (state.dateFormat === 'MM-DD-YYYY') return `${m}-${d}-${y}`;
  return dateStr;
}

// ===== MONTH/YEAR SELECTORS =====
function initMonthYear() {
  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const selMonth = document.getElementById('selectMonth');
  const selYear = document.getElementById('selectYear');
  const now = new Date();
  months.forEach((m, i) => {
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = m;
    if (i === now.getMonth()) opt.selected = true;
    selMonth.appendChild(opt);
  });
  for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y++) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    if (y === now.getFullYear()) opt.selected = true;
    selYear.appendChild(opt);
  }
}

// ===== STEP NAVIGATION =====
function initStepNav() {
  document.querySelectorAll('.step-tab').forEach(tab => {
    tab.addEventListener('click', () => goToStep(parseInt(tab.dataset.step)));
  });
  document.querySelectorAll('.btn-next, .btn-back').forEach(btn => {
    btn.addEventListener('click', () => goToStep(parseInt(btn.dataset.next)));
  });
}

function goToStep(step) {
  state.currentStep = step;
  document.querySelectorAll('.step-section').forEach(s => s.classList.remove('active'));
  document.getElementById(`step-${step}`).classList.add('active');
  document.querySelectorAll('.step-tab').forEach(t => {
    const s = parseInt(t.dataset.step);
    t.classList.toggle('active', s === step);
    t.classList.toggle('completed', s < step);
  });
  if (step === 2) updateEmployeeSelect();
  if (step === 3) renderRecordsTabs();
  if (step === 4) renderReport();
}

// ===== EMPLOYEE GRID =====
function renderEmployeeGrid() {
  const grid = document.getElementById('employeeGrid');
  grid.innerHTML = state.employees.map(emp => `
    <div class="employee-card" data-id="${emp.id}">
      <div class="employee-card-header">
        <div>
          <div class="employee-name">${emp.name}</div>
          <div class="employee-company">${emp.company}</div>
        </div>
        <div class="card-actions">
          <button onclick="window.editEmployee(${emp.id})" title="Editar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="delete" onclick="window.deleteEmployee(${emp.id})" title="Eliminar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
      <div class="schedule-block">
        <div class="schedule-label">Lunes a Viernes</div>
        <div class="schedule-shifts">
          ${emp.weekday.map(s => `<span class="shift-badge">${s.shift}: ${s.entry} - ${s.exit}</span>`).join('')}
          ${emp.weekday.length === 0 ? '<span class="shift-badge" style="opacity:.5">Sin horario</span>' : ''}
        </div>
      </div>
      <div class="schedule-block">
        <div class="schedule-label">Sábado</div>
        <div class="schedule-shifts">
          ${emp.saturday.map(s => `<span class="shift-badge">${s.shift}: ${s.entry} - ${s.exit}</span>`).join('')}
          ${emp.saturday.length === 0 ? '<span class="shift-badge" style="opacity:.5">No trabaja</span>' : ''}
        </div>
      </div>
    </div>
  `).join('');
}

// ===== EMPLOYEE MODAL =====
function initEmployeeModal() {
  const modal = document.getElementById('employeeModal');
  const btnAdd = document.getElementById('btnAddEmployee');
  const btnClose = document.getElementById('btnCloseModal');
  const btnCancel = document.getElementById('btnCancelModal');
  const btnSave = document.getElementById('btnSaveEmployee');
  const btnAddWS = document.getElementById('btnAddWeekdayShift');
  const btnAddSS = document.getElementById('btnAddSaturdayShift');

  btnAdd.addEventListener('click', () => openModal());
  btnClose.addEventListener('click', () => closeModal());
  btnCancel.addEventListener('click', () => closeModal());
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  btnSave.addEventListener('click', () => saveEmployee());
  btnAddWS.addEventListener('click', () => addShiftRow('weekdayShifts'));
  btnAddSS.addEventListener('click', () => addShiftRow('saturdayShifts'));
}

function openModal(empId = null) {
  const modal = document.getElementById('employeeModal');
  document.getElementById('modalTitle').textContent = empId ? 'Editar Empleado' : 'Agregar Empleado';
  document.getElementById('editEmployeeId').value = empId || '';
  if (empId) {
    const emp = state.employees.find(e => e.id === empId);
    if (!emp) return;
    document.getElementById('empName').value = emp.name;
    document.getElementById('empCompany').value = emp.company;
    renderShiftRows('weekdayShifts', emp.weekday);
    renderShiftRows('saturdayShifts', emp.saturday);
  } else {
    document.getElementById('empName').value = '';
    document.getElementById('empCompany').value = 'Andalucia Tours';
    renderShiftRows('weekdayShifts', [{ shift: 'Mañana', entry: '09:00', exit: '12:30' }]);
    renderShiftRows('saturdayShifts', []);
  }
  modal.style.display = 'grid';
}

function closeModal() {
  document.getElementById('employeeModal').style.display = 'none';
}

function renderShiftRows(containerId, shifts) {
  const container = document.getElementById(containerId);
  container.innerHTML = shifts.map((s, i) => `
    <div class="shift-row">
      <div class="shift-col">
        <label>Turno</label>
        <select class="shift-name">
          <option value="Mañana" ${s.shift==='Mañana'?'selected':''}>Mañana</option>
          <option value="Tarde" ${s.shift==='Tarde'?'selected':''}>Tarde</option>
          <option value="Noche" ${s.shift==='Noche'?'selected':''}>Noche</option>
        </select>
      </div>
      <div class="shift-col">
        <label>Entrada</label>
        <input type="time" class="shift-entry" value="${s.entry}">
      </div>
      <div class="shift-col">
        <label>Salida</label>
        <input type="time" class="shift-exit" value="${s.exit}">
      </div>
      <button type="button" class="btn-remove-shift" onclick="this.parentElement.remove()" title="Eliminar turno">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `).join('');
}

function addShiftRow(containerId) {
  const container = document.getElementById(containerId);
  const div = document.createElement('div');
  div.className = 'shift-row';
  div.innerHTML = `
    <div class="shift-col">
      <label>Turno</label>
      <select class="shift-name">
        <option value="Mañana">Mañana</option>
        <option value="Tarde" selected>Tarde</option>
        <option value="Noche">Noche</option>
      </select>
    </div>
    <div class="shift-col">
      <label>Entrada</label>
      <input type="time" class="shift-entry" value="">
    </div>
    <div class="shift-col">
      <label>Salida</label>
      <input type="time" class="shift-exit" value="">
    </div>
    <button type="button" class="btn-remove-shift" onclick="this.parentElement.remove()" title="Eliminar turno">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;
  container.appendChild(div);
}

function getShiftsFromContainer(containerId) {
  const rows = document.querySelectorAll(`#${containerId} .shift-row`);
  return Array.from(rows).map(row => ({
    shift: row.querySelector('.shift-name').value.trim() || 'Turno',
    entry: row.querySelector('.shift-entry').value,
    exit: row.querySelector('.shift-exit').value
  })).filter(s => s.entry && s.exit);
}

function saveEmployee() {
  const name = document.getElementById('empName').value.trim();
  if (!name) { showToast('Ingrese el nombre del empleado', 'error'); return; }
  const company = document.getElementById('empCompany').value.trim() || 'Andalucia Tours';
  const weekday = getShiftsFromContainer('weekdayShifts');
  const saturday = getShiftsFromContainer('saturdayShifts');
  const editId = document.getElementById('editEmployeeId').value;

  if (editId) {
    const emp = state.employees.find(e => e.id === parseInt(editId));
    if (emp) { emp.name = name; emp.company = company; emp.weekday = weekday; emp.saturday = saturday; }
  } else {
    const newId = state.employees.length > 0 ? Math.max(...state.employees.map(e => e.id)) + 1 : 1;
    state.employees.push({ id: newId, name, company, weekday, saturday });
  }
  saveState();
  renderEmployeeGrid();
  closeModal();
  showToast(`Empleado ${editId ? 'actualizado' : 'agregado'} correctamente`, 'success');
}

// ===== GLOBAL FUNCTIONS =====
window.editEmployee = (id) => openModal(id);
window.deleteEmployee = (id) => {
  if (!confirm('¿Eliminar este empleado?')) return;
  state.employees = state.employees.filter(e => e.id !== id);
  delete state.records[id];
  delete state.processedData[id];
  saveState();
  renderEmployeeGrid();
  showToast('Empleado eliminado', 'info');
};

// ===== UPLOAD AREA =====
function initUploadArea() {
  const area = document.getElementById('uploadArea');
  const input = document.getElementById('pdfFileInput');
  area.addEventListener('click', () => input.click());
  area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('dragover'); });
  area.addEventListener('dragleave', () => area.classList.remove('dragover'));
  area.addEventListener('drop', e => {
    e.preventDefault(); area.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') handlePDFFile(file);
    else showToast('Solo se aceptan archivos PDF', 'error');
  });
  input.addEventListener('change', e => {
    if (e.target.files[0]) handlePDFFile(e.target.files[0]);
  });
}

function handlePDFFile(file) {
  document.getElementById('uploadArea').style.display = 'none';
  document.getElementById('pdfWorkspace').style.display = 'block';
  window.pdfHandler.loadPDF(file);
  showToast(`PDF "${file.name}" cargado correctamente`, 'success');
}

function updateEmployeeSelect() {
  const sel = document.getElementById('employeeSelect');
  const current = sel.value;
  sel.innerHTML = '<option value="">— Seleccione empleado —</option>';
  state.employees.forEach(emp => {
    const opt = document.createElement('option');
    opt.value = emp.id; opt.textContent = emp.name;
    sel.appendChild(opt);
  });
  if (current) sel.value = current;
}

// ===== RECORDS TABS =====
function renderRecordsTabs() {
  const tabs = document.getElementById('recordsTabs');
  const empsWithData = state.employees.filter(e => state.processedData[e.id]?.length > 0);
  if (empsWithData.length === 0) {
    tabs.innerHTML = '';
    document.getElementById('employeeInfoBar').style.display = 'none';
    document.getElementById('recordsBody').innerHTML = `
      <tr class="empty-row"><td colspan="11">
        <div class="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
          <p>No hay registros cargados aún.</p>
          <span>Vuelva al Paso 2 para cargar y extraer datos del PDF.</span>
        </div>
      </td></tr>`;
    return;
  }
  if (!state.activeEmployeeTab || !empsWithData.find(e => e.id === state.activeEmployeeTab)) {
    state.activeEmployeeTab = empsWithData[0].id;
  }
  tabs.innerHTML = empsWithData.map(emp => `
    <button class="record-tab ${emp.id === state.activeEmployeeTab ? 'active' : ''}"
            onclick="window.switchEmployeeTab(${emp.id})">
      ${emp.name}
      <span class="tab-count">${state.processedData[emp.id]?.length || 0}</span>
    </button>
  `).join('');
  renderRecordsTable(state.activeEmployeeTab);
}

window.switchEmployeeTab = (empId) => {
  state.activeEmployeeTab = empId;
  document.querySelectorAll('.record-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.record-tab[onclick*="${empId}"]`)?.classList.add('active');
  renderRecordsTable(empId);
};

function renderRecordsTable(empId) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;
  const data = state.processedData[empId] || [];
  const infoBar = document.getElementById('employeeInfoBar');
  infoBar.style.display = 'flex';
  document.getElementById('infoName').textContent = emp.name;
  document.getElementById('infoWeekday').textContent = emp.weekday.map(s => `${s.shift} ${s.entry}-${s.exit}`).join(' | ') || 'N/A';
  document.getElementById('infoSaturday').textContent = emp.saturday.map(s => `${s.entry}-${s.exit}`).join(' | ') || 'No trabaja';
  document.getElementById('infoTolerance').textContent = `${state.tolerance} min`;

  const tbody = document.getElementById('recordsBody');
  if (data.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="11"><div class="empty-state"><p>Sin registros para este empleado.</p></div></td></tr>';
    return;
  }

  const DAYS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  tbody.innerHTML = data.map((row, i) => {
    let statusClass = 'no-data';
    if (row.status === 'on-time') statusClass = 'on-time';
    else if (row.status === 'late') statusClass = 'late';
    else if (row.status === 'warning') statusClass = 'warning';

    const delayText = row.delay > 0 ? `+${row.delay}` : (row.delay === 0 ? '0' : '—');
    const delayClass = row.delay > 0 ? 'delay-late' : 'delay-ok';
    const shiftClass = row.shift === 'Mañana' ? 'morning' : 'afternoon';
    const rowClass = row.status === 'warning' ? 'row-warning' : '';

    return `<tr class="${rowClass}" data-idx="${i}">
      <td class="col-status"><div class="status-bar ${statusClass}"></div></td>
      <td class="col-num">${i + 1}</td>
      <td class="col-date">${formatDateDisplay(row.date)}</td>
      <td class="col-day">${row.day || ''}</td>
      <td class="col-shift"><span class="shift-tag ${shiftClass}">${row.shift || ''}</span></td>
      <td class="col-scheduled">${row.scheduled || '—'}</td>
      <td class="col-entry">${row.entry || '—'}</td>
      <td class="col-delay"><span class="${delayClass}">${delayText}</span></td>
      <td class="col-exit">${row.exit || '—'}</td>
      <td class="col-notes"><input type="text" value="${row.notes || ''}" onchange="window.updateNote(${empId},${i},this.value)" placeholder="Agregar nota..."></td>
      <td class="col-actions">
        <button class="btn btn-icon" style="width:28px;height:28px;" onclick="window.deleteRecord(${empId},${i})" title="Eliminar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </td>
    </tr>`;
  }).join('');
}

window.updateNote = (empId, idx, val) => {
  if (state.processedData[empId]?.[idx]) {
    state.processedData[empId][idx].notes = val;
    saveState();
  }
};

window.deleteRecord = (empId, idx) => {
  if (!state.processedData[empId]) return;
  state.processedData[empId].splice(idx, 1);
  saveState();
  renderRecordsTable(empId);
  showToast('Registro eliminado', 'info');
};

// ===== REPORT =====
function renderReport() {
  const empSelect = document.getElementById('reportEmployeeSelect');
  const reportContainer = document.getElementById('printableReport');
  
  const empsWithData = state.employees.filter(e => state.processedData[e.id]?.length > 0);

  if (empsWithData.length === 0) {
    empSelect.innerHTML = '<option value="">Sin datos</option>';
    reportContainer.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)">No hay datos para generar reporte.</div>';
    return;
  }

  // Populate select if empty or mismatched
  empSelect.innerHTML = empsWithData.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
  empSelect.onchange = () => renderReportForEmployee(parseInt(empSelect.value));

  const selectedEmpId = parseInt(empSelect.value) || empsWithData[0].id;
  renderReportForEmployee(selectedEmpId);
}

function renderReportForEmployee(empId) {
  const reportContainer = document.getElementById('printableReport');
  const emp = state.employees.find(e => e.id === empId);
  const data = state.processedData[empId] || [];

  if (!emp || data.length === 0) {
    reportContainer.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)">No hay datos para este empleado.</div>';
    return;
  }

  // Calculate Date Range
  const dates = data.map(r => r.date).filter(d => d).sort();
  const firstDate = dates[0] ? formatDateDisplay(dates[0]) : '—';
  const lastDate = dates[dates.length - 1] ? formatDateDisplay(dates[dates.length - 1]) : '—';
  const monthName = document.getElementById('selectMonth').selectedOptions[0]?.text || '';
  const yearName = document.getElementById('selectYear').value || '';

  // Calculate Summary
  let totalLate = 0, totalDelayMin = 0, totalOnTime = 0;
  const uniqueDays = new Set();
  
  data.forEach(r => {
    if (r.date) uniqueDays.add(r.date);
    if (r.status === 'late') { totalLate++; totalDelayMin += r.delay || 0; }
    if (r.status === 'on-time') totalOnTime++;
  });
  const totalDays = uniqueDays.size;

  const scheduleHTML = `
    <div class="report-schedules">
      <div class="schedule-box">
        <h4>Horario Lunes a Viernes</h4>
        ${emp.weekday.length ? emp.weekday.map(s => `<div>${s.shift}: ${s.entry} - ${s.exit}</div>`).join('') : '<div>Sin horario</div>'}
      </div>
      <div class="schedule-box">
        <h4>Horario Sábado</h4>
        ${emp.saturday.length ? emp.saturday.map(s => `<div>${s.shift}: ${s.entry} - ${s.exit}</div>`).join('') : '<div>No trabaja</div>'}
      </div>
    </div>
  `;

  const cardsHTML = `
    <h3 class="report-section-title">Consolidado Mensual</h3>
    <div class="report-cards">
      <div class="report-card card-accent"><div class="report-card-value">${totalDays}</div><div class="report-card-label">Días Trabajados</div><div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px;">Días únicos con asistencia</div></div>
      <div class="report-card card-green"><div class="report-card-value">${totalOnTime}</div><div class="report-card-label">Llegadas Puntuales</div><div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px;">Total de turnos a tiempo</div></div>
      <div class="report-card card-red"><div class="report-card-value">${totalLate}</div><div class="report-card-label">Llegadas Tarde</div><div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px;">Total de turnos con retraso</div></div>
      <div class="report-card card-yellow"><div class="report-card-value">${totalDelayMin} min</div><div class="report-card-label">Tiempo Perdido</div><div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px;">Suma total de retrasos al ingreso</div></div>
    </div>
  `;

  const cols = parseInt(document.getElementById('printCols')?.value) || 1;
  const rowsPerCol = 35; 
  const rowsPerPage = rowsPerCol * cols;
  
  let tableHTML = `<h3 class="report-section-title">Detalle de Asistencias</h3>`;
  
  if (cols === 1) {
    // Single table for 1-column layout
    tableHTML += renderTableChunk(data, 0, data.length, cols);
  } else {
    // Group into pages for multi-column layout
    for (let p = 0; p < data.length; p += rowsPerPage) {
      const pageData = data.slice(p, p + rowsPerPage);
      // Dynamically calculate how many rows per column to fill all columns
      const currentRowsPerCol = Math.ceil(pageData.length / cols);
      
      tableHTML += `<div class="report-page-block cols-${cols}" style="display: flex; gap: 10px; margin-bottom: 15px; break-inside: avoid;">`;
      for (let c = 0; c < cols; c++) {
        const colData = pageData.slice(c * currentRowsPerCol, (c + 1) * currentRowsPerCol);
        if (colData.length === 0 && c > 0) break;
        tableHTML += renderTableChunk(colData, p + (c * currentRowsPerCol), colData.length, cols);
      }
      tableHTML += `</div>`;
    }
  }

  function renderTableChunk(chunkData, startIndex, length, numCols) {
    return `
      <table class="records-table report-main-table" style="flex: 1; min-width: 0; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="width: 25px; text-align: center;">#</th>
            <th>Fecha</th>
            <th class="col-day-name">Día</th>
            <th>Turno</th>
            <th class="col-sched">Horario</th>
            <th>Entrada</th>
            <th>Retraso</th>
            <th>Salida</th>
            ${numCols < 3 ? '<th class="col-notes">Notas</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${chunkData.map((row, idx) => {
            const globalIdx = startIndex + idx + 1;
            const delayText = row.delay > 0 ? `+${row.delay}` : (row.delay === 0 ? '0' : '—');
            const delayClass = row.delay > 0 ? 'delay-late' : 'delay-ok';
            return `
              <tr>
                <td style="color:#94a3b8; text-align: center; font-size: 0.6rem; width: 25px;">${globalIdx}</td>
                <td style="white-space: nowrap;">${formatDateDisplay(row.date)}</td>
                <td class="col-day-name">${row.day || ''}</td>
                <td>${row.shift || ''}</td>
                <td class="col-sched">${row.scheduled || '—'}</td>
                <td>${row.entry || '—'}</td>
                <td class="${delayClass}">${delayText}</td>
                <td>${row.exit || '—'}</td>
                ${numCols < 3 ? `<td class="col-notes">${row.notes || ''}</td>` : ''}
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  reportContainer.innerHTML = `
    <div class="report-header-doc">
      <h2>Reporte de Asistencia Biométrico</h2>
      <h3>${emp.company || 'Empresa'}</h3>
      <div class="report-meta">
        <span><strong>Empleado:</strong> ${emp.name}</span>
        <span><strong>Periodo:</strong> ${monthName} ${yearName}</span>
        <span><strong>Rango:</strong> ${firstDate} al ${lastDate}</span>
      </div>
    </div>
    ${scheduleHTML}
    ${cardsHTML}
    ${tableHTML}
  `;
}

// ===== PRINT =====
document.getElementById('btnPrintReport')?.addEventListener('click', () => {
  const size = document.getElementById('printSize')?.value || 'A4';
  const orientation = document.getElementById('printOrientation')?.value || 'portrait';
  
  let styleEl = document.getElementById('dynamic-print-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'dynamic-print-style';
    document.head.appendChild(styleEl);
  }
  
  styleEl.textContent = `@media print { @page { size: ${size} ${orientation}; margin: 15mm; } }`;
  
  // Give the browser a tiny moment to apply the style before opening the print dialog
  setTimeout(() => window.print(), 50);
});

// ===== EXPORT CSV =====
document.getElementById('btnExportCSV')?.addEventListener('click', () => {
  const empId = document.getElementById('reportEmployeeSelect')?.value;
  if (!empId) { showToast('No hay empleado seleccionado', 'error'); return; }
  
  const emp = state.employees.find(e => e.id === parseInt(empId));
  const data = state.processedData[empId];
  if (!data || data.length === 0) { showToast('No hay datos para exportar', 'error'); return; }

  // Date Range and Period
  const dates = data.map(r => r.date).filter(d => d).sort();
  const firstDate = dates[0] ? formatDateDisplay(dates[0]) : '—';
  const lastDate = dates[dates.length - 1] ? formatDateDisplay(dates[dates.length - 1]) : '—';
  const monthName = document.getElementById('selectMonth').selectedOptions[0]?.text || '';
  const yearName = document.getElementById('selectYear').value || '';

  // Calculate Summary
  let totalLate = 0, totalDelayMin = 0, totalOnTime = 0;
  const uniqueDays = new Set();
  data.forEach(r => {
    if (r.date) uniqueDays.add(r.date);
    if (r.status === 'late') { totalLate++; totalDelayMin += r.delay || 0; }
    if (r.status === 'on-time') totalOnTime++;
  });
  const totalDays = uniqueDays.size;

  // Format Schedules
  const weekdaySchedule = emp.weekday.length ? emp.weekday.map(s => `${s.shift}: ${s.entry} - ${s.exit}`).join(' | ') : 'Sin horario';
  const saturdaySchedule = emp.saturday.length ? emp.saturday.map(s => `${s.shift}: ${s.entry} - ${s.exit}`).join(' | ') : 'No trabaja';

  // Build CSV content
  let csv = '"REPORTE DE ASISTENCIA BIOMÉTRICO"\n';
  csv += `"Empresa:","${emp.company || ''}"\n`;
  csv += `"Empleado:","${emp.name}"\n`;
  csv += `"Periodo:","${monthName} ${yearName}"\n`;
  csv += `"Rango:","${firstDate} al ${lastDate}"\n\n`;

  csv += '"HORARIOS"\n';
  csv += `"Lunes a Viernes:","${weekdaySchedule}"\n`;
  csv += `"Sábado:","${saturdaySchedule}"\n\n`;

  csv += '"CONSOLIDADO MENSUAL"\n';
  csv += `"Días Trabajados:","${totalDays} (Días únicos con asistencia)"\n`;
  csv += `"Llegadas Puntuales:","${totalOnTime} (Total de turnos a tiempo)"\n`;
  csv += `"Llegadas Tarde:","${totalLate} (Total de turnos con retraso)"\n`;
  csv += `"Tiempo Perdido:","${totalDelayMin} min (Suma total de retrasos al ingreso)"\n\n`;

  csv += '"DETALLE DE ASISTENCIAS"\n';
  csv += '"Fecha","Día","Turno","Hora Programada","Hora Entrada","Retraso (min)","Hora Salida","Notas"\n';
  
  data.forEach(r => {
    csv += `"${formatDateDisplay(r.date)}","${r.day}","${r.shift}","${r.scheduled}","${r.entry || ''}","${r.delay ?? ''}","${r.exit || ''}","${r.notes || ''}"\n`;
  });
  
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `asistencia_${emp.name.replace(/\s+/g, '_')}_${document.getElementById('selectMonth').selectedOptions[0]?.text}_${document.getElementById('selectYear').value}.csv`;
  a.click(); URL.revokeObjectURL(a.href);
  showToast('CSV exportado correctamente', 'success');
});

// ===== TOAST =====
function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(20px)'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// ===== EXPORTS =====
export { state, saveState, showToast, renderRecordsTabs, renderRecordsTable };
