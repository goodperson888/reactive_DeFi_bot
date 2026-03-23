// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockLending
 * @notice 模拟借贷协议，用于演示清算场景
 * @dev 部署在 Origin 链（Sepolia），RC 监听此合约的事件
 */
contract MockLending {
    // ─── 事件 ──────────────────────────────────────────────────────────────────

    /// @notice 健康度变化事件（RC 监听此事件触发清算）
    event HealthFactorUpdated(
        address indexed user,
        uint256 healthFactor,      // 1e18 = 1.0
        uint256 totalCollateral,   // USD 价值（1e18）
        uint256 totalDebt          // USD 价值（1e18）
    );

    /// @notice 清算事件
    event Liquidated(
        address indexed user,
        address indexed liquidator,
        uint256 debtRepaid,
        uint256 collateralSeized
    );

    // ─── 状态变量 ──────────────────────────────────────────────────────────────

    struct Position {
        uint256 collateral;  // 抵押品数量（ETH，单位 wei）
        uint256 debt;        // 债务数量（USDC，单位 1e6）
    }

    mapping(address => Position) public positions;

    // 价格（模拟预言机）
    uint256 public ethPrice = 3000e18;  // $3000 per ETH
    uint256 public constant LIQUIDATION_BONUS = 105; // 5% 清算奖励
    uint256 public constant LIQUIDATION_THRESHOLD = 80; // 80% 抵押率

    // ─── 核心功能 ──────────────────────────────────────────────────────────────

    /// @notice 存入抵押品（ETH）
    function deposit() external payable {
        positions[msg.sender].collateral += msg.value;
        _updateHealthFactor(msg.sender);
    }

    /// @notice 借款（USDC）
    function borrow(uint256 amount) external {
        positions[msg.sender].debt += amount;
        _updateHealthFactor(msg.sender);
        require(getHealthFactor(msg.sender) >= 1e18, "Health factor too low");
    }

    /// @notice 还款
    function repay(uint256 amount) external {
        require(positions[msg.sender].debt >= amount, "Repay too much");
        positions[msg.sender].debt -= amount;
        _updateHealthFactor(msg.sender);
    }

    /// @notice 清算（任何人可调用）
    function liquidate(address user, uint256 debtToCover) external payable {
        require(getHealthFactor(user) < 1e18, "User not liquidatable");

        Position storage pos = positions[user];
        require(debtToCover <= pos.debt, "Debt to cover exceeds user debt");

        // 计算可获得的抵押品（含奖励）
        uint256 collateralValue = (debtToCover * 1e18) / ethPrice;
        uint256 collateralToSeize = (collateralValue * LIQUIDATION_BONUS) / 100;

        require(collateralToSeize <= pos.collateral, "Not enough collateral");

        // 执行清算
        pos.debt -= debtToCover;
        pos.collateral -= collateralToSeize;

        // 转移抵押品给清算人
        payable(msg.sender).transfer(collateralToSeize);

        emit Liquidated(user, msg.sender, debtToCover, collateralToSeize);
        _updateHealthFactor(user);
    }

    // ─── 视图函数 ──────────────────────────────────────────────────────────────

    /// @notice 计算健康度（1e18 = 1.0）
    function getHealthFactor(address user) public view returns (uint256) {
        Position memory pos = positions[user];
        if (pos.debt == 0) return type(uint256).max;

        uint256 collateralValueUSD = (pos.collateral * ethPrice) / 1e18;
        uint256 debtValueUSD = pos.debt * 1e12; // USDC 6 decimals -> 18 decimals
        uint256 maxBorrow = (collateralValueUSD * LIQUIDATION_THRESHOLD) / 100;

        return (maxBorrow * 1e18) / debtValueUSD;
    }

    // ─── 管理员功能（演示用）──────────────────────────────────────────────────

    /// @notice 手动设置价格（模拟价格波动触发清算）
    function setEthPrice(uint256 newPrice) external {
        ethPrice = newPrice;
        // 触发所有用户的健康度更新（实际只更新调用者，简化演示）
        if (positions[msg.sender].debt > 0) {
            _updateHealthFactor(msg.sender);
        }
    }

    // ─── 内部函数 ──────────────────────────────────────────────────────────��───

    function _updateHealthFactor(address user) internal {
        uint256 hf = getHealthFactor(user);
        Position memory pos = positions[user];

        uint256 collateralUSD = (pos.collateral * ethPrice) / 1e18;
        uint256 debtUSD = pos.debt * 1e12;

        emit HealthFactorUpdated(user, hf, collateralUSD, debtUSD);
    }
}
