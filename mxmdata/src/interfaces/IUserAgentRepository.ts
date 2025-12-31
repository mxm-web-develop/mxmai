/**
 * 用户助手项目仓库接口
 * 扩展 IUserRepository，提供用户助手任务查询功能
 */

import type { AgentProject, AgentProjectWithSteps, ProjectQueryOptions } from '../models/Agent';

export interface IUserAgentRepository {
  /**
   * 获取用户的助手项目列表
   */
  getUserAgentProjects(userId: string, options?: ProjectQueryOptions): Promise<AgentProject[]>;

  /**
   * 获取用户的助手项目总数
   */
  getUserAgentProjectCount(userId: string, options?: Omit<ProjectQueryOptions, 'limit' | 'offset' | 'include_steps'>): Promise<number>;

  /**
   * 根据项目 ID 获取助手项目详情（包含步骤）
   */
  getAgentProjectById(projectId: string, includeSteps?: boolean): Promise<AgentProjectWithSteps | null>;

  /**
   * 根据项目编号获取助手项目详情
   */
  getAgentProjectByNo(projectNo: string, includeSteps?: boolean): Promise<AgentProjectWithSteps | null>;

  /**
   * 获取用户在指定助手下的项目列表
   */
  getUserProjectsByAgent(userId: string, agentId: string, options?: Omit<ProjectQueryOptions, 'agent_id'>): Promise<AgentProject[]>;
}

