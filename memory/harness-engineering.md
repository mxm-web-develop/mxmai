---
name: harness-engineering
description: Anthropic Harness Engineering 模式 - 长任务 Agent 架构
type: reference
---

# Harness Engineering 参考

## 来源
- Anthropic: "Effective Harnesses for Long-Running Agents" (2025-11)
- SamSamuelQZQ/auto-coding-agent-demo

## 核心问题

长任务 Agent 的两个典型失败模式：
1. **One-shotting**: 试图一次性完成所有功能，耗尽上下文
2. **Premature victory**: 过早宣布胜利，看到已有进展就停止

## 双 Agent 模式

| Agent | 职责 |
|-------|------|
| Initializer | 首次会话：建立 feature_list.json、progress.txt、init.sh |
| Coder | 后续会话：每次只做一个功能，git commit，更新进度 |

## 关键机制

| 机制 | 用途 |
|------|------|
| feature_list.json | 功能清单，pass/fail 状态，步骤验收 |
| progress.txt | 会话进度记录 |
| init.sh | 环境初始化脚本 |
| Git history | 可回滚到正确状态 |

## 使用场景

当任务满足以下任一条件时使用此模式：
- 预计耗时 > 1 小时
- 需要跨多个会话
- 包含多个可分离的子任务
