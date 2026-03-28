// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/ISwapRouter.sol";
import "../interfaces/IWETH.sol";
import "../interfaces/IERC20.sol";

interface IPayable {
    function debt(address contractAddress) external view returns (uint256);
}

/**
 * @title UserVault
 * @notice 用户资金管理合约，部署在 Destination 链（Base Sepolia）
 * @dev 每个用户独立仓位，提款时抽取利润佣金
 */
contract UserVault {
    // ─── 数据结构 ──────────────────────────────────────────────────────────────

    struct StrategyParams {
        uint256 healthFactorThreshold; // 清算触发阈值，e.g. 1.05e18
        uint256 spreadThreshold;       // 套利价差阈值 basis points，e.g. 100 = 1%
        uint256 maxPositionPct;        // 单次最大仓位比例，e.g. 20 = 20%
        uint256 slippagePct;           // 滑点容忍度，e.g. 2 = 2%
        uint256 maxGasGwei;            // 最大 Gas 价格（Gwei）
        uint256 maxConsecutiveLosses;  // 连续亏损停机阈值
        bool enableLiquidation;        // 是否启用清算
        bool enableArbitrage;          // 是否启用套利
    }

    struct Position {
        uint256 balance;               // 当前余额（本金 + 利润）
        uint256 totalDeposited;        // 累计存入本金（用于计算利润）
        uint256 totalProfit;           // 累计已实现利润
        uint256 consecutiveLosses;     // 当前连续亏损次数
        uint256 executionCount;        // 总执行次数
        StrategyParams params;         // 用户策略参数
        bool isActive;                 // 策略是否运行中
        address rcAddress;             // 对应的 UserRC 合约地址
    }

    // ─── 默认策略参数 ──────────────────────────────────────────────────────────

    StrategyParams public defaultParams = StrategyParams({
        healthFactorThreshold: 105e16, // 1.05
        spreadThreshold:       100,    // 1.0%
        maxPositionPct:        20,
        slippagePct:           2,
        maxGasGwei:            50,
        maxConsecutiveLosses:  3,
        enableLiquidation:     true,
        enableArbitrage:       true
    });

    // ─── 事件 ──────────────────────────────────────────────────────────────────

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount, uint256 fee);
    event StrategyUpdated(address indexed user);
    event StrategyPaused(address indexed user);
    event StrategyResumed(address indexed user);
    event ExecutionResult(
        address indexed user,
        string strategyType,
        bool success,
        uint256 profit,
        uint256 loss
    );
    event RCRegistered(address indexed user, address indexed rcAddress);
    event FeeCollected(address indexed treasury, uint256 amount);

    // ─── 状态变量 ──────────────────────────────────────────────────────────────

    address public owner;
    address public treasury;
    address public rcFactory;
    address public reactiveCallbackSender; // Reactive Network 回调 sender（测试网/主网）

    // ─── 协议模式 ────────────────────────────────────────────────────────────
    uint8 public protocolMode;  // 0=mock（模拟结算）, 1=real（真实 Uniswap/Aave 执行）

    // ─── 真实协议地址（protocolMode=1 时使用）────────────────────────────────
    address public swapRouter;   // Uniswap V3 SwapRouter
    address public weth;         // WETH 合约
    address public stableToken;  // 稳定币（USDC）
    uint24  public swapFeeTier;  // Uniswap V3 手续费档位（500=0.05%, 3000=0.3%, 10000=1%）

    uint256 public feeRate = 2000;     // 20% = 2000 basis points
    uint256 public constant FEE_BASE = 10000;

    uint256 public totalTVL;
    uint256 public totalFeesCollected;

    mapping(address => Position) public positions;
    address[] public users;            // 所有注册用户列表

    // ─── 修饰符 ────────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyRC(address user) {
        require(
            msg.sender == positions[user].rcAddress ||
            msg.sender == rcFactory ||
            (reactiveCallbackSender != address(0) && msg.sender == reactiveCallbackSender),
            "Only user RC"
        );
        _;
    }

    modifier hasPosition(address user) {
        require(positions[user].totalDeposited > 0, "No position");
        _;
    }

    // ─── 构造函数 ──────────────────────────────────────────────────────────────

    constructor(address _treasury, address _reactiveCallbackSender) {
        owner = msg.sender;
        treasury = _treasury;
        reactiveCallbackSender = _reactiveCallbackSender;
    }

    // ─── 用户操作 ──────────────────────────────────────────────────────────────

    /**
     * @notice 存款并初始化仓位（首次调用创建仓位）
     */
    function deposit() external payable {
        require(msg.value > 0, "Zero deposit");

        Position storage pos = positions[msg.sender];

        if (pos.totalDeposited == 0) {
            // 首次存款，初始化默认参数
            pos.params = defaultParams;
            users.push(msg.sender);
        }

        pos.balance += msg.value;
        pos.totalDeposited += msg.value;
        totalTVL += msg.value;

        emit Deposited(msg.sender, msg.value);
    }

    /**
     * @notice 提款，自动扣除利润佣金
     * @param amount 提款金额（0 = 全部提取）
     */
    function withdraw(uint256 amount) external hasPosition(msg.sender) {
        Position storage pos = positions[msg.sender];
        require(!pos.isActive, "Pause strategy first");

        uint256 withdrawAmount = amount == 0 ? pos.balance : amount;
        require(withdrawAmount <= pos.balance, "Insufficient balance");

        // 计算利润和佣金
        uint256 fee = 0;
        if (pos.balance > pos.totalDeposited) {
            uint256 profit = pos.balance - pos.totalDeposited;
            // 按比例计算本次提款对应的利润
            uint256 profitShare = (profit * withdrawAmount) / pos.balance;
            fee = (profitShare * feeRate) / FEE_BASE;
        }

        uint256 userAmount = withdrawAmount - fee;

        pos.balance -= withdrawAmount;
        if (pos.balance < pos.totalDeposited) {
            pos.totalDeposited = pos.balance;
        }
        totalTVL -= withdrawAmount;

        if (fee > 0) {
            totalFeesCollected += fee;
            (bool feeOk,) = payable(treasury).call{value: fee}("");
            require(feeOk, "Fee transfer failed");
            emit FeeCollected(treasury, fee);
        }

        (bool ok,) = payable(msg.sender).call{value: userAmount}("");
        require(ok, "Transfer failed");

        emit Withdrawn(msg.sender, userAmount, fee);
    }

    /**
     * @notice 更新策略参数
     */
    function updateStrategy(StrategyParams calldata params) external hasPosition(msg.sender) {
        require(params.maxPositionPct <= 100, "Invalid position pct");
        require(params.slippagePct <= 50, "Invalid slippage");
        require(params.maxConsecutiveLosses > 0, "Invalid loss threshold");

        positions[msg.sender].params = params;
        emit StrategyUpdated(msg.sender);
    }

    /**
     * @notice 暂停策略
     */
    function pauseStrategy() external hasPosition(msg.sender) {
        positions[msg.sender].isActive = false;
        emit StrategyPaused(msg.sender);
    }

    /**
     * @notice 恢复策略
     */
    function resumeStrategy() external hasPosition(msg.sender) {
        require(positions[msg.sender].rcAddress != address(0), "RC not deployed");
        positions[msg.sender].isActive = true;
        positions[msg.sender].consecutiveLosses = 0;
        emit StrategyResumed(msg.sender);
    }

    // ─── RC 调用（由 UserRC 跨链触发）────────────────────────────────────────

    /**
     * @notice 记录执行结果，更新用户余额
     * @dev 由对应的 UserRC 合约调用
     */
    function recordExecution(
        address user,
        string calldata strategyType,
        bool success,
        uint256 profit,
        uint256 loss
    ) external onlyRC(user) hasPosition(user) {
        _applyExecutionResult(user, strategyType, success, profit, loss);
    }

    /**
     * @notice 注册用户的 RC 地址（由 RCFactory 调用）
     */
    function registerRC(address user, address rcAddress) external {
        require(msg.sender == rcFactory || msg.sender == owner, "Unauthorized");
        positions[user].rcAddress = rcAddress;
        positions[user].isActive = true;
        emit RCRegistered(user, rcAddress);
    }

    /**
     * @notice 用户手动同步自己的 RC 地址
     * @dev RCFactory 部署在 Reactive 链，无法直接回写 Destination 链状态，因此提供用户自同步入口
     */
    function syncUserRC(address rcAddress) external hasPosition(msg.sender) {
        require(rcAddress != address(0), "Invalid RC");
        positions[msg.sender].rcAddress = rcAddress;
        positions[msg.sender].isActive = true;
        emit RCRegistered(msg.sender, rcAddress);
    }

    /**
     * @notice 由用户 RC 在 Destination 链回调执行
     * @dev 当前采用链上模拟结算，便于 mock 模式下演示前端用户流闭环
     */
    function executeForUser(
        address, /* rvmId */
        address user,
        string calldata strategyType,
        address, /* targetContract */
        address, /* targetUser */
        uint256 amountHint
    ) external onlyRC(user) hasPosition(user) returns (bool success) {
        Position storage pos = positions[user];

        if (!pos.isActive || pos.balance == 0) {
            _applyExecutionResult(user, strategyType, false, 0, 0);
            return false;
        }

        if (protocolMode == 1) {
            return _executeReal(user, strategyType, amountHint);
        }

        // ── mock 模式：模拟结算 ──
        (bool enabled, uint256 profitBps) = _resolveStrategySimulation(pos.params, strategyType);
        if (!enabled) {
            _applyExecutionResult(user, strategyType, false, 0, 0);
            return false;
        }

        uint256 executionBase = _executionBase(pos.balance, pos.params.maxPositionPct, amountHint);
        uint256 profit = (executionBase * profitBps) / FEE_BASE;
        if (profit == 0 && executionBase > 0) profit = 1;

        _applyExecutionResult(user, strategyType, true, profit, 0);
        return true;
    }

    function pay(uint256 amount) external {
        require(msg.sender == reactiveCallbackSender, "Authorized sender only");
        _payReactiveDebt(payable(msg.sender), amount);
    }

    function coverDebt() external {
        require(reactiveCallbackSender != address(0), "Callback sender not set");
        uint256 amount = IPayable(reactiveCallbackSender).debt(address(this));
        _payReactiveDebt(payable(reactiveCallbackSender), amount);
    }

    // ─── 真实协议执行（Uniswap V3）─────────────────────────────────────────

    function _executeReal(
        address user,
        string calldata strategyType,
        uint256 amountHint
    ) internal returns (bool) {
        Position storage pos = positions[user];
        uint256 executionBase = _executionBase(pos.balance, pos.params.maxPositionPct, amountHint);
        if (executionBase == 0) {
            _applyExecutionResult(user, strategyType, false, 0, 0);
            return false;
        }

        // 从用户余额扣除执行金额
        pos.balance -= executionBase;
        totalTVL -= executionBase;

        // Wrap ETH → WETH
        IWETH(weth).deposit{value: executionBase}();
        IERC20(weth).approve(swapRouter, executionBase);

        // 计算最小输出（滑点保护）
        uint256 minOut = (executionBase * (100 - pos.params.slippagePct)) / 100;

        // Swap WETH → stableToken
        uint256 stableReceived;
        try ISwapRouter(swapRouter).exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: weth,
                tokenOut: stableToken,
                fee: swapFeeTier,
                recipient: address(this),
                amountIn: executionBase,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            })
        ) returns (uint256 amountOut) {
            stableReceived = amountOut;
        } catch {
            // swap 失败，退回 ETH
            IWETH(weth).withdraw(executionBase);
            pos.balance += executionBase;
            totalTVL += executionBase;
            _applyExecutionResult(user, strategyType, false, 0, 0);
            return false;
        }

        // Swap stableToken → WETH（回程）
        IERC20(stableToken).approve(swapRouter, stableReceived);
        uint256 ethBack;
        try ISwapRouter(swapRouter).exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: stableToken,
                tokenOut: weth,
                fee: swapFeeTier,
                recipient: address(this),
                amountIn: stableReceived,
                amountOutMinimum: 0, // 回程不设最小值，避免卡住
                sqrtPriceLimitX96: 0
            })
        ) returns (uint256 amountOut) {
            ethBack = amountOut;
        } catch {
            // 回程失败，保留 stable 作为用户余额��值记录
            // 简化处理：记为亏损
            _applyExecutionResult(user, strategyType, false, 0, executionBase);
            return false;
        }

        // Unwrap WETH → ETH
        IWETH(weth).withdraw(ethBack);

        // 计算盈亏
        if (ethBack >= executionBase) {
            uint256 profit = ethBack - executionBase;
            pos.balance += ethBack;
            totalTVL += ethBack;
            _applyExecutionResult(user, strategyType, true, profit, 0);
        } else {
            uint256 loss = executionBase - ethBack;
            pos.balance += ethBack;
            totalTVL += ethBack;
            _applyExecutionResult(user, strategyType, false, 0, loss);
        }
        return true;
    }

    // ─── 查询 ──────────────────────────────────────────────────────────────────

    function getUserInfo(address user) external view returns (
        uint256 balance,
        uint256 totalDeposited,
        uint256 totalProfit,
        uint256 executionCount,
        bool isActive,
        address rcAddress,
        StrategyParams memory params
    ) {
        Position storage pos = positions[user];
        return (
            pos.balance,
            pos.totalDeposited,
            pos.totalProfit,
            pos.executionCount,
            pos.isActive,
            pos.rcAddress,
            pos.params
        );
    }

    function getActiveUsers() external view returns (address[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < users.length; i++) {
            if (positions[users[i]].isActive) count++;
        }
        address[] memory active = new address[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < users.length; i++) {
            if (positions[users[i]].isActive) {
                active[idx++] = users[i];
            }
        }
        return active;
    }

    function getUserCount() external view returns (uint256) {
        return users.length;
    }

    // ─── 管理员 ────────────────────────────────────────────────────────────────

    function setRCFactory(address _rcFactory) external onlyOwner {
        rcFactory = _rcFactory;
    }

    function setReactiveCallbackSender(address _sender) external onlyOwner {
        reactiveCallbackSender = _sender;
    }

    function setFeeRate(uint256 _feeRate) external onlyOwner {
        require(_feeRate <= 5000, "Max 50%");
        feeRate = _feeRate;
    }

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
    }

    function updateDefaultParams(StrategyParams calldata params) external onlyOwner {
        defaultParams = params;
    }

    function setProtocolConfig(
        uint8 _mode,
        address _swapRouter,
        address _weth,
        address _stableToken,
        uint24 _swapFeeTier
    ) external onlyOwner {
        protocolMode = _mode;
        swapRouter = _swapRouter;
        weth = _weth;
        stableToken = _stableToken;
        swapFeeTier = _swapFeeTier;
    }

    function _applyExecutionResult(
        address user,
        string memory strategyType,
        bool success,
        uint256 profit,
        uint256 loss
    ) internal {
        Position storage pos = positions[user];

        if (!pos.isActive) return;

        if (success && profit > 0) {
            pos.balance += profit;
            pos.totalProfit += profit;
            totalTVL += profit;
            pos.consecutiveLosses = 0;
        } else if (!success && loss > 0) {
            if (loss > pos.balance) loss = pos.balance;
            pos.balance -= loss;
            totalTVL -= loss;
            pos.consecutiveLosses++;

            if (pos.consecutiveLosses >= pos.params.maxConsecutiveLosses) {
                pos.isActive = false;
                emit StrategyPaused(user);
            }
        }

        pos.executionCount++;
        emit ExecutionResult(user, strategyType, success, profit, loss);
    }

    function _payReactiveDebt(address payable receiver, uint256 amount) internal {
        if (amount == 0) return;
        require(address(this).balance >= amount, "Insufficient funds");
        (bool ok,) = receiver.call{value: amount}("");
        require(ok, "Payment failed");
    }

    function _resolveStrategySimulation(
        StrategyParams storage params,
        string calldata strategyType
    ) internal view returns (bool enabled, uint256 profitBps) {
        bytes32 strategyHash = keccak256(bytes(strategyType));

        if (strategyHash == keccak256(bytes("liquidation"))) {
            return (params.enableLiquidation, 250);
        }

        if (strategyHash == keccak256(bytes("arbitrage"))) {
            return (params.enableArbitrage, 150);
        }

        return (true, 100);
    }

    function _executionBase(
        uint256 balance,
        uint256 maxPositionPct,
        uint256 amountHint
    ) internal pure returns (uint256) {
        uint256 executionBase = (balance * maxPositionPct) / 100;
        if (executionBase == 0) executionBase = balance;
        if (amountHint > 0 && amountHint < executionBase) {
            executionBase = amountHint;
        }
        return executionBase;
    }

    receive() external payable {}
}
