import crypto from 'node:crypto'

/**
 * Làm tròn số lượng tối đa 4 chữ số thập phân để tránh sai số dấu phẩy động
 */
export function roundQty(val) {
  const n = Number(val) || 0
  return Math.round((n + Number.EPSILON) * 10000) / 10000
}

/**
 * Kiểm tra userId có tồn tại trong bảng profiles hay không để tránh lỗi FOREIGN KEY
 * khi phiên đăng nhập cũ còn lưu trong localStorage từ DB khác.
 */
export function resolveValidProfileId(db, userId) {
  if (!userId) return { id: null, name: null }
  const row = db.prepare("SELECT id, name FROM profiles WHERE id = ?").get(userId)
  if (!row) return { id: null, name: null }
  return { id: row.id, name: row.name || null }
}

/**
 * Escape ký tự đặc biệt cho RegExp
 */
function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Chuẩn hóa chuỗi tiếng Việt không dấu để đối chiếu tên món lịch sử / biến thể
 */
function normalizeTextForBom(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/bac\s*siu/g, 'bac xiu')
    .trim()
}

/**
 * Tách tên món gốc và dấu hiệu Size L từ dữ liệu lịch sử cũ (VD: "Cà phê nâu (L)")
 */
function extractLegacyProductInfo(rawName) {
  const raw = String(rawName || '').trim()
  const hasLegacySizeL = /\(\s*L\s*\)|[-–—]\s*size\s+l\b|\bsize\s+l\b|\bsize\s+lớn\b|\bsize\s+lon\b/i.test(raw)
  let cleaned = raw
    .replace(/\s*\([^)]*(\([^)]*\)[^)]*)*\)?\s*$/g, '')
    .replace(/\s*\(.*$/g, '')
    .replace(/\s*[-–—]?\s*(size\s+[a-z0-9]+|size\s+lớn|size\s+vừa|size\s+nhỏ)/gi, '')
    .trim()
  if (!cleaned) cleaned = raw
  return {
    cleaned,
    normName: normalizeTextForBom(cleaned),
    legacySizeHint: hasLegacySizeL ? 'Size L' : '',
  }
}

/**
 * Thực thi các thao tác DB trong Savepoint (hỗ trợ lồng nhau an toàn với DatabaseSync)
 */
export function runInTransaction(db, fn) {
  const sp = 'sp_' + crypto.randomUUID().replace(/-/g, '')
  db.exec(`SAVEPOINT ${sp}`)
  try {
    const result = fn()
    db.exec(`RELEASE SAVEPOINT ${sp}`)
    return result
  } catch (err) {
    try { db.exec(`ROLLBACK TO SAVEPOINT ${sp}`) } catch (_) {}
    try { db.exec(`RELEASE SAVEPOINT ${sp}`) } catch (_) {}
    throw err
  }
}

/**
 * Chuẩn hóa chuỗi thời gian đầu vào sang định dạng SQLite localtime 'YYYY-MM-DD HH:MM:SS'
 */
export function toLocalSqlDatetime(val, isEnd = false) {
  if (!val) return null
  const s = String(val).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return `${s} ${isEnd ? '23:59:59' : '00:00:00'}`
  }
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    const norm = s.replace('T', ' ')
    return norm.length === 16 ? `${norm}:${isEnd ? '59' : '00'}` : norm
  }
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/**
 * Khởi tạo các bảng mới phục vụ module Nguyên vật liệu, Công thức đa tầng & Hao hụt.
 * Chỉ dùng CREATE TABLE IF NOT EXISTS — không chạm tới schema/dữ liệu cũ.
 */
