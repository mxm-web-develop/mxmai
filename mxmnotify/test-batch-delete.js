/**
 * 测试批量删除通知功能
 */

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIzZjZjZjBkNy0xYWM1LTQ0ZWItODM1Yi01YTU5ZWM5NzM5MDkiLCJ1c2VybmFtZSI6Im14bW1vYmlsZSIsInR5cGUiOiJhY2Nlc3MiLCJpYXQiOjE3Njg3ODkwOTAsImV4cCI6MTc2ODg0NjY5MH0.UlEP2L31xTBNyKmqcQyPG9mVJGtRROkPIUMK_v6itiI';
const baseUrl = 'http://localhost:3000'; // Gateway URL

async function testBatchDelete() {
  try {
    console.log('🔍 步骤 1: 获取通知列表...');
    const listResponse = await fetch(`${baseUrl}/api/v1/notifications?limit=200`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      console.error('❌ 获取通知列表失败:', listResponse.status, errorText);
      return;
    }

    const listData = await listResponse.json();
    console.log('响应结构:', JSON.stringify(listData, null, 2).substring(0, 500));
    const notifications = listData.data?.notifications || listData.notifications || [];
    console.log(`✅ 获取到 ${notifications.length} 条通知`);

    if (notifications.length === 0) {
      console.log('ℹ️  没有通知可删除');
      return;
    }

    // 测试批量删除 100 个
    const testCount = Math.min(100, notifications.length);
    const testIds = notifications.slice(0, testCount).map(n => n.id);
    console.log(`\n🧪 步骤 2: 测试批量删除 ${testIds.length} 条通知...`);
    console.log(`通知 IDs (前5个): ${testIds.slice(0, 5).join(', ')}...`);

    const startTime = Date.now();
    const deleteResponse = await fetch(`${baseUrl}/api/v1/notifications/delete-batch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        notification_ids: testIds,
      }),
    });

    const deleteData = await deleteResponse.json();
    const duration = Date.now() - startTime;
    
    if (!deleteResponse.ok) {
      console.error('❌ 批量删除失败:', deleteResponse.status);
      console.error('错误详情:', JSON.stringify(deleteData, null, 2));
      return;
    }

    console.log('✅ 批量删除成功!');
    console.log(`删除数量: ${deleteData.data?.deleted_count || 0}`);
    console.log(`删除的 IDs 数量: ${deleteData.data?.deleted_ids?.length || 0} 个`);
    console.log(`耗时: ${duration}ms`);

    // 验证删除结果
    console.log('\n🔍 步骤 3: 验证删除结果...');
    const verifyResponse = await fetch(`${baseUrl}/api/v1/notifications?limit=200`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (verifyResponse.ok) {
      const verifyData = await verifyResponse.json();
      const remainingNotifications = verifyData.data?.notifications || [];
      console.log(`✅ 剩余通知数量: ${remainingNotifications.length}`);
      console.log(`✅ 预期剩余: ${notifications.length - testIds.length}`);
      
      if (remainingNotifications.length === notifications.length - testIds.length) {
        console.log('✅ 验证通过: 删除数量正确');
      } else {
        console.log('⚠️  警告: 删除数量可能不匹配');
        console.log(`   实际删除: ${notifications.length - remainingNotifications.length}`);
        console.log(`   预期删除: ${testIds.length}`);
      }
    }

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error('错误堆栈:', error.stack);
  }
}

testBatchDelete();
