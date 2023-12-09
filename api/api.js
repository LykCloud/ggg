const fs = require("fs");
const ejs = require("ejs");
const fetch = require('node-fetch');
const indexjs = require('../index.js')
const log = require('../misc/log');
const settings = require("../settings.json");
const arciotext = require("../stuff/arciotext");

module.exports.load = async function (app, db) {
  const checkAuth = async (req, res) => {
    if (settings.api.client.api.enabled) {
      const auth = req.headers['authorization'];
      if (auth && auth === `Bearer ${settings.api.client.api.code}`) {
        return true;
      }
    }

    const theme = indexjs.get(req);
    ejs.renderFile(
      `./themes/${theme.name}/${theme.settings.notfound}`,
      await eval(indexjs.renderdataeval),
      null,
      function (err, str) {
        delete req.session.newaccount;
        if (err) {
          console.log(`An error occurred on path ${req._parsedUrl.pathname}:`);
          console.log(err);
          return res.send("An internal error occurred while attempting to load this page.");
        }
        res.status(200).send(str);
      });

    return false;
  };

  app.get("/api/v2/status", async (req, res) => {
    if (!(await checkAuth(req, res))) return;
    res.send({ "status": true, "build": "14200 Kaveri", "buildId": 14200 });
  });

  app.get("/api/v2/userinfo", async (req, res) => {
    if (!(await checkAuth(req, res))) return;
    const settingsResult = await check(req, res);
    if (!settingsResult) return;

    if (!req.query.id) return res.send({ status: "missing id" });
    if (!(await db.get("users-" + req.query.id))) return res.send({ status: "invalid id" });

    let newSettings = JSON.parse(fs.readFileSync("./settings.json").toString());
    newSettings = fixApiUrls(newSettings);

    const packagename = await db.get("package-" + req.query.id);
    let package = newSettings.api.client.packages.list[packagename || newSettings.api.client.packages.default] || {
      ram: 0,
      disk: 0,
      cpu: 0,
      servers: 0
    };
    package["name"] = packagename;

    const pterodactylid = await db.get("users-" + req.query.id);
    const userinforeq = await fetch(
      newSettings.pterodactyl.domain + "/api/application/users/" + pterodactylid + "?include=servers",
      {
        method: "get",
        headers: { 'Content-Type': 'application/json', "Authorization": `Bearer ${newSettings.pterodactyl.key}` }
      }
    );

    if (userinforeq.statusText === "Not Found") {
      console.log("An error occurred while attempting to get a user's information:");
      console.log("- Discord ID: " + req.query.id);
      console.log("- Pterodactyl Panel ID: " + pterodactylid);
      return res.send({ status: "could not find user on panel" });
    }

    const userinfo = await userinforeq.json();

    res.send({
      status: "success",
      package,
      extra: (await db.get("extra-" + req.query.id)) || {
        ram: 0,
        disk: 0,
        cpu: 0,
        servers: 0
      },
      userinfo,
      coins: newSettings.api.client.coins.enabled ? (await db.get("coins-" + req.query.id)) || 0 : null
    });
  });

  app.post("/api/v2/setcoins", async (req, res) => {
    const settings = await checkAuth(req, res);
    if (!settings) return;

    const { id, coins } = req.body;

    if (typeof req.body !== "object") return res.send({ status: "body must be an object" });
    if (Array.isArray(req.body)) return res.send({ status: "body cannot be an array" });
    if (typeof id !== "string") return res.send({ status: "id must be a string" });
    if (!(await db.get("users-" + id))) return res.send({ status: "invalid id" });
    if (typeof coins !== "number") return res.send({ status: "coins must be number" });
    if (coins < 0 || coins > 999999999999999) return res.send({ status: "too small or big coins" });

    if (coins === 0) {
      await db.delete("coins-" + id);
    } else {
      await db.set("coins-" + id, coins);
    }

    res.send({ status: "success" });
  });

  app.post("/api/v2/createcoupon", async (req, res) => {
    const settings = await checkAuth(req, res);
    if (!settings) return;

    const { code, coins, ram, disk, cpu, servers } = req.body;

    if (typeof req.body !== "object") return res.send({ status: "body must be an object" });
    if (Array.isArray(req.body)) return res.send({ status: "body cannot be an array" });

    const generatedCode = typeof code === "string" ? code.slice(0, 200) : Math.random().toString(36).substring(2, 15);
    
    if (!generatedCode.match(/^[a-z0-9]+$/i)) return res.json({ status: "illegal characters" });

    const validatedCoins = typeof coins === "number" ? coins : 0;
    const validatedRam = typeof ram === "number" ? ram : 0;
    const validatedDisk = typeof disk === "number" ? disk : 0;
    const validatedCpu = typeof cpu === "number" ? cpu : 0;
    const validatedServers = typeof servers === "number" ? servers : 0;

    if (validatedCoins < 0) return res.json({ status: "coins is less than 0" });
    if (validatedRam < 0) return res.json({ status: "ram is less than 0" });
    if (validatedDisk < 0) return res.json({ status: "disk is less than 0" });
    if (validatedCpu < 0) return res.json({ status: "cpu is less than 0" });
    if (validatedServers < 0) return res.json({ status: "servers is less than 0" });

    if (!validatedCoins && !validatedRam && !validatedDisk && !validatedCpu && !validatedServers) {
      return res.json({ status: "cannot create empty coupon" });
    }

    await db.set("coupon-" + generatedCode, {
      coins: validatedCoins,
      ram: validatedRam,
      disk: validatedDisk,
      cpu: validatedCpu,
      servers: validatedServers
    });

    return res.json({ status: "success", code: generatedCode });
  });

  app.post("/api/v2/revokecoupon", async (req, res) => {
    const settings = await checkAuth(req, res);
    if (!settings) return;

    const { code } = req.body;

    if (typeof req.body !== "object") return res.send({ status: "body must be an object" });
    if (Array.isArray(req.body)) return res.send({ status: "body cannot be an array" });

    if (!code) return res.json({ status: "missing code" });
    if (!code.match(/^[a-z0-9]+$/i)) return res.json({ status: "invalid code" });
    if (!(await db.get("coupon-" + code))) return res.json({ status: "invalid code" });

    await db.delete("coupon-" + code);

    res.json({ status: "success" });
  });

  app.post("/api/v2/setplan", async (req, res) => {
    const settings = await checkAuth(req, res);
    if (!settings) return;

    const { id, package: selectedPackage } = req.body;

    if (!req.body) return res.send({ status: "missing body" });
    if (typeof id !== "string") return res.send({ status: "missing id" });
    if (!(await db.get("users-" + id))) return res.send({ status: "invalid id" });

    const newSettings = JSON.parse(fs.readFileSync("./settings.json").toString());

    if (!selectedPackage) {
      await db.delete("package-" + id);
      adminjs.suspend(id);
      return res.send({ status: "success" });
    } else {
      if (!newSettings.api.client.packages.list[selectedPackage]) return res.send({ status: "invalid package" });
      await db.set("package-" + id, selectedPackage);
      adminjs.suspend(id);
      return res.send({ status: "success" });
    }
  });

  app.post("/api/v2/setresources", async (req, res) => {
    const settings = await checkAuth(req, res);
    if (!settings) return;

    const { id, ram, disk, cpu, servers } = req.body;

    if (!req.body) return res.send({ status: "missing body" });
    if (typeof id !== "string") return res.send({ status: "missing id" });
    if (!(await db.get("users-" + id))) return res.send({ status: "invalid id" });

    if (typeof ram !== "number" || typeof disk !== "number" || typeof cpu !== "number" || typeof servers !== "number") {
      return res.send({ status: "missing variables" });
    }

    const currentExtra = await db.get("extra-" + id);
    let extra;

    if (typeof currentExtra === "object") {
      extra = currentExtra;
    } else {
      extra = {
        ram: 0,
        disk: 0,
        cpu: 0,
        servers: 0
      };
    }

    if (typeof ram === "number") {
      if (ram < 0 || ram > 999999999999999) {
        return res.send({ status: "ram size" });
      }
      extra.ram = ram;
    }

    if (typeof disk === "number") {
      if (disk < 0 || disk > 999999999999999) {
        return res.send({ status: "disk size" });
      }
      extra.disk = disk;
    }

    if (typeof cpu === "number") {
      if (cpu < 0 || cpu > 999999999999999) {
        return res.send({ status: "cpu size" });
      }
      extra.cpu = cpu;
    }

    if (typeof servers === "number") {
      if (servers < 0 || servers > 999999999999999) {
        return res.send({ status: "server size" });
      }
      extra.servers = servers;
    }

    if (extra.ram === 0 && extra.disk === 0 && extra.cpu === 0 && extra.servers === 0) {
      await db.delete("extra-" + id);
    } else {
      await db.set("extra-" + id, extra);
    }

    adminjs.suspend(id);
    return res.send({ status: "success" });
  });
};

function fixApiUrls(newSettings) {
  if (newSettings.api.client.oauth2.link.slice(-1) === "/") {
    newSettings.api.client.oauth2.link = newSettings.api.client.oauth2.link.slice(0, -1);
  }

  if (newSettings.api.client.oauth2.callbackpath.slice(0, 1) !== "/") {
    newSettings.api.client.oauth2.callbackpath = "/" + newSettings.api.client.oauth2.callbackpath;
  }

  if (newSettings.pterodactyl.domain.slice(-1) === "/") {
    newSettings.pterodactyl.domain = newSettings.pterodactyl.domain.slice(0, -1);
  }

  return newSettings;
}
