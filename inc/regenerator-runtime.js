/**
 * Regenerator Runtime Polyfill — browser-safe version
 *
 * Needed because WordPress 6.4+ removed regeneratorRuntime from wp-polyfill,
 * but the 3OV settings bundle (admin-page-three-object-viewer-settings.js)
 * was compiled with an older toolchain that calls regeneratorRuntime.mark()
 * as a bare global before any module loader runs.
 *
 * Fix: pass `window` explicitly as the export target so the runtime attaches
 * to window.regeneratorRuntime without relying on `this` (which is undefined
 * in strict mode) or `module.exports` (which doesn't exist in browsers).
 *
 * Based on regenerator-runtime v0.14.x
 * https://github.com/facebook/regenerator/blob/main/packages/runtime/runtime.js
 */
(function (global) {
  "use strict";

  var Op = Object.prototype;
  var hasOwn = Op.hasOwnProperty;
  var defineProperty = Object.defineProperty || function (obj, key, desc) { obj[key] = desc.value; };
  var $Symbol = typeof Symbol === "function" ? Symbol : {};
  var iteratorSymbol = $Symbol.iterator || "@@iterator";
  var asyncIteratorSymbol = $Symbol.asyncIterator || "@@asyncIterator";
  var toStringTagSymbol = $Symbol.toStringTag || "@@toStringTag";

  function define(obj, key, value) {
    Object.defineProperty(obj, key, {
      value: value,
      enumerable: true,
      configurable: true,
      writable: true
    });
    return obj[key];
  }

  try {
    define({}, "");
  } catch (err) {
    define = function (obj, key, value) {
      return (obj[key] = value);
    };
  }

  function wrap(innerFn, outerFn, self, tryLocsList) {
    var protoGenerator = outerFn && outerFn.prototype instanceof Generator ? outerFn : Generator;
    var generator = Object.create(protoGenerator.prototype);
    var context = new Context(tryLocsList || []);
    generator._invoke = makeInvokeMethod(innerFn, self, context);
    return generator;
  }
  global.wrap = wrap;

  var ContinueSentinel = {};

  function Generator() {}
  function GeneratorFunction() {}
  function GeneratorFunctionPrototype() {}

  var IteratorPrototype = {};
  define(IteratorPrototype, iteratorSymbol, function () { return this; });

  var getProto = Object.getPrototypeOf;
  var NativeIteratorPrototype = getProto && getProto(getProto(values([])));
  if (NativeIteratorPrototype && NativeIteratorPrototype !== Op && hasOwn.call(NativeIteratorPrototype, iteratorSymbol)) {
    IteratorPrototype = NativeIteratorPrototype;
  }

  var Gp = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(IteratorPrototype);
  GeneratorFunction.prototype = GeneratorFunctionPrototype;
  defineProperty(Gp, "constructor", { value: GeneratorFunctionPrototype, configurable: true });
  defineProperty(GeneratorFunctionPrototype, "constructor", { value: GeneratorFunction, configurable: true });
  GeneratorFunction.displayName = define(GeneratorFunctionPrototype, toStringTagSymbol, "GeneratorFunction");

  function makeInvokeMethod(innerFn, self, context) {
    var state = "suspendedStart";
    return function invoke(method, arg) {
      if (state === "executing") throw new Error("Generator is already running");
      if (state === "completed") {
        if (method === "throw") throw arg;
        return doneResult();
      }
      context.method = method;
      context.arg = arg;
      while (true) {
        var delegate = context.delegate;
        if (delegate) {
          var delegateResult = maybeInvokeDelegate(delegate, context);
          if (delegateResult) {
            if (delegateResult === ContinueSentinel) continue;
            return delegateResult;
          }
        }
        if (context.method === "next") {
          context.sent = context._sent = context.arg;
        } else if (context.method === "throw") {
          if (state === "suspendedStart") { state = "completed"; throw context.arg; }
          context.dispatchException(context.arg);
        } else if (context.method === "return") {
          context.abrupt("return", context.arg);
        }
        state = "executing";
        var record = tryCatch(innerFn, self, context);
        if (record.type === "normal") {
          state = context.done ? "completed" : "suspendedYield";
          if (record.value === ContinueSentinel) continue;
          return { value: record.value, done: context.done };
        } else if (record.type === "throw") {
          state = "completed";
          context.method = "throw";
          context.arg = record.arg;
        }
      }
    };
  }

  function tryCatch(fn, obj, arg) {
    try { return { type: "normal", arg: fn.call(obj, arg) }; }
    catch (err) { return { type: "throw", arg: err }; }
  }

  function doneResult() { return { value: undefined, done: true }; }

  function maybeInvokeDelegate(delegate, context) {
    var methodName = context.method;
    var method = delegate.iterator[methodName];
    if (method === undefined) {
      context.delegate = null;
      if (methodName === "throw") {
        if (delegate.iterator.return) {
          context.method = "return";
          context.arg = undefined;
          maybeInvokeDelegate(delegate, context);
          if (context.method === "throw") return ContinueSentinel;
        }
        context.method = "throw";
        context.arg = new TypeError("The iterator does not provide a 'throw' method");
      }
      return ContinueSentinel;
    }
    var record = tryCatch(method, delegate.iterator, context.arg);
    if (record.type === "throw") { context.method = "throw"; context.arg = record.arg; context.delegate = null; return ContinueSentinel; }
    var info = record.arg;
    if (!info) { context.method = "throw"; context.arg = new TypeError("iterator result is not an object"); context.delegate = null; return ContinueSentinel; }
    if (info.done) {
      context[delegate.resultName] = info.value;
      context.next = delegate.nextLoc;
      if (context.method !== "return") { context.method = "next"; context.arg = undefined; }
      context.delegate = null;
      return ContinueSentinel;
    }
    return info;
  }

  defineProperty(Gp, toStringTagSymbol, { value: "Generator", configurable: true });
  define(Gp, iteratorSymbol, function () { return this; });
  define(Gp, "toString", function () { return "[object Generator]"; });

  ["next", "throw", "return"].forEach(function (method) {
    GeneratorFunctionPrototype.prototype[method] = function (arg) {
      return this._invoke(method, arg);
    };
  });

  function AsyncIterator(generator, PromiseImpl) {
    var invoke = function (method, arg, resolve, reject) {
      var record = tryCatch(generator[method], generator, arg);
      if (record.type === "throw") { reject(record.arg); return; }
      var info = record.arg;
      var value = info.value;
      if (value && typeof value === "object" && hasOwn.call(value, "__await")) {
        return PromiseImpl.resolve(value.__await).then(
          function (v) { invoke("next", v, resolve, reject); },
          function (e) { invoke("throw", e, resolve, reject); }
        );
      }
      return PromiseImpl.resolve(value).then(
        function (v) { info.value = v; resolve(info); },
        function (e) { return invoke("throw", e, resolve, reject); }
      );
    };
    var previousPromise;
    this._invoke = function enqueue(method, arg) {
      function callInvokeWithMethodAndArg() {
        return new PromiseImpl(function (resolve, reject) { invoke(method, arg, resolve, reject); });
      }
      return (previousPromise = previousPromise ? previousPromise.then(callInvokeWithMethodAndArg, callInvokeWithMethodAndArg) : callInvokeWithMethodAndArg());
    };
  }
  ["next", "throw", "return"].forEach(function (method) {
    AsyncIterator.prototype[method] = function (arg) { return this._invoke(method, arg); };
  });
  define(AsyncIterator.prototype, asyncIteratorSymbol, function () { return this; });
  global.AsyncIterator = AsyncIterator;

  global.async = function (innerFn, outerFn, self, tryLocsList, PromiseImpl) {
    if (PromiseImpl === undefined) PromiseImpl = Promise;
    var iter = new AsyncIterator(wrap(innerFn, outerFn, self, tryLocsList), PromiseImpl);
    return global.isGeneratorFunction(outerFn) ? iter : iter.next().then(function (result) { return result.done ? result.value : iter.next(); });
  };

  global.isGeneratorFunction = function (genFun) {
    var ctor = typeof genFun === "function" && genFun.constructor;
    return ctor ? ctor === GeneratorFunction || (ctor.displayName || ctor.name) === "GeneratorFunction" : false;
  };

  global.mark = function (genFun) {
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(genFun, GeneratorFunctionPrototype);
    } else {
      genFun.__proto__ = GeneratorFunctionPrototype;
      define(genFun, toStringTagSymbol, "GeneratorFunction");
    }
    genFun.prototype = Object.create(Gp);
    return genFun;
  };

  global.awrap = function (arg) { return { __await: arg }; };

  global.keys = function (val) {
    var object = Object(val);
    var keys = [];
    for (var key in object) keys.push(key);
    keys.reverse();
    return function next() {
      while (keys.length) {
        var key = keys.pop();
        if (key in object) { next.value = key; next.done = false; return next; }
      }
      next.done = true;
      return next;
    };
  };

  global.values = values;
  function values(iterable) {
    if (iterable) {
      var iteratorMethod = iterable[iteratorSymbol];
      if (iteratorMethod) return iteratorMethod.call(iterable);
      if (typeof iterable.next === "function") return iterable;
      if (!isNaN(iterable.length)) {
        var i = -1, next = function next() {
          while (++i < iterable.length) {
            if (hasOwn.call(iterable, i)) { next.value = iterable[i]; next.done = false; return next; }
          }
          next.value = undefined; next.done = true; return next;
        };
        return (next.next = next);
      }
    }
    return { next: doneResult };
  }

  function Context(tryLocsList) {
    this.tryEntries = [{ tryLoc: "root" }];
    tryLocsList.forEach(pushTryEntry, this);
    this.reset(true);
  }

  function pushTryEntry(locs) {
    var entry = { tryLoc: locs[0] };
    if (1 in locs) entry.catchLoc = locs[1];
    if (2 in locs) { entry.finallyLoc = locs[2]; entry.afterLoc = locs[3]; }
    this.tryEntries.push(entry);
  }

  function resetTryEntry(entry) {
    var record = entry.completion || {};
    record.type = "normal";
    delete record.arg;
    entry.completion = record;
  }

  Context.prototype = {
    constructor: Context,
    reset: function (skipTempReset) {
      this.prev = 0; this.next = 0;
      this.sent = this._sent = undefined;
      this.done = false; this.delegate = null;
      this.method = "next"; this.arg = undefined;
      this.tryEntries.forEach(resetTryEntry);
      if (!skipTempReset) {
        for (var name in this) {
          if (name.charAt(0) === "t" && hasOwn.call(this, name) && !isNaN(+name.slice(1))) this[name] = undefined;
        }
      }
    },
    stop: function () {
      this.done = true;
      var rootRecord = this.tryEntries[0].completion;
      if (rootRecord.type === "throw") throw rootRecord.arg;
      return this.arg;
    },
    dispatchException: function (exception) {
      if (this.done) throw exception;
      var context = this;
      function handle(loc, caught) {
        record.type = "throw"; record.arg = exception;
        context.next = loc;
        if (caught) { context.method = "next"; context.arg = undefined; }
        return !!caught;
      }
      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i], record = entry.completion;
        if (entry.tryLoc === "root") return handle("end");
        if (entry.tryLoc <= this.prev) {
          var hasCatch = hasOwn.call(entry, "catchLoc");
          var hasFinally = hasOwn.call(entry, "finallyLoc");
          if (hasCatch && hasFinally) {
            if (this.prev < entry.catchLoc) return handle(entry.catchLoc, true);
            if (this.prev < entry.finallyLoc) return handle(entry.finallyLoc);
          } else if (hasCatch) {
            if (this.prev < entry.catchLoc) return handle(entry.catchLoc, true);
          } else if (hasFinally) {
            if (this.prev < entry.finallyLoc) return handle(entry.finallyLoc);
          } else throw new Error("try statement without catch or finally");
        }
      }
    },
    abrupt: function (type, arg) {
      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        if (entry.tryLoc <= this.prev && hasOwn.call(entry, "finallyLoc") && this.prev < entry.finallyLoc) {
          var finallyEntry = entry; break;
        }
      }
      if (finallyEntry && (type === "break" || type === "continue") && finallyEntry.tryLoc <= arg && arg <= finallyEntry.finallyLoc) finallyEntry = null;
      var record = finallyEntry ? finallyEntry.completion : {};
      record.type = type; record.arg = arg;
      if (finallyEntry) { this.method = "next"; this.next = finallyEntry.finallyLoc; return ContinueSentinel; }
      return this.complete(record);
    },
    complete: function (record, afterLoc) {
      if (record.type === "throw") throw record.arg;
      if (record.type === "break" || record.type === "continue") this.next = record.arg;
      else if (record.type === "return") { this.rval = this.arg = record.arg; this.method = "return"; this.next = "end"; }
      else if (record.type === "normal" && afterLoc) this.next = afterLoc;
      return ContinueSentinel;
    },
    finish: function (finallyLoc) {
      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        if (entry.finallyLoc === finallyLoc) { this.complete(entry.completion, entry.afterLoc); resetTryEntry(entry); return ContinueSentinel; }
      }
    },
    catch: function (tryLoc) {
      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        if (entry.tryLoc === tryLoc) {
          var record = entry.completion;
          if (record.type === "throw") { var thrown = record.arg; resetTryEntry(entry); }
          return thrown;
        }
      }
      throw new Error("illegal catch attempt");
    },
    delegateYield: function (iterable, resultName, nextLoc) {
      this.delegate = { iterator: values(iterable), resultName: resultName, nextLoc: nextLoc };
      if (this.method === "next") this.arg = undefined;
      return ContinueSentinel;
    }
  };

  // Expose as window.regeneratorRuntime
  window.regeneratorRuntime = global;

}({}));
