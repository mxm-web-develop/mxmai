/** 管线 trace / metadata 标识（非 scope/taskKey/subtype） */
export const PIPELINE_NODE_VIDEO_TIMELINE_RENDER = 'pipeline:video-timeline-render';

export const VIDEO_TIMELINE_RENDER_STORAGE = {
  scope: 'video' as const,
  extension: 'mp4',
  mime: 'video/mp4',
  bucket: 'user-media',
  pathTemplate: '{userId}/video-edit/{timestamp}-{randomId}/',
  filenameTemplate: 'video_{taskId}_{randomId}.mp4',
};
