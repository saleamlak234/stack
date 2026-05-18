const cron = require("node-cron");
const Deposit = require("../models/Deposit");
const User = require("../models/User");
const Commission = require("../models/Commission");
const { payPendingCredits } = require("../services/commissionService");

const PACKAGE_DAILY_RETURN = {
  "1st Stock Package": 80,
  "2nd Stock Package": 162,
  "3rd Stock Package": 330,
  "4th Stock Package": 670,
  "5th Stock Package": 1350,
  "6th Stock Package": 2750,
  "7th Stock Package": 5520,
  "8th Stock Package": 11040,
};

const DAILY_REFERRAL_RATES = [0.05, 0.03, 0.01];

async function somethingToSkipSunday(today) {
  // Skip processing on Sundays (0 = Sunday)
  return today.getDay() === 0;
}

async function alreadyPaidToday(userId, date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return !!(await Commission.findOne({
    user: userId,
    type: "dailyReturn",
    createdAt: { $gte: start, $lt: end },
  }));
}

async function distributeDailyReturnCommissions(user, dailyReturn, today) {
  let current = await User.findById(user.referredBy);
  for (
    let level = 1;
    level <= DAILY_REFERRAL_RATES.length && current;
    level++
  ) {
    const rate = DAILY_REFERRAL_RATES[level - 1];
    const amount = Number((dailyReturn * rate).toFixed(2));
    if (amount <= 0) break;

    await User.findByIdAndUpdate(current._id, {
      $inc: { balance: amount, totalCommissions: amount },
    });

    // Pay any pending credits immediately
    await payPendingCredits(current._id);

    await Commission.create({
      user: current._id,
      fromUser: user._id,
      amount,
      level,
      type: "dailyReferral",
      description: `Level ${level} daily return commission from ${user.fullName || user._id}`,
      createdAt: today,
    });

    current = current.referredBy
      ? await User.findById(current.referredBy)
      : null;
  }
}
//* * * * * *
// │ │ │ │ │ │
// │ │ │ │ │ └─── Day of week (0-7, 0 or 7 = Sunday)
// │ │ │ │ └───── Month (1-12)
// │ │ │ └─────── Day of month (1-31)
// │ │ └───────── Hour (0-23)
// │ └─────────── Minute (0-59)
// └───────────── Second (0-59, optional)
// Note: Most cron libraries (like node-cron) use 5 fields (minute, hour, day of month, month, day of week) without the second field.

console.log(
  "dailyReturns job loaded and scheduled to run every 2 minutes",
);

// Run every 2 minutes
cron.schedule("*/2 * * * *", async () => {//
  const today = new Date();
  if (await somethingToSkipSunday(today)) return;

  const users = await User.find({ isActive: true });
  for (const user of users) {
    if (await alreadyPaidToday(user._id, today)) continue;

    // Only give daily returns to users who have made deposits and are not blocked by unpaid credit
    if (
      !user.hasMadeDeposit ||
      user.creditBlocked ||
      user.pendingUplineCredit > 0
    )
      continue;

    const latestDeposit = await Deposit.findOne({
      user: user._id,
      status: "completed",
    }).sort({ createdAt: -1 });

    if (!latestDeposit || !latestDeposit.package) continue;

    const dailyReturn = PACKAGE_DAILY_RETURN[latestDeposit.package];
    if (!dailyReturn) continue;

    await User.findByIdAndUpdate(user._id, { $inc: { balance: dailyReturn } });

    // Pay any pending credits immediately
    await payPendingCredits(user._id);

    await Commission.create({
      user: user._id,
      fromUser: user._id,
      amount: dailyReturn,
      level: 0,
      type: "dailyReturn",
      description: `Daily return for ${latestDeposit.package}`,
      createdAt: today,
    });
    console.log(`Credited daily return of ${dailyReturn} to user ${user._id}`);

    // Distribute daily return commissions to upline (5/3/1)
    //await distributeDailyReturnCommissions(user, dailyReturn, today);
  }
});
