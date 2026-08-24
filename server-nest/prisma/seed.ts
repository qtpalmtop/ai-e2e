// 数据库 seed
// 用途：
//  1. 初始化默认用户 admin / admin123（生产请改）
//  2. 创建 common 默认空间
//  3. 把老 server/data/cases/*.json 迁到 DB（挂在 common 空间下，creator=admin）
//  4. 把老 server/data/form-schemas.json 导入到 common 空间
//
// 运行：npx prisma db seed
import { PrismaClient, SpaceRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const prisma = new PrismaClient();

// 老 server 数据目录（相对项目根）
const LEGACY_SERVER_DIR = path.resolve(__dirname, '../../server/data');
const LEGACY_CASES_DIR = path.join(LEGACY_SERVER_DIR, 'cases');
const LEGACY_FORM_FILE = path.join(LEGACY_SERVER_DIR, 'form-schemas.json');

async function main() {
  // 1. 默认用户
  const passwordHash = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: passwordHash,
      nickname: 'Admin',
    },
  });

  // 2. common 默认空间
  const common = await prisma.space.upsert({
    where: { id: 'space-common' },
    update: { isDefault: true },
    create: {
      id: 'space-common',
      name: 'common',
      isDefault: true,
      description: '默认公共空间',
    },
  });

  // 3. 绑定 admin 为 OWNER
  await prisma.spaceMember.upsert({
    where: { spaceId_userId: { spaceId: common.id, userId: admin.id } },
    update: { role: SpaceRole.OWNER },
    create: { spaceId: common.id, userId: admin.id, role: SpaceRole.OWNER },
  });

  // 4. 迁移老用例文件
  let migratedCases = 0;
  try {
    const files = await fs.readdir(LEGACY_CASES_DIR);
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(LEGACY_CASES_DIR, f), 'utf8');
        const c = JSON.parse(raw);
        if (!c.id || !c.name) continue;
        await prisma.case.upsert({
          where: { id: c.id },
          update: {},
          create: {
            id: c.id,
            spaceId: common.id,
            creatorId: admin.id,
            name: c.name,
            schema: {
              id: c.id,
              name: c.name,
              nodes: c.nodes ?? [],
              edges: c.edges ?? [],
            } as any,
            createdAt: c.createdAt ? new Date(c.createdAt) : undefined,
            updatedAt: c.updatedAt ? new Date(c.updatedAt) : undefined,
          },
        });
        migratedCases++;
      } catch (e) {
        console.warn(`[seed] skip ${f}: ${(e as Error).message}`);
      }
    }
  } catch (e: any) {
    if (e?.code !== 'ENOENT') throw e;
    console.log(`[seed] no legacy cases dir: ${LEGACY_CASES_DIR}`);
  }

  // 5. 迁移老 form-schemas.json → common 空间
  let migratedForms = 0;
  try {
    const raw = await fs.readFile(LEGACY_FORM_FILE, 'utf8');
    const map = JSON.parse(raw) as Record<string, { atoms: any[] }>;
    for (const [nodeType, schema] of Object.entries(map)) {
      await prisma.formSchema.upsert({
        where: { spaceId_nodeType: { spaceId: common.id, nodeType } },
        update: { schema: schema as any },
        create: { spaceId: common.id, nodeType, schema: schema as any },
      });
      migratedForms++;
    }
  } catch (e: any) {
    if (e?.code !== 'ENOENT') throw e;
    console.log(`[seed] no legacy form-schemas.json`);
  }

  console.log(
    `[seed] done. admin='admin'/admin123, common space=${common.id}, ` +
      `migrated cases=${migratedCases}, form-schemas=${migratedForms}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
