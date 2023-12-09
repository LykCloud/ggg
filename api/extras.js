const fs = require('fs');
const fetch = require('node-fetch');
const settings = require("../settings.json");
const indexjs = require("../index.js");

module.exports.load = async function (app, db) {
  app.get("/panel", redirectToPterodactylDomain);

  app.get("/regen", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect("/login");

    const newSettings = JSON.parse(fs.readFileSync("./settings.json"));

    if (newSettings.api.client.allow.regen !== true) {
      return res.send("You cannot regenerate your password currently.");
    }

    const newPassword = makeid(newSettings.api.client.passwordgenerator.length);
    req.session.password = newPassword;

    await updateUserPassword(req);

    const theme = indexjs.get(req);
    res.redirect("/credentials");
  });
};

function redirectToPterodactylDomain(req, res) {
  res.redirect(settings.pterodactyl.domain);
}

async function updateUserPassword(req) {
  const updateUserUrl = `${settings.pterodactyl.domain}/api/application/users/${req.session.pterodactyl.id}`;

  await fetch(updateUserUrl, {
    method: "patch",
    headers: {
      'Content-Type': 'application/json',
      "Authorization": `Bearer ${settings.pterodactyl.key}`
    },
    body: JSON.stringify({
      username: req.session.pterodactyl.username,
      email: req.session.pterodactyl.email,
      first_name: req.session.pterodactyl.first_name,
      last_name: req.session.pterodactyl.last_name,
      password: req.session.password
    })
  });
}

function makeid(length) {
  let result = '';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;

  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }

  return result;
}
