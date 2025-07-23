import { Layer } from "./layer";
import { Route } from "./route";
import { Method } from "./method";
import parseurl from "parseurl";

import type { IRoute, Request, Response, NextFunction } from "../types";

type Parames = {
  [key: string]: any[];
}

export interface BaseRouterOptions {
  caseSensitive?: boolean;
  mergeParams?: boolean;
  strict?: boolean;
}

export interface Router extends IRoute { }

@Method
export class Router {
  private _opts: BaseRouterOptions;
  public caseSensitive: boolean;
  public mergeParam: boolean;
  public params: Parames;
  public strict: boolean;
  public stack: Layer[];

  constructor(opts?: BaseRouterOptions) {
    this._opts = opts || {};

    this.caseSensitive = this._opts.caseSensitive || false;
    this.mergeParam = this._opts.mergeParams || false;
    this.params = {}
    this.strict = this._opts.strict || false;
    this.stack = []
  }

  public param(name: string, fn: Function) {
    if (!name || typeof name !== 'string') {
      throw new TypeError('argument name must be a non-empty string')
    }

    if (!fn || typeof fn !== 'function') {
      throw new TypeError('argument fn must be a function');
    }

    const params = (this.params[name] = this.params[name] || []);

    if (!this.params[name]) this.params[name] = [];

    params.push(fn)

    return this
  }

  public handle(req: Request, res: Response, callback: NextFunction) {
    if (!callback) {
      throw new TypeError('argument callback is required')
    }

    let idx = 0
    let methods: string[] = []
    const protohost = this.getProtohost(req.url) || ''
    let removed = ''
    const self = this
    let slashAdded = false
    let sync = 0
    const paramcalled = {}

    // middleware and routes
    const stack = this.stack

    // manage inter-router variables
    const parentParams = req.params
    const parentUrl = req.baseUrl || ''
    let done = this.restore(callback, req, 'baseUrl', 'next', 'params')

    const next = (err?: any) => {
      let layerError = err === 'route'
        ? null
        : err

      // remove added slash
      if (slashAdded) {
        req.url = req.url.slice(1)
        slashAdded = false
      }

      // restore altered req.url
      if (removed.length !== 0) {
        req.baseUrl = parentUrl
        req.url = protohost + removed + req.url.slice(protohost.length)
        removed = ''
      }

      // signal to exit router
      if (layerError === 'router') {
        setImmediate(done, null)
        return
      }

      // no more matching layers
      if (idx >= stack.length) {
        setImmediate(done, layerError)
        return
      }

      // max sync stack
      if (++sync > 100) {
        return setImmediate(next, err)
      }

      // get pathname of request
      const path = this.getPathname(req)

      if (path == null) {
        return done(layerError)
      }

      // find next matching layer
      let layer: Layer | undefined
      let match: string | boolean = false
      let route: Route | undefined = undefined

      while (match !== true && idx < stack.length) {
        layer = stack[idx++]

        if (!layer) {
          throw new Error('route layer is undefined')
        }

        match = this.matchLayer(layer, path)
        route = layer.route

        if (typeof match !== 'boolean') {
          // hold on to layerError
          layerError = layerError || match
        }

        if (match !== true) {
          continue
        }

        if (!route) {
          // process non-route handlers normally
          continue
        }

        if (layerError) {
          // routes do not match with a pending error
          match = false
          continue
        }

        const method = req.method
        const hasMethod = route.handlesMethod(method)

        // build up automatic options response
        if (!hasMethod && method === 'OPTIONS' && methods) {
          methods.push.apply(methods, route.methods())
        }

        // don't even bother matching route
        if (!hasMethod && method !== 'HEAD') {
          match = false
        }
      }

      // no match
      if (match !== true) {
        return done(layerError)
      }

      // store route for dispatch on change
      if (route) {
        req.route = route
      }

      if (!layer?.params) {
        throw new Error('layer.params is not defined')
      }

      // Capture one-time layer values
      req.params = this.mergeParam
        ? this.mergeParams(layer.params, parentParams)
        : layer.params

      const layerPath = layer.path

      // this should be done for the layer
      this.processParams(self.params, layer, paramcalled, req, res, function (err) {
        if (err) {
          next(layerError || err)
        } else if (route) {
          layer.handleRequest(req, res, next)
        } else {
          trimPrefix(layer, layerError, layerPath, path)
        }

        sync = 0
      })
    }

    // setup next layer
    req.next = next

    // for options requests, respond with a default if nothing else responds
    if (req.method === 'OPTIONS') {
      methods = []
      done = this.wrap(done, this.generateOptionsResponder(res, methods))
    }

    // setup basic req values
    req.baseUrl = parentUrl
    req.originalUrl = req.originalUrl || req.url

    next()

    const trimPrefix = (
      layer: Layer,
      layerError: string | Error | undefined,
      layerPath: string | RegExp | string[] | null,
      path: string
    ) => {
      if (!layer || !layerPath || !layerPath || !path) {
        throw new Error('Invalid arguments')
      }

      if (!(layerPath instanceof RegExp)) {
        if (layerPath.length !== 0) {
          // Validate path is a prefix match
          if (layerPath !== path.substring(0, layerPath.length)) {
            next(layerError)
            return
          }

          // Validate path breaks on a path separator
          const c = path[layerPath.length]
          if (c && c !== '/') {
            next(layerError)
            return
          }

          // Trim off the part of the url that matches the route
          // middleware (.use stuff) needs to have the path stripped
          removed = layerPath
          req.url = protohost + req.url.slice(protohost.length + removed.length)

          // Ensure leading slash
          if (!protohost && req.url[0] !== '/') {
            req.url = '/' + req.url
            slashAdded = true
          }

          // Setup base URL (no trailing slash)
          req.baseUrl = parentUrl + (removed[removed.length - 1] === '/'
            ? removed.substring(0, removed.length - 1)
            : removed)
        }
      }


      if (layerError) {
        layer.handleError(layerError, req, res, next)
      } else {
        layer.handleRequest(req, res, next)
      }
    }
  }

