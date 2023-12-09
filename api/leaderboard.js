const indexjs = require("../index.js");
const fs = require("fs");

module.exports.load = async function (app, db) {
  app.get("/leaderboard", async (req, res) => {
    try {
      let users = (await db.get("userids")) || [];
      console.log(await db.get("userids"))
      let leaders = [];

      for (let i = 0; i < users.length; i++) {
        let userid = users[i];
        let usercoins = (await db.get(`coins-${userid}`)) || 0;
        let username = (await db.get(`username-${userid}`)) || "Unknown user";

        leaders.push({
          coins: usercoins,
          username: username,
        });
      }

      const sorted = leaders.sort((a, b) => b.coins - a.coins);
      res.send(sorted.slice(0, 10));
    } catch (error) {
      console.error("Error in /leaderboard route:", error);
      res.status(500).send("Internal Server Error");
    }
  });

  app.get("/supply", async (req, res) => {
    try {
      let users = (await db.get("userids")) || [];
      let totalCoins = 0;

      for (let i = 0; i < users.length; i++) {
        let userid = users[i];
        let usercoins = (await db.get(`coins-${userid}`)) || 0;

        // Sum up the coins for each user
        totalCoins += parseInt(usercoins);
      }

      res.send({ totalCoins });
    } catch (error) {
      console.error("Error in /supply route:", error);
      res.status(500).send("Internal Server Error");
    }
  });

app.get("/averagecoins", async (req, res) => {
  try {
    let users = (await db.get("userids")) || [];
    let totalCoins = 0;

    for (let i = 0; i < users.length; i++) {
      let userid = users[i];
      let usercoins = (await db.get(`coins-${userid}`)) || 0;
      totalCoins += parseInt(usercoins);
    }

    const averageCoins = users.length > 0 ? totalCoins / users.length : 0;
    res.send({ averageCoins });
  } catch (error) {
    console.error("Error in /averagecoins route:", error);
    res.status(500).send("Internal Server Error");
  }
});
};
