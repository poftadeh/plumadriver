const { InvalidArgument } = require('../../Error/errors');
const { InputSource } = require('../InputSource');
const { Action } = require('../Actions/Action');

class ActionSequence {
  constructor(actions, session) {
    this.actionsByTick = ActionSequence.extractSequence(actions, session);
  }

  // this methos is currently incomplete
  static extractSequence(actions, session) {
    if (!actions || !(actions instanceof Array)) throw new InvalidArgument('');
    const actionsByTick = [];

    actions.forEach((actionSequence) => {
      const inputSourceActions = ActionSequence.processInputSourceActionSequence(
        actionSequence,
        session,
      );
    });
    return foo;
  }

  static processInputSourceActionSequence(actionSequence, session) {
    let data;
    let parameters;
    let source;
    if (!actionSequence.id || !(actionSequence.id instanceof String)) throw new InvalidArgument('');

    if (!actionSequence.type) throw new InvalidArgument('');
    else if (actionSequence.type === 'pointer') {
      data = actionSequence.parameters;
      parameters = ActionSequence.processPointerParameters(data);

      session.activeInputSources.forEach((activeSource) => {
        if (actionSequence.id === activeSource.id) source = activeSource;
      });

      if (!source) {
        source = actionSequence.type === 'pointer'
          ? new InputSource(actionSequence.type, parameters.pointerType)
          : new InputSource(actionSequence.type);

        session.activeInputSources.push(source);
        session.inputStateTable.push({ [source.id]: source.state });
      }

      if (source.type !== actionSequence.type) throw new InvalidArgument('');

      if (parameters && parameters.pointerType !== source.pointerType) throw new InvalidArgument('');

      const actionItems = actionSequence.actions;

      if (!(actionItems instanceof Array)) throw new InvalidArgument('');

      const actions = [];

      actionItems.forEach((actionItem) => {
        if (actionItem.constructor.name.toLowerCase() !== 'object') throw new InvalidArgument('');

        const action = new Action(actionItem.id, actionItem.type, actionItem.subType);
        action.process(actionItem);
        actions.push(action);
      });

    }
  }

  static processPointerParameters(data) {
    const parameters = { pointerType: 'mouse' };
    const pointerType = { data };
    if (!data) return parameters;
    if (!(data instanceof Object)) throw new InvalidArgument('');
    if (pointerType) {
      if (pointerType !== 'mouse' && pointerType !== 'pen' && pointerType !== 'touch') {
        throw new InvalidArgument('');
      }
      parameters.pointerType = pointerType;
    }
    return parameters;
  }
}

module.exports = { ActionSequence };
