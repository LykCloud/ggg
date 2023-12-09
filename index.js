// *
// Heliactyl 14, build 14200
// Codename Kaveri
//
// Copyright 2014 - 2023 SRYDEN, Inc.
// * 

"use strict";

// Load packages.
const fs = require("fs");
const fetch = require('node-fetch');
const chalk = require("chalk");
const axios = require("axios");
const arciotext = require('./stuff/arciotext');
global.Buffer = global.Buffer || require('buffer').Buffer;

// Polyfill for btoa and atob if not defined
if (typeof btoa === 'undefined') {
  global.btoa = function (str) {
    return new Buffer(str, 'binary').toString('base64');
  };
}
if (typeof atob === 'undefined') {
  global.atob = function (b64Encoded) {
    return new Buffer(b64Encoded, 'base64').toString('binary');
  };
}

// Load settings.
const settings = require("./settings.json");

// Default theme settings
const defaultthemesettings = {
  index: "index.ejs",
  notfound: "index.ejs",
  redirect: {},
  pages: {},
  mustbeloggedin: [],
  mustbeadmin: [],
  variables: {}
};

// Render data for EJS template
module.exports.renderdataeval = `(async () => {
    // Read and parse settings file
    let newsettings = JSON.parse(require("fs").readFileSync("./settings.json"));
    const JavaScriptObfuscator = require('javascript-obfuscator');

    let renderdata = {
      req: req,
      settings: newsettings,
      userinfo: req.session.userinfo,
      packagename: req.session.userinfo ? await db.get("package-" + req.session.userinfo.id) ? await db.get("package-" + req.session.userinfo.id) : newsettings.api.client.packages.default : null,
      extraresources: !req.session.userinfo ? null : (await db.get("extra-" + req.session.userinfo.id) ? await db.get("extra-" + req.session.userinfo.id) : {
        ram: 0,
        disk: 0,
        cpu: 0,
        servers: 0
      }),
      packages: req.session.userinfo ? newsettings.api.client.packages.list[await db.get("package-" + req.session.userinfo.id) ? await db.get("package-" + req.session.userinfo.id) : newsettings.api.client.packages.default] : null,
      coins: newsettings.api.client.coins.enabled == true ? (req.session.userinfo ? (await db.get("coins-" + req.session.userinfo.id) ? await db.get("coins-" + req.session.userinfo.id) : 0) : null) : null,
      pterodactyl: req.session.pterodactyl,
      theme: theme.name,
      extra: theme.settings.variables,
      db: db
    };

    // Check if Arc.io is enabled and user has a session token
    if (newsettings.api.arcio.enabled == true && req.session.arcsessiontoken) {
      renderdata.arcioafktext = JavaScriptObfuscator.obfuscate(\`
        let token = "\${req.session.arcsessiontoken}";
        let everywhat = \${newsettings.api.arcio["afk page"].every};
        let gaincoins = \${newsettings.api.arcio["afk page"].coins};
        let arciopath = "\${newsettings.api.arcio["afk page"].path.replace(/\\\\/g, "\\\\\\\\").replace(/"/g, "\\\\\\"")}";

        \${arciotext}
      \`);
    };

    return renderdata;
  })();`;

// Load database
const Keyv = require("keyv");
const db = new Keyv(settings.database);

// Handle database errors
db.on('error', err => {
  console.log(chalk.red("[DATABASE] An error has occurred when attempting to access the database."))
});

// Export the database instance
module.exports.db = db;

// Load websites.
const express = require("express");
const app = express();
require('express-ws')(app);

// Load express addons.
const ejs = require("ejs");
const session = require("express-session");
const indexjs = require("./index.js");
const minify = require('html-minifier').minify;

// Load the website.
module.exports.app = app;

// Set up session middleware
app.use(session({secret: settings.website.secret, resave: false, saveUninitialized: false}));

// Set up middleware for parsing JSON requests
app.use(express.json({
  inflate: true,
  limit: '500kb',
  reviver: null,
  strict: true,
  type: 'application/json',
  verify: undefined
}));

