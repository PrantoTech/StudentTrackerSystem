const os = require("os");

function getLocalIP() {
  const interfaces = os.networkInterfaces();

  for (const addresses of Object.values(interfaces)) {
    if (!addresses) continue;

    for (const address of addresses) {
      if (address.family === "IPv4" && !address.internal) {
        return address.address;
      }
    }
  }

  return "localhost";
}

module.exports = { getLocalIP };
