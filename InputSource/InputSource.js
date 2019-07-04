/**
 * Implementation of this class is on an ass needed basis, meaning functionality
 * will be implemented as it is needed during the webdriver development
 */
const uuid = require('uuid/v1');
const { InvalidArgument } = require('../Error/errors');

class InputSource {
  constructor(type, subtype = '') {
    this.id = uuid();
    this.type = type;
    this.actions = { pause: 0 };
    this.setState(type, subtype);
  }

  setState(type, subtype) {
    switch (type) {
      case 'key':
        this.state = {
          pressed: [],
          alt: false,
          shift: false,
          ctrl: false,
          meta: false,
        };
        break;
      case 'pointer':
        if (subtype !== 'mouse' && subtype !== 'pen' && subtype !== 'touch') {
          throw new InvalidArgument('');
        }
        this.state = {
          subtype,
          pressed: [],
          x: 0, // probably wont need these since we wont be implementing the mouse move action
          y: 0,
        };
        break;
      case 'none':
        this.state = {};
        break;
      default:
        break;
    }
  }
}

module.exports = { InputSource };
