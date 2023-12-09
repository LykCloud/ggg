const indexjs = require("../index.js");
const adminjs = require("./admin.js");
const settings = require("../settings.json");
const fs = require("fs");
const ejs = require("ejs");
const log = require('../misc/log')

module.exports.load = async function (app, db) {
  const resourceTypes = ['ram', 'disk', 'cpu', 'servers'];

  resourceTypes.forEach((type) => {
    app.get(`/buy${type}`, async (req, res) => {
      let newsettings = await enabledCheck(req, res);
      if (newsettings) {
        let amount = req.query.amount;

        if (!amount) return res.send("missing amount");

        amount = parseFloat(amount);

        if (isNaN(amount) || amount < 1 || amount > 10) {
          return res.send(`Invalid amount for ${type}`);
        }

        let theme = indexjs.get(req);
        let failedCallback = theme.settings.redirect[`failedpurchase${type}`] || "/";

        let userCoins = await db.get(`coins-${req.session.userinfo.id}`) || 0;
        let resourceCap = await db.get(`${type}-${req.session.userinfo.id}`) || 0;

        if (resourceCap + amount > settings.storelimits[type]) {
          return res.redirect(`${failedCallback}?err=MAX${type.toUpperCase()}EXCEEDED`);
        }

        let per = newsettings.api.client.coins.store[type].per * amount;
        let cost = newsettings.api.client.coins.store[type].cost * amount;

        if (userCoins < cost) {
          return res.redirect(`${failedCallback}?err=CANNOTAFFORD`);
        }

        let newUserCoins = userCoins - cost;
        let newResource = resourceCap + amount;

        if (newResource > settings.storelimits[type]) {
          return res.send(`You reached max ${type} limit!`);
        }

        if (newUserCoins == 0) {
          await db.delete(`coins-${req.session.userinfo.id}`);
          await db.set(`${type}-${req.session.userinfo.id}`, newResource);
        } else {
          await db.set(`coins-${req.session.userinfo.id}`, newUserCoins);
          await db.set(`${type}-${req.session.userinfo.id}`, newResource);
        }

        let extra = await db.get(`extra-${req.session.userinfo.id}`) || {
          ram: 0,
          disk: 0,
          cpu: 0,
          servers: 0
        };

        extra[type] += per;

        if (Object.values(extra).every(value => value === 0)) {
          await db.delete(`extra-${req.session.userinfo.id}`);
        } else {
          await db.set(`extra-${req.session.userinfo.id}`, extra);
        }

        adminjs.suspend(req.session.userinfo.id);

        log(`Resources Purchased`, `${req.session.userinfo.username}#${req.session.userinfo.discriminator} bought ${per}${type === 'cpu' ? '%' : 'MB'} from the store for \`${cost}\` Credits.`)

        res.redirect((theme.settings.redirect[`purchase${type}`] || "/") + "?err=none");
      }
    });
  });

  async function enabledCheck(req, res) {
    let newsettings = JSON.parse(fs.readFileSync("./settings.json").toString());
    if (newsettings.api.client.coins.store.enabled == true) return newsettings;
    let theme = indexjs.get(req);
    ejs.renderFile(
      `./themes/${theme.name}/${theme.settings.notfound}`,
      await eval(indexjs.renderdataeval),
      null,
      function (err, str) {
        delete req.session.newaccount;
        if (err) {
          console.log(`[WEBSITE] An error has occurred on path ${req._parsedUrl.pathname}:`);
          console.log(err);
          return res.send("An error has occurred while attempting to load this page. Please contact an administrator to fix this.");
        };
        res.status(200);
        res.send(str);
      });
    return null;
  }
}
