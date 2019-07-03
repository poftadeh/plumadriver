/**
 * Implementation of this class is on an ass needed basis, meaning functionality
 * will be implemented as it is needed during the webdriver development
 */
const uuid = require('uuid/v4');

class InputSource {
  constructor(type) {
    this.id = uuid();
    this.type = type;
    this.actions = {};
    this.state = {};
  }

  setActions(actionType) {
    switch (this.type) {
      case 'pointer':
        this.actions.type = actionType;
        break;
      case 'key':
        break;
      case 'null':
        break;
      default:
        break;
    }
  }
}

module.exports = { InputSource };