  public use(handlers: string | NextFunction | NextFunction[]) {
    let offset = 0
    let path: string = '/'

    // default path to '/'
    // disambiguate router.use([handler])
    if (typeof handlers !== 'function') {
      let args = handlers
      let arg: NextFunction | undefined = undefined;

      while (Array.isArray(args) && args.length > 0) {
        const first = args[0];

        if (first === undefined) break

        arg = first;
      }

      // first arg is the path
      if (typeof arg !== 'function') {
        offset = 1
        path = handlers as string
      }
    }

    let callbacks: NextFunction[] | undefined;

    if (Array.isArray(handlers)) {
      callbacks = handlers.flat(Infinity)
    }

    if (!callbacks || callbacks.length === 0) {
      throw new TypeError('argument handlers is required')
    }

    for (let i = 0; i < callbacks.length; i++) {
      const fn = callbacks[i]

      if (typeof fn !== 'function') {
        throw new TypeError('argument handler must be a function')
      }

      const layer = new Layer(path, {
        sensitive: this.caseSensitive,
        strict: false,
        end: false
      }, fn)

      layer.route = undefined

      this.stack.push(layer)
    }

    return this
  }

  public route(path: string) {
    const handle = (req: Request, res: Response, next: NextFunction) => {
      route.dispatch(req, res, next)
    }

    const route = new Route(path)

    const layer = new Layer(path, {
      sensitive: this.caseSensitive,
      strict: this.strict,
      end: true
    }, handle)

    layer.route = route

    this.stack.push(layer)
    return route
  }

  private generateOptionsResponder(res: Response, methods: string[]) {
    return (fn: NextFunction, err: Error | string) => {
      if (err || methods.length === 0) {
        return fn(err)
      }

      this.trySendOptionsResponse(res, methods, fn)
    }
  }

