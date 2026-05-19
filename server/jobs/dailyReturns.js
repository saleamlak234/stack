// const cron = require("node-cron");
// const Deposit = require("../models/Deposit");
// const User = require("../models/User");
// const Commission = require("../models/Commission");
const { payPendingCredits } = require("../services/commissionService");

// const PACKAGE_DAILY_RETURN = {
//   "1st Stock Package": 80,
//   "2nd Stock Package": 162,
//   "3rd Stock Package": 330,
//   "4th Stock Package": 670,
//   "5th Stock Package": 1350,
//   "6th Stock Package": 2750,
//   "7th Stock Package": 5520,
//   "8th Stock Package": 11040,
// };

// const DAILY_REFERRAL_RATES = [0.05, 0.03, 0.01];

// async function somethingToSkipSunday(today) {
//   // Skip processing on Sundays (0 = Sunday)
//   return today.getDay() === 0;
// }

// async function alreadyPaidToday(userId, date = new Date()) {
//   const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
//   const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
//   return !!(await Commission.findOne({
//     user: userId,
//     type: "dailyReturn",
//     createdAt: { $gte: start, $lt: end },
//   }));
// }

// async function distributeDailyReturnCommissions(user, dailyReturn, today) {
//   let current = await User.findById(user.referredBy);
//   for (
//     let level = 1;
//     level <= DAILY_REFERRAL_RATES.length && current;
//     level++
//   ) {
//     const rate = DAILY_REFERRAL_RATES[level - 1];
//     const amount = Number((dailyReturn * rate).toFixed(2));
//     if (amount <= 0) break;

//     await User.findByIdAndUpdate(current._id, {
//       $inc: { balance: amount, totalCommissions: amount },
//     });

//     // Pay any pending credits immediately
//     await payPendingCredits(current._id);

//     await Commission.create({
//       user: current._id,
//       fromUser: user._id,
//       amount,
//       level,
//       type: "dailyReferral",
//       description: `Level ${level} daily return commission from ${user.fullName || user._id}`,
//       createdAt: today,
//     });

//     current = current.referredBy
//       ? await User.findById(current.referredBy)
//       : null;
//   }
// }
// //* * * * * *
// // │ │ │ │ │ │
// // │ │ │ │ │ └─── Day of week (0-7, 0 or 7 = Sunday)
// // │ │ │ │ └───── Month (1-12)
// // │ │ │ └─────── Day of month (1-31)
// // │ │ └───────── Hour (0-23)
// // │ └─────────── Minute (0-59)
// // └───────────── Second (0-59, optional)
// // Note: Most cron libraries (like node-cron) use 5 fields (minute, hour, day of month, month, day of week) without the second field.

// console.log(
//   "dailyReturns job loaded and scheduled to run every 2 minutes",
// );

// // Run every 2 minutes
// cron.schedule("*/2 * * * *", async () => {//
//   const today = new Date();
//   if (await somethingToSkipSunday(today)) return;

//   const users = await User.find({ isActive: true });
//   for (const user of users) {
//     if (await alreadyPaidToday(user._id, today)) continue;

//     // Only give daily returns to users who have made deposits and are not blocked by unpaid credit
//     if (
//       !user.hasMadeDeposit ||
//       user.creditBlocked ||
//       user.pendingUplineCredit > 0
//     )
//       continue;

//     const latestDeposit = await Deposit.findOne({
//       user: user._id,
//       status: "completed",
//     }).sort({ createdAt: -1 });

//     if (!latestDeposit || !latestDeposit.package) continue;

//     const dailyReturn = PACKAGE_DAILY_RETURN[latestDeposit.package];
//     if (!dailyReturn) continue;

//     await User.findByIdAndUpdate(user._id, { $inc: { balance: dailyReturn } });

//     // Pay any pending credits immediately
//     await payPendingCredits(user._id);

//     await Commission.create({
//       user: user._id,
//       fromUser: user._id,
//       amount: dailyReturn,
//       level: 0,
//       type: "dailyReturn",
//       description: `Daily return for ${latestDeposit.package}`,
//       createdAt: today,
//     });
//     console.log(`Credited daily return of ${dailyReturn} to user ${user._id}`);

