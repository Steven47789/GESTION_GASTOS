// ========================
// CONFIGURACIÓN
// ========================
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTXmnrwoOi-hakVoZypQbfFBB3o0fgeS1BeqHPTKtbJmAruqP_9iGoxyLc-jegdUkpkhY6AGF9zNP_O/pub?output=csv';

const FALLBACK_DATA = [
  { fecha: '19/05/2026', tipo: 'INGRESO', categoria: 'DEPOSITO', descripcion: 'Depósito inicial', monto: 7200, metodo: 'YAPE' },
  { fecha: '20/05/2026', tipo: 'EGRESO', categoria: 'ALIMENTOS', descripcion: 'Compra supermercado', monto: 350.50, metodo: 'EFECTIVO' },
  { fecha: '21/05/2026', tipo: 'EGRESO', categoria: 'TRANSPORTE', descripcion: 'Taxi', monto: 25.00, metodo: 'YAPE' },
  { fecha: '22/05/2026', tipo: 'INGRESO', categoria: 'TRABAJO', descripcion: 'Pago cliente', monto: 1500, metodo: 'TRANSFERENCIA' },
  { fecha: '23/05/2026', tipo: 'EGRESO', categoria: 'SALUD', descripcion: 'Farmacia', monto: 120.30, metodo: 'TARJETA' },
  { fecha: '24/05/2026', tipo: 'INGRESO', categoria: 'DEPOSITO', descripcion: '', monto: 500, metodo: 'YAPE' },
  { fecha: '25/05/2026', tipo: 'EGRESO', categoria: 'ENTRETENIMIENTO', descripcion: 'Cine', monto: 45.00, metodo: 'TARJETA' },
];

let transactions = [];
let evolutionChart = null;

let mobileFilters = {
  search: '',
  type: 'all',
  category: 'all',
  payment: 'all'
};

// ========================
// INICIALIZACIÓN
// ========================
document.addEventListener('DOMContentLoaded', () => {
  loadTransactions();
  setupEventListeners();
  updateLastUpdateTime();
});

async function loadTransactions() {
  try {
    const response = await fetch(CSV_URL);
    if (!response.ok) throw new Error('No se pudo cargar el CSV');
    
    const csvText = await response.text();
    const parsed = parseCSV(csvText);
    
    if (parsed.length > 0) {
      transactions = parsed;
      showToast('Datos cargados ✅');
    } else {
      throw new Error('CSV vacío');
    }
  } catch (error) {
    console.warn('Usando datos de respaldo:', error.message);
    transactions = [...FALLBACK_DATA];
    showToast('Usando datos de ejemplo');
  }
  
  updateAllViews();
}

function parseCSV(csvText) {
  const lines = csvText.split(/\r?\n/);
  if (lines.length === 0) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  
  const fechaIdx = headers.findIndex(h => h.includes('fecha'));
  const tipoIdx = headers.findIndex(h => h.includes('tipo'));
  const categoriaIdx = headers.findIndex(h => h.includes('categoria') || h.includes('categoría'));
  const descIdx = headers.findIndex(h => h.includes('descripcion') || h.includes('descripción'));
  const montoIdx = headers.findIndex(h => h.includes('monto'));
  const metodoIdx = headers.findIndex(h => h.includes('metodo') || h.includes('método') || h.includes('pago'));
  
  const result = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    let values = [];
    let inQuote = false;
    let current = '';
    
    for (let j = 0; j < lines[i].length; j++) {
      const char = lines[i][j];
      if (char === '"') {
        inQuote = !inQuote;
      } else if (char === ',' && !inQuote) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    values = values.map(v => v.replace(/^"|"$/g, ''));
    
    const fecha = values[fechaIdx] || '';
    let tipo = (values[tipoIdx] || '').toUpperCase();
    if (tipo !== 'INGRESO' && tipo !== 'EGRESO') {
      tipo = values[tipoIdx]?.toUpperCase().includes('EGRESO') ? 'EGRESO' : 'INGRESO';
    }
    const categoria = values[categoriaIdx] || 'OTROS';
    const descripcion = values[descIdx] || '';
    let monto = parseFloat(String(values[montoIdx] || '0').replace(/[^0-9.-]/g, ''));
    if (isNaN(monto)) monto = 0;
    const metodo = values[metodoIdx] || 'OTRO';
    
    if (fecha && monto > 0) {
      result.push({ fecha, tipo, categoria, descripcion, monto, metodo });
    }
  }
  
  return result;
}

// ========================
// ACTUALIZACIÓN DE VISTAS
// ========================
function updateAllViews() {
  updateStats();
  updateRecentTable();
  updateFullTable();
  updateFiltersOptions();
  updateEvolutionChart();
}

