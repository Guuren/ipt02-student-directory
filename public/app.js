const API_BASE = '/api';


async function handleLogin(e) {
  e.preventDefault();
  const student_id = document.getElementById('login-student-id').value;
  const password = document.getElementById('login-password').value;
  const alertBox = document.getElementById('login-alert');

  alertBox.classList.add('d-none');

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id, password })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || 'Authentication failed');
    }

    localStorage.setItem('jwt_token', data.token);
    localStorage.setItem('student_user', JSON.stringify(data.student));
    showDashboard();
  } catch (err) {
    alertBox.textContent = err.message;
    alertBox.classList.remove('d-none');
  }
}

function showDashboard() {
  document.getElementById('login-section').classList.add('d-none');
  document.getElementById('dashboard-section').classList.remove('d-none');
  document.getElementById('logout-btn').classList.remove('d-none');
  loadStudents();
}

function logout() {
  localStorage.removeItem('jwt_token');
  localStorage.removeItem('student_user');
  document.getElementById('dashboard-section').classList.add('d-none');
  document.getElementById('logout-btn').classList.add('d-none');
  document.getElementById('login-section').classList.remove('d-none');
}

async function loadStudents() {
  const tableBody = document.getElementById('student-table-body');
  const token = localStorage.getItem('jwt_token');

  // If no token is stored, return user to login UI
  if (!token) {
    logout();
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/students`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    // Handle expired or invalid session tokens
    if (res.status === 401 || res.status === 403) {
      logout();
      throw new Error('Session expired. Please log in again.');
    }

    const students = await res.json();

    if (!res.ok) {
      throw new Error(students.message || 'Failed to load student data');
    }

    renderAnalytics(students);
    renderTable(students);
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-danger">${err.message}</td></tr>`;
  }
}

function renderAnalytics(students) {
  const totalStudents = students.length;
  const uniqueSections = new Set(students.map(s => s.section)).size;
  const withAvatars = students.filter(s => s.profile_picture_url && !s.profile_picture_url.includes('placeholder')).length;
  const completionRate = totalStudents > 0 ? Math.round((withAvatars / totalStudents) * 100) : 0;

  document.getElementById('stat-total-students').textContent = totalStudents;
  document.getElementById('stat-total-sections').textContent = uniqueSections;
  document.getElementById('stat-profile-completion').textContent = `${completionRate}%`;
}

function renderTable(students) {
  const tableBody = document.getElementById('student-table-body');
  if (!tableBody) return;

  if (!students || students.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No student records found.</td></tr>';
    return;
  }

  // Pure SVG fallback—no external network request required
  const defaultAvatar = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 24 24' fill='%23ccc'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";

  const newHtml = students.map(s => {
    const avatarUrl = (s.profile_picture_url && s.profile_picture_url.trim() !== '') 
      ? s.profile_picture_url 
      : defaultAvatar;

    return `
      <tr>
        <td style="width: 50px;">
          <img src="${avatarUrl}" alt="Avatar" class="avatar-img" width="40" height="40" onerror="this.onerror=null; this.src='${defaultAvatar}';">
        </td>
        <td class="fw-bold">${s.student_id}</td>
        <td>${s.student_name}</td>
        <td><span class="badge bg-neust-blue">${s.section}</span></td>
        <td><a href="mailto:${s.email}" class="text-decoration-none">${s.email}</a></td>
        <td>${s.mobile_number || '<span class="text-muted small">N/A</span>'}</td>
        <td>
          ${s.social_media_link ? `<a href="${s.social_media_link}" target="_blank" class="btn btn-sm btn-light"><i class="fa-brands fa-facebook text-primary"></i> Profile</a>` : '<span class="text-muted small">N/A</span>'}
        </td>
      </tr>
    `;
  }).join('');

  tableBody.innerHTML = newHtml;
}

function togglePasswordVisibility() {
  const passwordInput = document.getElementById('login-password');
  const icon = document.getElementById('toggle-password-icon');

  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    icon.classList.remove('fa-eye');
    icon.classList.add('fa-eye-slash');
  } else {
    passwordInput.type = 'password';
    icon.classList.remove('fa-eye-slash');
    icon.classList.add('fa-eye');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('jwt_token');
  if (token) {
    showDashboard();
  }

  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  // Real-time character restriction for Student ID
  const studentIdInput = document.getElementById('login-student-id');
  if (studentIdInput) {
    studentIdInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/[^0-9-]/g, '');
    });
  }
});


  // Enable Bootstrap tooltips globally
  const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  const tooltipList = [...tooltipTriggerList].map(el => new bootstrap.Tooltip(el));

  // State Variables
let rawStudentsData = [];
let selectedSections = new Set();
let searchQuery = '';
let currentSortKey = 'name-asc';
let currentPage = 1;
let itemsPerPage = 10;

// Listen for search input typing
document.getElementById('table-search-input')?.addEventListener('input', (e) => {
  searchQuery = e.target.value.toLowerCase().trim();
  currentPage = 1; // Reset to page 1 on new search
  renderDirectoryTable();
});

