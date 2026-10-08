function renderDataTable(students) {
  const defaultAvatar = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 24 24' fill='%23ccc'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";

  // Ensure students is a valid array
  const studentData = Array.isArray(students) ? students : [];

  // 1. Safely destroy the previous DataTables instance if it exists
  if (dataTableInstance) {
    dataTableInstance.destroy();
    dataTableInstance = null;
  } else if ($.fn.DataTable.isDataTable('#student-datatable')) {
    $('#student-datatable').DataTable().destroy();
  }

  // 2. Clear HTML content inside tbody to reset the DOM
  $('#student-datatable tbody').empty();

  // 3. Initialize DataTable cleanly
  dataTableInstance = $('#student-datatable').DataTable({
    data: studentData,
    responsive: true,
    pageLength: 10,
    lengthMenu: [5, 10, 25, 50],
    order: [[0, 'asc']], // Sort by hidden DB Primary Key (id)
    columns: [
      {
        data: 'id',
        visible: false,
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
        className: 'fw-bold text-neust-blue',
        defaultContent: 'N/A'
      },
      { 
        data: 'student_name', 
        className: 'fw-bold',
        defaultContent: 'N/A'
      },
      {
        data: 'section',
        render: function (data) {
          return `<span class="badge bg-neust-blue">${data || 'N/A'}</span>`;
        },
        defaultContent: 'N/A'
      },
      {
        data: 'email',
        render: function (data) {
          if (!data) return '<span class="text-muted small">N/A</span>';
          return `<a href="mailto:${data}" class="text-decoration-none">${data}</a>`;
        },
        defaultContent: '<span class="text-muted small">N/A</span>'
      },
      {
        data: 'mobile_number',
        render: function (data) {
          return data ? data : '<span class="text-muted small">N/A</span>';
        },
        defaultContent: '<span class="text-muted small">N/A</span>'
      },
      {
        data: 'social_media_link',
        render: function (data) {
          if (!data) return '<span class="text-muted small">N/A</span>';
          return `<a href="${data}" target="_blank" class="btn btn-sm btn-light"><i class="fa-brands fa-facebook text-primary me-1"></i>Profile</a>`;
        },
        orderable: false,
        defaultContent: '<span class="text-muted small">N/A</span>'
      }
    ]
  });

  applySectionFilters();
}