  private getPathname(req: Request): string {
    if (!req) throw new Error('Request object is required');
    try {
      const result = parseurl(req);

      if (!result || !result.pathname) {
        throw new Error('Parsed URL does not contain a valid pathname');
      }

      return result.pathname;
    } catch (err) {
      throw new Error('Failed to extract pathname from request: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  private getProtohost = (url: string) => {
    if (typeof url !== 'string' || url.length === 0 || url[0] === '/') {
      return undefined
    }

    const searchIndex = url.indexOf('?')
    const pathLength = searchIndex !== -1
      ? searchIndex
      : url.length
    const fqdnIndex = url.substring(0, pathLength).indexOf('://')

    return fqdnIndex !== -1
      ? url.substring(0, url.indexOf('/', 3 + fqdnIndex))
      : undefined
  }

  private matchLayer(layer: Layer, path: string): boolean {
    try {
      return layer.match(path)
    } catch (err: Error | any) {
      return err
    }
  }

  private mergeParams(child: Record<string, string>, parent: Record<string, string> | object) {
    if (typeof parent !== 'object' || !parent) {
      return child
    }

    // make copy of parent for base
    const obj = Object.assign({}, parent)

    // simple non-numeric merging
    if (!(0 in child) || !(0 in parent)) {
      return Object.assign(obj, child)
    }

    const result = { ...parent };

    // determine numeric gap in params
    let childCounts = Object.keys(child)
      .filter(k => String(Number(k)) === k)
      .map(Number)
      .findIndex((v, i) => v !== i) || Object.keys(child).length;

    // determine numeric gap in parent
    let parrntCounts = Object.keys(parent)
      .filter(k => String(Number(k)) === k)
      .map(Number)
      .findIndex((v, i) => v !== i) || Object.keys(parent).length;

    // offset numeric indices in params before merge
    for (const [key, value] of Object.entries(child)) {
      const numericKey = Number(key);
      const isValidIndex = Number.isInteger(numericKey) && numericKey >= 0;

      result[isValidIndex && numericKey < childCounts
        ? parrntCounts + numericKey
        : String(key)] = value;
    }

    return result;
  }

  private processParams(
    params: Record<string, any[]>,
    layer: Layer,
    called: Record<string, { error: any; match: any; value: any }>,
    req: Request,
    res: Response,
    done: NextFunction
  ) {
    // captured parameters from the layer, keys and values
    const keys = layer.keys

    // fast track
    if (!keys || keys.length === 0) {
      return done()
    }

    let i = 0;
    let paramIndex = 0;
    let key: string;
    let paramVal: string | string[];
    let paramCallbacks: any[] = [];
    let paramCalled: { error: Error | string | null; match: any; value: any };

    let result: any;

    // process params in order
    // param callbacks can be async
    const param = (err?: any) => {
      if (err) {
        return done(err)
      }

      if (i >= keys.length) {
        return done()
      }

      const currentKey = keys[i++];
      if (currentKey === undefined) {
        throw new Error(`Key at index ${i - 1} is undefined in keys array`);
      }

      const value = req.params[key];
      if (value === undefined) {
        throw new Error(`Missing parameter: ${key}`);
      }

      const callbacks = params[key];
      if (callbacks === undefined) {
        throw new Error(`No param callbacks defined for key: ${key}`);
      }
      if (!Array.isArray(callbacks)) {
        throw new Error(`Invalid param callbacks for key: ${key}`);
      }

      const callState = called[key];
      if (callState === undefined) {
        throw new Error(`No call state found for key: ${key}`);
      }

      paramIndex = 0;
      key = currentKey;
      paramVal = value;
      paramCallbacks = callbacks;
      paramCalled = callState;

      if (paramVal === undefined || !paramCallbacks) {
        return param()
      }

      // param previously called with same value or error occurred
      if (paramCalled && (paramCalled.match === paramVal ||
        (paramCalled.error && paramCalled.error !== 'route'))) {
        // restore value
        req.params[key] = paramCalled.value

        // next param
        return param(paramCalled.error)
      }

      called[key] = paramCalled = {
        error: null,
        match: paramVal,
        value: paramVal
      }

      paramCallback()
    }

    // single param callbacks
    const paramCallback = (err?: any) => {
      const fn = paramCallbacks[paramIndex++]

      // store updated value
      paramCalled.value = req.params[key]

      if (err) {
        // store error
        paramCalled.error = err
        param(err)
        return
      }

      if (!fn) return param()

      try {
        const ret = fn(req, res, paramCallback, paramVal, key)

        ret.then(null, (err: any) => {
          paramCallback(err || new Error('Rejected promise'))
        })
      } catch (e) {
        paramCallback(e)
      }
    }

    param()
  }

  private restore(fn: Function, ...obj: any[]) {
    // Capture original values
    const props = new Array(arguments.length - 2)
    const vals = new Array(arguments.length - 2)

    for (let i = 0; i < props.length; i++) {
      props[i] = arguments[i + 2]
      vals[i] = obj[props[i]]
    }

    return (err?: any) => {
      // restore vals
      for (let i = 0; i < props.length; i++) {
        obj[props[i]] = vals[i]
      }

      return fn.apply(this, arguments)
    }
  }

  private sendOptionsResponse(res: Response, methods: string[]) {
    const options = Object.create(null)

    methods.forEach(method => options[method] = true)

    // construct the allow list
    const allow = Object.keys(options).sort().join(', ')

    // send response
    res.setHeader('Allow', allow)
    res.setHeader('Content-Length', Buffer.byteLength(allow))
    res.setHeader('Content-Type', 'text/plain')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.end(allow)
  }

  private trySendOptionsResponse(res: Response, methods: string[], next: NextFunction) {
    try {
      this.sendOptionsResponse(res, methods)
    } catch (err: Error | any) {
      next(err)
    }
  }

  private wrap(old: Function, fn: Function) {
    return () => {
      const args = new Array(arguments.length + 1)

      args[0] = old
      for (let i = 0, len = arguments.length; i < len; i++) {
        args[i + 1] = arguments[i]
      }

      fn.apply(this.wrap, args)
    }
  }
}
