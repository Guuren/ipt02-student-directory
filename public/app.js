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

  const newHtml = students.map(s => `
    <tr>
      <td>
        <img src="${s.profile_picture_url || 'https://via.placeholder.com/150'}" alt="Avatar" class="avatar-img" onerror="this.src='https://via.placeholder.com/150'">
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
  `).join('');

  // Only mutate the DOM if the HTML actually changed
  if (tableBody.innerHTML !== newHtml) {
    tableBody.innerHTML = newHtml;
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

  // Real-time character restriction for Student ID
  const studentIdInput = document.getElementById('login-student-id');
  if (studentIdInput) {
    studentIdInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/[^0-9-]/g, '');
    });
  }
});

