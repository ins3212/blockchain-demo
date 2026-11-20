// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IdentityRegistry - Sổ đăng ký danh tính trên blockchain (Đề tài 4)
/// @notice Người dùng tự đăng ký danh tính bằng ví của mình; cơ quan xác minh (verifier)
///         duyệt hoặc thu hồi. Thông tin giấy tờ KHÔNG lưu trên chuỗi, chỉ lưu mã băm (hash).
contract IdentityRegistry {
    enum Status {
        None, // chưa đăng ký
        Pending, // đã đăng ký, chờ xác minh
        Verified, // đã được xác minh
        Revoked // bị từ chối / thu hồi
    }

    struct Identity {
        string displayName; // tên hiển thị công khai
        string country; // quốc gia
        bytes32 docHash; // mã băm của giấy tờ (số CCCD + ngày sinh), tính ở trình duyệt
        Status status;
        uint64 registeredAt;
        uint64 updatedAt;
        address verifiedBy; // ai là người xác minh / thu hồi gần nhất
        string note; // lý do thu hồi (nếu có)
    }

    address public owner;
    mapping(address => bool) public isVerifier;

    mapping(address => Identity) private identities;
    mapping(bytes32 => address) public docOwner; // mỗi giấy tờ chỉ gắn với một ví
    address[] private users;

    event IdentityRegistered(address indexed user, string displayName, bytes32 docHash);
    event IdentityVerified(address indexed user, address indexed verifier);
    event IdentityRevoked(address indexed user, address indexed verifier, string reason);
    event VerifierChanged(address indexed account, bool enabled);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyVerifier() {
        require(isVerifier[msg.sender], "Only verifier");
        _;
    }

    constructor() {
        owner = msg.sender;
        isVerifier[msg.sender] = true;
        emit VerifierChanged(msg.sender, true);
    }

    /// @notice Đăng ký (hoặc đăng ký lại sau khi bị thu hồi) danh tính cho chính ví đang gọi.
    function register(string calldata displayName, string calldata country, bytes32 docHash) external {
        Identity storage id = identities[msg.sender];
        require(id.status == Status.None || id.status == Status.Revoked, "Already registered");
        require(bytes(displayName).length > 0 && bytes(displayName).length <= 64, "Invalid name");
        require(docHash != bytes32(0), "Invalid document");
        require(docOwner[docHash] == address(0) || docOwner[docHash] == msg.sender, "Document already used");

        if (id.status == Status.None) {
            users.push(msg.sender);
            id.registeredAt = uint64(block.timestamp);
        } else if (id.docHash != docHash) {
            delete docOwner[id.docHash]; // đăng ký lại bằng giấy tờ khác
        }

        docOwner[docHash] = msg.sender;
        id.displayName = displayName;
        id.country = country;
        id.docHash = docHash;
        id.status = Status.Pending;
        id.updatedAt = uint64(block.timestamp);
        id.verifiedBy = address(0);
        id.note = "";

        emit IdentityRegistered(msg.sender, displayName, docHash);
    }

    /// @notice Cơ quan xác minh duyệt một hồ sơ đang chờ.
    function verify(address user) external onlyVerifier {
        Identity storage id = identities[user];
        require(id.status == Status.Pending, "Not pending");
        id.status = Status.Verified;
        id.updatedAt = uint64(block.timestamp);
        id.verifiedBy = msg.sender;
        emit IdentityVerified(user, msg.sender);
    }

    /// @notice Từ chối hồ sơ đang chờ hoặc thu hồi danh tính đã xác minh.
    function revoke(address user, string calldata reason) external onlyVerifier {
        Identity storage id = identities[user];
        require(id.status == Status.Pending || id.status == Status.Verified, "Nothing to revoke");
        id.status = Status.Revoked;
        id.updatedAt = uint64(block.timestamp);
        id.verifiedBy = msg.sender;
        id.note = reason;
        emit IdentityRevoked(user, msg.sender, reason);
    }

    /// @notice Chủ hệ thống thêm / bớt cơ quan xác minh.
    function setVerifier(address account, bool enabled) external onlyOwner {
        require(account != address(0), "Zero address");
        isVerifier[account] = enabled;
        emit VerifierChanged(account, enabled);
    }

    // ---------- Hàm chỉ đọc (miễn phí, không tốn gas) ----------

    function isVerified(address user) external view returns (bool) {
        return identities[user].status == Status.Verified;
    }

    function getIdentity(address user) external view returns (Identity memory) {
        return identities[user];
    }

    /// @notice Đối chiếu: giấy tờ (đã băm) có đúng là của ví này không?
    function checkDocument(address user, bytes32 docHash) external view returns (bool) {
        Identity storage id = identities[user];
        return id.status != Status.None && id.docHash == docHash;
    }

    function getUsers() external view returns (address[] memory) {
        return users;
    }
}
