const User = require("../models/User");
const Commission = require("../models/Commission");
const CreditTransfer = require("../models/CreditTransfer");
const telegramService = require("./telegram");

const packagePrices = {
  "8th Stock Package": 320000,
  "7th Stock Package": 160000,
  "6th Stock Package": 80000,
  "5th Stock Package": 40000,
  "4th Stock Package": 20000,
  "3rd Stock Package": 10000,
  "2nd Stock Package": 5000,
  "1st Stock Package": 2500,
};

function getPackagePrice(deposit) {
  if (deposit.totalAmount && deposit.totalAmount > 0) {
    return deposit.totalAmount;
  }
  if (deposit.package && packagePrices[deposit.package]) {
    return packagePrices[deposit.package];
  }
  return deposit.amount || 0;
}

function createCreditReference(userId) {
  return `CREDIT-UP-${userId}-${Date.now()}`;
}

async function getPlatformAdmin() {
  let adminUser = await User.findOne({ role: "super_admin" });
  if (!adminUser) adminUser = await User.findOne({ role: "transaction_admin" });
  if (!adminUser) adminUser = await User.findOne({ role: "admin" });
  return adminUser;
}

function isAdminUser(user) {
  return (
    user && ["admin", "super_admin", "transaction_admin"].includes(user.role)
  );
}

