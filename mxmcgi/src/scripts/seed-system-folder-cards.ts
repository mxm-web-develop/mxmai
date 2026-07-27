/**
 * 种子：Admin 系统共享样板卡（风格 + 角色）
 * 用法：ADMIN_OWNER_USER_ID=uuid pnpm --filter @mxmai/mxmcgi exec tsx src/scripts/seed-system-folder-cards.ts
 */
import { RepositoryFactory } from '@mxmai/mxmdata';

async function main() {
  const ownerId = process.env.ADMIN_OWNER_USER_ID || process.env.ADMIN_USER_IDS?.split(',')[0]?.trim();
  if (!ownerId) {
    console.error('请设置 ADMIN_OWNER_USER_ID（系统卡归属用户）');
    process.exit(1);
  }

  const folderRepo = RepositoryFactory.createFolderRepository();
  const existing = await folderRepo.getSystemFolders();
  const hasStyle = existing.some((f) => f.card_tag === 'style' && f.name.includes('样板'));
  const hasChar = existing.some((f) => f.card_tag === 'character' && f.name.includes('样板'));

  if (!hasStyle) {
    const style = await folderRepo.createFolder(ownerId, {
      name: '系统样板 · 清新插画视觉风格',
      folder_kind: 'virtual',
      card_tag: 'style',
      is_system: true,
    });
    await folderRepo.updateFolderIndex(ownerId, style.id, {
      card_status: 'ready',
      card_summary: {
        style: {
          style_summary: '清新扁平插画，柔和粉彩，干净线条，留白充足',
          palette: ['#A8DADC', '#F1FAEE', '#E63946', '#1D3557'],
          dos: ['柔和光影', '简洁构图'],
          donts: ['过饱和霓虹', '写实摄影'],
          exemplar_urls: [],
        },
      },
    });
    console.log('created system style card', style.id);
  } else {
    console.log('system style sample already exists');
  }

  if (!hasChar) {
    const character = await folderRepo.createFolder(ownerId, {
      name: '系统样板 · 播客主持人',
      folder_kind: 'virtual',
      card_tag: 'character',
      is_system: true,
    });
    await folderRepo.updateFolderIndex(ownerId, character.id, {
      card_status: 'ready',
      card_summary: {
        character: {
          display_name: '播客主持人样板',
          description: '温和专业的中文播客主持人形象，适合知识向节目',
          appearance_image_urls: [],
          clothing_image_urls: [],
        },
      },
    });
    console.log('created system character card', character.id);
  } else {
    console.log('system character sample already exists');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
