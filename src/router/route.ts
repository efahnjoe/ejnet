import { Layer } from "./layer";
import { Method } from "./method";
import type { IRoute, Request, Response, NextFunction } from '../types';

export interface Route extends IRoute { }

@Method
export class Route {
  private _path: string | string[] | null;
  private _methods: Record<string, boolean>;
  private _stack: Layer[] = []
  constructor(path: string | string[]) {
    this._path = path
    this._stack = []
    this._methods = Object.create(null)

    if (!(this instanceof Route)) {
      throw new Error('Route must be instantiated with `new`')
    }
  }

  public handlesMethod(method: string) {
    if (this._methods._all) {
      return true
    }

    // normalize name
    let name = typeof method === 'string'
      ? method.toLowerCase()
      : method

    if (name === 'head' && !this._methods.head) {
      name = 'get'
    }

    return Boolean(this._methods[name])
  }

  public methods() {
    if (!this._methods || typeof this._methods !== 'object') {
      throw new Error('methods is not an object');
    }

    let methods = Object.keys(this._methods);

    if (methods === undefined) {
      throw new Error('methods is undefined')
    }

    if (this._methods.get && !this._methods.head) {
      methods.push('head');
    }

    return methods.map(method => method.toUpperCase());
  }

  public dispatch(req: Request, res: Response, done: NextFunction) {
    let idx = 0
    const stack = this._stack
    let sync = 0

    if (stack.length === 0) {
      return done()
    }

    let method = typeof req.method === 'string'
      ? req.method.toLowerCase()
      : req.method

    if (method === 'head' && !this._methods.head) {
      method = 'get'
    }

    req.route = this

    next()

    function next(err?: any) {
      // signal to exit route
      if (err && err === 'route') {
        return done()
      }

      // signal to exit router
      if (err && err === 'router') {
        return done(err)
      }

      // no more matching layers
      if (idx >= stack.length) {
        return done(err)
      }

      // max sync stack
      if (++sync > 100) {
        return setImmediate(next, err)
      }

      let layer: Layer | undefined;
      let match: boolean = false;

      // find next matching layer
      while (match !== true && idx < stack.length) {
        layer = stack[idx++]

        if (!layer) return done(err)

        match = !layer.method || layer.method === method
      }

      // no match
      if (match !== true) {
        return done(err)
      }

      if (!layer) {
        return done(err);
      }

      if (err) {
        // layer.handleError(err, req, res, next)
      } else {
        // layer.handleRequest(req, res, next)
      }

      sync = 0
    }
  }

  public all(...handlers: any[]) {
    const callbacks = handlers.flat(Infinity)

    if (callbacks.length === 0) {
      throw new TypeError('argument handler is required')
    }

    for (let i = 0; i < callbacks.length; i++) {
      const fn = callbacks[i]

      if (typeof fn !== 'function') {
        throw new TypeError('argument handler must be a function')
      }

      const layer = new Layer('/', {}, fn)
      layer.method = null

      this._methods._all = true
      this._stack.push(layer)
    }

    return this
  }
}
