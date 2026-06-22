const codeInput = document.getElementById('codeInput');
const queryBtn = document.getElementById('queryBtn');
const downloadForm = document.getElementById('downloadForm');
const filePreview = document.getElementById('filePreview');
const downloadBtn = document.getElementById('downloadBtn');
const backBtn = document.getElementById('backBtn');
const errorAlert = document.getElementById('errorAlert');
const successAlert = document.getElementById('successAlert');
const passwordSection = document.getElementById('passwordSection');
const accessPasswordInput = document.getElementById('accessPasswordInput');
const verifyPasswordBtn = document.getElementById('verifyPasswordBtn');
const passwordHint = document.getElementById('passwordHint');

let currentCode = null;
let shareInfo = null;
let passwordVerified = false;

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
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const icons = {
    pdf: '📕',
    doc: '📘', docx: '📘',
    xls: '📗', xlsx: '📗',
    ppt: '📙', pptx: '📙',
    zip: '📦', rar: '📦', '7z': '📦',
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', bmp: '🖼️', webp: '🖼️',
    mp3: '🎵', wav: '🎵', flac: '🎵',
    mp4: '🎬', avi: '🎬', mkv: '🎬', mov: '🎬',
    txt: '📝', md: '📝',
    js: '💛', ts: '💙', html: '🧡', css: '💜',
    json: '📋', csv: '📊'
  };
  return icons[ext] || '📄';
}

function showAlert(element, message) {
  element.textContent = message;
  element.classList.add('show');
  setTimeout(() => {
    element.classList.remove('show');
  }, 3000);
}

function getStatusBadge(status) {
  const statusMap = {
    '正常': 'status-active',
    '下载中': 'status-active',
    '已过期': 'status-expired',
    '下载次数已满': 'status-limit',
    '已用完': 'status-limit',
    '已失效': 'status-deleted'
  };
  return statusMap[status] || 'status-deleted';
}

codeInput.addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

codeInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    queryBtn.click();
  }
});

queryBtn.addEventListener('click', async () => {
  const code = codeInput.value.trim().toUpperCase();
  
  if (!code) {
    showAlert(errorAlert, '请输入提取码');
    return;
  }

  if (code.length < 4) {
    showAlert(errorAlert, '提取码至少4位');
    return;
  }

  queryBtn.disabled = true;
  queryBtn.textContent = '查询中...';

  try {
    const response = await fetch(`/api/download/info/${code}`);
    const data = await response.json();

    if (data.success) {
      shareInfo = data.data;
      currentCode = code;
      displayShareInfo(shareInfo);
    } else {
      showAlert(errorAlert, data.message);
    }
  } catch (err) {
    showAlert(errorAlert, '网络错误，请重试');
  } finally {
    queryBtn.disabled = false;
    queryBtn.textContent = '查询文件';
  }
});

function displayShareInfo(info) {
  downloadForm.style.display = 'none';
  filePreview.classList.add('show');
  passwordVerified = false;

  document.getElementById('fileIcon').textContent = getFileIcon(info.originalName);
  document.getElementById('previewFileName').textContent = info.originalName;
  document.getElementById('previewFileSize').textContent = formatFileSize(info.size);
  document.getElementById('previewDownloadCount').textContent = info.downloadCount + ' 次';
  document.getElementById('previewExpiry').textContent = formatDate(info.expiryTime);

  const remaining = info.maxDownloads === -1 
    ? '不限制' 
    : Math.max(0, info.maxDownloads - info.downloadCount) + ' 次';
  document.getElementById('previewRemaining').textContent = remaining;

  const statusBadge = document.getElementById('statusBadge');
  statusBadge.textContent = info.status;
  statusBadge.className = 'status-badge ' + getStatusBadge(info.status);

  if (info.requiresPassword) {
    passwordSection.style.display = 'block';
    passwordHint.textContent = '该分享需要访问密码，请输入密码后下载';
    downloadBtn.disabled = true;
    downloadBtn.textContent = '请先验证访问密码';
    accessPasswordInput.value = '';
    accessPasswordInput.focus();
  } else {
    passwordSection.style.display = 'none';
    passwordVerified = true;
    downloadBtn.disabled = !info.canDownload;
    if (!info.canDownload) {
      downloadBtn.textContent = info.status === '已过期' ? '文件已过期' : 
                                info.status === '下载次数已满' || info.status === '已用完' ? '下载次数已满' : '无法下载';
    } else {
      downloadBtn.textContent = '立即下载';
    }
  }
}