function updateStats() {
  let totalIncome = 0, totalExpense = 0;
  
  transactions.forEach(t => {
    if (t.tipo === 'INGRESO') totalIncome += t.monto;
    else totalExpense += t.monto;
  });
  
  const balance = totalIncome - totalExpense;
  
  document.getElementById('total-income').innerHTML = `S/ ${formatNumberShort(totalIncome)}`;
  document.getElementById('total-expense').innerHTML = `S/ ${formatNumberShort(totalExpense)}`;
  document.getElementById('total-balance').innerHTML = `S/ ${formatNumberShort(balance)}`;
  document.getElementById('total-transactions').innerHTML = transactions.length;
  
  const balanceEl = document.getElementById('total-balance');
  if (balance < 0) {
    balanceEl.classList.add('negative');
  } else {
    balanceEl.classList.remove('negative');
  }
}

function updateRecentTable() {
  const tbody = document.getElementById('recent-tbody');
  const recent = [...transactions].sort((a,b) => parseDate(b.fecha) - parseDate(a.fecha)).slice(0, 5);
  
  if (recent.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="loading-text">Sin movimientos</td></tr>';
    return;
  }
  
  tbody.innerHTML = recent.map(t => `
    <tr>
      <td>${t.fecha}</td>
      <td>${t.categoria}</td>
      <td class="${t.tipo === 'INGRESO' ? 'income-text' : 'expense-text'}">
        ${t.tipo === 'INGRESO' ? '+' : '-'} S/ ${formatNumberShort(t.monto)}
      </td>
    </tr>
  `).join('');
}

function updateFullTable() {
  const isMobile = window.innerWidth <= 768;
  
  let tipo, categoria, metodo, search;
  
  if (isMobile) {
    tipo = mobileFilters.type;
    categoria = mobileFilters.category;
    metodo = mobileFilters.payment;
    search = mobileFilters.search;
  } else {
    tipo = document.getElementById('type-filter')?.value || 'all';
    categoria = document.getElementById('category-filter')?.value || 'all';
    metodo = document.getElementById('payment-filter')?.value || 'all';
    search = document.getElementById('search-input')?.value.toLowerCase() || '';
  }
  
  let filtered = [...transactions];
  
  if (tipo !== 'all') filtered = filtered.filter(t => t.tipo === tipo);
  if (categoria !== 'all') filtered = filtered.filter(t => t.categoria === categoria);
  if (metodo !== 'all') filtered = filtered.filter(t => t.metodo === metodo);
  if (search) {
    filtered = filtered.filter(t => 
      t.descripcion.toLowerCase().includes(search) || 
      t.categoria.toLowerCase().includes(search)
    );
  }
  
  filtered.sort((a,b) => parseDate(b.fecha) - parseDate(a.fecha));
  
  const tbody = document.getElementById('full-tbody');
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading-text">Sin resultados</td></tr>';
    return;
  }
  
  tbody.innerHTML = filtered.map(t => `
    <tr>
      <td>${t.fecha}</td>
      <td class="${t.tipo === 'INGRESO' ? 'income-text' : 'expense-text'}">${t.tipo}</td>
      <td>${t.categoria}</td>
      <td>${t.descripcion || '-'}</td>
      <td class="${t.tipo === 'INGRESO' ? 'income-text' : 'expense-text'}">
        ${t.tipo === 'INGRESO' ? '+' : '-'} S/ ${formatNumber(t.monto)}
      </td>
      <td>${t.metodo}</td>
    </tr>
  `).join('');
}

function updateFiltersOptions() {
  const categorias = [...new Set(transactions.map(t => t.categoria))].sort();
  const metodos = [...new Set(transactions.map(t => t.metodo))].sort();
  
  // Desktop
  const catSelect = document.getElementById('category-filter');
  const metodoSelect = document.getElementById('payment-filter');
  
  if (catSelect) {
    const current = catSelect.value;
    catSelect.innerHTML = '<option value="all">Todas</option>' + 
      categorias.map(c => `<option value="${c}">${c}</option>`).join('');
    if (categorias.includes(current)) catSelect.value = current;
  }
  
  if (metodoSelect) {
    const current = metodoSelect.value;
    metodoSelect.innerHTML = '<option value="all">Todos</option>' + 
      metodos.map(m => `<option value="${m}">${m}</option>`).join('');
    if (metodos.includes(current)) metodoSelect.value = current;
  }
  
  // Mobile
  const catSelectMobile = document.getElementById('category-filter-mobile');
  const metodoSelectMobile = document.getElementById('payment-filter-mobile');
  
  if (catSelectMobile) {
    catSelectMobile.innerHTML = '<option value="all">Todas las categorías</option>' + 
      categorias.map(c => `<option value="${c}">${c}</option>`).join('');
  }
  
  if (metodoSelectMobile) {
    metodoSelectMobile.innerHTML = '<option value="all">Todos los métodos</option>' + 
      metodos.map(m => `<option value="${m}">${m}</option>`).join('');
  }
}

