const settings = require('../settings.json');
const fs = require('fs');

module.exports.load = async function (app, db) {
  app.get('/claim', async (req, res) => {
    // Get the user's ID
    const userId = req.session.userinfo.id;

    // Check if the user has already claimed coins today
    const lastClaimDate = await db.get(`last-claim-${userId}`);

    if (lastClaimDate && isSameDay(new Date(), new Date(lastClaimDate))) {
      return res.status(400).json({ error: 'Coins already claimed today' });
    }

    // Add 250 coins to the user's balance and update the last claim date.
    const userCoins = await db.get(`coins-${userId}`) || 0;
    await db.set(`coins-${userId}`, userCoins + 250);
    await db.set(`last-claim-${userId}`, new Date());

    return res.json({ message: 'Coins claimed successfully' });
  });

  app.get('/api/dailycoins', async (req, res) => {
    // Get the user's ID
    const userId = req.session.userinfo.id;

    // Check if the user can claim daily coins and calculate time until the next claim.
    const lastClaimDate = await db.get(`last-claim-${userId}`);

    if (!lastClaimDate || !isSameDay(new Date(), new Date(lastClaimDate))) {
      return res.json({ canClaim: true, timeUntilClaim: 0 });
    } else {
      const nextClaimDate = getNextClaimDate(lastClaimDate);
      const timeUntilClaim = nextClaimDate - new Date();

      return res.json({ canClaim: false, timeUntilClaim });
    }
  });

  app.get('/claimreferral', async (req, res) => {
    // Get the user's ID
    const userId = req.session.userinfo.id;

    // Get the referral user's ID from the query parameters
    const referralUserId = req.query.userId;

    // Check if a valid referral user ID is provided
    if (!referralUserId || referralUserId === userId) {
      return res.status(400).json({ error: 'Invalid or own user ID provided' });
    }

    // Check if the referral has already been claimed
    const referralClaimed = await db.get(`referral-claimed-${userId}`);

    if (referralClaimed) {
      return res.status(400).json({ error: 'Referral already claimed' });
    }

    // Add coins to the user's and referral user's balance
    const userCoins = await db.get(`coins-${userId}`) || 0;
    const referralUserCoins = await db.get(`coins-${referralUserId}`) || 0;

    await db.set(`coins-${userId}`, userCoins + 400); // 400 coins for the user
    await db.set(`coins-${referralUserId}`, referralUserCoins + 150); // 150 coins for the referral user
    await db.set(`referral-claimed-${userId}`, true); // Mark the referral as claimed

    return res.json({ message: 'Referral claimed successfully' });
  });

  // Helper function to check if two dates are on the same day.
  function isSameDay(date1, date2) {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }

  // Helper function to calculate the next claim date (24 hours from the last claim).
  function getNextClaimDate(lastClaimDate) {
    const nextClaimDate = new Date(lastClaimDate);
    nextClaimDate.setHours(nextClaimDate.getHours() + 24);
    return nextClaimDate;
  }
};