async function verifyPassword() {
  const password = accessPasswordInput.value.trim();
  
  if (!password) {
    showAlert(errorAlert, '请输入访问密码');
    return;
  }

  verifyPasswordBtn.disabled = true;
  verifyPasswordBtn.textContent = '验证中...';

  try {
    const response = await fetch(`/api/download/verify-password/${currentCode}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password })
    });
    const data = await response.json();

    if (data.success) {
      passwordVerified = true;
      passwordSection.style.display = 'none';
      downloadBtn.disabled = !shareInfo.canDownload;
      if (shareInfo.canDownload) {
        downloadBtn.textContent = '立即下载';
      }
      showAlert(successAlert, '密码验证成功！');
    } else {
      showAlert(errorAlert, data.message);
      if (data.remainingAttempts !== undefined) {
        passwordHint.textContent = `${data.message}，还剩 ${data.remainingAttempts} 次尝试机会`;
      }
      if (data.locked) {
        verifyPasswordBtn.disabled = true;
        downloadBtn.disabled = true;
        accessPasswordInput.disabled = true;
      }
    }
  } catch (err) {
    showAlert(errorAlert, '网络错误，请重试');
  } finally {
    if (!verifyPasswordBtn.disabled || !passwordVerified) {
      verifyPasswordBtn.disabled = false;
      verifyPasswordBtn.textContent = '验证密码';
    }
  }
}

verifyPasswordBtn.addEventListener('click', verifyPassword);

accessPasswordInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    verifyPasswordBtn.click();
  }
});

downloadBtn.addEventListener('click', () => {
  if (!currentCode || !shareInfo || !shareInfo.canDownload) {
    return;
  }

  if (shareInfo.requiresPassword && !passwordVerified) {
    showAlert(errorAlert, '请先验证访问密码');
    return;
  }

  downloadBtn.disabled = true;
  downloadBtn.textContent = '准备下载...';

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = `/api/download/${currentCode}`;
  
  if (shareInfo.requiresPassword && passwordVerified) {
    const passwordInput = document.createElement('input');
    passwordInput.type = 'hidden';
    passwordInput.name = 'accessPassword';
    passwordInput.value = accessPasswordInput.value;
    form.appendChild(passwordInput);
  }
  
  document.body.appendChild(form);
  form.submit();
  document.body.removeChild(form);

  showAlert(successAlert, '下载已开始！');
  
  setTimeout(() => {
    queryBtn.click();
  }, 2000);
});

backBtn.addEventListener('click', () => {
  filePreview.classList.remove('show');
  downloadForm.style.display = 'block';
  passwordSection.style.display = 'none';
  codeInput.value = '';
  accessPasswordInput.value = '';
  accessPasswordInput.disabled = false;
  verifyPasswordBtn.disabled = false;
  verifyPasswordBtn.textContent = '验证密码';
  codeInput.focus();
  currentCode = null;
  shareInfo = null;
  passwordVerified = false;
});

const urlParams = new URLSearchParams(window.location.search);
const codeFromUrl = urlParams.get('code');
if (codeFromUrl) {
  codeInput.value = codeFromUrl.toUpperCase();
  setTimeout(() => {
    queryBtn.click();
  }, 300);
} else {
  codeInput.focus();
}