export function setupMaterialTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS measurement_units (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS wastage_reasons (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#d97706',
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY,
      code TEXT,
      name TEXT NOT NULL,
      item_type TEXT NOT NULL CHECK(item_type IN ('RAW', 'SEMI_FINISHED')),
      unit TEXT NOT NULL,
      purchase_unit TEXT,
      conversion_factor REAL NOT NULL DEFAULT 1,
      yield_qty REAL NOT NULL DEFAULT 1,
      deduction_mode TEXT NOT NULL DEFAULT 'EXPLODE_ON_SALE' CHECK(deduction_mode IN ('EXPLODE_ON_SALE', 'BATCH_STOCK')),
      current_stock REAL NOT NULL DEFAULT 0,
      min_stock REAL NOT NULL DEFAULT 0,
      unit_cost REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS material_recipe_items (
      id TEXT PRIMARY KEY,
      parent_material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
      ingredient_material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
      quantity REAL NOT NULL,
      note TEXT,
      UNIQUE(parent_material_id, ingredient_material_id)
    );

    CREATE TABLE IF NOT EXISTS product_recipes (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
      quantity REAL NOT NULL,
      note TEXT,
      UNIQUE(product_id, material_id)
    );

    CREATE TABLE IF NOT EXISTS product_variant_recipes (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      variant_keyword TEXT NOT NULL,
      material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
      quantity REAL NOT NULL,
      note TEXT,
      UNIQUE(product_id, variant_keyword, material_id)
    );

    CREATE TABLE IF NOT EXISTS pos_modifier_rules (
      id TEXT PRIMARY KEY,
      keyword TEXT NOT NULL,
      material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
      delta_qty REAL NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS prep_batches (
      id TEXT PRIMARY KEY,
      material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
      material_name TEXT NOT NULL,
      unit TEXT NOT NULL,
      batch_multiplier REAL NOT NULL DEFAULT 1,
      expected_yield_qty REAL NOT NULL,
      actual_yield_qty REAL NOT NULL,
      loss_qty REAL NOT NULL DEFAULT 0,
      total_cost REAL NOT NULL DEFAULT 0,
      inputs_json TEXT,
      created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      created_by_name TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
      material_name TEXT NOT NULL,
      unit TEXT NOT NULL,
      movement_type TEXT NOT NULL CHECK(movement_type IN (
        'IMPORT',
        'SALE_DEDUCTION',
        'SALE_REVERSAL',
        'PREP_CONSUME',
        'PREP_OUTPUT',
        'WASTAGE',
        'STOCKTAKE_ADJUST'
      )),
      qty_change REAL NOT NULL,
      balance_after REAL,
      unit_cost REAL NOT NULL DEFAULT 0,
      total_cost REAL NOT NULL DEFAULT 0,
      reference_type TEXT,
      reference_id TEXT,
      detail_json TEXT,
      created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      created_by_name TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS order_material_usages (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      order_item_id TEXT,
      product_id TEXT,
      product_name TEXT NOT NULL,
      item_quantity INTEGER NOT NULL,
      material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
      material_name TEXT NOT NULL,
      material_type TEXT NOT NULL CHECK(material_type IN ('RAW', 'SEMI_FINISHED')),
      unit TEXT NOT NULL,
      direct_qty REAL NOT NULL DEFAULT 0,
      intermediate_qty REAL NOT NULL DEFAULT 0,
      exploded_raw_qty REAL NOT NULL DEFAULT 0,
      step_level INTEGER NOT NULL DEFAULT 1,
      cost_amount REAL NOT NULL DEFAULT 0,
      source_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS wastage_logs (
      id TEXT PRIMARY KEY,
      material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
      material_name TEXT NOT NULL,
      unit TEXT NOT NULL,
      quantity REAL NOT NULL,
      reason_id TEXT REFERENCES wastage_reasons(id) ON DELETE SET NULL,
      reason_name TEXT NOT NULL,
      cost_amount REAL NOT NULL DEFAULT 0,
      note TEXT,
      created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      created_by_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS stocktakes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK(status IN ('DRAFT', 'COMPLETED')),
      total_variance_cost REAL NOT NULL DEFAULT 0,
      note TEXT,
      created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      created_by_name TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS stocktake_items (
      id TEXT PRIMARY KEY,
      stocktake_id TEXT NOT NULL REFERENCES stocktakes(id) ON DELETE CASCADE,
      material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
      material_name TEXT NOT NULL,
      unit TEXT NOT NULL,
      system_stock REAL NOT NULL DEFAULT 0,
      actual_stock REAL NOT NULL DEFAULT 0,
      variance_qty REAL NOT NULL DEFAULT 0,
      unit_cost REAL NOT NULL DEFAULT 0,
      variance_cost REAL NOT NULL DEFAULT 0,
      note TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_materials_type ON materials(item_type);
    CREATE INDEX IF NOT EXISTS idx_mat_recipe_parent ON material_recipe_items(parent_material_id);
    CREATE INDEX IF NOT EXISTS idx_prod_recipe_prod ON product_recipes(product_id);
    CREATE INDEX IF NOT EXISTS idx_prod_var_recipe_prod ON product_variant_recipes(product_id);
    CREATE INDEX IF NOT EXISTS idx_stock_mov_mat ON stock_movements(material_id);
    CREATE INDEX IF NOT EXISTS idx_stock_mov_ref ON stock_movements(reference_type, reference_id);
    CREATE INDEX IF NOT EXISTS idx_stock_mov_date ON stock_movements(created_at);
    CREATE INDEX IF NOT EXISTS idx_order_mat_usage_order ON order_material_usages(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_mat_usage_date ON order_material_usages(created_at);
    CREATE INDEX IF NOT EXISTS idx_prep_batches_date ON prep_batches(created_at);
    CREATE INDEX IF NOT EXISTS idx_wastage_logs_date ON wastage_logs(created_at);
  `)
}

/**
 * Seed các danh mục khởi tạo mặc định (đơn vị tính, lý do hao hụt) đúng 1 lần duy nhất.
 * Quản lý hoàn toàn có quyền thêm/sửa/xóa sau đó mà không bị ghi đè lại.
 */
export function seedMaterialDefaults(db) {
  try {
    const seeded = db.prepare("SELECT value FROM settings WHERE key = 'materials_defaults_seeded_v1'").get()
    if (seeded) return

    const defaultUnits = ['ml', 'lít', 'g', 'kg', 'lon', 'hộp', 'túi', 'cái', 'viên', 'mẻ']
    const insertUnit = db.prepare("INSERT OR IGNORE INTO measurement_units (id, name, sort_order, active) VALUES (?, ?, ?, 1)")
    defaultUnits.forEach((name, idx) => {
      insertUnit.run(`unit-${idx + 1}`, name, idx + 1)
    })

    const defaultReasons = [
      { id: 'reason-1', name: 'Pha hỏng / Nhầm công thức', color: '#dc2626', sort: 1 },
      { id: 'reason-2', name: 'Đổ vỡ / Rơi vãi', color: '#ea580c', sort: 2 },
      { id: 'reason-3', name: 'Hao hụt ủ / Sơ chế', color: '#d97706', sort: 3 },
      { id: 'reason-4', name: 'Đổ bỏ cuối ngày (Quá hạn dùng)', color: '#7c3aed', sort: 4 },
      { id: 'reason-5', name: 'Hết hạn sử dụng', color: '#b91c1c', sort: 5 },
      { id: 'reason-6', name: 'Thử vị / Mời khách', color: '#2563eb', sort: 6 },
    ]
    const insertReason = db.prepare("INSERT OR IGNORE INTO wastage_reasons (id, name, color, sort_order, active) VALUES (?, ?, ?, ?, 1)")
    for (const r of defaultReasons) {
      insertReason.run(r.id, r.name, r.color, r.sort)
    }

    db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('materials_defaults_seeded_v1', '1')").run()
  } catch (err) {
    console.error('[FuHa Cafe POS] Seed material defaults warning:', err)
  }
}

/**
 * Kiểm tra công thức bán thành phẩm có tạo thành vòng lặp (A -> B -> A) không
 */
function wouldCreateCycle(db, parentId, ingredientIds) {
  if (ingredientIds.includes(parentId)) {
    return true
  }
  const allEdges = db.prepare("SELECT parent_material_id, ingredient_material_id FROM material_recipe_items").all()
  const graph = new Map()
  for (const e of allEdges) {
    if (!graph.has(e.parent_material_id)) graph.set(e.parent_material_id, [])
    graph.get(e.parent_material_id).push(e.ingredient_material_id)
  }
  // Giả lập gán edge mới từ parentId -> ingredientIds
  const queue = [...ingredientIds]
  const visited = new Set()
  while (queue.length > 0) {
    const cur = queue.shift()
    if (cur === parentId) return true
    if (visited.has(cur)) continue
    visited.add(cur)
    const next = graph.get(cur) || []
    for (const n of next) {
      if (!visited.has(n)) queue.push(n)
    }
  }
  return false
}

/**
 * Nạp dữ liệu cấu hình công thức vào bộ nhớ để tính BOM nhanh và nhất quán
 */
function loadBomContext(db) {
  const materials = db.prepare("SELECT * FROM materials").all()
  const materialsById = new Map()
  for (const m of materials) {
    materialsById.set(m.id, {
      ...m,
      conversion_factor: Number(m.conversion_factor) || 1,
      yield_qty: Number(m.yield_qty) > 0 ? Number(m.yield_qty) : 1,
      current_stock: Number(m.current_stock) || 0,
      min_stock: Number(m.min_stock) || 0,
      unit_cost: Number(m.unit_cost) || 0,
      active: Boolean(m.active),
    })
  }

  const matRecipes = db.prepare("SELECT * FROM material_recipe_items").all()
  const matRecipeMap = new Map()
  for (const r of matRecipes) {
    if (!matRecipeMap.has(r.parent_material_id)) matRecipeMap.set(r.parent_material_id, [])
    matRecipeMap.get(r.parent_material_id).push({
      ...r,
      quantity: Number(r.quantity) || 0,
    })
  }

  const prodRecipes = db.prepare("SELECT * FROM product_recipes").all()
  const prodRecipeMap = new Map()
  for (const r of prodRecipes) {
    if (!prodRecipeMap.has(r.product_id)) prodRecipeMap.set(r.product_id, [])
    prodRecipeMap.get(r.product_id).push({
      ...r,
      quantity: Number(r.quantity) || 0,
    })
  }

  const prodVariants = db.prepare("SELECT * FROM product_variant_recipes").all()
  const prodVariantMap = new Map()
  for (const r of prodVariants) {
    if (!prodVariantMap.has(r.product_id)) prodVariantMap.set(r.product_id, new Map())
    const vMap = prodVariantMap.get(r.product_id)
    if (!vMap.has(r.variant_keyword)) vMap.set(r.variant_keyword, [])
    vMap.get(r.variant_keyword).push({
      ...r,
      quantity: Number(r.quantity) || 0,
    })
  }

  const allProducts = db.prepare("SELECT id, name, active FROM products").all()
  const productsById = new Map()
  const productsWithNorm = allProducts.map((p) => {
    const hasRecipe = prodRecipeMap.has(p.id) || prodVariantMap.has(p.id)
    const info = {
      id: p.id,
      name: p.name,
      active: Boolean(p.active),
      normName: normalizeTextForBom(p.name),
      hasRecipe,
    }
    productsById.set(p.id, info)
    return info
  })
  // Ưu tiên món có công thức và đang active khi đối chiếu đơn lịch sử theo tên
  productsWithNorm.sort((a, b) => Number(b.hasRecipe) - Number(a.hasRecipe) || Number(b.active) - Number(a.active))

  // Các sản phẩm Topping (có danh mục chứa chữ 'topping') và có định mức
  const toppingProducts = db.prepare(`
    SELECT p.id, p.name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE LOWER(COALESCE(c.name, '')) LIKE '%topping%'
  `).all().filter((t) => prodRecipeMap.has(t.id))

  const modifierRules = db.prepare("SELECT * FROM pos_modifier_rules WHERE active = 1").all().map((r) => ({
    ...r,
    delta_qty: Number(r.delta_qty) || 0,
  }))

  return {
    materialsById,
    matRecipeMap,
    prodRecipeMap,
    prodVariantMap,
    productsById,
    productsWithNorm,
    toppingProducts,
    modifierRules,
  }
}

/**
 * Tính giá vốn quy đổi trên 1 đơn vị chuẩn của NVL / Bán thành phẩm
 */
export function computeMaterialEffectiveCost(materialId, ctx, visited = new Set()) {
  const mat = ctx.materialsById.get(materialId)
  if (!mat) return 0
  if (visited.has(materialId)) return mat.unit_cost
  if (mat.item_type === 'RAW') return mat.unit_cost

  const children = ctx.matRecipeMap.get(materialId) || []
  // Nếu theo dõi tồn theo mẻ và đã có giá vốn bình quân thì ưu tiên dùng unit_cost hiện tại
  if (mat.deduction_mode === 'BATCH_STOCK' && mat.unit_cost > 0) {
    return mat.unit_cost
  }
  if (children.length === 0) {
    return mat.unit_cost
  }

  const nextVisited = new Set(visited)
  nextVisited.add(materialId)
  let totalBatchCost = 0
  for (const child of children) {
    totalBatchCost += child.quantity * computeMaterialEffectiveCost(child.ingredient_material_id, ctx, nextVisited)
  }
  return totalBatchCost / (mat.yield_qty > 0 ? mat.yield_qty : 1)
}

/**
 * Phân rã công thức đa tầng cho danh sách món bán [{ product_id, product_name, quantity, note, id }]
 */
export function resolveOrderItemsBOM(db, orderItems) {
  const ctx = loadBomContext(db)
  const directSummaryMap = new Map()       // Tầng 1 trực tiếp trên món (VD: 80ml Sữa đặc, 200ml Cà phê chung)
  const intermediateSummaryMap = new Map() // Tất cả bán thành phẩm trung gian đi qua
  const rawLeafSummaryMap = new Map()      // Quy đổi cuối cùng về NVL gốc (VD: 80ml Sữa đặc, 75g Cafe 1, 50g Cafe 2)
  const stockDeductionMap = new Map()      // Kho cần trừ thực tế theo deduction_mode (tránh trừ trùng khi dùng BATCH_STOCK)
  const usageRows = []                     // Các dòng chi tiết lưu vào order_material_usages
  const itemBreakdowns = []                // Cấu trúc cây trực quan cho Simulator / Báo cáo chi tiết

  const addToMap = (map, mat, qty, cost = 0) => {
    const existing = map.get(mat.id) || {
      material_id: mat.id,
      material_name: mat.name,
      item_type: mat.item_type,
      unit: mat.unit,
      deduction_mode: mat.deduction_mode,
      quantity: 0,
      cost_amount: 0,
    }
    existing.quantity = roundQty(existing.quantity + qty)
    existing.cost_amount = Math.round(existing.cost_amount + cost)
    map.set(mat.id, existing)
  }

  const resolveProductForOrderItem = (item) => {
    const directId = item.product_id
    if (directId && (ctx.prodRecipeMap.has(directId) || ctx.prodVariantMap.has(directId))) {
      return directId
    }
    const rawName = item.product_name || (directId && ctx.productsById.get(directId)?.name) || ''
    const { normName } = extractLegacyProductInfo(rawName)
    if (normName) {
      let matched = ctx.productsWithNorm.find((p) => p.normName === normName)
      if (!matched) {
        matched = ctx.productsWithNorm.find((p) => p.normName && normName.startsWith(p.normName))
      }
      if (!matched && normName.length >= 6) {
        matched = ctx.productsWithNorm.find(
          (p) => p.normName.length >= 6 && (p.normName.includes(normName) || normName.includes(p.normName))
        )
      }
      if (matched) return matched.id
    }
    return directId || null
  }

  for (const item of orderItems) {
    const itemQty = Number(item.quantity) || 0
    if (itemQty <= 0) continue

    const directQtyByMat = new Map()
    const addDirectInput = (materialId, qty) => {
      if (!ctx.materialsById.has(materialId)) return
      const prev = directQtyByMat.get(materialId) || 0
      directQtyByMat.set(materialId, prev + qty)
    }

    const effectiveProductId = resolveProductForOrderItem(item)
    const { legacySizeHint } = extractLegacyProductInfo(item.product_name || '')
    const combinedNote = [item.note || '', legacySizeHint].filter(Boolean).join(' • ')
    const normCombinedNote = normalizeTextForBom(combinedNote)

    // 1. Kiểm tra công thức biến thể (VD: Size L) trước, nếu không khớp thì dùng công thức chuẩn
    let matchedVariantKeyword = null
    const variantMap = effectiveProductId ? ctx.prodVariantMap.get(effectiveProductId) : null
    if (variantMap && combinedNote) {
      const keywords = Array.from(variantMap.keys()).sort((a, b) => b.length - a.length)
      for (const kw of keywords) {
        const kwNorm = normalizeTextForBom(kw)
        if (!kwNorm) continue
        const re = new RegExp(`(?:^|[+,•\\s(\\[\\-])${escapeRegExp(kwNorm)}(?:\\s*\\)|\\s*,|\\s*•|\\s|$)`, 'i')
        if (re.test(normCombinedNote)) {
          matchedVariantKeyword = kw
          break
        }
      }
    }

    if (matchedVariantKeyword) {
      for (const r of variantMap.get(matchedVariantKeyword) || []) {
        addDirectInput(r.material_id, r.quantity * itemQty)
      }
    } else if (effectiveProductId && ctx.prodRecipeMap.has(effectiveProductId)) {
      for (const r of ctx.prodRecipeMap.get(effectiveProductId)) {
        addDirectInput(r.material_id, r.quantity * itemQty)
      }
    }

    // 2. Topping & Quy tắc ghi chú trên POS (nếu có note)
    const noteText = combinedNote.trim()
    if (noteText) {
      for (const top of ctx.toppingProducts) {
        if (top.id === effectiveProductId) continue
        if (matchedVariantKeyword && normalizeTextForBom(top.name) === normalizeTextForBom(matchedVariantKeyword)) continue
        const re = new RegExp(`(?:^|[+,•\\s])${escapeRegExp(top.name)}(?:\\s*\\(|\\s*,|\\s*•|$)`, 'i')
        if (re.test(noteText)) {
          for (const r of ctx.prodRecipeMap.get(top.id) || []) {
            addDirectInput(r.material_id, r.quantity * itemQty)
          }
        }
      }

      const lowerNote = noteText.toLowerCase()
      for (const rule of ctx.modifierRules) {
        if (rule.keyword && lowerNote.includes(rule.keyword.trim().toLowerCase())) {
          addDirectInput(rule.material_id, rule.delta_qty * itemQty)
        }
      }
    }

    const itemNodes = []

    const expandNode = (materialId, qty, pathParts, depth, visited, stockControlledByBatchParent) => {
      const mat = ctx.materialsById.get(materialId)
      if (!mat || qty <= 0) return null

      const children = mat.item_type === 'SEMI_FINISHED' ? (ctx.matRecipeMap.get(materialId) || []) : []
      const isLeaf = mat.item_type === 'RAW' || children.length === 0
      const unitCost = computeMaterialEffectiveCost(materialId, ctx)
      const currentPath = [...pathParts, `${mat.name} (${roundQty(qty)} ${mat.unit})`]

      if (depth === 1) {
        addToMap(directSummaryMap, mat, qty, isLeaf ? qty * unitCost : 0)
      }

      if (mat.item_type === 'SEMI_FINISHED') {
        addToMap(intermediateSummaryMap, mat, qty, 0)
      }

      // Tính nhánh trừ kho thực tế (không trừ con nếu cha là BATCH_STOCK vì đã trừ lúc tạo mẻ ủ)
      const isBatchHandledHere = !stockControlledByBatchParent && (isLeaf || mat.deduction_mode === 'BATCH_STOCK')
      if (isBatchHandledHere) {
        const stockUnitCost = mat.unit_cost > 0 ? mat.unit_cost : unitCost
        addToMap(stockDeductionMap, mat, qty, qty * stockUnitCost)
      }

      if (isLeaf) {
        const leafCost = qty * unitCost
        addToMap(rawLeafSummaryMap, mat, qty, leafCost)
        usageRows.push({
          order_item_id: item.id || null,
          product_id: item.product_id || null,
          product_name: item.product_name || 'Sản phẩm',
          item_quantity: itemQty,
          material_id: mat.id,
          material_name: mat.name,
          material_type: mat.item_type,
          unit: mat.unit,
          direct_qty: depth === 1 ? roundQty(qty) : 0,
          intermediate_qty: 0,
          exploded_raw_qty: roundQty(qty),
          step_level: depth,
          cost_amount: Math.round(leafCost),
          source_path: currentPath.join(' → '),
        })

        return {
          material_id: mat.id,
          material_name: mat.name,
          item_type: mat.item_type,
          unit: mat.unit,
          quantity: roundQty(qty),
          depth,
          cost_amount: Math.round(leafCost),
          children: [],
        }
      }

      // Bán thành phẩm có công thức con
      usageRows.push({
        order_item_id: item.id || null,
        product_id: item.product_id || null,
        product_name: item.product_name || 'Sản phẩm',
        item_quantity: itemQty,
        material_id: mat.id,
        material_name: mat.name,
        material_type: mat.item_type,
        unit: mat.unit,
        direct_qty: depth === 1 ? roundQty(qty) : 0,
        intermediate_qty: roundQty(qty),
        exploded_raw_qty: 0,
        step_level: depth,
        cost_amount: 0,
        source_path: currentPath.join(' → '),
      })

      const nextVisited = new Set(visited)
      nextVisited.add(materialId)
      const ratio = qty / (mat.yield_qty > 0 ? mat.yield_qty : 1)
      const childNodes = []
      const childStockControlled = stockControlledByBatchParent || mat.deduction_mode === 'BATCH_STOCK'

      for (const child of children) {
        if (nextVisited.has(child.ingredient_material_id)) continue
        const childQty = child.quantity * ratio
        const cNode = expandNode(
          child.ingredient_material_id,
          childQty,
          currentPath,
          depth + 1,
          nextVisited,
          childStockControlled
        )
        if (cNode) childNodes.push(cNode)
      }

      return {
        material_id: mat.id,
        material_name: mat.name,
        item_type: mat.item_type,
        unit: mat.unit,
        deduction_mode: mat.deduction_mode,
        yield_qty: mat.yield_qty,
        quantity: roundQty(qty),
        depth,
        cost_amount: Math.round(qty * unitCost),
        children: childNodes,
      }
    }

    for (const [materialId, rawQty] of directQtyByMat.entries()) {
      const clampedQty = roundQty(Math.max(0, rawQty))
      if (clampedQty <= 0) continue
      const node = expandNode(
        materialId,
        clampedQty,
        [`${item.product_name || 'Món'} × ${itemQty}`],
        1,
        new Set(),
        false
      )
      if (node) itemNodes.push(node)
    }

    itemBreakdowns.push({
      product_id: item.product_id || null,
      product_name: item.product_name || 'Sản phẩm',
      quantity: itemQty,
      note: item.note || '',
      tree: itemNodes,
    })
  }

  const directSummary = Array.from(directSummaryMap.values())
  const intermediateSummary = Array.from(intermediateSummaryMap.values())
  const rawLeafSummary = Array.from(rawLeafSummaryMap.values())
  const stockDeductions = Array.from(stockDeductionMap.values())
  const totalCost = rawLeafSummary.reduce((s, r) => s + r.cost_amount, 0)

  return {
    directSummary,
    intermediateSummary,
    rawLeafSummary,
    stockDeductions,
    usageRows,
    itemBreakdowns,
    totalCost,
  }
}

/**
 * Ghi nhận tiêu hao nguyên vật liệu khi đơn hàng chuyển sang PAID.
 * Tự động chống ghi trùng (idempotent theo order_id).
 */
export function recordOrderMaterialConsumption(db, orderId, cashierId) {
  const alreadyDeducted = db.prepare(`
    SELECT 1 FROM stock_movements
    WHERE reference_type = 'order' AND reference_id = ? AND movement_type = 'SALE_DEDUCTION'
    LIMIT 1
  `).get(orderId)
  if (alreadyDeducted) return { skipped: true }

  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(orderId)
  if (!items || items.length === 0) return { skipped: true }

  const orderRow = db.prepare("SELECT invoice_number FROM orders WHERE id = ?").get(orderId)
  const { id: safeCashierId, name: cashierName } = resolveValidProfileId(db, cashierId)

  const bom = resolveOrderItemsBOM(db, items)
  if (bom.usageRows.length === 0 && bom.stockDeductions.length === 0) {
    return { empty: true }
  }

  const insertUsage = db.prepare(`
    INSERT INTO order_material_usages (
      id, order_id, order_item_id, product_id, product_name, item_quantity,
      material_id, material_name, material_type, unit,
      direct_qty, intermediate_qty, exploded_raw_qty, step_level, cost_amount, source_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  for (const row of bom.usageRows) {
    insertUsage.run(
      'omu-' + crypto.randomUUID(),
      orderId,
      row.order_item_id,
      row.product_id,
      row.product_name,
      row.item_quantity,
      row.material_id,
      row.material_name,
      row.material_type,
      row.unit,
      row.direct_qty,
      row.intermediate_qty,
      row.exploded_raw_qty,
      row.step_level,
      row.cost_amount,
      row.source_path
    )
  }

  const getMat = db.prepare("SELECT current_stock, unit_cost FROM materials WHERE id = ?")
  const updateStock = db.prepare("UPDATE materials SET current_stock = ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
  const insertMov = db.prepare(`
    INSERT INTO stock_movements (
      id, material_id, material_name, unit, movement_type, qty_change,
      balance_after, unit_cost, total_cost, reference_type, reference_id,
      detail_json, created_by, created_by_name, note
    ) VALUES (?, ?, ?, ?, 'SALE_DEDUCTION', ?, ?, ?, ?, 'order', ?, ?, ?, ?, ?)
  `)

  for (const ded of bom.stockDeductions) {
    const mat = getMat.get(ded.material_id)
    if (!mat) continue
    const newStock = roundQty((Number(mat.current_stock) || 0) - ded.quantity)
    updateStock.run(newStock, ded.material_id)

    const uCost = ded.quantity > 0 ? roundQty(ded.cost_amount / ded.quantity) : (Number(mat.unit_cost) || 0)
    insertMov.run(
      'mov-' + crypto.randomUUID(),
      ded.material_id,
      ded.material_name,
      ded.unit,
      -roundQty(ded.quantity),
      newStock,
      uCost,
      ded.cost_amount,
      orderId,
      JSON.stringify({ invoice_number: orderRow?.invoice_number || '' }),
      safeCashierId,
      cashierName,
      `Xuất bán hóa đơn ${orderRow?.invoice_number || orderId}`
    )
  }

  return { success: true }
}

/**
 * Hoàn kho khi đơn hàng đã thanh toán bị hủy (cancelOrder) hoặc xóa (deleteOrder)
 */
export function reverseOrderMaterialConsumption(db, orderId, userId, reason) {
  const deductions = db.prepare(`
    SELECT * FROM stock_movements
    WHERE reference_type = 'order' AND reference_id = ? AND movement_type = 'SALE_DEDUCTION'
  `).all(orderId)

  if (!deductions || deductions.length === 0) return { skipped: true }

  const alreadyReversed = db.prepare(`
    SELECT 1 FROM stock_movements
    WHERE reference_type = 'order' AND reference_id = ? AND movement_type = 'SALE_REVERSAL'
    LIMIT 1
  `).get(orderId)
  if (alreadyReversed) return { skipped: true }

  const orderRow = db.prepare("SELECT invoice_number FROM orders WHERE id = ?").get(orderId)
  const { id: safeUserId, name: userName } = resolveValidProfileId(db, userId)

  const getMat = db.prepare("SELECT current_stock FROM materials WHERE id = ?")
  const updateStock = db.prepare("UPDATE materials SET current_stock = ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
  const insertMov = db.prepare(`
    INSERT INTO stock_movements (
      id, material_id, material_name, unit, movement_type, qty_change,
      balance_after, unit_cost, total_cost, reference_type, reference_id,
      detail_json, created_by, created_by_name, note
    ) VALUES (?, ?, ?, ?, 'SALE_REVERSAL', ?, ?, ?, ?, 'order', ?, ?, ?, ?, ?)
  `)

  for (const d of deductions) {
    const mat = getMat.get(d.material_id)
    if (!mat) continue
    const restoreQty = roundQty(Math.abs(Number(d.qty_change) || 0))
    const newStock = roundQty((Number(mat.current_stock) || 0) + restoreQty)
    updateStock.run(newStock, d.material_id)

    insertMov.run(
      'mov-' + crypto.randomUUID(),
      d.material_id,
      d.material_name,
      d.unit,
      restoreQty,
      newStock,
      Number(d.unit_cost) || 0,
      Number(d.total_cost) || 0,
      orderId,
      d.detail_json || null,
      safeUserId,
      userName,
      `Hoàn kho đơn ${orderRow?.invoice_number || orderId}${reason ? `: ${reason}` : ''}`
    )
  }

  // Xóa snapshot usage để báo cáo tiêu hao bán hàng không cộng nhầm đơn đã hủy
  db.prepare("DELETE FROM order_material_usages WHERE order_id = ?").run(orderId)
  return { success: true }
}

/**
 * Các phương thức API gộp vào dbService
 */
export function createMaterialDbMethods(getDatabase) {
  return {
    // ── Measurement Units ───────────────────────────────────────
    getUnits() {
      const db = getDatabase()
      return db.prepare("SELECT * FROM measurement_units WHERE active = 1 ORDER BY sort_order ASC, name ASC").all()
    },

    saveUnit(data) {
      const db = getDatabase()
      const name = String(data?.name || '').trim()
      if (!name) throw new Error('Tên đơn vị tính không được để trống')
      const dup = db.prepare("SELECT id FROM measurement_units WHERE LOWER(name) = LOWER(?) AND id != ?").get(name, data?.id || '')
      if (dup) throw new Error(`Đơn vị "${name}" đã tồn tại`)

      if (data?.id) {
        const old = db.prepare("SELECT name FROM measurement_units WHERE id = ?").get(data.id)
        db.prepare("UPDATE measurement_units SET name = ?, sort_order = ? WHERE id = ?").run(name, Number(data.sort_order) || 0, data.id)
        if (old && old.name !== name) {
          db.prepare("UPDATE materials SET unit = ? WHERE unit = ?").run(name, old.name)
          db.prepare("UPDATE materials SET purchase_unit = ? WHERE purchase_unit = ?").run(name, old.name)
        }
        return db.prepare("SELECT * FROM measurement_units WHERE id = ?").get(data.id)
      }

      const id = 'unit-' + crypto.randomUUID().substring(0, 8)
      const maxSort = db.prepare("SELECT COALESCE(MAX(sort_order), 0) as m FROM measurement_units").get()
      db.prepare("INSERT INTO measurement_units (id, name, sort_order, active) VALUES (?, ?, ?, 1)")
        .run(id, name, (maxSort?.m || 0) + 1)
      return db.prepare("SELECT * FROM measurement_units WHERE id = ?").get(id)
    },

    deleteUnit(id) {
      const db = getDatabase()
      const u = db.prepare("SELECT name FROM measurement_units WHERE id = ?").get(id)
      if (!u) return { success: true }
      const inUse = db.prepare("SELECT 1 FROM materials WHERE unit = ? OR purchase_unit = ? LIMIT 1").get(u.name, u.name)
      if (inUse) {
        throw new Error(`Đơn vị "${u.name}" đang được dùng cho nguyên vật liệu, không thể xóa.`)
      }
      db.prepare("DELETE FROM measurement_units WHERE id = ?").run(id)
      return { success: true }
    },

    // ── Wastage Reasons ─────────────────────────────────────────
    getWastageReasons() {
      const db = getDatabase()
      return db.prepare("SELECT * FROM wastage_reasons WHERE active = 1 ORDER BY sort_order ASC, name ASC").all()
    },

    saveWastageReason(data) {
      const db = getDatabase()
      const name = String(data?.name || '').trim()
      if (!name) throw new Error('Tên lý do hao hụt không được để trống')
      const dup = db.prepare("SELECT id FROM wastage_reasons WHERE LOWER(name) = LOWER(?) AND id != ?").get(name, data?.id || '')
      if (dup) throw new Error(`Lý do "${name}" đã tồn tại`)

      const color = data?.color || '#d97706'
      if (data?.id) {
        db.prepare("UPDATE wastage_reasons SET name = ?, color = ? WHERE id = ?").run(name, color, data.id)
        return db.prepare("SELECT * FROM wastage_reasons WHERE id = ?").get(data.id)
      }
      const id = 'reason-' + crypto.randomUUID().substring(0, 8)
      const maxSort = db.prepare("SELECT COALESCE(MAX(sort_order), 0) as m FROM wastage_reasons").get()
      db.prepare("INSERT INTO wastage_reasons (id, name, color, sort_order, active) VALUES (?, ?, ?, ?, 1)")
        .run(id, name, color, (maxSort?.m || 0) + 1)
      return db.prepare("SELECT * FROM wastage_reasons WHERE id = ?").get(id)
    },

    deleteWastageReason(id) {
      const db = getDatabase()
      db.prepare("UPDATE wastage_reasons SET active = 0 WHERE id = ?").run(id)
      return { success: true }
    },

    // ── POS Modifier Rules ──────────────────────────────────────
    getModifierRules() {
      const db = getDatabase()
      return db.prepare(`
        SELECT r.*, m.name as material_name, m.unit as material_unit
        FROM pos_modifier_rules r
        INNER JOIN materials m ON r.material_id = m.id
        ORDER BY r.created_at DESC
      `).all().map((r) => ({
        ...r,
        delta_qty: Number(r.delta_qty) || 0,
        active: Boolean(r.active),
      }))
    },

    saveModifierRule(data) {
      const db = getDatabase()
      const keyword = String(data?.keyword || '').trim()
      if (!keyword) throw new Error('Vui lòng nhập từ khóa tùy chọn POS')
      if (!data?.material_id) throw new Error('Vui lòng chọn nguyên vật liệu tác động')
      const deltaQty = Number(data?.delta_qty)
      if (!Number.isFinite(deltaQty) || deltaQty === 0) throw new Error('Lượng điều chỉnh phải khác 0')

      if (data?.id) {
        db.prepare(`
          UPDATE pos_modifier_rules SET keyword = ?, material_id = ?, delta_qty = ?, active = ?, note = ?
          WHERE id = ?
        `).run(keyword, data.material_id, deltaQty, data.active !== false ? 1 : 0, data.note || null, data.id)
      } else {
        const id = 'mod-' + crypto.randomUUID().substring(0, 8)
        db.prepare(`
          INSERT INTO pos_modifier_rules (id, keyword, material_id, delta_qty, active, note)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, keyword, data.material_id, deltaQty, data.active !== false ? 1 : 0, data.note || null)
      }
      return this.getModifierRules()
    },

    deleteModifierRule(id) {
      const db = getDatabase()
      db.prepare("DELETE FROM pos_modifier_rules WHERE id = ?").run(id)
      return { success: true }
    },

    // ── Materials & Semi-finished ───────────────────────────────
    getMaterials(includeInactive = true) {
      const db = getDatabase()
      const ctx = loadBomContext(db)
      const rows = db.prepare(`
        SELECT * FROM materials
        ${includeInactive ? '' : 'WHERE active = 1'}
        ORDER BY item_type DESC, name ASC
      `).all()

      return rows.map((m) => {
        const childCount = (ctx.matRecipeMap.get(m.id) || []).length
        const effectiveCost = roundQty(computeMaterialEffectiveCost(m.id, ctx))
        return {
          ...m,
          conversion_factor: Number(m.conversion_factor) || 1,
          yield_qty: Number(m.yield_qty) > 0 ? Number(m.yield_qty) : 1,
          current_stock: roundQty(m.current_stock),
          min_stock: roundQty(m.min_stock),
          unit_cost: Number(m.unit_cost) || 0,
          effective_unit_cost: effectiveCost,
          recipe_ingredients_count: childCount,
          active: Boolean(m.active),
        }
      })
    },

    createMaterial(data) {
      const db = getDatabase()
      const name = String(data?.name || '').trim()
      if (!name) throw new Error('Vui lòng nhập tên nguyên vật liệu')
      const itemType = data?.item_type === 'SEMI_FINISHED' ? 'SEMI_FINISHED' : 'RAW'
      const unit = String(data?.unit || '').trim()
      if (!unit) throw new Error('Vui lòng chọn đơn vị tính')

      // Đảm bảo đơn vị tồn tại trong measurement_units
      db.prepare("INSERT OR IGNORE INTO measurement_units (id, name, sort_order, active) VALUES (?, ?, 99, 1)")
        .run('unit-' + crypto.randomUUID().substring(0, 8), unit)
      if (data?.purchase_unit) {
        const pu = String(data.purchase_unit).trim()
        if (pu) {
          db.prepare("INSERT OR IGNORE INTO measurement_units (id, name, sort_order, active) VALUES (?, ?, 99, 1)")
            .run('unit-' + crypto.randomUUID().substring(0, 8), pu)
        }
      }

      const id = 'mat-' + crypto.randomUUID().substring(0, 8)
      const convFactor = Number(data?.conversion_factor) > 0 ? Number(data.conversion_factor) : 1
      const yieldQty = itemType === 'SEMI_FINISHED' && Number(data?.yield_qty) > 0 ? Number(data.yield_qty) : 1
      const deductionMode = data?.deduction_mode === 'BATCH_STOCK' ? 'BATCH_STOCK' : 'EXPLODE_ON_SALE'

      db.prepare(`
        INSERT INTO materials (
          id, code, name, item_type, unit, purchase_unit, conversion_factor,
          yield_qty, deduction_mode, current_stock, min_stock, unit_cost, active, note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        data?.code ? String(data.code).trim() : null,
        name,
        itemType,
        unit,
        data?.purchase_unit ? String(data.purchase_unit).trim() : unit,
        convFactor,
        yieldQty,
        deductionMode,
        roundQty(data?.current_stock || 0),
        roundQty(data?.min_stock || 0),
        Number(data?.unit_cost) || 0,
        data?.active !== false ? 1 : 0,
        data?.note || null
      )

      return this.getMaterials(true).find((m) => m.id === id)
    },

    updateMaterial(id, updates) {
      const db = getDatabase()
      const existing = db.prepare("SELECT * FROM materials WHERE id = ?").get(id)
      if (!existing) throw new Error('Không tìm thấy nguyên vật liệu')

      const fields = []
      const values = []
      if (updates.name !== undefined) {
        const n = String(updates.name).trim()
        if (!n) throw new Error('Tên nguyên vật liệu không được trống')
        fields.push('name = ?'); values.push(n)
      }
      if (updates.code !== undefined) { fields.push('code = ?'); values.push(updates.code ? String(updates.code).trim() : null) }
      if (updates.item_type !== undefined) {
        const nextType = updates.item_type === 'SEMI_FINISHED' ? 'SEMI_FINISHED' : 'RAW'
        if (nextType === 'RAW') {
          const hasSub = db.prepare("SELECT 1 FROM material_recipe_items WHERE parent_material_id = ? LIMIT 1").get(id)
          if (hasSub) throw new Error('Bán thành phẩm này đang có công thức con, hãy xóa công thức trước khi chuyển về Nguyên liệu gốc')
        }
        fields.push('item_type = ?'); values.push(nextType)
      }
      if (updates.unit !== undefined) {
        const u = String(updates.unit).trim()
        if (!u) throw new Error('Đơn vị tính không được trống')
        db.prepare("INSERT OR IGNORE INTO measurement_units (id, name, sort_order, active) VALUES (?, ?, 99, 1)")
          .run('unit-' + crypto.randomUUID().substring(0, 8), u)
        fields.push('unit = ?'); values.push(u)
      }
      if (updates.purchase_unit !== undefined) {
        const pu = updates.purchase_unit ? String(updates.purchase_unit).trim() : null
        if (pu) {
          db.prepare("INSERT OR IGNORE INTO measurement_units (id, name, sort_order, active) VALUES (?, ?, 99, 1)")
            .run('unit-' + crypto.randomUUID().substring(0, 8), pu)
        }
        fields.push('purchase_unit = ?'); values.push(pu)
      }
      if (updates.conversion_factor !== undefined) {
        fields.push('conversion_factor = ?'); values.push(Number(updates.conversion_factor) > 0 ? Number(updates.conversion_factor) : 1)
      }
      if (updates.yield_qty !== undefined) {
        fields.push('yield_qty = ?'); values.push(Number(updates.yield_qty) > 0 ? Number(updates.yield_qty) : 1)
      }
      if (updates.deduction_mode !== undefined) {
        fields.push('deduction_mode = ?'); values.push(updates.deduction_mode === 'BATCH_STOCK' ? 'BATCH_STOCK' : 'EXPLODE_ON_SALE')
      }
      if (updates.min_stock !== undefined) { fields.push('min_stock = ?'); values.push(roundQty(updates.min_stock)) }
      if (updates.unit_cost !== undefined) { fields.push('unit_cost = ?'); values.push(Number(updates.unit_cost) || 0) }
      if (updates.active !== undefined) { fields.push('active = ?'); values.push(updates.active ? 1 : 0) }
      if (updates.note !== undefined) { fields.push('note = ?'); values.push(updates.note) }

      fields.push("updated_at = datetime('now', 'localtime')")
      values.push(id)

      db.prepare(`UPDATE materials SET ${fields.join(', ')} WHERE id = ?`).run(...values)
      return this.getMaterials(true).find((m) => m.id === id)
    },

    deleteMaterial(id) {
      const db = getDatabase()
      const usedInMatRecipe = db.prepare("SELECT 1 FROM material_recipe_items WHERE ingredient_material_id = ? LIMIT 1").get(id)
      const usedInProdRecipe = db.prepare("SELECT 1 FROM product_recipes WHERE material_id = ? LIMIT 1").get(id)
      const usedInVariantRecipe = db.prepare("SELECT 1 FROM product_variant_recipes WHERE material_id = ? LIMIT 1").get(id)
      if (usedInMatRecipe || usedInProdRecipe || usedInVariantRecipe) {
        throw new Error('Nguyên vật liệu này đang nằm trong công thức món hoặc bán thành phẩm. Vui lòng gỡ khỏi công thức hoặc chọn Ẩn.')
      }
      const hasHistory =
        db.prepare("SELECT 1 FROM stock_movements WHERE material_id = ? LIMIT 1").get(id) ||
        db.prepare("SELECT 1 FROM order_material_usages WHERE material_id = ? LIMIT 1").get(id) ||
        db.prepare("SELECT 1 FROM wastage_logs WHERE material_id = ? LIMIT 1").get(id) ||
        db.prepare("SELECT 1 FROM prep_batches WHERE material_id = ? LIMIT 1").get(id) ||
        db.prepare("SELECT 1 FROM stocktake_items WHERE material_id = ? LIMIT 1").get(id)
      if (hasHistory) {
        throw new Error('Nguyên vật liệu này đã phát sinh lịch sử kho/hao hụt. Vui lòng chuyển sang trạng thái "Ngưng dùng" để bảo toàn số liệu.')
      }
      db.prepare("DELETE FROM materials WHERE id = ?").run(id)
      return { success: true }
    },

    // ── Multi-level Material Recipes ────────────────────────────
    getMaterialRecipe(parentMaterialId) {
      const db = getDatabase()
      const parent = db.prepare("SELECT * FROM materials WHERE id = ?").get(parentMaterialId)
      if (!parent) throw new Error('Không tìm thấy bán thành phẩm')

      const items = db.prepare(`
        SELECT mri.*, m.name as ingredient_name, m.unit as ingredient_unit, m.item_type as ingredient_type, m.unit_cost as ingredient_unit_cost
        FROM material_recipe_items mri
        INNER JOIN materials m ON mri.ingredient_material_id = m.id
        WHERE mri.parent_material_id = ?
        ORDER BY m.name ASC
      `).all(parentMaterialId)

      const ctx = loadBomContext(db)
      return {
        parent: {
          ...parent,
          yield_qty: Number(parent.yield_qty) > 0 ? Number(parent.yield_qty) : 1,
          active: Boolean(parent.active),
        },
        items: items.map((it) => {
          const effCost = computeMaterialEffectiveCost(it.ingredient_material_id, ctx)
          return {
            ...it,
            quantity: roundQty(it.quantity),
            effective_unit_cost: roundQty(effCost),
            line_cost: Math.round((Number(it.quantity) || 0) * effCost),
          }
        }),
      }
    },

    saveMaterialRecipe(parentMaterialId, items = [], yieldQty) {
      const db = getDatabase()
      const parent = db.prepare("SELECT * FROM materials WHERE id = ?").get(parentMaterialId)
      if (!parent) throw new Error('Không tìm thấy bán thành phẩm')
      if (parent.item_type !== 'SEMI_FINISHED') {
        throw new Error('Chỉ bán thành phẩm (bước trung gian) mới có công thức pha chế/ủ')
      }

      const cleanItems = []
      const seen = new Set()
      for (const it of items) {
        if (!it?.ingredient_material_id) continue
        const qty = Number(it.quantity)
        if (!Number.isFinite(qty) || qty <= 0) {
          throw new Error('Định lượng thành phần trong công thức phải lớn hơn 0')
        }
        if (seen.has(it.ingredient_material_id)) {
          throw new Error('Một nguyên liệu không thể xuất hiện 2 lần trong cùng một công thức')
        }
        seen.add(it.ingredient_material_id)
        cleanItems.push({
          ingredient_material_id: it.ingredient_material_id,
          quantity: roundQty(qty),
          note: it.note || null,
        })
      }

      const ingIds = cleanItems.map((x) => x.ingredient_material_id)
      if (wouldCreateCycle(db, parentMaterialId, ingIds)) {
        throw new Error('Công thức bị vòng lặp (bán thành phẩm tự chứa chính nó qua bước trung gian). Vui lòng kiểm tra lại!')
      }

      return runInTransaction(db, () => {
        if (yieldQty !== undefined && Number(yieldQty) > 0) {
          db.prepare("UPDATE materials SET yield_qty = ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
            .run(roundQty(yieldQty), parentMaterialId)
        }
        db.prepare("DELETE FROM material_recipe_items WHERE parent_material_id = ?").run(parentMaterialId)
        const ins = db.prepare(`
          INSERT INTO material_recipe_items (id, parent_material_id, ingredient_material_id, quantity, note)
          VALUES (?, ?, ?, ?, ?)
        `)
        for (const it of cleanItems) {
          ins.run('mri-' + crypto.randomUUID().substring(0, 8), parentMaterialId, it.ingredient_material_id, it.quantity, it.note)
        }
        return this.getMaterialRecipe(parentMaterialId)
      })
    },

    // ── Product Recipes ─────────────────────────────────────────
    getProductRecipe(productId) {
      const db = getDatabase()
      const items = db.prepare(`
        SELECT pr.*, m.name as material_name, m.unit as material_unit, m.item_type as material_type, m.yield_qty as material_yield_qty
        FROM product_recipes pr
        INNER JOIN materials m ON pr.material_id = m.id
        WHERE pr.product_id = ?
        ORDER BY m.name ASC
      `).all(productId)

      const ctx = loadBomContext(db)
      return items.map((it) => {
        const effCost = computeMaterialEffectiveCost(it.material_id, ctx)
        return {
          ...it,
          quantity: roundQty(it.quantity),
          effective_unit_cost: roundQty(effCost),
          line_cost: Math.round((Number(it.quantity) || 0) * effCost),
        }
      })
    },

    getAllProductRecipesSummary() {
      const db = getDatabase()
      const products = db.prepare(`
        SELECT p.id, p.name, p.price, p.active, p.category_id, c.name as category_name
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        ORDER BY p.name ASC
      `).all()

      const ctx = loadBomContext(db)
      return products.map((p) => {
        const recipeItems = ctx.prodRecipeMap.get(p.id) || []
        let unitCost = 0
        const ingredients = recipeItems.map((r) => {
          const mat = ctx.materialsById.get(r.material_id)
          const eff = computeMaterialEffectiveCost(r.material_id, ctx)
          const lineCost = r.quantity * eff
          unitCost += lineCost
          return {
            material_id: r.material_id,
            material_name: mat?.name || '',
            material_type: mat?.item_type || 'RAW',
            unit: mat?.unit || '',
            quantity: roundQty(r.quantity),
            line_cost: Math.round(lineCost),
          }
        })

        const variantMap = ctx.prodVariantMap.get(p.id)
        const variants = []
        if (variantMap) {
          for (const [kw, vItems] of variantMap.entries()) {
            let vCost = 0
            const vIngredients = vItems.map((r) => {
              const mat = ctx.materialsById.get(r.material_id)
              const eff = computeMaterialEffectiveCost(r.material_id, ctx)
              const lineCost = r.quantity * eff
              vCost += lineCost
              return {
                material_id: r.material_id,
                material_name: mat?.name || '',
                material_type: mat?.item_type || 'RAW',
                unit: mat?.unit || '',
                quantity: roundQty(r.quantity),
                line_cost: Math.round(lineCost),
              }
            })
            variants.push({
              variant_keyword: kw,
              ingredients_count: vIngredients.length,
              estimated_cost: Math.round(vCost),
              ingredients: vIngredients,
            })
          }
        }

        const price = Number(p.price) || 0
        const costRounded = Math.round(unitCost)
        const foodCostPct = price > 0 ? Math.round((costRounded / price) * 1000) / 10 : 0
        return {
          product_id: p.id,
          product_name: p.name,
          category_id: p.category_id,
          category_name: p.category_name || 'Khác',
          price,
          active: Boolean(p.active),
          ingredients_count: ingredients.length,
          estimated_cost: costRounded,
          food_cost_pct: foodCostPct,
          ingredients,
          variants_count: variants.length,
          variants,
        }
      })
    },

    getProductVariants(productId) {
      const db = getDatabase()
      const rows = db.prepare(`
        SELECT pvr.*, m.name as material_name, m.unit as material_unit, m.item_type as material_type, m.yield_qty as material_yield_qty
        FROM product_variant_recipes pvr
        INNER JOIN materials m ON pvr.material_id = m.id
        WHERE pvr.product_id = ?
        ORDER BY pvr.variant_keyword ASC, m.name ASC
      `).all(productId)

      const ctx = loadBomContext(db)
      const grouped = new Map()
      for (const it of rows) {
        if (!grouped.has(it.variant_keyword)) grouped.set(it.variant_keyword, [])
        const effCost = computeMaterialEffectiveCost(it.material_id, ctx)
        grouped.get(it.variant_keyword).push({
          ...it,
          quantity: roundQty(it.quantity),
          effective_unit_cost: roundQty(effCost),
          line_cost: Math.round((Number(it.quantity) || 0) * effCost),
        })
      }
      return Array.from(grouped.entries()).map(([variant_keyword, items]) => ({
        variant_keyword,
        items,
      }))
    },

    saveProductVariantRecipe(productId, variantKeyword, items = []) {
      const db = getDatabase()
      const prod = db.prepare("SELECT id FROM products WHERE id = ?").get(productId)
      if (!prod) throw new Error('Không tìm thấy sản phẩm')
      const kw = String(variantKeyword || '').trim()
      if (!kw) throw new Error('Vui lòng nhập tên biến thể / từ khóa (VD: Size L)')

      const cleanItems = []
      const seen = new Set()
      for (const it of items) {
        if (!it?.material_id) continue
        const qty = Number(it.quantity)
        if (!Number.isFinite(qty) || qty <= 0) {
          throw new Error('Định lượng nguyên vật liệu phải lớn hơn 0')
        }
        if (seen.has(it.material_id)) {
          throw new Error('Mỗi nguyên liệu chỉ được xuất hiện 1 lần trong công thức biến thể')
        }
        seen.add(it.material_id)
        cleanItems.push({
          material_id: it.material_id,
          quantity: roundQty(qty),
          note: it.note || null,
        })
      }

      return runInTransaction(db, () => {
        db.prepare("DELETE FROM product_variant_recipes WHERE product_id = ? AND variant_keyword = ?").run(productId, kw)
        const ins = db.prepare(`
          INSERT INTO product_variant_recipes (id, product_id, variant_keyword, material_id, quantity, note)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        for (const it of cleanItems) {
          ins.run('pvr-' + crypto.randomUUID().substring(0, 8), productId, kw, it.material_id, it.quantity, it.note)
        }
        return this.getProductVariants(productId)
      })
    },

    deleteProductVariant(productId, variantKeyword) {
      const db = getDatabase()
      db.prepare("DELETE FROM product_variant_recipes WHERE product_id = ? AND variant_keyword = ?").run(productId, String(variantKeyword || '').trim())
      return this.getProductVariants(productId)
    },

    saveProductRecipe(productId, items = []) {
      const db = getDatabase()
      const prod = db.prepare("SELECT id FROM products WHERE id = ?").get(productId)
      if (!prod) throw new Error('Không tìm thấy sản phẩm')

      const cleanItems = []
      const seen = new Set()
      for (const it of items) {
        if (!it?.material_id) continue
        const qty = Number(it.quantity)
        if (!Number.isFinite(qty) || qty <= 0) {
          throw new Error('Định lượng nguyên vật liệu phải lớn hơn 0')
        }
        if (seen.has(it.material_id)) {
          throw new Error('Mỗi nguyên liệu chỉ được xuất hiện 1 lần trong công thức của món')
        }
        seen.add(it.material_id)
        cleanItems.push({
          material_id: it.material_id,
          quantity: roundQty(qty),
          note: it.note || null,
        })
      }

      return runInTransaction(db, () => {
        db.prepare("DELETE FROM product_recipes WHERE product_id = ?").run(productId)
        const ins = db.prepare(`
          INSERT INTO product_recipes (id, product_id, material_id, quantity, note)
          VALUES (?, ?, ?, ?, ?)
        `)
        for (const it of cleanItems) {
          ins.run('pr-' + crypto.randomUUID().substring(0, 8), productId, it.material_id, it.quantity, it.note)
        }
        return this.getProductRecipe(productId)
      })
    },

    cloneProductRecipe(sourceProductId, targetProductId) {
      const db = getDatabase()
      if (sourceProductId === targetProductId) {
        throw new Error('Vui lòng chọn món nguồn khác với món đích')
      }
      const sourceItems = db.prepare("SELECT material_id, quantity, note FROM product_recipes WHERE product_id = ?").all(sourceProductId)
      if (!sourceItems || sourceItems.length === 0) {
        throw new Error('Món nguồn chưa có công thức để sao chép')
      }
      return this.saveProductRecipe(targetProductId, sourceItems)
    },

    // ── BOM Simulator ───────────────────────────────────────────
    simulateRecipeConsumption(items = []) {
      const db = getDatabase()
      const enriched = items.map((it) => {
        let name = it.product_name
        if (!name && it.product_id) {
          const p = db.prepare("SELECT name FROM products WHERE id = ?").get(it.product_id)
          name = p?.name || 'Sản phẩm'
        }
        return {
          id: it.id || null,
          product_id: it.product_id,
          product_name: name || 'Sản phẩm',
          quantity: Number(it.quantity) || 0,
          note: it.note || '',
        }
      })
      return resolveOrderItemsBOM(db, enriched)
    },

    // ── Stock Import / Prep Batch / Wastage / Stocktake ─────────
    importMaterialStock(payload) {
      const db = getDatabase()
      const mat = db.prepare("SELECT * FROM materials WHERE id = ?").get(payload?.material_id)
      if (!mat) throw new Error('Không tìm thấy nguyên vật liệu')

      const inputQty = Number(payload?.input_qty)
      if (!Number.isFinite(inputQty) || inputQty <= 0) throw new Error('Số lượng nhập phải lớn hơn 0')

      const factor = payload?.use_purchase_unit ? (Number(mat.conversion_factor) || 1) : 1
      const baseQty = roundQty(inputQty * factor)
      const totalCost = Math.max(0, Number(payload?.total_cost) || 0)

      return runInTransaction(db, () => {
        const oldStock = Number(mat.current_stock) || 0
        const oldUnitCost = Number(mat.unit_cost) || 0
        const newStock = roundQty(oldStock + baseQty)

        // Tính lại giá vốn bình quân gia quyền nếu có nhập tiền
        let newUnitCost = oldUnitCost
        const denom = Math.max(0, oldStock) + baseQty
        if (totalCost > 0 && denom > 0) {
          const oldVal = Math.max(0, oldStock) * oldUnitCost
          newUnitCost = roundQty((oldVal + totalCost) / denom)
        }

        db.prepare(`
          UPDATE materials
          SET current_stock = ?, unit_cost = ?, updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `).run(newStock, newUnitCost, mat.id)

        const { id: safeUserId, name: userName } = resolveValidProfileId(db, payload?.user_id)
        const unitLabel = payload?.use_purchase_unit ? (mat.purchase_unit || mat.unit) : mat.unit
        const noteText = payload?.note
          ? String(payload.note)
          : `Nhập ${inputQty} ${unitLabel}${factor !== 1 ? ` (= ${baseQty} ${mat.unit})` : ''}`

        db.prepare(`
          INSERT INTO stock_movements (
            id, material_id, material_name, unit, movement_type, qty_change,
            balance_after, unit_cost, total_cost, reference_type, reference_id,
            created_by, created_by_name, note
          ) VALUES (?, ?, ?, ?, 'IMPORT', ?, ?, ?, ?, 'import', NULL, ?, ?, ?)
        `).run(
          'mov-' + crypto.randomUUID(),
          mat.id,
          mat.name,
          mat.unit,
          baseQty,
          newStock,
          baseQty > 0 ? roundQty(totalCost / baseQty) : newUnitCost,
          Math.round(totalCost),
          safeUserId,
          userName,
          noteText
        )

        return this.getMaterials(true).find((m) => m.id === mat.id)
      })
    },

    createPrepBatch(payload) {
      const db = getDatabase()
      const mat = db.prepare("SELECT * FROM materials WHERE id = ?").get(payload?.material_id)
      if (!mat) throw new Error('Không tìm thấy bán thành phẩm')
      if (mat.item_type !== 'SEMI_FINISHED') throw new Error('Chỉ bán thành phẩm mới tạo được mẻ pha chế / ủ')

      const multiplier = Number(payload?.batch_multiplier) || 1
      if (multiplier <= 0) throw new Error('Số mẻ phải lớn hơn 0')

      const expectedYield = roundQty((Number(mat.yield_qty) > 0 ? Number(mat.yield_qty) : 1) * multiplier)
      const actualYield = Number(payload?.actual_yield_qty)
      if (!Number.isFinite(actualYield) || actualYield <= 0) throw new Error('Sản lượng thành phẩm thực thu phải lớn hơn 0')

      const recipeItems = db.prepare(`
        SELECT mri.*, m.name as ing_name, m.unit as ing_unit, m.current_stock as ing_stock, m.unit_cost as ing_unit_cost
        FROM material_recipe_items mri
        INNER JOIN materials m ON mri.ingredient_material_id = m.id
        WHERE mri.parent_material_id = ?
      `).all(mat.id)
      if (!recipeItems || recipeItems.length === 0) {
        throw new Error('Bán thành phẩm này chưa có công thức nguyên liệu đầu vào')
      }

      return runInTransaction(db, () => {
        const ctx = loadBomContext(db)
        const { id: safeUserId, name: userName } = resolveValidProfileId(db, payload?.user_id)
        const batchId = 'batch-' + crypto.randomUUID().substring(0, 8)
        let totalBatchCost = 0
        const inputsLog = []

        const updateStock = db.prepare("UPDATE materials SET current_stock = ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
        const insertMov = db.prepare(`
          INSERT INTO stock_movements (
            id, material_id, material_name, unit, movement_type, qty_change,
            balance_after, unit_cost, total_cost, reference_type, reference_id,
            created_by, created_by_name, note
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'prep_batch', ?, ?, ?, ?)
        `)

        // Hỗ trợ ghi đè lượng nguyên liệu đầu vào thực tế nếu quản lý nhập tay
        const customInputsMap = new Map()
        if (Array.isArray(payload?.custom_inputs)) {
          for (const ci of payload.custom_inputs) {
            if (ci?.material_id && Number(ci.quantity) >= 0) {
              customInputsMap.set(ci.material_id, Number(ci.quantity))
            }
          }
        }

        for (const r of recipeItems) {
          const reqQty = customInputsMap.has(r.ingredient_material_id)
            ? roundQty(customInputsMap.get(r.ingredient_material_id))
            : roundQty((Number(r.quantity) || 0) * multiplier)
          if (reqQty <= 0) continue

          const effCost = computeMaterialEffectiveCost(r.ingredient_material_id, ctx)
          const lineCost = Math.round(reqQty * effCost)
          totalBatchCost += lineCost

          const curStock = Number(db.prepare("SELECT current_stock FROM materials WHERE id = ?").get(r.ingredient_material_id)?.current_stock || 0)
          const newStock = roundQty(curStock - reqQty)
          updateStock.run(newStock, r.ingredient_material_id)

          insertMov.run(
            'mov-' + crypto.randomUUID(),
            r.ingredient_material_id,
            r.ing_name,
            r.ing_unit,
            'PREP_CONSUME',
            -reqQty,
            newStock,
            roundQty(effCost),
            lineCost,
            batchId,
            safeUserId,
            userName,
            `Pha chế mẻ ${mat.name} (thu ${actualYield} ${mat.unit})`
          )

          inputsLog.push({
            material_id: r.ingredient_material_id,
            material_name: r.ing_name,
            unit: r.ing_unit,
            quantity: reqQty,
            cost: lineCost,
          })
        }

        const lossQty = roundQty(expectedYield - actualYield)
        const roundedActual = roundQty(actualYield)

        // Chỉ cộng tồn kho cho bán thành phẩm nếu chế độ là BATCH_STOCK
        if (mat.deduction_mode === 'BATCH_STOCK') {
          const oldStock = Number(mat.current_stock) || 0
          const oldCost = Number(mat.unit_cost) || 0
          const newMatStock = roundQty(oldStock + roundedActual)
          const denom = Math.max(0, oldStock) + roundedActual
          const newMatUnitCost = denom > 0
            ? roundQty((Math.max(0, oldStock) * oldCost + totalBatchCost) / denom)
            : roundQty(totalBatchCost / roundedActual)

          db.prepare("UPDATE materials SET current_stock = ?, unit_cost = ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
            .run(newMatStock, newMatUnitCost, mat.id)

          insertMov.run(
            'mov-' + crypto.randomUUID(),
            mat.id,
            mat.name,
            mat.unit,
            'PREP_OUTPUT',
            roundedActual,
            newMatStock,
            roundQty(totalBatchCost / roundedActual),
            Math.round(totalBatchCost),
            batchId,
            safeUserId,
            userName,
            `Thành phẩm mẻ ủ ${mat.name}${lossQty > 0 ? ` (hao hụt ủ ${lossQty} ${mat.unit})` : ''}`
          )
        }

        db.prepare(`
          INSERT INTO prep_batches (
            id, material_id, material_name, unit, batch_multiplier,
            expected_yield_qty, actual_yield_qty, loss_qty, total_cost,
            inputs_json, created_by, created_by_name, note
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          batchId,
          mat.id,
          mat.name,
          mat.unit,
          roundQty(multiplier),
          expectedYield,
          roundedActual,
          lossQty,
          Math.round(totalBatchCost),
          JSON.stringify(inputsLog),
          safeUserId,
          userName,
          payload?.note || null
        )

        return db.prepare("SELECT * FROM prep_batches WHERE id = ?").get(batchId)
      })
    },

    getPrepBatches(filters = {}) {
      const db = getDatabase()
      const where = []
      const params = []
      if (filters.from) { where.push("created_at >= ?"); params.push(toLocalSqlDatetime(filters.from, false)) }
      if (filters.to) { where.push("created_at <= ?"); params.push(toLocalSqlDatetime(filters.to, true)) }
      if (filters.material_id) { where.push("material_id = ?"); params.push(filters.material_id) }
      const sql = `SELECT * FROM prep_batches ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 200`
      return db.prepare(sql).all(...params).map((b) => ({
        ...b,
        inputs: b.inputs_json ? JSON.parse(b.inputs_json) : [],
      }))
    },

    createWastageLog(payload) {
      const db = getDatabase()
      const mat = db.prepare("SELECT * FROM materials WHERE id = ?").get(payload?.material_id)
      if (!mat) throw new Error('Không tìm thấy nguyên vật liệu')
      const qty = Number(payload?.quantity)
      if (!Number.isFinite(qty) || qty <= 0) throw new Error('Số lượng hao hụt phải lớn hơn 0')

      const reasonRow = payload?.reason_id ? db.prepare("SELECT * FROM wastage_reasons WHERE id = ?").get(payload.reason_id) : null
      const reasonName = reasonRow?.name || String(payload?.reason_name || 'Hao hụt khác')

      return runInTransaction(db, () => {
        const ctx = loadBomContext(db)
        const unitCost = computeMaterialEffectiveCost(mat.id, ctx)
        const costAmount = Math.round(qty * unitCost)
        const { id: safeUserId, name: userName } = resolveValidProfileId(db, payload?.user_id)
        const logId = 'waste-' + crypto.randomUUID().substring(0, 8)
        const roundedQty = roundQty(qty)

        db.prepare(`
          INSERT INTO wastage_logs (
            id, material_id, material_name, unit, quantity, reason_id, reason_name,
            cost_amount, note, created_by, created_by_name
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          logId,
          mat.id,
          mat.name,
          mat.unit,
          roundedQty,
          reasonRow?.id || null,
          reasonName,
          costAmount,
          payload?.note || null,
          safeUserId,
          userName
        )

        // Ghi sổ kho: nếu là SEMI_FINISHED dạng EXPLODE_ON_SALE thì quy đổi trừ NVL gốc; ngược lại trừ chính NVL đó
        const insertMov = db.prepare(`
          INSERT INTO stock_movements (
            id, material_id, material_name, unit, movement_type, qty_change,
            balance_after, unit_cost, total_cost, reference_type, reference_id,
            created_by, created_by_name, note
          ) VALUES (?, ?, ?, ?, 'WASTAGE', ?, ?, ?, ?, 'wastage', ?, ?, ?, ?)
        `)

        const deductTargets = []
        if (mat.item_type === 'SEMI_FINISHED' && mat.deduction_mode === 'EXPLODE_ON_SALE' && (ctx.matRecipeMap.get(mat.id) || []).length > 0) {
          const explodeWaste = (mId, q, visited) => {
            const m = ctx.materialsById.get(mId)
            const children = m?.item_type === 'SEMI_FINISHED' ? (ctx.matRecipeMap.get(mId) || []) : []
            if (!m || m.item_type === 'RAW' || children.length === 0 || m.deduction_mode === 'BATCH_STOCK') {
              deductTargets.push({ mat: m, qty: q })
              return
            }
            const nextV = new Set(visited); nextV.add(mId)
            const ratio = q / (m.yield_qty > 0 ? m.yield_qty : 1)
            for (const c of children) {
              if (!nextV.has(c.ingredient_material_id)) {
                explodeWaste(c.ingredient_material_id, c.quantity * ratio, nextV)
              }
            }
          }
          explodeWaste(mat.id, roundedQty, new Set())
        } else {
          deductTargets.push({ mat: ctx.materialsById.get(mat.id), qty: roundedQty })
        }

        for (const t of deductTargets) {
          if (!t.mat) continue
          const tQty = roundQty(t.qty)
          const curStock = Number(db.prepare("SELECT current_stock FROM materials WHERE id = ?").get(t.mat.id)?.current_stock || 0)
          const newStock = roundQty(curStock - tQty)
          db.prepare("UPDATE materials SET current_stock = ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
            .run(newStock, t.mat.id)

          const tUnitCost = roundQty(computeMaterialEffectiveCost(t.mat.id, ctx))
          insertMov.run(
            'mov-' + crypto.randomUUID(),
            t.mat.id,
            t.mat.name,
            t.mat.unit,
            -tQty,
            newStock,
            tUnitCost,
            Math.round(tQty * tUnitCost),
            logId,
            safeUserId,
            userName,
            `Hao hụt (${reasonName}): ${mat.name}${t.mat.id !== mat.id ? ` (quy đổi từ ${roundedQty} ${mat.unit})` : ''}`
          )
        }

        return db.prepare("SELECT * FROM wastage_logs WHERE id = ?").get(logId)
      })
    },

    getWastageLogs(filters = {}) {
      const db = getDatabase()
      const where = []
      const params = []
      if (filters.from) { where.push("created_at >= ?"); params.push(toLocalSqlDatetime(filters.from, false)) }
      if (filters.to) { where.push("created_at <= ?"); params.push(toLocalSqlDatetime(filters.to, true)) }
      if (filters.reason_id) { where.push("reason_id = ?"); params.push(filters.reason_id) }
      const sql = `SELECT * FROM wastage_logs ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 300`
      return db.prepare(sql).all(...params)
    },

    deleteWastageLog(id) {
      const db = getDatabase()
      return runInTransaction(db, () => {
        const movs = db.prepare("SELECT material_id, qty_change FROM stock_movements WHERE reference_type = 'wastage' AND reference_id = ?").all(id)
        const upd = db.prepare("UPDATE materials SET current_stock = current_stock + ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
        for (const mv of movs) {
          upd.run(roundQty(Math.abs(Number(mv.qty_change) || 0)), mv.material_id)
        }
        db.prepare("DELETE FROM stock_movements WHERE reference_type = 'wastage' AND reference_id = ?").run(id)
        db.prepare("DELETE FROM wastage_logs WHERE id = ?").run(id)
        return { success: true }
      })
    },

    createStocktake(payload) {
      const db = getDatabase()
      const items = payload?.items || []
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('Vui lòng nhập ít nhất 1 nguyên vật liệu để kiểm kê')
      }

      return runInTransaction(db, () => {
        const ctx = loadBomContext(db)
        const { id: safeUserId, name: userName } = resolveValidProfileId(db, payload?.user_id)
        const stId = 'st-' + crypto.randomUUID().substring(0, 8)
        const title = String(payload?.title || `Kiểm kê kho ${new Date().toLocaleDateString('vi-VN')}`).trim()

        let totalVarianceCost = 0
        const preparedItems = []

        for (const it of items) {
          const mat = db.prepare("SELECT * FROM materials WHERE id = ?").get(it.material_id)
          if (!mat) continue
          const sysStock = roundQty(mat.current_stock)
          const actStock = roundQty(Number(it.actual_stock))
          if (!Number.isFinite(actStock) || actStock < 0) {
            throw new Error(`Số lượng thực tế của "${mat.name}" không hợp lệ`)
          }
          const varianceQty = roundQty(actStock - sysStock)
          const uCost = roundQty(computeMaterialEffectiveCost(mat.id, ctx))
          const varianceCost = Math.round(varianceQty * uCost)
          totalVarianceCost += varianceCost

          preparedItems.push({
            material_id: mat.id,
            material_name: mat.name,
            unit: mat.unit,
            system_stock: sysStock,
            actual_stock: actStock,
            variance_qty: varianceQty,
            unit_cost: uCost,
            variance_cost: varianceCost,
            note: it.note || null,
          })
        }

        db.prepare(`
          INSERT INTO stocktakes (
            id, title, status, total_variance_cost, note, created_by, created_by_name, completed_at
          ) VALUES (?, ?, 'COMPLETED', ?, ?, ?, ?, datetime('now', 'localtime'))
        `).run(stId, title, Math.round(totalVarianceCost), payload?.note || null, safeUserId, userName)

        const insItem = db.prepare(`
          INSERT INTO stocktake_items (
            id, stocktake_id, material_id, material_name, unit,
            system_stock, actual_stock, variance_qty, unit_cost, variance_cost, note
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        const updMat = db.prepare("UPDATE materials SET current_stock = ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
        const insMov = db.prepare(`
          INSERT INTO stock_movements (
            id, material_id, material_name, unit, movement_type, qty_change,
            balance_after, unit_cost, total_cost, reference_type, reference_id,
            created_by, created_by_name, note
          ) VALUES (?, ?, ?, ?, 'STOCKTAKE_ADJUST', ?, ?, ?, ?, 'stocktake', ?, ?, ?, ?)
        `)

        for (const pi of preparedItems) {
          insItem.run(
            'sti-' + crypto.randomUUID().substring(0, 8),
            stId,
            pi.material_id,
            pi.material_name,
            pi.unit,
            pi.system_stock,
            pi.actual_stock,
            pi.variance_qty,
            pi.unit_cost,
            pi.variance_cost,
            pi.note
          )

          if (pi.variance_qty !== 0) {
            updMat.run(pi.actual_stock, pi.material_id)
            insMov.run(
              'mov-' + crypto.randomUUID(),
              pi.material_id,
              pi.material_name,
              pi.unit,
              pi.variance_qty,
              pi.actual_stock,
              pi.unit_cost,
              Math.abs(pi.variance_cost),
              stId,
              safeUserId,
              userName,
              `Kiểm kê "${title}": lệch ${pi.variance_qty > 0 ? '+' : ''}${pi.variance_qty} ${pi.unit}`
            )
          }
        }

        return this.getStocktakes().find((s) => s.id === stId)
      })
    },

    getStocktakes() {
      const db = getDatabase()
      const list = db.prepare("SELECT * FROM stocktakes ORDER BY created_at DESC LIMIT 100").all()
      const getItems = db.prepare("SELECT * FROM stocktake_items WHERE stocktake_id = ? ORDER BY material_name ASC")
      return list.map((s) => ({
        ...s,
        items: getItems.all(s.id),
      }))
    },

    getStockMovements(filters = {}) {
      const db = getDatabase()
      const where = []
      const params = []
      if (filters.material_id) { where.push("material_id = ?"); params.push(filters.material_id) }
      if (filters.movement_type) { where.push("movement_type = ?"); params.push(filters.movement_type) }
      if (filters.from) { where.push("created_at >= ?"); params.push(toLocalSqlDatetime(filters.from, false)) }
      if (filters.to) { where.push("created_at <= ?"); params.push(toLocalSqlDatetime(filters.to, true)) }

      const sql = `SELECT * FROM stock_movements ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 400`
      return db.prepare(sql).all(...params)
    },

    // ── Báo cáo Tổng hợp Tiêu hao & Hao hụt ────────────────────
    getMaterialWastageReport(filters = {}) {
      const db = getDatabase()
      const fromDt = toLocalSqlDatetime(filters.from, false) || '1970-01-01 00:00:00'
      const toDt = toLocalSqlDatetime(filters.to, true) || '2999-12-31 23:59:59'

      const materials = this.getMaterials(true)
      const matMap = new Map(materials.map((m) => [m.id, m]))

      // 1. Tiêu hao từ đơn bán PAID trong kỳ (cả 2 cấp: trực tiếp & quy đổi gốc)
      const usageRows = db.prepare(`
        SELECT omu.*, o.invoice_number, o.paid_at
        FROM order_material_usages omu
        INNER JOIN orders o ON omu.order_id = o.id
        WHERE o.status = 'PAID' AND COALESCE(o.paid_at, omu.created_at) >= ? AND COALESCE(o.paid_at, omu.created_at) <= ?
      `).all(fromDt, toDt)

      // Tổng hợp theo sản phẩm đã bán
      const soldProductsMap = new Map()
      const seenOrderItem = new Set()
      for (const u of usageRows) {
        const oiKey = `${u.order_id}__${u.order_item_id || u.product_name}`
        if (!seenOrderItem.has(oiKey)) {
          seenOrderItem.add(oiKey)
          const pKey = u.product_id || u.product_name
          const cur = soldProductsMap.get(pKey) || { product_name: u.product_name, quantity: 0, cost_amount: 0 }
          cur.quantity += Number(u.item_quantity) || 0
          soldProductsMap.set(pKey, cur)
        }
        const pKey = u.product_id || u.product_name
        const cur = soldProductsMap.get(pKey)
        if (cur) cur.cost_amount += Number(u.cost_amount) || 0
      }

      // Tổng hợp cấp Trực tiếp (VD: 80ml Sữa đặc, 200ml Cà phê chung)
      const directAggMap = new Map()
      // Tổng hợp cấp Quy đổi gốc (VD: 80ml Sữa đặc, 75g Cà phê 1, 50g Cà phê 2)
      const explodedAggMap = new Map()

      for (const u of usageRows) {
        if (Number(u.direct_qty) > 0) {
          const cur = directAggMap.get(u.material_id) || {
            material_id: u.material_id,
            material_name: u.material_name,
            material_type: u.material_type,
            unit: u.unit,
            total_qty: 0,
          }
          cur.total_qty = roundQty(cur.total_qty + Number(u.direct_qty))
          directAggMap.set(u.material_id, cur)
        }
        if (Number(u.exploded_raw_qty) > 0) {
          const cur = explodedAggMap.get(u.material_id) || {
            material_id: u.material_id,
            material_name: u.material_name,
            material_type: u.material_type,
            unit: u.unit,
            total_qty: 0,
            total_cost: 0,
          }
          cur.total_qty = roundQty(cur.total_qty + Number(u.exploded_raw_qty))
          cur.total_cost = Math.round(cur.total_cost + (Number(u.cost_amount) || 0))
          explodedAggMap.set(u.material_id, cur)
        }
      }

      // 2. Sổ cái kho trong kỳ & trước kỳ để tính Xuất - Nhập - Tồn & Hao hụt
      const movsInRange = db.prepare(`
        SELECT * FROM stock_movements
        WHERE created_at >= ? AND created_at <= ?
      `).all(fromDt, toDt)

      const movsAfterFrom = db.prepare(`
        SELECT material_id, SUM(qty_change) as net_change
        FROM stock_movements
        WHERE created_at >= ?
        GROUP BY material_id
      `).all(fromDt)
      const netFromStartMap = new Map(movsAfterFrom.map((r) => [r.material_id, Number(r.net_change) || 0]))

      const movsAfterTo = db.prepare(`
        SELECT material_id, SUM(qty_change) as net_change
        FROM stock_movements
        WHERE created_at > ?
        GROUP BY material_id
      `).all(toDt)
      const netAfterToMap = new Map(movsAfterTo.map((r) => [r.material_id, Number(r.net_change) || 0]))

      const ledgerByMat = new Map()
      for (const m of materials) {
        const curStock = Number(m.current_stock) || 0
        const opening = roundQty(curStock - (netFromStartMap.get(m.id) || 0))
        const closing = roundQty(curStock - (netAfterToMap.get(m.id) || 0))
        ledgerByMat.set(m.id, {
          material_id: m.id,
          material_name: m.name,
          item_type: m.item_type,
          unit: m.unit,
          deduction_mode: m.deduction_mode,
          opening_stock: opening,
          imported_qty: 0,
          sold_qty: 0,
          prep_consumed_qty: 0,
          prep_output_qty: 0,
          wastage_qty: 0,
          stocktake_adjust_qty: 0,
          closing_stock: closing,
          sold_cost: 0,
          wastage_cost: 0,
          stocktake_loss_cost: 0,
        })
      }

      for (const mv of movsInRange) {
        const row = ledgerByMat.get(mv.material_id)
        if (!row) continue
        const q = Number(mv.qty_change) || 0
        const c = Number(mv.total_cost) || 0
        switch (mv.movement_type) {
          case 'IMPORT':
            row.imported_qty = roundQty(row.imported_qty + q)
            break
          case 'SALE_DEDUCTION':
            row.sold_qty = roundQty(row.sold_qty + Math.abs(q))
            row.sold_cost = Math.round(row.sold_cost + c)
            break
          case 'SALE_REVERSAL':
            row.sold_qty = roundQty(Math.max(0, row.sold_qty - q))
            row.sold_cost = Math.round(Math.max(0, row.sold_cost - c))
            break
          case 'PREP_CONSUME':
            row.prep_consumed_qty = roundQty(row.prep_consumed_qty + Math.abs(q))
            break
          case 'PREP_OUTPUT':
            row.prep_output_qty = roundQty(row.prep_output_qty + q)
            break
          case 'WASTAGE':
            row.wastage_qty = roundQty(row.wastage_qty + Math.abs(q))
            row.wastage_cost = Math.round(row.wastage_cost + c)
            break
          case 'STOCKTAKE_ADJUST':
            row.stocktake_adjust_qty = roundQty(row.stocktake_adjust_qty + q)
            if (q < 0) row.stocktake_loss_cost = Math.round(row.stocktake_loss_cost + c)
            break
        }
      }

      // 3. Hao hụt phát sinh theo lý do & Mẻ pha chế ủ trong kỳ
      const wastageByReason = db.prepare(`
        SELECT reason_name, COUNT(*) as count, SUM(cost_amount) as total_cost
        FROM wastage_logs
        WHERE created_at >= ? AND created_at <= ?
        GROUP BY reason_name
        ORDER BY total_cost DESC
      `).all(fromDt, toDt)

      const prepBatches = this.getPrepBatches({ from: fromDt, to: toDt })
      const prepLossTotalQty = prepBatches.reduce((s, b) => s + Math.max(0, Number(b.loss_qty) || 0), 0)
      const prepLossTotalCost = prepBatches.reduce((s, b) => {
        const m = matMap.get(b.material_id)
        const uCost = m?.effective_unit_cost || 0
        const loss = Math.max(0, Number(b.loss_qty) || 0)
        return s + Math.round(loss * uCost)
      }, 0)

      // 4. Doanh thu bán hàng trong kỳ để đối chiếu tỷ lệ giá vốn / hao hụt
      const revRow = db.prepare(`
        SELECT COALESCE(SUM(total), 0) as net_revenue, COUNT(*) as paid_orders
        FROM orders
        WHERE status = 'PAID' AND paid_at >= ? AND paid_at <= ?
      `).get(fromDt, toDt)

      const totalSaleCost = Array.from(explodedAggMap.values()).reduce((s, x) => s + x.total_cost, 0)
      const totalRecordedWastageCost = wastageByReason.reduce((s, r) => s + (Number(r.total_cost) || 0), 0)
      const totalStocktakeLossCost = Array.from(ledgerByMat.values()).reduce((s, r) => s + r.stocktake_loss_cost, 0)

      return {
        range: { from: fromDt, to: toDt },
        summary: {
          net_revenue: Number(revRow?.net_revenue) || 0,
          paid_orders: Number(revRow?.paid_orders) || 0,
          total_sale_material_cost: Math.round(totalSaleCost),
          total_wastage_cost: Math.round(totalRecordedWastageCost),
          total_prep_loss_cost: Math.round(prepLossTotalCost),
          total_prep_loss_qty: roundQty(prepLossTotalQty),
          total_stocktake_loss_cost: Math.round(totalStocktakeLossCost),
        },
        sold_products: Array.from(soldProductsMap.values()).sort((a, b) => b.quantity - a.quantity),
        direct_consumption: Array.from(directAggMap.values()).sort((a, b) => b.total_qty - a.total_qty),
        exploded_raw_consumption: Array.from(explodedAggMap.values()).sort((a, b) => b.total_cost - a.total_cost || b.total_qty - a.total_qty),
        inventory_ledger: Array.from(ledgerByMat.values()),
        wastage_by_reason: wastageByReason.map((r) => ({
          reason_name: r.reason_name,
          count: Number(r.count) || 0,
          total_cost: Math.round(Number(r.total_cost) || 0),
        })),
        prep_batches: prepBatches,
      }
    },

    // ── Báo cáo Tổng kết Nguyên liệu đã dùng (Đơn giản, đa tầng) ──
    getMaterialConsumptionSummary(filters = {}) {
      const db = getDatabase()
      const fromDt = toLocalSqlDatetime(filters.from, false) || '1970-01-01 00:00:00'
      const toDt = toLocalSqlDatetime(filters.to, true) || '2999-12-31 23:59:59'
      const forceCurrentRecipes = Boolean(filters.use_current_recipes)

      const ctx = loadBomContext(db)

      const paidOrders = db.prepare(`
        SELECT id, invoice_number, total, COALESCE(paid_at, created_at) as effective_time
        FROM orders
        WHERE status = 'PAID' AND COALESCE(paid_at, created_at) >= ? AND COALESCE(paid_at, created_at) <= ?
      `).all(fromDt, toDt)

      const orderItems = db.prepare(`
        SELECT oi.*
        FROM order_items oi
        INNER JOIN orders o ON oi.order_id = o.id
        WHERE o.status = 'PAID' AND COALESCE(o.paid_at, o.created_at) >= ? AND COALESCE(o.paid_at, o.created_at) <= ?
      `).all(fromDt, toDt)

      const snapshotRows = db.prepare(`
        SELECT omu.*
        FROM order_material_usages omu
        INNER JOIN orders o ON omu.order_id = o.id
        WHERE o.status = 'PAID' AND COALESCE(o.paid_at, o.created_at) >= ? AND COALESCE(o.paid_at, o.created_at) <= ?
      `).all(fromDt, toDt)

      const snapshotByOrderItem = new Map()
      for (const sr of snapshotRows) {
        if (!sr.order_item_id) continue
        if (!snapshotByOrderItem.has(sr.order_item_id)) snapshotByOrderItem.set(sr.order_item_id, [])
        snapshotByOrderItem.get(sr.order_item_id).push(sr)
      }

      const rawMap = new Map()
      const directMap = new Map()
      const soldProductsMap = new Map()

      const ensureRawEntry = (matId, name, unit) => {
        if (!rawMap.has(matId)) {
          rawMap.set(matId, {
            material_id: matId,
            material_name: name,
            unit,
            sale_qty: 0,
            extra_wastage_qty: 0,
            total_qty: 0,
            sale_cost: 0,
            extra_wastage_cost: 0,
            total_cost: 0,
          })
        }
        return rawMap.get(matId)
      }

      const ensureDirectEntry = (matId, name, itemType, unit) => {
        if (!directMap.has(matId)) {
          directMap.set(matId, {
            material_id: matId,
            material_name: name,
            material_type: itemType || 'RAW',
            unit,
            sale_qty: 0,
            extra_wastage_qty: 0,
            total_qty: 0,
          })
        }
        return directMap.get(matId)
      }

      let totalCupsSold = 0
      for (const item of orderItems) {
        const qty = Number(item.quantity) || 0
        if (qty <= 0) continue
        totalCupsSold += qty

        const existingSnap = !forceCurrentRecipes ? snapshotByOrderItem.get(item.id) : null
        let rowsToApply = existingSnap && existingSnap.length > 0 ? existingSnap : null
        if (!rowsToApply) {
          rowsToApply = resolveOrderItemsBOM(db, [item]).usageRows
        }

        const pKey = item.product_id || item.product_name
        const pCur = soldProductsMap.get(pKey) || {
          product_id: item.product_id || null,
          product_name: item.product_name,
          quantity: 0,
          has_recipe: false,
          cost_amount: 0,
          directMap: new Map(),
          rawMap: new Map(),
        }
        pCur.quantity += qty

        if (rowsToApply.length > 0) {
          pCur.has_recipe = true
          for (const r of rowsToApply) {
            const dQty = Number(r.direct_qty) || 0
            const eQty = Number(r.exploded_raw_qty) || 0
            const cAmt = Number(r.cost_amount) || 0
            pCur.cost_amount = Math.round(pCur.cost_amount + cAmt)

            if (dQty > 0) {
              const de = ensureDirectEntry(r.material_id, r.material_name, r.material_type, r.unit)
              de.sale_qty = roundQty(de.sale_qty + dQty)
              de.total_qty = roundQty(de.total_qty + dQty)

              const pde = pCur.directMap.get(r.material_id) || {
                material_id: r.material_id,
                material_name: r.material_name,
                material_type: r.material_type || 'RAW',
                unit: r.unit,
                quantity: 0,
              }
              pde.quantity = roundQty(pde.quantity + dQty)
              pCur.directMap.set(r.material_id, pde)
            }
            if (eQty > 0) {
              const re = ensureRawEntry(r.material_id, r.material_name, r.unit)
              re.sale_qty = roundQty(re.sale_qty + eQty)
              re.total_qty = roundQty(re.total_qty + eQty)
              re.sale_cost = Math.round(re.sale_cost + cAmt)
              re.total_cost = Math.round(re.total_cost + cAmt)

              const pre = pCur.rawMap.get(r.material_id) || {
                material_id: r.material_id,
                material_name: r.material_name,
                unit: r.unit,
                quantity: 0,
                cost_amount: 0,
              }
              pre.quantity = roundQty(pre.quantity + eQty)
              pre.cost_amount = Math.round(pre.cost_amount + cAmt)
              pCur.rawMap.set(r.material_id, pre)
            }
          }
        }
        soldProductsMap.set(pKey, pCur)
      }

      // Hao hụt phát sinh thêm ngoài đơn bán (pha hỏng, đổ bỏ...)
      const wastageLogs = db.prepare(`
        SELECT * FROM wastage_logs
        WHERE created_at >= ? AND created_at <= ?
        ORDER BY created_at DESC
      `).all(fromDt, toDt)

      for (const w of wastageLogs) {
        const wQty = Number(w.quantity) || 0
        if (wQty <= 0) continue
        const mat = ctx.materialsById.get(w.material_id)
        const de = ensureDirectEntry(w.material_id, w.material_name, mat?.item_type || 'RAW', w.unit)
        de.extra_wastage_qty = roundQty(de.extra_wastage_qty + wQty)
        de.total_qty = roundQty(de.total_qty + wQty)

        const explodeWaste = (mId, q, visited) => {
          const m = ctx.materialsById.get(mId)
          if (!m) {
            const re = ensureRawEntry(mId, w.material_name, w.unit)
            re.extra_wastage_qty = roundQty(re.extra_wastage_qty + q)
            re.total_qty = roundQty(re.total_qty + q)
            re.extra_wastage_cost = Math.round(re.extra_wastage_cost + (Number(w.cost_amount) || 0))
            re.total_cost = Math.round(re.total_cost + (Number(w.cost_amount) || 0))
            return
          }
          const children = m.item_type === 'SEMI_FINISHED' ? (ctx.matRecipeMap.get(mId) || []) : []
          if (m.item_type === 'RAW' || children.length === 0) {
            const uCost = computeMaterialEffectiveCost(m.id, ctx)
            const cAmt = Math.round(q * uCost)
            const re = ensureRawEntry(m.id, m.name, m.unit)
            re.extra_wastage_qty = roundQty(re.extra_wastage_qty + q)
            re.total_qty = roundQty(re.total_qty + q)
            re.extra_wastage_cost = Math.round(re.extra_wastage_cost + cAmt)
            re.total_cost = Math.round(re.total_cost + cAmt)
            return
          }
          const nextV = new Set(visited); nextV.add(mId)
          const ratio = q / (m.yield_qty > 0 ? m.yield_qty : 1)
          for (const c of children) {
            if (!nextV.has(c.ingredient_material_id)) {
              explodeWaste(c.ingredient_material_id, c.quantity * ratio, nextV)
            }
          }
        }
        explodeWaste(w.material_id, wQty, new Set())
      }

      const rawConsumption = Array.from(rawMap.values()).sort((a, b) => b.total_qty - a.total_qty || a.material_name.localeCompare(b.material_name))
      const directConsumption = Array.from(directMap.values()).sort((a, b) => b.total_qty - a.total_qty || a.material_name.localeCompare(b.material_name))
      const soldProducts = Array.from(soldProductsMap.values())
        .map(({ directMap: dMap, rawMap: rMap, ...rest }) => ({
          ...rest,
          direct_materials: Array.from(dMap.values()).sort((a, b) => b.quantity - a.quantity),
          raw_materials: Array.from(rMap.values()).sort((a, b) => b.quantity - a.quantity),
        }))
        .sort((a, b) => b.quantity - a.quantity)
      const unconfiguredProducts = soldProducts.filter((p) => !p.has_recipe)

      const netRevenue = paidOrders.reduce((s, o) => s + (Number(o.total) || 0), 0)
      const totalSaleCost = rawConsumption.reduce((s, r) => s + r.sale_cost, 0)
      const totalExtraWastageCost = rawConsumption.reduce((s, r) => s + r.extra_wastage_cost, 0)

      return {
        range: { from: fromDt, to: toDt },
        summary: {
          paid_orders: paidOrders.length,
          total_cups_sold: totalCupsSold,
          net_revenue: Math.round(netRevenue),
          raw_materials_count: rawConsumption.length,
          total_sale_cost: Math.round(totalSaleCost),
          total_extra_wastage_cost: Math.round(totalExtraWastageCost),
          total_cost: Math.round(totalSaleCost + totalExtraWastageCost),
        },
        raw_consumption: rawConsumption,
        direct_consumption: directConsumption,
        sold_products: soldProducts,
        unconfigured_products: unconfiguredProducts,
        extra_wastage_logs: wastageLogs,
      }
    },

    // ── Optional Example Seeder (Chỉ chạy khi Quản lý chủ động bấm nút) ──
    seedExampleMaterials() {
      const db = getDatabase()
      const existingCount = db.prepare("SELECT count(*) as c FROM materials").get()
      if (existingCount && existingCount.c > 0) {
        throw new Error('Đã có nguyên vật liệu trong hệ thống. Chỉ có thể nạp ví dụ mẫu khi danh sách đang trống.')
      }

      return runInTransaction(db, () => {
        const insMat = db.prepare(`
          INSERT INTO materials (
            id, code, name, item_type, unit, purchase_unit, conversion_factor,
            yield_qty, deduction_mode, current_stock, min_stock, unit_cost, active, note
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        `)

        insMat.run('mat-ex-cf1', null, 'Cà phê Robusta (Loại 1)', 'RAW', 'g', 'g', 1, 1, 'EXPLODE_ON_SALE', 0, 0, 220, '220đ/g (220.000đ/kg)')
        insMat.run('mat-ex-cf2', null, 'Cà phê Arabica (Loại 2)', 'RAW', 'g', 'g', 1, 1, 'EXPLODE_ON_SALE', 0, 0, 320, '320đ/g (320.000đ/kg)')
        insMat.run('mat-ex-suadac', null, 'Sữa đặc', 'RAW', 'ml', 'ml', 1, 1, 'EXPLODE_ON_SALE', 0, 0, 65, '65đ/ml')
        insMat.run('mat-ex-cfchung', null, 'Cà phê chung (sau ủ phin)', 'SEMI_FINISHED', 'ml', 'mẻ', 800, 800, 'EXPLODE_ON_SALE', 0, 0, 0, 'Ủ 300g Robusta + 200g Arabica thu được 800ml cốt')

        const insMri = db.prepare("INSERT INTO material_recipe_items (id, parent_material_id, ingredient_material_id, quantity, note) VALUES (?, ?, ?, ?, ?)")
        insMri.run('mri-ex-1', 'mat-ex-cfchung', 'mat-ex-cf1', 300, null)
        insMri.run('mri-ex-2', 'mat-ex-cfchung', 'mat-ex-cf2', 200, null)

        // Tự động gán mẫu vào món Cà phê nâu nếu tìm thấy trong products
        const cafeNau = db.prepare("SELECT id FROM products WHERE LOWER(name) LIKE '%cà phê nâu%' OR LOWER(name) LIKE '%ca phe nau%' LIMIT 1").get()
        if (cafeNau) {
          const insPr = db.prepare("INSERT OR IGNORE INTO product_recipes (id, product_id, material_id, quantity, note) VALUES (?, ?, ?, ?, ?)")
          insPr.run('pr-ex-1', cafeNau.id, 'mat-ex-suadac', 20, null)
          insPr.run('pr-ex-2', cafeNau.id, 'mat-ex-cfchung', 50, null)
        }

        return { success: true, matchedProductId: cafeNau?.id || null }
      })
    },

    exportMaterialsAndRecipes() {
      const db = getDatabase()
      const units = db.prepare('SELECT name, sort_order FROM measurement_units WHERE active = 1 ORDER BY sort_order ASC, name ASC').all()
      const wastage_reasons = db.prepare('SELECT name, color, sort_order FROM wastage_reasons WHERE active = 1 ORDER BY sort_order ASC, name ASC').all()
      const materials = db.prepare(`
        SELECT id, code, name, item_type, unit, purchase_unit, conversion_factor,
               yield_qty, deduction_mode, min_stock, unit_cost, active, note
        FROM materials
        ORDER BY item_type ASC, name ASC
      `).all()

      const matById = new Map(materials.map((m) => [m.id, m]))
      const products = db.prepare('SELECT id, name FROM products').all()
      const prodById = new Map(products.map((p) => [p.id, p]))

      const mriRows = db.prepare(`
        SELECT parent_material_id, ingredient_material_id, quantity, note
        FROM material_recipe_items
      `).all()
      const matRecipeMap = new Map()
      for (const r of mriRows) {
        const parent = matById.get(r.parent_material_id)
        const ing = matById.get(r.ingredient_material_id)
        if (!parent || !ing) continue
        if (!matRecipeMap.has(parent.name)) {
          matRecipeMap.set(parent.name, {
            parent_name: parent.name,
            yield_qty: Number(parent.yield_qty) || 1,
            items: [],
          })
        }
        matRecipeMap.get(parent.name).items.push({
          ingredient_name: ing.name,
          quantity: Number(r.quantity) || 0,
          note: r.note || null,
        })
      }

      const prRows = db.prepare('SELECT product_id, material_id, quantity, note FROM product_recipes').all()
      const prodRecipeMap = new Map()
      for (const r of prRows) {
        const prod = prodById.get(r.product_id)
        const mat = matById.get(r.material_id)
        if (!prod || !mat) continue
        if (!prodRecipeMap.has(prod.name)) {
          prodRecipeMap.set(prod.name, { product_name: prod.name, items: [] })
        }
        prodRecipeMap.get(prod.name).items.push({
          material_name: mat.name,
          quantity: Number(r.quantity) || 0,
          note: r.note || null,
        })
      }

      const pvrRows = db.prepare('SELECT product_id, variant_keyword, material_id, quantity, note FROM product_variant_recipes').all()
      const pvrMap = new Map()
      for (const r of pvrRows) {
        const prod = prodById.get(r.product_id)
        const mat = matById.get(r.material_id)
        if (!prod || !mat) continue
        const key = `${prod.name}|||${r.variant_keyword}`
        if (!pvrMap.has(key)) {
          pvrMap.set(key, {
            product_name: prod.name,
            variant_keyword: r.variant_keyword,
            items: [],
          })
        }
        pvrMap.get(key).items.push({
          material_name: mat.name,
          quantity: Number(r.quantity) || 0,
          note: r.note || null,
        })
      }

      const modRows = db.prepare('SELECT keyword, material_id, delta_qty, active, note FROM pos_modifier_rules').all()
      const pos_modifier_rules = modRows
        .map((r) => {
          const mat = matById.get(r.material_id)
          if (!mat) return null
          return {
            keyword: r.keyword,
            material_name: mat.name,
            delta_qty: Number(r.delta_qty) || 0,
            active: Number(r.active) === 1,
            note: r.note || null,
          }
        })
        .filter(Boolean)

      return {
        version: 1,
        exported_at: new Date().toISOString(),
        units,
        wastage_reasons,
        materials: materials.map(({ id, ...rest }) => rest),
        material_recipes: Array.from(matRecipeMap.values()),
        product_recipes: Array.from(prodRecipeMap.values()),
        product_variant_recipes: Array.from(pvrMap.values()),
        pos_modifier_rules,
      }
    },

    importMaterialsAndRecipes(payload) {
      const db = getDatabase()
      return importMaterialsAndRecipesPayload(db, payload)
    },
  }
}

export function importMaterialsAndRecipesPayload(db, payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Dữ liệu JSON không hợp lệ')
  }

  return runInTransaction(db, () => {
    let addedMaterials = 0
    let addedProductRecipes = 0
    let addedMaterialRecipes = 0

    // 1. Units
    if (Array.isArray(payload.units)) {
      const insUnit = db.prepare('INSERT OR IGNORE INTO measurement_units (id, name, sort_order, active) VALUES (?, ?, ?, 1)')
      for (const u of payload.units) {
        if (u?.name) insUnit.run(crypto.randomUUID(), String(u.name).trim(), Number(u.sort_order) || 0)
      }
    }

    // 2. Wastage reasons
    if (Array.isArray(payload.wastage_reasons)) {
      const insReason = db.prepare('INSERT OR IGNORE INTO wastage_reasons (id, name, color, sort_order, active) VALUES (?, ?, ?, ?, 1)')
      for (const r of payload.wastage_reasons) {
        if (r?.name) insReason.run(crypto.randomUUID(), String(r.name).trim(), r.color || '#d97706', Number(r.sort_order) || 0)
      }
    }

    // 3. Materials (match by normalized name)
    const existingMats = db.prepare('SELECT id, name FROM materials').all()
    const matNameToId = new Map()
    for (const m of existingMats) {
      matNameToId.set(normalizeTextForBom(m.name), m.id)
    }

    if (Array.isArray(payload.materials)) {
      const insMat = db.prepare(`
        INSERT INTO materials (
          id, code, name, item_type, unit, purchase_unit, conversion_factor,
          yield_qty, deduction_mode, current_stock, min_stock, unit_cost, active, note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
      `)
      for (const m of payload.materials) {
        if (!m?.name) continue
        const norm = normalizeTextForBom(m.name)
        if (!matNameToId.has(norm)) {
          const id = crypto.randomUUID()
          insMat.run(
            id,
            m.code || null,
            String(m.name).trim(),
            m.item_type === 'SEMI_FINISHED' ? 'SEMI_FINISHED' : 'RAW',
            m.unit || 'ml',
            m.purchase_unit || m.unit || 'ml',
            Number(m.conversion_factor) || 1,
            Number(m.yield_qty) || 1,
            m.deduction_mode === 'BATCH_STOCK' ? 'BATCH_STOCK' : 'EXPLODE_ON_SALE',
            Number(m.min_stock) || 0,
            Number(m.unit_cost) || 0,
            m.active === 0 || m.active === false ? 0 : 1,
            m.note || null
          )
          matNameToId.set(norm, id)
          addedMaterials++
        }
      }
    }

    // 4. Material recipes (semi-finished) - chỉ thêm nếu nguyên liệu cha chưa có công thức
    if (Array.isArray(payload.material_recipes)) {
      const checkMri = db.prepare('SELECT count(*) as c FROM material_recipe_items WHERE parent_material_id = ?')
      const insMri = db.prepare('INSERT OR IGNORE INTO material_recipe_items (id, parent_material_id, ingredient_material_id, quantity, note) VALUES (?, ?, ?, ?, ?)')
      for (const mr of payload.material_recipes) {
        const parentId = matNameToId.get(normalizeTextForBom(mr.parent_name))
        if (!parentId || !Array.isArray(mr.items)) continue
        const existing = checkMri.get(parentId)
        if (existing && existing.c > 0) continue
        let anyInserted = false
        for (const item of mr.items) {
          const ingId = matNameToId.get(normalizeTextForBom(item.ingredient_name))
          if (!ingId || ingId === parentId) continue
          insMri.run(crypto.randomUUID(), parentId, ingId, Number(item.quantity) || 0, item.note || null)
          anyInserted = true
        }
        if (anyInserted) addedMaterialRecipes++
      }
    }

    // 5. Product recipes (match product by normalized name) - chỉ thêm nếu món chưa có công thức
    const allProducts = db.prepare('SELECT id, name FROM products').all()
    const prodNameToId = new Map()
    for (const p of allProducts) {
      prodNameToId.set(normalizeTextForBom(p.name), p.id)
    }

    if (Array.isArray(payload.product_recipes)) {
      const checkPr = db.prepare('SELECT count(*) as c FROM product_recipes WHERE product_id = ?')
      const insPr = db.prepare('INSERT OR IGNORE INTO product_recipes (id, product_id, material_id, quantity, note) VALUES (?, ?, ?, ?, ?)')
      for (const pr of payload.product_recipes) {
        const prodId = prodNameToId.get(normalizeTextForBom(pr.product_name))
        if (!prodId || !Array.isArray(pr.items)) continue
        const existing = checkPr.get(prodId)
        if (existing && existing.c > 0) continue
        let anyInserted = false
        for (const item of pr.items) {
          const matId = matNameToId.get(normalizeTextForBom(item.material_name))
          if (!matId) continue
          insPr.run(crypto.randomUUID(), prodId, matId, Number(item.quantity) || 0, item.note || null)
          anyInserted = true
        }
        if (anyInserted) addedProductRecipes++
      }
    }

    // 6. Product variant recipes
    if (Array.isArray(payload.product_variant_recipes)) {
      const checkPvr = db.prepare('SELECT count(*) as c FROM product_variant_recipes WHERE product_id = ? AND variant_keyword = ?')
      const insPvr = db.prepare('INSERT OR IGNORE INTO product_variant_recipes (id, product_id, variant_keyword, material_id, quantity, note) VALUES (?, ?, ?, ?, ?, ?)')
      for (const pvr of payload.product_variant_recipes) {
        const prodId = prodNameToId.get(normalizeTextForBom(pvr.product_name))
        if (!prodId || !pvr.variant_keyword || !Array.isArray(pvr.items)) continue
        const existing = checkPvr.get(prodId, pvr.variant_keyword)
        if (existing && existing.c > 0) continue
        for (const item of pvr.items) {
          const matId = matNameToId.get(normalizeTextForBom(item.material_name))
          if (!matId) continue
          insPvr.run(crypto.randomUUID(), prodId, pvr.variant_keyword, matId, Number(item.quantity) || 0, item.note || null)
        }
      }
    }

    // 7. POS modifier rules
    if (Array.isArray(payload.pos_modifier_rules)) {
      const checkMod = db.prepare('SELECT id FROM pos_modifier_rules WHERE LOWER(keyword) = LOWER(?) AND material_id = ?')
      const insMod = db.prepare('INSERT INTO pos_modifier_rules (id, keyword, material_id, delta_qty, active, note) VALUES (?, ?, ?, ?, ?, ?)')
      for (const rule of payload.pos_modifier_rules) {
        const matId = matNameToId.get(normalizeTextForBom(rule.material_name))
        if (!matId || !rule.keyword) continue
        if (checkMod.get(rule.keyword, matId)) continue
        insMod.run(crypto.randomUUID(), rule.keyword, matId, Number(rule.delta_qty) || 0, rule.active === false ? 0 : 1, rule.note || null)
      }
    }

    return {
      success: true,
      addedMaterials,
      addedMaterialRecipes,
      addedProductRecipes,
    }
  })
}
