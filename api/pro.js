const settings = require('../settings.json');
const fs = require('fs');

module.exports.load = async function (app, db) {
  app.get('/upgrade', async (req, res) => {
    // Get the user's ID
    const userId = req.session.userinfo.id;

    if (db.get('package-' + userId) == "pro") {
      return res.redirect('../afk?view=pro&err=ALREADYUPGRADED')
    }

    // Add 250 coins to the user's balance and update the last claim date.
    const userCoins = await db.get(`coins-${userId}`) || 0;

    // Check balance
    if (userCoins < 1500) {
      return res.redirect('../afk?view=pro&err=CANNOTAFFORD')
    }

    // Remove coins
    await db.set('coins-' + userId, userCoins - 1500)

    // Set package
    await db.set("package-" + userId, 'pro');

    return res.redirect('../afk?view=pro&err=none')
  });

  app.get('/api/pro', async (req, res) => {
    // Get the user's ID
    const userId = req.session.userinfo.id;

    // Check if the user can claim daily coins and calculate time until the next claim.
    const userPackage = await db.get('package-' + userId);

    if (userPackage == "pro") {
      return res.json({ pro: true });
    } else {
      return res.json({ pro: false });
    }
  });
};

