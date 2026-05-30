// Генерация QR-кода со ссылкой на приложение.
// Использование:
//   node scripts/make-qr.js https://ваш-сайт.vercel.app
// Создаст файл scripts/qr.png (можно печатать на табличке для гостей).

const QRCode = require("qrcode");
const path = require("path");

const url = process.argv[2];
if (!url) {
  console.error("Укажите ссылку: node scripts/make-qr.js https://ваш-сайт.vercel.app");
  process.exit(1);
}

const out = path.join(__dirname, "qr.png");

QRCode.toFile(
  out,
  url,
  { width: 1200, margin: 2, color: { dark: "#3a322b", light: "#ffffff" } },
  (err) => {
    if (err) {
      console.error("Ошибка:", err.message);
      process.exit(1);
    }
    console.log("QR-код сохранён:", out);
    console.log("Ссылка:", url);
  }
);
