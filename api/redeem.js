const indexjs = require("../index.js");
const fs = require("fs");

// Function to handle coupon redemption
module.exports.load = async function (app, db) {
  app.get("/redeem", async (req, res) => {
    // Redirect if the user is not authenticated
    if (!req.session.pterodactyl) {
      return res.redirect("/login");
    }

    // Get the theme settings
    let theme = indexjs.get(req);

    // Get the coupon code from the request
    let code = req.query.code;

    // Redirect if the coupon code is missing
    if (!code) {
      return res.redirect(theme.settings.redirect.missingorinvalidcouponcode + "?err=MISSINGCOUPONCODE");
    }

    // Get coupon information from the database
    let couponinfo = await db.get("coupon-" + code);

    // Redirect if the coupon code is invalid
    if (!couponinfo) {
      return res.redirect(theme.settings.redirect.missingorinvalidcouponcode + "?err=INVALIDCOUPONCODE");
    }

    // Delete the used coupon from the database
    await db.delete("coupon-" + code);

    // Update user's extra resources based on the coupon
    let extra = (await db.get("extra-" + req.session.userinfo.id)) || {
      ram: 0,
      disk: 0,
      cpu: 0,
      servers: 0,
    };

    updateResource(extra, couponinfo);

    // Set limits on extra resources
    limitExtraResources(extra);

    // Update user's extra resources in the database
    await db.set("extra-" + req.session.userinfo.id, extra);

    // Update user's coins based on the coupon
    let coins = (await db.get("coins-" + req.session.userinfo.id)) || 0;
    coins += couponinfo.coins;
    await db.set("coins-" + req.session.userinfo.id, coins);

    // Redirect with success message
    res.redirect(theme.settings.redirect.successfullyredeemedcoupon + "?err=SUCCESSCOUPONCODE");

    // Read and parse settings.json file (not sure why this is here)
    let newsettings = JSON.parse(fs.readFileSync("./settings.json").toString());
  });
};

// Function to update extra resources based on the coupon
function updateResource(extra, couponinfo) {
  extra.ram += couponinfo.ram || 0;
  extra.disk += couponinfo.disk || 0;
  extra.cpu += couponinfo.cpu || 0;
  extra.servers += couponinfo.servers || 0;
}

// Function to limit extra resources to a maximum value
function limitExtraResources(extra) {
  const maxLimit = 999999999999999;
  extra.ram = Math.min(extra.ram, maxLimit);
  extra.disk = Math.min(extra.disk, maxLimit);
  extra.cpu = Math.min(extra.cpu, maxLimit);
  extra.servers = Math.min(extra.servers, maxLimit);
}

// Function to convert hex to decimal
function hexToDecimal(hex) {
  return parseInt(hex.replace("#", ""), 16);
}
