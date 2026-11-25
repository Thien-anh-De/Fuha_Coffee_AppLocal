const fs = require('fs')

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
      { name: 'Americano đá (M)', price: 30000 }, { name: 'Americano đá (L)', price: 40000 },
      { name: 'Americano chanh vàng (M)', price: 35000 }, { name: 'Americano chanh vàng (L)', price: 45000 },
      { name: 'Americano đào (M)', price: 35000 }, { name: 'Americano đào (L)', price: 45000 },
      { name: 'Cold Brew đá (M)', price: 30000 }, { name: 'Cold Brew đá (L)', price: 40000 },
      { name: 'Cold Brew chanh vàng (M)', price: 35000 }, { name: 'Cold Brew chanh vàng (L)', price: 45000 },
      { name: 'Cold Brew đào (M)', price: 35000 }, { name: 'Cold Brew đào (L)', price: 45000 }
    ]
  },
  {
    id: 'cat-tra-trai-cay', name: 'Trà Trái Cây', sort_order: 3,
    items: [
      { name: 'Trà xoài nhiệt đới (M)', price: 30000 }, { name: 'Trà xoài nhiệt đới (L)', price: 40000 },
      { name: 'Trà dâu nam mỹ (M)', price: 30000 }, { name: 'Trà dâu nam mỹ (L)', price: 40000 },
      { name: 'Trà ổi hồng (M)', price: 30000 }, { name: 'Trà ổi hồng (L)', price: 40000 },
      { name: 'Trà vải lài (M)', price: 30000 }, { name: 'Trà vải lài (L)', price: 40000 },
      { name: 'Trà việt quất (M)', price: 30000 }, { name: 'Trà việt quất (L)', price: 40000 },
      { name: 'Trà chanh vàng (M)', price: 30000 }, { name: 'Trà chanh vàng (L)', price: 40000 },
      { name: 'Trà đào cam sả (M)', price: 35000 }, { name: 'Trà đào cam sả (L)', price: 45000 },
      { name: 'Trà chanh/ Trà tắc nha đam (M)', price: 25000 }, { name: 'Trà chanh/ Trà tắc nha đam (L)', price: 35000 }
    ]
  },
  {
    id: 'cat-tra-sua', name: 'Trà Sữa', sort_order: 4,
    items: [
      { name: 'Trà sữa trân châu (M)', price: 30000 }, { name: 'Trà sữa trân châu (L)', price: 40000 },
      { name: 'Trà sữa kem trứng (M)', price: 35000 }, { name: 'Trà sữa kem trứng (L)', price: 45000 },
      { name: 'Trà sữa kem muối (M)', price: 35000 }, { name: 'Trà sữa kem muối (L)', price: 45000 },
      { name: 'Trà sữa khoai môn (M)', price: 35000 }, { name: 'Trà sữa khoai môn (L)', price: 45000 },
      { name: 'Trà sữa bạc hà (M)', price: 35000 }, { name: 'Trà sữa bạc hà (L)', price: 45000 },
      { name: 'Sữa tươi trân châu đường đen (M)', price: 40000 }, { name: 'Sữa tươi trân châu đường đen (L)', price: 50000 }
    ]
  },
  {
    id: 'cat-sua-chua', name: 'Sữa Chua', sort_order: 5,
    items: [
      { name: 'Sữa chua lắc đá (M)', price: 25000 }, { name: 'Sữa chua lắc đá (L)', price: 35000 },
      { name: 'Sữa chua lắc xoài (M)', price: 30000 }, { name: 'Sữa chua lắc xoài (L)', price: 40000 },
      { name: 'Sữa chua lắc dâu (M)', price: 30000 }, { name: 'Sữa chua lắc dâu (L)', price: 40000 },
      { name: 'Sữa chua lắc ổi (M)', price: 30000 }, { name: 'Sữa chua lắc ổi (L)', price: 40000 },
      { name: 'Sữa chua lắc vải (M)', price: 30000 }, { name: 'Sữa chua lắc vải (L)', price: 40000 },
      { name: 'Sữa chua lắc việt quất (M)', price: 30000 }, { name: 'Sữa chua lắc việt quất (L)', price: 40000 },
      { name: 'Sữa chua lắc cafe (M)', price: 30000 }, { name: 'Sữa chua lắc cafe (L)', price: 40000 }
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
      { name: 'Matcha latte (M)', price: 30000 }, { name: 'Matcha latte (L)', price: 40000 },
      { name: 'Matcha kem muối (M)', price: 35000 }, { name: 'Matcha kem muối (L)', price: 45000 },
      { name: 'Matcha cam (M)', price: 40000 }, { name: 'Matcha cam (L)', price: 50000 },
      { name: 'Matcha caramel (M)', price: 35000 }, { name: 'Matcha caramel (L)', price: 45000 },
      { name: 'Cacao nóng/đá (M)', price: 30000 }, { name: 'Cacao nóng/đá (L)', price: 40000 },
      { name: 'Cacao kem muối (M)', price: 35000 }, { name: 'Cacao kem muối (L)', price: 45000 },
      { name: 'Cacao latte (M)', price: 35000 }, { name: 'Cacao latte (L)', price: 45000 },
      { name: 'Cacao bạc hà (M)', price: 35000 }, { name: 'Cacao bạc hà (L)', price: 45000 },
      { name: 'Khoai môn latte (M)', price: 30000 }, { name: 'Khoai môn latte (L)', price: 40000 },
      { name: 'Khoai môn sữa dừa (M)', price: 35000 }, { name: 'Khoai môn sữa dừa (L)', price: 45000 },
      { name: 'Khoai môn kem muối (M)', price: 35000 }, { name: 'Khoai môn kem muối (L)', price: 45000 }
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
];

let dbContent = fs.readFileSync('electron/database.js', 'utf8');

// The lines to replace start with "const seedCategories =" and end before "let pSort = 1" or similar
const startMarker = 'const seedCategories = [';
const endMarker = '    let pSort = 1\n'; // wait, let me check database.js exact content below seedCategories

// I will just use regex to replace it
let replaced = dbContent.replace(/const seedCategories = \[[\s\S]*?\]\s*let pSort = 1/, `const seedCategories = ${JSON.stringify(seedCategories, null, 4)}\n\n    let pSort = 1`);

fs.writeFileSync('electron/database.js', replaced);
console.log('Successfully updated database.js');
