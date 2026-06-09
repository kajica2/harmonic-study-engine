export function promisify(fn: any) {
  if (typeof fn !== 'function') {
    throw new TypeError('The "original" argument must be of type Function');
  }
  const promisified = function (this: any, ...args: any[]) {
    return new Promise((resolve, reject) => {
      fn.apply(this, [
        ...args,
        (err: any, ...values: any[]) => {
          if (err) {
            reject(err);
          } else {
            resolve(values.length > 1 ? values : values[0]);
          }
        },
      ]);
    });
  };
  Object.setPrototypeOf(promisified, Object.getPrototypeOf(fn));
  Object.defineProperties(promisified, Object.getOwnPropertyDescriptors(fn));
  return promisified;
}

export function inherits(ctor: any, superCtor: any) {
  if (superCtor) {
    ctor.super_ = superCtor;
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  }
}

export const inspect = {
  custom: Symbol.for('nodejs.util.inspect.custom')
};

export function deprecate(fn: any) {
  return fn;
}

export const types = {
  isUint8Array(value: any) {
    return value instanceof Uint8Array;
  }
};

export default {
  promisify,
  inherits,
  inspect,
  deprecate,
  types
};
