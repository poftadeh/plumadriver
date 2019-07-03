const { PointerAction } = require('./PointerAction');

class InputAction {
  constructor(id, type, subtype) {
    this.id = id;
    this.type = type;
    this.subtype = this.setActionSubType(type, subtype);
  }

  setActionSubType(type, subtype) {
    switch (type) {
      case 'pointer':
        if (subtype !== 'pointerMove' && subtype !== 'pointerDown' && subtype !== 'pointerUp' && subtype !== 'pointerCancel') {
          throw new InvalidArgument('');
        } else {
          this.subtype = subtype;
        }
        break;
      default:
        throw new InvalidArgument();
    }
  }
}

module.exports = { InputAction };