// Start the server and listen on the specified port
const listener = app.listen(settings.website.port, function() {
console.log('');
console.log(chalk.bgGray.cyan('  PULSAR CLIENT  '));
console.log('');
console.log(chalk.bgGray('  OPERATIONAL '));
});

// Rate limiting cache flag
var cache = false;

// Middleware for handling rate limits
app.use(function(req, res, next) {
  let manager = (JSON.parse(fs.readFileSync("./settings.json").toString())).api.client.ratelimits;

  // Check if the requested path has rate limits defined
  if (manager[req._parsedUrl.pathname]) {
    if (cache == true) {
      // Redirect if rate limit is reached
      setTimeout(async () => {
        let allqueries = Object.entries(req.query);
        let querystring = "";
        for (let query of allqueries) {
          querystring = querystring + "&" + query[0] + "=" + query[1];
        }
        querystring = "?" + querystring.slice(1);
        res.redirect((req._parsedUrl.pathname.slice(0, 1) == "/" ? req._parsedUrl.pathname : "/" + req._parsedUrl.pathname) + querystring);
      }, 1000);
      return;
    } else {
      // Set cache to true and reset after the specified time
      cache = true;
      setTimeout(async () => {
        cache = false;
      }, 1000 * manager[req._parsedUrl.pathname]);
    }
  }
  next();
});

// Load the API files.
let apifiles = fs.readdirSync('./api').filter(file => file.endsWith('.js'));

apifiles.forEach(file => {
  let apifile = require(`./api/${file}`);
  console.log(chalk.gray('API • ' + file))
  apifile.load(app, db);
});