async function createCreditTransfer({
  fromUser,
  toUser,
  deposit,
  amount,
  receiptUrl = null,
}) {
  if (!fromUser || !toUser || !deposit || amount <= 0) {
    return null;
  }

  const creditTransfer = new CreditTransfer({
    fromUser: fromUser._id || fromUser,
    toUser: toUser._id || toUser,
    deposit: deposit._id || deposit,
    amount,
    reference: createCreditReference(fromUser._id || fromUser),
    receiptUrl,
    status: "pending",
    dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  await creditTransfer.save();
  return creditTransfer;
}

async function payPendingCredits(userId) {
  try {
    const pendingTransfers = await CreditTransfer.find({
      fromUser: userId,
      status: "pending",
    });

    const remainingCreditAmount = pendingTransfers.reduce(
      (sum, transfer) => sum + transfer.amount,
      0,
    );

    const user = await User.findById(userId);
    if (!user) return;

    if (isAdminUser(user)) {
      await User.findByIdAndUpdate(userId, {
        $set: {
          pendingUplineCredit: 0,
          creditBlocked: false,
        },
      });
      return;
    }

    await User.findByIdAndUpdate(userId, {
      $set: {
        pendingUplineCredit: remainingCreditAmount,
        creditBlocked: pendingTransfers.length > 0,
      },
    });
  } catch (error) {
    console.error("Pay pending credits error:", error);
  }
}

async function settleCreditPaymentDeposit(deposit, approverId = null) {
  try {
    const user = await User.findById(deposit.user).populate("referredBy");
    if (!user) return;

    const pendingTransfers = await CreditTransfer.find({
      fromUser: user._id,
      status: "pending",
    }).sort({ createdAt: 1 });

    if (pendingTransfers.length === 0) {
      await User.findByIdAndUpdate(user._id, {
        $set: { pendingUplineCredit: 0, creditBlocked: false },
      });
      return;
    }

    for (const transfer of pendingTransfers) {
      await CreditTransfer.findByIdAndUpdate(transfer._id, {
        status: "paid",
        paidAt: new Date(),
        receiptUrl: deposit.receiptUrl || transfer.receiptUrl,
      });

      if (approverId && transfer.toUser.toString() === approverId.toString()) {
        await approveCreditTransfer(transfer._id, approverId);
      } else {
        const directUpline = await User.findById(transfer.toUser);
        if (directUpline && directUpline.telegramChatId) {
          await telegramService.sendMessage(
            directUpline.telegramChatId,
            `💰 Credit Payment Deposit Received!\n` +
              `Amount: ${transfer.amount.toLocaleString()} ETB\n` +
              `From: ${user.fullName}\n` +
              `Status: Pending your approval.`,
          );
        }
      }
    }

    // Once the payment deposit is settled, the sender no longer carries upline pending credit.
    await User.findByIdAndUpdate(user._id, {
      $set: { pendingUplineCredit: 0, creditBlocked: false },
    });

    await payPendingCredits(user._id);

    if (user.telegramChatId) {
      await telegramService.sendMessage(
        user.telegramChatId,
        `✅ Your pending credit payments have been submitted!\n` +
          `Total: ${deposit.amount.toLocaleString()} ETB\n` +
          `Status: Awaiting approval from your direct upline`,
      );
    }
  } catch (error) {
    console.error("Settle credit payment deposit error:", error);
  }
}

async function processUpgradeDeposit(deposit) {
  const adminUser = await getPlatformAdmin();
  if (!adminUser) return;

  const commissionAmount = deposit.totalAmount || deposit.amount;
  const commission = new Commission({
    user: adminUser._id,
    fromUser: deposit.user,
    amount: commissionAmount,
    level: 0,
    type: "deposit",
    description: `Admin deposit record for approved upgrade deposit from user ${deposit.user}`,
    sourceTransaction: deposit._id,
    sourceModel: "Deposit",
  });

  await commission.save();
  await User.findByIdAndUpdate(adminUser._id, {
    $inc: { totalDeposits: commissionAmount },
  });

  if (adminUser.telegramChatId) {
    await telegramService.sendMessage(
      adminUser.telegramChatId,
      `💰 Upgrade deposit approved. Admin recorded ${commissionAmount.toLocaleString()} ETB from user ${deposit.user}.`,
    );
  }
}

async function processDepositApproval(deposit, approverId = null) {
  try {
    if (deposit.package === "Credit Payment") {
      await settleCreditPaymentDeposit(deposit, approverId);
      return;
    }

    const depositUser = await User.findById(deposit.user).populate(
      "referredBy",
    );
    if (!depositUser) return;

    const packagePrice = getPackagePrice(deposit);

    await User.findByIdAndUpdate(depositUser._id, {
      $inc: { totalDeposits: packagePrice },
      hasMadeDeposit: true,
    });

    if (deposit.upgradedFrom) {
      await processUpgradeDeposit(deposit);
      return;
    }

    const commissionRates = [0.08, 0.06, 0.04];
    const firstUpline = depositUser.referredBy
      ? await User.findById(depositUser.referredBy)
      : null;

    if (!firstUpline) {
      return;
    }

    const level = 1;
    const commissionAmount = Number(
      (packagePrice * commissionRates[level - 1]).toFixed(2),
    );
    const previousBalance = Number(firstUpline.balance || 0);

    const commission = new Commission({
      user: firstUpline._id,
      fromUser: depositUser._id,
      amount: commissionAmount,
      level,
      type: "deposit",
      description: `Level ${level} commission from ${depositUser.fullName}'s deposit`,
      sourceTransaction: deposit._id,
      sourceModel: "Deposit",
    });
    await commission.save();

    await User.findByIdAndUpdate(firstUpline._id, {
      $inc: {
        balance: commissionAmount,
        totalCommissions: commissionAmount,
      },
    });

    if (firstUpline.telegramChatId) {
      await telegramService.sendMessage(
        firstUpline.telegramChatId,
        `💰 Commission earned!\n` +
          `Amount: ${commissionAmount.toLocaleString()} ETB\n` +
          `From ${depositUser.fullName}'s deposit (level ${level})`,
      );
    }

    const remainingAfterCommission = Number(
      (packagePrice - commissionAmount).toFixed(2),
    );
    const forwardAmount = Number(
      Math.max(0, remainingAfterCommission - previousBalance).toFixed(2),
    );

    if (forwardAmount > 0) {
      if (isAdminUser(firstUpline)) {
        await User.findByIdAndUpdate(firstUpline._id, {
          $inc: { totalDeposits: forwardAmount },
        });
      } else if (firstUpline.referredBy) {
        await createCreditTransfer({
          fromUser: firstUpline,
          toUser: firstUpline.referredBy,
          deposit,
          amount: forwardAmount,
        });
        await payPendingCredits(firstUpline._id);
      }
    } else {
      await User.findByIdAndUpdate(firstUpline._id, {
        $set: { pendingUplineCredit: 0, creditBlocked: false },
      });
    }
  } catch (error) {
    console.error("Commission service processDepositApproval error:", error);
  }
}

async function getUplineLevel(depositUserId, targetUserId) {
  let currentUser = await User.findById(depositUserId).select("referredBy");
  for (let level = 1; level <= 3 && currentUser; level += 1) {
    if (!currentUser.referredBy) {
      return null;
    }

    const nextUpline = await User.findById(currentUser.referredBy).select(
      "referredBy",
    );
    if (!nextUpline) {
      return null;
    }

    if (nextUpline._id.toString() === targetUserId.toString()) {
      return level;
    }

    currentUser = nextUpline;
  }
  return null;
}

async function approveCreditTransfer(transferId, approverId) {
  try {
    const transfer = await CreditTransfer.findById(transferId)
      .populate("fromUser")
      .populate("toUser")
      .populate("deposit");

    if (!transfer) {
      throw new Error("Credit transfer not found");
    }

    if (transfer.toUser._id.toString() !== approverId.toString()) {
      throw new Error("Only the recipient can approve this credit transfer");
    }

    if (transfer.approvalStatus !== "pending") {
      throw new Error("Transfer is not pending approval");
    }

    const approver = transfer.toUser;
    const isAdminRecipient = isAdminUser(approver);

    if (isAdminRecipient) {
      const isDirectChildTransfer =
        transfer.fromUser.referredBy &&
        transfer.fromUser.referredBy.toString() === approver._id.toString();

      if (!isDirectChildTransfer) {
        throw new Error(
          "Admin can only approve credit transfers from direct children",
        );
      }
    }

    const approverPreviousBalance = Number(approver.balance || 0);
    const packagePrice = getPackagePrice(transfer.deposit);
    const approverLevel = await getUplineLevel(
      transfer.deposit.user,
      approver._id,
    );
    const commissionRates = [0.08, 0.06, 0.04];
    const commissionAmount = Number(
      ((commissionRates[approverLevel - 1] || 0) * packagePrice).toFixed(2),
    );

    if (commissionAmount > 0) {
      const commission = new Commission({
        user: approver._id,
        fromUser: transfer.fromUser._id,
        amount: commissionAmount,
        level: approverLevel,
        type: "credit",
        description: `Level ${approverLevel} commission from credit payment approval`,
        sourceTransaction: transfer._id,
        sourceModel: "CreditTransfer",
      });
      await commission.save();

      await User.findByIdAndUpdate(approver._id, {
        $inc: {
          balance: commissionAmount,
          totalCommissions: commissionAmount,
        },
      });

      if (approver.telegramChatId) {
        await telegramService.sendMessage(
          approver.telegramChatId,
          `💰 Commission earned!\n` +
            `Amount: ${commissionAmount.toLocaleString()} ETB\n` +
            `From credit payment approval`,
        );
      }
    }

    const remainingAfterCommission = Number(
      (transfer.amount - commissionAmount).toFixed(2),
    );
    const forwardAmount = Number(
      Math.max(0, remainingAfterCommission - approverPreviousBalance).toFixed(
        2,
      ),
    );

    if (forwardAmount > 0) {
      if (isAdminRecipient) {
        await User.findByIdAndUpdate(approver._id, {
          $inc: { totalDeposits: forwardAmount },
        });
      } else if (approver.referredBy) {
        const nextUpline = await User.findById(approver.referredBy);
        if (nextUpline) {
          await createCreditTransfer({
            fromUser: approver,
            toUser: nextUpline,
            deposit: transfer.deposit,
            amount: forwardAmount,
          });
        }
      }
    }

    await CreditTransfer.findByIdAndUpdate(transfer._id, {
      status: "paid",
      approvalStatus: "approved",
      approvedBy: approverId,
      approvedAt: new Date(),
      paidAt: new Date(),
    });

    await payPendingCredits(transfer.fromUser._id);
    await User.findByIdAndUpdate(transfer.fromUser._id, {
      $set: { pendingUplineCredit: 0, creditBlocked: false },
    });
    await payPendingCredits(approver._id);

    if (approver.telegramChatId) {
      const approvalNote = isAdminRecipient
        ? `Amount has been added to your total deposits.`
        : `Amount has been forwarded to your upline as pending credit.`;

      await telegramService.sendMessage(
        approver.telegramChatId,
        `✅ Credit Transfer Approved!\n` +
          `Amount: ${transfer.amount.toLocaleString()} ETB\n` +
          approvalNote,
      );
    }

    if (transfer.fromUser.telegramChatId) {
      await telegramService.sendMessage(
        transfer.fromUser.telegramChatId,
        `✅ Your credit transfer has been approved!\n` +
          `Amount: ${transfer.amount.toLocaleString()} ETB\n` +
          `Approved by: ${approver.fullName}`,
      );
    }

    return transfer;
  } catch (error) {
    console.error("Approve credit transfer error:", error);
    throw error;
  }
}

async function rejectCreditTransfer(transferId, approverId, reason = "") {
  try {
    const transfer = await CreditTransfer.findById(transferId)
      .populate("fromUser")
      .populate("toUser");

    if (!transfer) {
      throw new Error("Credit transfer not found");
    }

    if (transfer.toUser._id.toString() !== approverId.toString()) {
      throw new Error("Only the recipient can reject this credit transfer");
    }

    if (transfer.approvalStatus !== "pending") {
      throw new Error("Transfer is not pending approval");
    }

    // Reject the transfer
    await CreditTransfer.findByIdAndUpdate(transfer._id, {
      approvalStatus: "rejected",
      approvedBy: approverId,
      approvedAt: new Date(),
    });

    // Refund the amount back to sender's balance (since they already paid)
    await User.findByIdAndUpdate(transfer.fromUser._id, {
      $inc: { balance: transfer.amount },
    });

    // Send notifications
    if (transfer.toUser.telegramChatId) {
      await telegramService.sendMessage(
        transfer.toUser.telegramChatId,
        `❌ Credit Transfer Rejected\n` +
          `Amount: ${transfer.amount.toLocaleString()} ETB\n` +
          `From: ${transfer.fromUser.fullName}\n` +
          `Reason: ${reason || "Not specified"}`,
      );
    }

    if (transfer.fromUser.telegramChatId) {
      await telegramService.sendMessage(
        transfer.fromUser.telegramChatId,
        `❌ Your credit transfer was rejected\n` +
          `Amount: ${transfer.amount.toLocaleString()} ETB\n` +
          `By: ${transfer.toUser.fullName}\n` +
          `Reason: ${reason || "Not specified"}\n` +
          `Amount has been refunded to your balance.`,
      );
    }

    return transfer;
  } catch (error) {
    console.error("Reject credit transfer error:", error);
    throw error;
  }
}

module.exports = {
  processDepositApproval,
  getPlatformAdmin,
  createCreditTransfer,
  payPendingCredits,
  approveCreditTransfer,
  rejectCreditTransfer,
};
