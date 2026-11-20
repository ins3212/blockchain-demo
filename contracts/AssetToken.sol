// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IIdentityRegistry {
    function isVerified(address user) external view returns (bool);
}

/// @title AssetToken - Token hoá và quản lý tài sản (Đề tài 3)
/// @notice Mỗi tài sản thật (căn hộ, vàng, tranh...) được chia thành nhiều "cổ phần" (token).
///         Người đã xác minh danh tính có thể mua, chuyển nhượng cổ phần và nhận thu nhập
///         (ví dụ tiền cho thuê) theo đúng tỷ lệ sở hữu.
contract AssetToken {
    struct Asset {
        string name;
        string category; // realestate | gold | art | vehicle | other
        string description;
        uint256 totalShares; // tổng số cổ phần
        uint256 sharesSold; // số cổ phần đã bán
        uint256 pricePerShare; // giá mỗi cổ phần (wei)
        bool saleOpen; // đang mở bán?
        uint256 totalIncome; // tổng thu nhập đã chia (wei)
        uint64 createdAt;
    }

    uint256 private constant PRECISION = 1e18;

    address public owner;
    IIdentityRegistry public immutable registry;
    uint256 public saleProceeds; // tiền bán cổ phần chờ đơn vị phát hành rút

    Asset[] private assets;
    mapping(uint256 => mapping(address => uint256)) public balanceOf; // assetId => ví => số cổ phần
    mapping(uint256 => address[]) private holders;
    mapping(uint256 => mapping(address => bool)) private isHolder;

    // Kế toán chia thu nhập: thu nhập luỹ kế trên mỗi cổ phần (nhân PRECISION)
    mapping(uint256 => uint256) private incomePerShare;
    mapping(uint256 => mapping(address => uint256)) private incomeDebt;
    mapping(uint256 => mapping(address => uint256)) private pendingIncome;

    event AssetCreated(uint256 indexed assetId, string name, uint256 totalShares, uint256 pricePerShare);
    event SharesPurchased(uint256 indexed assetId, address indexed buyer, uint256 amount, uint256 cost);
    event SharesTransferred(uint256 indexed assetId, address indexed from, address indexed to, uint256 amount);
    event IncomeDistributed(uint256 indexed assetId, uint256 amount);
    event IncomeClaimed(uint256 indexed assetId, address indexed holder, uint256 amount);
    event SaleStatusChanged(uint256 indexed assetId, bool open);
    event ProceedsWithdrawn(address indexed to, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyVerified() {
        require(registry.isVerified(msg.sender), "Identity not verified");
        _;
    }

    modifier exists(uint256 assetId) {
        require(assetId < assets.length, "Asset not found");
        _;
    }

    constructor(address registryAddress) {
        require(registryAddress != address(0), "Zero address");
        owner = msg.sender;
        registry = IIdentityRegistry(registryAddress);
    }

    // ---------- Đơn vị phát hành ----------

    /// @notice Token hoá một tài sản: tạo hồ sơ tài sản và chia thành `totalShares` cổ phần.
    function createAsset(
        string calldata name,
        string calldata category,
        string calldata description,
        uint256 totalShares,
        uint256 pricePerShare
    ) external onlyOwner returns (uint256 assetId) {
        require(bytes(name).length > 0 && bytes(name).length <= 64, "Invalid name");
        require(totalShares > 0 && totalShares <= 1_000_000, "Invalid shares");
        require(pricePerShare > 0, "Invalid price");

        assetId = assets.length;
        assets.push(
            Asset({
                name: name,
                category: category,
                description: description,
                totalShares: totalShares,
                sharesSold: 0,
                pricePerShare: pricePerShare,
                saleOpen: true,
                totalIncome: 0,
                createdAt: uint64(block.timestamp)
            })
        );
        emit AssetCreated(assetId, name, totalShares, pricePerShare);
    }

    function setSaleOpen(uint256 assetId, bool open) external onlyOwner exists(assetId) {
        assets[assetId].saleOpen = open;
        emit SaleStatusChanged(assetId, open);
    }

    /// @notice Nạp thu nhập của tài sản (vd tiền cho thuê) để chia cho những người đang giữ cổ phần.
    function distributeIncome(uint256 assetId) external payable onlyOwner exists(assetId) {
        Asset storage a = assets[assetId];
        require(msg.value > 0, "No value");
        require(a.sharesSold > 0, "No holders yet");
        incomePerShare[assetId] += (msg.value * PRECISION) / a.sharesSold;
        a.totalIncome += msg.value;
        emit IncomeDistributed(assetId, msg.value);
    }

    function withdrawProceeds() external onlyOwner {
        uint256 amount = saleProceeds;
        require(amount > 0, "Nothing to withdraw");
        saleProceeds = 0;
        (bool ok, ) = owner.call{value: amount}("");
        require(ok, "Transfer failed");
        emit ProceedsWithdrawn(owner, amount);
    }

    // ---------- Nhà đầu tư ----------

    /// @notice Mua cổ phần còn lại của tài sản. Phải gửi đúng số ETH = số lượng x giá.
    function buyShares(uint256 assetId, uint256 amount) external payable onlyVerified exists(assetId) {
        Asset storage a = assets[assetId];
        require(a.saleOpen, "Sale closed");
        require(amount > 0, "Invalid amount");
        require(amount <= a.totalShares - a.sharesSold, "Not enough shares left");
        require(msg.value == amount * a.pricePerShare, "Wrong payment");

        _settle(assetId, msg.sender);
        a.sharesSold += amount;
        balanceOf[assetId][msg.sender] += amount;
        saleProceeds += msg.value;
        _trackHolder(assetId, msg.sender);

        emit SharesPurchased(assetId, msg.sender, amount, msg.value);
    }

    /// @notice Chuyển nhượng cổ phần cho ví khác. Cả hai bên đều phải đã xác minh danh tính.
    function transferShares(uint256 assetId, address to, uint256 amount) external onlyVerified exists(assetId) {
        require(to != address(0) && to != msg.sender, "Invalid recipient");
        require(registry.isVerified(to), "Recipient not verified");
        require(amount > 0 && balanceOf[assetId][msg.sender] >= amount, "Insufficient shares");

        _settle(assetId, msg.sender);
        _settle(assetId, to);
        balanceOf[assetId][msg.sender] -= amount;
        balanceOf[assetId][to] += amount;
        _trackHolder(assetId, to);

        emit SharesTransferred(assetId, msg.sender, to, amount);
    }

    /// @notice Rút phần thu nhập được chia của mình.
    function claimIncome(uint256 assetId) external exists(assetId) {
        _settle(assetId, msg.sender);
        uint256 amount = pendingIncome[assetId][msg.sender];
        require(amount > 0, "Nothing to claim");
        pendingIncome[assetId][msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "Transfer failed");
        emit IncomeClaimed(assetId, msg.sender, amount);
    }

    // ---------- Hàm chỉ đọc ----------

    function assetCount() external view returns (uint256) {
        return assets.length;
    }

    function getAssets() external view returns (Asset[] memory) {
        return assets;
    }

    function claimableIncome(uint256 assetId, address holder) public view returns (uint256) {
        uint256 delta = incomePerShare[assetId] - incomeDebt[assetId][holder];
        return pendingIncome[assetId][holder] + (balanceOf[assetId][holder] * delta) / PRECISION;
    }

    /// @notice Danh sách người đang giữ cổ phần và số lượng tương ứng.
    function getHolders(uint256 assetId)
        external
        view
        exists(assetId)
        returns (address[] memory accounts, uint256[] memory shares)
    {
        accounts = holders[assetId];
        shares = new uint256[](accounts.length);
        for (uint256 i = 0; i < accounts.length; i++) {
            shares[i] = balanceOf[assetId][accounts[i]];
        }
    }

    // ---------- Nội bộ ----------

    /// @dev Chốt phần thu nhập đã phát sinh trước khi số dư cổ phần thay đổi.
    function _settle(uint256 assetId, address holder) private {
        pendingIncome[assetId][holder] = claimableIncome(assetId, holder);
        incomeDebt[assetId][holder] = incomePerShare[assetId];
    }

    function _trackHolder(uint256 assetId, address holder) private {
        if (!isHolder[assetId][holder]) {
            isHolder[assetId][holder] = true;
            holders[assetId].push(holder);
        }
    }
}