// Handle all other requests
app.all("*", async (req, res) => {
  // Redirect if the Pterodactyl session ID does not match the stored user ID
  if (req.session.pterodactyl && req.session.pterodactyl.id !== (await db.get("users-" + req.session.userinfo.id))) {
    return res.redirect("/login?prompt=none");
  }

  // Get the current theme
  let theme = indexjs.get(req);

  // Read and parse settings file
  let newsettings = JSON.parse(fs.readFileSync("./settings.json"));

  // Generate a random Arc.io session token if Arc.io is enabled
  if (newsettings.api.arcio.enabled == true) req.session.arcsessiontoken = Math.random().toString(36).substring(2, 15);

  // Redirect to login if the page requires login and the user is not logged in
  if (theme.settings.mustbeloggedin.includes(req._parsedUrl.pathname) && (!req.session.userinfo || !req.session.pterodactyl)) {
    return res.redirect("/login" + (req._parsedUrl.pathname.slice(0, 1) == "/" ? "?redirect=" + req._parsedUrl.pathname.slice(1) : ""));
  }

  // Redirect to login if the page requires admin privileges and the user is not an admin
  if (theme.settings.mustbeadmin.includes(req._parsedUrl.pathname)) {
    ejs.renderFile(
      `./themes/${theme.name}/${theme.settings.notfound}`,
      await eval(indexjs.renderdataeval),
      null,
      async function (err, str) {
        delete req.session.newaccount;
        delete req.session.password;

        // Check if the user is logged in
        if (!req.session.userinfo || !req.session.pterodactyl) {
          if (err) {
            console.log(chalk.red(`[WEBSITE] An error has occurred on path ${req._parsedUrl.pathname}:`));
            console.log(err);
            return res.send("An error has occurred while attempting to load this page. Please contact an administrator to fix this.");
          }
          res.status(200);
          return res.send(str);
        }

        // Fetch the Pterodactyl account information
        let cacheaccount = await fetch(
          settings.pterodactyl.domain + "/api/application/users/" + (await db.get("users-" + req.session.userinfo.id)) + "?include=servers",
          {
            method: "get",
            headers: { 'Content-Type': 'application/json', "Authorization": `Bearer ${settings.pterodactyl.key}` }
          }
        );

        // Return the default not found page if the account is not found
        if (await cacheaccount.statusText == "Not Found") {
          if (err) {
            console.log(chalk.red(`[WEBSITE] An error has occurred on path ${req._parsedUrl.pathname}:`));
            console.log(err);
            return res.send("An error has occurred while attempting to load this page. Please contact an administrator to fix this.");
          }
          return res.send(str);
        }

        // Parse and update the Pterodactyl session information
        let cacheaccountinfo = JSON.parse(await cacheaccount.text());
        req.session.pterodactyl = cacheaccountinfo.attributes;
        
        // Redirect to the not found page if the user is not an admin
        if (cacheaccountinfo.attributes.root_admin !== true) {
          if (err) {
            console.log(chalk.red(`[WEBSITE] An error has occurred on path ${req._parsedUrl.pathname}:`));
            console.log(err);
            return res.send("An error has occurred while attempting to load this page. Please contact an administrator to fix this.");
          }
          return res.send(str);
        }

        // Render the requested page
        ejs.renderFile(
          `./themes/${theme.name}/${theme.settings.pages[req._parsedUrl.pathname.slice(1)] ? theme.settings.pages[req._parsedUrl.pathname.slice(1)] : theme.settings.notfound}`,
          await eval(indexjs.renderdataeval),
          null,
          async function (err, str) {
            delete req.session.newaccount;
            delete req.session.password;
            if (err) {
              console.log(`[WEBSITE] An error has occurred on path ${req._parsedUrl.pathname}:`);
              console.log(err);
              return res.send("An error has occurred while attempting to load this page. Please contact an administrator to fix this.");
            }

            // Minify HTML before rendering
            const minifyOptions = {
              collapseWhitespace: true,
              removeComments: true,
              minifyCSS: true,
              minifyJS: true,
            };

            const pagePath = `./themes/${theme.name}/${theme.settings.pages[req._parsedUrl.pathname.slice(1)] || theme.settings.notfound}`;
            const htmlContent = await ejs.renderFile(pagePath, await eval(indexjs.renderdataeval), null);
            const minifiedHtml = minify(htmlContent, minifyOptions);

            // Send the minified HTML response
            res.status(200);
            res.send(minifiedHtml);
          }
        );
      }
    );
    return;
  }

  // Minify HTML before rendering
  const minifyOptions = {
    collapseWhitespace: true,
    removeComments: true,
    minifyCSS: true,
    minifyJS: true,
  };

  const pagePath = `./themes/${theme.name}/${theme.settings.pages[req._parsedUrl.pathname.slice(1)] || theme.settings.notfound}`;
  const htmlContent = await ejs.renderFile(pagePath, await eval(indexjs.renderdataeval), null);
  const minifiedHtml = minify(htmlContent, minifyOptions);

  // Send the minified HTML response
  res.status(200);
  res.send(minifiedHtml);
});

// Function to get the current theme
module.exports.get = function(req) {
  let defaulttheme = JSON.parse(fs.readFileSync("./settings.json")).defaulttheme;
  let tname = encodeURIComponent(getCookie(req, "theme"));
  let name = (
    tname ?
      fs.existsSync(`./themes/${tname}`) ?
        tname
      : defaulttheme
    : defaulttheme
  )
  return {
    settings: (
      fs.existsSync(`./themes/${name}/pages.json`) ?
        JSON.parse(fs.readFileSync(`./themes/${name}/pages.json`).toString())
      : defaultthemesettings
    ),
    name: name
  };
};

// Function to check if rate limiting is active
module.exports.islimited = async function() {
  return cache == true ? false : true;
}

// Function to set rate limits
module.exports.ratelimits = async function(length) {
  if (cache == true) return setTimeout(
    indexjs.ratelimits
    , 1
  );
  cache = true;
  setTimeout(
    async function() {
      cache = false;
    }, length * 1000
  )
}

// Function to get a cookie from the request headers
function getCookie(req, cname) {
  let cookies = req.headers.cookie;
  if (!cookies) return null;
  let name = cname + "=";
  let ca = cookies.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) == ' ') {
      c = c.substring(1);
    }
    if (c.indexOf(name) == 0) {
      return decodeURIComponent(c.substring(name.length, c.length));
    }
  }
  return "";
}