//     // Distribute daily return commissions to upline (5/3/1)
//     await distributeDailyReturnCommissions(user, dailyReturn, today);
//   }
// });
const cron = require("node-cron");
const Deposit = require("../models/Deposit");
const User = require("../models/User");

const PACKAGES = [
  { name: "8th Stock Package", price: 32000, dailyReturn: 11040 },
  { name: "7th Stock Package", price: 160000, dailyReturn: 5520 },
  { name: "6th Stock Package", price: 80000, dailyReturn: 2750 },
  { name: "5th Stock Package", price: 40000, dailyReturn: 1350 },
  { name: "4th Stock Package", price: 20000, dailyReturn: 670 },
  { name: "3rd   Stock Package", price: 10000, dailyReturn: 330 },
  { name: "2nd Stock Package", price: 5000, dailyReturn: 162 },
  { name: "1st Stock Package", price: 2500, dailyReturn: 80 },
];

// Referral commission rates for 4 levels: 8%, 6%,4%
const COMMISSION_RATES = [0.05, 0.03, 0.01];

let isRunning = false;

async function distributeDailyReturnCommissions(user, dailyReturn) {
  let currentUser = await User.findById(user.referredBy); // Assumes 'referredBy' field stores the parent user ID
  let level = 1;

  while (currentUser && level <= COMMISSION_RATES.length) {
    const commissionAmount = dailyReturn * COMMISSION_RATES[level - 1];

    // Update user balance and commission total
    await User.findByIdAndUpdate(currentUser._id, {
      $inc: {
        balance: commissionAmount,
        totalCommissions: commissionAmount,
      },
    });

    console.log(
      `Distributed ${commissionAmount.toLocaleString()} ETB to user ${currentUser._id} as level ${level} commission from ${user.fullName}'s daily return`,
    );
    // Optionally, send notification

    // Move to next level
    currentUser = await User.findById(currentUser.referredBy);
    level++;
  }
}

// Schedule the cron job to run every day at 00:01
cron.schedule(
  "0 0 * * *", //
  async () => {
    console.log("Daily returns job run at:", new Date().toISOString());
    if (isRunning) {
      console.log("Skipping job: Previous instance is still running.");
      return;
    }
    isRunning = true;

    const today = new Date();
    const dayOfWeek = today.getDay(); // Sunday is 0

    if (dayOfWeek === 0) {
      console.log("Skipping daily returns on Sunday");
      isRunning = false;
      return;
    }

    try {
      // 1. Get all users
      const users = await User.find({});

      for (const user of users) {
        // Skip users who have unpaid pending credit and have not made a real deposit yet
        if (user.pendingUplineCredit > 0 && !user.hasMadeDeposit) {
          console.log(
            `User ${user._id} has unpaid pending credit and no deposit; skipping daily return.`,
          );
          continue;
        }

        // 2. Get the latest completed non-credit deposit for this user
        const latestDeposit = await Deposit.findOne({
          status: "completed",
          isUpgraded: false,
          package: { $ne: "Credit Payment" },
          $or: [{ userID: user._id }, { user: user._id }],
        }).sort({ createdAt: -1 });

        // If no deposit, skip
        if (
          !latestDeposit ||
          !latestDeposit.totalAmount ||
          latestDeposit.totalAmount < 2500
        ) {
          console.log(`User ${user._id} does not have any completed deposits.`);
          continue;
        }

        const totalDeposit = latestDeposit.totalAmount;

        // 3. Find the highest package that fits the total deposit
        const packageDetails = PACKAGES.slice().find(
          (pkg) => totalDeposit >= pkg.price,
        );

        if (packageDetails) {
          const dailyReturn = packageDetails.dailyReturn;

          // 4. Update user balance
          user.balance = (user.balance || 0) + dailyReturn;
          await user.save();

          // 5. Distribute referral commissions up to 4 levels
          await distributeDailyReturnCommissions(user, dailyReturn);

          console.log(
            `Added daily return of ${dailyReturn} to user ${user._id} (total deposit: ${totalDeposit})`,
          );
        } else {
          console.log(
            `User ${user._id} does not qualify for any package (total deposit: ${totalDeposit})`,
          );
        }
      }
      console.log("Daily returns processed successfully");
    } catch (error) {
      console.error("Error processing daily returns:", error);
    } finally {
      isRunning = false;
    }
  },
  {
    scheduled: true,
    timezone: "Africa/Nairobi",
  },
);
