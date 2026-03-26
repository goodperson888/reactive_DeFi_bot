// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ─── Reactive Network 接口（与 RCController.sol 保持一致）────────────────────

struct LogRecord {
    uint256 chain_id;
    address _contract;
    uint256 topic_0;
    uint256 topic_1;
    uint256 topic_2;
    uint256 topic_3;
    bytes data;
}

interface IReactiveService {
    function subscribe(
        uint256 chain_id,
        address _contract,
        uint256 topic_0,
        uint256 topic_1,
        uint256 topic_2,
        uint256 topic_3
    ) external;

    function unsubscribe(
        uint256 chain_id,
        address _contract,
        uint256 topic_0,
        uint256 topic_1,
        uint256 topic_2,
        uint256 topic_3
    ) external;
}

interface IUserVault {
    function recordExecution(
        address user,
        string calldata strategyType,
        bool success,
        uint256 profit,
        uint256 loss
    ) external;

    function getUserInfo(address user) external view returns (
        uint256 balance,
        uint256 totalDeposited,
        uint256 totalProfit,
        uint256 executionCount,
        bool isActive,
        address rcAddress,
        // StrategyParams inline
        uint256 healthFactorThreshold,
        uint256 spreadThreshold,
        uint256 maxPositionPct,
        uint256 slippagePct,
        uint256 maxGasGwei,
        uint256 maxConsecutiveLosses,
        bool enableLiquidation,
        bool enableArbitrage
    );
}

abstract contract AbstractReactive {
    uint256 internal constant REACTIVE_IGNORE =
        0xa65f96fc951c35ead38878e0f0b7a3c744a6f5ccc1476b313353ce31712313ad;

    IReactiveService internal service;
    bool internal vm;

    constructor() {
        service = IReactiveService(0x0000000000000000000000000000000000fffFfF);
    }

    modifier vmOnly() {
        require(vm, "VM only");
        _;
    }

    event Callback(
        uint256 indexed chain_id,
        address indexed _contract,
        uint64 gas_limit,
        bytes payload
    );
}

/**
 * @title UserRC
 * @notice 单用户 Reactive Contract，部署在 Reactive Network
 * @dev 由 RCFactory 为每个用户部署，独立监听事件，独立判断条件
 */
