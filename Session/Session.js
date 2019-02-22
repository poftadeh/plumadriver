
const uuidv1 = require('uuid/v1');
const Browser = require('../browser/browser.js');

class Session {
  constructor(capabilities) {
    this.id = uuidv1(); // creates RFC4122 (IEFT) UUID according to W3C standard
    this.browser = new Browser(); // TODO create default config file, pass to constructor
    this.capabilities = capabilities;
  }
}

module.exports = Session;
