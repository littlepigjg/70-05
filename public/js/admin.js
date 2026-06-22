const statsGrid = document.getElementById('statsGrid');
const sharesTbody = document.getElementById('sharesTbody');
const logsTbody = document.getElementById('logsTbody');
const sharesEmpty = document.getElementById('sharesEmpty');
const logsEmpty = document.getElementById('logsEmpty');
const refreshBtn = document.getElementById('refreshBtn');
const cleanupBtn = document.getElementById('cleanupBtn');
const passwordModal = document.getElementById('passwordModal');
const modalTitle = document.getElementById('modalTitle');
const modalPassword = document.getElementById('modalPassword');
const closeModal = document.getElementById('closeModal');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const confirmModalBtn = document.getElementById('confirmModalBtn');
const modalErrorAlert = document.getElementById('modalErrorAlert');
const modalSuccessAlert = document.getElementById('modalSuccessAlert');

let currentModalCode = null;
let currentModalAction = null;

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatFullDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN');
}

function getStatusBadge(share) {
  let status = share.statusText;
  let className = 'status-active';

  if (share.status === 'downloading') {
    status = '下载中';
    className = 'status-active';
  } else if (share.status === 'ready_for_cleanup' || share.status === 'download_limit_reached') {
    status = '已用完';
    className = 'status-limit';
  } else if (share.downloadCount >= share.maxDownloads && share.maxDownloads !== -1) {
    status = '已用完';
    className = 'status-limit';
  } else if (share.isExpired) {
    status = '已过期';
    className = 'status-expired';
  } else if (share.isLimitReached) {
    status = '已用完';
    className = 'status-limit';
  } else if (share.status !== 'active') {
    status = '已删除';
    className = 'status-deleted';
  }

  return `<span class="status-badge ${className}">${status}</span>`;
}

function truncateText(text, maxLength = 30) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

async function loadStats() {
  try {
    const response = await fetch('/api/admin/stats');
    const data = await response.json();
    
    if (data.success) {
      const stats = data.data;
      statsGrid.innerHTML = `
        <div class="stat-card">
          <div class="stat-value">${stats.total}</div>
          <div class="stat-label">总分享数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.active}</div>
          <div class="stat-label">有效分享</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.downloading || 0}</div>
          <div class="stat-label">下载中</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.expired}</div>
          <div class="stat-label">已过期</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.readyForCleanup || 0}</div>
          <div class="stat-label">待清理</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${formatFileSize(stats.totalActiveSize)}</div>
          <div class="stat-label">占用空间</div>
        </div>
      `;
    }
  } catch (err) {
    console.error('加载统计数据失败:', err);
  }
}

async function loadShares() {
  try {
    const response = await fetch('/api/admin/shares');
    const data = await response.json();
    
    if (data.success) {
      const shares = data.data;
      
      if (shares.length === 0) {
        sharesEmpty.style.display = 'block';
        sharesTbody.innerHTML = '';
        return;
      }
      
      sharesEmpty.style.display = 'none';
      sharesTbody.innerHTML = shares.map(share => `
        <tr>
          <td><code style="background: #f0f0f0; padding: 2px 6px; border-radius: 4px;">${share.code}</code></td>
          <td title="${share.originalName}">${truncateText(share.originalName)}</td>
          <td>${formatFileSize(share.size)}</td>
          <td>${formatDate(share.uploadTime)}</td>
          <td>${formatDate(share.expiryTime)}</td>
          <td>${share.downloadCount}</td>
          <td>${share.maxDownloads === -1 ? '∞' : share.maxDownloads}</td>
          <td>${getStatusBadge(share)}</td>
          <td>
            ${share.hasPassword ? `
              <span class="status-badge status-active">🔐 已设置</span>
              ${share.isLocked ? '<br><span class="status-badge status-expired">🔒 已锁定</span>' : ''}
            ` : '<span class="status-badge status-deleted">未设置</span>'}
          </td>
          <td>
            <div style="display: flex; gap: 5px; flex-wrap: wrap;">
              ${share.status === 'active' ? `
                <button class="btn btn-danger btn-small" onclick="deleteShare('${share.code}')">删除</button>
                <button class="btn btn-secondary btn-small" onclick="openPasswordModal('${share.code}', '${share.hasPassword ? 'edit' : 'set'}')">
                  ${share.hasPassword ? '修改密码' : '设置密码'}
                </button>
                ${share.hasPassword ? `
                  <button class="btn btn-secondary btn-small" onclick="removePassword('${share.code}')">移除密码</button>
                ` : ''}
                ${share.isLocked ? `
                  <button class="btn btn-secondary btn-small" onclick="unlockShare('${share.code}')">解锁</button>
                ` : ''}
              ` : share.status === 'downloading' ? '下载中' : '-'}
            </div>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('加载分享记录失败:', err);
  }
}

async function loadLogs() {
  try {
    const response = await fetch('/api/admin/logs');
    const data = await response.json();
    
    if (data.success) {
      const logs = data.data;
      
      if (logs.length === 0) {
        logsEmpty.style.display = 'block';
        logsTbody.innerHTML = '';
        return;
      }
      
      logsEmpty.style.display = 'none';
      logsTbody.innerHTML = logs.map(log => `
        <tr>
          <td>${formatFullDate(log.timestamp)}</td>
          <td><code style="background: #f0f0f0; padding: 2px 6px; border-radius: 4px;">${log.code}</code></td>
          <td title="${log.originalName}">${truncateText(log.originalName)}</td>
          <td>${log.ip || '-'}</td>
          <td title="${log.userAgent}">${truncateText(log.userAgent || '-', 40)}</td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('加载下载日志失败:', err);
  }
}

async function deleteShare(code) {
  if (!confirm(`确定要删除提取码为 ${code} 的分享吗？`)) {
    return;
  }
  
  try {
    const response = await fetch(`/api/admin/share/${code}`, {
      method: 'DELETE'
    });
    const data = await response.json();
    
    if (data.success) {
      alert('删除成功！');
      loadAll();
    } else {
      alert('删除失败: ' + data.message);
    }
  } catch (err) {
    alert('删除失败，请重试');
  }
}

async function forceCleanup() {
  if (!confirm('确定要立即清理所有过期和下载次数已满的文件吗？')) {
    return;
  }
  
  cleanupBtn.disabled = true;
  cleanupBtn.textContent = '清理中...';
  
  try {
    const response = await fetch('/api/admin/cleanup', {
      method: 'POST'
    });
    const data = await response.json();
    
    if (data.success) {
      alert(`清理完成！删除了 ${data.data.cleanedCount} 个文件`);
      loadAll();
    } else {
      alert('清理失败: ' + data.message);
    }
  } catch (err) {
    alert('清理失败，请重试');
  } finally {
    cleanupBtn.disabled = false;
    cleanupBtn.textContent = '🧹 立即清理过期文件';
  }
}

function loadAll() {
  loadStats();
  loadShares();
  loadLogs();
}

document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab + 'Tab').classList.add('active');
  });
});

