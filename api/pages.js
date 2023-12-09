const express = require("express");
const ejs = require("ejs");
const fetch = require("node-fetch");
const indexjs = require("../index.js");
const settings = require("../settings.json");

const arciotext = require("../stuff/arciotext");

module.exports.load = async function (app, db) {
  app.all("/", async (req, res) => {
    try {
      const theme = indexjs.get(req);

      if (
        (req.session.pterodactyl &&
          req.session.pterodactyl.id !==
            (await db.get("users-" + req.session.userinfo.id))) ||
        (theme.settings.mustbeloggedin.includes(req._parsedUrl.pathname) &&
          (!req.session.userinfo || !req.session.pterodactyl))
      ) {
        return res.redirect("/login?prompt=none");
      }

      if (
        theme.settings.mustbeadmin.includes(req._parsedUrl.pathname) &&
        (!req.session.userinfo || !req.session.pterodactyl)
      ) {
        const notFoundPath = `./themes/${theme.name}/${theme.settings.notfound}`;
        renderAndSend(req, res, theme, notFoundPath);
        return;
      }

      const indexPath = `./themes/${theme.name}/${theme.settings.index}`;
      renderAndSend(req, res, theme, indexPath);
    } catch (error) {
      console.log(`An error has occurred:`, error);
      res.send(
        "An internal error occurred while attempting to load this page."
      );
    }
  });

  app.use("/assets", express.static("./assets"));

  async function renderAndSend(req, res, theme, filePath) {
    ejs.renderFile(
      filePath,
      await eval(indexjs.renderdataeval),
      null,
      function (err, str) {
        if (err) {
          console.log(`An error has occurred:`);
          console.log(err);
          res.send(
            "An internal error occurred while attempting to load this page."
          );
        } else {
          delete req.session.newaccount;
          res.send(str);
        }
      }
    );
  }
};
