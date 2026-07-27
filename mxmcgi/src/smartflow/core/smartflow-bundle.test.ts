import { describe, it, expect } from 'vitest';
import type { CreateSmartflowDto, Smartflow, UpdateSmartflowDto } from './models/types';
import type { ISmartflowRepository } from './engine/repository';
import { applyMxmSmartflowBundleImport, buildSmartflowBundle } from './smartflow-bundle-import-apply';
import type { SmartflowBundle } from './smartflow-bundle-types';
import { validateSmartflowSchema } from './smartflow-schema-validator';

class InMemorySmartflowRepository implements ISmartflowRepository {
  private map = new Map<string, Smartflow>();

  async findById(id: string) {
    return this.map.get(id) ?? null;
  }
  async findAll() {
    return [...this.map.values()];
  }
  async findPublic() {
    return this.findAll();
  }
  async findByUserId() {
    return this.findAll();
  }
  async create(data: CreateSmartflowDto) {
    const now = new Date().toISOString();
    const sf: Smartflow = {
      id: data.id || `sf-${Date.now()}`,
      name: data.name,
      schema: data.schema,
      status: data.status || 'draft',
      version: data.version || '1.0.0',
      is_public: data.is_public || false,
      created_at: now,
      updated_at: now,
      ...data,
    };
    this.map.set(sf.id, sf);
    return sf;
  }
  async update(id: string, data: UpdateSmartflowDto) {
    const existing = this.map.get(id);
    if (!existing) throw new Error(`Smartflow not found: ${id}`);
    const updated = { ...existing, ...data, updated_at: new Date().toISOString() };
    this.map.set(id, updated);
    return updated;
  }
  async delete(id: string) {
    this.map.delete(id);
  }
}

const minimalBundle: SmartflowBundle = {
  schemaVersion: 1,
  kind: 'mxm-smartflow-bundle',
  exportedAt: new Date().toISOString(),
  items: [
    {
      id: 'test-flow-v1',
      name: '测试流',
      schema: {
        nodes: [
          { id: 'start', type: 'start', name: '开始' },
          {
            id: 'biz',
            type: 'business',
            business_scope: 'graph',
            taskKey: 'eshop',
            subtype: 'clothes',
            params: { prompt: '{{input.prompt}}' },
          },
          { id: 'end', type: 'end', name: '结束', output_mapping: {} },
        ],
        edges: [
          { from: 'start', to: 'biz' },
          { from: 'biz', to: 'end' },
        ],
      },
    },
  ],
};

describe('smartflow bundle', () => {
  it('rejects bare model nodes on import', async () => {
    const bad: SmartflowBundle = {
      ...minimalBundle,
      items: [
        {
          id: 'bad',
          name: 'bad',
          schema: {
            nodes: [
              { id: 'start', type: 'start' },
              { id: 'm', type: 'model', model_type: 'text', model: 'gpt-4o-mini', prompt: 'hi' },
              { id: 'end', type: 'end' },
            ],
            edges: [
              { from: 'start', to: 'm' },
              { from: 'm', to: 'end' },
            ],
          },
        },
      ],
    };
    const repo = new InMemorySmartflowRepository();
    await expect(
      applyMxmSmartflowBundleImport({ bundle: bad, conflictPolicy: 'upsert', repository: repo })
    ).rejects.toThrow(/裸 model/);
  });

  it('imports valid bundle with upsert', async () => {
    const repo = new InMemorySmartflowRepository();
    const first = await applyMxmSmartflowBundleImport({
      bundle: minimalBundle,
      conflictPolicy: 'upsert',
      repository: repo,
    });
    expect(first.created).toEqual(['test-flow-v1']);

    const second = await applyMxmSmartflowBundleImport({
      bundle: buildSmartflowBundle([{ ...minimalBundle.items[0], name: '改名' }]),
      conflictPolicy: 'upsert',
      repository: repo,
    });
    expect(second.updated).toEqual(['test-flow-v1']);
    const row = await repo.findById('test-flow-v1');
    expect(row?.name).toBe('改名');
  });

  it('validateSmartflowSchema requires business subtype', () => {
    const r = validateSmartflowSchema(
      {
        nodes: [
          { id: 'start', type: 'start' },
          { id: 'b', type: 'business', business_scope: 'graph', taskKey: 'eshop' },
          { id: 'end', type: 'end' },
        ],
        edges: [
          { from: 'start', to: 'b' },
          { from: 'b', to: 'end' },
        ],
      },
      { requireBusinessSubtype: true }
    );
    expect(r.ok).toBe(false);
  });
});
