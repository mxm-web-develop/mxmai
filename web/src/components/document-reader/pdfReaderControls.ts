/** PDF 阅读器对外暴露的控制状态（供弹窗顶栏挂载工具条） */
export interface PdfReaderControls {
  zoom: number;
  fitWidthActive: boolean;
  currentPage: number;
  totalPages: number;
  canPrevPage: boolean;
  canNextPage: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
}
