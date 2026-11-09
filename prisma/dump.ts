/**
 * Xuất dữ liệu đã seed ra file SQL (data-only, dạng INSERT) để bàn giao / import lại.
 *
 *  Quy trình bàn giao:
 *    1) Dựng backend -> prisma migrate deploy (tạo schema rỗng)
 *    2) npm run db:seed   (nạp prisma/seed.sql)
 *
 *  Yêu cầu: PostgreSQL native đang chạy và khớp DATABASE_URL trong .env,
 *           và `pg_dump` nằm trên PATH.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'seed.sql');

/** Lấy DATABASE_URL từ process.env, nếu thiếu thì đọc trực tiếp backend/.env. */
function readDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = join(__dirname, '..', '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  console.error('Không tìm thấy DATABASE_URL (process.env hoặc backend/.env).');
  process.exit(1);
}

/** Tách DATABASE_URL thành cờ kết nối cho pg_dump (bỏ qua query ?schema=...). */
function connArgs(databaseUrl: string): { args: string[]; password: string } {
  const u = new URL(databaseUrl);
  return {
    args: [
      '-h', u.hostname,
      '-p', u.port || '5432',
      '-U', decodeURIComponent(u.username),
      '-d', decodeURIComponent(u.pathname.replace(/^\//, '')),
    ],
    password: decodeURIComponent(u.password),
  };
}

const { args: conn, password } = connArgs(readDatabaseUrl());

const args = [
  ...conn,
  '--data-only',
  '--column-inserts',
  '--disable-triggers',
  '--no-owner',
  '--no-privileges',
  // bỏ qua bảng migration của Prisma (schema do migration tự tạo)
  '--exclude-table=_prisma_migrations',
  // Bảng phù du: KHÔNG xuất dữ liệu, chỉ xuất cấu trúc (đã có từ migration).
  // Đây là trạng thái phiên/token sinh ra lúc chạy, không phải dữ liệu demo — trước đây
  // seed.sql vô tình mang theo 37 dòng RefreshToken cũ, nên khách nào chạy db:seed cũng
  // nhận một đống session rác đã hết hạn.
  '--exclude-table-data=public."RefreshToken"',
  '--exclude-table-data=public."PasswordResetOtp"',
  '--exclude-table-data=public."EmailVerificationToken"',
  '--exclude-table-data=public."AuditLog"',
];

try {
  const sql = execFileSync('pg_dump', args, {
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, PGPASSWORD: password },
  }).toString('utf-8');
  const header =
    '-- TechShop seed data (data-only). Import SAU khi đã chạy prisma migrate deploy.\n' +
    `-- Sinh tự động bởi prisma/dump.ts lúc ${new Date().toISOString()}\n\n`;
  writeFileSync(OUT, header + sql, 'utf-8');
  const kb = Math.round(Buffer.byteLength(header + sql) / 1024);
  console.log(`✔ Đã xuất ${OUT} (${kb} KB)`);
} catch (e) {
  console.error('Lỗi pg_dump:', (e as Error).message);
  process.exit(1);
}
