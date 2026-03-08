/**
 * 敏感词数据仓库接口
 * 提供按 (scope, type, subtype) 解析敏感词数组，以及 Admin CRUD
 */

import type {
  SensitiveWordList,
  SensitiveWord,
  SensitiveWordListBinding,
  CreateSensitiveWordListDto,
  UpdateSensitiveWordListDto,
  CreateSensitiveWordDto,
  CreateSensitiveWordListBindingDto,
} from '../models/SensitiveWord';

export interface ISensitiveWordRepository {
  /**
   * 按细分业务解析敏感词数组（合并该 slot 绑定的所有有效 list 的词并去重）
   */
  getWordsForSlot(scope: string, type: string, subtype?: string | null): Promise<string[]>;

  // --- 敏感词表 (list) CRUD ---
  listLists(): Promise<SensitiveWordList[]>;
  findListById(id: string): Promise<SensitiveWordList | null>;
  createList(dto: CreateSensitiveWordListDto): Promise<SensitiveWordList>;
  updateList(id: string, dto: UpdateSensitiveWordListDto): Promise<SensitiveWordList>;
  deleteList(id: string): Promise<void>;

  // --- 敏感词明细 CRUD ---
  listWordsByListId(listId: string): Promise<SensitiveWord[]>;
  addWord(dto: CreateSensitiveWordDto): Promise<SensitiveWord>;
  deleteWord(id: string): Promise<void>;
  addWordsBatch(listId: string, words: string[]): Promise<number>;

  // --- 绑定 CRUD ---
  listBindings(scope?: string, type?: string, subtype?: string | null): Promise<SensitiveWordListBinding[]>;
  addBinding(dto: CreateSensitiveWordListBindingDto): Promise<SensitiveWordListBinding>;
  removeBinding(id: string): Promise<void>;
  setBindingsForSlot(scope: string, type: string, subtype: string | null, listIds: string[]): Promise<void>;
}
