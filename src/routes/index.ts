// routers
import * as express from 'express';
import element from './elements';
import timeouts from './timeouts';
import navigate from './navigate';
import cookies from './cookies';
import { Pluma } from '../Types/types';
import * as Utils from '../utils/utils';

const {sessionEndpointExceptionHandler, defaultSessionEndpointLogic} = Utils.endpoint;

// pluma commands
import { COMMANDS } from '../constants/constants';

// errors
import { InvalidArgument } from '../Error/errors';

const router = express.Router();

router.use('/session/:sessionId', (req, res, next) => {
  const sessionsManager = req.app.get('sessionManager');
  const request: Pluma.Request = {
    urlVariables: req.params,
    parameters: req.body,
    command: '',
  };
  req.sessionId = req.params.sessionId;
  req.session = sessionsManager.findSession(req.sessionId);
  req.sessionRequest = request;
  next();
});



// New session
router.post('/session', async (req, res, next) => {
  const sessionManager = req.app.get('sessionManager');
  try {
    // not sure if this conditional is needed here, body-parser checks for this anyway
    if (!(await Utils.validate.requestBodyType(req, 'application/json'))) {
      throw new InvalidArgument();
    }
    const newSession = sessionManager.createSession(req.body);
    res.json(newSession);
  } catch (error) {
    next(error);
  }
});


router.delete('/session/:sessionId', async (req, res, next) => {
  const sessionManager = req.app.get('sessionManager');
  const release = await req.session.mutex.acquire();
  try {
    req.sessionRequest.command = COMMANDS.DELETE_SESSION;
    await sessionManager.deleteSession(req.session, req.sessionRequest);
    res.send(null);
    if (sessionManager.sessions.length === 0) process.exit(0);
  } catch (error) {
    next(error);
  } finally {
    release();
  }
});

router.get('/session/:sessionId/title', sessionEndpointExceptionHandler(defaultSessionEndpointLogic, COMMANDS.GET_TITLE));
router.post('/session/:sessionId/execute/sync', sessionEndpointExceptionHandler(defaultSessionEndpointLogic, COMMANDS.EXECUTE_SCRIPT));

// element(s) routes
router.post('/session/:sessionId/element', sessionEndpointExceptionHandler(defaultSessionEndpointLogic, COMMANDS.FIND_ELEMENT));
router.post('/session/:sessionId/elements', sessionEndpointExceptionHandler(defaultSessionEndpointLogic, COMMANDS.FIND_ELEMENTS));

// timeout routes
router.use('/session/:sessionId/timeouts', timeouts);

// navigation routes
router.use('/session/:sessionId/url', navigate);

// cookies routes
router.use('/session/:sessionId/cookie', cookies);
router.use(
  '/session/:sessionId/element/:elementId',
  (req, res, next) => {
    req.sessionRequest.urlVariables.elementId = req.params.elementId;
    next();
  },
  element,
);

export default router;
