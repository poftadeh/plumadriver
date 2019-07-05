const { InvalidArgument } = require('../../Error/errors');

class Action {
  constructor(id, type, subtype) {
    this.id = id;
    this.type = type;
    this.subtype = Action.setActionSubType(type, subtype);
  }

  static setActionSubType(type, subtype) {
    let validSubtype;
    switch (type) {
      case 'pointer':
        if (
          subtype !== 'pointerMove'
          && subtype !== 'pointerDown'
          && subtype !== 'pointerUp'
          && subtype !== 'pointerCancel'
          && subtype !== 'pause'
        ) {
          throw new InvalidArgument('');
        } else {
          validSubtype = subtype;
        }
        break;
      case 'key':
        if (subtype !== 'keyDown' && subtype !== 'keyUp') {
          throw new InvalidArgument('');
        } else {
          validSubtype = subtype;
        }
        break;
      case 'none':
        if (subtype !== 'pause') throw new InvalidArgument('');
        break;
      default:
        throw new InvalidArgument();
    }
    return validSubtype;
  }

  process(actionItem) {
    const pointer = {
      upOrDown: () => {},
      move: () => {},
      cancel: () => {},
    };

    let result;

    switch (this.type) {
      case 'none':
        result = this.pause(actionItem);
        break;
      case 'pointer':
        if (this.subtype === 'pause') result = this.pause(actionItem);
        else if (this.subtype === 'pointerMove') {
          result = pointer.move();
        } else if (this.subtype === 'pointerCancel') {
          // this hasnt been updated on the w3c page... little difficult to implement w/o any specs...
          result = pointer.cancel();
        } else {
          result = pointer.upOrDown();
        }
        break;
      default:
        break;
    }

    return result;
  }

  pause(actionItem) {
    const { duration } = actionItem;

    if (duration && Number.isInteger(duration) && duration >= 0) {
      this.duration = duration;
    } else throw new InvalidArgument('');

    return this;
  }
}

module.exports = { Action };