refreshBtn.addEventListener('click', loadAll);
cleanupBtn.addEventListener('click', forceCleanup);

function openPasswordModal(code, action) {
  currentModalCode = code;
  currentModalAction = action;
  modalTitle.textContent = action === 'edit' ? '修改访问密码' : '设置访问密码';
  modalPassword.value = '';
  modalErrorAlert.classList.remove('show');
  modalSuccessAlert.classList.remove('show');
  passwordModal.style.display = 'flex';
  modalPassword.focus();
}

function closePasswordModal() {
  passwordModal.style.display = 'none';
  currentModalCode = null;
  currentModalAction = null;
  modalPassword.value = '';
  modalErrorAlert.classList.remove('show');
  modalSuccessAlert.classList.remove('show');
}

async function setPassword() {
  if (!currentModalCode) return;

  const password = modalPassword.value.trim();

  if (password && password.length < 4) {
    showModalAlert(modalErrorAlert, '密码长度至少为4位');
    return;
  }

  confirmModalBtn.disabled = true;
  confirmModalBtn.textContent = '处理中...';

  try {
    const response = await fetch(`/api/admin/share/${currentModalCode}/password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password: password || null })
    });
    const data = await response.json();

    if (data.success) {
      showModalAlert(modalSuccessAlert, data.message);
      setTimeout(() => {
        closePasswordModal();
        loadAll();
      }, 1000);
    } else {
      showModalAlert(modalErrorAlert, data.message);
    }
  } catch (err) {
    showModalAlert(modalErrorAlert, '网络错误，请重试');
  } finally {
    confirmModalBtn.disabled = false;
    confirmModalBtn.textContent = '确认';
  }
}

async function removePassword(code) {
  if (!confirm(`确定要移除提取码为 ${code} 的访问密码吗？`)) {
    return;
  }

  try {
    const response = await fetch(`/api/admin/share/${code}/password`, {
      method: 'DELETE'
    });
    const data = await response.json();

    if (data.success) {
      alert(data.message);
      loadAll();
    } else {
      alert('操作失败: ' + data.message);
    }
  } catch (err) {
    alert('操作失败，请重试');
  }
}

async function unlockShare(code) {
  if (!confirm(`确定要解锁提取码为 ${code} 的分享吗？这将重置密码错误次数。`)) {
    return;
  }

  try {
    const response = await fetch(`/api/admin/share/${code}/unlock`, {
      method: 'POST'
    });
    const data = await response.json();

    if (data.success) {
      alert(data.message);
      loadAll();
    } else {
      alert('操作失败: ' + data.message);
    }
  } catch (err) {
    alert('操作失败，请重试');
  }
}

function showModalAlert(element, message) {
  element.textContent = message;
  element.classList.add('show');
  setTimeout(() => {
    element.classList.remove('show');
  }, 3000);
}

closeModal.addEventListener('click', closePasswordModal);
cancelModalBtn.addEventListener('click', closePasswordModal);
confirmModalBtn.addEventListener('click', setPassword);

modalPassword.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    confirmModalBtn.click();
  }
});

passwordModal.addEventListener('click', (e) => {
  if (e.target === passwordModal) {
    closePasswordModal();
  }
});

window.deleteShare = deleteShare;
window.openPasswordModal = openPasswordModal;
window.removePassword = removePassword;
window.unlockShare = unlockShare;

loadAll();

setInterval(loadAll, 30000);
