import { DisyuntorError } from './DisyuntorError'

export class TimeoutError extends DisyuntorError {
  constructor(name: string, milliseconds: number) {
    super(`${name}: specified timeout of ${milliseconds}ms was reached`, 'timeout');
    Object.setPrototypeOf(this, TimeoutError.prototype);
    Error.captureStackTrace(this, this.constructor)
  }
}

class CancellablePromise<T> extends Promise<T> {
  private onCancel: () => void;

  constructor(callback: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void, onCancel?: (callback: () => void) => void) => void) {
    let onCancel: () => void;
    super((resolve, reject) => {
      callback(resolve, reject, f => onCancel = f);
    });
    //@ts-ignore
    this.onCancel = onCancel;
  }

  cancel(){
    this.onCancel();
  }
}

export function create<T>(name: string, milliseconds: number, mainOp: Promise<any>) : Promise<T> {
  var timeoutProm = new CancellablePromise<T>((_resolve, reject, onCancel) => {
    const timeout = setTimeout(() => {
      reject(new TimeoutError(name, milliseconds));
    }, milliseconds);
    //@ts-ignore
    onCancel(() => clearTimeout(timeout));
  });

  mainOp
    .then(() => timeoutProm.cancel())
    .catch(() => timeoutProm.cancel());

  return timeoutProm;
}