// Toggle multi-select section filters
function toggleSectionFilter(btnElement) {
  const section = btnElement.getAttribute('data-section');
  
  if (selectedSections.has(section)) {
    selectedSections.delete(section);
    btnElement.classList.remove('active', 'btn-primary');
    btnElement.classList.add('btn-outline-primary');
  } else {
    selectedSections.add(section);
    btnElement.classList.add('active', 'btn-primary');
    btnElement.classList.remove('btn-outline-primary');
  }
  
  currentPage = 1;
  renderDirectoryTable();
}

function clearSectionFilters() {
  selectedSections.clear();
  document.querySelectorAll('.active-section-filter').forEach(btn => {
    btn.classList.remove('active', 'btn-primary');
    btn.classList.add('btn-outline-primary');
  });
  currentPage = 1;
  renderDirectoryTable();
}

// Handle sort selection changes
function handleSortChange(sortKey) {
  currentSortKey = sortKey;
  renderDirectoryTable();
}

// Handle items per page selection
function changeItemsPerPage(newLimit) {
  itemsPerPage = parseInt(newLimit, 10);
  currentPage = 1;
  renderDirectoryTable();
}

// Core Rendering Engine with Filtering, Sorting, and Pagination
function renderDirectoryTable() {
  const tbody = document.getElementById('student-table-body');
  
  // 1. Filter Data
  let filtered = rawStudentsData.filter(student => {
    // Section match (if any section filters are active)
    const matchesSection = selectedSections.size === 0 || selectedSections.has(student.section);
    
    // Search query match across multiple fields
    const matchesSearch = !searchQuery || 
      (student.student_name && student.student_name.toLowerCase().includes(searchQuery)) ||
      (student.student_id && student.student_id.toLowerCase().includes(searchQuery)) ||
      (student.email && student.email.toLowerCase().includes(searchQuery)) ||
      (student.section && student.section.toLowerCase().includes(searchQuery));

    return matchesSection && matchesSearch;
  });

  // 2. Sort Data
  filtered.sort((a, b) => {
    switch (currentSortKey) {
      case 'name-asc':
        return (a.student_name || '').localeCompare(b.student_name || '');
      case 'name-desc':
        return (b.student_name || '').localeCompare(a.student_name || '');
      case 'id-asc':
        return (a.student_id || '').localeCompare(b.student_id || '');
      case 'id-desc':
        return (b.student_id || '').localeCompare(a.student_id || '');
      case 'section-asc':
        return (a.section || '').localeCompare(b.section || '');
      default:
        return 0;
    }
  });

  // 3. Paginate Data
  const totalEntries = filtered.length;
  const totalPages = Math.ceil(totalEntries / itemsPerPage) || 1;
  if (currentPage > totalPages) currentPage = totalPages;

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalEntries);
  const pageItems = filtered.slice(startIndex, endIndex);

  // 4. Render Table Rows
  if (pageItems.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-4 text-muted">
          <i class="fa-solid fa-magnifying-glass fa-2x mb-2 opacity-50 d-block"></i>
          No student records found matching your filters.
        </td>
      </tr>`;
  } else {
    tbody.innerHTML = pageItems.map(student => `
      <tr>
        <td>
          <img src="${student.profile_picture_url || 'https://via.placeholder.com/40'}" 
               alt="${student.student_name}" 
               class="rounded-circle" style="width: 36px; height: 36px; object-fit: cover;">
        </td>
        <td class="fw-semibold text-neust-blue">${student.student_id}</td>
        <td class="fw-bold">${student.student_name}</td>
        <td><span class="badge bg-secondary opacity-75">${student.section}</span></td>
        <td>${student.email || '—'}</td>
        <td>${student.mobile_number || '—'}</td>
        <td>
          ${student.social_media_link 
            ? `<a href="${student.social_media_link}" target="_blank" class="btn btn-sm btn-outline-primary py-0 px-2 small"><i class="fa-solid fa-arrow-up-right-from-square me-1"></i>Link</a>` 
            : '—'}
        </td>
      </tr>
    `).join('');
  }

  // 5. Update Footer & Controls
  updatePaginationControls(totalEntries, totalPages, startIndex, endIndex);
}

function updatePaginationControls(totalEntries, totalPages, startIndex, endIndex) {
  const info = document.getElementById('pagination-info');
  const controls = document.getElementById('pagination-controls');

  // Update text
  info.innerText = totalEntries === 0 
    ? 'Showing 0 entries' 
    : `Showing ${startIndex + 1} to ${endIndex} of ${totalEntries} entries`;

  // Build pagination buttons
  let html = `
    <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
      <button class="page-link" onclick="goToPage(${currentPage - 1})">Prev</button>
    </li>
  `;

  for (let i = 1; i <= totalPages; i++) {
    html += `
      <li class="page-item ${currentPage === i ? 'active' : ''}">
        <button class="page-link" onclick="goToPage(${i})">${i}</button>
      </li>
    `;
  }

  html += `
    <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
      <button class="page-link" onclick="goToPage(${currentPage + 1})">Next</button>
    </li>
  `;

  controls.innerHTML = html;
}

function goToPage(page) {
  currentPage = page;
  renderDirectoryTable();
}