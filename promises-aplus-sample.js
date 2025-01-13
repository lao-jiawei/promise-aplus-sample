"use strict"

/* 2.1 状态
*/
const PROMISE_STATES = {
  PADDING: 'padding',
  FULFILLED: 'fulfilled',
  REJECTED: 'rejected'
}

/**
 * @func 判断是否为Promise实例
 * @desc 
 * @param {}  
 * @return {} 
 */
function isPromise(val) {
  return val instanceof MyPromise;
}

/**
 * @func 判断是否为对象
 * @desc 
 * @param {}  
 * @return {} 
 */
function isObject(val) {
  return val && typeof val === 'object';
}

/**
 * @func 
 * @desc 
 * @param {}  
 * @return {} 
 */
function nextTick(callback) {
  // TODO: process 是啥? 内部有什么?
  if (typeof process !== 'undefined' && typeof process.nextTick === 'function') {
    process.nextTick(callback);
  } else {
    // TODO: MutationObserver 是啥? 
    const observer = new MutationObserver(callback);
    const textNode = document.createTextNode('1');
    observer.observe(textNode, {
      characterData: true
    })
    textNode.data = '2';
  }
}

/**
 * @func 状态扭转
 * @desc 
 * @param {MyPromise} promise   
 * @param {PROMISE_STATES} targetState 目标状态
 * @param {} value 伴随状态转移值,可能是fulfilled的值，也可能是rejected的原因
 * @return {} 
 */
function transition(promise, targetState, value) {
  // 2.1.1 处于等待态时，promise 可以迁移至完成态或拒绝态
  if (promise.state === PROMISE_STATES.PADDING && targetState !== PROMISE_STATES.PADDING) {
    // 改变当前promise状态 至目标状态
    Object.defineProperty(promise, 'state', {
      configurable: false,
      writable: false,
      enumerable: true,
      value: targetState,
    })
    if (targetState === PROMISE_STATES.FULFILLED) {
      // 2.1.2.2 完成态时,必须拥有一个不可变的终值value,
      Object.defineProperty(promise, 'value', {
        configurable: false,
        writable: false,
        enumerable: true,
        value,
      })
      nextTick(() => {
        // TODO: fulfilQueue 内的元素结构是什么?
        promise.fulfilQueue.forEach(({ handler, chainedPromise }) => {
          try {
            if (typeof handler === 'function') {
              // 2.2.2.1 当 promise 完成结束后其必须被调用，其第一个参数为 promise 的终值
              const adoptedValue = handler(value);
              resolvePromiseWithValue(chainedPromise, adoptedValue);
            } else {
              transition(chainedPromise, PROMISE_STATES.FULFILLED, promise.value)
            }
          } catch (error) {
            transition(chainedPromise, PROMISE_STATES.REJECTED, error);
          }
        })
        promise.fulfilQueue = [];
      })
    } else if (targetState === PROMISE_STATES.REJECTED) {
      // 2.1.3.2 拒绝态时,必须拥有一个不可变的原因reason,
      Object.defineProperty(promise, 'reason', {
        configurable: false,
        writable: false,
        enumerable: true,
        value,
      })
      nextTick(() => {
        promise.rejectQueue.forEach(({ handler, chainedPromise }) => {
          try {
            if (typeof handler === 'function') {
              const adoptedValue = handler(value);
              resolvePromiseWithValue(chainedPromise, adoptedValue);
            } else {
              transition(chainedPromise, PROMISE_STATES.REJECTED, promise.reason);
            }
          } catch (error) {
            transition(chainedPromise, PROMISE_STATES.REJECTED, error);
          }
        })
        promise.rejectQueue = [];
      })
    }
  }
  // 2.1.2.1 处于完成态时, 不能迁移至其他任何状态.
  // 2.1.3.1 处于拒绝态时, 不能迁移至其他任何状态.
}

/**
 * @func 
 * @desc 
 * @param {}  
 * @return {} 
 */
