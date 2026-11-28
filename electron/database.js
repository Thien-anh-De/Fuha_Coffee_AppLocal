import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { exec } from 'node:child_process'
import bcrypt from 'bcryptjs'
import {
  setupMaterialTables,
  seedMaterialDefaults,
  importMaterialsAndRecipesPayload,
  resolveValidProfileId,
  toLocalSqlDatetime,
  runInTransaction,
  recordOrderMaterialConsumption,
  reverseOrderMaterialConsumption,
  createMaterialDbMethods,
} from './materials.js'

let dbInstance = null
let dbFilePath = null

export function initDatabase(customPath) {
  if (dbInstance) return dbInstance

  const targetPath = customPath || path.resolve(process.cwd(), 'data', 'fuha-pos.db')
  const dir = path.dirname(targetPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  // Tự động chuyển dữ liệu cũ molliee-pos.db sang fuha-pos.db nếu có
  const oldDbPath = path.resolve(dir, 'molliee-pos.db')
  if (!fs.existsSync(targetPath) && fs.existsSync(oldDbPath)) {
    try {
      fs.copyFileSync(oldDbPath, targetPath)
      console.log('[FuHa Cafe POS] Đã tự động chuyển dữ liệu sang:', targetPath)
    } catch (_) {}
  }

  dbFilePath = targetPath
  dbInstance = new DatabaseSync(targetPath)

  // Bật foreign keys & WAL mode để tăng tốc và đảm bảo tính toàn vẹn
  dbInstance.exec('PRAGMA foreign_keys = ON;')
  dbInstance.exec('PRAGMA journal_mode = WAL;')

  setupTables(dbInstance)
  setupMaterialTables(dbInstance)
  seedInitialData(dbInstance)
  seedMaterialDefaults(dbInstance)
  seedBundledRecipes(dbInstance)

  return dbInstance
}

function seedBundledRecipes(db) {
  try {
    const recipesPath = path.resolve(import.meta.dirname, 'default-recipes.json')
    if (!fs.existsSync(recipesPath)) return
    const raw = fs.readFileSync(recipesPath, 'utf-8')
    const hash = crypto.createHash('sha256').update(raw).digest('hex')
    const prev = db.prepare("SELECT value FROM settings WHERE key = 'default_recipes_json_hash'").get()
    if (prev && prev.value === hash) return

    const payload = JSON.parse(raw)
    importMaterialsAndRecipesPayload(db, payload)
    db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('default_recipes_json_hash', ?, datetime('now', 'localtime'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(hash)
  } catch (err) {
    console.error('[FuHa Cafe POS] Seed bundled recipes warning:', err)
  }
}

export function getDatabase() {
  if (!dbInstance) {
    return initDatabase()
  }
  return dbInstance
}

function setupTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      password_hash TEXT,
      role TEXT NOT NULL CHECK(role IN ('OWNER', 'MANAGER', 'CASHIER')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled')),
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS tables (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK(status IN ('AVAILABLE', 'OCCUPIED', 'DISABLED')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      table_id TEXT REFERENCES tables(id) ON DELETE SET NULL,
      cashier_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      invoice_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'PAID', 'CANCELLED')),
      subtotal REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      paid_at TEXT,
      cancelled_at TEXT,
      cancelled_by TEXT REFERENCES profiles(id),
      cancel_reason TEXT
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
      product_name TEXT NOT NULL,
      unit_price REAL NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 1,
      subtotal REAL NOT NULL DEFAULT 0,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      method TEXT NOT NULL CHECK(method IN ('CASH', 'BANK_TRANSFER')),
      amount REAL NOT NULL DEFAULT 0,
      paid_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      cashier_id TEXT REFERENCES profiles(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES profiles(id),
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
    CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id);
  `)
}

function seedInitialData(db) {
  const defaultPasswordHash = bcrypt.hashSync('123456', 10)
  const adminPasswordHash   = bcrypt.hashSync('admin', 10)
  const ownerPasswordHash   = bcrypt.hashSync('0985162004', 10)

  // 1. Migration: Cập nhật tài khoản admin cũ nếu có thành 'admin'
  try {
    const oldAdmin = db.prepare("SELECT id FROM profiles WHERE email IN ('admin@fuha.vn', 'admin@molliee.vn', 'admin@molliee.com') COLLATE NOCASE").get()
    if (oldAdmin) {
      db.prepare("UPDATE profiles SET email = 'admin', name = 'admin', password_hash = ? WHERE id = ?").run(adminPasswordHash, oldAdmin.id)
    }
  } catch { /* ignore */ }

  // 2. Đảm bảo tài khoản admin: 'admin' (mật khẩu: 'admin')
  const existingAdmin = db.prepare("SELECT id, email FROM profiles WHERE email = 'admin' COLLATE NOCASE OR id IN ('user-owner-admin', 'user-owner-002')").get()
  if (!existingAdmin) {
    db.prepare(`INSERT OR IGNORE INTO profiles (id, name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?)`)
      .run('user-owner-admin', 'admin', 'admin', adminPasswordHash, 'OWNER', 'active')
  } else if (existingAdmin.email !== 'admin') {
    // Chỉ sửa email nếu chưa đúng — KHÔNG reset name để tránh ghi đè tên đã tuỳ chỉnh
    db.prepare("UPDATE profiles SET email = 'admin' WHERE id = ?").run(existingAdmin.id)
  }

  // Đảm bảo tài khoản dev: 'dev' (mật khẩu: 'Thienanh1906@', quyền OWNER)
  const devPasswordHash = bcrypt.hashSync('Thienanh1906@', 10)
  const existingDev = db.prepare("SELECT id FROM profiles WHERE email = 'dev' COLLATE NOCASE OR id = 'user-owner-dev'").get()
  if (!existingDev) {
    db.prepare(`INSERT OR IGNORE INTO profiles (id, name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?)`)
      .run('user-owner-dev', 'dev', 'dev', devPasswordHash, 'OWNER', 'active')
  }

  // 2. Kiểm tra bàn
  const tableCount = db.prepare("SELECT count(*) as count FROM tables").get()
  if (!tableCount || tableCount.count === 0) {
    const insertTable = db.prepare("INSERT INTO tables (id, name, sort_order, status, active) VALUES (?, ?, ?, 'AVAILABLE', 1)")
    const tables = [
      { id: 'tbl-takeaway', name: 'Mang về', sort_order: 0 },
      { id: 'tbl-01', name: 'Bàn 01', sort_order: 1 },
      { id: 'tbl-02', name: 'Bàn 02', sort_order: 2 },
      { id: 'tbl-03', name: 'Bàn 03', sort_order: 3 },
      { id: 'tbl-04', name: 'Bàn 04', sort_order: 4 },
      { id: 'tbl-05', name: 'Bàn 05', sort_order: 5 },
      { id: 'tbl-06', name: 'Bàn 06', sort_order: 6 },
      { id: 'tbl-07', name: 'Bàn 07', sort_order: 7 },
      { id: 'tbl-08', name: 'Bàn 08', sort_order: 8 },
      { id: 'tbl-09', name: 'Bàn 09', sort_order: 9 },
      { id: 'tbl-10', name: 'Bàn 10', sort_order: 10 },
      { id: 'tbl-11', name: 'Bàn 11', sort_order: 11 },
      { id: 'tbl-12', name: 'Bàn 12', sort_order: 12 },
      { id: 'tbl-13', name: 'Bàn 13', sort_order: 13 },
      { id: 'tbl-14', name: 'Bàn 14', sort_order: 14 },
      { id: 'tbl-15', name: 'Bàn 15', sort_order: 15 },
      { id: 'tbl-16', name: 'Bàn 16', sort_order: 16 },
      { id: 'tbl-17', name: 'Bàn 17', sort_order: 17 },
      { id: 'tbl-18', name: 'Bàn 18', sort_order: 18 },
      { id: 'tbl-19', name: 'Bàn 19', sort_order: 19 },
      { id: 'tbl-20', name: 'Bàn 20', sort_order: 20 },
    ]
    for (const t of tables) {
      insertTable.run(t.id, t.name, t.sort_order)
    }
  } else {
    // Migration: ensure tables 11 to 20 exist
    const insertTable = db.prepare("INSERT OR IGNORE INTO tables (id, name, sort_order, status, active) VALUES (?, ?, ?, 'AVAILABLE', 1)")
    for (let i = 11; i <= 20; i++) {
      insertTable.run(`tbl-${i}`, `Bàn ${i}`, i)
    }
  }

  // Migration: Xóa sản phẩm size (L) và bỏ ký hiệu (M) khỏi tên sản phẩm
  // Chỉ chạy đúng 1 lần — sau đó đánh dấu hoàn thành để không ảnh hưởng
  // đến các sản phẩm quán tự thêm sau này (vd: "Sinh tố (L)" quán tự tạo sẽ không bị xóa)
  try {
    const migDone = db.prepare("SELECT value FROM settings WHERE key = 'migration_remove_size_ml'").get()
    if (!migDone) {
      db.prepare("DELETE FROM products WHERE name LIKE '% (L)'").run()
      db.prepare("UPDATE products SET name = REPLACE(name, ' (M)', '') WHERE name LIKE '% (M)'").run()
      db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('migration_remove_size_ml', '1')").run()
      console.log('[FuHa Cafe POS] Migration: Đã cập nhật tên sản phẩm (bỏ size M/L) — chỉ chạy 1 lần.')
    }
  } catch (_) { /* ignore */ }

  // Migration: Chuẩn hóa product_name trong order_items về tên gốc chuẩn theo bảng products
  try {
    db.prepare(`
      UPDATE order_items
      SET product_name = (SELECT name FROM products WHERE products.id = order_items.product_id)
      WHERE product_id IS NOT NULL 
        AND product_id != '' 
        AND EXISTS (SELECT 1 FROM products WHERE products.id = order_items.product_id)
    `).run()
  } catch (_) { /* ignore */ }

  // 3. Kiểm tra danh mục và sản phẩm
  const catCount = db.prepare("SELECT count(*) as count FROM categories").get()
  if (!catCount || catCount.count === 0) {
    const insertCat = db.prepare("INSERT INTO categories (id, name, sort_order, active) VALUES (?, ?, ?, 1)")
    const insertProd = db.prepare("INSERT INTO products (id, category_id, name, price, sort_order, active) VALUES (?, ?, ?, ?, ?, 1)")

    const seedCategories = [
      {
        id: 'cat-ca-phe', name: 'Cà Phê', sort_order: 1,
        items: [
          { name: 'Cà phê đen (nóng/đá)', price: 25000 },
          { name: 'Cà phê nâu (nóng/đá)', price: 25000 },
          { name: 'Cà phê bạc sỉu', price: 30000 },
          { name: 'Cà phê muối', price: 30000 },
          { name: 'Cà phê kem trứng', price: 30000 },
          { name: 'Cà phê cốt dừa', price: 35000 },
          { name: 'Cà phê latte', price: 30000 },
          { name: 'Cà phê latte caramel', price: 35000 }
        ]
      },
      {
        id: 'cat-americano', name: 'Americano & Cold Brew', sort_order: 2,
        items: [
          { name: 'Americano đá', price: 30000 },
          { name: 'Americano chanh vàng', price: 35000 },
          { name: 'Americano đào', price: 35000 },
          { name: 'Cold Brew đá', price: 30000 },
          { name: 'Cold Brew chanh vàng', price: 35000 },
          { name: 'Cold Brew đào', price: 35000 }
        ]
      },
      {
        id: 'cat-tra-trai-cay', name: 'Trà Trái Cây', sort_order: 3,
        items: [
          { name: 'Trà xoài nhiệt đới', price: 30000 },
          { name: 'Trà dâu nam mỹ', price: 30000 },
          { name: 'Trà ổi hồng', price: 30000 },
          { name: 'Trà vải lài', price: 30000 },
          { name: 'Trà việt quất', price: 30000 },
          { name: 'Trà chanh vàng', price: 30000 },
          { name: 'Trà đào cam sả', price: 35000 },
          { name: 'Trà chanh/ Trà tắc nha đam', price: 25000 }
        ]
      },
      {
        id: 'cat-tra-sua', name: 'Trà Sữa', sort_order: 4,
        items: [
          { name: 'Trà sữa trân châu', price: 30000 },
          { name: 'Trà sữa kem trứng', price: 35000 },
          { name: 'Trà sữa kem muối', price: 35000 },
          { name: 'Trà sữa khoai môn', price: 35000 },
          { name: 'Trà sữa bạc hà', price: 35000 },
          { name: 'Sữa tươi trân châu đường đen', price: 40000 }
        ]
      },
      {
        id: 'cat-sua-chua', name: 'Sữa Chua', sort_order: 5,
        items: [
          { name: 'Sữa chua lắc đá', price: 25000 },
          { name: 'Sữa chua lắc xoài', price: 30000 },
          { name: 'Sữa chua lắc dâu', price: 30000 },
          { name: 'Sữa chua lắc ổi', price: 30000 },
          { name: 'Sữa chua lắc vải', price: 30000 },
          { name: 'Sữa chua lắc việt quất', price: 30000 },
          { name: 'Sữa chua lắc cafe', price: 30000 }
        ]
      },
      {
        id: 'cat-tra-thao-moc', name: 'Trà Thảo Mộc', sort_order: 6,
        items: [
          { name: 'Trà lipton', price: 25000 },
          { name: 'Trà gừng mật ong', price: 30000 },
          { name: 'Trà cam quế', price: 30000 },
          { name: 'Trà hoa cúc', price: 30000 },
          { name: 'Trà hoa 7 màu', price: 30000 },
          { name: 'Trà đông trùng hạ thảo', price: 30000 },
          { name: 'Ấm trà mạn', price: 40000 }
        ]
      },
      {
        id: 'cat-sinh-to', name: 'Sinh Tố Trái Cây', sort_order: 7,
        items: [
          { name: 'Bơ già dừa non', price: 40000 },
          { name: 'Xoài già dừa non', price: 40000 },
          { name: 'Sinh tố bơ', price: 40000 },
          { name: 'Sinh tố xoài', price: 40000 },
          { name: 'Sinh tố bơ xoài', price: 40000 },
          { name: 'Sinh tố bơ sữa chua', price: 45000 },
          { name: 'Sinh tố xoài sữa chua', price: 45000 },
          { name: 'Chanh tuyết', price: 35000 }
        ]
      },
      {
        id: 'cat-nuoc-ep', name: 'Nước Ép Hoa Quả', sort_order: 8,
        items: [
          { name: 'Nước cam tươi', price: 35000 },
          { name: 'Nước chanh tươi', price: 30000 },
          { name: 'Nước chanh leo', price: 30000 },
          { name: 'Nước ép dưa hấu', price: 30000 },
          { name: 'Nước ép cam cà rốt', price: 35000 },
          { name: 'Nước ép cam chanh leo', price: 35000 }
        ]
      },
      {
        id: 'cat-matcha', name: 'Matcha & Cacao', sort_order: 9,
        items: [
          { name: 'Matcha latte', price: 30000 },
          { name: 'Matcha kem muối', price: 35000 },
          { name: 'Matcha cam', price: 40000 },
          { name: 'Matcha caramel', price: 35000 },
          { name: 'Cacao nóng/đá', price: 30000 },
          { name: 'Cacao kem muối', price: 35000 },
          { name: 'Cacao latte', price: 35000 },
          { name: 'Cacao bạc hà', price: 35000 },
          { name: 'Khoai môn latte', price: 30000 },
          { name: 'Khoai môn sữa dừa', price: 35000 },
          { name: 'Khoai môn kem muối', price: 35000 }
        ]
      },
      {
        id: 'cat-topping', name: 'Topping', sort_order: 10,
        items: [
          { name: 'Trân châu trắng', price: 5000 },
          { name: 'Nha đam', price: 5000 },
          { name: 'Kem muối', price: 5000 },
          { name: 'Kem trứng', price: 5000 }
        ]
      },
      {
        id: 'cat-an-vat', name: 'Đồ Ăn Vặt', sort_order: 11,
        items: [
          { name: 'Hướng dương', price: 15000 },
          { name: 'Khô bò/ khô gà', price: 20000 }
        ]
      }
    ]

    for (const cat of seedCategories) {
      insertCat.run(cat.id, cat.name, cat.sort_order)
      let pIdx = 1
      for (const prod of cat.items) {
        const pId = `prod-${cat.id.replace('cat-', '')}-${pIdx}`
        insertProd.run(pId, cat.id, prod.name, prod.price, pIdx)
        pIdx++
      }
    }
  }

  // 3. Cài đặt ban đầu
  const initSetting = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)")
  initSetting.run('shop_name', 'FUHA CAFE')
  initSetting.run('shop_address', 'Trường ĐH Hà Nội, Km9 Nguyễn Trãi, Đại Mỗ')
  initSetting.run('shop_phone', '0985162004')
  initSetting.run('wifi_pass', 'Hanu2026')

  // Cập nhật lại thông tin nếu database còn chứa giá trị mẫu mặc định cũ (placeholder)
  // CHÚ Ý: Chỉ ghi đè các giá trị placeholder rõ ràng — KHÔNG dùng pattern rộng để tránh ghi đè dữ liệu thật của người dùng
  try {
    db.prepare("UPDATE settings SET value = 'Trường ĐH Hà Nội, Km9 Nguyễn Trãi, Đại Mỗ' WHERE key = 'shop_address' AND (value LIKE '%123 Đường%' OR value = 'Căng tin HANU' OR value = '' OR value NOT LIKE '%Đại Mỗ%')").run()
    db.prepare("UPDATE settings SET value = '0985162004' WHERE key = 'shop_phone' AND (value = '' OR value LIKE '%0901%')").run()
    db.prepare("UPDATE settings SET value = 'Hanu2026' WHERE key = 'wifi_pass' AND (value = '0985162004' OR value LIKE '%Molliee%' OR value = '' OR value NOT LIKE '%Hanu2026%')").run()
  } catch {
    // ignore
  }
}

// ──────────────────────────────────────────────────────────────
// API METHODS (Được gọi từ Electron IPC hoặc Local HTTP Server)
// ──────────────────────────────────────────────────────────────

function isSystemAdminAccount(userId, email) {
  if (userId === 'user-owner-admin' || userId === 'user-owner-002') return true
  const lower = (email || '').trim().toLowerCase()
  if (lower === 'admin' || lower === 'admin@fuha.vn') return true
  return false
}

export const dbService = {
  // Auth
  async login(email, password) {
    const db = getDatabase()
    const user = db.prepare("SELECT * FROM profiles WHERE email = ? COLLATE NOCASE").get(email)
    if (!user) {
      return { user: null, error: 'Tài khoản hoặc mật khẩu không chính xác' }
    }
    if (user.status !== 'active') {
      return { user: null, error: 'Tài khoản đã bị khóa. Vui lòng liên hệ quản lý' }
    }
    const match = bcrypt.compareSync(password, user.password_hash)
    if (!match) {
      return { user: null, error: 'Tài khoản hoặc mật khẩu không chính xác' }
    }
    const { password_hash, ...profile } = user
    return {
      profile,
      user: { id: profile.id, email: profile.email },
      session: { access_token: 'local-offline-session', user: { id: profile.id, email: profile.email } },
      error: null
    }
  },

  async getProfile(userId) {
    const db = getDatabase()
    const user = db.prepare("SELECT id, name, email, role, status, created_at FROM profiles WHERE id = ?").get(userId)
    return user || null
  },

  async changePassword(userId, currentPassword, newPassword) {
    const db = getDatabase()
    const user = db.prepare("SELECT password_hash FROM profiles WHERE id = ?").get(userId)
    if (!user) throw new Error('Tài khoản không tồn tại')
    const match = bcrypt.compareSync(currentPassword, user.password_hash)
    if (!match) throw new Error('Mật khẩu hiện tại không chính xác')
    if (newPassword.length < 6) throw new Error('Mật khẩu mới phải có ít nhất 6 ký tự')
    const newHash = bcrypt.hashSync(newPassword, 10)
    db.prepare("UPDATE profiles SET password_hash = ? WHERE id = ?").run(newHash, userId)
    return { success: true }
  },

  async resetPassword(userId, newPassword) {
    const db = getDatabase()
    if (!newPassword || newPassword.length < 6) throw new Error('Mật khẩu phải có ít nhất 6 ký tự')

    // Bảo vệ tài khoản Admin hệ thống
    const target = db.prepare("SELECT email FROM profiles WHERE id = ?").get(userId)
    if (isSystemAdminAccount(userId, target?.email)) {
      throw new Error('Không thể đặt lại mật khẩu cho tài khoản Admin hệ thống từ giao diện này. Vui lòng đăng nhập tài khoản Admin để tự đổi mật khẩu.')
    }

    const newHash = bcrypt.hashSync(newPassword, 10)
    db.prepare("UPDATE profiles SET password_hash = ? WHERE id = ?").run(newHash, userId)
    return { success: true }
  },

  async getSetting(key) {
    const db = getDatabase()
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key)
    return row ? row.value : null
  },

  // Users
  async getUsers() {
    const db = getDatabase()
    return db.prepare("SELECT id, name, email, role, status, created_at FROM profiles ORDER BY created_at DESC").all()
  },

  async createUser(data) {
    const db = getDatabase()

    // Chặn tạo tài khoản với email/tên Admin hệ thống
    const cleanEmail = (data.email || '').trim().toLowerCase()
    if (['admin', 'admin@fuha.vn'].includes(cleanEmail)) {
      throw new Error('Tài khoản này đã được sử dụng cho Admin hệ thống. Vui lòng dùng tài khoản khác.')
    }

    // Kiểm tra email trùng
    const existing = db.prepare("SELECT id FROM profiles WHERE email = ? COLLATE NOCASE").get(data.email)
    if (existing) {
      throw new Error('Email này đã được đăng ký cho một tài khoản khác trong hệ thống.')
    }

    const id = 'user-' + crypto.randomUUID().substring(0, 8)
    const hash = bcrypt.hashSync(data.password || '123456', 10)
    db.prepare(`
      INSERT INTO profiles (id, name, email, password_hash, role, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, data.name, data.email, hash, data.role || 'CASHIER', data.status || 'active')
    return this.getProfile(id)
  },

  async updateUser(id, updates) {
    const db = getDatabase()

    // Bảo vệ tài khoản Admin hệ thống
    const target = db.prepare("SELECT email, role FROM profiles WHERE id = ?").get(id)
    if (isSystemAdminAccount(id, target?.email)) {
      if (updates.status === 'disabled') {
        throw new Error('Tài khoản Admin hệ thống luôn ở trạng thái hoạt động, không thể khóa.')
      }
      if (updates.role && updates.role !== 'OWNER') {
        throw new Error('Không thể thay đổi vai trò của tài khoản Admin hệ thống.')
      }
      // FIX: Chặn đổi email/tài khoản — nếu bị đổi, tài khoản mất nhận dạng
      const newEmail = updates.email !== undefined ? updates.email.trim().toLowerCase() : ''
      if (updates.email !== undefined && !['admin', 'admin@fuha.vn'].includes(newEmail)) {
        throw new Error('Không thể thay đổi tài khoản của Admin hệ thống.')
      }
    }

    const fields = []
    const values = []
    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.email !== undefined) { fields.push('email = ?'); values.push(updates.email); }
    if (updates.role !== undefined) { fields.push('role = ?'); values.push(updates.role); }
    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.password) {
      fields.push('password_hash = ?')
      values.push(bcrypt.hashSync(updates.password, 10))
    }
    if (fields.length > 0) {
      values.push(id)
      db.prepare(`UPDATE profiles SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }
    return this.getProfile(id)
  },

  async deleteUser(id) {
    const db = getDatabase()

    // 1. Bảo vệ tài khoản Admin hệ thống không bị xóa
    const target = db.prepare("SELECT email FROM profiles WHERE id = ?").get(id)
    if (isSystemAdminAccount(id, target?.email)) {
      throw new Error('Tài khoản Admin hệ thống được bảo vệ vĩnh viễn, không thể xóa.')
    }

    // 2. Kiểm tra lịch sử
    const hasOrders = db.prepare("SELECT 1 FROM orders WHERE cashier_id = ? OR cancelled_by = ? LIMIT 1").get(id, id)
    if (hasOrders) {
      throw new Error('Nhân viên này đã có lịch sử đơn hàng. Vui lòng chuyển trạng thái sang "Khóa" để bảo toàn số liệu kế toán.')
    }
    db.prepare("DELETE FROM profiles WHERE id = ?").run(id)
    return { success: true }
  },

  // Categories
  async getCategories(activeOnly = false) {
    const db = getDatabase()
    const sql = activeOnly
      ? "SELECT * FROM categories WHERE active = 1 ORDER BY sort_order ASC"
      : "SELECT * FROM categories ORDER BY sort_order ASC"
    const rows = db.prepare(sql).all()
    return rows.map(r => ({ ...r, active: Boolean(r.active) }))
  },

  async createCategory(name, sort_order = 0) {
    const db = getDatabase()
    const id = 'cat-' + crypto.randomUUID().substring(0, 8)
    db.prepare("INSERT INTO categories (id, name, sort_order, active) VALUES (?, ?, ?, 1)").run(id, name, sort_order)
    return { id, name, sort_order, active: true }
  },

  async updateCategory(id, updates) {
    const db = getDatabase()
    const fields = []
    const values = []
    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(updates.sort_order); }
    if (updates.active !== undefined) { fields.push('active = ?'); values.push(updates.active ? 1 : 0); }
    if (fields.length > 0) {
      values.push(id)
      db.prepare(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }
    return db.prepare("SELECT * FROM categories WHERE id = ?").get(id)
  },

  async deleteCategory(id) {
    const db = getDatabase()
    db.prepare("DELETE FROM categories WHERE id = ?").run(id)
    return { success: true }
  },

  // Products
  async getProducts(activeOnly = false) {
    const db = getDatabase()
    const sql = `
      SELECT p.*, c.name as cat_name, c.sort_order as cat_sort
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ${activeOnly ? 'WHERE p.active = 1' : ''}
      ORDER BY p.name ASC
    `
    const rows = db.prepare(sql).all()
    return rows.map(r => ({
      id: r.id,
      category_id: r.category_id,
      name: r.name,
      price: Number(r.price),
      active: Boolean(r.active),
      sort_order: r.sort_order,
      created_at: r.created_at,
      updated_at: r.updated_at,
      category: r.category_id ? { id: r.category_id, name: r.cat_name, sort_order: r.cat_sort } : undefined
    }))
  },

  async createProduct(data) {
    const db = getDatabase()
    const id = 'prod-' + crypto.randomUUID().substring(0, 8)
    db.prepare(`
      INSERT INTO products (id, category_id, name, price, active, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, data.category_id, data.name, data.price, data.active !== false ? 1 : 0, data.sort_order || 0)
    return this.getProducts().then(list => list.find(p => p.id === id))
  },

  async updateProduct(id, updates) {
    const db = getDatabase()
    const fields = []
    const values = []
    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.category_id !== undefined) { fields.push('category_id = ?'); values.push(updates.category_id); }
    if (updates.price !== undefined) { fields.push('price = ?'); values.push(updates.price); }
    if (updates.active !== undefined) { fields.push('active = ?'); values.push(updates.active ? 1 : 0); }
    if (updates.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(updates.sort_order); }
    fields.push("updated_at = datetime('now', 'localtime')")

    if (fields.length > 0) {
      values.push(id)
      db.prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }
    return (await this.getProducts()).find(p => p.id === id)
  },

  async deleteProduct(id) {
    const db = getDatabase()
    db.prepare("DELETE FROM products WHERE id = ?").run(id)
    return { success: true }
  },

  // Tables
  async getTables() {
    const db = getDatabase()
    const rows = db.prepare("SELECT * FROM tables ORDER BY sort_order ASC").all()
    return rows.map(r => ({ ...r, active: Boolean(r.active) }))
  },

  async createTable(name, sort_order = 0) {
    const db = getDatabase()
    const id = 'tbl-' + crypto.randomUUID().substring(0, 8)
    db.prepare("INSERT INTO tables (id, name, sort_order, status, active) VALUES (?, ?, ?, 'AVAILABLE', 1)").run(id, name, sort_order)
    return { id, name, sort_order, status: 'AVAILABLE', active: true }
  },

  async updateTable(id, updates) {
    const db = getDatabase()
    const fields = []
    const values = []
    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(updates.sort_order); }
    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.active !== undefined) { fields.push('active = ?'); values.push(updates.active ? 1 : 0); }
    if (fields.length > 0) {
      values.push(id)
      db.prepare(`UPDATE tables SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }
    return db.prepare("SELECT * FROM tables WHERE id = ?").get(id)
  },

  async deleteTable(id) {
    const db = getDatabase()
    db.prepare("DELETE FROM tables WHERE id = ?").run(id)
    return { success: true }
  },

  // Orders
  async getOpenOrderByTable(tableId) {
    const db = getDatabase()
    const order = db.prepare(`
      SELECT o.*, t.name as tbl_name, t.status as tbl_status, p.name as cashier_name, p.role as cashier_role
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      LEFT JOIN profiles p ON o.cashier_id = p.id
      WHERE o.table_id = ? AND o.status = 'OPEN'
      LIMIT 1
    `).get(tableId)

    if (!order) return null

    const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id)
    return {
      ...order,
      subtotal: Number(order.subtotal),
      discount: Number(order.discount),
      total: Number(order.total),
      table: order.table_id ? { id: order.table_id, name: order.tbl_name, status: order.tbl_status } : undefined,
      cashier: order.cashier_id ? { id: order.cashier_id, name: order.cashier_name, role: order.cashier_role } : undefined,
      items: items.map(i => ({ ...i, unit_price: Number(i.unit_price), subtotal: Number(i.subtotal) }))
    }
  },

  async createOrder(tableId, cashierId) {
    const db = getDatabase()

    // Đảm bảo cashierId tồn tại trong profiles để tránh lỗi FOREIGN KEY nếu phiên đăng nhập cũ còn lưu trong localStorage
    const { id: safeCashierId } = resolveValidProfileId(db, cashierId)

    // Tạo invoice_number không bị trùng khi có đơn trống bị xóa trong ngày
    const maxRow = db.prepare(`
      SELECT COALESCE(MAX(CAST(SUBSTR(invoice_number, 3) AS INTEGER)), 0) as maxNum
      FROM orders
      WHERE date(created_at) = date('now', 'localtime')
        AND invoice_number LIKE 'HD%'
    `).get()
    const nextNum = (maxRow ? Number(maxRow.maxNum) : 0) + 1
    const invoiceNumber = `HD${String(nextNum).padStart(4, '0')}`

    const id = 'ord-' + crypto.randomUUID()
    db.prepare(`
      INSERT INTO orders (id, table_id, cashier_id, invoice_number, status, subtotal, discount, total)
      VALUES (?, ?, ?, ?, 'OPEN', 0, 0, 0)
    `).run(id, tableId, safeCashierId, invoiceNumber)

    if (tableId) {
      db.prepare("UPDATE tables SET status = 'OCCUPIED' WHERE id = ?").run(tableId)
    }

    return this.getOpenOrderByTable(tableId)
  },

  async cleanupIfEmpty(orderId, tableId) {
    const db = getDatabase()
    const count = db.prepare("SELECT count(*) as c FROM order_items WHERE order_id = ?").get(orderId)
    if (!count || count.c === 0) {
      db.prepare("DELETE FROM orders WHERE id = ?").run(orderId)
      if (tableId) {
        db.prepare("UPDATE tables SET status = 'AVAILABLE' WHERE id = ?").run(tableId)
      }
    }
  },

  async addOrderItem(orderId, item) {
    const db = getDatabase()
    const existing = db.prepare(`
      SELECT * FROM order_items
      WHERE order_id = ? AND product_id = ? AND (note = ? OR (note IS NULL AND ? IS NULL))
    `).get(orderId, item.product_id, item.note || null, item.note || null)

    if (existing) {
      const newQty = existing.quantity + item.quantity
      const newSubtotal = newQty * existing.unit_price
      db.prepare("UPDATE order_items SET quantity = ?, subtotal = ? WHERE id = ?").run(newQty, newSubtotal, existing.id)
    } else {
      const itemId = 'item-' + crypto.randomUUID()
      db.prepare(`
        INSERT INTO order_items (id, order_id, product_id, product_name, unit_price, quantity, subtotal, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(itemId, orderId, item.product_id, item.product_name, item.unit_price, item.quantity, item.subtotal, item.note || null)
    }

    this.recalculateOrder(orderId)
    return db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(orderId)
  },

  async updateOrderItemDetails(itemId, orderId, note, unitPrice, quantity, baseProductName) {
    const db = getDatabase()
    const subtotal = unitPrice * quantity
    // Luôn giữ tên món gốc chuẩn, không nối note/topping/size vào cột product_name
    let name = baseProductName
    if (name) {
      name = name.replace(/\s*\([^)]*(\([^)]*\)[^)]*)*\)?\s*$/g, '').replace(/\s*\(.*$/g, '').trim()
    }
    const currentItem = db.prepare("SELECT product_id FROM order_items WHERE id = ?").get(itemId)
    if (currentItem && currentItem.product_id) {
      const prod = db.prepare("SELECT name FROM products WHERE id = ?").get(currentItem.product_id)
      if (prod && prod.name) {
        name = prod.name
      }
    }

    if (name) {
      db.prepare("UPDATE order_items SET unit_price = ?, quantity = ?, subtotal = ?, note = ?, product_name = ? WHERE id = ?")
        .run(unitPrice, quantity, subtotal, note, name, itemId)
    } else {
      db.prepare("UPDATE order_items SET unit_price = ?, quantity = ?, subtotal = ?, note = ? WHERE id = ?")
        .run(unitPrice, quantity, subtotal, note, itemId)
    }
    this.recalculateOrder(orderId)
  },

  async updateOrderItemQuantity(itemId, orderId, quantity) {
    const db = getDatabase()
    if (quantity <= 0) {
      db.prepare("DELETE FROM order_items WHERE id = ?").run(itemId)
    } else {
      const item = db.prepare("SELECT unit_price FROM order_items WHERE id = ?").get(itemId)
      if (item) {
        db.prepare("UPDATE order_items SET quantity = ?, subtotal = ? WHERE id = ?").run(quantity, quantity * item.unit_price, itemId)
      }
    }
    this.recalculateOrder(orderId)
  },

  async removeOrderItem(itemId, orderId) {
    const db = getDatabase()
    db.prepare("DELETE FROM order_items WHERE id = ?").run(itemId)
    this.recalculateOrder(orderId)
  },

  recalculateOrder(orderId) {
    const db = getDatabase()
    const items = db.prepare("SELECT sum(subtotal) as totalSub FROM order_items WHERE order_id = ?").get(orderId)
    const subtotal = (items && items.totalSub) ? Number(items.totalSub) : 0
    const order = db.prepare("SELECT discount FROM orders WHERE id = ?").get(orderId)
    const discount = order ? Number(order.discount) : 0
    const total = Math.max(0, subtotal - discount)
    db.prepare("UPDATE orders SET subtotal = ?, total = ? WHERE id = ?").run(subtotal, total, orderId)
  },

  async setOrderDiscount(orderId, discount) {
    const db = getDatabase()
    const order = db.prepare("SELECT subtotal FROM orders WHERE id = ?").get(orderId)
    if (!order) return
    const subtotal = Number(order.subtotal)
    const total = Math.max(0, subtotal - discount)
    db.prepare("UPDATE orders SET discount = ?, total = ? WHERE id = ?").run(discount, total, orderId)
  },

  async payOrder(orderId, methodOrPayments, amount, cashierId) {
    const db = getDatabase()
    return runInTransaction(db, () => {
      const order = db.prepare("SELECT id, table_id, status, total FROM orders WHERE id = ?").get(orderId)
      if (!order) {
        throw new Error('Không tìm thấy đơn hàng để thanh toán')
      }
      if (order.status === 'PAID') {
        return { success: true, alreadyPaid: true }
      }
      if (order.status === 'CANCELLED') {
        throw new Error('Đơn hàng đã bị hủy, không thể thanh toán')
      }

      const { id: safeCashierId } = resolveValidProfileId(db, cashierId)
      const insertPay = db.prepare(`
        INSERT INTO payments (id, order_id, method, amount, paid_at, cashier_id)
        VALUES (?, ?, ?, ?, datetime('now', 'localtime'), ?)
      `)

      if (Array.isArray(methodOrPayments)) {
        const validPays = methodOrPayments.filter((p) => Number(p.amount) > 0)
        if (validPays.length === 0) {
          throw new Error('Vui lòng nhập số tiền thanh toán hợp lệ')
        }
        for (const p of validPays) {
          insertPay.run('pay-' + crypto.randomUUID(), orderId, p.method, Number(p.amount), safeCashierId)
        }
      } else {
        const payAmount = Number.isFinite(Number(amount)) ? Number(amount) : Number(order.total)
        insertPay.run('pay-' + crypto.randomUUID(), orderId, methodOrPayments, payAmount, safeCashierId)
      }

      db.prepare("UPDATE orders SET status = 'PAID', paid_at = datetime('now', 'localtime') WHERE id = ?").run(orderId)

      if (order.table_id) {
        db.prepare("UPDATE tables SET status = 'AVAILABLE' WHERE id = ?").run(order.table_id)
      }

      recordOrderMaterialConsumption(db, orderId, safeCashierId)
      return { success: true }
    })
  },

  async splitAndPayOrder(orderId, selectedItems, payments, cashierId, discountAmount = 0) {
    const db = getDatabase()
    return runInTransaction(db, () => {
      const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId)
      if (!order) throw new Error('Không tìm thấy đơn hàng để tách bill')
      if (order.status !== 'OPEN') throw new Error('Chỉ có thể tách bill với đơn hàng đang mở')

      const currentItems = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(orderId)
      if (currentItems.length === 0) throw new Error('Đơn hàng hiện tại không có món nào')

      const itemMap = new Map(currentItems.map((it) => [it.id, it]))
      const normalizedSelections = (selectedItems || [])
        .map((sel) => ({
          order_item_id: sel.order_item_id,
          quantity: Math.floor(Number(sel.quantity) || 0),
        }))
        .filter((sel) => sel.quantity > 0)

      if (normalizedSelections.length === 0) {
        throw new Error('Vui lòng chọn ít nhất 1 món để thanh toán')
      }

      // Kiểm tra xem có chọn hết 100% đơn không
      let selectedTotalQty = 0
      let currentTotalQty = currentItems.reduce((s, it) => s + Number(it.quantity), 0)
      for (const sel of normalizedSelections) {
        const existing = itemMap.get(sel.order_item_id)
        if (!existing) throw new Error('Món được chọn không còn tồn tại trong đơn')
        if (sel.quantity > Number(existing.quantity)) {
          throw new Error(`Số lượng tách của "${existing.product_name}" vượt quá số lượng trên bàn`)
        }
        selectedTotalQty += sel.quantity
      }

      const validPays = (payments || []).filter((p) => Number(p.amount) > 0)
      if (validPays.length === 0) {
        throw new Error('Vui lòng nhập phương thức và số tiền thanh toán')
      }

      const { id: safeCashierId } = resolveValidProfileId(db, cashierId)
      const insertPay = db.prepare(`
        INSERT INTO payments (id, order_id, method, amount, paid_at, cashier_id)
        VALUES (?, ?, ?, ?, datetime('now', 'localtime'), ?)
      `)

      // Trường hợp trả hết toàn bộ các món còn lại -> thanh toán luôn đơn hiện tại
      if (selectedTotalQty === currentTotalQty) {
        const disc = Math.min(Number(order.subtotal), Math.max(0, Number(discountAmount) || 0))
        const finalTotal = Math.max(0, Number(order.subtotal) - disc)
        db.prepare("UPDATE orders SET discount = ?, total = ?, status = 'PAID', paid_at = datetime('now', 'localtime') WHERE id = ?").run(disc, finalTotal, orderId)
        for (const p of validPays) {
          insertPay.run('pay-' + crypto.randomUUID(), orderId, p.method, Number(p.amount), safeCashierId)
        }
        if (order.table_id) {
          db.prepare("UPDATE tables SET status = 'AVAILABLE' WHERE id = ?").run(order.table_id)
        }
        recordOrderMaterialConsumption(db, orderId, safeCashierId)
        return {
          fullPaid: true,
          paidOrderId: orderId,
          invoice_number: order.invoice_number,
          remainingCount: 0,
          paidOrder: {
            invoice_number: order.invoice_number,
            subtotal: Number(order.subtotal),
            discount: disc,
            total: finalTotal,
            items: currentItems.map((it) => ({
              product_name: it.product_name,
              quantity: Number(it.quantity),
              unit_price: Number(it.unit_price),
              subtotal: Number(it.subtotal),
              note: it.note || undefined,
            })),
          },
        }
      }

      // Trường hợp tách 1 phần -> tạo hóa đơn mới (PAID) cho phần được chọn, giữ phần còn lại ở đơn OPEN
      const maxRow = db.prepare(`
        SELECT COALESCE(MAX(CAST(SUBSTR(invoice_number, 3) AS INTEGER)), 0) as maxNum
        FROM orders
        WHERE date(created_at) = date('now', 'localtime')
          AND invoice_number LIKE 'HD%'
      `).get()
      const nextNum = (maxRow ? Number(maxRow.maxNum) : 0) + 1
      const newInvoiceNumber = `HD${String(nextNum).padStart(4, '0')}`
      const newOrderId = 'ord-' + crypto.randomUUID()

      let splitSubtotal = 0
      const splitOrderItems = []
      for (const sel of normalizedSelections) {
        const existing = itemMap.get(sel.order_item_id)
        const unitPrice = Number(existing.unit_price)
        const lineSub = unitPrice * sel.quantity
        splitSubtotal += lineSub
        splitOrderItems.push({
          id: 'oi-' + crypto.randomUUID(),
          product_id: existing.product_id,
          product_name: existing.product_name,
          unit_price: unitPrice,
          quantity: sel.quantity,
          subtotal: lineSub,
          note: existing.note || null,
        })
      }

      const splitDiscount = Math.min(splitSubtotal, Math.max(0, Number(discountAmount) || 0))
      const splitTotal = Math.max(0, splitSubtotal - splitDiscount)

      db.prepare(`
        INSERT INTO orders (id, table_id, cashier_id, invoice_number, status, subtotal, discount, total, created_at, paid_at)
        VALUES (?, ?, ?, ?, 'PAID', ?, ?, ?, ?, datetime('now', 'localtime'))
      `).run(newOrderId, order.table_id, safeCashierId, newInvoiceNumber, splitSubtotal, splitDiscount, splitTotal, order.created_at)

      const insertSplitItem = db.prepare(`
        INSERT INTO order_items (id, order_id, product_id, product_name, unit_price, quantity, subtotal, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      for (const sit of splitOrderItems) {
        insertSplitItem.run(sit.id, newOrderId, sit.product_id, sit.product_name, sit.unit_price, sit.quantity, sit.subtotal, sit.note)
      }

      for (const p of validPays) {
        insertPay.run('pay-' + crypto.randomUUID(), newOrderId, p.method, Number(p.amount), safeCashierId)
      }

      // Trừ số lượng ở đơn OPEN gốc
      for (const sel of normalizedSelections) {
        const existing = itemMap.get(sel.order_item_id)
        const remainQty = Number(existing.quantity) - sel.quantity
        if (remainQty <= 0) {
          db.prepare("DELETE FROM order_items WHERE id = ?").run(existing.id)
        } else {
          const remainSub = Number(existing.unit_price) * remainQty
          db.prepare("UPDATE order_items SET quantity = ?, subtotal = ? WHERE id = ?").run(remainQty, remainSub, existing.id)
        }
      }

      // Tính lại tổng đơn OPEN còn lại
      const remainSumRow = db.prepare("SELECT COALESCE(SUM(subtotal), 0) as s, COUNT(*) as c FROM order_items WHERE order_id = ?").get(orderId)
      const remainSubtotal = Number(remainSumRow.s)
      const remainDiscount = Math.min(remainSubtotal, Number(order.discount) || 0)
      const remainTotal = Math.max(0, remainSubtotal - remainDiscount)
      db.prepare("UPDATE orders SET subtotal = ?, discount = ?, total = ? WHERE id = ?").run(remainSubtotal, remainDiscount, remainTotal, orderId)

      // Ghi nhận tiêu hao nguyên liệu cho hóa đơn mới vừa thanh toán
      recordOrderMaterialConsumption(db, newOrderId, safeCashierId)

      return {
        fullPaid: false,
        paidOrderId: newOrderId,
        invoice_number: newInvoiceNumber,
        remainingCount: Number(remainSumRow.c),
        paidOrder: {
          invoice_number: newInvoiceNumber,
          subtotal: splitSubtotal,
          discount: splitDiscount,
          total: splitTotal,
          items: splitOrderItems.map((it) => ({
            product_name: it.product_name,
            quantity: it.quantity,
            unit_price: it.unit_price,
            subtotal: it.subtotal,
            note: it.note || undefined,
          })),
        },
      }
    })
  },

  async cancelOrder(orderId, userId, reason) {
    const db = getDatabase()
    return runInTransaction(db, () => {
      const order = db.prepare("SELECT table_id FROM orders WHERE id = ?").get(orderId)
      const { id: safeUserId } = resolveValidProfileId(db, userId)

      db.prepare(`
        UPDATE orders
        SET status = 'CANCELLED', cancelled_at = datetime('now', 'localtime'), cancelled_by = ?, cancel_reason = ?
        WHERE id = ?
      `).run(safeUserId, reason, orderId)

      if (order && order.table_id) {
        db.prepare("UPDATE tables SET status = 'AVAILABLE' WHERE id = ?").run(order.table_id)
      }

      reverseOrderMaterialConsumption(db, orderId, safeUserId, reason)

      const auditId = 'log-' + crypto.randomUUID()
      db.prepare(`
        INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
        VALUES (?, ?, 'CANCEL_ORDER', 'order', ?, ?)
      `).run(auditId, safeUserId, orderId, reason)

      return { success: true }
    })
  },

  async updateOrder(orderId, updates) {
    const db = getDatabase()
    const fields = []
    const values = []
    if (updates.discount !== undefined) { fields.push('discount = ?'); values.push(updates.discount); }
    if (updates.total !== undefined) { fields.push('total = ?'); values.push(updates.total); }
    if (updates.note !== undefined) { fields.push('note = ?'); values.push(updates.note); }
    
    if (fields.length > 0) {
      values.push(orderId)
      db.prepare(`UPDATE orders SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }

    if (updates.payment_method) {
      db.prepare(`UPDATE payments SET method = ? WHERE order_id = ?`).run(updates.payment_method, orderId)
    }

    return { success: true }
  },

  async deleteOrder(orderId, userId, reason) {
    const db = getDatabase()
    return runInTransaction(db, () => {
      const order = db.prepare("SELECT table_id FROM orders WHERE id = ?").get(orderId)
      const { id: safeUserId } = resolveValidProfileId(db, userId)

      reverseOrderMaterialConsumption(db, orderId, safeUserId, reason || 'Xóa vĩnh viễn')

      // Delete payments and items first due to potential foreign key constraints if any
      db.prepare("DELETE FROM payments WHERE order_id = ?").run(orderId)
      db.prepare("DELETE FROM order_items WHERE order_id = ?").run(orderId)
      db.prepare("DELETE FROM orders WHERE id = ?").run(orderId)

      if (order && order.table_id) {
        db.prepare("UPDATE tables SET status = 'AVAILABLE' WHERE id = ?").run(order.table_id)
      }

      const auditId = 'log-' + crypto.randomUUID()
      db.prepare(`
        INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
        VALUES (?, ?, 'DELETE_ORDER', 'order', ?, ?)
      `).run(auditId, safeUserId, orderId, reason || 'Xóa vĩnh viễn')

      return { success: true }
    })
  },


  async getOrders(filters = {}) {
    const db = getDatabase()
    let whereClauses = []
    let params = []

    if (filters.status) {
      whereClauses.push("o.status = ?")
      params.push(filters.status)
    }
    if (filters.from) {
      whereClauses.push("o.created_at >= ?")
      params.push(toLocalSqlDatetime(filters.from, false))
    }
    if (filters.to) {
      whereClauses.push("o.created_at <= ?")
      params.push(toLocalSqlDatetime(filters.to, true))
    }
    if (filters.search) {
      whereClauses.push("o.invoice_number LIKE ?")
      params.push(`%${filters.search}%`)
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''
    const sql = `
      SELECT o.*,
             t.name as tbl_name, t.status as tbl_status,
             p.name as cashier_name, p.role as cashier_role
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      LEFT JOIN profiles p ON o.cashier_id = p.id
      ${whereSql}
      ORDER BY o.created_at DESC
    `
    const orders = db.prepare(sql).all(...params)

    // Lấy items và payments cho mỗi đơn (tránh nhân bản dòng khi 1 đơn có 2 phương thức thanh toán)
    const getItems = db.prepare("SELECT * FROM order_items WHERE order_id = ?")
    const getPays = db.prepare("SELECT * FROM payments WHERE order_id = ?")
    return orders.map(o => {
      const items = getItems.all(o.id)
      const pays = getPays.all(o.id).map(py => ({ ...py, amount: Number(py.amount) }))
      const totalPaid = pays.reduce((s, py) => s + py.amount, 0)
      const uniqueMethods = Array.from(new Set(pays.map(py => py.method)))
      const primaryMethod = uniqueMethods.length > 1 ? 'MIXED' : (pays[0]?.method || undefined)
      return {
        ...o,
        subtotal: Number(o.subtotal),
        discount: Number(o.discount),
        total: Number(o.total),
        table: o.table_id ? { id: o.table_id, name: o.tbl_name, status: o.tbl_status } : undefined,
        cashier: o.cashier_id ? { id: o.cashier_id, name: o.cashier_name, role: o.cashier_role } : undefined,
        payment: pays.length > 0 ? { method: primaryMethod, amount: totalPaid, paid_at: pays[0].paid_at } : undefined,
        payments: pays,
        items: items.map(i => ({ ...i, unit_price: Number(i.unit_price), subtotal: Number(i.subtotal) }))
      }
    })
  },

  async getOrderById(id) {
    const db = getDatabase()
    const o = db.prepare(`
      SELECT o.*,
             t.name as tbl_name, t.status as tbl_status,
             p.name as cashier_name, p.role as cashier_role
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      LEFT JOIN profiles p ON o.cashier_id = p.id
      WHERE o.id = ?
    `).get(id)

    if (!o) return null
    const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(id)
    const pays = db.prepare("SELECT * FROM payments WHERE order_id = ?").all(id).map(py => ({ ...py, amount: Number(py.amount) }))
    const totalPaid = pays.reduce((s, py) => s + py.amount, 0)
    const uniqueMethods = Array.from(new Set(pays.map(py => py.method)))
    const primaryMethod = uniqueMethods.length > 1 ? 'MIXED' : (pays[0]?.method || undefined)
    return {
      ...o,
      subtotal: Number(o.subtotal),
      discount: Number(o.discount),
      total: Number(o.total),
      table: o.table_id ? { id: o.table_id, name: o.tbl_name, status: o.tbl_status } : undefined,
      cashier: o.cashier_id ? { id: o.cashier_id, name: o.cashier_name, role: o.cashier_role } : undefined,
      payment: pays.length > 0 ? { method: primaryMethod, amount: totalPaid, paid_at: pays[0].paid_at } : undefined,
      payments: pays,
      items: items.map(i => ({ ...i, unit_price: Number(i.unit_price), subtotal: Number(i.subtotal) }))
    }
  },

  // Overview & Báo cáo
  async getOverviewData(range) {
    const db = getDatabase()
    const from = toLocalSqlDatetime(range.currentFrom, false) || '1970-01-01 00:00:00'
    const to = toLocalSqlDatetime(range.currentTo, true) || '2999-12-31 23:59:59'

    // Đơn hàng hoàn thành
    const paidOrders = db.prepare(`
      SELECT o.id, o.invoice_number, o.subtotal, o.discount, o.total, o.paid_at, o.cashier_id,
             t.name as table_name, p.name as cashier_name
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      LEFT JOIN profiles p ON o.cashier_id = p.id
      WHERE o.status = 'PAID' AND o.paid_at >= ? AND o.paid_at <= ?
    `).all(from, to)

    // Đơn hàng hủy
    const cancelledOrders = db.prepare(`
      SELECT o.id, o.invoice_number, o.total, o.cancelled_at, o.cancel_reason,
             t.name as table_name, p.name as cancelled_by_name
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      LEFT JOIN profiles p ON o.cancelled_by = p.id
      WHERE o.status = 'CANCELLED' AND o.created_at >= ? AND o.created_at <= ?
      ORDER BY o.cancelled_at DESC
    `).all(from, to)

    // Doanh thu phương thức thanh toán
    const payments = db.prepare(`
      SELECT pay.method, sum(pay.amount) as amount, count(*) as order_count
      FROM payments pay
      INNER JOIN orders o ON pay.order_id = o.id
      WHERE o.status = 'PAID' AND o.paid_at >= ? AND o.paid_at <= ?
      GROUP BY pay.method
    `).all(from, to)

    let cashAmount = 0
    let cashOrders = 0
    let bankAmount = 0
    let bankOrders = 0

    for (const p of payments) {
      if (p.method === 'CASH') {
        cashAmount = Number(p.amount)
        cashOrders = Number(p.order_count)
      } else if (p.method === 'BANK_TRANSFER') {
        bankAmount = Number(p.amount)
        bankOrders = Number(p.order_count)
      }
    }

    const netRevenue = paidOrders.reduce((sum, o) => sum + Number(o.total), 0)
    const grossRevenue = paidOrders.reduce((sum, o) => sum + Number(o.subtotal), 0)
    const discountTotal = paidOrders.reduce((sum, o) => sum + Number(o.discount), 0)
    const totalOrders = paidOrders.length
    const avgOrderValue = totalOrders > 0 ? Math.round(netRevenue / totalOrders) : 0

    // Theo giờ (0 - 23)
    const hourlyMap = {}
    for (let h = 0; h < 24; h++) {
      hourlyMap[h] = { hour: h, label: `${h}h`, revenue: 0, order_count: 0 }
    }
    for (const o of paidOrders) {
      if (o.paid_at) {
        const hour = new Date(o.paid_at).getHours()
        if (hourlyMap[hour]) {
          hourlyMap[hour].revenue += Number(o.total)
          hourlyMap[hour].order_count += 1
        }
      }
    }

    // Top sản phẩm
    const prodStats = db.prepare(`
      SELECT COALESCE(p.name, oi.product_name) as product_name, sum(oi.quantity) as current_qty, sum(oi.subtotal) as current_revenue
      FROM order_items oi
      INNER JOIN orders o ON oi.order_id = o.id
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE o.status = 'PAID' AND o.paid_at >= ? AND o.paid_at <= ?
      GROUP BY COALESCE(p.name, oi.product_name)
      ORDER BY current_revenue DESC
    `).all(from, to)

    const products = prodStats.map(p => ({
      product_name: p.product_name,
      current_qty: Number(p.current_qty),
      current_revenue: Number(p.current_revenue),
      prev_qty: 0,
      prev_revenue: 0,
      diff_qty: Number(p.current_qty),
      pct_change: 100,
      trend: 'up'
    }))

    // Doanh thu theo thu ngân
    const cashierMap = {}
    for (const o of paidOrders) {
      const cid = o.cashier_id || 'unknown'
      const cname = o.cashier_name || 'Thu ngân'
      if (!cashierMap[cid]) {
        cashierMap[cid] = { cashier_id: cid, cashier_name: cname, total_orders: 0, total_revenue: 0, avg_order_value: 0 }
      }
      cashierMap[cid].total_orders += 1
      cashierMap[cid].total_revenue += Number(o.total)
    }
    const cashiers = Object.values(cashierMap).map(c => ({
      ...c,
      avg_order_value: c.total_orders > 0 ? Math.round(c.total_revenue / c.total_orders) : 0
    }))

    // Doanh thu theo danh mục
    const catStats = db.prepare(`
      SELECT c.name as category_name, sum(oi.quantity) as total_quantity, sum(oi.subtotal) as total_revenue
      FROM order_items oi
      INNER JOIN orders o ON oi.order_id = o.id
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE o.status = 'PAID' AND o.paid_at >= ? AND o.paid_at <= ?
      GROUP BY c.name
      ORDER BY total_revenue DESC
    `).all(from, to)

    const categories = catStats.map(c => ({
      category_name: c.category_name || 'Khác',
      total_quantity: Number(c.total_quantity),
      total_revenue: Number(c.total_revenue),
      percentage: netRevenue > 0 ? Math.round((Number(c.total_revenue) / netRevenue) * 100) : 0
    }))

    return {
      summary: {
        net_revenue: netRevenue,
        gross_revenue: grossRevenue,
        discount_total: discountTotal,
        total_orders: totalOrders,
        avg_order_value: avgOrderValue,
        prev_net_revenue: 0,
        prev_orders: 0,
        revenue_growth_pct: 0,
        orders_growth_pct: 0,
        peak_hour: null,
        peak_hour_revenue: 0
      },
      hourly: Object.values(hourlyMap),
      products,
      payments: {
        cash_amount: cashAmount,
        cash_orders: cashOrders,
        bank_amount: bankAmount,
        bank_orders: bankOrders
      },
      cancelled: cancelledOrders.map(co => ({
        id: co.id,
        invoice_number: co.invoice_number,
        table_name: co.table_name || 'Mang về',
        cancelled_by_name: co.cancelled_by_name || 'Quản trị viên',
        total: Number(co.total),
        cancel_reason: co.cancel_reason || 'Không ghi lý do',
        cancelled_at: co.cancelled_at || ''
      })),
      cashiers,
      categories,
      currentRange: { from, to, label: range.label || 'Tùy chọn' }
    }
  },

  // Settings & Backup
  getSettings() {
    const db = getDatabase()
    const rows = db.prepare("SELECT * FROM settings").all()
    const res = {}
    for (const r of rows) {
      res[r.key] = r.value
    }
    return res
  },

  saveSetting(key, value) {
    const db = getDatabase()
    db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, datetime('now', 'localtime'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, String(value))
    return { success: true }
  },

  createBackup() {
    const backupDir = path.join(path.dirname(dbFilePath), 'backups')
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const backupName = `backup-fuha-${dateStr}.db`
    const backupDest = path.join(backupDir, backupName)

    try {
      if (dbInstance) dbInstance.exec('PRAGMA wal_checkpoint(TRUNCATE);')
    } catch (_) { }

    fs.copyFileSync(dbFilePath, backupDest)

    // Giữ tối đa 30 bản backup
    const files = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.db'))
      .map(f => ({ name: f, time: fs.statSync(path.join(backupDir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time)

    if (files.length > 30) {
      for (const old of files.slice(30)) {
        try { fs.unlinkSync(path.join(backupDir, old.name)) } catch (_) { }
      }
    }

    return { filename: backupName, path: backupDest, createdAt: new Date().toISOString() }
  },

  listBackups() {
    const backupDir = path.join(path.dirname(dbFilePath), 'backups')
    if (!fs.existsSync(backupDir)) return []
    return fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.db'))
      .map(f => {
        const fullPath = path.join(backupDir, f)
        const stats = fs.statSync(fullPath)
        return {
          filename: f,
          size: stats.size,
          createdAt: stats.birthtime.toISOString()
        }
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  },

  restoreBackup(filename) {
    const backupDir = path.join(path.dirname(dbFilePath), 'backups')
    const source = path.join(backupDir, filename)
    if (!fs.existsSync(source)) {
      throw new Error('File backup không tồn tại')
    }
    // Sao lưu bản hiện tại trước khi khôi phục
    this.createBackup()
    // Khôi phục
    if (dbInstance) {
      dbInstance.close()
      dbInstance = null
    }
    fs.copyFileSync(source, dbFilePath)
    initDatabase(dbFilePath)
    return { success: true }
  },

  getDataInfo() {
    const dir = path.dirname(dbFilePath)
    const backupDir = path.join(dir, 'backups')
    let size = 0
    try {
      if (fs.existsSync(dbFilePath)) {
        size = fs.statSync(dbFilePath).size
      }
    } catch (_) { }

    return {
      dbPath: dbFilePath,
      dataDir: dir,
      backupDir,
      size,
    }
  },

  openDataFolder() {
    const dir = path.dirname(dbFilePath)
    if (process.platform === 'win32') {
      exec(`explorer.exe "${dir}"`)
    } else if (process.platform === 'darwin') {
      exec(`open "${dir}"`)
    } else {
      exec(`xdg-open "${dir}"`)
    }
    return { success: true }
  },

  cleanTestData() {
    const db = getDatabase()
    // Tự động sao lưu một bản trước khi xóa
    this.createBackup()
    db.exec(`
      DELETE FROM stock_movements WHERE reference_type = 'order';
      DELETE FROM order_material_usages;
      DELETE FROM order_items;
      DELETE FROM payments;
      DELETE FROM audit_logs;
      DELETE FROM orders;
      UPDATE tables SET status = 'AVAILABLE';
    `)
    return { success: true }
  },

  ...createMaterialDbMethods(getDatabase)
}
