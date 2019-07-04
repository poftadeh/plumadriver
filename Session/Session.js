const uuidv1 = require('uuid/v1');
const validator = require('validator');
const os = require('os');
const { Mutex } = require('async-mutex');
const { VM } = require('vm2');
const { JSDOM } = require('jsdom');

const Browser = require('../browser/browser.js');
const WebElement = require('../WebElement/WebElement.js');
const { COMMANDS } = require('../commands/commands');
const { InputSource } = require('../InputSource/InputSource.js');
const { Action } = require('../InputSource/Actions/Action.js');

// custom
const { addFileList } = require('../jsdom_extensions/addFileList');
const utils = require('../utils/utils');

// DOM specific
const {
  Event, HTMLElement, HTMLInputElement, HTMLOptionElement,
} = new JSDOM().window;

// W3C
const ELEMENT = 'element-6066-11e4-a52e-4f735466cecf';

// errors
const {
  InvalidArgument,
  SessionNotCreated,
  InternalServerError,
  NoSuchElement,
} = require('../Error/errors');

const CapabilityValidator = require('../CapabilityValidator/CapabilityValidator');

class Session {
  constructor(requestBody) {
    this.id = uuidv1();
    this.pageLoadStrategy = 'normal';
    this.secureTLS = true;
    this.timeouts = {
      implicit: 0,
      pageLoad: 30000,
      script: 30000,
    };
    this.configureSession(requestBody);
    this.mutex = new Mutex();
    this.activeInputSources = [];
    this.inputStateTable = [];
    this.inputCancelList = [];
  }

  // delegates request
  async process({ command, parameters, urlVariables }) {
    let response = null;

    return new Promise(async (resolve, reject) => {
      try {
        switch (command) {
          case COMMANDS.DELETE_SESSION:
            await this.browser.close();
            break;
          case COMMANDS.NAVIGATE_TO:
            await this.navigateTo(parameters);
            break;
          case COMMANDS.GET_CURRENT_URL:
            response = this.browser.getURL();
            break;
          case COMMANDS.GET_TITLE:
            response = this.browser.getTitle();
            break;
          case COMMANDS.FIND_ELEMENT:
          case COMMANDS.FIND_ELEMENTS:
            response = this.elementRetrieval(
              this.browser.dom.window.document, // start node
              parameters.using, // strategy
              parameters.value, // selector
            );
            break;
          case COMMANDS.GET_ELEMENT_TEXT:
            response = this.browser.getKnownElement(urlVariables.elementId).getText();
            break;
          case COMMANDS.FIND_ELEMENTS_FROM_ELEMENT:
          case COMMANDS.FIND_ELEMENT_FROM_ELEMENT:
            response = this.elementRetrieval(
              this.browser.getKnownElement(urlVariables.elementId).element,
              parameters.using,
              parameters.value,
            );
            break;
          case COMMANDS.SET_TIMEOUTS:
            break;
          case COMMANDS.GET_TIMEOUTS:
            break;
          case COMMANDS.GET_ALL_COOKIES:
            response = this.browser.getCookies();
            break;
          case COMMANDS.ADD_COOKIE:
            response = this.browser.addCookie(parameters.cookie);
            break;
          case COMMANDS.GET_ELEMENT_TAG_NAME:
            response = this.browser.getKnownElement(urlVariables.elementId).getTagName();
            break;
          case COMMANDS.GET_ELEMENT_ATTRIBUTE:
            response = this.browser
              .getKnownElement(urlVariables.elementId)
              .getElementAttribute(urlVariables.attributeName);
            break;
          case COMMANDS.EXECUTE_SCRIPT:
            response = await this.executeScript(parameters.script, parameters.args);
            break;
          case COMMANDS.ELEMENT_SEND_KEYS:
            await this.sendKeysToElement(parameters.text, urlVariables.elementId);
            break;
          case COMMANDS.CLICK_ELEMENT:
            await this.clickElement(urlVariables.elementId);
            break;
          default:
            break;
        }
        resolve(response);
      } catch (err) {
        reject(err);
      }
    });
  }

