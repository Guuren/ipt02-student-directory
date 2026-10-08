const API_BASE = '/api';
let dataTableInstance = null;
let activeSections = new Set();

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
  const token = localStorage.getItem('jwt_token');

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

    if (res.status === 401 || res.status === 403) {
      logout();
      throw new Error('Session expired. Please log in again.');
    }

    const students = await res.json();

    if (!res.ok) {
      throw new Error(students.message || 'Failed to load student data');
    }

    renderAnalytics(students);
    renderDataTable(students);
  } catch (err) {
    console.error('DataTables Load Error:', err.message);
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

function renderDataTable(students) {
  const defaultAvatar = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 24 24' fill='%23ccc'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";

  if (dataTableInstance) {
    dataTableInstance.destroy();
  }

  dataTableInstance = $('#student-datatable').DataTable({
    data: students,
    responsive: true,
    pageLength: 10,
    lengthMenu: [5, 10, 25, 50],
    order: [[0, 'asc']], // Default sort by Database Primary Key (id) ascending
    columns: [
      {
        data: 'id',
        visible: false, // Hidden column used purely for database primary key sorting
        searchable: false
      },
      {
        data: 'profile_picture_url',
        render: function (data, type, row) {
          const avatarUrl = (data && data.trim() !== '') ? data : defaultAvatar;
          return `<img src="${avatarUrl}" alt="Avatar" class="rounded-circle" style="width: 36px; height: 36px; object-fit: cover;" onerror="this.onerror=null; this.src='${defaultAvatar}';">`;
        },
        orderable: false,
        width: "50px"
      },
      { 
        data: 'student_id', 
        className: 'fw-bold text-neust-blue' 
      },
      { 
        data: 'student_name', 
        className: 'fw-bold' 
      },
      {
        data: 'section',
        render: function (data) {
          return `<span class="badge bg-neust-blue">${data || 'N/A'}</span>`;
        }
      },
      {
        data: 'email',
        render: function (data) {
          if (!data) return '<span class="text-muted small">N/A</span>';
          return `<a href="mailto:${data}" class="text-decoration-none">${data}</a>`;
        }
      },
      {
        data: 'mobile_number',
        render: function (data) {
          return data ? data : '<span class="text-muted small">N/A</span>';
        }
      },
      {
        data: 'social_media_link',
        render: function (data) {
          if (!data) return '<span class="text-muted small">N/A</span>';
          return `<a href="${data}" target="_blank" class="btn btn-sm btn-light"><i class="fa-brands fa-facebook text-primary me-1"></i>Profile</a>`;
        },
        orderable: false
      }
    ]
  });

  applySectionFilters();
}

function toggleSectionFilter(sectionName, btnElement) {
  if (activeSections.has(sectionName)) {
    activeSections.delete(sectionName);
    btnElement.classList.remove('active', 'btn-primary');
    btnElement.classList.add('btn-outline-primary');
  } else {
    activeSections.add(sectionName);
    btnElement.classList.add('active', 'btn-primary');
    btnElement.classList.remove('btn-outline-primary');
  }

  applySectionFilters();
}

function clearSectionFilters() {
  activeSections.clear();
  document.querySelectorAll('.section-filter-btn').forEach(btn => {
    btn.classList.remove('active', 'btn-primary');
    btn.classList.add('btn-outline-primary');
  });
  applySectionFilters();
}

function applySectionFilters() {
  if (!dataTableInstance) return;

  if (activeSections.size === 0) {
    // Column index 4 corresponds to Section (due to the added hidden id column at index 0)
    dataTableInstance.column(4).search('').draw();
  } else {
    const searchPattern = '^(' + Array.from(activeSections).join('|') + ')$';
    dataTableInstance.column(4).search(searchPattern, true, false).draw();
  }
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

  const studentIdInput = document.getElementById('login-student-id');
  if (studentIdInput) {
    studentIdInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/[^0-9-]/g, '');
    });
  }

  const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  const tooltipList = [...tooltipTriggerList].map(el => new bootstrap.Tooltip(el));
});