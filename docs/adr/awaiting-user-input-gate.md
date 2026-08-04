# 闸门语义拆分：`awaiting_review` vs `awaiting_user_input`

## 背景

mxm-warp / pre-pipeline 的闸门有两种语义：

1. **interactive-card / basic-form** —— pre 引导卡，让用户补必填字段（行业方向、检索范围、日期、热点条数等）。这是「我还没开始干活，等你填字段」。
2. **manualReview（text / json / video-timeline / writing-chat ...）** —— 真实的人工审核闸门，等用户审稿/改稿后再继续生成。这是「我已经出活了，等你确认」。

历史上这两种闸门都被后端标成同一份 `task.status = 'awaiting_review'`，列表里统一显示「待审核」。这让用户和运营都误以为「待审核」=「我已经出活等你审」，实际上很多「待审核」其实只是「我还没开始干活等你补字段」。日报 writing 任务里尤其明显：pre 第一步是 `industry-daily-industry-card`，C 端弹窗补完直接走正常流程，但 Admin 测试 / 服务端批跑 / 老任务续跑会因缺字段被闸门卡住，标成「待审核」。

## 决策

- 引入新状态 `awaiting_user_input`（本地化文案「待补充信息」）。
- 闸门 `kind === 'interactive-card' || 'basic-form'` 时，task-executor / writing-task / audio-warp-pipeline 把 status 改为 `awaiting_user_input`，phase 标 `pre`，progress 20%。
- 其它闸门（text / json / video-timeline / writing-chat ...）保留 `awaiting_review`，phase 标 `enrich/post`，progress 35%/85%。
- task-status-normalize 在「闸门仍挂、无媒体产出」分支按 `gate.kind` 选择正确状态；老的 `awaiting_review` 任务会被立即纠正为 `awaiting_user_input`（闸门 kind 已落 metadata，无需重跑）。
- 前端 `taskStatus.ts` 把 `awaiting_user_input` 列入 `STATUS_KEYS`，与 `awaiting_review` 共享颜色 token，但保留独立选择器以便后续单独配色（如调整为待办橙）。
- 写作 / 音频的「审核提交」接口（`/tasks/:id/review`）放行 `awaiting_user_input` 状态 —— 用户的「补字段 + 提交」会走该接口。

## 后果

- 列表不再把"等补字段"误标成"待审核"，运营/用户的认知成本下降。
- Admin 测试面板与 C 端弹窗两条路径在 status 上被明确区分；老任务刷新一次即可纠正。
- 续跑（`mxmWarpResumeAt = 'start'`）路径不受影响，因为 `nextResume` 判定仍以 `gate.kind` 为准。

## 范围

- `mxmcgi/src/task/types.ts` — 新增 `awaiting_user_input`
- `mxmcgi/src/task/task-manager.ts` — `notifyStatuses` 集合
- `mxmcgi/src/task/task-status-normalize.ts` — `hasPendingUserInputGate` + `effectiveTaskStatus` 分支
- `mxmcgi/src/task/task-executor.ts` — `__pauseForManualReview` 路径分流
- `mxmcgi/src/core/writing/writing-task.ts` — warp paused 分流
- `mxmcgi/src/tasks/task-http-handlers.ts` — `/review` 接口放行
- `mxmcgi/src/tasks/audio-warp-pipeline.ts` — 仅 metadata，未直接改 status（由 task-executor 接管）
- `web/src/i18n/{zh,en,zh-TW,ja}/common.ts` — 文案
- `web/src/i18n/taskStatus.ts` — 映射
- `web/src/styles/primitives.css` — 徽标颜色
- `web/src/components/task-list/WritingTaskCard.tsx` — `isReview` 兼容两种状态