  dispatchAction() {
    this.pointer = {
      down: (elementId, action, inputState, /* tickDuration */ ) => {
        const pointerType = action.type;
        const { button } = action;
        if (inputState.pressed.includes(button)) {
          return null;
        }
        const { x, y } = inputState;
        const buttons = inputState.pressed.push(button);
        const copy = Object.assign({}, action);
        copy.setActionSubtype(copy.type, 'pointerUp');
        this.inputCancelList.push(copy);

        const element = this.browser.getKnownElement(elementId);
        // TODO: dispatch events on jsdom
        switch(action.type) {
          case 'pointer':
            if (action.subtype === 'pointerDown') {
              element.dispatchEvent(new Event('mousedown'));
            }
            break; 
          default:
            break;
        }
      },
    };
  }

  clickElement(elementId) {
    const webElement = this.browser.getKnownElement(elementId);
    const { element } = webElement;

    if (element instanceof HTMLInputElement && element.type === 'file') throw new InvalidArgument(COMMANDS.CLICK_ELEMENT);
    if (!webElement.isInteractable()) throw new Error('Element is not interactable'); // TODO: add element not interactable error class

    // TODO: figure out how to determine if element is obsucred by another element
    // Possibly to do with z-index in css this has more to do with a rendering
    // context and not very applicable in the context of jsdom.

    if (element instanceof HTMLOptionElement) {
      const parent = element.parentElement;

      parent.dispatchEvent(new Event('mouseover'));
      parent.dispatchEvent(new Event('mousemove'));
      parent.dispatchEvent(new Event('mousedown'));

      if (!element.disabled) {
        parent.dispatchEvent('input');
        const prevSelectedness = element.selected;

        element.selected = parent.getAttribute('multiple') ? !element.selected : true;

        if (prevSelectedness) parent.dispatchEvent('change');
      }

      parent.dispatchEvent('mouseUp');
      parent.dispatchEvent('click');
    } else {
      // pointerMove action not implemented as this is not a rendering context.
      //  Much of mouse move has to do with a rendering context. Ommited.
      const mouse = new InputSource('pointer');
      const pointerDown = new Action(mouse.id, 'pointer', 'pointerDown');

      pointerDown.button = 0;

      const pointerUp = new Action(mouse.id, 'mouse', 'pointerUp');
      pointerUp.button = 0;

      // TODO: dispatch pointer actions
    }
  }

  // TODO: input source needs to be implemted and integrated to this method.
  sendKeysToElement(text, elementId) {
    return new Promise(async (resolve, reject) => {
      const webElement = this.browser.getKnownElement(elementId);
      const { element } = webElement;
      let files = [];

      if (text === undefined) reject(new InvalidArgument());

      if (!webElement.isInteractable() && element.getAttribute('contenteditable') !== 'true') {
        reject(new InvalidArgument('Element is not interactable')); // TODO: create new error class
      }

      if (this.browser.activeElement !== element) element.focus();

      if (element.tagName.toLowerCase() === 'input') {
        if (text.constructor.name.toLowerCase() !== 'string') reject(new InvalidArgument());
        // file input
        if (element.getAttribute('type') === 'file') {
          files = text.split('\n');
          if (files.length === 0) throw new InvalidArgument();
          if (!element.hasAttribute('multiple') && files.length !== 1) throw new InvalidArgument();

          await Promise.all(files.map(file => utils.fileSystem.pathExists(file)));

          addFileList(element, files);
          element.dispatchEvent(new Event('input'));
          element.dispatchEvent(new Event('change'));
        } else if (
          element.getAttribute('type') === 'text'
          || element.getAttribute('type') === 'email'
        ) {
          element.value += text;
          element.dispatchEvent(new Event('input'));
          element.dispatchEvent(new Event('change'));
        } else if (element.getAttribute('type') === 'color') {
          if (!validator.isHexColor(text)) throw new InvalidArgument('not a hex colour');
          element.value = text;
        } else {
          if (
            !Object.prototype.hasOwnProperty.call(element, 'value')
            || element.getAttribute('readonly')
          ) throw new Error('element not interactable'); // TODO: create error class
          // TODO: add check to see if element is mutable, reject with element not interactable
          element.value = text;
        }
        element.dispatchEvent(new Event('input'));
        element.dispatchEvent(new Event('change'));
        resolve(null);
      } else {
        // TODO: text needs to be encoded before it is inserted into the element
        // innerHTML, especially important since js code can be inserted in here and executed
        element.innerHTML += text;
        resolve(null);
      }
    });
  }

