type StaticTaskThumbProps = {
  kind: 'writing' | 'audio' | 'music' | 'folder';
};

export function StaticTaskThumb({ kind }: StaticTaskThumbProps) {
  const label =
    kind === 'writing' ? '写作' : kind === 'audio' ? '音频' : kind === 'music' ? '音乐' : '文件夹';
  return (
    <div className="graph-task-thumb">
      <span className="graph-task-thumb-placeholder">{label}</span>
    </div>
  );
}
