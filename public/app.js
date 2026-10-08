const API_BASE = '/api';
let dataTableInstance = null;
let activeSections = new Set();

// Live Chat Global Variables
let pusherClient = null;
let chatChannel = null;

// ==========================================
// AUTHENTICATION & DASHBOARD FLOW
// ==========================================

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
  
  // Show Chat Floating Action Button
  const chatToggleBtn = document.getElementById('chat-toggle-btn');
  if (chatToggleBtn) chatToggleBtn.classList.remove('d-none');

  loadStudents();
  initPusherChat();
}

function logout() {
  localStorage.removeItem('jwt_token');
  localStorage.removeItem('student_user');
  document.getElementById('dashboard-section').classList.add('d-none');
  document.getElementById('logout-btn').classList.add('d-none');
  document.getElementById('login-section').classList.remove('d-none');

  // Hide Chat Floating Action Button & Widget
  const chatToggleBtn = document.getElementById('chat-toggle-btn');
  const chatWidget = document.getElementById('chat-widget');
  if (chatToggleBtn) chatToggleBtn.classList.add('d-none');
  if (chatWidget) chatWidget.classList.add('d-none');

  // Unsubscribe from Pusher channel
  if (pusherClient && chatChannel) {
    pusherClient.unsubscribe('student-chat-channel');
    pusherClient = null;
    chatChannel = null;
  }
}

// ==========================================
// STUDENT DIRECTORY & DATATABLE
// ==========================================

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

  // Prevent "Cannot reinitialise DataTable" error by safely clearing and destroying existing instance
  if ($.fn.DataTable.isDataTable('#student-datatable')) {
    $('#student-datatable').DataTable().clear().destroy();
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
        render: function (data) {
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
    // Column index 4 corresponds to Section
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

// ==========================================
// LIVE CHAT (PUSHER INTEGRATION)
// ==========================================

function initPusherChat() {
  if (pusherClient) return; // Prevent duplicate subscriptions

  // Replace with your actual Pusher Key & Cluster from step 1
  pusherClient = new Pusher('YOUR_PUBLIC_PUSHER_KEY', {
    cluster: 'ap1'
  });

  chatChannel = pusherClient.subscribe('student-chat-channel');

  chatChannel.bind('new-message', function(data) {
    appendChatMessage(data);
  });

  // Load chat history from MySQL
  loadChatHistory();
}

async function loadChatHistory() {
  const token = localStorage.getItem('jwt_token');
  const chatContainer = document.getElementById('chat-messages');

  if (!chatContainer || !token) return;

  try {
    const res = await fetch(`${API_BASE}/chat/history`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Failed to load history');

    const history = await res.json();
    chatContainer.innerHTML = ''; // Clear prior content

    history.forEach(msg => appendChatMessage(msg));
  } catch (err) {
    console.error('Chat History Error:', err.message);
  }
}

function appendChatMessage(data) {
  const chatContainer = document.getElementById('chat-messages');
  if (!chatContainer) return;

  const currentUser = JSON.parse(localStorage.getItem('student_user') || '{}');
  
  // Compare using primary key ID (fallback to student_id)
  const isSelf = currentUser.id ? (currentUser.id === data.student_pk) : (currentUser.student_id === data.student_id);
  const timeStr = new Date(data.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const defaultAvatar = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='%23ccc'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
  const avatarUrl = (data.profile_picture_url && data.profile_picture_url.trim() !== '') ? data.profile_picture_url : defaultAvatar;

  const safeName = document.createTextNode(data.student_name || 'Student').textContent;
  const safeMsg = document.createTextNode(data.message).textContent;

  const msgHtml = `
    <div class="mb-2 d-flex flex-column ${isSelf ? 'align-items-end' : 'align-items-start'}">
      <div class="d-flex align-items-center gap-1 mb-1" style="font-size: 0.75rem;">
        <img src="${avatarUrl}" class="rounded-circle" width="20" height="20" style="object-fit: cover;" onerror="this.onerror=null; this.src='${defaultAvatar}';">
        <span class="fw-bold">${isSelf ? 'You' : safeName}</span>
        <span class="badge bg-neust-blue" style="font-size: 0.65rem;">${data.section || 'N/A'}</span>
      </div>
      <div class="p-2 rounded ${isSelf ? 'bg-primary text-white' : 'bg-white text-dark border'}" style="max-width: 85%; word-wrap: break-word; font-size: 0.875rem;">
        ${safeMsg}
      </div>
      <div class="text-muted mt-1" style="font-size: 0.65rem;">${timeStr}</div>
    </div>
  `;

  chatContainer.insertAdjacentHTML('beforeend', msgHtml);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function handleSendChatMessage(e) {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const errorBox = document.getElementById('chat-error');
  const token = localStorage.getItem('jwt_token');

  const message = input.value.trim();
  if (!message) return;

  if (errorBox) errorBox.classList.add('d-none');

  try {
    const res = await fetch(`${API_BASE}/chat/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || 'Failed to send message');
    }

    input.value = ''; // Clear input on success
  } catch (err) {
    if (errorBox) {
      errorBox.textContent = err.message;
      errorBox.classList.remove('d-none');
    }
  }
}

function toggleChatWidget() {
  const widget = document.getElementById('chat-widget');
  if (widget) widget.classList.toggle('d-none');
}

// ==========================================
// DOM CONTENT LOADED INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('jwt_token');
  if (token) {
    showDashboard();
  }

  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  const chatForm = document.getElementById('chat-form');
  if (chatForm) {
    chatForm.addEventListener('submit', handleSendChatMessage);
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