  async navigateTo({ url }) {
    let pathType;

    try {
      if (validator.isURL(url)) pathType = 'url';
      else if (await utils.fileSystem.pathExists(url)) pathType = 'file';
      else throw new InvalidArgument('NAVIGATE TO');
    } catch (e) {
      throw new InvalidArgument('NAVIGATE TO');
    }

    // pageload timer
    let timer;
    const startTimer = () => {
      timer = setTimeout(() => {
        throw new Error('timeout'); // TODO: create timeout error class
      }, this.timeouts.pageLoad);
    };

    if (this.browser.getURL() !== url) {
      startTimer();
      await this.browser.navigateToURL(url, pathType);
      clearTimeout(timer);
    }
  }

  // sets and validates the timeouts object
  setTimeouts(timeouts) {
    const capabilityValidator = new CapabilityValidator();
    let valid = true;
    Object.keys(timeouts).forEach((key) => {
      valid = capabilityValidator.validateTimeouts(key, timeouts[key]);
      if (!valid) throw new InvalidArgument();
    });

    Object.keys(timeouts).forEach((validTimeout) => {
      this.timeouts[validTimeout] = timeouts[validTimeout];
    });
  }

  getTimeouts() {
    return this.timeouts;
  }

  // configures session properties
  configureSession(requestedCapabilities) {
    this.id = uuidv1();

    // configure Session object capabilties
    const configuredCapabilities = this.configureCapabilties(requestedCapabilities);
    // extract browser specific data
    const browserConfig = configuredCapabilities['plm:plumaOptions'];
    if (Object.prototype.hasOwnProperty.call(configuredCapabilities, 'acceptInsecureCerts')) {
      browserConfig.strictSSL = !configuredCapabilities.acceptInsecureCerts;
    }

    if (Object.prototype.hasOwnProperty.call(configuredCapabilities, 'rejectPublicSuffixes')) {
      browserConfig.rejectPublicSuffixes = configuredCapabilities.rejectPublicSuffixes;
    }

    if (configuredCapabilities.unhandledPromptBehavior) {
      browserConfig.unhandledPromptBehavior = configuredCapabilities.unhandledPromptBehavior;
    }

    this.browser = new Browser(browserConfig);
  }

  // configures session object capabilties
  configureCapabilties(requestedCapabilities) {
    const capabilities = Session.processCapabilities(requestedCapabilities);
    if (capabilities === null) throw new InternalServerError('could not create session');

    // configure pageLoadStrategy
    this.pageLoadStrategy = 'normal';
    if (
      Object.prototype.hasOwnProperty.call(capabilities, 'pageLoadStrategy')
      && typeof capabilities.pageLoadStrategy === 'string'
    ) {
      this.pageLoadStrategy = capabilities.pageLoadStrategy;
    } else {
      capabilities.pageLoadStrategy = 'normal';
    }

    if (Object.prototype.hasOwnProperty.call(capabilities, 'proxy')) {
      // TODO: set JSDOM proxy address
    } else {
      capabilities.proxy = {};
    }

    if (Object.prototype.hasOwnProperty.call(capabilities, 'timeouts')) {
      this.setTimeouts(capabilities.timeouts);
    }
    capabilities.timeouts = this.timeouts;

    return capabilities;
  }