// ========================
// GRÁFICO DE BARRAS
// ========================
function getDateRangeData(period) {
  const now = new Date();
  let startDate = new Date();
  
  if (period === 'week') startDate.setDate(now.getDate() - 7);
  else if (period === 'month') startDate.setMonth(now.getMonth() - 1);
  else startDate.setFullYear(now.getFullYear() - 1);
  
  const filtered = transactions.filter(t => parseDate(t.fecha) >= startDate);
  
  const grouped = new Map();
  filtered.forEach(t => {
    const key = t.fecha;
    if (!grouped.has(key)) grouped.set(key, { ingreso: 0, egreso: 0 });
    const data = grouped.get(key);
    if (t.tipo === 'INGRESO') data.ingreso += t.monto;
    else data.egreso += t.monto;
  });
  
  const sortedDates = Array.from(grouped.keys()).sort((a,b) => parseDate(a) - parseDate(b));
  const ingresos = sortedDates.map(d => grouped.get(d).ingreso);
  const egresos = sortedDates.map(d => grouped.get(d).egreso);
  
  return { labels: sortedDates, ingresos, egresos };
}

function updateEvolutionChart() {
  const period = document.getElementById('period-select')?.value || 'month';
  const { labels, ingresos, egresos } = getDateRangeData(period);
  
  const ctx = document.getElementById('evolution-chart').getContext('2d');
  
  if (evolutionChart) evolutionChart.destroy();
  
  evolutionChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Ingresos',
          data: ingresos,
          backgroundColor: 'rgba(16, 185, 129, 0.8)',
          borderColor: '#10b981',
          borderWidth: 1,
          borderRadius: 6,
          barPercentage: 0.7,
          categoryPercentage: 0.8
        },
        {
          label: 'Egresos',
          data: egresos,
          backgroundColor: 'rgba(239, 68, 68, 0.8)',
          borderColor: '#ef4444',
          borderWidth: 1,
          borderRadius: 6,
          barPercentage: 0.7,
          categoryPercentage: 0.8
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: { 
        legend: { display: false },
        tooltip: { 
          backgroundColor: '#111318', 
          titleColor: '#f0f3f8', 
          bodyColor: '#8b95a9', 
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: S/ ${formatNumber(context.raw)}`;
            }
          }
        }
      },
      scales: { 
        y: { 
          grid: { color: '#1e2229' }, 
          ticks: { color: '#8b95a9', font: { size: 9 },
            callback: function(value) {
              if (value >= 1000) return 'S/ ' + (value / 1000).toFixed(0) + 'K';
              return 'S/ ' + value;
            }
          },
          beginAtZero: true
        }, 
        x: { ticks: { color: '#8b95a9', maxRotation: 45, font: { size: 8 } } } 
      }
    }
  });
}

// ========================
// UTILIDADES
// ========================
function parseDate(dateStr) {
  const parts = dateStr.split('/');
  if (parts.length === 3) return new Date(parts[2], parts[1]-1, parts[0]);
  return new Date(0);
}

function formatNumber(num) {
  return num.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatNumberShort(num) {
  if (Math.abs(num) >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (Math.abs(num) >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function showToast(message) {
  const toast = document.getElementById('toast-notification');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function updateLastUpdateTime() {
  const now = new Date();
  const timeString = now.toLocaleTimeString();
  const headerSync = document.getElementById('header-last-update');
  if (headerSync) {
    headerSync.innerHTML = `Sync: ${timeString}`;
  }
}

function updateActiveFiltersBadge() {
  const badge = document.getElementById('active-filters-badge');
  let count = 0;
  if (mobileFilters.search) count++;
  if (mobileFilters.type !== 'all') count++;
  if (mobileFilters.category !== 'all') count++;
  if (mobileFilters.payment !== 'all') count++;
  
  if (badge) {
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }
}

function updateFiltersSummary() {
  const summaryDiv = document.getElementById('active-filters-summary');
  if (!summaryDiv) return;
  
  const filters = [];
  if (mobileFilters.search) filters.push(`🔍 "${mobileFilters.search}"`);
  if (mobileFilters.type !== 'all') filters.push(mobileFilters.type === 'INGRESO' ? '📈 Ingresos' : '📉 Egresos');
  if (mobileFilters.category !== 'all') filters.push(`🏷️ ${mobileFilters.category}`);
  if (mobileFilters.payment !== 'all') filters.push(`💳 ${mobileFilters.payment}`);
  
  if (filters.length === 0) {
    summaryDiv.innerHTML = '<span style="opacity:0.6;">No hay filtros activos</span>';
  } else {
    summaryDiv.innerHTML = filters.map(f => `<span class="filter-tag">${f}</span>`).join('');
  }
}

// ========================
// COLLAPSIBLE CHART
// ========================
function setupCollapsibleChart() {
  const btn = document.getElementById('toggle-chart-btn');
  const content = document.getElementById('chart-content');
  
  if (!btn || !content) return;
  
  btn.addEventListener('click', () => {
    btn.classList.toggle('active');
    content.classList.toggle('show');
    setTimeout(() => updateEvolutionChart(), 100);
  });
}

// ========================
// MODAL FILTROS MÓVIL MEJORADO
// ========================
function setupMobileFilters() {
  const modal = document.getElementById('filter-modal');
  const openBtn = document.getElementById('open-filter-modal');
  const closeBtn = document.getElementById('close-filter-modal');
  const applyBtn = document.getElementById('apply-filters-mobile');
  const resetBtn = document.getElementById('reset-filters-mobile');
  
  const searchInput = document.getElementById('search-input-mobile');
  const categorySelect = document.getElementById('category-filter-mobile');
  const paymentSelect = document.getElementById('payment-filter-mobile');
  
  // Type buttons
  const typeButtons = document.querySelectorAll('.type-option');
  let selectedType = mobileFilters.type;
  
  function updateTypeButtonsUI() {
    typeButtons.forEach(btn => {
      if (btn.dataset.type === selectedType) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }
  
  typeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      selectedType = btn.dataset.type;
      updateTypeButtonsUI();
    });
  });
  
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      searchInput.value = mobileFilters.search;
      categorySelect.value = mobileFilters.category;
      paymentSelect.value = mobileFilters.payment;
      selectedType = mobileFilters.type;
      updateTypeButtonsUI();
      updateFiltersSummary();
      modal.classList.add('show');
    });
  }
  
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('show');
    });
  }
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('show');
  });
  
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      mobileFilters = {
        search: searchInput.value.toLowerCase(),
        type: selectedType,
        category: categorySelect.value,
        payment: paymentSelect.value
      };
      modal.classList.remove('show');
      updateFullTable();
      updateActiveFiltersBadge();
      updateFiltersSummary();
      showToast('Filtros aplicados');
    });
  }
  
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      mobileFilters = { search: '', type: 'all', category: 'all', payment: 'all' };
      selectedType = 'all';
      if (searchInput) searchInput.value = '';
      if (categorySelect) categorySelect.value = 'all';
      if (paymentSelect) paymentSelect.value = 'all';
      updateTypeButtonsUI();
      updateFullTable();
      updateActiveFiltersBadge();
      updateFiltersSummary();
      showToast('Filtros limpiados');
    });
  }
}

// ========================
// EVENT LISTENERS
// ========================
function setupEventListeners() {
  // Navegación
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.dataset.view;
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById(`${view}-view`).classList.add('active');
      
      const titles = { dashboard: 'Finanzas', transactions: 'Movimientos' };
      const subtitles = { dashboard: 'Ingresos y egresos', transactions: 'Historial completo' };
      document.getElementById('page-title').textContent = titles[view] || 'Control';
      document.getElementById('page-subtitle').textContent = subtitles[view] || '';
      
      if (view === 'dashboard' && evolutionChart) {
        setTimeout(() => updateEvolutionChart(), 100);
      }
    });
  });
  
  // Refrescar
  document.getElementById('refresh-data').addEventListener('click', () => { 
    loadTransactions(); 
    updateLastUpdateTime(); 
  });
  
  // Filtros desktop
  const filters = ['type-filter', 'category-filter', 'payment-filter', 'search-input'];
  filters.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => updateFullTable());
  });
  
  document.getElementById('reset-filters')?.addEventListener('click', () => {
    document.getElementById('type-filter').value = 'all';
    document.getElementById('category-filter').value = 'all';
    document.getElementById('payment-filter').value = 'all';
    document.getElementById('search-input').value = '';
    updateFullTable();
  });
  
  // Periodo gráfico
  document.getElementById('period-select')?.addEventListener('change', () => updateEvolutionChart());
  
  // Ver todos
  document.querySelectorAll('.view-all-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelector('[data-view="transactions"]').click();
    });
  });
  
  setupCollapsibleChart();
  setupMobileFilters();
  
  window.addEventListener('resize', () => updateFullTable());
}