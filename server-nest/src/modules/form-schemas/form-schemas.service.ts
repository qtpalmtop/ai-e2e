// 表单设计器存储
// - 维度：spaceId + nodeType
// - 默认 schema 与原 server/src/storage/formSchemaStore.js 的 DEFAULT_SCHEMAS 一致
// - 第一次访问某 (spaceId, nodeType) 组合时落默认，并按需 resetAll
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { SpaceRole } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class FormSchemasService {
  constructor(private readonly prisma: PrismaService) {}

  async listAll(actorId: string, spaceId: string) {
    await this.assertMember(actorId, spaceId);
    const rows = await this.prisma.formSchema.findMany({ where: { spaceId } });
    const out: Record<string, any> = {};
    for (const r of rows) {
      out[r.nodeType] = r.schema;
    }
    // 缺失的节点类型补默认
    for (const [nodeType, def] of Object.entries(DEFAULT_SCHEMAS)) {
      if (!out[nodeType]) out[nodeType] = def;
    }
    return out;
  }

  async getOne(actorId: string, spaceId: string, nodeType: string) {
    await this.assertMember(actorId, spaceId);
    const row = await this.prisma.formSchema.findUnique({
      where: { spaceId_nodeType: { spaceId, nodeType } },
    });
    if (row) return row.schema;
    return DEFAULT_SCHEMAS[nodeType] ?? { atoms: [] };
  }

  async upsert(
    actorId: string,
    spaceId: string,
    nodeType: string,
    atoms: any[],
  ) {
    const role = await this.assertMember(actorId, spaceId);
    if (role === SpaceRole.VIEWER) {
      throw new ForbiddenException('viewer cannot edit form schema');
    }
    const schema = { atoms };
    const row = await this.prisma.formSchema.upsert({
      where: { spaceId_nodeType: { spaceId, nodeType } },
      create: { spaceId, nodeType, schema: schema as any },
      update: { schema: schema as any },
    });
    return row.schema;
  }

  async resetAll(actorId: string, spaceId: string) {
    const role = await this.assertMember(actorId, spaceId);
    if (role === SpaceRole.VIEWER) {
      throw new ForbiddenException('viewer cannot reset form schema');
    }
    // 删除空间内所有 formSchema，访问时会自动 fallback 到默认
    await this.prisma.formSchema.deleteMany({ where: { spaceId } });
    return DEFAULT_SCHEMAS;
  }

  private async assertMember(userId: string, spaceId: string) {
    const m = await this.prisma.spaceMember.findUnique({
      where: { spaceId_userId: { spaceId, userId } },
    });
    if (!m) throw new ForbiddenException('not a space member');
    return m.role;
  }
}

// 与原 server/src/storage/formSchemaStore.js DEFAULT_SCHEMAS 保持一致
export const DEFAULT_SCHEMAS: Record<string, { atoms: any[] }> = {
  start: { atoms: [] },
  end: { atoms: [] },
  openPage: {
    atoms: [
      { id: 'a-url', type: 'url', name: 'url', label: '目标 URL', required: true, placeholder: 'https://example.com/login', rules: [] },
      { id: 'a-waitFor', type: 'boolean', name: 'waitForSelector', label: '等待关键元素', required: false, defaultValue: true, rules: [] },
      {
        id: 'a-selector',
        type: 'selector',
        name: 'readySelector',
        label: '关键元素选择器',
        required: false,
        placeholder: '#app, .main',
        help: '勾选"等待关键元素"时使用',
        rules: [{ type: 'visible', when: { field: 'waitForSelector', op: 'truthy' } }],
      },
    ],
  },
  inputText: {
    atoms: [
      { id: 'a-sel', type: 'selector', name: 'selector', label: '元素选择器', required: true, placeholder: '#input', rules: [] },
      { id: 'a-text', type: 'textarea', name: 'text', label: '输入内容', required: true, placeholder: '可使用 {{var}} 占位', rules: [] },
      { id: 'a-delay', type: 'delay', name: 'delay', label: '执行前等待 (ms)', required: false, defaultValue: 0, rules: [] },
    ],
  },
  clickElement: {
    atoms: [
      { id: 'a-sel', type: 'selector', name: 'selector', label: '元素选择器', required: true, placeholder: '#submit', rules: [] },
      { id: 'a-wait', type: 'delay', name: 'waitAfter', label: '点击后等待 (ms)', required: false, defaultValue: 0, rules: [] },
      { id: 'a-pre', type: 'delay', name: 'delay', label: '点击前等待 (ms)', required: false, defaultValue: 0, rules: [] },
    ],
  },
  hoverElement: {
    atoms: [
      { id: 'a-sel', type: 'selector', name: 'selector', label: '元素选择器', required: true, placeholder: '.item', rules: [] },
      { id: 'a-delay', type: 'delay', name: 'delay', label: '执行前等待 (ms)', required: false, defaultValue: 0, rules: [] },
    ],
  },
  wait: {
    atoms: [
      { id: 'a-d', type: 'delay', name: 'duration', label: '等待时长 (ms)', required: true, defaultValue: 1000, rules: [] },
    ],
  },
  condition: {
    atoms: [
      { id: 'a-exp', type: 'code', name: 'expression', label: '条件表达式', required: true, placeholder: 'page.url() === "..."', help: 'true 走 True 分支，否则 False', rules: [] },
    ],
  },
  loop: {
    atoms: [
      {
        id: 'a-mode',
        type: 'select',
        name: 'mode',
        label: '循环模式',
        required: true,
        defaultValue: 'count',
        options: [
          { label: '按次数', value: 'count' },
          { label: '按条件 (while)', value: 'while' },
        ],
        rules: [],
      },
      {
        id: 'a-count',
        type: 'number',
        name: 'count',
        label: '循环次数',
        required: false,
        defaultValue: 1,
        min: 1,
        max: 10000,
        rules: [
          { type: 'visible', when: { field: 'mode', op: 'eq', value: 'count' } },
          { type: 'required', when: { field: 'mode', op: 'eq', value: 'count' }, message: '次数模式下循环次数 ≥ 1' },
        ],
      },
      {
        id: 'a-while',
        type: 'code',
        name: 'whileExpression',
        label: 'while 条件',
        required: false,
        placeholder: '当条件为 true 时继续循环',
        rules: [
          { type: 'visible', when: { field: 'mode', op: 'eq', value: 'while' } },
          { type: 'required', when: { field: 'mode', op: 'eq', value: 'while' }, message: 'while 模式下条件必填' },
        ],
      },
    ],
  },
};
