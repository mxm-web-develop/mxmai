import type { ModalProps } from 'antd';

/** antd 6 全屏人工审核：锁死 .ant-modal-container 高度 */
export const MANUAL_REVIEW_FULLSCREEN_MODAL_STYLES: NonNullable<ModalProps['styles']> = {
  container: {
    height: '100%',
    maxHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: 0,
    overflow: 'hidden',
    padding: 0,
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
};