  // validates, merges and matches capabilties
  static processCapabilities({ capabilities }) {
    const command = 'POST /session';
    const capabilityValidator = new CapabilityValidator();

    const defaultCapabilities = [
      'acceptInsecureCerts',
      'browserName',
      'browserVersion',
      'platformName',
      'pageLoadStrategy',
      'proxy',
      'timeouts',
      'unhandledPromptBehaviour',
      'plm:plumaOptions',
    ];

    if (
      !capabilities
      || capabilities.constructor !== Object
      || Object.keys(capabilities).length === 0
    ) {
      throw new InvalidArgument(command);
    }

    // validate alwaysMatch capabilties
    const requiredCapabilities = {};
    if (capabilities.alwaysMatch !== undefined) {
      defaultCapabilities.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(capabilities.alwaysMatch, key)) {
          const validatedCapability = capabilityValidator.validate(
            capabilities.alwaysMatch[key],
            key,
          );
          if (validatedCapability) requiredCapabilities[key] = capabilities.alwaysMatch[key];
          else {
            throw new InvalidArgument(command);
          }
        }
      });
    }

    // validate first match capabilities
    let allMatchedCapabilities = capabilities.firstMatch;
    if (allMatchedCapabilities === undefined) {
      allMatchedCapabilities = [{}];
    } else if (
      allMatchedCapabilities.constructor.name.toLowerCase() !== 'array'
      || allMatchedCapabilities.length === 0
    ) {
      throw new InvalidArgument(command);
    }
    /**
     * @param {Array[Capability]} validatedFirstMatchCapabilties contains
     * a list of all the validated firstMatch capabilties requested by the client
     */
    const validatedFirstMatchCapabilties = [];

    allMatchedCapabilities.forEach((indexedFirstMatchCapability) => {
      const validatedFirstMatchCapability = {};
      Object.keys(indexedFirstMatchCapability).forEach((key) => {
        const validatedCapability = capabilityValidator.validate(
          indexedFirstMatchCapability[key],
          key,
        );
        if (validatedCapability) {
          validatedFirstMatchCapability[key] = indexedFirstMatchCapability[key];
        }
      });
      validatedFirstMatchCapabilties.push(validatedFirstMatchCapability);
    });

    // attempt merging capabilities
    const mergedCapabilities = [];

    validatedFirstMatchCapabilties.forEach((firstMatch) => {
      const merged = Session.mergeCapabilities(requiredCapabilities, firstMatch);
      mergedCapabilities.push(merged);
    });

    let matchedCapabilities;
    mergedCapabilities.forEach((capabilites) => {
      matchedCapabilities = Session.matchCapabilities(capabilites);
      if (matchedCapabilities === null) throw new SessionNotCreated('Capabilities could not be matched');
    });

    return matchedCapabilities;
  }

  // merges capabilities in both
  static mergeCapabilities(primary, secondary) {
    const result = {};
    Object.keys(primary).forEach((key) => {
      result[key] = primary[key];
    });

    if (secondary === undefined) return result;

    Object.keys(secondary).forEach((property) => {
      if (Object.prototype.hasOwnProperty.call(primary, property)) {
        throw new InvalidArgument('POST /session');
      }
      result[property] = secondary[property];
    });

    return result;
  }

  // matches supported capabilities
  static matchCapabilities(capabilties) {
    const matchedCapabilities = {
      browserName: 'pluma',
      browserVersion: 'v1.0',
      platformName: os.platform(),
      acceptInsecureCerts: false,
      setWindowRect: false,
    };

    // TODO: add extension capabilities here in the future
    let flag = true;
    Object.keys(capabilties).forEach((property) => {
      switch (property) {
        case 'browserName':
        case 'platformName':
          if (capabilties[property] !== matchedCapabilities[property]) flag = false;
          break;
        case 'browserVersion':
          // TODO: change to comparison algorith once more versions are released
          if (capabilties[property] !== matchedCapabilities[property]) flag = false;
          break;
        case 'setWindowRect':
          if (capabilties[property]) throw new InvalidArgument('POST /session');
          break;
        // TODO: add proxy matching in the future
        default:
          break;
      }
      if (flag) matchedCapabilities[property] = capabilties[property];
    });

    if (flag) return matchedCapabilities;

    return null;
  }

  elementRetrieval(startNode, strategy, selector) {
    // TODO: check if element is connected (shadow-root) https://dom.spec.whatwg.org/#connected
    // check W3C endpoint spec for details
    const endTime = new Date(new Date().getTime + this.timeouts.implicit);
    let elements;
    const result = [];

    if (!strategy || !selector) throw new InvalidArgument();
    if (!startNode) throw new NoSuchElement();

    const locationStrategies = {
      cssSelector() {
        return startNode.querySelectorAll(selector);
      },
      linkTextSelector(partial = false) {
        const linkElements = startNode.querySelectorAll('a');
        const strategyResult = [];

        linkElements.forEach((element) => {
          const renderedText = element.innerHTML;
          if (!partial && renderedText.trim() === selector) strategyResult.push(element);
          else if (partial && renderedText.includes(selector)) strategyResult.push(element);
        });
        return result;
      },
      tagName() {
        return startNode.getElementsByTagName(selector);
      },
      XPathSelector(document) {
        const evaluateResult = document.evaluate(selector, startNode, null, 7);
        const length = evaluateResult.snapshotLength;
        const xPathResult = []; // according to W3C this should be a NodeList
        for (let i = 0; i < length; i++) {
          const node = evaluateResult.snapshotItem(i);
          xPathResult.push(node);
        }
        return xPathResult;
      },
    };

    do {
      try {
        switch (strategy) {
          case 'css selector':
            elements = locationStrategies.cssSelector();
            break;
          case 'link text':
            elements = locationStrategies.linkTextSelector();
            break;
          case 'partial link text':
            elements = locationStrategies.linkTextSelector(true);
            break;
          case 'tag name':
            elements = locationStrategies.tagName();
            break;
          case 'xpath':
            elements = locationStrategies.XPathSelector(this.browser.dom.window.document);
            break;
          default:
            throw new InvalidArgument();
        }
      } catch (error) {
        // if (
        //   error instanceof DOMException
        //   || error instanceof SyntaxError
        //   || error instanceof XPathException
        // ) throw new Error('invalid selector');
        // // TODO: add invalidSelector error class
        // else throw new UnknownError(); // TODO: add unknown error class
        console.log(error);
      }
    } while (endTime > new Date() && elements.length < 1);

    elements.forEach((element) => {
      const foundElement = new WebElement(element);
      result.push(foundElement);
      this.browser.knownElements.push(foundElement);
    });
    return result;
  }

  executeScript(script, args) {
    const argumentList = [];

    args.forEach((arg) => {
      if (arg[ELEMENT] !== undefined && arg[ELEMENT] !== null) {
        const element = this.browser.getKnownElement(arg[ELEMENT]);
        argumentList.push(element.element);
      } else {
        argumentList.push(arg);
      }
    });

    // eslint-disable-next-line no-new-func
    const scriptFunc = new Function('arguments', script);

    const vm = new VM({
      timeout: this.timeouts.script,
      sandbox: {
        window: this.browser.dom.window,
        document: this.browser.dom.window.document,
        func: scriptFunc,
        arguments: argumentList,
      },
    });
    let returned;
    let response;
    return new Promise((resolve, reject) => {
      try {
        console.log('ABOUT TO EXECUTE SCRIPT');
        returned = vm.run('func(arguments);');

        if (returned instanceof Array) {
          response = [];
          returned.forEach((value) => {
            if (value instanceof HTMLElement) {
              const element = new WebElement(value);
              this.browser.knownElements.push(element);
              response.push(element);
            } else response.push(value);
          });
        } else if (returned instanceof HTMLElement) {
          const element = new WebElement(returned);
          this.browser.knownElements.push(element);
          response = element;
        } else response = returned;
        resolve(response);
      } catch (err) {
        reject(err);
      }
    });
  }
}

module.exports = Session;
