import { Layer } from "./layer"
import { METHODS } from 'node:http'

export const methods = METHODS.map((method) => method.toLowerCase())

export function Method<T extends { new(...args: any[]): {} }>(constructor: T) {
  methods.forEach(method => {
    if (constructor.prototype[method]) return

    constructor.prototype[method] = function (...handlers: Function[]) {
      const callbacks = handlers.flat(Infinity)

      if (callbacks.length === 0) {
        throw new TypeError(`At least one handler is required for ${method.toUpperCase()} route`)
      }

      callbacks.forEach((fn, i) => {
        console.log("fn", fn);
        if (typeof fn !== 'function') {
          throw new TypeError(`Handler at position ${i} is not a function`)
        }

        if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
          console.log(`${method.toUpperCase()} ${this._path}`)
        }

        const layer = new Layer(this._path, {}, fn)
        layer.method = method

        // 记录方法和添加到栈中
        this._methods[method] = true
        this._stack.push(layer)
      })

      return this;
    };
  });
}
