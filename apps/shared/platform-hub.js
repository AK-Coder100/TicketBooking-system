/**
 * Global Multi-Tenant Platform Hub Switcher
 * Provides quick access and context between the 3 applications
 */

(function() {
  function renderPlatformHub() {
    const pathname = window.location.pathname;
    let currentApp = 'client';
    if (pathname.startsWith('/admin')) currentApp = 'admin';
    else if (pathname.startsWith('/organizer')) currentApp = 'organizer';

    const hubEl = document.createElement('div');
    hubEl.className = 'platform-hub-bar';
    hubEl.innerHTML = `
      <div class="hub-title">
        <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#10b981; box-shadow:0 0 8px #10b981;"></span>
        <span>Multi-Tenant Platform Hub</span>
        <span style="color:#64748b; font-weight:normal;">|</span>
        <span style="font-size:0.75rem; color:#a5b4fc; background:rgba(99,102,241,0.2); padding:2px 8px; border-radius:4px;">PRD Verified & Concurrency Active</span>
      </div>
      <div class="hub-links">
        <a href="/" class="hub-btn ${currentApp === 'client' ? 'active' : ''}">
          🎟️ Client Booking (End User)
        </a>
        <a href="/organizer" class="hub-btn ${currentApp === 'organizer' ? 'active' : ''}">
          🎪 Tenant Admin & Gate Scanner
        </a>
        <a href="/admin" class="hub-btn ${currentApp === 'admin' ? 'active' : ''}">
          🛡️ Super Admin Portal
        </a>
      </div>
    `;

    document.body.prepend(hubEl);
  }

  // Toast Notification System
  window.showToast = function(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = '✓';
    if (type === 'error') icon = '✕';
    if (type === 'warning') icon = '⚠';

    toast.innerHTML = `
      <span style="font-weight:bold; font-size:1.1rem;">${icon}</span>
      <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderPlatformHub);
  } else {
    renderPlatformHub();
  }
})();
