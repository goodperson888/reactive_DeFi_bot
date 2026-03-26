// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./UserRC.sol";

/**
 * @title RCFactory
 * @notice 为每个用户部署独立的 UserRC 合约，部署在 Reactive Network
 */
contract RCFactory {
    // ─── 事件 ──────────────────────────────────────────────────────────────────

    event RCDeployed(address indexed user, address indexed rcAddress, uint256 gasFunded);
    event RCStopped(address indexed user, address indexed rcAddress);
    event ParamsUpdated(address indexed user, address indexed rcAddress);

    // ─── 状态变量 ──────────────────────────────────────────────────────────────

    address public owner;
    address public vault;          // UserVault 合约地址（Destination 链）
    address public mockLending;    // Origin 链 MockLending 地址
    address public mockDexA;       // Origin 链 MockDEX 地址

    mapping(address => address) public userRC;   // user => UserRC 合约地址
    address[] public allUsers;

    // ─── 修饰符 ────────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    // ─── 构造函数 ──────────────────────────────────────────────────────────────

    constructor(address _vault, address _mockLending, address _mockDexA) {
        owner = msg.sender;
        vault = _vault;
        mockLending = _mockLending;
        mockDexA = _mockDexA;
    }

    // ─── 核心：部署用户 RC ─────────────────────────────────────────────────────

    /**
     * @notice 用户为自己部署 UserRC，附带的 ETH 全部充值到 RC 作为 gas 储备
     * @dev 任何人可调用，msg.sender 即为用户，msg.value 即为 RC gas 预算
     * @param params 用户策略参数
     */
    function deployRC(
        UserRC.StrategyParams calldata params
    ) external payable {
        require(userRC[msg.sender] == address(0), "RC already exists");
        require(msg.value > 0, "Must fund RC gas");
        address user = msg.sender;

        // 部署 UserRC，把收到的 ETH 全部转入 RC 作为 gas 储备
        UserRC rc = new UserRC{value: msg.value}(
            user,
            vault,
            mockLending,
            mockDexA,
            params
        );

        userRC[user] = address(rc);
        allUsers.push(user);

        emit RCDeployed(user, address(rc), msg.value);
    }

    /**
     * @notice 停止用户 RC（退回剩余 ETH 给用户）
     */
    function stopRC(address user) external {
        require(msg.sender == owner || msg.sender == user, "Unauthorized");
        address rcAddr = userRC[user];
        require(rcAddr != address(0), "No RC");

        UserRC(payable(rcAddr)).stop();
        emit RCStopped(user, rcAddr);
    }

    /**
     * @notice 更新用户策略参数（同步到 RC）
     */
    function updateParams(
        address user,
        UserRC.StrategyParams calldata params
    ) external {
        require(msg.sender == owner || msg.sender == user, "Unauthorized");
        address rcAddr = userRC[user];
        require(rcAddr != address(0), "No RC");

        UserRC(payable(rcAddr)).updateParams(params);
        emit ParamsUpdated(user, rcAddr);
    }

    /**
     * @notice 给用户 RC 补充 gas（充值 ETH）
     */
    function topUpRC(address user) external payable {
        address rcAddr = userRC[user];
        require(rcAddr != address(0), "No RC");
        require(msg.value > 0, "Zero value");

        (bool ok,) = payable(rcAddr).call{value: msg.value}("");
        require(ok, "Top up failed");
    }

    // ─── 查询 ──────────────────────────────────────────────────────────────────

    function getRCAddress(address user) external view returns (address) {
        return userRC[user];
    }

    function getRCBalance(address user) external view returns (uint256) {
        address rcAddr = userRC[user];
        if (rcAddr == address(0)) return 0;
        return rcAddr.balance;
    }

    function getUserCount() external view returns (uint256) {
        return allUsers.length;
    }

    // ─── 管理员 ────────────────────────────────────────────────────────────────

    function setVault(address _vault) external onlyOwner {
        vault = _vault;
    }

    function setOriginContracts(address _mockLending, address _mockDexA) external onlyOwner {
        mockLending = _mockLending;
        mockDexA = _mockDexA;
    }

    receive() external payable {}
}
