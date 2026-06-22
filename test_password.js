const http = require('http');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const BASE_URL = 'localhost:3000';

function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      if (typeof data === 'string') {
        req.write(data);
      }
    }
    req.end();
  });
}

function makeMultipartRequest(options, form) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      ...options,
      headers: form.getHeaders()
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    form.pipe(req);
  });
}

async function runTests() {
  console.log('========================================');
  console.log('  测试访问密码功能');
  console.log('========================================\n');

  let testCode = null;
  const testPassword = 'test1234';
  const wrongPassword = 'wrongpass';

  try {
    console.log('1. 测试上传文件（带访问密码）...');
    const testFile = path.join(__dirname, 'test_file.txt');
    fs.writeFileSync(testFile, 'This is a test file for password protection feature.');

    const form = new FormData();
    form.append('file', fs.createReadStream(testFile));
    form.append('expiryHours', '24');
    form.append('maxDownloads', '10');
    form.append('accessPassword', testPassword);

    const uploadRes = await makeMultipartRequest({
      hostname: BASE_URL.split(':')[0],
      port: BASE_URL.split(':')[1],
      path: '/api/upload',
      method: 'POST'
    }, form);

    console.log(`   状态码: ${uploadRes.status}`);
    console.log(`   响应: ${JSON.stringify(uploadRes.data)}`);
    
    if (uploadRes.status === 200 && uploadRes.data.success) {
      testCode = uploadRes.data.data.code;
      console.log(`   ✓ 上传成功，提取码: ${testCode}`);
      console.log(`   ✓ 是否设置密码: ${uploadRes.data.data.hasPassword}`);
    } else {
      console.log(`   ✗ 上传失败: ${uploadRes.data.message}`);
      return;
    }
    console.log('');

    console.log('2. 测试获取文件信息...');
    const infoRes = await makeRequest({
      hostname: BASE_URL.split(':')[0],
      port: BASE_URL.split(':')[1],
      path: `/api/download/info/${testCode}`,
      method: 'GET'
    });
    console.log(`   状态码: ${infoRes.status}`);
    console.log(`   响应: ${JSON.stringify(infoRes.data)}`);
    
    if (infoRes.status === 200 && infoRes.data.success) {
      console.log(`   ✓ 获取信息成功`);
      console.log(`   ✓ 需要密码: ${infoRes.data.data.requiresPassword}`);
      console.log(`   ✓ 有密码: ${infoRes.data.data.hasPassword}`);
    } else {
      console.log(`   ✗ 获取信息失败: ${infoRes.data.message}`);
    }
    console.log('');

    console.log('3. 测试密码验证（正确密码）...');
    const verifyCorrectRes = await makeRequest({
      hostname: BASE_URL.split(':')[0],
      port: BASE_URL.split(':')[1],
      path: `/api/download/verify-password/${testCode}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({ password: testPassword }));
    console.log(`   状态码: ${verifyCorrectRes.status}`);
    console.log(`   响应: ${JSON.stringify(verifyCorrectRes.data)}`);
    
    if (verifyCorrectRes.status === 200 && verifyCorrectRes.data.success) {
      console.log(`   ✓ 密码验证成功`);
    } else {
      console.log(`   ✗ 密码验证失败: ${verifyCorrectRes.data.message}`);
    }
    console.log('');

    console.log('4. 测试密码验证（错误密码）...');
    const verifyWrongRes = await makeRequest({
      hostname: BASE_URL.split(':')[0],
      port: BASE_URL.split(':')[1],
      path: `/api/download/verify-password/${testCode}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({ password: wrongPassword }));
    console.log(`   状态码: ${verifyWrongRes.status}`);
    console.log(`   响应: ${JSON.stringify(verifyWrongRes.data)}`);
    
    if (verifyWrongRes.status === 200 && !verifyWrongRes.data.success) {
      console.log(`   ✓ 错误密码被正确拒绝`);
      console.log(`   ✓ 剩余尝试次数: ${verifyWrongRes.data.remainingAttempts}`);
    } else {
      console.log(`   ✗ 错误密码处理异常`);
    }
    console.log('');

    console.log('5. 测试没有密码时下载（应该失败）...');
    const downloadNoPwdRes = await makeRequest({
      hostname: BASE_URL.split(':')[0],
      port: BASE_URL.split(':')[1],
      path: `/api/download/${testCode}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({}));
    console.log(`   状态码: ${downloadNoPwdRes.status}`);
    console.log(`   响应: ${JSON.stringify(downloadNoPwdRes.data)}`);
    
    if (downloadNoPwdRes.status === 400 && !downloadNoPwdRes.data.success) {
      console.log(`   ✓ 无密码下载被正确拒绝`);
    } else {
      console.log(`   ✗ 无密码下载处理异常`);
    }
    console.log('');

    console.log('6. 测试错误密码时下载（应该失败）...');
    const downloadWrongPwdRes = await makeRequest({
      hostname: BASE_URL.split(':')[0],
      port: BASE_URL.split(':')[1],
      path: `/api/download/${testCode}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({ accessPassword: wrongPassword }));
    console.log(`   状态码: ${downloadWrongPwdRes.status}`);
    console.log(`   响应: ${JSON.stringify(downloadWrongPwdRes.data)}`);
    
    if (downloadWrongPwdRes.status === 400 && !downloadWrongPwdRes.data.success) {
      console.log(`   ✓ 错误密码下载被正确拒绝`);
    } else {
      console.log(`   ✗ 错误密码下载处理异常`);
    }
    console.log('');

    console.log('7. 测试管理员获取分享列表（检查密码状态）...');
    const sharesRes = await makeRequest({
      hostname: BASE_URL.split(':')[0],
      port: BASE_URL.split(':')[1],
      path: '/api/admin/shares',
      method: 'GET'
    });
    console.log(`   状态码: ${sharesRes.status}`);
    
    if (sharesRes.status === 200 && sharesRes.data.success) {
      const share = sharesRes.data.data.find(s => s.code === testCode);
      if (share) {
        console.log(`   ✓ 获取列表成功`);
        console.log(`   ✓ 有密码: ${share.hasPassword}`);
        console.log(`   ✓ 已锁定: ${share.isLocked}`);
      } else {
        console.log(`   ✗ 未找到测试分享`);
      }
    } else {
      console.log(`   ✗ 获取列表失败: ${sharesRes.data.message}`);
    }
    console.log('');

    console.log('8. 测试管理员移除密码...');
    const removePwdRes = await makeRequest({
      hostname: BASE_URL.split(':')[0],
      port: BASE_URL.split(':')[1],
      path: `/api/admin/share/${testCode}/password`,
      method: 'DELETE'
    });
    console.log(`   状态码: ${removePwdRes.status}`);
    console.log(`   响应: ${JSON.stringify(removePwdRes.data)}`);
    
    if (removePwdRes.status === 200 && removePwdRes.data.success) {
      console.log(`   ✓ 密码移除成功`);
    } else {
      console.log(`   ✗ 密码移除失败: ${removePwdRes.data.message}`);
    }
    console.log('');

    console.log('9. 验证密码已移除...');
    const infoAfterRemoveRes = await makeRequest({
      hostname: BASE_URL.split(':')[0],
      port: BASE_URL.split(':')[1],
      path: `/api/download/info/${testCode}`,
      method: 'GET'
    });
    
    if (infoAfterRemoveRes.status === 200 && infoAfterRemoveRes.data.success) {
      console.log(`   ✓ 不再需要密码: ${!infoAfterRemoveRes.data.data.requiresPassword}`);
    } else {
      console.log(`   ✗ 验证失败: ${infoAfterRemoveRes.data.message}`);
    }
    console.log('');

    console.log('10. 测试管理员设置新密码...');
    const newPassword = 'newpass5678';
    const setPwdRes = await makeRequest({
      hostname: BASE_URL.split(':')[0],
      port: BASE_URL.split(':')[1],
      path: `/api/admin/share/${testCode}/password`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({ password: newPassword }));
    console.log(`   状态码: ${setPwdRes.status}`);
    console.log(`   响应: ${JSON.stringify(setPwdRes.data)}`);
    
    if (setPwdRes.status === 200 && setPwdRes.data.success) {
      console.log(`   ✓ 新密码设置成功`);
    } else {
      console.log(`   ✗ 新密码设置失败: ${setPwdRes.data.message}`);
    }
    console.log('');

    console.log('11. 测试暴力破解防护（连续错误5次）...');
    for (let i = 1; i <= 5; i++) {
      const bruteForceRes = await makeRequest({
        hostname: BASE_URL.split(':')[0],
        port: BASE_URL.split(':')[1],
        path: `/api/download/verify-password/${testCode}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, JSON.stringify({ password: `wrong${i}` }));
      
      if (i < 5) {
        console.log(`   第 ${i} 次错误 - 剩余尝试: ${bruteForceRes.data.remainingAttempts}`);
      } else {
        console.log(`   第 ${i} 次错误 - 已锁定: ${bruteForceRes.data.locked}`);
        if (bruteForceRes.data.locked) {
          console.log(`   ✓ 已正确锁定，锁定时间: ${bruteForceRes.data.remainingMinutes} 分钟`);
        }
      }
    }
    console.log('');

    console.log('12. 测试管理员解锁...');
    const unlockRes = await makeRequest({
      hostname: BASE_URL.split(':')[0],
      port: BASE_URL.split(':')[1],
      path: `/api/admin/share/${testCode}/unlock`,
      method: 'POST'
    });
    console.log(`   状态码: ${unlockRes.status}`);
    console.log(`   响应: ${JSON.stringify(unlockRes.data)}`);
    
    if (unlockRes.status === 200 && unlockRes.data.success) {
      console.log(`   ✓ 解锁成功`);
    } else {
      console.log(`   ✗ 解锁失败: ${unlockRes.data.message}`);
    }
    console.log('');

    console.log('13. 测试解锁后用正确密码验证...');
    const verifyAfterUnlockRes = await makeRequest({
      hostname: BASE_URL.split(':')[0],
      port: BASE_URL.split(':')[1],
      path: `/api/download/verify-password/${testCode}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({ password: newPassword }));
    console.log(`   状态码: ${verifyAfterUnlockRes.status}`);
    
    if (verifyAfterUnlockRes.status === 200 && verifyAfterUnlockRes.data.success) {
      console.log(`   ✓ 解锁后密码验证成功`);
    } else {
      console.log(`   ✗ 解锁后密码验证失败: ${verifyAfterUnlockRes.data.message}`);
    }
    console.log('');

    console.log('14. 测试删除分享...');
    const deleteRes = await makeRequest({
      hostname: BASE_URL.split(':')[0],
      port: BASE_URL.split(':')[1],
      path: `/api/admin/share/${testCode}`,
      method: 'DELETE'
    });
    console.log(`   状态码: ${deleteRes.status}`);
    
    if (deleteRes.status === 200 && deleteRes.data.success) {
      console.log(`   ✓ 分享删除成功`);
    } else {
      console.log(`   ✗ 分享删除失败: ${deleteRes.data.message}`);
    }
    console.log('');

    fs.unlinkSync(testFile);
    console.log('========================================');
    console.log('  所有测试完成！');
    console.log('========================================');

  } catch (err) {
    console.error('测试过程中出错:', err);
  }
}

runTests();
