import { match } from 'path-to-regexp';
import type { Route } from './route';
import type { ILayer, Request, Response, NextFunction } from '../types';

export interface LayerOptions {
  sensitive?: boolean;
  strict?: boolean;
  end?: boolean;
}

export interface Layer extends ILayer { }

export class Layer {
  private static readonly MATCHING_GROUP_REGEXP = /\((?:\?<(.*?)>)?(?!\?)/g
  private static readonly TRAILING_SLASH_REGEXP = /\/+$/

  private _opts: LayerOptions;
  public path: string | RegExp | string[] | null;
  private _fn: Function;
  private _handle: Function;
  public keys: string[];
  private _name: string;
  public params: Record<string, string> | null;
  private _slash: boolean;
  private _matchers: any[];
  public method: string | null;
  public route?: Route;

  constructor(path: string | string[] | RegExp, options: LayerOptions, fn: Function) {
    this._opts = options || {}

    this.path = path
    this._fn = fn

    this._handle = fn
    this.keys = []
    this._name = fn.name || '<anonymous>'
    this.params = {}

    this._slash = ((path === '/') && (this._opts.end === false))
    this._matchers = []

    this._matchers = [path].map((p) => this.matcher(p))

    this.method = null

    if (!(this instanceof Layer)) {
      throw new Error('Layer must be instantiated with `new`')
    }
  }

  private matcher(path: string | string[] | RegExp) {
    if (path instanceof RegExp) {

      const keys: { name: string, offset: number }[] = []
      let name = 0
      let m: RegExpExecArray | null

      while ((m = Layer.MATCHING_GROUP_REGEXP.exec(path.source))) {
        keys.push({
          name: m[1] || String(name++),
          offset: m.index
        })
      }

      return (p: string) => {
        if (!(path instanceof RegExp)) throw new TypeError(`Error: ${path} is not a RegExp`)

        const match = path.exec(p)
        if (!match) throw new Error(`Path ${p} does not match ${path}`)

        const params: Record<string, string> = {}
        for (let i = 1; i < match.length; i++) {
          const key = keys[i - 1]
          if (!key) throw new Error(`Missing parameter key for group ${i - 1} in regex ${key}`);

          const prop = key.name

          if (match[i] === null || match[i] === undefined) throw new Error(`Parameter ${prop} is missing`);
          const val = this.decodeParam(match[i]!)

          if (val === undefined) throw new Error(`regexpMatcher: missing param, index ${i}`)

          params[prop] = val
        }

        return {
          params,
          path: match[0]
        }
      }
    }

    if (typeof path === 'string' || Array.isArray(path)) {
      if (this._opts.strict) {
        path = this.loosen(path)
      }

      return match(path, {
        sensitive: this._opts.sensitive,
        end: this._opts.end,
        trailing: !this._opts.strict,
        decode: this.decodeParam
      })
    }

    throw new TypeError(`Unsupported path type: ${typeof path}: must be a string, array, or regular expression`)
  }

  public handleError(error: any, req: Request, res: Response, next: NextFunction) {
    const fn = this._handle

    if (fn.length !== 4) {
      // not a standard error handler
      return next(error)
    }

    try {
      // invoke function
      const ret = fn(error, req, res, next)

      // wait for returned promise
      ret.then((err: UIEvent) => {
        next(err || new Error('Rejected promise'))
      })
    } catch (err: any) {
      next(err)
    }
  }

  public handleRequest(req: Request, res: Response, next: NextFunction) {
    const fn = this._handle

    if (fn.length > 3) {
      // not a standard request handler
      return next()
    }

    try {
      // invoke function
      const ret = fn(req, res, next)

      // wait for returned promise
      ret.then((err: any) => {
        next(err || new Error('Rejected promise'))
      })
    } catch (err: any) {
      next(err)
    }
  }

  public match(path: string) {
    let match: { params: Record<string, string>, path: string } | null = null

    if (path != null) {
      // fast path non-ending match for / (any path matches)
      if (this._slash) {
        this.params = {}
        this.path = ''
        return true
      }

      let i = 0
      while (!match && i < this._matchers.length) {
        // match the path
        match = this._matchers[i](path)
        i++
      }
    }

    if (!match) {
      this.params = null
      this.path = null
      return false
    }

    // store values
    this.params = match.params
    this.path = match.path
    this.keys = Object.keys(match.params)

    return true
  }

  private decodeParam(val: string) {
    if (typeof val !== 'string' || val.length === 0) {
      return val
    }

    try {
      return decodeURIComponent(val)
    } catch (err) {
      if (err instanceof URIError) {
        err.message = 'Failed to decode param \'' + val + '\''
        // err.status = 400
      }

      throw err
    }
  }

  private loosen(path: string | string[] | RegExp): string | string[] {
    if (path instanceof RegExp) {
      return path.source;
    }

    // 处理 '/' 特殊情况
    if (path === '/') {
      return '/';
    }

    if (typeof path === 'string') {
      const result = path.replace(Layer.TRAILING_SLASH_REGEXP, '');

      if (!result) throw new Error('Path is empty after trimming trailing slashes');

      return result
    }

    if (Array.isArray(path)) {
      return path.map(p => {
        const res = this.loosen(p);
        if (typeof res !== 'string') {
          throw new TypeError(`RegExp not allowed in array. Found at element: ${p}`);
        }
        return res;
      });
    }

    throw new TypeError(`Unsupported path type: ${typeof path}: must be a string, array, or regular expression`);
  }
}
