import { JSDOM } from 'jsdom';
import { BrowserConfig } from './BrowserConfig';
import { Pluma } from '../Types/types';
import { ELEMENT } from '../constants/constants';
import { WebElement } from '../WebElement/WebElement';
import * as Utils from '../utils/utils';
import * as PlumaError from '../Error/errors';

import { Cookie } from '../jsdom_extensions/tough-cookie/lib/cookie';

/**
 * Plumadriver browser with jsdom at its core.
 * Stores user-defined config object from which to create new instances of jsdom upon 
 * navigation to any given URL.
 */
class Browser {
  /** contains the user-defined jsdom configuration object for the session */
  browserConfig: BrowserConfig;
  /** the [list of known elements](https://www.w3.org/TR/webdriver1/#elements) */
  knownElements: Array<WebElement> = [];
  /** the jsdom object */
  dom: JSDOM;
  /** the user-agent's active element */
  activeElement: HTMLElement | null;

  /** accepts a capabilities object with jsdom and plumadriver specific options */
  constructor(capabilities: object) {
    let browserOptions: Pluma.BrowserOptions = {
      runScripts: '',
      strictSSL: true,
      unhandledPromptBehaviour: 'dismiss and notify',
      rejectPublicSuffixes: false
    };

    Object.keys(browserOptions).forEach(option => {
      if (capabilities[option]) browserOptions[option] = capabilities[option];
    });

    this.browserConfig = new BrowserConfig(browserOptions);
    this.configureBrowser(this.browserConfig, null);
  }

  /**
   * Creates an empty jsdom object from a url or file path depending on the url pathType parameter value.
   * Accepts a [[BrowserConfig]] object used to configure the jsdom object
   */
  async configureBrowser(
    config: BrowserConfig,
    url: URL | null,
    pathType: string = 'url'
  ) {
    let dom;

    if (url !== null) {
      if (pathType === 'url') {
        dom = await JSDOM.fromURL(url, {
          resources: config.resourceLoader,
          runScripts: config.runScripts,
          beforeParse: config.beforeParse,
          pretendToBeVisual: true,
          cookieJar: config.jar
        });
      } else if (pathType === 'file') {
        dom = await JSDOM.fromFile(url, {
          resources: config.resourceLoader,
          runScripts: config.runScripts,
          beforeParse: config.beforeParse,
          pretendToBeVisual: true,
          cookieJar: config.jar
        });
      }

      /*  promise resolves after load event has fired. Allows onload events to execute
      before the DOM object can be manipulated  */
      const loadEvent = () =>
        new Promise(resolve => {
          dom.window.addEventListener('load', () => {
            resolve(dom);
          });
        });

      this.dom = await loadEvent();
    } else {
      this.dom = new JSDOM(' ', {
        resources: config.resourceLoader,
        runScripts: config.runScripts,
        beforeParse: config.beforeParse,
        pretendToBeVisual: true,
        cookieJar: config.jar
      });
    }

    // webdriver-active property (W3C)
    this.dom.window.navigator.webdriver = true;
    this.activeElement = this.dom.window.document.activeElement;
  }

  /**
   * accepts a url and pathType @type {String} from which to instantiate the
   * jsdom object
   */
  async navigate(path: URL, pathType) {
    if (path) {
      await this.configureBrowser(this.browserConfig, path, pathType);
    }
    return true;
  }

  /**
   * Returns the current page title
   * @returns {String}
   */
  getTitle() {
    return this.dom.window.document.title;
  }

  /**
   * returns the current page url
   * @returns {String}
   */
  getUrl() {
    return this.dom.window.document.URL;
  }

  /**
   * sets a cookie on the browser
   */
  addCookie(cookie) {
    if (cookie === null || cookie === undefined) throw new PlumaError.InvalidArgument();

    const scheme = this.getUrl().substr(0, this.getUrl().indexOf(':'));

    if (scheme !== 'http' && scheme !== 'https' && scheme !== 'ftp')
      throw new PlumaError.InvalidArgument();

    if (Utils.isValidCookie(cookie, this.getUrl())) {
      let validCookie;

      Object.keys(cookie).forEach(key => {
        if (key === 'name') validCookie.key = cookie[key];
        else if (key === 'expiry') validCookie.expires = cookie[key];
        else validCookie[key] = cookie[key];
      });

      try {
        this.dom.cookieJar.store.putCookie(
          new Cookie(validCookie),
          err => err
        );
      } catch (err) {
        throw new Error('UNABLE TO SET COOKIE'); // need to create this error class
      }
    } else throw new PlumaError.InvalidArgument();
  }

  /**
   * returns all cookies in the cookie jar
   */
  getCookies() {
    const cookies = [];

    this.dom.cookieJar.serialize((err, serializedJar) => {
      if (err) throw err;
      serializedJar.cookies.forEach(cookie => {
        const currentCookie: any = {};
        Object.keys(cookie).forEach(key => {
          // renames 'key' property to 'name' for W3C compliance and selenium functionality
          if (key === 'key') currentCookie.name = cookie[key];
          else if (key === 'expires') {
            // sets the expiry time in seconds form epoch time
            // renames property for selenium functionality
            const seconds = new Date(currentCookie[key]).getTime() / 1000;
            currentCookie.expiry = seconds;
          } else currentCookie[key] = cookie[key];
        });
        cookies.push(currentCookie);
      });
    });

    return cookies;
  }

  /**
   * @param elementId @type {string} the id of a known element in the known element list
   */
  getKnownElement(elementId: string): WebElement {
    let foundElement = null;
    this.knownElements.forEach(element => {
      if (element[ELEMENT] === elementId) foundElement = element;
    });
    if (!foundElement) throw new PlumaError.NoSuchElement();
    return foundElement;
  }

  /**
   * terminates all scripts and timers initiated in jsdom vm
   */
  close() {
    this.dom.window.close();
  }
}

export { Browser }
