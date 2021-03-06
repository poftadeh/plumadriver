
const elements = require('express').Router();
const fromElement = require('./fromElement');
const { COMMANDS } = require('../../legacy/commands/commands');

// errors
const {
  NoSuchElement,
} = require('../../legacy/Error/errors.js');

// find element(s)
elements.post('/', async (req, res, next) => {
  // endpoint currently ignores browsing contexts
  const release = await req.session.mutex.acquire();
  let single = false;

  if (req.originalUrl.slice(req.originalUrl.lastIndexOf('/') + 1) === 'element') {
    single = true;
  }
  try {
    req.sessionRequest.command = single
      ? COMMANDS.FIND_ELEMENT
      : COMMANDS.FIND_ELEMENTS;
    const response = {};
    const result = await req.session.process(req.sessionRequest);
    if (result.length === 0) throw new NoSuchElement();
    response.value = single ? result[0] : result;
    res.json(response);
  } catch (err) {
    next(err);
  } finally {
    release();
  }
});

elements.use('/:elementId', (req, res, next) => {
  req.sessionRequest.urlVariables.elementId = req.params.elementId;
  next();
}, fromElement);

module.exports = elements;
