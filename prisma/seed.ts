/**
 * Seed chính thức (PART 1.3) — nạp dữ liệu từ prisma/seed.sql.
 *
 *  Dữ liệu gốc được sinh từ crawl (hoanghamobile.com) + sinh Device synthetic,
 *  sau đó pg_dump ra seed.sql (data-only). Crawler đã được gỡ khỏi repo;
 *  seed.sql là nguồn dữ liệu demo chính thức, độc lập, import lại được.
 *
 *  Yêu cầu: PostgreSQL native đang chạy và khớp DATABASE_URL trong .env,
 *           schema đã có (prisma migrate deploy / dev), và `psql` nằm trên PATH.
 *
 *  Dùng: npm run db:seed   (hoặc: npx prisma db seed)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_SQL = join(__dirname, 'seed.sql');

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

/** Tách DATABASE_URL thành cờ kết nối cho psql (bỏ qua query ?schema=...). */
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

if (!existsSync(SEED_SQL)) {
  console.error(`Không tìm thấy ${SEED_SQL}.`);
  process.exit(1);
}

const sql = readFileSync(SEED_SQL, 'utf-8');
const { args, password } = connArgs(readDatabaseUrl());

try {
  execFileSync('psql', [...args, '-q', '-v', 'ON_ERROR_STOP=1'], {
    input: sql,
    stdio: ['pipe', 'inherit', 'inherit'],
    env: { ...process.env, PGPASSWORD: password },
  });
  console.log('✔ Đã nạp dữ liệu từ prisma/seed.sql');
} catch (e) {
  console.error('Lỗi khi nạp seed.sql:', (e as Error).message);
  process.exit(1);
}
