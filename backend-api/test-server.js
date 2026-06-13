/**
 * 测试 API Server 的脚本
 * 运行: node test-server.js
 */

const API_BASE = 'http://localhost:3001/api/v1';
const ADMIN_API_KEY = 'test-admin-key-12345';

async function testAPI() {
  console.log('='.repeat(60));
  console.log('Testing GhostBoard License API');
  console.log('='.repeat(60));
  console.log('');

  try {
    // 1. 健康检查
    console.log('1️⃣  Health Check...');
    const healthRes = await fetch(`${API_BASE}/health`);
    const health = await healthRes.json();
    console.log('   ✅', health);
    console.log('');

    // 2. 生成许可证
    console.log('2️⃣  Generating licenses...');
    const generateRes = await fetch(`${API_BASE}/admin/licenses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ADMIN_API_KEY}`,
      },
      body: JSON.stringify({
        email: 'test@example.com',
        plan: 'lifetime',
        quantity: 3,
      }),
    });
    const generated = await generateRes.json();
    console.log('   ✅ Generated:', generated.licenses.length, 'licenses');
    generated.licenses.forEach((lic, i) => {
      console.log(`      ${i + 1}. ${lic.key}`);
    });
    console.log('');

    const testKey = generated.licenses[0].key;
    const deviceId = 'test-device-' + Math.random().toString(36).substring(7);

    // 3. 激活许可证
    console.log(`3️⃣  Activating license: ${testKey}`);
    const activateRes = await fetch(`${API_BASE}/licenses/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: testKey,
        deviceId,
        deviceInfo: {
          platform: 'darwin',
          arch: 'arm64',
          hostname: 'Test-MacBook',
        },
      }),
    });
    const activated = await activateRes.json();
    console.log('   ✅ Activated:', activated.license.activated);
    console.log('      Device ID:', activated.license.deviceId);
    console.log('');

    // 4. 验证许可证
    console.log('4️⃣  Verifying license...');
    const verifyRes = await fetch(`${API_BASE}/licenses/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: testKey,
        deviceId,
      }),
    });
    const verified = await verifyRes.json();
    console.log('   ✅ Valid:', verified.valid);
    console.log('      Features:', verified.license.features);
    console.log('');

    // 5. 测试设备不匹配
    console.log('5️⃣  Testing device mismatch...');
    const wrongDeviceRes = await fetch(`${API_BASE}/licenses/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: testKey,
        deviceId: 'wrong-device-id',
      }),
    });
    const wrongDevice = await wrongDeviceRes.json();
    console.log('   ✅ Valid:', wrongDevice.valid);
    console.log('      Reason:', wrongDevice.reason);
    console.log('');

    // 6. 获取激活历史
    console.log('6️⃣  Getting activation history...');
    const historyRes = await fetch(`${API_BASE}/admin/licenses/${testKey}/activations`, {
      headers: { 'Authorization': `Bearer ${ADMIN_API_KEY}` },
    });
    const history = await historyRes.json();
    console.log('   ✅ Activations:', history.activations.length);
    console.log('');

    console.log('='.repeat(60));
    console.log('✅ All tests passed!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// 检查服务器是否运行
async function checkServer() {
  try {
    await fetch(`${API_BASE}/health`);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const serverRunning = await checkServer();
  
  if (!serverRunning) {
    console.error('❌ API server is not running!');
    console.log('Please start the server first:');
    console.log('  cd backend-api');
    console.log('  ADMIN_API_KEY=test-admin-key-12345 node server.js');
    process.exit(1);
  }

  await testAPI();
}

main();