function resolvePromiseWithValue(promise, x, thenableValues = []) {
  if (promise === x) {
    // 防止出现死循环
    transition(promise, PROMISE_STATES.REJECTED, new TypeError('promise and x cannot refer to the same object.'))
  } else if (isPromise(x)) {
    if (x.state !== PROMISE_STATES.PADDING) {
      /* NOTE  
        状态转换
      */
      transition(promise, x.state, x.state === PROMISE_STATES.FULFILLED ? x.value : x.reason)
    } else {
      /* NOTE
        链式调用
       */
      x.then(value => {
        resolvePromiseWithValue(promise, value, thenableValues);
      }, reason => {
        transition(promise, PROMISE_STATES.REJECTED, reason);
      })
    }
  } else if (isObject(x) || typeof x === 'function') {
    let isInvoked = false;
    try {
      const then = x.then;
      if (typeof then === 'function') {
        then.call(x, value => {
          if (thenableValues.indexOf(value) !== -1) {
            transition(promise, PROMISE_STATES.REJECTED, new TypeError('there is a thenable cycle that will lead to infinite recursion.'))
          }
          if (!isInvoked) {
            thenableValues.push(value);
            resolvePromiseWithValue(promise, value, thenableValues);
            isInvoked = true;
          }
        }, reason => {
          if (!isInvoked) {
            transition(promise, PROMISE_STATES.REJECTED, reason);
            isInvoked = true;
          }
        })
      } else {
        transition(promise, PROMISE_STATES.FULFILLED, x);
      }
    } catch (error) {
      if (!isInvoked) {
        transition(promise, PROMISE_STATES.REJECTED, error);
      } else {
        transition(promise, PROMISE_STATES.FULFILLED, x);
      }
    }
  }
}

function resolve(value) {
  resolvePromiseWithValue(this, value);
}

function reject(reason) {
  transition(this, PROMISE_STATES.REJECTED, reason);
}


class MyPromise {
  constructor(executor) {
    this.state = PROMISE_STATES.PADDING;

    // 成功回调队列
    this.fulfilQueue = [];
    // 失败回调队列 
    this.rejectQueue = [];
    // 构造完Promise实例后,调用executor
    executor(resolve.bind(this), reject.bind(this));
  }

  /**
   * @func 2.2 then 方法
   * @desc 
   * @param {function} onFulfilled
   * @param {function} onRejected  
   * @return {} 
   */
  then(onFulfilled, onRejected) {
    // 解决链式调用
    const promise2 = new MyPromise(() => { });

    if (this.state === PROMISE_STATES.FULFILLED) {
      nextTick(() => {
        try {
          if (typeof onFulfilled === 'function') {
            // 
            const adoptedValue = onFulfilled(this.value);
            resolvePromiseWithValue(promise2, adoptedValue);
          } else {
            // 2.2.1.1 如果 onFulfilled 不是函数，其必须被忽略
            transition(promise2, PROMISE_STATES.FULFILLED, this.value);
          }
        } catch (error) {
          transition(promise2, PROMISE_STATES.REJECTED, error);
        }
      })
    } else if (this.state === PROMISE_STATES.REJECTED) {
      nextTick(() => {
        try {
          if (typeof onRejected === 'function') {
            // 2.2.3.1 当 promise 被拒绝完成后其必须被调用，其第一个参数为 promise 的拒绝原因
            const adoptedValue = onRejected(this.reason);
            resolvePromiseWithValue(promise2, adoptedValue);
          } else {
            // 2.2.1.2 如果 onRejected 不是函数，其必须被忽略
            transition(promise2, PROMISE_STATES.REJECTED, this.reason);
          }
        } catch (error) {
          transition(promise2, PROMISE_STATES.REJECTED, error);
        }
      })
    } else {
      // 若当前状态属于padding,则将当前onFulfilled和onRejected加入对应队列中
      this.fulfilQueue.push({
        handler: onFulfilled,
        chainedPromise: promise2,
      })
      this.rejectQueue.push({
        handler: onRejected,
        chainedPromise: promise2,
      })
      return promise2;
    }

  }
}

module.exports = {
  resolve: function (value) {
    return new MyPromise(function (resolve) {
      resolve(value);
    });
  },
  reject: function (reason) {
    return new MyPromise(function (resolve, reject) {
      reject(reason);
    });
  }
}