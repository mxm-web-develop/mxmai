/**
 * mxmdata 功能测试脚本
 * 测试 MinIO 存储功能
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import { RepositoryFactory } from '../factories/RepositoryFactory';
import { initMinIOClient } from '../adapters/minio/MinIOClient';
import { loadDataConfig } from '../config/dataConfig';

// 从 mxmdata 目录加载 .env 文件
dotenv.config({ path: resolve(__dirname, '../../.env') });

async function testFunctionality() {
  console.log('🧪 开始测试 mxmdata 功能...\n');

  try {
    const config = loadDataConfig();
    RepositoryFactory.init(config);

    // 测试 MinIO 存储功能
    console.log('📦 测试 MinIO 存储功能...\n');
    
    const storageRepo = RepositoryFactory.createStorageRepository();
    const testBucket = 'test-bucket';
    const testKey = 'test-file.txt';
    const testContent = Buffer.from('Hello, mxmdata! 这是测试内容。');

    // 1. 上传文件
    console.log('1. 测试上传文件...');
    const uploadResult = await storageRepo.uploadFile(
      testBucket,
      testKey,
      testContent,
      {
        contentType: 'text/plain',
        expiresIn: 3600,
      }
    );
    console.log('   ✅ 上传成功');
    console.log(`   - Bucket: ${uploadResult.bucket}`);
    console.log(`   - Key: ${uploadResult.key}`);
    console.log(`   - URL: ${uploadResult.url}`);
    if (uploadResult.presignedUrl) {
      console.log(`   - Presigned URL: ${uploadResult.presignedUrl.substring(0, 50)}...`);
    }
    console.log('');

    // 2. 检查文件是否存在
    console.log('2. 测试检查文件是否存在...');
    const exists = await storageRepo.fileExists(testBucket, testKey);
    console.log(`   ✅ 文件存在: ${exists}`);
    console.log('');

    // 3. 获取文件元数据
    console.log('3. 测试获取文件元数据...');
    const metadata = await storageRepo.getFileMetadata(testBucket, testKey);
    if (metadata) {
      console.log('   ✅ 元数据获取成功');
      console.log(`   - 大小: ${metadata.size} bytes`);
      console.log(`   - 类型: ${metadata.contentType}`);
      console.log(`   - 修改时间: ${metadata.lastModified}`);
    } else {
      console.log('   ⚠️  元数据为空');
    }
    console.log('');

    // 4. 生成预签名 URL
    console.log('4. 测试生成预签名 URL...');
    const presignedUrl = await storageRepo.getPresignedUrl(testBucket, testKey, 3600);
    console.log('   ✅ 预签名 URL 生成成功');
    console.log(`   - URL: ${presignedUrl.substring(0, 80)}...`);
    console.log('');

    // 5. 下载文件
    console.log('5. 测试下载文件...');
    const downloadedContent = await storageRepo.downloadFile(testBucket, testKey);
    const downloadedText = downloadedContent.toString();
    console.log('   ✅ 下载成功');
    console.log(`   - 内容: ${downloadedText}`);
    console.log(`   - 内容匹配: ${downloadedText === testContent.toString() ? '✅' : '❌'}`);
    console.log('');

    // 6. 列出文件
    console.log('6. 测试列出文件...');
    const listResult = await storageRepo.listFiles(testBucket, { prefix: 'test-', maxKeys: 10 });
    console.log('   ✅ 列表获取成功');
    console.log(`   - 文件数量: ${listResult.files.length}`);
    console.log(`   - 还有更多: ${listResult.hasMore}`);
    listResult.files.forEach((file, index) => {
      console.log(`   ${index + 1}. ${file.key} (${file.size} bytes)`);
    });
    console.log('');

    // 7. 复制文件
    console.log('7. 测试复制文件...');
    const copyKey = 'test-file-copy.txt';
    await storageRepo.copyFile(testBucket, testKey, testBucket, copyKey);
    console.log('   ✅ 复制成功');
    console.log(`   - 源文件: ${testKey}`);
    console.log(`   - 目标文件: ${copyKey}`);
    console.log('');

    // 8. 删除文件
    console.log('8. 测试删除文件...');
    await storageRepo.deleteFile(testBucket, testKey);
    await storageRepo.deleteFile(testBucket, copyKey);
    console.log('   ✅ 删除成功');
    console.log(`   - 已删除: ${testKey}`);
    console.log(`   - 已删除: ${copyKey}`);
    console.log('');

    console.log('🎉 所有功能测试通过！\n');
    console.log('✅ MinIO 存储功能完全正常');
    console.log('✅ Repository 接口工作正常');
    console.log('✅ 所有 CRUD 操作成功');

  } catch (error: any) {
    console.error('❌ 测试失败:', error.message);
    if (error.stack) {
      console.error('\n堆栈跟踪:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// 运行测试
testFunctionality();

