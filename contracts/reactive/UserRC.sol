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
    uint256 block_number;
    uint256 op_code;
    uint256 block_hash;
    uint256 tx_hash;
    uint256 log_index;
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

interface IPayable {
    function debt(address contractAddress) external view returns (uint256);
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
    IPayable internal vendor;
    bool internal vm;

    constructor() {
        service = IReactiveService(0x0000000000000000000000000000000000fffFfF);
        vendor = IPayable(0x0000000000000000000000000000000000fffFfF);
    }

    modifier vmOnly() {
        require(vm, "VM only");
        _;
    }

    function pay(uint256 amount) external {
        require(msg.sender == address(vendor), "Authorized sender only");
        _pay(payable(msg.sender), amount);
    }

    function coverDebt() public {
        uint256 amount = vendor.debt(address(this));
        _pay(payable(address(vendor)), amount);
    }

    function _pay(address payable receiver, uint256 amount) internal {
        if (amount == 0) return;
        require(address(this).balance >= amount, "Insufficient funds");
        (bool ok,) = receiver.call{value: amount}("");
        require(ok, "Payment failed");
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

    uint64  private constant CALLBACK_GAS_LIMIT    = 1000000;

    uint256 public immutable originChainId;   // 事件源链 ID（Origin）
    uint256 public immutable destChainId;     // 回调目标链 ID（Destination）

    // 事件签名 topic0（由 RCFactory 传入，mock/real 可切换）
    uint256 public immutable liquidationTopic;
    uint256 public immutable arbitrageTopic;

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
    event Paused(address indexed user);
    event Resumed(address indexed user);
    event ParamsUpdated(address indexed user);

    // ─── 状态变量 ──────────────────────────────────────────────────────────────

    address public immutable user;       // 该 RC 对应的用户
    address public immutable vault;      // UserVault 合约地址
    address public immutable factory;    // RCFactory 地址

    // Origin 链合约地址（事件源，mock 或真实协议）
    address public originLending;
    address public originDex;

    // Destination 链合约地址（执行目标）
    address public userVaultOnDest;      // UserVault 在 destination 链的地址

    StrategyParams public params;
    bool public active;

    // ─── 构造函数 ──────────────────────────────────────────────────────────────

    constructor(
        address _user,
        address _vault,
        address _originLending,
        address _originDex,
        StrategyParams memory _params,
        uint256 _originChainId,
        uint256 _destChainId,
        uint256 _liquidationTopic,
        uint256 _arbitrageTopic
    ) payable {
        user = _user;
        vault = _vault;
        factory = msg.sender;
        originLending = _originLending;
        originDex = _originDex;
        userVaultOnDest = _vault;
        params = _params;
        active = true;
        originChainId = _originChainId;
        destChainId = _destChainId;
        liquidationTopic = _liquidationTopic;
        arbitrageTopic = _arbitrageTopic;

        // 订阅事件（仅在非 ReactVM 模式；本地开发时 service 可能不存在，忽略错误）
        if (!vm) {
            if (_params.enableLiquidation) {
                try service.subscribe(
                    originChainId,
                    _originLending,
                    _liquidationTopic,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE
                ) {} catch {}
            }
            if (_params.enableArbitrage) {
                try service.subscribe(
                    originChainId,
                    _originDex,
                    _arbitrageTopic,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE
                ) {} catch {}
            }
        }
    }

    // ─── 核心：事件回调 ────────────────────────────────────────────────────────

    function react(LogRecord calldata log) external vmOnly {
        if (!active) return;

        if (log._contract == originLending && params.enableLiquidation) {
            _handleHealthFactor(log);
        } else if (log._contract == originDex && params.enableArbitrage) {
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
            "executeForUser(address,address,string,address,address,uint256)",
            address(0),
            user,
            "liquidation",
            originLending,
            targetUser,
            totalDebt
        );

        emit Callback(destChainId, userVaultOnDest, CALLBACK_GAS_LIMIT, payload);
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
            "executeForUser(address,address,string,address,address,uint256)",
            address(0),
            user,
            "arbitrage",
            originDex,
            address(0),
            newPrice
        );

        emit Callback(destChainId, userVaultOnDest, CALLBACK_GAS_LIMIT, payload);
    }

    // ─── 参数更新（由 factory 或用户通过 factory 调用）────────────────────────

    function updateParams(StrategyParams calldata newParams) external {
        require(msg.sender == factory || msg.sender == user, "Unauthorized");
        params = newParams;
        emit ParamsUpdated(user);
    }

    // ─── 停止并退款 ────────────────────────────────────────────────────────────

    /**
     * @notice 暂停 RC：取消订阅但不退款，保留 mapping，可恢复
     */
    function pause() external {
        require(msg.sender == factory || msg.sender == user, "Unauthorized");
        require(active, "Already paused");
        active = false;

        if (!vm) {
            if (params.enableLiquidation) {
                try service.unsubscribe(
                    originChainId, originLending, liquidationTopic,
                    REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE
                ) {} catch {}
            }
            if (params.enableArbitrage) {
                try service.unsubscribe(
                    originChainId, originDex, arbitrageTopic,
                    REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE
                ) {} catch {}
            }
        }

        emit Paused(user);
    }

    /**
     * @notice 恢复 RC：重新订阅，不需要重新部署
     */
    function resume() external {
        require(msg.sender == factory || msg.sender == user, "Unauthorized");
        require(!active, "Already active");
        active = true;

        if (!vm) {
            if (params.enableLiquidation) {
                try service.subscribe(
                    originChainId, originLending, liquidationTopic,
                    REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE
                ) {} catch {}
            }
            if (params.enableArbitrage) {
                try service.subscribe(
                    originChainId, originDex, arbitrageTopic,
                    REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE
                ) {} catch {}
            }
        }

        emit Resumed(user);
    }

    function stop() external {
        require(msg.sender == factory || msg.sender == user, "Unauthorized");
        active = false;

        // 取消订阅（本地开发时 service 可能不存在，忽略错误）
        if (!vm) {
            if (params.enableLiquidation) {
                try service.unsubscribe(
                    originChainId,
                    originLending,
                    liquidationTopic,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE
                ) {} catch {}
            }
            if (params.enableArbitrage) {
                try service.unsubscribe(
                    originChainId,
                    originDex,
                    arbitrageTopic,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE
                ) {} catch {}
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
