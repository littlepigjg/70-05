const crypto = require('crypto');
const config = require('../config');
const DataStore = require('./dataStore');

class PasswordManager {
  static hashPassword(password) {
    if (!password || typeof password !== 'string') {
      return null;
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
  }

  static verifyPassword(password, hashedPassword) {
    if (!password || !hashedPassword) {
      return false;
    }
    const [salt, storedHash] = hashedPassword.split(':');
    if (!salt || !storedHash) {
      return false;
    }
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(storedHash), Buffer.from(hash));
  }

  static validatePassword(password) {
    if (!password || typeof password !== 'string') {
      return { valid: false, message: '密码不能为空' };
    }
    const cleanPassword = password.trim();
    if (cleanPassword.length < config.PASSWORD_MIN_LENGTH) {
      return { valid: false, message: `密码长度至少为 ${config.PASSWORD_MIN_LENGTH} 位` };
    }
    if (cleanPassword.length > config.PASSWORD_MAX_LENGTH) {
      return { valid: false, message: `密码长度最多为 ${config.PASSWORD_MAX_LENGTH} 位` };
    }
    return { valid: true, password: cleanPassword };
  }

  static recordFailedAttempt(code, ip) {
    const share = DataStore.getShareByCode(code);
    if (!share) return null;

    const now = Date.now();
    const attempts = share.passwordAttempts || [];
    
    const recentAttempts = attempts.filter(a => now - a.timestamp < config.PASSWORD_ATTEMPT_WINDOW);
    
    recentAttempts.push({
      ip: ip,
      timestamp: now
    });

    const updates = {
      passwordAttempts: recentAttempts
    };

    if (recentAttempts.length >= config.PASSWORD_MAX_ATTEMPTS) {
      updates.passwordLockedUntil = now + config.PASSWORD_LOCK_DURATION;
      console.log(`[PasswordManager] 分享 ${code} 因密码错误次数过多被锁定至 ${new Date(updates.passwordLockedUntil).toLocaleString()}`);
    }

    DataStore.updateShare(code, updates);
    DataStore.flush();

    return {
      attempts: recentAttempts.length,
      maxAttempts: config.PASSWORD_MAX_ATTEMPTS,
      locked: !!updates.passwordLockedUntil,
      lockedUntil: updates.passwordLockedUntil || null
    };
  }

  static resetFailedAttempts(code) {
    const share = DataStore.getShareByCode(code);
    if (!share) return false;

    DataStore.updateShare(code, {
      passwordAttempts: [],
      passwordLockedUntil: null
    });
    DataStore.flush();
    return true;
  }

  static isLocked(code) {
    const share = DataStore.getShareByCode(code);
    if (!share) return { locked: false };

    const now = Date.now();
    if (share.passwordLockedUntil && share.passwordLockedUntil > now) {
      const remainingSeconds = Math.ceil((share.passwordLockedUntil - now) / 1000);
      return {
        locked: true,
        remainingSeconds,
        remainingMinutes: Math.ceil(remainingSeconds / 60)
      };
    }

    if (share.passwordLockedUntil && share.passwordLockedUntil <= now) {
      this.resetFailedAttempts(code);
    }

    return { locked: false };
  }

  static getRemainingAttempts(code) {
    const share = DataStore.getShareByCode(code);
    if (!share) return config.PASSWORD_MAX_ATTEMPTS;

    const now = Date.now();
    const attempts = share.passwordAttempts || [];
    const recentAttempts = attempts.filter(a => now - a.timestamp < config.PASSWORD_ATTEMPT_WINDOW);
    
    return Math.max(0, config.PASSWORD_MAX_ATTEMPTS - recentAttempts.length);
  }

  static verifyAccess(code, password, ip) {
    const share = DataStore.getShareByCode(code);
    if (!share) {
      return { success: false, message: '提取码不存在' };
    }

    if (!share.accessPassword) {
      return { success: true, requiresPassword: false };
    }

    const lockStatus = this.isLocked(code);
    if (lockStatus.locked) {
      return {
        success: false,
        message: `密码错误次数过多，请 ${lockStatus.remainingMinutes} 分钟后再试`,
        locked: true,
        remainingMinutes: lockStatus.remainingMinutes
      };
    }

    if (!password) {
      return {
        success: false,
        message: '请输入访问密码',
        requiresPassword: true,
        remainingAttempts: this.getRemainingAttempts(code)
      };
    }

    if (this.verifyPassword(password, share.accessPassword)) {
      this.resetFailedAttempts(code);
      return { success: true, requiresPassword: true };
    } else {
      const result = this.recordFailedAttempt(code, ip);
      const remaining = this.getRemainingAttempts(code);
      
      if (result && result.locked) {
        return {
          success: false,
          message: `密码错误次数过多，请 ${result.lockedUntil ? Math.ceil((result.lockedUntil - Date.now()) / 60000) : config.PASSWORD_LOCK_DURATION / 60000} 分钟后再试`,
          locked: true,
          remainingMinutes: result.lockedUntil ? Math.ceil((result.lockedUntil - Date.now()) / 60000) : config.PASSWORD_LOCK_DURATION / 60000
        };
      }

      return {
        success: false,
        message: `访问密码错误，还剩 ${remaining} 次尝试机会`,
        requiresPassword: true,
        remainingAttempts: remaining
      };
    }
  }

  static setPassword(code, password) {
    const share = DataStore.getShareByCode(code);
    if (!share) {
      return { success: false, message: '分享不存在' };
    }

    if (password === null || password === undefined || password === '') {
      DataStore.updateShare(code, {
        accessPassword: null,
        passwordAttempts: [],
        passwordLockedUntil: null
      });
      DataStore.flush();
      return { success: true, message: '密码已移除' };
    }

    const validation = this.validatePassword(password);
    if (!validation.valid) {
      return { success: false, message: validation.message };
    }

    const hashedPassword = this.hashPassword(validation.password);
    DataStore.updateShare(code, {
      accessPassword: hashedPassword,
      passwordAttempts: [],
      passwordLockedUntil: null
    });
    DataStore.flush();

    return { success: true, message: '密码设置成功' };
  }

  static removePassword(code) {
    return this.setPassword(code, null);
  }

  static hasPassword(code) {
    const share = DataStore.getShareByCode(code);
    return !!(share && share.accessPassword);
  }
}

module.exports = PasswordManager;
