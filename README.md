# ChainID & Assets — demo INS3212

Demo cho hai đề tài: **Topic 4 – Blockchain-based Identity Management System** và
**Topic 3 – Blockchain technology for tokenizing and managing assets**.

Solidity + Hardhat + ethers.js + MetaMask, giao diện HTML/JS thuần, tối giản, chạy tốt trên điện thoại lẫn máy tính (sáng/tối, Việt/Anh).

## Xem ngay, không cần cài gì

Mở bản online (GitHub Pages của repo này) — trang tự chạy ở **chế độ demo**: một máy ảo Ethereum
mô phỏng ngay trong trình duyệt, có sẵn dữ liệu mẫu và thanh đổi vai Quản trị / An / Bình / Chi / Khách mới.
Không cần MetaMask, không cần ETH. Tài liệu đầy đủ ở đường dẫn `docs/`.

## Chạy trên máy với MetaMask (local)

```bash
npm install
npm test                 # 10 passing
npm run node             # terminal 1 - để nguyên
npm run deploy:local     # terminal 2
npm run serve            # terminal 2 -> http://localhost:5173/?wallet
```

Chỉ muốn xem giao diện: `npm run serve` rồi mở `http://localhost:5173/?demo` (không cần node, không cần ví).

## Testnet Sepolia

Sao chép `.env.example` thành `.env`, điền `SEPOLIA_RPC_URL` và `PRIVATE_KEY` (ví thử nghiệm có
Sepolia ETH), chạy `npm run deploy:sepolia`, rồi commit `frontend/config.js` để bản online dùng được
MetaMask với Sepolia.

## Tài liệu

`docs/index.html`: đề bài, lý thuyết, kiến trúc, giải thích contract, cài MetaMask, deploy Sepolia,
kịch bản demo, lỗi thường gặp, chế độ demo và cách đưa web lên GitHub Pages.

Sửa contract xong nhớ chạy `npm run build:web` để cập nhật `frontend/contracts.js`.