contract UserRC is AbstractReactive {
    // ─── 常量 ──────────────────────────────────────────────────────────────────

    uint256 private constant SEPOLIA_CHAIN_ID      = 11155111;
    uint256 private constant BASE_SEPOLIA_CHAIN_ID = 84532;
    uint64  private constant CALLBACK_GAS_LIMIT    = 1000000;

    // 事件签名 topic0（与 RCController 保持一致）
    uint256 private constant HEALTH_FACTOR_UPDATED_TOPIC =
        0x4ec2e8a3bd69e95166a040594140718c1942ce872ce67baf08738563aadfe9d7;
    uint256 private constant SWAP_TOPIC =
        0xd6d34547c69c5ee3d2667625c188acf1006abb93e0ee7cf03925c67cf7760413;

    // ─── 策略参数（镜像 UserVault.StrategyParams）─────────────────────────────

    struct StrategyParams {
        uint256 healthFactorThreshold;
        uint256 spreadThreshold;
        uint256 maxPositionPct;
        uint256 slippagePct;
        uint256 maxGasGwei;
        uint256 maxConsecutiveLosses;
        bool enableLiquidation;
        bool enableArbitrage;
    }

    // ─── 事件 ──────────────────────────────────────────────────────────────────

    event LiquidationTriggered(address indexed user, uint256 healthFactor);
    event ArbitrageTriggered(uint256 spreadPct);
    event Stopped(address indexed user, uint256 refundAmount);
    event ParamsUpdated(address indexed user);

    // ─── 状态变量 ──────────────────────────────────────────────────────────────

    address public immutable user;       // 该 RC 对应的用户
    address public immutable vault;      // UserVault 合约地址
    address public immutable factory;    // RCFactory 地址

    // Origin 链合约地址（事件源）
    address public mockLending;
    address public mockDexA;

    // Destination 链合约地址（执行目标）
    address public userVaultOnDest;      // UserVault 在 destination 链的地址

    StrategyParams public params;
    bool public active;

    // ─── 构造函数 ──────────────────────────────────────────────────────────────

    constructor(
        address _user,
        address _vault,
        address _mockLending,
        address _mockDexA,
        StrategyParams memory _params
    ) payable {
        user = _user;
        vault = _vault;
        factory = msg.sender;
        mockLending = _mockLending;
        mockDexA = _mockDexA;
        userVaultOnDest = _vault;
        params = _params;
        active = true;

        // 订阅事件（仅在非 ReactVM 模式）
        if (!vm) {
            if (_params.enableLiquidation) {
                service.subscribe(
                    SEPOLIA_CHAIN_ID,
                    _mockLending,
                    HEALTH_FACTOR_UPDATED_TOPIC,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE
                );
            }
            if (_params.enableArbitrage) {
                service.subscribe(
                    SEPOLIA_CHAIN_ID,
                    _mockDexA,
                    SWAP_TOPIC,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE
                );
            }
        }
    }

    // ─── 核心：事件回调 ────────────────────────────────────────────────────────

    function react(LogRecord calldata log) external vmOnly {
        if (!active) return;

        if (log._contract == mockLending && params.enableLiquidation) {
            _handleHealthFactor(log);
        } else if (log._contract == mockDexA && params.enableArbitrage) {
            _handleSwap(log);
        }
    }

    function _handleHealthFactor(LogRecord calldata log) internal {
        address targetUser = address(uint160(log.topic_1));
        (uint256 healthFactor, , uint256 totalDebt) =
            abi.decode(log.data, (uint256, uint256, uint256));

        if (healthFactor >= params.healthFactorThreshold) return;

        emit LiquidationTriggered(targetUser, healthFactor);

        // 计算本次执行金额（用户余额 * maxPositionPct%）
        // 注：实际余额在 UserVault 里，这里传 user 地址让 Vault 自己算
        bytes memory payload = abi.encodeWithSignature(
            "executeForUser(address,string,address,address,uint256)",
            user,
            "liquidation",
            mockLending,
            targetUser,
            totalDebt
        );

        emit Callback(BASE_SEPOLIA_CHAIN_ID, userVaultOnDest, CALLBACK_GAS_LIMIT, payload);
    }

    function _handleSwap(LogRecord calldata log) internal {
        (, , , , , uint256 newPrice) = abi.decode(
            log.data,
            (address, address, address, uint256, uint256, uint256)
        );

        // 简单用 newPrice 作为 priceA，实际可通过 staticcall 读 dexB 价格
        // 这里先触发，让 Vault 端做最终判断
        uint256 spreadPct = 150; // placeholder，实际在 Vault 端验证

        if (spreadPct < params.spreadThreshold) return;

        emit ArbitrageTriggered(spreadPct);

        bytes memory payload = abi.encodeWithSignature(
            "executeForUser(address,string,address,address,uint256)",
            user,
            "arbitrage",
            mockDexA,
            address(0),
            newPrice
        );

        emit Callback(BASE_SEPOLIA_CHAIN_ID, userVaultOnDest, CALLBACK_GAS_LIMIT, payload);
    }

    // ─── 参数更新（由 factory 或用户通过 factory 调用）────────────────────────

    function updateParams(StrategyParams calldata newParams) external {
        require(msg.sender == factory || msg.sender == user, "Unauthorized");
        params = newParams;
        emit ParamsUpdated(user);
    }

    // ─── 停止并退款 ────────────────────────────────────────────────────────────

    function stop() external {
        require(msg.sender == factory || msg.sender == user, "Unauthorized");
        active = false;

        // 取消订阅
        if (!vm) {
            if (params.enableLiquidation) {
                service.unsubscribe(
                    SEPOLIA_CHAIN_ID,
                    mockLending,
                    HEALTH_FACTOR_UPDATED_TOPIC,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE
                );
            }
            if (params.enableArbitrage) {
                service.unsubscribe(
                    SEPOLIA_CHAIN_ID,
                    mockDexA,
                    SWAP_TOPIC,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE
                );
            }
        }

        // 退回剩余 ETH 给用户
        uint256 remaining = address(this).balance;
        if (remaining > 0) {
            (bool ok,) = payable(user).call{value: remaining}("");
            require(ok, "Refund failed");
        }

        emit Stopped(user, remaining);
    }

    receive() external payable {}
}
