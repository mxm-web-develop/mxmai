/**
 * mxmdata - 数据访问层
 * 统一导出接口、模型、适配器和工厂
 */

// 导出接口（排除与模型重复的类型）
export * from './interfaces/IUserRepository';
export * from './interfaces/IStorageRepository';
export * from './interfaces/IPaymentRepository';
export * from './interfaces/IWalletRepository';
export * from './interfaces/IUserMediaRepository';
export * from './interfaces/IUserAgentRepository';
export * from './interfaces/IConversationRepository';
export * from './interfaces/IAgentConversationRepository';
export * from './interfaces/ISmartflowRepository';
export * from './interfaces/ISmartflowExecutionRepository';
export * from './interfaces/ICGITaskRepository';
export * from './interfaces/IPromptEngineeringConfigRepository';
export * from './interfaces/IKnowledgeBaseRepository';
export * from './interfaces/IKnowledgeBaseDefaultsRepository';
export * from './interfaces/IPromptTemplateRepository';
export * from './interfaces/ISensitiveWordRepository';
export * from './interfaces/IPublishedApiRepository';
export * from './interfaces/IPublishedApiUsageRepository';
export * from './interfaces/IPartnerRepository';
export * from './interfaces/IUserReferenceImageRepository';
export * from './interfaces/IStorageObjectRepository';
export * from './interfaces/ISearchScopeConfigRepository';
export * from './interfaces/errors';

export type {
  FolderKind,
  FolderIndexStatus,
  FolderItemRefType,
  FolderIndexEntryStatus,
  FolderCardTag,
  FolderCardStatus,
  FolderAssetRole,
  Folder,
  FolderItem,
  FolderIndexEntry,
  CreateFolderDto,
  UpdateFolderDto,
  UpdateFolderIndexDto,
  UpsertFolderIndexEntryDto,
  FolderQueryOptions,
  FolderItemsQueryOptions,
} from './interfaces/IFolderRepository';
export type { IFolderRepository } from './interfaces/IFolderRepository';

// 导出 IPromptOptimizerRepository 接口（排除与 models 重复的类型：PromptTemplate, CreatePromptTemplateDto, UpdatePromptTemplateDto）
export type {
  IPromptOptimizerRepository,
  BaseModel,
  CreateBaseModelDto,
  UpdateBaseModelDto,
  LoRAModel,
  CreateLoRAModelDto,
  UpdateLoRAModelDto,
  GenerationCase,
  CreateGenerationCaseDto,
  BaseModelRecommendation,
  LoRAModelRecommendation,
  PromptRecommendation,
  // 注意：PromptTemplate, CreatePromptTemplateDto, UpdatePromptTemplateDto 从 models 导出，不从这里导出
} from './interfaces/IPromptOptimizerRepository';

// 导出模型（包含 PromptTemplate、CreatePromptTemplateDto 等，优先使用这些）
export * from './models';

// 导出适配器
export * from './adapters/supabase';
export * from './adapters/minio';

// 导出工厂
export * from './factories';

// 导出配置
export * from './config/dataConfig';
export * from './env';

// 导出应用语言（四语）
export * from './i18n';

// 导出存储层
export * from './storage';
