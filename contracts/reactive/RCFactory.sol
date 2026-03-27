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
    event RCPaused(address indexed user, address indexed rcAddress);
    event RCResumed(address indexed user, address indexed rcAddress);
    event ParamsUpdated(address indexed user, address indexed rcAddress);

    // ─── 状态变量 ──────────────────────────────────────────────────────────────

    address public owner;
    address public vault;
    address public originLending;      // Origin 链借贷合约（mock 或 Aave）
    address public originDex;          // Origin 链 DEX 合约（mock 或 Uniswap）
    uint256 public originChainId;      // Origin 链 ID（事件源）
    uint256 public destChainId;        // Destination 链 ID（回调目标）
    uint256 public liquidationTopic;   // 清算事件 topic0
    uint256 public arbitrageTopic;     // 套利事件 topic0

    mapping(address => address) public userRC;   // user => UserRC 合约地址
    address[] public allUsers;
    uint256 public activeUserCount;              // 活跃用户数（部署后 +1，停止后 -1）

    // ─── 修饰符 ────────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    // ─── 构造函数 ──────────────────────────────────────────────────────────────

    constructor(
        address _vault,
        address _originLending,
        address _originDex,
        uint256 _originChainId,
        uint256 _destChainId,
        uint256 _liquidationTopic,
        uint256 _arbitrageTopic
    ) {
        owner = msg.sender;
        vault = _vault;
        originLending = _originLending;
        originDex = _originDex;
        originChainId = _originChainId;
        destChainId = _destChainId;
        liquidationTopic = _liquidationTopic;
        arbitrageTopic = _arbitrageTopic;
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
            originLending,
            originDex,
            params,
            originChainId,
            destChainId,
            liquidationTopic,
            arbitrageTopic
        );

        userRC[user] = address(rc);
        allUsers.push(user);
        activeUserCount++;

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
        delete userRC[user];  // 清除映射，允许用户重新部署 RC
        if (activeUserCount > 0) activeUserCount--;
        emit RCStopped(user, rcAddr);
    }

    /**
     * @notice 暂停用户 RC（取消订阅，保留 mapping，不退款，可恢复）
     */
    function pauseRC(address user) external {
        require(msg.sender == owner || msg.sender == user, "Unauthorized");
        address rcAddr = userRC[user];
        require(rcAddr != address(0), "No RC");

        UserRC(payable(rcAddr)).pause();
        emit RCPaused(user, rcAddr);
    }

    /**
     * @notice 恢复用户 RC（重新订阅，不需要重新部署）
     */
    function resumeRC(address user) external {
        require(msg.sender == owner || msg.sender == user, "Unauthorized");
        address rcAddr = userRC[user];
        require(rcAddr != address(0), "No RC");

        UserRC(payable(rcAddr)).resume();
        emit RCResumed(user, rcAddr);
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
        return activeUserCount;
    }

    function getTotalDeployments() external view returns (uint256) {
        return allUsers.length;
    }

    // ─── 管理员 ────────────────────────────────────────────────────────────────

    function setVault(address _vault) external onlyOwner {
        vault = _vault;
    }

    function setOriginContracts(address _originLending, address _originDex) external onlyOwner {
        originLending = _originLending;
        originDex = _originDex;
    }

    receive() external payable {}
}
